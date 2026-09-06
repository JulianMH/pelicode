import {
	compactionThreshold,
	estimateInput,
	getModelLimits,
	inputBudget,
	type ContextUsage,
} from './context';
import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import type { ChatEntry, ChatToolCall, OpenRouterMessage } from './chatEntry';
import { ChatModel } from './chatModel';
import type { ChatViewHost } from './chatViewHost';
import {
	isWebviewToHostMessage,
	type ChatSummary,
	type RemoteControlState,
	type Dispose,
	type WebviewToHostMessage,
} from './protocol';
import { VscodeChatViewHost } from './vscodeChatViewHost';
import { executeToolCall } from './tools';
import { defaultModel, isOpenRouterModel, type OpenRouterModel } from './models';
import {
	extractReasoning,
	requestOpenRouter,
	toApiMessages,
	toOpenRouterToolCall,
} from './openRouterClient';

export class ChatViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'pelicode.chat';
	private readonly chatModels = new Map<string, ChatModel>();
	private readonly writeQueues = new Map<string, Promise<void>>();
	private readonly chatDirectory?: vscode.Uri;
	private readonly modelsLoaded: Promise<void>;
	private view?: vscode.WebviewView;
	private readonly hosts = new Map<ChatViewHost, Dispose>();
	private readonly openChats = new Map<ChatViewHost, string>();
	private remoteControl: RemoteControlState = { enabled: false, busy: false };
	public constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly setRemoteControl: (enabled: boolean) => Promise<void>,
	) {
		const workspace = vscode.workspace.workspaceFolders?.[0];
		this.chatDirectory = workspace
			? vscode.Uri.joinPath(workspace.uri, '.pelicode', 'chat')
			: undefined;
		this.modelsLoaded = this.loadChatModels().then(() => {
			if (!this.chatModels.size) this.getChatModel('default');
		});
	}
	public async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
		await this.modelsLoaded;
		this.view = view;
		const disconnect = this.connectHost(new VscodeChatViewHost(view.webview));
		this.updateChats();
		view.onDidDispose(() => {
			if (this.view === view) this.view = undefined;
			disconnect();
		});
		view.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')],
		};
		view.webview.html = this.getHtml(view.webview);
	}
	public connectHost(host: ChatViewHost): Dispose {
		const unsubscribe = host.onMessage((message) => {
			if (!isWebviewToHostMessage(message)) return;
			void this.modelsLoaded.then(() => {
				if (this.hosts.has(host)) this.handleMessage(host, message);
			});
		});
		this.hosts.set(host, unsubscribe);
		return () => {
			unsubscribe();
			this.hosts.delete(host);
			this.openChats.delete(host);
		};
	}
	public updateRemoteControl(state: RemoteControlState): void {
		this.remoteControl = state;
		for (const host of this.hosts.keys()) {
			if (host instanceof VscodeChatViewHost) host.remoteControlUpdated(state);
		}
	}
	public dispose(): void {
		for (const unsubscribe of this.hosts.values()) unsubscribe();
		this.hosts.clear();
		this.openChats.clear();
		for (const model of this.chatModels.values()) model.activeRequest?.abort();
	}
	private broadcast(send: (host: ChatViewHost) => void): void {
		for (const host of this.hosts.keys()) send(host);
	}
	private handleMessage(host: ChatViewHost, message: WebviewToHostMessage): void {
		if (message.type === 'setRemoteControl') {
			if (host instanceof VscodeChatViewHost) void this.setRemoteControl(message.enabled);
			return;
		}
		if (message.type === 'listChats') {
			if (host instanceof VscodeChatViewHost) host.remoteControlUpdated(this.remoteControl);
			host.chatsUpdated(this.getChatSummaries());
			return;
		}
		const chatModel =
			message.type === 'create' ? this.getChatModel(message.id) : this.chatModels.get(message.id);
		if (!chatModel) return;
		switch (message.type) {
			case 'create':
				this.persist(chatModel);
				this.updateChats();
				return;
			case 'close':
				chatModel.activeRequest?.abort();
				chatModel.activeRequest = undefined;
				for (const [peer, id] of this.openChats) {
					if (id === chatModel.id) this.openChats.delete(peer);
				}
				this.chatModels.delete(chatModel.id);

				void this.removeChatModel(chatModel.id);
				this.updateChats();
				return;
			case 'cancel':
				chatModel.activeRequest?.abort();
				this.updateChats();
				return;
			case 'ready':
				void this.updateContext(chatModel, chatModel.activeModel ?? defaultModel, host);
				host.restore(chatModel.id, chatModel.messages, chatModel.activeModel);
				host.costUpdated(chatModel.id, chatModel.totalCost);
				if (chatModel.activeRequest) host.requestStarted(chatModel.id);
				else host.requestFinished(chatModel.id);
				return;
			case 'viewOpened':
				this.openChats.set(host, chatModel.id);
				if (!chatModel.isUnread) return;
				chatModel.isUnread = false;
				this.persist(chatModel);
				this.updateChats();
				return;
			case 'viewClosed':
				if (this.openChats.get(host) === chatModel.id) this.openChats.delete(host);
				return;
			case 'context':
				if (isOpenRouterModel(message.model))
					void this.updateContext(chatModel, message.model, host);
				return;
			case 'compact': {
				if (chatModel.activeRequest || !isOpenRouterModel(message.model)) return;
				const controller = new AbortController();
				chatModel.activeRequest = controller;
				this.broadcast((peer) => peer.requestStarted(chatModel.id));
				this.updateChats();
				void this.compactContext(chatModel, message.model, controller.signal)
					.catch((error: unknown) => {
						if (!controller.signal.aborted)
							this.appendEntry(chatModel, {
								type: 'assistantMessage',
								text: error instanceof Error ? error.message : 'Compaction failed.',
							});
					})
					.finally(() => {
						if (chatModel.activeRequest === controller) {
							chatModel.activeRequest = undefined;
							this.broadcast((peer) => peer.requestFinished(chatModel.id));
							void this.updateContext(chatModel, message.model);
							this.updateChats();
						}
					});
				return;
			}
			case 'send': {
				const text = message.text.trim();
				if (!text || chatModel.activeRequest) return;
				const model = isOpenRouterModel(message.model) ? message.model : defaultModel;
				this.recordModelSwitch(chatModel, model);
				const controller = new AbortController();
				chatModel.activeRequest = controller;
				this.updateChats();
				void this.reply(chatModel, text, model, controller.signal).finally(() => {
					if (chatModel.activeRequest === controller) {
						chatModel.activeRequest = undefined;
						void this.updateContext(chatModel, model);
						this.broadcast((host) => host.requestFinished(chatModel.id));
						this.updateChats();
					}
				});
				return;
			}
		}
	}

	private recordModelSwitch(chatModel: ChatModel, model: OpenRouterModel): void {
		const lastSwitch = [...chatModel.messages]
			.reverse()
			.find((entry) => entry.type === 'modelSwitch');
		if (lastSwitch?.text === model) return;
		chatModel.activeModel = model;
		const entry: ChatEntry = { type: 'modelSwitch', text: model };
		this.appendEntry(chatModel, entry);
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
			await Promise.all(
				entries
					.filter(([, type]) => type === vscode.FileType.Directory)
					.map(async ([id]) => {
						if (!/^[a-zA-Z0-9._-]+$/.test(id)) return;
						try {
							const file = vscode.Uri.joinPath(this.chatDirectory!, id, 'model.json');
							const bytes = await vscode.workspace.fs.readFile(file);
							const data = JSON.parse(new TextDecoder().decode(bytes)) as Partial<ChatModel>;
							if (data.id !== id || !Array.isArray(data.messages)) return;
							const model = new ChatModel(id);
							model.messages = data.messages;
							if (
								data.contextSummary &&
								typeof data.contextSummary.text === 'string' &&
								Number.isSafeInteger(data.contextSummary.through) &&
								data.contextSummary.through >= 0 &&
								data.contextSummary.through <= model.messages.length
							)
								model.contextSummary = data.contextSummary;
							model.isUnread = data.isUnread === true;
							model.totalCost = typeof data.totalCost === 'number' ? data.totalCost : 0;
							model.activeModel = isOpenRouterModel(data.activeModel)
								? data.activeModel
								: undefined;
							this.chatModels.set(id, model);
						} catch {
							/* Ignore an incomplete or corrupt chat file. */
						}
					}),
			);
		} catch {
			/* The directory does not exist on a new project. */
		}
	}
	private persist(chatModel: ChatModel): void {
		if (!this.chatDirectory || !/^[a-zA-Z0-9._-]+$/.test(chatModel.id)) return;
		const previous = this.writeQueues.get(chatModel.id) ?? Promise.resolve();
		const snapshot = JSON.stringify({
			id: chatModel.id,
			messages: chatModel.messages,
			contextSummary: chatModel.contextSummary,
			isUnread: chatModel.isUnread,
			activeModel: chatModel.activeModel,
			totalCost: chatModel.totalCost,
		});
		const write = previous
			.catch(() => undefined)
			.then(async () => {
				const folder = vscode.Uri.joinPath(this.chatDirectory!, chatModel.id);
				await vscode.workspace.fs.createDirectory(folder);
				await vscode.workspace.fs.writeFile(
					vscode.Uri.joinPath(folder, 'model.json'),
					new TextEncoder().encode(snapshot),
				);
			});
		this.writeQueues.set(chatModel.id, write);
		void write.catch(() => undefined);
	}
	private async removeChatModel(id: string): Promise<void> {
		if (!this.chatDirectory) return;
		const previous = this.writeQueues.get(id) ?? Promise.resolve();
		const removal = previous
			.catch(() => undefined)
			.then(() =>
				vscode.workspace.fs.delete(vscode.Uri.joinPath(this.chatDirectory!, id), {
					recursive: true,
					useTrash: false,
				}),
			);
		this.writeQueues.set(id, removal);
		await removal.catch(() => undefined);
	}
	private getChatSummaries(): ChatSummary[] {
		return [...this.chatModels.values()].map((model, index) => ({
			id: model.id,
			label: `Chat ${index + 1}`,
			thinking: !!model.activeRequest,
			unread: model.isUnread,
		}));
	}
	private updateChats(): void {
		const chats = this.getChatSummaries();
		this.broadcast((host) => host.chatsUpdated(chats));
		if (!this.view) return;
		const count = chats.filter((chat) => chat.unread || chat.thinking).length;
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
		this.appendEntry(chatModel, {
			type: 'userMessage',
			text: prompt,
			rawOpenRouterPayload: { role: 'user', content: prompt },
		});
		try {
			this.broadcast((host) => host.requestStarted(chatModel.id));
			while (!signal.aborted) {
				const limits = await getModelLimits(model);
				if (estimateInput(this.apiMessages(chatModel, model)) >= compactionThreshold(limits))
					await this.compactContext(chatModel, model, signal);
				signal.throwIfAborted();
				await this.updateContext(chatModel, model);
				const response = await requestOpenRouter(
					this.apiMessages(chatModel, model),
					model,
					0,
					0,
					signal,
				);
				if (signal.aborted) return;
				chatModel.totalCost += response.cost;
				this.persist(chatModel);
				this.broadcast((host) => host.costUpdated(chatModel.id, chatModel.totalCost));
				const reasoning = extractReasoning(response.reasoningDetails);
				if (reasoning) this.appendEntry(chatModel, { type: 'reasoning', text: reasoning });
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
					const entry: ChatEntry = {
						type: 'assistantMessage',
						text: content,
						rawOpenRouterPayload,
					};
					chatModel.messages.push(entry);
					this.persist(chatModel);
					if (content) this.broadcast((host) => host.entry(chatModel.id, entry));
				}
				if (!response.toolCalls?.length) break;
				let compactRequested = false;
				for (const toolCall of response.toolCalls) {
					compactRequested = (await this.runTool(chatModel, toolCall, signal)) || compactRequested;
					if (signal.aborted) return;
				}
				if (compactRequested) await this.compactContext(chatModel, model, signal);
			}
		} catch (error) {
			if (signal.aborted) return;
			this.appendEntry(chatModel, {
				type: 'assistantMessage',
				text: error instanceof Error ? error.message : 'OpenRouter request failed.',
			});
		}
		if (!signal.aborted) {
			chatModel.isUnread = ![...this.openChats.values()].includes(chatModel.id);
			this.persist(chatModel);
		}
	}

	private appendEntry(chatModel: ChatModel, entry: ChatEntry): void {
		chatModel.messages.push(entry);
		this.persist(chatModel);
		this.broadcast((host) => host.entry(chatModel.id, entry));
	}
	private async runTool(
		chatModel: ChatModel,
		toolCall: ChatToolCall,
		signal: AbortSignal,
	): Promise<boolean> {
		if (signal.aborted) return false;
		let compact = false;
		const entry = await executeToolCall(toolCall, chatModel.toolPages, () => {
			compact = true;
		});
		if (this.chatModels.get(chatModel.id) === chatModel) this.appendEntry(chatModel, entry);
		return compact;
	}

	private apiMessages(
		chatModel: ChatModel,
		model: OpenRouterModel,
		end = chatModel.messages.length,
		summary = chatModel.contextSummary,
	): OpenRouterMessage[] {
		const through = summary?.through ?? 0;
		const previousModel = chatModel.messages
			.slice(0, through)
			.reverse()
			.find((entry) => entry.type === 'modelSwitch');
		const entries = chatModel.messages.slice(through, end);
		if (previousModel) entries.unshift(previousModel);
		const messages = toApiMessages(entries, model);
		if (summary)
			messages.unshift({
				role: 'user',
				content: `Previous conversation summary (continue outstanding work):\n${summary.text}`,
			});
		return messages.flatMap((message, index): OpenRouterMessage[] => {
			if (message.role !== 'assistant' || !message.tool_calls?.length) return [message];
			const following: OpenRouterMessage[] = [];
			for (let next = index + 1; next < messages.length && messages[next].role === 'tool'; next++)
				following.push(messages[next]);
			const missing = message.tool_calls.filter(
				(call) => !following.some((item) => item.role === 'tool' && item.tool_call_id === call.id),
			);
			return [
				message,
				...missing.map((call): OpenRouterMessage => ({
					role: 'tool',
					tool_call_id: call.id,
					content:
						'Tool execution was interrupted; no result is available. Inspect workspace state before retrying mutations.',
				})),
			];
		});
	}

	private async updateContext(
		chatModel: ChatModel,
		model: OpenRouterModel,
		host?: ChatViewHost,
	): Promise<void> {
		const usage: ContextUsage = { model, estimatedTokens: 0 };
		try {
			const limits = await getModelLimits(model);
			usage.limit = limits.context;
			usage.reservedOutput = limits.output;
			usage.compactAt = compactionThreshold(limits);
		} catch (error) {
			usage.error = error instanceof Error ? error.message : 'Model context limit unavailable.';
		}
		usage.estimatedTokens = estimateInput(this.apiMessages(chatModel, model));
		if (host) host.contextUpdated(chatModel.id, usage);
		else this.broadcast((peer) => peer.contextUpdated(chatModel.id, usage));
	}

	private async compactContext(
		chatModel: ChatModel,
		model: OpenRouterModel,
		signal: AbortSignal,
	): Promise<void> {
		const limits = await getModelLimits(model);
		signal.throwIfAborted();
		const start = chatModel.contextSummary?.through ?? 0;
		if (
			!chatModel.contextSummary &&
			!chatModel.messages.slice(start).some((entry) => entry.rawOpenRouterPayload)
		)
			return;
		let through = chatModel.messages.length - 1;
		while (
			through >= 0 &&
			(chatModel.messages[through].type !== 'userMessage' ||
				!chatModel.messages[through].rawOpenRouterPayload)
		)
			through--;
		const tail = toApiMessages(chatModel.messages.slice(Math.max(start, through)), model);
		if (through <= start || estimateInput(tail) > compactionThreshold(limits) / 2)
			through = chatModel.messages.length;
		const transcript = this.apiMessages(chatModel, model, through)
			.map((message) => {
				if (message.role === 'assistant') {
					const { reasoning_details: _reasoning, ...rest } = message;
					return rest;
				}
				return message;
			})
			.map((message) => JSON.stringify(message))
			.join('\n');
		let summary = '';
		let offset = 0;
		while (offset < transcript.length) {
			signal.throwIfAborted();
			let length = Math.min(transcript.length - offset, inputBudget(limits) * 2);
			let messages: OpenRouterMessage[];
			while (true) {
				messages = [
					{
						role: 'user',
						content: `Previous handoff:\n${summary}\n\nNext transcript section:\n${transcript.slice(offset, offset + length)}`,
					},
				];
				if (estimateInput(messages, true) <= inputBudget(limits)) break;
				length = Math.floor(length / 2);
				if (!length) throw new Error('This model has insufficient context for compaction.');
			}
			const response = await requestOpenRouter(messages, model, 0, 0, signal, 0, true);
			if (this.chatModels.get(chatModel.id) !== chatModel) return;
			chatModel.totalCost += response.cost;
			this.persist(chatModel);
			this.broadcast((host) => host.costUpdated(chatModel.id, chatModel.totalCost));
			signal.throwIfAborted();
			if (response.truncated)
				throw new Error('Context summary was truncated; the existing context was kept.');
			if (!response.content?.trim())
				throw new Error('Compaction returned no summary; the existing context was kept.');
			summary = response.content.trim();
			offset += length;
		}
		const checkpoint = { text: summary, through };
		if (
			estimateInput(this.apiMessages(chatModel, model, chatModel.messages.length, checkpoint)) >=
			estimateInput(this.apiMessages(chatModel, model))
		)
			throw new Error('Compaction did not reduce the context; the existing context was kept.');
		chatModel.contextSummary = checkpoint;
		this.appendEntry(chatModel, { type: 'compaction', text: summary });
		await this.updateContext(chatModel, model);
	}

	private getHtml(webview: vscode.Webview): string {
		const nonce = randomBytes(16).toString('base64');
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'),
		);
		return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"><title>Code AI Chat</title></head><body><div id="app"></div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
	}
}
