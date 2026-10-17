import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import * as http from 'node:http';
import {
    RENDER_WORKER_ROUTES,
    type CheckRequest,
    type ContactSheetRequest,
    type KeyframeRequest,
    type RenderProgress,
    type RenderRequest,
    type RenderResultMetadata,
    type RenderStreamEvent,
    type RenderWorkerErrorBody,
    type RenderWorkerErrorCode,
    type StillsRequest,
} from '@memberjunction/video-studio-core';
import {
    RenderWorkerError,
    type RenderBackend,
} from './backend.js';
import {
    StageRenderBundle,
    ValidateCompositionGeometryMatch,
    ValidateRenderGeometry,
} from './bundle.js';
import {
    RunCheckJob,
    RunContactSheetJob,
    RunKeyframesJob,
    RunRenderJob,
    RunStillsJob,
} from './jobs.js';
import { RunLintGate } from './lint-gate.js';

/** Default bind host for the render worker HTTP server. */
export const DEFAULT_HOST = '127.0.0.1';

/** Default bind port (`0` selects an ephemeral OS-assigned port). */
export const DEFAULT_PORT = 0;

/** Default maximum JSON request body size in megabytes (256 MiB). */
export const DEFAULT_MAX_BODY_MB = 256;

/** Default maximum JSON request body size in bytes (256 MiB). */
export const DEFAULT_MAX_BODY_BYTES = DEFAULT_MAX_BODY_MB * 1024 * 1024;

/** Default maximum concurrent jobs (`/check`, `/render`, `/stills`, `/contact-sheet`, `/keyframes`). */
export const DEFAULT_CONCURRENCY = 1;

/** Default per-job timeout ceiling (30 minutes). */
export const DEFAULT_MAX_TIMEOUT_MS = 30 * 60 * 1000;

/** Default timeout for non-render jobs (`/check`, `/stills`, `/contact-sheet`, `/keyframes`, pre-render lint) (5 minutes). */
export const DEFAULT_NON_RENDER_TIMEOUT_MS = 5 * 60 * 1000;

/** Default heartbeat interval for streaming `/render` responses (15 seconds). */
export const DEFAULT_HEARTBEAT_MS = 15_000;

/** Default TTL for unfetched rendered MP4 buffers in the video store (10 minutes). */
export const DEFAULT_VIDEO_TTL_MS = 10 * 60 * 1000;

/**
 * Configuration options for `CreateRenderWorkerServer`.
 */
export interface RenderWorkerServerOptions {
    /** Rendering backend (`FakeRenderBackend` in unit tests, `HyperFramesRenderBackend` in production). */
    Backend: RenderBackend;
    /** Default bind host when `Listen()` is called without an explicit host (defaults to `'127.0.0.1'`). */
    Host?: string;
    /** Default bind port when `Listen()` is called without an explicit port (defaults to `0`). */
    Port?: number;
    /** Optional bearer token required on every route (including `GET /health`). */
    Token?: string;
    /** Alias for `Token` (optional bearer token required on every route including `GET /health`). */
    BearerToken?: string;
    /** Maximum request body size in megabytes (defaults to 256 MiB). */
    MaxBodyMb?: number;
    /** Maximum request body size in bytes (if set, overrides `MaxBodyMb`). */
    MaxBodyBytes?: number;
    /** Maximum concurrent render/check/capture jobs (defaults to 1). */
    Concurrency?: number;
    /** Maximum timeout in milliseconds per job (defaults to 1,800,000 ms / 30 min). */
    MaxTimeoutMs?: number;
    /** Default timeout in milliseconds for non-render jobs and pre-render lint (defaults to 300,000 ms / 5 min). */
    NonRenderTimeoutMs?: number;
    /** Base directory for temporary bundle staging and keyframe extraction (defaults to `os.tmpdir()`). */
    TempRoot?: string;
    /** Interval in milliseconds for `Heartbeat` NDJSON events on `/render` (defaults to 15,000 ms). */
    HeartbeatIntervalMs?: number;
    /** TTL in milliseconds for unfetched MP4 entries in `/videos/<VideoID>` (defaults to 600,000 ms). */
    VideoTtlMs?: number;
}

