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

import { MJAIPromptRunEntity, MJAIConfigurationEntity, MJAIVendorEntity } from '@memberjunction/core-entities';
import { ChatResult, ChatMessage, AIAPIKey } from '@memberjunction/ai';
import { UserInfo } from '@memberjunction/core';
import { AIPromptEntityExtended } from './AIPromptExtended';
import { AIModelEntityExtended } from './AIModelExtended';

/**
 * Modality types for multi-modal outputs
 */
export type MediaModality = 'Image' | 'Audio' | 'Video';

/**
 * Represents a media item generated during prompt execution.
 * This is stored in AIPromptRunMedia for complete audit trail.
 */
export interface PromptRunMediaReference {
    /** ID of the AIPromptRunMedia record */
    id: string;
    /** The modality type */
    modality: MediaModality;
    /** MIME type of the media (e.g., 'image/png', 'audio/mp3') */
    mimeType: string;
    /** Original filename if available */
    fileName?: string;
    /** File size in bytes */
    fileSizeBytes?: number;
    /** Width in pixels (for images/video) */
    width?: number;
    /** Height in pixels (for images/video) */
    height?: number;
    /** Duration in seconds (for audio/video) */
    durationSeconds?: number;
    /** Base64 encoded data (for inline storage) */
    inlineData?: string;
    /** URL if available (some providers return URLs) */
    url?: string;
    /** Base64 encoded thumbnail */
    thumbnailBase64?: string;
    /** Provider-specific metadata (seed, revisedPrompt, etc.) */
    metadata?: Record<string, unknown>;
    /** Display order when multiple media are generated */
    displayOrder: number;
}


/**
 * Execution status enumeration for better type safety
 * Values match the database CHECK constraint in AIPromptRun.Status
 */
export type ExecutionStatus = 'Pending' | 'Running' | 'Completed' | 'Failed' | 'Cancelled';

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

  /**
   * Model selection information for debugging and analysis
   */
  modelSelectionInfo?: AIModelSelectionInfo;

  /**
   * Media generated during this prompt execution.
   * Contains references to AIPromptRunMedia records with full metadata.
   * This provides complete audit trail of all generated media.
   * @since 3.1.0
   */
  media?: PromptRunMediaReference[];
}

/**
 * Model selection information for debugging and analysis
 */
export class AIModelSelectionInfo {
  /** The configuration entity that was used, if any */
  aiConfiguration?: MJAIConfigurationEntity;
  /** All models that were considered for selection */
  modelsConsidered: Array<{
    /** The model entity */
    model: AIModelEntityExtended;
    /** The vendor entity, if a specific vendor was considered */
    vendor?: MJAIVendorEntity;
    /** Priority of this model/vendor combination */
    priority: number;
    /** Whether this model/vendor had an available API key */
    available: boolean;
    /** Reason why this model/vendor wasn't available */
    unavailableReason?: string;
  }>;
  /** The model entity that was selected */
  modelSelected: AIModelEntityExtended;
  /** The vendor entity that was selected, if applicable */
  vendorSelected?: MJAIVendorEntity;
  /** Reason for the selection */
  selectionReason: string;
  /** Whether a fallback model was used */
  fallbackUsed: boolean;
  /** The selection strategy that was used */
  selectionStrategy?: 'Default' | 'Specific' | 'ByPower';

