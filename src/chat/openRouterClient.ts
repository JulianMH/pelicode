import type { ChatEntry, ChatToolCall, OpenRouterMessage, OpenRouterToolCall } from './chatEntry';
import { MAX_OPENROUTER_RESPONSE_BYTES } from './constants';
import { ApiTool, commands } from './tools';
import { isOpenRouterModel, type OpenRouterModel } from './models';
import { CONTINUE_PROMPT, FINAL_RESPONSE_PROMPT, SYSTEM_PROMPT } from './prompt';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_OUTPUT_TOKENS = 8192;
const MAX_REASONING_TOKENS = 4096;
const MAX_CONTINUATIONS = 2;
const MAX_RATE_LIMIT_RETRIES = 2;
const RATE_LIMIT_RETRY_FALLBACK_MS = 1_000;
const RATE_LIMIT_RETRY_BUFFER_MS = 250;

const apiTools: ApiTool[] = commands.map((command) => command.apiTool);

type OpenRouterResponse = {
	model?: string;
	choices?: Array<{
		finish_reason?: string | null;
		message?: {
			content?: string | null;
			reasoning_details?: unknown[];
			tool_calls?: Array<{
				id: string;
				type?: 'function';
				function: { name: string; arguments: string };
			}>;
		};
		error?: { message?: string };
	}>;
	usage?: { cost?: number };
	error?: { code?: number | string; message?: string; metadata?: Record<string, unknown> };
	raw?: string;
};

export type OpenRouterResult = {
	content?: string;
	toolCalls?: ChatToolCall[];
	cost: number;
	reasoningDetails?: unknown[];
};

export function toOpenRouterToolCall(toolCall: ChatToolCall): OpenRouterToolCall {
	return {
		id: toolCall.id,
		type: 'function',
		function: { name: toolCall.name, arguments: toolCall.arguments },
	};
}

export function toApiMessages(entries: ChatEntry[], model?: OpenRouterModel): OpenRouterMessage[] {
	let conversationModel: OpenRouterModel | undefined;
	return entries.flatMap((entry) => {
		if (entry.type === 'modelSwitch' && isOpenRouterModel(entry.text)) {
			conversationModel = entry.text;
			return [];
		}
		if (!entry.rawOpenRouterPayload) return [];
		const payload = entry.rawOpenRouterPayload;
		if (
			payload.role === 'assistant' &&
			payload.reasoning_details &&
			model !== undefined &&
			conversationModel !== model
		) {
			const { reasoning_details: _reasoningDetails, ...withoutReasoning } = payload;
			return [withoutReasoning];
		}
		return [payload];
	});
}

export function extractReasoning(details: unknown[] | undefined): string | undefined {
	if (!details?.length) return undefined;
	const values = details.flatMap((detail) => {
		if (!detail || typeof detail !== 'object') return [];
		const value = detail as { text?: unknown; summary?: unknown };
		return [value.text, value.summary].filter(
			(item): item is string => typeof item === 'string' && item.trim().length > 0,
		);
	});
	return values.length ? values.join('\n\n') : undefined;
}

export async function requestOpenRouter(
	messages: OpenRouterMessage[],
	model: OpenRouterModel,
	continuationCount = 0,
	emptyResponseRetryCount = 0,
	signal?: AbortSignal,
	rateLimitRetryCount = 0,
): Promise<OpenRouterResult> {
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey)
		throw new Error('OPENROUTER_API_KEY is not available to the VS Code extension host.');
	const response = await fetch(OPENROUTER_URL, {
		method: 'POST',
		signal,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
			'X-OpenRouter-Title': 'PeliCode',
		},
		body: JSON.stringify({
			model,
			max_tokens: MAX_OUTPUT_TOKENS,
			reasoning: { max_tokens: MAX_REASONING_TOKENS },
			tools: apiTools,
			tool_choice: 'auto',
			messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
		}),
	});
	const body = await parseOpenRouterResponse(response);
	if (!response.ok) {
		if (response.status === 429 && rateLimitRetryCount < MAX_RATE_LIMIT_RETRIES) {
			await waitForRateLimitReset(response, body, signal);
			return requestOpenRouter(
				messages,
				model,
				continuationCount,
				emptyResponseRetryCount,
				signal,
				rateLimitRetryCount + 1,
			);
		}
		throw new Error(formatOpenRouterError(response, body));
	}
	const choice = body.choices?.[0];
	const message = choice?.message;
	const content = message?.content ?? undefined;
	const toolCalls = message?.tool_calls?.map((call) => ({
		id: call.id,
		name: call.function.name,
		arguments: call.function.arguments,
	}));
	const cost = body.usage?.cost ?? 0;
	if (!content && !toolCalls?.length) {
		if (emptyResponseRetryCount < 1)
			return requestOpenRouter(
				[...messages, { role: 'user', content: FINAL_RESPONSE_PROMPT }],
				model,
				continuationCount,
				emptyResponseRetryCount + 1,
				signal,
			).then((retry) => ({ ...retry, cost: cost + retry.cost }));
		throw new Error(formatEmptyOpenRouterResponse(body, model));
	}
	if (
		content &&
		choice?.finish_reason === 'length' &&
		continuationCount < MAX_CONTINUATIONS &&
		!toolCalls?.length
	) {
		const continuation = await requestOpenRouter(
			[...messages, { role: 'assistant', content }, { role: 'user', content: CONTINUE_PROMPT }],
			model,
			continuationCount + 1,
			emptyResponseRetryCount,
			signal,
		);
		return {
			content: content + (continuation.content ?? ''),
			toolCalls: continuation.toolCalls,
			cost: cost + continuation.cost,
			reasoningDetails: message?.reasoning_details,
		};
	}
	return { content, toolCalls, cost, reasoningDetails: message?.reasoning_details };
}

