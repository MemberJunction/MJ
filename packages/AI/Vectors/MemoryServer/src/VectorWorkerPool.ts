/**
 * @fileoverview A small pool of worker threads for vector search and
 * clustering.
 *
 * Workers are started on demand up to `PoolSize`, read store memory through
 * `SharedArrayBuffer`s (no copying), and are `unref`'d while idle so they
 * never keep a process alive. A task that runs past `TaskTimeoutMs` is
 * rejected and its worker replaced. A worker that crashes is replaced too;
 * if workers keep crashing, the pool disables itself and callers fall back to
 * in-process execution rather than failing.
 *
 * @module @memberjunction/ai-vectors-memory-server
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { BaseSingleton } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import { VectorAccelerationSettings } from './VectorAccelerationSettings';
import { IsErrorResponse } from './worker/VectorWorkerProtocol';
import type { VectorWorkerData, WorkerRequest, WorkerRequestBody, WorkerResponse } from './worker/VectorWorkerProtocol';

/** Crashes within {@link CRASH_WINDOW_MS} that disable the pool. */
const MAX_CRASHES = 5;
const CRASH_WINDOW_MS = 60_000;

interface PendingTask {
  Request: WorkerRequest;
  Resolve: (response: WorkerResponse) => void;
  Reject: (error: Error) => void;
}

interface PoolWorker {
  Worker: Worker;
  Current: PendingTask | null;
  Timer: ReturnType<typeof setTimeout> | null;
  /** The timeout the current task was started with (settings may change while it runs) */
  TimeoutMs: number;
}

export class VectorWorkerPool extends BaseSingleton<VectorWorkerPool> {
  private workers: PoolWorker[] = [];
  private queue: PendingTask[] = [];
  private nextTaskID = 1;
  private crashTimes: number[] = [];
  private disabledReason: string | null = null;
  private scriptChecked: string | null = null;
  private shuttingDown = false;

  protected constructor() {
    super();
  }

  public static get Instance(): VectorWorkerPool {
    return super.getInstance<VectorWorkerPool>();
  }

  /** The worker script this pool starts: the configured path, or the one beside this module. */
  public get ScriptPath(): string {
    return VectorAccelerationSettings.Instance.Options.WorkerScriptPath
      ?? fileURLToPath(new URL('./worker/VectorComputeWorker.js', import.meta.url));
  }

  /** True when tasks can be sent to workers. */
  public get IsAvailable(): boolean {
    if (this.disabledReason !== null || VectorAccelerationSettings.Instance.Options.PoolSize <= 0) return false;
    const script = this.ScriptPath;
    if (this.scriptChecked !== script) {
      if (!existsSync(script)) {
        this.disable(`worker script not found at ${script}`);
        return false;
      }
      this.scriptChecked = script;
    }
    return true;
  }

  /** Why the pool disabled itself, or null while it is healthy. */
  public get DisabledReason(): string | null {
    return this.disabledReason;
  }

  /** Workers currently running. */
  public get WorkerCount(): number {
    return this.workers.length;
  }

  /**
   * Runs a task on a worker. Resolves with the worker's response; rejects if
   * the worker reports an error, crashes, or exceeds the task timeout.
   */
  public Run(body: WorkerRequestBody): Promise<WorkerResponse> {
    if (!this.IsAvailable) {
      return Promise.reject(new Error(`Vector worker pool unavailable: ${this.disabledReason ?? 'pool size is 0'}`));
    }
    return new Promise<WorkerResponse>((resolve, reject) => {
      const request: WorkerRequest = { ...body, TaskID: this.nextTaskID++ };
      this.queue.push({ Request: request, Resolve: resolve, Reject: reject });
      this.dispatch();
    });
  }

  /** Terminates every worker and rejects queued tasks. The pool restarts on the next {@link Run}. */
  public async Shutdown(): Promise<void> {
    this.shuttingDown = true;
    const queued = this.queue.splice(0);
    queued.forEach(task => task.Reject(new Error('Vector worker pool shut down')));
    const workers = this.workers.splice(0);
    await Promise.all(workers.map(w => {
      this.clearTimer(w);
      w.Current?.Reject(new Error('Vector worker pool shut down'));
      return w.Worker.terminate();
    }));
    this.shuttingDown = false;
  }

