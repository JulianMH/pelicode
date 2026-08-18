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
	readonly name: string;
	readonly apiTool: ApiTool;
	execute(path: string, content?: string, patch?: string, destination?: string): Promise<string>;
}
