import { spawnSync } from 'node:child_process';
import * as fssync from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    RENDER_WORKER_PORT_PREFIX,
    RENDER_WORKER_ROUTES,
} from '@memberjunction/video-studio-core';
import {
    DEFAULT_DOCKER_CPUS,
    DEFAULT_DOCKER_MEMORY_MB,
    DEFAULT_DOCKER_PIDS_LIMIT,
    DEFAULT_DOCKER_RENDER_IMAGE,
    DEFAULT_DOCKER_SHM_SIZE_MB,
    DEFAULT_RENDER_REQUEST_TIMEOUT_MS,
    DEFAULT_RENDER_STARTUP_TIMEOUT_MS,
    DEFAULT_RENDER_TIMEOUT_MS,
    LocalWorkerRenderDriver,
    RenderWorkerHttpClient,
    VideoRenderError,
    type VideoRenderSettings,
} from '../index.js';
import { CreateMinimalRenderRequest } from './fixtures/minimal-bundle.js';
import { DescribeRenderDriverContract } from './render-driver-contract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUB_WORKER_PATH = path.join(__dirname, 'fixtures', 'stub-worker.mjs');

function checkCanRunRealRenderTests(): boolean {
    if (process.env.VIDEO_STUDIO_RENDER_TESTS !== '1') {
        console.info(
            '[local-worker-render-driver.test] Skipping real-worker contract suite: set VIDEO_STUDIO_RENDER_TESTS=1 to enable.',
        );
        return false;
    }
    const ffmpegRes = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    if (ffmpegRes.status !== 0) {
        console.info(
            '[local-worker-render-driver.test] Skipping real-worker contract suite: ffmpeg binary not found on PATH.',
        );
        return false;
    }
    if (process.env.CHROME_PATH && !fssync.existsSync(process.env.CHROME_PATH)) {
        console.info(
            `[local-worker-render-driver.test] Skipping real-worker contract suite: Chrome binary not found at CHROME_PATH (${process.env.CHROME_PATH}).`,
        );
        return false;
    }
    return true;
}

const RUN_REAL_RENDER_TESTS = checkCanRunRealRenderTests();

const DEFAULT_DOCKER_SETTINGS = {
    Image: DEFAULT_DOCKER_RENDER_IMAGE,
    Cpus: DEFAULT_DOCKER_CPUS,
    MemoryMb: DEFAULT_DOCKER_MEMORY_MB,
    PidsLimit: DEFAULT_DOCKER_PIDS_LIMIT,
    ShmSizeMb: DEFAULT_DOCKER_SHM_SIZE_MB,
};

function createStubWorkerSettings(overrides?: Partial<VideoRenderSettings>): VideoRenderSettings {
    return {
        Driver: 'LocalWorker',
        Timeouts: {
            StartupMs: 15_000,
            RenderMs: 60_000,
            RequestMs: 30_000,
        },
        Local: {
            WorkerEntry: STUB_WORKER_PATH,
        },
        Remote: {},
        Docker: DEFAULT_DOCKER_SETTINGS,
        ...overrides,
    };
}

function makeUnauthenticatedGet(url: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
        const req = http.get(url, (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
        });
        req.on('error', reject);
    });
}

DescribeRenderDriverContract(
    'LocalWorkerRenderDriver (stub-worker.mjs)',
    () => new LocalWorkerRenderDriver(createStubWorkerSettings()),
);

