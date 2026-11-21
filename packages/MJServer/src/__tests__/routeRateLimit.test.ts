/**
 * Per-route limiters on MJAPI's unauthenticated / capability-token routes (#5568): the OAuth
 * callback and authenticated routers and the media streaming / upload-staging router each mount
 * an `express-rate-limit` handler, on by default, configurable and removable per route group.
 * Runs real Express apps on an ephemeral port so the 429 is the limiter's own.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import express, { type Router } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
// The media router imports the auth barrel, which loads (and validates) the server config; the
// handlers under test never reach the system user, so a stub keeps the test config-free.
vi.mock('../auth/index.js', () => ({ GetSystemUser: vi.fn() }));

import { CreateRouteRateLimiter } from '../rest/routeRateLimit.js';
import { DEFAULT_ROUTE_RATE_LIMITS } from '../routeRateLimitConfigUnits.js';
import { CreateMediaStreamRouter } from '../rest/MediaStreamHandler.js';
import { CreateOAuthCallbackHandler } from '../rest/OAuthCallbackHandler.js';

let server: Server | undefined;

afterEach(async () => {
    if (server) {
        await new Promise<void>((resolve) => server!.close(() => resolve()));
        server = undefined;
    }
});

async function serve(mount: string, router: Router): Promise<string> {
    const app = express();
    app.use(mount, router);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server!.once('listening', () => resolve()));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}${mount}`;
}

async function statuses(url: string, count: number, init?: RequestInit): Promise<number[]> {
    const result: number[] = [];
    for (let i = 0; i < count; i++) {
        const res = await fetch(url, init);
        await res.arrayBuffer();
        result.push(res.status);
    }
    return result;
}

describe('CreateRouteRateLimiter', () => {
    it('every route group is on by default', () => {
        for (const settings of Object.values(DEFAULT_ROUTE_RATE_LIMITS)) {
            expect(settings.enabled).toBe(true);
            expect(settings.maxRequests).toBeGreaterThan(0);
        }
        expect(CreateRouteRateLimiter('mediaRead')).toHaveLength(1);
    });

    it('returns no middleware when the group is disabled', () => {
        expect(CreateRouteRateLimiter('mediaUpload', { enabled: false })).toHaveLength(0);
    });

    it('answers 429 with a JSON body past the configured max', async () => {
        const router = express.Router();
        router.get('/x', ...CreateRouteRateLimiter('oauthCallback', { maxRequests: 2 }), (_req, res) => { res.send('ok'); });
        const base = await serve('/t', router);
        expect(await statuses(`${base}/x`, 3)).toEqual([200, 200, 429]);
        const body = await (await fetch(`${base}/x`)).json();
        expect(body).toEqual({ error: 'Too many requests, please try again later' });
    });
});

describe('media router limiters', () => {
    it('limits POST /upload-stage before the body is read', async () => {
        const base = await serve('/media', CreateMediaStreamRouter({ RateLimits: { Upload: { maxRequests: 1 } } }));
        // The first request is refused by the handler (no upload token); the second by the limiter.
        expect(await statuses(`${base}/upload-stage`, 2, { method: 'POST', body: 'x' })).toEqual([401, 429]);
    });

    it('a disabled upload limiter mounts nothing', async () => {
        const base = await serve('/media', CreateMediaStreamRouter({ RateLimits: { Upload: { enabled: false, maxRequests: 1 } } }));
        expect(await statuses(`${base}/upload-stage`, 3, { method: 'POST', body: 'x' })).toEqual([401, 401, 401]);
    });
});

describe('OAuth router limiters', () => {
    it('limits the unauthenticated callback pages', async () => {
        const { callbackRouter } = CreateOAuthCallbackHandler({
            publicUrl: 'https://api.example.test',
            allowedFrontendOrigins: ['https://app.example.test'],
            RateLimits: { Callback: { maxRequests: 1 } },
        });
        const base = await serve('/oauth', callbackRouter);
        expect(await statuses(`${base}/error?error=access_denied`, 2)).toEqual([200, 429]);
    });

    it('limits the authenticated routes on their own budget', async () => {
        const { authenticatedRouter } = CreateOAuthCallbackHandler({
            publicUrl: 'https://api.example.test',
            allowedFrontendOrigins: ['https://app.example.test'],
            RateLimits: { Authenticated: { maxRequests: 1 } },
        });
        const base = await serve('/oauth', authenticatedRouter);
        const [first, second] = await statuses(`${base}/status/some-state`, 2);
        expect(first).not.toBe(429);
        expect(second).toBe(429);
    });
});
