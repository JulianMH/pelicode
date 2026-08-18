import type { OpenRouterModel } from '../chat/models';
import type { Dispose, HostToWebviewMessage, WebviewToHostMessage } from '../chat/protocol';

/**
 * The client-side surface of the ChatView conversation protocol.
 *
 * Every send method models a single, explicitly named conversation message so
 * the UI never builds raw message objects. Concrete subclasses plug in a
 * transport (the VS Code webview message channel, a network socket, …); only
 * {@link post} and {@link onMessage} know how bytes cross the wire, so the
 * protocol reads identically regardless of the transport. Each instance is
 * scoped to one chat via `chatId`, which it stamps on every message it sends.
 */
export abstract class ChatViewClient {
	constructor(protected readonly chatId: string) {}

	/** Sends one webview→host message over the concrete transport. */
	protected abstract post(message: WebviewToHostMessage): void;

	/** Subscribes to host→webview messages. Returns an unsubscriber. */
	abstract onMessage(listener: (message: HostToWebviewMessage) => void): Dispose;

	/** Announces that the view has finished mounting and is ready to render. */
	ready(): void {
		this.post({ type: 'ready', id: this.chatId });
	}

	/** Reports that the chat tab became the active view. */
	viewOpened(): void {
		this.post({ type: 'viewOpened', id: this.chatId });
	}

	/** Reports that the chat tab stopped being the active view. */
	viewClosed(): void {
		this.post({ type: 'viewClosed', id: this.chatId });
	}

	/** Sends a user prompt to the host for a response. */
	send(text: string, model: OpenRouterModel): void {
		this.post({ type: 'send', id: this.chatId, text, model });
	}

	/** Asks the host to abort the in-flight request for this chat. */
	cancel(): void {
		this.post({ type: 'cancel', id: this.chatId });
	}

	/** Asks the host to close (delete) this chat. */
	close(): void {
		this.post({ type: 'close', id: this.chatId });
	}
}