async function waitForRateLimitReset(
	response: Response,
	body: OpenRouterResponse,
	signal?: AbortSignal,
): Promise<void> {
	const metadataHeaders = body.error?.metadata?.headers;
	const headers =
		metadataHeaders && typeof metadataHeaders === 'object'
			? (metadataHeaders as Record<string, unknown>)
			: undefined;
	const reset = headers?.['X-RateLimit-Reset'] ?? headers?.['x-ratelimit-reset'];
	const retryAfter = response.headers.get('retry-after');
	let delay = parseResetDelay(reset);
	if (delay === undefined && retryAfter) {
		const seconds = Number(retryAfter);
		delay = Number.isFinite(seconds)
			? Math.max(0, seconds * 1_000)
			: Math.max(0, Date.parse(retryAfter) - Date.now());
	}
	await delayWithAbort(
		(delay ?? RATE_LIMIT_RETRY_FALLBACK_MS) + RATE_LIMIT_RETRY_BUFFER_MS,
		signal,
	);
}
function parseResetDelay(value: unknown): number | undefined {
	const timestamp =
		typeof value === 'string' && value.trim()
			? Number(value)
			: typeof value === 'number'
				? value
				: NaN;
	if (!Number.isFinite(timestamp)) return undefined;
	const milliseconds = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1_000;
	return Math.max(0, milliseconds - Date.now());
}
function delayWithAbort(milliseconds: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted)
		return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
	return new Promise((resolve, reject) => {
		let timer: ReturnType<typeof setTimeout>;
		const onAbort = () => {
			clearTimeout(timer);
			signal?.removeEventListener('abort', onAbort);
			reject(new DOMException('The operation was aborted.', 'AbortError'));
		};
		timer = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}, milliseconds);
		signal?.addEventListener('abort', onAbort, { once: true });
	});
}
async function parseOpenRouterResponse(response: Response): Promise<OpenRouterResponse> {
	const text = await response.text();
	try {
		return { ...(JSON.parse(text) as OpenRouterResponse), raw: text };
	} catch {
		return { raw: text };
	}
}
function formatOpenRouterError(response: Response, body: OpenRouterResponse): string {
	return [
		`OpenRouter request failed: ${response.status} ${response.statusText}`,
		body.error?.code !== undefined ? `Code: ${body.error.code}` : undefined,
		body.error?.message ? `Reason: ${body.error.message}` : undefined,
		body.error?.metadata ? `Metadata: ${JSON.stringify(body.error.metadata)}` : undefined,
		body.raw ? `Response: ${body.raw.slice(0, MAX_OPENROUTER_RESPONSE_BYTES)}` : undefined,
	]
		.filter((detail): detail is string => Boolean(detail))
		.join('\n');
}
function formatEmptyOpenRouterResponse(body: OpenRouterResponse, model: OpenRouterModel): string {
	const choice = body.choices?.[0];
	return [
		'OpenRouter returned an empty response.',
		`Model: ${body.model ?? model}`,
		`Choices: ${body.choices?.length ?? 0}`,
		choice?.finish_reason ? `Finish reason: ${choice.finish_reason}` : undefined,
		choice?.error?.message ? `Choice error: ${choice.error.message}` : undefined,
		body.error?.message ? `API error: ${body.error.message}` : undefined,
		body.raw ? `Response: ${body.raw.slice(0, MAX_OPENROUTER_RESPONSE_BYTES)}` : undefined,
	]
		.filter((detail): detail is string => Boolean(detail))
		.join('\n');
}
