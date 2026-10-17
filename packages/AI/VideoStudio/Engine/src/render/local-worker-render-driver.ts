import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { RegisterClass } from '@memberjunction/global';
import {
    RENDER_WORKER_ENV,
    RENDER_WORKER_PORT_PREFIX,
    type CheckRequest,
    type CheckResult,
    type ContactSheetRequest,
    type ContactSheetResult,
    type KeyframeRequest,
    type KeyframeResult,
    type RenderHealth,
    type RenderProgress,
    type RenderRequest,
    type RenderResult,
    type StillsRequest,
    type StillsResult,
} from '@memberjunction/video-studio-core';
import {
    ReadVideoRenderSettings,
    type VideoRenderSettings,
} from './render-settings.js';
import {
    ThrowIfSignalAborted,
    VideoRenderDriverBase,
    VideoRenderError,
} from './video-render-driver-base.js';
import { RenderWorkerHttpClient } from './worker-http-client.js';

const WORKER_PACKAGE_NAME = '@memberjunction/video-studio-render-worker';
const WORKER_BIN_NAME = 'mj-video-render-worker';
const MAX_STDERR_TAIL_BYTES = 2048;
const SHUTDOWN_SIGKILL_DELAY_MS = 5000;
const HEALTH_POLL_INTERVAL_MS = 40;

/**
 * Environment variable names allowlisted from the parent process when spawning the local render worker.
 *
 * Includes OS/runtime path and locale variables plus the browser binary/cache path variables
 * documented by `@memberjunction/video-studio-render-worker` (VS-RND-1). Database and vendor API
 * secrets from MJAPI are never passed to the worker child process.
 */
export const ALLOWED_WORKER_PARENT_ENV_KEYS: readonly string[] = [
    'PATH',
    'HOME',
    'TMPDIR',
    'TMP',
    'TEMP',
    'LANG',
    'LC_ALL',
    'SystemRoot',
    'CHROME_PATH',
    'PUPPETEER_EXECUTABLE_PATH',
    'PUPPETEER_CACHE_DIR',
    'HYPERFRAMES_BROWSER_PATH',
] as const;

/**
 * Builds the sanitized environment variable map for a spawned local render worker child process.
 *
 * Pure function: copies only `ALLOWED_WORKER_PARENT_ENV_KEYS` from `parentEnv` and sets
 * `VIDEO_STUDIO_RENDER_HOST=127.0.0.1`, `VIDEO_STUDIO_RENDER_PORT=0`, and
 * `VIDEO_STUDIO_RENDER_TOKEN=<token>`.
 */
export function BuildWorkerEnv(
    parentEnv: NodeJS.ProcessEnv,
    token: string,
): NodeJS.ProcessEnv {
    const childEnv: NodeJS.ProcessEnv = {};
    for (const key of ALLOWED_WORKER_PARENT_ENV_KEYS) {
        const val = parentEnv[key];
        if (typeof val === 'string') {
            childEnv[key] = val;
        }
    }
    childEnv[RENDER_WORKER_ENV.Host] = '127.0.0.1';
    childEnv[RENDER_WORKER_ENV.Port] = '0';
    childEnv[RENDER_WORKER_ENV.Token] = token;
    return childEnv;
}

interface ActiveWorkerState {
    Child: ChildProcess;
    Port: number;
    BaseUrl: string;
    Token: string;
    Client: RenderWorkerHttpClient;
}

function appendStderrTail(currentTail: string, chunk: Buffer): string {
    const combined = currentTail + chunk.toString('utf8');
    if (Buffer.byteLength(combined, 'utf8') <= MAX_STDERR_TAIL_BYTES) {
        return combined;
    }
    const buf = Buffer.from(combined, 'utf8');
    return buf.subarray(buf.byteLength - MAX_STDERR_TAIL_BYTES).toString('utf8');
}

function buildWorkerUnavailableMessage(detail: string): string {
    return (
        `${detail} ` +
        `Ensure '${WORKER_PACKAGE_NAME}' is installed and built, configure 'videoStudio.render.local.workerEntry' in mj.config.cjs, ` +
        `or switch 'videoStudio.render.driver' to 'Remote' or 'Docker'.`
    );
}

