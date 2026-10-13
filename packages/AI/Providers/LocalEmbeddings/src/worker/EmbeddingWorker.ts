/**
 * @fileoverview Worker-thread entry point for {@link EmbeddingWorkerHost}: answers each request
 * with {@link HandleEmbeddingRequest}. The model loads and runs on this thread, so inference never
 * blocks the event loop that serves requests (MJ #5510).
 *
 * @module @memberjunction/ai-local-embeddings
 */

import { parentPort } from 'node:worker_threads';
import { HandleEmbeddingRequest } from './EmbeddingWorkerHandler';
import type { EmbeddingWorkerRequest } from './EmbeddingWorkerProtocol';

parentPort?.on('message', (request: EmbeddingWorkerRequest) => {
  void HandleEmbeddingRequest(request).then(({ Response, Transfer }) => {
    parentPort!.postMessage(Response, Transfer);
  });
});
