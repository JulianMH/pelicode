import * as vscode from 'vscode';
import { MAX_DISPLAY_BYTES } from '../constants';
import { Command } from './command';
import { formatError, getRequiredWorkspaceTarget } from './workspace';

export class ReadCommand implements Command {
	public readonly name = 'read';
	public readonly apiTool = {
		type: 'function' as const,
		function: {
			name: this.name,
			description: 'Read the contents of a file in the workspace.',
			parameters: {
				type: 'object' as const,
				properties: { path: { type: 'string', description: 'Workspace-relative file path.' } },
				required: ['path'],
				additionalProperties: false as const,
			},
		},
	};

	public async execute(path: string): Promise<string> {
		const target = getRequiredWorkspaceTarget(path);
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
	}
}
