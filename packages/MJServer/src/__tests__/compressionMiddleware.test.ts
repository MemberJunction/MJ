import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { CreateCompressionMiddleware } from '../compressionMiddleware.js';

/** A 2 KB SSE event: over the compression threshold, under gzip's flush window. */
const BIG_EVENT = `data: ${'x'.repeat(2048)}\n\n`;

let server: Server | undefined;

afterEach(async () => {
    const s = server;
    server = undefined;
    if (!s) return;
    s.closeAllConnections();
    await new Promise<void>((resolve, reject) => s.close(err => (err ? reject(err) : resolve())));
});

async function listen(app: express.Express): Promise<string> {
    const s = app.listen(0);
    server = s;
    await new Promise<void>(resolve => s.once('listening', () => resolve()));
    return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}

/**
 * Reads the first body chunk of a response the server never ends. No race timer: if the
 * middleware buffers the stream, the read never resolves and the test fails on its timeout.
 */
async function readFirstChunkOfOpenStream(url: string): Promise<{ encoding: string | null; chunk: string }> {
    const res = await fetch(url, { headers: { 'Accept-Encoding': 'gzip' } });
    const reader = res.body!.getReader();
    const first = await reader.read();
    await reader.cancel();
    expect(first.done).toBe(false);
    return { encoding: res.headers.get('content-encoding'), chunk: new TextDecoder().decode(first.value) };
}

describe('CreateCompressionMiddleware', () => {
    it('streams an open SSE response uncompressed, even without Cache-Control: no-transform', async () => {
        // The MCP SDK's streamable-HTTP POST response sends only `Cache-Control: no-cache`.
        const app = express();
        app.use(CreateCompressionMiddleware());
        app.get('/sse', (_req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
            res.write(BIG_EVENT); // the stream stays open, as a long tool call's would
        });
        const base = await listen(app);

        const { encoding, chunk } = await readFirstChunkOfOpenStream(`${base}/sse`);

        expect(encoding).toBeNull();
        expect(chunk.startsWith('data: x')).toBe(true);
    }, 15_000);

    it('still compresses ordinary JSON responses', async () => {
        const app = express();
        app.use(CreateCompressionMiddleware());
        app.get('/json', (_req, res) => {
            res.json({ payload: 'y'.repeat(4096) });
        });
        const base = await listen(app);

        const res = await fetch(`${base}/json`, { headers: { 'Accept-Encoding': 'gzip' } });
        await res.text();

        expect(res.headers.get('content-encoding')).toBe('gzip');
    });
});
