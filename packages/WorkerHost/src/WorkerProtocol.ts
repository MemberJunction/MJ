/**
 * @fileoverview The messages a {@link WorkerThreadHost} and its worker thread exchange. Every
 * request carries an `ID` the host assigns; every response echoes it, with either the result or
 * the error the worker hit.
 *
 * @module @memberjunction/worker-host
 */

import type { TransferListItem } from 'node:worker_threads';

/** A call as the host posts it: the caller's call plus the ID the host assigned. */
export type WorkerRequest<TCall> = TCall & { ID: number };

/** The worker finished the call. */
export interface WorkerSuccess<TResult> {
  ID: number;
  Ok: true;
  Result: TResult;
}

/** The call failed inside the worker (the handler threw). */
export interface WorkerFailure {
  ID: number;
  Ok: false;
  Error: string;
}

export type WorkerResponse<TResult> = WorkerSuccess<TResult> | WorkerFailure;

/**
 * What a worker's handler returns for one call: the result, and the buffers to transfer with it
 * rather than copy (a transferred buffer is unusable on the sending side afterwards).
 */
export interface WorkerAnswer<TResult> {
  Result: TResult;
  Transfer?: TransferListItem[];
}

/** The worker-side logic for one call. May throw; the throw becomes a {@link WorkerFailure}. */
export type WorkerRequestHandler<TCall, TResult> = (call: TCall) => Promise<WorkerAnswer<TResult>>;