/**
 * Managed local child-process render driver (`'LocalWorker'`, §7.2).
 *
 * Spawns `@memberjunction/video-studio-render-worker` on `127.0.0.1:0` with a sanitized environment
 * and a fresh 32-byte random bearer token per spawn, parses `VIDEO_STUDIO_RENDER_WORKER_PORT=<port>`,
 * polls `/health` until ready, and delegates the six `VideoRenderDriverBase` operations to
 * `RenderWorkerHttpClient`.
 *
 * Trust boundary (Decision 4 / D15): `LocalWorkerRenderDriver` is for development and single-node
 * trusted compositions (`IsNetworkIsolated === false`). Untrusted compositions should use the
 * `'Docker'` driver (`--network none`).
 */
@RegisterClass(VideoRenderDriverBase, 'LocalWorker')
export class LocalWorkerRenderDriver extends VideoRenderDriverBase {
    private readonly settings: VideoRenderSettings;
    private activeWorker: ActiveWorkerState | null = null;
    private startPromise: Promise<ActiveWorkerState> | null = null;
    private stopping = false;

    public constructor(settings: VideoRenderSettings = ReadVideoRenderSettings()) {
        super();
        this.settings = settings;
    }

    /**
     * `LocalWorker` runs as a local OS child process without a container `--network none` namespace.
     */
    public override get IsNetworkIsolated(): boolean {
        return false;
    }

    /**
     * PID of the currently running render worker child process, or `null` when not running.
     */
    public get ProcessId(): number | null {
        const child = this.activeWorker?.Child;
        if (!child || child.exitCode !== null || child.signalCode !== null) {
            return null;
        }
        return child.pid ?? null;
    }

    /**
     * Bound loopback port of the currently running render worker child process, or `null` when not running.
     */
    public get Port(): number | null {
        if (this.ProcessId === null) {
            return null;
        }
        return this.activeWorker?.Port ?? null;
    }

    /**
     * Base URL (`http://127.0.0.1:<port>`) of the currently running render worker, or `null` when not running.
     */
    public get BaseUrl(): string | null {
        if (this.ProcessId === null) {
            return null;
        }
        return this.activeWorker?.BaseUrl ?? null;
    }

    public override async Render(
        req: RenderRequest,
        onProgress?: (progress: RenderProgress) => void,
        signal?: AbortSignal,
    ): Promise<RenderResult> {
        ThrowIfSignalAborted(signal);
        const client = await this.ensureClient(signal);
        const effectiveTimeoutMs =
            typeof req.TimeoutMs === 'number' && Number.isFinite(req.TimeoutMs) && req.TimeoutMs > 0
                ? Math.min(req.TimeoutMs, this.settings.Timeouts.RenderMs)
                : this.settings.Timeouts.RenderMs;
        if (effectiveTimeoutMs !== this.settings.Timeouts.RenderMs && this.activeWorker) {
            const scopedClient = new RenderWorkerHttpClient({
                BaseUrl: this.activeWorker.BaseUrl,
                Token: this.activeWorker.Token,
                RenderTimeoutMs: effectiveTimeoutMs,
                RequestTimeoutMs: this.settings.Timeouts.RequestMs,
            });
            return scopedClient.Render(req, onProgress, signal);
        }
        return client.Render(req, onProgress, signal);
    }

    public override async CaptureStills(
        req: StillsRequest,
        signal?: AbortSignal,
    ): Promise<StillsResult> {
        ThrowIfSignalAborted(signal);
        const client = await this.ensureClient(signal);
        return client.CaptureStills(req, signal);
    }

    public override async BuildContactSheet(
        req: ContactSheetRequest,
        signal?: AbortSignal,
    ): Promise<ContactSheetResult> {
        ThrowIfSignalAborted(signal);
        const client = await this.ensureClient(signal);
        return client.BuildContactSheet(req, signal);
    }

    public override async Check(
        req: CheckRequest,
        signal?: AbortSignal,
    ): Promise<CheckResult> {
        ThrowIfSignalAborted(signal);
        const client = await this.ensureClient(signal);
        return client.Check(req, signal);
    }

    public override async ExtractKeyframes(
        req: KeyframeRequest,
        signal?: AbortSignal,
    ): Promise<KeyframeResult> {
        ThrowIfSignalAborted(signal);
        const client = await this.ensureClient(signal);
        return client.ExtractKeyframes(req, signal);
    }

