/**
 * @fileoverview AgentRunner provides a thin wrapper for executing AI agents
 * using the MemberJunction AI Agent framework.
 * 
 * This module handles agent instantiation using the ClassFactory pattern to ensure
 * the correct agent subclass is used based on the agent type's DriverClass property.
 * 
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 * @since 2.49.0
 */

import { LogError, LogStatusEx, IsVerboseLoggingEnabled } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { ExecuteAgentResult, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import { BaseAgent } from './base-agent';

/**
 * AgentRunner provides a thin wrapper for executing AI agents.
 * 
 * This class handles:
 * - Loading agent type metadata to get the DriverClass
 * - Instantiating the correct agent class using ClassFactory
 * - Passing through to the agent's Execute method
 * 
 * @class AgentRunner
 * @example
 * ```typescript
 * const runner = new AgentRunner();
 * const result = await runner.RunAgent({
 *   agent: myAgent,
 *   conversationMessages: messages,
 *   contextUser: currentUser
 * });
 * ```
 */
export class AgentRunner {
    /**
     * Runs an AI agent with the specified parameters.
     * 
     * This method acts as a thin pass-through that:
     * 1. Loads the agent type to get the DriverClass
     * 2. Uses ClassFactory to instantiate the correct agent class
     * 3. Calls Execute on the agent instance and returns the result
     * 
     * @param {ExecuteAgentParams} params - Parameters for agent execution (same as BaseAgent.Execute)
     * @template C - The type of the agent's context as provided in the ExecuteAgentParams 
     * @template R - The type of the agent's result as returned in ExecuteAgentResult
     * @returns {Promise<ExecuteAgentResult<T>>} The execution result (same as BaseAgent.Execute)
     * 
     * @throws {Error} Throws if agent type loading fails or agent instantiation fails
     */
    public async RunAgent<C = any, R = any>(params: ExecuteAgentParams<C>): Promise<ExecuteAgentResult<R>> {
        try {
            LogStatusEx({
                message: `AgentRunner: Starting execution for agent: ${params.agent.Name} (ID: ${params.agent.ID})`,
                verboseOnly: true,
                isVerboseEnabled: () => params.verbose === true || IsVerboseLoggingEnabled()
            });
            
            // Ensure AIEngine is configured
            await AIEngine.Instance.Config(false, params.contextUser);
            
            // Find the agent type to get the DriverClass
            const agentType = AIEngine.Instance.AgentTypes.find(at => at.ID === params.agent.TypeID);
            if (!agentType) {
                throw new Error(`Agent type not found for ID: ${params.agent.TypeID}`);
            }
            
            // Get the correct agent class using ClassFactory, prefer the agent's DriverClass if specified, otherwise fallback to Agent Type, otherwise we get BaseAgent from ClassFactory
            const driverClass = params.agent.DriverClass || agentType.DriverClass;
            LogStatusEx({
                message: `AgentRunner: Using driver class: ${driverClass}`,
                verboseOnly: true,
                isVerboseEnabled: () => params.verbose === true || IsVerboseLoggingEnabled()
            });
            
            const agentInstance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAgent>(
                BaseAgent,
                driverClass
            );
            
            if (!agentInstance) {
                throw new Error(`Failed to create agent instance for driver class: ${driverClass}`);
            }
            
            // Execute the agent and return the result directly
            return await agentInstance.Execute(params as ExecuteAgentParams<any>) as ExecuteAgentResult<R>;
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            LogError(`AgentRunner execution failed: ${errorMessage}`, undefined, error);
            
            // Re-throw the error since we can't create a proper ExecuteAgentResult without an agent run
            // BaseAgent.Execute will handle creating a proper error result with an agent run
            throw error;
        }
    }
}