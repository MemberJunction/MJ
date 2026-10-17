import { constants as bufferConstants } from 'node:buffer';
import * as fs from 'node:fs/promises';
import * as http from 'node:http';
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
    DEFAULT_RENDER_MAX_OUTPUT_BYTES,
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
    maxOutputBytes: number = DEFAULT_RENDER_MAX_OUTPUT_BYTES,
): VideoRenderSettings {
    return {
        Driver: 'Remote',
        MaxOutputBytes: maxOutputBytes,
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

    it('rejects Check with Unauthorized and returns Healthy: false from Health() when the token is wrong, without leaking the token', async () => {
        const wrongToken = 'wrong-token-never-leak-this-value-999';
        const driver = new RemoteRenderDriver(makeRemoteSettings(baseUrl, wrongToken));

        const health = await driver.Health();
        expect(health.Healthy).toBe(false);
        expect(health.Errors.join(' ')).toContain(baseUrl);
        expect(health.Errors.join(' ')).toContain('VIDEO_STUDIO_RENDER_TOKEN');
        expect(health.Errors.join(' ')).not.toContain(wrongToken);
        expect(health.Errors.join(' ')).not.toContain(serverToken);

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

    it('returns Healthy: false naming the URL and rejects Check with WorkerUnavailable when connecting to a closed port (never leaking the token)', async () => {
        const closedPort = await getClosedPort();
        const closedUrl = `http://127.0.0.1:${closedPort}`;
        const secretToken = 'closed-port-secret-token-do-not-leak';
        const driver = new RemoteRenderDriver(makeRemoteSettings(closedUrl, secretToken));

        const health = await driver.Health();
        expect(health.Healthy).toBe(false);
        expect(health.Errors.join(' ')).toContain(closedUrl);
        expect(health.Errors.join(' ')).not.toContain(secretToken);

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
            makeRemoteSettings('http://10.0.0.5:8080', 'secret-token'),
        );
        const abortedSignal = AbortSignal.abort();
        const abortedHealth1 = await nonLoopbackDriver.Health(abortedSignal);
        const abortedHealth2 = await nonLoopbackDriver.Health(abortedSignal);
        expect(abortedHealth1.Healthy).toBe(false);
        expect(abortedHealth2.Healthy).toBe(false);

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

    it('uses VIDEO_STUDIO_RENDER_URL and VIDEO_STUDIO_RENDER_TOKEN env fallback via ReadVideoRenderSettings, while direct Remote: {} ignores env', async () => {
        process.env.VIDEO_STUDIO_RENDER_URL = baseUrl;
        process.env.VIDEO_STUDIO_RENDER_TOKEN = serverToken;

        // A driver constructed directly with Remote: {} does not re-read process.env on its own
        const unconfiguredDirect = new RemoteRenderDriver(makeRemoteSettings(undefined, undefined));
        const directHealth = await unconfiguredDirect.Health();
        expect(directHealth.Healthy).toBe(false);
        expect(directHealth.Errors.join(' ')).toContain(
            'set videoStudio.render.remote.url or VIDEO_STUDIO_RENDER_URL',
        );

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

    it('scales across multiple worker URLs via Remote.Urls without Health() advancing the job rotation', async () => {
        const backend1 = new FakeRenderBackend();
        const backend2 = new FakeRenderBackend();
        const renderOrder: string[] = [];
        const origRender1 = backend1.Render.bind(backend1);
        const origRender2 = backend2.Render.bind(backend2);
        vi.spyOn(backend1, 'Render').mockImplementation(async (job, onProgress, signal) => {
            renderOrder.push('worker-1');
            return origRender1(job, onProgress, signal);
        });
        vi.spyOn(backend2, 'Render').mockImplementation(async (job, onProgress, signal) => {
            renderOrder.push('worker-2');
            return origRender2(job, onProgress, signal);
        });

        const poolToken = 'pool-shared-secret-token';
        const worker1 = CreateRenderWorkerServer({
            Backend: backend1,
            Host: '127.0.0.1',
            Port: 0,
            Token: poolToken,
        });
        const worker2 = CreateRenderWorkerServer({
            Backend: backend2,
            Host: '127.0.0.1',
            Port: 0,
            Token: poolToken,
        });
        const port1 = await worker1.Listen(0, '127.0.0.1');
        const port2 = await worker2.Listen(0, '127.0.0.1');
        try {
            const url1 = `http://127.0.0.1:${port1}`;
            const url2 = `http://127.0.0.1:${port2}`;
            const baseSettings = makeRemoteSettings(undefined, poolToken);
            const poolDriver = new RemoteRenderDriver({
                ...baseSettings,
                Remote: {
                    Urls: [url1, url2],
                    Token: poolToken,
                },
            });

            // Health() probes the entire pool and must not advance nextClientIndex before Render() calls.
            const health = await poolDriver.Health();
            expect(health.Healthy).toBe(true);
            expect(health.Errors).toEqual([]);

            // Each worker stores its rendered MP4 only in its own in-memory videoStore; if GET /videos/<id>
            // went to the other worker, Render() would reject with NotFound.
            const res1 = await poolDriver.Render(CreateMinimalRenderRequest());
            const res2 = await poolDriver.Render(CreateMinimalRenderRequest());
            const res3 = await poolDriver.Render(CreateMinimalRenderRequest());

            expect(res1.Video.byteLength).toBeGreaterThan(0);
            expect(res2.Video.byteLength).toBeGreaterThan(0);
            expect(res3.Video.byteLength).toBeGreaterThan(0);
            expect(renderOrder).toEqual(['worker-1', 'worker-2', 'worker-1']);
        } finally {
            await worker1.Close();
            await worker2.Close();
        }
    });

    it('probes every worker in Remote.Urls during Health() and reports Healthy: false on every call when one member is closed (naming the closed URL and never leaking the token)', async () => {
        const closedPort = await getClosedPort();
        const closedUrl = `http://127.0.0.1:${closedPort}`;
        const baseSettings = makeRemoteSettings(undefined, serverToken);
        const poolDriver = new RemoteRenderDriver({
            ...baseSettings,
            Remote: {
                Urls: [baseUrl, closedUrl],
                Token: serverToken,
            },
        });

        const health1 = await poolDriver.Health();
        const health2 = await poolDriver.Health();

        expect(health1.Healthy).toBe(false);
        expect(health2.Healthy).toBe(false);
        expect(health1.Errors.join(' ')).toContain(closedUrl);
        expect(health2.Errors.join(' ')).toContain(closedUrl);
        expect(health1.Errors.join(' ')).not.toContain(serverToken);
        expect(health2.Errors.join(' ')).not.toContain(serverToken);
        expect(health1.FfmpegVersion).toBeTruthy();
    });
});

describe('RemoteRenderDriver and RenderWorkerHttpClient response size caps (fake worker)', () => {
    const fakeToken = 'fake-worker-cap-test-token';

    function buildFakeResultLine(videoId: string, videoSizeBytes?: number): string {
        const resultPayload: Record<string, unknown> = {
            Format: 'HyperFramesBundle',
            VideoID: videoId,
            MimeType: 'video/mp4',
            Width: MINIMAL_BUNDLE_WIDTH,
            Height: MINIMAL_BUNDLE_HEIGHT,
            Fps: 30,
            DurationSeconds: 1,
            FrameCount: 30,
            HasAudio: false,
            RendererVersion: 'fake-1.0',
            RenderDurationMs: 12,
        };
        if (videoSizeBytes !== undefined) {
            resultPayload.VideoSizeBytes = videoSizeBytes;
        }
        return JSON.stringify({ Type: 'Result', Result: resultPayload }) + '\n';
    }

    async function withFakeHttpWorker(
        handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
        fn: (url: string) => Promise<void>,
    ): Promise<void> {
        const srv = http.createServer(handler);
        await new Promise<void>((resolve, reject) => {
            srv.once('error', reject);
            srv.listen(0, '127.0.0.1', () => resolve());
        });
        const addr = srv.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        const url = `http://127.0.0.1:${port}`;
        try {
            await fn(url);
        } finally {
            await new Promise<void>((resolve) => srv.close(() => resolve()));
        }
    }

    it('rejects Render with BodyTooLarge and aborts download when worker claims 10 bytes and streams 64 MiB', async () => {
        const totalStreamBytes = 64 * 1024 * 1024;
        const chunkBytes = 64 * 1024;
        const totalChunks = totalStreamBytes / chunkBytes;
        const chunkBuf = Buffer.alloc(chunkBytes, 0x41);
        let bytesWrittenByServer = 0;
        let serverFinishedFullStream = false;
        let resolveServerStreamDone!: () => void;
        const serverStreamDone = new Promise<void>((resolve) => {
            resolveServerStreamDone = resolve;
        });

        await withFakeHttpWorker(
            (req, res) => {
                if (req.method === 'POST' && req.url === '/render') {
                    req.resume();
                    req.on('end', () => {
                        res.writeHead(200, { 'content-type': 'application/x-ndjson' });
                        res.end(buildFakeResultLine('vid-claim-10', 10));
                    });
                    return;
                }
                if (req.method === 'GET' && req.url === '/videos/vid-claim-10') {
                    res.writeHead(200, { 'content-type': 'video/mp4' });
                    let remainingChunks = totalChunks;
                    res.once('close', () => {
                        resolveServerStreamDone();
                    });
                    const writeNext = (): void => {
                        if (res.destroyed || res.writableEnded) {
                            resolveServerStreamDone();
                            return;
                        }
                        if (remainingChunks <= 0) {
                            serverFinishedFullStream = true;
                            res.end(() => resolveServerStreamDone());
                            return;
                        }
                        remainingChunks--;
                        bytesWrittenByServer += chunkBuf.byteLength;
                        const canContinue = res.write(chunkBuf);
                        if (canContinue) {
                            setImmediate(writeNext);
                        } else {
                            res.once('drain', writeNext);
                        }
                    };
                    writeNext();
                    return;
                }
                res.writeHead(404).end();
            },
            async (url) => {
                const driver = new RemoteRenderDriver(makeRemoteSettings(url, fakeToken));
                let caught: unknown;
                try {
                    await driver.Render(CreateMinimalRenderRequest());
                } catch (err) {
                    caught = err;
                }
                expect(caught).toBeInstanceOf(VideoRenderError);
                const renderErr = caught as VideoRenderError;
                expect(renderErr.Code).toBe('BodyTooLarge');
                expect(renderErr.message).toContain('claimed VideoSizeBytes');
                expect(renderErr.message).toContain('10');
                expect(renderErr.message).not.toContain(fakeToken);

                await serverStreamDone;
                expect(serverFinishedFullStream).toBe(false);
                expect(bytesWrittenByServer).toBeGreaterThan(10);
                expect(bytesWrittenByServer).toBeLessThan(16 * 1024 * 1024);
            },
        );
    });

    it('rejects Render with BodyTooLarge before making a GET /videos request when claimed VideoSizeBytes exceeds MaxOutputBytes', async () => {
        const smallMaxOutputBytes = 1024 * 1024;
        let videoGetRequests = 0;

        await withFakeHttpWorker(
            (req, res) => {
                if (req.method === 'POST' && req.url === '/render') {
                    req.resume();
                    req.on('end', () => {
                        res.writeHead(200, { 'content-type': 'application/x-ndjson' });
                        res.end(buildFakeResultLine('vid-claim-over-max', 10 * 1024 * 1024));
                    });
                    return;
                }
                if (req.method === 'GET' && req.url?.startsWith('/videos/')) {
                    videoGetRequests++;
                    res.writeHead(200, { 'content-type': 'video/mp4' });
                    res.end(Buffer.alloc(64, 0x41));
                    return;
                }
                res.writeHead(404).end();
            },
            async (url) => {
                const driver = new RemoteRenderDriver(
                    makeRemoteSettings(url, fakeToken, undefined, smallMaxOutputBytes),
                );
                await expect(driver.Render(CreateMinimalRenderRequest())).rejects.toMatchObject({
                    name: 'VideoRenderError',
                    Code: 'BodyTooLarge',
                });
                expect(videoGetRequests).toBe(0);
            },
        );
    });

    it('rejects Render with BodyTooLarge when POST /render returns HTTP 500 with a 2 MiB error body', async () => {
        const twoMiBErrorBody = JSON.stringify({
            Error: {
                Code: 'Internal',
                Message: 'x'.repeat(2 * 1024 * 1024),
            },
        });

        await withFakeHttpWorker(
            (req, res) => {
                req.resume();
                req.on('end', () => {
                    if (req.method === 'POST' && req.url === '/render') {
                        res.writeHead(500, { 'content-type': 'application/json' });
                        res.end(twoMiBErrorBody);
                        return;
                    }
                    res.writeHead(404).end();
                });
            },
            async (url) => {
                const driver = new RemoteRenderDriver(makeRemoteSettings(url, fakeToken));
                await expect(driver.Render(CreateMinimalRenderRequest())).rejects.toMatchObject({
                    name: 'VideoRenderError',
                    Code: 'BodyTooLarge',
                });
            },
        );
    });

    it('rejects CaptureStills with BodyTooLarge when POST /stills returns HTTP 500 with a 2 MiB error body at default MaxOutputBytes and rejects Render with BodyTooLarge when GET /videos/<id> returns HTTP 500 with a 2 MiB error body', async () => {
        const twoMiBErrorBody = JSON.stringify({
            Error: {
                Code: 'Internal',
                Message: 'x'.repeat(2 * 1024 * 1024),
            },
        });

        await withFakeHttpWorker(
            (req, res) => {
                req.resume();
                req.on('end', () => {
                    if (req.method === 'POST' && req.url === '/stills') {
                        res.writeHead(500, { 'content-type': 'application/json' });
                        res.end(twoMiBErrorBody);
                        return;
                    }
                    if (req.method === 'POST' && req.url === '/render') {
                        res.writeHead(200, { 'content-type': 'application/x-ndjson' });
                        res.end(buildFakeResultLine('vid-500-err-body', 64));
                        return;
                    }
                    if (req.method === 'GET' && req.url === '/videos/vid-500-err-body') {
                        res.writeHead(500, { 'content-type': 'application/json' });
                        res.end(twoMiBErrorBody);
                        return;
                    }
                    res.writeHead(404).end();
                });
            },
            async (url) => {
                const driver = new RemoteRenderDriver(makeRemoteSettings(url, fakeToken));
                await expect(
                    driver.CaptureStills({
                        Bundle: CreateMinimalBundle(),
                        Width: MINIMAL_BUNDLE_WIDTH,
                        Height: MINIMAL_BUNDLE_HEIGHT,
                        Points: [{ Key: 's1', TimestampSeconds: 0.5, Role: 'Custom', Label: 'S1' }],
                    }),
                ).rejects.toMatchObject({
                    name: 'VideoRenderError',
                    Code: 'BodyTooLarge',
                });

                await expect(driver.Render(CreateMinimalRenderRequest())).rejects.toMatchObject({
                    name: 'VideoRenderError',
                    Code: 'BodyTooLarge',
                });
            },
        );
    });

    it('allows a 1.6 MB still in CaptureStills under default MaxOutputBytes, rejects when MaxOutputBytes is smaller, and still caps Check at 1 MiB', async () => {
        const onePointSixMbPngBase64 = Buffer.alloc(Math.ceil(1.6 * 1024 * 1024), 0x89).toString('base64');
        const twoMiBPadding = 'x'.repeat(2 * 1024 * 1024);

        await withFakeHttpWorker(
            (req, res) => {
                req.resume();
                req.on('end', () => {
                    if (req.method === 'POST' && req.url === '/stills') {
                        res.writeHead(200, { 'content-type': 'application/json' });
                        res.end(
                            JSON.stringify({
                                Stills: [
                                    {
                                        Key: 'hero-1080p',
                                        TimestampSeconds: 1.0,
                                        Width: 1920,
                                        Height: 1080,
                                        MimeType: 'image/png',
                                        ImageBase64: onePointSixMbPngBase64,
                                    },
                                ],
                                ElapsedMs: 15,
                            }),
                        );
                        return;
                    }
                    if (req.method === 'POST' && req.url === '/check') {
                        res.writeHead(200, { 'content-type': 'application/json' });
                        res.end(JSON.stringify({ Passed: true, Padding: twoMiBPadding }));
                        return;
                    }
                    res.writeHead(404).end();
                });
            },
            async (url) => {
                const defaultDriver = new RemoteRenderDriver(makeRemoteSettings(url, fakeToken));
                const stillsResult = await defaultDriver.CaptureStills({
                    Bundle: CreateMinimalBundle(),
                    Width: MINIMAL_BUNDLE_WIDTH,
                    Height: MINIMAL_BUNDLE_HEIGHT,
                    Points: [{ Key: 'hero-1080p', TimestampSeconds: 1.0, Role: 'Custom', Label: 'Hero 1080p' }],
                });
                expect(stillsResult.Stills).toHaveLength(1);
                expect(stillsResult.Stills[0].Key).toBe('hero-1080p');
                expect(stillsResult.Stills[0].ImageBase64.length).toBe(onePointSixMbPngBase64.length);

                const smallCapDriver = new RemoteRenderDriver(
                    makeRemoteSettings(url, fakeToken, undefined, 512 * 1024),
                );
                await expect(
                    smallCapDriver.CaptureStills({
                        Bundle: CreateMinimalBundle(),
                        Width: MINIMAL_BUNDLE_WIDTH,
                        Height: MINIMAL_BUNDLE_HEIGHT,
                        Points: [{ Key: 'hero-1080p', TimestampSeconds: 1.0, Role: 'Custom', Label: 'Hero 1080p' }],
                    }),
                ).rejects.toMatchObject({
                    name: 'VideoRenderError',
                    Code: 'BodyTooLarge',
                });

                await expect(
                    defaultDriver.Check({
                        Bundle: CreateMinimalBundle(),
                        Width: MINIMAL_BUNDLE_WIDTH,
                        Height: MINIMAL_BUNDLE_HEIGHT,
                    }),
                ).rejects.toMatchObject({
                    name: 'VideoRenderError',
                    Code: 'BodyTooLarge',
                });
            },
        );
    });

    it('rejects Render with BodyTooLarge when worker omits VideoSizeBytes and sends more than MaxOutputBytes', async () => {
        const smallMaxOutputBytes = 2048;

        await withFakeHttpWorker(
            (req, res) => {
                if (req.method === 'POST' && req.url === '/render') {
                    req.resume();
                    req.on('end', () => {
                        // Omit VideoSizeBytes from the Result payload to exercise the MaxOutputBytes hard cap
                        res.writeHead(200, { 'content-type': 'application/x-ndjson' });
                        res.end(buildFakeResultLine('vid-no-claim'));
                    });
                    return;
                }
                if (req.method === 'GET' && req.url === '/videos/vid-no-claim') {
                    res.writeHead(200, { 'content-type': 'video/mp4' });
                    res.end(Buffer.alloc(16 * 1024, 0x42));
                    return;
                }
                res.writeHead(404).end();
            },
            async (url) => {
                const driver = new RemoteRenderDriver(
                    makeRemoteSettings(url, fakeToken, undefined, smallMaxOutputBytes),
                );
                let caught: unknown;
                try {
                    await driver.Render(CreateMinimalRenderRequest());
                } catch (err) {
                    caught = err;
                }
                expect(caught).toBeInstanceOf(VideoRenderError);
                const renderErr = caught as VideoRenderError;
                expect(renderErr.Code).toBe('BodyTooLarge');
                expect(renderErr.message).toContain(String(smallMaxOutputBytes));
            },
        );
    });

    it('rejects Render with Internal when claimed VideoSizeBytes and actual streamed size differ', async () => {
        await withFakeHttpWorker(
            (req, res) => {
                if (req.method === 'POST' && req.url === '/render') {
                    req.resume();
                    req.on('end', () => {
                        res.writeHead(200, { 'content-type': 'application/x-ndjson' });
                        res.end(buildFakeResultLine('vid-mismatch', 500));
                    });
                    return;
                }
                if (req.method === 'GET' && req.url === '/videos/vid-mismatch') {
                    res.writeHead(200, { 'content-type': 'video/mp4' });
                    res.end(Buffer.alloc(200, 0x43));
                    return;
                }
                res.writeHead(404).end();
            },
            async (url) => {
                const driver = new RemoteRenderDriver(makeRemoteSettings(url, fakeToken));
                let caught: unknown;
                try {
                    await driver.Render(CreateMinimalRenderRequest());
                } catch (err) {
                    caught = err;
                }
                expect(caught).toBeInstanceOf(VideoRenderError);
                const renderErr = caught as VideoRenderError;
                expect(renderErr.Code).toBe('Internal');
                expect(renderErr.message).toContain('200');
                expect(renderErr.message).toContain('500');
            },
        );
    });

    it('rejects Render when worker sends a 2 MiB NDJSON line and rejects Check when JSON body exceeds 1 MiB', async () => {
        const twoMiBLine = 'x'.repeat(2 * 1024 * 1024);

        await withFakeHttpWorker(
            (req, res) => {
                req.resume();
                req.on('end', () => {
                    if (req.method === 'POST' && req.url === '/render') {
                        res.writeHead(200, { 'content-type': 'application/x-ndjson' });
                        res.end(twoMiBLine + '\n');
                        return;
                    }
                    if (req.method === 'POST' && req.url === '/check') {
                        res.writeHead(200, { 'content-type': 'application/json' });
                        res.end(JSON.stringify({ Passed: true, Padding: twoMiBLine }));
                        return;
                    }
                    res.writeHead(404).end();
                });
            },
            async (url) => {
                const driver = new RemoteRenderDriver(makeRemoteSettings(url, fakeToken));

                await expect(driver.Render(CreateMinimalRenderRequest())).rejects.toMatchObject({
                    name: 'VideoRenderError',
                    Code: 'BodyTooLarge',
                });

                await expect(
                    driver.Check({
                        Bundle: CreateMinimalBundle(),
                        Width: MINIMAL_BUNDLE_WIDTH,
                        Height: MINIMAL_BUNDLE_HEIGHT,
                    }),
                ).rejects.toMatchObject({
                    name: 'VideoRenderError',
                    Code: 'BodyTooLarge',
                });
            },
        );
    });

    it('returns the exact MP4 bytes on a normal render within limits', async () => {
        const expectedBytes = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);

        await withFakeHttpWorker(
            (req, res) => {
                if (req.method === 'POST' && req.url === '/render') {
                    req.resume();
                    req.on('end', () => {
                        res.writeHead(200, { 'content-type': 'application/x-ndjson' });
                        res.end(buildFakeResultLine('vid-normal', expectedBytes.byteLength));
                    });
                    return;
                }
                if (req.method === 'GET' && req.url === '/videos/vid-normal') {
                    res.writeHead(200, { 'content-type': 'video/mp4' });
                    res.end(expectedBytes);
                    return;
                }
                res.writeHead(404).end();
            },
            async (url) => {
                const driver = new RemoteRenderDriver(makeRemoteSettings(url, fakeToken));
                const result = await driver.Render(CreateMinimalRenderRequest());
                expect(Buffer.from(result.Video).equals(expectedBytes)).toBe(true);
            },
        );
    });

    it.skipIf(!OPT_IN_RENDER_TESTS)(
        'rejects CaptureStills with BodyTooLarge when a 200 /stills response streams MAX_STRING_LENGTH + 1 bytes (opt-in via VIDEO_STUDIO_RENDER_TESTS=1)',
        async () => {
            const targetBytes = bufferConstants.MAX_STRING_LENGTH + 1;
            const reusedChunk = Buffer.alloc(64 * 1024, 0x61);

            await withFakeHttpWorker(
                (req, res) => {
                    req.resume();
                    req.on('end', () => {
                        if (req.method === 'POST' && req.url === '/stills') {
                            res.writeHead(200, { 'content-type': 'application/json' });
                            let remaining = targetBytes;
                            const writeNext = (): void => {
                                while (remaining > 0 && !res.destroyed && !res.writableEnded) {
                                    const slice =
                                        remaining >= reusedChunk.byteLength
                                            ? reusedChunk
                                            : reusedChunk.subarray(0, remaining);
                                    remaining -= slice.byteLength;
                                    if (!res.write(slice)) {
                                        res.once('drain', writeNext);
                                        return;
                                    }
                                }
                                if (!res.destroyed && !res.writableEnded) {
                                    res.end();
                                }
                            };
                            writeNext();
                            return;
                        }
                        res.writeHead(404).end();
                    });
                },
                async (url) => {
                    const driver = new RemoteRenderDriver(makeRemoteSettings(url, fakeToken));
                    let caught: unknown;
                    try {
                        await driver.CaptureStills({
                            Bundle: CreateMinimalBundle(),
                            Width: MINIMAL_BUNDLE_WIDTH,
                            Height: MINIMAL_BUNDLE_HEIGHT,
                            Points: [{ Key: 's-max-str', TimestampSeconds: 0.5, Role: 'Custom', Label: 'MaxStr' }],
                        });
                    } catch (err) {
                        caught = err;
                    }
                    expect(caught).toBeInstanceOf(VideoRenderError);
                    const renderErr = caught as VideoRenderError;
                    expect(renderErr.Code).toBe('BodyTooLarge');
                    expect(renderErr.message).toContain(String(bufferConstants.MAX_STRING_LENGTH));
                },
            );
        },
    );
});

// Two-shell opt-in run against a separately started real worker:
//   Shell 1:
//     DO_NOT_TRACK=1 HYPERFRAMES_NO_TELEMETRY=1 VIDEO_STUDIO_RENDER_HOST=127.0.0.1 VIDEO_STUDIO_RENDER_PORT=18081 VIDEO_STUDIO_RENDER_TOKEN=test-token node packages/AI/VideoStudio/RenderWorker/dist/main.js
//   Shell 2:
//     DO_NOT_TRACK=1 HYPERFRAMES_NO_TELEMETRY=1 VIDEO_STUDIO_RENDER_TESTS=1 VIDEO_STUDIO_RENDER_URL=http://127.0.0.1:18081 VIDEO_STUDIO_RENDER_TOKEN=test-token pnpm --filter @memberjunction/video-studio test
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
