import * as vscode from 'vscode';
import { ChatViewProvider } from './chat/chatViewProvider';
import { BrowserChatServer } from './chat/browserChatServer';
import { registerDevelopmentTools } from './developmentTools';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const provider = new ChatViewProvider(context.extensionUri);
	let server: BrowserChatServer | undefined;
	context.subscriptions.push(
		provider,
		vscode.commands.registerCommand('pelicode.openBrowserChat', async () => {
			if (server) await vscode.env.openExternal(vscode.Uri.parse(await server.getUrl()));
			else void vscode.window.showErrorMessage('The PeliCode browser server is unavailable.');
		}),
		vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, provider, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
		vscode.commands.registerCommand('pelicode.focusChat', () =>
			vscode.commands.executeCommand(`${ChatViewProvider.viewType}.focus`),
		),
	);
	void registerDevelopmentTools(context);
	try {
		const html = await vscode.workspace.fs.readFile(
			vscode.Uri.joinPath(context.extensionUri, 'dist', 'chat.html'),
		);
		server = new BrowserChatServer(
			html,
			provider,
			vscode.workspace.name ?? 'Empty VS Code window',
			vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).join(', ') ?? '',
		);
		context.subscriptions.push(server);
		await server.getUrl();
	} catch (error) {
		server?.dispose();
		server = undefined;
		void vscode.window.showErrorMessage(
			`Could not start PeliCode browser server: ${error instanceof Error ? error.message : error}`,
		);
	}
}
