/**
 * @fileoverview `Worker` isolation runner backed by Node.js `worker_threads` with V8 heap `resourceLimits`.
 *
 * **Fault-boundary guarantee**:
 * - Executes isolated JavaScript/TypeScript task workloads inside a dedicated `worker_threads.Worker`
 *   configured with `resourceLimits` (`maxOldGenerationSizeMb`, `maxYoungGenerationSizeMb`).
 * - When an isolated workload performs unbounded V8 JavaScript heap allocations (objects, arrays,
 *   strings, closures), V8 terminates the worker cleanly (`ERR_WORKER_OUT_OF_MEMORY`) without crashing
 *   or destabilizing the host MJAPI process.
 * - Enforces wall-clock execution timeouts via `worker.terminate()`.
 *
 * **Explicit native / Buffer limitation**:
 * - V8 `resourceLimits` govern ONLY V8 JavaScript heap memory. Off-heap `Buffer`, `ArrayBuffer`,
 *   `SharedArrayBuffer`, WebAssembly linear memory, and native C++ addon allocations bypass V8's heap
 *   limits. Workloads requiring OS-level containment across native/Buffer memory MUST select
 *   `'Process'` or `'Container'` isolation instead.
 *
 * @module @memberjunction/server
 */
import { Worker, type ResourceLimits } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { LimitsConfigResolver, type MJLimitsIsolationConfig } from '@memberjunction/core';
import type {
    TaskGraphIsolationExecutionResult,
    TaskGraphIsolationRunRequest,
    TaskGraphIsolationRunner,
    TaskGraphIsolationStepOutcome,
} from '@memberjunction/task-graph';

interface WorkerPayloadMessage {
    readonly ok: boolean;
    readonly output?: Record<string, unknown>;
    readonly errorMessage?: string;
    readonly errorCode?: string;
}

interface WorkerBootstrapData {
    readonly kind: 'InlineScript' | 'Module';
    readonly script?: string;
    readonly input?: Readonly<Record<string, unknown>>;
    readonly modulePath?: string;
    readonly exportName?: string;
    readonly args?: Readonly<Record<string, unknown>>;
}

const WORKER_BOOTSTRAP_CODE = `
'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const { pathToFileURL } = require('node:url');

function normalizeOutput(val) {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        return val;
    }
    return { value: val };
}

(async () => {
    try {
        let rawResult;
        if (workerData.kind === 'InlineScript') {
            const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
            const fn = new AsyncFn('input', "'use strict';\\n" + workerData.script);
            rawResult = await fn(workerData.input || {});
        } else if (workerData.kind === 'Module') {
            let loaded;
            try {
                loaded = require(workerData.modulePath);
            } catch (reqErr) {
                if (reqErr && reqErr.code === 'ERR_REQUIRE_ESM') {
                    loaded = await import(pathToFileURL(workerData.modulePath).href);
                } else {
                    throw reqErr;
                }
            }
            const targetName = workerData.exportName || 'default';
            const candidate = typeof loaded === 'function' ? loaded : loaded[targetName];
            if (typeof candidate !== 'function') {
                throw new Error('Worker module does not export callable target "' + targetName + '".');
            }
            rawResult = await candidate(workerData.args || {});
        } else {
            throw new Error('Unsupported worker workload kind: ' + String(workerData.kind));
        }
        parentPort.postMessage({ ok: true, output: normalizeOutput(rawResult) });
    } catch (err) {
        parentPort.postMessage({
            ok: false,
            errorMessage: err instanceof Error ? err.message : String(err),
            errorCode: err && typeof err === 'object' && 'code' in err ? String(err.code) : undefined,
        });
    }
})();
`;

const WORKER_MAX_STDIO_CHARS = 32_768;

function isWorkerOomError(err: Error & { code?: string }): boolean {
    if (err.code === 'ERR_WORKER_OUT_OF_MEMORY') {
        return true;
    }
    return /ERR_WORKER_OUT_OF_MEMORY|Worker terminated due to reaching memory limit|JS heap out of memory|Array buffer allocation failed/i.test(
        err.message,
    );
}

function appendBounded(buffer: string, chunk: string): string {
    if (buffer.length >= WORKER_MAX_STDIO_CHARS) {
        return buffer;
    }
    return (buffer + chunk).slice(0, WORKER_MAX_STDIO_CHARS);
}

function normalizeOutputRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return { value };
}

/**
 * Node.js `worker_threads` isolation runner with configurable V8 heap `resourceLimits` and timeout guard.
 */
export class WorkerIsolationRunner implements TaskGraphIsolationRunner {
    public readonly Level = 'Worker' as const;

    public async Execute<TOutcome extends TaskGraphIsolationStepOutcome = TaskGraphIsolationStepOutcome>(
        request: TaskGraphIsolationRunRequest<TOutcome>,
    ): Promise<TaskGraphIsolationExecutionResult<TOutcome>> {
        const startedAt = Date.now();
        if (request.Workload.Kind === 'InProcessCallback') {
            return this.executeInProcessCallback(request, startedAt);
        }

        const defaults = LimitsConfigResolver.Resolve().Limits.Isolation;
        const limits: MJLimitsIsolationConfig = { ...defaults, ...(request.Limits ?? {}) };
        const maxOldMb = Math.max(1, Math.trunc(limits.WorkerMaxOldGenerationSizeMb));
        const maxYoungMb = Math.max(1, Math.trunc(limits.WorkerMaxYoungGenerationSizeMb));
        const timeoutMs = Math.max(1, Math.trunc(request.TimeoutMs ?? limits.WorkerTimeoutMs));
        const resourceLimits: ResourceLimits = {
            maxOldGenerationSizeMb: maxOldMb,
            maxYoungGenerationSizeMb: maxYoungMb,
        };

        const workerData: WorkerBootstrapData =
            request.Workload.Kind === 'InlineScript'
                ? {
                      kind: 'InlineScript',
                      script: request.Workload.Script,
                      input: { ...(request.Workload.Input ?? {}) },
                  }
                : {
                      kind: 'Module',
                      modulePath: this.resolveModulePath(request.Workload.ModulePath),
                      exportName: request.Workload.ExportName,
                      args: request.Workload.Args ? { ...request.Workload.Args } : {},
                  };

        return this.runWorkerThread<TOutcome>(workerData, resourceLimits, timeoutMs, startedAt);
    }

