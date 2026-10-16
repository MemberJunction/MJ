import { randomUUID, timingSafeEqual } from 'node:crypto';
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
import { RenderWorkerError, type RenderBackend } from './backend.js';
import { StageRenderBundle, ValidateRenderGeometry } from './bundle.js';
import {
    RunCheckJob,
    RunContactSheetJob,
    RunKeyframesJob,
    RunRenderJob,
    RunStillsJob,
} from './jobs.js';
import { RunLintGate } from './lint-gate.js';

/** Default maximum JSON request body size (64 MiB). */
export const DEFAULT_MAX_BODY_BYTES = 64 * 1024 * 1024;

/** Default maximum concurrent heavy jobs (`/render`, `/stills`, `/contact-sheet`, `/keyframes`). */
export const DEFAULT_CONCURRENCY = 1;

/** Default per-job timeout ceiling (10 minutes). */
export const DEFAULT_MAX_TIMEOUT_MS = 600_000;

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
    /** Optional bearer token required on every route except `GET /health`. */
    BearerToken?: string;
    /** Maximum request body size in bytes (defaults to 64 MiB). */
    MaxBodyBytes?: number;
    /** Maximum concurrent heavy render/capture jobs (defaults to 1). */
    Concurrency?: number;
    /** Maximum timeout in milliseconds per job (defaults to 600,000 ms). */
    MaxTimeoutMs?: number;
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
    /** Starts listening on `host` and `port` (defaults to `'127.0.0.1'` and `0`). */
    Listen(port?: number, host?: string): Promise<number>;
    /** Aborts in-flight jobs, clears the video store, and closes the HTTP server. */
    Close(): Promise<void>;
}

interface StoredVideoEntry {
    Bytes: Uint8Array;
    Timer: NodeJS.Timeout;
}

/**
 * Creates an HTTP server implementing all `RENDER_WORKER_ROUTES`.
 *
 * Notice that this module does NOT import `hyperframes-backend.ts`; callers inject `Backend`.
 */
export function CreateRenderWorkerServer(options: RenderWorkerServerOptions): RenderWorkerServer {
    const backend = options.Backend;
    const bearerToken = options.BearerToken?.trim() || undefined;
    const maxBodyBytes = options.MaxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    const maxConcurrency = Math.max(1, options.Concurrency ?? DEFAULT_CONCURRENCY);
    const maxTimeoutMs = Math.max(50, options.MaxTimeoutMs ?? DEFAULT_MAX_TIMEOUT_MS);
    const heartbeatMs = Math.max(20, options.HeartbeatIntervalMs ?? DEFAULT_HEARTBEAT_MS);
    const videoTtlMs = Math.max(100, options.VideoTtlMs ?? DEFAULT_VIDEO_TTL_MS);

    const semaphore = new AsyncSemaphore(maxConcurrency);
    const activeAbortControllers = new Set<AbortController>();
    const videoStore = new Map<string, StoredVideoEntry>();
    let boundPort = 0;

    const storeVideo = (bytes: Uint8Array): string => {
        const videoId = randomUUID();
        const timer = setTimeout(() => {
            videoStore.delete(videoId);
        }, videoTtlMs);
        timer.unref?.();
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

        if (method === 'GET' && urlPath === RENDER_WORKER_ROUTES.Health) {
            const health = await backend.Health();
            sendJson(res, health.Healthy ? 200 : 503, health);
            return;
        }

        if (bearerToken && !verifyBearerToken(req.headers.authorization, bearerToken)) {
            sendErrorJson(res, new RenderWorkerError('Unauthorized', 'Missing or invalid Bearer token.'));
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
            const result = await RunCheckJob(body, backend);
            sendJson(res, 200, result);
            return;
        }

        if (method === 'POST' && urlPath === RENDER_WORKER_ROUTES.Stills) {
            const body = await readJsonBody<StillsRequest>(req, maxBodyBytes);
            const result = await runHeavyJobWithGuards(
                req,
                res,
                body.TimeoutMs,
                (signal) => RunStillsJob(body, backend, signal),
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
                undefined,
                (signal) => RunContactSheetJob(body, backend, signal),
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
                undefined,
                (signal) => RunKeyframesJob(body, backend, signal),
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

        const preStage = await StageRenderBundle(body.Bundle, { InjectPreamble: false });
        try {
            const check = await RunLintGate(body.Bundle, preStage.RootDir, backend);
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

        const heartbeatTimer = setInterval(() => {
            writeEvent({ Type: 'Heartbeat' });
        }, heartbeatMs);
        heartbeatTimer.unref?.();

        try {
            const renderResult = await runWithSemaphoreAndTimeout(
                req,
                res,
                body.TimeoutMs,
                (signal) =>
                    RunRenderJob(
                        body,
                        backend,
                        (progress: RenderProgress) => {
                            writeEvent({ Type: 'Progress', Progress: progress });
                        },
                        signal,
                        { SkipLintGate: true },
                    ),
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
            const workerErr = toRenderWorkerError(err);
            writeEvent({ Type: 'Error', Error: workerErr.ToBody() });
        } finally {
            clearInterval(heartbeatTimer);
            if (!res.writableEnded && !res.destroyed) {
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
        timeoutTimer.unref?.();

        const onDisconnect = (): void => {
            if (!res.writableEnded) {
                controller.abort();
            }
        };
        req.once('aborted', onDisconnect);
        res.once('close', onDisconnect);

        await semaphore.Acquire(controller.signal);
        try {
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
            semaphore.Release();
        }
    }

    return {
        get HttpServer(): http.Server {
            return httpServer;
        },
        get Port(): number {
            return boundPort;
        },
        async Listen(port = 0, host = '127.0.0.1'): Promise<number> {
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
    const expectedBuf = Buffer.from(expectedToken, 'utf8');
    const providedBuf = Buffer.from(provided, 'utf8');
    if (expectedBuf.byteLength !== providedBuf.byteLength) {
        return false;
    }
    return timingSafeEqual(expectedBuf, providedBuf);
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
