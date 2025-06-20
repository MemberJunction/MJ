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

import { AIPromptRunResult } from '@memberjunction/ai';
import { AIAgentRunEntity, AIAgentRunStepEntity } from '@memberjunction/core-entities';
import { ActionResult, ActionResultSimple } from '@memberjunction/actions-base';
import { ChatMessage } from '@memberjunction/ai';
import { AIAgentEntity } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';


/**
 * Represents a single action to be executed.
 * 
 * @interface AgentAction
 * @property {string} id - UUID of the action
 * @property {string} name - Name of the action
 * @property {Record<string, unknown>} params - Parameters to pass to the action
 */
export type AgentAction = {
    id: string;
    name: string;
    params: Record<string, unknown>;
}

/**
 * Represents a sub-agent invocation request.
 * 
 * @template TContext - Type of the context object passed to the sub-agent.
 *                      This allows for type-safe context propagation from parent to sub-agent.
 *                      Defaults to any for backward compatibility.
 * 
 * @interface AgentSubAgentRequest
 * @property {string} id - UUID of the sub-agent
 * @property {string} name - Name of the sub-agent
 * @property {string} message - Context and instructions for the sub-agent
 * @property {boolean} terminateAfter - Whether to terminate the parent agent after sub-agent completes
 * @property {TContext} context - Context data passed to the sub-agent by the parent agent.
 *                               This context flows through the entire execution hierarchy,
 *                               allowing sub-agents to access runtime-specific configuration,
 *                               environment settings, and shared state from their parent agents.
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
    id: string;
    name: string;
    message: string;
    terminateAfter: boolean;
    templateParameters?: Record<string, string>; // Optional template parameters for sub-agent invocation
    context?: TContext; // Optional because AI determines sub-agent invocation, context comes from execution params
}

/**
 * Represents the next step determination from an agent type.
 * 
 * Agent types analyze the output of prompt execution and determine what should
 * happen next in the agent workflow. This type encapsulates that decision along
 * with any necessary context for the determined action.
 * 
 * @template TContext - Type of the context object used for sub-agent requests.
 *                      This ensures type safety when passing context to sub-agents.
 *                      Defaults to any for backward compatibility.
 * 
 * @interface BaseAgentNextStep
 * @property {'success' | 'failed' | 'retry' | 'sub-agent' | 'actions' | 'chat'} step - The determined next step
 *   - 'success': The agent has completed its task successfully
 *   - 'failed': The agent has failed to complete its task
 *   - 'retry': The agent should re-run to either:
 *     a) Process new results from completed actions or sub-agents
 *     b) Retry after a failure condition
 *     c) Continue processing with updated context
 *   - 'sub-agent': The agent should spawn a sub-agent to handle a specific task
 *   - 'actions': The agent should perform one or more actions using the Actions framework
 *   - 'chat': The agent needs to communicate with the user before proceeding
 * @property {any} [returnValue] - Optional value to return with the step determination
 * @property {string} [errorMessage] - Error message when step is 'failed'
 * @property {string} [retryReason] - Reason for retry when step is 'retry' (e.g., "Processing action results", "Handling error condition")
 * @property {string} [retryInstructions] - Instructions for the retry attempt, including any new context or results
 * @property {AgentSubAgentRequest<TContext>} [subAgent] - Sub-agent details when step is 'sub-agent'
 * @property {AgentAction[]} [actions] - Array of actions to execute when step is 'actions'
 * @property {string} [userMessage] - Message to send to user when step is 'chat'
 */
export type BaseAgentNextStep<TContext = any> = {
    step: 'success' | 'failed' | 'retry' | 'sub-agent' | 'actions' | 'chat';
    returnValue?: any;
    errorMessage?: string;
    retryReason?: string;
    retryInstructions?: string;
    subAgent?: AgentSubAgentRequest<TContext>;
    actions?: AgentAction[];
    userMessage?: string;
}

/**
 * Result returned from executing an AI Agent with comprehensive execution history.
 * 
 * This result structure provides complete visibility into the agent's execution flow,
 * including all prompts executed, actions taken, sub-agents invoked, and decisions made.
 * The execution tree provides a hierarchical view that mirrors the actual execution flow,
 * with each node containing the AIAgentRunStepEntity via its step property.
 * 
 * @interface ExecuteAgentResult
 * @property {boolean} success - Whether the overall agent execution was successful
 * @property {BaseAgentNextStep['step']} finalStep - The final step type that terminated execution
 * @property {any} [returnValue] - Optional return value from the agent execution, type depends on agent implementation
 * @property {string} [errorMessage] - Error message if execution failed
 * @property {boolean} [cancelled] - Whether the execution was cancelled via cancellation token
 * @property {'user_requested' | 'timeout' | 'system'} [cancellationReason] - Reason for cancellation if cancelled
 * @property {AIAgentRunEntity} agentRun - The main database entity tracking this execution
 * @property {ExecutionNode[]} executionTree - Hierarchical tree of execution nodes showing parent-child relationships
 * @template {T} T - Generic type parameter for return value, allowing flexibility in the type of data returned by the agent
 */