/**
 * Running HTTP render worker server handle returned by `CreateRenderWorkerServer`.
 */
export interface RenderWorkerServer {
    /** Underlying Node `http.Server`. */
    readonly HttpServer: http.Server;
    /** Bound TCP port after `Listen` resolves (`0` before listening). */
    readonly Port: number;
    /** Starts listening on `host` and `port` (defaults to `options.Host ?? '127.0.0.1'` and `options.Port ?? 0`). */
    Listen(port?: number, host?: string): Promise<number>;
    /** Aborts in-flight jobs, clears the video store, and closes the HTTP server. */
    Close(): Promise<void>;
}

interface StoredVideoEntry {
    Bytes: Uint8Array;
    Timer: NodeJS.Timeout;
}

/**
 * Returns `true` when `host` is a loopback address (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`, or `localhost`).
 */
export function IsLoopbackHost(host: string): boolean {
    const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, '');
    return (
        normalized === '127.0.0.1' ||
        normalized === '::1' ||
        normalized === '::ffff:127.0.0.1' ||
        normalized === 'localhost'
    );
}

function assertLoopbackOrToken(host: string, bearerToken: string | undefined): void {
    if (!IsLoopbackHost(host) && !bearerToken) {
        throw new Error(
            `Refusing to bind render worker to non-loopback host "${host}" without a bearer token.`,
        );
    }
}

/**
 * Creates an HTTP server implementing all `RENDER_WORKER_ROUTES`.
 *
 * Notice that this module does NOT import `hyperframes-backend.ts`; callers inject `Backend`.
 */
