/**
 * @fileoverview The calls {@link EmbeddingWorkerHost} sends to the embedding worker thread. The
 * request/response envelope around them comes from `@memberjunction/worker-host`.
 *
 * @module @memberjunction/ai-local-embeddings
 */

/** transformers.js settings applied before a model loads. */
export interface EmbeddingSettings {
  CacheDir?: string;
  LocalURL?: string;
}

/** Embed texts with a model. Resolves with one vector per text, in order. */
export interface EmbedCall {
  Kind: 'embed';
  Model: string;
  Texts: string[];
  Settings: EmbeddingSettings;
}

/** Drop the worker's loaded pipelines. Resolves with no vectors. */
export interface ClearCall {
  Kind: 'clear';
}

/** Load a model ahead of its first use. Resolves with no vectors. */
export interface PreloadCall {
  Kind: 'preload';
  Model: string;
  Settings: EmbeddingSettings;
}

export type EmbeddingWorkerCall = EmbedCall | ClearCall | PreloadCall;