export type ExecuteAgentResult<T = any> = {
    success: boolean;
    finalStep: BaseAgentNextStep['step'];
    returnValue?: T;
    errorMessage?: string;
    cancelled?: boolean;
    cancellationReason?: 'user_requested' | 'timeout' | 'system';
    agentRun: AIAgentRunEntity;
    executionTree: ExecutionNode[];
}

/**
 * Represents a single step in the agent execution chain.
 * 
 * Each step captures what was executed (prompt, action, sub-agent, etc.), the result
 * of that execution, and the decision made about what to do next. This creates a
 * complete audit trail of the agent's decision-making process.
 * 
 * @interface ExecutionChainStep
 * @property {AIAgentRunStepEntity} stepEntity - The database entity tracking this step
 * @property {'prompt' | 'action' | 'sub-agent' | 'decision' | 'chat' | 'validation'} executionType - Type of execution performed in this step
 * @property {StepExecutionResult} executionResult - The result of the execution (type varies based on executionType)
 * @property {NextStepDecision} nextStepDecision - The decision made about what to do next after this step
 * @property {Date} startTime - When this step began execution
 * @property {Date} [endTime] - When this step completed (null while running)
 * @property {number} [durationMs] - How long this step took to execute in milliseconds
 * @template {T} [T] - Generic type parameter for the step's execution result, allowing flexibility in the type of data returned
 */
export type ExecutionChainStep<T = any> = {
    stepEntity: AIAgentRunStepEntity;
    executionType: 'prompt' | 'action' | 'sub-agent' | 'decision' | 'chat' | 'validation';
    executionResult: StepExecutionResult<T>;
    nextStepDecision: NextStepDecision;
    startTime: Date;
    endTime?: Date;
    durationMs?: number;
}

/**
 * Union type for different execution results based on the step type.
 * 
 * Each execution type has its own result structure containing the native result
 * from the underlying system (prompts, actions, etc.) along with metadata.
 */
export type StepExecutionResult<T = any> = 
    | PromptExecutionResult
    | ActionExecutionResult
    | SubAgentExecutionResult<T>
    | DecisionExecutionResult
    | ChatExecutionResult
    | ValidationExecutionResult;

/**
 * Represents a single node in the hierarchical execution tree.
 * 
 * Each node contains the step entity data, rich input/output information,
 * and can have child nodes representing sub-steps (especially for sub-agents).
 * This structure provides complete traceability of the agent's execution flow.
 * 
 * @interface ExecutionNode
 * @property {AIAgentRunStepEntity} step - The database entity for this execution step
 * @property {any} inputData - Full input data passed to this step (varies by step type)
 * @property {any} outputData - Full output data from this step (varies by step type)
 * @property {'prompt' | 'action' | 'sub-agent' | 'decision' | 'chat' | 'validation'} executionType - Type of execution performed
 * @property {Date} startTime - When this step began execution
 * @property {Date} [endTime] - When this step completed (null while running)
 * @property {number} [durationMs] - How long this step took to execute in milliseconds
 * @property {NextStepDecision} [nextStepDecision] - Decision about what to do next after this step
 * @property {ExecutionNode[]} [children] - Child nodes for sub-steps (primarily for sub-agents)
 * @property {number} depth - Nesting level (0 = root agent, 1 = first sub-agent, etc.)
 * @property {string} [parentStepId] - ID of the parent step (null for root steps)
 * @property {string[]} agentHierarchy - Full agent name hierarchy for breadcrumb display
 */
export type ExecutionNode = {
    step: AIAgentRunStepEntity;
    inputData: any;
    outputData: any;
    executionType: 'prompt' | 'action' | 'sub-agent' | 'decision' | 'chat' | 'validation';
    startTime: Date;
    endTime?: Date;
    durationMs?: number;
    nextStepDecision?: NextStepDecision;
    children?: ExecutionNode[];
    depth: number;
    parentStepId?: string;
    agentHierarchy: string[];
}

/**
 * Result from executing a prompt within an agent step.
 * 
 * @interface PromptExecutionResult
 * @property {'prompt'} type - Discriminator for TypeScript union type
 * @property {string} promptId - UUID of the prompt that was executed
 * @property {string} promptName - Human-readable name of the prompt
 * @property {AIPromptRunResult} result - The native result from the prompt execution system
 */
