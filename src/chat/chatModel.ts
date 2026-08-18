import type { ChatEntry } from './chatEntry';
import type { OpenRouterModel } from './models';

export class ChatModel {
	constructor(public readonly id: string) {}
	messages: ChatEntry[] = [];
	isUnread = false;
	activeModel?: OpenRouterModel;
	totalCost = 0;
	activeRequest?: AbortController;
}
