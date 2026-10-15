import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type { ModelInfo } from '@memberjunction/ai-core-plus';

/**
 * Result of an embedding execution via AIEmbeddingRunner.
 */
export interface EmbeddingRunResult {
  /** Whether the embedding call succeeded */
  Success: boolean;
  /** The embedding vectors (one per input text) */
  Vectors: number[][];
  /** The AIPromptRun ID created for tracking */
  PromptRunID: string | null;
  /** Total tokens used */
  TokensUsed: number;
  /** Cost of the call */
  Cost: number;
  /** Error message if failed */
  ErrorMessage: string | null;
  /** Execution time in milliseconds */
  ExecutionTimeMs: number;
  /** Model information for the model that answered */
  ModelInfo?: ModelInfo;
  /** Model ID of the model that answered */
  ModelID?: string;
  /** Model name of the model that answered */
  ModelName?: string;
}

/**
 * Parameters for executing an embedding call via AIEmbeddingRunner.
 */
export interface EmbeddingRunParams {
  /** The texts to embed */
  Texts: string[];
  /**
   * Optional: the AIPrompt (type Embedding) this call runs under. Its model configuration picks the
   * model when `ModelID` is not given, its failover and retry settings apply, and the run row is
   * recorded against it. When omitted, the first active Embedding prompt is used, so name your
   * prompt here to keep its costs separate. When no Embedding prompt exists at all, the call still
   * runs (with the entity's default settings) but writes no run row.
   */
  PromptID?: string;
  /**
   * Optional: the model to embed with. When given, only this model's vendors are tried, so every
   * vector comes from this model. **Pass it whenever the vectors will be compared with stored
   * vectors** (a vector index, persisted embeddings, a cache): without it the call may answer from
   * any Embeddings model the prompt falls back to.
   */
  ModelID?: string;
  /** The user context for permissions and audit */
  ContextUser: UserInfo;
  /** Optional: parent run ID (e.g., agent run, classification run) for hierarchical tracking */
  ParentRunID?: string;
  /** Optional: human-readable description for the AIPromptRun record */
  Description?: string;
  /**
   * Optional: reduced embedding dimensions. Forwarded to the embedding provider's EmbedTexts call
   * for models that support dimension reduction (e.g. OpenAI text-embedding-3-*); ignored by
   * models that don't. The authoritative source is `MJ: Vector Indexes.Dimensions` — callers
   * should read it from there and pass it here.
   */
  Dimensions?: number;
  /** Optional metadata provider override */
  Provider?: IMetadataProvider;
  /**
   * Optional: skip the `MJ: AI Prompt Runs` row for this call. Defaults to false: the row is written.
   * Each call otherwise costs two fire-and-forget saves (the INSERT, then the finalize UPDATE). They
   * add no latency, but they do add load, so a high-volume caller such as interactive vector search
   * can opt out. When skipped, `PromptRunID` in the result is null.
   */
  SkipRunRecord?: boolean;
  /**
   * Optional: a bound, in milliseconds, on each driver call, as `AIPromptParams.timeoutMS` bounds
   * each chat call: every failover candidate gets its own. A call that runs longer is aborted (the
   * driver is handed the bound's signal) and fails with an `AIPromptTimeoutError`, which reads as a
   * network error and so fails over. Unset or not positive means no bound.
   */
  TimeoutMS?: number;
  /**
   * Optional: cancels the call, as `AIPromptParams.cancellationToken` cancels a chat call. A token
   * already aborted refuses the call before a run row exists. Aborted during the call, it aborts the
   * driver's request, ends the call before any further failover candidate, and the run row is
   * recorded as `Cancelled`.
   */
  CancellationToken?: AbortSignal;
}
