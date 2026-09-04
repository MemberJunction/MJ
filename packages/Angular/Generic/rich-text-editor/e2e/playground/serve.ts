/**
 * `pnpm run playground` — bundle the engine and serve the playground on localhost.
 *
 * The page is the smoke-test bench: load a sample (or paste a real Outlook/Gmail message into
 * the textarea), edit, and watch the semantic diff against the loaded document. Only what you
 * touched should show up as a difference.
 */
import { build } from 'esbuild';
import { createServer } from 'http';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import * as path from 'path';

const PLAYGROUND = path.resolve(__dirname);
const HARNESS = path.resolve(__dirname, '..', '.harness');
const PORT = Number(process.env['PORT'] ?? 4310);

async function main(): Promise<void> {
    mkdirSync(HARNESS, { recursive: true });
    await build({
        entryPoints: [path.resolve(__dirname, '..', 'harness-entry.ts')],
        bundle: true,
        format: 'iife',
        target: 'es2022',
        outfile: path.resolve(HARNESS, 'engine.bundle.js'),
        sourcemap: 'inline',
        logLevel: 'info',
    });
    const server = createServer((request, response) => {
        const url = (request.url ?? '/').split('?')[0];
        const file = url === '/engine.bundle.js' ? path.resolve(HARNESS, 'engine.bundle.js') : path.resolve(PLAYGROUND, url === '/' ? 'index.html' : url.slice(1));
        if (!existsSync(file) || !file.startsWith(url === '/engine.bundle.js' ? HARNESS : PLAYGROUND)) {
            response.writeHead(404);
            response.end('not found');
            return;
        }
        response.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' });
        response.end(readFileSync(file));
    });
    server.listen(PORT, () => {
        console.log(`\n  mj-rich-text-editor playground → http://localhost:${PORT}\n`);
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
