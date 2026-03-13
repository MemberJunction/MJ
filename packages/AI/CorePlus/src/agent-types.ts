/**
 * @fileoverview Type definitions for AI Agent execution results.
 *
 * This module contains type definitions for agent execution results that are
 * shared between server and client code. These types provide strongly-typed
 * interfaces for agent execution results and the complete execution history.
 *
 * @module @memberjunction/aiengine
 * @author MemberJunction.com
 * @since 2.50.0
 */

import { MJAIAgentTypeEntity,  } from '@memberjunction/core-entities';
import { ChatMessage } from '@memberjunction/ai';
import {  } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import { AgentPayloadChangeRequest } from './agent-payload-change-request';
import { AIAPIKey } from '@memberjunction/ai';
import { AgentResponseForm } from './response-forms';
import { ActionableCommand, AutomaticCommand } from './ui-commands';
import { MJAIAgentRunEntityExtended } from './MJAIAgentRunEntityExtended';
import { MJAIAgentEntityExtended } from './MJAIAgentEntityExtended';
import { MJAIPromptEntityExtended } from './MJAIPromptEntityExtended';
import { MediaModality } from './prompt.types';

/**
 * Value type for secondary scope dimensions.
 * Supports strings, numbers, booleans, and string arrays (for multi-valued dimensions).
 */
export type SecondaryScopeValue = string | number | boolean | string[];

/**
 * Configuration for secondary scope dimensions on an AI Agent.
 *
 * Defines what secondary scope dimensions are valid for an agent and how they
 * should behave for memory retrieval and storage. This configuration is stored
 * in the `SecondaryScopeConfig` JSON field on the AIAgent entity.
 *
 * @since 2.131.0
 *
 * @example Customer Service App (entity-backed dimensions)
 * ```json
 * {
 *     "dimensions": [
 *         {"name": "ContactID", "entityId": "uuid-for-contacts", "inheritanceMode": "cascading"},
 *         {"name": "TeamID", "entityId": "uuid-for-teams", "inheritanceMode": "strict"}
 *     ],
 *     "allowSecondaryOnly": false
 * }
 * ```
 *
 * @example Analytics App (arbitrary value dimensions)
 * ```json
 * {
 *     "dimensions": [
 *         {"name": "Region", "inheritanceMode": "cascading"},
 *         {"name": "DealStage", "inheritanceMode": "strict"}
 *     ],
 *     "allowSecondaryOnly": true
 * }
 * ```
 */
export interface SecondaryScopeConfig {
    /**
     * Array of dimension definitions.
     * Each dimension defines a scope key that can be provided at runtime via
     * `ExecuteAgentParams.SecondaryScopes`.
     */
    dimensions: SecondaryDimension[];

    /**
     * Default inheritance mode for dimensions that don't specify one.
     * - 'cascading': Notes without a dimension match queries with that dimension (broader retrieval)
     * - 'strict': Notes must exactly match the dimension value or be absent
     * @default 'cascading'
     */
    defaultInheritanceMode?: 'cascading' | 'strict';

    /**
     * Whether to allow secondary-only scoping (no primary scope required).
     * When true, the agent can function with only secondary dimensions provided
     * in `ExecuteAgentParams.SecondaryScopes` without requiring `PrimaryScopeRecordID`.
     * @default false
     */
    allowSecondaryOnly?: boolean;

    /**
     * Whether to validate runtime scope values against this config.
     * When true, extra dimensions not defined in `dimensions` array will cause validation errors.
     * When false, extra dimensions are accepted and stored but may not be used in filtering.
     * @default false
     */
    strictValidation?: boolean;
}

/**
 * Definition of a single secondary scope dimension.
 *
 * Secondary dimensions allow fine-grained scoping beyond the primary scope level.
 * Each dimension can be configured for validation, inheritance behavior, and defaults.
 *
 * @since 2.131.0
 */
export interface SecondaryDimension {
    /**
     * Dimension name/key (e.g., "ContactID", "TeamName", "Region").
     * This is the key used in `ExecuteAgentParams.SecondaryScopes` and stored
     * in the `SecondaryScopes` JSON field on notes/examples/runs.
     */
    name: string;

    /**
     * Optional MemberJunction Entity ID for validation.
     * When provided, runtime values can be validated as existing records in that entity.
     * When null/omitted, the dimension accepts any string value (useful for non-entity
     * dimensions like "Region", "DealStage", "ProductLine", etc.).
     */
    entityId?: string | null;

    /**
     * Whether this dimension is required at runtime.
     * When true, `ExecuteAgentParams.SecondaryScopes` must include this dimension
     * or have a `defaultValue` defined.
     * @default false
     */
    required?: boolean;

    /**
     * Inheritance mode for this specific dimension, overrides `defaultInheritanceMode`.
     * - 'cascading': Notes without this dimension match queries with it (broader retrieval).
     *   For example, if querying with ContactID=123, notes without any ContactID will match.
     * - 'strict': Notes must exactly match the provided dimension value.
     *   Notes without the dimension do NOT match queries that include it.
     */
    inheritanceMode?: 'cascading' | 'strict';

    /**
     * Default value if not provided at runtime.
     * Only used when `required=false`. If the dimension is not in the runtime scope
     * and a defaultValue is set, this value will be used.
     */
    defaultValue?: string | null;

    /**
     * Human-readable description of this dimension for documentation.
     */
    description?: string;
}

// Import loop operation types from their dedicated modules
// These are in separate files so they can be @include'd in prompt templates
// Exported directly from index.ts, not re-exported here
import type { ForEachOperation } from './foreach-operation';
import type { WhileOperation } from './while-operation';

