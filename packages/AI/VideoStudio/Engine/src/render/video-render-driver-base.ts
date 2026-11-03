import { RequiresSubclass } from '@memberjunction/global';
import type {
    CheckIssue,
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
    RenderWorkerErrorCode,
    StillsRequest,
    StillsResult,
} from '@memberjunction/video-studio-core';

/**
 * Error codes emitted by `VideoRenderEngine` and `VideoRenderDriverBase` implementations (§7.1).
 */
export type VideoRenderErrorCode =
    | RenderWorkerErrorCode
    | 'WorkerUnavailable'
    | 'UnknownDriver';

/**
 * Options for constructing a `VideoRenderError`.
 */
export interface VideoRenderErrorOptions {
    /** Optional HTTP status code returned by the render worker. */
    Status?: number;
    /** Optional lint/check issues returned when `Code === 'LintBlocked'`. */
    Issues?: CheckIssue[];
    /** Optional underlying cause. */
    Cause?: unknown;
}

/**
 * Structured error thrown by `VideoRenderEngine` and `VideoRenderDriverBase` operations (§7.1).
 *
 * Note: Caller-initiated cancellation via `AbortSignal` is NOT wrapped in `VideoRenderError`;
 * cancelled operations reject with the signal's `AbortError` (`error.name === 'AbortError'`).
 */
export class VideoRenderError extends Error {
    /** Machine-readable render error code. */
    public readonly Code: VideoRenderErrorCode;
    /** Optional HTTP status code from the render worker. */
    public readonly Status?: number;
    /** Optional deterministic check/lint issues attached when a render is blocked. */
    public readonly Issues?: CheckIssue[];

    public constructor(
        code: VideoRenderErrorCode,
        message: string,
        options?: VideoRenderErrorOptions,
    ) {
        super(message, options?.Cause !== undefined ? { cause: options.Cause } : undefined);
        this.name = 'VideoRenderError';
        this.Code = code;
        this.Status = options?.Status;
        this.Issues = options?.Issues;
    }
}

/**
 * Creates or returns an `AbortError` (`error.name === 'AbortError'`) for an aborted `AbortSignal`.
 */
export function CreateAbortError(signal?: AbortSignal, fallbackMessage = 'The render operation was aborted.'): Error {
    const reason: unknown = signal?.reason;
    if (reason instanceof Error && reason.name === 'AbortError') {
        return reason;
    }
    const err = new Error(
        reason instanceof Error ? reason.message : typeof reason === 'string' && reason.length > 0 ? reason : fallbackMessage,
    );
    err.name = 'AbortError';
    return err;
}

/**
 * Throws `CreateAbortError(signal)` immediately when `signal?.aborted` is true.
 */
export function ThrowIfSignalAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw CreateAbortError(signal);
    }
}

/**
 * Abstract port for Video Studio composition rendering, still capture, contact-sheet assembly,
 * deterministic checks, keyframe extraction, and worker health (§7.1).
 *
 * Concrete drivers (`LocalWorkerRenderDriver`, `RemoteRenderDriver`, `DockerRenderDriver`) register
 * via `@RegisterClass(VideoRenderDriverBase, '<DriverKey>')` and are resolved by `VideoRenderEngine`.
 */
@RequiresSubclass()
export abstract class VideoRenderDriverBase {
    /**
     * Whether composition rendering in this driver is network-isolated at the OS/container boundary
     * (e.g., `Docker` with `--network none`).
     *
     * `false` for `LocalWorker` (which can reach the host network if a composition bypasses static
     * lint checks via obfuscated JS or runtime script elements) and `Remote` unless configured.
     */
    public get IsNetworkIsolated(): boolean {
        return false;
    }

    /**
     * Renders a self-contained `RenderProjectBundle` into an MP4 deliverable.
     */
    public abstract Render(
        req: RenderRequest,
        onProgress?: (progress: RenderProgress) => void,
        signal?: AbortSignal,
    ): Promise<RenderResult>;

    /**
     * Captures exact still frames at requested timestamps from a composition bundle.
     */
    public abstract CaptureStills(
        req: StillsRequest,
        signal?: AbortSignal,
    ): Promise<StillsResult>;

    /**
     * Composes captured still frames into labelled grid and transition-strip PNG sheets.
     */
    public abstract BuildContactSheet(
        req: ContactSheetRequest,
        signal?: AbortSignal,
    ): Promise<ContactSheetResult>;

    /**
     * Runs deterministic static, CLI, and DOM checks on a composition bundle.
     */
    public abstract Check(
        req: CheckRequest,
        signal?: AbortSignal,
    ): Promise<CheckResult>;

    /**
     * Extracts representative keyframes (and optional contact sheets) from a reference video.
     */
    public abstract ExtractKeyframes(
        req: KeyframeRequest,
        signal?: AbortSignal,
    ): Promise<KeyframeResult>;

    /**
     * Reports runtime health and installed tool versions for the render worker.
     */
    public abstract Health(signal?: AbortSignal): Promise<RenderHealth>;

    /**
     * Releases any managed child processes or driver resources. Default implementation is a no-op.
     */
    public async Shutdown(): Promise<void> {
        // Default no-op for stateless drivers.
    }
}
