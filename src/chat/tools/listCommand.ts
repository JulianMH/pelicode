import * as vscode from 'vscode';
import type { Command } from './command';
import { formatError, getWorkspaceTarget } from './workspace';

export const listCommand: Command = {
	apiTool: {
		type: 'function',
		function: {
			name: 'ls',
			description:
				'List files and directories at a workspace path. If no path is provided, list the workspace root.',
			parameters: {
				type: 'object',
				properties: {
					path: {
						type: 'string',
						description:
							'Optional workspace-relative directory path. Defaults to the workspace root.',
					},
				},
				required: [],
				additionalProperties: false,
			},
		},
	},

	async execute({ path }) {
		const target = getWorkspaceTarget(path);
		if (typeof target === 'string') return target;
		try {
			const entries = await vscode.workspace.fs.readDirectory(target);
			return entries
				.map(([name, type]) => `${type === vscode.FileType.Directory ? 'dir' : 'file'} ${name}`)
				.join('\n');
		} catch (error) {
			return formatError(error);
		}
	},
};
