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
import { ChatMessage } from '@memberjunction/ai';
import { BaseAgentType } from './agent-types/base-agent-type';
import { MJGlobal } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import {
    ExecuteAgentParams, 
    ExecuteAgentResult, 
    AgentContextData,
    AgentAction,
    AgentSubAgentRequest,
    AgentConfiguration
} from './types';
import { ActionEntityExtended } from '@memberjunction/actions-base';
import { AgentRunner } from './AgentRunner';

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
            // Initialize engines
            await this.initializeEngines(params.contextUser);

            // Validate agent
            const validationResult = await this.validateAgent(params.agent);
            if (validationResult) return validationResult;

            // Load agent configuration
            const config = await this.loadAgentConfiguration(params.agent);
            if (!config.success) {
                return {
                    nextStep: 'failed',
                    errorMessage: config.errorMessage
                };
            }

            // Prepare and execute prompt
            const promptParams = await this.preparePromptParams(
                config.agentType!, 
                config.systemPrompt!, 
                config.childPrompt!,
                params
            );
            
            const result = await this.executePrompt(promptParams);
            if (!result.success) {
                return {
                    nextStep: 'failed',
                    errorMessage: result.errorMessage,
                    rawResult: result.rawResult
                };
            }

            // Process the result and determine next step
            return await this.processNextStep(params, config.agentType!, result);

        } catch (error) {
            return {
                nextStep: 'failed',
                errorMessage: error.message,
            };
        }
    }

    /**
     * Initializes the AI and Action engines. Subclasses can override this to add any
     * additional engine/metadata loading initialization they want to do and this method
     * will be called at the right time in the agent execution process.
     * 
     * @param {UserInfo} [contextUser] - Optional user context
     * @protected
     */
    protected async initializeEngines(contextUser?: UserInfo): Promise<void> {
        await AIEngine.Instance.Config(false, contextUser);
        await ActionEngineServer.Instance.Config(false, contextUser);
    }

    /**
     * Validates that the agent is active and ready for execution.
     * 
     * @param {AIAgentEntity} agent - The agent to validate
     * @returns {ExecuteAgentResult | null} Error result if validation fails, null if valid
     * @protected
     */
    protected async validateAgent(agent: AIAgentEntity): Promise<ExecuteAgentResult | null> {
        if (agent.Status !== 'Active') {
            return {
                nextStep: 'failed',
                errorMessage: `Agent '${agent.Name}' is not active. Current status: ${agent.Status}`
            };
        }
        return null;
    }

    /**
     * Loads all required configuration for agent execution.
     * 
     * @param {AIAgentEntity} agent - The agent to load configuration for
     * @returns {Promise<AgentConfiguration>} Configuration object with loaded entities
     * @protected
     */
    protected async loadAgentConfiguration(agent: AIAgentEntity): Promise<AgentConfiguration> {
        const engine = AIEngine.Instance;

        // Find the agent type
        const agentType = engine.AgentTypes.find(at => at.ID === agent.TypeID);
        if (!agentType) {
            return {
                success: false,
                errorMessage: `Agent type not found for ID: ${agent.TypeID}`
            };
        }

        // Find the system prompt
        const systemPrompt = engine.Prompts.find(p => p.ID === agentType.SystemPromptID);
        if (!systemPrompt) {
            return {
                success: false,
                errorMessage: `System prompt not found for agent type: ${agentType.Name}`
            };
        }

        // Find the first active agent prompt
        const agentPrompt = engine.AgentPrompts
            .filter(ap => ap.AgentID === agent.ID && ap.Status === 'Active')
            .sort((a, b) => a.ExecutionOrder - b.ExecutionOrder)[0];
        
        if (!agentPrompt) {
            return {
                success: false,
                errorMessage: `No prompts configured for agent: ${agent.Name}`
            };
        }

        // Find the actual prompt entity
        const childPrompt = engine.Prompts.find(p => p.ID === agentPrompt.PromptID);
        if (!childPrompt) {
            return {
                success: false,
                errorMessage: `Child prompt not found for ID: ${agentPrompt.PromptID}`
            };
        }

        // Validate placeholder configuration
        if (!agentType.AgentPromptPlaceholder) {
            return {
                success: false,
                errorMessage: `Agent type '${agentType.Name}' does not have AgentPromptPlaceholder configured.`
            };
        }

        return {
            success: true,
            agentType,
            systemPrompt,
            childPrompt
        };
    }

    /**
     * Prepares prompt parameters for hierarchical execution.
     * 
     * @param {AIAgentTypeEntity} agentType - The agent type
     * @param {AIPromptEntity} systemPrompt - The system prompt
     * @param {AIPromptEntity} childPrompt - The child prompt
     * @param {ExecuteAgentParams} params - Original execution parameters
     * @returns {Promise<AIPromptParams>} Configured prompt parameters
     * @protected
     */
    protected async preparePromptParams(
        agentType: AIAgentTypeEntity,
        systemPrompt: any,
        childPrompt: any,
        params: ExecuteAgentParams
    ): Promise<AIPromptParams> {
        // Gather context data
        const contextData = await this.gatherContextData(params.agent, params.contextUser);

        // Set up the hierarchical prompt execution
        const promptParams = new AIPromptParams();
        promptParams.prompt = systemPrompt;
        promptParams.data = contextData;
        promptParams.contextUser = params.contextUser;
        promptParams.conversationMessages = params.conversationMessages;
        promptParams.templateMessageRole = 'system';

        // Setup child prompt parameters
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

        return promptParams;
    }

    /**
     * Executes the configured prompt.
     * 
     * @param {AIPromptParams} promptParams - The prompt parameters
     * @returns {Promise<AIPromptRunResult>} The prompt execution result
     * @protected
     */
    protected async executePrompt(promptParams: AIPromptParams): Promise<any> {
        return await this._promptRunner.ExecutePrompt(promptParams);
    }

    /**
     * Processes the next step based on agent type determination.
     * 
     * @param {ExecuteAgentParams} params - Original execution parameters
     * @param {AIAgentTypeEntity} agentType - The agent type
     * @param {AIPromptRunResult} promptResult - The prompt execution result
     * @returns {Promise<ExecuteAgentResult>} The execution result
     * @protected
     */
    protected async processNextStep(
        params: ExecuteAgentParams,
        agentType: AIAgentTypeEntity,
        promptResult: any
    ): Promise<ExecuteAgentResult> {
        // Get the agent type instance
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
        const nextStep = await agentTypeInstance.DetermineNextStep(promptResult);

        // Handle different next step types
        switch (nextStep.step) {
            case 'actions':
                return await this.handleActionResults(params, nextStep, promptResult);
                
            case 'sub-agent':
                return await this.handleSubAgentResult(params, nextStep, promptResult);
                
            case 'chat':
                // Chat response goes directly back to user
                return {
                    nextStep: 'chat',
                    returnValue: nextStep.userMessage,
                    rawResult: promptResult.rawResult
                };
                
            default:
                // For success, failed, retry - return as is
                return {
                    nextStep: nextStep.step,
                    returnValue: nextStep.returnValue || promptResult.result,
                    rawResult: promptResult.rawResult,
                    errorMessage: nextStep.errorMessage
                };
        }
    }

    /**
     * Handles action execution and recursive agent calling.
     * 
     * @param {ExecuteAgentParams} params - Original execution parameters
     * @param {BaseAgentNextStep} nextStep - The next step with actions
     * @param {AIPromptRunResult} promptResult - The prompt result
     * @returns {Promise<ExecuteAgentResult>} The execution result
     * @protected
     */
    protected async handleActionResults(
        params: ExecuteAgentParams,
        nextStep: any,
        promptResult: any
    ): Promise<ExecuteAgentResult> {
        if (!nextStep.actions || nextStep.actions.length === 0) {
            return {
                nextStep: 'failed',
                errorMessage: 'No actions specified by agent type.'
            };
        }

        // Execute the actions
        const actionResults = await this.ExecuteActions(nextStep.actions, params.contextUser);
        
        // Create a message with action results
        const actionResultMessage = this.createActionResultMessage(nextStep.actions, actionResults);
        
        // Recursively call Execute with the new message
        const updatedMessages = [...params.conversationMessages, actionResultMessage];
        
        return await this.Execute({
            ...params,
            conversationMessages: updatedMessages
        });
    }

    /**
     * Handles sub-agent execution and recursive agent calling.
     * 
     * @param {ExecuteAgentParams} params - Original execution parameters  
     * @param {BaseAgentNextStep} nextStep - The next step with sub-agent
     * @param {AIPromptRunResult} promptResult - The prompt result
     * @returns {Promise<ExecuteAgentResult>} The execution result
     * @protected
     */
    protected async handleSubAgentResult(
        params: ExecuteAgentParams,
        nextStep: any,
        promptResult: any
    ): Promise<ExecuteAgentResult> {
        if (!nextStep.subAgent) {
            return {
                nextStep: 'failed',
                errorMessage: 'No sub-agent specified by agent type.'
            };
        }

        // Execute the sub-agent
        const subAgentResult = await this.ExecuteSubAgent(
            nextStep.subAgent, 
            params.conversationMessages, 
            params.contextUser
        );
        
        if (nextStep.subAgent.terminateAfter) {
            // If terminateAfter is true, we stop here and return the sub-agent result
            return {
                nextStep: 'success',
                returnValue: subAgentResult,
                rawResult: promptResult.rawResult
            };
        } else {
            // Continue with the main agent execution
            const subAgentResultMessage = this.createSubAgentResultMessage(
                nextStep.subAgent, 
                subAgentResult
            );
            
            // Recursively call Execute with the new message
            const updatedMessages = [...params.conversationMessages, subAgentResultMessage];
            
            return await this.Execute({
                ...params,
                conversationMessages: updatedMessages
            });
        }
    }

    /**
     * Creates a chat message containing action execution results.
     * 
     * @param {AgentAction[]} actions - The actions that were executed
     * @param {any[]} results - The results from action execution
     * @returns {ChatMessage} A formatted message with action results
     * @protected
     */
    protected createActionResultMessage(actions: AgentAction[], results: any[]): ChatMessage {
        const resultSummary = actions.map((action, index) => {
            const result = results[index];
            const outputParams = result.Params?.filter((p: any) => 
                p.Type === 'Output' || p.Type === 'Both'
            ) || [];
            
            return {
                actionName: action.name,
                success: result.Success,
                resultCode: result.Result?.Code || 'N/A',
                message: result.Message || null,
                outputs: outputParams.reduce((acc: any, param: any) => {
                    acc[param.Name] = param.Value;
                    return acc;
                }, {})
            };
        });

        return {
            role: 'user',
            content: `Action results:\n${JSON.stringify(resultSummary, null, 2)}`
        };
    }

    /**
     * Creates a chat message containing sub-agent execution results.
     * 
     * @param {AgentSubAgentRequest} subAgent - The sub-agent that was executed
     * @param {any} result - The result from sub-agent execution
     * @returns {ChatMessage} A formatted message with sub-agent results
     * @protected
     */
    protected createSubAgentResultMessage(subAgent: AgentSubAgentRequest, result: any): ChatMessage {
        return {
            role: 'user',
            content: `Sub-agent '${subAgent.name}' result:\n${typeof result === 'string' ? result : JSON.stringify(result, null, 2)}`
        };
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
     * @param {UserInfo} [_contextUser] - Optional user context (reserved for future use)
     * 
     * @returns {Promise<AgentContextData>} Structured context data for prompts
     * 
     * @throws {Error} If there's an error accessing agent data
     * 
     * @private
     */
    private async gatherContextData(agent: AIAgentEntity, _contextUser?: UserInfo): Promise<AgentContextData> {
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
                subAgentDetails: this.formatSubAgentDetails(subAgents),
                actionCount: actions.length,
                actionDetails: this.formatActionDetails(activeActions),
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

    /**
     * Executes multiple actions in parallel.
     * 
     * This method executes one or more actions using the MemberJunction Actions framework.
     * All actions are executed in parallel for optimal performance. The full ActionResult
     * objects are returned, allowing the caller to access result codes, output parameters,
     * and other execution details.
     * 
     * @param {AgentAction[]} actions - Array of actions to execute
     * @param {UserInfo} [contextUser] - Optional user context for permissions
     * 
     * @returns {Promise<ActionResult[]>} Array of ActionResult objects from each action execution
     * 
     * @throws {Error} If any action fails to execute
     * 
     * @example
     * ```typescript
     * const results = await this.ExecuteActions([
     *   { id: 'action1', name: 'SendEmail', params: { to: 'user@example.com' } },
     *   { id: 'action2', name: 'UpdateRecord', params: { id: 123, status: 'active' } }
     * ]);
     * // results[0].Success, results[0].Result?.Code, results[0].Params
     * ```
     */
    public async ExecuteActions(actions: AgentAction[], contextUser?: UserInfo): Promise<any[]> {
        try {
            const actionEngine = ActionEngineServer.Instance;
            
            // Execute all actions in parallel
            const actionPromises = actions.map(async (action) => {
                // Find the action entity
                const actionEntity = actionEngine.Actions.find(a => 
                    a.ID === action.id || a.Name === action.name
                );
                
                if (!actionEntity) {
                    throw new Error(`Action not found: ${action.name || action.id}`);
                }
                
                // Convert params object to ActionParam array
                const actionParams = Object.entries(action.params || {}).map(([key, value]) => ({
                    Name: key,
                    Value: value,
                    Type: 'Input' as const
                }));
                
                // Execute the action and return the full ActionResult
                const result = await actionEngine.RunAction({
                    Action: actionEntity,
                    Params: actionParams,
                    ContextUser: contextUser,
                    Filters: [],
                    SkipActionLog: false
                });
                
                if (!result.Success) {
                    throw new Error(`Action '${action.name}' failed: ${result.Message || 'Unknown error'}`);
                }
                
                return result;
            });
            
            // Wait for all actions to complete and return full results
            return await Promise.all(actionPromises);
            
        } catch (error) {
            throw new Error(`Error executing actions: ${error.message}`);
        }
    }

    /**
     * Executes a sub-agent synchronously.
     * 
     * This method creates a new instance of AgentRunner to execute a sub-agent.
     * The sub-agent receives the provided message/context and runs to completion.
     * If terminateAfter is true, the parent agent will not continue after the
     * sub-agent completes.
     * 
     * @param {AgentSubAgentRequest} subAgentRequest - Sub-agent execution details
     * @param {ChatMessage[]} conversationMessages - Current conversation history
     * @param {UserInfo} [contextUser] - Optional user context
     * 
     * @returns {Promise<any>} Result from the sub-agent execution
     * 
     * @throws {Error} If sub-agent cannot be found or execution fails
     * 
     * @example
     * ```typescript
     * const result = await this.ExecuteSubAgent({
     *   id: 'agent123',
     *   name: 'DataAnalysisAgent',
     *   message: 'Analyze sales data for Q4',
     *   terminateAfter: false
     * }, messages);
     * ```
     */
    public async ExecuteSubAgent(
        subAgentRequest: AgentSubAgentRequest, 
        conversationMessages: ChatMessage[],
        contextUser?: UserInfo
    ): Promise<any> {
        try {
            const engine = AIEngine.Instance;
            
            // Find the sub-agent
            const subAgent = engine.Agents.find(a => 
                a.ID === subAgentRequest.id || a.Name === subAgentRequest.name
            );
            
            if (!subAgent) {
                throw new Error(`Sub-agent not found: ${subAgentRequest.name || subAgentRequest.id}`);
            }
            
            // Create a new AgentRunner instance
            const runner = new AgentRunner();
            
            // Prepare messages for sub-agent, adding the context message
            const subAgentMessages: ChatMessage[] = [
                ...conversationMessages,
                {
                    role: 'user',
                    content: subAgentRequest.message
                }
            ];
            
            // Execute the sub-agent
            const result = await runner.RunAgent({
                agent: subAgent,
                conversationMessages: subAgentMessages,
                contextUser: contextUser
            });
            
            // Check if execution was successful
            if (result.nextStep === 'failed') {
                throw new Error(`Sub-agent '${subAgentRequest.name}' failed: ${result.errorMessage || 'Unknown error'}`);
            }
            
            // Return the result value
            return result.returnValue;
            
        } catch (error) {
            throw new Error(`Error executing sub-agent: ${error.message}`);
        }
    }

    /**
     * Formats sub-agent details for inclusion in prompt context.
     * 
     * @param {AIAgentEntity[]} subAgents - Array of sub-agent entities
     * @returns {string} JSON formatted string with sub-agent details
     * @private
     */
    private formatSubAgentDetails(subAgents: AIAgentEntity[]): string {
        return JSON.stringify(subAgents.map(sa => ({
            ID: sa.ID,
            Name: sa.Name,
            Description: sa.Description,
            Type: sa.TypeID ? this.getAgentTypeName(sa.TypeID) : 'Unknown',
            Status: sa.Status,
            ExecutionMode: sa.ExecutionMode,
            ExecutionOrder: sa.ExecutionOrder
        })), null, 2);
    }

    /**
     * Formats action details for inclusion in prompt context.
     * 
     * @param {ActionEntityExtended[]} actions - Array of action entities
     * @returns {string} JSON formatted string with comprehensive action details
     * @private
     */
    private formatActionDetails(actions: ActionEntityExtended[]): string {
        return JSON.stringify(actions.map(action => ({
            ID: action.ID,
            Name: action.Name,
            Description: action.Description,
            // Parameters with detailed information
            Parameters: {
                Input: action.Params
                    .filter(p => p.Type === 'Input' || p.Type === 'Both')
                    .map(param => this.formatActionParameter(param)),
                Output: action.Params
                    .filter(p => p.Type === 'Output' || p.Type === 'Both')
                    .map(param => this.formatActionParameter(param))
            },
            // Result codes with detailed information
            ResultCodes: action.ResultCodes.map(rc => ({
                Code: rc.ResultCode,
                IsSuccess: rc.IsSuccess,
                Description: rc.Description || 'No description provided',
                // Help LLM understand when to expect each result
                Usage: this.inferResultCodeUsage(rc.ResultCode, rc.IsSuccess)
            })),
            // Additional metadata
            Category: action.CategoryID ? this.getActionCategoryName(action.CategoryID) : null,
            Status: action.Status
        })), null, 2);
    }

    /**
     * Formats a single action parameter for display.
     * 
     * @param {any} param - The action parameter to format
     * @returns {object} Formatted parameter object
     * @private
     */
    private formatActionParameter(param: any): object {
        return {
            Name: param.Name,
            Type: param.Type,
            IsRequired: param.IsRequired,
            IsArray: param.IsArray,
            DefaultValue: param.DefaultValue,
            Description: param.Description,
            ValueType: param.ValueType
        };
    }

    /**
     * Gets the agent type name for a given type ID.
     * 
     * @param {string} typeID - The agent type ID
     * @returns {string} The agent type name or 'Unknown'
     * @private
     */
    private getAgentTypeName(typeID: string): string {
        const agentType = AIEngine.Instance.AgentTypes.find(at => at.ID === typeID);
        return agentType?.Name || 'Unknown';
    }

    /**
     * Gets value list items for a parameter.
     * 
     * @param {string} valueListID - The value list ID
     * @returns {string[] | null} Array of allowed values or null
     * @private
     */
    private getValueListItems(valueListID: string): string[] | null {
        // This would need to be implemented based on your value list storage
        // For now, returning null
        return null;
    }

    /**
     * Gets the action category name for a given category ID.
     * 
     * @param {string} categoryID - The action category ID
     * @returns {string} The category name or 'Uncategorized'
     * @private
     */
    private getActionCategoryName(categoryID: string): string {
        // This would need to be implemented based on your category storage
        // For now, returning a placeholder
        return 'General';
    }

    /**
     * Infers when a result code might be returned based on its name and success status.
     * 
     * @param {string} resultCode - The result code
     * @param {boolean} isSuccess - Whether this is a success code
     * @returns {string} Description of when this result might occur
     * @private
     */
    private inferResultCodeUsage(resultCode: string, isSuccess: boolean): string {
        // Common patterns for result codes
        if (resultCode === 'SUCCESS') {
            return 'Returned when the action completes successfully';
        } else if (resultCode === 'FAILED') {
            return 'Generic failure - check error message for details';
        } else if (resultCode.includes('MISSING_PARAMETERS')) {
            return 'Returned when required parameters are not provided';
        } else if (resultCode.includes('INVALID')) {
            return 'Returned when input validation fails';
        } else if (resultCode.includes('NOT_FOUND')) {
            return 'Returned when the requested resource cannot be found';
        } else if (resultCode.includes('TIMEOUT')) {
            return 'Returned when the operation times out';
        } else if (resultCode.includes('PERMISSION') || resultCode.includes('UNAUTHORIZED')) {
            return 'Returned when permission is denied';
        } else {
            return isSuccess 
                ? 'Specific success condition - see description' 
                : 'Specific error condition - see description';
        }
    }
}

