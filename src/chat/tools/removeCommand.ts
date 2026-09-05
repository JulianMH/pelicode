import * as vscode from 'vscode';
import type { Command } from './command';
import { formatError, getRequiredWorkspaceTarget, isProtectedWorkspacePath } from './workspace';

export const removeCommand: Command = {
	apiTool: {
		type: 'function',
		function: {
			name: 'rm',
			description:
				'Remove a file or folder from the workspace. The workspace root, .pelicode, and .git folders cannot be removed.',
			parameters: {
				type: 'object',
				properties: {
					path: {
						type: 'string',
						description:
							'Workspace-relative file or folder path to remove. In a multi-root workspace, prefix it with the workspace folder name.',
					},
				},
				required: ['path'],
				additionalProperties: false,
			},
		},
	},

	async execute({ path }) {
		const target = await getRequiredWorkspaceTarget(path);
		if (typeof target === 'string') return target;
		if (isProtectedWorkspacePath(target)) {
			return 'Error: The workspace root, .pelicode, and .git folders cannot be removed.';
		}
		try {
			await vscode.workspace.fs.delete(target, { recursive: true, useTrash: false });
			return `Removed ${path}.`;
		} catch (error) {
			return formatError(error);
		}
	},
};
