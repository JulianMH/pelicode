import type { ChatEntry, ChatToolCall } from '../chatEntry';
import { ToolPages } from './pagination';
import type { ApiTool, Command, ToolArguments } from './command';
import { listCommand } from './listCommand';
import { patchCommand } from './patchCommand';
import { readCommand } from './readCommand';
import { writeCommand } from './writeCommand';
import { moveCommand } from './moveCommand';
import { removeCommand } from './removeCommand';
import { gitCommand } from './gitCommand';

export type { ApiTool, Command } from './command';

export const commands: Command[] = [
	readCommand,
	listCommand,
	writeCommand,
	patchCommand,
	removeCommand,
	moveCommand,
	gitCommand,
];

export const apiTools: ApiTool[] = [
	...commands.map((command) => command.apiTool),
	{
		type: 'function',
		function: {
			name: 'nextPage',
			description:
				'Read the next fixed 8 KB page of a tool result without repeating the original operation. Cursors belong to this chat and expire on reload.',
			parameters: {
				type: 'object',
				properties: { cursor: { type: 'string' } },
				required: ['cursor'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'compactContext',
			description:
				'Summarize older conversation context to reduce token usage while preserving goals, constraints and pending work. Runs after the current batch of tool calls.',
			parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
		},
	},
];

export async function executeToolCall(
	toolCall: ChatToolCall,
	pages: ToolPages,
	compact: () => void,
): Promise<ChatEntry> {
	let result: string;
	let invocation = toolCall.name;
	try {
		const args: unknown = JSON.parse(toolCall.arguments);
		if (!args || typeof args !== 'object' || Array.isArray(args))
			throw new Error('tool arguments must be a JSON object.');
		const values = args as Record<string, unknown>;
		const toolArguments: ToolArguments = {
			path: typeof values.path === 'string' ? values.path : '',
			content: typeof values.content === 'string' ? values.content : undefined,
			patch: typeof values.patch === 'string' ? values.patch : undefined,
			destination: typeof values.destination === 'string' ? values.destination : undefined,
			command: typeof values.command === 'string' ? values.command : undefined,
		};
		invocation =
			toolCall.name === 'git' && toolArguments.command
				? toolArguments.command
				: `${toolCall.name}${toolArguments.path ? ` ${toolArguments.path}` : ''}`;
		if (toolCall.name === 'compactContext') {
			if (Object.keys(values).length) throw new Error('compactContext takes no arguments.');
			compact();
			result = 'Compaction scheduled after this tool batch.';
		} else if (toolCall.name === 'nextPage') {
			if (typeof values.cursor !== 'string') throw new Error('nextPage requires a cursor.');
			result = await pages.next(values.cursor);
		} else {
			const command = commands.find(
				(candidate) => candidate.apiTool.function.name === toolCall.name,
			);
			if (!command) throw new Error(`unknown tool "${toolCall.name}".`);
			result = pages.format(await command.execute(toolArguments));
		}
	} catch (error) {
		result = pages.format(
			`Error: ${error instanceof Error ? error.message : 'Tool execution failed.'}`,
		);
	}
	return {
		type: 'tool',
		text: `@${invocation}\n${result}`,
		rawOpenRouterPayload: { role: 'tool', content: result, tool_call_id: toolCall.id },
	};
}
