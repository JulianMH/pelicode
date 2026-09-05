import * as vscode from 'vscode';

export async function getWorkspaceTarget(path: string): Promise<vscode.Uri | string> {
	const workspaces = getTrustedWorkspaceFolders();
	if (typeof workspaces === 'string') return workspaces;

	const normalizedPath = path.replace(/\\/g, '/');
	if (
		normalizedPath.startsWith('/') ||
		/^[A-Za-z]:\//.test(normalizedPath) ||
		normalizedPath.split('/').includes('..')
	) {
		return 'Error: The requested path is outside the workspace.';
	}

	const parts = normalizedPath.split('/').filter((part) => part && part !== '.');
	const workspace = selectWorkspace(workspaces, parts);
	if (typeof workspace === 'string') return workspace;
	const relativePath = workspaces.length === 1 ? parts.join('/') : parts.slice(1).join('/');
	const target = vscode.Uri.joinPath(workspace.uri, relativePath);
	if (vscode.workspace.getWorkspaceFolder(target)?.uri.toString() !== workspace.uri.toString()) {
		return 'Error: The requested path is outside the workspace.';
	}
	if (await containsSymbolicLink(workspace.uri, relativePath)) {
		return 'Error: The requested path contains a symbolic link and is not allowed.';
	}
	return target;
}

export async function getRequiredWorkspaceTarget(path: string): Promise<vscode.Uri | string> {
	if (!path.trim()) return 'Error: a non-empty path is required.';
	return getWorkspaceTarget(path);
}

export function getTrustedWorkspaceFolders(): vscode.WorkspaceFolder[] | string {
	if (!vscode.workspace.isTrusted) {
		return 'Error: PeliCode file access requires a trusted workspace.';
	}
	const workspaces = vscode.workspace.workspaceFolders;
	if (!workspaces?.length) return 'Error: No workspace folder is open.';
	return [...workspaces];
}

export function isProtectedWorkspacePath(target: vscode.Uri): boolean {
	const workspaces = vscode.workspace.workspaceFolders ?? [];
	return workspaces.some((workspace) =>
		[
			workspace.uri,
			vscode.Uri.joinPath(workspace.uri, '.pelicode'),
			vscode.Uri.joinPath(workspace.uri, '.git'),
		].some((uri) => uri.toString() === target.toString()),
	);
}

function selectWorkspace(
	workspaces: vscode.WorkspaceFolder[],
	parts: string[],
): vscode.WorkspaceFolder | string {
	if (workspaces.length === 1) return workspaces[0];
	const name = parts[0];
	if (!name) {
		return `Error: Specify a workspace folder: ${workspaces.map((workspace) => workspace.name).join(', ')}.`;
	}
	const matches = workspaces.filter((workspace) => workspace.name === name);
	if (!matches.length) {
		return `Error: Unknown workspace folder "${name}". Choose: ${workspaces.map((workspace) => workspace.name).join(', ')}.`;
	}
	if (matches.length > 1) {
		return `Error: Workspace folder name "${name}" is ambiguous.`;
	}
	return matches[0];
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
