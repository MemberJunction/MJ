import { constants as bufferConstants } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    DockerSandboxProvider,
    type ISandboxProvider,
    type SandboxConfig,
    type SandboxHandle,
} from '@memberjunction/ai-agent-harness';
import { LogError } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
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
    RenderResultMetadata,
    RenderStreamEvent,
    RenderWorkerErrorBody,
    RenderWorkerErrorCode,
    StillsRequest,
    StillsResult,
} from '@memberjunction/video-studio-core';
import {
    DEFAULT_RENDER_MAX_OUTPUT_BYTES,
    ReadVideoRenderSettings,
    type VideoRenderSettings,
} from './render-settings.js';
import {
    CreateAbortError,
    ThrowIfSignalAborted,
    VideoRenderDriverBase,
    VideoRenderError,
} from './video-render-driver-base.js';
import { MAX_RENDER_JSON_RESPONSE_BYTES } from './worker-http-client.js';

/**
 * Command shown in `WorkerUnavailable` and `Health` error messages when the Docker image or daemon
 * cannot be provisioned.
 */
export const DOCKER_RENDER_IMAGE_BUILD_COMMAND =
    'docker build -f packages/AI/VideoStudio/RenderWorker/Dockerfile -t mj-video-render-worker:local .';

const CONTAINER_WORKER_ENTRY = '/app/dist/main.js';
const CONTAINER_REQUEST_PATH = '/workspace/request.json';
const CONTAINER_OUT_DIR = '/workspace/out';
const CONTAINER_TMP_DIR = '/workspace/tmp';
const CONTAINER_HOME_DIR = '/workspace/home';
const MAX_STDERR_TAIL_BYTES = 2048;

const NOFOLLOW_OPEN_FLAGS =
    fsConstants.O_RDONLY |
    (typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0) |
    (typeof fsConstants.O_NONBLOCK === 'number' ? fsConstants.O_NONBLOCK : 0);

type DockerOneShotOperation =
    | 'render'
    | 'stills'
    | 'contact-sheet'
    | 'check'
    | 'keyframes'
    | 'health';

const VALID_ERROR_CODES: ReadonlySet<RenderWorkerErrorCode> = new Set<RenderWorkerErrorCode>([
    'Unauthorized',
    'NotFound',
    'BodyTooLarge',
    'InvalidRequest',
    'InvalidBundle',
    'GEOMETRY_MISMATCH',
    'LintBlocked',
    'TooManyStills',
    'Timeout',
    'Cancelled',
    'DependencyMissing',
    'Internal',
]);

let processWorkspaceRootPromise: Promise<string> | undefined;

async function getOrCreateProcessWorkspaceRoot(): Promise<string> {
    if (!processWorkspaceRootPromise) {
        processWorkspaceRootPromise = (async (): Promise<string> => {
            const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-video-render-'));
            await fs.chmod(dir, 0o700);
            return dir;
        })().catch((err: unknown) => {
            processWorkspaceRootPromise = undefined;
            throw err;
        });
    }
    return processWorkspaceRootPromise;
}

function isRenderWorkerErrorCode(code: unknown): code is RenderWorkerErrorCode {
    return typeof code === 'string' && VALID_ERROR_CODES.has(code as RenderWorkerErrorCode);
}

function appendStderrTail(currentTail: string, chunk: Buffer): string {
    const combined = currentTail + chunk.toString('utf8');
    if (Buffer.byteLength(combined, 'utf8') <= MAX_STDERR_TAIL_BYTES) {
        return combined;
    }
    const buf = Buffer.from(combined, 'utf8');
    return buf.subarray(buf.byteLength - MAX_STDERR_TAIL_BYTES).toString('utf8');
}

function resolveLinuxDockerUser(): string | undefined {
    if (
        process.platform === 'linux' &&
        typeof process.getuid === 'function' &&
        typeof process.getgid === 'function'
    ) {
        return `${process.getuid()}:${process.getgid()}`;
    }
    return undefined;
}

function buildProvisionUnavailableMessage(image: string, cause: unknown): string {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return (
        `Failed to provision Docker render container from image '${image}': ${detail}. ` +
        `Ensure the Docker daemon is running and build the worker image with: ${DOCKER_RENDER_IMAGE_BUILD_COMMAND}`
    );
}

interface ReadRegularFileOptions {
    maxBytes: number;
    expectedBytes?: number;
    overMaxCode?: RenderWorkerErrorCode;
}

