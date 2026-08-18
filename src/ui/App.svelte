<script lang="ts">
	import ChatView from './ChatView.svelte';
	import { VscodeChatViewClient } from './vscodeChatViewClient';
	import PelicanIcon from './PelicanIcon.svelte';

	type ChatTab = { id: string; label: string; thinking: boolean; unread: boolean };
	type VsCodeApi = { postMessage(message: unknown): void };
	type InitialChatWindow = Window & { __pelicodeInitialChatIds?: unknown };
	const initialIds = (() => {
		const ids = (window as InitialChatWindow).__pelicodeInitialChatIds;
		return Array.isArray(ids) && ids.every((id): id is string => typeof id === 'string' && id.length > 0)
			? ids
			: ['default'];
	})();
	let tabs: ChatTab[] = initialIds.map((id, index) => ({
		id, label: `Chat ${index + 1}`, thinking: false, unread: false
	}));
	let activeTab = tabs[0].id;
	let nextTabNumber = tabs.length + 1;
	const vscode = (window as unknown as {
		acquireVsCodeApi(): VsCodeApi;
	}).acquireVsCodeApi();

	function addTab(): void {
		let number = nextTabNumber++;
		while (tabs.some((tab) => tab.id === `chat-view-${number}`)) number = nextTabNumber++;
		const tab = { id: `chat-view-${number}`, label: `Chat ${number}`, thinking: false, unread: false };
		tabs = [...tabs, tab];
		activeTab = tab.id;
	}
	function closeTab(id: string): void {
		const index = tabs.findIndex((tab) => tab.id === id);
		if (index < 0) return;
		const wasActive = activeTab === id;
		tabs = tabs.filter((tab) => tab.id !== id);
		new VscodeChatViewClient(vscode, id).close();
		if (wasActive) {
			const replacement = tabs[Math.min(index, tabs.length - 1)];
			if (replacement) activeTab = replacement.id;
		}
	}
	function setTabThinking(id: string, thinking: boolean): void {
		tabs = tabs.map((tab) => tab.id === id ? { ...tab, thinking } : tab);
	}
	function setTabUnread(id: string, unread: boolean): void {
		tabs = tabs.map((tab) => tab.id === id ? { ...tab, unread } : tab);
	}
</script>

<svelte:head><title>Code AI Chat</title></svelte:head>

<main aria-live="polite">
	<nav class="tabs" aria-label="Chat views" role="tablist">
		{#each tabs as tab (tab.id)}
			<div class:active={activeTab === tab.id} class="tab-item">
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === tab.id}
					class="tab-button"
					onclick={() => activeTab = tab.id}
				>
					{tab.label}
					{#if tab.unread}<span class="unread-dot" aria-label="Unread response" title="Unread response"></span>{/if}
					{#if tab.thinking}
						<span class="thinking-dot" aria-label="PeliCode is thinking" title="PeliCode is thinking">
							<svg viewBox="0 0 16 16" aria-hidden="true">
								<path d="M3 3h10M3 13h10M4 4l4 4 4-4M4 12l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						</span>
					{/if}
				</button>
				<button type="button" class="close-tab" title="Close {tab.label}" aria-label="Close {tab.label}" onclick={(event) => { event.stopPropagation(); closeTab(tab.id); }}>×</button>
			</div>
		{/each}
		<button
			type="button"
			class="add-tab"
			title="New Chat"
			aria-label="New Chat"
			onclick={addTab}
		>
			{#if tabs.length === 0}
				New Chat +
			{:else}
				+
			{/if}
		</button>
	</nav>

	<div class="chat-panel" role="tabpanel">
		{#if tabs.length === 0}
			<div class="empty-view" aria-label="No open chats">
				<PelicanIcon />
			</div>
		{:else}
			{#each tabs as tab (tab.id)}
				<div class:hidden={activeTab !== tab.id}>
					<ChatView id={tab.id} active={activeTab === tab.id} vscodeApi={vscode} onThinking={(thinking) => setTabThinking(tab.id, thinking)} onUnread={(unread) => setTabUnread(tab.id, unread)} />
				</div>
			{/each}
		{/if}
	</div>
</main>

<style>
	:global(html), :global(body) { height: 100%; }
	:global(body) {
		color: var(--vscode-foreground);
		font-family: var(--vscode-font-family);
		margin: 0;
		overflow: hidden;
	}

	main { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
	.tabs {
		background: var(--vscode-editorGroupHeader-tabsBackground);
		border-bottom: 1px solid var(--vscode-panel-border);
		display: flex;
		flex-shrink: 0;
		padding: 0 8px;
	}
	.tabs button {
		background: transparent;
		border: 0;
		border-bottom: 2px solid transparent;
		color: var(--vscode-tab-inactiveForeground, var(--vscode-descriptionForeground));
		cursor: pointer;
		font: inherit;
		padding: 8px 14px 7px;
	}
	.tab-item { display: flex; align-items: stretch; }
	.tab-item:hover .tab-button, .tab-item.active .tab-button { color: var(--vscode-foreground); }
	.tab-item.active .tab-button {
		border-bottom-color: var(--vscode-focusBorder);
		color: var(--vscode-tab-activeForeground, var(--vscode-foreground));
	}
	.tab-item.active .close-tab { border-bottom-color: var(--vscode-focusBorder) !important; }
	.close-tab {
		border-bottom-color: transparent !important;
		font-size: 16px !important;
		line-height: 1;
		padding: 6px 7px 7px 0 !important;
	}
	.close-tab:hover { color: var(--vscode-foreground); }
	.thinking-dot {
		background: var(--vscode-textLink-foreground, #3794ff);
		border-radius: 50%;
		display: inline-flex;
		height: 13px;
		align-items: center;
		justify-content: center;
		margin-left: 7px;
		vertical-align: middle;
		width: 13px;
	}
	.thinking-dot svg {
		height: 10px;
		width: 10px;
		color: var(--vscode-editor-background, #fff);
	}
	.unread-dot { background: var(--vscode-textLink-foreground, #3794ff); border-radius: 50%; display: inline-block; height: 8px; margin-left: 7px; vertical-align: middle; width: 8px; }
	.tabs .add-tab {
		align-items: center;
		border-bottom-color: transparent;
		display: flex;
		font-size: 18px;
		justify-content: center;
		line-height: 1;
		margin-left: 2px;
		padding: 6px 10px 7px;
	}
	.chat-panel { flex: 1; min-height: 0; }
	.chat-panel > div { height: 100%; }
	.empty-view { align-items: center; display: flex; height: 100%; justify-content: center; }
	.empty-view :global(.pelican) { height: 64px; width: 64px; }
	.hidden { display: none; }
</style>