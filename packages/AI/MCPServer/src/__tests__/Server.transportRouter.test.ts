/**
 * The MCP transport routes work when mounted under a prefix — the shape MJAPI gives them
 * (`/api/mcp` with `MJAPI_BASE_PATH=/api`) — with a real MCP SDK client on both transports, and
 * Streamable HTTP sessions are authenticated per request, owned by one user, and cleaned up.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { RequestHandler } from 'express';
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
// ScopeService reaches @memberjunction/server's config loader; these routes never consult it.
vi.mock('../auth/ScopeService.js', () => ({
    LoadActiveScopes: async () => [],
    GetDefaultScopes: () => [],
    GroupScopesHierarchically: () => ({ fullAccessScope: null, categories: new Map() }),
}));

import { BuildMCPTransportRouter, CreateMCPCorsMiddleware, MCPCorsMiddleware } from '../Server.js';
import type { MCPSessionFactory, MCPTransportRouter, MCPTransportRouterOptions } from '../Server.js';
import { CreateOAuthProxyRouter } from '../auth/OAuthProxyRouter.js';

const MOUNT = '/api/mcp';
const userA = { ID: 'user-a', Name: 'A', Email: 'a@example.com' } as unknown as UserInfo;
const userB = { ID: 'user-b', Name: 'B', Email: 'b@example.com' } as unknown as UserInfo;

/** x-api-key -> user. Deleting a key revokes it. */
const keys = new Map<string, UserInfo>();

/** Builds the per-session MCP server: one `Echo` tool. Counted, to prove when no work is done. */
const createSessionServer = vi.fn(async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    server.registerTool('Echo', { description: 'Echoes', inputSchema: { text: z.string() } },
        async ({ text }) => ({ content: [{ type: 'text', text }] }));
    return server;
});

/** Accepts the keys in `keys`; each key is its own credential (its hash is the key itself). */
const fakeSessions: MCPSessionFactory = {
    Authenticate: async (req): Promise<AuthResult> => {
        const key = String(req.headers['x-api-key'] ?? '');
        const user = keys.get(key);
        return user
            ? { authenticated: true, method: 'apiKey', user, apiKeyContext: { apiKey: key, apiKeyId: key, apiKeyHash: key } }
            : { authenticated: false, method: 'none', error: { status: 401, code: 'missing_credentials', message: 'No credentials' } };
    },
    CreateSessionServer: createSessionServer,
};

let httpServer: Server | undefined;
let transportRouter: MCPTransportRouter | undefined;

/**
 * Mounts the real OAuth proxy router AHEAD of the transport router under MOUNT — the standalone
 * server's order — so the SSE /messages route proves the proxy no longer consumes its raw body.
 */
async function startServer(
    options: Partial<MCPTransportRouterOptions> = {},
    cors: RequestHandler = MCPCorsMiddleware
): Promise<string> {
    transportRouter = BuildMCPTransportRouter({ SSEMessagesPath: `${MOUNT}/messages`, Sessions: fakeSessions, ...options });
    const oauthProxy = CreateOAuthProxyRouter({
        baseUrl: 'https://x.example/api/mcp',
        upstream: { authorizationEndpoint: 'https://idp.example/authorize', tokenEndpoint: 'https://idp.example/token', clientId: 'c', scopes: ['openid'] },
        enableDynamicRegistration: false,
        rateLimit: { limit: 1000 },
    });
    const app = express();
    app.use(MOUNT, cors, oauthProxy, transportRouter.Router);
    const s = app.listen(0);
    httpServer = s;
    await new Promise<void>(resolve => s.once('listening', () => resolve()));
    return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}

beforeEach(() => {
    keys.clear();
    keys.set('key-a', userA);
    keys.set('key-a-narrow', userA); // a second key for the same user
    keys.set('key-b', userB);
    createSessionServer.mockClear();
});

afterEach(async () => {
    await transportRouter?.Shutdown();
    transportRouter = undefined;
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

/** Opens a Streamable HTTP session as the user behind `key`; returns the client and its session ID. */
async function openSession(base: string, key: string): Promise<{ client: Client; transport: StreamableHTTPClientTransport; sessionId: string }> {
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${base}${MOUNT}`), {
        requestInit: { headers: { 'x-api-key': key } },
    });
    await client.connect(transport);
    expect(transport.sessionId).toBeTruthy();
    return { client, transport, sessionId: transport.sessionId! };
}

/** A raw tools/list on an existing session, as the user behind `key`. */
function listToolsRaw(base: string, sessionId: string, key: string): Promise<Response> {
    return fetch(`${base}${MOUNT}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
            'x-api-key': key, 'mcp-session-id': sessionId, 'mcp-protocol-version': '2025-06-18',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    });
}