    /**
     * Starts the local worker (if not already running) and queries `GET /health`.
     *
     * Never throws: if the worker entry is missing, fails to spawn, or fails `/health` during
     * startup, returns `{ Healthy: false, NodeVersion: process.version, HyperFramesVersion: '', Errors: [reason] }`.
     */
    public override async Health(signal?: AbortSignal): Promise<RenderHealth> {
        try {
            const client = await this.ensureClient(signal);
            return await client.Health(signal);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            return {
                Healthy: false,
                NodeVersion: process.version,
                HyperFramesVersion: '',
                Errors: [reason],
            };
        }
    }

    /**
     * Stops the managed child process via `SIGTERM`, escalating to `SIGKILL` after 5 seconds.
     */
    public override async Shutdown(): Promise<void> {
        this.stopping = true;
        if (this.startPromise) {
            try {
                await this.startPromise;
            } catch {
                // Ignore startup failures during shutdown.
            }
        }

        const worker = this.activeWorker;
        this.activeWorker = null;
        if (!worker) {
            return;
        }

        await this.terminateChildProcess(worker.Child);
    }

    private async ensureClient(signal?: AbortSignal): Promise<RenderWorkerHttpClient> {
        ThrowIfSignalAborted(signal);
        if (
            this.activeWorker &&
            this.activeWorker.Child.exitCode === null &&
            this.activeWorker.Child.signalCode === null
        ) {
            return this.activeWorker.Client;
        }

        this.activeWorker = null;
        if (!this.startPromise) {
            this.stopping = false;
            const pending = this.spawnAndWaitForReady().finally(() => {
                if (this.startPromise === pending) {
                    this.startPromise = null;
                }
            });
            this.startPromise = pending;
        }

        const state = await this.startPromise;
        ThrowIfSignalAborted(signal);
        return state.Client;
    }

    private resolveWorkerEntryPath(): string {
        const configuredEntry = this.settings.Local.WorkerEntry?.trim();
        if (configuredEntry && configuredEntry.length > 0) {
            const resolvedConfigured = path.resolve(configuredEntry);
            if (!fs.existsSync(resolvedConfigured)) {
                throw new VideoRenderError(
                    'WorkerUnavailable',
                    buildWorkerUnavailableMessage(
                        `Configured videoStudio.render.local.workerEntry '${configuredEntry}' (resolved to '${resolvedConfigured}') does not exist.`,
                    ),
                );
            }
            return resolvedConfigured;
        }

        try {
            const req = createRequire(import.meta.url);
            const pkgJsonPath = req.resolve(`${WORKER_PACKAGE_NAME}/package.json`);
            const pkgDir = path.dirname(pkgJsonPath);
            const pkgRaw = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as {
                bin?: string | Record<string, string>;
            };
            const relativeBin =
                typeof pkgRaw.bin === 'string'
                    ? pkgRaw.bin
                    : pkgRaw.bin?.[WORKER_BIN_NAME];
            if (!relativeBin) {
                throw new Error(
                    `Package '${WORKER_PACKAGE_NAME}' does not declare bin['${WORKER_BIN_NAME}'].`,
                );
            }
            const resolvedBin = path.resolve(pkgDir, relativeBin);
            if (!fs.existsSync(resolvedBin)) {
                throw new Error(
                    `Resolved worker binary '${resolvedBin}' from '${WORKER_PACKAGE_NAME}' does not exist on disk.`,
                );
            }
            return resolvedBin;
        } catch (error) {
            if (error instanceof VideoRenderError) {
                throw error;
            }
            const detail = error instanceof Error ? error.message : String(error);
            throw new VideoRenderError(
                'WorkerUnavailable',
                buildWorkerUnavailableMessage(
                    `Could not resolve '${WORKER_PACKAGE_NAME}' worker entry (${detail}).`,
                ),
                { Cause: error },
            );
        }
    }

