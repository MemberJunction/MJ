import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker, type ResourceLimits } from 'node:worker_threads';
import {
    RegisterSpreadsheetWorkerRunner,
    SetSpreadsheetWorkerIsolationRequired,
    type SpreadsheetCellEditContext,
    type WorkbookSpec
} from '@memberjunction/core-entities';
import { GetGlobalObjectStore } from '@memberjunction/global';
import type { SpreadsheetWorkerReply, SpreadsheetWorkerRequest } from './SpreadsheetWorkerEntry';

/** Default wall-clock timeout for server-side isolated spreadsheet worker execution (`R6-1`). */
export const DEFAULT_SPREADSHEET_WORKER_TIMEOUT_MS = 10_000;

/** Default maximum concurrent spreadsheet workers per server process (`R7-3`). */
export const DEFAULT_MAX_CONCURRENT_SPREADSHEET_WORKERS = 4;

/** Default maximum queued spreadsheet worker requests before backpressure rejection (`R7-3`). */
export const DEFAULT_MAX_QUEUED_SPREADSHEET_WORKERS = 32;

/** Default maximum time a queued worker request will wait for a pool slot before rejecting (`R8`). */
export const DEFAULT_SPREADSHEET_WORKER_QUEUE_WAIT_TIMEOUT_MS = 10_000;

/** Default V8 heap limits applied to each isolated spreadsheet worker (`R6-1`). */
export const DEFAULT_SPREADSHEET_WORKER_RESOURCE_LIMITS: Readonly<ResourceLimits> = {
    maxOldGenerationSizeMb: 256,
    maxYoungGenerationSizeMb: 64
};

export interface SpreadsheetWorkerExecutionOptions {
    TimeoutMs?: number;
    QueueWaitTimeoutMs?: number;
    ResourceLimits?: ResourceLimits;
    WorkerEntryPath?: string;
    MaxConcurrentWorkers?: number;
    MaxQueuedWorkers?: number;
}

interface WorkerPoolWaiter {
    settled: boolean;
    resolve: () => void;
    reject: (err: Error) => void;
}

interface WorkerPoolState {
    ActiveCount: number;
    WaitQueue: WorkerPoolWaiter[];
}

const SPREADSHEET_WORKER_POOL_KEY = '___MJ_SPREADSHEET_WORKER_POOL_STATE___';

function getWorkerPoolState(): WorkerPoolState {
    const store = GetGlobalObjectStore();
    let state = store?.[SPREADSHEET_WORKER_POOL_KEY] as WorkerPoolState | undefined;
    if (!state) {
        state = { ActiveCount: 0, WaitQueue: [] };
        if (store) {
            store[SPREADSHEET_WORKER_POOL_KEY] = state;
        }
    }
    return state;
}

async function acquireWorkerSlot(
    maxConcurrent: number,
    maxQueued: number,
    queueWaitTimeoutMs: number
): Promise<() => void> {
    const state = getWorkerPoolState();
    const normalizedMaxConcurrent = Math.max(1, Math.floor(maxConcurrent));
    const normalizedMaxQueued = Math.max(0, Math.floor(maxQueued));
    const normalizedWaitTimeoutMs = Math.max(1, Math.floor(queueWaitTimeoutMs));

    if (state.ActiveCount >= normalizedMaxConcurrent) {
        if (state.WaitQueue.length >= normalizedMaxQueued) {
            throw new Error(
                `Spreadsheet worker pool queue is full (active=${state.ActiveCount}/${normalizedMaxConcurrent}, queued=${state.WaitQueue.length}/${normalizedMaxQueued}).`
            );
        }
        await new Promise<void>((resolve, reject) => {
            const entry: WorkerPoolWaiter = {
                settled: false,
                resolve: () => {
                    if (entry.settled) return;
                    entry.settled = true;
                    clearTimeout(waitTimer);
                    resolve();
                },
                reject: (err: Error) => {
                    if (entry.settled) return;
                    entry.settled = true;
                    clearTimeout(waitTimer);
                    reject(err);
                }
            };
            const waitTimer = setTimeout(() => {
                const idx = state.WaitQueue.indexOf(entry);
                if (idx !== -1) {
                    state.WaitQueue.splice(idx, 1);
                }
                entry.reject(
                    new Error(`Spreadsheet worker pool queue wait timed out after ${normalizedWaitTimeoutMs}ms.`)
                );
            }, normalizedWaitTimeoutMs);
            waitTimer.unref?.();
            state.WaitQueue.push(entry);
        });
    } else {
        state.ActiveCount++;
    }

    let released = false;
    return () => {
        if (released) {
            return;
        }
        released = true;
        while (state.WaitQueue.length > 0) {
            const nextWaiter = state.WaitQueue.shift()!;
            if (!nextWaiter.settled) {
                // Transfer the occupied active slot directly to the next live queued caller
                nextWaiter.resolve();
                return;
            }
        }
        state.ActiveCount = Math.max(0, state.ActiveCount - 1);
    };
}

