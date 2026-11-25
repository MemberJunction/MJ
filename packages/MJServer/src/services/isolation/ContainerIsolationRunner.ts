/**
 * @fileoverview `Container` isolation runner targeting OCI runtimes (`docker` / `podman`)
 * with hardened container flags (`--rm`, `--network none`, `--read-only`, `--memory`, `--cpus`),
 * startup/OOM/exit failure propagation, and pluggable command execution for deterministic CI testing.
 *
 * **Container Runtime Prerequisites**:
 * - Docker Engine >= 20.10 or Podman >= 4.0 CLI binary installed and available on `PATH`
 *   (configured via `Limits.Isolation.ContainerRuntime`, default `'docker'`).
 * - Container daemon socket accessible to the MJAPI service user without interactive `sudo`.
 * - Configured OCI image (default `'node:20-alpine'`, configured via `Limits.Isolation.ContainerImage`)
 *   pulled locally or pullable from an accessible container registry.
 * - Host cgroup v2 memory and CPU controllers enabled (or Docker Desktop VM memory bounds on macOS/Windows).
 *
 * @module @memberjunction/server
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { LimitsConfigResolver, type MJLimitsIsolationConfig } from '@memberjunction/core';
import {
    TASK_GRAPH_ISOLATION_GUARANTEES,
    type TaskGraphIsolationExecutionResult,
    type TaskGraphIsolationRunRequest,
    type TaskGraphIsolationRunner,
    type TaskGraphIsolationStepOutcome,
} from '@memberjunction/task-graph';

/**
 * Documented runtime prerequisites required on hosts enabling `'Container'` isolation.
 */
export const CONTAINER_RUNTIME_PREREQUISITES: readonly string[] =
    TASK_GRAPH_ISOLATION_GUARANTEES.Container.Prerequisites;

export const CONTAINER_RESULT_START_MARKER = '__MJ_CONTAINER_RESULT_START__';
export const CONTAINER_RESULT_END_MARKER = '__MJ_CONTAINER_RESULT_END__';

/**
 * Fully resolved container command invocation passed to a {@link ContainerCommandExecutor}.
 */
export interface ContainerCommandSpec {
    readonly Command: string;
    readonly Args: readonly string[];
    readonly StdinPayload: string;
    readonly TimeoutMs: number;
    readonly MemoryMb: number;
    readonly CpuQuota: number;
    readonly Image: string;
}

/**
 * Normalized process outcome produced by a {@link ContainerCommandExecutor}.
 */
export interface ContainerCommandExecutionOutcome {
    readonly ExitCode: number | null;
    readonly Signal?: string | null;
    readonly Stdout: string;
    readonly Stderr: string;
    readonly TimedOut?: boolean;
    readonly StartupError?: { readonly Code?: string; readonly Message: string };
}

/**
 * Pluggable container process executor used so routine CI tests run deterministically
 * while production hosts invoke `docker` / `podman` directly.
 */
export type ContainerCommandExecutor = (
    spec: ContainerCommandSpec,
) => Promise<ContainerCommandExecutionOutcome>;

export interface ContainerIsolationRunnerOptions {
    /** Optional custom command executor for deterministic testing or alternative container orchestrators. */
    readonly Executor?: ContainerCommandExecutor;
}

const CONTAINER_BOOTSTRAP_CODE = `
'use strict';
const START = '${CONTAINER_RESULT_START_MARKER}';
const END = '${CONTAINER_RESULT_END_MARKER}';

function normalizeOutput(val) {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        return val;
    }
    return { value: val };
}

function emit(payload) {
    process.stdout.write('\\n' + START + JSON.stringify(payload) + END + '\\n');
}

async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
}

(async () => {
    try {
        const data = JSON.parse(await readStdin());
        let rawResult;
        if (data.kind === 'InlineScript') {
            const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
            const fn = new AsyncFn('input', data.script);
            rawResult = await fn(data.input || {});
        } else if (data.kind === 'Module') {
            const loaded = require(data.modulePath);
            const targetName = data.exportName || 'default';
            const candidate = typeof loaded === 'function' ? loaded : loaded[targetName];
            if (typeof candidate !== 'function') {
                throw new Error('Container module does not export callable target "' + targetName + '".');
            }
            rawResult = await candidate(data.args || {});
        } else {
            throw new Error('Unsupported container workload kind: ' + String(data.kind));
        }
        emit({ ok: true, output: normalizeOutput(rawResult) });
    } catch (err) {
        emit({
            ok: false,
            errorMessage: err instanceof Error ? err.message : String(err),
            errorCode: err && typeof err === 'object' && 'code' in err ? String(err.code) : 'ERR_CONTAINER_EXECUTION',
        });
        process.exitCode = 1;
    }
})();
`;

