import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    VIDEO_FORMATS,
    type CapturedStill,
    type CheckIssue,
    type CheckRequest,
    type CheckResult,
    type ContactSheetImage,
    type ContactSheetRequest,
    type ContactSheetResult,
    type KeyframeRequest,
    type KeyframeResult,
    type RenderHealth,
    type RenderProgress,
    type RenderProjectBundle,
    type RenderRequest,
    type RenderResult,
    type StillCapturePoint,
    type StillsRequest,
    type StillsResult,
    type VideoFormat,
} from '@memberjunction/video-studio-core';
import {
    RenderWorkerError,
    type BackendCheckJob,
    type RenderBackend,
} from './backend.js';
import {
    StageRenderBundle,
    ValidateCompositionGeometryMatch,
    ValidateRenderGeometry,
    ValidateStrictBase64,
} from './bundle.js';
import { EvaluateDomRules } from './checks/dom-rules.js';
import { BuildCheckCliFailedIssue } from './checks/hyperframes-check.js';
import { RunStaticChecks } from './checks/static-checks.js';
import { RunLintGate, SortCheckIssues } from './lint-gate.js';

/** Maximum number of still capture points allowed in a single `/stills` request. */
export const MAX_STILL_POINTS = 48;

/** Maximum number of grid contact sheets produced by a single `/contact-sheet` request. */
export const MAX_CONTACT_SHEET_GRIDS = 4;

/** Default number of tiles per contact sheet grid. */
export const DEFAULT_TILES_PER_SHEET = 12;

/** Output width in pixels for every contact sheet image. */
export const CONTACT_SHEET_WIDTH = 1536;

/** Issue code emitted when `backend.MeasureText` throws during `/check`. */
export const MJ_MEASURE_TEXT_FAILED_CODE = 'MJ_MEASURE_TEXT_FAILED';

/**
 * Common options shared across job runners.
 */
export interface RunJobCommonOptions {
    /** Optional base directory for temporary bundle staging and keyframe extraction. */
    TempRoot?: string;
}

/**
 * Executes a `/check` job (VS-RND-5 Step 8):
 * 1. Validate request & geometry (including composition root attribute match)
 * 2. Stage bundle (with preamble injected on a single line so line numbers stay unchanged and
 *    `@hyperframes/lint` sees `window.__timelines` for `OnFrame`-only compositions)
 * 3. Run RND-1 lint gate (`RunLintGate`); if lint-blocked, return lint issues immediately
 *    without invoking Chromium
 * 4. Run static authored-file checks (`RunStaticChecks`)
 * 5. Run `hyperframes check --json` via `backend.RunCheckCli`
 * 6. Measure rendered text at `SampleTimestampsSeconds ?? [0]` via `backend.MeasureText` and
 *    evaluate DOM rules (`EvaluateDomRules`)
 * 7. Merge, dedupe on `Code + Selector + File + Line` keeping earliest `TimestampSeconds`, and sort.
 */
