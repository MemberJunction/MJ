/**
 * MCPServerExtension.Initialize against MJAPI's real context values, with the router factory and
 * MJServer's ApiRoute faked so no database is needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { RequestHandler } from 'express';
import type { AddressInfo } from 'net';
import {
    discoverAuthorizationServerMetadata,
    discoverOAuthProtectedResourceMetadata,
} from '@modelcontextprotocol/sdk/client/auth.js';
import { ServerExtensionLoader } from '@memberjunction/server-extensions-core';
import type { ServerExtensionInitContext } from '@memberjunction/server-extensions-core';

const fakes = vi.hoisted(() => ({
    createMCPRouters: vi.fn(),
    /** MJServer's fallback with no MJAPI_PUBLIC_URL: baseUrl:port + the base path. */
    apiRoute: (subpath: string) => `http://localhost:4000/api${subpath}`,
    configuredResourceIdentifier: undefined as string | undefined,
    trustProxy: undefined as boolean | undefined,
    authMode: undefined as 'apiKey' | 'oauth' | 'both' | 'none' | undefined,
    systemApiKey: undefined as string | undefined,
    /** MJAPI_BASE_PATH as ApiRoute composes it. */
    basePath: '/api',
    multiTenancyEnabled: false,
}));

vi.mock('@memberjunction/server', () => ({
    ApiRoute: (subpath: string, options?: { absolute?: boolean }) =>
        options?.absolute ? fakes.apiRoute(subpath) : `${fakes.basePath}${subpath}`,
    get configInfo() {
        return { cors: { allowedOrigins: ['*'] }, multiTenancy: { enabled: fakes.multiTenancyEnabled } };
    },
}));
vi.mock('../Server.js', () => ({
    CreateMCPRouters: fakes.createMCPRouters,
    CreateMCPCorsMiddleware: () => ((_req, _res, next) => next()) as RequestHandler,
}));
// ScopeService reaches @memberjunction/server's config loader; the metadata handler never consults it.
vi.mock('../auth/ScopeService.js', () => ({
    LoadActiveScopes: async () => [],
    GetDefaultScopes: () => [],
    GroupScopesHierarchically: () => ({ fullAccessScope: null, categories: new Map() }),
}));
vi.mock('../config.js', () => ({
    get McpServerSettings() {
        return {
            auth: fakes.configuredResourceIdentifier ? { resourceIdentifier: fakes.configuredResourceIdentifier } : undefined,
            trustProxy: fakes.trustProxy,
            systemApiKey: fakes.systemApiKey,
        };
    },
    get McpServerAuth() {
        return fakes.authMode ? { mode: fakes.authMode } : undefined;
    },
    InitConfig: async () => ({}),
}));

import { MCPServerExtension } from '../MCPServerExtension.js';
import { CreateAuthorizationServerMetadataHandler } from '../auth/OAuthProxyRouter.js';
import { GetResourceIdentifier, SetHostedResourceIdentifier } from '../auth/OAuthConfig.js';

function contextFor(rootPath: string, apiRootPath: string, publicUrl: string): ServerExtensionInitContext {
    return {
        app: express(),
        config: { Enabled: true, DriverClass: 'MCPServerExtension', RootPath: rootPath, OwnsCORS: true, Settings: {} },
        publicUrl,
        apiRootPath,
        services: { RegisterService: vi.fn(), GetService: vi.fn(), HasService: vi.fn() },
        phase: 'pre-auth',
    };
}

beforeEach(() => {
    fakes.configuredResourceIdentifier = undefined;
    fakes.trustProxy = undefined;
    fakes.authMode = undefined;
    fakes.systemApiKey = undefined;
    fakes.basePath = '/api';
    fakes.multiTenancyEnabled = false;
    fakes.apiRoute = (subpath: string) => `http://localhost:4000/api${subpath}`;
    fakes.createMCPRouters.mockReset();
    fakes.createMCPRouters.mockResolvedValue({
        Transport: { Router: express.Router(), SessionCount: () => 0, Shutdown: async () => undefined },
        Discovery: express.Router(),
        WellKnown: { ProtectedResource: undefined, AuthorizationServer: undefined },
    });
});

afterEach(() => {
    SetHostedResourceIdentifier(undefined);
    vi.restoreAllMocks();
});