/**
 * Represents a media output that an agent has explicitly promoted to its outputs.
 * This is the interface used in ExecuteAgentResult.mediaOutputs.
 *
 * Media can come from two sources:
 * 1. Promoted from a prompt run (has promptRunMediaId)
 * 2. Generated directly by agent code (has data or url)
 *
 * @since 3.1.0
 */
export interface MediaOutput {
    /** Reference to source AIPromptRunMedia (if promoted from prompt execution) */
    promptRunMediaId?: string;

    /** The modality type */
    modality: MediaModality;

    /** MIME type of the media (e.g., 'image/png', 'audio/mp3') */
    mimeType: string;

    /** Base64 encoded data (only if NOT from prompt run) */
    data?: string;

    /** URL if available (some providers return URLs) */
    url?: string;

    /** Width in pixels (for images/video) */
    width?: number;

    /** Height in pixels (for images/video) */
    height?: number;

    /** Duration in seconds (for audio/video) */
    durationSeconds?: number;

    /** Agent-provided label for UI display */
    label?: string;

    /** Provider-specific metadata */
    metadata?: Record<string, unknown>;

    /**
     * Placeholder reference ID for the ${media:xxx} pattern.
     * Used to look up media when resolving placeholders in agent output.
     * @since 3.1.0
     */
    refId?: string;

    /**
     * Controls whether this media should be persisted to the database.
     * Default behavior (undefined or true): media is persisted to AIAgentRunMedia and ConversationDetailAttachment.
     * Set to false for intercepted/working media that shouldn't be saved (e.g., generated but not used in output).
     * @since 3.1.0
     */
    persist?: boolean;

    /**
     * Agent notes describing what this media represents.
     * Used for internal tracking, debugging, and can be persisted for audit purposes.
     * @since 3.1.0
     */
    description?: string;
}


/**
 * Represents a single action to be executed.
 */
export type AgentAction = {
    /** Name of the action */
    name: string;
    /** Parameters to pass to the action */
    params: Record<string, unknown>;
    /** Mapping of action outputs to payload fields */
    outputMapping?: string;   
}

/**
 * Represents a sub-agent invocation request.
 * 
 * @template TContext - Type of the context object passed to the sub-agent.
 *                      This allows for type-safe context propagation from parent to sub-agent.
 *                      Defaults to any for backward compatibility.
 * 
 * @example
 * ```typescript
 * // Define a typed context
 * interface MyContext {
 *   apiEndpoint: string;
 *   authToken: string;
 * }
 * 
 * // Use in sub-agent request
 * const subAgentRequest: AgentSubAgentRequest<MyContext> = {
 *   id: 'sub-agent-uuid',
 *   name: 'DataProcessorAgent',
 *   message: 'Process the uploaded data',
 *   terminateAfter: false,
 *   context: {
 *     apiEndpoint: 'https://api.example.com',
 *     authToken: 'bearer-token'
 *   }
 * };
 * ```
 */
export type AgentSubAgentRequest<TContext = any> = {
    /** Name of the sub-agent */
    name: string;
    /** Context and instructions for the sub-agent */
    message: string;
    /** Whether to terminate the parent agent after sub-agent completes */
    terminateAfter: boolean;
    /** Optional template parameters for sub-agent invocation */
    templateParameters?: Record<string, string>;
    /**
     * Context data passed to the sub-agent by the parent agent.
     * This context flows through the entire execution hierarchy,
     * allowing sub-agents to access runtime-specific configuration,
     * environment settings, and shared state from their parent agents.
     * Optional because AI determines sub-agent invocation, context comes from execution params.
     */
    context?: TContext;
}

/**
 * Represents the next step determination from an agent type.
 * 
 * Agent types analyze the output of prompt execution and determine what should
 * happen next in the agent workflow. This type encapsulates that decision along
 * with any necessary context for the determined action.
 * 
 * @template P - Type of the payload value, allowing flexibility in the type of data returned
 * @template TContext - Type of the context object used for sub-agent requests.
 *                      This ensures type safety when passing context to sub-agents.
 *                      Defaults to any for backward compatibility.
 */