export type PromptExecutionResult = {
    type: 'prompt';
    promptId: string;
    promptName: string;
    result: AIPromptRunResult;
}

/**
 * Result from executing an action within an agent step.
 * 
 * @interface ActionExecutionResult
 * @property {'action'} type - Discriminator for TypeScript union type
 * @property {string} actionId - UUID of the action that was executed
 * @property {string} actionName - Human-readable name of the action
 * @property {ActionResult | ActionResultSimple} result - The native result from the action execution system
 */
export type ActionExecutionResult = {
    type: 'action';
    actionId: string;
    actionName: string;
    result: ActionResult | ActionResultSimple;
}

/**
 * Result from executing a sub-agent within an agent step.
 * 
 * Sub-agent results are recursive, containing the complete execution history
 * of the sub-agent, allowing full drill-down into nested agent calls.
 * 
 * @interface SubAgentExecutionResult
 * @property {'sub-agent'} type - Discriminator for TypeScript union type
 * @property {string} subAgentId - UUID of the sub-agent that was executed
 * @property {string} subAgentName - Human-readable name of the sub-agent
 * @property {ExecuteAgentResult} result - The complete execution result from the sub-agent (recursive)
 * @template T - Generic type parameter for the sub-agent's return value, allowing flexibility in the type of data returned
 */
export type SubAgentExecutionResult<T = any> = {
    type: 'sub-agent';
    subAgentId: string;
    subAgentName: string;
    result: ExecuteAgentResult<T>;
}

/**
 * Result from a decision step where the agent type determines the next action.
 * 
 * @interface DecisionExecutionResult
 * @property {'decision'} type - Discriminator for TypeScript union type
 * @property {string} decisionLogic - Description of what decision logic was applied
 * @property {any} inputContext - The data/context used to make the decision
 * @property {BaseAgentNextStep} result - The next step determination from the agent type
 */
export type DecisionExecutionResult = {
    type: 'decision';
    decisionLogic: string;
    inputContext: any;
    result: BaseAgentNextStep;
}

/**
 * Result from a chat/user interaction step.
 * 
 * @interface ChatExecutionResult
 * @property {'chat'} type - Discriminator for TypeScript union type
 * @property {string} userMessage - The message sent to the user
 * @property {string} [userResponse] - The response received from the user (if any)
 * @property {{ success: boolean; continueExecution: boolean }} result - Whether the interaction was successful and if execution should continue
 */
export type ChatExecutionResult = {
    type: 'chat';
    userMessage: string;
    userResponse?: string;
    result: { success: boolean; continueExecution: boolean };
}

/**
 * Result from a validation step.
 * 
 * @interface ValidationExecutionResult
 * @property {'validation'} type - Discriminator for TypeScript union type
 * @property {string} validationTarget - What was being validated (e.g., "agent configuration", "prompt output")
 * @property {{ valid: boolean; errors?: string[] }} result - Whether validation passed and any error messages
 */
export type ValidationExecutionResult = {
    type: 'validation';
    validationTarget: string;
    result: { valid: boolean; errors?: string[] };
}

/**
 * The decision made about what to do next after a step completes.
 * 
 * This captures not just what was decided, but why it was decided and what
 * will happen next, providing transparency into the agent's decision-making.
 * 
 * @interface NextStepDecision
 * @property {BaseAgentNextStep['step']} decision - The next step type that was decided
 * @property {string} [reasoning] - Human-readable explanation of why this decision was made
 * @property {NextStepDetails} [nextStepDetails] - Details about what will be executed next (if not terminating)
 */
export type NextStepDecision = {
    decision: BaseAgentNextStep['step'];
    reasoning?: string;
    nextStepDetails?: NextStepDetails;
}

/**
 * Details about what will be executed in the next step.
 * 
 * Union type that provides specific information based on the type of next step,
 * enabling proper preparation and execution of the subsequent operation.
 */
