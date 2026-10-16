import { afterEach, describe, expect, it } from 'vitest';
import {
    RENDER_WORKER_ENV,
    RENDER_WORKER_PORT_PREFIX,
    RENDER_WORKER_ROUTES,
    type RenderHealth,
} from '@memberjunction/video-studio-core';
import {
    GetInstalledHyperFramesPackageVersion,
    GetInstalledHyperFramesVersion,
} from '../hyperframes-backend.js';
import { FakeRenderBackend, type RenderWorkerServer } from '../index.js';
import {
    AssertNonRootUser,
    ParseRenderWorkerEnv,
    StartRenderWorkerFromEnv,
} from '../main.js';

describe('main CLI entrypoint and environment configuration', () => {
    const serversToClose: RenderWorkerServer[] = [];

    afterEach(async () => {
        while (serversToClose.length > 0) {
            const srv = serversToClose.pop();
            if (srv) {
                await srv.Close();
            }
        }
    });

    it('refuses uid 0 unless VIDEO_STUDIO_RENDER_ALLOW_ROOT is enabled', () => {
        expect(() => AssertNonRootUser(false, 0)).toThrow(/Refusing to start render worker as root/);
        expect(() => AssertNonRootUser(true, 0)).not.toThrow();
        expect(() => AssertNonRootUser(false, 10001)).not.toThrow();
    });

    it('parses RENDER_WORKER_ENV values with plan defaults (Port=0, MaxBodyMb=256, MaxTimeoutMs=1800000)', () => {
        const defaults = ParseRenderWorkerEnv({});
        expect(defaults.Host).toBe('127.0.0.1');
        expect(defaults.Port).toBe(0);
        expect(defaults.Token).toBeUndefined();
        expect(defaults.MaxBodyBytes).toBe(256 * 1024 * 1024);
        expect(defaults.Concurrency).toBe(1);
        expect(defaults.MaxTimeoutMs).toBe(1_800_000);
        expect(defaults.AllowRoot).toBe(false);

        const custom = ParseRenderWorkerEnv({
            [RENDER_WORKER_ENV.Host]: '0.0.0.0',
            [RENDER_WORKER_ENV.Port]: '8788',
            [RENDER_WORKER_ENV.Token]: 'my-token',
            [RENDER_WORKER_ENV.MaxBodyMb]: '16',
            [RENDER_WORKER_ENV.Concurrency]: '2',
            [RENDER_WORKER_ENV.MaxTimeoutMs]: '30000',
            [RENDER_WORKER_ENV.AllowRoot]: '1',
        });
        expect(custom.Host).toBe('0.0.0.0');
        expect(custom.Port).toBe(8788);
        expect(custom.Token).toBe('my-token');
        expect(custom.MaxBodyBytes).toBe(16 * 1024 * 1024);
        expect(custom.Concurrency).toBe(2);
        expect(custom.MaxTimeoutMs).toBe(30_000);
        expect(custom.AllowRoot).toBe(true);
    });

    it('StartRenderWorkerFromEnv honours env vars, redirects console.log to stderr, prints VIDEO_STUDIO_RENDER_WORKER_PORT=<port>, and serves /health with token', async () => {
        const printedLines: string[] = [];
        const server = await StartRenderWorkerFromEnv({
            Env: {
                [RENDER_WORKER_ENV.Host]: '127.0.0.1',
                [RENDER_WORKER_ENV.Port]: '0',
                [RENDER_WORKER_ENV.Token]: 'test-token',
            },
            Backend: new FakeRenderBackend({ Healthy: true }),
            EffectiveUid: 10001,
            WriteStdoutLine: (line) => printedLines.push(line),
        });
        serversToClose.push(server);

        expect(server.Port).toBeGreaterThan(0);
        expect(printedLines).toEqual([`${RENDER_WORKER_PORT_PREFIX}${server.Port}`]);
        expect(process.env.DO_NOT_TRACK).toBe('1');
        expect(process.env.HYPERFRAMES_NO_TELEMETRY).toBe('1');

        const unauthRes = await fetch(`http://127.0.0.1:${server.Port}${RENDER_WORKER_ROUTES.Health}`);
        expect(unauthRes.status).toBe(401);

        const res = await fetch(`http://127.0.0.1:${server.Port}${RENDER_WORKER_ROUTES.Health}`, {
            headers: { Authorization: 'Bearer test-token' },
        });
        expect(res.status).toBe(200);
        const health = (await res.json()) as RenderHealth;
        expect(health.Healthy).toBe(true);
    });

    it('resolves all 6 @hyperframes/* packages to the exact same version matching GetInstalledHyperFramesVersion()', () => {
        const subpackages = ['producer', 'engine', 'lint', 'core', 'parsers', 'studio-server'];
        const expected = GetInstalledHyperFramesVersion();
        expect(expected).toBe('0.8.134');
        for (const sub of subpackages) {
            expect(GetInstalledHyperFramesPackageVersion(sub)).toBe(expected);
        }
    });
});