export type BaseAgentNextStep<P = any, TContext = any> = {
    /** Whether to terminate the agent execution after this step */
    terminate: boolean;
    /**
     * The determined next step:
     * - 'success': The agent has completed its task successfully
     * - 'failed': The agent has failed to complete its task
     * - 'retry': The agent should re-run to either:
     *   a) Process new results from completed actions or sub-agents
     *   b) Retry after a failure condition
     *   c) Continue processing with updated context
     *   d) Process after expanding a compacted message (when messageIndex is set)
     * - 'sub-agent': The agent should spawn a sub-agent to handle a specific task
     * - 'actions': The agent should perform one or more actions using the Actions framework
     * - 'chat': The agent needs to communicate with the user before proceeding
     *
     * Note: To expand a compacted message, set step to 'Retry', set messageIndex to the message to expand,
     * and optionally set expandReason to explain why expansion is needed. The framework will expand the message
     * and then continue with the retry.
     */
    step: MJAIAgentRunEntityExtended['FinalStep']
    /** Result from the prior step, useful for retry or sub-agent context */
    priorStepResult?: any;
    /** 
     * Payload change request from the agent.
     * Framework will apply these changes to the previous payload to create the new state.
     * This approach ensures safe state mutations and prevents data loss from LLM truncation.
     */
    payloadChangeRequest?: AgentPayloadChangeRequest<P>;
    /** 
     * The payload that was passed into this step execution.
     * Useful for debugging and understanding what state the agent was working with.
     * @deprecated Use payloadChangeRequest instead for state mutations
     */
    previousPayload?: P;
    /**
     * This represents the new payload after the step was executed after the payloadChangeRequest is applied.
     */
    newPayload?: P;
    /** Error message when step is 'failed' */
    errorMessage?: string;
    /** Reason for retry when step is 'retry' (e.g., "Processing action results", "Handling error condition") */
    retryReason?: string;
    /** Instructions for the retry attempt, including any new context or results */
    retryInstructions?: string;
    /** Sub-agent details when step is 'sub-agent' */
    subAgent?: AgentSubAgentRequest<TContext>;
    /** Array of actions to execute when step is 'actions' */
    actions?: AgentAction[];
    /** Message to send to user when step is 'chat' */
    message?: string;
    /**
     * Optional response form to collect structured user input.
     * When present, the UI will render appropriate input controls based on question types.
     * Use for collecting information from users during agent execution.
     * @since 2.116.0
     */
    responseForm?: AgentResponseForm;
    /**
     * Optional actionable commands shown as clickable buttons/links.
     * Typically used after completing work to provide easy navigation to created/modified resources.
     * @since 2.116.0
     */
    actionableCommands?: ActionableCommand[];
    /**
     * Optional automatic commands executed immediately when received.
     * Used for refreshing data, showing notifications, and updating UI state.
     * @since 2.116.0
     */
    automaticCommands?: AutomaticCommand[];
    /** Index of the message to expand when step is 'expand-message' */
    messageIndex?: number;
    /** Reason for expanding the message when step is 'expand-message' */
    expandReason?: string;
    /** Optional, reasoning information from the agent */
    reasoning?: string;
    /** Optional confidence level in the decision (0.0 to 1.0) */
    confidence?: number;
    /** ForEach operation details when step is 'ForEach' (v2.112+) */
    forEach?: ForEachOperation;
    /** While operation details when step is 'While' (v2.112+) */
    while?: WhileOperation;
    /**
     * Media outputs to promote to the agent's final outputs.
     * When set, these media items will be added to the agent's mediaOutputs collection
     * and stored in AIAgentRunMedia.
     * @since 3.1.0
     */
    promoteMediaOutputs?: MediaOutput[];
}

/**
 * Result returned from executing an AI Agent with comprehensive execution history.
 *
 * This result structure provides complete visibility into the agent's execution flow,
 * including all prompts executed, actions taken, sub-agents invoked, and decisions made.
 * The agentRun property contains the full execution history with all steps.
 *
 * @template P - Generic type parameter for payload value, allowing flexibility in the type of data returned by the agent
 */
export type ExecuteAgentResult<P = any> = {
    /** Whether the agent execution was successful */
    success: boolean;
    /** Optional payload returned by the agent */
    payload?: P;
    /**
     * The agent run entity with full execution history.
     * - Use agentRun.ErrorMessage for error details
     * - Use agentRun.Status === 'Cancelled' to check if cancelled
     * - Use agentRun.CancellationReason for cancellation reason
     * - Use agentRun.Steps for the execution step history
     */
    agentRun: MJAIAgentRunEntityExtended;
    /**
     * The artifact type ID for the returned payload.
     * This identifies what type of artifact the payload represents (e.g., JSON, Markdown, HTML).
     * Used by UI to determine how to render the payload and which extract rules to apply.
     * If not specified, falls back to the agent's default artifact type configuration.
     */
    payloadArtifactTypeID?: string;
    /**
     * Optional response form to collect structured user input.
     * When present, the UI will render appropriate input controls based on question types.
     * Populated from the agent's final step.
     * @since 2.116.0
     */
    responseForm?: AgentResponseForm;
    /**
     * Optional actionable commands shown as clickable buttons/links.
     * Typically used after completing work to provide easy navigation to created/modified resources.
     * Populated from the agent's final step.
     * @since 2.116.0
     */
    actionableCommands?: ActionableCommand[];
    /**
     * Optional automatic commands executed immediately when received.
     * Used for refreshing data, showing notifications, and updating UI state.
     * Populated from the agent's final step.
     * @since 2.116.0
     */
    automaticCommands?: AutomaticCommand[];
    /**
     * Optional memory context that was injected into the agent execution.
     * Includes the notes and examples that were retrieved and used for context.
     */
    memoryContext?: {
        notes: any[]; // MJAIAgentNoteEntity[] - using any to avoid circular dependency
        examples: any[]; // MJAIAgentExampleEntity[] - using any to avoid circular dependency
    };

    /**
     * Multi-modal outputs generated by the agent.
     * Contains media that the agent explicitly promoted to its outputs.
     * This flows to ConversationDetailAttachment for UI display.
     *
     * Media items with `refId` are used for placeholder resolution (${media:xxx}).
     * Media items with `persist: false` are excluded from database persistence.
     * Sub-agents return their mediaOutputs to parents for bubbling up.
     *
     * @since 3.1.0
     */
    mediaOutputs?: MediaOutput[];
}

/**
 * The decision made about what to do next after a step completes.
 * 
 * This captures not just what was decided, but why it was decided and what
 * will happen next, providing transparency into the agent's decision-making.
 */
export type NextStepDecision = {
    /** The next step type that was decided */
    decision: BaseAgentNextStep['step'];
    /** Human-readable explanation of why this decision was made */
    reasoning?: string;
    /** Details about what will be executed next (if not terminating) */
    nextStepDetails?: NextStepDetails;
}

/**
 * Details about what will be executed in the next step.
 * 
 * Union type that provides specific information based on the type of next step,
 * enabling proper preparation and execution of the subsequent operation.
 */
export type NextStepDetails <P = any> = 
    | { type: 'Prompt'; promptId: string; promptName: string; payload?: P }
    | { type: 'Actions'; actions: AgentAction[]; payload?: P }
    | { type: 'Sub-Agent'; subAgent: AgentSubAgentRequest; payload?: P }
    | { type: 'Retry'; retryReason: string; retryInstructions: string; payload?: P }
    | { type: 'Chat'; message: string; payload?: P }
    | { type: 'Complete'; payload?: P };


