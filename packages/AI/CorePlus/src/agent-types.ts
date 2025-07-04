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

import { AIAgentRunEntity, AIAgentRunEntityExtended, AIAgentTypeEntity, AIPromptEntity } from '@memberjunction/core-entities';
import { ChatMessage } from '@memberjunction/ai';
import { AIAgentEntity } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import { AgentPayloadChangeRequest } from './agent-payload-change-request';


/**
 * Represents a single action to be executed.
 */
export type AgentAction = {
    /** Name of the action */
    name: string;
    /** Parameters to pass to the action */
    params: Record<string, unknown>;
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
     * - 'sub-agent': The agent should spawn a sub-agent to handle a specific task
     * - 'actions': The agent should perform one or more actions using the Actions framework
     * - 'chat': The agent needs to communicate with the user before proceeding
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
    /** Optional, reasoning information from the agent */
    reasoning?: string;
    /** Optional confidence level in the decision (0.0 to 1.0) */
    confidence?: number;    
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
    agent: AIAgentEntity;
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
    parentRun?: AIAgentRunEntity;
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
     * Optional ID of the last run in a run chain.
     * When provided, this links the new run to a previous run, allowing
     * agents to maintain context across multiple interactions.
     * Different from parentRun which is for sub-agent hierarchy.
     */
    lastRunId?: string;
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
    /** JSON stringified array of AIAgentEntity objects representing sub-agents */
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
    systemPrompt?: AIPromptEntity;
    /** The loaded child prompt entity */
    childPrompt?: AIPromptEntity;
}



    