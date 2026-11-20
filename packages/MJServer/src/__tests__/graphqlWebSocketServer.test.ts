import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, type WebSocketServer } from 'ws';
import { CreateGraphQLWebSocketServer } from '../graphqlWebSocketServer';

/** How a client socket ended after one message: its close code, or 'open' when the server kept it. */
async function sendAndAwaitClose(url: string, message: Buffer): Promise<number | 'open'> {
    const client = new WebSocket(url);
    client.on('error', () => undefined);
    await new Promise<void>((resolve) => client.once('open', () => resolve()));
    const closed = new Promise<number>((resolve) => client.once('close', (code: number) => resolve(code)));
    client.send(message);
    const kept = new Promise<'open'>((resolve) => setTimeout(() => resolve('open'), 1500));
    const result = await Promise.race([closed, kept]);
    client.terminate();
    return result;
}

describe('CreateGraphQLWebSocketServer', () => {
    let httpServer: Server;
    let wss: WebSocketServer;

    afterEach(async () => {
        wss.close();
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    });

    async function listen(): Promise<string> {
        wss = CreateGraphQLWebSocketServer();
        httpServer = createServer();
        httpServer.on('upgrade', (request, socket, head) => wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request)));
        await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
        return `ws://127.0.0.1:${(httpServer.address() as AddressInfo).port}/graphql`;
    }

    it('closes the socket with 1009 when a client message is larger than 1 MiB', async () => {
        const url = await listen();
        const result = await sendAndAwaitClose(url, Buffer.alloc(1024 * 1024 + 1, 0x61));
        expect(result).toBe(1009);
    });
});
