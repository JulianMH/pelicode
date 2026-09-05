import * as vscode from 'vscode';

export async function getWorkspaceTarget(path: string): Promise<vscode.Uri | string> {
	if (!vscode.workspace.isTrusted) {
		return 'Error: PeliCode file access requires a trusted workspace.';
	}
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

	const target = vscode.Uri.joinPath(workspace.uri, normalizedPath);
	if (vscode.workspace.getWorkspaceFolder(target)?.uri.toString() !== workspace.uri.toString()) {
		return 'Error: The requested path is outside the workspace.';
	}
	if (await containsSymbolicLink(workspace.uri, normalizedPath)) {
		return 'Error: The requested path contains a symbolic link and is not allowed.';
	}
	return target;
}

export async function getRequiredWorkspaceTarget(path: string): Promise<vscode.Uri | string> {
	if (!path.trim()) return 'Error: a non-empty path is required.';
	return getWorkspaceTarget(path);
}

async function containsSymbolicLink(root: vscode.Uri, relativePath: string): Promise<boolean> {
	let current = root;
	for (const segment of relativePath.split('/').filter(Boolean)) {
		current = vscode.Uri.joinPath(current, segment);
		try {
			const stat = await vscode.workspace.fs.stat(current);
			if ((stat.type & vscode.FileType.SymbolicLink) !== 0) return true;
		} catch {
			// A missing path cannot contain a symlink beyond this point. The file
			// operation will report a more useful error if it cannot create it.
			break;
		}
	}
	return false;
}

export function formatError(error: unknown): string {
	return `Error: ${error instanceof Error ? error.message : 'Unknown file system error.'}`;
}
