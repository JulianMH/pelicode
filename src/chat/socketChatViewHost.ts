import { WebSocket } from 'ws';
import { ChatViewHost } from './chatViewHost';
import type { Dispose, HostToWebviewMessage, WebviewToHostMessage } from './protocol';

export class SocketChatViewHost extends ChatViewHost {
	constructor(private readonly socket: WebSocket) {
		super();
	}

	protected post(message: HostToWebviewMessage): void {
		if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
	}

	onMessage(listener: (message: WebviewToHostMessage) => void): Dispose {
		const handler = (data: Buffer, isBinary: boolean) => {
			if (isBinary) return;
			let message: WebviewToHostMessage;
			try {
				message = JSON.parse(data.toString());
			} catch {
				this.socket.close(1007, 'Invalid JSON');
				return;
			}
			listener(message);
		};
		this.socket.on('message', handler);
		return () => {
			this.socket.off('message', handler);
		};
	}
}