export type NextStepDetails = 
    | { type: 'prompt'; promptId: string; promptName: string }
    | { type: 'action'; actions: AgentAction[] }
    | { type: 'sub-agent'; subAgent: AgentSubAgentRequest }
    | { type: 'retry'; retryReason: string; retryInstructions: string }
    | { type: 'chat'; message: string }
    | { type: 'complete'; returnValue?: any };


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
 * 
 * @interface ExecuteAgentParams
 * @property {AIAgentEntity} agent - The agent entity to execute, containing all metadata and configuration
 * @property {ChatMessage[]} conversationMessages - Array of chat messages representing the conversation history
 * @property {UserInfo} [contextUser] - Optional user context for permission checking and personalization
 * @property {AbortSignal} [cancellationToken] - Optional cancellation token to abort the agent execution
 * @property {AgentExecutionProgressCallback} [onProgress] - Optional callback for receiving execution progress updates
 * @property {AgentExecutionStreamingCallback} [onStreaming] - Optional callback for receiving streaming content updates
 * @property {string[]} [parentAgentHierarchy] - Optional parent agent hierarchy for sub-agent execution
 * @property {number} [parentDepth] - Optional parent depth for sub-agent execution
 * @property {Record<string, any>} [data] - Optional data context for template rendering and prompt execution
 * @property {TContext} [context] - Optional additional context data to pass to the agent execution.
 *                                  This context is propagated to all sub-agents and actions throughout 
 *                                  the execution hierarchy. Use this for runtime-specific data such as:
 *                                  - Environment-specific configuration (API endpoints, feature flags)
 *                                  - User-specific settings or preferences
 *                                  - Session-specific data (request IDs, correlation IDs)
 *                                  - External service credentials or connection information
 *                                  
 *                                  Note: Avoid including sensitive data like passwords or API keys 
 *                                  unless absolutely necessary, as context may be passed to multiple 
 *                                  agents and actions.
 * 
 * @example
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
 */
export type ExecuteAgentParams<TContext = any> = {
    agent: AIAgentEntity;
    conversationMessages: ChatMessage[];
    contextUser?: UserInfo;
    cancellationToken?: AbortSignal;
    onProgress?: AgentExecutionProgressCallback;
    onStreaming?: AgentExecutionStreamingCallback;
    parentAgentHierarchy?: string[];
    parentDepth?: number;
    data?: Record<string, any>; // Additional data to pass through execution
    context?: TContext;
}

/**
 * Context data provided to agent prompts during execution.
 * 
 * This data structure is passed to the prompt templates and contains information
 * about the agent, its sub-agents, and available actions. The sub-agent and action
 * details are JSON stringified to work with the template engine.
 * 
 * @interface AgentContextData
 * @property {string | null} agentName - The name of the agent being executed
 * @property {string | null} agentDescription - Description of the agent's purpose and capabilities
 * @property {number} subAgentCount - Number of sub-agents available to this agent
 * @property {string} subAgentDetails - JSON stringified array of AIAgentEntity objects representing sub-agents
 * @property {number} actionCount - Number of actions available to this agent
 * @property {string} actionDetails - JSON stringified array of ActionEntity objects representing available actions
 */
export type AgentContextData = {
    agentName: string | null;
    agentDescription: string | null;
    subAgentCount: number;
    subAgentDetails: string;  // JSON stringified AIAgentEntity[]
    actionCount: number;
    actionDetails: string;     // JSON stringified ActionEntity[]
}

/**
 * Configuration loaded for agent execution.
 * 
 * @interface AgentConfiguration
 * @property {boolean} success - Whether configuration was loaded successfully
 * @property {string} [errorMessage] - Error message if configuration failed
 * @property {any} [agentType] - The loaded agent type entity
 * @property {any} [systemPrompt] - The loaded system prompt entity
 * @property {any} [childPrompt] - The loaded child prompt entity
 */
export type AgentConfiguration = {
    success: boolean;
    errorMessage?: string;
    agentType?: any;
    systemPrompt?: any;
    childPrompt?: any;
}

/**
 * Context maintained throughout an agent run.
 * 
 * This context tracks the current execution state, parent relationships for
 * nested sub-agent calls, agent hierarchy for streaming messages, and any 
 * persistent state needed across steps.
 * 
 * @interface AgentRunContext
 * @property {number} currentStepIndex - Current position in the execution chain (0-based)
 * @property {string[]} parentRunStack - Stack of parent run IDs for nested sub-agent calls
 * @property {string[]} agentHierarchy - Stack of agent names for hierarchical message display (e.g., ["Marketing Agent", "Copywriter Agent"])
 * @property {number} depth - Current nesting depth (0 = root agent, 1 = first sub-agent, etc.)
 * @property {string} [conversationId] - Optional conversation ID linking multiple agent runs
 * @property {string} [userId] - Optional user ID for context and permissions
 * @property {Record<string, any>} agentState - Any persistent state maintained across steps
 */
export type AgentRunContext = {
    currentStepIndex: number;
    parentRunStack: string[];
    agentHierarchy: string[];
    depth: number;
    conversationId?: string;
    userId?: string;
    agentState: Record<string, any>;
}    