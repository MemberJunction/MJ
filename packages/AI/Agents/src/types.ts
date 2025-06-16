/**
 * @fileoverview Type definitions for the MemberJunction AI Agent framework.
 * 
 * This module contains all type definitions used throughout the AI Agent system,
 * providing strongly-typed interfaces for agent execution, context data, and
 * communication between agents and the underlying prompt execution engine.
 * 
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 * @since 2.49.0
 */

import { ChatMessage } from '@memberjunction/ai';
import { AIAgentEntity, AIAgentRunEntity, AIAgentRunStepEntity } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import { AIPromptRunResult } from '@memberjunction/ai-prompts';
import { ActionResult, ActionResultSimple } from '@memberjunction/actions-base';

/**
 * Parameters required to execute an AI Agent.
 * 
 * @interface ExecuteAgentParams
 * @property {AIAgentEntity} agent - The agent entity to execute, containing all metadata and configuration
 * @property {ChatMessage[]} conversationMessages - Array of chat messages representing the conversation history
 * @property {UserInfo} [contextUser] - Optional user context for permission checking and personalization
 */
export type ExecuteAgentParams = {
    agent: AIAgentEntity;
    conversationMessages: ChatMessage[];
    contextUser?: UserInfo;
}

/**
 * Result returned from executing an AI Agent with comprehensive execution history.
 * 
 * This result structure provides complete visibility into the agent's execution flow,
 * including all prompts executed, actions taken, sub-agents invoked, and decisions made.
 * Each step in the execution chain is tracked with its result and the subsequent decision.
 * 
 * @interface ExecuteAgentResult
 * @property {boolean} success - Whether the overall agent execution was successful
 * @property {BaseAgentNextStep['step']} finalStep - The final step type that terminated execution
 * @property {any} [returnValue] - Optional return value from the agent execution, type depends on agent implementation
 * @property {string} [errorMessage] - Error message if execution failed
 * @property {AIAgentRunEntity} agentRun - The main database entity tracking this execution
 * @property {ExecutionChainStep[]} executionChain - Complete chain of execution steps showing the flow from start to finish
 */
export type ExecuteAgentResult = {
    success: boolean;
    finalStep: BaseAgentNextStep['step'];
    returnValue?: any;
    errorMessage?: string;
    agentRun: AIAgentRunEntity;
    executionChain: ExecutionChainStep[];
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
 * @interface AgentSubAgentRequest
 * @property {string} id - UUID of the sub-agent
 * @property {string} name - Name of the sub-agent
 * @property {string} message - Context and instructions for the sub-agent
 * @property {boolean} terminateAfter - Whether to terminate the parent agent after sub-agent completes
 */
export type AgentSubAgentRequest = {
    id: string;
    name: string;
    message: string;
    terminateAfter: boolean;
}

/**
 * Represents the next step determination from an agent type.
 * 
 * Agent types analyze the output of prompt execution and determine what should
 * happen next in the agent workflow. This type encapsulates that decision along
 * with any necessary context for the determined action.
 * 
 * @interface BaseAgentNextStep
 * @property {'success' | 'failed' | 'retry' | 'sub-agent' | 'actions' | 'chat'} step - The determined next step
 *   - 'success': The agent has completed its task successfully
 *   - 'failed': The agent has failed to complete its task
 *   - 'retry': The agent should retry the last step by running it again
 *   - 'sub-agent': The agent should spawn a sub-agent to handle a specific task
 *   - 'actions': The agent should perform one or more actions using the Actions framework
 *   - 'chat': The agent needs to communicate with the user before proceeding
 * @property {any} [returnValue] - Optional value to return with the step determination
 * @property {string} [errorMessage] - Error message when step is 'failed'
 * @property {string} [retryReason] - Reason for retry when step is 'retry'
 * @property {string} [retryInstructions] - Instructions for the retry attempt
 * @property {AgentSubAgentRequest} [subAgent] - Sub-agent details when step is 'sub-agent'
 * @property {AgentAction[]} [actions] - Array of actions to execute when step is 'actions'
 * @property {string} [userMessage] - Message to send to user when step is 'chat'
 */
export type BaseAgentNextStep = {
    step: 'success' | 'failed' | 'retry' | 'sub-agent' | 'actions' | 'chat';
    returnValue?: any;
    errorMessage?: string;
    retryReason?: string;
    retryInstructions?: string;
    subAgent?: AgentSubAgentRequest;
    actions?: AgentAction[];
    userMessage?: string;
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
 */
export type ExecutionChainStep = {
    stepEntity: AIAgentRunStepEntity;
    executionType: 'prompt' | 'action' | 'sub-agent' | 'decision' | 'chat' | 'validation';
    executionResult: StepExecutionResult;
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
export type StepExecutionResult = 
    | PromptExecutionResult
    | ActionExecutionResult
    | SubAgentExecutionResult
    | DecisionExecutionResult
    | ChatExecutionResult
    | ValidationExecutionResult;

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
 */
export type SubAgentExecutionResult = {
    type: 'sub-agent';
    subAgentId: string;
    subAgentName: string;
    result: ExecuteAgentResult;
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
 * Context maintained throughout an agent run.
 * 
 * This context tracks the current execution state, parent relationships for
 * nested sub-agent calls, and any persistent state needed across steps.
 * 
 * @interface AgentRunContext
 * @property {number} currentStepIndex - Current position in the execution chain (0-based)
 * @property {string[]} parentRunStack - Stack of parent run IDs for nested sub-agent calls
 * @property {string} [conversationId] - Optional conversation ID linking multiple agent runs
 * @property {string} [userId] - Optional user ID for context and permissions
 * @property {Record<string, any>} agentState - Any persistent state maintained across steps
 */
export type AgentRunContext = {
    currentStepIndex: number;
    parentRunStack: string[];
    conversationId?: string;
    userId?: string;
    agentState: Record<string, any>;
}