async function moveAndVerifySafeOutDir(
    hostOutDir: string,
    safeOutRoot: string,
    op: DockerOneShotOperation,
): Promise<string> {
    const safeOutDir = path.join(safeOutRoot, 'out');
    try {
        await fs.mkdir(safeOutRoot, { mode: 0o700 });
        await fs.chmod(safeOutRoot, 0o700);
        await fs.rename(hostOutDir, safeOutDir);
        const outStat = await fs.lstat(safeOutDir);
        if (!outStat.isDirectory() || outStat.isSymbolicLink()) {
            throw new VideoRenderError(
                'Internal',
                `Docker render worker operation '${op}' replaced the output directory with a non-directory entry.`,
            );
        }
        return safeOutDir;
    } catch (error) {
        if (error instanceof VideoRenderError) {
            throw error;
        }
        const detail = error instanceof Error ? error.message : String(error);
        throw new VideoRenderError(
            'Internal',
            `Docker render worker operation '${op}' output directory could not be verified: ${detail}`,
            { Cause: error },
        );
    }
}

async function readRegularFileNoFollow(
    filePath: string,
    op: DockerOneShotOperation,
    options: ReadRegularFileOptions,
): Promise<Buffer> {
    let handle: fs.FileHandle | undefined;
    try {
        handle = await fs.open(filePath, NOFOLLOW_OPEN_FLAGS);
        const stat = await handle.stat();
        if (!stat.isFile()) {
            throw new VideoRenderError(
                'Internal',
                `Docker render worker operation '${op}' produced a non-regular file at '${path.basename(filePath)}'.`,
            );
        }
        if (stat.size > options.maxBytes) {
            throw new VideoRenderError(
                options.overMaxCode ?? 'Internal',
                `Docker render worker operation '${op}' output file '${path.basename(filePath)}' size (${stat.size} bytes) exceeds maximum allowed (${options.maxBytes} bytes).`,
            );
        }
        if (options.expectedBytes !== undefined && stat.size !== options.expectedBytes) {
            throw new VideoRenderError(
                'Internal',
                `Docker render worker operation '${op}' output file '${path.basename(filePath)}' size (${stat.size} bytes) does not match claimed VideoSizeBytes (${options.expectedBytes} bytes).`,
            );
        }
        const buffer = Buffer.alloc(stat.size);
        let offset = 0;
        while (offset < stat.size) {
            const { bytesRead } = await handle.read(buffer, offset, stat.size - offset, offset);
            if (bytesRead <= 0) {
                throw new VideoRenderError(
                    'Internal',
                    `Docker render worker operation '${op}' output file '${path.basename(filePath)}' shrank while reading (${offset} of ${stat.size} bytes read).`,
                );
            }
            offset += bytesRead;
        }
        return buffer;
    } catch (error) {
        if (error instanceof VideoRenderError) {
            throw error;
        }
        const detail = error instanceof Error ? error.message : String(error);
        throw new VideoRenderError(
            'Internal',
            `Docker render worker operation '${op}' output file '${path.basename(filePath)}' could not be safely read: ${detail}`,
            { Cause: error },
        );
    } finally {
        await handle?.close().catch(() => undefined);
    }
}

async function isProviderContainerRunning(
    provider: ISandboxProvider & Pick<DockerSandboxProvider, 'IsContainerRunning'>,
    handle: SandboxHandle,
): Promise<boolean> {
    try {
        return await provider.IsContainerRunning(handle);
    } catch {
        return true;
    }
}

/**
 * Hardened Docker container render driver (`'Docker'`, `VS-RND-4`, §7.2, Decision 4 / D15).
 *
 * Provisions one network-isolated (`--network none`), read-only-root (`--read-only`),
 * capability-dropped (`--cap-drop ALL --security-opt no-new-privileges`) container per operation
 * via `@memberjunction/ai-agent-harness`'s `ISandboxProvider` (`DockerSandboxProvider`), stages the
 * operation request onto the bind-mounted workspace, executes `main.js run <op>` inside the
 * container with only `TMPDIR` and `HOME` in the environment, and finalizes the container in
 * `finally`.
 */
@RegisterClass(VideoRenderDriverBase, 'Docker')
export class DockerRenderDriver extends VideoRenderDriverBase {
    private readonly settings: VideoRenderSettings;
    private readonly maxOutputBytes: number;
    private readonly customProvider?: ISandboxProvider &
        Pick<DockerSandboxProvider, 'IsContainerRunning'>;
    private defaultProviderPromise?: Promise<
        ISandboxProvider & Pick<DockerSandboxProvider, 'IsContainerRunning'>
    >;
    private resolvedWorkspaceRoot?: string;
    private readonly activeRuns = new Set<Promise<unknown>>();

