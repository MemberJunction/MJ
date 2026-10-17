/**
 * Wire contract between `VideoRenderEngine` drivers and `@memberjunction/video-studio-render-worker` (§7.1).
 *
 * Projects travel as a self-contained `RenderProjectBundle` (composition files + staged asset
 * bytes + frozen data snapshot JSON) so the isolated render worker never connects to MemberJunction
 * or external networks.
 */

import type { VideoFormat, VideoRenderQuality } from './video-generation-spec.js';

/**
 * Base64-encoded binary payload (`string`) used across the render worker wire contract.
 *
 * Chosen over `Uint8Array` because `LocalWorkerRenderDriver`, `RemoteRenderDriver`, and
 * `DockerRenderDriver` exchange requests and responses over HTTP JSON (§7.2, §7.3). Standard
 * `JSON.stringify` serializes a `Uint8Array` as a verbose numeric-keyed object (`{"0":...}`),
 * whereas base64 strings serialize natively in JSON across both browser and Node runtimes
 * without importing Node's `Buffer`.
 */
export type Base64String = string;

// ---------------------------------------------------------------------------
// Project Bundle (§7.1)
// ---------------------------------------------------------------------------

/**
 * Single UTF-8 text file (HTML, CSS, JS, or injected chart-kit script) inside a composition bundle.
 */
export interface RenderCompositionFile {
    /** Relative path inside the composition directory (e.g., 'index.html', 'styles.css'). */
    Path: string;
    /** UTF-8 text content of the composition file. */
    Content: string;
}

/**
 * Staged binary asset (logo, font, image, narration clip, music track, or generated clip) bundled for the worker.
 */
export interface RenderStagedAsset {
    /** Logical asset key matching `VideoAsset.Key` or `NarrationLine.Key`. */
    Key: string;
    /** Relative path inside the bundle directory referenced by the composition (e.g., 'assets/logo.png'). */
    RelativePath: string;
    /** MIME type of the staged file (e.g., 'image/png', 'font/woff2', 'audio/mpeg', 'video/mp4'). */
    MimeType: string;
    /** Base64-encoded binary contents of the staged asset. */
    DataBase64: Base64String;
}

/**
 * Self-contained project bundle sent to the render worker (§7.1).
 */
export interface RenderProjectBundle {
    /** Target aspect ratio composition contained in this bundle. */
    Format: VideoFormat;
    /** Relative path of the HTML entry file (e.g., 'index.html'). */
    EntryFile: string;
    /** Text source files (HTML, CSS, JS, chart kit) making up the composition. */
    Files: RenderCompositionFile[];
    /** Staged binary assets available locally to the composition. */
    Assets: RenderStagedAsset[];
    /** Open map of frozen data snapshot values injected into the composition runtime (`data[key]`). */
    DataSnapshot?: Record<string, unknown>;
    /** Deterministic PRNG seed passed to the composition runtime. */
    Seed: number;
}

// ---------------------------------------------------------------------------
// Render (§7.1, §7.3)
// ---------------------------------------------------------------------------

/**
 * Request to render a composition bundle into an MP4 deliverable.
 */
export interface RenderRequest {
    /** Optional caller-assigned job identifier for logging and correlation. */
    JobID?: string;
    /** Self-contained composition project bundle to render. */
    Bundle: RenderProjectBundle;
    /** Output video width in pixels (e.g., 1920 for '16:9', 1080 for '9:16'). */
    Width: number;
    /** Output video height in pixels (e.g., 1080 for '16:9', 1920 for '9:16'). */
    Height: number;
    /** Target frame rate in frames per second (e.g., 24 or 30). */
    Fps: number;
    /** Total duration to render in seconds. */
    DurationSeconds: number;
    /** Encoding quality tier ('draft', 'standard', or 'high'). */
    Quality: VideoRenderQuality;
    /** Optional per-render hard timeout in milliseconds. */
    TimeoutMs?: number;
}

/**
 * Execution phase reported by `RenderProgress` callbacks during a render job.
 */
export type RenderProgressPhase =
    | 'Staging'    // Unpacking bundle into per-render temporary directory
    | 'Launching'  // Starting headless Chromium and loading composition entry
    | 'Rendering'  // Capturing deterministic frames across the timeline
    | 'Encoding'   // Muxing video frames and audio tracks via FFmpeg
    | 'Complete';  // Final MP4 packaged and ready

