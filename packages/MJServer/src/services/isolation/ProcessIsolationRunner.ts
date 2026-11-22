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
    TaskGraphIsolationExecutionMetadata,
    TaskGraphIsolationExecutionResult,
    TaskGraphIsolationRunRequest,
    TaskGraphIsolationRunner,
    TaskGraphIsolationStepOutcome,
    TaskGraphIsolationWorkload,
} from '@memberjunction/task-graph';

interface ProcessIpcMessage {
    readonly type?: 'result' | 'rpc';
    readonly ok?: boolean;
    readonly output?: Record<string, unknown>;
    readonly bodyOutcome?: TaskGraphIsolationStepOutcome;
    readonly executionMeta?: TaskGraphIsolationExecutionMetadata;
    readonly errorMessage?: string;
    readonly errorCode?: string;
    readonly callId?: number;
    readonly method?: string;
    readonly params?: Record<string, unknown>;
}

interface ProcessEnvelopePayload {
    readonly kind: 'InlineScript' | 'Module' | 'IsolatedTaskStep';
    readonly script?: string;
    readonly input?: Readonly<Record<string, unknown>>;
    readonly modulePath?: string;
    readonly exportName?: string;
    readonly args?: Readonly<Record<string, unknown>>;
    readonly step?: Extract<TaskGraphIsolationWorkload, { Kind: 'IsolatedTaskStep' }>;
    readonly maxMemoryMb: number;
}

