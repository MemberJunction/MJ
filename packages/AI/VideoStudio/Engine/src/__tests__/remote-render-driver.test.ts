import * as fs from 'node:fs/promises';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as mjCore from '@memberjunction/core';
import {
    CreateRenderWorkerServer,
    FakeRenderBackend,
    type RenderWorkerServer,
} from '@memberjunction/video-studio-render-worker';
import {
    DEFAULT_DOCKER_CPUS,
    DEFAULT_DOCKER_MEMORY_MB,
    DEFAULT_DOCKER_PIDS_LIMIT,
    DEFAULT_DOCKER_RENDER_IMAGE,
    DEFAULT_DOCKER_SHM_SIZE_MB,
    DEFAULT_DOCKER_WORKSPACE_ROOT,
    DEFAULT_RENDER_REQUEST_TIMEOUT_MS,
    DEFAULT_RENDER_STARTUP_TIMEOUT_MS,
    DEFAULT_RENDER_TIMEOUT_MS,
    ReadVideoRenderSettings,
    RemoteRenderDriver,
    VideoRenderEngine,
    VideoRenderError,
    type VideoRenderSettings,
} from '../index.js';
import {
    CreateMinimalBundle,
    CreateMinimalRenderRequest,
    MINIMAL_BUNDLE_HEIGHT,
    MINIMAL_BUNDLE_WIDTH,
} from './fixtures/minimal-bundle.js';
import { DescribeRenderDriverContract } from './render-driver-contract.js';

const OPT_IN_RENDER_TESTS = process.env.VIDEO_STUDIO_RENDER_TESTS === '1';
const OPT_IN_RENDER_URL = process.env.VIDEO_STUDIO_RENDER_URL;
const OPT_IN_RENDER_TOKEN = process.env.VIDEO_STUDIO_RENDER_TOKEN;

function makeRemoteSettings(
    url?: string,
    token?: string,
    overrides?: Partial<VideoRenderSettings['Timeouts']>,
): VideoRenderSettings {
    return {
        Driver: 'Remote',
        Timeouts: {
            StartupMs: overrides?.StartupMs ?? DEFAULT_RENDER_STARTUP_TIMEOUT_MS,
            RenderMs: overrides?.RenderMs ?? DEFAULT_RENDER_TIMEOUT_MS,
            RequestMs: overrides?.RequestMs ?? DEFAULT_RENDER_REQUEST_TIMEOUT_MS,
        },
        Local: {},
        Remote: {
            ...(url !== undefined ? { Url: url } : {}),
            ...(token !== undefined ? { Token: token } : {}),
        },
        Docker: {
            Image: DEFAULT_DOCKER_RENDER_IMAGE,
            WorkspaceRoot: DEFAULT_DOCKER_WORKSPACE_ROOT,
            Cpus: DEFAULT_DOCKER_CPUS,
            MemoryMb: DEFAULT_DOCKER_MEMORY_MB,
            PidsLimit: DEFAULT_DOCKER_PIDS_LIMIT,
            ShmSizeMb: DEFAULT_DOCKER_SHM_SIZE_MB,
        },
    };
}

async function getClosedPort(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
        const srv = net.createServer();
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const addr = srv.address();
            const port = typeof addr === 'object' && addr ? addr.port : 0;
            srv.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(port);
                }
            });
        });
    });
}

describe('RemoteRenderDriver (in-process CreateRenderWorkerServer + FakeRenderBackend)', () => {
    const serverToken = 'ci-in-process-secret-token-xyz987';
    let server: RenderWorkerServer;
    let baseUrl = '';

    beforeAll(async () => {
        server = CreateRenderWorkerServer({
            Backend: new FakeRenderBackend(),
            Host: '127.0.0.1',
            Port: 0,
            Token: serverToken,
            HeartbeatIntervalMs: 50,
        });
        const port = await server.Listen(0, '127.0.0.1');
        baseUrl = `http://127.0.0.1:${port}`;
    });

    afterAll(async () => {
        await server.Close();
    });

    DescribeRenderDriverContract('RemoteRenderDriver (in-process worker)', () => {
        return new RemoteRenderDriver(makeRemoteSettings(baseUrl, serverToken));
    });
});

