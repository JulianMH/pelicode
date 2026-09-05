import * as vscode from 'vscode';
import type { Command } from './command';
import { formatError, getRequiredWorkspaceTarget } from './workspace';

type HunkLine = { marker: ' ' | '+' | '-'; value: string; noNewline: boolean };
type Hunk = { oldStart?: number; oldCount?: number; newCount?: number; lines: HunkLine[] };
type OutputLine = { value: string; terminated: boolean };

export const patchCommand: Command = {
	apiTool: {
		type: 'function',
		function: {
			name: 'patch',
			description:
				'Apply a unified diff to part of an existing workspace file. Use @@ hunk headers; line numbers and line counts are optional. Each hunk must match exactly one location.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Workspace-relative file path.' },
					patch: {
						type: 'string',
						description: 'Unified diff containing the partial file update.',
					},
				},
				required: ['path', 'patch'],
				additionalProperties: false,
			},
		},
	},

	async execute({ path, patch }) {
		if (patch === undefined) return 'Error: patch requires a string patch argument.';
		const target = await getRequiredWorkspaceTarget(path);
		if (typeof target === 'string') return formatPatchError(target, patch);
		try {
			const original = new TextDecoder().decode(await vscode.workspace.fs.readFile(target));
			const updated = applyUnifiedPatch(original, patch);
			await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(updated));
			return `Patch applied:\n\n${patch}\n\nUpdated file:\n\n${updated}`;
		} catch (error) {
			const message = error instanceof PatchError ? `Error: ${error.message}` : formatError(error);
			return formatPatchError(message, patch);
		}
	},
};

class PatchError extends Error {}
function formatPatchError(message: string, patch: string): string {
	return `${message}\n\nAI patch:\n\n${patch}`;
}

function applyUnifiedPatch(content: string, patch: string): string {
	const eol = content.includes('\r\n') ? '\r\n' : '\n';
	const normalized = content.replace(/\r\n/g, '\n');
	const originalHasNewline = normalized.endsWith('\n');
	const body = originalHasNewline ? normalized.slice(0, -1) : normalized;
	const sourceLines = body === '' ? (normalized === '' ? [] : ['']) : body.split('\n');
	let source: OutputLine[] = sourceLines.map((value, index) => ({
		value,
		terminated: index < sourceLines.length - 1 || originalHasNewline,
	}));
	const hunks = parseHunks(patch);
	if (!hunks.length) throw new PatchError('patch contains no hunks.');

	for (const hunk of hunks) {
		const oldLines = hunk.lines.filter((line) => line.marker === ' ' || line.marker === '-');
		const newLines = hunk.lines.filter((line) => line.marker === ' ' || line.marker === '+');
		if (hunk.oldCount !== undefined && hunk.oldCount !== oldLines.length)
			throw new PatchError('hunk old-line count does not match its contents.');
		if (hunk.newCount !== undefined && hunk.newCount !== newLines.length)
			throw new PatchError('hunk new-line count does not match its contents.');

		const candidates = findMatches(source, oldLines);
		let start: number;
		if (oldLines.length === 0) {
			if (hunk.oldStart === undefined)
				throw new PatchError(
					'insertion hunk has no context or line number and cannot be located safely.',
				);
			start = hunk.oldStart === 0 ? 0 : hunk.oldStart - 1;
			if (start < 0 || start > source.length)
				throw new PatchError(`insertion point ${hunk.oldStart} is outside the file.`);
		} else if (candidates.length === 0) {
			throw new PatchError('hunk does not match the file; add more exact context.');
		} else if (candidates.length > 1) {
			throw new PatchError(
				`hunk is ambiguous; its context matches ${candidates.length} locations.`,
			);
		} else {
			start = candidates[0];
		}

		const replacement: OutputLine[] = [];
		let oldIndex = start;
		for (const line of hunk.lines) {
			if (line.marker === '-') {
				validateNoNewline(source[oldIndex], line, oldIndex);
				oldIndex++;
			} else if (line.marker === ' ') {
				const originalLine = source[oldIndex];
				if (!originalLine || originalLine.value !== line.value)
					throw new PatchError(`hunk does not match the file at line ${oldIndex + 1}.`);
				validateNoNewline(originalLine, line, oldIndex);
				replacement.push({
					value: line.value,
					terminated: line.noNewline ? false : originalLine.terminated,
				});
				oldIndex++;
			} else {
				replacement.push({ value: line.value, terminated: !line.noNewline });
			}
		}
		source = [...source.slice(0, start), ...replacement, ...source.slice(start + oldLines.length)];
	}
	return source.map((line) => line.value + (line.terminated ? eol : '')).join('');
}

function findMatches(source: OutputLine[], oldLines: HunkLine[]): number[] {
	const matches: number[] = [];
	for (let start = 0; start <= source.length - oldLines.length; start++) {
		if (oldLines.every((line, offset) => source[start + offset]?.value === line.value))
			matches.push(start);
	}
	return matches;
}

function validateNoNewline(
	sourceLine: OutputLine | undefined,
	patchLine: HunkLine,
	index: number,
): void {
	if (!sourceLine) throw new PatchError(`hunk does not match the file at line ${index + 1}.`);
	if (patchLine.noNewline && sourceLine.terminated)
		throw new PatchError(`expected no newline at the end of line ${index + 1}.`);
}

function isHunkHeader(line: string): boolean {
	return /^@@(?: -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@.*)?$/.test(line);
}

function parseHunks(patch: string): Hunk[] {
	const lines = patch.replace(/\r\n/g, '\n').split('\n');
	let end = lines.length;
	while (end > 0 && lines[end - 1] === '') end--;
	const endPatchMarker = ['*** End', 'Patch'].join(' ');
	if (lines[end - 1] === endPatchMarker) lines.splice(end - 1, 1);
	const hunks: Hunk[] = [];
	for (let index = 0; index < lines.length; index++) {
		if (!isHunkHeader(lines[index])) continue;
		const header = /^@@(?: -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@.*)?$/.exec(lines[index]);
		if (!header) continue;
		const hunkLines: HunkLine[] = [];
		index++;
		for (; index < lines.length && !isHunkHeader(lines[index]); index++) {
			const line = lines[index];
			if (line === '' && index === lines.length - 1) continue;
			if (line === '\\ No newline at end of file') {
				if (!hunkLines.length || hunkLines[hunkLines.length - 1].noNewline)
					throw new PatchError('no-newline marker does not follow a hunk line.');
				hunkLines[hunkLines.length - 1].noNewline = true;
				continue;
			}
			const marker = line[0];
			if (marker !== ' ' && marker !== '+' && marker !== '-')
				throw new PatchError('patch contains text outside a hunk.');
			hunkLines.push({ marker, value: line.slice(1), noNewline: false });
		}
		index--;
		hunks.push({
			oldStart: header[1] ? Number(header[1]) : undefined,
			oldCount: header[1] ? Number(header[2] ?? '1') : undefined,
			newCount: header[3] ? Number(header[4] ?? '1') : undefined,
			lines: hunkLines,
		});
	}
	return hunks;
}