describe('LocalWorkerRenderDriver lifecycle and security', () => {
    const activeDrivers: LocalWorkerRenderDriver[] = [];

    function trackDriver(driver: LocalWorkerRenderDriver): LocalWorkerRenderDriver {
        activeDrivers.push(driver);
        return driver;
    }

    afterEach(async () => {
        vi.restoreAllMocks();
        while (activeDrivers.length > 0) {
            const driver = activeDrivers.pop()!;
            await driver.Shutdown();
        }
    });

    it('two parallel Health calls share one in-flight startup and spawn a single child process', async () => {
        const spawnSpy = vi.spyOn(
            LocalWorkerRenderDriver.prototype as never,
            'spawnAndWaitForReady',
        );
        const driver = trackDriver(new LocalWorkerRenderDriver(createStubWorkerSettings()));
        expect(driver.ProcessId).toBeNull();

        const [h1, h2] = await Promise.all([driver.Health(), driver.Health()]);
        expect(h1.Healthy).toBe(true);
        expect(h2.Healthy).toBe(true);
        expect(spawnSpy).toHaveBeenCalledTimes(1);

        const pid = driver.ProcessId;
        expect(typeof pid).toBe('number');
        expect(pid).toBeGreaterThan(0);
    });

    it('Shutdown terminates the child process so process.kill(pid, 0) throws', async () => {
        const driver = trackDriver(new LocalWorkerRenderDriver(createStubWorkerSettings()));
        const health = await driver.Health();
        expect(health.Healthy).toBe(true);

        const pid = driver.ProcessId!;
        expect(pid).toBeGreaterThan(0);

        await driver.Shutdown();
        expect(driver.ProcessId).toBeNull();
        expect(() => process.kill(pid, 0)).toThrow();
    });

    it('respawns a fresh child process on the next request after the child is killed externally', async () => {
        const driver = trackDriver(new LocalWorkerRenderDriver(createStubWorkerSettings()));
        const firstHealth = await driver.Health();
        expect(firstHealth.Healthy).toBe(true);

        const firstPid = driver.ProcessId!;
        expect(firstPid).toBeGreaterThan(0);

        // Kill the child externally and wait for it to exit
        await new Promise<void>((resolve) => {
            const checkInterval = setInterval(() => {
                if (driver.ProcessId === null) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 20);
            process.kill(firstPid, 'SIGKILL');
        });

        expect(driver.ProcessId).toBeNull();

        const secondHealth = await driver.Health();
        expect(secondHealth.Healthy).toBe(true);
        const secondPid = driver.ProcessId!;
        expect(secondPid).toBeGreaterThan(0);
        expect(secondPid).not.toBe(firstPid);
    });

    it('registers one process exit listener that kills the child on parent exit, keeps at most one on respawn, and removes it on Shutdown', async () => {
        const baselineListeners = new Set(process.listeners('exit'));
        const getNewExitListeners = () =>
            process.listeners('exit').filter((fn) => !baselineListeners.has(fn));

        const driver = trackDriver(new LocalWorkerRenderDriver(createStubWorkerSettings()));
        expect(getNewExitListeners().length).toBe(0);

        const firstHealth = await driver.Health();
        expect(firstHealth.Healthy).toBe(true);
        const firstPid = driver.ProcessId!;
        expect(firstPid).toBeGreaterThan(0);

        const listenersAfterFirstStart = getNewExitListeners();
        expect(listenersAfterFirstStart.length).toBe(1);

        // Calling the parent exit listener synchronously kills the child within 1 s
        listenersAfterFirstStart[0]!(0);
        const killStartMs = Date.now();
        while (Date.now() - killStartMs < 1_000) {
            try {
                process.kill(firstPid, 0);
            } catch {
                break;
            }
            await new Promise<void>((r) => setTimeout(r, 20));
        }
        expect(() => process.kill(firstPid, 0)).toThrow();

        // Wait for child 'exit' event to clear activeWorker, then respawn via Health()
        await new Promise<void>((resolve) => {
            const checkInterval = setInterval(() => {
                if (driver.ProcessId === null) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 20);
        });

        const secondHealth = await driver.Health();
        expect(secondHealth.Healthy).toBe(true);
        const secondPid = driver.ProcessId!;
        expect(secondPid).toBeGreaterThan(0);
        expect(getNewExitListeners().length).toBe(1);

        // External kill + respawn still leaves at most one exit listener
        await new Promise<void>((resolve) => {
            const checkInterval = setInterval(() => {
                if (driver.ProcessId === null) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 20);
            process.kill(secondPid, 'SIGKILL');
        });
        expect(getNewExitListeners().length).toBe(0);

        const thirdHealth = await driver.Health();
        expect(thirdHealth.Healthy).toBe(true);
        expect(getNewExitListeners().length).toBe(1);

        await driver.Shutdown();
        expect(getNewExitListeners().length).toBe(0);
    });

    it('requires the per-spawn bearer token on every worker route (raw request without token gets 401)', async () => {
        const driver = trackDriver(new LocalWorkerRenderDriver(createStubWorkerSettings()));
        const health = await driver.Health();
        expect(health.Healthy).toBe(true);
        expect(driver.BaseUrl).toBeTruthy();

        const status = await makeUnauthenticatedGet(
            `${driver.BaseUrl}${RENDER_WORKER_ROUTES.Health}`,
        );
        expect(status).toBe(401);
    });

    it('with a bad WorkerEntry returns Healthy: false from Health without throwing and rejects Render with WorkerUnavailable', async () => {
        const missingEntryPath = path.join(__dirname, 'fixtures', 'does-not-exist-worker.mjs');
        const driver = trackDriver(
            new LocalWorkerRenderDriver({
                Driver: 'LocalWorker',
                Timeouts: {
                    StartupMs: 5_000,
                    RenderMs: 10_000,
                    RequestMs: 5_000,
                },
                Local: {
                    WorkerEntry: missingEntryPath,
                },
                Remote: {},
                Docker: DEFAULT_DOCKER_SETTINGS,
            }),
        );

        const health = await driver.Health();
        expect(health.Healthy).toBe(false);
        expect(health.Errors.length).toBeGreaterThan(0);
        expect(health.Errors[0]).toContain('does-not-exist-worker.mjs');

        let caught: unknown;
        try {
            await driver.Render(CreateMinimalRenderRequest());
        } catch (err) {
            caught = err;
        }

        expect(caught).toBeInstanceOf(VideoRenderError);
        const vErr = caught as VideoRenderError;
        expect(vErr.Code).toBe('WorkerUnavailable');
        expect(vErr.message).toContain('@memberjunction/video-studio-render-worker');
    });

    it('resolves Health() immediately with worker Errors when /health answers HTTP 503 (e.g. missing Chromium) instead of spinning until StartupMs expires', async () => {
        const os = await import('node:os');
        const fsPromises = await import('node:fs/promises');
        const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'mj-unhealthy-worker-'));
        const workerPath = path.join(tmpDir, 'unhealthy-worker.mjs');
        await fsPromises.writeFile(
            workerPath,
            `import http from 'node:http';
const host = process.env.VIDEO_STUDIO_RENDER_HOST ?? '127.0.0.1';
const server = http.createServer((req, res) => {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Connection': 'close' });
    res.end(JSON.stringify({
        Healthy: false,
        NodeVersion: process.version,
        HyperFramesVersion: '0.8.134',
        FfmpegVersion: '7.1.1',
        Errors: ['Chromium headless shell binary was not found. Run \`pnpm --filter @memberjunction/video-studio-render-worker run browser:install\` or set CHROME_PATH.'],
    }));
});
server.listen(0, host, () => {
    const port = server.address().port;
    process.stdout.write('${RENDER_WORKER_PORT_PREFIX}' + port + '\\n');
});
process.on('SIGTERM', () => { process.exit(0); });
`,
            'utf8',
        );

        try {
            const driver = trackDriver(
                new LocalWorkerRenderDriver({
                    Driver: 'LocalWorker',
                    Timeouts: {
                        StartupMs: 60_000,
                        RenderMs: 60_000,
                        RequestMs: 10_000,
                    },
                    Local: {
                        WorkerEntry: workerPath,
                    },
                    Remote: {},
                    Docker: DEFAULT_DOCKER_SETTINGS,
                }),
            );

            const startMs = Date.now();
            const health = await driver.Health();
            const elapsedMs = Date.now() - startMs;

            expect(elapsedMs).toBeLessThan(5_000);
            expect(health.Healthy).toBe(false);
            expect(health.Errors).toContain(
                'Chromium headless shell binary was not found. Run `pnpm --filter @memberjunction/video-studio-render-worker run browser:install` or set CHROME_PATH.',
            );
        } finally {
            await fsPromises.rm(tmpDir, { recursive: true, force: true });
        }
    });

    it('RenderWorkerHttpClient decodes multi-byte UTF-8 characters split across two NDJSON TCP chunks without corruption', async () => {
        const fullLine =
            JSON.stringify({
                Type: 'Error',
                Error: {
                    Code: 'LintBlocked',
                    Message: 'Texte trop petit: café',
                },
            }) + '\n';
        const fullBytes = Buffer.from(fullLine, 'utf8');
        // Locate the 2-byte UTF-8 sequence for 'é' (0xc3 0xa9) and split right between the two bytes
        const splitIdx = fullBytes.indexOf(Buffer.from([0xc3, 0xa9])) + 1;
        expect(splitIdx).toBeGreaterThan(1);
        const firstChunk = fullBytes.subarray(0, splitIdx);
        const secondChunk = fullBytes.subarray(splitIdx);

        const server = http.createServer((req, res) => {
            req.resume();
            res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8' });
            res.write(firstChunk);
            setTimeout(() => {
                res.write(secondChunk);
                res.end();
            }, 50);
        });

        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
        const port = (server.address() as AddressInfo).port;

        try {
            const client = new RenderWorkerHttpClient({
                BaseUrl: `http://127.0.0.1:${port}`,
                RenderTimeoutMs: 10_000,
                RequestTimeoutMs: 10_000,
            });

            let caught: unknown;
            try {
                await client.Render(CreateMinimalRenderRequest());
            } catch (err) {
                caught = err;
            }

            expect(caught).toBeInstanceOf(VideoRenderError);
            const vErr = caught as VideoRenderError;
            expect(vErr.Code).toBe('LintBlocked');
            expect(vErr.message).toBe('Texte trop petit: café');
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });
});

describe.skipIf(!RUN_REAL_RENDER_TESTS)(
    'LocalWorkerRenderDriver opt-in real worker contract (VIDEO_STUDIO_RENDER_TESTS=1)',
    () => {
        DescribeRenderDriverContract(
            'LocalWorkerRenderDriver (real @memberjunction/video-studio-render-worker)',
            () =>
                new LocalWorkerRenderDriver({
                    Driver: 'LocalWorker',
                    Timeouts: {
                        StartupMs: DEFAULT_RENDER_STARTUP_TIMEOUT_MS,
                        RenderMs: DEFAULT_RENDER_TIMEOUT_MS,
                        RequestMs: DEFAULT_RENDER_REQUEST_TIMEOUT_MS,
                    },
                    Local: {},
                    Remote: {},
                    Docker: DEFAULT_DOCKER_SETTINGS,
                }),
        );
    },
);