export async function RunCheckJob(
    req: CheckRequest,
    backend: RenderBackend,
    signal?: AbortSignal,
    options?: RunJobCommonOptions,
): Promise<CheckResult> {
    if (!req || typeof req !== 'object' || !req.Bundle) {
        throw new RenderWorkerError('InvalidRequest', 'CheckRequest.Bundle is required.');
    }
    if (req.SampleTimestampsSeconds !== undefined) {
        if (!Array.isArray(req.SampleTimestampsSeconds)) {
            throw new RenderWorkerError(
                'InvalidRequest',
                'CheckRequest.SampleTimestampsSeconds must be an array of finite non-negative numbers.',
            );
        }
        if (req.SampleTimestampsSeconds.length > MAX_STILL_POINTS) {
            throw new RenderWorkerError(
                'InvalidRequest',
                `CheckRequest.SampleTimestampsSeconds count (${req.SampleTimestampsSeconds.length}) exceeds maximum allowed (${MAX_STILL_POINTS}).`,
            );
        }
        for (let i = 0; i < req.SampleTimestampsSeconds.length; i++) {
            const ts = req.SampleTimestampsSeconds[i];
            if (typeof ts !== 'number' || !Number.isFinite(ts) || ts < 0) {
                throw new RenderWorkerError(
                    'InvalidRequest',
                    `CheckRequest.SampleTimestampsSeconds[${i}] must be a finite number >= 0.`,
                );
            }
        }
    }
    if (req.AllowedDataLiterals !== undefined) {
        if (
            !Array.isArray(req.AllowedDataLiterals) ||
            req.AllowedDataLiterals.some((lit) => typeof lit !== 'string')
        ) {
            throw new RenderWorkerError(
                'InvalidRequest',
                'CheckRequest.AllowedDataLiterals must be an array of strings.',
            );
        }
    }
    ValidateRenderGeometry({
        Format: req.Bundle.Format,
        Width: req.Width,
        Height: req.Height,
    });
    ValidateCompositionGeometryMatch(req.Bundle, {
        Width: req.Width,
        Height: req.Height,
    });

    const staged = await StageRenderBundle(req.Bundle, {
        TempRoot: options?.TempRoot,
        Geometry: { Width: req.Width, Height: req.Height, Fps: 30 },
    });
    try {
        const lintResult = await RunLintGate(req.Bundle, staged.RootDir, backend);
        if (lintResult.BlockRender) {
            return lintResult;
        }

        const staticIssues = RunStaticChecks(req.Bundle, {
            AllowedDataLiterals: req.AllowedDataLiterals,
        });

        const checkJob: BackendCheckJob = {
            RootDir: staged.RootDir,
            EntryFile: req.Bundle.EntryFile,
            Width: req.Width,
            Height: req.Height,
        };

        const cliIssues = await runCheckCliSafely(backend, checkJob, signal);
        const sampleTimestamps =
            Array.isArray(req.SampleTimestampsSeconds) && req.SampleTimestampsSeconds.length > 0
                ? req.SampleTimestampsSeconds
                : [0];
        const domIssues = await runDomChecksSafely(req, backend, checkJob, sampleTimestamps, signal);

        const merged = SortCheckIssues(
            DedupeCheckIssues([...lintResult.Issues, ...staticIssues, ...cliIssues, ...domIssues]),
        );
        const passed = !merged.some((issue) => issue.Severity === 'Error');
        return {
            Passed: passed,
            BlockRender: !passed,
            Issues: merged,
        };
    } finally {
        await staged.Cleanup();
    }
}

/**
 * Deduplicates `CheckIssue` items on `Code + Selector + File + Line`, keeping the earliest
 * `TimestampSeconds` when duplicates exist (VS-RND-5 Step 8).
 */
export function DedupeCheckIssues(issues: readonly CheckIssue[]): CheckIssue[] {
    const byKey = new Map<string, CheckIssue>();
    for (const issue of issues) {
        const key = `${issue.Code}\u0000${issue.Selector ?? ''}\u0000${issue.File ?? ''}\u0000${issue.Line ?? ''}`;
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, { ...issue });
            continue;
        }
        const existingTime = existing.TimestampSeconds;
        const candidateTime = issue.TimestampSeconds;
        if (
            candidateTime !== undefined &&
            (existingTime === undefined || candidateTime < existingTime)
        ) {
            byKey.set(key, {
                ...issue,
                Severity:
                    existing.Severity === 'Error' || issue.Severity === 'Error'
                        ? 'Error'
                        : issue.Severity,
            });
        } else if (existing.Severity !== 'Error' && issue.Severity === 'Error') {
            existing.Severity = 'Error';
        }
    }
    return [...byKey.values()];
}

async function runCheckCliSafely(
    backend: RenderBackend,
    job: BackendCheckJob,
    signal?: AbortSignal,
): Promise<CheckIssue[]> {
    try {
        return await backend.RunCheckCli(job, signal);
    } catch (error) {
        if (signal?.aborted) {
            throw new RenderWorkerError('Cancelled', 'Check job was cancelled.');
        }
        const reason = error instanceof Error ? error.message : String(error);
        return [BuildCheckCliFailedIssue(reason)];
    }
}

