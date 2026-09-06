import { randomBytes } from 'node:crypto';

export const TOOL_PAGE_BYTES = 8000;
const PAGE_CONTENT_BYTES = TOOL_PAGE_BYTES - 128;

export type ToolResult = string | { text: string; next?: () => Promise<ToolResult> };

export class ToolPages {
	private readonly pages = new Map<string, () => Promise<ToolResult>>();

	async next(cursor: string): Promise<string> {
		const next = this.pages.get(cursor);
		if (!next)
			return 'Error: Page cursor expired or is unknown. Run the original read-only query again.';
		const result = await next();
		this.pages.delete(cursor);
		return this.format(result);
	}

	format(result: ToolResult): string {
		const { text, next } = typeof result === 'string' ? { text: result, next: undefined } : result;
		const bytes = Buffer.from(text, 'utf8');
		if (bytes.length <= TOOL_PAGE_BYTES && !next) return text;
		const page = new TextDecoder('utf-8', { ignoreBOM: true }).decode(
			bytes.subarray(0, PAGE_CONTENT_BYTES),
			{ stream: true },
		);
		const remaining = text.slice(page.length);
		const continuation = remaining ? async () => ({ text: remaining, next }) : next;
		if (!continuation) return page;
		const cursor = randomBytes(12).toString('hex');
		if (this.pages.size >= 32) this.pages.delete(this.pages.keys().next().value!);
		this.pages.set(cursor, continuation);
		return `${page}\n[More output: nextPage({"cursor":"${cursor}"})]`;
	}
}
