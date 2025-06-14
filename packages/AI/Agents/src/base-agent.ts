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

import { ActionEntity, AIAgentEntity, AIAgentTypeEntity } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import { AIPromptRunner, AIPromptParams, ChildPromptParam } from '@memberjunction/ai-prompts';
import { BaseAgentType } from './base-agent-type';
import { MJGlobal } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import {
    ExecuteAgentParams, 
    ExecuteAgentResult, 
    AgentContextData,
    BaseAgentNextStep 
} from './types';
import { ActionEntityExtended } from '@memberjunction/actions-base';

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
            // Ensure ActionEngineServer is configured
            await ActionEngineServer.Instance.Config(false, params.contextUser);

            const engine = AIEngine.Instance;

            // Check if agent is active
            if (params.agent.Status !== 'Active') {
                return {
                    nextStep: 'failed',
                    errorMessage: `Agent '${params.agent.Name}' is not active. Current status: ${params.agent.Status}`
                };
            }

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
            
            // Setup the prompt parameters for the child prompt, whose template will run BEFORE the parent prompt and then 
            // the fully rendered child prompt template will be injected into the parent system prompt template
            // as a placeholder for the agent type's AgentPromptPlaceholder. This allows the agent type to
            // control the flow of execution while the agent specific prompt can add additional instruction.
            promptParams.childPrompts = [
                new ChildPromptParam(
                    {
                        prompt: childPrompt,
                        data: contextData,
                        contextUser: params.contextUser,
                        conversationMessages: params.conversationMessages,
                        templateMessageRole: 'user'
                    } as AIPromptParams,
                    agentType.AgentPromptPlaceholder
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
            // Check if this specific agent has its own DriverClass override
            let agentTypeInstance: BaseAgentType | null;
            try {
                agentTypeInstance = await this.getAgentTypeInstance(agentType);
            } catch (error) {
                return {
                    nextStep: 'failed',
                    errorMessage: error.message
                };
            }

            // Let the agent type determine the next step
            const nextStep = await agentTypeInstance.DetermineNextStep(result);

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
            const agentActions = engine.AgentActions.filter(aa => aa.AgentID === agent.ID);
            const actions: ActionEntityExtended[] = ActionEngineServer.Instance.Actions.filter(a => agentActions.some(aa => aa.ActionID === a.ID));
            const activeActions = actions.filter(a => a.Status === 'Active');

            const contextData: AgentContextData = {
                agentName: agent.Name,
                agentDescription: agent.Description,
                subAgentCount: subAgents.length,
                subAgentDetails: JSON.stringify(subAgents.map(sa => {
                    return { 
                        ID: sa.ID,
                        Name: sa.Name, 
                        Description: sa.Description 
                    }}), null, 2),
                actionCount: actions.length,
                actionDetails: JSON.stringify(activeActions.map(action => {
                    return {
                        ID: action.ID,
                        Name: action.Name,
                        Description: action.Description, 
                    };
                }),null, 2),
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
     * agent type classes. It uses the DriverClass field if specified, otherwise falls
     * back to using the agent type's Name. If a specific class doesn't exist, it 
     * returns a default implementation.
     * 
     * @param {AIAgentTypeEntity} agentType - The agent type entity to instantiate
     * 
     * @returns {Promise<BaseAgentType | null>} Instance of the agent type class
     * 
     * @example
     * // For an agent type with DriverClass "LoopAgentType"
     * const agentTypeInstance = await this.getAgentTypeInstance(loopAgentType);
     * 
     * @private
     */
    private async getAgentTypeInstance(agentType: AIAgentTypeEntity): Promise<BaseAgentType | null> {
        // Use DriverClass if specified, otherwise use the Name as the lookup key
        return this.getAgentInstanceWithDriverClass(agentType.DriverClass || agentType.Name);
    }

    /**
     * Instantiates an agent type class using a specific driver class name.
     * 
     * This method is used when an individual agent has its own DriverClass override,
     * allowing for specialized implementations per agent instance.
     * 
     * @param {string} driverClass - The driver class name to instantiate
     * 
     * @returns {Promise<BaseAgentType | null>} Instance of the agent type class
     * 
     * @private
     */
    private async getAgentInstanceWithDriverClass(driverClass: string): Promise<BaseAgentType | null> {
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAgentType>(BaseAgentType, driverClass);
        
        if (!instance) {
            throw new Error(`No implementation found for agent with DriverClass '${driverClass}'. Please ensure the class is registered with the ClassFactory.`);
        }
        
        return instance;
    }
}

