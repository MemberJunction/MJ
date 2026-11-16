#!/usr/bin/env node
import * as fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { format as formatUtil } from 'node:util';
import {
    RENDER_WORKER_ENV,
    RENDER_WORKER_PORT_PREFIX,
} from '@memberjunction/video-studio-core';
import type { RenderBackend } from './backend.js';
import { HyperFramesRenderBackend } from './hyperframes-backend.js';
import {
    CreateRenderWorkerServer,
    DEFAULT_CONCURRENCY,
    DEFAULT_HOST,
    DEFAULT_MAX_BODY_BYTES,
    DEFAULT_MAX_BODY_MB,
    DEFAULT_MAX_TIMEOUT_MS,
    DEFAULT_PORT,
    type RenderWorkerServer,
} from './server.js';
import { RunOneShot } from './one-shot.js';

/**
 * Parsed runtime configuration derived from `RENDER_WORKER_ENV` environment variables.
 */
export interface RenderWorkerMainConfig {
    Host: string;
    Port: number;
    Token?: string;
    MaxBodyBytes: number;
    Concurrency: number;
    MaxTimeoutMs: number;
    AllowRoot: boolean;
}

/**
 * Options for `StartRenderWorkerFromEnv`.
 */
export interface StartRenderWorkerOptions {
    /** Environment map (defaults to `process.env`). */
    Env?: NodeJS.ProcessEnv;
    /** Optional backend override (defaults to `new HyperFramesRenderBackend()`). */
    Backend?: RenderBackend;
    /** Optional effective UID override for unit testing root rejection. */
    EffectiveUid?: number;
    /** Optional stdout line writer (defaults to `(line) => process.stdout.write(line + '\n')`). */
    WriteStdoutLine?: (line: string) => void;
}

/**
 * Parses `RENDER_WORKER_ENV` environment variables into a validated `RenderWorkerMainConfig`.
 */
export function ParseRenderWorkerEnv(env: NodeJS.ProcessEnv = process.env): RenderWorkerMainConfig {
    const host = env[RENDER_WORKER_ENV.Host]?.trim() || DEFAULT_HOST;
    const rawPort = env[RENDER_WORKER_ENV.Port]?.trim();
    const port =
        rawPort !== undefined && rawPort !== '' ? Number.parseInt(rawPort, 10) : DEFAULT_PORT;

    const token = env[RENDER_WORKER_ENV.Token]?.trim() || undefined;
    const rawMaxBodyMb = env[RENDER_WORKER_ENV.MaxBodyMb]?.trim();
    const maxBodyMb =
        rawMaxBodyMb !== undefined && rawMaxBodyMb !== ''
            ? Number.parseFloat(rawMaxBodyMb)
            : DEFAULT_MAX_BODY_MB;
    const maxBodyBytes =
        Number.isFinite(maxBodyMb) && maxBodyMb > 0
            ? Math.round(maxBodyMb * 1024 * 1024)
            : DEFAULT_MAX_BODY_BYTES;

    const rawConcurrency = env[RENDER_WORKER_ENV.Concurrency]?.trim();
    const concurrency =
        rawConcurrency !== undefined && rawConcurrency !== ''
            ? Math.max(1, Number.parseInt(rawConcurrency, 10) || DEFAULT_CONCURRENCY)
            : DEFAULT_CONCURRENCY;

    const rawTimeout = env[RENDER_WORKER_ENV.MaxTimeoutMs]?.trim();
    const maxTimeoutMs =
        rawTimeout !== undefined && rawTimeout !== ''
            ? Math.max(50, Number.parseInt(rawTimeout, 10) || DEFAULT_MAX_TIMEOUT_MS)
            : DEFAULT_MAX_TIMEOUT_MS;

    const rawAllowRoot = env[RENDER_WORKER_ENV.AllowRoot]?.trim().toLowerCase();
    const allowRoot = rawAllowRoot === '1' || rawAllowRoot === 'true';

    return {
        Host: host,
        Port: Number.isFinite(port) && port >= 0 ? port : DEFAULT_PORT,
        Token: token,
        MaxBodyBytes: maxBodyBytes,
        Concurrency: concurrency,
        MaxTimeoutMs: maxTimeoutMs,
        AllowRoot: allowRoot,
    };
}

/**
 * Validates that the worker is not running as root (`uid === 0`) unless `AllowRoot` is enabled.
 */
export function AssertNonRootUser(allowRoot: boolean, effectiveUid?: number): void {
    const uid =
        effectiveUid !== undefined
            ? effectiveUid
            : typeof process.getuid === 'function'
              ? process.getuid()
              : 10001;
    if (uid === 0 && !allowRoot) {
        throw new Error(
            `Refusing to start render worker as root (uid=0). Set ${RENDER_WORKER_ENV.AllowRoot}=1 only in trusted test environments.`,
        );
    }
}

/**
 * Redirects `console.log` and `console.info` to `process.stderr` so third-party libraries
 * cannot pollute stdout after the `VIDEO_STUDIO_RENDER_WORKER_PORT=<port>` handshake line.
 */
