/**
 * @fileoverview The worker-thread side of a {@link WorkerThreadHost}: a worker script calls
 * {@link ServeWorkerRequests} once with its handler, and every request the host posts is answered
 * with the handler's result or the error it threw.
 *
 * @module @memberjunction/worker-host
 */

import { parentPort, type MessagePort, type TransferListItem } from 'node:worker_threads';
import type { WorkerRequest, WorkerRequestHandler, WorkerResponse } from './WorkerProtocol';

/** The response to post for one request, plus the buffers to transfer with it. */
export interface AnsweredWorkerRequest<TResult> {
  Response: WorkerResponse<TResult>;
  Transfer: TransferListItem[];
}

/**
 * Runs one request through the handler. Never throws: a handler that throws (or rejects) becomes
 * an `Ok: false` response carrying its message, so the host's caller sees the worker's error.
 */
export async function AnswerWorkerRequest<TCall, TResult>(
  request: WorkerRequest<TCall>,
  handler: WorkerRequestHandler<TCall, TResult>,
): Promise<AnsweredWorkerRequest<TResult>> {
  try {
    const answer = await handler(request);
    return { Response: { ID: request.ID, Ok: true, Result: answer.Result }, Transfer: answer.Transfer ?? [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { Response: { ID: request.ID, Ok: false, Error: message }, Transfer: [] };
  }
}

/**
 * Answers every request posted to this worker thread with `handler`. Call it once, at the top
 * level of the worker script. `port` defaults to the thread's `parentPort`; outside a worker
 * thread there is none and this does nothing.
 */
export function ServeWorkerRequests<TCall, TResult>(handler: WorkerRequestHandler<TCall, TResult>, port: MessagePort | null = parentPort): void {
  port?.on('message', (request: WorkerRequest<TCall>) => {
    void AnswerWorkerRequest(request, handler).then(({ Response, Transfer }) => port.postMessage(Response, Transfer));
  });
}
