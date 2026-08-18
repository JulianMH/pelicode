export type OpenRouterModel =
	| 'openai/gpt-5.6-luna'
	| 'openai/gpt-5.6-terra'
	| 'openai/gpt-5.6-sol'
	| 'anthropic/claude-sonnet-5'
	| 'anthropic/claude-haiku-4.5'
	| 'anthropic/claude-opus-5'
	| 'anthropic/claude-fable-5'
	| 'deepseek/deepseek-v4-flash-0731'
	| 'nvidia/nemotron-3-ultra-550b-a55b:free'
	| 'qwen/qwen3.8-27b';

export const defaultModel: OpenRouterModel = 'openai/gpt-5.6-luna';

export type Provider = 'openai' | 'anthropic' | 'deepseek' | 'nvidia' | 'qwen';

export type ModelGroup = {
	label: string;
	provider: Provider;
	models: Array<{ label: string; value: OpenRouterModel }>;
};

export const modelGroups: ModelGroup[] = [
	{
		label: 'OpenAI',
		provider: 'openai',
		models: [
			{ label: 'GPT-5.6 Luna', value: 'openai/gpt-5.6-luna' },
			{ label: 'GPT-5.6 Terra', value: 'openai/gpt-5.6-terra' },
			{ label: 'GPT-5.6 Sol', value: 'openai/gpt-5.6-sol' },
		],
	},
	{
		label: 'Anthropic',
		provider: 'anthropic',
		models: [
			{ label: 'Claude Opus 5', value: 'anthropic/claude-opus-5' },
			{ label: 'Claude Sonnet 5', value: 'anthropic/claude-sonnet-5' },
			{ label: 'Claude Haiku 4.5', value: 'anthropic/claude-haiku-4.5' },
			{ label: 'Claude Fable 5', value: 'anthropic/claude-fable-5' },
		],
	},
	{
		label: 'DeepSeek',
		provider: 'deepseek',
		models: [{ label: 'DeepSeek V4 Flash 0731', value: 'deepseek/deepseek-v4-flash-0731' }],
	},
	{
		label: 'NVIDIA',
		provider: 'nvidia',
		models: [
			{
				label: 'Nemotron 3 Ultra 550B A55B (free)',
				value: 'nvidia/nemotron-3-ultra-550b-a55b:free',
			},
		],
	},
	{
		label: 'Qwen',
		provider: 'qwen',
		models: [{ label: 'Qwen3.8 27B', value: 'qwen/qwen3.8-27b' }],
	},
];

export function modelInfo(value: unknown): { label: string; provider: Provider } | undefined {
	for (const group of modelGroups) {
		const model = group.models.find((candidate) => candidate.value === value);
		if (model) return { label: model.label, provider: group.provider };
	}
	return undefined;
}

export function isOpenRouterModel(value: unknown): value is OpenRouterModel {
	return modelInfo(value) !== undefined;
}

export function providerOf(value: OpenRouterModel): Provider {
	return modelInfo(value)!.provider;
}