const PROCESS_BOOTSTRAP_CODE = `
'use strict';
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');

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

let nextCallId = 1;
const pendingRpc = new Map();

process.on('message', (msg) => {
    if (msg && msg.type === 'rpcResult' && typeof msg.callId === 'number') {
        const entry = pendingRpc.get(msg.callId);
        if (!entry) return;
        pendingRpc.delete(msg.callId);
        if (msg.ok) {
            entry.resolve(msg.result || {});
        } else {
            entry.reject(new Error(msg.errorMessage || 'Host RPC invocation failed.'));
        }
    }
});

function invokeHostRpc(method, params) {
    return new Promise((resolve, reject) => {
        const callId = nextCallId++;
        pendingRpc.set(callId, { resolve, reject });
        sendIpc({ type: 'rpc', callId, method, params });
    });
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
                    type: 'result',
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

        const executionMeta = {
            IsMainThread: true,
            ProcessId: process.pid,
        };

        if (data.kind === 'IsolatedTaskStep') {
            const rpcRes = await invokeHostRpc('executeTaskStep', {
                TaskID: data.step.TaskID,
                StepType: data.step.StepType,
                IsolationContext: executionMeta,
            });
            if (rssMonitor) clearInterval(rssMonitor);
            const bodyOutcome = rpcRes && rpcRes.BodyOutcome ? rpcRes.BodyOutcome : { Success: false, ErrorMessage: 'Missing BodyOutcome from host RPC.' };
            sendIpc({
                type: 'result',
                ok: bodyOutcome.Success === true,
                output: normalizeOutput(bodyOutcome.Output),
                bodyOutcome,
                executionMeta,
                errorMessage: bodyOutcome.ErrorMessage,
                errorCode: bodyOutcome.ResultCode,
            });
            if (typeof process.disconnect === 'function' && process.connected) {
                process.disconnect();
            }
            return;
        }

        let rawResult;
        if (data.kind === 'InlineScript') {
            const context = vm.createContext({
                input: data.input || {},
                require,
                process,
                Buffer,
                console,
                setTimeout,
                clearTimeout,
                setInterval,
                clearInterval,
                URL,
                TextEncoder,
                TextDecoder,
            });
            const script = new vm.Script("'use strict'; (async () => {\\n" + String(data.script || '') + "\\n})()", {
                filename: 'process-inline-script.js',
            });
            rawResult = await script.runInContext(context);
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
        sendIpc({ type: 'result', ok: true, output: normalizeOutput(rawResult), executionMeta });
        if (typeof process.disconnect === 'function' && process.connected) {
            process.disconnect();
        }
    } catch (err) {
        if (rssMonitor) clearInterval(rssMonitor);
        sendIpc({
            type: 'result',
            ok: false,
            errorMessage: err instanceof Error ? err.message : String(err),
            errorCode: err && typeof err === 'object' && 'code' in err ? String(err.code) : 'ERR_PROCESS_EXECUTION',
            executionMeta: { IsMainThread: true, ProcessId: process.pid },
        });
        process.exitCode = 1;
        if (typeof process.disconnect === 'function' && process.connected) {
            process.disconnect();
        }
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
            return {
                Success: false,
                IsolationLevel: this.Level,
                TerminationReason: 'Error',
                ErrorCode: 'UNSUPPORTED_ISOLATED_WORKLOAD',
                ErrorMessage:
                    'ProcessIsolationRunner cannot execute unisolated InProcessCallback workloads; provide IsolatedTaskStep, InlineScript, or Module.',
                DurationMs: Date.now() - startedAt,
            };
        }

        if (request.Workload.Kind === 'IsolatedTaskStep' && !request.HostRpc) {
            return {
                Success: false,
                IsolationLevel: this.Level,
                TerminationReason: 'Error',
                ErrorCode: 'MISSING_HOST_RPC',
                ErrorMessage: 'ProcessIsolationRunner requires HostRpc for IsolatedTaskStep workloads.',
                DurationMs: Date.now() - startedAt,
            };
        }

        const defaults = LimitsConfigResolver.Resolve().Limits.Isolation;
        const limits: MJLimitsIsolationConfig = { ...defaults, ...(request.Limits ?? {}) };
        const maxMemoryMb = Math.max(1, Math.trunc(limits.ProcessMaxMemoryMb));
        const timeoutMs = Math.max(1, Math.trunc(request.TimeoutMs ?? limits.ProcessTimeoutMs));

        let envelope: ProcessEnvelopePayload;
        if (request.Workload.Kind === 'InlineScript') {
            envelope = {
                kind: 'InlineScript',
                script: request.Workload.Script,
                input: { ...(request.Workload.Input ?? {}) },
                maxMemoryMb,
            };
        } else if (request.Workload.Kind === 'Module') {
            envelope = {
                kind: 'Module',
                modulePath: request.Workload.ModulePath,
                exportName: request.Workload.ExportName,
                args: request.Workload.Args ? { ...request.Workload.Args } : {},
                maxMemoryMb,
            };
        } else {
            envelope = {
                kind: 'IsolatedTaskStep',
                step: request.Workload,
                maxMemoryMb,
            };
        }

        return this.spawnProcess<TOutcome>(envelope, maxMemoryMb, timeoutMs, startedAt, request.HostRpc);
    }

    private spawnProcess<TOutcome extends TaskGraphIsolationStepOutcome>(
        envelope: ProcessEnvelopePayload,
        maxMemoryMb: number,
        timeoutMs: number,
        startedAt: number,
        hostRpc?: TaskGraphIsolationRunRequest<TOutcome>['HostRpc'],
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
                if (msg.type === 'rpc' && typeof msg.callId === 'number' && msg.method) {
                    if (!hostRpc) {
                        if (child.connected) {
                            child.send({
                                type: 'rpcResult',
                                callId: msg.callId,
                                ok: false,
                                errorMessage: 'No HostRpc bridge registered.',
                            });
                        }
                        return;
                    }
                    void hostRpc
                        .Invoke(msg.method, msg.params ?? {})
                        .then((result) => {
                            if (!settled && child.connected) {
                                child.send({ type: 'rpcResult', callId: msg.callId, ok: true, result });
                            }
                        })
                        .catch((err) => {
                            if (!settled && child.connected) {
                                child.send({
                                    type: 'rpcResult',
                                    callId: msg.callId,
                                    ok: false,
                                    errorMessage: err instanceof Error ? err.message : String(err),
                                });
                            }
                        });
                    return;
                }
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
                const execMeta = lastIpc?.executionMeta ?? (child.pid ? { IsMainThread: true, ProcessId: child.pid } : undefined);
                if (timedOut) {
                    finish({
                        Success: false,
                        TerminationReason: 'Timeout',
                        ErrorCode: 'ERR_PROCESS_TIMEOUT',
                        ErrorMessage: `Child process exceeded timeout limit (${timeoutMs} ms) and was terminated.`,
                        ExitCode: code,
                        Signal: signal,
                        ...(execMeta ? { ExecutionMetadata: execMeta } : {}),
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
                        ...(lastIpc.bodyOutcome ? { BodyOutcome: lastIpc.bodyOutcome as TOutcome } : {}),
                        ...(execMeta ? { ExecutionMetadata: execMeta } : {}),
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
                        ...(lastIpc.bodyOutcome ? { BodyOutcome: lastIpc.bodyOutcome as TOutcome } : {}),
                        ...(execMeta ? { ExecutionMetadata: execMeta } : {}),
                    });
                    return;
                }

                if (code === 0 && !signal) {
                    finish({
                        Success: true,
                        TerminationReason: 'Completed',
                        Output: {},
                        ExitCode: 0,
                        ...(execMeta ? { ExecutionMetadata: execMeta } : {}),
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
                    ...(execMeta ? { ExecutionMetadata: execMeta } : {}),
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
