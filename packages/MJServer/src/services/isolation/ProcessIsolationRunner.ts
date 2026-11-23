/**
 * @fileoverview `Process` isolation runner backed by Node.js `child_process` OS subprocesses
 * with `--max-old-space-size`, active RSS memory enforcement, and hard timeout (`SIGTERM` -> `SIGKILL`) guards.
 *
 * Provides OS-level process crash containment and independent process memory enforcement across
 * both V8 heap and native/`Buffer` allocations (via child RSS guard and OS exit propagation).
 *
 * @module @memberjunction/server
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { LimitsConfigResolver, type MJLimitsIsolationConfig } from '@memberjunction/core';
import type {
    TaskGraphIsolationExecutionResult,
    TaskGraphIsolationRunRequest,
    TaskGraphIsolationRunner,
    TaskGraphIsolationStepOutcome,
} from '@memberjunction/task-graph';

interface ProcessIpcMessage {
    readonly ok: boolean;
    readonly output?: Record<string, unknown>;
    readonly errorMessage?: string;
    readonly errorCode?: string;
}

interface ProcessEnvelopePayload {
    readonly kind: 'InlineScript' | 'Module';
    readonly script?: string;
    readonly input?: Readonly<Record<string, unknown>>;
    readonly modulePath?: string;
    readonly exportName?: string;
    readonly args?: Readonly<Record<string, unknown>>;
    readonly maxMemoryMb: number;
}

const PROCESS_BOOTSTRAP_CODE = `
'use strict';
const { pathToFileURL } = require('node:url');

function normalizeOutput(val) {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        return val;
    }
    return { value: val };
}

function sendIpc(payload) {
    if (typeof process.send === 'function') {
        process.send(payload);
    }
}

async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
}

(async () => {
    let rssMonitor = null;
    try {
        const rawEnvelope = await readStdin();
        const data = JSON.parse(rawEnvelope);
        const maxRssBytes = Math.max(1, data.maxMemoryMb) * 1024 * 1024;
        rssMonitor = setInterval(() => {
            const rss = process.memoryUsage().rss;
            if (rss > maxRssBytes) {
                clearInterval(rssMonitor);
                sendIpc({
                    ok: false,
                    errorCode: 'ERR_PROCESS_OUT_OF_MEMORY',
                    errorMessage: 'Child process RSS (' + Math.round(rss / (1024 * 1024)) + ' MB) exceeded configured memory ceiling (' + data.maxMemoryMb + ' MB).'
                });
                process.exit(137);
            }
        }, 25);
        if (typeof rssMonitor.unref === 'function') {
            rssMonitor.unref();
        }

        let rawResult;
        if (data.kind === 'InlineScript') {
            const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
            const fn = new AsyncFn('input', data.script);
            rawResult = await fn(data.input || {});
        } else if (data.kind === 'Module') {
            let loaded;
            try {
                loaded = require(data.modulePath);
            } catch (reqErr) {
                if (reqErr && reqErr.code === 'ERR_REQUIRE_ESM') {
                    loaded = await import(pathToFileURL(data.modulePath).href);
                } else {
                    throw reqErr;
                }
            }
            const targetName = data.exportName || 'default';
            const candidate = typeof loaded === 'function' ? loaded : loaded[targetName];
            if (typeof candidate !== 'function') {
                throw new Error('Process module does not export callable target "' + targetName + '".');
            }
            rawResult = await candidate(data.args || {});
        } else {
            throw new Error('Unsupported process workload kind: ' + String(data.kind));
        }

        if (rssMonitor) clearInterval(rssMonitor);
        sendIpc({ ok: true, output: normalizeOutput(rawResult) });
    } catch (err) {
        if (rssMonitor) clearInterval(rssMonitor);
        sendIpc({
            ok: false,
            errorMessage: err instanceof Error ? err.message : String(err),
            errorCode: err && typeof err === 'object' && 'code' in err ? String(err.code) : 'ERR_PROCESS_EXECUTION',
        });
        process.exitCode = 1;
    }
})();
`;

const PROCESS_MAX_STDIO_CHARS = 32_768;

function appendBounded(buffer: string, chunk: string): string {
    if (buffer.length >= PROCESS_MAX_STDIO_CHARS) {
        return buffer;
    }
    return (buffer + chunk).slice(0, PROCESS_MAX_STDIO_CHARS);
}

function normalizeOutputRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return { value };
}

function isOomStderrOrCode(code: number | null, signal: string | null, stderr: string, errorCode?: string): boolean {
    if (errorCode === 'ERR_PROCESS_OUT_OF_MEMORY' || code === 137) {
        return true;
    }
    if (signal === 'SIGKILL' && /out of memory|heap limit/i.test(stderr)) {
        return true;
    }
    return /JS heap out of memory|Allocation failed|ERR_PROCESS_OUT_OF_MEMORY/i.test(stderr);
}

/**
 * Node.js `child_process` isolation runner with OS memory ceiling and timeout guards.
 */
export class ProcessIsolationRunner implements TaskGraphIsolationRunner {
    public readonly Level = 'Process' as const;