export function CreateRenderWorkerServer(options: RenderWorkerServerOptions): RenderWorkerServer {
    const backend = options.Backend;
    const defaultHost = options.Host?.trim() || DEFAULT_HOST;
    const defaultPort =
        options.Port !== undefined && Number.isFinite(options.Port) && options.Port >= 0
            ? options.Port
            : DEFAULT_PORT;
    const bearerToken = (options.Token ?? options.BearerToken)?.trim() || undefined;

    assertLoopbackOrToken(defaultHost, bearerToken);

    const maxBodyBytes =
        options.MaxBodyBytes ??
        (options.MaxBodyMb !== undefined && Number.isFinite(options.MaxBodyMb) && options.MaxBodyMb > 0
            ? Math.round(options.MaxBodyMb * 1024 * 1024)
            : DEFAULT_MAX_BODY_BYTES);
    const maxConcurrency = Math.max(1, options.Concurrency ?? DEFAULT_CONCURRENCY);
    const maxTimeoutMs = Math.max(50, options.MaxTimeoutMs ?? DEFAULT_MAX_TIMEOUT_MS);
    const nonRenderTimeoutMs = Math.min(
        maxTimeoutMs,
        Math.max(50, options.NonRenderTimeoutMs ?? DEFAULT_NON_RENDER_TIMEOUT_MS),
    );
    const tempRoot = options.TempRoot?.trim() || undefined;
    const heartbeatMs = Math.max(10, options.HeartbeatIntervalMs ?? DEFAULT_HEARTBEAT_MS);
    const videoTtlMs = Math.max(10, options.VideoTtlMs ?? DEFAULT_VIDEO_TTL_MS);

    const semaphore = new AsyncSemaphore(maxConcurrency);
    const activeAbortControllers = new Set<AbortController>();
    const videoStore = new Map<string, StoredVideoEntry>();
    let boundPort = 0;

    const storeVideo = (bytes: Uint8Array): string => {
        const videoId = randomUUID();
        const timer = setTimeout(() => {
            videoStore.delete(videoId);
        }, videoTtlMs);
        timer.unref();
        videoStore.set(videoId, { Bytes: bytes, Timer: timer });
        return videoId;
    };

    const takeVideo = (videoId: string): Uint8Array | undefined => {
        const entry = videoStore.get(videoId);
        if (!entry) {
            return undefined;
        }
        clearTimeout(entry.Timer);
        videoStore.delete(videoId);
        return entry.Bytes;
    };

    const httpServer = http.createServer((req, res) => {
        void handleRequest(req, res).catch((err) => {
            if (!res.headersSent) {
                sendErrorJson(res, toRenderWorkerError(err));
            } else {
                res.destroy();
            }
        });
    });

    async function handleRequest(
        req: http.IncomingMessage,
        res: http.ServerResponse,
    ): Promise<void> {
        const method = req.method ?? 'GET';
        const urlPath = (req.url ?? '/').split('?')[0] ?? '/';

        if (bearerToken && !verifyBearerToken(req.headers.authorization, bearerToken)) {
            sendErrorJson(res, new RenderWorkerError('Unauthorized', 'Missing or invalid Bearer token.'));
            return;
        }

        if (method === 'GET' && urlPath === RENDER_WORKER_ROUTES.Health) {
            const health = await backend.Health();
            sendJson(res, health.Healthy ? 200 : 503, health);
            return;
        }

        if (method === 'GET' && urlPath.startsWith(`${RENDER_WORKER_ROUTES.Video}/`)) {
            const videoId = decodeURIComponent(urlPath.slice(RENDER_WORKER_ROUTES.Video.length + 1));
            const videoBytes = videoId ? takeVideo(videoId) : undefined;
            if (!videoBytes) {
                sendErrorJson(res, new RenderWorkerError('NotFound', `Video "${videoId}" was not found.`));
                return;
            }
            res.writeHead(200, {
                'Content-Type': 'video/mp4',
                'Content-Length': String(videoBytes.byteLength),
                'Cache-Control': 'no-store',
            });
            res.end(Buffer.from(videoBytes));
            return;
        }

        if (method === 'POST' && urlPath === RENDER_WORKER_ROUTES.Check) {
            const body = await readJsonBody<CheckRequest>(req, maxBodyBytes);
            const result = await runHeavyJobWithGuards(
                req,
                res,
                nonRenderTimeoutMs,
                (signal) => RunCheckJob(body, backend, signal, { TempRoot: tempRoot }),
            );
            if (result !== undefined) {
                sendJson(res, 200, result);
            }
            return;
        }

        if (method === 'POST' && urlPath === RENDER_WORKER_ROUTES.Stills) {
            const body = await readJsonBody<StillsRequest>(req, maxBodyBytes);
            const result = await runHeavyJobWithGuards(
                req,
                res,
                body.TimeoutMs ?? nonRenderTimeoutMs,
                (signal) => RunStillsJob(body, backend, signal, { TempRoot: tempRoot }),
            );
            if (result !== undefined) {
                sendJson(res, 200, result);
            }
            return;
        }

        if (method === 'POST' && urlPath === RENDER_WORKER_ROUTES.ContactSheet) {
            const body = await readJsonBody<ContactSheetRequest>(req, maxBodyBytes);
            const result = await runHeavyJobWithGuards(
                req,
                res,
                nonRenderTimeoutMs,
                (signal) => RunContactSheetJob(body, backend, signal, { TempRoot: tempRoot }),
            );
            if (result !== undefined) {
                sendJson(res, 200, result);
            }
            return;
        }

        if (method === 'POST' && urlPath === RENDER_WORKER_ROUTES.Keyframes) {
            const body = await readJsonBody<KeyframeRequest>(req, maxBodyBytes);
            const result = await runHeavyJobWithGuards(
                req,
                res,
                nonRenderTimeoutMs,
                (signal) => RunKeyframesJob(body, backend, signal, { TempRoot: tempRoot }),
            );
            if (result !== undefined) {
                sendJson(res, 200, result);
            }
            return;
        }

        if (method === 'POST' && urlPath === RENDER_WORKER_ROUTES.Render) {
            const body = await readJsonBody<RenderRequest>(req, maxBodyBytes);
            await handleStreamingRender(req, res, body);
            return;
        }

        sendErrorJson(res, new RenderWorkerError('NotFound', `Route ${method} ${urlPath} was not found.`));
    }

    async function handleStreamingRender(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        body: RenderRequest,
    ): Promise<void> {
        if (!body || typeof body !== 'object' || !body.Bundle) {
            throw new RenderWorkerError('InvalidRequest', 'RenderRequest.Bundle is required.');
        }
        ValidateRenderGeometry({
            Format: body.Bundle.Format,
            Width: body.Width,
            Height: body.Height,
            Fps: body.Fps,
            DurationSeconds: body.DurationSeconds,
        });
        ValidateCompositionGeometryMatch(body.Bundle, {
            Width: body.Width,
            Height: body.Height,
            DurationSeconds: body.DurationSeconds,
        });

        const controller = new AbortController();
        activeAbortControllers.add(controller);

        let timedOut = false;
        let activeTimeoutMs = maxTimeoutMs;
        const effectiveTimeout = Math.min(
            maxTimeoutMs,
            typeof body.TimeoutMs === 'number' && body.TimeoutMs > 0
                ? body.TimeoutMs
                : maxTimeoutMs,
        );
        const preLintTimeoutMs = Math.min(nonRenderTimeoutMs, effectiveTimeout);
        activeTimeoutMs = preLintTimeoutMs;

        let timeoutTimer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, preLintTimeoutMs);
        timeoutTimer.unref();

        const onDisconnect = (): void => {
            if (!res.writableEnded) {
                controller.abort();
            }
        };
        req.once('aborted', onDisconnect);
        res.once('close', onDisconnect);

        let heartbeatTimer: NodeJS.Timeout | undefined;
        let acquired = false;
        try {
            await semaphore.Acquire(controller.signal);
            acquired = true;

            const preStage = await StageRenderBundle(body.Bundle, {
                TempRoot: tempRoot,
                Geometry: {
                    Width: body.Width,
                    Height: body.Height,
                    Fps: body.Fps,
                    DurationSeconds: body.DurationSeconds,
                },
            });
            try {
                if (controller.signal.aborted) {
                    throw new RenderWorkerError('Cancelled', 'Render job was cancelled.');
                }
                const check = await RunLintGate(body.Bundle, preStage.RootDir, backend);
                if (controller.signal.aborted) {
                    throw new RenderWorkerError('Cancelled', 'Render job was cancelled.');
                }
                if (check.BlockRender) {
                    throw new RenderWorkerError(
                        'LintBlocked',
                        'Composition failed pre-render lint checks.',
                        check.Issues,
                    );
                }
            } finally {
                await preStage.Cleanup();
            }

            clearTimeout(timeoutTimer);
            activeTimeoutMs = effectiveTimeout;
            timeoutTimer = setTimeout(() => {
                timedOut = true;
                controller.abort();
            }, effectiveTimeout);
            timeoutTimer.unref();

            res.writeHead(200, {
                'Content-Type': 'application/x-ndjson; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                Connection: 'keep-alive',
            });

            const writeEvent = (event: RenderStreamEvent): void => {
                if (!res.writableEnded && !res.destroyed) {
                    res.write(`${JSON.stringify(event)}\n`);
                }
            };

            heartbeatTimer = setInterval(() => {
                writeEvent({ Type: 'Heartbeat' });
            }, heartbeatMs);
            heartbeatTimer.unref();

            try {
                const renderResult = await RunRenderJob(
                    body,
                    backend,
                    (progress: RenderProgress) => {
                        writeEvent({ Type: 'Progress', Progress: progress });
                    },
                    controller.signal,
                    { SkipLintGate: true, TempRoot: tempRoot },
                );

                const videoId = storeVideo(renderResult.Video);
                const metadata: RenderResultMetadata = {
                    VideoID: videoId,
                    VideoSizeBytes: renderResult.Video.byteLength,
                    Format: renderResult.Format,
                    MimeType: renderResult.MimeType,
                    Width: renderResult.Width,
                    Height: renderResult.Height,
                    Fps: renderResult.Fps,
                    DurationSeconds: renderResult.DurationSeconds,
                    FrameCount: renderResult.FrameCount,
                    HasAudio: renderResult.HasAudio,
                    RendererVersion: renderResult.RendererVersion,
                    RenderDurationMs: renderResult.RenderDurationMs,
                };
                writeEvent({ Type: 'Result', Result: metadata });
            } catch (err) {
                const mappedErr = timedOut
                    ? new RenderWorkerError(
                          'Timeout',
                          `Render job exceeded timeout of ${activeTimeoutMs} ms.`,
                      )
                    : toRenderWorkerError(err);
                writeEvent({ Type: 'Error', Error: mappedErr.ToBody() });
            }
        } catch (err) {
            if (timedOut) {
                throw new RenderWorkerError(
                    'Timeout',
                    `Render job exceeded timeout of ${activeTimeoutMs} ms.`,
                );
            }
            throw err;
        } finally {
            if (heartbeatTimer !== undefined) {
                clearInterval(heartbeatTimer);
            }
            clearTimeout(timeoutTimer);
            req.removeListener('aborted', onDisconnect);
            res.removeListener('close', onDisconnect);
            activeAbortControllers.delete(controller);
            if (acquired) {
                semaphore.Release();
            }
            if (res.headersSent && !res.writableEnded && !res.destroyed) {
                res.end();
            }
        }
    }

    async function runHeavyJobWithGuards<T>(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        requestedTimeoutMs: number | undefined,
        fn: (signal: AbortSignal) => Promise<T>,
    ): Promise<T | undefined> {
        return runWithSemaphoreAndTimeout(req, res, requestedTimeoutMs, fn);
    }

    async function runWithSemaphoreAndTimeout<T>(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        requestedTimeoutMs: number | undefined,
        fn: (signal: AbortSignal) => Promise<T>,
    ): Promise<T> {
        const controller = new AbortController();
        activeAbortControllers.add(controller);

        let timedOut = false;
        const effectiveTimeout = Math.min(
            maxTimeoutMs,
            typeof requestedTimeoutMs === 'number' && requestedTimeoutMs > 0
                ? requestedTimeoutMs
                : maxTimeoutMs,
        );

        const timeoutTimer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, effectiveTimeout);
        timeoutTimer.unref();

        const onDisconnect = (): void => {
            if (!res.writableEnded) {
                controller.abort();
            }
        };
        req.once('aborted', onDisconnect);
        res.once('close', onDisconnect);

        let acquired = false;
        try {
            await semaphore.Acquire(controller.signal);
            acquired = true;
            return await fn(controller.signal);
        } catch (err) {
            if (timedOut) {
                throw new RenderWorkerError(
                    'Timeout',
                    `Render job exceeded timeout of ${effectiveTimeout} ms.`,
                );
            }
            throw err;
        } finally {
            clearTimeout(timeoutTimer);
            req.removeListener('aborted', onDisconnect);
            res.removeListener('close', onDisconnect);
            activeAbortControllers.delete(controller);
            if (acquired) {
                semaphore.Release();
            }
        }
    }

    return {
        get HttpServer(): http.Server {
            return httpServer;
        },
        get Port(): number {
            return boundPort;
        },
        async Listen(port = defaultPort, host = defaultHost): Promise<number> {
            assertLoopbackOrToken(host, bearerToken);
            return new Promise<number>((resolve, reject) => {
                const onError = (err: Error): void => {
                    httpServer.removeListener('listening', onListening);
                    reject(err);
                };
                const onListening = (): void => {
                    httpServer.removeListener('error', onError);
                    const addr = httpServer.address();
                    boundPort = typeof addr === 'object' && addr ? addr.port : port;
                    resolve(boundPort);
                };
                httpServer.once('error', onError);
                httpServer.once('listening', onListening);
                httpServer.listen(port, host);
            });
        },
        async Close(): Promise<void> {
            for (const controller of activeAbortControllers) {
                controller.abort();
            }
            activeAbortControllers.clear();

            for (const entry of videoStore.values()) {
                clearTimeout(entry.Timer);
            }
            videoStore.clear();

            if (!httpServer.listening) {
                return;
            }
            httpServer.closeIdleConnections();
            httpServer.closeAllConnections();
            await new Promise<void>((resolve) => {
                httpServer.close(() => resolve());
            });
        },
    };
}