describe('RemoteRenderDriver validation, error handling, warnings, and env fallback', () => {
    const serverToken = 'remote-driver-test-secret-token-42';
    let server: RenderWorkerServer;
    let baseUrl = '';
    let savedEnvUrl: string | undefined;
    let savedEnvToken: string | undefined;
    const tempDirs: string[] = [];

    async function makeTempDir(): Promise<string> {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-vs-remote-driver-'));
        tempDirs.push(dir);
        return dir;
    }

    beforeAll(async () => {
        server = CreateRenderWorkerServer({
            Backend: new FakeRenderBackend(),
            Host: '127.0.0.1',
            Port: 0,
            Token: serverToken,
        });
        const port = await server.Listen(0, '127.0.0.1');
        baseUrl = `http://127.0.0.1:${port}`;
    });

    afterAll(async () => {
        await server.Close();
    });

    beforeEach(() => {
        savedEnvUrl = process.env.VIDEO_STUDIO_RENDER_URL;
        savedEnvToken = process.env.VIDEO_STUDIO_RENDER_TOKEN;
        delete process.env.VIDEO_STUDIO_RENDER_URL;
        delete process.env.VIDEO_STUDIO_RENDER_TOKEN;
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await VideoRenderEngine.Instance.Shutdown();
        VideoRenderEngine.Instance.SetSettingsSearchDir(undefined);
        if (savedEnvUrl === undefined) {
            delete process.env.VIDEO_STUDIO_RENDER_URL;
        } else {
            process.env.VIDEO_STUDIO_RENDER_URL = savedEnvUrl;
        }
        if (savedEnvToken === undefined) {
            delete process.env.VIDEO_STUDIO_RENDER_TOKEN;
        } else {
            process.env.VIDEO_STUDIO_RENDER_TOKEN = savedEnvToken;
        }
        while (tempDirs.length > 0) {
            const dir = tempDirs.pop()!;
            await fs.rm(dir, { recursive: true, force: true });
        }
    });

    it('rejects with Unauthorized when the token is wrong and never includes the token in the error message', async () => {
        const wrongToken = 'wrong-token-never-leak-this-value-999';
        const driver = new RemoteRenderDriver(makeRemoteSettings(baseUrl, wrongToken));

        let caught: unknown;
        try {
            await driver.Check({
                Bundle: CreateMinimalBundle(),
                Width: MINIMAL_BUNDLE_WIDTH,
                Height: MINIMAL_BUNDLE_HEIGHT,
            });
        } catch (err) {
            caught = err;
        }

        expect(caught).toBeInstanceOf(VideoRenderError);
        const renderErr = caught as VideoRenderError;
        expect(renderErr.Code).toBe('Unauthorized');
        expect(renderErr.message).toContain('VIDEO_STUDIO_RENDER_TOKEN');
        expect(renderErr.message).not.toContain(wrongToken);
        expect(renderErr.message).not.toContain(serverToken);
    });

    it('constructs without throwing when no URL is configured, returns Healthy: false with configuration hint, and rejects Render with WorkerUnavailable', async () => {
        const driver = new RemoteRenderDriver(makeRemoteSettings(undefined, undefined));

        const health = await driver.Health();
        expect(health.Healthy).toBe(false);
        expect(health.Errors.join(' ')).toContain(
            'set videoStudio.render.remote.url or VIDEO_STUDIO_RENDER_URL',
        );

        let caught: unknown;
        try {
            await driver.Render(CreateMinimalRenderRequest());
        } catch (err) {
            caught = err;
        }
        expect(caught).toBeInstanceOf(VideoRenderError);
        expect((caught as VideoRenderError).Code).toBe('WorkerUnavailable');
        expect((caught as VideoRenderError).message).toContain(
            'set videoStudio.render.remote.url or VIDEO_STUDIO_RENDER_URL',
        );
    });

    it('reports Healthy: false with protocol reason for ftp://x and rejects operations with WorkerUnavailable', async () => {
        const driver = new RemoteRenderDriver(makeRemoteSettings('ftp://x', 'some-token'));

        const health = await driver.Health();
        expect(health.Healthy).toBe(false);
        expect(health.Errors.join(' ')).toContain('ftp:');

        await expect(driver.Render(CreateMinimalRenderRequest())).rejects.toMatchObject({
            name: 'VideoRenderError',
            Code: 'WorkerUnavailable',
        });
    });

    it('rejects with WorkerUnavailable naming the URL (and never the token) when connecting to a closed port', async () => {
        const closedPort = await getClosedPort();
        const closedUrl = `http://127.0.0.1:${closedPort}`;
        const secretToken = 'closed-port-secret-token-do-not-leak';
        const driver = new RemoteRenderDriver(makeRemoteSettings(closedUrl, secretToken));

        let caught: unknown;
        try {
            await driver.Check({
                Bundle: CreateMinimalBundle(),
                Width: MINIMAL_BUNDLE_WIDTH,
                Height: MINIMAL_BUNDLE_HEIGHT,
            });
        } catch (err) {
            caught = err;
        }

        expect(caught).toBeInstanceOf(VideoRenderError);
        const renderErr = caught as VideoRenderError;
        expect(renderErr.Code).toBe('WorkerUnavailable');
        expect(renderErr.message).toContain(closedUrl);
        expect(renderErr.message).not.toContain(secretToken);
    });

    it('logs one LogWarning per driver instance for http://10.0.0.5:8080 across two calls, and does not warn for http://127.0.0.1:...', async () => {
        const warnSpy = vi.spyOn(mjCore, 'LogWarning').mockImplementation(() => undefined);

        const nonLoopbackDriver = new RemoteRenderDriver(
            makeRemoteSettings('http://10.0.0.5:8080', 'secret-token', {
                RequestMs: 150,
            }),
        );
        await nonLoopbackDriver.Health().catch(() => undefined);
        await nonLoopbackDriver.Health().catch(() => undefined);

        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0]![0]).toContain('unencrypted');
        expect(warnSpy.mock.calls[0]![0]).toContain('https');
        expect(warnSpy.mock.calls[0]![0]).not.toContain('secret-token');

        warnSpy.mockClear();

        const loopbackDriver = new RemoteRenderDriver(makeRemoteSettings(baseUrl, serverToken));
        const health1 = await loopbackDriver.Health();
        const health2 = await loopbackDriver.Health();
        expect(health1.Healthy).toBe(true);
        expect(health2.Healthy).toBe(true);
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('uses VIDEO_STUDIO_RENDER_URL and VIDEO_STUDIO_RENDER_TOKEN env fallback, and mj.config.cjs beats env', async () => {
        process.env.VIDEO_STUDIO_RENDER_URL = baseUrl;
        process.env.VIDEO_STUDIO_RENDER_TOKEN = serverToken;

        const emptyDir = await makeTempDir();
        await fs.writeFile(
            path.join(emptyDir, 'mj.config.cjs'),
            `module.exports = { videoStudio: { render: { driver: 'Remote' } } };\n`,
            'utf8',
        );

        const envDriver = new RemoteRenderDriver(ReadVideoRenderSettings(emptyDir));
        const envHealth = await envDriver.Health();
        expect(envHealth.Healthy).toBe(true);

        // Now set env vars to an invalid port/token, and verify mj.config.cjs values win over env
        const closedPort = await getClosedPort();
        process.env.VIDEO_STUDIO_RENDER_URL = `http://127.0.0.1:${closedPort}`;
        process.env.VIDEO_STUDIO_RENDER_TOKEN = 'wrong-env-token';

        const configDir = await makeTempDir();
        const configContent = `module.exports = {
            videoStudio: {
                render: {
                    driver: 'Remote',
                    remote: {
                        url: ${JSON.stringify(baseUrl)},
                        token: ${JSON.stringify(serverToken)},
                    },
                },
            },
        };\n`;
        await fs.writeFile(path.join(configDir, 'mj.config.cjs'), configContent, 'utf8');

        VideoRenderEngine.Instance.SetSettingsSearchDir(configDir);
        const engineDriver = VideoRenderEngine.Instance.Driver;
        expect(engineDriver).toBeInstanceOf(RemoteRenderDriver);
        const configHealth = await engineDriver.Health();
        expect(configHealth.Healthy).toBe(true);
    });
});

describe.skipIf(!(OPT_IN_RENDER_TESTS && Boolean(OPT_IN_RENDER_URL)))(
    'RemoteRenderDriver (opt-in real external worker via VIDEO_STUDIO_RENDER_TESTS=1 & VIDEO_STUDIO_RENDER_URL)',
    () => {
        DescribeRenderDriverContract('RemoteRenderDriver (real external worker)', () => {
            return new RemoteRenderDriver(
                makeRemoteSettings(OPT_IN_RENDER_URL, OPT_IN_RENDER_TOKEN),
            );
        });
    },
);
