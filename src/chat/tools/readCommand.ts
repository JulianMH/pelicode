import * as vscode from 'vscode';
import { open } from 'node:fs/promises';
import type { Command } from './command';
import { TOOL_PAGE_BYTES, type ToolResult } from './pagination';
import { formatError, getRequiredWorkspaceTarget } from './workspace';

export const readCommand: Command = {
	apiTool: {
		type: 'function',
		function: {
			name: 'read',
			description:
				'Read a UTF-8 workspace file in fixed 8 KB pages. Use nextPage when more output is available.',
			parameters: {
				type: 'object',
				properties: {
					path: {
						type: 'string',
						description:
							'Workspace-relative file path. Prefix with the workspace folder name in multi-root workspaces.',
					},
				},
				required: ['path'],
				additionalProperties: false,
			},
		},
	},
	async execute({ path }) {
		return readPage(path);
	},
};

async function readPage(path: string, offset = 0, version?: string): Promise<ToolResult> {
	const target = await getRequiredWorkspaceTarget(path);
	if (typeof target === 'string') return target;
	try {
		if (target.scheme !== 'file') {
			if ((await vscode.workspace.fs.stat(target)).size > TOOL_PAGE_BYTES)
				return 'Error: This filesystem does not support partial reads. Open the file in a local workspace to read files larger than 8 KB.';
			return new TextDecoder('utf-8', { fatal: true }).decode(
				await vscode.workspace.fs.readFile(target),
			);
		}
		const file = await open(target.fsPath, 'r');
		try {
			const stat = await file.stat();
			if (!stat.isFile()) return 'Error: path is not a regular file.';
			const currentVersion = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
			if (version && version !== currentVersion)
				return 'Error: File changed since the previous page. Read the file again.';
			const buffer = Buffer.alloc(TOOL_PAGE_BYTES - 128);
			const { bytesRead } = await file.read(buffer, 0, buffer.length, offset);
			const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
				buffer.subarray(0, bytesRead),
				{ stream: offset + bytesRead < stat.size },
			);
			if (text.includes('\0')) return 'Error: binary files are not supported.';
			const nextOffset = offset + Buffer.byteLength(text, 'utf8');
			return {
				text,
				next: nextOffset < stat.size ? () => readPage(path, nextOffset, currentVersion) : undefined,
			};
		} finally {
			await file.close();
		}
	} catch (error) {
		return formatError(error);
	}
}