/**
 * Callback function type for agent execution progress updates
 */
export type AgentExecutionProgressCallback = (progress: {
    /** Current step in the agent execution process */
    step: 'initialization' | 'validation' | 'prompt_execution' | 'action_execution' | 'subagent_execution' | 'decision_processing' | 'finalization';
    /** @deprecated Progress percentage (0-100) - Use metadata.stepCount instead for actual progress tracking */
    percentage?: number;
    /** Human-readable status message */
    message: string;
    /** Additional metadata about the current step. Use metadata.stepCount for accurate step tracking. */
    metadata?: Record<string, unknown>;
    /** When this progress message should be displayed */
    displayMode?: 'live' | 'historical' | 'both';
}) => void;

/**
 * Callback function type for streaming content updates during agent execution
 */
export type AgentExecutionStreamingCallback = (chunk: {
    /** The content chunk received */
    content: string;
    /** Whether this is the final chunk */
    isComplete: boolean;
    /** Which step is producing this content */
    stepType?: 'prompt' | 'action' | 'subagent' | 'chat';
    /** Specific step entity ID producing this content */
    stepEntityId?: string;
    /** Model name producing this content (for prompt steps) */
    modelName?: string;
}) => void;

/**
 * Parameters required to execute an AI Agent.
 *
 * @template TContext - Type of the context object passed through agent and action execution.
 *                      This allows for type-safe context propagation throughout the execution hierarchy.
 *                      Defaults to any for backward compatibility.
 * @template P - Type of the payload passed to the agent execution
 * @template TAgentTypeParams - Type of agent-type-specific execution parameters.
 *                              Flow agents use FlowAgentExecuteParams, Loop agents could define their own.
 *                              Defaults to unknown for backward compatibility.
 *
 * @example
 * ```typescript
 * // Define a typed context
 * interface MyAgentContext {
 *   apiEndpoint: string;
 *   userPreferences: { language: string; timezone: string };
 *   sessionId: string;
 * }
 *
 * // Use with type safety
 * const params: ExecuteAgentParams<MyAgentContext> = {
 *   agent: myAgent,
 *   conversationMessages: messages,
 *   context: {
 *     apiEndpoint: 'https://api.example.com',
 *     userPreferences: { language: 'en', timezone: 'UTC' },
 *     sessionId: 'abc123'
 *   }
 * };
 *
 * // Flow agent with type-specific params
 * import { FlowAgentExecuteParams } from '@memberjunction/ai-agents';
 * const flowParams: ExecuteAgentParams<any, any, FlowAgentExecuteParams> = {
 *   agent: myFlowAgent,
 *   conversationMessages: messages,
 *   agentTypeParams: {
 *     startAtStep: someStepEntity,  // Start at a specific step
 *     skipSteps: [stepToSkip]       // Skip certain steps
 *   }
 * };
 * ```
 */
