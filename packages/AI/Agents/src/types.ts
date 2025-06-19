/**
 * @fileoverview Type definitions for the MemberJunction AI Agent framework.
 * 
 * This module contains server-specific type definitions used for agent execution,
 * including callback types and internal context structures.
 * 
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 * @since 2.49.0
 */

import { ChatMessage } from '@memberjunction/ai';
import { AIAgentEntity } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';

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
 * @interface ExecuteAgentParams
 * @property {AIAgentEntity} agent - The agent entity to execute, containing all metadata and configuration
 * @property {ChatMessage[]} conversationMessages - Array of chat messages representing the conversation history
 * @property {UserInfo} [contextUser] - Optional user context for permission checking and personalization
 * @property {AbortSignal} [cancellationToken] - Optional cancellation token to abort the agent execution
 * @property {AgentExecutionProgressCallback} [onProgress] - Optional callback for receiving execution progress updates
 * @property {AgentExecutionStreamingCallback} [onStreaming] - Optional callback for receiving streaming content updates
 * @property {string[]} [parentAgentHierarchy] - Optional parent agent hierarchy for sub-agent execution
 * @property {number} [parentDepth] - Optional parent depth for sub-agent execution
 * @property {any} [context] - Optional additional context data to pass to the agent execution, this is passed to sub-agents and also action execution witin the agent's run cycle
 */
export type ExecuteAgentParams = {
    agent: AIAgentEntity;
    conversationMessages: ChatMessage[];
    contextUser?: UserInfo;
    cancellationToken?: AbortSignal;
    onProgress?: AgentExecutionProgressCallback;
    onStreaming?: AgentExecutionStreamingCallback;
    parentAgentHierarchy?: string[];
    parentDepth?: number;
    context?: any;
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