import * as vscode from 'vscode';
import { Command } from './command';
import { formatError, getRequiredWorkspaceTarget } from './workspace';

/** Removes a file or folder from the workspace, except protected workspace folders. */
export class RemoveCommand implements Command {
	public readonly name = 'rm';
	public readonly apiTool = {
		type: 'function' as const,
		function: {
			name: this.name,
			description:
				'Remove a file or folder from the workspace. The workspace root, .pelicode, and .git folders cannot be removed.',
			parameters: {
				type: 'object' as const,
				properties: {
					path: { type: 'string', description: 'Workspace-relative file or folder path to remove.' },
				},
				required: ['path'],
				additionalProperties: false as const,
			},
		},
	};

	public async execute(path: string): Promise<string> {
		const target = getRequiredWorkspaceTarget(path);
		if (typeof target === 'string') return target;
		const normalizedPath = path
			.replace(/\\/g, '/')
			.split('/')
			.filter((part) => part && part !== '.')
			.join('/');
		if (!normalizedPath || normalizedPath === '.pelicode' || normalizedPath === '.git') {
			return 'Error: The workspace root, .pelicode, and .git folders cannot be removed.';
		}
		try {
			await vscode.workspace.fs.delete(target, { recursive: true, useTrash: false });
			return `Removed ${path}.`;
		} catch (error) {
			return formatError(error);
		}
	}
}
