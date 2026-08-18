import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import type { ChatEntry, ChatToolCall, OpenRouterMessage } from './chatEntry';
import { ChatModel } from './chatModel';
import { ChatViewHost } from './chatViewHost';
import { VscodeChatViewHost } from './vscodeChatViewHost';
import { commands } from './tools';
import { defaultModel, isOpenRouterModel, type OpenRouterModel } from './models';
import {
	extractReasoning,
	requestOpenRouter,
	toApiMessages,
	toOpenRouterToolCall,
} from './openRouterClient';

export class ChatViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'pelicode.chat';
	private chatModels: Map<string, ChatModel> = new Map();
	private readonly writeQueues = new Map<string, Promise<void>>();
	private readonly chatDirectory?: vscode.Uri;
	private readonly modelsLoaded: Promise<void>;
	private view?: vscode.WebviewView;
	private host?: ChatViewHost;
	private openChatId?: string;
	public constructor(private readonly extensionUri: vscode.Uri) {
		const workspace = vscode.workspace.workspaceFolders?.[0];
		this.chatDirectory = workspace
			? vscode.Uri.joinPath(workspace.uri, '.pelicode', 'chat')
			: undefined;
		this.modelsLoaded = this.loadChatModels();
	}
	public async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
		await this.modelsLoaded;
		this.view = view;
		this.host = new VscodeChatViewHost(view.webview);
		this.updateBadge();
		view.onDidDispose(() => {
			if (this.view === view) this.view = undefined;
			this.host = undefined;
			this.openChatId = undefined;
		});
		view.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')],
		};
		view.webview.html = this.getHtml(view.webview);
		this.host.onMessage((message) => {
			const chatModel = this.getChatModel(message.id);
			switch (message.type) {
				case 'close':
					chatModel.activeRequest?.abort();
					chatModel.activeRequest = undefined;
					if (this.openChatId === chatModel.id) this.openChatId = undefined;
					this.chatModels.delete(chatModel.id);
					void this.removeChatModel(chatModel.id);
					this.updateBadge();
					return;
				case 'cancel':
					chatModel.activeRequest?.abort();
					chatModel.activeRequest = undefined;
					this.updateBadge();
					this.host?.requestFinished(chatModel.id);
					return;
				case 'ready':
					this.host?.restore(chatModel.id, chatModel.messages, chatModel.activeModel);
					this.host?.costUpdated(chatModel.id, chatModel.totalCost);
					return;
				case 'viewOpened':
					this.openChatId = chatModel.id;
					chatModel.isUnread = false;
					this.updateBadge();
					this.host?.unreadUpdated(chatModel.id, false);
					return;
				case 'viewClosed':
					if (this.openChatId === chatModel.id) this.openChatId = undefined;
					return;
				case 'send': {
					const text = message.text.trim();
					if (!text) return;
					const model = isOpenRouterModel(message.model) ? message.model : defaultModel;
					this.recordModelSwitch(chatModel, model);
					chatModel.activeRequest?.abort();
					const controller = new AbortController();
					chatModel.activeRequest = controller;
					this.updateBadge();
					void this.reply(chatModel, text, model, controller.signal).finally(() => {
						if (chatModel.activeRequest === controller) {
							chatModel.activeRequest = undefined;
							this.updateBadge();
						}
					});
					return;
				}
			}
		});
	}
	/** Records model changes at the time they happen, rather than trying to infer
	 * them from a later send request. This keeps the picker and chat history in
	 * sync and gives API-history conversion an unambiguous boundary. */
	private recordModelSwitch(chatModel: ChatModel, model: OpenRouterModel): void {
		// The protocol marker belongs to the send boundary, so compare against the
		// last marker instead of inferring changes from the current picker state.
		const lastSwitch = [...chatModel.messages].reverse().find((entry) => entry.type === 'modelSwitch');
		if (lastSwitch?.text === model) return;
		chatModel.activeModel = model;
		const entry: ChatEntry = { type: 'modelSwitch', text: model };
		chatModel.messages.push(entry);
		this.persist(chatModel);
		this.host?.entry(chatModel.id, entry);
	}
	private getChatModel(id = 'default'): ChatModel {
		let chatModel = this.chatModels.get(id);
		if (!chatModel) {
			chatModel = new ChatModel(id);
			this.chatModels.set(id, chatModel);
		}
		return chatModel;
	}
	private async loadChatModels(): Promise<void> {
		if (!this.chatDirectory) return;
		try {
			const entries = await vscode.workspace.fs.readDirectory(this.chatDirectory);
			await Promise.all(entries.filter(([, type]) => type === vscode.FileType.Directory).map(async ([id]) => {
				if (!/^[a-zA-Z0-9._-]+$/.test(id)) return;
				try {
					const data = JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(
						vscode.Uri.joinPath(this.chatDirectory!, id, 'model.json'),
					))) as Partial<ChatModel>;
					if (data.id !== id || !Array.isArray(data.messages)) return;
					const model = new ChatModel(id);
					model.messages = data.messages as ChatEntry[];
					model.isUnread = data.isUnread === true;
					model.totalCost = typeof data.totalCost === 'number' ? data.totalCost : 0;
					model.activeModel = isOpenRouterModel(data.activeModel) ? data.activeModel : undefined;
					this.chatModels.set(id, model);
				} catch { /* Ignore an incomplete or corrupt chat file. */ }
			}));
		} catch { /* The directory does not exist on a new project. */ }
	}
	private persist(chatModel: ChatModel): void {
		if (!this.chatDirectory || !/^[a-zA-Z0-9._-]+$/.test(chatModel.id)) return;
		const previous = this.writeQueues.get(chatModel.id) ?? Promise.resolve();
		const snapshot = JSON.stringify({ id: chatModel.id, messages: chatModel.messages,
			isUnread: chatModel.isUnread, activeModel: chatModel.activeModel, totalCost: chatModel.totalCost });
		const write = previous.catch(() => undefined).then(async () => {
			const folder = vscode.Uri.joinPath(this.chatDirectory!, chatModel.id);
			await vscode.workspace.fs.createDirectory(folder);
			await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(folder, 'model.json'), new TextEncoder().encode(snapshot));
		});
		this.writeQueues.set(chatModel.id, write);
		void write.catch(() => undefined);
	}
	private async removeChatModel(id: string): Promise<void> {
		if (!this.chatDirectory) return;
		const previous = this.writeQueues.get(id) ?? Promise.resolve();
		const removal = previous.catch(() => undefined).then(() => vscode.workspace.fs.delete(
			vscode.Uri.joinPath(this.chatDirectory!, id), { recursive: true, useTrash: false },
		));
		this.writeQueues.set(id, removal.then(() => undefined));
		await removal.catch(() => undefined);
	}
	private updateBadge(): void {
		if (!this.view) return;
		const count = [...this.chatModels.values()].filter(
			(chatModel) => chatModel.isUnread || chatModel.activeRequest !== undefined,
		).length;
		this.view.badge = {
			value: count,
			tooltip: count === 1 ? '1 unread or loading chat' : `${count} unread or loading chats`,
		};
	}
	private async reply(
		chatModel: ChatModel,
		prompt: string,
		model: OpenRouterModel,
		signal: AbortSignal,
	): Promise<void> {
		if (prompt)
			chatModel.messages.push({
				type: 'userMessage',
				text: prompt,
				rawOpenRouterPayload: { role: 'user', content: prompt },
			});
		if (prompt) this.persist(chatModel);
		try {
			this.host?.requestStarted(chatModel.id);
			const response = await requestOpenRouter(
				toApiMessages(chatModel.messages, model),
				model,
				0,
				0,
				signal,
			);
			if (signal.aborted) return;
			chatModel.totalCost += response.cost;
			this.persist(chatModel);
			this.host?.costUpdated(chatModel.id, chatModel.totalCost);
			const reasoning = extractReasoning(response.reasoningDetails);
			if (reasoning) {
				const entry: ChatEntry = { type: 'reasoning', text: reasoning };
				chatModel.messages.push(entry);
				this.persist(chatModel);
				this.host?.entry(chatModel.id, entry);
			}
			const content = response.content?.trim() ?? '';
			if (content || response.toolCalls?.length) {
				const rawOpenRouterPayload: OpenRouterMessage = {
					role: 'assistant',
					content: response.content ?? null,
					...(response.reasoningDetails ? { reasoning_details: response.reasoningDetails } : {}),
					...(response.toolCalls?.length
						? { tool_calls: response.toolCalls.map(toOpenRouterToolCall) }
						: {}),
				};
				const entry: ChatEntry = { type: 'assistantMessage', text: content, rawOpenRouterPayload };
				chatModel.messages.push(entry);
				this.persist(chatModel);
				if (content)
					this.host?.entry(chatModel.id, entry, !response.toolCalls?.length);
			}
			if (response.toolCalls?.length) {
				for (const toolCall of response.toolCalls) {
					await this.runTool(chatModel, toolCall, signal);
					if (signal.aborted) return;
				}
				await this.reply(chatModel, '', model, signal);
				return;
			}
			this.host?.requestFinished(chatModel.id);
			this.markUnread(chatModel);
		} catch (error) {
			if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
				this.host?.requestFinished(chatModel.id);
				return;
			}
			if (prompt) chatModel.messages.pop();
			const entry: ChatEntry = {
				type: 'assistantMessage',
				text: error instanceof Error ? error.message : 'OpenRouter request failed.',
			};
			chatModel.messages.push(entry);
			this.persist(chatModel);
			this.host?.entry(chatModel.id, entry, true);
			this.host?.requestFinished(chatModel.id);
			this.markUnread(chatModel);
		} finally {
			this.updateBadge();
		}
	}
	private markUnread(chatModel: ChatModel): void {
		chatModel.isUnread = this.openChatId !== chatModel.id;
		this.persist(chatModel);
		this.updateBadge();
		this.host?.unreadUpdated(chatModel.id, chatModel.isUnread);
	}
	private async runTool(
		chatModel: ChatModel,
		toolCall: ChatToolCall,
		signal: AbortSignal,
	): Promise<void> {
		const parsed = parseToolArguments(toolCall.arguments);
		if (typeof parsed === 'string') {
			if (signal.aborted) return;
			const entry: ChatEntry = {
				type: 'tool',
				text: `${formatToolCall(toolCall, undefined)}\n${parsed}`,
				rawOpenRouterPayload: { role: 'tool', content: parsed, tool_call_id: toolCall.id },
			};
			chatModel.messages.push(entry);
			this.persist(chatModel);
			this.host?.entry(chatModel.id, entry);
			return;
		}
		const result = await executeToolCall(toolCall, parsed);
		if (signal.aborted) return;
		const entry: ChatEntry = {
			type: 'tool',
			text: `${formatToolCall(toolCall, parsed)}\n${result}`,
			rawOpenRouterPayload: { role: 'tool', content: result, tool_call_id: toolCall.id },
		};
		chatModel.messages.push(entry);
		this.persist(chatModel);
		this.host?.entry(chatModel.id, entry);
	}
	private getHtml(webview: vscode.Webview): string {
		const nonce = randomBytes(16).toString('base64');
		// The webview must use the models that were restored from disk as its
		// initial tabs.  Keep the fallback in the UI as a single chat when a new
		// workspace has no saved chats yet.
		const initialChatIds = this.chatModels.size > 0 ? [...this.chatModels.keys()] : ['default'];
		const initialChatIdsJson = JSON.stringify(initialChatIds).replace(/</g, '\\u003c');
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'),
		);
		return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"><title>Code AI Chat</title></head><body><div id="app"></div><script nonce="${nonce}">window.__pelicodeInitialChatIds=${initialChatIdsJson};</script><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
	}
}

type ToolArguments = { path?: unknown; content?: unknown; patch?: unknown; destination?: unknown };

function parseToolArguments(argumentsText: string): ToolArguments | string {
	try {
		const value: unknown = JSON.parse(argumentsText);
		if (!value || typeof value !== 'object' || Array.isArray(value))
			return 'Error: tool arguments must be a JSON object.';
		return value as ToolArguments;
	} catch {
		return 'Error: tool arguments were not valid JSON.';
	}
}

async function executeToolCall(toolCall: ChatToolCall, args: ToolArguments): Promise<string> {
	const command = commands.find((candidate) => candidate.name === toolCall.name);
	if (!command) return `Error: unknown tool "${toolCall.name}".`;
	const path = typeof args.path === 'string' ? args.path : '';
	return command.execute(
		path,
		typeof args.content === 'string' ? args.content : undefined,
		typeof args.patch === 'string' ? args.patch : undefined,
		typeof args.destination === 'string' ? args.destination : undefined,
	);
}
function formatToolCall(toolCall: ChatToolCall, args: ToolArguments | undefined): string {
	return `@${toolCall.name}${typeof args?.path === 'string' ? ` ${args.path}` : ''}`;
}