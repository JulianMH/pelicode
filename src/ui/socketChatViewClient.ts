import type { Dispose, HostToWebviewMessage, WebviewToHostMessage } from '../chat/protocol';
import { ChatViewClient } from './chatViewClient';

/**
 * Client transport that carries the ChatView protocol over the network.
 *
 * Connects to a WebSocket endpoint and frames messages as newline-delimited
 * JSON text frames. This is the peer of a remote host; it demonstrates the same
 * protocol surface as {@link VscodeChatViewClient} over a socket instead of the
 * webview channel. (It speaks WebSocket, so it is not expected to interoperate
 * with {@code SocketChatViewHost} — which speaks raw TCP — without a gateway.)
 */
export class SocketChatViewClient extends ChatViewClient {
	private readonly socket: WebSocket;
	private readonly listeners: Array<(message: HostToWebviewMessage) => void> = [];
	private buffer = '';

	/**
	 * @param url WebSocket endpoint, e.g. {@code ws://host:port}.
	 * @param chatId Chat this client is scoped to.
	 */
	constructor(url: string, chatId: string) {
		super(chatId);
		this.socket = new WebSocket(url);
		this.socket.addEventListener('message', (event) => this.handleData(event));
	}

	protected post(message: WebviewToHostMessage): void {
		this.socket.send(JSON.stringify(message));
	}

	onMessage(listener: (message: HostToWebviewMessage) => void): Dispose {
		this.listeners.push(listener);
		return () => {
			const index = this.listeners.indexOf(listener);
			if (index >= 0) this.listeners.splice(index, 1);
		};
	}

	/** Sends the protocol {@code close} message, then drops the socket. */
	close(): void {
		super.close();
		this.socket.close();
	}

	private handleData(event: MessageEvent): void {
		const chunk = typeof event.data === 'string' ? event.data : '';
		this.buffer += chunk;
		let newline: number;
		while ((newline = this.buffer.indexOf('\n')) >= 0) {
			const line = this.buffer.slice(0, newline);
			this.buffer = this.buffer.slice(newline + 1);
			if (!line.trim()) continue;
			try {
				const message = JSON.parse(line) as HostToWebviewMessage;
				for (const listener of this.listeners) listener(message);
			} catch {
				/* Drop a malformed frame and keep decoding the rest. */
			}
		}
	}
}