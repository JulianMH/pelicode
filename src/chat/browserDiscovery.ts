export const browserChatPorts = Array.from({ length: 20 }, (_, index) => 43120 + index);

export type BrowserChatInstance = {
	app: 'pelicode';
	name: string;
	workspace: string;
	url: string;
};