async function runDomChecksSafely(
    req: CheckRequest,
    backend: RenderBackend,
    job: BackendCheckJob,
    sampleTimestamps: readonly number[],
    signal?: AbortSignal,
): Promise<CheckIssue[]> {
    try {
        const measuredByTimestamp = await backend.MeasureText(job, sampleTimestamps, signal);
        const flatMeasured = measuredByTimestamp.flat();
        return EvaluateDomRules(flatMeasured, {
            Format: req.Bundle.Format,
            Width: req.Width,
            Height: req.Height,
            AllowedDataLiterals: req.AllowedDataLiterals,
        });
    } catch (error) {
        if (signal?.aborted) {
            throw new RenderWorkerError('Cancelled', 'Check job was cancelled.');
        }
        const reason = error instanceof Error ? error.message : String(error);
        return [
            {
                Code: MJ_MEASURE_TEXT_FAILED_CODE,
                Category: 'Lint',
                Severity: 'Warning',
                Message: `DOM text measurement failed: ${reason}`,
            },
        ];
    }
}

/**
 * Options for `RunRenderJob`.
 */
export interface RunRenderJobOptions extends RunJobCommonOptions {
    /** If true, skips re-running `RunLintGate` (used when the HTTP server pre-checks before streaming). */
    SkipLintGate?: boolean;
}

/**
 * Executes a `/render` job: stages the bundle, enforces the lint gate, injects the CSP and
 * `window.MJVideo` preamble, renders the MP4 via `backend.Render`, probes the output, and
 * returns a `RenderResult`.
 */
export async function RunRenderJob(
    req: RenderRequest,
    backend: RenderBackend,
    onProgress: (progress: RenderProgress) => void,
    signal?: AbortSignal,
    options?: RunRenderJobOptions,
): Promise<RenderResult> {
    if (!req || typeof req !== 'object' || !req.Bundle) {
        throw new RenderWorkerError('InvalidRequest', 'RenderRequest.Bundle is required.');
    }
    ValidateRenderGeometry({
        Format: req.Bundle.Format,
        Width: req.Width,
        Height: req.Height,
        Fps: req.Fps,
        DurationSeconds: req.DurationSeconds,
    });
    ValidateCompositionGeometryMatch(req.Bundle, {
        Width: req.Width,
        Height: req.Height,
        DurationSeconds: req.DurationSeconds,
    });

    const startMs = Date.now();
    const staged = await StageRenderBundle(req.Bundle, {
        TempRoot: options?.TempRoot,
        Geometry: {
            Width: req.Width,
            Height: req.Height,
            Fps: req.Fps,
            DurationSeconds: req.DurationSeconds,
        },
    });
    try {
        if (!options?.SkipLintGate) {
            const check = await RunLintGate(req.Bundle, staged.RootDir, backend);
            if (check.BlockRender) {
                throw new RenderWorkerError(
                    'LintBlocked',
                    'Composition failed pre-render lint checks.',
                    check.Issues,
                );
            }
        }

        const rendered = await backend.Render(
            {
                RootDir: staged.RootDir,
                EntryFile: req.Bundle.EntryFile,
                Width: req.Width,
                Height: req.Height,
                Fps: req.Fps,
                DurationSeconds: req.DurationSeconds,
                Quality: req.Quality,
            },
            onProgress,
            signal,
        );

        const videoBytes = await fs.readFile(rendered.OutputPath);
        const probe = await backend.Probe(rendered.OutputPath);
        const rendererVersion = backend.GetRendererVersion();

        return {
            Format: req.Bundle.Format,
            Video: new Uint8Array(videoBytes),
            MimeType: 'video/mp4',
            Width: probe.Width || req.Width,
            Height: probe.Height || req.Height,
            Fps: req.Fps,
            DurationSeconds: probe.DurationSeconds || req.DurationSeconds,
            FrameCount: rendered.FrameCount,
            HasAudio: probe.HasAudio,
            RendererVersion: rendererVersion,
            RenderDurationMs: Math.max(1, Date.now() - startMs),
        };
    } finally {
        await staged.Cleanup();
    }
}

/**
 * Executes a `/stills` job: validates `Points` (1..48), stages and lints the bundle, injects
 * the preamble, and captures all requested timestamps in a single browser session.
 */
