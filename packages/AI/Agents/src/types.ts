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
 * @property {'success' | 'failed' | 'subagent' | 'action'} nextStep - The determined next step after execution
 * @property {any} [returnValue] - Optional return value from the agent execution, type depends on agent implementation
 * @property {string} [rawResult] - Optional raw text result from the underlying LLM execution
 * @property {string} [errorMessage] - Error message if execution failed
 */
export type ExecuteAgentResult = {
    nextStep: 'success' | 'failed' | 'subagent' | 'action';
    returnValue?: any;
    rawResult?: string;
    errorMessage?: string;
}

/**
 * Information about an action available to an agent.
 * 
 * This type represents actions from the MemberJunction Actions framework that
 * can be invoked by agents during execution.
 * 
 * @interface ActionInfo
 * @property {string} id - Unique identifier of the action
 * @property {string} name - Human-readable name of the action
 * @property {string | null} description - Detailed description of what the action does
 * @property {string} [category] - Optional category for grouping related actions
 */
export type ActionInfo = {
    id: string;
    name: string;
    description: string | null;
    category?: string;
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
 * @property {string} actionDetails - JSON stringified array of ActionInfo objects representing available actions
 */
export type AgentContextData = {
    agentName: string | null;
    agentDescription: string | null;
    subAgentCount: number;
    subAgentDetails: string;  // JSON stringified AIAgentEntity[]
    actionCount: number;
    actionDetails: string;     // JSON stringified ActionInfo[]
}

/**
 * Represents the next step determination from an agent type.
 * 
 * Agent types analyze the output of prompt execution and determine what should
 * happen next in the agent workflow. This type encapsulates that decision.
 * 
 * @interface BaseAgentNextStep
 * @property {'success' | 'failed' | 'subagent' | 'action'} step - The determined next step
 *   - 'success': The agent has completed its task successfully
 *   - 'failed': The agent has failed to complete its task
 *   - 'subagent': The agent should spawn a sub-agent to handle a specific task
 *   - 'action': The agent should perform a specific action using the Actions framework
 * @property {any} [returnValue] - Optional value to return with the step determination
 */
export type BaseAgentNextStep = {
    step: 'success' | 'failed' | 'subagent' | 'action';
    returnValue?: any;
}