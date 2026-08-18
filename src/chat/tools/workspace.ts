import * as vscode from 'vscode';

export function getWorkspaceTarget(path: string): vscode.Uri | string {
	const workspace = vscode.workspace.workspaceFolders?.[0];
	if (!workspace) {
		return 'Error: No workspace folder is open.';
	}

	const normalizedPath = path.replace(/\\/g, '/');
	if (
		normalizedPath.startsWith('/') ||
		/^[A-Za-z]:\//.test(normalizedPath) ||
		normalizedPath.split('/').includes('..')
	) {
		return 'Error: The requested path is outside the workspace.';
	}
	return vscode.Uri.joinPath(workspace.uri, normalizedPath);
}

export function getRequiredWorkspaceTarget(path: string): vscode.Uri | string {
	if (!path.trim()) return 'Error: a non-empty path is required.';
	return getWorkspaceTarget(path);
}

export function formatError(error: unknown): string {
	return `Error: ${error instanceof Error ? error.message : 'Unknown file system error.'}`;
}