export function RedirectConsoleStdoutToStderr(): void {
    const writeStderr = (...args: unknown[]): void => {
        process.stderr.write(`${formatUtil(...args)}\n`);
    };
    console.log = writeStderr;
    console.info = writeStderr;
}

/**
 * Starts the HTTP render worker using `RENDER_WORKER_ENV`, writes
 * `VIDEO_STUDIO_RENDER_WORKER_PORT=<port>` to stdout once listening, and returns the server handle.
 */
export async function StartRenderWorkerFromEnv(
    options: StartRenderWorkerOptions = {},
): Promise<RenderWorkerServer> {
    process.env.DO_NOT_TRACK = '1';
    process.env.HYPERFRAMES_NO_TELEMETRY = '1';

    const config = ParseRenderWorkerEnv(options.Env);
    AssertNonRootUser(config.AllowRoot, options.EffectiveUid);

    const backend = options.Backend ?? new HyperFramesRenderBackend();
    const server = CreateRenderWorkerServer({
        Backend: backend,
        Host: config.Host,
        Port: config.Port,
        Token: config.Token,
        BearerToken: config.Token,
        MaxBodyBytes: config.MaxBodyBytes,
        Concurrency: config.Concurrency,
        MaxTimeoutMs: config.MaxTimeoutMs,
    });

    const boundPort = await server.Listen(config.Port, config.Host);
    const writeLine =
        options.WriteStdoutLine ?? ((line: string): void => void process.stdout.write(`${line}\n`));
    writeLine(`${RENDER_WORKER_PORT_PREFIX}${boundPort}`);
    RedirectConsoleStdoutToStderr();

    return server;
}

function isStdinPipeOrSocket(): boolean {
    try {
        const stdinStat = fs.fstatSync(0);
        return stdinStat.isFIFO() || stdinStat.isSocket();
    } catch {
        return false;
    }
}

async function runOneShotCliEntrypoint(argv: readonly string[]): Promise<void> {
    process.env.DO_NOT_TRACK = '1';
    process.env.HYPERFRAMES_NO_TELEMETRY = '1';
    const config = ParseRenderWorkerEnv(process.env);
    AssertNonRootUser(config.AllowRoot);
    RedirectConsoleStdoutToStderr();

    const backend = new HyperFramesRenderBackend();
    const abortController = new AbortController();
    const isPipedStdin = isStdinPipeOrSocket();
    let stdinClosedEarly = false;

    const onSignal = (): void => {
        abortController.abort();
    };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);

    const onStdinClosed = (): void => {
        stdinClosedEarly = true;
        abortController.abort();
    };
    if (isPipedStdin) {
        process.stdin.once('end', onStdinClosed);
        process.stdin.once('close', onStdinClosed);
        process.stdin.resume();
    }

    let exitCode = 1;
    try {
        exitCode = await RunOneShot(argv, backend, process.stdout, {
            Stderr: process.stderr,
            Stdin: isPipedStdin ? process.stdin : undefined,
            Signal: abortController.signal,
        });
    } finally {
        if (isPipedStdin) {
            process.stdin.removeListener('end', onStdinClosed);
            process.stdin.removeListener('close', onStdinClosed);
            process.stdin.pause();
        }
        await backend.Shutdown().catch(() => undefined);
        if (stdinClosedEarly && process.pid > 1) {
            // If our piped stdin closed while the job was still running (e.g. MJAPI died or
            // docker exec -i was terminated), also signal PID 1 so a detached --rm container
            // stops immediately instead of lingering.
            try {
                process.kill(1, 'SIGTERM');
            } catch {
                // Best-effort when running inside a per-run container.
            }
        }
    }
    process.exit(exitCode);
}

async function runCliEntrypoint(): Promise<void> {
    try {
        process.env.DO_NOT_TRACK = '1';
        process.env.HYPERFRAMES_NO_TELEMETRY = '1';
        if (process.argv[2] === 'run') {
            await runOneShotCliEntrypoint(process.argv.slice(2));
            return;
        }

        const backend = new HyperFramesRenderBackend();
        const server = await StartRenderWorkerFromEnv({ Backend: backend });

        let shuttingDown = false;
        const shutdown = async (): Promise<void> => {
            if (shuttingDown) {
                return;
            }
            shuttingDown = true;
            await server.Close().catch(() => undefined);
            await backend.Shutdown().catch(() => undefined);
            process.exit(0);
        };

        process.once('SIGINT', () => void shutdown());
        process.once('SIGTERM', () => void shutdown());

        if (isStdinPipeOrSocket()) {
            process.stdin.once('end', () => void shutdown());
            process.stdin.once('close', () => void shutdown());
            process.stdin.resume();
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`${message}\n`);
        process.exit(1);
    }
}

const isExecutedDirectly =
    typeof process.argv[1] === 'string' &&
    import.meta.url === pathToFileURL(process.argv[1]).href;

if (isExecutedDirectly) {
    void runCliEntrypoint();
}

