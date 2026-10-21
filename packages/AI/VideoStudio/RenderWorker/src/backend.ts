import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
    CheckIssue,
    ExtractedKeyframe,
    RenderHealth,
    RenderProgress,
    RenderWorkerErrorBody,
    RenderWorkerErrorCode,
} from '@memberjunction/video-studio-core';

/** Pinned `@hyperframes/producer` version reported by the worker. */
export const PINNED_HYPERFRAMES_VERSION = '0.8.134';

/** Valid 1x1 transparent PNG used by `FakeRenderBackend`. */
export const FAKE_ONE_BY_ONE_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
);

/** Minimal valid ISO BMFF (`ftyp`) header bytes used by `FakeRenderBackend`. */
export const FAKE_MP4_BYTES = Buffer.from([
    0x00, 0x00, 0x00, 0x18,
    0x66, 0x74, 0x79, 0x70, // 'ftyp'
    0x6d, 0x70, 0x34, 0x32, // 'mp42'
    0x00, 0x00, 0x00, 0x00,
    0x6d, 0x70, 0x34, 0x32, // 'mp42'
    0x69, 0x73, 0x6f, 0x6d, // 'isom'
]);

/**
 * Structured error thrown inside the render worker with an HTTP-mappable error code.
 */
export class RenderWorkerError extends Error {
    public readonly Code: RenderWorkerErrorCode;
    public readonly Issues?: CheckIssue[];

    public constructor(code: RenderWorkerErrorCode, message: string, issues?: CheckIssue[]) {
        super(message);
        this.name = 'RenderWorkerError';
        this.Code = code;
        this.Issues = issues;
    }

    /**
     * Converts this error into the wire-format `RenderWorkerErrorBody`.
     */
    public ToBody(): RenderWorkerErrorBody {
        const body: RenderWorkerErrorBody = {
            Code: this.Code,
            Message: this.message,
        };
        if (this.Issues && this.Issues.length > 0) {
            body.Issues = this.Issues;
        }
        return body;
    }
}

/**
 * Parameters passed to `RenderBackend.Render` for an unpacked bundle on disk.
 */
export interface BackendRenderJob {
    /** Absolute path to the unpacked bundle directory. */
    RootDir: string;
    /** Relative entry HTML path inside `RootDir`. */
    EntryFile: string;
    /** Output frame width in pixels. */
    Width: number;
    /** Output frame height in pixels. */
    Height: number;
    /** Output frame rate in frames per second. */
    Fps: number;
    /** Optional explicit duration override in seconds. */
    DurationSeconds?: number;
    /** Optional encoding quality preset. */
    Quality?: 'draft' | 'standard' | 'high';
}

/**
 * Parameters passed to `RenderBackend.CaptureStills` for an unpacked bundle on disk.
 */
export interface BackendStillsJob {
    /** Absolute path to the unpacked bundle directory. */
    RootDir: string;
    /** Relative entry HTML path inside `RootDir`. */
    EntryFile: string;
    /** Viewport width in pixels. */
    Width: number;
    /** Viewport height in pixels. */
    Height: number;
    /** Frame rate in frames per second. */
    Fps: number;
    /** Timestamps in seconds to capture in a single browser session. */
    TimestampsSeconds: number[];
    /** Output image format (`png` or `jpeg`). */
    ImageFormat: 'png' | 'jpeg';
    /** Optional JPEG quality (`1-100`). */
    JpegQuality?: number;
}

/**
 * Media metadata probed from a rendered MP4 file.
 */
export interface BackendProbeResult {
    /** Probed duration in seconds. */
    DurationSeconds: number;
    /** Whether the file contains an audio stream with non-zero duration. */
    HasAudio: boolean;
    /** Probed video width in pixels. */
    Width: number;
    /** Probed video height in pixels. */
    Height: number;
}

/**
 * Parameters passed to `RenderBackend.RunCheckCli` and `RenderBackend.MeasureText` for an unpacked bundle on disk.
 */