    public async Execute<TOutcome extends TaskGraphIsolationStepOutcome = TaskGraphIsolationStepOutcome>(
        request: TaskGraphIsolationRunRequest<TOutcome>,
    ): Promise<TaskGraphIsolationExecutionResult<TOutcome>> {
        const startedAt = Date.now();
        if (request.Workload.Kind === 'InProcessCallback') {
            return this.executeInProcessCallback(request, startedAt);
        }

        const defaults = LimitsConfigResolver.Resolve().Limits.Isolation;
        const limits: MJLimitsIsolationConfig = { ...defaults, ...(request.Limits ?? {}) };
        const maxMemoryMb = Math.max(1, Math.trunc(limits.ProcessMaxMemoryMb));
        const timeoutMs = Math.max(1, Math.trunc(request.TimeoutMs ?? limits.ProcessTimeoutMs));

        const envelope: ProcessEnvelopePayload =
            request.Workload.Kind === 'InlineScript'
                ? {
                      kind: 'InlineScript',
                      script: request.Workload.Script,
                      input: { ...(request.Workload.Input ?? {}) },
                      maxMemoryMb,
                  }
                : {
                      kind: 'Module',
                      modulePath: request.Workload.ModulePath,
                      exportName: request.Workload.ExportName,
                      args: request.Workload.Args ? { ...request.Workload.Args } : {},
                      maxMemoryMb,
                  };

        return this.spawnProcess<TOutcome>(envelope, maxMemoryMb, timeoutMs, startedAt);
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
                ErrorMessage: 'ProcessIsolationRunner requires ExecuteInProcess for InProcessCallback workloads.',
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

    private spawnProcess<TOutcome extends TaskGraphIsolationStepOutcome>(
        envelope: ProcessEnvelopePayload,
        maxMemoryMb: number,
        timeoutMs: number,
        startedAt: number,
    ): Promise<TaskGraphIsolationExecutionResult<TOutcome>> {
        return new Promise((resolve) => {
            let settled = false;
            let timedOut = false;
            let stdout = '';
            let stderr = '';
            let lastIpc: ProcessIpcMessage | null = null;
            let timer: NodeJS.Timeout | null = null;
            let killTimer: NodeJS.Timeout | null = null;
            let child: ChildProcess;

            const finish = (result: Omit<TaskGraphIsolationExecutionResult<TOutcome>, 'IsolationLevel' | 'DurationMs' | 'Stdout' | 'Stderr'>): void => {
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
                resolve({
                    ...result,
                    IsolationLevel: this.Level,
                    DurationMs: Date.now() - startedAt,
                    ...(stdout ? { Stdout: stdout } : {}),
                    ...(stderr ? { Stderr: stderr } : {}),
                });
            };

            try {
                child = spawn(
                    process.execPath,
                    [`--max-old-space-size=${maxMemoryMb}`, '-e', PROCESS_BOOTSTRAP_CODE],
                    {
                        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
                        env: { ...process.env },
                    },
                );
            } catch (err) {
                finish({
                    Success: false,
                    TerminationReason: 'StartupFailed',
                    ErrorCode: 'ERR_PROCESS_STARTUP_FAILED',
                    ErrorMessage: err instanceof Error ? err.message : String(err),
                });
                return;
            }

            child.stdout?.on('data', (chunk: Buffer | string) => {
                stdout = appendBounded(stdout, typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
            });
            child.stderr?.on('data', (chunk: Buffer | string) => {
                stderr = appendBounded(stderr, typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
            });

            child.on('message', (msg: ProcessIpcMessage) => {
                lastIpc = msg;
            });

            child.on('error', (err: Error & { code?: string }) => {
                finish({
                    Success: false,
                    TerminationReason: 'StartupFailed',
                    ErrorCode: err.code ?? 'ERR_PROCESS_STARTUP_FAILED',
                    ErrorMessage: err.message,
                });
            });

            child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
                if (timedOut) {
                    finish({
                        Success: false,
                        TerminationReason: 'Timeout',
                        ErrorCode: 'ERR_PROCESS_TIMEOUT',
                        ErrorMessage: `Child process exceeded timeout limit (${timeoutMs} ms) and was terminated.`,
                        ExitCode: code,
                        Signal: signal,
                    });
                    return;
                }

                if (lastIpc?.ok && code === 0) {
                    finish({
                        Success: true,
                        TerminationReason: 'Completed',
                        Output: normalizeOutputRecord(lastIpc.output),
                        ExitCode: 0,
                        Signal: signal,
                    });
                    return;
                }

                if (lastIpc && !lastIpc.ok) {
                    const oom = isOomStderrOrCode(code, signal, stderr, lastIpc.errorCode);
                    finish({
                        Success: false,
                        TerminationReason: oom ? 'OutOfMemory' : 'ExitFailure',
                        ErrorCode: oom ? 'ERR_PROCESS_OUT_OF_MEMORY' : (lastIpc.errorCode ?? 'ERR_PROCESS_EXIT'),
                        ErrorMessage: lastIpc.errorMessage ?? (stderr.trim() || `Process exited with code ${String(code)}`),
                        ExitCode: code,
                        Signal: signal,
                    });
                    return;
                }

                if (code === 0 && !signal) {
                    finish({
                        Success: true,
                        TerminationReason: 'Completed',
                        Output: {},
                        ExitCode: 0,
                    });
                    return;
                }

                const oom = isOomStderrOrCode(code, signal, stderr);
                finish({
                    Success: false,
                    TerminationReason: oom ? 'OutOfMemory' : 'ExitFailure',
                    ErrorCode: oom ? 'ERR_PROCESS_OUT_OF_MEMORY' : 'ERR_PROCESS_EXIT',
                    ErrorMessage: stderr.trim() || `Process terminated with exit code ${String(code)}${signal ? ` (signal ${signal})` : ''}.`,
                    ExitCode: code,
                    Signal: signal,
                });
            });

            timer = setTimeout(() => {
                timedOut = true;
                child.kill('SIGTERM');
                const graceMs = Math.min(500, Math.max(50, Math.trunc(timeoutMs / 4)));
                killTimer = setTimeout(() => {
                    if (!settled) {
                        child.kill('SIGKILL');
                    }
                }, graceMs);
            }, timeoutMs);

            if (child.stdin) {
                child.stdin.write(JSON.stringify(envelope), 'utf8');
                child.stdin.end();
            }
        });
    }
}
