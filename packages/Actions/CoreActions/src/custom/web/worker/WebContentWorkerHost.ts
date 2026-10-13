/**
 * @fileoverview Owns the worker thread that converts fetched HTML and PDFs for
 * {@link WebPageContentAction}.
 *
 * jsdom, turndown and pdf-parse are synchronous. On a real page they held MJAPI's event loop for
 * 1.4s (HTML to Markdown) and 0.7s (one PDF) in a live profile, during which every HTTP request and
 * WebSocket on the process waited (MJ #5510). This host runs them on one long-lived worker thread.
 * The page text goes over as a string and the PDF bytes are transferred; only the (truncated)
 * result comes back.
 *
 * The worker is `unref`'d while idle so it never keeps a process alive. If it dies, pending
 * requests are rejected and the next request starts a new one; after {@link MAX_CRASHES} deaths
 * within {@link CRASH_WINDOW_MS} the host disables itself and the action converts in-process, as
 * it did before the worker existed.
 *
 * Same shape as `EmbeddingWorkerHost` (@memberjunction/ai-local-embeddings) and
 * `VectorWorkerPool` (@memberjunction/ai-vectors-memory-server); there is no shared node-only
 * package for the three to live in yet.
 *
 * @module @memberjunction/core-actions
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { BaseSingleton } from '@memberjunction/global';
import type { WebContentWorkerRequest, WebContentWorkerResponse } from './WebContentWorkerProtocol';

/** Deaths within {@link CRASH_WINDOW_MS} that disable the worker. */
const MAX_CRASHES = 3;
const CRASH_WINDOW_MS = 60_000;

/** Set to `true` to convert web content on the calling thread (the pre-worker behavior). */
export const WEB_CONTENT_IN_PROCESS_ENV = 'MJ_WEB_CONTENT_IN_PROCESS';

/** A request as callers write it; the host assigns the ID. */
export type WebContentWorkerCall = WithoutID<WebContentWorkerRequest>;
type WithoutID<T> = T extends { ID: number } ? Omit<T, 'ID'> : never;

interface PendingCall {
  Resolve: (result: Record<string, unknown>) => void;
  Reject: (error: Error) => void;
}

export class WebContentWorkerHost extends BaseSingleton<WebContentWorkerHost> {
  private worker: Worker | null = null;
  private pending = new Map<number, PendingCall>();
  private nextID = 1;
  private crashTimes: number[] = [];
  private disabledReason: string | null = null;
  private scriptPathOverride: string | null = null;

  protected constructor() {
    super();
  }

  public static get Instance(): WebContentWorkerHost {
    return super.getInstance<WebContentWorkerHost>();
  }

  /** The worker script: the override, or `WebContentWorker.js` beside this module. */
  public get ScriptPath(): string {
    return this.scriptPathOverride ?? fileURLToPath(new URL('./WebContentWorker.js', import.meta.url));
  }

  /** Points the host at a different worker script and resets its state. For tests. */
  public UseScriptPath(scriptPath: string | null): void {
    this.terminateWorker();
    this.scriptPathOverride = scriptPath;
    this.crashTimes = [];
    this.disabledReason = null;
  }

  /** True when requests can go to the worker. When false, callers convert in-process. */
  public get IsAvailable(): boolean {
    if (isTruthy(process.env[WEB_CONTENT_IN_PROCESS_ENV])) {
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
   * Sends a request to the worker. Resolves with the converted result; rejects with the worker's
   * error, or when the worker dies before answering. A PDF's bytes are transferred: the caller's
   * `Data` is unusable afterwards.
   */
  public Run(call: WebContentWorkerCall): Promise<Record<string, unknown>> {
    const id = this.nextID++;
    const worker = this.ensureWorker();
    const transfer = call.Kind === 'pdf' && call.Data.buffer instanceof ArrayBuffer ? [call.Data.buffer] : [];
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      this.pending.set(id, { Resolve: resolve, Reject: reject });
      worker.ref();
      worker.postMessage({ ...call, ID: id }, transfer);
    });
  }

  /** Stops the worker. Pending requests are rejected. */
  public async Shutdown(): Promise<void> {
    const worker = this.worker;
    this.rejectAll(new Error('Web content worker shut down'));
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
    worker.on('message', (response: WebContentWorkerResponse) => this.onResponse(worker, response));
    worker.on('error', (error: Error) => this.onWorkerDied(worker, `error: ${error.message}`));
    worker.on('exit', (code: number) => this.onWorkerDied(worker, `exited with code ${code}`));
    worker.unref();
    this.worker = worker;
    return worker;
  }

  private onResponse(worker: Worker, response: WebContentWorkerResponse): void {
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
    this.rejectAll(new Error(`Web content worker stopped (${reason})`));
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
    this.rejectAll(new Error('Web content worker replaced'));
    if (worker) {
      void worker.terminate();
    }
  }

  private disable(reason: string): void {
    if (this.disabledReason === null) {
      this.disabledReason = reason;
      console.warn(`[WebPageContent] Converting web content on the main thread: ${reason}`);
    }
  }
}

function isTruthy(value: string | undefined): boolean {
  return value !== undefined && ['true', '1', 'yes'].includes(value.toLowerCase());
}
