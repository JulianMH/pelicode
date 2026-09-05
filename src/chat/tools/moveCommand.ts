import * as vscode from 'vscode';
import type { Command } from './command';
import { formatError, getRequiredWorkspaceTarget } from './workspace';

export const moveCommand: Command = {
	apiTool: {
		type: 'function',
		function: {
			name: 'mv',
			description: 'Move a workspace file or folder to another workspace path.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Workspace-relative source file or folder path.' },
					destination: {
						type: 'string',
						description: 'Workspace-relative destination file or folder path.',
					},
				},
				required: ['path', 'destination'],
				additionalProperties: false,
			},
		},
	},

	async execute({ path, destination }) {
		if (destination === undefined) return 'Error: mv requires a string destination argument.';
		const source = getRequiredWorkspaceTarget(path);
		if (typeof source === 'string') return source;
		const target = getRequiredWorkspaceTarget(destination);
		if (typeof target === 'string') return target;
		try {
			await vscode.workspace.fs.rename(source, target, { overwrite: false });
			return `Moved ${path} to ${destination}.`;
		} catch (error) {
			return formatError(error);
		}
	},
};