/**
 * Live progress update emitted during `VideoRenderDriverBase.Render`.
 */
export interface RenderProgress {
    /** Current execution phase of the render job. */
    Phase: RenderProgressPhase;
    /** Number of frames captured so far. */
    RenderedFrames: number;
    /** Total number of frames in the render job. */
    TotalFrames: number;
    /** Completion percentage (`0` to `100`). */
    Percent: number;
    /** Elapsed wall-clock time in milliseconds since job start. */
    ElapsedMs: number;
}

/**
 * Completed MP4 render result returned by `VideoRenderDriverBase.Render`.
 */
export interface RenderResult {
    /** Aspect ratio rendered. */
    Format: VideoFormat;
    /** Raw MP4 bytes produced by HyperFrames and FFmpeg (streamed over HTTP, never JSON-encoded). */
    Video: Uint8Array;
    /** Output container MIME type ('video/mp4'). */
    MimeType: 'video/mp4';
    /** Rendered frame width in pixels. */
    Width: number;
    /** Rendered frame height in pixels. */
    Height: number;
    /** Rendered frame rate in frames per second. */
    Fps: number;
    /** Measured duration of the output MP4 in seconds. */
    DurationSeconds: number;
    /** Total number of frames rendered. */
    FrameCount: number;
    /** True when the rendered MP4 includes an audio stream. */
    HasAudio: boolean;
    /** Exact `@hyperframes/producer` version that executed the job. */
    RendererVersion: string;
    /** Total wall-clock time in milliseconds spent rendering. */
    RenderDurationMs: number;
}

/**
 * Non-binary metadata fields of a completed MP4 render result emitted on the NDJSON stream before `GET /videos/:id`.
 */
export interface RenderResultMetadata extends Omit<RenderResult, 'Video'> {
    /** One-time identifier used to fetch the binary MP4 from `GET /videos/<VideoID>`. */
    VideoID: string;
    /** Byte length of the rendered MP4 file. */
    VideoSizeBytes: number;
}

// ---------------------------------------------------------------------------
// CaptureStills (§7.1, §7.3)
// ---------------------------------------------------------------------------

/**
 * Purpose of an individual still frame capture on the composition timeline.
 */
export type StillCaptureRole =
    | 'BeatMidpoint'     // Representative frame at the midpoint of a beat
    | 'TransitionStart'  // Frame immediately before a beat boundary transition
    | 'TransitionEnd'    // Frame immediately after a beat boundary transition
    | 'Poster'           // Final or hero poster frame for the production
    | 'Custom';          // Arbitrary caller-requested inspection timestamp

/**
 * Single timestamped still capture target within a `StillsRequest`.
 */
export interface StillCapturePoint {
    /** Unique identifier for this requested still (e.g., 'beat-1-mid', 'poster'). */
    Key: string;
    /** Exact seek timestamp in seconds to capture. */
    TimestampSeconds: number;
    /** Optional `VideoBeat.Key` associated with this capture point. */
    BeatKey?: string;
    /** Purpose of this frame capture. */
    Role: StillCaptureRole;
    /** Optional human-readable label rendered onto contact sheet tiles. */
    Label?: string;
}

/**
 * Request to capture exact still frames from a composition bundle via `captureFrameToBuffer`.
 */
export interface StillsRequest {
    /** Self-contained composition project bundle to seek and capture. */
    Bundle: RenderProjectBundle;
    /** Viewport width in pixels. */
    Width: number;
    /** Viewport height in pixels. */
    Height: number;
    /** Ordered timestamps and roles to capture. */
    Points: StillCapturePoint[];
    /** Output still image format (defaults to 'png'). */
    ImageFormat?: 'png' | 'jpeg';
    /** Optional capture timeout in milliseconds. */
    TimeoutMs?: number;
}

/**
 * Single still frame captured by `VideoRenderDriverBase.CaptureStills`.
 */
