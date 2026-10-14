/**
 * Boot test for the API-root rule (MJ #5674): mounts every core route through the same functions
 * `serve()` calls, on a bare Express app, and checks where they landed.
 *
 * - `GRAPHQL_ROOT_PATH=/api/` → every registered path starts with `/api/`, and a real request to
 *   `/healthcheck` (origin root) 404s.
 * - `GRAPHQL_ROOT_PATH=/` → the paths are byte-identical to the root-mounted ones MJAPI always used.
 *
 * The router factories are stubbed (they need keys, DB, providers); the MOUNT code is real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Application, type Router } from 'express';
import type { AddressInfo } from 'node:net';
import type { ServerExtensionLoader } from '@memberjunction/server-extensions-core';

const mockConfig = vi.hoisted(() => ({
    configInfo: {
        graphqlRootPath: '/',
        publicUrl: '',
        baseUrl: 'http://localhost',
        graphqlPort: 4000,
        cors: {},
        realtime: { enabled: true, identityVerification: { enabled: true } },
        magicLink: { enabled: true },
        widget: { enabled: true },
    } as Record<string, unknown>,
}));
vi.mock('../config.js', () => mockConfig);

// vi.mock factories are hoisted above the imports, so the stubs must be hoisted with them.
const { stubRouter, stubHandler } = await vi.hoisted(async () => {
    const { Router: makeRouter } = await import('express');
    const router = (): Router => makeRouter();
    return { stubRouter: router, stubHandler: () => ({ publicRouter: router(), authenticatedRouter: router() }) };
});
vi.mock('../rest/OAuthCallbackHandler.js', () => ({
    CreateOAuthCallbackHandler: () => ({ callbackRouter: stubRouter(), authenticatedRouter: stubRouter() }),
}));
vi.mock('../rest/SignatureWebhookHandler.js', () => ({ CreateSignatureWebhookHandler: stubRouter }));
vi.mock('../rest/MediaStreamHandler.js', () => ({ CreateMediaStreamRouter: stubRouter }));
vi.mock('../rest/RealtimeSdpBrokerHandler.js', () => ({ CreateRealtimeSdpBrokerRouter: stubRouter }));
vi.mock('../auth/AuthProviderCatalogRouter.js', () => ({ CreateAuthProviderCatalogRouter: stubRouter, AUTH_CATALOG_MOUNT_PATH: '/auth' }));
vi.mock('../auth/magicLink/index.js', () => ({
    CreateMagicLinkHandler: stubHandler,
    CreateMagicLinkJwksRouter: stubRouter,
    RegisterMagicLinkAuthProvider: () => undefined,
    MAGIC_LINK_MOUNT_PATH: '/magic-link',
}));
vi.mock('../realtimeWidget/index.js', () => ({ CreateWidgetHandler: stubHandler, WIDGET_MOUNT_PATH: '/widget' }));
vi.mock('../realtimeSessions/index.js', () => ({
    CreateRealtimeVerifyRouter: stubRouter,
    REALTIME_VERIFY_MOUNT_PATH: '/realtime/verify',
    RealtimeSessionVerificationService: { Instance: { IsEnabled: true } },
}));
vi.mock('@memberjunction/ai', () => ({ REALTIME_SDP_EXCHANGE_PATH: '/realtime/sdp-exchange' }));

import {
    MountHealthcheckRoute,
    MountPublicCoreRoutes,
    MountExtensionHealthRoute,
    MountAuthCatalogRoute,
    MountAuthenticatedCoreRoutes,
} from '../coreRoutes.js';
import { ApiRoute } from '../apiRoot.js';
import { CoreReservedServerExtensionRoots } from '../serverExtensionReservedRoots.js';

const MOUNT_METHODS = ['use', 'get', 'post', 'put', 'patch', 'delete', 'all'] as const;
const log = { LogIf: () => undefined };
const loader = { HealthCheckAll: async () => [] } as unknown as ServerExtensionLoader;

/** Builds an app the way serve() does and returns it plus every path it registered, in order. */
function bootCoreRoutes(): { app: Application; paths: string[] } {
    const app = express();
    const paths: string[] = [];
    for (const method of MOUNT_METHODS) {
        const original = app[method].bind(app) as (...args: unknown[]) => Application;
        (app as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
            if (typeof args[0] === 'string') paths.push(args[0]);
            return original(...args);
        };
    }
    MountHealthcheckRoute(app);
    const routers = MountPublicCoreRoutes(app, 'http://localhost:4000/', log);
    MountExtensionHealthRoute(app, loader);
    MountAuthCatalogRoute(app, log);
    MountAuthenticatedCoreRoutes(app, routers, log);
    return { app, paths };
}

