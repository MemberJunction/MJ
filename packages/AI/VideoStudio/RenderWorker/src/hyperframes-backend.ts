import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as fssync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import {
    captureFrameToBuffer,
    closeCaptureSession,
    createCaptureSession,
    drainBrowserPool,
    extractMediaMetadata,
    getFfmpegBinary,
    getFfprobeBinary,
    initializeSession,
    resolveHeadlessShellPath,
    runFfmpeg,
} from '@hyperframes/engine';
import {
    lintMediaUrls,
    lintProject,
    shouldBlockRender,
    type HyperframeLintFinding,
} from '@hyperframes/lint';
import {
    createFileServer,
    createRenderJob,
    executeRenderJob,
    RenderCancelledError,
    type RenderJob,
} from '@hyperframes/producer';
import type {
    CheckIssue,
    CheckIssueCategory,
    ExtractedKeyframe,
    RenderHealth,
    RenderProgress,
    RenderProgressPhase,
} from '@memberjunction/video-studio-core';
import {
    PINNED_HYPERFRAMES_VERSION,
    RenderWorkerError,
    type BackendProbeResult,
    type BackendRenderJob,
    type BackendStillsJob,
    type RenderBackend,
} from './backend.js';

const execFileAsync = promisify(execFile);

/**
 * Production `RenderBackend` backed by `@hyperframes/producer`, `@hyperframes/engine`,
 * `@hyperframes/lint`, headless Chromium, and `ffmpeg` / `ffprobe`.
 *
 * This is the ONLY module in `@memberjunction/video-studio-render-worker` that imports
 * `@hyperframes/*` or spawns `ffmpeg` / `ffprobe`.
 */
export class HyperFramesRenderBackend implements RenderBackend {
    public async Lint(dir: string, entry: string): Promise<{ Issues: CheckIssue[]; Block: boolean }> {
        const explicitEntry = entry === 'index.html' ? undefined : path.join(dir, entry);
        const report = await lintProject(dir, explicitEntry, { host: 'cli' });

        const entryFullPath = path.join(dir, entry);
        const entryHtml = await fs.readFile(entryFullPath, 'utf8');
        const mediaDiags = await lintMediaUrls(entryHtml, { timeoutMs: 250 });

        const projectFindings = report.results.flatMap((r) => r.result.findings);
        const allDiags: HyperframeLintFinding[] = [...projectFindings, ...mediaDiags];
        const issues = allDiags
            .filter((diag) => diag.severity === 'error' || diag.severity === 'warning')
            .map((diag) => mapLintFindingToCheckIssue(diag, entry));
        const errorCount = issues.filter((i) => i.Severity === 'Error').length;
        const warningCount = issues.filter((i) => i.Severity === 'Warning').length;
        const block = shouldBlockRender(true, false, errorCount, warningCount);

        return { Issues: issues, Block: block };
    }

    public async Render(
        job: BackendRenderJob,
        onProgress: (progress: RenderProgress) => void,
        signal?: AbortSignal,
    ): Promise<{ OutputPath: string; FrameCount: number }> {
        throwIfAborted(signal);
        ensureBrowserBinaryEnv();

        const rawOutputPath = path.join(job.RootDir, 'hf-raw-output.mp4');
        const finalOutputPath = path.join(job.RootDir, 'output.mp4');
        const startMs = Date.now();

        const hfJob = createRenderJob({
            entryFile: job.EntryFile,
            fps: job.Fps,
            quality: job.Quality ?? 'standard',
            format: 'mp4',
            workers: 1,
        });

        try {
            await executeRenderJob(
                hfJob,
                job.RootDir,
                rawOutputPath,
                (updatedJob: RenderJob) => {
                    onProgress(mapHyperFramesProgress(updatedJob, startMs));
                },
                signal,
            );
        } catch (error) {
            if (error instanceof RenderCancelledError || signal?.aborted) {
                throw new RenderWorkerError('Cancelled', 'Render job was cancelled.');
            }
            throw error;
        }

        throwIfAborted(signal);
        await ensureFaststartMp4(rawOutputPath, finalOutputPath, signal);

        const totalFrames =
            hfJob.totalFrames && hfJob.totalFrames > 0
                ? hfJob.totalFrames
                : Math.max(1, Math.round((job.DurationSeconds ?? 1) * job.Fps));

        return { OutputPath: finalOutputPath, FrameCount: totalFrames };
    }