    private async spawnAndWaitForReady(): Promise<ActiveWorkerState> {
        const entryPath = this.resolveWorkerEntryPath();
        const token = randomBytes(32).toString('hex');
        const env = BuildWorkerEnv(process.env, token);
        const args: string[] = [];
        if (
            typeof this.settings.Local.MaxOldSpaceMb === 'number' &&
            Number.isFinite(this.settings.Local.MaxOldSpaceMb) &&
            this.settings.Local.MaxOldSpaceMb > 0
        ) {
            args.push(`--max-old-space-size=${Math.round(this.settings.Local.MaxOldSpaceMb)}`);
        }
        args.push(entryPath);

        const startupTimeoutMs = Math.max(50, this.settings.Timeouts.StartupMs);
        const deadline = Date.now() + startupTimeoutMs;

        const child = spawn(process.execPath, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            env,
        });

        let stderrTail = '';
        child.stderr?.on('data', (chunk: Buffer) => {
            stderrTail = appendStderrTail(stderrTail, Buffer.from(chunk));
        });

        const port = await this.waitForPortAnnouncement(
            child,
            entryPath,
            startupTimeoutMs,
            () => stderrTail,
        );

        const baseUrl = `http://127.0.0.1:${port}`;
        const client = new RenderWorkerHttpClient({
            BaseUrl: baseUrl,
            Token: token,
            RenderTimeoutMs: this.settings.Timeouts.RenderMs,
            RequestTimeoutMs: this.settings.Timeouts.RequestMs,
        });

        try {
            await this.pollHealthUntilReady(
                child,
                client,
                deadline,
                startupTimeoutMs,
                () => stderrTail,
            );
        } catch (error) {
            await this.forceKillChildProcess(child);
            throw error;
        }

        if (this.stopping) {
            await this.forceKillChildProcess(child);
            throw new VideoRenderError(
                'WorkerUnavailable',
                'Local render worker was shut down during startup.',
            );
        }

        const state: ActiveWorkerState = {
            Child: child,
            Port: port,
            BaseUrl: baseUrl,
            Token: token,
            Client: client,
        };

        const onChildExit = (): void => {
            if (this.activeWorker?.Child === child) {
                this.activeWorker = null;
            }
        };
        child.once('exit', onChildExit);
        child.once('close', onChildExit);

