import * as vscode from 'vscode';
import { ChatViewProvider } from './chat/chatViewProvider';
import { registerDevelopmentTools } from './developmentTools';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			ChatViewProvider.viewType,
			new ChatViewProvider(context.extensionUri),
			{ webviewOptions: { retainContextWhenHidden: true } },
		),
		vscode.commands.registerCommand('pelicode.focusChat', () =>
			vscode.commands.executeCommand(`${ChatViewProvider.viewType}.focus`),
		),
	);
	void registerDevelopmentTools(context);
}
export function deactivate() {}