    public async CaptureStills(job: BackendStillsJob, signal?: AbortSignal): Promise<Uint8Array[]> {
        throwIfAborted(signal);
        const browserBinary = ensureBrowserBinaryEnv();
        const fpsInt = Math.max(1, Math.round(job.Fps));

        if (job.EntryFile !== 'index.html') {
            const indexTarget = path.join(job.RootDir, 'index.html');
            if (!fssync.existsSync(indexTarget)) {
                await fs.copyFile(path.join(job.RootDir, job.EntryFile), indexTarget);
            }
        }

        const server = await createFileServer({
            projectDir: job.RootDir,
            fps: { num: fpsInt, den: 1 },
            stripEmbeddedRuntime: false,
        });

        const sessionDir = await fs.mkdtemp(path.join(job.RootDir, 'stills-session-'));
        const session = await createCaptureSession(
            server.url,
            sessionDir,
            {
                width: job.Width,
                height: job.Height,
                fps: { num: fpsInt, den: 1 },
                format: job.ImageFormat,
                quality: job.JpegQuality ?? 90,
            },
            null,
            { chromePath: browserBinary, forceScreenshot: true },
        );

        try {
            await initializeSession(session);
            const buffers: Uint8Array[] = [];
            for (const timestamp of job.TimestampsSeconds) {
                throwIfAborted(signal);
                const safeTime = Math.max(0, timestamp);
                const frameIndex = Math.max(0, Math.round(safeTime * fpsInt));
                const captured = await captureFrameToBuffer(session, frameIndex, safeTime);
                buffers.push(new Uint8Array(captured.buffer));
            }
            return buffers;
        } finally {
            await closeCaptureSession(session).catch(() => undefined);
            await Promise.resolve(server.close()).catch(() => undefined);
            await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => undefined);
        }
    }

    public async Probe(videoPath: string): Promise<BackendProbeResult> {
        const ffprobeBin = await resolveFfprobeBinary();
        try {
            const { stdout } = await execFileAsync(ffprobeBin, [
                '-v',
                'quiet',
                '-print_format',
                'json',
                '-show_format',
                '-show_streams',
                videoPath,
            ]);
            return parseFfprobeJson(stdout);
        } catch {
            const meta = await extractMediaMetadata(videoPath);
            return {
                DurationSeconds: meta.durationSeconds ?? 0,
                HasAudio: Boolean(meta.hasAudio),
                Width: meta.width ?? 0,
                Height: meta.height ?? 0,
            };
        }
    }

    public async ExtractKeyframes(
        videoPath: string,
        outDir: string,
        max: number,
        signal?: AbortSignal,
    ): Promise<ExtractedKeyframe[]> {
        throwIfAborted(signal);
        await fs.mkdir(outDir, { recursive: true });

        const probe = await this.Probe(videoPath);
        const duration = Math.max(0.1, probe.DurationSeconds || 1);
        const width = probe.Width || 1280;
        const height = probe.Height || 720;
        const maxFrames = Math.max(1, Math.min(max, 24));

        const sceneTimestamps = await detectSceneChangeTimestamps(videoPath, duration, signal);
        const plan = buildKeyframeTimestampPlan(sceneTimestamps, duration, maxFrames);

        const extracted: ExtractedKeyframe[] = [];
        for (let i = 0; i < plan.length; i++) {
            throwIfAborted(signal);
            const item = plan[i]!;
            const framePath = path.join(outDir, `keyframe-${String(i).padStart(3, '0')}.png`);
            await extractSinglePngFrame(videoPath, item.TimestampSeconds, framePath, signal);
            const bytes = await fs.readFile(framePath);
            extracted.push({
                Index: i,
                TimestampSeconds: Number(item.TimestampSeconds.toFixed(3)),
                Reason: item.Reason,
                MimeType: 'image/png',
                Width: width,
                Height: height,
                ImageBase64: bytes.toString('base64'),
            });
        }
        return extracted;
    }

    public async Health(): Promise<RenderHealth> {
        const errors: string[] = [];
        let chromiumVersion: string | undefined;
        let ffmpegVersion: string | undefined;

        try {
            const browserBin = resolveBrowserBinary();
            if (!browserBin) {
                errors.push('Chromium headless shell binary was not found.');
            } else {
                chromiumVersion = await probeBinaryFirstLine(browserBin, ['--version']);
            }
        } catch (error) {
            errors.push(`Chromium check failed: ${error instanceof Error ? error.message : String(error)}`);
        }

        try {
            const ffmpegBin = await getFfmpegBinary();
            ffmpegVersion = await probeBinaryFirstLine(ffmpegBin, ['-version']);
        } catch (error) {
            errors.push(`ffmpeg check failed: ${error instanceof Error ? error.message : String(error)}`);
        }

        return {
            Healthy: errors.length === 0,
            NodeVersion: process.version,
            HyperFramesVersion: PINNED_HYPERFRAMES_VERSION,
            ChromiumVersion: chromiumVersion,
            FfmpegVersion: ffmpegVersion,
            Errors: errors,
        };
    }

    /**
     * Drains the shared HyperFrames browser pool on worker shutdown.
     */
    public async Shutdown(): Promise<void> {
        await drainBrowserPool().catch(() => undefined);
    }
}

