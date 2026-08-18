import { Command } from './command';
import { ListCommand } from './listCommand';
import { PatchCommand } from './patchCommand';
import { ReadCommand } from './readCommand';
import { WriteCommand } from './writeCommand';
import { MoveCommand } from './moveCommand';
import { RemoveCommand } from './removeCommand';

export type { ApiTool, Command } from './command';

export const commands: Command[] = [
	new ReadCommand(),
	new ListCommand(),
	new WriteCommand(),
	new PatchCommand(),
	new RemoveCommand(),
	new MoveCommand(),
];
