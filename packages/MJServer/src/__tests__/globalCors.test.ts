/**
 * MJServer's global CORS middleware vs. server extensions that own their CORS policy.
 *
 * Reproduces the BizApps Voting ballot-edge failure: the global middleware ran ahead of the
 * extension, reflected any origin onto the extension's refusals, and answered every preflight
 * with 204 so the extension's own OPTIONS handler never ran. Runs a real Express app on an
 * ephemeral port so the preflight is Express's and `cors`'s own behavior, not a mock.
 */
import { describe, it, expect, afterEach } from 'vitest';
import express, { type Application } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { GetCorsOwningServerExtensionRoots, type ServerExtensionConfig } from '@memberjunction/server-extensions-core';
import cors from 'cors';
import { CreateExtensionOwnedPreflightFallback, CreateGlobalCorsMiddleware } from '../globalCors.js';

const ALLOWED_BALLOT_ORIGIN = 'https://vote.example.org';
const OTHER_ORIGIN = 'https://evil.example.com';

/** A ballot-style edge: its own per-resource origin policy and its own preflight answer. */
function mountBallotExtension(app: Application): void {
    const router = express.Router();
    router.use((req, res, next) => {
        const origin = req.headers.origin;
        if (origin && origin !== ALLOWED_BALLOT_ORIGIN) {
            res.status(403).json({ error: 'origin not allowed for this ballot' });
            return;
        }
        if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
        }
        if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Methods', 'POST');
            res.setHeader('X-Ballot-Preflight', 'extension');
            res.status(200).end();
            return;
        }
        next();
    });
    router.post('/cast', (_req, res) => { res.json({ ok: true }); });
    app.use('/ballot', router);
}

let server: Server | undefined;

afterEach(async () => {
    if (server) {
        await new Promise<void>((resolve) => server!.close(() => resolve()));
        server = undefined;
    }
});

async function startApp(extensions: ServerExtensionConfig[]): Promise<string> {
    const app = express();
    app.disable('x-powered-by');
    app.use(CreateGlobalCorsMiddleware({ allowedOrigins: ['*'] }, GetCorsOwningServerExtensionRoots(extensions)));
    mountBallotExtension(app);
    app.get('/core', (_req, res) => { res.json({ ok: true }); });
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server!.once('listening', () => resolve()));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const ballotConfig = (ownsCors: boolean | undefined): ServerExtensionConfig => ({
    Enabled: true,
    DriverClass: 'BallotEdge',
    RootPath: '/ballot',
    Phase: 'pre-auth',
    ...(ownsCors === undefined ? {} : { OwnsCORS: ownsCors }),
    Settings: {},
});