function resolveDefaultWorkerEntryPath(): string {
    const adjacentJs = fileURLToPath(new URL('./SpreadsheetWorkerEntry.js', import.meta.url));
    if (existsSync(adjacentJs)) {
        return adjacentJs;
    }
    const distFallback = fileURLToPath(new URL('../../dist/custom/SpreadsheetWorkerEntry.js', import.meta.url));
    if (existsSync(distFallback)) {
        return distFallback;
    }
    throw new Error(
        `Spreadsheet worker isolation entry point not found (checked '${adjacentJs}' and '${distFallback}'). Run build for @memberjunction/core-entities-server first.`
    );
}

async function executeInIsolatedWorker(
    request: SpreadsheetWorkerRequest,
    options?: SpreadsheetWorkerExecutionOptions
): Promise<SpreadsheetWorkerReply> {
    const entryPath = options?.WorkerEntryPath ?? resolveDefaultWorkerEntryPath();
    if (!existsSync(entryPath)) {
        throw new Error(`Spreadsheet worker entry script does not exist: '${entryPath}'.`);
    }
    const maxConcurrent = options?.MaxConcurrentWorkers ?? DEFAULT_MAX_CONCURRENT_SPREADSHEET_WORKERS;
    const maxQueued = options?.MaxQueuedWorkers ?? DEFAULT_MAX_QUEUED_SPREADSHEET_WORKERS;
    const queueWaitTimeoutMs = options?.QueueWaitTimeoutMs ?? DEFAULT_SPREADSHEET_WORKER_QUEUE_WAIT_TIMEOUT_MS;
    const releaseSlot = await acquireWorkerSlot(maxConcurrent, maxQueued, queueWaitTimeoutMs);
    let terminatePromise: Promise<number> | null = null;

    try {
        const timeoutMs = options?.TimeoutMs ?? DEFAULT_SPREADSHEET_WORKER_TIMEOUT_MS;
        const resourceLimits: ResourceLimits = {
            ...DEFAULT_SPREADSHEET_WORKER_RESOURCE_LIMITS,
            ...(options?.ResourceLimits ?? {})
        };

        return await new Promise<SpreadsheetWorkerReply>((resolve, reject) => {
            let settled = false;
            let timer: NodeJS.Timeout | null = null;
            let worker: Worker;
            try {
                worker = new Worker(entryPath, {
                    workerData: request,
                    resourceLimits
                });
            } catch (err) {
                reject(err instanceof Error ? err : new Error(String(err)));
                return;
            }

            const finish = (outcome: { ok: true; reply: SpreadsheetWorkerReply } | { ok: false; err: Error }): void => {
                if (settled) {
                    return;
                }
                settled = true;
                if (timer !== null) {
                    clearTimeout(timer);
                    timer = null;
                }
                try {
                    terminatePromise = worker.terminate();
                } catch {
                    // Ignore termination errors after worker exit
                }
                if (outcome.ok && 'reply' in outcome) {
                    resolve(outcome.reply);
                } else if ('err' in outcome) {
                    reject(outcome.err);
                }
            };

            timer = setTimeout(() => {
                finish({
                    ok: false,
                    err: new Error(`Spreadsheet worker timed out after ${timeoutMs}ms (op='${request.Op}').`)
                });
            }, timeoutMs);
            timer.unref?.();

            worker.once('message', (reply: SpreadsheetWorkerReply) => {
                finish({ ok: true, reply });
            });
            worker.once('error', (err: Error) => {
                finish({ ok: false, err });
            });
            worker.once('exit', (code: number) => {
                if (!settled) {
                    finish({
                        ok: false,
                        err: new Error(
                            `Spreadsheet worker exited unexpectedly (code=${code}, op='${request.Op}').`
                        )
                    });
                }
            });
        });
    } finally {
        if (terminatePromise) {
            await (terminatePromise as Promise<number>).catch(() => undefined);
        }
        releaseSlot();
    }
}

