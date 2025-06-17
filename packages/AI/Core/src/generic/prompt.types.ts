/**
 * @fileoverview Type definitions for AI prompt execution results.
 * 
 * This module contains type definitions for prompt execution results that are
 * shared between AI packages to avoid circular dependencies.
 * 
 * @module @memberjunction/ai
 * @author MemberJunction.com
 * @since 2.50.0
 */

import { ChatResult } from './chat.types';

/**
 * Execution status enumeration for better type safety
 */
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Cancellation reason enumeration
 */
export type CancellationReason = 'user_requested' | 'timeout' | 'error' | 'resource_limit';

/**
 * Model information type for consistent usage across results
 */
export interface ModelInfo {
  modelId: string;
  modelName: string;
  vendorId?: string;
  vendorName?: string;
  powerRank?: number;
  modelType?: string;
}

/**
 * Judge metadata type for consistent usage
 */
export interface JudgeMetadata {
  judgePromptId: string;
  judgeExecutionTimeMS: number;
  judgeTokensUsed?: number;
  judgeCancelled?: boolean;
  judgeErrorMessage?: string;
}

/**
 * Extended validation result with detailed information about validation attempts
 */
export interface ValidationAttempt {
  /** Attempt number (1-based) */
  attemptNumber: number;
  /** Whether this attempt passed validation */
  success: boolean;
  /** Error message if validation failed */
  errorMessage?: string;
  /** Detailed validation errors */
  validationErrors?: any[];
  /** Raw output that was validated */
  rawOutput: string;
  /** Parsed output if successful */
  parsedOutput?: unknown;
  /** Timestamp of this validation attempt */
  timestamp: Date;
}

/**
 * Result of an AI prompt execution with generic type for the result
 */
export interface AIPromptRunResult<T = unknown> {
  /**
   * Whether the execution was successful
   */
  success: boolean;

  /**
   * Current execution status
   */
  status?: ExecutionStatus;

  /**
   * Whether the execution was cancelled
   */
  cancelled?: boolean;

  /**
   * Reason for cancellation if applicable
   */
  cancellationReason?: CancellationReason;

  /**
   * The raw result from the AI model
   */
  rawResult?: string;

  /**
   * The parsed/validated result based on OutputType
   */
  result?: T;

  /**
   * The ChatResult object containing the full response from the AI model, many
   * of the properties of this object are included in the result object
   */
  chatResult: ChatResult;

  /**
   * Error message if execution failed
   */
  errorMessage?: string;

  /**
   * The AIPromptRun entity that was created for tracking
   */
  promptRun?: any;

  /**
   * Total execution time in milliseconds
   */
  executionTimeMS?: number;

  /**
   * Number of tokens used in the prompt/input.
   * This follows the ModelUsage convention from @memberjunction/ai
   */
  promptTokens?: number;

  /**
   * Number of tokens generated in the completion/output.
   * This follows the ModelUsage convention from @memberjunction/ai
   */
  completionTokens?: number;

  /**
   * Total tokens used (promptTokens + completionTokens).
   * Note: This is a computed value - when creating objects, you don't need to set this.
   * @deprecated Use promptTokens and completionTokens separately for clarity
   */
  tokensUsed?: number;

  /**
   * For hierarchical prompts: Combined prompt tokens including all child prompts.
   * This provides a rollup of all prompt tokens used in the entire execution tree.
   */
  combinedPromptTokens?: number;

  /**
   * For hierarchical prompts: Combined completion tokens including all child prompts.
   * This provides a rollup of all completion tokens generated in the entire execution tree.
   */
  combinedCompletionTokens?: number;

  /**
   * For hierarchical prompts: Combined total tokens (combinedPromptTokens + combinedCompletionTokens).
   * Note: This is a computed value - when creating objects, you don't need to set this.
   * @deprecated Use combinedPromptTokens and combinedCompletionTokens separately for clarity
   */
  combinedTokensUsed?: number;

  /**
   * Cost of this execution if provided by the AI provider.
   * The currency is specified in the costCurrency field.
   */
  cost?: number;

  /**
   * ISO 4217 currency code for the cost field.
   * Examples: 'USD', 'EUR', 'GBP', 'JPY', etc.
   */
  costCurrency?: string;

  /**
   * For hierarchical prompts: Combined cost including all child prompts.
   * This provides a rollup of all costs in the entire execution tree.
   * The currency should match the costCurrency field.
   */
  combinedCost?: number;

  /**
   * Validation result if output validation was performed
   */
  validationResult?: any;

  /**
   * Detailed information about all validation attempts made
   */
  validationAttempts?: ValidationAttempt[];

  /**
   * Additional results from parallel execution, ranked by judge
   * Index 0 = second best, Index 1 = third best, etc.
   * (The best result is the main result object itself)
   */
  additionalResults?: AIPromptRunResult<T>[];

  /**
   * Ranking assigned by judge (1 = best, 2 = second best, etc.)
   */
  ranking?: number;

  /**
   * Judge's rationale for this ranking
   */
  judgeRationale?: string;

  /**
   * Model information for this result
   */
  modelInfo?: ModelInfo;

  /**
   * Metadata about the judging process (only present on the main result)
   */
  judgeMetadata?: JudgeMetadata;

  /**
   * Whether streaming was used for this execution
   */
  wasStreamed?: boolean;

  /**
   * Cache information if caching was involved
   */
  cacheInfo?: {
    cacheHit: boolean;
    cacheKey?: string;
    cacheSource?: string;
  };
}