import type * as vscode from 'vscode';
import { ChatViewHost } from './chatViewHost';
import type { Dispose, HostToWebviewMessage, WebviewToHostMessage } from './protocol';

export class VscodeChatViewHost extends ChatViewHost {
	constructor(private readonly webview: vscode.Webview) {
		super();
	}

	protected post(message: HostToWebviewMessage): void {
		void this.webview.postMessage(message);
	}

	onMessage(listener: (message: WebviewToHostMessage) => void): Dispose {
		const disposable = this.webview.onDidReceiveMessage((message) => {
			listener(message as WebviewToHostMessage);
		});
		return () => disposable.dispose();
	}
}