export interface BackendCheckJob {
    /** Absolute path to the unpacked bundle directory. */
    RootDir: string;
    /** Relative entry HTML path inside `RootDir`. */
    EntryFile: string;
    /** Viewport width in pixels. */
    Width: number;
    /** Viewport height in pixels. */
    Height: number;
    /** Frame rate in frames per second (defaults to 30). */
    Fps?: number;
}

/**
 * Visible text element measurement captured in the headless browser DOM at a specific timestamp (VS-RND-5).
 */
export interface MeasuredText {
    /** Trimmed visible text owned by the element. */
    Text: string;
    /** Bounding box left coordinate in CSS pixels relative to the viewport. */
    Left: number;
    /** Bounding box top coordinate in CSS pixels relative to the viewport. */
    Top: number;
    /** Bounding box width in CSS pixels. */
    Width: number;
    /** Bounding box height in CSS pixels. */
    Height: number;
    /** Computed `font-size` in pixels. */
    FontSizePx: number;
    /** First computed `font-family` name (unquoted). */
    FontFamily: string;
    /** True when the first computed `font-family` is a loaded `FontFace` in `document.fonts`. */
    FontIsBundled: boolean;
    /** True when the element or an ancestor carries `data-mj-bound`. */
    IsBound: boolean;
    /** The `data-mj-bound` attribute value from the element or its nearest bound ancestor, when `IsBound` is true. */
    BoundKey?: string;
    /** Short CSS selector path identifying the element. */
    Selector: string;
    /** Sample timestamp in seconds at which the measurement was taken. */
    TimestampSeconds: number;
}

/**
 * Pluggable rendering backend interface separating job orchestration and HTTP transport
 * from HyperFrames, Chromium, and ffmpeg execution.
 */
export interface RenderBackend {
    /** Runs static project and media URL lint checks on an unpacked bundle directory. */
    Lint(dir: string, entry: string): Promise<{ Issues: CheckIssue[]; Block: boolean }>;
    /** Runs `hyperframes check --json` in a restricted subprocess and maps findings to `CheckIssue[]`. */
    RunCheckCli(job: BackendCheckJob, signal?: AbortSignal): Promise<CheckIssue[]>;
    /** Seeks the composition to each timestamp in `timestampsSeconds` and measures visible text elements. */
    MeasureText(
        job: BackendCheckJob,
        timestampsSeconds: readonly number[],
        signal?: AbortSignal,
    ): Promise<MeasuredText[][]>;
    /** Renders an unpacked composition to an MP4 file on disk, emitting progress events. */
    Render(
        job: BackendRenderJob,
        onProgress: (progress: RenderProgress) => void,
        signal?: AbortSignal,
    ): Promise<{ OutputPath: string; FrameCount: number }>;
    /** Captures one or more still frames in a single headless browser session. */
    CaptureStills(job: BackendStillsJob, signal?: AbortSignal): Promise<Uint8Array[]>;
    /** Probes an MP4 file for duration, dimensions, and audio stream presence. */
    Probe(videoPath: string): Promise<BackendProbeResult>;
    /** Extracts representative keyframes (scene changes + uniform samples) from an MP4 file. */
    ExtractKeyframes(
        videoPath: string,
        outDir: string,
        max: number,
        signal?: AbortSignal,
    ): Promise<ExtractedKeyframe[]>;
    /** Checks runtime dependencies and returns version and health status. */
    Health(): Promise<RenderHealth>;
    /** Returns the installed renderer version string. */
    GetRendererVersion(): string;
}

/**
 * Configuration options for `FakeRenderBackend` in unit and contract tests.
 */