export type ExecuteAgentParams<TContext = any, P = any, TAgentTypeParams = unknown> = {
    /** The agent entity to execute, containing all metadata and configuration */
    agent: MJAIAgentEntityExtended;
    /** Array of chat messages representing the conversation history */
    conversationMessages: ChatMessage[];
    /** Optional user context for permission checking and personalization */
    contextUser?: UserInfo;
    /** Optional user ID for scoping context memory (notes/examples). If not provided, uses contextUser.ID */
    userId?: string;
    /** Optional company ID for scoping context memory (notes/examples) */
    companyId?: string;
    /**
     * Primary scope entity name (e.g., 'Organizations', 'Skip Tenants').
     * Resolved to PrimaryScopeEntityID on the AIAgentRun record.
     * Used by external applications for multi-tenant memory scoping.
     * Not used by MJ's own chat infrastructure.
     *
     * @since 2.132.0
     */
    PrimaryScopeEntityName?: string;
    /**
     * Primary scope record ID — the actual record ID within the primary entity.
     * Stored as an indexed column on AIAgentRun/AIAgentNote for fast filtering.
     * Used by external applications for multi-tenant memory scoping.
     * Not used by MJ's own chat infrastructure.
     *
     * @since 2.132.0
     */
    PrimaryScopeRecordID?: string;
    /**
     * Arbitrary key/value dimensions for external-app scoping.
     * Stored as JSON in the SecondaryScopes column on AIAgentRun/AIAgentNote.
     * Used by external applications (Skip, Izzy, etc.) to segment agent memory
     * by custom dimensions. MJ's own chat infrastructure does not use this.
     *
     * @since 2.132.0
     *
     * @example
     * ```typescript
     * params.SecondaryScopes = {
     *     ContactID: 'contact-456',
     *     TeamID: 'team-alpha',
     *     Region: 'EMEA'
     * };
     * ```
     */
    SecondaryScopes?: Record<string, SecondaryScopeValue>;
    /** Optional cancellation token to abort the agent execution */
    cancellationToken?: AbortSignal;
    /** Optional callback for receiving execution progress updates */
    onProgress?: AgentExecutionProgressCallback;
    /** Optional callback for receiving streaming content updates */
    onStreaming?: AgentExecutionStreamingCallback;
    /** Optional parent agent hierarchy for sub-agent execution */
    parentAgentHierarchy?: string[];
    /** Optional parent depth for sub-agent execution */
    parentDepth?: number;
    /**
     * Optional parent step counts from root to immediate parent agent.
     * Used to build hierarchical step display (e.g., "2.1.3" for nested agents).
     * @internal - Managed automatically by agent execution framework
     */
    parentStepCounts?: number[];
    /** Optional parent agent run entity for nested sub-agent execution */
    parentRun?: MJAIAgentRunEntityExtended;
    /** Optional data for template rendering and prompt execution, passed to the agent's prompt as well as all sub-agents */
    data?: Record<string, any>;
    /** Optional payload to pass to the agent execution, type depends on agent implementation. Payload is the ongoing dynamic state of the agent run. */
    payload?: P;
    /** 
     * Optional additional context data to pass to the agent execution.
     * This context is propagated to all sub-agents and actions throughout 
     * the execution hierarchy. Use this for runtime-specific data such as:
     * - Environment-specific configuration (API endpoints, feature flags)
     * - User-specific settings or preferences
     * - Session-specific data (request IDs, correlation IDs)
     * - External service credentials or connection information
     * 
     * Note: Avoid including sensitive data like passwords or API keys 
     * unless absolutely necessary, as context may be passed to multiple 
     * agents and actions.
     */
    context?: TContext;
    /** 
     * Optional runtime override for agent execution.
     * When specified, these values take precedence over all other model selection methods.
     * Currently supports model and vendor overrides, but can be extended in the future.
     * 
     * Model selection precedence (highest to lowest):
     * 1. Runtime override (this parameter)
     * 2. Agent's ModelSelectionMode configuration:
     *    - If "Agent": Uses the agent's specific prompt model configuration
     *    - If "Agent Type" (default): Uses the agent type's system prompt model configuration
     * 3. Default model selection based on prompt configuration
     * 
     * This override is passed to all prompt executions within the agent, allowing
     * consistent model usage throughout the agent's execution hierarchy.
     */
    override?: {
        modelId?: string;
        vendorId?: string;
    };
    /** 
     * Optional flag to enable verbose logging during agent execution.
     * When true, detailed information about agent decision-making, action selection,
     * sub-agent invocations, and execution flow will be logged.
     * Can also be controlled via MJ_VERBOSE environment variable.
     */
    verbose?: boolean;
    /**
     * Optional array of API keys to use for AI provider access during agent execution.
     * When provided, these keys will be used instead of the default keys configured
     * in the system. This allows for runtime-specific API key usage, useful for:
     * - Multi-tenant scenarios where different users have different API keys
     * - Testing with different API key configurations
     * - Isolating API usage by application or user
     * 
     * Each key should specify the driverClass (e.g., 'OpenAILLM', 'AnthropicLLM')
     * and the corresponding apiKey value.
     */
    apiKeys?: AIAPIKey[];
    /**
     * Optional ID of the last run in a run chain.
     * When provided, this links the new run to a previous run, allowing
     * agents to maintain context across multiple interactions.
     * Different from parentRun which is for sub-agent hierarchy.
     */
    lastRunId?: string;

    /**
     * Optional conversation detail ID to associate with this agent execution.
     * When provided, this value is stored in the ConversationDetailID column within
     * the to be created AIAgentRun record. This allows for linking the agent run 
     * to a specific conversation detail for tracking and reporting purposes.
     */
    conversationDetailId?: string;

    /**
     * Optional flag to automatically populate the payload from the last run.
     * When true and lastRunId is provided, the framework will:
     * 1. Load the last run's FinalPayload
     * 2. Set it as the StartingPayload for the new run
     * 3. Use it as the initial payload if no payload is explicitly provided
     * This helps maintain state across run chains and reduces
     * bandwidth by avoiding passing large payloads back and forth.
     */
    autoPopulateLastRunPayload?: boolean;
    /**
     * Optional AI Configuration ID to use for this agent execution.
     * When provided, this configuration will be passed to all prompts executed
     * by this agent and its sub-agents, enabling environment-specific model
     * selection (e.g., Prod vs Dev configurations).
     * 
     * The configuration ID filters which AI models are available for prompt
     * execution and can provide configuration parameters for dynamic behavior.
     */
    configurationId?: string;
    
    /**
     * Optional callback fired immediately after the AgentRun record is created and saved.
     * Provides the AgentRun ID for immediate tracking/monitoring purposes.
     * 
     * This callback is useful for:
     * - Linking the AgentRun to parent records (e.g., AIAgentRunStep.TargetLogID for sub-agents)
     * - Real-time monitoring and tracking
     * - Early logging and debugging
     * 
     * The callback is invoked after the AgentRun is successfully saved but before
     * the actual agent execution begins. If the callback throws an error, it will
     * be logged but won't fail the agent execution.
     * 
     * @param agentRunId - The ID of the newly created AIAgentRun record
     * 
     * @example
     * ```typescript
     * const params: ExecuteAgentParams = {
     *   agent: myAgent,
     *   conversationMessages: messages,
     *   onAgentRunCreated: async (agentRunId) => {
     *     console.log(`Agent run started: ${agentRunId}`);
     *     // Update parent records, send monitoring events, etc.
     *   }
     * };
     * ```
     */
    onAgentRunCreated?: (agentRunId: string) => void | Promise<void>;

    /**
     * Optional effort level for all prompt executions in this agent run (1-100).
     *
     * Higher values request more thorough reasoning and analysis from AI models.
     * This effort level takes precedence over the agent's DefaultPromptEffortLevel
     * and individual prompt EffortLevel settings for all prompts executed during
     * this agent run.
     *
     * Each provider maps the 1-100 scale to their specific effort parameters:
     * - OpenAI: Maps to reasoning_effort (1-33=low, 34-66=medium, 67-100=high)
     * - Anthropic: Maps to thinking mode with token budgets
     * - Groq: Maps to reasoning_effort parameter (experimental)
     * - Gemini: Controls reasoning mode intensity
     *
     * This setting is inherited by all sub-agents unless they explicitly override it.
     *
     * Precedence hierarchy (highest to lowest priority):
     * 1. This effortLevel parameter (runtime override - highest priority)
     * 2. Agent's DefaultPromptEffortLevel (agent default)
     * 3. Prompt's EffortLevel property (prompt default)
     * 4. No effort level (provider default behavior - lowest priority)
     *
     * @example
     * ```typescript
     * const params: ExecuteAgentParams = {
     *   agent: myAgent,
     *   conversationMessages: messages,
     *   effortLevel: 85, // High effort for thorough analysis across all prompts
     *   contextUser: user
     * };
     *
     * const result = await agent.Execute(params);
     * ```
     */
    effortLevel?: number;

    /**
     * Optional runtime override for message expiration behavior.
     * When specified, these values take precedence over the AIAgentAction configuration
     * for all action results in this agent run. Useful for testing, debugging, or
     * implementing custom expiration strategies.
     *
     * @example
     * ```typescript
     * const params: ExecuteAgentParams = {
     *   agent: myAgent,
     *   conversationMessages: messages,
     *   messageExpirationOverride: {
     *     expirationTurns: 2,
     *     expirationMode: 'Compact',
     *     compactMode: 'First N Chars',
     *     compactLength: 500,
     *     preserveOriginalContent: true
     *   }
     * };
     * ```
     */
    messageExpirationOverride?: MessageExpirationOverride;

    /**
     * Optional callback for message lifecycle events.
     * Called when messages are expired, compacted, removed, or expanded during agent execution.
     * Useful for monitoring, debugging, and tracking token savings.
     *
     * @example
     * ```typescript
     * const params: ExecuteAgentParams = {
     *   agent: myAgent,
     *   conversationMessages: messages,
     *   onMessageLifecycle: (event) => {
     *     console.log(`[Turn ${event.turn}] ${event.type}: ${event.reason}`);
     *     if (event.tokensSaved) {
     *       console.log(`  Tokens saved: ${event.tokensSaved}`);
     *     }
     *   }
     * };
     * ```
     */
    onMessageLifecycle?: MessageLifecycleCallback;

    /**
     * Optional flag to disable data preloading from AIAgentDataSource metadata.
     * When true, the agent will not automatically preload data sources even if
     * they are configured in the database. This is useful for:
     * - Performance optimization when preloaded data is not needed
     * - Testing scenarios where you want to control data explicitly
     * - Cases where the caller provides all necessary data manually
     *
     * Default: false (data preloading is enabled)
     *
     * Note: Caller-provided data in the data parameter always takes precedence
     * over preloaded data, even when preloading is enabled.
     *
     * @example
     * ```typescript
     * const params: ExecuteAgentParams = {
     *   agent: myAgent,
     *   conversationMessages: messages,
     *   disableDataPreloading: true,  // Skip automatic data preloading
     *   data: { CUSTOM_DATA: myData }  // Use only caller-provided data
     * };
     * ```
     */
    disableDataPreloading?: boolean;

    /**
     * Optional absolute maximum number of iterations (steps) for the agent run.
     * This provides a hard limit safety net to prevent infinite loops in case of
     * configuration errors or unexpected agent behavior. This value overrides any
     * agent-level MaxIterationsPerRun setting if it is lower.
     *
     * If not specified, defaults to 5000 iterations as a safety measure.
     * Use a higher value only if you have a legitimate need for very long-running agents.
     *
     * This is different from MaxIterationsPerRun (agent metadata guardrail):
     * - MaxIterationsPerRun: Configurable per-agent business rule
     * - absoluteMaxIterations: System-wide safety limit (default: 5000)
     *
     * @default 5000
     *
     * @example
     * ```typescript
     * const params: ExecuteAgentParams = {
     *   agent: myAgent,
     *   conversationMessages: messages,
     *   absoluteMaxIterations: 10000,  // Allow more iterations for this specific run
     * };
     * ```
     */
    absoluteMaxIterations?: number;

    /**
     * Optional test run ID to associate with this agent execution.
     * When provided, this value is stored in the TestRunID column within
     * the AIAgentRun record, linking the agent run to a specific test run
     * from the MemberJunction testing framework for tracking and reporting purposes.
     *
     * @example
     * ```typescript
     * const params: ExecuteAgentParams = {
     *   agent: myAgent,
     *   conversationMessages: messages,
     *   testRunId: '12345678-1234-1234-1234-123456789012',  // Link to test run
     * };
     * ```
     */
    testRunId?: string;

    /**
     * Optional flag to convert UI markup (@{...} syntax) in user messages to plain text
     * before passing to the agent.
     *
     * When true (default), special UI syntax like mentions (@{_mode:"mention",...}) and
     * form responses (@{_mode:"form",...}) are converted to human-readable plain text:
     * - Mentions: "@Agent Name" or "@User Name"
     * - Forms: "Field1: Value1, Field2: Value2"
     *
     * When false, the raw @{...} JSON is preserved in conversation history.
     *
     * This prevents agents from:
     * - Getting confused by UI-specific JSON syntax
     * - Wasting tokens on markup that doesn't provide useful context
     * - Trying to replicate or interpret UI-specific formatting
     *
     * @default true
     *
     * @example
     * ```typescript
     * // Default behavior - convert to plain text
     * const params: ExecuteAgentParams = {
     *   agent: myAgent,
     *   conversationMessages: messages,  // "@{_mode:"mention",...}" becomes "@Agent Name"
     * };
     *
     * // Preserve raw markup (not recommended)
     * const params: ExecuteAgentParams = {
     *   agent: myAgent,
     *   conversationMessages: messages,
     *   convertUIMarkupToPlainText: false,  // Keep raw @{...} syntax
     * };
     * ```
     */
    convertUIMarkupToPlainText?: boolean;

    /**
     * Optional runtime modifications to the agent's available actions.
     *
     * Action changes allow dynamic customization of which actions are available
     * to agents at runtime, without modifying database configuration. This is
     * particularly useful for:
     * - Multi-tenant scenarios where different executions need different integrations
     * - Security restrictions where sub-agents should have limited action access
     * - Testing scenarios with controlled action availability
     *
     * Changes are applied in order. For each agent in the hierarchy:
     * 1. Start with the agent's configured actions (from AIAgentAction table)
     * 2. Apply each ActionChange that matches the agent's scope
     * 3. The resulting action set is what the agent sees and can invoke
     *
     * Changes are propagated to sub-agents based on scope:
     * - 'global': Propagated as-is to all sub-agents
     * - 'root': Not propagated (only applies to root)
     * - 'all-subagents': Propagated as 'global' to sub-agents
     * - 'specific': Propagated as-is, each agent checks if it's in agentIds
     *
     * @example
     * ```typescript
     * // Add LMS and CRM integrations for a specific tenant
     * const params: ExecuteAgentParams = {
     *   agent: myAgent,
     *   conversationMessages: messages,
     *   actionChanges: [
     *     {
     *       scope: 'global',
     *       mode: 'add',
     *       actionIds: ['lms-query-action-id', 'crm-search-action-id']
     *     }
     *   ]
     * };
     *
     * // Remove dangerous actions from sub-agents
     * const params: ExecuteAgentParams = {
     *   agent: myAgent,
     *   conversationMessages: messages,
     *   actionChanges: [
     *     {
     *       scope: 'all-subagents',
     *       mode: 'remove',
     *       actionIds: ['delete-record-action-id', 'execute-sql-action-id']
     *     }
     *   ]
     * };
     *
     * // Different actions for specific sub-agent
     * const params: ExecuteAgentParams = {
     *   agent: myAgent,
     *   conversationMessages: messages,
     *   actionChanges: [
     *     { scope: 'global', mode: 'add', actionIds: ['common-action-id'] },
     *     {
     *       scope: 'specific',
     *       mode: 'add',
     *       actionIds: ['special-data-action-id'],
     *       agentIds: ['data-gatherer-sub-agent-id']
     *     }
     *   ]
     * };
     * ```
     *
     * @since 2.123.0
     */
    actionChanges?: ActionChange[];

    /**
     * Optional agent-type-specific execution parameters.
     *
     * Different agent types can define their own parameter interfaces for
     * type-specific configuration that doesn't belong in the general ExecuteAgentParams.
     *
     * Examples:
     * - Flow agents: FlowAgentExecuteParams with startAtStep, skipSteps
     * - Loop agents: Could define LoopAgentExecuteParams with custom iteration controls
     *
     * The type is determined by the TAgentTypeParams generic parameter.
     * When using a specific agent type, import and use its params interface for type safety.
     *
     * @example
     * ```typescript
     * import { FlowAgentExecuteParams } from '@memberjunction/ai-agents';
     *
     * const params: ExecuteAgentParams<any, any, FlowAgentExecuteParams> = {
     *   agent: myFlowAgent,
     *   conversationMessages: messages,
     *   agentTypeParams: {
     *     startAtStep: AIEngine.Instance.GetAgentSteps(agentId).find(s => s.Name === 'Approval'),
     *     skipSteps: [debugStep, testStep]
     *   }
     * };
     * ```
     *
     * @since 2.127.0
     */
    agentTypeParams?: TAgentTypeParams;
}