describe('CreateGlobalCorsMiddleware', () => {
    it('without OwnsCORS, global CORS answers the preflight and the extension never sees it (the bug)', async () => {
        const base = await startApp([ballotConfig(undefined)]);
        const res = await fetch(`${base}/ballot/cast`, {
            method: 'OPTIONS',
            headers: { Origin: OTHER_ORIGIN, 'Access-Control-Request-Method': 'POST' },
        });
        expect(res.status).toBe(204);
        expect(res.headers.get('access-control-allow-origin')).toBe(OTHER_ORIGIN);
        expect(res.headers.get('x-ballot-preflight')).toBeNull();
    });

    it('with OwnsCORS, the preflight reaches the extension, which refuses a foreign origin without CORS headers', async () => {
        const base = await startApp([ballotConfig(true)]);
        const res = await fetch(`${base}/ballot/cast`, {
            method: 'OPTIONS',
            headers: { Origin: OTHER_ORIGIN, 'Access-Control-Request-Method': 'POST' },
        });
        expect(res.status).toBe(403);
        expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('with OwnsCORS, the extension answers its own preflight for its allowed origin', async () => {
        const base = await startApp([ballotConfig(true)]);
        const res = await fetch(`${base}/ballot/cast`, {
            method: 'OPTIONS',
            headers: { Origin: ALLOWED_BALLOT_ORIGIN, 'Access-Control-Request-Method': 'POST' },
        });
        expect(res.status).toBe(200);
        expect(res.headers.get('x-ballot-preflight')).toBe('extension');
        expect(res.headers.get('access-control-allow-origin')).toBe(ALLOWED_BALLOT_ORIGIN);
        // The global policy's max-age would only be there if global CORS had run.
        expect(res.headers.get('access-control-max-age')).toBeNull();
    });

    it('with OwnsCORS, a foreign-origin refusal on a normal request carries no reflected origin', async () => {
        const base = await startApp([ballotConfig(true)]);
        const res = await fetch(`${base}/ballot/cast`, { method: 'POST', headers: { Origin: OTHER_ORIGIN } });
        expect(res.status).toBe(403);
        expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('keeps global CORS on every path the extension does not own', async () => {
        const base = await startApp([ballotConfig(true)]);
        const res = await fetch(`${base}/core`, {
            method: 'OPTIONS',
            headers: { Origin: OTHER_ORIGIN, 'Access-Control-Request-Method': 'GET' },
        });
        expect(res.status).toBe(204);
        expect(res.headers.get('access-control-allow-origin')).toBe(OTHER_ORIGIN);
        expect(res.headers.get('access-control-max-age')).toBe('86400');
    });

    it('ignores OwnsCORS on a disabled extension', async () => {
        const base = await startApp([{ ...ballotConfig(true), Enabled: false }]);
        const res = await fetch(`${base}/ballot/cast`, {
            method: 'OPTIONS',
            headers: { Origin: OTHER_ORIGIN, 'Access-Control-Request-Method': 'POST' },
        });
        expect(res.status).toBe(204);
    });

    it('never sends credentials under the wildcard, even when allowCredentials is true', async () => {
        const app = express();
        app.use(CreateGlobalCorsMiddleware({ allowedOrigins: ['*'], allowCredentials: true }));
        app.get('/core', (_req, res) => { res.json({ ok: true }); });
        server = app.listen(0, '127.0.0.1');
        await new Promise<void>((resolve) => server!.once('listening', () => resolve()));
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const res = await fetch(`${base}/core`, { headers: { Origin: OTHER_ORIGIN } });
        expect(res.headers.get('access-control-allow-credentials')).toBeNull();
    });
});

/**
 * The real mount order: global CORS → extensions → (fallback) → the GraphQL mount at `/`, whose own
 * `cors()` approves every origin. The webhook extension owns its CORS but has no OPTIONS handler.
 */
async function startAppWithGraphQLMount(withFallback: boolean): Promise<string> {
    const extensions: ServerExtensionConfig[] = [
        ballotConfig(true),
        { Enabled: true, DriverClass: 'Webhook', RootPath: '/webhook', Phase: 'pre-auth', OwnsCORS: true, Settings: {} },
    ];
    const ownedRoots = GetCorsOwningServerExtensionRoots(extensions);
    const app = express();
    app.use(CreateGlobalCorsMiddleware({ allowedOrigins: ['*'] }, ownedRoots));
    mountBallotExtension(app);
    app.post('/webhook/events', (_req, res) => { res.json({ received: true }); });
    if (withFallback) {
        app.use(CreateExtensionOwnedPreflightFallback(ownedRoots));
    }
    app.use('/', cors(), (_req, res) => { res.json({ graphql: true }); });
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server!.once('listening', () => resolve()));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function preflight(url: string, origin: string): Promise<Response> {
    return fetch(url, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } });
}

describe('CreateExtensionOwnedPreflightFallback', () => {
    it('without it, an unanswered preflight under an owned root falls through to the GraphQL cors() and is approved for any origin (the bug)', async () => {
        const base = await startAppWithGraphQLMount(false);
        const res = await preflight(`${base}/webhook/events`, OTHER_ORIGIN);
        expect(res.status).toBe(204);
        expect(res.headers.get('access-control-allow-origin')).toBe('*');
    });

    it('refuses an unanswered preflight under an owned root with a bare 404', async () => {
        const base = await startAppWithGraphQLMount(true);
        for (const path of ['/webhook/events', '/WEBHOOK/Events', '/webhook/', '/webhook/no-such-route']) {
            const res = await preflight(`${base}${path}`, OTHER_ORIGIN);
            expect(res.status, path).toBe(404);
            expect(res.headers.get('access-control-allow-origin'), path).toBeNull();
        }
    });

    it('leaves an extension that answers its own preflight in charge', async () => {
        const base = await startAppWithGraphQLMount(true);
        const res = await preflight(`${base}/ballot/cast`, ALLOWED_BALLOT_ORIGIN);
        expect(res.status).toBe(200);
        expect(res.headers.get('x-ballot-preflight')).toBe('extension');
    });

    it('touches neither non-preflight requests under an owned root nor preflights elsewhere', async () => {
        const base = await startAppWithGraphQLMount(true);
        const post = await fetch(`${base}/webhook/events`, { method: 'POST', headers: { Origin: OTHER_ORIGIN } });
        expect(post.status).toBe(200);
        const sibling = await preflight(`${base}/webhookx/events`, OTHER_ORIGIN);
        expect(sibling.status).toBe(204);
        expect(sibling.headers.get('access-control-allow-origin')).toBe(OTHER_ORIGIN);
    });
});

describe('X-Powered-By', () => {
    it('CreateApp and Serve() both disable X-Powered-By', () => {
        // Read as text so this test never loads config.ts / the full server graph.
        const src = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
        // Both the default app factory and Serve() (for host-supplied apps) disable the header.
        expect(src.match(/app\.disable\('x-powered-by'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    });
});