export interface FakeRenderBackendOptions {
    /** Additional lint issues returned by `Lint()`. */
    ExtraLintIssues?: CheckIssue[];
    /** Whether `Lint()` should report `Block: true`. */
    BlockLint?: boolean;
    /** Scripted CLI check issues returned by `RunCheckCli()` (defaults to `[]`). */
    CheckCliIssues?: CheckIssue[];
    /** Optional error thrown by `RunCheckCli()` to test fault tolerance. */
    ThrowOnCheckCli?: Error;
    /** Scripted DOM text measurements returned by `MeasureText()` (defaults to `[]`). */
    MeasuredTexts?: MeasuredText[][];
    /** Optional error thrown by `MeasureText()` to test fault tolerance. */
    ThrowOnMeasureText?: Error;
    /** Delay in milliseconds between each of the 5 progress steps (defaults to 20 ms). */
    StepDelayMs?: number;
    /** Simulated audio presence returned by `Probe()` (defaults to `true`). */
    HasAudio?: boolean;
    /** Simulated health status returned by `Health()` (defaults to `true`). */
    Healthy?: boolean;
}

/**
 * Deterministic in-memory/temp-file `RenderBackend` requiring neither Chromium nor ffmpeg.
 */
export class FakeRenderBackend implements RenderBackend {
    private readonly options: FakeRenderBackendOptions;
    private lastProbe: BackendProbeResult = {
        DurationSeconds: 3,
        HasAudio: true,
        Width: 1280,
        Height: 720,
    };
    public LintCallCount = 0;
    public RunCheckCliCallCount = 0;
    public MeasureTextCallCount = 0;
    public LastMeasuredTimestamps: number[] = [];
    public LastCheckCliJob?: BackendCheckJob;
    public LastMeasureTextJob?: BackendCheckJob;
    public LastCheckCliSignal?: AbortSignal;
    public LastMeasureTextSignal?: AbortSignal;

    public constructor(options: FakeRenderBackendOptions = {}) {
        this.options = options;
    }

    public async Lint(_dir: string, _entry: string): Promise<{ Issues: CheckIssue[]; Block: boolean }> {
        this.LintCallCount++;
        const extra = this.options.ExtraLintIssues ? [...this.options.ExtraLintIssues] : [];
        const hasError = extra.some((issue) => issue.Severity === 'Error');
        return {
            Issues: extra,
            Block: Boolean(this.options.BlockLint) || hasError,
        };
    }

    public async RunCheckCli(job: BackendCheckJob, signal?: AbortSignal): Promise<CheckIssue[]> {
        throwIfAborted(signal);
        this.RunCheckCliCallCount++;
        this.LastCheckCliJob = { ...job };
        this.LastCheckCliSignal = signal;
        if (this.options.ThrowOnCheckCli) {
            throw this.options.ThrowOnCheckCli;
        }
        return this.options.CheckCliIssues ? [...this.options.CheckCliIssues] : [];
    }

    public async MeasureText(
        job: BackendCheckJob,
        timestampsSeconds: readonly number[],
        signal?: AbortSignal,
    ): Promise<MeasuredText[][]> {
        throwIfAborted(signal);
        this.MeasureTextCallCount++;
        this.LastMeasureTextJob = { ...job };
        this.LastMeasureTextSignal = signal;
        this.LastMeasuredTimestamps = [...timestampsSeconds];
        if (this.options.ThrowOnMeasureText) {
            throw this.options.ThrowOnMeasureText;
        }
        if (this.options.MeasuredTexts) {
            return this.options.MeasuredTexts.map((group) => [...group]);
        }
        return [];
    }