export interface CapturedStill {
    /** Identifier matching `StillCapturePoint.Key`. */
    Key: string;
    /** Timestamp in seconds at which the frame was captured. */
    TimestampSeconds: number;
    /** Associated `VideoBeat.Key`, if provided on the request. */
    BeatKey?: string;
    /** Capture role from the request. */
    Role: StillCaptureRole;
    /** Optional display label for contact-sheet rendering. */
    Label?: string;
    /** MIME type of the captured image ('image/png' or 'image/jpeg'). */
    MimeType: 'image/png' | 'image/jpeg';
    /** Captured image width in pixels. */
    Width: number;
    /** Captured image height in pixels. */
    Height: number;
    /** Base64-encoded PNG or JPEG image bytes. */
    ImageBase64: Base64String;
}

/**
 * Result of `VideoRenderDriverBase.CaptureStills`.
 */
export interface StillsResult {
    /** Aspect ratio of the captured stills. */
    Format: VideoFormat;
    /** Captured still frames in request order. */
    Stills: CapturedStill[];
    /** Exact `@hyperframes/engine` version used for frame capture. */
    RendererVersion: string;
}

// ---------------------------------------------------------------------------
// BuildContactSheet (§7.1, §7.3)
// ---------------------------------------------------------------------------

/**
 * Request to compose captured stills into labelled grid PNG(s) using headless Chromium.
 */
export interface ContactSheetRequest {
    /** Aspect ratio represented by the stills. */
    Format: VideoFormat;
    /** Captured stills to lay out into labelled contact-sheet grids. */
    Stills: CapturedStill[];
    /** Optional number of grid columns per sheet (defaults chosen per format). */
    Columns?: number;
    /** Optional maximum tiles per sheet so output stays within vision model image limits (≤ 4 sheets + 1 strip). */
    MaxTilesPerSheet?: number;
    /** Whether to emit a dedicated transition-edge comparison strip sheet. */
    IncludeTransitionStrip?: boolean;
}

/**
 * Single tiled contact-sheet or transition-strip PNG image.
 */
export interface ContactSheetImage {
    /** 0-based sheet index. */
    Index: number;
    /** Whether this image is a beat grid sheet or a transition comparison strip. */
    Kind: 'Grid' | 'TransitionStrip';
    /** PNG MIME type captured from headless Chromium. */
    MimeType: 'image/png';
    /** Sheet width in pixels. */
    Width: number;
    /** Sheet height in pixels. */
    Height: number;
    /** Keys of `CapturedStill` items included on this sheet. */
    StillKeys: string[];
    /** Base64-encoded PNG bytes of the rendered contact sheet. */
    ImageBase64: Base64String;
}

/**
 * Result of `VideoRenderDriverBase.BuildContactSheet`.
 */
export interface ContactSheetResult {
    /** Aspect ratio represented by the contact sheets. */
    Format: VideoFormat;
    /** Generated contact sheet PNGs ready for Critic inspection and MJStorage upload. */
    Sheets: ContactSheetImage[];
}

// ---------------------------------------------------------------------------
// Check (§7.1, §7.3, §9)
// ---------------------------------------------------------------------------

/**
 * Subsystem category for a deterministic composition check issue.
 */
export type CheckIssueCategory =
    | 'Lint'          // @hyperframes/lint structural or determinism violation
    | 'RemoteUrl'     // Blocked external network/media URL outside staged bundle assets
    | 'Layout'        // Element overlap, clipping, or off-canvas overflow
    | 'Contrast'      // WCAG text/background contrast ratio failure
    | 'SafeArea'      // Content encroaching on format-specific reserved safe margins
    | 'MinTextSize'   // Text smaller than minimum phone-scale readability threshold
    | 'DataLiteral'   // Unbound numeric/currency/percent literal in composition or spec text
    | 'MissingAsset'  // Reference to an asset path not present in the staged bundle
    | 'Audio'         // Missing or invalid audio track reference
    | 'Provenance';   // Generated asset missing provenance or exceeding MaxGeneratedVideoSeconds

/**
 * Severity of a deterministic check issue.
 */
export type CheckIssueSeverity =
    | 'Error'    // Blocks rendering and sends the composition back to the Motion Engineer
    | 'Warning'; // Advisory finding recorded without blocking the render

/**
 * Single finding reported by `VideoRenderDriverBase.Check`.
 */
