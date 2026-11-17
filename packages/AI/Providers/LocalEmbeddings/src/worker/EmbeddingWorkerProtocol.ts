/**
 * @fileoverview The calls {@link EmbeddingWorkerHost} sends to the embedding worker thread. The
 * request/response envelope around them comes from `./WorkerProtocol`.
 *
 * @module @memberjunction/ai-local-embeddings
 */

/** transformers.js settings applied before a model loads. */
export interface EmbeddingSettings {
  CacheDir?: string;
  LocalURL?: string;
}

/** Embed texts with a model. Resolves with one vector per text, in order, and the tokens consumed. */
export interface EmbedCall {
  Kind: 'embed';
  Model: string;
  Texts: string[];
  /** Truncate each text to this many tokens before embedding; the model's own limit applies when unset. */
  MaxInputTokens?: number;
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