        this.activeWorker = state;
        return state;
    }

    private waitForPortAnnouncement(
        child: ChildProcess,
        entryPath: string,
        startupTimeoutMs: number,
        getStderrTail: () => string,
    ): Promise<number> {
        return new Promise<number>((resolve, reject) => {
            let settled = false;
            let stdoutBuffer = '';

            const cleanup = (): void => {
                clearTimeout(timeoutTimer);
                child.stdout?.removeListener('data', onStdoutData);
                child.removeListener('error', onError);
                child.removeListener('exit', onExit);
            };

            const settleReject = (err: VideoRenderError): void => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                void this.forceKillChildProcess(child);
                reject(err);
            };

            const settleResolve = (port: number): void => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                resolve(port);
            };

            const onStdoutData = (chunk: Buffer): void => {
                stdoutBuffer += chunk.toString('utf8');
                const prefixIdx = stdoutBuffer.indexOf(RENDER_WORKER_PORT_PREFIX);
                if (prefixIdx === -1) {
                    return;
                }
                const afterPrefix = stdoutBuffer.slice(prefixIdx + RENDER_WORKER_PORT_PREFIX.length);
                const newlineIdx = afterPrefix.indexOf('\n');
                if (newlineIdx === -1) {
                    return;
                }
                const portStr = afterPrefix.slice(0, newlineIdx).trim();
                const parsedPort = Number.parseInt(portStr, 10);
                if (!Number.isFinite(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
                    settleReject(
                        new VideoRenderError(
                            'WorkerUnavailable',
                            buildWorkerUnavailableMessage(
                                `Render worker '${entryPath}' announced an invalid port '${portStr}'. stderr: ${getStderrTail().trim()}`,
                            ),
                        ),
                    );
                    return;
                }
                settleResolve(parsedPort);
            };

            const onError = (err: Error): void => {
                settleReject(
                    new VideoRenderError(
                        'WorkerUnavailable',
                        buildWorkerUnavailableMessage(
                            `Failed to spawn render worker '${entryPath}': ${err.message}. stderr: ${getStderrTail().trim()}`,
                        ),
                        { Cause: err },
                    ),
                );
            };

            const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
                settleReject(
                    new VideoRenderError(
                        'WorkerUnavailable',
                        buildWorkerUnavailableMessage(
                            `Render worker '${entryPath}' exited (code=${String(code)}, signal=${String(signal)}) before announcing ${RENDER_WORKER_PORT_PREFIX}. stderr: ${getStderrTail().trim()}`,
                        ),
                    ),
                );
            };

            const timeoutTimer = setTimeout(() => {
                settleReject(
                    new VideoRenderError(
                        'WorkerUnavailable',
                        buildWorkerUnavailableMessage(
                            `Render worker '${entryPath}' did not announce ${RENDER_WORKER_PORT_PREFIX} within ${startupTimeoutMs}ms. stderr: ${getStderrTail().trim()}`,
                        ),
                    ),
                );
            }, startupTimeoutMs);
            timeoutTimer.unref();

            child.stdout?.on('data', onStdoutData);
            child.once('error', onError);
            child.once('exit', onExit);
        });
    }

    private async pollHealthUntilReady(
        child: ChildProcess,
        client: RenderWorkerHttpClient,
        deadline: number,
        startupTimeoutMs: number,
        getStderrTail: () => string,
    ): Promise<void> {
        let lastReason = 'no response from /health';
        while (Date.now() < deadline) {
            if (child.exitCode !== null || child.signalCode !== null) {
                throw new VideoRenderError(
                    'WorkerUnavailable',
                    buildWorkerUnavailableMessage(
                        `Render worker exited (code=${String(child.exitCode)}, signal=${String(child.signalCode)}) while polling /health. stderr: ${getStderrTail().trim()}`,
                    ),
                );
            }
            const remainingMs = Math.max(50, deadline - Date.now());
            const pollController = new AbortController();
            const pollTimeout = setTimeout(() => pollController.abort(), Math.min(remainingMs, 2000));
            pollTimeout.unref();
            try {
                const health = await client.Health(pollController.signal);
                if (health.Healthy) {
                    return;
                }
                lastReason =
                    Array.isArray(health.Errors) && health.Errors.length > 0
                        ? health.Errors.join('; ')
                        : 'worker reported Healthy: false (HTTP 503)';
            } catch (error) {
                lastReason = error instanceof Error ? error.message : String(error);
            } finally {
                clearTimeout(pollTimeout);
            }
            await new Promise<void>((r) => {
                const timer = setTimeout(r, HEALTH_POLL_INTERVAL_MS);
                timer.unref();
            });
        }

        throw new VideoRenderError(
            'WorkerUnavailable',
            buildWorkerUnavailableMessage(
                `Render worker /health did not return HTTP 200 within ${startupTimeoutMs}ms (${lastReason}). stderr: ${getStderrTail().trim()}`,
            ),
        );
    }

    private terminateChildProcess(child: ChildProcess): Promise<void> {
        if (child.exitCode !== null || child.signalCode !== null) {
            return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
            let settled = false;
            let forceKillFallbackTimer: NodeJS.Timeout | undefined;

            const finish = (): void => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(sigkillTimer);
                if (forceKillFallbackTimer !== undefined) {
                    clearTimeout(forceKillFallbackTimer);
                }
                child.removeListener('exit', finish);
                child.removeListener('close', finish);
                resolve();
            };

            child.once('exit', finish);
            child.once('close', finish);

            const sigkillTimer = setTimeout(() => {
                try {
                    child.kill('SIGKILL');
                } catch {
                    finish();
                    return;
                }
                forceKillFallbackTimer = setTimeout(finish, 500);
                forceKillFallbackTimer.unref();
            }, SHUTDOWN_SIGKILL_DELAY_MS);
            sigkillTimer.unref();

            try {
                child.kill('SIGTERM');
            } catch {
                finish();
            }
        });
    }

    private forceKillChildProcess(child: ChildProcess): Promise<void> {
        if (child.exitCode !== null || child.signalCode !== null) {
            return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
            let settled = false;
            const finish = (): void => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(fallbackTimer);
                child.removeListener('exit', finish);
                child.removeListener('close', finish);
                resolve();
            };
            child.once('exit', finish);
            child.once('close', finish);
            const fallbackTimer = setTimeout(finish, 500);
            fallbackTimer.unref();
            try {
                child.kill('SIGKILL');
            } catch {
                finish();
            }
        });
    }
}
