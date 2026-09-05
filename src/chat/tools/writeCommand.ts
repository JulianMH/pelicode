import * as vscode from 'vscode';
import { MAX_DISPLAY_BYTES } from '../constants';
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
					path: { type: 'string', description: 'Workspace-relative file path.' },
					content: { type: 'string', description: 'Complete file contents.' },
				},
				required: ['path', 'content'],
				additionalProperties: false,
			},
		},
	},

	async execute({ path, content }) {
		if (content === undefined) return 'Error: write requires a string content argument.';
		const target = getRequiredWorkspaceTarget(path);
		if (typeof target === 'string') return target;
		try {
			const bytes = new TextEncoder().encode(content);
			await vscode.workspace.fs.writeFile(target, bytes);
			if (bytes.length > MAX_DISPLAY_BYTES) {
				const displayContent = new TextDecoder().decode(bytes.slice(0, MAX_DISPLAY_BYTES));
				return `${displayContent}\n[Written content truncated at ${MAX_DISPLAY_BYTES} bytes for display.]`;
			}
			return content;
		} catch (error) {
			return formatError(error);
		}
	},
};
