/**
 * @fileoverview The work a vector worker thread does for one request.
 *
 * Kept apart from the thread wiring in `VectorComputeWorker` so the same code
 * can be exercised in-process. It runs only pure numeric work — the shared
 * kernels, the clustering code from `SimpleVectorService`, and optionally the
 * native backend — so it needs none of the MJ ClassFactory registrations a
 * worker isolate does not share.
 *
 * @module @memberjunction/ai-vectors-memory-server
 */

import { ScoredRows, SearchRows, SimpleVectorService } from '@memberjunction/ai-vectors-memory';
import { NativeVectorBackend } from '../NativeVectorBackend';
import type { WorkerRequest, WorkerResponse, WorkerSearchRequest } from './VectorWorkerProtocol';

/** A response plus the buffers to transfer (not copy) back to the pool. */
export interface HandledWorkerRequest {
  Response: WorkerResponse;
  Transfer: ArrayBuffer[];
}

/**
 * Runs one request. Never throws: a failure becomes an error response, which
 * the pool turns into a rejected task while the worker stays usable.
 */
export function HandleWorkerRequest(request: WorkerRequest): HandledWorkerRequest {
  try {
    if (request.Kind === 'search') {
      const result = runSearch(request);
      return {
        Response: { TaskID: request.TaskID, Ok: true, Kind: 'search', Rows: result.Rows, Scores: result.Scores },
        Transfer: [result.Rows.buffer as ArrayBuffer, result.Scores.buffer as ArrayBuffer],
      };
    }
    const result = SimpleVectorService.RunClusterJob(request.Job);
    return { Response: { TaskID: request.TaskID, Ok: true, Kind: 'cluster', Result: result }, Transfer: [] };
  } catch (e) {
    return {
      Response: { TaskID: request.TaskID, Ok: false, Error: e instanceof Error ? e.message : String(e) },
      Transfer: [],
    };
  }
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