class AsyncSemaphore {
    private activeCount = 0;
    private readonly maxConcurrency: number;
    private readonly queue: Array<{
        Resolve: () => void;
        Reject: (err: Error) => void;
        Signal: AbortSignal;
        OnAbort: () => void;
    }> = [];

    public constructor(maxConcurrency: number) {
        this.maxConcurrency = maxConcurrency;
    }

    public Acquire(signal: AbortSignal): Promise<void> {
        if (signal.aborted) {
            return Promise.reject(new RenderWorkerError('Cancelled', 'Render job was cancelled while queued.'));
        }
        if (this.activeCount < this.maxConcurrency) {
            this.activeCount++;
            return Promise.resolve();
        }
        return new Promise<void>((resolve, reject) => {
            const onAbort = (): void => {
                const idx = this.queue.findIndex((item) => item.OnAbort === onAbort);
                if (idx >= 0) {
                    this.queue.splice(idx, 1);
                }
                reject(new RenderWorkerError('Cancelled', 'Render job was cancelled while queued.'));
            };
            signal.addEventListener('abort', onAbort, { once: true });
            this.queue.push({ Resolve: resolve, Reject: reject, Signal: signal, OnAbort: onAbort });
        });
    }

    public Release(): void {
        while (this.queue.length > 0) {
            const next = this.queue.shift()!;
            next.Signal.removeEventListener('abort', next.OnAbort);
            if (!next.Signal.aborted) {
                next.Resolve();
                return;
            }
        }
        this.activeCount = Math.max(0, this.activeCount - 1);
    }
}

