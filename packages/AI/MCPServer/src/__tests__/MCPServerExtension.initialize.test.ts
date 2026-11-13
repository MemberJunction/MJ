/**
 * MCPServerExtension.Initialize against MJAPI's real context values, with the router factory and
 * MJServer's ApiRoute faked so no database is needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { RequestHandler } from 'express';
import type { ServerExtensionInitContext } from '@memberjunction/server-extensions-core';

const fakes = vi.hoisted(() => ({
    createMCPRouters: vi.fn(),
    /** MJServer's fallback with no MJAPI_PUBLIC_URL: baseUrl:port + the base path. */
    apiRoute: (subpath: string) => `http://localhost:4000/api${subpath}`,
    configuredResourceIdentifier: undefined as string | undefined,
    trustProxy: undefined as boolean | undefined,
}));

vi.mock('@memberjunction/server', () => ({
    ApiRoute: (subpath: string, options?: { absolute?: boolean }) =>
        options?.absolute ? fakes.apiRoute(subpath) : `/api${subpath}`,
}));
vi.mock('../Server.js', () => ({
    CreateMCPRouters: fakes.createMCPRouters,
    MCPCorsMiddleware: ((_req, _res, next) => next()) as RequestHandler,
}));
vi.mock('../config.js', () => ({
    get McpServerSettings() {
        return {
            auth: fakes.configuredResourceIdentifier ? { resourceIdentifier: fakes.configuredResourceIdentifier } : undefined,
            trustProxy: fakes.trustProxy,
        };
    },
    McpServerAuth: undefined,
    InitConfig: async () => ({}),
}));

import { MCPServerExtension } from '../MCPServerExtension.js';
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
    fakes.createMCPRouters.mockReset();
    fakes.createMCPRouters.mockResolvedValue({
        Transport: { Router: express.Router(), SessionCount: () => 0, Shutdown: async () => undefined },
        Discovery: express.Router(),
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

    it('clears the hosted identifier when building the routers fails', async () => {
        fakes.createMCPRouters.mockRejectedValue(new Error('System user not found'));

        const result = await new MCPServerExtension().Initialize(contextFor('/api/mcp', '/api', 'http://localhost:4000/'));

        expect(result).toMatchObject({ Success: false, Message: 'System user not found' });
        expect(GetResourceIdentifier()).toBe('http://localhost:3100');
    });
});
