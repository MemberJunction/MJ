import type {
    CheckIssue,
    CheckRequest,
    CheckResult,
    ContactSheetImage,
    ContactSheetRequest,
    ContactSheetResult,
    ExtractedKeyframe,
    KeyframeRequest,
    KeyframeResult,
    RenderHealth,
    RenderProgress,
    RenderProjectBundle,
    RenderRequest,
    RenderResult,
    StillsRequest,
    StillsResult,
} from '@memberjunction/video-studio-core';
import {
    CreateAbortError,
    ThrowIfSignalAborted,
    VideoRenderDriverBase,
    VideoRenderError,
} from './video-render-driver-base.js';

/**
 * Minimal valid ISO BMFF (`ftyp`) header bytes returned as `RenderResult.Video` by `FakeRenderDriver`.
 * Constructed directly as raw bytes (`Uint8Array`) — never base64-encoded.
 */
export const FAKE_DRIVER_MP4_BYTES: Uint8Array = new Uint8Array([
    0x00, 0x00, 0x00, 0x18,
    0x66, 0x74, 0x79, 0x70, // 'ftyp'
    0x6d, 0x70, 0x34, 0x32, // 'mp42'
    0x00, 0x00, 0x00, 0x00,
    0x6d, 0x70, 0x34, 0x32, // 'mp42'
    0x69, 0x73, 0x6f, 0x6d, // 'isom'
]);

/**
 * Fixed 1x1 transparent PNG (base64) used for stills, contact sheets, and keyframes in `FakeRenderDriver`.
 */
export const FAKE_DRIVER_ONE_BY_ONE_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const FAKE_RENDERER_VERSION = '0.8.134';
const DEFAULT_MAX_TILES_PER_SHEET = 6;
const DEFAULT_MAX_KEYFRAMES = 16;
const DEFAULT_FAKE_VIDEO_DURATION_SECONDS = 4;

/**
 * Options for configuring a deterministic `FakeRenderDriver` instance in tests.
 */
export interface FakeRenderDriverOptions {
    /** Optional scripted `CheckIssue` items returned by `Check` (and enforced by `Render`). */
    CheckIssues?: CheckIssue[];
    /** Optional scripted `RenderHealth` returned by `Health`. */
    Health?: RenderHealth;
    /**
     * Optional override for `IsNetworkIsolated` on the fake driver.
     * Defaults to `true` because `FakeRenderDriver` runs deterministically in-process without network access.
     */
    IsNetworkIsolated?: boolean;
}

function scanBundleForRemoteUrls(bundle: RenderProjectBundle): CheckIssue[] {
    const issues: CheckIssue[] = [];
    const remotePattern = /\bhttps?:\/\/[^\s"'<>)]+/gi;

    for (const file of bundle.Files) {
        const lines = file.Content.split(/\r?\n/);
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const lineText = lines[lineIdx] ?? '';
            remotePattern.lastIndex = 0;
            let match = remotePattern.exec(lineText);
            while (match !== null) {
                issues.push({
                    Code: 'MJ_NON_BUNDLE_URL',
                    Category: 'RemoteUrl',
                    Severity: 'Error',
                    Message: `External URL '${match[0]}' is not permitted inside a composition bundle.`,
                    File: file.Path,
                    Line: lineIdx + 1,
                });
                match = remotePattern.exec(lineText);
            }
        }
    }
    return issues;
}

function bundleHasFakeHang(bundle: RenderProjectBundle): boolean {
    return bundle.Files.some((file) => file.Content.includes('data-fake-hang'));
}

function waitForAbortSignal(signal?: AbortSignal): Promise<never> {
    ThrowIfSignalAborted(signal);
    return new Promise<never>((_resolve, reject) => {
        if (!signal) {
            return;
        }
        const onAbort = (): void => {
            reject(CreateAbortError(signal));
        };
        signal.addEventListener('abort', onAbort, { once: true });
    });
}

/**
 * Deterministic in-process fake `VideoRenderDriverBase` for unit, contract, and agent tests (§7.1).
 *
 * Intentionally **not** registered with `@RegisterClass`: callers inject it via
 * `VideoRenderEngine.Instance.UseDriver(new FakeRenderDriver())`.
 */