/**
 * Runs {@link SpreadsheetEngine.ImportFromXlsxBytes} inside a heap-bounded, wall-clock-timed
 * `node:worker_threads` worker (`R6-1`).
 */
export async function RunSpreadsheetImportInWorker(
    bytes: Uint8Array,
    configurationJson?: string | null,
    options?: SpreadsheetWorkerExecutionOptions & { SkipEvaluate?: boolean }
): Promise<WorkbookSpec> {
    const reply = await executeInIsolatedWorker(
        {
            Op: 'import',
            Bytes: bytes,
            ConfigurationJson: configurationJson ?? null,
            ...(options?.SkipEvaluate !== undefined ? { SkipEvaluate: options.SkipEvaluate } : {})
        },
        options
    );
    if (!reply.Ok) {
        throw new Error('Error' in reply ? reply.Error : 'Spreadsheet worker failed to import.');
    }
    if (!reply.Workbook) {
        throw new Error('Spreadsheet worker returned empty workbook.');
    }
    return reply.Workbook;
}

/**
 * Runs {@link SpreadsheetEngine.PatchXlsxBytes} inside a heap-bounded, wall-clock-timed
 * `node:worker_threads` worker (`R6-1`).
 */
export async function RunSpreadsheetPatchInWorker(
    originalBytes: Uint8Array,
    workbook: WorkbookSpec,
    options?: SpreadsheetWorkerExecutionOptions
): Promise<Uint8Array> {
    const reply = await executeInIsolatedWorker({ Op: 'patch', OriginalBytes: originalBytes, Workbook: workbook }, options);
    if (!reply.Ok) {
        throw new Error('Error' in reply ? reply.Error : 'Spreadsheet worker failed to patch.');
    }
    if (!reply.Bytes) {
        throw new Error('Spreadsheet worker returned empty bytes.');
    }
    return reply.Bytes instanceof Uint8Array ? reply.Bytes : new Uint8Array(reply.Bytes);
}

/**
 * Runs {@link SpreadsheetEngine.EvaluateWorkbook} inside a heap-bounded, wall-clock-timed
 * `node:worker_threads` worker (`R6-1`).
 */
export async function RunSpreadsheetEvaluateInWorker(
    workbook: WorkbookSpec,
    editContext?: SpreadsheetCellEditContext,
    options?: SpreadsheetWorkerExecutionOptions
): Promise<{ Workbook: WorkbookSpec; EvaluatedFormulaCount: number }> {
    const reply = await executeInIsolatedWorker({ Op: 'evaluate', Workbook: workbook, EditContext: editContext }, options);
    if (!reply.Ok) {
        throw new Error('Error' in reply ? reply.Error : 'Spreadsheet worker failed to evaluate.');
    }
    if (!reply.Workbook) {
        throw new Error('Spreadsheet worker returned empty evaluation result.');
    }
    return {
        Workbook: reply.Workbook,
        EvaluatedFormulaCount: reply.EvaluatedFormulaCount ?? 0
    };
}

/**
 * Registers the server-side `node:worker_threads` runner with {@link SpreadsheetEngine} (`R6-1`, `R8-3`).
 */
export function RegisterSpreadsheetServerWorkerRunner(options?: SpreadsheetWorkerExecutionOptions): void {
    SetSpreadsheetWorkerIsolationRequired(true);
    RegisterSpreadsheetWorkerRunner({
        ImportFromXlsxBytes: (bytes, config, importOpts) =>
            RunSpreadsheetImportInWorker(
                bytes,
                config,
                importOpts ? { ...(options ?? {}), ...importOpts } : options
            ),
        PatchXlsxBytes: (origBytes, wb) => RunSpreadsheetPatchInWorker(origBytes, wb, options),
        EvaluateWorkbook: (wb, ctx) => RunSpreadsheetEvaluateInWorker(wb, ctx, options)
    });
}
