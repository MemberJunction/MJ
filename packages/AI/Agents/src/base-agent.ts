/**
 * @fileoverview Base implementation of the MemberJunction AI Agent framework.
 * 
 * This module provides the core BaseAgent class that handles agent execution
 * using a hierarchical prompt system. Agents use their type's system prompt
 * as a parent prompt and their own configured prompts as child prompts,
 * enabling sophisticated agent behaviors through prompt composition.
 * 
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 * @since 2.49.0
 */

import { AIAgentEntity, AIAgentTypeEntity } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import { AIPromptRunner, AIPromptParams, ChildPromptParam } from '@memberjunction/ai-prompts';
import { BaseAgentType } from './base-agent-type';
import { MJGlobal } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { 
    ExecuteAgentParams, 
    ExecuteAgentResult, 
    AgentContextData, 
    ActionInfo,
    BaseAgentNextStep 
} from './types';

/**
 * Base implementation for AI Agents in the MemberJunction framework.
 * 
 * The BaseAgent class provides the core execution logic for AI agents using
 * a hierarchical prompt system. It implements the following workflow:
 * 
 * 1. Loads the agent's type to get the system prompt configuration
 * 2. Validates that the agent type has a properly configured placeholder
 * 3. Loads the agent's first active prompt (ordered by ExecutionOrder)
 * 4. Gathers context data including sub-agents and available actions
 * 5. Executes the prompts hierarchically (system prompt as parent, agent prompt as child)
 * 6. Uses the agent type to determine the next step based on execution results
 * 
 * @class BaseAgent
 * @example
 * ```typescript
 * const agent = new BaseAgent();
 * const result = await agent.Execute({
 *   agent: myAgentEntity,
 *   conversationMessages: messages,
 *   contextUser: currentUser
 * });
 * 
 * if (result.nextStep === 'success') {
 *   console.log('Agent completed successfully:', result.returnValue);
 * }
 * ```
 */
export class BaseAgent {
    /**
     * Instance of AIPromptRunner used for executing hierarchical prompts.
     * @private
     */
    private _promptRunner: AIPromptRunner = new AIPromptRunner();

    /**
     * Executes an AI agent using hierarchical prompt composition.
     * 
     * This method orchestrates the entire agent execution process, from loading
     * configuration to executing prompts and determining next steps. It ensures
     * all required metadata is present and handles errors gracefully.
     * 
     * @param {ExecuteAgentParams} params - Parameters for agent execution
     * @param {AIAgentEntity} params.agent - The agent entity to execute
     * @param {ChatMessage[]} params.conversationMessages - Conversation history
     * @param {UserInfo} [params.contextUser] - Optional user context
     * 
     * @returns {Promise<ExecuteAgentResult>} Result containing next step and any output
     * 
     * @throws {Error} Throws if there are issues loading required entities
     * 
     * @example
     * ```typescript
     * const result = await agent.Execute({
     *   agent: salesAgent,
     *   conversationMessages: [{role: 'user', content: 'Help me find products'}],
     *   contextUser: currentUser
     * });
     * ```
     */
    public async Execute(params: ExecuteAgentParams): Promise<ExecuteAgentResult> {
        try {
            // Ensure AIEngine is configured
            await AIEngine.Instance.Config(false, params.contextUser);
            const engine = AIEngine.Instance;

            // Find the agent type using AIEngine
            const agentType = engine.AgentTypes.find(at => at.ID === params.agent.TypeID);
            if (!agentType) {
                return {
                    nextStep: 'failed',
                    errorMessage: `Agent type not found for ID: ${params.agent.TypeID}`
                };
            }

            // Find the system prompt from the agent type
            const systemPrompt = engine.Prompts.find(p => p.ID === agentType.SystemPromptID);
            if (!systemPrompt) {
                return {
                    nextStep: 'failed',
                    errorMessage: `System prompt not found for agent type: ${agentType.Name}`
                };
            }

            // Find the first agent prompt (child prompt)
            const agentPrompt = engine.AgentPrompts
                .filter(ap => ap.AgentID === params.agent.ID && ap.Status === 'Active')
                .sort((a, b) => a.ExecutionOrder - b.ExecutionOrder)[0];
            
            if (!agentPrompt) {
                return {
                    nextStep: 'failed',
                    errorMessage: `No prompts configured for agent: ${params.agent.Name}`
                };
            }

            // Find the actual prompt entity for the agent prompt
            const childPrompt = engine.Prompts.find(p => p.ID === agentPrompt.PromptID);
            if (!childPrompt) {
                return {
                    nextStep: 'failed',
                    errorMessage: `Child prompt not found for ID: ${agentPrompt.PromptID}`
                };
            }

            // Gather context data for the system prompt
            const contextData = await this.gatherContextData(params.agent, params.contextUser);

            // Set up the hierarchical prompt execution
            const promptParams = new AIPromptParams();
            promptParams.prompt = systemPrompt;
            promptParams.data = contextData;
            promptParams.contextUser = params.contextUser;
            promptParams.conversationMessages = params.conversationMessages;
            promptParams.templateMessageRole = 'system';

            // Check for required placeholder configuration
            if (!agentType.AgentPromptPlaceholder) {
                const errorMsg = `Agent type '${agentType.Name}' does not have AgentPromptPlaceholder configured. This field is required to properly inject agent prompt results into the system prompt template.`;
                console.error(errorMsg);
                return {
                    nextStep: 'failed',
                    errorMessage: errorMsg
                };
            }
            
            const placeholderName = agentType.AgentPromptPlaceholder;
            
            promptParams.childPrompts = [
                new ChildPromptParam(
                    {
                        prompt: childPrompt,
                        data: contextData,
                        contextUser: params.contextUser,
                        conversationMessages: params.conversationMessages,
                        templateMessageRole: 'user'
                    } as AIPromptParams,
                    placeholderName
                )
            ];

            // Execute the prompt
            const result = await this._promptRunner.ExecutePrompt(promptParams);

            if (!result.success) {
                return {
                    nextStep: 'failed',
                    errorMessage: result.errorMessage,
                    rawResult: result.rawResult
                };
            }

            // Get the agent type instance to determine next step
            const agentTypeInstance = await this.getAgentTypeInstance(agentType);
            if (!agentTypeInstance) {
                return {
                    nextStep: 'failed',
                    errorMessage: `Could not instantiate agent type: ${agentType.Name}`
                };
            }

            // Let the agent type determine the next step
            const nextStep = await agentTypeInstance.DetermineNextStep();

            return {
                nextStep: nextStep.step,
                returnValue: nextStep.returnValue || result.result,
                rawResult: result.rawResult
            };

        } catch (error) {
            return {
                nextStep: 'failed',
                errorMessage: error.message,
            };
        }
    }


