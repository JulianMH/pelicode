export type ApiTool = {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: {
			type: 'object';
			properties: Record<string, unknown>;
			required: string[];
			additionalProperties: false;
		};
	};
};

export interface Command {
	readonly apiTool: ApiTool;
	execute(args: ToolArguments): Promise<string>;
}

export type ToolArguments = {
	path: string;
	content?: string;
	patch?: string;
	destination?: string;
};
