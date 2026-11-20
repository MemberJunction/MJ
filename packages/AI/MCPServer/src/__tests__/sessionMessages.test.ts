import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express, { type Request, type Response } from 'express';
import { request as httpRequest, get as httpGet, type ClientRequest, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ForwardSessionMessage } from '../sessionMessages';

describe('ForwardSessionMessage', () => {
    let server: Server;
    let port: number;
    let transport: SSEServerTransport | null = null;
    const openRequests: ClientRequest[] = [];

    beforeEach(async () => {
        const app = express();
        app.get('/sse', async (_req: Request, res: Response) => {
            transport = new SSEServerTransport('/messages', res);
            await transport.start();
        });
        app.post('/messages', async (req: Request, res: Response) => {
            if (transport) {
                await ForwardSessionMessage(transport, req, res);
            }
        });
        server = app.listen(0, '127.0.0.1');
        await new Promise<void>((resolve) => server.once('listening', () => resolve()));
        port = (server.address() as AddressInfo).port;
        await openSseStream();
    });

    afterEach(async () => {
        for (const req of openRequests) {
            req.destroy();
        }
        openRequests.length = 0;
        transport = null;
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    /** Opens the SSE stream that the session's transport writes to. */
    function openSseStream(): Promise<void> {
        return new Promise<void>((resolve) => {
            const req = httpGet({ host: '127.0.0.1', port, path: '/sse' }, (res: IncomingMessage) => {
                res.once('data', () => resolve());
            });
            req.on('error', () => undefined);
            openRequests.push(req);
        });
    }

    /** Streams `bytes` of body without ending it; returns the status code, or 'no response' after 3 s. */
    function postWithoutEnd(bytes: number): Promise<number | 'no response'> {
        return new Promise((resolve) => {
            const req = httpRequest({
                host: '127.0.0.1',
                port,
                path: '/messages',
                method: 'POST',
                headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' },
            }, (res: IncomingMessage) => {
                res.resume();
                resolve(res.statusCode ?? 0);
            });
            req.on('error', () => undefined);
            openRequests.push(req);
            const chunk = Buffer.alloc(64 * 1024, 0x20);
            for (let sent = 0; sent < bytes; sent += chunk.length) {
                req.write(chunk);
            }
            setTimeout(() => resolve('no response'), 3000);
        });
    }

    it('refuses a body larger than 4 MiB without waiting for the rest of it', async () => {
        const result = await postWithoutEnd(5 * 1024 * 1024);
        expect(result).toBe(400);
    });
});
