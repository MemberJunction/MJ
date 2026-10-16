#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import {
    RENDER_WORKER_ENV,
    RENDER_WORKER_PORT_PREFIX,
} from '@memberjunction/video-studio-core';
import type { RenderBackend } from './backend.js';
import { HyperFramesRenderBackend } from './hyperframes-backend.js';
import {
    CreateRenderWorkerServer,
    DEFAULT_CONCURRENCY,
    DEFAULT_MAX_BODY_BYTES,
    DEFAULT_MAX_TIMEOUT_MS,
    type RenderWorkerServer,
} from './server.js';

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
    const host = env[RENDER_WORKER_ENV.Host]?.trim() || '127.0.0.1';
    const rawPort = env[RENDER_WORKER_ENV.Port]?.trim();
    const port = rawPort !== undefined && rawPort !== '' ? Number.parseInt(rawPort, 10) : 8788;

    const token = env[RENDER_WORKER_ENV.Token]?.trim() || undefined;
    const rawMaxBodyMb = env[RENDER_WORKER_ENV.MaxBodyMb]?.trim();
    const maxBodyMb =
        rawMaxBodyMb !== undefined && rawMaxBodyMb !== '' ? Number.parseFloat(rawMaxBodyMb) : 64;
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
        Port: Number.isFinite(port) && port >= 0 ? port : 8788,
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
 * Starts the HTTP render worker using `RENDER_WORKER_ENV`, writes
 * `VIDEO_STUDIO_RENDER_WORKER_PORT=<port>` to stdout once listening, and returns the server handle.
 */
export async function StartRenderWorkerFromEnv(
    options: StartRenderWorkerOptions = {},
): Promise<RenderWorkerServer> {
    const config = ParseRenderWorkerEnv(options.Env);
    AssertNonRootUser(config.AllowRoot, options.EffectiveUid);

    const backend = options.Backend ?? new HyperFramesRenderBackend();
    const server = CreateRenderWorkerServer({
        Backend: backend,
        BearerToken: config.Token,
        MaxBodyBytes: config.MaxBodyBytes,
        Concurrency: config.Concurrency,
        MaxTimeoutMs: config.MaxTimeoutMs,
    });

    const boundPort = await server.Listen(config.Port, config.Host);
    const writeLine =
        options.WriteStdoutLine ?? ((line: string): void => void process.stdout.write(`${line}\n`));
    writeLine(`${RENDER_WORKER_PORT_PREFIX}${boundPort}`);

    return server;
}

async function runCliEntrypoint(): Promise<void> {
    try {
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
