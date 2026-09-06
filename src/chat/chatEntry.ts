export type ChatToolCall = {
	id: string;
	name: string;
	arguments: string;
};

export type OpenRouterToolCall = {
	id: string;
	type: 'function';
	function: { name: string; arguments: string };
};

export type OpenRouterMessage =
	| { role: 'system' | 'user'; content: string }
	| {
			role: 'assistant';
			content: string | null;
			reasoning_details?: unknown[];
			tool_calls?: OpenRouterToolCall[];
	  }
	| { role: 'tool'; content: string; tool_call_id: string };

export type ChatEntry = {
	type: 'compaction' | 'assistantMessage' | 'reasoning' | 'modelSwitch' | 'tool' | 'userMessage';
	text: string;
	rawOpenRouterPayload?: OpenRouterMessage;
};