export async function RunStillsJob(
    req: StillsRequest,
    backend: RenderBackend,
    signal?: AbortSignal,
    options?: RunJobCommonOptions,
): Promise<StillsResult> {
    if (!req || typeof req !== 'object' || !req.Bundle) {
        throw new RenderWorkerError('InvalidRequest', 'StillsRequest.Bundle is required.');
    }
    if (!Array.isArray(req.Points) || req.Points.length === 0) {
        throw new RenderWorkerError('InvalidRequest', 'StillsRequest.Points must be a non-empty array.');
    }
    if (req.Points.length > MAX_STILL_POINTS) {
        throw new RenderWorkerError(
            'TooManyStills',
            `StillsRequest.Points (${req.Points.length}) exceeds maximum (${MAX_STILL_POINTS}).`,
        );
    }
    for (const point of req.Points) {
        if (!point || typeof point.Key !== 'string' || !point.Key.trim()) {
            throw new RenderWorkerError('InvalidRequest', 'Each StillCapturePoint requires a non-empty Key.');
        }
        if (typeof point.TimestampSeconds !== 'number' || !Number.isFinite(point.TimestampSeconds) || point.TimestampSeconds < 0) {
            throw new RenderWorkerError('InvalidRequest', `Invalid TimestampSeconds on point "${point.Key}".`);
        }
    }

    ValidateRenderGeometry({
        Format: req.Bundle.Format,
        Width: req.Width,
        Height: req.Height,
    });
    ValidateCompositionGeometryMatch(req.Bundle, {
        Width: req.Width,
        Height: req.Height,
    });

    const imageFormat = req.ImageFormat ?? 'png';
    const mimeType = imageFormat === 'jpeg' ? 'image/jpeg' : 'image/png';

    const staged = await StageRenderBundle(req.Bundle, {
        TempRoot: options?.TempRoot,
        Geometry: { Width: req.Width, Height: req.Height, Fps: 30 },
    });
    try {
        const check = await RunLintGate(req.Bundle, staged.RootDir, backend);
        if (check.BlockRender) {
            throw new RenderWorkerError(
                'LintBlocked',
                'Composition failed pre-render lint checks.',
                check.Issues,
            );
        }

        const buffers = await backend.CaptureStills(
            {
                RootDir: staged.RootDir,
                EntryFile: req.Bundle.EntryFile,
                Width: req.Width,
                Height: req.Height,
                Fps: 30,
                TimestampsSeconds: req.Points.map((p) => p.TimestampSeconds),
                ImageFormat: imageFormat,
            },
            signal,
        );

        const stills: CapturedStill[] = req.Points.map((point: StillCapturePoint, idx: number) => {
            const bytes = buffers[idx] ?? new Uint8Array();
            return {
                Key: point.Key,
                TimestampSeconds: point.TimestampSeconds,
                BeatKey: point.BeatKey,
                Role: point.Role,
                Label: point.Label,
                MimeType: mimeType,
                Width: req.Width,
                Height: req.Height,
                ImageBase64: Buffer.from(bytes).toString('base64'),
            };
        });
        const rendererVersion = backend.GetRendererVersion();

        return {
            Format: req.Bundle.Format,
            Stills: stills,
            RendererVersion: rendererVersion,
        };
    } finally {
        await staged.Cleanup();
    }
}

/**
 * Executes a `/contact-sheet` job: lays out `req.Stills` into an MJ HTML grid of `data:` images
 * with HTML-escaped labels (`mm:ss.ss`, beat, role, format) and captures each sheet at `t=0` via
 * `backend.CaptureStills`.
 *
 * Layout rules (Step 8):
 * - 1536 px wide
 * - Default columns: 3 for `16:9`, 4 for `1:1`, 5 for `9:16`
 * - Default 12 tiles per sheet (`MaxTilesPerSheet ?? 12`)
 * - Over 4 grid sheets throws `RenderWorkerError('TooManyStills', ...)`
 * - When `IncludeTransitionStrip` is true and `TransitionStart`/`TransitionEnd` pairs exist,
 *   appends one `TransitionStrip` sheet.
 */
