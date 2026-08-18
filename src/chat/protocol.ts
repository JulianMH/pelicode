import type { ChatEntry } from './chatEntry';
import type { OpenRouterModel } from './models';

/** Unregisters a listener installed through a transport's {@code onMessage}. */
export type Dispose = () => void;

/**
 * Messages sent from the webview (Svelte) to the extension host
 * (ChatViewProvider). `id` routes a message to a specific chat.
 */
export type WebviewToHostMessage =
	| { type: 'ready'; id: string }
	| { type: 'viewOpened'; id: string }
	| { type: 'viewClosed'; id: string }
	| { type: 'send'; id: string; text: string; model: OpenRouterModel }
	| { type: 'cancel'; id: string }
	| { type: 'close'; id: string };

/**
 * Messages sent from the extension host (ChatViewProvider) to the webview.
 * `id` routes a message to a specific chat.
 */
export type HostToWebviewMessage =
	| { type: 'restore'; id: string; messages: ChatEntry[]; model?: OpenRouterModel }
	| { type: 'costUpdated'; id: string; cost: number }
	| { type: 'unreadUpdated'; id: string; unread: boolean }
	| { type: 'entry'; id: string; entry: ChatEntry; final?: boolean }
	| { type: 'requestStarted'; id: string }
	| { type: 'requestFinished'; id: string };