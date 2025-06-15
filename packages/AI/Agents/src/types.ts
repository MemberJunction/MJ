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
import { AIAgentEntity } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';

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
 * Result returned from executing an AI Agent.
 * 
 * @interface ExecuteAgentResult
 * @property {BaseAgentNextStep['step']} nextStep - The determined next step after execution (success, failed, retry, sub-agent, action)
 * @property {any} [returnValue] - Optional return value from the agent execution, type depends on agent implementation
 * @property {string} [rawResult] - Optional raw text result from the underlying LLM execution
 * @property {string} [errorMessage] - Error message if execution failed
 */
export type ExecuteAgentResult = {
    nextStep: BaseAgentNextStep['step'];
    returnValue?: any;
    rawResult?: string;
    errorMessage?: string;
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