function mapLintFindingToCheckIssue(diag: HyperframeLintFinding, defaultFile: string): CheckIssue {
    return {
        Code: diag.code,
        Category: mapLintCategory(diag.code),
        Severity: diag.severity === 'error' ? 'Error' : 'Warning',
        Message: diag.message,
        File: diag.file ?? defaultFile,
        Line: diag.line ?? undefined,
    };
}

function mapLintCategory(code: string): CheckIssueCategory {
    const lower = code.toLowerCase();
    if (lower.includes('url') || lower.includes('network') || lower.includes('remote')) {
        return 'RemoteUrl';
    }
    if (lower.includes('asset') || lower.includes('missing') || lower.includes('file')) {
        return 'MissingAsset';
    }
    if (lower.includes('audio')) {
        return 'Audio';
    }
    return 'Lint';
}

function mapHyperFramesProgress(job: RenderJob, startMs: number): RenderProgress {
    let phase: RenderProgressPhase = 'Rendering';
    if (job.status === 'queued' || job.status === 'preprocessing') {
        phase = 'Launching';
    } else if (job.status === 'encoding' || job.status === 'assembling') {
        phase = 'Encoding';
    } else if (job.status === 'complete') {
        phase = 'Complete';
    }

    const total = Math.max(1, job.totalFrames ?? 1);
    const rendered = Math.min(total, Math.max(0, job.framesRendered ?? 0));
    const percent = Math.min(100, Math.max(0, Math.round(job.progress || (rendered / total) * 100)));

    return {
        Phase: phase,
        RenderedFrames: rendered,
        TotalFrames: total,
        Percent: percent,
        ElapsedMs: Math.max(0, Date.now() - startMs),
    };
}

async function ensureFaststartMp4(
    rawPath: string,
    finalPath: string,
    signal?: AbortSignal,
): Promise<void> {
    const res = await runFfmpeg(
        [
            '-y',
            '-i',
            rawPath,
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-movflags',
            '+faststart',
            finalPath,
        ],
        { signal },
    );
    if (!res.success) {
        if (signal?.aborted) {
            throw new RenderWorkerError('Cancelled', 'Render job was cancelled.');
        }
        throw res.error ?? new Error(`ffmpeg faststart failed: ${res.stderr}`);
    }
}

function parseFfprobeJson(stdout: string): BackendProbeResult {
    const parsed = JSON.parse(stdout) as {
        format?: { duration?: string };
        streams?: Array<{
            codec_type?: string;
            width?: number;
            height?: number;
            duration?: string;
        }>;
    };
    const streams = parsed.streams ?? [];
    const videoStream = streams.find((s) => s.codec_type === 'video');
    const audioStream = streams.find((s) => s.codec_type === 'audio');
    const formatDuration = Number.parseFloat(parsed.format?.duration ?? '0');
    const streamDuration = Number.parseFloat(videoStream?.duration ?? '0');
    const durationSeconds =
        Number.isFinite(formatDuration) && formatDuration > 0
            ? formatDuration
            : Number.isFinite(streamDuration) && streamDuration > 0
              ? streamDuration
              : 0;

    return {
        DurationSeconds: durationSeconds,
        HasAudio: Boolean(audioStream),
        Width: videoStream?.width ?? 0,
        Height: videoStream?.height ?? 0,
    };
}

async function detectSceneChangeTimestamps(
    videoPath: string,
    durationSeconds: number,
    signal?: AbortSignal,
): Promise<number[]> {
    try {
        const ffmpegBin = await getFfmpegBinary();
        const { stderr } = await execFileAsync(
            ffmpegBin,
            [
                '-hide_banner',
                '-i',
                videoPath,
                '-vf',
                "select='gt(scene,0.25)',showinfo",
                '-f',
                'null',
                '-',
            ],
            { signal },
        );
        const matches = [...stderr.matchAll(/pts_time:\s*([0-9.]+)/g)];
        return matches
            .map((m) => Number.parseFloat(m[1] ?? '0'))
            .filter((t) => Number.isFinite(t) && t >= 0 && t < durationSeconds);
    } catch (error) {
        if (signal?.aborted) {
            throw new RenderWorkerError('Cancelled', 'Keyframe extraction was cancelled.');
        }
        return [];
    }
}

