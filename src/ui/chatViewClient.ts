import type { OpenRouterModel } from '../chat/models';
import type { Dispose, HostToWebviewMessage, WebviewToHostMessage } from '../chat/protocol';

export abstract class ChatViewClient {
	constructor(protected readonly chatId: string) {}

	protected abstract post(message: WebviewToHostMessage): void;

	abstract onMessage(listener: (message: HostToWebviewMessage) => void): Dispose;

	ready(): void {
		this.post({ type: 'ready', id: this.chatId });
	}

	viewOpened(): void {
		this.post({ type: 'viewOpened', id: this.chatId });
	}

	viewClosed(): void {
		this.post({ type: 'viewClosed', id: this.chatId });
	}

	send(text: string, model: OpenRouterModel): void {
		this.post({ type: 'send', id: this.chatId, text, model });
	}

	cancel(): void {
		this.post({ type: 'cancel', id: this.chatId });
	}

	close(): void {
		this.post({ type: 'close', id: this.chatId });
	}
}
