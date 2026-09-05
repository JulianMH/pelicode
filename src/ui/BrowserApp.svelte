<script lang="ts">
	import { onMount } from 'svelte';
	import { browserChatPorts, type BrowserChatInstance } from '../chat/browserDiscovery';
	import App from './App.svelte';
	import { SocketChatViewClient } from './socketChatViewClient';

	let instances: BrowserChatInstance[] = [];
	let searching = false;
	let selected: BrowserChatInstance | undefined;
	let socket: WebSocket | undefined;
	let connected = false;
	let opened = false;
	let status = '';

	async function discover(): Promise<void> {
		if (searching) return;
		searching = true;
		const found = await Promise.all(browserChatPorts.map(async (port) => {
			const url = `http://127.0.0.1:${port}/`;
			try {
				const response = await fetch(`${url}instance`, { signal: AbortSignal.timeout(1500) });
				if (!response.ok) return undefined;
				const data = await response.json();
				if (data.app === 'pelicode' && typeof data.name === 'string' && typeof data.workspace === 'string') {
					return { ...data, url } as BrowserChatInstance;
				}
			} catch {
				return undefined;
			}
		}));
		instances = found.filter((instance): instance is BrowserChatInstance => instance !== undefined);
		searching = false;
	}

	function select(instance: BrowserChatInstance): void {
		socket?.close();
		selected = instance;
		connected = false;
		opened = false;
		status = 'Connecting…';
		const next = new WebSocket(instance.url.replace('http:', 'ws:') + 'socket');
		socket = next;
		next.addEventListener('open', () => {
			if (socket !== next) return;
			connected = true;
			opened = true;
			status = 'Connected';
		});
		const disconnected = () => {
			if (socket !== next) return;
			connected = false;
			status = 'Disconnected';
		};
		next.addEventListener('close', disconnected);
		next.addEventListener('error', disconnected);
	}

	function showInstances(): void {
		socket?.close();
		socket = undefined;
		selected = undefined;
		opened = false;
		connected = false;
		void discover();
	}

	onMount(() => {
		void discover();
		const refresh = setInterval(() => { if (!selected) void discover(); }, 5000);
		return () => { clearInterval(refresh); socket?.close(); };
	});
</script>

<main>
	{#if selected}
		<header>
			<button type="button" onclick={showInstances}>← Instances</button>
			<strong>{selected.name}</strong>
			<span role="status">{status}</span>
			{#if !connected}<button type="button" onclick={() => selected && select(selected)}>Reconnect</button>{/if}
		</header>
		<section class="chat" aria-label="Chat">
			{#if socket && opened}
				{#key socket}
					{@const connection = socket}
					<App createClient={(id) => new SocketChatViewClient(connection, id)} {connected} />
				{/key}
			{/if}
		</section>
	{:else}
		<section class="instances">
			<header><h1>PeliCode</h1><span>YOLO</span></header>
			<p>Select a VS Code workspace.</p>
			<button type="button" onclick={discover} disabled={searching}>{searching ? 'Searching…' : 'Refresh'}</button>
			<div class="instance-list">
				{#each instances as instance (instance.url)}
					<button class="instance" type="button" onclick={() => select(instance)}>
						<strong>{instance.name}</strong>
						<span>{instance.workspace || 'No workspace folder'}</span>
						<small>{instance.url}</small>
					</button>
				{/each}
			</div>
			{#if !searching && !instances.length}<p role="status">No PeliCode instances found. Open VS Code with the updated extension.</p>{/if}
		</section>
	{/if}
</main>

<style>
	:global(:root) {
		color-scheme: dark;
		--vscode-foreground: #e5e7eb;
		--vscode-font-family: system-ui, sans-serif;
		--vscode-editor-font-family: ui-monospace, monospace;
		--vscode-editor-font-size: 13px;
		--vscode-descriptionForeground: #a3aab8;
		--vscode-panel-border: #343b49;
		--vscode-input-background: #202632;
		--vscode-input-foreground: #e5e7eb;
		--vscode-input-border: #465063;
		--vscode-focusBorder: #93c5fd;
		--vscode-button-background: #2563eb;
		--vscode-button-hoverBackground: #1d4ed8;
		--vscode-button-foreground: #fff;
		--vscode-button-border: transparent;
		--vscode-button-secondaryBackground: #343b49;
		--vscode-button-secondaryForeground: #e5e7eb;
		--vscode-badge-background: #343b49;
		--vscode-badge-foreground: #e5e7eb;
		--vscode-dropdown-background: #202632;
		--vscode-dropdown-border: #465063;
		--vscode-editorWidget-background: #202632;
		--vscode-list-activeSelectionBackground: #25466e;
		--vscode-list-activeSelectionForeground: #fff;
		--vscode-list-hoverBackground: #343b49;
		--vscode-editor-inactiveSelectionBackground: #343b49;
		--vscode-textBlockQuote-background: #202632;
		--vscode-textBlockQuote-border: #465063;
		--vscode-textCodeBlock-background: #141923;
		--vscode-textLink-foreground: #93c5fd;
	}
	:global(body) { margin: 0; background: #141923; color: var(--vscode-foreground); font-family: var(--vscode-font-family); }
	main { height: 100vh; height: 100dvh; display: flex; flex-direction: column; }
	header { padding: 12px 16px; border-bottom: 1px solid var(--vscode-panel-border); display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
	span, small { color: var(--vscode-descriptionForeground); font-size: 13px; }
	button { font: inherit; padding: 8px 12px; border: 1px solid var(--vscode-input-border); border-radius: 6px; cursor: pointer; background: var(--vscode-input-background); color: var(--vscode-foreground); }
	button:hover { background: var(--vscode-list-hoverBackground); }
	button:disabled { opacity: 0.6; cursor: default; }
	.chat { flex: 1; min-height: 0; }
	.instances { width: min(640px, 100%); box-sizing: border-box; padding: 24px; margin: 0 auto; overflow-y: auto; }
	.instances header { padding: 0; justify-content: space-between; }
	.instance-list { display: grid; gap: 12px; margin-top: 20px; }
	.instance { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; text-align: left; overflow-wrap: anywhere; }
</style>
