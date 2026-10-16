import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
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

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_JSON_PATH = path.resolve(THIS_DIR, '../../package.json');
const PNPM_LOCK_PATH = path.resolve(THIS_DIR, '../../../../../../pnpm-lock.yaml');

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

    it('resolves all 6 @hyperframes/* packages to the exact same version matching GetInstalledHyperFramesVersion() and throws on missing package', () => {
        const subpackages = ['producer', 'engine', 'lint', 'core', 'parsers', 'studio-server'];
        const expected = GetInstalledHyperFramesVersion();
        expect(expected).toBe('0.8.134');
        for (const sub of subpackages) {
            expect(GetInstalledHyperFramesPackageVersion(sub)).toBe(expected);
        }
        expect(() => GetInstalledHyperFramesPackageVersion('does-not-exist')).toThrow(
            /Unable to resolve installed version for @hyperframes\/does-not-exist/,
        );
    });

    it('pins every @hyperframes/* and hyperframes dependency to an identical exact semver in package.json and pnpm-lock.yaml', () => {
        const pkgRaw = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8')) as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
        };
        const allDeps = { ...(pkgRaw.dependencies ?? {}), ...(pkgRaw.devDependencies ?? {}) };
        const hfDeps = Object.entries(allDeps).filter(
            ([name]) => name === 'hyperframes' || name.startsWith('@hyperframes/'),
        );
        expect(hfDeps.length).toBe(7);

        const exactSemverRegex = /^\d+\.\d+\.\d+$/;
        const versions = new Set<string>();
        for (const [, spec] of hfDeps) {
            expect(spec).toMatch(exactSemverRegex);
            versions.add(spec);
        }
        expect(versions.size).toBe(1);
        const pinnedVersion = [...versions][0]!;
        expect(pinnedVersion).toBe(GetInstalledHyperFramesVersion());

        const lockfile = fs.readFileSync(PNPM_LOCK_PATH, 'utf8');
        const lockMatches = [...lockfile.matchAll(/@hyperframes\/[a-z-]+@(\d+\.\d+\.\d+)/g)];
        expect(lockMatches.length).toBeGreaterThanOrEqual(6);
        for (const match of lockMatches) {
            expect(match[1]).toBe(pinnedVersion);
        }
    });
});
