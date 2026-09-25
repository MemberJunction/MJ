import type { UserInfo } from '@memberjunction/core';
import type { AIAPIKey } from '@memberjunction/ai';
import type { MJAIPromptRunEntity } from '@memberjunction/core-entities';
import type { ExecutionStatus, CancellationReason, ModelInfo, AIModelSelectionInfo } from './prompt.types';

/**
 * Base result of an AI model execution across all modalities.
 * Contains common execution status, tracking, token usage, cost, and model metadata.
 */
export interface AIModelRunResult {
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
   * Error message if execution failed
   */
  errorMessage?: string;

  /**
   * The AIPromptRun entity that was created for tracking
   */
  promptRun?: MJAIPromptRunEntity;

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
   * Model information for this result
   */
  modelInfo?: ModelInfo;

  /**
   * Model selection information for debugging and analysis
   */
  modelSelectionInfo?: AIModelSelectionInfo;
}

/**
 * Base parameters for executing an AI model across all modalities.
 * Holds context, cancellation, timeout, configuration, and credentials.
 */
export class AIModelRunParams {
  /**
   * User context for authentication and permissions
   */
  contextUser?: UserInfo;  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member

  /**
   * Optional configuration ID for environment-specific behavior
   */
  configurationId?: string;  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member

  /**
   * Optional cancellation token to abort the prompt execution
   * When this signal is aborted, the execution will be cancelled and any
   * running operations will be terminated as gracefully as possible
   */
  cancellationToken?: AbortSignal;  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member

  /**
   * Optional wall-clock bound, in milliseconds, applied to EACH model call this prompt makes
   * (per failover candidate / per validation retry / per parallel task — mirroring the parallel
   * coordinator's existing `taskTimeoutMS` semantics).
   *
   * When set, AIPromptRunner composes this with `cancellationToken` (if any) into a single abort
   * signal: BOTH bounds apply and whichever fires first aborts the call. Exceeding the timeout
   * rejects with a typed `AIPromptTimeoutError` (classified as a retriable NetworkError), so it
   * flows into the normal failover/retry machinery instead of hanging forever.
   *
   * When omitted (and the runner declares no `DefaultPromptTimeoutMS`), the model call is bounded
   * ONLY by `cancellationToken` — i.e. unbounded if no token is supplied.
   */
  timeoutMS?: number;  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member

  /**
   * Optional API keys to use for this prompt execution.
   * When provided, these keys will override the global API keys for the specified driver classes.
   * This allows for runtime API key configuration without modifying environment variables
   * or global settings.
   * 
   * @example
   * ```typescript
   * const params = new AIPromptParams();
   * params.prompt = myPrompt;
   * params.apiKeys = [
   *   { driverClass: 'OpenAILLM', apiKey: 'sk-...' },
   *   { driverClass: 'AnthropicLLM', apiKey: 'sk-ant-...' }
   * ];
   * ```
   */
  apiKeys?: AIAPIKey[];  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member

  /**
   * Whether to enable verbose logging during prompt execution.
   * When true, detailed information about model selection, API key checking,
   * and execution steps will be logged.
   * Can also be controlled via MJ_AI_VERBOSE environment variable.
   */
  verbose?: boolean;  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member
}
