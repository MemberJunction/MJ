/**
 * @fileoverview Owns the worker thread that runs local embedding models.
 *
 * Local embedding inference is CPU-bound and, with onnxruntime-node 1.14, synchronous native code:
 * run on the main thread, a batch blocks every HTTP request and WebSocket on the process for
 * seconds (MJ #5510). This host runs it on one long-lived worker thread instead. The worker loads
 * each model once and keeps it, so the first-use model load leaves the main thread too.
 *
 * One worker is enough: onnxruntime already spreads one inference across cores, and a second
 * worker would load a second copy of every model. The lifecycle (restart after a crash, fall back
 * to in-process after repeated crashes) comes from {@link WorkerThreadHost}.
 *
 * @module @memberjunction/ai-local-embeddings
 */

import { fileURLToPath } from 'node:url';
import { WorkerThreadHost } from '@memberjunction/worker-host';
import type { EmbeddingWorkerCall } from './EmbeddingWorkerProtocol';

/** Set to `true` to run local embeddings on the calling thread (the pre-worker behavior). */
export const LOCAL_EMBEDDINGS_IN_PROCESS_ENV = 'MJ_LOCAL_EMBEDDINGS_IN_PROCESS';

/** Runs {@link EmbeddingWorkerCall}s on the embedding worker. `Run` resolves with the vectors (empty for `clear` / `preload`). */
export class EmbeddingWorkerHost extends WorkerThreadHost<EmbeddingWorkerCall, Float32Array[]> {
  protected constructor() {
    super({
      Name: 'Embedding worker',
      InProcessEnvVar: LOCAL_EMBEDDINGS_IN_PROCESS_ENV,
      ScriptPath: fileURLToPath(new URL('./EmbeddingWorker.js', import.meta.url)),
      LogPrefix: '[LocalEmbedding]',
      FallbackDescription: 'Running embeddings on the main thread',
    });
  }

  public static get Instance(): EmbeddingWorkerHost {
    return super.getInstance<EmbeddingWorkerHost>();
  }
}
