import type { ChatEntry } from './chatEntry';
import type { OpenRouterModel } from './models';
import type { ChatSummary, Dispose, HostToWebviewMessage, WebviewToHostMessage } from './protocol';

export abstract class ChatViewHost {
	protected abstract post(message: HostToWebviewMessage): void;

	abstract onMessage(listener: (message: WebviewToHostMessage) => void): Dispose;

	chatsUpdated(chats: ChatSummary[]): void {
		this.post({ type: 'chatsUpdated', id: '', chats });
	}

	restore(id: string, messages: ChatEntry[], model?: OpenRouterModel): void {
		this.post({ type: 'restore', id, messages, model });
	}

	costUpdated(id: string, cost: number): void {
		this.post({ type: 'costUpdated', id, cost });
	}

	unreadUpdated(id: string, unread: boolean): void {
		this.post({ type: 'unreadUpdated', id, unread });
	}

	entry(id: string, entry: ChatEntry, final?: boolean): void {
		this.post({ type: 'entry', id, entry, final });
	}

	requestStarted(id: string): void {
		this.post({ type: 'requestStarted', id });
	}

	requestFinished(id: string): void {
		this.post({ type: 'requestFinished', id });
	}
}