export class FakeRenderDriver extends VideoRenderDriverBase {
    private readonly scriptedIssues: CheckIssue[];
    private readonly scriptedHealth?: RenderHealth;
    private readonly isNetworkIsolated: boolean;
    public RenderCallCount = 0;
    public ShutdownCallCount = 0;

    public constructor(options: FakeRenderDriverOptions = {}) {
        super();
        this.scriptedIssues = options.CheckIssues ? [...options.CheckIssues] : [];
        this.scriptedHealth = options.Health ? { ...options.Health, Errors: [...options.Health.Errors] } : undefined;
        this.isNetworkIsolated = options.IsNetworkIsolated ?? true;
    }

    public override get IsNetworkIsolated(): boolean {
        return this.isNetworkIsolated;
    }

    public override async Render(
        req: RenderRequest,
        onProgress?: (progress: RenderProgress) => void,
        signal?: AbortSignal,
    ): Promise<RenderResult> {
        this.RenderCallCount++;
        ThrowIfSignalAborted(signal);

        const checkResult = await this.Check(
            {
                Bundle: req.Bundle,
                Width: req.Width,
                Height: req.Height,
            },
            signal,
        );
        if (checkResult.BlockRender) {
            throw new VideoRenderError(
                'LintBlocked',
                'Composition failed pre-render lint checks.',
                {
                    Status: 422,
                    Issues: checkResult.Issues,
                },
            );
        }

        const frameCount = Math.max(1, Math.round(req.DurationSeconds * req.Fps));

        if (bundleHasFakeHang(req.Bundle)) {
            onProgress?.({
                Phase: 'Rendering',
                RenderedFrames: 1,
                TotalFrames: frameCount,
                Percent: Math.max(1, Math.min(99, Math.round((1 / frameCount) * 100))),
                ElapsedMs: 1,
            });
            return waitForAbortSignal(signal);
        }

        const totalSteps = 5;
        for (let step = 1; step <= totalSteps; step++) {
            ThrowIfSignalAborted(signal);
            const renderedFrames =
                step === totalSteps
                    ? frameCount
                    : Math.round((step / totalSteps) * frameCount);
            const percent = Math.round((step / totalSteps) * 100);
            const phase: RenderProgress['Phase'] =
                step === totalSteps ? 'Complete' : 'Rendering';
            onProgress?.({
                Phase: phase,
                RenderedFrames: renderedFrames,
                TotalFrames: frameCount,
                Percent: percent,
                ElapsedMs: step,
            });
        }

        return {
            Format: req.Bundle.Format,
            Video: new Uint8Array(FAKE_DRIVER_MP4_BYTES),
            MimeType: 'video/mp4',
            Width: req.Width,
            Height: req.Height,
            Fps: req.Fps,
            DurationSeconds: req.DurationSeconds,
            FrameCount: frameCount,
            HasAudio: true,
            RendererVersion: FAKE_RENDERER_VERSION,
            RenderDurationMs: totalSteps,
        };
    }

    public override async CaptureStills(
        req: StillsRequest,
        signal?: AbortSignal,
    ): Promise<StillsResult> {
        ThrowIfSignalAborted(signal);
        const mimeType = req.ImageFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
        const stills = req.Points.map((point) => ({
            Key: point.Key,
            TimestampSeconds: point.TimestampSeconds,
            BeatKey: point.BeatKey,
            Role: point.Role,
            Label: point.Label,
            MimeType: mimeType as 'image/png' | 'image/jpeg',
            Width: req.Width,
            Height: req.Height,
            ImageBase64: FAKE_DRIVER_ONE_BY_ONE_PNG_BASE64,
        }));

        return {
            Format: req.Bundle.Format,
            Stills: stills,
            RendererVersion: FAKE_RENDERER_VERSION,
        };
    }