    public async Render(
        job: BackendRenderJob,
        onProgress: (progress: RenderProgress) => void,
        signal?: AbortSignal,
    ): Promise<{ OutputPath: string; FrameCount: number }> {
        throwIfAborted(signal);
        const entryContent = await fs.readFile(path.join(job.RootDir, job.EntryFile), 'utf8');
        const durationSeconds = job.DurationSeconds ?? parseDurationFromHtml(entryContent) ?? 3;
        const totalFrames = Math.max(1, Math.round(durationSeconds * job.Fps));
        const stepDelayMs = this.options.StepDelayMs ?? 20;

        if (entryContent.includes('data-fake-hang')) {
            onProgress({
                Phase: 'Rendering',
                RenderedFrames: 1,
                TotalFrames: totalFrames,
                Percent: Math.round((1 / totalFrames) * 100),
                ElapsedMs: 1,
            });
            await waitForAbort(signal);
        }

        const totalSteps = 5;
        const startMs = Date.now();
        for (let step = 1; step <= totalSteps; step++) {
            await delayWithSignal(stepDelayMs, signal);
            const completedFrames = Math.round((step / totalSteps) * totalFrames);
            onProgress({
                Phase: step < totalSteps ? 'Rendering' : 'Encoding',
                RenderedFrames: completedFrames,
                TotalFrames: totalFrames,
                Percent: Math.round((step / totalSteps) * 100),
                ElapsedMs: Date.now() - startMs,
            });
        }

        const outputPath = path.join(job.RootDir, 'fake-output.mp4');
        await fs.writeFile(outputPath, FAKE_MP4_BYTES);
        this.lastProbe = {
            DurationSeconds: durationSeconds,
            HasAudio: this.options.HasAudio ?? true,
            Width: job.Width,
            Height: job.Height,
        };

        return { OutputPath: outputPath, FrameCount: totalFrames };
    }

    public async CaptureStills(job: BackendStillsJob, signal?: AbortSignal): Promise<Uint8Array[]> {
        throwIfAborted(signal);
        return job.TimestampsSeconds.map(() => new Uint8Array(FAKE_ONE_BY_ONE_PNG));
    }

    public async Probe(_videoPath: string): Promise<BackendProbeResult> {
        return { ...this.lastProbe };
    }

    public async ExtractKeyframes(
        _videoPath: string,
        _outDir: string,
        max: number,
        signal?: AbortSignal,
    ): Promise<ExtractedKeyframe[]> {
        throwIfAborted(signal);
        const cap = Math.max(1, Math.min(max, 4));
        const frames: ExtractedKeyframe[] = [];
        for (let i = 0; i < cap; i++) {
            frames.push({
                Index: i,
                TimestampSeconds: i * 0.5,
                Reason: i === 1 ? 'SceneChange' : 'UniformSample',
                MimeType: 'image/png',
                Width: 1280,
                Height: 720,
                ImageBase64: FAKE_ONE_BY_ONE_PNG.toString('base64'),
            });
        }
        return frames;
    }

    public async Health(): Promise<RenderHealth> {
        const healthy = this.options.Healthy ?? true;
        return {
            Healthy: healthy,
            NodeVersion: process.version,
            HyperFramesVersion: PINNED_HYPERFRAMES_VERSION,
            ChromiumVersion: healthy ? 'fake-chromium-146.0' : undefined,
            FfmpegVersion: healthy ? 'fake-ffmpeg-7.1' : undefined,
            Errors: healthy ? [] : ['Fake backend configured unhealthy.'],
        };
    }

    public GetRendererVersion(): string {
        return PINNED_HYPERFRAMES_VERSION;
    }
}

function parseDurationFromHtml(html: string): number | undefined {
    const match = /\bdata-duration\s*=\s*(?:"([0-9.]+)"|'([0-9.]+)')/i.exec(html);
    const raw = match?.[1] ?? match?.[2];
    if (!raw) {
        return undefined;
    }
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw new RenderWorkerError('Cancelled', 'Render job was cancelled.');
    }
}

function delayWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = (): void => {
            clearTimeout(timer);
            reject(new RenderWorkerError('Cancelled', 'Render job was cancelled.'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

function waitForAbort(signal?: AbortSignal): Promise<never> {
    throwIfAborted(signal);
    return new Promise<never>((_resolve, reject) => {
        const onAbort = (): void => {
            reject(new RenderWorkerError('Cancelled', 'Render job was cancelled.'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}