  /**
   * Gets all model/vendor combinations that have available API keys.
   * These are the valid candidates that can be used for execution or retry.
   * @returns Array of models considered that are available (have API keys)
   */
  extractValidCandidates() {
    return this.modelsConsidered.filter(m => m.available);
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
  prompt: AIPromptEntityExtended;

  /**
   * Data context for template rendering and prompt execution
   */
  data?: Record<string, unknown>;

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
   * Optional ID of a previous prompt run to indicate this is a rerun.
   * When provided, the new AIPromptRun record will have its RerunFromPromptRunID
   * field set to this value, establishing a link between the original and rerun executions.
   */
  rerunFromPromptRunID?: string;

  /**
   * Optional system prompt override that bypasses template rendering.
   * When provided, this exact system prompt will be used instead of rendering
   * the prompt's template. This is useful for re-running prompts with the exact
   * system prompt from a previous run.
   */
  systemPromptOverride?: string;


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

  /**
   * Additional model-specific parameters that will be passed through to the underlying model.
   * For chat/LLM models, this can include parameters like temperature, topP, topK, etc.
   * The AIPromptRunner will pass these through when building model-specific parameters.
   */
  additionalParameters?: Record<string, any>;

  /**
   * Optional prompt to use for model selection instead of the main prompt.
   * When executing hierarchical prompts, this allows using a child prompt's model
   * selection configuration instead of the parent prompt's configuration.
   * If not specified, the main prompt's model selection will be used.
   */
  modelSelectionPrompt?: AIPromptEntityExtended;

  /**
   * Optional runtime override for prompt execution.
   * When specified, these values take precedence over any model selection
   * configuration in the prompt or modelSelectionPrompt.
   * Currently supports model and vendor overrides, but can be extended for future needs.
   * 
   * Model selection precedence (highest to lowest):
   * 1. override (this parameter) - Runtime override, highest priority
   * 2. modelSelectionPrompt - If specified, uses this prompt's model configuration
   * 3. Main prompt's model configuration - Based on:
   *    - AIPromptModels associations (if SelectionStrategy is 'Specific')
   *    - AIModelTypeID filtering (if specified)
   *    - SelectionStrategy ('Default', 'Specific', or 'ByPower')
   *    - PowerPreference and MinPowerRank settings
   * 
   * For agents, the modelSelectionPrompt is determined by the agent's ModelSelectionMode:
   * - "Agent": Uses the agent's specific prompt for model selection
   * - "Agent Type": Uses the agent type's system prompt for model selection
   * 
   * @example
   * ```typescript
   * // Override model at runtime
   * const params = new AIPromptParams();
   * params.prompt = myPrompt;
   * params.override = {
   *   modelId: 'specific-model-id',
   *   vendorId: 'specific-vendor-id'
   * };
   * ```
   */
  override?: {
    modelId?: string;
    vendorId?: string;
  };

  /**
   * Whether to enable verbose logging during prompt execution.
   * When true, detailed information about model selection, API key checking,
   * and execution steps will be logged.
   * Can also be controlled via MJ_AI_VERBOSE environment variable.
   */
  verbose?: boolean;

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
  apiKeys?: AIAPIKey[];

  /**
   * Whether to clean validation syntax from the AI result.
   * When true, the AIPromptRunner will automatically remove validation syntax
   * (like ?, *, :type, :[N+], :!empty) from JSON keys in the AI's response.
   * 
   * Note: For JSON outputs with an OutputExample defined, validation syntax
   * is ALWAYS cleaned automatically before validation, regardless of this setting.
   * This parameter is only needed for edge cases where you want cleaning
   * without an OutputExample.
   * 
   * Default: false
   * 
   * @example
   * ```typescript
   * // If AI returns: { "name?": "John", "items:[2+]": ["a", "b"] }
   * // With cleanValidationSyntax: true OR with OutputExample defined
   * // Result becomes: { "name": "John", "items": ["a", "b"] }
   * ```
   */
  cleanValidationSyntax?: boolean;


  /**
   * NOTE: Only applies when prompt.OutputType is 'object'
   * 
   * If this parameter is set to true, the runner will attempt to repair JSON parsing errors with a two
   * step process, after a normal attempt to parse the JSON as-is where an error occurs:
   * 1. We will use the JSON5 library to attempt to parse the JSON as-is. This is a fast
   *    and deterministic method to parse JSON that handles some common invalid strict JSON issues such as
   *    - Trailing commas
   *    - Unquoted keys
   *    - Single quotes around strings
   *    - Unescaped control characters
   *    - Comments    
   * 2. If Step 1 fails, we will use a small LLM using a prompt called 'Repair JSON' within the `MJ: System` category
   *    This prompt will attempt to fix the JSON with a small LLM that knows how to emit proper JSON
   */
  attemptJSONRepair?: boolean;

  /**
   * Optional callback fired immediately after the PromptRun record is created and saved.
   * Provides the PromptRun ID for immediate tracking/monitoring purposes.
   * 
   * This callback is useful for:
   * - Linking the PromptRun to parent records (e.g., AIAgentRunStep.TargetLogID)
   * - Real-time monitoring and tracking
   * - Early logging and debugging
   * 
   * The callback is invoked after the PromptRun is successfully saved but before
   * the actual AI model execution begins. If the callback throws an error, it will
   * be logged but won't fail the prompt execution.
   * 
   * @param promptRunId - The ID of the newly created AIPromptRun record
   * 
   * @example
   * ```typescript
   * const params = new AIPromptParams();
   * params.onPromptRunCreated = async (promptRunId) => {
   *   console.log(`Prompt run started: ${promptRunId}`);
   *   // Update parent records, send monitoring events, etc.
   * };
   * ```
   */
  onPromptRunCreated?: (promptRunId: string) => void | Promise<void>;

  /**
   * Optional effort level override for this prompt execution (1-100).
   *
   * Higher values request more thorough reasoning and analysis from AI models.
   * Each provider maps the 1-100 scale to their specific effort parameters:
   * - OpenAI: Maps to reasoning_effort (1-33=low, 34-66=medium, 67-100=high)
   * - Anthropic: Maps to thinking mode with token budgets
   * - Groq: Maps to reasoning_effort parameter (experimental)
   * - Gemini: Controls reasoning mode intensity
   *
   * Precedence hierarchy (highest to lowest priority):
   * 1. This effortLevel parameter (runtime override)
   * 2. Agent's DefaultPromptEffortLevel (if executed via agent)
   * 3. Prompt's EffortLevel property (prompt default)
   * 4. No effort level (provider default behavior)
   *
   * @example
   * ```typescript
   * const params = new AIPromptParams();
   * params.prompt = myPrompt;
   * params.effortLevel = 85; // High effort for thorough analysis
   *
   * const result = await AIPromptRunner.RunPrompt(params);
   * ```
   */
  effortLevel?: number;

  /**
   * Optional maximum length for error messages returned in results.
   *
   * When set, error messages longer than this value will be truncated with "... [truncated]" appended.
   * When undefined (default), error messages are returned in full without truncation.
   *
   * This is useful for handling extremely long error messages (like provider-specific JSON dumps)
   * while still allowing full error details when needed for debugging.
   *
   * Default: undefined (no truncation)
   *
   * @example
   * ```typescript
   * const params = new AIPromptParams();
   * params.prompt = myPrompt;
   * params.maxErrorLength = 500; // Truncate errors longer than 500 characters
   *
   * const result = await AIPromptRunner.RunPrompt(params);
   * // Long errors will be truncated: "Error message text... [truncated]"
   * ```
   */
  maxErrorLength?: number;

  /**
   * Optional credential ID for per-request authentication override.
   *
   * Takes highest priority in the credential resolution hierarchy:
   * 1. **This parameter** (per-request override) - highest priority
   * 2. AIPromptModel.CredentialID (prompt-model specific)
   * 3. AIModelVendor.CredentialID (model-vendor specific)
   * 4. AIVendor.CredentialID (vendor default)
   * 5. Legacy: apiKeys[] parameter
   * 6. Legacy: AI_VENDOR_API_KEY__<DRIVER> environment variables
   *
   * **Important**: When any credential ID is set (priorities 1-4), the system uses
   * the Credentials system exclusively and ignores legacy authentication methods
   * (priorities 5-6). This ensures consistent, audited credential usage.
   *
   * Use this for:
   * - Multi-tenant scenarios where different tenants have different API keys
   * - Testing with specific credentials without modifying database configuration
   * - Runtime credential rotation or override
   *
   * @example
   * ```typescript
   * // Override credential at runtime for a specific tenant
   * const params = new AIPromptParams();
   * params.prompt = myPrompt;
   * params.credentialId = tenantCredentialId;  // Highest priority
   * params.contextUser = currentUser;
   *
   * const result = await AIPromptRunner.RunPrompt(params);
   * ```
   *
   * @see {@link https://docs.memberjunction.org/ai-authentication AI Authentication Guide}
   */
  credentialId?: string;
}





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
 