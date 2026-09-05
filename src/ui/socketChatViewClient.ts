import type { Dispose, HostToWebviewMessage, WebviewToHostMessage } from '../chat/protocol';
import { ChatViewClient } from './chatViewClient';

export class SocketChatViewClient extends ChatViewClient {
	constructor(
		private readonly socket: WebSocket,
		chatId: string,
	) {
		super(chatId);
	}

	protected post(message: WebviewToHostMessage): void {
		if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
	}

	onMessage(listener: (message: HostToWebviewMessage) => void): Dispose {
		const handler = (event: MessageEvent) => {
			if (typeof event.data !== 'string') return;
			let message: HostToWebviewMessage;
			try {
				message = JSON.parse(event.data);
			} catch {
				return;
			}
			if (message && typeof message.type === 'string') listener(message);
		};
		this.socket.addEventListener('message', handler);
		return () => this.socket.removeEventListener('message', handler);
	}
}