export interface CheckIssue {
    /** Machine-readable check code (e.g., 'LINT_REMOTE_URL', 'SAFE_AREA_VIOLATION'). */
    Code: string;
    /** Subsystem that reported the issue. */
    Category: CheckIssueCategory;
    /** Whether the issue blocks rendering ('Error') or is advisory ('Warning'). */
    Severity: CheckIssueSeverity;
    /** Plain-English description of the defect and how to fix it. */
    Message: string;
    /** Optional composition file path where the issue was found. */
    File?: string;
    /** Optional 1-based line number in `File`. */
    Line?: number;
    /** Optional timeline timestamp in seconds where a visual check failed. */
    TimestampSeconds?: number;
    /** Optional `VideoBeat.Key` associated with the failure. */
    BeatKey?: string;
    /** Optional DOM selector of the offending element. */
    Selector?: string;
}

/**
 * Request to run deterministic lint, URL security, layout, contrast, safe-area, and literal checks.
 */
export interface CheckRequest {
    /** Composition bundle to audit. */
    Bundle: RenderProjectBundle;
    /** Viewport width in pixels for layout, safe-area, and text-size checks. */
    Width: number;
    /** Viewport height in pixels for layout, safe-area, and text-size checks. */
    Height: number;
    /** Optional timestamps in seconds at which to run DOM layout/contrast/safe-area audits. */
    SampleTimestampsSeconds?: number[];
    /** Formatted values derived from `DataBindings` + `DataSnapshot` that are permitted on screen. */
    AllowedDataLiterals?: string[];
}

/**
 * Result of `VideoRenderDriverBase.Check`.
 */
export interface CheckResult {
    /** True when zero `'Error'`-severity issues were found (`!BlockRender`). */
    Passed: boolean;
    /** True when one or more issues require the Motion Engineer to repair before rendering. */
    BlockRender: boolean;
    /** All deterministic lint, security, layout, contrast, safe-area, and literal issues found. */
    Issues: CheckIssue[];
}

// ---------------------------------------------------------------------------
// ExtractKeyframes (§7.1, §13.2)
// ---------------------------------------------------------------------------

/**
 * Request to sample keyframes from a reference video via FFmpeg scene-change and uniform sampling.
 */
export interface KeyframeRequest {
    /** Base64-encoded reference video bytes (MP4/WebM) to sample. */
    VideoBase64: Base64String;
    /** MIME type of the reference video (e.g., 'video/mp4', 'video/webm'). */
    MimeType: string;
    /** Maximum number of keyframes to extract (defaults to 16). */
    MaxFrames?: number;
    /** When true, also compose extracted keyframes into tiled contact-sheet PNGs for non-video-input models. */
    BuildContactSheet?: boolean;
}

/**
 * Single keyframe extracted from a reference video.
 */
export interface ExtractedKeyframe {
    /** 0-based frame index. */
    Index: number;
    /** Timestamp in seconds within the reference video. */
    TimestampSeconds: number;
    /** Why this frame was selected ('SceneChange' or 'UniformSample'). */
    Reason: 'SceneChange' | 'UniformSample';
    /** MIME type of the extracted frame image ('image/png' or 'image/jpeg'). */
    MimeType: 'image/png' | 'image/jpeg';
    /** Frame width in pixels. */
    Width: number;
    /** Frame height in pixels. */
    Height: number;
    /** Base64-encoded image bytes for this keyframe. */
    ImageBase64: Base64String;
}

/**
 * Result of `VideoRenderDriverBase.ExtractKeyframes`.
 */
export interface KeyframeResult {
    /** Total duration of the inspected reference video in seconds. */
    DurationSeconds: number;
    /** Individual extracted keyframes in chronological order. */
    Frames: ExtractedKeyframe[];
    /** Optional tiled keyframe sheets when `BuildContactSheet` was requested. */
    Sheets?: ContactSheetImage[];
}

// ---------------------------------------------------------------------------
// Health (§7.1, §7.3)
// ---------------------------------------------------------------------------

/**
 * Runtime health and tool version report returned by `VideoRenderDriverBase.Health`.
 */
