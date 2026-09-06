import type { OpenRouterModel } from '../chat/models';
import type { Dispose, HostToWebviewMessage, WebviewToHostMessage } from '../chat/protocol';

export abstract class ChatViewClient {
	constructor(protected readonly chatId: string) {}

	protected abstract post(message: WebviewToHostMessage): void;

	abstract onMessage(listener: (message: HostToWebviewMessage) => void): Dispose;

	setRemoteControl(enabled: boolean): void {
		this.post({ type: 'setRemoteControl', id: this.chatId, enabled });
	}

	listChats(): void {
		this.post({ type: 'listChats', id: this.chatId });
	}

	create(): void {
		this.post({ type: 'create', id: this.chatId });
	}

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

	context(model: OpenRouterModel): void {
		this.post({ type: 'context', id: this.chatId, model });
	}

	compact(model: OpenRouterModel): void {
		this.post({ type: 'compact', id: this.chatId, model });
	}

	cancel(): void {
		this.post({ type: 'cancel', id: this.chatId });
	}

	close(): void {
		this.post({ type: 'close', id: this.chatId });
	}
}
