import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
    CheckRequest,
    ContactSheetRequest,
    KeyframeRequest,
    RenderRequest,
    RenderResultMetadata,
    RenderStreamEvent,
    StillsRequest,
} from '@memberjunction/video-studio-core';
import { RenderWorkerError, type RenderBackend } from './backend.js';
import {
    GetWorkerHealth,
    RunCheckJob,
    RunContactSheetJob,
    RunKeyframesJob,
    RunRenderJob,
    RunStillsJob,
} from './jobs.js';

/** Supported operation names for `main.js run <op>`. */
export const ONE_SHOT_OPERATIONS = [
    'render',
    'stills',
    'contact-sheet',
    'check',
    'keyframes',
    'health',
] as const;

/** Union of valid one-shot CLI operation names. */
export type OneShotOperation = (typeof ONE_SHOT_OPERATIONS)[number];

/** Usage message written to stderr when CLI arguments are invalid (exit code 2). */
export const ONE_SHOT_USAGE =
    'Usage: main.js run <render|stills|contact-sheet|check|keyframes|health> --request <file> --out <dir>\n';

/**
 * Optional configuration for `RunOneShot`.
 */
export interface RunOneShotOptions {
    /** Optional stderr writer for usage messages (defaults to `process.stderr`). */
    Stderr?: { write(chunk: string): unknown };
    /**
     * Optional readable stdin stream. When this pipe emits `end` or `close` while the
     * operation is in flight, the job's `AbortSignal` is triggered immediately.
     */
    Stdin?: NodeJS.ReadableStream;
    /** Optional external cancellation signal. */
    Signal?: AbortSignal;
    /** Optional temporary directory root forwarded to `Run*Job`. */
    TempRoot?: string;
}

interface ParsedOneShotArgs {
    Operation: OneShotOperation;
    RequestPath?: string;
    OutDir: string;
}

/**
 * Executes a single render-worker operation from files on disk (`--request <file> --out <dir>`),
 * streaming `RenderStreamEvent` `Progress` JSON lines to `stdout` for `render`, writing the
 * operation output to `<out>/result.json` (plus `<out>/video.mp4` for `render`), or writing
 * `<out>/error.json` (`RenderWorkerErrorBody`) on failure.
 *
 * @returns Exit code: `0` on success, `1` on job/runtime failure, `2` on invalid CLI arguments.
 */