/**
 * Context data provided to agent prompts during execution.
 * 
 * This data structure is passed to the prompt templates and contains information
 * about the agent, its sub-agents, and available actions. The sub-agent and action
 * details are JSON stringified to work with the template engine.
 */
export type AgentContextData = {
    /** The name of the agent being executed */
    agentName: string | null;
    /** Description of the agent's purpose and capabilities */
    agentDescription: string | null;
    /** Optional parent agent name for sub-agent context */
    parentAgentName?: string | null;
    /** Number of sub-agents available to this agent */
    subAgentCount: number;
    /** JSON stringified array of MJAIAgentEntityExtended objects representing sub-agents */
    subAgentDetails: string;
    /** Number of actions available to this agent */
    actionCount: number;
    /** JSON stringified array of MJActionEntity objects representing available actions */
    actionDetails: string;
}

/**
 * Configuration loaded for agent execution.
 */
export type AgentConfiguration = {
    /** Whether configuration was loaded successfully */
    success: boolean;
    /** Error message if configuration failed */
    errorMessage?: string;
    /** The loaded agent type entity */
    agentType?: MJAIAgentTypeEntity;
    /** The loaded system prompt entity */
    systemPrompt?: MJAIPromptEntityExtended;
    /** The loaded child prompt entity */
    childPrompt?: MJAIPromptEntityExtended;
}

