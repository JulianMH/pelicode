<script lang="ts">
	import { onMount } from 'svelte';
	import App from './App.svelte';
	import { SocketChatViewClient } from './socketChatViewClient';

	const connectionMessages = {
		idle: 'Enable remote control in VS Code and open the copied URL.',
		connecting: 'Connecting…',
		connected: 'Connected',
		disconnected: 'Disconnected. Check remote control and use the latest copied URL.',
	};
	let state: keyof typeof connectionMessages = 'idle';
	let error = '';
	let address = '';
	let socket: WebSocket | undefined;
	let opened = false;
	$: connected = state === 'connected';
	$: status = error || connectionMessages[state];

	function connect(): void {
		try {
			const url = new URL(location.href);
			const key = new URLSearchParams(url.hash.slice(1)).get('key');
			if (url.protocol !== 'http:' || !key) {
				throw new Error('Open the complete PeliCode URL, including #key=…');
			}
			address = url.origin;
			url.protocol = 'ws:';
			url.pathname = '/socket';
			url.hash = '';
			url.search = '';
			url.searchParams.set('key', key);
			const next = new WebSocket(url.href);
			socket?.close();
			socket = next;
			state = 'connecting';
			opened = false;
			error = '';
			next.addEventListener('open', () => {
				if (socket !== next) return;
				state = 'connected';
				opened = true;
			});
			const disconnected = () => {
				if (socket === next) state = 'disconnected';
			};
			next.addEventListener('close', disconnected);
			next.addEventListener('error', disconnected);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Connection failed.';
		}
	}

	onMount(() => {
		if (location.hash) connect();
		window.addEventListener('hashchange', connect);
		return () => {
			window.removeEventListener('hashchange', connect);
			socket?.close();
		};
	});
</script>

<main>
	<header>
		<strong>PeliCode</strong>
		<span role="status">{status}</span>
		{#if address}<small>{address}</small>{/if}
		{#if state === 'disconnected'}<button type="button" onclick={connect}>Reconnect</button>{/if}
	</header>
	<section class="chat" aria-label="Chat">
		{#if socket && opened}
			{#key socket}
				{@const connection = socket}
				<App createClient={(id) => new SocketChatViewClient(connection, id)} {connected} />
			{/key}
		{/if}
	</section>
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
	button { font: inherit; padding: 8px 12px; border: 1px solid var(--vscode-input-border); border-radius: 6px; background: var(--vscode-input-background); color: var(--vscode-foreground); }
	button { cursor: pointer; }
	button:hover { background: var(--vscode-list-hoverBackground); }
	.chat { flex: 1; min-height: 0; }
</style>