  /** Clears a disabled state (for tests, or after fixing the cause). */
  public Reset(): void {
    this.disabledReason = null;
    this.scriptChecked = null;
    this.crashTimes = [];
  }

  private dispatch(): void {
    while (this.queue.length > 0) {
      const worker = this.workers.find(w => w.Current === null) ?? this.spawnIfRoom();
      if (!worker) return;
      this.assign(worker, this.queue.shift()!);
    }
  }

  private assign(worker: PoolWorker, task: PendingTask): void {
    worker.Current = task;
    worker.Worker.ref(); // keep the process alive while a caller awaits this task
    worker.TimeoutMs = VectorAccelerationSettings.Instance.Options.TaskTimeoutMs;
    worker.Timer = setTimeout(() => this.timeOut(worker), worker.TimeoutMs);
    worker.Timer.unref();
    worker.Worker.postMessage(task.Request);
  }

  private spawnIfRoom(): PoolWorker | null {
    if (this.workers.length >= VectorAccelerationSettings.Instance.Options.PoolSize) return null;
    const workerData: VectorWorkerData = { LoadNative: VectorAccelerationSettings.Instance.Options.UseNative };
    const poolWorker: PoolWorker = { Worker: new Worker(this.ScriptPath, { workerData }), Current: null, Timer: null, TimeoutMs: 0 };
    poolWorker.Worker.unref();
    poolWorker.Worker.on('message', (response: WorkerResponse) => this.onMessage(poolWorker, response));
    poolWorker.Worker.on('error', (error: Error) => this.onFailure(poolWorker, error));
    poolWorker.Worker.on('exit', (code: number) => {
      if (!this.shuttingDown) this.onFailure(poolWorker, new Error(`vector worker exited with code ${code}`));
    });
    this.workers.push(poolWorker);
    return poolWorker;
  }

  private onMessage(worker: PoolWorker, response: WorkerResponse): void {
    const task = worker.Current;
    if (!task || task.Request.TaskID !== response.TaskID) return;
    this.release(worker);
    if (IsErrorResponse(response)) {
      task.Reject(new Error(response.Error));
    } else {
      task.Resolve(response);
    }
    this.dispatch();
  }

  private timeOut(worker: PoolWorker): void {
    const task = worker.Current;
    if (!task) return;
    this.remove(worker);
    task.Reject(new Error(`vector worker task exceeded ${worker.TimeoutMs} ms`));
    void worker.Worker.terminate();
    this.dispatch();
  }

  /** A crash or unexpected exit: fail its task, drop the worker, and disable the pool if it keeps happening. */
  private onFailure(worker: PoolWorker, error: Error): void {
    if (!this.workers.includes(worker)) return;
    const task = worker.Current;
    this.remove(worker);
    task?.Reject(error);
    LogError(`Vector worker failed: ${error.message}`);
    const now = Date.now();
    this.crashTimes = this.crashTimes.filter(t => now - t < CRASH_WINDOW_MS);
    this.crashTimes.push(now);
    if (this.crashTimes.length >= MAX_CRASHES) {
      this.disable(`${MAX_CRASHES} worker failures within ${CRASH_WINDOW_MS / 1000}s`);
      return;
    }
    this.dispatch();
  }

  private release(worker: PoolWorker): void {
    this.clearTimer(worker);
    worker.Current = null;
    worker.Worker.unref();
  }

  private remove(worker: PoolWorker): void {
    this.clearTimer(worker);
    worker.Current = null;
    this.workers = this.workers.filter(w => w !== worker);
  }

  private clearTimer(worker: PoolWorker): void {
    if (worker.Timer) clearTimeout(worker.Timer);
    worker.Timer = null;
  }

  private disable(reason: string): void {
    if (this.disabledReason !== null) return;
    this.disabledReason = reason;
    LogError(`Vector worker pool disabled (${reason}); vector work will run in-process`);
    const queued = this.queue.splice(0);
    queued.forEach(task => task.Reject(new Error(`Vector worker pool disabled: ${reason}`)));
  }
}
