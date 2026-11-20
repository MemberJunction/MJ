import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { InstallMediaUpgradeDispatcher } from '@memberjunction/server-extensions-core';

/** An HTTP server on 127.0.0.1 that routes upgrades through the shared media upgrade dispatcher. */
export interface MediaSocketHarness {
    Url(pathAndQuery: string): string;
    Close(): Promise<void>;
}

/** Starts a harness. Call after the router registered its media route. */
export async function StartMediaSocketHarness(): Promise<MediaSocketHarness> {
    const server: Server = createServer();
    const graphqlWss = new WebSocketServer({ noServer: true });
    InstallMediaUpgradeDispatcher(server, graphqlWss, '/graphql');
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as AddressInfo).port;
    return {
        Url: (pathAndQuery: string) => `ws://127.0.0.1:${port}${pathAndQuery}`,
        Close: async () => {
            graphqlWss.close();
            server.closeAllConnections();
            await new Promise<void>((resolve) => server.close(() => resolve()));
        },
    };
}

/** Sends one message on a new client socket; returns its close code, or 'open' when the server kept it. */
export async function SendAndAwaitClose(url: string, message: Buffer): Promise<number | 'open'> {
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