    public constructor(
        settings: VideoRenderSettings = ReadVideoRenderSettings(),
        provider?: ISandboxProvider & Pick<DockerSandboxProvider, 'IsContainerRunning'>,
    ) {
        super();
        this.settings = settings;
        this.maxOutputBytes =
            typeof settings.MaxOutputBytes === 'number' &&
            Number.isFinite(settings.MaxOutputBytes) &&
            settings.MaxOutputBytes > 0
                ? settings.MaxOutputBytes
                : DEFAULT_RENDER_MAX_OUTPUT_BYTES;
        this.customProvider = provider;
    }

    /**
     * Resolves the host workspace root directory for this driver instance.
     *
     * When `videoStudio.render.docker.workspaceRoot` is configured, that path is returned as-is.
     * Otherwise, a single process-wide `0o700` directory is created via
     * `fs.mkdtemp(path.join(os.tmpdir(), 'mj-video-render-'))` and shared across driver instances.
     */
    public async ResolveWorkspaceRoot(): Promise<string> {
        if (this.resolvedWorkspaceRoot !== undefined) {
            return this.resolvedWorkspaceRoot;
        }
        const configured = this.settings.Docker.WorkspaceRoot?.trim();
        if (configured && configured.length > 0) {
            this.resolvedWorkspaceRoot = configured;
            return configured;
        }
        const created = await getOrCreateProcessWorkspaceRoot();
        this.resolvedWorkspaceRoot = created;
        return created;
    }

    private async getProvider(): Promise<
        ISandboxProvider & Pick<DockerSandboxProvider, 'IsContainerRunning'>
    > {
        const workspaceRoot = await this.ResolveWorkspaceRoot();
        if (this.customProvider) {
            return this.customProvider;
        }
        if (!this.defaultProviderPromise) {
            this.defaultProviderPromise = Promise.resolve(
                new DockerSandboxProvider({
                    hostRootPath: workspaceRoot,
                    defaultImage: this.settings.Docker.Image,
                }),
            );
        }
        return this.defaultProviderPromise;
    }

    /**
     * `DockerRenderDriver` runs every container with `NetworkPolicy: 'none'` (`--network none`).
     */
    public override get IsNetworkIsolated(): boolean {
        return true;
    }

    public override async Render(
        req: RenderRequest,
        onProgress?: (progress: RenderProgress) => void,
        signal?: AbortSignal,
    ): Promise<RenderResult> {
        const effectiveTimeoutMs =
            typeof req.TimeoutMs === 'number' && Number.isFinite(req.TimeoutMs) && req.TimeoutMs > 0
                ? Math.min(req.TimeoutMs, this.settings.Timeouts.RenderMs)
                : this.settings.Timeouts.RenderMs;

        return this.trackRun(
            this.executeContainerOperation<RenderRequest, RenderResult>(
                'render',
                req,
                effectiveTimeoutMs,
                signal,
                onProgress,
            ),
        );
    }

    public override async CaptureStills(
        req: StillsRequest,
        signal?: AbortSignal,
    ): Promise<StillsResult> {
        return this.trackRun(
            this.executeContainerOperation<StillsRequest, StillsResult>(
                'stills',
                req,
                this.settings.Timeouts.RequestMs,
                signal,
            ),
        );
    }

    public override async BuildContactSheet(
        req: ContactSheetRequest,
        signal?: AbortSignal,
    ): Promise<ContactSheetResult> {
        return this.trackRun(
            this.executeContainerOperation<ContactSheetRequest, ContactSheetResult>(
                'contact-sheet',
                req,
                this.settings.Timeouts.RequestMs,
                signal,
            ),
        );
    }

    public override async Check(
        req: CheckRequest,
        signal?: AbortSignal,
    ): Promise<CheckResult> {
        return this.trackRun(
            this.executeContainerOperation<CheckRequest, CheckResult>(
                'check',
                req,
                this.settings.Timeouts.RequestMs,
                signal,
            ),
        );
    }

