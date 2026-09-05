import * as vscode from 'vscode';
import type { Command } from './command';
import { formatError, getRequiredWorkspaceTarget } from './workspace';

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
						description: 'Workspace-relative file or folder path to remove.',
					},
				},
				required: ['path'],
				additionalProperties: false,
			},
		},
	},

	async execute({ path }) {
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
	},
};
