const esbuild = require('esbuild');
const esbuildSvelte = require('esbuild-svelte');
const { mkdir, writeFile } = require('node:fs/promises');

const production = process.argv.includes('--production');
const dev = process.argv.includes('--dev');
const watch = dev || process.argv.includes('--watch');
const htmlOnly = dev || process.argv.includes('--html-only');

const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',
	setup(build) {
		build.onStart(() => console.log('[watch] build started'));
		build.onEnd((result) => {
			for (const { text, location } of result.errors) {
				console.error(`✘ [ERROR] ${text}`);
				if (location) console.error(`    ${location.file}:${location.line}:${location.column}:`);
			}
			console.log('[watch] build finished');
		});
	},
};

const htmlExportPlugin = {
	name: 'html-export',
	setup(build) {
		build.onEnd(async (result) => {
			if (result.errors.length) return;
			const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
			await mkdir('dist', { recursive: true });
			await writeFile(
				'dist/chat.html',
				`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>PeliCode</title></head>
<body><div id="app"></div><script>${script}</script></body>
</html>\n`,
			);
		});
	},
};

async function main() {
	const common = {
		bundle: true,
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		logLevel: 'silent',
	};
	const contexts = [];
	if (!htmlOnly) {
		contexts.push(
			await esbuild.context({
				...common,
				entryPoints: ['src/extension.ts'],
				format: 'cjs',
				platform: 'node',
				outfile: 'dist/extension.js',
				external: ['vscode', 'bufferutil', 'utf-8-validate'],
				plugins: [esbuildProblemMatcherPlugin],
			}),
		);
	}
	for (const browser of htmlOnly ? [true] : [false, true]) {
		contexts.push(
			await esbuild.context({
				...common,
				entryPoints: [browser ? 'src/ui/browser.ts' : 'src/ui/main.ts'],
				format: 'iife',
				platform: 'browser',
				outfile: browser ? 'dist/browser.js' : 'dist/webview.js',
				write: !browser,
				sourcemap: browser ? false : common.sourcemap,
				mainFields: ['svelte', 'browser', 'module', 'main'],
				conditions: ['svelte', 'browser'],
				plugins: [
					esbuildSvelte({ compilerOptions: { css: 'injected' } }),
					...(browser ? [htmlExportPlugin, esbuildProblemMatcherPlugin] : []),
				],
			}),
		);
	}
	if (watch) {
		await Promise.all(contexts.map((context) => context.watch()));
		if (dev) {
			await contexts[0].rebuild();
			const { port } = await contexts[0].serve({
				host: '127.0.0.1',
				port: 5173,
				servedir: 'dist',
			});
			console.log(`PeliCode HTML: http://127.0.0.1:${port}/chat.html`);
		}
		return;
	}
	try {
		await Promise.all(contexts.map((context) => context.rebuild()));
	} finally {
		await Promise.all(contexts.map((context) => context.dispose()));
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