export interface RenderHealth {
    /** True only when Node, HyperFrames, headless Chromium, and FFmpeg are all operational. */
    Healthy: boolean;
    /** Running Node.js version string (e.g., 'v24.18.0'). */
    NodeVersion: string;
    /** Installed `@hyperframes/producer` version string. */
    HyperFramesVersion: string;
    /** Headless Chromium version string when available. */
    ChromiumVersion?: string;
    /** FFmpeg version string detected on `PATH` when available. */
    FfmpegVersion?: string;
    /** Actionable diagnostic messages for any missing or unhealthy dependency (empty when `Healthy` is true). */
    Errors: string[];
}

// ---------------------------------------------------------------------------
// Wire Protocol (§7.1, §7.2, §7.3)
// ---------------------------------------------------------------------------

/**
 * Structured error codes returned by the render worker HTTP endpoints.
 *
 * `'GEOMETRY_MISMATCH'` (HTTP 400) indicates the request geometry (`Width`, `Height`, or
 * `DurationSeconds`) differs from the composition's `data-width`, `data-height`, or `data-duration` attributes.
 */
export type RenderWorkerErrorCode =
    | 'Unauthorized'
    | 'NotFound'
    | 'BodyTooLarge'
    | 'InvalidRequest'
    | 'InvalidBundle'
    | 'GEOMETRY_MISMATCH' // HTTP 400: request geometry differs from the composition's data-* attributes
    | 'LintBlocked'
    | 'TooManyStills'
    | 'Timeout'
    | 'Cancelled'
    | 'DependencyMissing'
    | 'Internal';

/**
 * Error response body returned on non-2xx render worker responses and `Error` NDJSON events.
 */
export interface RenderWorkerErrorBody {
    /** Machine-readable error code. */
    Code: RenderWorkerErrorCode;
    /** Human-readable error message. */
    Message: string;
    /** Optional lint/security issues attached when `Code === 'LintBlocked'`. */
    Issues?: CheckIssue[];
}

/**
 * Discriminated union of newline-delimited JSON (NDJSON) events streamed by `POST /render`.
 */
export type RenderStreamEvent =
    | {
          /** Progress event emitted as frames are captured and encoded. */
          Type: 'Progress';
          /** Current render progress payload. */
          Progress: RenderProgress;
      }
    | {
          /** Periodic keep-alive event emitted every 15 seconds while a render job is active. */
          Type: 'Heartbeat';
      }
    | {
          /** Terminal success event carrying MP4 metadata and `VideoID` for `GET /videos/<VideoID>`. */
          Type: 'Result';
          /** Completed render metadata. */
          Result: RenderResultMetadata;
      }
    | {
          /** Terminal error event emitted when a render job fails after streaming has begun. */
          Type: 'Error';
          /** Structured error details. */
          Error: RenderWorkerErrorBody;
      };

/**
 * Canonical HTTP route paths served by `@memberjunction/video-studio-render-worker`.
 */
export const RENDER_WORKER_ROUTES = {
    Health: '/health',
    Render: '/render',
    Video: '/videos',
    Stills: '/stills',
    ContactSheet: '/contact-sheet',
    Check: '/check',
    Keyframes: '/keyframes',
} as const;

/**
 * Prefix line printed to stdout by the render worker CLI once the HTTP server is listening,
 * followed immediately by the bound port digits (`VIDEO_STUDIO_RENDER_WORKER_PORT=<port>\n`).
 */
export const RENDER_WORKER_PORT_PREFIX = 'VIDEO_STUDIO_RENDER_WORKER_PORT=' as const;

/**
 * Environment variable names read by the render worker and driver layer.
 */
export const RENDER_WORKER_ENV = {
    Host: 'VIDEO_STUDIO_RENDER_HOST',
    Port: 'VIDEO_STUDIO_RENDER_PORT',
    Token: 'VIDEO_STUDIO_RENDER_TOKEN',
    MaxBodyMb: 'VIDEO_STUDIO_RENDER_MAX_BODY_MB',
    Concurrency: 'VIDEO_STUDIO_RENDER_CONCURRENCY',
    MaxTimeoutMs: 'VIDEO_STUDIO_RENDER_MAX_TIMEOUT_MS',
    AllowRoot: 'VIDEO_STUDIO_RENDER_ALLOW_ROOT',
} as const;