/** Polls (bounded) until the router reports `count` open sessions. */
async function waitForSessionCount(count: number, timeoutMs: number): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    while (transportRouter!.SessionCount() !== count && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    return transportRouter!.SessionCount();
}

describe('BuildMCPTransportRouter mounted under a prefix', () => {
    it('serves Streamable HTTP at the mount root to a real SDK client', async () => {
        const base = await startServer();
        const { client } = await openSession(base, 'key-a');

        expect(await echoThrough(client)).toBe('hi');
        expect(transportRouter!.SessionCount()).toBe(1);
        await client.close();
    });

    it('tells legacy SSE clients the public messages path, and routes their messages', async () => {
        const base = await startServer();
        const headers = { 'x-api-key': 'key-a' };
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
        const res = await fetch(`${base}${MOUNT}/sse`, { headers: { 'x-api-key': 'key-a' } });
        const reader = res.body!.getReader();
        const first = new TextDecoder().decode((await reader.read()).value);
        await reader.cancel();

        expect(first).toContain('event: endpoint');
        expect(first).toMatch(/data: \/api\/mcp\/messages\?sessionId=[\w-]+/);
    });

    it('refuses an unauthenticated request, with no resource_metadata while OAuth is off', async () => {
        const base = await startServer();
        const res = await fetch(`${base}${MOUNT}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
        });
        await res.text();

        expect(res.status).toBe(401);
        expect(res.headers.get('www-authenticate')).toBe('Bearer');
    });

    it('rejects a relative SSE messages path', () => {
        expect(() => BuildMCPTransportRouter({ SSEMessagesPath: 'mcp/messages', Sessions: fakeSessions }))
            .toThrow(/absolute path/);
    });
});

describe('Streamable HTTP sessions', () => {
    it('answers an unknown session ID with the spec\'s 404, so the client starts over', async () => {
        const base = await startServer();
        const res = await listToolsRaw(base, 'no-such-session', 'key-a');
        const body = await res.json() as { error: { code: number } };

        expect(res.status).toBe(404);
        expect(body.error.code).toBe(-32001);
        expect(transportRouter!.SessionCount()).toBe(0);
    });

    it('gives another user\'s session ID the same 404, so a session ID alone grants nothing', async () => {
        const base = await startServer();
        const { client, sessionId } = await openSession(base, 'key-a');

        const res = await listToolsRaw(base, sessionId, 'key-b');
        await res.text();

        expect(res.status).toBe(404);
        await client.close();
    });

    it('stops an open session as soon as its key is revoked', async () => {
        const base = await startServer();
        const { client, sessionId } = await openSession(base, 'key-a');
        keys.delete('key-a');

        const res = await listToolsRaw(base, sessionId, 'key-a');
        await res.text();

        expect(res.status).toBe(401);
        await client.close();
    });

    it('drops a session the client ends with DELETE', async () => {
        const base = await startServer();
        const { client, transport } = await openSession(base, 'key-a');
        expect(transportRouter!.SessionCount()).toBe(1);

        await transport.terminateSession();

        expect(await waitForSessionCount(0, 2_000)).toBe(0);
        await client.close();
    });

    it('closes a session left idle after the client goes away without DELETE', async () => {
        const base = await startServer({ IdleSessionTimeoutMs: 50, SweepIntervalMs: 20 });
        const { client } = await openSession(base, 'key-a');
        await client.close(); // the SDK client's close() does not end the server session

        expect(await waitForSessionCount(0, 2_000)).toBe(0);
    });

    it('builds nothing for a request that is not an initialize (building registers every tool)', async () => {
        const base = await startServer();
        const post = await fetch(`${base}${MOUNT}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'x-api-key': 'key-a' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
        });
        await post.text();
        const get = await fetch(`${base}${MOUNT}`, { headers: { Accept: 'text/event-stream', 'x-api-key': 'key-a' } });
        await get.text();

        expect(post.status).toBe(400);
        expect(get.status).toBe(400);
        expect(createSessionServer).not.toHaveBeenCalled();
        expect(transportRouter!.SessionCount()).toBe(0);
    });

    it('answers a body that is not JSON with JSON-RPC\'s parse error', async () => {
        const base = await startServer();
        const res = await fetch(`${base}${MOUNT}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'x-api-key': 'key-a' },
            body: '{not json',
        });
        const body = await res.json() as { error: { code: number } };

        expect(res.status).toBe(400);
        expect(body.error.code).toBe(-32700);
    });

    it('REGRESSION: gives the same user\'s other credential a 404, so a session keeps the rights it was opened with', async () => {
        const base = await startServer();
        const { client, sessionId } = await openSession(base, 'key-a');

        const res = await listToolsRaw(base, sessionId, 'key-a-narrow');
        await res.text();

        expect(res.status).toBe(404);
        await client.close();
    });
});

describe('MCP CORS', () => {
    it('lets a browser client send DELETE and the MCP headers, and read the session ID', async () => {
        const base = await startServer();
        const res = await fetch(`${base}${MOUNT}`, { method: 'OPTIONS', headers: { Origin: 'https://inspector.example' } });
        await res.text();

        expect(res.status).toBe(200);
        expect(res.headers.get('access-control-allow-origin')).toBe('*');
        expect(res.headers.get('access-control-allow-methods')).toContain('DELETE');
        const allowed = res.headers.get('access-control-allow-headers') ?? '';
        for (const header of ['mcp-session-id', 'mcp-protocol-version', 'last-event-id', 'Authorization']) {
            expect(allowed).toContain(header);
        }
        expect(res.headers.get('access-control-expose-headers')).toContain('mcp-session-id');
    });

    it('with an origin list, allows only the listed origins', async () => {
        const base = await startServer({}, CreateMCPCorsMiddleware(['https://app.example']));

        const listed = await fetch(`${base}${MOUNT}`, { method: 'OPTIONS', headers: { Origin: 'https://app.example' } });
        await listed.text();
        const other = await fetch(`${base}${MOUNT}`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
        await other.text();

        expect(listed.headers.get('access-control-allow-origin')).toBe('https://app.example');
        expect(other.headers.get('access-control-allow-origin')).toBeNull();
        expect(other.headers.get('vary')).toContain('Origin');
    });
});

describe('legacy SSE messages', () => {
    /** Opens an SSE stream as `key` and returns its session ID from the endpoint event, plus a closer. */
    async function openSSE(base: string, key: string): Promise<{ sessionId: string; close: () => Promise<void> }> {
        const res = await fetch(`${base}${MOUNT}/sse`, { headers: { 'x-api-key': key } });
        const reader = res.body!.getReader();
        const first = new TextDecoder().decode((await reader.read()).value);
        const match = /sessionId=([\w-]+)/.exec(first);
        expect(match).not.toBeNull();
        return { sessionId: match![1], close: () => reader.cancel() };
    }

    function postMessage(base: string, sessionId: string, key: string | undefined): Promise<Response> {
        return fetch(`${base}${MOUNT}/messages?sessionId=${sessionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(key ? { 'x-api-key': key } : {}) },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
        });
    }

    it('REGRESSION: refuses a post without credentials, although the session ID is valid', async () => {
        const base = await startServer();
        const sse = await openSSE(base, 'key-a');

        const res = await postMessage(base, sse.sessionId, undefined);
        await res.text();

        expect(res.status).toBe(401);
        await sse.close();
    });

    it('refuses a post once the key that opened the stream is revoked', async () => {
        const base = await startServer();
        const sse = await openSSE(base, 'key-a');
        keys.delete('key-a');

        const res = await postMessage(base, sse.sessionId, 'key-a');
        await res.text();

        expect(res.status).toBe(401);
        await sse.close();
    });

    it('treats a post with another credential as an unknown session', async () => {
        const base = await startServer();
        const sse = await openSSE(base, 'key-a');

        const res = await postMessage(base, sse.sessionId, 'key-b');
        const body = await res.json() as { error: string };

        expect(res.status).toBe(401);
        expect(body.error).toBe('session_expired');
        await sse.close();
    });

    it('accepts a post from the credential that opened the stream', async () => {
        const base = await startServer();
        const sse = await openSSE(base, 'key-a');

        const res = await postMessage(base, sse.sessionId, 'key-a');
        await res.text();

        expect(res.status).toBe(202);
        await sse.close();
    });
});
