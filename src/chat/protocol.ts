import type { ContextUsage } from './context';
import type { ChatEntry } from './chatEntry';
import type { OpenRouterModel } from './models';

export type Dispose = () => void;

export type RemoteControlState = { enabled: boolean; busy: boolean; url?: string };

export type ChatSummary = { id: string; label: string; thinking: boolean; unread: boolean };

export type WebviewToHostMessage =
	| { type: 'setRemoteControl'; id: string; enabled: boolean }
	| { type: 'listChats'; id: string }
	| { type: 'create'; id: string }
	| { type: 'ready'; id: string }
	| { type: 'viewOpened'; id: string }
	| { type: 'viewClosed'; id: string }
	| { type: 'send'; id: string; text: string; model: OpenRouterModel }
	| { type: 'context' | 'compact'; id: string; model: OpenRouterModel }
	| { type: 'cancel'; id: string }
	| { type: 'close'; id: string };

export type HostToWebviewMessage =
	| { type: 'remoteControlUpdated'; id: string; state: RemoteControlState }
	| { type: 'chatsUpdated'; id: string; chats: ChatSummary[] }
	| { type: 'restore'; id: string; messages: ChatEntry[]; model?: OpenRouterModel }
	| { type: 'contextUpdated'; id: string; usage: ContextUsage }
	| { type: 'costUpdated'; id: string; cost: number }
	| { type: 'entry'; id: string; entry: ChatEntry }
	| { type: 'requestStarted'; id: string }
	| { type: 'requestFinished'; id: string };

export function isWebviewToHostMessage(value: unknown): value is WebviewToHostMessage {
	if (!value || typeof value !== 'object') return false;
	const message = value as Record<string, unknown>;
	if (typeof message.id !== 'string' || !/^[a-zA-Z0-9_-][a-zA-Z0-9._-]{0,127}$/.test(message.id))
		return false;
	switch (message.type) {
		case 'setRemoteControl':
			return typeof message.enabled === 'boolean';
		case 'context':
		case 'compact':
			return typeof message.model === 'string';
		case 'send':
			return typeof message.text === 'string' && typeof message.model === 'string';
		case 'listChats':
		case 'create':
		case 'ready':
		case 'viewOpened':
		case 'viewClosed':
		case 'cancel':
		case 'close':
			return true;
		default:
			return false;
	}
}