export async function RunOneShot(
    argv: readonly string[],
    backend: RenderBackend,
    stdout: { write(chunk: string): unknown } = process.stdout,
    options: RunOneShotOptions = {},
): Promise<number> {
    const stderr = options.Stderr ?? process.stderr;
    const parsedArgs = parseOneShotArgs(argv);
    if (!parsedArgs) {
        stderr.write(ONE_SHOT_USAGE);
        return 2;
    }

    const { Operation: op, RequestPath: requestPath, OutDir: outDir } = parsedArgs;
    try {
        await fs.mkdir(outDir, { recursive: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stderr.write(`Failed to create output directory "${outDir}": ${message}\n`);
        return 1;
    }

    const controller = new AbortController();
    const onExternalAbort = (): void => {
        controller.abort(options.Signal?.reason);
    };
    if (options.Signal) {
        if (options.Signal.aborted) {
            controller.abort(options.Signal.reason);
        } else {
            options.Signal.addEventListener('abort', onExternalAbort, { once: true });
        }
    }

    const onStdinClosed = (): void => {
        if (!controller.signal.aborted) {
            controller.abort(
                new RenderWorkerError('Cancelled', 'One-shot worker stdin pipe closed.'),
            );
        }
    };
    if (options.Stdin) {
        options.Stdin.once('end', onStdinClosed);
        options.Stdin.once('close', onStdinClosed);
        options.Stdin.resume();
    }

    try {
        throwIfAborted(controller.signal);

        if (op === 'health') {
            if (requestPath !== undefined) {
                await readRequestJson(requestPath);
            }
            throwIfAborted(controller.signal);
            const health = await GetWorkerHealth(backend);
            throwIfAborted(controller.signal);
            await writeJsonFile(path.join(outDir, 'result.json'), health);
            return 0;
        }

        const rawRequest = await readRequestJson(requestPath!);
        throwIfAborted(controller.signal);

        switch (op) {
            case 'render': {
                const renderResult = await RunRenderJob(
                    rawRequest as RenderRequest,
                    backend,
                    (progress) => {
                        const event: RenderStreamEvent = { Type: 'Progress', Progress: progress };
                        stdout.write(`${JSON.stringify(event)}\n`);
                    },
                    controller.signal,
                    { TempRoot: options.TempRoot },
                );
                const videoFilename = 'video.mp4';
                await fs.writeFile(path.join(outDir, videoFilename), renderResult.Video);
                const metadata: RenderResultMetadata = {
                    Format: renderResult.Format,
                    VideoID: videoFilename,
                    VideoSizeBytes: renderResult.Video.byteLength,
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
                await writeJsonFile(path.join(outDir, 'result.json'), metadata);
                return 0;
            }
            case 'stills': {
                const stillsResult = await RunStillsJob(
                    rawRequest as StillsRequest,
                    backend,
                    controller.signal,
                    { TempRoot: options.TempRoot },
                );
                await writeJsonFile(path.join(outDir, 'result.json'), stillsResult);
                return 0;
            }
            case 'contact-sheet': {
                const contactSheetResult = await RunContactSheetJob(
                    rawRequest as ContactSheetRequest,
                    backend,
                    controller.signal,
                    { TempRoot: options.TempRoot },
                );
                await writeJsonFile(path.join(outDir, 'result.json'), contactSheetResult);
                return 0;
            }
            case 'check': {
                const checkResult = await RunCheckJob(
                    rawRequest as CheckRequest,
                    backend,
                    controller.signal,
                    { TempRoot: options.TempRoot },
                );
                await writeJsonFile(path.join(outDir, 'result.json'), checkResult);
                return 0;
            }
            case 'keyframes': {
                const keyframeResult = await RunKeyframesJob(
                    rawRequest as KeyframeRequest,
                    backend,
                    controller.signal,
                    { TempRoot: options.TempRoot },
                );
                await writeJsonFile(path.join(outDir, 'result.json'), keyframeResult);
                return 0;
            }
        }
    } catch (error) {
        const workerError = toRenderWorkerError(error, controller.signal);
        await writeJsonFile(path.join(outDir, 'error.json'), workerError.ToBody()).catch(
            () => undefined,
        );
        return 1;
    } finally {
        if (options.Signal) {
            options.Signal.removeEventListener('abort', onExternalAbort);
        }
        if (options.Stdin) {
            options.Stdin.removeListener('end', onStdinClosed);
            options.Stdin.removeListener('close', onStdinClosed);
        }
    }
}

function parseOneShotArgs(argv: readonly string[]): ParsedOneShotArgs | null {
    const tokens = argv[0] === 'run' ? argv.slice(1) : argv;
    if (tokens.length === 0) {
        return null;
    }

    const opCandidate = tokens[0];
    if (!isOneShotOperation(opCandidate)) {
        return null;
    }

    let requestPath: string | undefined;
    let outDir: string | undefined;

    let i = 1;
    while (i < tokens.length) {
        const flag = tokens[i];
        const value = tokens[i + 1];
        if (flag === '--request') {
            if (!value || value.startsWith('--') || requestPath !== undefined) {
                return null;
            }
            requestPath = value;
            i += 2;
        } else if (flag === '--out') {
            if (!value || value.startsWith('--') || outDir !== undefined) {
                return null;
            }
            outDir = value;
            i += 2;
        } else {
            return null;
        }
    }

    if (!outDir || outDir.trim().length === 0) {
        return null;
    }
    if (opCandidate !== 'health' && (!requestPath || requestPath.trim().length === 0)) {
        return null;
    }

    return {
        Operation: opCandidate,
        RequestPath: requestPath,
        OutDir: outDir,
    };
}

function isOneShotOperation(value: string | undefined): value is OneShotOperation {
    return (
        value !== undefined &&
        (ONE_SHOT_OPERATIONS as readonly string[]).includes(value)
    );
}

async function readRequestJson(requestPath: string): Promise<unknown> {
    let raw: string;
    try {
        raw = await fs.readFile(requestPath, 'utf8');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new RenderWorkerError(
            'InvalidRequest',
            `Unable to read request file "${requestPath}": ${message}`,
        );
    }

    try {
        return JSON.parse(raw) as unknown;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new RenderWorkerError(
            'InvalidRequest',
            `Invalid JSON in request file "${requestPath}": ${message}`,
        );
    }
}

async function writeJsonFile(filePath: string, payload: unknown): Promise<void> {
    await fs.writeFile(filePath, JSON.stringify(payload), 'utf8');
}

function throwIfAborted(signal: AbortSignal): void {
    if (!signal.aborted) {
        return;
    }
    if (signal.reason instanceof RenderWorkerError) {
        throw signal.reason;
    }
    throw new RenderWorkerError('Cancelled', 'One-shot worker operation was cancelled.');
}

function toRenderWorkerError(error: unknown, signal: AbortSignal): RenderWorkerError {
    if (error instanceof RenderWorkerError) {
        return error;
    }
    if (signal.aborted) {
        if (signal.reason instanceof RenderWorkerError) {
            return signal.reason;
        }
        return new RenderWorkerError(
            'Cancelled',
            error instanceof Error ? error.message : 'One-shot worker operation was cancelled.',
        );
    }
    return new RenderWorkerError(
        'Internal',
        error instanceof Error ? error.message : String(error),
    );
}