export async function RunContactSheetJob(
    req: ContactSheetRequest,
    backend: RenderBackend,
    signal?: AbortSignal,
    options?: RunJobCommonOptions,
): Promise<ContactSheetResult> {
    if (!req || typeof req !== 'object' || !VIDEO_FORMATS.includes(req.Format)) {
        throw new RenderWorkerError('InvalidRequest', 'ContactSheetRequest.Format must be a valid VideoFormat.');
    }
    if (!Array.isArray(req.Stills) || req.Stills.length === 0) {
        throw new RenderWorkerError('InvalidRequest', 'ContactSheetRequest.Stills must be a non-empty array.');
    }

    const columns = req.Columns ?? defaultColumnsForFormat(req.Format);
    const maxTilesPerSheet = req.MaxTilesPerSheet ?? DEFAULT_TILES_PER_SHEET;
    if (
        !Number.isInteger(columns) ||
        columns < 1 ||
        columns > 12 ||
        !Number.isInteger(maxTilesPerSheet) ||
        maxTilesPerSheet < 1
    ) {
        throw new RenderWorkerError('InvalidRequest', 'Invalid Columns or MaxTilesPerSheet.');
    }

    for (const still of req.Stills) {
        if (!still || typeof still !== 'object' || typeof still.Key !== 'string' || !still.Key.trim()) {
            throw new RenderWorkerError('InvalidRequest', 'Each CapturedStill requires a non-empty Key.');
        }
        if (still.MimeType !== 'image/png' && still.MimeType !== 'image/jpeg') {
            throw new RenderWorkerError(
                'InvalidRequest',
                `Still "${still.Key}" has invalid MimeType "${String(still.MimeType)}"; must be "image/png" or "image/jpeg".`,
            );
        }
        ValidateStrictBase64(still.ImageBase64, `Stills[${still.Key}].ImageBase64`, false, 'InvalidRequest');
    }

    const gridChunks = chunkArray(req.Stills, maxTilesPerSheet);
    if (gridChunks.length > MAX_CONTACT_SHEET_GRIDS) {
        throw new RenderWorkerError(
            'TooManyStills',
            `ContactSheetRequest produces ${gridChunks.length} grid sheets, exceeding maximum (${MAX_CONTACT_SHEET_GRIDS}).`,
        );
    }

    const sheets: ContactSheetImage[] = [];
    for (let i = 0; i < gridChunks.length; i++) {
        const chunk = gridChunks[i]!;
        const sheet = await renderContactSheetHtmlToImage(
            {
                Format: req.Format,
                Index: i,
                Kind: 'Grid',
                Columns: columns,
                Stills: chunk,
            },
            backend,
            signal,
            options?.TempRoot,
        );
        sheets.push(sheet);
    }

    if (req.IncludeTransitionStrip) {
        const transitionStills = selectTransitionPairs(req.Stills);
        if (transitionStills.length > 0) {
            const stripSheet = await renderContactSheetHtmlToImage(
                {
                    Format: req.Format,
                    Index: sheets.length,
                    Kind: 'TransitionStrip',
                    Columns: 2,
                    Stills: transitionStills,
                },
                backend,
                signal,
                options?.TempRoot,
            );
            sheets.push(stripSheet);
        }
    }

    return {
        Format: req.Format,
        Sheets: sheets,
    };
}

/**
 * Executes a `/keyframes` job: writes the base64 MP4 to a temp file, probes duration, extracts
 * up to `MaxFrames` (`<= 24`, default `16`) scene-change + uniform-sample keyframes via
 * `backend.ExtractKeyframes`, and optionally builds contact sheets when `BuildContactSheet` is true.
 */
