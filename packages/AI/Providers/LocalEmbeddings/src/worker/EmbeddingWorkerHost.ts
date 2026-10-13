/**
 * @fileoverview Owns the worker thread that runs local embedding models.
 *
 * Local embedding inference is CPU-bound and, with onnxruntime-node 1.14, synchronous native code:
 * run on the main thread, a batch blocks every HTTP request and WebSocket on the process for
 * seconds (MJ #5510). This host runs it on one long-lived worker thread instead. The worker loads
 * each model once and keeps it, so the first-use model load leaves the main thread too.
 *
 * One worker is enough: onnxruntime already spreads one inference across cores, and a second
 * worker would load a second copy of every model. The worker is `unref`'d while idle so it never
 * keeps a process alive. If it dies, pending requests are rejected and the next request starts a
 * new one; after {@link MAX_CRASHES} deaths within {@link CRASH_WINDOW_MS} the host disables itself
 * and callers run in-process, as they did before the worker existed.
 *
 * @module @memberjunction/ai-local-embeddings
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { BaseSingleton } from '@memberjunction/global';
import type { EmbeddingWorkerRequest, EmbeddingWorkerResponse } from './EmbeddingWorkerProtocol';

/** Deaths within {@link CRASH_WINDOW_MS} that disable the worker. */
const MAX_CRASHES = 3;
const CRASH_WINDOW_MS = 60_000;

/** Set to `true` to run local embeddings on the calling thread (the pre-worker behavior). */
export const LOCAL_EMBEDDINGS_IN_PROCESS_ENV = 'MJ_LOCAL_EMBEDDINGS_IN_PROCESS';

/** A request as callers write it; the host assigns the ID. */
export type EmbeddingWorkerCall = WithoutID<EmbeddingWorkerRequest>;
type WithoutID<T> = T extends { ID: number } ? Omit<T, 'ID'> : never;

interface PendingCall {
  Resolve: (vectors: Float32Array[]) => void;
  Reject: (error: Error) => void;
}

export class EmbeddingWorkerHost extends BaseSingleton<EmbeddingWorkerHost> {
  private worker: Worker | null = null;
  private pending = new Map<number, PendingCall>();
  private nextID = 1;
  private crashTimes: number[] = [];
  private disabledReason: string | null = null;
  private scriptPathOverride: string | null = null;

  protected constructor() {
    super();
  }

  public static get Instance(): EmbeddingWorkerHost {
    return super.getInstance<EmbeddingWorkerHost>();
  }

  /** The worker script: the override, or `EmbeddingWorker.js` beside this module. */
  public get ScriptPath(): string {
    return this.scriptPathOverride ?? fileURLToPath(new URL('./EmbeddingWorker.js', import.meta.url));
  }

  /** Points the host at a different worker script and resets its state. For tests. */
  public UseScriptPath(scriptPath: string | null): void {
    this.terminateWorker();
    this.scriptPathOverride = scriptPath;
    this.crashTimes = [];
    this.disabledReason = null;
  }

  /** True when requests can go to the worker. When false, callers run in-process. */
  public get IsAvailable(): boolean {
    if (isTruthy(process.env[LOCAL_EMBEDDINGS_IN_PROCESS_ENV])) {
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

  /** Why the worker disabled itself, or null while it is healthy. */
  public get DisabledReason(): string | null {
    return this.disabledReason;
  }

  /**
   * Sends a request to the worker. Resolves with the vectors (empty for anything but `embed`);
   * rejects with the worker's error, or when the worker dies before answering.
   */
  public Run(call: EmbeddingWorkerCall): Promise<Float32Array[]> {
    const id = this.nextID++;
    const worker = this.ensureWorker();
    return new Promise<Float32Array[]>((resolve, reject) => {
      this.pending.set(id, { Resolve: resolve, Reject: reject });
      worker.ref();
      worker.postMessage({ ...call, ID: id });
    });
  }

  /** Stops the worker. Pending requests are rejected. */
  public async Shutdown(): Promise<void> {
    const worker = this.worker;
    this.rejectAll(new Error('Embedding worker shut down'));
    this.worker = null;
    if (worker) {
      await worker.terminate();
    }
  }

  private ensureWorker(): Worker {
    if (this.worker) {
      return this.worker;
    }
    const worker = new Worker(this.ScriptPath);
    worker.on('message', (response: EmbeddingWorkerResponse) => this.onResponse(worker, response));
    worker.on('error', (error: Error) => this.onWorkerDied(worker, `error: ${error.message}`));
    worker.on('exit', (code: number) => this.onWorkerDied(worker, `exited with code ${code}`));
    worker.unref();
    this.worker = worker;
    return worker;
  }

  private onResponse(worker: Worker, response: EmbeddingWorkerResponse): void {
    const call = this.pending.get(response.ID);
    if (!call) {
      return;
    }
    this.pending.delete(response.ID);
    if (this.pending.size === 0) {
      worker.unref();
    }
    if ('Error' in response) {
      call.Reject(new Error(response.Error));
    } else {
      call.Resolve(response.Vectors);
    }
  }

  /** A worker that errors or exits is gone either way; both events can fire for one death. */
  private onWorkerDied(worker: Worker, reason: string): void {
    if (this.worker !== worker) {
      return;
    }
    this.worker = null;
    this.rejectAll(new Error(`Embedding worker stopped (${reason})`));
    this.recordCrash(reason);
  }

  private recordCrash(reason: string): void {
    const now = Date.now();
    this.crashTimes = this.crashTimes.filter((t) => now - t < CRASH_WINDOW_MS);
    this.crashTimes.push(now);
    if (this.crashTimes.length >= MAX_CRASHES) {
      this.disable(`${this.crashTimes.length} worker crashes in ${CRASH_WINDOW_MS / 1000}s (last: ${reason})`);
    }
  }

  private rejectAll(error: Error): void {
    const calls = Array.from(this.pending.values());
    this.pending.clear();
    for (const call of calls) {
      call.Reject(error);
    }
  }

  private terminateWorker(): void {
    const worker = this.worker;
    this.worker = null;
    this.rejectAll(new Error('Embedding worker replaced'));
    if (worker) {
      void worker.terminate();
    }
  }

  private disable(reason: string): void {
    if (this.disabledReason === null) {
      this.disabledReason = reason;
      console.warn(`[LocalEmbedding] Running embeddings on the main thread: ${reason}`);
    }
  }
}

function isTruthy(value: string | undefined): boolean {
  return value !== undefined && ['true', '1', 'yes'].includes(value.toLowerCase());
}
