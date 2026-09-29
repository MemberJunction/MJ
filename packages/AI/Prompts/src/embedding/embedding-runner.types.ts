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
  /** Model information for the model that answered (alias matching AIModelRunResult) */
  modelInfo?: ModelInfo;
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
   * Optional: specific AIPrompt ID for this embedding operation (type=Embedding).
   * If not provided, uses the first active Embedding prompt found.
   */
  PromptID?: string;
  /** Optional: specific model ID to use. If not provided, uses the prompt's model configuration. */
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
}
