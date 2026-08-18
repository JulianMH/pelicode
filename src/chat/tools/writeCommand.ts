import * as vscode from 'vscode';
import { MAX_DISPLAY_BYTES } from '../constants';
import { Command } from './command';
import { formatError, getRequiredWorkspaceTarget } from './workspace';

export class WriteCommand implements Command {
	public readonly name = 'write';
	public readonly apiTool = {
		type: 'function' as const,
		function: {
			name: this.name,
			description: 'Create or replace a workspace file with complete text content.',
			parameters: {
				type: 'object' as const,
				properties: {
					path: { type: 'string', description: 'Workspace-relative file path.' },
					content: { type: 'string', description: 'Complete file contents.' },
				},
				required: ['path', 'content'],
				additionalProperties: false as const,
			},
		},
	};

	public async execute(path: string, content?: string): Promise<string> {
		if (content === undefined) return 'Error: write requires a string content argument.';
		const target = getRequiredWorkspaceTarget(path);
		if (typeof target === 'string') return target;
		try {
			const bytes = new TextEncoder().encode(content);
			await vscode.workspace.fs.writeFile(target, bytes);
			// Return the written contents so the tool block in the chat view shows what was written.
			if (bytes.length > MAX_DISPLAY_BYTES) {
				const displayContent = new TextDecoder().decode(bytes.slice(0, MAX_DISPLAY_BYTES));
				return `${displayContent}\n[Written content truncated at ${MAX_DISPLAY_BYTES} bytes for display.]`;
			}
			return content;
		} catch (error) {
			return formatError(error);
		}
	}
}