function verifyBearerToken(authHeader: string | undefined, expectedToken: string): boolean {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return false;
    }
    const provided = authHeader.slice('Bearer '.length);
    const expectedHash = createHash('sha256').update(expectedToken, 'utf8').digest();
    const providedHash = createHash('sha256').update(provided, 'utf8').digest();
    return timingSafeEqual(expectedHash, providedHash);
}

async function readJsonBody<T>(req: http.IncomingMessage, maxBytes: number): Promise<T> {
    const contentLengthHeader = req.headers['content-length'];
    if (contentLengthHeader) {
        const declared = Number.parseInt(contentLengthHeader, 10);
        if (Number.isFinite(declared) && declared > maxBytes) {
            req.resume();
            throw new RenderWorkerError(
                'BodyTooLarge',
                `Request body Content-Length (${declared}) exceeds limit (${maxBytes}).`,
            );
        }
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;

    for await (const chunk of req) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        totalBytes += buf.byteLength;
        if (totalBytes > maxBytes) {
            throw new RenderWorkerError(
                'BodyTooLarge',
                `Request body exceeded maximum size of ${maxBytes} bytes.`,
            );
        }
        chunks.push(buf);
    }

    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw.trim()) {
        throw new RenderWorkerError('InvalidRequest', 'Request body must be non-empty JSON.');
    }
    try {
        return JSON.parse(raw) as T;
    } catch {
        throw new RenderWorkerError('InvalidRequest', 'Request body is not valid JSON.');
    }
}

