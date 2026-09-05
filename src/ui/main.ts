import { mount } from 'svelte';
import App from './App.svelte';
import { VscodeChatViewClient } from './vscodeChatViewClient';

const vscode = (
	window as unknown as {
		acquireVsCodeApi(): { postMessage(message: unknown): void };
	}
).acquireVsCodeApi();

mount(App, {
	target: document.getElementById('app')!,
	props: {
		showRemoteControl: true,
		createClient: (id: string) => new VscodeChatViewClient(vscode, id),
	},
});
