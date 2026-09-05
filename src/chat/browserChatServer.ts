import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { browserChatPorts } from './browserDiscovery';
import { SocketChatViewHost } from './socketChatViewHost';
import type { ChatViewProvider } from './chatViewProvider';

export class BrowserChatServer {
	private readonly sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
	private readonly server;
	private readonly started: Promise<string>;
	private disposed = false;

	constructor(html: Uint8Array, provider: ChatViewProvider, name: string, workspace: string) {
		this.server = createServer((request, response) => {
			response.setHeader('Access-Control-Allow-Origin', '*');
			response.setHeader('Access-Control-Allow-Private-Network', 'true');
			response.setHeader('Cache-Control', 'no-store');
			if (request.method === 'OPTIONS') {
				response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
				response.writeHead(204).end();
			} else if (request.method === 'GET' && request.url === '/instance') {
				response.writeHead(200, { 'Content-Type': 'application/json' });
				response.end(JSON.stringify({ app: 'pelicode', name, workspace }));
			} else if (request.method === 'GET' && request.url === '/') {
				response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
				response.end(html);
			} else {
				response.writeHead(404).end();
			}
		});
		this.server.on('upgrade', (request, socket, head) => {
			if (request.url !== '/socket') {
				socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
				return;
			}
			this.sockets.handleUpgrade(request, socket, head, (connection) => {
				const disconnect = provider.connectHost(new SocketChatViewHost(connection));
				connection.once('close', disconnect);
				connection.on('error', () => connection.terminate());
			});
		});
		this.started = this.listen();
	}

	private async listen(): Promise<string> {
		for (const port of browserChatPorts) {
			if (this.disposed) throw new Error('PeliCode server stopped.');
			try {
				await new Promise<void>((resolve, reject) => {
					const onError = (error: Error) => {
						this.server.off('listening', onListening);
						reject(error);
					};
					const onListening = () => {
						this.server.off('error', onError);
						resolve();
					};
					this.server.once('error', onError);
					this.server.once('listening', onListening);
					this.server.listen(port, '127.0.0.1');
				});
				return `http://127.0.0.1:${port}/`;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
			}
		}
		throw new Error('No free PeliCode port in the range 43120–43139.');
	}

	getUrl(): Promise<string> {
		return this.started;
	}

	dispose(): void {
		this.disposed = true;
		for (const socket of this.sockets.clients) socket.terminate();
		this.sockets.close();
		this.server.close();
		this.server.closeAllConnections();
	}
}
