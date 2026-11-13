/**
 * The MCP transport routes work when mounted under a prefix — the shape MJAPI gives them
 * (`/api/mcp` with `MJAPI_BASE_PATH=/api`) — with a real MCP SDK client on both transports.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
// Deprecated in the SDK, but the server still offers the legacy SSE transport, so it is tested.
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { UserInfo } from '@memberjunction/core';
import type { AuthResult } from '../auth/types.js';

vi.mock('@memberjunction/server', () => ({}));

import { BuildMCPTransportRouter, MCPCorsMiddleware } from '../Server.js';
import type { MCPSessionFactory, MCPTransportRouter } from '../Server.js';
import { SetHostedResourceIdentifier } from '../auth/OAuthConfig.js';

const MOUNT = '/api/mcp';
const GOOD_KEY = 'good-key';
const user = { ID: 'u1', Name: 'Test', Email: 'test@example.com' } as unknown as UserInfo;

/** Accepts only the x-api-key `good-key`; every session gets one `Echo` tool. */
const fakeSessions: MCPSessionFactory = {
    Authenticate: async (req): Promise<AuthResult> => req.headers['x-api-key'] === GOOD_KEY
        ? { authenticated: true, method: 'apiKey', user }
        : { authenticated: false, method: 'none', error: { status: 401, code: 'missing_credentials', message: 'No credentials' } },
    CreateSessionServer: async () => {
        const server = new McpServer({ name: 'test', version: '1.0.0' });
        server.registerTool('Echo', { description: 'Echoes', inputSchema: { text: z.string() } },
            async ({ text }) => ({ content: [{ type: 'text', text }] }));
        return server;
    },
};

let httpServer: Server | undefined;
let transportRouter: MCPTransportRouter | undefined;

/**
 * Mounts the transport router under MOUNT, followed by a JSON-parsing router like the OAuth
 * proxy's, so the SSE /messages route proves it still reads its raw body.
 */
async function startServer(): Promise<string> {
    transportRouter = BuildMCPTransportRouter({ SSEMessagesPath: `${MOUNT}/messages`, Sessions: fakeSessions });
    const discoveryLike = express.Router().use(express.json());
    const app = express();
    app.use(MOUNT, MCPCorsMiddleware, transportRouter.Router, discoveryLike);
    const s = app.listen(0);
    httpServer = s;
    await new Promise<void>(resolve => s.once('listening', () => resolve()));
    return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}

beforeEach(() => {
    SetHostedResourceIdentifier('https://x.example/api/mcp');
});

afterEach(async () => {
    await transportRouter?.Shutdown();
    transportRouter = undefined;
    SetHostedResourceIdentifier(undefined);
    const s = httpServer;
    httpServer = undefined;
    if (!s) return;
    s.closeAllConnections();
    await new Promise<void>((resolve, reject) => s.close(err => (err ? reject(err) : resolve())));
});

async function echoThrough(client: Client): Promise<string> {
    const tools = await client.listTools();
    expect(tools.tools.map(t => t.name)).toEqual(['Echo']);
    const result = await client.callTool({ name: 'Echo', arguments: { text: 'hi' } });
    const content = result.content as Array<{ type: string; text: string }>;
    return content[0].text;
}

describe('BuildMCPTransportRouter mounted under a prefix', () => {
    it('serves Streamable HTTP at the mount root to a real SDK client', async () => {
        const base = await startServer();
        const client = new Client({ name: 'test-client', version: '1.0.0' });
        await client.connect(new StreamableHTTPClientTransport(new URL(`${base}${MOUNT}`), {
            requestInit: { headers: { 'x-api-key': GOOD_KEY } },
        }));

        expect(await echoThrough(client)).toBe('hi');
        expect(transportRouter!.SessionCount()).toBe(1);
        await client.close();
    });

    it('tells legacy SSE clients the public messages path, and routes their messages', async () => {
        const base = await startServer();
        const headers = { 'x-api-key': GOOD_KEY };
        const client = new Client({ name: 'test-client', version: '1.0.0' });
        const transport = new SSEClientTransport(new URL(`${base}${MOUNT}/sse`), {
            eventSourceInit: { fetch: (url, init) => fetch(url, { ...init, headers: { ...init?.headers, ...headers } }) },
            requestInit: { headers },
        });
        await client.connect(transport);

        expect(await echoThrough(client)).toBe('hi');
        await client.close();
    });

    it('announces the configured SSE messages path in the endpoint event', async () => {
        const base = await startServer();
        const res = await fetch(`${base}${MOUNT}/sse`, { headers: { 'x-api-key': GOOD_KEY } });
        const reader = res.body!.getReader();
        const first = new TextDecoder().decode((await reader.read()).value);
        await reader.cancel();

        expect(first).toContain('event: endpoint');
        expect(first).toMatch(/data: \/api\/mcp\/messages\?sessionId=[\w-]+/);
    });

    it('refuses an unauthenticated request, pointing at the hosted resource metadata URL', async () => {
        const base = await startServer();
        const res = await fetch(`${base}${MOUNT}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
        });
        await res.text();

        expect(res.status).toBe(401);
        expect(res.headers.get('www-authenticate')).toContain(
            'resource_metadata="https://x.example/api/mcp/.well-known/oauth-protected-resource"'
        );
    });

    it('answers CORS preflights itself', async () => {
        const base = await startServer();
        const res = await fetch(`${base}${MOUNT}`, { method: 'OPTIONS' });
        await res.text();

        expect(res.status).toBe(200);
        expect(res.headers.get('access-control-allow-origin')).toBe('*');
    });

    it('rejects a relative SSE messages path', () => {
        expect(() => BuildMCPTransportRouter({ SSEMessagesPath: 'mcp/messages', Sessions: fakeSessions }))
            .toThrow(/absolute path/);
    });
});