export async function RunKeyframesJob(
    req: KeyframeRequest,
    backend: RenderBackend,
    signal?: AbortSignal,
    options?: RunJobCommonOptions,
): Promise<KeyframeResult> {
    if (!req || typeof req !== 'object' || typeof req.VideoBase64 !== 'string' || !req.VideoBase64.trim()) {
        throw new RenderWorkerError('InvalidRequest', 'KeyframeRequest.VideoBase64 is required.');
    }
    const videoBytes = ValidateStrictBase64(req.VideoBase64, 'KeyframeRequest.VideoBase64', false, 'InvalidRequest');
    const maxFrames = req.MaxFrames ?? 16;
    if (!Number.isInteger(maxFrames) || maxFrames < 1 || maxFrames > 24) {
        throw new RenderWorkerError('InvalidRequest', 'KeyframeRequest.MaxFrames must be an integer in 1..24.');
    }

    const tempBase = options?.TempRoot ?? os.tmpdir();
    await fs.mkdir(tempBase, { recursive: true });
    const tempDir = await fs.mkdtemp(path.join(tempBase, 'mj-video-keyframes-'));
    try {
        const videoPath = path.join(tempDir, 'input.mp4');
        await fs.writeFile(videoPath, videoBytes);

        const probe = await backend.Probe(videoPath);
        const frames = await backend.ExtractKeyframes(
            videoPath,
            path.join(tempDir, 'frames'),
            maxFrames,
            signal,
        );

        let sheets: ContactSheetImage[] | undefined;
        if (req.BuildContactSheet && frames.length > 0) {
            const first = frames[0]!;
            const inferredFormat = inferFormatFromDimensions(first.Width, first.Height);
            const syntheticStills: CapturedStill[] = frames.map((f) => ({
                Key: `kf-${f.Index}`,
                TimestampSeconds: f.TimestampSeconds,
                Role: 'Custom',
                Label: f.Reason,
                MimeType: f.MimeType,
                Width: f.Width,
                Height: f.Height,
                ImageBase64: f.ImageBase64,
            }));
            const sheetRes = await RunContactSheetJob(
                { Format: inferredFormat, Stills: syntheticStills },
                backend,
                signal,
                options,
            );
            sheets = sheetRes.Sheets;
        }

        return {
            DurationSeconds: probe.DurationSeconds,
            Frames: frames,
            ...(sheets ? { Sheets: sheets } : {}),
        };
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
}

/**
 * Queries the render backend health status (`NodeVersion`, `HyperFramesVersion`, `ChromiumVersion`, `FfmpegVersion`).
 */
export async function GetWorkerHealth(backend: RenderBackend): Promise<RenderHealth> {
    try {
        return await backend.Health();
    } catch (error) {
        return {
            Healthy: false,
            NodeVersion: process.version,
            HyperFramesVersion: '',
            Errors: [error instanceof Error ? error.message : String(error)],
        };
    }
}

interface ContactSheetRenderSpec {
    Format: VideoFormat;
    Index: number;
    Kind: 'Grid' | 'TransitionStrip';
    Columns: number;
    Stills: CapturedStill[];
}

async function renderContactSheetHtmlToImage(
    spec: ContactSheetRenderSpec,
    backend: RenderBackend,
    signal?: AbortSignal,
    tempRoot?: string,
): Promise<ContactSheetImage> {
    const { width, height } = computeContactSheetDimensions(spec.Format, spec.Columns, spec.Stills.length);
    const html = buildContactSheetHtml(spec, width, height);

    const syntheticBundle: RenderProjectBundle = {
        Format: '16:9',
        EntryFile: 'index.html',
        Files: [{ Path: 'index.html', Content: html }],
        Assets: [],
        DataSnapshot: {},
        Seed: 1,
    };

    const staged = await StageRenderBundle(syntheticBundle, {
        TempRoot: tempRoot,
        Geometry: { Width: width, Height: height, Fps: 30, DurationSeconds: 1 },
    });
    try {
        const buffers = await backend.CaptureStills(
            {
                RootDir: staged.RootDir,
                EntryFile: 'index.html',
                Width: width,
                Height: height,
                Fps: 30,
                TimestampsSeconds: [0],
                ImageFormat: 'png',
            },
            signal,
        );
        const pngBytes = buffers[0] ?? new Uint8Array();
        return {
            Index: spec.Index,
            Kind: spec.Kind,
            MimeType: 'image/png',
            Width: width,
            Height: height,
            StillKeys: spec.Stills.map((s) => s.Key),
            ImageBase64: Buffer.from(pngBytes).toString('base64'),
        };
    } finally {
        await staged.Cleanup();
    }
}

function computeContactSheetDimensions(
    format: VideoFormat,
    columns: number,
    stillCount: number,
): { width: number; height: number } {
    const width = CONTACT_SHEET_WIDTH;
    const rows = Math.max(1, Math.ceil(stillCount / columns));
    const tileWidth = Math.floor((width - (columns + 1) * 16) / columns);
    const aspect = format === '9:16' ? 9 / 16 : format === '1:1' ? 1 : 16 / 9;
    const tileImageHeight = Math.round(tileWidth / aspect);
    const tileTotalHeight = tileImageHeight + 44;
    const height = Math.max(256, rows * tileTotalHeight + (rows + 1) * 16 + 48);
    return { width, height };
}

function buildContactSheetHtml(spec: ContactSheetRenderSpec, width: number, height: number): string {
    const tilesHtml = spec.Stills.map((still) => {
        const timeStr = formatTimestampMmSs(still.TimestampSeconds);
        const beatPart = still.BeatKey ? ` | beat:${escapeHtml(still.BeatKey)}` : '';
        const rolePart = ` | ${escapeHtml(still.Role)}`;
        const labelPart = still.Label ? ` | ${escapeHtml(still.Label)}` : '';
        const caption = `${escapeHtml(timeStr)}${beatPart}${rolePart} | ${escapeHtml(spec.Format)}${labelPart}`;
        const dataUri = `data:${still.MimeType};base64,${still.ImageBase64}`;
        return [
            `<div class="tile" data-still-key="${escapeHtml(still.Key)}">`,
            `  <img src="${dataUri}" alt="${escapeHtml(still.Key)}" />`,
            `  <div class="caption">${caption}</div>`,
            `</div>`,
        ].join('\n');
    }).join('\n');

    return [
        '<!doctype html>',
        '<html>',
        '<head>',
        '<meta charset="utf-8" />',
        '<style>',
        `  * { box-sizing: border-box; margin: 0; padding: 0; }`,
        `  body { width: ${width}px; height: ${height}px; background: #0f172a; color: #f8fafc; font-family: 'MJ Sans'; padding: 16px; }`,
        `  .header { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #94a3b8; }`,
        `  .grid { display: grid; grid-template-columns: repeat(${spec.Columns}, 1fr); gap: 16px; }`,
        `  .tile { background: #1e293b; border: 1px solid #334155; border-radius: 6px; overflow: hidden; }`,
        `  .tile img { display: block; width: 100%; height: auto; }`,
        `  .caption { padding: 8px 10px; font-size: 12px; line-height: 1.3; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`,
        '</style>',
        '</head>',
        '<body>',
        `  <div id="root" data-composition-id="contact-sheet" data-duration="1" data-fps="30" data-width="${width}" data-height="${height}" data-no-timeline>`,
        `    <div class="header">${escapeHtml(spec.Kind)} #${spec.Index + 1} (${escapeHtml(spec.Format)})</div>`,
        `    <div class="grid">${tilesHtml}</div>`,
        '  </div>',
        '</body>',
        '</html>',
    ].join('\n');
}

function selectTransitionPairs(stills: readonly CapturedStill[]): CapturedStill[] {
    const result: CapturedStill[] = [];
    for (let i = 0; i < stills.length; i++) {
        const current = stills[i]!;
        if (current.Role === 'TransitionStart' || current.Role === 'TransitionEnd') {
            result.push(current);
        }
    }
    return result;
}

function defaultColumnsForFormat(format: VideoFormat): number {
    switch (format) {
        case '9:16':
            return 5;
        case '1:1':
            return 4;
        case '16:9':
        default:
            return 3;
    }
}

function inferFormatFromDimensions(width: number, height: number): VideoFormat {
    if (height > width * 1.2) {
        return '9:16';
    }
    if (Math.abs(width - height) <= Math.max(width, height) * 0.1) {
        return '1:1';
    }
    return '16:9';
}

function formatTimestampMmSs(seconds: number): string {
    const safe = Math.max(0, seconds);
    const mins = Math.floor(safe / 60);
    const secs = safe - mins * 60;
    return `${String(mins).padStart(2, '0')}:${secs.toFixed(2).padStart(5, '0')}`;
}

/**
 * Escapes HTML special characters (`&`, `<`, `>`, `"`, `'`) in contact sheet labels.
 */
export function EscapeHtmlForLabel(text: string): string {
    return escapeHtml(text);
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function chunkArray<T>(items: readonly T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        chunks.push(items.slice(i, i + chunkSize));
    }
    return chunks;
}
