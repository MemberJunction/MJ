/**
 * @fileoverview Messages exchanged between {@link VectorWorkerPool} and its
 * worker threads. Every typed array in a request is backed by a
 * `SharedArrayBuffer` (or is small and copied), so posting a request never
 * copies a store.
 *
 * @module @memberjunction/ai-vectors-memory-server
 */

import type { VectorClusterJob, VectorClusterJobResult, VectorRowsView, VectorSearchSpec } from '@memberjunction/ai-vectors-memory';

/** Search one partition of a store. */
export interface WorkerSearchRequest {
  Kind: 'search';
  View: VectorRowsView;
  Spec: VectorSearchSpec;
  /**
   * usearch threads for an unfiltered whole-store search, or 0 to use only
   * the JS kernels. Native search always covers the whole store (see
   * `NativeVectorBackend.SearchRows`), so such a search is never partitioned.
   */
  NativeThreads: number;
}

/** Run a whole clustering job. */
export interface WorkerClusterRequest {
  Kind: 'cluster';
  Job: VectorClusterJob;
}

export type WorkerRequestBody = WorkerSearchRequest | WorkerClusterRequest;

/** A request as posted, tagged so the response can be matched to it. */
export type WorkerRequest = WorkerRequestBody & { TaskID: number };

export interface WorkerSearchResponse {
  TaskID: number;
  Ok: true;
  Kind: 'search';
  Rows: Int32Array;
  Scores: Float64Array;
}

export interface WorkerClusterResponse {
  TaskID: number;
  Ok: true;
  Kind: 'cluster';
  Result: VectorClusterJobResult;
}

export interface WorkerErrorResponse {
  TaskID: number;
  Ok: false;
  Error: string;
}

export type WorkerResponse = WorkerSearchResponse | WorkerClusterResponse | WorkerErrorResponse;

/** `workerData` passed when a worker starts. */
export interface VectorWorkerData {
  LoadNative: boolean;
}

export function IsErrorResponse(response: WorkerResponse): response is WorkerErrorResponse {
  return response.Ok === false;
}

export function IsSearchResponse(response: WorkerResponse): response is WorkerSearchResponse {
  return response.Ok === true && (response as WorkerSearchResponse).Kind === 'search';
}

export function IsClusterResponse(response: WorkerResponse): response is WorkerClusterResponse {
  return response.Ok === true && (response as WorkerClusterResponse).Kind === 'cluster';
}
