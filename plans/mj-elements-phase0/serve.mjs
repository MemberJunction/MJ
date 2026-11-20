#!/usr/bin/env node
/**
 * A static file server for this folder, because the bundles are ES modules and Chrome refuses module scripts
 * and fetch() over file://. It is not an MJ server: nothing here talks to MJAPI.
 *
 *   node serve.mjs            http://localhost:8099/            CSP sent as a header, nonce-based (strict)
 *   http://localhost:8099/?csp=none                             no CSP header, to compare
 *
 * The CSP is a header rather than a <meta> so it matches how a real host page gets one, and so the same
 * index.html can run with or without it. `connect-src *` is deliberate: the elements must be allowed to try
 * their API calls, which then fail with a network error (no server) rather than a CSP block.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8099);
export const NONCE = 'phase0page';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.map': 'application/json', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8' };

const STRICT_CSP = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${NONCE}' 'wasm-unsafe-eval'`,
    `style-src 'self' 'nonce-${NONCE}'`,
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    'connect-src *',
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
].join('; ');

createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (req.method === 'POST' && url.pathname === '/report') {
        // The page posts its report here; it lands in reports/ (git-ignored) so a run can be read whole and diffed.
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
            mkdirSync(join(here, 'reports'), { recursive: true });
            const file = `reports/report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            writeFileSync(join(here, file), body);
            res.writeHead(200, { 'Content-Type': 'text/plain' }).end(file);
        });
        return;
    }
    let path = normalize(decodeURIComponent(url.pathname));
    if (path.endsWith('/')) path += 'index.html';
    const file = join(here, path);
    if (!file.startsWith(here) || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404).end('not found');
        return;
    }
    const headers = { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' };
    if (extname(file) === '.html' && url.searchParams.get('csp') !== 'none') {
        headers['Content-Security-Policy'] = STRICT_CSP;
    }
    res.writeHead(200, headers);
    createReadStream(file).pipe(res);
}).listen(port, () => console.log(`MJ Elements Phase 0 page: http://localhost:${port}/  (add ?csp=none to drop the CSP header)`));
