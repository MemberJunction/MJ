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
    DEFAULT_RENDER_REQUEST_TIMEOUT_MS,
    DEFAULT_RENDER_TIMEOUT_MS,
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

function resolveRemoteString(
    remoteSection: VideoRenderSettings['Remote'] | undefined,
    key: 'Url' | 'Token',
    envName: string,
): string | undefined {
    if (remoteSection && key in remoteSection) {
        const configured = remoteSection[key];
        if (typeof configured === 'string' && configured.trim().length > 0) {
            return configured.trim();
        }
        return undefined;
    }
    const envVal = process.env[envName];
    if (typeof envVal === 'string' && envVal.trim().length > 0) {
        return envVal.trim();
    }
    return undefined;
}

/**
 * `Remote` render driver (`@RegisterClass(VideoRenderDriverBase, 'Remote')`) (`VS-RND-3`, §7.2, §7.3).
 *
 * Delegates all render, capture, lint/check, and health operations to a single configured
 * remote `@memberjunction/video-studio-render-worker` HTTP/HTTPS endpoint via `RenderWorkerHttpClient`.
 * Does not spawn or manage any child process; `Shutdown()` inherits the base no-op.
 */
@RegisterClass(VideoRenderDriverBase, 'Remote')
export class RemoteRenderDriver extends VideoRenderDriverBase {
    private readonly client?: RenderWorkerHttpClient;
    private readonly configurationError?: string;

    public constructor(settings: VideoRenderSettings = ReadVideoRenderSettings()) {
        super();

        const rawUrl = resolveRemoteString(settings.Remote, 'Url', 'VIDEO_STUDIO_RENDER_URL');
        const token = resolveRemoteString(settings.Remote, 'Token', 'VIDEO_STUDIO_RENDER_TOKEN');

        if (!rawUrl) {
            this.configurationError =
                'Remote render worker URL is not configured; set videoStudio.render.remote.url or VIDEO_STUDIO_RENDER_URL.';
            return;
        }

        let parsedUrl: URL;
        try {
            parsedUrl = new URL(rawUrl);
        } catch {
            this.configurationError =
                'Remote render worker URL is invalid; expected a valid http:// or https:// URL.';
            return;
        }

        const sanitizedUrl = sanitizeUrlForDiagnostics(parsedUrl);
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            this.configurationError = `Unsupported remote render worker URL protocol '${parsedUrl.protocol}' for '${sanitizedUrl}'; expected 'http:' or 'https:'.`;
            return;
        }

        if (parsedUrl.protocol === 'http:' && !isLoopbackHostname(parsedUrl.hostname)) {
            LogWarning(
                `RemoteRenderDriver: remote worker URL '${sanitizedUrl}' uses plain http:// to a non-loopback host; the bundle data snapshot travels unencrypted in transit. Use https:// to encrypt render traffic.`,
            );
        }

        const renderTimeoutMs = settings.Timeouts?.RenderMs ?? DEFAULT_RENDER_TIMEOUT_MS;
        const requestTimeoutMs = settings.Timeouts?.RequestMs ?? DEFAULT_RENDER_REQUEST_TIMEOUT_MS;

        this.client = new RenderWorkerHttpClient({
            BaseUrl: rawUrl,
            Token: token,
            RenderTimeoutMs: renderTimeoutMs,
            RequestTimeoutMs: requestTimeoutMs,
        });
    }

    /** @inheritdoc */
    public override async Render(
        req: RenderRequest,
        onProgress?: (progress: RenderProgress) => void,
        signal?: AbortSignal,
    ): Promise<RenderResult> {
        ThrowIfSignalAborted(signal);
        return this.requireClient().Render(req, onProgress, signal);
    }

    /** @inheritdoc */
    public override async CaptureStills(
        req: StillsRequest,
        signal?: AbortSignal,
    ): Promise<StillsResult> {
        ThrowIfSignalAborted(signal);
        return this.requireClient().CaptureStills(req, signal);
    }

    /** @inheritdoc */
    public override async BuildContactSheet(
        req: ContactSheetRequest,
        signal?: AbortSignal,
    ): Promise<ContactSheetResult> {
        ThrowIfSignalAborted(signal);
        return this.requireClient().BuildContactSheet(req, signal);
    }

    /** @inheritdoc */
    public override async Check(
        req: CheckRequest,
        signal?: AbortSignal,
    ): Promise<CheckResult> {
        ThrowIfSignalAborted(signal);
        return this.requireClient().Check(req, signal);
    }

    /** @inheritdoc */
    public override async ExtractKeyframes(
        req: KeyframeRequest,
        signal?: AbortSignal,
    ): Promise<KeyframeResult> {
        ThrowIfSignalAborted(signal);
        return this.requireClient().ExtractKeyframes(req, signal);
    }

    /** @inheritdoc */
    public override async Health(signal?: AbortSignal): Promise<RenderHealth> {
        ThrowIfSignalAborted(signal);
        if (!this.client) {
            return {
                Healthy: false,
                NodeVersion: process.version,
                HyperFramesVersion: '',
                Errors: [
                    this.configurationError ??
                        'Remote render worker URL is not configured; set videoStudio.render.remote.url or VIDEO_STUDIO_RENDER_URL.',
                ],
            };
        }
        return this.client.Health(signal);
    }

    private requireClient(): RenderWorkerHttpClient {
        if (!this.client) {
            throw new VideoRenderError(
                'WorkerUnavailable',
                this.configurationError ??
                    'Remote render worker URL is not configured; set videoStudio.render.remote.url or VIDEO_STUDIO_RENDER_URL.',
            );
        }
        return this.client;
    }
}