function toRenderWorkerError(error: unknown): RenderWorkerError {
    if (error instanceof RenderWorkerError) {
        return error;
    }
    const message = error instanceof Error ? error.message : String(error);
    return new RenderWorkerError('Internal', message || 'Internal render worker error.');
}

function statusCodeForErrorCode(code: RenderWorkerErrorCode): number {
    switch (code) {
        case 'Unauthorized':
            return 401;
        case 'NotFound':
            return 404;
        case 'BodyTooLarge':
            return 413;
        case 'InvalidRequest':
        case 'InvalidBundle':
        case 'TooManyStills':
        case 'GEOMETRY_MISMATCH':
            return 400;
        case 'LintBlocked':
            return 422;
        case 'Timeout':
            return 504;
        case 'Cancelled':
            return 499;
        case 'DependencyMissing':
            return 503;
        case 'Internal':
        default:
            return 500;
    }
}

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
    const json = JSON.stringify(payload);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': String(Buffer.byteLength(json, 'utf8')),
        'Cache-Control': 'no-store',
    });
    res.end(json);
}

function sendErrorJson(res: http.ServerResponse, error: RenderWorkerError): void {
    const status = statusCodeForErrorCode(error.Code);
    const body: RenderWorkerErrorBody = error.ToBody();
    sendJson(res, status, body);
}
