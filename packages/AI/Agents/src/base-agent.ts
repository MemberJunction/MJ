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

import { AIAgentEntity, AIAgentTypeEntity, AIAgentRunEntity, AIAgentRunStepEntity, TemplateParamEntity } from '@memberjunction/core-entities';
import { UserInfo, Metadata, RunView } from '@memberjunction/core';
import { AIPromptRunner, AIPromptParams, ChildPromptParam } from '@memberjunction/ai-prompts';
import { ChatMessage, AIPromptRunResult } from '@memberjunction/ai';
import { BaseAgentType } from './agent-types/base-agent-type';
import { CopyScalarsAndArrays, MJGlobal } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import {
    ExecuteAgentParams, 
    AgentContextData,
    AgentConfiguration,
    AgentRunContext,
    AgentExecutionProgressCallback,
    ExecuteAgentResult,
    AgentAction,
    AgentSubAgentRequest,
    ExecutionChainStep,
    ExecutionNode,
    NextStepDecision,
    PromptExecutionResult,
    ActionExecutionResult,
    SubAgentExecutionResult,
    ValidationExecutionResult,
    ChatExecutionResult,
    NextStepDetails,
    BaseAgentNextStep
} from '@memberjunction/aiengine';
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
 * // Using with default context type (any)
 * const agent = new BaseAgent();
 * const result = await agent.Execute({
 *   agent: myAgentEntity,
 *   conversationMessages: messages,
 *   contextUser: currentUser
 * });
 * 
 * // Using with typed context through ExecuteAgentParams
 * interface MyContext {
 *   apiKey: string;
 *   environment: 'dev' | 'prod';
 * }
 * 
 * const agent = new BaseAgent();
 * const params: ExecuteAgentParams<MyContext> = {
 *   agent: myAgentEntity,
 *   conversationMessages: messages,
 *   contextUser: currentUser,
 *   context: {
 *     apiKey: 'abc123',
 *     environment: 'prod'
 *   }
 * };
 * const result = await agent.Execute(params);
 * ```
 */
export class BaseAgent {
    /**
     * Instance of AIPromptRunner used for executing hierarchical prompts.
     * @private
     */
    private _promptRunner: AIPromptRunner = new AIPromptRunner();

    /**
     * Metadata instance for creating entity objects.
     * @private
     */
    private _metadata: Metadata = new Metadata();

    /**
     * Current agent run context.
     * @private
     */
    private _runContext: AgentRunContext | null = null;

    /**
     * Current agent run entity.
     * @private
     */
    private _agentRun: AIAgentRunEntity | null = null;

    /**
     * Execution chain tracking all steps.
     * @private
     */
    private _executionChain: ExecutionChainStep[] = [];
    
    /**
     * All progress steps including intermediate ones for complete execution tracking.
     * @private
     */
    private _allProgressSteps: any[] = [];

    /**
     * Sub-agent execution results.
     * @private
     */
    private _subAgentRuns: ExecuteAgentResult[] = [];

    /**
     * Get all agent run steps for the current execution.
     * @private
     */
    private async getAgentRunSteps(contextUser?: UserInfo): Promise<AIAgentRunStepEntity[]> {
        if (!this._agentRun) return [];
        
        const md = new Metadata();
        const rv = new RunView();
        const result = await rv.RunView<AIAgentRunStepEntity>({
            EntityName: 'MJ: AI Agent Run Steps',
            ExtraFilter: `AgentRunID = '${this._agentRun.ID}'`,
            OrderBy: 'StepNumber',
            ResultType: 'entity_object'
        }, contextUser);
        
        return result.Success ? result.Results : [];
    }

    /**
     * Wrapper for progress callbacks that captures all progress events.
     * @private
     */
    private wrapProgressCallback(originalCallback?: AgentExecutionProgressCallback): AgentExecutionProgressCallback | undefined {
        if (!originalCallback) return undefined;
        
        return (progress) => {
            // Capture all progress events
            this._allProgressSteps.push({
                ...progress,
                timestamp: new Date(),
                agentHierarchy: this._runContext?.agentHierarchy || [],
                depth: this._runContext?.depth || 0
            });
            
            // Call original callback
            originalCallback(progress);
        };
    }

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
     * @param {any} [params.context] - Optional context object passed to sub-agents and actions
     * @template C - The type of the agent's context as provided in the ExecuteAgentParams
     * @template R - The type of the agent's result as returned in ExecuteAgentResult
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
    public async Execute<C = any, R = any>(params: ExecuteAgentParams<C>): Promise<ExecuteAgentResult<R>> {
        try {
            // Wrap the progress callback to capture all events
            const wrappedParams = {
                ...params,
                onProgress: this.wrapProgressCallback(params.onProgress)
            };
            
            // Check for cancellation at start
            if (params.cancellationToken?.aborted) {
                return await this.createCancelledResult('Cancelled before execution started', params.contextUser);
            }

            // Report initialization progress
            wrappedParams.onProgress?.({
                step: 'initialization',
                percentage: 0,
                message: this.formatHierarchicalMessage(`Initializing ${params.agent.Name} agent and preparing execution environment`)
            });

            // Initialize execution tracking
            await this.initializeAgentRun(wrappedParams);

            // Initialize engines
            await this.initializeEngines(params.contextUser);

            // Check for cancellation after initialization
            if (params.cancellationToken?.aborted) {
                return await this.createCancelledResult('Cancelled during initialization', params.contextUser);
            }

            // Report validation progress
            wrappedParams.onProgress?.({
                step: 'validation',
                percentage: 10,
                message: this.formatHierarchicalMessage('Validating agent configuration and loading prompts')
            });

            // Create and track validation step
            const validationResult = await this.validateAgentWithTracking(params.agent, params.contextUser);
            if (validationResult) return validationResult;

            // Load agent configuration
            const config = await this.loadAgentConfiguration(params.agent);
            if (!config.success) {
                return await this.createFailureResult(config.errorMessage || 'Failed to load agent configuration', params.contextUser);
            }

            // Execute the agent's internal logic with wrapped parameters
            const executionResult = await this.executeAgentInternal<R>(wrappedParams, config);
            
            // Report finalization progress
            wrappedParams.onProgress?.({
                step: 'finalization',
                percentage: 95,
                message: this.formatHierarchicalMessage('Finalizing agent execution')
            });

            // Finalize the agent run
            return await this.finalizeAgentRun<R>(executionResult.finalStep.step, executionResult.finalStep.returnValue, params.contextUser);
        } catch (error) {
            // Check if error is due to cancellation
            if (params.cancellationToken?.aborted || error.message === 'Cancelled during execution') {
                return await this.createCancelledResult(error.message || 'Cancelled due to error during execution', params.contextUser);
            }
            return await this.createFailureResult(error.message, params.contextUser);
        }
    }

    /**
     * Executes the agent's internal logic.
     * 
     * This method contains the core execution logic that drives agent behavior. By default,
     * it implements a sequential execution loop, but subclasses can override this to 
     * implement different execution patterns such as:
     * - Parallel execution of multiple steps
     * - Event-driven or reactive execution
     * - State machine implementations
     * - Custom termination conditions
     * - Alternative flow control mechanisms
     * 
     * @template R - The type of the return value from agent execution
     * @param {ExecuteAgentParams} params - The execution parameters with wrapped callbacks (includes wrapped onProgress and onStreaming)
     * @param {AgentConfiguration} config - The loaded agent configuration
     * @returns {Promise<{finalReturnValue: R, stepCount: number}>} The execution result with typed final return value and step count
     * @protected
     */
    protected async executeAgentInternal<R = any>(
        params: ExecuteAgentParams, 
        config: AgentConfiguration
    ): Promise<{finalStep: BaseAgentNextStep<R>, stepCount: number}> {
        let continueExecution = true;
        let currentNextStep: BaseAgentNextStep<R> | null = null;        
        let stepCount = 0;

        while (continueExecution) {
            // Check for cancellation before each step
            if (params.cancellationToken?.aborted) {
                throw new Error('Cancelled during execution');
            }

            // Execute the current step based on previous decision or initial prompt
            const nextStep = await this.executeNextStep<R>(params, config, currentNextStep);
            stepCount++;
            
            // Check if we should continue or terminate
            if (nextStep.terminate) {
                continueExecution = false;
                currentNextStep = nextStep;
            } else {
                currentNextStep = nextStep;
            }
        }

        return { finalStep: currentNextStep, stepCount };
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
                success: false,
                finalStep: 'failed',
                errorMessage: `Agent '${agent.Name}' is not active. Current status: ${agent.Status}`,
                agentRun: this._agentRun!,
                executionTree: []
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
        const promptTemplateData = await this.gatherPromptTemplateData(params.agent, params.contextUser, params.data);

        // Set up the hierarchical prompt execution
        const promptParams = new AIPromptParams();
        promptParams.prompt = systemPrompt;
        promptParams.data = promptTemplateData;
        promptParams.contextUser = params.contextUser;
        promptParams.conversationMessages = params.conversationMessages;
        promptParams.templateMessageRole = 'system';

        // Setup child prompt parameters
        promptParams.childPrompts = [
            new ChildPromptParam(
                {
                    prompt: childPrompt,
                    data: promptTemplateData,
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
    protected async processNextStep<R>(
        params: ExecuteAgentParams,
        agentType: AIAgentTypeEntity,
        promptResult: any
    ): Promise<BaseAgentNextStep<R>> {
        // Get the agent type instance
        let agentTypeInstance: BaseAgentType | null;
        try {
            agentTypeInstance = await this.getAgentTypeInstance(agentType);
        } catch (error) {
            return {
                terminate: false, // agent decides to terminate or not based on failure
                step: 'failed',
                errorMessage: error.message
            };
        }

        // Let the agent type determine the next step
        const nextStep = await agentTypeInstance.DetermineNextStep(promptResult);

        // Return the next step directly - execution handling is done in executeNextStep
        return nextStep;
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
     * @param {any} [extraData] - Optional extra data to include in the context, if provided and keys conflict within the agent context data, the extraData will override the agent context data.
     * 
     * @returns {Promise<AgentContextData>} Structured context data for prompts
     * 
     * @throws {Error} If there's an error accessing agent data
     * 
     * @private
     */
    private async gatherPromptTemplateData(agent: AIAgentEntity, _contextUser?: UserInfo, extraData?: any): Promise<AgentContextData> {
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

            if (extraData) {
                return {
                    ...contextData,
                    ...extraData
                }
            }
            else {
                return contextData;
            }
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
     * @param {ExecuteAgentParams} params - Parameters from agent execution for context passing
     * @param {AgentAction[]} actions - Array of actions to execute
     * @param {UserInfo} [contextUser] - Optional user context for permissions
     * 
     * @returns {Promise<ActionResult[]>} Array of ActionResult objects from each action execution
     * 
     * @throws {Error} If any action fails to execute
     * 
     * @example
     * ```typescript
     * const results = await this.ExecuteActions(params, [
     *   { id: 'action1', name: 'SendEmail', params: { to: 'user@example.com' } },
     *   { id: 'action2', name: 'UpdateRecord', params: { id: 123, status: 'active' } }
     * ]);
     * // results[0].Success, results[0].Result?.Code, results[0].Params
     * ```
     */
    public async ExecuteActions(params: ExecuteAgentParams, actions: AgentAction[], contextUser?: UserInfo): Promise<any[]> {
        try {
            const actionEngine = ActionEngineServer.Instance;
            
            // Execute all actions in parallel
            const actionPromises = actions.map(async (action) => {
                // Validate action ID
                if (!action.id) {
                    throw new Error(`Action ID is required for action: ${action.name || 'unknown'}`);
                }
                
                // Find the action entity by ID
                const actionEntity = actionEngine.Actions.find(a => a.ID === action.id);
                
                if (!actionEntity) {
                    // Check if the provided ID is a valid UUID
                    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                    if (!uuidRegex.test(action.id)) {
                        throw new Error(`${action.id} is not a valid UUID and must be a UUID representing the Action ID`);
                    } else {
                        throw new Error(`Action with ID ${action.id} not found in the action table`);
                    }
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
                    SkipActionLog: false,
                    Context: params.context // pass along our context to actions so they can use it however they need
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
    protected async ExecuteSubAgent<SC = any, SR = any>(
        params: ExecuteAgentParams<SC>,
        subAgentRequest: AgentSubAgentRequest<SC>, 
    ): Promise<ExecuteAgentResult<SR>> {
        try {
            const engine = AIEngine.Instance;
            
            // Validate subAgentID
            if (!subAgentRequest.id) {
                throw new Error('Sub-agent ID is required');
            }
            
            // Find the sub-agent by ID
            const subAgent = engine.Agents.find(a => a.ID === subAgentRequest.id);
            
            if (!subAgent) {
                // Check if the provided ID is a valid UUID
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                if (!uuidRegex.test(subAgentRequest.id)) {
                    throw new Error(`${subAgentRequest.id} is not a valid UUID and must be a UUID representing the Agent ID`);
                } else {
                    throw new Error(`Sub-agent with ID ${subAgentRequest.id} not found in the agent table`);
                }
            }
            
            // Create a new AgentRunner instance
            const runner = new AgentRunner();
            
            // Prepare messages for sub-agent, adding the context message
            const subAgentMessages: ChatMessage[] = [
                ...params.conversationMessages,
                {
                    role: 'user',
                    content: subAgentRequest.message
                }
            ];
            
            // Set parent run ID in the sub-agent's execution
            // This would need to be passed through the AgentRunner in a real implementation
            // For now, we execute normally and the sub-agent will track its parent relationship
            
            // Execute the sub-agent with cancellation and streaming support
            const result = await runner.RunAgent({
                agent: subAgent,
                conversationMessages: subAgentMessages,
                contextUser: params.contextUser,
                cancellationToken: params.cancellationToken,
                onProgress: params.onProgress,
                onStreaming: params.onStreaming,
                parentAgentHierarchy: this._runContext?.agentHierarchy,
                parentDepth: this._runContext?.depth,
                data: subAgentRequest.templateParameters,
                context: params.context // pass along our context to sub-agents so they can keep passing it down and pass to actions as well
            });
            
            // Check if execution was successful
            if (!result.success) {
                throw new Error(`Sub-agent '${subAgentRequest.name}' failed: ${result.errorMessage || 'Unknown error'}`);
            }
            
            // Return the full result for tracking
            return result;
            
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
            TemplateParameters: this.getAgentPromptParametersJSON(sa),
            Status: sa.Status,
            ExecutionMode: sa.ExecutionMode,
            ExecutionOrder: sa.ExecutionOrder
        })), null, 2);
    }

    /**
     * Utility method to get agent prompt parameters for a given agent. This gets the 
     * highest priority prompt for the agent, and then gets the parameters for that
     * prompt.
     * @param agent 
     */
    protected getAgentPromptParameters(agent: AIAgentEntity): Array<TemplateParamEntity> {
        const engine = AIEngine.Instance;
        const agentPrompt = engine.AgentPrompts
            .filter(ap => ap.AgentID === agent.ID && ap.Status === 'Active')
            .sort((a, b) => a.ExecutionOrder - b.ExecutionOrder)[0];
        
        if (!agentPrompt) return [];

        const prompt = engine.Prompts.find(p => p.ID === agentPrompt.PromptID);
        if (!prompt) return [];

        // Return parameters as key-value pairs
        return prompt.TemplateParams;
    }

    protected getAgentPromptParametersJSON(agent: AIAgentEntity): string {
        const params = this.getAgentPromptParameters(agent);
        return JSON.stringify(params.map(param => ({
            Name: param.Name,
            Type: param.Type,
            IsRequired: param.IsRequired,
            DefaultValue: param.DefaultValue,
            Description: param.Description
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
                    .filter(p => p.Type.trim().toLowerCase() === 'input' || p.Type.trim().toLowerCase() === 'both')
                    .map(param => this.formatActionParameter(param)),
                Output: action.Params
                    .filter(p => p.Type.trim().toLowerCase() === 'output' || p.Type.trim().toLowerCase() === 'both')
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

    /**
     * Initializes the agent run tracking by creating AIAgentRunEntity and setting up context.
     * 
     * @private
     * @param {ExecuteAgentParams} params - The execution parameters
     */
    private async initializeAgentRun(params: ExecuteAgentParams): Promise<void> {
        // Create AIAgentRunEntity
        this._agentRun = await this._metadata.GetEntityObject<AIAgentRunEntity>('MJ: AI Agent Runs', params.contextUser);
        this._agentRun.AgentID = params.agent.ID;
        this._agentRun.Status = 'Running';
        this._agentRun.StartedAt = new Date();
        this._agentRun.UserID = params.contextUser?.ID || null;
        
        // Set parent run ID if we're in a sub-agent context
        // TODO: Get parent run ID from execution context when implementing sub-agent tracking
        this._agentRun.ParentRunID = null;
        
        // Save the agent run
        if (!await this._agentRun.Save()) {
            const errorMessage = JSON.stringify(CopyScalarsAndArrays(this._agentRun.LatestResult));
            throw new Error(`Failed to create agent run record: Details: ${errorMessage}`);
        }

        // Initialize run context
        this._runContext = {
            currentStepIndex: 0,
            parentRunStack: [],
            agentHierarchy: params.parentAgentHierarchy 
                ? [...params.parentAgentHierarchy, params.agent.Name || 'Unknown Agent']
                : [params.agent.Name || 'Unknown Agent'],
            depth: params.parentDepth !== undefined ? params.parentDepth + 1 : 0,
            conversationId: undefined, // TODO: Get from conversation context
            userId: params.contextUser?.ID,
            agentState: {}
        };

        // Reset execution chain and progress tracking
        this._executionChain = [];
        this._allProgressSteps = [];
    }

    /**
     * Validates the agent with tracking.
     * 
     * @private
     * @param {AIAgentEntity} agent - The agent to validate
     * @returns {Promise<ExecuteAgentResult | null>} - Failure result if validation fails, null if successful
     */
    private async validateAgentWithTracking(agent: AIAgentEntity, contextUser: UserInfo): Promise<ExecuteAgentResult | null> {
        const startTime = new Date();
        
        try {
            // Original validation logic
            const validationResult = await this.validateAgent(agent);
            
            if (validationResult) {
                // Create validation step
                const stepEntity = await this.createStepEntity('validation', 'Agent Validation', contextUser);
                
                // Create validation execution result
                const executionResult: ValidationExecutionResult = {
                    type: 'validation',
                    validationTarget: 'agent configuration',
                    result: { valid: false, errors: [validationResult.errorMessage || 'Validation failed'] }
                };
                
                // Create next step decision
                const nextStepDecision: NextStepDecision = {
                    decision: 'failed',
                    reasoning: 'Agent validation failed',
                    nextStepDetails: { type: 'complete' }
                };
                
                // Add to execution chain
                this._executionChain.push({
                    stepEntity,
                    executionType: 'validation',
                    executionResult,
                    nextStepDecision,
                    startTime,
                    endTime: new Date(),
                    durationMs: new Date().getTime() - startTime.getTime()
                });
                
                // Update step entity
                await this.finalizeStepEntity(stepEntity, false, validationResult.errorMessage);
                
                return await this.createFailureResult(validationResult.errorMessage || 'Validation failed', contextUser);
            }
            
            // Validation successful - create success step
            const stepEntity = await this.createStepEntity('validation', 'Agent Validation', contextUser);
            
            const executionResult: ValidationExecutionResult = {
                type: 'validation',
                validationTarget: 'agent configuration',
                result: { valid: true }
            };
            
            const nextStepDecision: NextStepDecision = {
                decision: 'success',
                reasoning: 'Agent validation passed',
                nextStepDetails: { type: 'prompt', promptId: agent.ID, promptName: 'Initial Prompt' }
            };
            
            this._executionChain.push({
                stepEntity,
                executionType: 'validation',
                executionResult,
                nextStepDecision,
                startTime,
                endTime: new Date(),
                durationMs: new Date().getTime() - startTime.getTime()
            });
            
            await this.finalizeStepEntity(stepEntity, true);
            
            return null;
        } catch (error) {
            return await this.createFailureResult(`Validation error: ${(error as Error).message}`, contextUser);
        }
    }

    /**
     * Creates a step entity for tracking.
     * 
     * @private
     * @param {string} stepType - The type of step
     * @param {string} stepName - Human-readable name for the step
     * @param {UserInfo} contextUser - User context for the operation
     * @param {string} [targetId] - Optional ID of the target entity
     * @param {any} [inputData] - Optional input data to capture for this step
     * @param {string} [targetLogId] - Optional ID of the execution log (ActionExecutionLog, AIPromptRun, or AIAgentRun)
     * @returns {Promise<AIAgentRunStepEntity>} - The created step entity
     */
    private async createStepEntity(stepType: string, stepName: string, contextUser: UserInfo, targetId?: string, inputData?: any, targetLogId?: string): Promise<AIAgentRunStepEntity> {
        const stepEntity = await this._metadata.GetEntityObject<AIAgentRunStepEntity>('MJ: AI Agent Run Steps', contextUser);
        
        stepEntity.AgentRunID = this._agentRun!.ID;
        stepEntity.StepNumber = this._runContext!.currentStepIndex + 1;
        stepEntity.StepType = stepType;
        // Include hierarchy breadcrumb in StepName for better logging
        stepEntity.StepName = this.formatHierarchicalMessage(stepName);
        stepEntity.TargetID = targetId || null;
        stepEntity.TargetLogID = targetLogId || null;
        stepEntity.Status = 'Running';
        stepEntity.StartedAt = new Date();
        
        // Populate InputData if provided
        if (inputData) {
            stepEntity.InputData = JSON.stringify({
                ...inputData,
                context: {
                    agentHierarchy: this._runContext!.agentHierarchy,
                    depth: this._runContext!.depth,
                    stepNumber: stepEntity.StepNumber
                }
            });
        }
        
        if (!await stepEntity.Save()) {
            throw new Error(`Failed to create agent run step record: ${JSON.stringify(stepEntity.LatestResult)}`);
        }
        
        this._runContext!.currentStepIndex++;
        
        return stepEntity;
    }

    /**
     * Finalizes a step entity with completion status.
     * 
     * @private
     * @param {AIAgentRunStepEntity} stepEntity - The step entity to finalize
     * @param {boolean} success - Whether the step was successful
     * @param {string} [errorMessage] - Optional error message
     * @param {any} [outputData] - Optional output data to capture for this step
     */
    private async finalizeStepEntity(stepEntity: AIAgentRunStepEntity, success: boolean, errorMessage?: string, outputData?: any): Promise<void> {
        stepEntity.Status = success ? 'Completed' : 'Failed';
        stepEntity.CompletedAt = new Date();
        stepEntity.Success = success;
        stepEntity.ErrorMessage = errorMessage || null;
        
        // Populate OutputData if provided
        if (outputData) {
            stepEntity.OutputData = JSON.stringify({
                ...outputData,
                context: {
                    success,
                    durationMs: stepEntity.CompletedAt.getTime() - stepEntity.StartedAt.getTime(),
                    errorMessage
                }
            });
        }
        
        if (!await stepEntity.Save()) {
            console.error('Failed to update agent run step record');
        }
    }

    /**
     * Formats a message with agent hierarchy for streaming/progress updates.
     * 
     * @private
     * @param {string} baseMessage - The base message to format
     * @returns {string} - The formatted message with hierarchy breadcrumb
     */
    private formatHierarchicalMessage(baseMessage: string): string {
        if (this._runContext && this._runContext.depth > 0) {
            // Build breadcrumb from agent hierarchy (skip root agent)
            const breadcrumb = this._runContext.agentHierarchy
                .slice(1)
                .join(' → ');
            return breadcrumb ? `${breadcrumb}: ${baseMessage}` : baseMessage;
        }
        return baseMessage;
    }

    /**
     * Executes the next step based on the current state.
     * 
     * This method can be overridden by subclasses to customize step execution behavior.
     * It handles the execution of different step types (prompt, actions, sub-agent, chat)
     * based on the previous decision.
     * 
     * @protected
     * @param {ExecuteAgentParams} params - Original execution parameters
     * @param {AgentConfiguration} config - Agent configuration
     * @param {BaseAgentNextStep | null} previousDecision - Previous step decision
     * @returns {Promise<{terminate: boolean, returnValue?: any, nextStep?: BaseAgentNextStep}>}
     */
    protected async executeNextStep<R = any>(
        params: ExecuteAgentParams, 
        config: AgentConfiguration, 
        previousDecision: BaseAgentNextStep<R> | null
    ): Promise<BaseAgentNextStep<R>> {
        
        // Determine what to execute
        if (!previousDecision) {
            // First execution - run the initial prompt
            return await this.executePromptStep(params, config);
        }
        
        // Execute based on the previous decision
        switch (previousDecision.step) {
            case 'retry':
                return await this.executePromptStep(params, config, previousDecision);
                
            case 'sub-agent':
                return await this.executeSubAgentStep(params, previousDecision.subAgent!);
                
            case 'actions':
                return await this.executeActionsStep(params, previousDecision.actions!);
                
            case 'chat':
                return await this.executeChatStep(params, previousDecision.userMessage!);
            case 'success':
                return { 
                    terminate: true,
                    step: 'success', 
                    returnValue: previousDecision.returnValue 
                };
            case 'failed':
                return { 
                    terminate: true,
                    step: 'failed', 
                    returnValue: previousDecision.returnValue 
                };
            default:
                throw new Error(`Unsupported next step: ${previousDecision.step}`);
        }
    }

    /**
     * Executes a prompt step and tracks it.
     * 
     * @private
     */
    private async executePromptStep<R>(
        params: ExecuteAgentParams, 
        config: AgentConfiguration,
        retryContext?: BaseAgentNextStep
    ): Promise<BaseAgentNextStep<R>> {
        
        const startTime = new Date();
        
        // Prepare input data for the step
        const inputData = {
            promptId: config.childPrompt?.ID,
            promptName: config.childPrompt?.Name,
            isRetry: !!retryContext,
            retryContext: retryContext ? {
                reason: retryContext.retryReason,
                instructions: retryContext.retryInstructions
            } : undefined,
            conversationMessages: params.conversationMessages,
            agentState: this._runContext?.agentState
        };
        
        const stepEntity = await this.createStepEntity('prompt', 'Execute Agent Prompt', params.contextUser, config.childPrompt?.ID, inputData);
        
        try {
            // Report prompt execution progress with context
            const isRetry = !!retryContext;
            const promptMessage = isRetry 
                ? `Re-executing agent prompt with additional context from ${retryContext.retryReason || 'previous actions'}`
                : `Executing agent's initial prompt to analyze your request`;
                
            params.onProgress?.({
                step: 'prompt_execution',
                percentage: 30,
                message: this.formatHierarchicalMessage(promptMessage),
                metadata: { 
                    promptId: config.childPrompt?.ID,
                    isRetry,
                    promptName: config.childPrompt?.Name
                },
                displayMode: 'live' // Only show in live mode
            });

            // Prepare prompt parameters
            const promptParams = await this.preparePromptParams(
                config.agentType!, 
                config.systemPrompt!, 
                config.childPrompt!,
                params
            );
            
            // Pass cancellation token and streaming callbacks to prompt execution
            promptParams.cancellationToken = params.cancellationToken;
            promptParams.onStreaming = params.onStreaming ? (chunk) => {
                params.onStreaming!({
                    ...chunk,
                    stepType: 'prompt',
                    stepEntityId: stepEntity.ID
                });
            } : undefined;
            
            // Note: retry context is now handled through conversation messages
            // The retryContext parameter is kept for backward compatibility but not used
            
            // Execute the prompt
            const promptResult = await this.executePrompt(promptParams);
            
            // Update step entity with AIPromptRun ID if available
            if (promptResult.promptRun?.ID) {
                stepEntity.TargetLogID = promptResult.promptRun.ID;
                await stepEntity.Save();
            }
            
            // Check for cancellation after prompt execution
            if (params.cancellationToken?.aborted) {
                await this.finalizeStepEntity(stepEntity, false, 'Cancelled during prompt execution');
                const cancelledResult = await this.createCancelledResult('Cancelled during prompt execution', params.contextUser);
                return { 
                    ...cancelledResult,
                    terminate: true, 
                    step: cancelledResult.finalStep,
                    returnValue: cancelledResult.returnValue,   
                }
            }
            // Create prompt execution result
            const executionResult: PromptExecutionResult = {
                type: 'prompt',
                promptId: config.childPrompt!.ID,
                promptName: config.childPrompt!.Name,
                result: promptResult
            };
            
            // Report decision processing progress
            params.onProgress?.({
                step: 'decision_processing',
                percentage: 70,
                message: this.formatHierarchicalMessage('Analyzing response and determining next steps'),
                displayMode: 'both' // Show in both live and historical modes
            });
            
            // Determine next step using agent type
            const nextStep = await this.processNextStep<R>(params, config.agentType!, promptResult);
            
            // Create next step decision
            const nextStepDecision: NextStepDecision = {
                decision: nextStep.step,
                reasoning: this.getNextStepReasoning(nextStep),
                nextStepDetails: this.getNextStepDetails(nextStep)
            };
            
            // Add to execution chain
            this._executionChain.push({
                stepEntity,
                executionType: 'prompt',
                executionResult,
                nextStepDecision,
                startTime,
                endTime: new Date(),
                durationMs: new Date().getTime() - startTime.getTime()
            });
            
            // Prepare output data
            const outputData = {
                promptResult: {
                    success: promptResult.success,
                    llmResponse: promptResult.llmResponse,
                    modelUsed: promptResult.runInfo?.modelName,
                    tokensUsed: promptResult.runInfo?.promptRun?.TotalTokensUsed,
                    totalCost: promptResult.runInfo?.promptRun?.TotalCost
                },
                nextStep: {
                    decision: nextStep.step,
                    reasoning: nextStepDecision.reasoning
                }
            };
            
            // Finalize step entity
            await this.finalizeStepEntity(stepEntity, promptResult.success, 
                promptResult.success ? undefined : promptResult.errorMessage, outputData);
            
            // Return based on next step
            if (nextStep.step === 'chat') {
                return { ...nextStep, terminate: true };
            }
            else if (nextStep.step === 'success' || nextStep.step === 'failed') {
                return { ...nextStep, terminate: true };
            } else {
                return { ...nextStep, terminate: false };
            }
            
        } catch (error) {
            await this.finalizeStepEntity(stepEntity, false, error.message);
            throw error;
        }
    }

    /**
     * Executes a sub-agent step and tracks it.
     * 
     * @private
     */
    private async executeSubAgentStep<SC = any, SR = any>(
        params: ExecuteAgentParams<SC>,
        subAgentRequest: AgentSubAgentRequest<SC>
    ): Promise<BaseAgentNextStep<SR, SC>> {
        
        // Check for cancellation before starting
        if (params.cancellationToken?.aborted) {
            throw new Error('Cancelled before sub-agent execution');
        }

        // Report sub-agent execution progress with descriptive context
        params.onProgress?.({
            step: 'subagent_execution',
            percentage: 60,
            message: this.formatHierarchicalMessage(`Delegating to ${subAgentRequest.name} agent`),
            metadata: { 
                subAgentId: subAgentRequest.id,
                subAgentName: subAgentRequest.name,
                reason: subAgentRequest.message
            }
        });
        
        // Add assistant message indicating we're executing a sub-agent
        params.conversationMessages.push({
            role: 'assistant',
            content: `I'm delegating this task to the "${subAgentRequest.name}" agent.\n\nReason: ${subAgentRequest.message}`
        });
        
        const startTime = new Date();
        
        // Prepare input data for the step
        const inputData = {
            subAgentId: subAgentRequest.id,
            subAgentName: subAgentRequest.name,
            message: subAgentRequest.message,
            terminateAfter: subAgentRequest.terminateAfter,
            conversationMessages: params.conversationMessages,
            parentAgentHierarchy: this._runContext?.agentHierarchy
        };
        
        const stepEntity = await this.createStepEntity('subagent', `Execute Sub-Agent: ${subAgentRequest.name}`, params.contextUser, subAgentRequest.id, inputData);
        
        try {
            // Execute sub-agent with cancellation and streaming support
            const subAgentResult = await this.ExecuteSubAgent(
                params,
                subAgentRequest
            );
            
            // Update step entity with AIAgentRun ID if available
            if (subAgentResult.agentRun?.ID) {
                stepEntity.TargetLogID = subAgentResult.agentRun.ID;
                await stepEntity.Save();
            }
            
            // Check for cancellation after sub-agent execution
            if (params.cancellationToken?.aborted) {
                await this.finalizeStepEntity(stepEntity, false, 'Cancelled during sub-agent execution');
                throw new Error('Cancelled during sub-agent execution');
            }
            
            // Create sub-agent execution result
            const executionResult: SubAgentExecutionResult = {
                type: 'sub-agent',
                subAgentId: subAgentRequest.id,
                subAgentName: subAgentRequest.name,
                result: subAgentResult
            };
            
            // Store sub-agent run for complete tracking
            this._subAgentRuns.push(subAgentResult);
            
            // Determine if we should terminate after sub-agent
            const shouldTerminate = subAgentRequest.terminateAfter;
            
            // Create next step decision
            const nextStepType = subAgentResult.returnValue?.step || 'retry'; 
            const nextStepDecision: NextStepDecision = {
                decision: shouldTerminate ? 'success' : 'retry',
                reasoning: shouldTerminate ? 'Sub-agent execution completed, terminating as requested' : 'Sub-agent completed, continuing execution',
                nextStepDetails: { type: nextStepType, returnValue: subAgentResult.returnValue }
            };
            
            // Add to execution chain
            this._executionChain.push({
                stepEntity,
                executionType: 'sub-agent',
                executionResult,
                nextStepDecision,
                startTime,
                endTime: new Date(),
                durationMs: new Date().getTime() - startTime.getTime()
            });
            
            // Prepare output data
            const outputData = {
                subAgentResult: {
                    success: subAgentResult.success,
                    finalStep: subAgentResult.finalStep,
                    returnValue: subAgentResult.returnValue,
                    errorMessage: subAgentResult.errorMessage,
                    agentRunId: subAgentResult.agentRun?.ID,
                    stepCount: this.countStepsInTree(subAgentResult.executionTree)
                },
                shouldTerminate: shouldTerminate,
                nextStep: nextStepDecision.decision
            };
            
            // Finalize step entity
            await this.finalizeStepEntity(stepEntity, subAgentResult.success, 
                subAgentResult.errorMessage, outputData);
            
            // Build a clean summary of sub-agent result
            const subAgentSummary = {
                subAgentName: subAgentRequest.name,
                subAgentId: subAgentRequest.id,
                success: subAgentResult.success,
                finalStep: subAgentResult.finalStep,
                returnValue: subAgentResult.returnValue,
                errorMessage: subAgentResult.errorMessage || null
            };
            
            // Add user message with the sub-agent results
            const resultMessage = subAgentResult.success
                ? `Sub-agent completed successfully:\n${JSON.stringify(subAgentSummary, null, 2)}`
                : `Sub-agent failed:\n${JSON.stringify(subAgentSummary, null, 2)}`;
                
            params.conversationMessages.push({
                role: 'user',
                content: resultMessage
            });
            
            return { 
                ...subAgentResult, 
                step: subAgentResult.success ? 'success' : 'failed', 
                terminate: shouldTerminate 
            };            
        } catch (error) {
            await this.finalizeStepEntity(stepEntity, false, error.message);
            throw error;
        }
    }

    /**
     * Executes actions step and tracks it.
     * 
     * @private
     */
    private async executeActionsStep(
        params: ExecuteAgentParams,
        actions: AgentAction[]
    ): Promise<BaseAgentNextStep> {
        
        // Check for cancellation before starting
        if (params.cancellationToken?.aborted) {
            throw new Error('Cancelled before action execution');
        }

        // Report action execution progress with markdown formatting for parameters
        let progressMessage: string;
        if (actions.length === 1) {
            const action = actions[0];
            progressMessage = `Executing action: **${action.name}**`;
            
            // Add parameters if they exist
            if (action.params && Object.keys(action.params).length > 0) {
                const paramsList = Object.entries(action.params)
                    .map(([key, value]) => {
                        const displayValue = typeof value === 'object' 
                            ? JSON.stringify(value, null, 2) 
                            : String(value);
                        return `  - \`${key}\`: ${displayValue}`;
                    })
                    .join('\n');
                progressMessage += `\n${paramsList}`;
            }
        } else {
            progressMessage = `Executing ${actions.length} actions:`;
            actions.forEach(action => {
                progressMessage += `\n\n• **${action.name}**`;
                if (action.params && Object.keys(action.params).length > 0) {
                    const paramsList = Object.entries(action.params)
                        .map(([key, value]) => {
                            const displayValue = typeof value === 'object' 
                                ? JSON.stringify(value, null, 2) 
                                : String(value);
                            return `  - \`${key}\`: ${displayValue}`;
                        })
                        .join('\n');
                    progressMessage += `\n${paramsList}`;
                }
            });
        }
            
        params.onProgress?.({
            step: 'action_execution',
            percentage: 50,
            message: this.formatHierarchicalMessage(progressMessage),
            metadata: { 
                actionCount: actions.length,
                actionNames: actions.map(a => a.name)
            },
            displayMode: 'live' // Only show in live mode
        });
        
        // Add assistant message indicating we're executing actions with more detail
        const actionMessage = actions.length === 1 
            ? `I'm executing the "${actions[0].name}" action...`
            : `I'm executing ${actions.length} actions to gather the information needed:\n${actions.map(a => `• ${a.name}`).join('\n')}`;
        
        params.conversationMessages.push({
            role: 'assistant',
            content: actionMessage
        });
        
        // Create step entities for all actions first
        const actionSteps: Array<{
            action: AgentAction;
            stepEntity: AIAgentRunStepEntity;
            startTime: Date;
        }> = [];
        
        // Create all step entities sequentially (fast operation)
        for (const action of actions) {
            const startTime = new Date();
            const stepEntity = await this.createStepEntity('action', `Execute Action: ${action.name}`, params.contextUser, action.id);
            actionSteps.push({ action, stepEntity, startTime });
        }
        
        // Execute all actions in parallel
        const actionPromises = actionSteps.map(async ({ action, stepEntity, startTime }) => {
            try {
                // Execute the action
                const actionResults = await this.ExecuteActions(params, [action], params.contextUser);
                const actionResult = actionResults[0];
                
                // Update step entity with ActionExecutionLog ID if available
                if (actionResult.LogEntry?.ID) {
                    stepEntity.TargetLogID = actionResult.LogEntry.ID;
                    await stepEntity.Save();
                }
                
                // Create action execution result
                const executionResult: ActionExecutionResult = {
                    type: 'action',
                    actionId: action.id,
                    actionName: action.name,
                    result: actionResult
                };
                
                // Create next step decision
                const nextStepDecision: NextStepDecision = {
                    decision: 'retry',
                    reasoning: 'Action completed successfully',
                    nextStepDetails: undefined
                };
                
                // Add to execution chain
                this._executionChain.push({
                    stepEntity,
                    executionType: 'action',
                    executionResult,
                    nextStepDecision,
                    startTime,
                    endTime: new Date(),
                    durationMs: new Date().getTime() - startTime.getTime()
                });
                
                // Prepare output data with action result
                const outputData = {
                    actionResult: {
                        success: actionResult.Success,
                        resultCode: actionResult.ResultCode,
                        message: actionResult.Message,
                        result: actionResult.ResultType === 'ComplexObject' 
                            ? actionResult.Complex 
                            : actionResult.Simple
                    }
                };
                
                // Finalize step entity with output data
                await this.finalizeStepEntity(stepEntity, actionResult.Success, 
                    actionResult.Success ? undefined : actionResult.Message, outputData);
                
                return { success: true, result: actionResult };
                
            } catch (error) {
                await this.finalizeStepEntity(stepEntity, false, error.message);
                return { success: false, error: error.message };
            }
        });
        
        // Wait for all actions to complete
        const actionResults = await Promise.all(actionPromises);
        
        // Check for cancellation after actions complete
        if (params.cancellationToken?.aborted) {
            throw new Error('Cancelled after action execution');
        }
        
        // Build a clean summary of action results
        const actionSummaries = actionSteps.map((step, index) => {
            const result = actionResults[index];
            const actionResult = result.success ? result.result : null;
            
            return {
                actionName: step.action.name,
                actionId: step.action.id,
                params: step.action.params,
                success: result.success,
                resultCode: actionResult?.ResultCode || (result.success ? 'SUCCESS' : 'ERROR'),
                message: result.success ? actionResult?.Message || 'Action completed' : result.error
            };
        });
        
        // Check if any actions failed
        const failedActions = actionSummaries.filter(a => !a.success);
        
        // Add user message with the results
        const resultsMessage = failedActions.length > 0
            ? `Action results (${failedActions.length} failed):\n${JSON.stringify(actionSummaries, null, 2)}`
            : `Action results (all succeeded):\n${JSON.stringify(actionSummaries, null, 2)}`;
            
        params.conversationMessages.push({
            role: 'user',
            content: resultsMessage
        });
        
        // After actions complete, we need to process the results
        // The retry step is used to re-execute the prompt with the action results
        // This allows the agent to analyze the results and determine what to do next
        return {
            terminate: false,
            step: 'retry',
            returnValue: actionSummaries,
            retryReason: failedActions.length > 0 
                ? `Processing results with ${failedActions.length} failed action(s): ${failedActions.map(a => a.actionName).join(', ')}`
                : `Analyzing results from ${actionSummaries.length} completed action(s) to formulate response`
        };
    }

    /**
     * Executes a chat step (not implemented in base class).
     * 
     * @private
     */
    private async executeChatStep(
        params: ExecuteAgentParams,
        userMessage: string
    ): Promise<BaseAgentNextStep> {
        // Chat functionality would need to be implemented based on the specific chat system
        // For now, we'll just create a failed step
        const startTime = new Date();
        const stepEntity = await this.createStepEntity('chat', 'User Interaction', params.contextUser);
        
        const executionResult: ChatExecutionResult = {
            type: 'chat',
            userMessage,
            result: { success: false, continueExecution: false }
        };
        
        const nextStepDecision: NextStepDecision = {
            decision: 'failed',
            reasoning: 'Chat functionality not implemented in base agent'
        };
        
        this._executionChain.push({
            stepEntity,
            executionType: 'chat',
            executionResult,
            nextStepDecision,
            startTime,
            endTime: new Date(),
            durationMs: new Date().getTime() - startTime.getTime()
        });
        
        await this.finalizeStepEntity(stepEntity, false, 'Chat not implemented');
        
        return { 
            step: 'chat',
            terminate: true,
            returnValue: userMessage,
        };
    }

    /**
     * Creates a failure result with proper tracking.
     * 
     * @private
     */
    private async createFailureResult(errorMessage: string, contextUser?: UserInfo): Promise<ExecuteAgentResult> {
        if (this._agentRun) {
            this._agentRun.Status = 'Failed';
            this._agentRun.CompletedAt = new Date();
            this._agentRun.Success = false;
            this._agentRun.ErrorMessage = errorMessage;
            
            // Calculate total tokens even for failed runs
            const tokenStats = this.calculateTokenStats();
            this._agentRun.TotalTokensUsed = tokenStats.totalTokens;
            this._agentRun.TotalPromptTokensUsed = tokenStats.promptTokens;
            this._agentRun.TotalCompletionTokensUsed = tokenStats.completionTokens;
            this._agentRun.TotalCost = tokenStats.totalCost;
            
            await this._agentRun.Save();
        }
        
        return {
            success: false,
            finalStep: 'failed',
            errorMessage,
            agentRun: this._agentRun!,
            executionTree: this.buildExecutionTree()
        };
    }

    /**
     * Creates a cancelled result.
     * 
     * @private
     * @param {string} message - The cancellation message
     * @returns {Promise<ExecuteAgentResult>} The cancelled result
     */
    private async createCancelledResult(message: string, contextUser?: UserInfo): Promise<ExecuteAgentResult> {
        if (this._agentRun) {
            this._agentRun.Status = 'Cancelled';
            this._agentRun.CompletedAt = new Date();
            this._agentRun.Success = false;
            this._agentRun.ErrorMessage = message;
            
            // Calculate total tokens even for cancelled runs
            const tokenStats = this.calculateTokenStats();
            this._agentRun.TotalTokensUsed = tokenStats.totalTokens;
            this._agentRun.TotalPromptTokensUsed = tokenStats.promptTokens;
            this._agentRun.TotalCompletionTokensUsed = tokenStats.completionTokens;
            this._agentRun.TotalCost = tokenStats.totalCost;
            
            await this._agentRun.Save();
        }
        
        return {
            success: false,
            finalStep: 'failed',
            errorMessage: message,
            cancelled: true,
            cancellationReason: 'user_requested',
            agentRun: this._agentRun!,
            executionTree: this.buildExecutionTree()
        };
    }

    /**
     * Finalizes the agent run with success.
     * 
     * @private
     */
    private async finalizeAgentRun<R>(finalStep: BaseAgentNextStep['step'], returnValue?: R, contextUser?: UserInfo): Promise<ExecuteAgentResult<R>> {
        if (this._agentRun) {
            this._agentRun.Status = 'Completed';
            this._agentRun.CompletedAt = new Date();
            this._agentRun.Success = finalStep === 'success';
            this._agentRun.Result = returnValue ? JSON.stringify(returnValue) : null;
            
            // Calculate total tokens from all prompts and sub-agents
            const tokenStats = this.calculateTokenStats();
            this._agentRun.TotalTokensUsed = tokenStats.totalTokens;
            this._agentRun.TotalPromptTokensUsed = tokenStats.promptTokens;
            this._agentRun.TotalCompletionTokensUsed = tokenStats.completionTokens;
            this._agentRun.TotalCost = tokenStats.totalCost;
            
            await this._agentRun.Save();
        }
        
        return {
            success: finalStep === 'success' || finalStep === 'chat',
            finalStep,
            returnValue,
            agentRun: this._agentRun!,
            executionTree: this.buildExecutionTree()
        };
    }

    /**
     * Counts the total number of steps in an execution tree.
     * 
     * @private
     * @param {ExecutionNode[]} nodes - The execution tree nodes
     * @returns {number} The total count of steps
     */
    private countStepsInTree(nodes: ExecutionNode[]): number {
        let count = 0;
        for (const node of nodes) {
            count++;
            if (node.children && node.children.length > 0) {
                count += this.countStepsInTree(node.children);
            }
        }
        return count;
    }

    /**
     * Calculate total token statistics from execution chain.
     * 
     * @returns Token statistics including totals and costs
     * @private
     */
    private calculateTokenStats(): { totalTokens: number; promptTokens: number; completionTokens: number; totalCost: number } {
        let totalTokens = 0;
        let promptTokens = 0;
        let completionTokens = 0;
        let totalCost = 0;

        // Iterate through execution chain to sum up tokens
        for (const step of this._executionChain) {
            if (step.executionType === 'prompt' && step.executionResult.type === 'prompt') {
                const promptResult = step.executionResult as PromptExecutionResult;
                if (promptResult.result) {
                    totalTokens += promptResult.result.tokensUsed || 0;
                    promptTokens += promptResult.result.promptTokens || 0;
                    completionTokens += promptResult.result.completionTokens || 0;
                    totalCost += promptResult.result.cost || 0;
                }
            } else if (step.executionType === 'sub-agent' && step.executionResult.type === 'sub-agent') {
                const subAgentResult = step.executionResult as SubAgentExecutionResult;
                if (subAgentResult.result?.agentRun) {
                    // Add tokens from sub-agent runs (these should already be calculated recursively)
                    totalTokens += subAgentResult.result.agentRun.TotalTokensUsed || 0;
                    promptTokens += subAgentResult.result.agentRun.TotalPromptTokensUsed || 0;
                    completionTokens += subAgentResult.result.agentRun.TotalCompletionTokensUsed || 0;
                    totalCost += subAgentResult.result.agentRun.TotalCost || 0;
                }
            }
        }

        return { totalTokens, promptTokens, completionTokens, totalCost };
    }

    /**
     * Builds the hierarchical execution tree from flat steps and sub-agent runs.
     * 
     * @private
     * @returns {ExecutionNode[]} The hierarchical execution tree
     */
    private buildExecutionTree(): ExecutionNode[] {
        const executionTree: ExecutionNode[] = [];
        
        // Create a combined list of all events (progress and execution) sorted by time
        const allEvents: any[] = [];
        
        // Track the highest step number used for progress events
        let maxProgressStepNumber = 0;
        
        // Add progress events
        for (const progressStep of this._allProgressSteps) {
            allEvents.push({
                type: 'progress',
                timestamp: progressStep.timestamp,
                data: progressStep
            });
        }
        
        // Add execution chain events
        for (const chainStep of this._executionChain) {
            allEvents.push({
                type: 'execution',
                timestamp: chainStep.startTime,
                data: chainStep
            });
        }
        
        // Sort by timestamp
        allEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        
        // Build the tree
        for (const event of allEvents) {
            if (event.type === 'progress') {
                // Create a lightweight node for progress events
                const progressData = event.data;
                maxProgressStepNumber++;
                const progressNode: ExecutionNode = {
                    step: {
                        ID: `progress-${event.timestamp.getTime()}`,
                        StepNumber: maxProgressStepNumber,
                        StepName: progressData.message,
                        StepType: progressData.step || 'progress',
                        Status: 'Completed',
                        StartedAt: event.timestamp,
                        CompletedAt: event.timestamp
                    } as any,
                    inputData: null,
                    outputData: { 
                        percentage: progressData.percentage,
                        metadata: progressData.metadata 
                    },
                    executionType: progressData.step || 'progress',
                    startTime: event.timestamp,
                    endTime: event.timestamp,
                    durationMs: 0,
                    children: [],
                    depth: progressData.depth || this._runContext?.depth || 0,
                    parentStepId: null,
                    agentHierarchy: progressData.agentHierarchy || this._runContext?.agentHierarchy || []
                };
                executionTree.push(progressNode);
            } else {
                // Process execution chain step
                const chainStep = event.data;
                const stepEntity = chainStep.stepEntity;
                
                // Parse input/output data if available
                let inputData = null;
                let outputData = null;
                try {
                    if (stepEntity.InputData) {
                        inputData = JSON.parse(stepEntity.InputData);
                    }
                    if (stepEntity.OutputData) {
                        outputData = JSON.parse(stepEntity.OutputData);
                    }
                } catch (e) {
                    // If parsing fails, use raw data
                    inputData = stepEntity.InputData;
                    outputData = stepEntity.OutputData;
                }
                
                const node: ExecutionNode = {
                    step: stepEntity,
                    inputData,
                    outputData,
                    executionType: chainStep.executionType,
                    startTime: chainStep.startTime,
                    endTime: chainStep.endTime,
                    durationMs: chainStep.durationMs,
                    nextStepDecision: chainStep.nextStepDecision,
                    children: [],
                    depth: this._runContext?.depth || 0,
                    parentStepId: null,
                    agentHierarchy: this._runContext?.agentHierarchy || []
                };
                
                // If this is a sub-agent step, add its execution tree as children
                if (chainStep.executionType === 'sub-agent' && chainStep.executionResult?.type === 'sub-agent') {
                    const subAgentResult = (chainStep.executionResult as SubAgentExecutionResult).result;
                    if (subAgentResult.executionTree) {
                        // Update depth and parent info for all sub-agent nodes
                        node.children = subAgentResult.executionTree.map(childNode => ({
                            ...childNode,
                            parentStepId: stepEntity.ID,
                            depth: (this._runContext?.depth || 0) + 1
                        }));
                        
                        // Sort children by StepNumber recursively
                        this.sortExecutionTreeByStepNumber(node.children);
                    }
                }
                
                executionTree.push(node);
            }
        }
        
        // Sort the top-level tree by StepNumber
        this.sortExecutionTreeByStepNumber(executionTree);
        
        return executionTree;
    }
    
    /**
     * Sorts an execution tree by StepNumber at each level recursively.
     * 
     * @private
     * @param {ExecutionNode[]} nodes - The nodes to sort
     */
    private sortExecutionTreeByStepNumber(nodes: ExecutionNode[]): void {
        // Sort by StepNumber
        nodes.sort((a, b) => {
            const aStepNumber = a.step?.StepNumber || 0;
            const bStepNumber = b.step?.StepNumber || 0;
            return aStepNumber - bStepNumber;
        });
        
        // Recursively sort children
        for (const node of nodes) {
            if (node.children && node.children.length > 0) {
                this.sortExecutionTreeByStepNumber(node.children);
            }
        }
    }

    /**
     * Gets human-readable reasoning for a next step decision.
     * 
     * @private
     */
    private getNextStepReasoning(nextStep: BaseAgentNextStep): string {
        switch (nextStep.step) {
            case 'success':
                return 'Agent completed successfully';
            case 'failed':
                return `Agent failed: ${nextStep.errorMessage || 'Unknown error'}`;
            case 'retry':
                return nextStep.retryReason || 'Retrying with additional context';
            case 'sub-agent':
                return `Invoking sub-agent: ${nextStep.subAgent?.name}`;
            case 'actions':
                return `Executing ${nextStep.actions?.length || 0} action(s)`;
            case 'chat':
                return 'User interaction required';
            default:
                return 'Unknown next step';
        }
    }

    /**
     * Gets next step details for a decision.
     * 
     * @private
     */
    private getNextStepDetails(nextStep: BaseAgentNextStep): NextStepDetails | undefined {
        switch (nextStep.step) {
            case 'success':
            case 'failed':
                return { type: 'complete', returnValue: nextStep.returnValue };
            case 'retry':
                return { 
                    type: 'retry', 
                    retryReason: nextStep.retryReason || '', 
                    retryInstructions: nextStep.retryInstructions || '' 
                };
            case 'sub-agent':
                return nextStep.subAgent ? { type: 'sub-agent', subAgent: nextStep.subAgent } : undefined;
            case 'actions':
                return nextStep.actions ? { type: 'action', actions: nextStep.actions } : undefined;
            case 'chat':
                return { type: 'chat', message: nextStep.userMessage || '' };
            default:
                return undefined;
        }
    }
}

