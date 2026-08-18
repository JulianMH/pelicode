<script lang="ts">
	import DOMPurify from 'dompurify';
	import MarkdownIt from 'markdown-it';
	import { onMount, tick } from 'svelte';
	import { defaultModel, modelGroups, modelInfo, providerOf, type OpenRouterModel } from '../chat/models';
	import type { ChatEntry } from '../chat/chatEntry';
	import type { HostToWebviewMessage } from '../chat/protocol';
	import { SYSTEM_PROMPT } from '../chat/prompt';
	import { VscodeChatViewClient } from './vscodeChatViewClient';
	import PelicanIcon from './PelicanIcon.svelte';

	export let id: string = 'chat-view';
	export let active = false;
	export let vscodeApi: { postMessage(message: unknown): void };
	export let onThinking: (thinking: boolean) => void = () => {};
	export let onUnread: (unread: boolean) => void = () => {};

	const INITIAL_MESSAGES: ChatEntry[] = [];
	const markdown = new MarkdownIt({ breaks: true, linkify: true, typographer: true });
	const host = new VscodeChatViewClient(vscodeApi, id);

	let prompt = '';
	let model: OpenRouterModel = defaultModel;
	let isWaiting = false;
	let totalCost = 0;
	let messages: ChatEntry[] = [...INITIAL_MESSAGES];
	let modelMenuOpen = false;
	let copyOnWrite = false;
	let messagesElement: HTMLDivElement;

	async function scrollToBottom(): Promise<void> {
		await tick();
		if (messagesElement) messagesElement.scrollTop = messagesElement.scrollHeight;
	}
	onMount(() => {
		const unsubscribe = host.onMessage(handleMessage);
		void scrollToBottom();
		return unsubscribe;
	});

	function setThinking(thinking: boolean): void {
		if (isWaiting === thinking) return;
		isWaiting = thinking;
		onThinking(thinking);
	}

	$: if (active) host.viewOpened();
	$: if (!active) host.viewClosed();
	$: if (active) void scrollToBottom();

	function formatCost(cost: number): string { return `$${cost.toFixed(4)}`; }
	function modelLabel(value: string): string {
		return modelInfo(value)?.label ?? value;
	}
	function send(): void {
		const text = prompt.trim();
		if (!text) return;
		messages = [...messages, { type: 'userMessage', text }];
		setThinking(true);
		host.send(text, model);
		prompt = '';
		void scrollToBottom();
	}
	function cancel(): void {
		setThinking(false);
		host.cancel();
	}
	function selectModel(value: OpenRouterModel): void {
		model = value;
		modelMenuOpen = false;
	}
	function renderMarkdown(text: string): string {
		return DOMPurify.sanitize(markdown.render(text));
	}
	function handleWindowClick(event: MouseEvent): void {
		if (!modelMenuOpen) return;
		const target = event.target;
		if (target instanceof Element && target.closest('.model-picker')) return;
		modelMenuOpen = false;
	}
	function handlePromptKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			send();
		}
	}
	function handleMessage(data: HostToWebviewMessage): void {
		if (data.id !== id) return;
		switch (data.type) {
			case 'restore':
				if (data.messages.length) {
					// Assistant messages containing only tool calls are required in the
					// API history, but have no visible text. Do not render those as
					// empty bubbles after restoring a chat.
					messages = data.messages.filter((entry) =>
						entry.type !== 'assistantMessage' || entry.text.trim().length > 0,
					);
					void scrollToBottom();
				}
				if (data.model) model = data.model;
				break;
			case 'costUpdated':
				totalCost = data.cost;
				void scrollToBottom();
				break;
			case 'unreadUpdated':
				onUnread(data.unread);
				break;
			case 'requestStarted':
				setThinking(true);
				void scrollToBottom();
				break;
			case 'entry':
				handleEntry(data.entry, data.final);
				break;
			case 'requestFinished':
				setThinking(false);
				void scrollToBottom();
				break;
		}
	}
	function handleEntry(entry: ChatEntry, final?: boolean): void {
		if (entry.type === 'modelSwitch') {
			// The composer adds the user message optimistically. Keep the protocol
			// marker directly before it, matching the persisted conversation order.
			let userIndex = -1;
			for (let index = messages.length - 1; index >= 0; index -= 1) {
				if (messages[index]?.type === 'userMessage') {
					userIndex = index;
					break;
				}
			}
			messages = userIndex >= 0
				? [...messages.slice(0, userIndex), entry, ...messages.slice(userIndex)]
				: [...messages, entry];
		} else {
			messages = [...messages, entry];
		}
		void scrollToBottom();
		if (entry.type === 'assistantMessage') setThinking(final === false);
	}
	host.ready();