function buildKeyframeTimestampPlan(
    sceneTimes: number[],
    durationSeconds: number,
    maxFrames: number,
): Array<{ TimestampSeconds: number; Reason: 'SceneChange' | 'UniformSample' }> {
    const chosen: Array<{ TimestampSeconds: number; Reason: 'SceneChange' | 'UniformSample' }> = [];
    const minGap = Math.min(0.15, durationSeconds / (maxFrames * 2));

    const addIfDistinct = (t: number, reason: 'SceneChange' | 'UniformSample'): void => {
        const clamped = Math.max(0, Math.min(Math.max(0, durationSeconds - 0.05), t));
        if (chosen.some((existing) => Math.abs(existing.TimestampSeconds - clamped) < minGap)) {
            return;
        }
        chosen.push({ TimestampSeconds: clamped, Reason: reason });
    };

    for (const sceneTime of sceneTimes) {
        if (chosen.length >= maxFrames) {
            break;
        }
        addIfDistinct(sceneTime, 'SceneChange');
    }

    const uniformCount = Math.max(1, maxFrames);
    for (let i = 0; i < uniformCount && chosen.length < maxFrames; i++) {
        const fraction = uniformCount === 1 ? 0.5 : (i + 0.5) / uniformCount;
        addIfDistinct(fraction * durationSeconds, 'UniformSample');
    }

    if (chosen.length === 0) {
        chosen.push({ TimestampSeconds: 0, Reason: 'UniformSample' });
    }

    return chosen.sort((a, b) => a.TimestampSeconds - b.TimestampSeconds).slice(0, maxFrames);
}

async function extractSinglePngFrame(
    videoPath: string,
    timestampSeconds: number,
    outputPath: string,
    signal?: AbortSignal,
): Promise<void> {
    const res = await runFfmpeg(
        [
            '-y',
            '-ss',
            timestampSeconds.toFixed(3),
            '-i',
            videoPath,
            '-frames:v',
            '1',
            '-f',
            'image2',
            outputPath,
        ],
        { signal },
    );
    if (!res.success) {
        if (signal?.aborted) {
            throw new RenderWorkerError('Cancelled', 'Keyframe extraction was cancelled.');
        }
        throw res.error ?? new Error(`ffmpeg frame extract failed: ${res.stderr}`);
    }
}

function ensureBrowserBinaryEnv(): string {
    const resolved = resolveBrowserBinary();
    if (!resolved) {
        throw new RenderWorkerError(
            'DependencyMissing',
            'Chromium headless shell binary was not found. Run `pnpm run browser:install` or set CHROME_PATH.',
        );
    }
    if (!process.env.CHROME_PATH) {
        process.env.CHROME_PATH = resolved;
    }
    if (!process.env.PUPPETEER_EXECUTABLE_PATH) {
        process.env.PUPPETEER_EXECUTABLE_PATH = resolved;
    }
    return resolved;
}

function resolveBrowserBinary(): string | undefined {
    const envCandidates = [process.env.CHROME_PATH, process.env.PUPPETEER_EXECUTABLE_PATH];
    for (const candidate of envCandidates) {
        if (candidate && fssync.existsSync(candidate)) {
            return candidate;
        }
    }

    const fromEngine = resolveHeadlessShellPath();
    if (fromEngine && fssync.existsSync(fromEngine)) {
        return fromEngine;
    }

    const systemCandidates = [
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome-stable',
    ];
    for (const candidate of systemCandidates) {
        if (fssync.existsSync(candidate)) {
            return candidate;
        }
    }

    const puppeteerCache = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome-headless-shell');
    return findFileRecursive(puppeteerCache, 'chrome-headless-shell');
}

function findFileRecursive(dir: string, targetName: string): string | undefined {
    if (!fssync.existsSync(dir)) {
        return undefined;
    }
    try {
        const entries = fssync.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isFile() && entry.name === targetName) {
                return fullPath;
            }
            if (entry.isDirectory()) {
                const nested = findFileRecursive(fullPath, targetName);
                if (nested) {
                    return nested;
                }
            }
        }
    } catch {
        return undefined;
    }
    return undefined;
}

async function resolveFfprobeBinary(): Promise<string> {
    try {
        return await getFfprobeBinary();
    } catch {
        return 'ffprobe';
    }
}

async function probeBinaryFirstLine(bin: string, args: string[]): Promise<string> {
    const { stdout, stderr } = await execFileAsync(bin, args, { timeout: 5000 });
    const combined = `${stdout}\n${stderr}`.trim();
    const firstLine = combined.split(/\r?\n/)[0]?.trim();
    return firstLine || path.basename(bin);
}

function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw new RenderWorkerError('Cancelled', 'Render job was cancelled.');
    }
}
