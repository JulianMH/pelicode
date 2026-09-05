<script lang="ts">
	import { onMount } from 'svelte';
	import ChatView from './ChatView.svelte';
	import type { ChatViewClient } from './chatViewClient';
	import type { ChatSummary, RemoteControlState } from '../chat/protocol';
	import PelicanIcon from './PelicanIcon.svelte';
	import RemoteControlToggle from './RemoteControlToggle.svelte';

	export let createClient: (id: string) => ChatViewClient;
	export let connected = true;
	export let showRemoteControl = false;

	type ChatTab = ChatSummary & { client: ChatViewClient };
	const client = createClient('default');
	let tabs: ChatTab[] = [];
	let activeTab = '';
	let remoteControl: RemoteControlState = { enabled: false, busy: true };

	onMount(() => {
		const unsubscribe = client.onMessage((message) => {
			if (message.type === 'remoteControlUpdated') {
				remoteControl = message.state;
				return;
			}
			if (message.type !== 'chatsUpdated') return;
			const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeTab));
			tabs = message.chats.map((chat) => ({
				...chat,
				client: tabs.find((tab) => tab.id === chat.id)?.client ?? createClient(chat.id),
			}));
			if (!tabs.some((tab) => tab.id === activeTab)) {
				activeTab = tabs[Math.min(activeIndex, tabs.length - 1)]?.id ?? '';
			}
		});
		client.listChats();
		return unsubscribe;
	});

	function toggleRemoteControl(): void {
		if (remoteControl.busy) return;
		remoteControl = { ...remoteControl, busy: true };
		client.setRemoteControl(!remoteControl.enabled);
	}

	function addTab(): void {
		if (!connected) return;
		activeTab = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
			byte.toString(16).padStart(2, '0'),
		).join('');
		createClient(activeTab).create();
	}
	function closeTab(id: string): void {
		if (connected) tabs.find((tab) => tab.id === id)?.client.close();
	}
</script>

<svelte:head><title>Code AI Chat</title></svelte:head>

<main aria-live="polite">
	<div class="tab-bar">
		<div class="tabs" aria-label="Chat views" role="tablist">
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
					<button type="button" class="close-tab" disabled={!connected} title="Close {tab.label}" aria-label="Close {tab.label}" onclick={(event) => { event.stopPropagation(); closeTab(tab.id); }}>×</button>
				</div>
			{/each}
			<button
				type="button"
				class="add-tab"
				title="New Chat"
				aria-label="New Chat"
				onclick={addTab}
				disabled={!connected}
			>
				{#if tabs.length === 0}
					New Chat +
				{:else}
					+
				{/if}
			</button>
		</div>

		{#if showRemoteControl}
			<RemoteControlToggle state={remoteControl} onToggle={toggleRemoteControl} />
		{/if}
	</div>

	<div class="chat-panel" role="tabpanel">
		{#if tabs.length === 0}
			<div class="empty-view" aria-label="No open chats">
				<PelicanIcon />
			</div>
		{:else}
			{#each tabs as tab (tab.id)}
				<div class:hidden={activeTab !== tab.id}>
					<ChatView id={tab.id} active={connected && activeTab === tab.id} host={tab.client} {connected} />
				</div>
			{/each}
		{/if}
	</div>
</main>

<style>
	:global(html), :global(body), :global(#app) { height: 100%; }
	:global(body) {
		color: var(--vscode-foreground);
		font-family: var(--vscode-font-family);
		margin: 0;
		overflow: hidden;
	}

	main { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
	.tab-bar { display: flex; align-items: center; flex-shrink: 0; background: var(--vscode-editorGroupHeader-tabsBackground); border-bottom: 1px solid var(--vscode-panel-border); }
	.tabs {
		flex: 1;
		min-width: 0;
		overflow-x: auto;
		background: var(--vscode-editorGroupHeader-tabsBackground);
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
