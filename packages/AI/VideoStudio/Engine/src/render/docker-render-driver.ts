import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
    DockerSandboxProvider,
    type ISandboxProvider,
    type SandboxConfig,
    type SandboxHandle,
} from '@memberjunction/ai-agent-harness';
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
    ReadVideoRenderSettings,
    type VideoRenderSettings,
} from './render-settings.js';
import {
    CreateAbortError,
    ThrowIfSignalAborted,
    VideoRenderDriverBase,
    VideoRenderError,
} from './video-render-driver-base.js';

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
    private readonly provider: ISandboxProvider;
    private readonly activeRuns = new Set<Promise<unknown>>();

    public constructor(
        settings: VideoRenderSettings = ReadVideoRenderSettings(),
        provider?: ISandboxProvider,
    ) {
        super();
        this.settings = settings;
        this.provider =
            provider ??
            new DockerSandboxProvider({
                hostRootPath: this.settings.Docker.WorkspaceRoot,
                defaultImage: this.settings.Docker.Image,
            });
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

        let handle: SandboxHandle;
        try {
            handle = await this.provider.Provision(
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
        try {
            if (signal?.aborted) {
                outcome = 'cancelled';
                throw CreateAbortError(signal);
            }

            const hostRoot = handle.HostWorkspacePath ?? handle.WorkspacePath;
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
                } catch {
                    // Ignore stream teardown errors during abort/kill.
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
                } catch {
                    // Ignore stream teardown errors during abort/kill.
                }
            })();

            const onCallerAbort = (): void => {
                combinedController.abort(signal?.reason);
                try {
                    proc.Stdin?.end();
                } catch {
                    // Best-effort stdin close.
                }
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
                try {
                    proc.Stdin?.end();
                } catch {
                    // Best-effort stdin close.
                }
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
                throw await this.readFailureFromOutDir(op, hostOutDir, exitCode, stderrTail);
            }

            const resultRaw = await fs.readFile(path.join(hostOutDir, 'result.json'), 'utf8');
            const parsedResult = JSON.parse(resultRaw) as unknown;

            if (op === 'render') {
                const metadata = parsedResult as RenderResultMetadata;
                const videoBytes = new Uint8Array(
                    await fs.readFile(path.join(hostOutDir, 'video.mp4')),
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
            await this.provider.Finalize(handle, outcome);
        }
    }

    private async readFailureFromOutDir(
        op: DockerOneShotOperation,
        hostOutDir: string,
        exitCode: number | null,
        stderrTail: string,
    ): Promise<VideoRenderError> {
        const errorJsonPath = path.join(hostOutDir, 'error.json');
        let errorRaw: string | undefined;
        try {
            errorRaw = await fs.readFile(errorJsonPath, 'utf8');
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