const CONTAINER_MAX_STDIO_CHARS = 32_768;

function appendBounded(buffer: string, chunk: string): string {
    if (buffer.length >= CONTAINER_MAX_STDIO_CHARS) {
        return buffer;
    }
    return (buffer + chunk).slice(0, CONTAINER_MAX_STDIO_CHARS);
}

/**
 * Builds hardened OCI `docker run` / `podman run` CLI arguments for a single step execution.
 */
export function BuildContainerRunArgs(args: {
    readonly MemoryMb: number;
    readonly CpuQuota: number;
    readonly Image: string;
}): string[] {
    const mem = `${Math.max(1, Math.trunc(args.MemoryMb))}m`;
    const cpus = String(Math.max(0.1, args.CpuQuota));
    return [
        'run',
        '--rm',
        '-i',
        `--memory=${mem}`,
        `--memory-swap=${mem}`,
        `--cpus=${cpus}`,
        '--network=none',
        '--read-only',
        '--security-opt=no-new-privileges',
        args.Image,
        'node',
        '-e',
        CONTAINER_BOOTSTRAP_CODE,
    ];
}

/**
 * Default OS `child_process` executor invoking the configured OCI CLI runtime (`docker` / `podman`).
 */
export function DefaultContainerCommandExecutor(spec: ContainerCommandSpec): Promise<ContainerCommandExecutionOutcome> {
    return new Promise((resolve) => {
        let settled = false;
        let timedOut = false;
        let stdout = '';
        let stderr = '';
        let timer: NodeJS.Timeout | null = null;
        let killTimer: NodeJS.Timeout | null = null;
        let child: ChildProcess;

        const finish = (outcome: ContainerCommandExecutionOutcome): void => {
            if (settled) {
                return;
            }
            settled = true;
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            if (killTimer) {
                clearTimeout(killTimer);
                killTimer = null;
            }
            resolve(outcome);
        };

        try {
            child = spawn(spec.Command, [...spec.Args], { stdio: ['pipe', 'pipe', 'pipe'] });
        } catch (err) {
            const nodeErr = err as Error & { code?: string };
            finish({
                ExitCode: null,
                Stdout: '',
                Stderr: '',
                StartupError: { Code: nodeErr.code ?? 'ERR_CONTAINER_STARTUP_FAILED', Message: nodeErr.message },
            });
            return;
        }

        child.stdout?.on('data', (chunk: Buffer | string) => {
            stdout = appendBounded(stdout, typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
        });
        child.stderr?.on('data', (chunk: Buffer | string) => {
            stderr = appendBounded(stderr, typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
        });

        child.on('error', (err: Error & { code?: string }) => {
            finish({
                ExitCode: null,
                Stdout: stdout,
                Stderr: stderr,
                StartupError: { Code: err.code ?? 'ERR_CONTAINER_STARTUP_FAILED', Message: err.message },
            });
        });

        child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
            finish({
                ExitCode: code,
                Signal: signal,
                Stdout: stdout,
                Stderr: stderr,
                TimedOut: timedOut,
            });
        });

        timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
            const graceMs = Math.min(500, Math.max(50, Math.trunc(spec.TimeoutMs / 4)));
            killTimer = setTimeout(() => {
                if (!settled) {
                    child.kill('SIGKILL');
                }
            }, graceMs);
        }, spec.TimeoutMs);

        if (child.stdin) {
            child.stdin.write(spec.StdinPayload, 'utf8');
            child.stdin.end();
        }
    });
}

interface ParsedContainerEnvelope {
    readonly ok: boolean;
    readonly output?: Record<string, unknown>;
    readonly errorMessage?: string;
    readonly errorCode?: string;
}