describe('MCPServerExtension.Initialize', () => {
    it('REGRESSION: builds the public URL with ApiRoute, not the context publicUrl, which drops the base path when MJAPI_PUBLIC_URL is unset', async () => {
        // MJServer passes ConfiguredPublicUrl(): with no MJAPI_PUBLIC_URL that is baseUrl:port + GRAPHQL_ROOT_PATH.
        const result = await new MCPServerExtension().Initialize(contextFor('/api/mcp', '/api', 'http://localhost:4000/'));

        expect(result.Success).toBe(true);
        expect(GetResourceIdentifier()).toBe('http://localhost:4000/api/mcp');
        expect(fakes.createMCPRouters).toHaveBeenCalledWith(expect.objectContaining({ SSEMessagesPath: '/api/mcp/messages' }));
    });

    it('follows MJAPI_PUBLIC_URL when a proxy rewrites the prefix', async () => {
        fakes.apiRoute = (subpath: string) => `https://app.example.com/backend${subpath}`;
        const result = await new MCPServerExtension().Initialize(contextFor('/api/mcp', '/api', 'https://app.example.com/backend'));

        expect(result.Success).toBe(true);
        expect(GetResourceIdentifier()).toBe('https://app.example.com/backend/mcp');
        expect(fakes.createMCPRouters).toHaveBeenCalledWith(expect.objectContaining({ SSEMessagesPath: '/backend/mcp/messages' }));
        fakes.apiRoute = (subpath: string) => `http://localhost:4000/api${subpath}`;
    });

    it('warns when a configured resourceIdentifier overrides the URL it is actually served at', async () => {
        fakes.configuredResourceIdentifier = 'http://localhost:3100';
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const result = await new MCPServerExtension().Initialize(contextFor('/api/mcp', '/api', 'http://localhost:4000/'));

        expect(result.Success).toBe(true);
        expect(GetResourceIdentifier()).toBe('http://localhost:3100');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('resourceIdentifier'));
    });

    it('warns that mcpServerSettings.trustProxy has no effect inside MJAPI', async () => {
        fakes.trustProxy = true;
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        await new MCPServerExtension().Initialize(contextFor('/api/mcp', '/api', 'http://localhost:4000/'));

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('trustProxy'));
    });

    it('refuses to load with auth mode none, which would serve the system user to anyone on MJAPI\'s port', async () => {
        fakes.authMode = 'none';

        const result = await new MCPServerExtension().Initialize(contextFor('/api/mcp', '/api', 'http://localhost:4000/'));

        expect(result.Success).toBe(false);
        expect(result.Message).toMatch(/auth\.mode 'none'/);
        expect(fakes.createMCPRouters).not.toHaveBeenCalled();
    });

    it('refuses to load while systemApiKey is the stock mj.config.cjs placeholder (a public superuser key)', async () => {
        fakes.systemApiKey = 'MY_API_KEY_FOR_MCP_SERVER';

        const result = await new MCPServerExtension().Initialize(contextFor('/api/mcp', '/api', 'http://localhost:4000/'));

        expect(result.Success).toBe(false);
        expect(result.Message).toMatch(/systemApiKey/);
        expect(fakes.createMCPRouters).not.toHaveBeenCalled();
        expect(GetResourceIdentifier()).toBe('http://localhost:3100');
    });

    it('loads with a real systemApiKey, or none', async () => {
        fakes.systemApiKey = 'a-real-secret-value';
        expect((await new MCPServerExtension().Initialize(contextFor('/api/mcp', '/api', 'http://localhost:4000/'))).Success).toBe(true);

        fakes.systemApiKey = undefined;
        expect((await new MCPServerExtension().Initialize(contextFor('/api/mcp', '/api', 'http://localhost:4000/'))).Success).toBe(true);
    });

    it('turns off API keys in the URL query string', async () => {
        await new MCPServerExtension().Initialize(contextFor('/api/mcp', '/api', 'http://localhost:4000/'));

        expect(fakes.createMCPRouters).toHaveBeenCalledWith(expect.objectContaining({ AllowQueryStringApiKey: false }));
    });

    it('refuses to load while MJAPI multi-tenancy is on (MCP requests would carry no tenant)', async () => {
        fakes.multiTenancyEnabled = true;

        const result = await new MCPServerExtension().Initialize(contextFor('/api/mcp', '/api', 'http://localhost:4000/'));

        expect(result.Success).toBe(false);
        expect(result.Message).toMatch(/multi-tenancy/);
        expect(fakes.createMCPRouters).not.toHaveBeenCalled();
    });

    it('clears the hosted identifier on shutdown', async () => {
        const extension = new MCPServerExtension();
        await extension.Initialize(contextFor('/api/mcp', '/api', 'http://localhost:4000/'));
        expect(GetResourceIdentifier()).toBe('http://localhost:4000/api/mcp');

        await extension.Shutdown();

        expect(GetResourceIdentifier()).toBe('http://localhost:3100');
    });

    it('clears the hosted identifier when building the routers fails', async () => {
        fakes.createMCPRouters.mockRejectedValue(new Error('System user not found'));

        const result = await new MCPServerExtension().Initialize(contextFor('/api/mcp', '/api', 'http://localhost:4000/'));

        expect(result).toMatchObject({ Success: false, Message: 'System user not found' });
        expect(GetResourceIdentifier()).toBe('http://localhost:3100');
    });
});