    private resolveModulePath(modulePath: string): string {
        if (modulePath.startsWith('.') || modulePath.startsWith('/')) {
            return modulePath;
        }
        try {
            const req = createRequire(import.meta.url);
            return req.resolve(modulePath);
        } catch {
            return modulePath;
        }
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
                ErrorMessage: 'WorkerIsolationRunner requires ExecuteInProcess for InProcessCallback workloads.',
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

    private runWorkerThread<TOutcome extends TaskGraphIsolationStepOutcome>(
        workerData: WorkerBootstrapData,
        resourceLimits: ResourceLimits,
        timeoutMs: number,
        startedAt: number,
    ): Promise<TaskGraphIsolationExecutionResult<TOutcome>> {
        return new Promise((resolve) => {
            let settled = false;
            let stdout = '';
            let stderr = '';
            let lastMessage: WorkerPayloadMessage | null = null;
            let timer: NodeJS.Timeout | null = null;
            let worker: Worker;

            const finish = (result: Omit<TaskGraphIsolationExecutionResult<TOutcome>, 'IsolationLevel' | 'DurationMs' | 'Stdout' | 'Stderr'>): void => {
                if (settled) {
                    return;
                }
                settled = true;
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                resolve({
                    ...result,
                    IsolationLevel: this.Level,
                    DurationMs: Date.now() - startedAt,
                    ...(stdout ? { Stdout: stdout } : {}),
                    ...(stderr ? { Stderr: stderr } : {}),
                });
            };

            try {
                worker = new Worker(WORKER_BOOTSTRAP_CODE, {
                    eval: true,
                    workerData,
                    resourceLimits,
                    stdout: true,
                    stderr: true,
                });
            } catch (err) {
                finish({
                    Success: false,
                    TerminationReason: 'StartupFailed',
                    ErrorCode: 'ERR_WORKER_STARTUP_FAILED',
                    ErrorMessage: err instanceof Error ? err.message : String(err),
                });
                return;
            }

            worker.stdout?.on('data', (chunk: Buffer | string) => {
                stdout = appendBounded(stdout, typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
            });
            worker.stderr?.on('data', (chunk: Buffer | string) => {
                stderr = appendBounded(stderr, typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
            });

            worker.on('message', (msg: WorkerPayloadMessage) => {
                lastMessage = msg;
                if (msg.ok) {
                    finish({
                        Success: true,
                        TerminationReason: 'Completed',
                        Output: normalizeOutputRecord(msg.output),
                        ExitCode: 0,
                    });
                } else {
                    finish({
                        Success: false,
                        TerminationReason: 'Error',
                        ErrorCode: msg.errorCode ?? 'ERR_WORKER_EXECUTION',
                        ErrorMessage: msg.errorMessage ?? 'Worker reported execution failure.',
                    });
                }
                // Ensure scripts that leave open handles/timers behind cannot leak a worker thread after reporting completion.
                void worker.terminate().catch(() => undefined);
            });

            worker.on('error', (err: Error & { code?: string }) => {
                if (isWorkerOomError(err)) {
                    finish({
                        Success: false,
                        TerminationReason: 'OutOfMemory',
                        ErrorCode: 'ERR_WORKER_OUT_OF_MEMORY',
                        ErrorMessage: err.message,
                    });
                    return;
                }
                finish({
                    Success: false,
                    TerminationReason: 'Error',
                    ErrorCode: err.code ?? 'ERR_WORKER_ERROR',
                    ErrorMessage: err.message,
                });
            });

            worker.on('exit', (code: number) => {
                if (settled) {
                    return;
                }
                if (lastMessage?.ok) {
                    finish({
                        Success: true,
                        TerminationReason: 'Completed',
                        Output: normalizeOutputRecord(lastMessage.output),
                        ExitCode: code,
                    });
                    return;
                }
                if (code === 0) {
                    finish({
                        Success: true,
                        TerminationReason: 'Completed',
                        Output: {},
                        ExitCode: 0,
                    });
                    return;
                }
                const looksOom = /out of memory|ERR_WORKER_OUT_OF_MEMORY/i.test(stderr);
                finish({
                    Success: false,
                    TerminationReason: looksOom ? 'OutOfMemory' : 'ExitFailure',
                    ErrorCode: looksOom ? 'ERR_WORKER_OUT_OF_MEMORY' : 'ERR_WORKER_EXIT',
                    ErrorMessage: stderr.trim() || `Worker exited with non-zero exit code ${code}.`,
                    ExitCode: code,
                });
            });

            timer = setTimeout(() => {
                void worker.terminate();
                finish({
                    Success: false,
                    TerminationReason: 'Timeout',
                    ErrorCode: 'ERR_WORKER_TIMEOUT',
                    ErrorMessage: `Worker execution exceeded timeout limit (${timeoutMs} ms) and was terminated.`,
                });
            }, timeoutMs);
        });
    }
}