    /**
     * Gathers context data about the agent for use in prompt templates.
     * 
     * This method collects information about the agent's sub-agents and available
     * actions, formatting them for injection into prompt templates. The data is
     * structured to provide the LLM with comprehensive context about the agent's
     * capabilities and hierarchical relationships.
     * 
     * @param {AIAgentEntity} agent - The agent to gather context for
     * @param {UserInfo} [contextUser] - Optional user context (reserved for future use)
     * 
     * @returns {Promise<AgentContextData>} Structured context data for prompts
     * 
     * @throws {Error} If there's an error accessing agent data
     * 
     * @private
     */
    private async gatherContextData(agent: AIAgentEntity, contextUser?: UserInfo): Promise<AgentContextData> {
        try {
            const engine = AIEngine.Instance;
            
            // Find sub-agents using AIEngine
            const subAgents = engine.Agents.filter(a => a.ParentID === agent.ID)
                .sort((a, b) => a.ExecutionOrder - b.ExecutionOrder);
            
            // Load available actions (placeholder for now - would integrate with Actions framework)
            const actions: ActionInfo[] = []; // TODO: Implement action loading from Actions framework

            const contextData: AgentContextData = {
                agentName: agent.Name,
                agentDescription: agent.Description,
                subAgentCount: subAgents.length,
                subAgentDetails: JSON.stringify(subAgents),
                actionCount: actions.length,
                actionDetails: JSON.stringify(actions)
            };

            return contextData;
        } catch (error) {
            throw new Error(`Error gathering context data: ${error.message}`);
        }
    }


    /**
     * Instantiates the appropriate agent type class based on the agent type entity.
     * 
     * This method uses the MemberJunction class factory to dynamically instantiate
     * agent type classes. It follows the naming convention of appending "AgentType"
     * to the agent type name. If a specific class doesn't exist, it returns a
     * default implementation.
     * 
     * @param {AIAgentTypeEntity} agentType - The agent type entity to instantiate
     * 
     * @returns {Promise<BaseAgentType | null>} Instance of the agent type class
     * 
     * @example
     * // For an agent type named "Loop", this will try to instantiate "LoopAgentType"
     * const agentTypeInstance = await this.getAgentTypeInstance(loopAgentType);
     * 
     * @private
     */
    private async getAgentTypeInstance(agentType: AIAgentTypeEntity): Promise<BaseAgentType | null> {
        try {
            // Use the class factory to instantiate the agent type based on its name
            const className = `${agentType.Name}AgentType`;
            return MJGlobal.Instance.ClassFactory.CreateInstance<BaseAgentType>(BaseAgentType, className);
        } catch (error) {
            // If specific agent type class doesn't exist, return a default implementation
            return new DefaultAgentType();
        }
    }
}

/**
 * Default implementation of BaseAgentType used as a fallback.
 * 
 * This class is used when a specific agent type implementation cannot be found
 * in the class factory. It provides a simple success response, allowing agents
 * to function even without custom type implementations.
 * 
 * @class DefaultAgentType
 * @extends {BaseAgentType}
 * 
 * @internal
 */
class DefaultAgentType extends BaseAgentType {
    /**
     * Determines the next step for the agent execution.
     * 
     * This default implementation always returns 'success', providing a simple
     * pass-through behavior for agents without custom type logic.
     * 
     * @returns {Promise<BaseAgentNextStep>} Always returns success step
     * 
     * @override
     */
    public async DetermineNextStep(): Promise<BaseAgentNextStep> {
        // Default behavior - just return success
        return {
            step: 'success'
        };
    }
}