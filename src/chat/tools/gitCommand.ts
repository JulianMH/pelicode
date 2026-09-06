import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Command } from './command';
import { formatError, getWorkspaceRoot } from './workspace';

const execFileAsync = promisify(execFile);
const readOnlyCommands = new Set([
	'git status',
	'git status --short',
	'git status --short --branch',
	'git diff',
	'git diff --staged',
	'git log',
	'git log --oneline',
	'git log --oneline --decorate',
	'git branch',
	'git branch --all',
	'git branch --all --no-color',
	'git show HEAD',
	'git show --stat --oneline HEAD',
	'git remote -v',
	'git ls-files',
]);

export const gitCommand: Command = {
	apiTool: {
		type: 'function',
		function: {
			name: 'git',
			description:
				'Run exactly one read-only Git command. Use one of: "git status", "git status --short", "git status --short --branch", "git diff", "git diff --staged", "git log", "git log --oneline", "git log --oneline --decorate", "git log --oneline --decorate --max-count=N" (N is 1-100), "git branch", "git branch --all", "git branch --all --no-color", "git show HEAD", "git show --stat --oneline HEAD", "git remote -v", or "git ls-files". Do not append other flags or shell operators such as &&, ;, or |. In a multi-root workspace, insert "-C <workspace-folder>" after git.',
			parameters: {
				type: 'object',
				properties: {
					command: {
						type: 'string',
						description:
							'Complete read-only Git command, for example "git log --oneline --decorate --max-count=20".',
					},
				},
				required: ['command'],
				additionalProperties: false,
			},
		},
	},

	async execute({ command }) {
		const parsed = parseGitCommand(command);
		if (typeof parsed === 'string') return parsed;
		const root = getWorkspaceRoot(parsed.workspace);
		if (typeof root === 'string') return root;
		if (root.uri.scheme !== 'file') {
			return 'Error: Git commands are only supported for local workspace folders.';
		}
		try {
			const { stdout, stderr } = await execFileAsync('git', parsed.args, {
				cwd: root.uri.fsPath,
				maxBuffer: 1_000_000,
				windowsHide: true,
			});
			return stdout || stderr;
		} catch (error) {
			return formatError(error);
		}
	},
};

function parseGitCommand(
	command: string | undefined,
): { args: string[]; workspace: string } | string {
	const parts = command?.trim().split(/\s+/) ?? [];
	if (parts[0] !== 'git') return 'Error: command must start with "git".';

	let workspace = '';
	let start = 1;
	if (parts[start] === '-C') {
		workspace = parts[start + 1] ?? '';
		if (!workspace) return 'Error: git -C requires a workspace folder name.';
		start += 2;
	}

	const args = parts.slice(start);
	const normalized = `git ${args.join(' ')}`;
	if (readOnlyCommands.has(normalized)) return { args, workspace };
	const logMatch = /^git log --oneline --decorate --max-count=(\d+)$/.exec(normalized);
	if (logMatch && Number(logMatch[1]) >= 1 && Number(logMatch[1]) <= 100) {
		return { args, workspace };
	}
	return 'Error: unsupported Git command. Use exactly one documented read-only command; extra flags and shell operators such as &&, ;, and | are not allowed.';
}
