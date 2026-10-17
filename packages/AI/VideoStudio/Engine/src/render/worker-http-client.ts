import * as http from 'node:http';
import * as https from 'node:https';
import {
    RENDER_WORKER_ROUTES,
    type CheckIssue,
    type CheckRequest,
    type CheckResult,
    type ContactSheetRequest,
    type ContactSheetResult,
    type KeyframeRequest,
    type KeyframeResult,
    type RenderHealth,
    type RenderProgress,
    type RenderRequest,
    type RenderResult,
    type RenderResultMetadata,
    type RenderStreamEvent,
    type RenderWorkerErrorBody,
    type RenderWorkerErrorCode,
    type StillsRequest,
    type StillsResult,
} from '@memberjunction/video-studio-core';
import {
    CreateAbortError,
    ThrowIfSignalAborted,
    VideoRenderError,
} from './video-render-driver-base.js';

/**
 * Configuration options for `RenderWorkerHttpClient`.
 */
export interface RenderWorkerHttpClientOptions {
    /** Base HTTP/HTTPS URL of the render worker (e.g., `'http://127.0.0.1:54321'`). */
    BaseUrl: string;
    /** Optional bearer token sent in `Authorization: Bearer <Token>`. */
    Token?: string;
    /** Socket/request timeout in milliseconds for `Render` and `/videos/<id>` requests. */
    RenderTimeoutMs: number;
    /** Socket/request timeout in milliseconds for non-render requests (`Check`, `CaptureStills`, `BuildContactSheet`, `ExtractKeyframes`, `Health`). */
    RequestTimeoutMs: number;
}

const VALID_ERROR_CODES: ReadonlySet<RenderWorkerErrorCode> = new Set<RenderWorkerErrorCode>([
    'Unauthorized',
    'NotFound',
    'BodyTooLarge',
    'InvalidRequest',
    'InvalidBundle',
    'GEOMETRY_MISMATCH',
    'LintBlocked',
    'TooManyStills',
    'Timeout',
    'Cancelled',
    'DependencyMissing',
    'Internal',
]);

function isRenderWorkerErrorCode(code: unknown): code is RenderWorkerErrorCode {
    return typeof code === 'string' && VALID_ERROR_CODES.has(code as RenderWorkerErrorCode);
}

