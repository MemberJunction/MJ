/**
 * @fileoverview Worker-thread entry point for {@link VectorWorkerPool}.
 *
 * Runs only pure numeric work — the shared kernels, the clustering code from
 * `SimpleVectorService`, and optionally the native backend — so it needs none
 * of the MJ ClassFactory registrations a worker isolate does not share.
 *
 * @module @memberjunction/ai-vectors-memory-server
 */

import { parentPort, workerData } from 'node:worker_threads';
import { ScoredRows, SearchRows, SimpleVectorService } from '@memberjunction/ai-vectors-memory';
import { NativeVectorBackend } from '../NativeVectorBackend';
import type { VectorWorkerData, WorkerRequest, WorkerResponse, WorkerSearchRequest } from './VectorWorkerProtocol';

const settings = workerData as VectorWorkerData | undefined;
if (settings?.LoadNative) {
  NativeVectorBackend.Instance.Load();
}

/** Native exact search when requested, applicable and verified; otherwise the JS kernel over the spec's rows. */
function runSearch(request: WorkerSearchRequest): ScoredRows {
  const { View: view, Spec: spec } = request;
  if (request.NativeThreads > 0) {
    const native = NativeVectorBackend.Instance.SearchRows(view, spec, request.NativeThreads);
    if (native) return native;
  }
  return SearchRows(view, spec);
}

function handle(request: WorkerRequest): { Response: WorkerResponse; Transfer: ArrayBuffer[] } {
  if (request.Kind === 'search') {
    const result = runSearch(request);
    return {
      Response: { TaskID: request.TaskID, Ok: true, Kind: 'search', Rows: result.Rows, Scores: result.Scores },
      Transfer: [result.Rows.buffer as ArrayBuffer, result.Scores.buffer as ArrayBuffer],
    };
  }
  const result = SimpleVectorService.RunClusterJob(request.Job);
  return { Response: { TaskID: request.TaskID, Ok: true, Kind: 'cluster', Result: result }, Transfer: [] };
}

parentPort?.on('message', (request: WorkerRequest) => {
  try {
    const { Response, Transfer } = handle(request);
    parentPort!.postMessage(Response, Transfer);
  } catch (e) {
    const response: WorkerResponse = { TaskID: request.TaskID, Ok: false, Error: e instanceof Error ? e.message : String(e) };
    parentPort!.postMessage(response);
  }
});
