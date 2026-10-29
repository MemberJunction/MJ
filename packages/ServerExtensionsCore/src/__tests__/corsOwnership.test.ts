/**
 * Unit tests for extension-owned CORS: which roots an extension owns, path matching, and the
 * wrapper MJServer puts around its global CORS middleware. The wrapper tests run a real
 * Express app on an ephemeral port so routing and preflight behavior are Express's own.
 */
import { describe, it, expect, afterEach } from 'vitest';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
    GetCorsOwningServerExtensionRoots,
    IsPathUnderServerExtensionRoot,
    SkipForServerExtensionRoots,
} from '../corsOwnership.js';
import { ServerExtensionConfig } from '../types.js';

function cfg(partial: Partial<ServerExtensionConfig>): ServerExtensionConfig {
    return { Enabled: true, DriverClass: 'X', RootPath: '/x', Settings: {}, ...partial };
}

describe('GetCorsOwningServerExtensionRoots', () => {
    it('returns only enabled extensions that set OwnsCORS: true, folded', () => {
        const roots = GetCorsOwningServerExtensionRoots([
            cfg({ DriverClass: 'A', RootPath: '/Ballot/', OwnsCORS: true }),
            cfg({ DriverClass: 'B', RootPath: '/plain' }),
            cfg({ DriverClass: 'C', RootPath: '/off', OwnsCORS: true, Enabled: false }),
            cfg({ DriverClass: 'D', RootPath: '/no', OwnsCORS: false }),
        ]);
        expect(roots).toEqual(['/ballot']);
    });

    it('folds a RootPath with a long run of slashes in linear time', () => {
        // A long run of '/' that does NOT end the string is the worst case for a trailing-slash
        // regex (each start position rescans the run): quadratic, minutes at this length.
        const pathological = `/a${'/'.repeat(100_000)}b`;
        const started = Date.now();
        const roots = GetCorsOwningServerExtensionRoots([cfg({ RootPath: pathological, OwnsCORS: true })]);
        expect(Date.now() - started).toBeLessThan(1000);
        expect(roots).toEqual([pathological.toLowerCase()]);
        expect(GetCorsOwningServerExtensionRoots([cfg({ RootPath: `/a${'/'.repeat(100_000)}`, OwnsCORS: true })])).toEqual(['/a']);
        expect(GetCorsOwningServerExtensionRoots([cfg({ RootPath: '///', OwnsCORS: true })])).toEqual([]);
    });

    it('never returns the bare root or a relative path, and de-duplicates', () => {
        const roots = GetCorsOwningServerExtensionRoots([
            cfg({ RootPath: '/', OwnsCORS: true }),
            cfg({ RootPath: 'relative', OwnsCORS: true }),
            cfg({ RootPath: '/a', OwnsCORS: true }),
            cfg({ RootPath: '/A', OwnsCORS: true }),
        ]);
        expect(roots).toEqual(['/a']);
    });

    it('handles null and empty input', () => {
        expect(GetCorsOwningServerExtensionRoots(null)).toEqual([]);
        expect(GetCorsOwningServerExtensionRoots([])).toEqual([]);
    });
});

describe('IsPathUnderServerExtensionRoot', () => {
    const roots = ['/ballot'];
    it.each([
        ['/ballot', true],
        ['/ballot/', true],
        ['/ballot/abc/def', true],
        ['/BALLOT/abc', true],
        ['/ballots', false],
        ['/ballotx/abc', false],
        ['/other/ballot', false],
        ['/', false],
        ['', false],
    ])('%s -> %s', (path, expected) => {
        expect(IsPathUnderServerExtensionRoot(path, roots)).toBe(expected);
    });

    it('is false with no roots', () => {
        expect(IsPathUnderServerExtensionRoot('/ballot', [])).toBe(false);
    });
});

describe('SkipForServerExtensionRoots', () => {
    let server: Server | undefined;

    afterEach(async () => {
        if (server) {
            await new Promise<void>((resolve) => server!.close(() => resolve()));
            server = undefined;
        }
    });

    /** Stand-in for the global CORS middleware: stamps a header and ends every preflight itself. */
    const globalPolicy: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
        res.setHeader('X-Global-Policy', 'applied');
        if (req.method === 'OPTIONS') {
            res.status(204).end();
            return;
        }
        next();
    };

    async function start(roots: readonly string[]): Promise<string> {
        const app = express();
        app.use(SkipForServerExtensionRoots(globalPolicy, roots));
        const router = express.Router();
        router.options('/{*rest}', (_req, res) => { res.status(403).json({ owner: 'extension' }); });
        router.get('/{*rest}', (_req, res) => { res.json({ owner: 'extension' }); });
        app.use('/ballot', router);
        app.get('/elsewhere', (_req, res) => { res.json({ owner: 'core' }); });
        server = app.listen(0, '127.0.0.1');
        await new Promise<void>((resolve) => server!.once('listening', () => resolve()));
        const { port } = server.address() as AddressInfo;
        return `http://127.0.0.1:${port}`;
    }

    it('without ownership the global policy answers the preflight and the extension never sees it (the bug)', async () => {
        const base = await start([]);
        const res = await fetch(`${base}/ballot/abc`, { method: 'OPTIONS' });
        expect(res.status).toBe(204);
        expect(res.headers.get('x-global-policy')).toBe('applied');
    });

    it('with ownership the preflight reaches the extension and the global policy is not applied', async () => {
        const base = await start(['/ballot']);
        const res = await fetch(`${base}/ballot/abc`, { method: 'OPTIONS' });
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ owner: 'extension' });
        expect(res.headers.get('x-global-policy')).toBeNull();

        const get = await fetch(`${base}/BALLOT/abc`);
        expect(get.status).toBe(200);
        expect(get.headers.get('x-global-policy')).toBeNull();
    });

    it('still applies the global policy everywhere else', async () => {
        const base = await start(['/ballot']);
        const res = await fetch(`${base}/elsewhere`);
        expect(res.status).toBe(200);
        expect(res.headers.get('x-global-policy')).toBe('applied');
        const sibling = await fetch(`${base}/ballots`, { method: 'OPTIONS' });
        expect(sibling.status).toBe(204);
        expect(sibling.headers.get('x-global-policy')).toBe('applied');
    });

    it('returns the middleware unchanged when there are no owned roots', () => {
        expect(SkipForServerExtensionRoots(globalPolicy, [])).toBe(globalPolicy);
        expect(SkipForServerExtensionRoots(globalPolicy, ['/'])).toBe(globalPolicy);
    });
});