/**
 * Typed metadata for agent conversation messages.
 * Extends ChatMessage<M> to provide agent-specific metadata for message lifecycle management.
 */
export type AgentChatMessageMetadata = {
    /** Turn number when this message was added to the conversation */
    turnAdded?: number;
    /** Number of turns after which this message expires */
    expirationTurns?: number;
    /** Mode for handling expired messages */
    expirationMode?: 'None' | 'Remove' | 'Compact';
    /** Mode for compacting expired messages */
    compactMode?: 'First N Chars' | 'AI Summary';
    /** Number of characters to keep when using 'First N Chars' mode */
    compactLength?: number;
    /** Prompt ID to use for AI Summary compaction */
    compactPromptId?: string;
    /** Whether this message has been compacted */
    wasCompacted?: boolean;
    /** Original content before compaction (for expansion) */
    originalContent?: ChatMessage['content'];
    /** Original length in characters before compaction */
    originalLength?: number;
    /** Number of tokens saved by compaction */
    tokensSaved?: number;
    /** Whether this message can be expanded back to original */
    canExpand?: boolean;
    /** Whether this message has expired */
    isExpired?: boolean;
    /** Type of message (for logging/debugging) */
    messageType?: 'action-result' | 'sub-agent-result' | 'chat' | 'system' | 'user';
}

