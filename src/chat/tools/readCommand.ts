import * as vscode from 'vscode';
import { MAX_DISPLAY_BYTES } from '../constants';
import type { Command } from './command';
import { formatError, getRequiredWorkspaceTarget } from './workspace';

export const readCommand: Command = {
	apiTool: {
		type: 'function',
		function: {
			name: 'read',
			description: 'Read the contents of a file in the workspace.',
			parameters: {
				type: 'object',
				properties: {
					path: {
						type: 'string',
						description:
							'Workspace-relative file path. In a multi-root workspace, prefix it with the workspace folder name.',
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
		try {
			const bytes = await vscode.workspace.fs.readFile(target);
			const content = new TextDecoder().decode(bytes.slice(0, MAX_DISPLAY_BYTES));
			return bytes.length > MAX_DISPLAY_BYTES
				? `${content}\n[Output truncated at ${MAX_DISPLAY_BYTES} bytes.]`
				: content;
		} catch (error) {
			return formatError(error);
		}
	},
};