function defaultStatusForCode(code: RenderWorkerErrorCode): number {
    switch (code) {
        case 'Unauthorized':
            return 401;
        case 'NotFound':
            return 404;
        case 'BodyTooLarge':
            return 413;
        case 'InvalidRequest':
        case 'InvalidBundle':
        case 'GEOMETRY_MISMATCH':
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

function sanitizeUrlForDiagnostics(rawUrl: string): string {
    try {
        const parsed = new URL(rawUrl);
        parsed.username = '';
        parsed.password = '';
        parsed.search = '';
        parsed.hash = '';
        return parsed.toString().replace(/\/$/, '');
    } catch {
        return rawUrl;
    }
}

/**
 * HTTP/HTTPS client for `@memberjunction/video-studio-render-worker` (§7.1, §7.2, §7.3).
 *
 * Uses `node:http` and `node:https` directly rather than `fetch` (undici) to avoid undici's
 * 300-second default header/body timeouts during long queued renders or check jobs.
 * Shared by `LocalWorkerRenderDriver` and `RemoteRenderDriver`.
 */
export class RenderWorkerHttpClient {
    private readonly baseUrl: URL;
    private readonly sanitizedBaseUrl: string;
    private readonly token?: string;
    private readonly renderTimeoutMs: number;
    private readonly requestTimeoutMs: number;

    public constructor(options: RenderWorkerHttpClientOptions) {
        this.baseUrl = new URL(options.BaseUrl);
        if (this.baseUrl.protocol !== 'http:' && this.baseUrl.protocol !== 'https:') {
            throw new VideoRenderError(
                'WorkerUnavailable',
                `Unsupported render worker URL protocol '${this.baseUrl.protocol}' in '${sanitizeUrlForDiagnostics(options.BaseUrl)}'. Expected 'http:' or 'https:'.`,
            );
        }
        this.sanitizedBaseUrl = sanitizeUrlForDiagnostics(options.BaseUrl);
        this.token = options.Token;
        this.renderTimeoutMs = options.RenderTimeoutMs;
        this.requestTimeoutMs = options.RequestTimeoutMs;
    }

    /**
     * Streams `POST /render` NDJSON events (relaying `Progress` and ignoring `Heartbeat`),
     * then downloads the rendered MP4 bytes via `GET /videos/<VideoID>`.
     */
    public async Render(
        req: RenderRequest,
        onProgress?: (progress: RenderProgress) => void,
        signal?: AbortSignal,
    ): Promise<RenderResult> {
        ThrowIfSignalAborted(signal);
        const resultMeta = await this.streamRenderMetadata(req, onProgress, signal);
        ThrowIfSignalAborted(signal);
        const videoPath = `${RENDER_WORKER_ROUTES.Video}/${encodeURIComponent(resultMeta.VideoID)}`;
        const videoBytes = await this.httpGetBinary(videoPath, this.renderTimeoutMs, signal);

        const { VideoID: _videoId, VideoSizeBytes: _videoSizeBytes, ...metadataWithoutWireFields } = resultMeta;
        return {
            ...metadataWithoutWireFields,
            Video: videoBytes,
        };
    }

    /**
     * Calls `POST /stills` on the render worker.
     */
    public async CaptureStills(req: StillsRequest, signal?: AbortSignal): Promise<StillsResult> {
        return this.httpPostJson<StillsRequest, StillsResult>(
            RENDER_WORKER_ROUTES.Stills,
            req,
            this.requestTimeoutMs,
            signal,
        );
    }

    /**
     * Calls `POST /contact-sheet` on the render worker.
     */
    public async BuildContactSheet(
        req: ContactSheetRequest,
        signal?: AbortSignal,
    ): Promise<ContactSheetResult> {
        return this.httpPostJson<ContactSheetRequest, ContactSheetResult>(
            RENDER_WORKER_ROUTES.ContactSheet,
            req,
            this.requestTimeoutMs,
            signal,
        );
    }

    /**
     * Calls `POST /check` on the render worker.
     */
    public async Check(req: CheckRequest, signal?: AbortSignal): Promise<CheckResult> {
        return this.httpPostJson<CheckRequest, CheckResult>(
            RENDER_WORKER_ROUTES.Check,
            req,
            this.requestTimeoutMs,
            signal,
        );
    }

    /**
     * Calls `POST /keyframes` on the render worker.
     */
    public async ExtractKeyframes(
        req: KeyframeRequest,
        signal?: AbortSignal,
    ): Promise<KeyframeResult> {
        return this.httpPostJson<KeyframeRequest, KeyframeResult>(
            RENDER_WORKER_ROUTES.Keyframes,
            req,
            this.requestTimeoutMs,
            signal,
        );
    }

    /**
     * Calls `GET /health` on the render worker.
     */
    public async Health(signal?: AbortSignal): Promise<RenderHealth> {
        return this.httpGetJson<RenderHealth>(
            RENDER_WORKER_ROUTES.Health,
            this.requestTimeoutMs,
            signal,
        );
    }

    private resolveEndpointUrl(routePath: string): URL {
        const basePath = this.baseUrl.pathname.endsWith('/')
            ? this.baseUrl.pathname.slice(0, -1)
            : this.baseUrl.pathname;
        const suffix = routePath.startsWith('/') ? routePath : `/${routePath}`;
        const url = new URL(this.baseUrl.toString());
        url.pathname = `${basePath}${suffix}`;
        url.search = '';
        url.hash = '';
        return url;
    }

    private buildHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
        const headers: Record<string, string> = {
            ...extraHeaders,
        };
        if (this.token && this.token.length > 0) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    }

    private parseErrorResponse(status: number, bodyText: string, routePath: string): VideoRenderError {
        let parsed: Partial<RenderWorkerErrorBody> | undefined;
        try {
            const raw: unknown = JSON.parse(bodyText);
            if (raw && typeof raw === 'object') {
                parsed = raw as Partial<RenderWorkerErrorBody>;
            }
        } catch {
            // Fall through to status-based error mapping.
        }

        if (parsed && isRenderWorkerErrorCode(parsed.Code)) {
            let message = typeof parsed.Message === 'string' && parsed.Message.length > 0
                ? parsed.Message
                : `Render worker returned ${parsed.Code} (HTTP ${status}).`;
            if (parsed.Code === 'Unauthorized' || status === 401) {
                message = `${message} Check the render worker bearer token (VIDEO_STUDIO_RENDER_TOKEN or videoStudio.render.remote.token).`;
            }
            const issues: CheckIssue[] | undefined = Array.isArray(parsed.Issues) ? parsed.Issues : undefined;
            return new VideoRenderError(parsed.Code, message, {
                Status: status,
                Issues: issues,
            });
        }

        if (status === 401) {
            return new VideoRenderError(
                'Unauthorized',
                'Render worker returned HTTP 401 Unauthorized. Check the render worker bearer token (VIDEO_STUDIO_RENDER_TOKEN or videoStudio.render.remote.token).',
                { Status: 401 },
            );
        }
        if (status === 404) {
            return new VideoRenderError(
                'NotFound',
                `Render worker route '${routePath}' returned HTTP 404 NotFound.`,
                { Status: 404 },
            );
        }
        if (status === 413) {
            return new VideoRenderError(
                'BodyTooLarge',
                `Render worker rejected request to '${routePath}' (HTTP 413 BodyTooLarge).`,
                { Status: 413 },
            );
        }

        return new VideoRenderError(
            'Internal',
            `Render worker request to '${routePath}' failed with HTTP ${status}: ${bodyText.slice(0, 300)}`,
            { Status: status },
        );
    }

    private streamRenderMetadata(
        reqBody: RenderRequest,
        onProgress?: (progress: RenderProgress) => void,
        signal?: AbortSignal,
    ): Promise<RenderResultMetadata> {
        ThrowIfSignalAborted(signal);
        const routePath = RENDER_WORKER_ROUTES.Render;
        const targetUrl = this.resolveEndpointUrl(routePath);
        const payload = JSON.stringify(reqBody);
        const transport = targetUrl.protocol === 'https:' ? https : http;

        return new Promise<RenderResultMetadata>((resolve, reject) => {
            let settled = false;
            let timedOut = false;
            let activeResponse: http.IncomingMessage | undefined;

            const cleanup = (): void => {
                if (signal) {
                    signal.removeEventListener('abort', onAbort);
                }
                clearTimeout(timeoutTimer);
            };

            const settleReject = (err: Error): void => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                reject(err);
            };

            const settleResolve = (meta: RenderResultMetadata): void => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                resolve(meta);
            };

            const req = transport.request(
                targetUrl,
                {
                    method: 'POST',
                    headers: this.buildHeaders({
                        'Content-Type': 'application/json',
                        'Content-Length': String(Buffer.byteLength(payload, 'utf8')),
                    }),
                },
                (res) => {
                    activeResponse = res;
                    const status = res.statusCode ?? 0;

                    if (status < 200 || status >= 300) {
                        const chunks: Buffer[] = [];
                        res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
                        res.on('end', () => {
                            if (signal?.aborted) {
                                settleReject(CreateAbortError(signal));
                                return;
                            }
                            const bodyText = Buffer.concat(chunks).toString('utf8');
                            settleReject(this.parseErrorResponse(status, bodyText, routePath));
                        });
                        res.on('error', (err) => {
                            if (signal?.aborted) {
                                settleReject(CreateAbortError(signal));
                                return;
                            }
                            settleReject(
                                new VideoRenderError(
                                    'WorkerUnavailable',
                                    `Render worker connection to ${this.sanitizedBaseUrl}${routePath} failed: ${err.message}`,
                                    { Cause: err },
                                ),
                            );
                        });
                        return;
                    }

                    let lineBuffer = '';
                    let resultMeta: RenderResultMetadata | undefined;
                    let maxPercentSeen = 0;
                    let lastProgressPhase: RenderProgress['Phase'] | undefined;
                    let lastProgressPercent = 0;
                    let lastElapsedMs = 0;

                    const emitProgress = (progress: RenderProgress): void => {
                        const clampedPercent = Math.min(100, Math.max(maxPercentSeen, progress.Percent));
                        maxPercentSeen = clampedPercent;
                        lastProgressPhase = progress.Phase;
                        lastProgressPercent = clampedPercent;
                        lastElapsedMs = Math.max(lastElapsedMs, progress.ElapsedMs);
                        onProgress?.({
                            ...progress,
                            Percent: clampedPercent,
                        });
                    };

                    const processLine = (rawLine: string): void => {
                        const trimmed = rawLine.trim();
                        if (!trimmed || settled) {
                            return;
                        }
                        let event: RenderStreamEvent;
                        try {
                            event = JSON.parse(trimmed) as RenderStreamEvent;
                        } catch (parseErr) {
                            settleReject(
                                new VideoRenderError(
                                    'Internal',
                                    `Failed to parse NDJSON event from render worker: ${trimmed.slice(0, 200)}`,
                                    { Cause: parseErr },
                                ),
                            );
                            res.destroy();
                            return;
                        }

                        if (event.Type === 'Progress') {
                            emitProgress(event.Progress);
                        } else if (event.Type === 'Heartbeat') {
                            // Ignore keep-alive heartbeats.
                        } else if (event.Type === 'Result') {
                            resultMeta = event.Result;
                            if (lastProgressPhase !== 'Complete' || lastProgressPercent !== 100) {
                                emitProgress({
                                    Phase: 'Complete',
                                    RenderedFrames: event.Result.FrameCount,
                                    TotalFrames: event.Result.FrameCount,
                                    Percent: 100,
                                    ElapsedMs: Math.max(lastElapsedMs, event.Result.RenderDurationMs),
                                });
                            }
                        } else if (event.Type === 'Error') {
                            if (signal?.aborted) {
                                settleReject(CreateAbortError(signal));
                                res.destroy();
                                return;
                            }
                            const code = isRenderWorkerErrorCode(event.Error?.Code)
                                ? event.Error.Code
                                : 'Internal';
                            const message = event.Error?.Message || `Render failed with code ${code}.`;
                            const issues = Array.isArray(event.Error?.Issues)
                                ? event.Error.Issues
                                : undefined;
                            settleReject(
                                new VideoRenderError(code, message, {
                                    Status: defaultStatusForCode(code),
                                    Issues: issues,
                                }),
                            );
                            res.destroy();
                        }
                    };

                    res.on('data', (chunk: Buffer) => {
                        lineBuffer += chunk.toString('utf8');
                        let newlineIdx = lineBuffer.indexOf('\n');
                        while (newlineIdx !== -1) {
                            const line = lineBuffer.slice(0, newlineIdx);
                            lineBuffer = lineBuffer.slice(newlineIdx + 1);
                            processLine(line);
                            newlineIdx = lineBuffer.indexOf('\n');
                        }
                    });

                    res.on('end', () => {
                        if (settled) {
                            return;
                        }
                        if (signal?.aborted) {
                            settleReject(CreateAbortError(signal));
                            return;
                        }
                        if (lineBuffer.trim().length > 0) {
                            processLine(lineBuffer);
                            lineBuffer = '';
                        }
                        if (settled) {
                            return;
                        }
                        if (resultMeta) {
                            settleResolve(resultMeta);
                        } else {
                            settleReject(
                                new VideoRenderError(
                                    'WorkerUnavailable',
                                    `Render stream from ${this.sanitizedBaseUrl}${routePath} ended without a Result event.`,
                                ),
                            );
                        }
                    });

                    res.on('error', (err) => {
                        if (signal?.aborted) {
                            settleReject(CreateAbortError(signal));
                            return;
                        }
                        if (timedOut) {
                            settleReject(
                                new VideoRenderError(
                                    'Timeout',
                                    `Render request to ${this.sanitizedBaseUrl}${routePath} timed out after ${this.renderTimeoutMs}ms.`,
                                    { Status: 504 },
                                ),
                            );
                            return;
                        }
                        settleReject(
                            new VideoRenderError(
                                'WorkerUnavailable',
                                `Render stream from ${this.sanitizedBaseUrl}${routePath} failed: ${err.message}`,
                                { Cause: err },
                            ),
                        );
                    });
                },
            );

            const onAbort = (): void => {
                const abortErr = CreateAbortError(signal);
                activeResponse?.destroy();
                req.destroy();
                settleReject(abortErr);
            };

            if (signal) {
                if (signal.aborted) {
                    onAbort();
                    return;
                }
                signal.addEventListener('abort', onAbort, { once: true });
            }

            const timeoutTimer = setTimeout(() => {
                timedOut = true;
                activeResponse?.destroy();
                req.destroy();
                settleReject(
                    new VideoRenderError(
                        'Timeout',
                        `Render request to ${this.sanitizedBaseUrl}${routePath} timed out after ${this.renderTimeoutMs}ms.`,
                        { Status: 504 },
                    ),
                );
            }, this.renderTimeoutMs);
            timeoutTimer.unref();

            req.on('error', (err) => {
                if (signal?.aborted) {
                    settleReject(CreateAbortError(signal));
                    return;
                }
                if (timedOut) {
                    settleReject(
                        new VideoRenderError(
                            'Timeout',
                            `Render request to ${this.sanitizedBaseUrl}${routePath} timed out after ${this.renderTimeoutMs}ms.`,
                            { Status: 504 },
                        ),
                    );
                    return;
                }
                settleReject(
                    new VideoRenderError(
                        'WorkerUnavailable',
                        `Render worker at ${this.sanitizedBaseUrl} is unavailable (${err.message}).`,
                        { Cause: err },
                    ),
                );
            });

            req.write(payload);
            req.end();
        });
    }

    private httpPostJson<TBody, TResult>(
        routePath: string,
        body: TBody,
        timeoutMs: number,
        signal?: AbortSignal,
    ): Promise<TResult> {
        const payload = JSON.stringify(body);
        return this.sendJsonRequest<TResult>(
            'POST',
            routePath,
            payload,
            timeoutMs,
            signal,
        );
    }

    private httpGetJson<TResult>(
        routePath: string,
        timeoutMs: number,
        signal?: AbortSignal,
    ): Promise<TResult> {
        return this.sendJsonRequest<TResult>(
            'GET',
            routePath,
            undefined,
            timeoutMs,
            signal,
        );
    }

    private sendJsonRequest<TResult>(
        method: 'GET' | 'POST',
        routePath: string,
        payload: string | undefined,
        timeoutMs: number,
        signal?: AbortSignal,
    ): Promise<TResult> {
        ThrowIfSignalAborted(signal);
        const targetUrl = this.resolveEndpointUrl(routePath);
        const transport = targetUrl.protocol === 'https:' ? https : http;
        const extraHeaders: Record<string, string> = {};
        if (payload !== undefined) {
            extraHeaders['Content-Type'] = 'application/json';
            extraHeaders['Content-Length'] = String(Buffer.byteLength(payload, 'utf8'));
        }

        return new Promise<TResult>((resolve, reject) => {
            let settled = false;
            let timedOut = false;
            let activeResponse: http.IncomingMessage | undefined;

            const cleanup = (): void => {
                if (signal) {
                    signal.removeEventListener('abort', onAbort);
                }
                clearTimeout(timeoutTimer);
            };

            const settleReject = (err: Error): void => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                reject(err);
            };

            const settleResolve = (val: TResult): void => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                resolve(val);
            };

            const req = transport.request(
                targetUrl,
                {
                    method,
                    headers: this.buildHeaders(extraHeaders),
                },
                (res) => {
                    activeResponse = res;
                    const status = res.statusCode ?? 0;
                    const chunks: Buffer[] = [];
                    res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
                    res.on('end', () => {
                        if (signal?.aborted) {
                            settleReject(CreateAbortError(signal));
                            return;
                        }
                        const bodyText = Buffer.concat(chunks).toString('utf8');
                        if (routePath === RENDER_WORKER_ROUTES.Health && status === 503) {
                            try {
                                const maybeHealth = JSON.parse(bodyText) as Partial<RenderHealth>;
                                if (maybeHealth && typeof maybeHealth.Healthy === 'boolean') {
                                    settleResolve(maybeHealth as TResult);
                                    return;
                                }
                            } catch {
                                // Fall through to standard error handling.
                            }
                        }
                        if (status < 200 || status >= 300) {
                            settleReject(this.parseErrorResponse(status, bodyText, routePath));
                            return;
                        }
                        try {
                            settleResolve(JSON.parse(bodyText) as TResult);
                        } catch (parseErr) {
                            settleReject(
                                new VideoRenderError(
                                    'Internal',
                                    `Failed to parse JSON response from ${routePath}: ${bodyText.slice(0, 200)}`,
                                    { Cause: parseErr },
                                ),
                            );
                        }
                    });
                    res.on('error', (err) => {
                        if (signal?.aborted) {
                            settleReject(CreateAbortError(signal));
                            return;
                        }
                        settleReject(
                            new VideoRenderError(
                                'WorkerUnavailable',
                                `Render worker response from ${this.sanitizedBaseUrl}${routePath} failed: ${err.message}`,
                                { Cause: err },
                            ),
                        );
                    });
                },
            );

            const onAbort = (): void => {
                const abortErr = CreateAbortError(signal);
                activeResponse?.destroy();
                req.destroy();
                settleReject(abortErr);
            };

            if (signal) {
                if (signal.aborted) {
                    onAbort();
                    return;
                }
                signal.addEventListener('abort', onAbort, { once: true });
            }

            const timeoutTimer = setTimeout(() => {
                timedOut = true;
                activeResponse?.destroy();
                req.destroy();
                settleReject(
                    new VideoRenderError(
                        'Timeout',
                        `Request to ${this.sanitizedBaseUrl}${routePath} timed out after ${timeoutMs}ms.`,
                        { Status: 504 },
                    ),
                );
            }, timeoutMs);
            timeoutTimer.unref();

            req.on('error', (err) => {
                if (signal?.aborted) {
                    settleReject(CreateAbortError(signal));
                    return;
                }
                if (timedOut) {
                    settleReject(
                        new VideoRenderError(
                            'Timeout',
                            `Request to ${this.sanitizedBaseUrl}${routePath} timed out after ${timeoutMs}ms.`,
                            { Status: 504 },
                        ),
                    );
                    return;
                }
                settleReject(
                    new VideoRenderError(
                        'WorkerUnavailable',
                        `Render worker at ${this.sanitizedBaseUrl} is unavailable (${err.message}).`,
                        { Cause: err },
                    ),
                );
            });

            if (payload !== undefined) {
                req.write(payload);
            }
            req.end();
        });
    }

    private httpGetBinary(
        routePath: string,
        timeoutMs: number,
        signal?: AbortSignal,
    ): Promise<Uint8Array> {
        ThrowIfSignalAborted(signal);
        const targetUrl = this.resolveEndpointUrl(routePath);
        const transport = targetUrl.protocol === 'https:' ? https : http;

        return new Promise<Uint8Array>((resolve, reject) => {
            let settled = false;
            let timedOut = false;
            let activeResponse: http.IncomingMessage | undefined;

            const cleanup = (): void => {
                if (signal) {
                    signal.removeEventListener('abort', onAbort);
                }
                clearTimeout(timeoutTimer);
            };

            const settleReject = (err: Error): void => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                reject(err);
            };

            const settleResolve = (bytes: Uint8Array): void => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                resolve(bytes);
            };

            const req = transport.request(
                targetUrl,
                {
                    method: 'GET',
                    headers: this.buildHeaders(),
                },
                (res) => {
                    activeResponse = res;
                    const status = res.statusCode ?? 0;
                    const chunks: Buffer[] = [];
                    res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
                    res.on('end', () => {
                        if (signal?.aborted) {
                            settleReject(CreateAbortError(signal));
                            return;
                        }
                        const combined = Buffer.concat(chunks);
                        if (status < 200 || status >= 300) {
                            settleReject(
                                this.parseErrorResponse(status, combined.toString('utf8'), routePath),
                            );
                            return;
                        }
                        settleResolve(new Uint8Array(combined));
                    });
                    res.on('error', (err) => {
                        if (signal?.aborted) {
                            settleReject(CreateAbortError(signal));
                            return;
                        }
                        settleReject(
                            new VideoRenderError(
                                'WorkerUnavailable',
                                `Failed to download video stream from ${this.sanitizedBaseUrl}${routePath}: ${err.message}`,
                                { Cause: err },
                            ),
                        );
                    });
                },
            );

            const onAbort = (): void => {
                const abortErr = CreateAbortError(signal);
                activeResponse?.destroy();
                req.destroy();
                settleReject(abortErr);
            };

            if (signal) {
                if (signal.aborted) {
                    onAbort();
                    return;
                }
                signal.addEventListener('abort', onAbort, { once: true });
            }

            const timeoutTimer = setTimeout(() => {
                timedOut = true;
                activeResponse?.destroy();
                req.destroy();
                settleReject(
                    new VideoRenderError(
                        'Timeout',
                        `Download from ${this.sanitizedBaseUrl}${routePath} timed out after ${timeoutMs}ms.`,
                        { Status: 504 },
                    ),
                );
            }, timeoutMs);
            timeoutTimer.unref();

            req.on('error', (err) => {
                if (signal?.aborted) {
                    settleReject(CreateAbortError(signal));
                    return;
                }
                if (timedOut) {
                    settleReject(
                        new VideoRenderError(
                            'Timeout',
                            `Download from ${this.sanitizedBaseUrl}${routePath} timed out after ${timeoutMs}ms.`,
                            { Status: 504 },
                        ),
                    );
                    return;
                }
                settleReject(
                    new VideoRenderError(
                        'WorkerUnavailable',
                        `Render worker at ${this.sanitizedBaseUrl} is unavailable (${err.message}).`,
                        { Cause: err },
                    ),
                );
            });

            req.end();
        });
    }
}
