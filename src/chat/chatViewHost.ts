import type { ChatEntry } from './chatEntry';
import type { OpenRouterModel } from './models';
import type { Dispose, HostToWebviewMessage, WebviewToHostMessage } from './protocol';

/**
 * The host-side surface of the ChatView conversation protocol.
 *
 * Every send method models a single, explicitly named conversation message so
 * the provider never builds raw message objects. Concrete subclasses plug in a
 * transport (the VS Code webview message channel, a network socket, …); only
 * {@link post} and {@link onMessage} know how bytes cross the wire, so the
 * protocol reads identically regardless of the transport.
 */
export abstract class ChatViewHost {
	/** Sends one host→webview message over the concrete transport. */
	protected abstract post(message: HostToWebviewMessage): void;

	/** Subscribes to webview→host messages. Returns an unsubscriber. */
	abstract onMessage(listener: (message: WebviewToHostMessage) => void): Dispose;

	/** Asks the webview to render a chat's full conversation history and model. */
	restore(id: string, messages: ChatEntry[], model?: OpenRouterModel): void {
		this.post({ type: 'restore', id, messages, model });
	}

	/** Reports the running cost for a chat. */
	costUpdated(id: string, cost: number): void {
		this.post({ type: 'costUpdated', id, cost });
	}

	/** Reports whether a chat has an unread response. */
	unreadUpdated(id: string, unread: boolean): void {
		this.post({ type: 'unreadUpdated', id, unread });
	}

	/** Streams a single conversation entry to the webview. */
	entry(id: string, entry: ChatEntry, final?: boolean): void {
		this.post({ type: 'entry', id, entry, final });
	}

	/** Tells a chat that a request is now being processed. */
	requestStarted(id: string): void {
		this.post({ type: 'requestStarted', id });
	}

	/** Tells a chat that the current request has finished. */
	requestFinished(id: string): void {
		this.post({ type: 'requestFinished', id });
	}
}