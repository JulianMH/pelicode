import type { Dispose, HostToWebviewMessage, WebviewToHostMessage } from '../chat/protocol';
import { ChatViewClient } from './chatViewClient';

export class SocketChatViewClient extends ChatViewClient {
	private readonly socket: WebSocket;
	private readonly listeners: Array<(message: HostToWebviewMessage) => void> = [];
	private buffer = '';

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
