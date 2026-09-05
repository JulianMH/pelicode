import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { WebSocketServer } from 'ws';
import { SocketChatViewHost } from './socketChatViewHost';
import type { ChatViewProvider } from './chatViewProvider';

export class BrowserChatServer {
	private readonly sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
	private readonly server;
	private readonly started: Promise<string>;
	private disposed = false;

	constructor(html: Uint8Array, provider: ChatViewProvider, instanceKey: string) {
		this.server = createServer((request, response) => {
			if (request.method !== 'GET' || request.url !== '/') {
				response.writeHead(404).end();
				return;
			}
			response.writeHead(200, {
				'Content-Type': 'text/html; charset=utf-8',
				'Cache-Control': 'no-store',
				'Referrer-Policy': 'no-referrer',
			});
			response.end(html);
		});
		this.server.on('upgrade', (request, socket, head) => {
			if (request.url !== `/socket?key=${instanceKey}`) {
				socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
				return;
			}
			this.sockets.handleUpgrade(request, socket, head, (connection) => {
				const disconnect = provider.connectHost(new SocketChatViewHost(connection));
				connection.once('close', disconnect);
				connection.on('error', () => connection.terminate());
			});
		});
		this.started = new Promise((resolve, reject) => {
			const host = Object.values(networkInterfaces())
				.flatMap((addresses) => addresses ?? [])
				.find((address) => address.family === 'IPv4' && !address.internal)?.address;
			if (!host) {
				reject(new Error('No network IPv4 address found. Connect to Wi-Fi or Ethernet and try again.'));
				return;
			}
			this.server.once('error', reject);
			this.server.listen(0, host, () => {
				const address = this.server.address();
				if (address && typeof address !== 'string') {
					resolve(`http://${host}:${address.port}/#key=${instanceKey}`);
				}
			});
		});
	}

	getUrl(): Promise<string> {
		return this.started;
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		for (const socket of this.sockets.clients) socket.terminate();
		this.sockets.close();
		this.server.close();
		this.server.closeAllConnections();
	}
}