    public override async BuildContactSheet(
        req: ContactSheetRequest,
        signal?: AbortSignal,
    ): Promise<ContactSheetResult> {
        ThrowIfSignalAborted(signal);
        const maxTiles = Math.max(1, req.MaxTilesPerSheet ?? DEFAULT_MAX_TILES_PER_SHEET);
        const sheets: ContactSheetImage[] = [];

        if (req.Stills.length === 0) {
            return {
                Format: req.Format,
                Sheets: [],
            };
        }

        for (let offset = 0; offset < req.Stills.length; offset += maxTiles) {
            const slice = req.Stills.slice(offset, offset + maxTiles);
            sheets.push({
                Index: sheets.length,
                Kind: 'Grid',
                MimeType: 'image/png',
                Width: 1536,
                Height: 864,
                StillKeys: slice.map((still) => still.Key),
                ImageBase64: FAKE_DRIVER_ONE_BY_ONE_PNG_BASE64,
            });
        }

        if (req.IncludeTransitionStrip) {
            const transitionKeys = req.Stills.filter(
                (still) => still.Role === 'TransitionStart' || still.Role === 'TransitionEnd',
            ).map((still) => still.Key);
            if (transitionKeys.length > 0) {
                sheets.push({
                    Index: sheets.length,
                    Kind: 'TransitionStrip',
                    MimeType: 'image/png',
                    Width: 1536,
                    Height: 512,
                    StillKeys: transitionKeys,
                    ImageBase64: FAKE_DRIVER_ONE_BY_ONE_PNG_BASE64,
                });
            }
        }

        return {
            Format: req.Format,
            Sheets: sheets,
        };
    }

    public override async Check(
        req: CheckRequest,
        signal?: AbortSignal,
    ): Promise<CheckResult> {
        ThrowIfSignalAborted(signal);
        const remoteIssues = scanBundleForRemoteUrls(req.Bundle);
        const issues: CheckIssue[] = [
            ...remoteIssues,
            ...this.scriptedIssues.map((issue) => ({ ...issue })),
        ];
        const blockRender = issues.some((issue) => issue.Severity === 'Error');
        return {
            Passed: !blockRender,
            BlockRender: blockRender,
            Issues: issues,
        };
    }

    public override async ExtractKeyframes(
        req: KeyframeRequest,
        signal?: AbortSignal,
    ): Promise<KeyframeResult> {
        ThrowIfSignalAborted(signal);
        const maxFrames = Math.max(1, req.MaxFrames ?? DEFAULT_MAX_KEYFRAMES);
        const durationSeconds = DEFAULT_FAKE_VIDEO_DURATION_SECONDS;
        const frames: ExtractedKeyframe[] = [];

        for (let i = 0; i < maxFrames; i++) {
            const fraction = maxFrames === 1 ? 0.5 : i / (maxFrames - 1);
            const timestamp = Number((fraction * durationSeconds).toFixed(3));
            frames.push({
                Index: i,
                TimestampSeconds: timestamp,
                Reason: 'UniformSample',
                MimeType: 'image/png',
                Width: 1280,
                Height: 720,
                ImageBase64: FAKE_DRIVER_ONE_BY_ONE_PNG_BASE64,
            });
        }

        const result: KeyframeResult = {
            DurationSeconds: durationSeconds,
            Frames: frames,
        };

        if (req.BuildContactSheet) {
            result.Sheets = [
                {
                    Index: 0,
                    Kind: 'Grid',
                    MimeType: 'image/png',
                    Width: 1536,
                    Height: 864,
                    StillKeys: frames.map((frame) => `frame-${frame.Index}`),
                    ImageBase64: FAKE_DRIVER_ONE_BY_ONE_PNG_BASE64,
                },
            ];
        }

        return result;
    }

    public override async Health(signal?: AbortSignal): Promise<RenderHealth> {
        ThrowIfSignalAborted(signal);
        if (this.scriptedHealth) {
            return {
                ...this.scriptedHealth,
                Errors: [...this.scriptedHealth.Errors],
            };
        }
        return {
            Healthy: true,
            NodeVersion: process.version,
            HyperFramesVersion: FAKE_RENDERER_VERSION,
            ChromiumVersion: 'fake-chromium-146.0',
            FfmpegVersion: 'fake-ffmpeg-7.1',
            Errors: [],
        };
    }

    public override async Shutdown(): Promise<void> {
        this.ShutdownCallCount++;
    }
}
