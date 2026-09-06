import * as vscode from 'vscode';
import type { Command } from './command';
import { formatError, getRequiredWorkspaceTarget } from './workspace';

export const writeCommand: Command = {
	apiTool: {
		type: 'function',
		function: {
			name: 'write',
			description: 'Create or replace a workspace file with complete text content.',
			parameters: {
				type: 'object',
				properties: {
					path: {
						type: 'string',
						description:
							'Workspace-relative file path. In a multi-root workspace, prefix it with the workspace folder name.',
					},
					content: { type: 'string', description: 'Complete file contents.' },
				},
				required: ['path', 'content'],
				additionalProperties: false,
			},
		},
	},

	async execute({ path, content }) {
		if (content === undefined) return 'Error: write requires a string content argument.';
		const target = await getRequiredWorkspaceTarget(path);
		if (typeof target === 'string') return target;
		try {
			const bytes = new TextEncoder().encode(content);
			await vscode.workspace.fs.writeFile(target, bytes);
			return `Wrote ${bytes.length} bytes to ${path}.`;
		} catch (error) {
			return formatError(error);
		}
	},
};