    public override async ExtractKeyframes(
        req: KeyframeRequest,
        signal?: AbortSignal,
    ): Promise<KeyframeResult> {
        return this.trackRun(
            this.executeContainerOperation<KeyframeRequest, KeyframeResult>(
                'keyframes',
                req,
                this.settings.Timeouts.RequestMs,
                signal,
            ),
        );
    }

    /**
     * Provisions a one-shot container and runs `main.js run health`.
     *
     * Never throws when Docker is unavailable or the image is not built; instead returns
     * `{ Healthy: false, NodeVersion: process.version, HyperFramesVersion: '', Errors: [reason] }`
     * (matching `LocalWorkerRenderDriver.Health`).
     */
    public override async Health(signal?: AbortSignal): Promise<RenderHealth> {
        try {
            return await this.trackRun(
                this.executeContainerOperation<Record<string, never>, RenderHealth>(
                    'health',
                    {},
                    this.settings.Timeouts.RequestMs,
                    signal,
                ),
            );
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
     * Waits for any in-flight container operations to finish their `Finalize` cleanup.
     */
    public override async Shutdown(): Promise<void> {
        if (this.activeRuns.size === 0) {
            return;
        }
        await Promise.allSettled(Array.from(this.activeRuns));
    }

    private trackRun<T>(promise: Promise<T>): Promise<T> {
        const cleanup = (): void => {
            this.activeRuns.delete(promise);
        };
        promise.then(cleanup, cleanup);
        this.activeRuns.add(promise);
        return promise;
    }

    private buildSandboxConfig(): SandboxConfig {
        return {
            NetworkPolicy: 'none',
            Image: this.settings.Docker.Image,
            Cpus: this.settings.Docker.Cpus,
            MemoryMb: this.settings.Docker.MemoryMb,
            PidsLimit: this.settings.Docker.PidsLimit,
            ShmSizeMb: this.settings.Docker.ShmSizeMb,
            ReadOnlyRoot: true,
            DropCapabilities: true,
            User: resolveLinuxDockerUser(),
        };
    }

    private async executeContainerOperation<TReq, TRes>(
        op: DockerOneShotOperation,
        req: TReq,
        timeoutMs: number,
        signal?: AbortSignal,
        onProgress?: (progress: RenderProgress) => void,
    ): Promise<TRes> {
        ThrowIfSignalAborted(signal);

        if (process.platform === 'win32') {
            throw new VideoRenderError(
                'WorkerUnavailable',
                "DockerRenderDriver requires a Linux or macOS host (process.platform === 'win32' is not supported because Windows lacks O_NOFOLLOW symlink-safe host file reads). Use the 'Remote' render driver instead.",
            );
        }

        let provider: ISandboxProvider & Pick<DockerSandboxProvider, 'IsContainerRunning'>;
        let handle: SandboxHandle;
        try {
            provider = await this.getProvider();
            handle = await provider.Provision(
                {
                    Scope: 'run',
                    AgentId: 'video-studio-render',
                    RunId: randomUUID(),
                },
                this.buildSandboxConfig(),
            );
        } catch (error) {
            throw new VideoRenderError(
                'WorkerUnavailable',
                buildProvisionUnavailableMessage(this.settings.Docker.Image, error),
                { Cause: error },
            );
        }

        let outcome: 'success' | 'failure' | 'cancelled' = 'failure';
        let safeOutRoot: string | undefined;
        try {
            if (signal?.aborted) {
                outcome = 'cancelled';
                throw CreateAbortError(signal);
            }

            const hostRoot = handle.HostWorkspacePath ?? handle.WorkspacePath;
            safeOutRoot = `${hostRoot}.out`;
            if (process.platform === 'linux') {
                await fs.chmod(hostRoot, 0o700);
            }

            const hostRequestPath = path.join(hostRoot, 'request.json');
            const hostOutDir = path.join(hostRoot, 'out');
            const hostTmpDir = path.join(hostRoot, 'tmp');
            const hostHomeDir = path.join(hostRoot, 'home');

            await Promise.all([
                fs.mkdir(hostOutDir, { recursive: true }),
                fs.mkdir(hostTmpDir, { recursive: true }),
                fs.mkdir(hostHomeDir, { recursive: true }),
                fs.writeFile(hostRequestPath, JSON.stringify(req), 'utf8'),
            ]);

            if (signal?.aborted) {
                outcome = 'cancelled';
                throw CreateAbortError(signal);
            }

            const combinedController = new AbortController();
            let timedOut = false;

            const proc = handle.Executor.Run({
                Command: 'node',
                Args: [
                    CONTAINER_WORKER_ENTRY,
                    'run',
                    op,
                    '--request',
                    CONTAINER_REQUEST_PATH,
                    '--out',
                    CONTAINER_OUT_DIR,
                ],
                Environment: {
                    TMPDIR: CONTAINER_TMP_DIR,
                    HOME: CONTAINER_HOME_DIR,
                },
                CancellationToken: combinedController.signal,
            });

            let stderrTail = '';
            const stderrPump = (async (): Promise<void> => {
                try {
                    for await (const line of proc.Stderr) {
                        stderrTail = appendStderrTail(stderrTail, Buffer.from(`${line}\n`, 'utf8'));
                    }
                } catch (error) {
                    const detail = error instanceof Error ? error.message : String(error);
                    stderrTail = appendStderrTail(
                        stderrTail,
                        Buffer.from(`stderr stream error: ${detail}\n`, 'utf8'),
                    );
                }
            })();

            let maxPercentSeen = 0;
            let lastProgressPhase: RenderProgress['Phase'] | undefined;
            let lastProgressPercent = 0;
            let lastElapsedMs = 0;

            const emitProgress = (progress: RenderProgress): void => {
                const clampedPercent = Math.min(100, Math.max(maxPercentSeen, progress.Percent));
                maxPercentSeen = clampedPercent;
                lastProgressPhase = progress.Phase;
                lastProgressPercent = clampedPercent;
                lastElapsedMs = Math.max(lastElapsedMs, progress.ElapsedMs);
                onProgress?.({
                    ...progress,
                    Percent: clampedPercent,
                });
            };

            const processStdoutLine = (rawLine: string): void => {
                if (op !== 'render') {
                    return;
                }
                const trimmed = rawLine.trim();
                if (!trimmed) {
                    return;
                }
                try {
                    const event = JSON.parse(trimmed) as RenderStreamEvent;
                    if (event && event.Type === 'Progress' && event.Progress) {
                        emitProgress(event.Progress);
                    }
                } catch {
                    // Ignore non-JSON lines on stdout if any.
                }
            };

            const stdoutPump = (async (): Promise<void> => {
                try {
                    for await (const line of proc.Stdout) {
                        processStdoutLine(line);
                    }
                } catch (error) {
                    const detail = error instanceof Error ? error.message : String(error);
                    stderrTail = appendStderrTail(
                        stderrTail,
                        Buffer.from(`stdout stream error: ${detail}\n`, 'utf8'),
                    );
                }
            })();

            const onCallerAbort = (): void => {
                combinedController.abort(signal?.reason);
                proc.Stdin?.end();
                proc.Kill();
            };

            if (signal) {
                if (signal.aborted) {
                    onCallerAbort();
                } else {
                    signal.addEventListener('abort', onCallerAbort, { once: true });
                }
            }

            const timeoutTimer = setTimeout(() => {
                timedOut = true;
                combinedController.abort();
                proc.Stdin?.end();
                proc.Kill();
            }, timeoutMs);
            timeoutTimer.unref();

            let exitCode: number | null;
            try {
                [exitCode] = await Promise.all([proc.ExitCode, stdoutPump, stderrPump]);
            } finally {
                clearTimeout(timeoutTimer);
                if (signal) {
                    signal.removeEventListener('abort', onCallerAbort);
                }
            }

            if (signal?.aborted) {
                outcome = 'cancelled';
                throw CreateAbortError(signal);
            }

            if (timedOut) {
                outcome = 'failure';
                throw new VideoRenderError(
                    'Timeout',
                    `Docker render worker operation '${op}' timed out after ${timeoutMs}ms.`,
                    { Status: 504 },
                );
            }

            if (exitCode !== 0) {
                outcome = 'failure';
                throw await this.readFailureFromOutDir(
                    op,
                    hostOutDir,
                    safeOutRoot,
                    exitCode,
                    stderrTail,
                );
            }

            const safeOutDir = await moveAndVerifySafeOutDir(hostOutDir, safeOutRoot, op);

            const isImageResultOp =
                op === 'stills' || op === 'contact-sheet' || op === 'keyframes';
            const resultMaxBytes = isImageResultOp
                ? Math.min(this.maxOutputBytes, bufferConstants.MAX_STRING_LENGTH)
                : MAX_RENDER_JSON_RESPONSE_BYTES;
            const resultRaw = (
                await readRegularFileNoFollow(path.join(safeOutDir, 'result.json'), op, {
                    maxBytes: resultMaxBytes,
                    overMaxCode: isImageResultOp ? 'BodyTooLarge' : 'Internal',
                })
            ).toString('utf8');
            const parsedResult = JSON.parse(resultRaw) as unknown;

            if (op === 'render') {
                const metadata = parsedResult as RenderResultMetadata;
                let expectedVideoBytes: number | undefined;
                if (metadata.VideoSizeBytes !== undefined) {
                    if (
                        typeof metadata.VideoSizeBytes !== 'number' ||
                        !Number.isFinite(metadata.VideoSizeBytes) ||
                        metadata.VideoSizeBytes < 0
                    ) {
                        throw new VideoRenderError(
                            'Internal',
                            `Docker render worker operation 'render' reported an invalid VideoSizeBytes (${String(metadata.VideoSizeBytes)}).`,
                        );
                    }
                    expectedVideoBytes = metadata.VideoSizeBytes;
                }

                const videoBytes = new Uint8Array(
                    await readRegularFileNoFollow(path.join(safeOutDir, 'video.mp4'), op, {
                        maxBytes: this.maxOutputBytes,
                        expectedBytes: expectedVideoBytes,
                    }),
                );
                if (lastProgressPhase !== 'Complete' || lastProgressPercent !== 100) {
                    emitProgress({
                        Phase: 'Complete',
                        RenderedFrames: metadata.FrameCount,
                        TotalFrames: metadata.FrameCount,
                        Percent: 100,
                        ElapsedMs: Math.max(lastElapsedMs, metadata.RenderDurationMs),
                    });
                }
                const {
                    VideoID: _videoId,
                    VideoSizeBytes: _videoSizeBytes,
                    ...metadataWithoutWireFields
                } = metadata;
                outcome = 'success';
                return {
                    ...metadataWithoutWireFields,
                    Video: videoBytes,
                } as unknown as TRes;
            }

            outcome = 'success';
            return parsedResult as TRes;
        } finally {
            await provider.Finalize(handle, outcome);
            if (safeOutRoot) {
                const containerRunning = await isProviderContainerRunning(provider, handle);
                if (containerRunning) {
                    LogError(
                        `Leaving Docker render output directory ${safeOutRoot} in place because container mj-harness-${handle.Key.RunId} may still be running.`,
                    );
                } else {
                    try {
                        await fs.rm(safeOutRoot, { recursive: true, force: true });
                    } catch (rmError) {
                        const detail = rmError instanceof Error ? rmError.message : String(rmError);
                        LogError(
                            `Failed to remove Docker render output directory ${safeOutRoot}: ${detail}`,
                        );
                    }
                }
            }
        }
    }

    private async readFailureFromOutDir(
        op: DockerOneShotOperation,
        hostOutDir: string,
        safeOutRoot: string,
        exitCode: number | null,
        stderrTail: string,
    ): Promise<VideoRenderError> {
        let errorRaw: string | undefined;
        try {
            const safeOutDir = await moveAndVerifySafeOutDir(hostOutDir, safeOutRoot, op);
            const errorJsonPath = path.join(safeOutDir, 'error.json');
            errorRaw = (
                await readRegularFileNoFollow(errorJsonPath, op, {
                    maxBytes: MAX_RENDER_JSON_RESPONSE_BYTES,
                })
            ).toString('utf8');
        } catch {
            errorRaw = undefined;
        }

        if (errorRaw !== undefined) {
            try {
                const parsed = JSON.parse(errorRaw) as Partial<RenderWorkerErrorBody>;
                if (parsed && isRenderWorkerErrorCode(parsed.Code)) {
                    const message =
                        typeof parsed.Message === 'string' && parsed.Message.length > 0
                            ? parsed.Message
                            : `Docker render worker operation '${op}' failed with code ${parsed.Code}.`;
                    const issues: CheckIssue[] | undefined = Array.isArray(parsed.Issues)
                        ? parsed.Issues
                        : undefined;
                    return new VideoRenderError(parsed.Code, message, { Issues: issues });
                }
            } catch {
                // Fall through to generic Internal error below.
            }
        }

        const trimmedStderr = stderrTail.trim();
        const stderrSuffix = trimmedStderr.length > 0 ? ` stderr: ${trimmedStderr}` : '';
        return new VideoRenderError(
            'Internal',
            `Docker render worker operation '${op}' exited with code=${String(exitCode)} without writing a structured error.json.${stderrSuffix}`,
        );
    }
}
