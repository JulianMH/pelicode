import * as vscode from 'vscode';
import { Command } from './command';
import { formatError, getRequiredWorkspaceTarget } from './workspace';

/** Moves a file or folder to another location in the workspace. */
export class MoveCommand implements Command {
	public readonly name = 'mv';
	public readonly apiTool = {
		type: 'function' as const,
		function: {
			name: this.name,
			description: 'Move a workspace file or folder to another workspace path.',
			parameters: {
				type: 'object' as const,
				properties: {
					path: { type: 'string', description: 'Workspace-relative source file or folder path.' },
					destination: { type: 'string', description: 'Workspace-relative destination file or folder path.' },
				},
				required: ['path', 'destination'],
				additionalProperties: false as const,
			},
		},
	};

	public async execute(path: string, _content?: string, destination?: string): Promise<string> {
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
	}
}
