/**
 * @fileoverview Worker-thread entry point for {@link EmbeddingWorkerHost}: answers each call with
 * {@link HandleEmbeddingRequest}. The model loads and runs on this thread, so inference never
 * blocks the event loop that serves requests (MJ #5510).
 *
 * @module @memberjunction/ai-local-embeddings
 */

import { ServeWorkerRequests } from '@memberjunction/worker-host';
import { HandleEmbeddingRequest } from './EmbeddingWorkerHandler';
import type { EmbeddingWorkerCall } from './EmbeddingWorkerProtocol';

ServeWorkerRequests<EmbeddingWorkerCall, Float32Array[]>((call) => HandleEmbeddingRequest(call));
