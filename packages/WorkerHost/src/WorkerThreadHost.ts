/**
 * @fileoverview Runs CPU-heavy server work on one long-lived worker thread so it cannot block the
 * event loop that serves requests.
 *
 * MJAPI serves every HTTP request and WebSocket from one event loop. Synchronous work on it (model
 * inference, HTML and PDF parsing) holds every request on the process until it finishes (MJ #5510).
 * A {@link WorkerThreadHost} subclass moves one such kind of work onto a worker thread:
 *
 * - **One worker per host**, started on first use and reused. It is `unref`'d while idle, so it
 *   never keeps a process alive.
 * - **A dead worker** (it errored or exited) rejects every pending call, and the next call starts
 *   a new one.
 * - **After {@link MAX_CRASHES} deaths within {@link CRASH_WINDOW_MS}** the host disables itself
 *   for the life of the process. {@link IsAvailable} then returns false and callers run the work
 *   in-process, as they did before the worker existed.
 * - **An environment switch** (`Options.InProcessEnvVar` set to `true`) keeps the work in-process.
 *
 * The worker script answers calls with {@link ServeWorkerRequests}.
 *
 * @module @memberjunction/worker-host
 */

import { existsSync } from 'node:fs';
import { Worker, type TransferListItem } from 'node:worker_threads';
import { BaseSingleton } from '@memberjunction/global';
import type { WorkerRequest, WorkerResponse } from './WorkerProtocol';

/** Worker deaths within {@link CRASH_WINDOW_MS} that disable the host. */
export const MAX_CRASHES = 3;
/** The window, in milliseconds, in which {@link MAX_CRASHES} deaths disable the host. */
export const CRASH_WINDOW_MS = 60_000;

/** What a subclass tells the host about its worker. */
export interface WorkerThreadHostOptions {
  /** Names the worker in errors, e.g. `'Embedding worker'` → "Embedding worker stopped (…)". */
  Name: string;
  /** An environment variable that, set to `true` / `1` / `yes`, keeps the work in-process. */
  InProcessEnvVar: string;
  /**
   * Absolute path of the worker script. Resolve it in the subclass's own module so it points
   * beside the compiled subclass: `fileURLToPath(new URL('./MyWorker.js', import.meta.url))`.
   */
  ScriptPath: string;
  /** Prefixes the one warning logged when the host disables itself, e.g. `'[LocalEmbedding]'`. */
  LogPrefix: string;
  /** What callers do instead once the host is disabled, e.g. `'Running embeddings on the main thread'`. */
  FallbackDescription: string;
}

interface PendingCall<TResult> {
  Resolve: (result: TResult) => void;
  Reject: (error: Error) => void;
}

/**
 * Base class for a singleton that sends `TCall`s to a worker thread and resolves with its
 * `TResult`. A subclass passes its {@link WorkerThreadHostOptions} to the constructor, exposes
 * `static get Instance()`, and overrides {@link TransferListFor} when a call carries buffers that
 * should move to the worker instead of being copied.
 */
export abstract class WorkerThreadHost<TCall extends object, TResult> extends BaseSingleton<WorkerThreadHost<TCall, TResult>> {
  private readonly options: WorkerThreadHostOptions;
  private worker: Worker | null = null;
  private pending = new Map<number, PendingCall<TResult>>();
  private nextID = 1;
  private crashTimes: number[] = [];
  private disabledReason: string | null = null;
  private scriptPathOverride: string | null = null;

  protected constructor(options: WorkerThreadHostOptions) {
    super();
    this.options = options;
  }

  /** The worker script: the override set by {@link UseScriptPath}, or `Options.ScriptPath`. */
  public get ScriptPath(): string {
    return this.scriptPathOverride ?? this.options.ScriptPath;
  }

  /** Points the host at a different worker script and resets its state. For tests. */
  public UseScriptPath(scriptPath: string | null): void {
    this.terminateWorker();
    this.scriptPathOverride = scriptPath;
    this.crashTimes = [];
    this.disabledReason = null;
  }

  /** True when calls can go to the worker. When false, callers run the work in-process. */
  public get IsAvailable(): boolean {
    if (IsTruthyEnvValue(process.env[this.options.InProcessEnvVar])) {
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

  /** Why the host disabled itself, or null while it is healthy. */
  public get DisabledReason(): string | null {
    return this.disabledReason;
  }

  /**
   * Sends a call to the worker. Resolves with its result; rejects with the error the worker hit,
   * or when the worker dies before answering. Buffers named by {@link TransferListFor} are
   * transferred, so the caller can no longer use them afterwards.
   */
  public Run(call: TCall): Promise<TResult> {
    const id = this.nextID++;
    const worker = this.ensureWorker();
    const request: WorkerRequest<TCall> = { ...call, ID: id };
    return new Promise<TResult>((resolve, reject) => {
      this.pending.set(id, { Resolve: resolve, Reject: reject });
      worker.ref();
      worker.postMessage(request, this.TransferListFor(call));
    });
  }

  /** Stops the worker. Pending calls are rejected. */
  public async Shutdown(): Promise<void> {
    const worker = this.worker;
    this.rejectAll(new Error(`${this.options.Name} shut down`));
    this.worker = null;
    if (worker) {
      await worker.terminate();
    }
  }

  /** The buffers to transfer to the worker with `call` rather than copy. None by default. */
  protected TransferListFor(_call: TCall): TransferListItem[] {
    return [];
  }

  private ensureWorker(): Worker {
    if (this.worker) {
      return this.worker;
    }
    const worker = new Worker(this.ScriptPath);
    worker.on('message', (response: WorkerResponse<TResult>) => this.onResponse(worker, response));
    worker.on('error', (error: Error) => this.onWorkerDied(worker, `error: ${error.message}`));
    worker.on('exit', (code: number) => this.onWorkerDied(worker, `exited with code ${code}`));
    worker.unref();
    this.worker = worker;
    return worker;
  }

  private onResponse(worker: Worker, response: WorkerResponse<TResult>): void {
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
      call.Resolve(response.Result);
    }
  }

  /** A worker that errors or exits is gone either way; both events can fire for one death. */
  private onWorkerDied(worker: Worker, reason: string): void {
    if (this.worker !== worker) {
      return;
    }
    this.worker = null;
    this.rejectAll(new Error(`${this.options.Name} stopped (${reason})`));
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
    this.rejectAll(new Error(`${this.options.Name} replaced`));
    if (worker) {
      void worker.terminate();
    }
  }

  private disable(reason: string): void {
    if (this.disabledReason === null) {
      this.disabledReason = reason;
      console.warn(`${this.options.LogPrefix} ${this.options.FallbackDescription}: ${reason}`);
    }
  }
}

/** True for `true`, `1` or `yes`, in any case. */
export function IsTruthyEnvValue(value: string | undefined): boolean {
  return value !== undefined && ['true', '1', 'yes'].includes(value.toLowerCase());
}
