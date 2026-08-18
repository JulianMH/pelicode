import * as vscode from 'vscode';

export async function registerDevelopmentTools(context: vscode.ExtensionContext): Promise<void> {
	context.subscriptions.push(
		vscode.commands.registerCommand('pelicode.installCurrentVsix', async () => {
			const task = await getInstallTask();
			if (!task) {
				void vscode.window.showErrorMessage(
					'The "Install Current VSIX" task is not available in this workspace.',
				);
				return;
			}
			await runTaskAndReload(task);
		}),
	);

	if (!(await getInstallTask())) {
		return;
	}

	const button = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	button.command = 'pelicode.installCurrentVsix';
	button.text = '$(package) Install Chatbot and Reload';
	button.tooltip = 'Package and install PeliCode in this VS Code instance';
	button.show();
	context.subscriptions.push(button);
}

async function getInstallTask(): Promise<vscode.Task | undefined> {
	const tasks = await vscode.tasks.fetchTasks();
	return tasks.find((task) => task.name === 'Install Current VSIX');
}

async function runTaskAndReload(task: vscode.Task): Promise<void> {
	const execution = await vscode.tasks.executeTask(task);
	const exitCode = await new Promise<number | undefined>((resolve) => {
		const listener = vscode.tasks.onDidEndTaskProcess((event) => {
			if (event.execution === execution) {
				listener.dispose();
				resolve(event.exitCode);
			}
		});
	});

	if (exitCode === 0) {
		await vscode.commands.executeCommand('workbench.action.reloadWindow');
		return;
	}

	void vscode.window.showErrorMessage('VSIX installation failed. The window was not reloaded.');
}
