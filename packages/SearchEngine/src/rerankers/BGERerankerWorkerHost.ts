/**
 * @fileoverview Reusable `worker_threads` host for {@link BGEReRanker}, keeping ONNX model
 * loading and cross-encoder inference off the main Node.js event loop (mirroring
 * `EmbeddingWorkerHost` in `@memberjunction/ai-local-embeddings`).
 *
 * @module @memberjunction/search-engine
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { BaseSingleton } from '@memberjunction/global';
import type { BGEWorkerCall, BGEWorkerRequest, BGEWorkerResponse } from './BGERerankerWorkerProtocol.js';

/** Set to `'true'`, `'1'`, or `'yes'` to run BGE reranking in-process instead of on the worker thread. */
export const BGE_RERANKER_IN_PROCESS_ENV = 'MJ_BGE_RERANKER_IN_PROCESS';

/** Default per-call timeout budget (ms) before the host terminates a stalled worker and falls back. */
export const DEFAULT_BGE_RERANKER_TIMEOUT_MS = 30_000;

/** Worker deaths within {@link BGE_CRASH_WINDOW_MS} that disable the worker host for this process. */
export const BGE_MAX_CRASHES = 3;

/** Sliding window (ms) for {@link BGE_MAX_CRASHES}. */
export const BGE_CRASH_WINDOW_MS = 60_000;

interface PendingCall {
    Resolve: (scores: number[]) => void;
    Reject: (error: Error) => void;
    Timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Manages one long-lived worker thread for BGE cross-encoder reranking.
 * Idle workers are `unref()`'d so they never prevent clean process exit.
 */
export class BGERerankerWorkerHost extends BaseSingleton<BGERerankerWorkerHost> {
    private readonly defaultScriptPath = fileURLToPath(new URL('./BGERerankerWorker.js', import.meta.url));
    private worker: Worker | null = null;
    private pending = new Map<number, PendingCall>();
    private nextID = 1;
    private crashTimes: number[] = [];
    private disabledReason: string | null = null;
    private scriptPathOverride: string | null = null;

    protected constructor() {
        super();
    }

    public static get Instance(): BGERerankerWorkerHost {
        return super.getInstance<BGERerankerWorkerHost>();
    }

    /** The worker script path (override from {@link UseScriptPath} or compiled sibling `BGERerankerWorker.js`). */
    public get ScriptPath(): string {
        return this.scriptPathOverride ?? this.defaultScriptPath;
    }

    /** Points the host at a custom worker script and resets crash/disable state. Intended for tests. */
    public UseScriptPath(scriptPath: string | null): void {
        this.terminateWorker(new Error('BGE reranker worker replaced'));
        this.scriptPathOverride = scriptPath;
        this.crashTimes = [];
        this.disabledReason = null;
    }

    /** True when calls can be dispatched to the worker thread; false triggers in-process execution. */
    public get IsAvailable(): boolean {
        const envFlag = process.env[BGE_RERANKER_IN_PROCESS_ENV];
        if (envFlag !== undefined && ['true', '1', 'yes'].includes(envFlag.toLowerCase())) {
            return false;
        }
        if (this.disabledReason !== null) {
            return false;
        }
        if (!existsSync(this.ScriptPath)) {
            this.disable(`worker script not found at ${this.ScriptPath}`);
            return false;
        }
        return true;
    }

    /** Why the host disabled itself, or `null` while healthy. */
    public get DisabledReason(): string | null {
        return this.disabledReason;
    }

    /**
     * Dispatches a call to the worker thread, enforcing an optional timeout budget.
     * On timeout, terminates the stalled worker so future requests get a clean worker.
     */
    public Run(call: BGEWorkerCall, timeoutMs: number = DEFAULT_BGE_RERANKER_TIMEOUT_MS): Promise<number[]> {
        const id = this.nextID++;
        const worker = this.ensureWorker();
        const request: BGEWorkerRequest<BGEWorkerCall> = { ...call, ID: id };

        return new Promise<number[]>((resolve, reject) => {
            let timer: ReturnType<typeof setTimeout> | null = null;
            if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
                timer = setTimeout(() => {
                    const entry = this.pending.get(id);
                    if (!entry) {
                        return;
                    }
                    this.pending.delete(id);
                    this.terminateWorkerForTimeout(worker, timeoutMs);
                    reject(new Error(`BGE reranker worker timed out after ${timeoutMs}ms`));
                }, timeoutMs);
                timer.unref?.();
            }

            this.pending.set(id, { Resolve: resolve, Reject: reject, Timer: timer });
            worker.ref();
            worker.postMessage(request);
        });
    }

    /** Stops the worker thread and rejects any in-flight calls. */
    public async Shutdown(): Promise<void> {
        const worker = this.worker;
        this.worker = null;
        this.rejectAll(new Error('BGE reranker worker shut down'));
        if (worker) {
            await worker.terminate();
        }
    }

    private ensureWorker(): Worker {
        if (this.worker) {
            return this.worker;
        }
        const worker = new Worker(this.ScriptPath);
        worker.on('message', (response: BGEWorkerResponse<number[]>) => this.onResponse(worker, response));
        worker.on('error', (error: Error) => this.onWorkerDied(worker, `error: ${error.message}`));
        worker.on('exit', (code: number) => this.onWorkerDied(worker, `exited with code ${code}`));
        worker.unref();
        this.worker = worker;
        return worker;
    }

    private onResponse(worker: Worker, response: BGEWorkerResponse<number[]>): void {
        const call = this.pending.get(response.ID);
        if (!call) {
            return;
        }
        this.pending.delete(response.ID);
        if (call.Timer) {
            clearTimeout(call.Timer);
        }
        if (this.pending.size === 0) {
            worker.unref();
        }
        if ('Error' in response) {
            call.Reject(new Error(response.Error));
        } else {
            call.Resolve(response.Result);
        }
    }

    private onWorkerDied(worker: Worker, reason: string): void {
        if (this.worker !== worker) {
            return;
        }
        this.worker = null;
        this.rejectAll(new Error(`BGE reranker worker stopped (${reason})`));
        this.recordCrash(reason);
    }

    private recordCrash(reason: string): void {
        const now = Date.now();
        this.crashTimes = this.crashTimes.filter((t) => now - t < BGE_CRASH_WINDOW_MS);
        this.crashTimes.push(now);
        if (this.crashTimes.length >= BGE_MAX_CRASHES) {
            this.disable(`${this.crashTimes.length} worker crashes in ${BGE_CRASH_WINDOW_MS / 1000}s (last: ${reason})`);
        }
    }

    private rejectAll(error: Error): void {
        const calls = Array.from(this.pending.values());
        this.pending.clear();
        for (const call of calls) {
            if (call.Timer) {
                clearTimeout(call.Timer);
            }
            call.Reject(error);
        }
    }

    private terminateWorker(reason: Error): void {
        const worker = this.worker;
        this.worker = null;
        this.rejectAll(reason);
        if (worker) {
            void worker.terminate();
        }
    }

    private terminateWorkerForTimeout(timedOutWorker: Worker, timeoutMs: number): void {
        if (this.worker === timedOutWorker) {
            this.worker = null;
            this.rejectAll(new Error(`BGE reranker worker recycled after ${timeoutMs}ms timeout`));
        }
        void timedOutWorker.terminate();
    }

    private disable(reason: string): void {
        if (this.disabledReason === null) {
            this.disabledReason = reason;
            console.warn(`[BGEReRanker] Running reranking on the main thread: ${reason}`);
        }
    }
}
