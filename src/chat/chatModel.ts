import { ToolPages } from './tools/pagination';
import type { ChatEntry } from './chatEntry';
import type { OpenRouterModel } from './models';

export class ChatModel {
	constructor(public readonly id: string) {}
	messages: ChatEntry[] = [];
	contextSummary?: { text: string; through: number };
	readonly toolPages = new ToolPages();
	isUnread = false;
	activeModel?: OpenRouterModel;
	totalCost = 0;
	activeRequest?: AbortController;
}
