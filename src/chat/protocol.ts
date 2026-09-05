import type { ChatEntry } from './chatEntry';
import type { OpenRouterModel } from './models';

export type Dispose = () => void;

export type WebviewToHostMessage =
	| { type: 'ready'; id: string }
	| { type: 'viewOpened'; id: string }
	| { type: 'viewClosed'; id: string }
	| { type: 'send'; id: string; text: string; model: OpenRouterModel }
	| { type: 'cancel'; id: string }
	| { type: 'close'; id: string };

export type HostToWebviewMessage =
	| { type: 'restore'; id: string; messages: ChatEntry[]; model?: OpenRouterModel }
	| { type: 'costUpdated'; id: string; cost: number }
	| { type: 'unreadUpdated'; id: string; unread: boolean }
	| { type: 'entry'; id: string; entry: ChatEntry; final?: boolean }
	| { type: 'requestStarted'; id: string }
	| { type: 'requestFinished'; id: string };