function parseMarkedContainerEnvelope(stdout: string): ParsedContainerEnvelope | null {
    const startIdx = stdout.lastIndexOf(CONTAINER_RESULT_START_MARKER);
    if (startIdx < 0) {
        return null;
    }
    const afterStart = startIdx + CONTAINER_RESULT_START_MARKER.length;
    const endIdx = stdout.indexOf(CONTAINER_RESULT_END_MARKER, afterStart);
    if (endIdx < 0) {
        return null;
    }
    const rawJson = stdout.slice(afterStart, endIdx);
    try {
        const parsed = JSON.parse(rawJson) as ParsedContainerEnvelope;
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

function isContainerOomOutcome(outcome: ContainerCommandExecutionOutcome, memoryMb: number): boolean {
    if (outcome.ExitCode === 137) {
        return true;
    }
    if (outcome.Signal === 'SIGKILL' && /oom|out of memory|memory/i.test(outcome.Stderr)) {
        return true;
    }
    return /OOMKilled|Cannot allocate memory|exceeded memory limit|ERR_CONTAINER_OUT_OF_MEMORY/i.test(
        `${outcome.Stderr} (${memoryMb}m)`,
    );
}

function isContainerStartupFailure(outcome: ContainerCommandExecutionOutcome): boolean {
    if (outcome.StartupError) {
        return true;
    }
    if (outcome.ExitCode === 125 || outcome.ExitCode === 126 || outcome.ExitCode === 127) {
        return true;
    }
    return /Cannot connect to the Docker daemon|Is the docker daemon running|Unable to find image|manifest unknown|OCI runtime create failed|permission denied while trying to connect/i.test(
        outcome.Stderr,
    );
}

/**
 * OCI container isolation runner (`docker` / `podman`) with cgroup memory/CPU limits and timeout containment.
 */
export class ContainerIsolationRunner implements TaskGraphIsolationRunner {
    public readonly Level = 'Container' as const;
    private readonly executor: ContainerCommandExecutor;

    public constructor(options: ContainerIsolationRunnerOptions = {}) {
        this.executor = options.Executor ?? DefaultContainerCommandExecutor;
    }

    public async Execute<TOutcome extends TaskGraphIsolationStepOutcome = TaskGraphIsolationStepOutcome>(
        request: TaskGraphIsolationRunRequest<TOutcome>,
    ): Promise<TaskGraphIsolationExecutionResult<TOutcome>> {
        const startedAt = Date.now();
        if (request.Workload.Kind === 'InProcessCallback') {
            return this.executeInProcessCallback(request, startedAt);
        }

        const defaults = LimitsConfigResolver.Resolve().Limits.Isolation;
        const limits: MJLimitsIsolationConfig = { ...defaults, ...(request.Limits ?? {}) };
        const memoryMb = Math.max(1, Math.trunc(limits.ContainerMemoryMb));
        const cpuQuota = Math.max(0.1, limits.ContainerCpuQuota);
        const timeoutMs = Math.max(1, Math.trunc(request.TimeoutMs ?? limits.ContainerTimeoutMs));
        const image = limits.ContainerImage?.trim() || defaults.ContainerImage;
        const command = limits.ContainerRuntime?.trim() || defaults.ContainerRuntime;

        const stdinPayload = JSON.stringify(
            request.Workload.Kind === 'InlineScript'
                ? {
                      kind: 'InlineScript',
                      script: request.Workload.Script,
                      input: { ...(request.Workload.Input ?? {}) },
                  }
                : {
                      kind: 'Module',
                      modulePath: request.Workload.ModulePath,
                      exportName: request.Workload.ExportName,
                      args: request.Workload.Args ? { ...request.Workload.Args } : {},
                  },
        );

        const cliArgs = BuildContainerRunArgs({ MemoryMb: memoryMb, CpuQuota: cpuQuota, Image: image });
        const outcome = await this.executor({
            Command: command,
            Args: cliArgs,
            StdinPayload: stdinPayload,
            TimeoutMs: timeoutMs,
            MemoryMb: memoryMb,
            CpuQuota: cpuQuota,
            Image: image,
        });

        return this.translateOutcome<TOutcome>(outcome, memoryMb, timeoutMs, command, startedAt);
    }

    private translateOutcome<TOutcome extends TaskGraphIsolationStepOutcome>(
        outcome: ContainerCommandExecutionOutcome,
        memoryMb: number,
        timeoutMs: number,
        command: string,
        startedAt: number,
    ): TaskGraphIsolationExecutionResult<TOutcome> {
        const durationMs = Date.now() - startedAt;
        const baseMeta = {
            IsolationLevel: this.Level,
            DurationMs: durationMs,
            ExitCode: outcome.ExitCode,
            Signal: outcome.Signal ?? null,
            ...(outcome.Stdout ? { Stdout: outcome.Stdout } : {}),
            ...(outcome.Stderr ? { Stderr: outcome.Stderr } : {}),
        } as const;

        if (outcome.TimedOut) {
            return {
                ...baseMeta,
                Success: false,
                TerminationReason: 'Timeout',
                ErrorCode: 'ERR_CONTAINER_TIMEOUT',
                ErrorMessage: `Container execution exceeded timeout limit (${timeoutMs} ms) and was stopped.`,
            };
        }

        if (isContainerOomOutcome(outcome, memoryMb)) {
            return {
                ...baseMeta,
                Success: false,
                TerminationReason: 'OutOfMemory',
                ErrorCode: 'ERR_CONTAINER_OUT_OF_MEMORY',
                ErrorMessage:
                    outcome.Stderr.trim() ||
                    `Container terminated due to memory limit (${memoryMb} MB) (exit code ${String(outcome.ExitCode)}).`,
            };
        }

        if (isContainerStartupFailure(outcome)) {
            const msg = outcome.StartupError?.Message ?? (outcome.Stderr.trim() || `Container runtime "${command}" failed to start.`);
            return {
                ...baseMeta,
                Success: false,
                TerminationReason: 'StartupFailed',
                ErrorCode: outcome.StartupError?.Code ?? 'ERR_CONTAINER_STARTUP_FAILED',
                ErrorMessage: `${msg} Prerequisites: ${CONTAINER_RUNTIME_PREREQUISITES[0]}`,
            };
        }

        const parsed = parseMarkedContainerEnvelope(outcome.Stdout);
        if (parsed?.ok && outcome.ExitCode === 0) {
            return {
                ...baseMeta,
                Success: true,
                TerminationReason: 'Completed',
                Output: parsed.output ?? {},
            };
        }

        if (parsed && !parsed.ok) {
            return {
                ...baseMeta,
                Success: false,
                TerminationReason: 'ExitFailure',
                ErrorCode: parsed.errorCode ?? 'ERR_CONTAINER_EXIT',
                ErrorMessage: parsed.errorMessage ?? (outcome.Stderr.trim() || `Container exited with code ${String(outcome.ExitCode)}.`),
            };
        }

        if (outcome.ExitCode === 0) {
            return {
                ...baseMeta,
                Success: true,
                TerminationReason: 'Completed',
                Output: {},
            };
        }

        return {
            ...baseMeta,
            Success: false,
            TerminationReason: 'ExitFailure',
            ErrorCode: 'ERR_CONTAINER_EXIT',
            ErrorMessage:
                outcome.Stderr.trim() ||
                `Container exited with non-zero exit code ${String(outcome.ExitCode)}${outcome.Signal ? ` (signal ${outcome.Signal})` : ''}.`,
        };
    }

    private async executeInProcessCallback<TOutcome extends TaskGraphIsolationStepOutcome>(
        request: TaskGraphIsolationRunRequest<TOutcome>,
        startedAt: number,
    ): Promise<TaskGraphIsolationExecutionResult<TOutcome>> {
        if (!request.ExecuteInProcess) {
            return {
                Success: false,
                IsolationLevel: this.Level,
                TerminationReason: 'Error',
                ErrorCode: 'MISSING_CALLBACK',
                ErrorMessage: 'ContainerIsolationRunner requires ExecuteInProcess for InProcessCallback workloads.',
                DurationMs: Date.now() - startedAt,
            };
        }
        try {
            const outcome = await request.ExecuteInProcess();
            const outputObj =
                outcome.Output && typeof outcome.Output === 'object' && !Array.isArray(outcome.Output)
                    ? (outcome.Output as Record<string, unknown>)
                    : undefined;
            return {
                Success: outcome.Success,
                IsolationLevel: this.Level,
                Output: outputObj,
                ErrorMessage: outcome.ErrorMessage,
                TerminationReason: outcome.Success ? 'Completed' : 'Error',
                DurationMs: Date.now() - startedAt,
                BodyOutcome: outcome,
            };
        } catch (err) {
            return {
                Success: false,
                IsolationLevel: this.Level,
                TerminationReason: 'Error',
                ErrorMessage: err instanceof Error ? err.message : String(err),
                DurationMs: Date.now() - startedAt,
            };
        }
    }
}