async function statusOf(app: Application, path: string): Promise<number> {
    const server = app.listen(0);
    try {
        await new Promise<void>((resolve) => server.once('listening', () => resolve()));
        const { port } = server.address() as AddressInfo;
        const res = await fetch(`http://127.0.0.1:${port}${path}`);
        return res.status;
    } finally {
        server.close();
    }
}

const ROOT_MOUNTS_BEFORE_5674 = [
    '/healthcheck',
    '/oauth',
    '/esignature',
    '/media',
    '/realtime/sdp-exchange',
    '/magic-link',
    '/widget',
    '/realtime/verify',
    '/health/extensions',
    '/auth',
    '/oauth',
    '/magic-link',
    '/widget',
];

describe('core routes under GRAPHQL_ROOT_PATH=/api/', () => {
    beforeEach(() => {
        mockConfig.configInfo.graphqlRootPath = '/api/';
        mockConfig.configInfo.magicLink = { enabled: true };
    });

    it('registers every route under /api/', () => {
        const { paths } = bootCoreRoutes();
        expect(paths.length).toBe(ROOT_MOUNTS_BEFORE_5674.length);
        for (const path of paths) {
            expect(path, `${path} is outside the API root`).toMatch(/^\/api\//);
        }
    });

    it('also mounts the widget JWKS fallback under /api/ when magic-link is off', () => {
        mockConfig.configInfo.magicLink = { enabled: false };
        const { paths } = bootCoreRoutes();
        expect(paths).toContain('/api/magic-link');
        expect(paths.every((p) => p.startsWith('/api/'))).toBe(true);
    });

    it('answers at /api/healthcheck and 404s at the origin root', async () => {
        const { app } = bootCoreRoutes();
        expect(await statusOf(app, '/api/healthcheck')).toBe(200);
        expect(await statusOf(app, '/healthcheck')).toBe(404);
    });

    it('reserves every mounted prefix for extensions (relative to the API root)', () => {
        const reserved = CoreReservedServerExtensionRoots();
        for (const path of bootCoreRoutes().paths) {
            const relative = path.slice('/api'.length);
            const covered = reserved.some((r) => relative === r || relative.startsWith(`${r}/`));
            expect(covered, `core mount ${path} is not in CoreReservedServerExtensionRoots()`).toBe(true);
        }
    });
});

describe('backward compatibility at GRAPHQL_ROOT_PATH=/', () => {
    beforeEach(() => {
        mockConfig.configInfo.graphqlRootPath = '/';
        mockConfig.configInfo.publicUrl = '';
        mockConfig.configInfo.magicLink = { enabled: true };
    });

    it('mounts byte-identical paths', () => {
        expect(bootCoreRoutes().paths).toEqual(ROOT_MOUNTS_BEFORE_5674);
    });

    it('builds byte-identical URLs', () => {
        expect(ApiRoute('/magic-link/redeem')).toBe('/magic-link/redeem');
        expect(ApiRoute('/media/upload-stage')).toBe('/media/upload-stage');
        expect(ApiRoute('/media/abc?token=t', { absolute: true })).toBe('http://localhost:4000/media/abc?token=t');
        mockConfig.configInfo.publicUrl = 'https://api.example.com';
        expect(ApiRoute('/media/abc', { absolute: true })).toBe('https://api.example.com/media/abc');
    });
});

describe('ApiRoute under a prefix', () => {
    it('prefixes paths and appends to MJAPI_PUBLIC_URL without doubling the root', () => {
        mockConfig.configInfo.graphqlRootPath = '/api/';
        mockConfig.configInfo.publicUrl = 'https://example.com/api/';
        expect(ApiRoute('/media')).toBe('/api/media');
        expect(ApiRoute('/media/abc', { absolute: true })).toBe('https://example.com/api/media/abc');
    });

    it('falls back to baseUrl:port + root when MJAPI_PUBLIC_URL is unset', () => {
        mockConfig.configInfo.graphqlRootPath = '/api/';
        mockConfig.configInfo.publicUrl = '';
        expect(ApiRoute('/magic-link/redeem', { absolute: true })).toBe('http://localhost:4000/api/magic-link/redeem');
    });

    it('rejects a subpath without a leading slash', () => {
        expect(() => ApiRoute('media')).toThrow(/must start with '\/'/);
        expect(() => ApiRoute('media', { absolute: true })).toThrow(/must start with '\/'/);
    });
});