describe('MCPServerExtension through MJAPI\'s ServerExtensionLoader', () => {
    it('REGRESSION: is handed the context form, so it loads (the loader picks the form by Initialize.length)', async () => {
        const loader = new ServerExtensionLoader();
        await loader.LoadExtensions(express(), [
            { Enabled: true, DriverClass: 'MCPServerExtension', RootPath: '/api/mcp', OwnsCORS: true, Settings: {} },
        ], { phase: 'pre-auth', publicUrl: 'http://localhost:4000/', apiRootPath: '/api' });

        expect(loader.ExtensionCount).toBe(1);
        expect(GetResourceIdentifier()).toBe('http://localhost:4000/api/mcp');
    });
});

describe('MCPServerExtension discovery with the real MCP SDK client', () => {
    /**
     * MJAPI at the host root (no base path): every route the extension does not serve answers 401,
     * as MJAPI's authentication would.
     */
    async function withBareMJAPI(run: (origin: string) => Promise<void>): Promise<void> {
        const app = express();
        const server = app.listen(0);
        await new Promise<void>(resolve => server.once('listening', () => resolve()));
        const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        try {
            fakes.basePath = '';
            fakes.apiRoute = (subpath: string) => `${origin}${subpath}`;
            const issuer = `${origin}/mcp`;
            fakes.createMCPRouters.mockResolvedValue({
                Transport: { Router: express.Router(), SessionCount: () => 0, Shutdown: async () => undefined },
                Discovery: express.Router(),
                WellKnown: {
                    ProtectedResource: ((_req, res) => { res.json({ resource: issuer, authorization_servers: [issuer] }); }) as RequestHandler,
                    AuthorizationServer: CreateAuthorizationServerMetadataHandler({
                        baseUrl: issuer,
                        upstream: { authorizationEndpoint: 'https://idp.example/authorize', tokenEndpoint: 'https://idp.example/token', clientId: 'c', scopes: ['openid'] },
                        enableDynamicRegistration: true,
                    }),
                },
            });
            const result = await new MCPServerExtension().Initialize({ ...contextFor('/mcp', '', `${origin}/`), app });
            expect(result.Success).toBe(true);
            app.use((_req, res) => { res.status(401).json({ error: 'unauthorized' }); });
            await run(origin);
        } finally {
            server.closeAllConnections();
            await new Promise<void>((resolve, reject) => server.close(err => (err ? reject(err) : resolve())));
        }
    }

    it('REGRESSION: the SDK finds the OAuth proxy at /.well-known/oauth-authorization-server/mcp', async () => {
        await withBareMJAPI(async (origin) => {
            const metadata = await discoverAuthorizationServerMetadata(`${origin}/mcp`);
            expect(metadata?.issuer).toBe(`${origin}/mcp`);
            expect(metadata?.token_endpoint).toBe(`${origin}/mcp/oauth/token`);
        });
    });

    it('the SDK finds protected resource metadata by path insertion, with no 401 header to follow', async () => {
        await withBareMJAPI(async (origin) => {
            const metadata = await discoverOAuthProtectedResourceMetadata(`${origin}/mcp`);
            expect(metadata.resource).toBe(`${origin}/mcp`);
        });
    });
});
