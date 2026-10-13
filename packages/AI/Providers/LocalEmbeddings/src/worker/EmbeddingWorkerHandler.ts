/**
 * @fileoverview Answers one embedding-worker call. All the worker's logic lives here so it can be
 * tested in-process; `EmbeddingWorker.ts` is only the thread wiring.
 *
 * @module @memberjunction/ai-local-embeddings
 */

import type { WorkerAnswer } from '@memberjunction/worker-host';
import { ApplyEmbeddingSettings, ClearEmbeddingPipelines, EmbedTextsWithModel, PreloadEmbeddingModel } from '../models/embeddingRuntime';
import type { EmbeddingWorkerCall } from './EmbeddingWorkerProtocol';

/** The model operations a call can use; swapped for fakes in tests. */
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

/**
 * Runs one call. The vectors' buffers are transferred back rather than copied. Throws when the
 * model fails to load or inference fails; the worker turns that into a failed response.
 */
export async function HandleEmbeddingRequest(
  call: EmbeddingWorkerCall,
  operations: EmbeddingRuntimeOperations = DEFAULT_OPERATIONS,
): Promise<WorkerAnswer<Float32Array[]>> {
  switch (call.Kind) {
    case 'embed': {
      operations.ApplySettings(call.Settings);
      const vectors = await operations.Embed(call.Model, call.Texts);
      return { Result: vectors, Transfer: transferablesOf(vectors) };
    }
    case 'preload':
      operations.ApplySettings(call.Settings);
      await operations.Preload(call.Model);
      return { Result: [] };
    case 'clear':
      operations.Clear();
      return { Result: [] };
    default:
      throw new Error(`Unknown embedding worker call: ${(call as { Kind: string }).Kind}`);
  }
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
