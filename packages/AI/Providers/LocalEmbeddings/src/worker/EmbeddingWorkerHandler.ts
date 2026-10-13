/**
 * @fileoverview Answers one embedding-worker request. All the worker's logic lives here so it can
 * be tested in-process; `EmbeddingWorker.ts` is only the thread wiring.
 *
 * @module @memberjunction/ai-local-embeddings
 */

import { ApplyEmbeddingSettings, ClearEmbeddingPipelines, EmbedTextsWithModel, PreloadEmbeddingModel } from '../models/embeddingRuntime';
import type { EmbeddingWorkerRequest, EmbeddingWorkerResponse } from './EmbeddingWorkerProtocol';

/** The model operations a request can call; swapped for fakes in tests. */
export interface EmbeddingRuntimeOperations {
  ApplySettings: typeof ApplyEmbeddingSettings;
  Embed: typeof EmbedTextsWithModel;
  Preload: typeof PreloadEmbeddingModel;
  Clear: typeof ClearEmbeddingPipelines;
}

const DEFAULT_OPERATIONS: EmbeddingRuntimeOperations = {
  ApplySettings: ApplyEmbeddingSettings,
  Embed: EmbedTextsWithModel,
  Preload: PreloadEmbeddingModel,
  Clear: ClearEmbeddingPipelines,
};

/** The response to post, plus the buffers to transfer with it rather than copy. */
export interface HandledEmbeddingRequest {
  Response: EmbeddingWorkerResponse;
  Transfer: ArrayBuffer[];
}

/** Runs one request. Never throws: a failure becomes an `Ok: false` response. */
export async function HandleEmbeddingRequest(
  request: EmbeddingWorkerRequest,
  operations: EmbeddingRuntimeOperations = DEFAULT_OPERATIONS,
): Promise<HandledEmbeddingRequest> {
  try {
    switch (request.Kind) {
      case 'embed': {
        operations.ApplySettings(request.Settings);
        const vectors = await operations.Embed(request.Model, request.Texts);
        return { Response: { ID: request.ID, Ok: true, Vectors: vectors }, Transfer: transferablesOf(vectors) };
      }
      case 'preload':
        operations.ApplySettings(request.Settings);
        await operations.Preload(request.Model);
        return { Response: { ID: request.ID, Ok: true, Vectors: [] }, Transfer: [] };
      case 'clear':
        operations.Clear();
        return { Response: { ID: request.ID, Ok: true, Vectors: [] }, Transfer: [] };
      default:
        return failure((request as { ID: number }).ID, 'Unknown embedding worker request');
    }
  } catch (error) {
    return failure(request.ID, error instanceof Error ? error.message : String(error));
  }
}

function failure(id: number, message: string): HandledEmbeddingRequest {
  return { Response: { ID: id, Ok: false, Error: message }, Transfer: [] };
}

/** Each vector's own buffer, deduplicated (a transfer list may not name a buffer twice). */
function transferablesOf(vectors: Float32Array[]): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  for (const vector of vectors) {
    if (vector.buffer instanceof ArrayBuffer) {
      buffers.add(vector.buffer);
    }
  }
  return Array.from(buffers);
}
