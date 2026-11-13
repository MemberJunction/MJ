/**
 * @fileoverview Worker-thread entry point for {@link EmbeddingWorkerHost}: answers each call with
 * {@link HandleEmbeddingRequest}. The model loads and runs on this thread, so inference never
 * blocks the event loop that serves requests (MJ #5510).
 *
 * @module @memberjunction/ai-local-embeddings
 */

import { ServeWorkerRequests } from './ServeWorkerRequests.js';
import { HandleEmbeddingRequest } from './EmbeddingWorkerHandler.js';
import type { EmbeddingWorkerCall } from './EmbeddingWorkerProtocol.js';

ServeWorkerRequests<EmbeddingWorkerCall, Float32Array[]>((call) => HandleEmbeddingRequest(call));
