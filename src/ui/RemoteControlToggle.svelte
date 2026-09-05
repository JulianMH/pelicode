<script lang="ts">
	import { onDestroy } from 'svelte';
	import qrcode from 'qrcode-generator';
	import type { RemoteControlState } from '../chat/protocol';

	export let state: RemoteControlState;
	export let onToggle: () => void;

	let currentUrl: string | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let qr = '';
	let automatic = false;
	let hovered = false;
	let focused = false;
	let dismissed = false;

	$: updateUrl(state.enabled ? state.url : undefined);
	$: visible = !!qr && !dismissed && (automatic || hovered || focused);

	function updateUrl(url: string | undefined): void {
		if (url === currentUrl) return;
		currentUrl = url;
		clearTimeout(timer);
		automatic = false;
		dismissed = false;
		qr = '';
		if (!url) return;
		const code = qrcode(0, 'M');
		code.addData(url);
		code.make();
		qr = code.createSvgTag({ cellSize: 1, margin: 4, scalable: true });
		automatic = true;
		timer = setTimeout(() => automatic = false, 10_000);
	}

	onDestroy(() => clearTimeout(timer));
</script>

<svelte:window onkeydown={(event) => { if (event.key === 'Escape') dismissed = true; }} />

<div
	class="remote-control"
	role="presentation"
	onmouseenter={() => { hovered = true; dismissed = false; }}
	onmouseleave={() => hovered = false}
>
	<button
		type="button"
		class:enabled={state.enabled}
		role="switch"
		aria-checked={state.enabled}
		aria-label="Remote control"
		aria-describedby={visible ? 'remote-control-qr' : undefined}
		title={state.busy ? 'Updating remote control…' : state.enabled ? undefined : 'Enable remote control and copy URL'}
		disabled={state.busy}
		onclick={onToggle}
		onfocus={(event) => { focused = event.currentTarget.matches(':focus-visible'); dismissed = false; }}
		onblur={() => focused = false}
	>
		<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
			<rect x="2" y="3" width="16" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" />
			<path d="M10 14v3M6 17h8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
			<circle cx="10" cy="8.5" r="2" fill="currentColor" />
		</svg>
	</button>
	{#if visible}
		<div class="popup" id="remote-control-qr" role="tooltip">
			<div class="popup-content">
				<strong>Open browser chat</strong>
				<div class="qr" role="img" aria-label="QR code for the remote control URL">
					{@html qr}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.remote-control { position: relative; flex-shrink: 0; margin: 0 6px; }
	button { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: 1px solid transparent; border-radius: 4px; background: transparent; color: var(--vscode-descriptionForeground); cursor: pointer; }
	button.enabled { color: var(--vscode-textLink-foreground); background: var(--vscode-button-secondaryBackground); }
	button:hover { border-color: var(--vscode-focusBorder); }
	button:disabled { opacity: 0.5; cursor: wait; }
	.popup { position: absolute; top: 100%; right: 0; z-index: 100; width: min(260px, calc(100vw - 16px)); padding-top: 6px; }
	.popup-content { box-sizing: border-box; max-height: calc(100vh - 60px); overflow-y: auto; padding: 12px; border: 1px solid var(--vscode-editorHoverWidget-border, var(--vscode-panel-border)); border-radius: 6px; background: var(--vscode-editorHoverWidget-background, var(--vscode-editor-background)); color: var(--vscode-editorHoverWidget-foreground, var(--vscode-foreground)); box-shadow: 0 4px 12px var(--vscode-widget-shadow, #0005); }
	strong { display: block; margin-bottom: 8px; font-size: 12px; }
	.qr { background: white; }
	.qr :global(svg) { display: block; width: 100%; height: auto; }
</style>
