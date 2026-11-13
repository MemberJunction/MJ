/**
 * OAuth discovery and the OAuth proxy, mounted under a prefix the way MJAPI mounts them
 * (`/api/mcp`, Explorer owning the host root). Every URL a client is sent to must sit under the
 * proxy's base URL, which is the public MCP endpoint.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

// ScopeService reaches @memberjunction/server, whose config loader validates database settings
// at import time. These routes never consult it.
vi.mock('../auth/ScopeService.js', () => ({
    LoadActiveScopes: async () => [],
    GetDefaultScopes: () => [],
    GroupScopesHierarchically: () => ({ fullAccessScope: null, categories: new Map() }),
}));

import { CreateOAuthProxyRouter } from '../auth/OAuthProxyRouter.js';
import { GetAuthorizationStateManager } from '../auth/AuthorizationStateManager.js';
import { BuildProtectedResourceMetadata } from '../auth/ProtectedResourceMetadata.js';
import { SetHostedResourceIdentifier } from '../auth/OAuthConfig.js';
import type { OAuthProxyConfig } from '../auth/OAuthProxyTypes.js';

const PUBLIC_ENDPOINT = 'https://app.example.test/api/mcp';
const MOUNT = '/api/mcp';

const config: OAuthProxyConfig = {
    baseUrl: PUBLIC_ENDPOINT,
    upstream: {
        authorizationEndpoint: 'https://idp.example.test/authorize',
        tokenEndpoint: 'https://idp.example.test/token',
        clientId: 'upstream-client',
        scopes: ['openid'],
    },
    enableDynamicRegistration: true,
    enableConsentScreen: true,
};

let server: Server;
let base: string;

beforeAll(async () => {
    const app = express();
    app.use(MOUNT, CreateOAuthProxyRouter(config));
    server = app.listen(0);
    await new Promise<void>(resolve => server.once('listening', () => resolve()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(err => (err ? reject(err) : resolve())));
});

async function getJson(path: string): Promise<Record<string, unknown>> {
    const res = await fetch(`${base}${path}`);
    expect(res.status).toBe(200);
    return await res.json() as Record<string, unknown>;
}

describe('OAuth proxy mounted under /api/mcp', () => {
    it('publishes authorization server metadata whose issuer and endpoints sit under the public endpoint', async () => {
        const metadata = await getJson(`${MOUNT}/.well-known/oauth-authorization-server`);

        expect(metadata.issuer).toBe(PUBLIC_ENDPOINT);
        for (const key of ['authorization_endpoint', 'token_endpoint', 'registration_endpoint']) {
            expect(String(metadata[key])).toMatch(new RegExp(`^${PUBLIC_ENDPOINT}/oauth/`));
        }
        expect(metadata.code_challenge_methods_supported).toContain('S256');
    });

    it('serves the same document at {issuer}/.well-known/openid-configuration, the spec fallback under the issuer path', async () => {
        const oauth = await getJson(`${MOUNT}/.well-known/oauth-authorization-server`);
        const oidc = await getJson(`${MOUNT}/.well-known/openid-configuration`);

        expect(oidc).toEqual(oauth);
    });

    it('posts the consent form to the public consent URL, not a host-root /oauth/consent', async () => {
        const requestId = GetAuthorizationStateManager().CreateConsentRequest({
            user: { email: 'user@example.test', mjUserId: 'user-1' },
            upstreamProvider: 'test-idp',
            upstreamSub: 'sub-1',
            availableScopes: [],
            redirectUri: 'https://client.example.test/callback',
            clientId: 'client-1',
        });

        const res = await fetch(`${base}${MOUNT}/oauth/consent?request_id=${requestId}`);
        const html = await res.text();

        expect(res.status).toBe(200);
        expect(html).toContain(`action="${PUBLIC_ENDPOINT}/oauth/consent"`);
        expect(html).not.toContain('action="/oauth/consent"');
    });
});

describe('Protected Resource Metadata when hosted', () => {
    it('names the public MCP endpoint as the resource and the proxy as its authorization server', () => {
        SetHostedResourceIdentifier(PUBLIC_ENDPOINT);
        try {
            const metadata = BuildProtectedResourceMetadata({
                authorizationServers: [],
                resourceName: 'MemberJunction MCP Server',
                useOAuthProxy: true,
                oauthProxyBaseUrl: PUBLIC_ENDPOINT,
            });

            expect(metadata.resource).toBe(PUBLIC_ENDPOINT);
            expect(metadata.authorization_servers).toEqual([PUBLIC_ENDPOINT]);
        } finally {
            SetHostedResourceIdentifier(undefined);
        }
    });
});
