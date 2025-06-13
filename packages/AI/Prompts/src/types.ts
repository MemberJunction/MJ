/**
 * @fileoverview Type definitions for the AI Prompts package.
 * 
 * This module contains all type definitions used throughout the AI Prompts system,
 * providing strongly-typed interfaces for prompt execution, results, callbacks,
 * and validation.
 * 
 * @module @memberjunction/ai-prompts
 * @author MemberJunction.com
 * @since 2.43.0
 */

import { ChatMessage, ChatResult } from '@memberjunction/ai';
import { AIPromptEntity, AIPromptRunEntity } from '@memberjunction/core-entities';
import { UserInfo, ValidationResult, ValidationErrorInfo } from '@memberjunction/core';

/**
 * Callback function type for execution progress updates
 */
export type ExecutionProgressCallback = (progress: {
  /** Current step in the execution process */
  step: 'template_rendering' | 'model_selection' | 'execution' | 'validation' | 'parallel_coordination' | 'result_selection';
  /** Progress percentage (0-100) */
  percentage: number;
  /** Human-readable status message */
  message: string;
  /** Additional metadata about the current step */
  metadata?: Record<string, unknown>;
}) => void;

/**
 * Callback function type for streaming content updates during execution
 */
export type ExecutionStreamingCallback = (chunk: {
  /** The content chunk received */
  content: string;
  /** Whether this is the final chunk */
  isComplete: boolean;
  /** Which task/model is producing this content (for parallel execution) */
  taskId?: string;
  /** Model name producing this content */
  modelName?: string;
}) => void;

/**
 * Template message role type for better type safety
 */
export type TemplateMessageRole = 'system' | 'user' | 'none';

/**
 * Represents a child prompt to be executed and embedded in a parent prompt
 */
export class ChildPromptParam {
  /**
   * The child prompt to execute - a full AIPromptParams that can contain its own child prompts
   */
  childPrompt: AIPromptParams;

  /**
   * The placeholder name in the parent template where this child's result will be inserted
   */
  parentPlaceholder: string;

  constructor(childPrompt: AIPromptParams, parentPlaceholder: string) {
    this.childPrompt = childPrompt;
    this.parentPlaceholder = parentPlaceholder;
  }
}

/**
 * Parameters for executing an AI prompt
 */
export class AIPromptParams {
  /**
   * The AI prompt to execute.
   * Note: Get prompts from AIEngine.Instance.Prompts after calling AIEngine.Config()
   */
  prompt: AIPromptEntity;

  /**
   * Data context for template rendering and prompt execution
   */
  data?: Record<string, unknown>;

  /**
   * Optional specific model to use (overrides prompt's model selection)
   */
  modelId?: string;

  /**
   * Optional specific vendor to use for inference routing
   */
  vendorId?: string;

  /**
   * Optional configuration ID for environment-specific behavior
   */
  configurationId?: string;

  /**
   * User context for authentication and permissions
   */
  contextUser?: UserInfo;

  /**
   * Whether to skip validation of the prompt output
   */
  skipValidation?: boolean;

  /**
   * Optional custom template data that augments the main data context
   */
  templateData?: Record<string, unknown>;

  /**
   * Optional conversation messages for multi-turn conversations
   * When provided, these messages will be combined with the rendered template
   * for direct conversation-style prompting
   */
  conversationMessages?: ChatMessage[];

  /**
   * Determines how the rendered template should be used in conversation messages
   * 'system' - Add rendered template as system message (default)
   * 'user' - Add rendered template as user message
   * 'none' - Don't add rendered template to conversation
   */
  templateMessageRole?: TemplateMessageRole;

  /**
   * Optional cancellation token to abort the prompt execution
   * When this signal is aborted, the execution will be cancelled and any
   * running operations will be terminated as gracefully as possible
   */
  cancellationToken?: AbortSignal;

  /**
   * Optional callback for receiving execution progress updates
   * Provides real-time information about the execution progress
   */
  onProgress?: ExecutionProgressCallback;

  /**
   * Optional callback for receiving streaming content updates
   * Called when AI models support streaming responses
   */
  onStreaming?: ExecutionStreamingCallback;

  /**
   * Optional agent run ID to link this prompt execution to a parent agent run
   * When provided, the AIPromptRun record will include this as AgentRunID for comprehensive execution tracking
   */
  agentRunId?: string;


  /**
   * Optional array of child prompts to execute before this prompt.
   * 
   * When provided, the AIPromptRunner will:
   * 1. Execute all child prompts in a depth-first manner
   * 2. At each level, execute sibling prompts in parallel for performance
   * 3. Collect all child prompt results
   * 4. Replace the corresponding placeholders in the parent template with child results
   * 5. Execute the parent prompt with all child results embedded
   * 
   * This enables hierarchical prompt architectures where:
   * - Child prompts can contain their own nested child prompts (unlimited depth)
   * - Each child result is embedded at a specific placeholder in the parent template
   * - Parallel execution optimizes performance at each level
   * - Complex multi-step reasoning can be decomposed into manageable units
   * 
   * Each child prompt can specify its own execution parameters including models, validation, etc.
   * 
   * @example
   * ```typescript
   * const params = new AIPromptParams();
   * params.prompt = parentPrompt;
   * params.childPrompts = [
   *   new ChildPromptParam(childPrompt1, 'analysis'),
   *   new ChildPromptParam(childPrompt2, 'summary')
   * ];
   * // Parent template can use {{ analysis }} and {{ summary }} placeholders
   * ```
   */
  childPrompts?: ChildPromptParam[];

  /**
   * Internal: Parent prompt run ID for hierarchical execution tracking.
   * This is automatically set by the system when executing child prompts.
   * @internal
   */
  parentPromptRunId?: string;
}

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
  validationErrors?: ValidationErrorInfo[];
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
  promptRun?: AIPromptRunEntity;

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
  validationResult?: ValidationResult;

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