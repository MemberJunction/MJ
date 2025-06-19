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

import { ChatMessage } from '@memberjunction/ai';
import { AIPromptEntity } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';

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

  /**
   * Additional model-specific parameters that will be passed through to the underlying model.
   * For chat/LLM models, this can include parameters like temperature, topP, topK, etc.
   * The AIPromptRunner will pass these through when building model-specific parameters.
   */
  additionalParameters?: Record<string, any>;
}

// Types now imported from @memberjunction/ai to avoid circular dependencies