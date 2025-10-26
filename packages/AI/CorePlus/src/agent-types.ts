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

import { AIAgentRunEntityExtended, AIAgentTypeEntity, AIPromptEntityExtended } from '@memberjunction/core-entities';
import { ChatMessage } from '@memberjunction/ai';
import { AIAgentEntityExtended } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import { AgentPayloadChangeRequest, BaseAgentSuggestedResponse } from './agent-payload-change-request';
import { AIAPIKey } from '@memberjunction/ai';

/**
 * Universal ForEach loop configuration used by all agent types.
 * Flow agents convert AIAgentStep configuration to this format.
 * Loop agents receive this from LLM responses.
 * @since 2.112.0
 */
export interface ForEachOperation {
    /** Path in payload to array to iterate over */
    collectionPath: string;
    /** Variable name for current item (default: "item") */
    itemVariable?: string;
    /** Variable name for loop index (default: "index") */
    indexVariable?: string;
    /** Maximum iterations (undefined=1000, 0=unlimited, >0=limit) */
    maxIterations?: number;
    /** Continue processing if an iteration fails (default: false) */
    continueOnError?: boolean;
    /** Delay between iterations in milliseconds (default: 0) */
    delayBetweenIterationsMs?: number;

    /** Execute action per iteration */
    action?: {
        name: string;
        params: Record<string, unknown>;
        outputMapping?: string;  // JSON mapping for Flow agents (maps action outputs to payload)
    };

    /** Execute sub-agent per iteration */
    subAgent?: {
        name: string;
        message: string;
        templateParameters?: Record<string, string>;
    };
}

/**
 * Universal While loop configuration used by all agent types.
 * Flow agents convert AIAgentStep configuration to this format.
 * Loop agents receive this from LLM responses.
 * @since 2.112.0
 */
export interface WhileOperation {
    /** Boolean expression evaluated before each iteration */
    condition: string;
    /** Variable name for attempt context (default: "attempt") */
    itemVariable?: string;
    /** Maximum iterations (undefined=100, 0=unlimited, >0=limit) */
    maxIterations?: number;
    /** Continue processing if an iteration fails (default: false) */
    continueOnError?: boolean;
    /** Delay between iterations in milliseconds (default: 0) */
    delayBetweenIterationsMs?: number;

    /** Execute action per iteration */
    action?: {
        name: string;
        params: Record<string, unknown>;
        outputMapping?: string;  // JSON mapping for Flow agents (maps action outputs to payload)
    };

    /** Execute sub-agent per iteration */
    subAgent?: {
        name: string;
        message: string;
        templateParameters?: Record<string, string>;
    };
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
    step: AIAgentRunEntityExtended['FinalStep']
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
     * Optional, when step is 'chat' or 'success', a list of suggested responses
     * to show the user for quick selection in a UI.
     */
    suggestedResponses?: BaseAgentSuggestedResponse[];
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
    agentRun: AIAgentRunEntityExtended;
    /**
     * The artifact type ID for the returned payload.
     * This identifies what type of artifact the payload represents (e.g., JSON, Markdown, HTML).
     * Used by UI to determine how to render the payload and which extract rules to apply.
     * If not specified, falls back to the agent's default artifact type configuration.
     */
    payloadArtifactTypeID?: string;
    /**
     * Optional suggested responses to show the user for quick selection in a UI.
     * Populated when the agent's final step is 'Chat' or 'Success' and includes suggested responses.
     */
    suggestedResponses?: BaseAgentSuggestedResponse[];
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
    /** Progress percentage (0-100) */
    percentage: number;
    /** Human-readable status message */
    message: string;
    /** Additional metadata about the current step */
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
 * ```
 */
export type ExecuteAgentParams<TContext = any, P = any> = {
    /** The agent entity to execute, containing all metadata and configuration */
    agent: AIAgentEntityExtended;
    /** Array of chat messages representing the conversation history */
    conversationMessages: ChatMessage[];
    /** Optional user context for permission checking and personalization */
    contextUser?: UserInfo;
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
    /** Optional parent agent run entity for nested sub-agent execution */
    parentRun?: AIAgentRunEntityExtended;
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
    /** JSON stringified array of AIAgentEntityExtended objects representing sub-agents */
    subAgentDetails: string;
    /** Number of actions available to this agent */
    actionCount: number;
    /** JSON stringified array of ActionEntity objects representing available actions */
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
    agentType?: AIAgentTypeEntity;
    /** The loaded system prompt entity */
    systemPrompt?: AIPromptEntityExtended;
    /** The loaded child prompt entity */
    childPrompt?: AIPromptEntityExtended;
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


