import * as vscode from 'vscode';
import type { Command } from './command';
import { formatError, getTrustedWorkspaceFolders, getWorkspaceTarget } from './workspace';

export const listCommand: Command = {
	apiTool: {
		type: 'function',
		function: {
			name: 'ls',
			description:
				'List files and directories at a workspace path. In a multi-root workspace, start paths with the workspace folder name. If no path is provided, list the workspace folders.',
			parameters: {
				type: 'object',
				properties: {
					path: {
						type: 'string',
						description:
							'Optional workspace-relative directory path. In a multi-root workspace, prefix it with the workspace folder name.',
					},
				},
				required: [],
				additionalProperties: false,
			},
		},
	},

	async execute({ path }) {
		if (!path.trim()) {
			const workspaces = getTrustedWorkspaceFolders();
			if (typeof workspaces === 'string') return workspaces;
			if (workspaces.length > 1)
				return workspaces.map((workspace) => `dir ${workspace.name}`).join('\n');
		}
		const target = await getWorkspaceTarget(path);
		if (typeof target === 'string') return target;
		try {
			const entries = await vscode.workspace.fs.readDirectory(target);
			entries.sort(([a], [b]) => a.localeCompare(b));
			return entries
				.map(([name, type]) => `${type === vscode.FileType.Directory ? 'dir' : 'file'} ${name}`)
				.join('\n');
		} catch (error) {
			return formatError(error);
		}
	},
};
