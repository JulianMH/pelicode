import type { Dispose, HostToWebviewMessage, WebviewToHostMessage } from '../chat/protocol';
import { ChatViewClient } from './chatViewClient';

type VsCodeApi = { postMessage(message: unknown): void };

export class VscodeChatViewClient extends ChatViewClient {
	constructor(
		private readonly vscodeApi: VsCodeApi,
		chatId: string,
	) {
		super(chatId);
	}

	protected post(message: WebviewToHostMessage): void {
		this.vscodeApi.postMessage(message);
	}

	onMessage(listener: (message: HostToWebviewMessage) => void): Dispose {
		const handler = (event: MessageEvent<HostToWebviewMessage>) => listener(event.data);
		window.addEventListener('message', handler);
		return () => window.removeEventListener('message', handler);
	}
}