/**
 * Agent conversation message with typed metadata.
 */
export type AgentChatMessage = ChatMessage<AgentChatMessageMetadata>;

/**
 * Event types for message lifecycle callbacks.
 */
export type MessageLifecycleEventType = 'message-expired' | 'message-compacted' | 'message-removed' | 'message-expanded';

/**
 * Event data for message lifecycle callbacks.
 */
export type MessageLifecycleEvent = {
    /** Type of lifecycle event */
    type: MessageLifecycleEventType;
    /** Turn number when the event occurred */
    turn: number;
    /** Index of the message in the conversation array */
    messageIndex: number;
    /** The message that was affected */
    message: AgentChatMessage;
    /** Human-readable reason for the event */
    reason: string;
    /** Number of tokens saved (for compaction events) */
    tokensSaved?: number;
}

/**
 * Callback function type for message lifecycle events.
 */
export type MessageLifecycleCallback = (event: MessageLifecycleEvent) => void;

/**
 * Runtime override for message expiration behavior.
 * When specified in ExecuteAgentParams, these values take precedence over
 * the AIAgentAction configuration for all action results in this agent run.
 */
export type MessageExpirationOverride = {
    /** Number of turns before expiration (overrides AIAgentAction.ResultExpirationTurns) */
    expirationTurns?: number;
    /** Mode for handling expired messages (overrides AIAgentAction.ResultExpirationMode) */
    expirationMode?: 'None' | 'Remove' | 'Compact';
    /** Mode for compacting expired messages (overrides AIAgentAction.CompactMode) */
    compactMode?: 'First N Chars' | 'AI Summary';
    /** Number of characters to keep when using 'First N Chars' mode (overrides AIAgentAction.CompactLength) */
    compactLength?: number;
    /** Prompt ID to use for AI Summary compaction (overrides AIAgentAction.CompactPromptID) */
    compactPromptId?: string;
    /** Whether to preserve original content for expansion (default: true) */
    preserveOriginalContent?: boolean;
}

/**
 * Request to expand a compacted message to its original content.
 */
export interface ExpandMessageRequest {
    /** Step type identifier */
    step: 'expand-message';
    /** Index of the message to expand in the conversation array */
    messageIndex: number;
    /** Optional reason for expanding the message */
    reason?: string;
}

/**
 * Scope options for runtime action changes.
 * Determines which agents in the execution hierarchy the change applies to.
 *
 * @since 2.123.0
 */
export type ActionChangeScope =
    /** Applies to all agents in the hierarchy (root + all sub-agents) */
    | 'global'
    /** Applies only to the root agent */
    | 'root'
    /** Applies to all sub-agents but NOT the root agent */
    | 'all-subagents'
    /** Applies only to specific agents identified by agentIds */
    | 'specific';

/**
 * Mode options for runtime action changes.
 * Determines how the action change is applied.
 *
 * @since 2.123.0
 */
export type ActionChangeMode =
    /** Add actions to the existing set */
    | 'add'
    /** Remove actions from the existing set */
    | 'remove';

/**
 * Represents a runtime modification to an agent's available actions.
 *
 * Action changes allow callers to dynamically customize which actions are available
 * to agents at runtime, without modifying the agent's database configuration.
 * This is particularly useful for multi-tenant scenarios where different executions
 * of the same agent need access to different integrations.
 *
 * @example
 * ```typescript
 * // Add CRM and LMS actions to all agents in the hierarchy
 * const change: ActionChange = {
 *   scope: 'global',
 *   mode: 'add',
 *   actionIds: ['crm-search-action-id', 'lms-query-action-id']
 * };
 *
 * // Remove dangerous actions from sub-agents only
 * const restrictChange: ActionChange = {
 *   scope: 'all-subagents',
 *   mode: 'remove',
 *   actionIds: ['delete-record-action-id', 'execute-sql-action-id']
 * };
 *
 * // Add special actions to a specific sub-agent
 * const specificChange: ActionChange = {
 *   scope: 'specific',
 *   mode: 'add',
 *   actionIds: ['special-data-action-id'],
 *   agentIds: ['data-gatherer-sub-agent-id']
 * };
 * ```
 *
 * @since 2.123.0
 */
export interface ActionChange {
    /**
     * Scope of the action change - determines which agents it applies to.
     * - 'global': All agents in the hierarchy
     * - 'root': Only the root agent
     * - 'all-subagents': All sub-agents but not the root
     * - 'specific': Only agents listed in agentIds
     */
    scope: ActionChangeScope;

    /**
     * Mode of the action change.
     * - 'add': Add actions to the agent's available actions
     * - 'remove': Remove actions from the agent's available actions
     */
    mode: ActionChangeMode;

    /**
     * Array of Action entity IDs to add or remove.
     * These must be valid Action IDs from the Actions table.
     */
    actionIds: string[];

    /**
     * Array of Agent IDs that this change applies to.
     * Required when scope is 'specific', ignored otherwise.
     */
    agentIds?: string[];

    /**
     * Optional execution limits for actions being added.
     * Maps action IDs to their maximum executions per agent run.
     * Only applies when mode is 'add'. Ignored for 'remove' mode.
     *
     * @example
     * ```typescript
     * const change: ActionChange = {
     *   scope: 'global',
     *   mode: 'add',
     *   actionIds: ['search-action-id', 'email-action-id'],
     *   actionLimits: {
     *     'search-action-id': 10,    // Max 10 searches per run
     *     'email-action-id': 5       // Max 5 emails per run
     *   }
     * };
     * ```
     */
    actionLimits?: Record<string, number>;
}


