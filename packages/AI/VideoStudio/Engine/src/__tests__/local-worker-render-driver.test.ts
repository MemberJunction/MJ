import * as http from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { RENDER_WORKER_ROUTES } from '@memberjunction/video-studio-core';
import {
    DEFAULT_RENDER_REQUEST_TIMEOUT_MS,
    DEFAULT_RENDER_STARTUP_TIMEOUT_MS,
    DEFAULT_RENDER_TIMEOUT_MS,
    LocalWorkerRenderDriver,
    VideoRenderError,
    type VideoRenderSettings,
} from '../index.js';
import { CreateMinimalRenderRequest } from './fixtures/minimal-bundle.js';
import { DescribeRenderDriverContract } from './render-driver-contract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUB_WORKER_PATH = path.join(__dirname, 'fixtures', 'stub-worker.mjs');
const RUN_REAL_RENDER_TESTS = process.env.VIDEO_STUDIO_RENDER_TESTS === '1';

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
        while (activeDrivers.length > 0) {
            const driver = activeDrivers.pop()!;
            await driver.Shutdown();
        }
    });

    it('two parallel Health calls share one in-flight startup and spawn a single child process', async () => {
        const driver = trackDriver(new LocalWorkerRenderDriver(createStubWorkerSettings()));
        expect(driver.ProcessId).toBeNull();

        const [h1, h2] = await Promise.all([driver.Health(), driver.Health()]);
        expect(h1.Healthy).toBe(true);
        expect(h2.Healthy).toBe(true);

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
                }),
        );
    },
);
