/**
 * @fileoverview Messages between {@link EmbeddingWorkerHost} and the embedding worker thread.
 *
 * @module @memberjunction/ai-local-embeddings
 */

/** transformers.js settings applied before a model loads. */
export interface EmbeddingSettings {
  CacheDir?: string;
  LocalURL?: string;
}

/** Embed texts with a model. */
export interface EmbedRequest {
  ID: number;
  Kind: 'embed';
  Model: string;
  Texts: string[];
  Settings: EmbeddingSettings;
}

/** Drop the worker's loaded pipelines. */
export interface ClearRequest {
  ID: number;
  Kind: 'clear';
}

/** Load a model ahead of its first use. */
export interface PreloadRequest {
  ID: number;
  Kind: 'preload';
  Model: string;
  Settings: EmbeddingSettings;
}

export type EmbeddingWorkerRequest = EmbedRequest | ClearRequest | PreloadRequest;

/** A request that succeeded. `Vectors` is empty for anything but `embed`. */
export interface EmbeddingWorkerSuccess {
  ID: number;
  Ok: true;
  Vectors: Float32Array[];
}

/** A request that failed inside the worker (the model failed to load, inference threw). */
export interface EmbeddingWorkerFailure {
  ID: number;
  Ok: false;
  Error: string;
}

export type EmbeddingWorkerResponse = EmbeddingWorkerSuccess | EmbeddingWorkerFailure;
