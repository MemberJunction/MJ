import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Application } from 'express';

vi.mock('@memberjunction/server', () => ({}));

import { ValidateServerExtensionRootPath, GetCorsOwningServerExtensionRoots, PrepareServerExtensionConfigs } from '@memberjunction/server-extensions-core';
import { ResolveMCPMount, ParseMCPExtensionToolFilter, MCPServerExtension, MJ_SERVER_EXTENSIONS } from '../MCPServerExtension.js';
import { GetResourceIdentifier, SetHostedResourceIdentifier } from '../auth/OAuthConfig.js';

/** Stands in for MJServer's ApiRoute(subpath, { absolute: true }) with a given public base. */
const publicBase = (base: string) => (subpath: string) => `${base}${subpath}`;

describe('ResolveMCPMount', () => {
    it('serves under the base path: Explorer at /, MJAPI at /api', () => {
        expect(ResolveMCPMount('/api/mcp', '/api', publicBase('https://app.example.com/api'))).toEqual({
            MountPath: '/api/mcp',
            PublicEndpointUrl: 'https://app.example.com/api/mcp',
            SSEMessagesPath: '/api/mcp/messages',
        });
    });

    it('serves at the root when MJAPI has no base path', () => {
        expect(ResolveMCPMount('/mcp', '', publicBase('https://api.example.com'))).toEqual({
            MountPath: '/mcp',
            PublicEndpointUrl: 'https://api.example.com/mcp',
            SSEMessagesPath: '/mcp/messages',
        });
    });

    it('builds public URLs from the public base, not from the mount path, when a proxy rewrites the prefix', () => {
        // The proxy serves MJAPI at /backend publicly and forwards to MJAPI's /api.
        const mount = ResolveMCPMount('/api/mcp', '/api', publicBase('https://app.example.com/backend'));
        expect(mount.MountPath).toBe('/api/mcp');
        expect(mount.PublicEndpointUrl).toBe('https://app.example.com/backend/mcp');
        expect(mount.SSEMessagesPath).toBe('/backend/mcp/messages');
    });

    it('passes the root relative to the base path, and tolerates trailing slashes', () => {
        const seen: string[] = [];
        const mount = ResolveMCPMount('/api/mcp/', '/api/', (sub) => { seen.push(sub); return `https://app.example.com/api${sub}/`; });
        expect(seen).toEqual(['/mcp']);
        expect(mount.PublicEndpointUrl).toBe('https://app.example.com/api/mcp');
    });

    it('refuses a RootPath outside, or equal to, the base path', () => {
        expect(() => ResolveMCPMount('/mcp', '/api', publicBase('https://x.example/api'))).toThrow(/not under MJAPI's base path/);
        expect(() => ResolveMCPMount('/apimcp', '/api', publicBase('https://x.example/api'))).toThrow(/not under MJAPI's base path/);
        expect(() => ResolveMCPMount('/api', '/api', publicBase('https://x.example/api'))).toThrow(/below MJAPI's base path/);
    });
});

describe('ParseMCPExtensionToolFilter', () => {
    it('maps IncludeTools/ExcludeTools onto the tool filter', () => {
        expect(ParseMCPExtensionToolFilter({ IncludeTools: ['Get_*'], ExcludeTools: ['*_Delete'] }))
            .toEqual({ includePatterns: ['Get_*'], excludePatterns: ['*_Delete'] });
    });

    it('returns an empty filter when neither is set', () => {
        expect(ParseMCPExtensionToolFilter({})).toEqual({});
        expect(ParseMCPExtensionToolFilter(undefined)).toEqual({});
    });

    it('rejects a non-array setting', () => {
        expect(() => ParseMCPExtensionToolFilter({ IncludeTools: 'Get_*' })).toThrow(/array of strings/);
    });
});

describe('SetHostedResourceIdentifier', () => {
    afterEach(() => SetHostedResourceIdentifier(undefined));

    it('becomes the resource identifier when none is configured', () => {
        SetHostedResourceIdentifier('https://app.example.com/api/mcp');
        expect(GetResourceIdentifier()).toBe('https://app.example.com/api/mcp');
    });

    it('rejects a relative URL or a trailing slash', () => {
        expect(() => SetHostedResourceIdentifier('/api/mcp')).toThrow(/absolute/);
        expect(() => SetHostedResourceIdentifier('https://app.example.com/api/mcp/')).toThrow(/trailing slash/);
    });
});

describe('MCPServerExtension', () => {
    it('mounts before MJAPI authentication', () => {
        expect(new MCPServerExtension().DefaultPhase).toBe('pre-auth');
    });

    it('fails to load, without mounting anything, on the legacy (app, config) form', async () => {
        const use = vi.fn();
        const app = Object.assign(() => undefined, { use });
        const result = await new MCPServerExtension().Initialize(
            app as unknown as Application,
            { Enabled: true, DriverClass: 'MCPServerExtension', RootPath: '/mcp', Settings: {} },
        );
        expect(result.Success).toBe(false);
        expect(result.Message).toMatch(/context form/);
        expect(use).not.toHaveBeenCalled();
    });

    it('reports unhealthy until it has mounted', async () => {
        const health = await new MCPServerExtension().HealthCheck();
        expect(health).toMatchObject({ Healthy: false, Name: 'MCPServerExtension' });
    });
});

describe('MJ_SERVER_EXTENSIONS', () => {
    it('publishes one enabled MCPServerExtension entry that owns its CORS', () => {
        expect(MJ_SERVER_EXTENSIONS).toHaveLength(1);
        expect(MJ_SERVER_EXTENSIONS[0]).toMatchObject({ Enabled: true, DriverClass: 'MCPServerExtension', OwnsCORS: true });
    });

    it('passes MJAPI\'s RootPath validation and composes under the base path', () => {
        expect(ValidateServerExtensionRootPath(MJ_SERVER_EXTENSIONS[0].RootPath)).toBeFalsy();
        const prepared = PrepareServerExtensionConfigs(MJ_SERVER_EXTENSIONS, { apiRootPath: '/api' });
        expect(prepared.map(c => c.RootPath)).toEqual(['/api/mcp']);
        expect(GetCorsOwningServerExtensionRoots(prepared)).toEqual(['/api/mcp']);
    });
});
