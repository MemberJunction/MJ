import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker, type ResourceLimits } from 'node:worker_threads';
import {
    RegisterSpreadsheetWorkerRunner,
    type SpreadsheetCellEditContext,
    type WorkbookSpec
} from '@memberjunction/core-entities';
import type { SpreadsheetWorkerReply, SpreadsheetWorkerRequest } from './SpreadsheetWorkerEntry';

/** Default wall-clock timeout for server-side isolated spreadsheet worker execution (`R6-1`). */
export const DEFAULT_SPREADSHEET_WORKER_TIMEOUT_MS = 10_000;

/** Default V8 heap limits applied to each isolated spreadsheet worker (`R6-1`). */
export const DEFAULT_SPREADSHEET_WORKER_RESOURCE_LIMITS: Readonly<ResourceLimits> = {
    maxOldGenerationSizeMb: 256,
    maxYoungGenerationSizeMb: 64
};

export interface SpreadsheetWorkerExecutionOptions {
    TimeoutMs?: number;
    ResourceLimits?: ResourceLimits;
    WorkerEntryPath?: string;
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

function executeInIsolatedWorker(
    request: SpreadsheetWorkerRequest,
    options?: SpreadsheetWorkerExecutionOptions
): Promise<SpreadsheetWorkerReply> {
    const entryPath = options?.WorkerEntryPath ?? resolveDefaultWorkerEntryPath();
    if (!existsSync(entryPath)) {
        return Promise.reject(new Error(`Spreadsheet worker entry script does not exist: '${entryPath}'.`));
    }
    const timeoutMs = options?.TimeoutMs ?? DEFAULT_SPREADSHEET_WORKER_TIMEOUT_MS;
    const resourceLimits: ResourceLimits = {
        ...DEFAULT_SPREADSHEET_WORKER_RESOURCE_LIMITS,
        ...(options?.ResourceLimits ?? {})
    };

    return new Promise<SpreadsheetWorkerReply>((resolve, reject) => {
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
            if (outcome.ok && 'reply' in outcome) {
                resolve(outcome.reply);
            } else if ('err' in outcome) {
                reject(outcome.err);
            }
        };

        timer = setTimeout(() => {
            void worker.terminate();
            finish({
                ok: false,
                err: new Error(`Spreadsheet worker timed out after ${timeoutMs}ms (op='${request.op}').`)
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
                        `Spreadsheet worker exited unexpectedly (code=${code}, op='${request.op}').`
                    )
                });
            }
        });
    });
}

/**
 * Runs {@link SpreadsheetEngine.ImportFromXlsxBytes} inside a heap-bounded, wall-clock-timed
 * `node:worker_threads` worker (`R6-1`).
 */
export async function RunSpreadsheetImportInWorker(
    bytes: Uint8Array,
    configurationJson?: string | null,
    options?: SpreadsheetWorkerExecutionOptions
): Promise<WorkbookSpec> {
    const reply = await executeInIsolatedWorker(
        { op: 'import', bytes, configurationJson: configurationJson ?? null },
        options
    );
    if (!reply.ok) {
        throw new Error('error' in reply ? reply.error : 'Spreadsheet worker failed to import.');
    }
    if (!reply.workbook) {
        throw new Error('Spreadsheet worker returned empty workbook.');
    }
    return reply.workbook;
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
    const reply = await executeInIsolatedWorker({ op: 'patch', originalBytes, workbook }, options);
    if (!reply.ok) {
        throw new Error('error' in reply ? reply.error : 'Spreadsheet worker failed to patch.');
    }
    if (!reply.bytes) {
        throw new Error('Spreadsheet worker returned empty bytes.');
    }
    return reply.bytes instanceof Uint8Array ? reply.bytes : new Uint8Array(reply.bytes);
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
    const reply = await executeInIsolatedWorker({ op: 'evaluate', workbook, editContext }, options);
    if (!reply.ok) {
        throw new Error('error' in reply ? reply.error : 'Spreadsheet worker failed to evaluate.');
    }
    if (!reply.workbook) {
        throw new Error('Spreadsheet worker returned empty evaluation result.');
    }
    return {
        Workbook: reply.workbook,
        EvaluatedFormulaCount: reply.evaluatedFormulaCount ?? 0
    };
}

/**
 * Registers the server-side `node:worker_threads` runner with {@link SpreadsheetEngine} (`R6-1`).
 */
export function RegisterSpreadsheetServerWorkerRunner(options?: SpreadsheetWorkerExecutionOptions): void {
    RegisterSpreadsheetWorkerRunner({
        ImportFromXlsxBytes: (bytes, config) => RunSpreadsheetImportInWorker(bytes, config, options),
        PatchXlsxBytes: (origBytes, wb) => RunSpreadsheetPatchInWorker(origBytes, wb, options),
        EvaluateWorkbook: (wb, ctx) => RunSpreadsheetEvaluateInWorker(wb, ctx, options)
    });
}
