import { createServer, type Server, type Socket } from 'node:net';
import { ChatViewHost } from './chatViewHost';
import type { Dispose, HostToWebviewMessage, WebviewToHostMessage } from './protocol';

export interface SocketChatViewHostOptions {
	/** TCP port the host listens on. */
	port: number;
	/** Optional interface to bind to; defaults to all interfaces. */
	host?: string;
}

/**
 * Host transport that carries the ChatView protocol over the network.
 *
 * Acts as a plain TCP server and frames messages as newline-delimited JSON.
 * This is the server counterpart to a remote peer; it demonstrates the same
 * protocol surface as {@link VscodeChatViewHost} over a raw socket instead of
 * the webview channel. (It is not expected to interoperate with the browser
 * {@code SocketChatViewClient} — which speaks WebSocket — without a gateway.)
 */
export class SocketChatViewHost extends ChatViewHost {
	private readonly server: Server;
	private connection?: Socket;
	private readonly listeners: Array<(message: WebviewToHostMessage) => void> = [];
	private buffer = '';

	constructor(private readonly options: SocketChatViewHostOptions) {
		super();
		this.server = createServer((socket) => {
			this.connection = socket;
			socket.on('data', (chunk) => this.handleData(chunk.toString('utf8')));
			socket.on('close', () => {
				if (this.connection === socket) this.connection = undefined;
			});
			socket.on('error', () => {
				/* Keep the host alive if a peer drops mid-conversation. */
			});
		});
	}

	/** Starts accepting peer connections. Resolves once the socket is bound. */
	listen(): Promise<void> {
		return new Promise((resolve, reject) => {
			const onError = (error: Error): void => reject(error);
			this.server.once('error', onError);
			this.server.listen(this.options.port, this.options.host, () => {
				this.server.off('error', onError);
				resolve();
			});
		});
	}

	protected post(message: HostToWebviewMessage): void {
		const connection = this.connection;
		if (!connection) throw new Error('No socket peer connected.');
		connection.write(JSON.stringify(message) + '\n');
	}

	onMessage(listener: (message: WebviewToHostMessage) => void): Dispose {
		this.listeners.push(listener);
		return () => {
			const index = this.listeners.indexOf(listener);
			if (index >= 0) this.listeners.splice(index, 1);
		};
	}

	/** Closes the peer connection and stops the server. */
	dispose(): void {
		this.connection?.destroy();
		this.server.close();
	}

	private handleData(chunk: string): void {
		this.buffer += chunk;
		let newline: number;
		while ((newline = this.buffer.indexOf('\n')) >= 0) {
			const line = this.buffer.slice(0, newline);
			this.buffer = this.buffer.slice(newline + 1);
			if (!line.trim()) continue;
			try {
				const message = JSON.parse(line) as WebviewToHostMessage;
				for (const listener of this.listeners) listener(message);
			} catch {
				/* Drop a malformed frame and keep decoding the rest. */
			}
		}
	}
}