</script>

<svelte:window onclick={handleWindowClick} />

<div id={id} class="main">
	<div class:empty={messages.length === 0 && !isWaiting} class="messages" bind:this={messagesElement}>
		{#if messages.length > 0}
			<details class="reasoning system-prompt">
				<summary>System prompt</summary>
				<pre>{SYSTEM_PROMPT}</pre>
			</details>
		{/if}
		{#each messages as message}
			{#if message.type === 'modelSwitch'}
				<div class="model-switch">
					<span class="dot" data-provider={modelInfo(message.text)?.provider}></span>
					<span>{modelLabel(message.text)}</span>
				</div>
			{:else if message.type === 'reasoning'}
				<details class="reasoning">
					<summary>Reasoning</summary>
					<div class="reasoning-content">{@html renderMarkdown(message.text)}</div>
				</details>
			{:else if message.type === 'tool'}
				{@const parts = message.text.split('\n')}
				<details class="message command">
					<summary>{parts[0]}</summary>
					{#if parts.length > 1}<pre class="command-result">{parts.slice(1).join('\n')}</pre>{/if}
				</details>
			{:else}
				<div class:assistant={message.type === 'assistantMessage'} class:user={message.type === 'userMessage'} class="message">
					{@html renderMarkdown(message.text)}
				</div>
			{/if}
		{/each}
		{#if totalCost !== 0}
			<div class="protocol-cost" title="OpenRouter costs for this extension session">Money spent: {formatCost(totalCost)}</div>
		{/if}
		{#if isWaiting}
			<div class="typing" aria-label="Assistant is typing">
				<PelicanIcon />
				<button type="button" class="cancel-btn" onclick={cancel}>Cancel</button>
			</div>
		{/if}

		{#if !isWaiting}
			<div class="composer">
				<div class="composer-box">
					<div class="composer-controls">
						<div class="model-picker">
							{#if modelMenuOpen}
								<div class="model-menu" role="listbox">
									{#each modelGroups as group}
										<div class="model-menu-group">
											<span class="model-menu-label">{group.label}</span>
											{#each group.models as option}
												<button type="button" class="model-option" class:selected={option.value === model} onclick={() => selectModel(option.value)}>
													<span class="dot" data-provider={group.provider}></span>{option.label}
												</button>
											{/each}
										</div>
									{/each}
								</div>
							{/if}
							<button type="button" class="model-trigger" onclick={() => modelMenuOpen = !modelMenuOpen}>
								<span class="dot" data-provider={providerOf(model)}></span>
								<span>{modelLabel(model)}</span><span>▾</span>
							</button>
						</div>
						<button
							type="button"
							class="copy-on-write-btn"
							class:enabled={copyOnWrite}
							aria-pressed={copyOnWrite}
							title="Work with a copy on first write (not active yet)"
							aria-label="Work with a copy on first write"
							onclick={() => copyOnWrite = !copyOnWrite}
						>
							<svg viewBox="0 0 16 16" aria-hidden="true">
								<path d="M4 3v10M4 8h5a3 3 0 0 0 3-3V3M4 8h5a3 3 0 0 1 3 3v2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
								<circle cx="4" cy="3" r="1.5" fill="currentColor" />
								<circle cx="4" cy="13" r="1.5" fill="currentColor" />
								<circle cx="12" cy="3" r="1.5" fill="currentColor" />
								<circle cx="12" cy="13" r="1.5" fill="currentColor" />
							</svg>
						</button>
					</div>
					<form class="composer-form" onsubmit={(event) => { event.preventDefault(); send(); }}>
						<textarea bind:value={prompt} onkeydown={handlePromptKeydown} aria-label="Chat message" placeholder="Ask about your code" rows="2"></textarea>
						<button type="submit" class="send-btn" aria-label="Send message" disabled={!prompt.trim()}>➤</button>
					</form>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	div.main { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
	.protocol-cost {
		align-self: center; color: var(--vscode-descriptionForeground);
		font-family: var(--vscode-editor-font-family); font-size: 0.85em;
	}
	.messages { box-sizing: border-box; display: flex; flex: 1; flex-direction: column; gap: 10px; min-height: 0; overflow-y: auto; padding: 12px; }
	.messages.empty { justify-content: center; }
	.messages.empty .composer { align-self: center; max-width: 560px; }
	.message { border: 1px solid transparent; border-radius: 10px; box-sizing: border-box; line-height: 1.4; max-width: 100%; padding: 10px 12px; word-break: break-word; }
	.message :global(p) { margin: 0 0 8px; }
	.message :global(p:last-child) { margin-bottom: 0; }
	.message :global(h1), .message :global(h2), .message :global(h3) { margin: 12px 0 6px; }
	.message :global(h1) { font-size: 1.25em; }
	.message :global(h2) { font-size: 1.1em; }
	.message :global(h3) { font-size: 1em; }
	.message :global(ul), .message :global(ol) { margin: 0 0 8px; padding-left: 22px; }
	.message :global(pre) { background: var(--vscode-textCodeBlock-background); border-radius: 6px; margin: 8px 0; overflow-x: auto; padding: 8px; }
	.message :global(code) { font-family: var(--vscode-editor-font-family); }
	.message :global(:not(pre) > code) { background: var(--vscode-textCodeBlock-background); border-radius: 4px; padding: 1px 3px; }
	.message :global(table) { border-collapse: collapse; display: block; margin: 8px 0; overflow-x: auto; }
	.message :global(th), .message :global(td) { border: 1px solid var(--vscode-panel-border); padding: 4px 6px; text-align: left; }
	.message :global(a) { color: var(--vscode-textLink-foreground); }
	.assistant { align-self: flex-start; background: var(--vscode-textBlockQuote-background); border-color: var(--vscode-textBlockQuote-border); box-shadow: inset 3px 0 0 var(--vscode-textLink-foreground); }
	.model-switch {
		align-items: center; align-self: center;
		background: var(--vscode-badge-background, var(--vscode-button-secondaryBackground));
		border: 1px solid transparent; border-radius: 999px;
		color: var(--vscode-badge-foreground, var(--vscode-button-secondaryForeground));
		display: flex; font-size: 0.8em; gap: 6px; padding: 3px 10px 3px 8px;
	}
	.reasoning {
		align-self: flex-start; color: var(--vscode-descriptionForeground);
		font-family: inherit;
		margin: 0; padding: 10px 12px; width: 100%; box-sizing: border-box;
	}
	.reasoning summary { cursor: pointer; }
	.reasoning pre { font-family: inherit; margin: 8px 0 0; overflow-x: auto; white-space: pre-wrap; }
	.typing {
		align-items: center; align-self: center; display: flex; flex-direction: column;
		gap: 4px; padding: 4px 8px;
	}
	.typing :global(.pelican) { height: 42px; width: 42px; }
	.cancel-btn {
		background: transparent; border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
		border-radius: 6px; color: var(--vscode-foreground); cursor: pointer; font-size: 0.85em;
		padding: 3px 10px;
	}
	.cancel-btn:hover { background: var(--vscode-list-hoverBackground); }
	.command { background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 10px; color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
	.command summary { cursor: pointer; }
	.command-result { background: var(--vscode-editorWidget-background); border-left: 2px solid var(--vscode-textLink-foreground); border-radius: 4px; margin: 8px 0 0; overflow-x: auto; padding: 8px; white-space: pre; }
	.user { align-self: flex-end; background: var(--vscode-button-secondaryBackground); border-color: var(--vscode-button-border, transparent); }

	.composer { box-sizing: border-box; padding: 10px 0 0; width: 100%; }
	.composer-box {
		background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border);
		border-radius: 18px; display: flex; flex-direction: column; padding: 8px 10px;
		position: relative; transition: border-color 0.15s ease;
	}
	.composer-box:focus-within { border-color: var(--vscode-focusBorder); }
	.composer-controls { align-items: center; display: flex; gap: 6px; justify-content: flex-end; margin-bottom: 6px; }
	.model-picker { display: flex; position: relative; }
	.model-trigger {
		align-items: center; background: var(--vscode-badge-background, var(--vscode-button-secondaryBackground));
		border: 1px solid transparent; border-radius: 999px;
		color: var(--vscode-badge-foreground, var(--vscode-button-secondaryForeground));
		cursor: pointer; display: flex; font-size: 0.8em; gap: 6px; padding: 3px 10px 3px 8px;
	}
	.model-trigger:hover { background: var(--vscode-list-hoverBackground); }
	.model-trigger:disabled { cursor: default; opacity: 0.6; }
	.copy-on-write-btn {
		align-items: center; background: transparent; border: 1px solid transparent; border-radius: 999px;
		color: var(--vscode-descriptionForeground); cursor: pointer; display: flex; height: 25px;
		justify-content: center; padding: 4px; width: 25px;
	}
	.copy-on-write-btn:hover { background: var(--vscode-list-hoverBackground); color: var(--vscode-foreground); }
	.copy-on-write-btn.enabled {
		background: var(--vscode-button-secondaryBackground); border-color: var(--vscode-focusBorder);
		color: var(--vscode-textLink-foreground);
	}
	.copy-on-write-btn svg { height: 16px; width: 16px; }
	.model-menu {
		background: var(--vscode-dropdown-background, var(--vscode-editorWidget-background));
		border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border)); border-radius: 10px;
		bottom: calc(100% + 6px); max-height: 320px; overflow-y: auto; padding: 6px;
		position: absolute; right: 0; width: 220px; z-index: 10;
	}
	.model-menu-group + .model-menu-group { margin-top: 6px; }
	.model-menu-label { color: var(--vscode-descriptionForeground); display: block; font-size: 0.72em; font-weight: 600; letter-spacing: 0.04em; padding: 4px 8px 2px; text-transform: uppercase; }
	.model-option { align-items: center; background: transparent; border: 0; border-radius: 6px; color: var(--vscode-foreground); cursor: pointer; display: flex; font-size: 0.88em; gap: 8px; padding: 6px 8px; text-align: left; width: 100%; }
	.model-option:hover { background: var(--vscode-list-hoverBackground); }
	.model-option.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
	.dot { border-radius: 50%; flex-shrink: 0; height: 8px; width: 8px; }
	.dot[data-provider="openai"] { background: #74aa9c; }
	.dot[data-provider="anthropic"] { background: #d97757; }
	.dot[data-provider="deepseek"] { background: #4d6bfe; }
	.dot[data-provider="nvidia"] { background: #76b900; }
	.dot[data-provider="qwen"] { background: #6b3fd4; }
	.composer-form { align-items: flex-end; display: flex; gap: 6px; }
	textarea {
		background: transparent; border: 0; color: var(--vscode-input-foreground); flex: 1;
		font-family: inherit; font-size: 0.95em; line-height: 1.4; min-height: 28px;
		min-width: 0; padding: 6px 4px; resize: none;
	}
	textarea:focus { outline: none; }
	.send-btn {
		align-items: center; background: var(--vscode-button-background); border: 0; border-radius: 50%;
		color: var(--vscode-button-foreground); cursor: pointer; display: flex; flex-shrink: 0;
		height: 30px; justify-content: center; padding: 0; width: 30px;
	}
	.send-btn:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
	.send-btn:disabled { cursor: default; opacity: 0.5; }
</style>