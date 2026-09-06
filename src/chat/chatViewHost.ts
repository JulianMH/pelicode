import type { ContextUsage } from './context';
import type { ChatEntry } from './chatEntry';
import type { OpenRouterModel } from './models';
import type {
	ChatSummary,
	Dispose,
	HostToWebviewMessage,
	RemoteControlState,
	WebviewToHostMessage,
} from './protocol';

export abstract class ChatViewHost {
	protected abstract post(message: HostToWebviewMessage): void;

	abstract onMessage(listener: (message: WebviewToHostMessage) => void): Dispose;

	remoteControlUpdated(state: RemoteControlState): void {
		this.post({ type: 'remoteControlUpdated', id: '', state });
	}

	chatsUpdated(chats: ChatSummary[]): void {
		this.post({ type: 'chatsUpdated', id: '', chats });
	}

	restore(id: string, messages: ChatEntry[], model?: OpenRouterModel): void {
		this.post({ type: 'restore', id, messages, model });
	}

	contextUpdated(id: string, usage: ContextUsage): void {
		this.post({ type: 'contextUpdated', id, usage });
	}

	costUpdated(id: string, cost: number): void {
		this.post({ type: 'costUpdated', id, cost });
	}

	entry(id: string, entry: ChatEntry): void {
		this.post({ type: 'entry', id, entry });
	}

	requestStarted(id: string): void {
		this.post({ type: 'requestStarted', id });
	}

	requestFinished(id: string): void {
		this.post({ type: 'requestFinished', id });
	}
}
