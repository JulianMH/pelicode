import * as vscode from 'vscode';
import { Command } from './command';
import { formatError, getWorkspaceTarget } from './workspace';

export class ListCommand implements Command {
	public readonly name = 'ls';
	public readonly apiTool = {
		type: 'function' as const,
		function: {
			name: this.name,
			description:
				'List files and directories at a workspace path. If no path is provided, list the workspace root.',
			parameters: {
				type: 'object' as const,
				properties: {
					path: {
						type: 'string',
						description: 'Optional workspace-relative directory path. Defaults to the workspace root.',
					},
				},
				required: [],
				additionalProperties: false as const,
			},
		},
	};

	public async execute(path: string): Promise<string> {
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
	}
}
