import type { ChatEntry, ChatToolCall } from '../chatEntry';
import type { Command, ToolArguments } from './command';
import { listCommand } from './listCommand';
import { patchCommand } from './patchCommand';
import { readCommand } from './readCommand';
import { writeCommand } from './writeCommand';
import { moveCommand } from './moveCommand';
import { removeCommand } from './removeCommand';
import { gitCommand } from './gitCommand';

export type { ApiTool, Command } from './command';

export const commands: Command[] = [
	readCommand,
	listCommand,
	writeCommand,
	patchCommand,
	removeCommand,
	moveCommand,
	gitCommand,
];

export async function executeToolCall(toolCall: ChatToolCall): Promise<ChatEntry> {
	let args: Record<string, unknown> | undefined;
	let result: string;
	try {
		const value: unknown = JSON.parse(toolCall.arguments);
		if (value && typeof value === 'object' && !Array.isArray(value))
			args = value as Record<string, unknown>;
		result = 'Error: tool arguments must be a JSON object.';
	} catch {
		result = 'Error: tool arguments were not valid JSON.';
	}
	if (args) {
		const command = commands.find((candidate) => candidate.apiTool.function.name === toolCall.name);
		const toolArguments: ToolArguments = {
			path: typeof args.path === 'string' ? args.path : '',
			content: typeof args.content === 'string' ? args.content : undefined,
			patch: typeof args.patch === 'string' ? args.patch : undefined,
			destination: typeof args.destination === 'string' ? args.destination : undefined,
			command: typeof args.command === 'string' ? args.command : undefined,
		};
		result = command
			? await command.execute(toolArguments)
			: `Error: unknown tool "${toolCall.name}".`;
		const invocation =
			toolCall.name === 'git' && toolArguments.command
				? toolArguments.command
				: `${toolCall.name}${typeof args.path === 'string' ? ` ${args.path}` : ''}`;
		return {
			type: 'tool',
			text: `@${invocation}\n${result}`,
			rawOpenRouterPayload: { role: 'tool', content: result, tool_call_id: toolCall.id },
		};
	}
	return {
		type: 'tool',
		text: `@${toolCall.name}\n${result}`,
		rawOpenRouterPayload: { role: 'tool', content: result, tool_call_id: toolCall.id },
	};
}
