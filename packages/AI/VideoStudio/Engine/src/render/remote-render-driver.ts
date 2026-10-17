import { LogWarning } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import type {
    CheckRequest,
    CheckResult,
    ContactSheetRequest,
    ContactSheetResult,
    KeyframeRequest,
    KeyframeResult,
    RenderHealth,
    RenderProgress,
    RenderRequest,
    RenderResult,
    StillsRequest,
    StillsResult,
} from '@memberjunction/video-studio-core';
import {
    ReadVideoRenderSettings,
    type VideoRenderSettings,
} from './render-settings.js';
import {
    ThrowIfSignalAborted,
    VideoRenderDriverBase,
    VideoRenderError,
} from './video-render-driver-base.js';
import { RenderWorkerHttpClient } from './worker-http-client.js';

function isLoopbackHostname(hostname: string): boolean {
    const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
    return (
        normalized === 'localhost' ||
        normalized === '::1' ||
        normalized === '::ffff:127.0.0.1' ||
        /^127(?:\.\d{1,3}){3}$/.test(normalized)
    );
}

function sanitizeUrlForDiagnostics(parsed: URL): string {
    const clone = new URL(parsed.toString());
    clone.username = '';
    clone.password = '';
    clone.search = '';
    clone.hash = '';
    return clone.toString().replace(/\/$/, '');
}

const MISSING_REMOTE_URL_ERROR =
    'Remote render worker URL is not configured; set videoStudio.render.remote.url or VIDEO_STUDIO_RENDER_URL.';

/**
 * `Remote` render driver (`@RegisterClass(VideoRenderDriverBase, 'Remote')`) (`VS-RND-3`, §7.2, §7.3).
 *
 * Delegates all render, capture, lint/check, and health operations to one or more configured
 * remote `@memberjunction/video-studio-render-worker` HTTP/HTTPS endpoints via `RenderWorkerHttpClient`.
 * When `videoStudio.render.remote.urls` provides multiple worker endpoints, each job is pinned to
 * one worker selected round-robin so both `POST /render` and `GET /videos/<VideoID>` hit the same replica.
 * Does not spawn or manage any child process; `Shutdown()` inherits the base no-op.
 */
@RegisterClass(VideoRenderDriverBase, 'Remote')
export class RemoteRenderDriver extends VideoRenderDriverBase {
    private readonly clients: RenderWorkerHttpClient[] = [];
    private readonly configurationError?: string;
    private nextClientIndex = 0;

    public constructor(settings: VideoRenderSettings = ReadVideoRenderSettings()) {
        super();

        const rawUrls: string[] = [];
        if (settings.Remote.Urls && settings.Remote.Urls.length > 0) {
            for (const entry of settings.Remote.Urls) {
                const trimmed = entry.trim();
                if (trimmed.length > 0) {
                    rawUrls.push(trimmed);
                }
            }
        } else if (typeof settings.Remote.Url === 'string' && settings.Remote.Url.trim().length > 0) {
            rawUrls.push(settings.Remote.Url.trim());
        }

        const token =
            typeof settings.Remote.Token === 'string' && settings.Remote.Token.trim().length > 0
                ? settings.Remote.Token.trim()
                : undefined;

        if (rawUrls.length === 0) {
            this.configurationError = MISSING_REMOTE_URL_ERROR;
            return;
        }

        const renderTimeoutMs = settings.Timeouts.RenderMs;
        const requestTimeoutMs = settings.Timeouts.RequestMs;
        const warnedHosts = new Set<string>();

        for (const rawUrl of rawUrls) {
            let parsedUrl: URL;
            try {
                parsedUrl = new URL(rawUrl);
            } catch {
                this.clients.length = 0;
                this.configurationError =
                    'Remote render worker URL is invalid; expected a valid http:// or https:// URL.';
                return;
            }

            const sanitizedUrl = sanitizeUrlForDiagnostics(parsedUrl);
            if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
                this.clients.length = 0;
                this.configurationError = `Unsupported remote render worker URL protocol '${parsedUrl.protocol}' for '${sanitizedUrl}'; expected 'http:' or 'https:'.`;
                return;
            }

            if (
                parsedUrl.protocol === 'http:' &&
                !isLoopbackHostname(parsedUrl.hostname) &&
                !warnedHosts.has(sanitizedUrl)
            ) {
                warnedHosts.add(sanitizedUrl);
                LogWarning(
                    `RemoteRenderDriver: remote worker URL '${sanitizedUrl}' uses plain http:// to a non-loopback host; the bundle data snapshot travels unencrypted in transit. Use https:// to encrypt render traffic.`,
                );
            }

            this.clients.push(
                new RenderWorkerHttpClient({
                    BaseUrl: rawUrl,
                    Token: token,
                    RenderTimeoutMs: renderTimeoutMs,
                    RequestTimeoutMs: requestTimeoutMs,
                }),
            );
        }
    }

    /** @inheritdoc */
    public override async Render(
        req: RenderRequest,
        onProgress?: (progress: RenderProgress) => void,
        signal?: AbortSignal,
    ): Promise<RenderResult> {
        ThrowIfSignalAborted(signal);
        return this.requireNextClient().Render(req, onProgress, signal);
    }

    /** @inheritdoc */
    public override async CaptureStills(
        req: StillsRequest,
        signal?: AbortSignal,
    ): Promise<StillsResult> {
        ThrowIfSignalAborted(signal);
        return this.requireNextClient().CaptureStills(req, signal);
    }

    /** @inheritdoc */
    public override async BuildContactSheet(
        req: ContactSheetRequest,
        signal?: AbortSignal,
    ): Promise<ContactSheetResult> {
        ThrowIfSignalAborted(signal);
        return this.requireNextClient().BuildContactSheet(req, signal);
    }

    /** @inheritdoc */
    public override async Check(
        req: CheckRequest,
        signal?: AbortSignal,
    ): Promise<CheckResult> {
        ThrowIfSignalAborted(signal);
        return this.requireNextClient().Check(req, signal);
    }

    /** @inheritdoc */
    public override async ExtractKeyframes(
        req: KeyframeRequest,
        signal?: AbortSignal,
    ): Promise<KeyframeResult> {
        ThrowIfSignalAborted(signal);
        return this.requireNextClient().ExtractKeyframes(req, signal);
    }

    /**
     * Queries `GET /health` on the remote worker.
     *
     * Never throws: if no URL is configured, the worker is unreachable, or authentication fails,
     * returns `{ Healthy: false, NodeVersion: process.version, HyperFramesVersion: '', Errors: [reason] }`.
     */
    public override async Health(signal?: AbortSignal): Promise<RenderHealth> {
        try {
            ThrowIfSignalAborted(signal);
            if (this.clients.length === 0) {
                return {
                    Healthy: false,
                    NodeVersion: process.version,
                    HyperFramesVersion: '',
                    Errors: [this.configurationError ?? MISSING_REMOTE_URL_ERROR],
                };
            }
            return await this.requireNextClient().Health(signal);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            return {
                Healthy: false,
                NodeVersion: process.version,
                HyperFramesVersion: '',
                Errors: [reason],
            };
        }
    }

    private requireNextClient(): RenderWorkerHttpClient {
        if (this.clients.length === 0) {
            throw new VideoRenderError(
                'WorkerUnavailable',
                this.configurationError ?? MISSING_REMOTE_URL_ERROR,
            );
        }
        const client = this.clients[this.nextClientIndex % this.clients.length]!;
        this.nextClientIndex = (this.nextClientIndex + 1) % this.clients.length;
        return client;
    }
}
