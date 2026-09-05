import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { ChatViewProvider } from './chat/chatViewProvider';
import { BrowserChatServer } from './chat/browserChatServer';
import { registerDevelopmentTools } from './developmentTools';

export function activate(context: vscode.ExtensionContext): void {
	const instanceKey = randomBytes(32).toString('hex');
	const provider = new ChatViewProvider(context.extensionUri, setRemoteControl);
	let server: BrowserChatServer | undefined;
	let url: string | undefined;
	let disposed = false;
	let remoteUpdate = Promise.resolve();

	function setRemoteControl(enabled: boolean): Promise<void> {
		remoteUpdate = remoteUpdate.then(async () => {
			if (disposed) return;
			provider.updateRemoteControl({ enabled: !!server, busy: true, url });
			try {
				if (enabled && !server) {
					const html = await vscode.workspace.fs.readFile(
						vscode.Uri.joinPath(context.extensionUri, 'dist', 'chat.html'),
					);
					if (disposed) return;
					server = new BrowserChatServer(html, provider, instanceKey);
					try {
						url = await server.getUrl();
					} catch (error) {
						server.dispose();
						server = undefined;
						throw error;
					}
				} else if (!enabled) {
					server?.dispose();
					server = undefined;
					url = undefined;
				}
				if (disposed) return;
				if (enabled && url) {
					await vscode.env.clipboard.writeText(url);
					vscode.window.setStatusBarMessage('PeliCode URL copied to clipboard.', 4000);
				}
			} catch (error) {
				void vscode.window.showErrorMessage(
					`Could not update PeliCode remote control: ${error instanceof Error ? error.message : error}`,
				);
			} finally {
				provider.updateRemoteControl({ enabled: !!server, busy: false, url });
			}
		});
		return remoteUpdate;
	}

	context.subscriptions.push(
		provider,
		{
			dispose: () => {
				disposed = true;
				server?.dispose();
			},
		},
		vscode.commands.registerCommand('pelicode.openBrowserChat', async () => {
			await setRemoteControl(true);
			if (url) await vscode.env.openExternal(vscode.Uri.parse(url));
		}),
		vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, provider, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
		vscode.commands.registerCommand('pelicode.focusChat', () =>
			vscode.commands.executeCommand(`${ChatViewProvider.viewType}.focus`),
		),
	);
	void registerDevelopmentTools(context);
}
