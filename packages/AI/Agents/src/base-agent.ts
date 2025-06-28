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

import { AIAgentEntity, AIAgentTypeEntity, AIAgentRunEntityExtended, AIAgentRunStepEntityExtended, TemplateParamEntity, AIPromptEntity, ActionParamEntity } from '@memberjunction/core-entities';
import { UserInfo, Metadata, RunView, LogStatus, LogStatusEx, LogError, LogErrorEx, IsVerboseLoggingEnabled } from '@memberjunction/core';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { ChatMessage } from '@memberjunction/ai';
import { BaseAgentType } from './agent-types/base-agent-type';
import { CopyScalarsAndArrays, MJGlobal } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import {
    AIPromptParams,
    AIPromptRunResult,
    ChildPromptParam,
    ExecuteAgentParams, 
    AgentContextData,
    AgentConfiguration,
    AgentRunContext,
    AgentExecutionProgressCallback,
    ExecuteAgentResult,
    AgentAction,
    AgentSubAgentRequest,
    NextStepDetails,
    BaseAgentNextStep
} from '@memberjunction/ai-core-plus';
import { ActionEntityExtended, ActionResult } from '@memberjunction/actions-base';
import { AgentRunner } from './AgentRunner';
import { PayloadManager } from './PayloadManager';

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
    private _agentRun: AIAgentRunEntityExtended | null = null;

    
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
     * Payload manager for handling payload access control.
     * @private
     */
    private _payloadManager: PayloadManager = new PayloadManager();

    /**
     * Helper method for status logging with verbose control
     * @param message The message to log
     * @param verboseOnly Whether this is a verbose-only message
     * @param params Optional agent execution parameters for custom verbose check
     */
    protected logStatus(message: string, verboseOnly: boolean = false, params?: ExecuteAgentParams): void {
        if (verboseOnly) {
            LogStatusEx({
                message,
                verboseOnly: true,
                isVerboseEnabled: () => params?.verbose === true || IsVerboseLoggingEnabled()
            });
        } else {
            LogStatus(message);
        }
    }

    /**
     * Helper method for enhanced error logging with metadata
     */
    protected logError(error: Error | string, options?: {
        category?: string;
        metadata?: Record<string, any>;
        agent?: AIAgentEntity;
        agentType?: AIAgentTypeEntity;
        severity?: 'warning' | 'error' | 'critical';
    }): void {
        const errorMessage = error instanceof Error ? error.message : error;
        const errorObj = error instanceof Error ? error : undefined;
        
        const metadata: Record<string, any> = {
            ...options?.metadata
        };
        
        // Add agent information if available
        if (options?.agent) {
            metadata.agentId = options.agent.ID;
            metadata.agentName = options.agent.Name;
        }
        
        // Add agent type information if available
        if (options?.agentType) {
            metadata.agentTypeId = options.agentType.ID;
            metadata.agentTypeName = options.agentType.Name;
        }
        
        LogErrorEx({
            message: errorMessage,
            error: errorObj,
            category: options?.category || 'BaseAgent',
            severity: options?.severity || 'error',
            metadata: Object.keys(metadata).length > 0 ? metadata : undefined
        });
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
            this.logStatus(`🤖 Starting execution of agent '${params.agent.Name}'`, true, params);
            
            // Wrap the progress callback to capture all events
            const wrappedParams = {
                ...params,
                onProgress: this.wrapProgressCallback(params.onProgress)
            };
            
            // Check for cancellation at start
            if (params.cancellationToken?.aborted) {
                this.logStatus(`⚠️ Agent '${params.agent.Name}' execution cancelled before start`, true, params);
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
            this.logStatus(`📋 Loading configuration for agent '${params.agent.Name}'`, true, params);
            const config = await this.loadAgentConfiguration(params.agent);
            if (!config.success) {
                this.logError(`Failed to load agent configuration: ${config.errorMessage}`, {
                    agent: params.agent,
                    category: 'AgentConfiguration'
                });
                return await this.createFailureResult(config.errorMessage || 'Failed to load agent configuration', params.contextUser);
            }

            // Execute the agent's internal logic with wrapped parameters
            this.logStatus(`🚀 Executing agent '${params.agent.Name}' internal logic`, true, params);
            const executionResult = await this.executeAgentInternal<R>(wrappedParams, config);
            
            // Report finalization progress
            wrappedParams.onProgress?.({
                step: 'finalization',
                percentage: 95,
                message: this.formatHierarchicalMessage('Finalizing agent execution')
            });

            // Finalize the agent run
            this.logStatus(`✅ Finalizing execution for agent '${params.agent.Name}'`, true, params);
            
            // Map BaseAgentNextStep step values to AIAgentRunEntityExtended FinalStep values
            const finalStepMap: Record<BaseAgentNextStep['step'], AIAgentRunEntityExtended['FinalStep']> = {
                'success': 'Success',
                'failed': 'Failed',
                'retry': 'Retry',
                'sub-agent': 'Sub-Agent',
                'actions': 'Actions',
                'chat': 'Chat'
            };
            
            return await this.finalizeAgentRun<R>(finalStepMap[executionResult.finalStep.step], executionResult.finalStep.payload, params.contextUser);
        } catch (error) {
            // Check if error is due to cancellation
            if (params.cancellationToken?.aborted || error.message === 'Cancelled during execution') {
                this.logStatus(`⚠️ Agent '${params.agent.Name}' execution cancelled: ${error.message}`, true, params);
                return await this.createCancelledResult(error.message || 'Cancelled due to error during execution', params.contextUser);
            }
            this.logError(error, {
                agent: params.agent,
                category: 'AgentExecution',
                severity: 'critical'
            });
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
     * @returns {Promise<{finalPayload: P, stepCount: number}>} The execution result with typed final payload and step count
     * @protected
     */
    protected async executeAgentInternal<P = any>(
        params: ExecuteAgentParams, 
        config: AgentConfiguration
    ): Promise<{finalStep: BaseAgentNextStep<P>, stepCount: number}> {
        let continueExecution = true;
        let currentNextStep: BaseAgentNextStep<P> | null = null;        
        let stepCount = 0;

        while (continueExecution) {
            // Check for cancellation before each step
            if (params.cancellationToken?.aborted) {
                throw new Error('Cancelled during execution');
            }

            // Execute the current step based on previous decision or initial prompt
            this.logStatus(`🔄 Executing step ${stepCount + 1} for agent '${params.agent.Name}'`, true, params);
            const nextStep = await this.executeNextStep<P>(params, config, currentNextStep);
            stepCount++;
            
            // Check if we should continue or terminate
            if (nextStep.terminate) {
                continueExecution = false;
                currentNextStep = nextStep;
                this.logStatus(`🏁 Agent '${params.agent.Name}' terminating after ${stepCount} steps with result: ${nextStep.step}`, true, params);
            } else {
                currentNextStep = nextStep;
                this.logStatus(`➡️ Agent '${params.agent.Name}' continuing to next step: ${nextStep.step}`, true, params);
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
            // Set error on the agent run
            if (this._agentRun) {
                this._agentRun.ErrorMessage = `Agent '${agent.Name}' is not active. Current status: ${agent.Status}`;
                this._agentRun.Status = 'Failed';
                this._agentRun.Success = false;
                this._agentRun.FinalStep = 'Failed';
            }
            return {
                success: false,
                agentRun: this._agentRun!
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
    protected async preparePromptParams<P>(
        config: AgentConfiguration,
        payload: P,
        params: ExecuteAgentParams
    ): Promise<AIPromptParams> {
        const agentType: AIAgentTypeEntity = config.agentType;
        const systemPrompt: AIPromptEntity = config.systemPrompt;
        const childPrompt: AIPromptEntity = config.childPrompt;

        // Gather context data

        const promptTemplateData = await this.gatherPromptTemplateData(params.agent, params.contextUser, params.data);

        // Set up the hierarchical prompt execution
        const promptParams = new AIPromptParams();
        promptParams.prompt = systemPrompt;
        promptParams.data = promptTemplateData;
        promptParams.contextUser = params.contextUser;
        promptParams.conversationMessages = params.conversationMessages;
        promptParams.templateMessageRole = 'system';
        promptParams.verbose = params.verbose; // Pass through verbose flag

        if (payload) {
            // before we execute the prompt, we ask our Agent Type to inject the
            // payload - as the way a payload is injected is dependent on the agent type and its
            // prompting strategy. At this level in BaseAgent we don't know the format, location etc
            const atInstance = await BaseAgentType.GetAgentTypeInstance(config.agentType);
            await atInstance.InjectPayload<P>(payload, promptParams);
        }

        // Setup child prompt parameters
        promptParams.childPrompts = [
            new ChildPromptParam(
                {
                    prompt: childPrompt,
                    data: promptTemplateData,
                    contextUser: params.contextUser,
                    conversationMessages: params.conversationMessages,
                    templateMessageRole: 'user',
                    verbose: params.verbose
                } as AIPromptParams,
                agentType.AgentPromptPlaceholder
            )
        ];

        // Handle model selection mode
        if (params.agent.ModelSelectionMode === 'Agent') {
            // Use the child prompt (agent's specific prompt) for model selection
            promptParams.modelSelectionPrompt = childPrompt;
            this.logStatus(`🎯 Agent '${params.agent.Name}' configured to use its own prompt for model selection`, true, params);
        }
        // Default behavior is 'Agent Type', which uses the parent system prompt

        // Handle runtime override if provided
        if (params.override) {
            promptParams.override = params.override;
            this.logStatus(`🎯 Using runtime override: ${params.override.modelId || 'model'} ${params.override.vendorId ? `from vendor ${params.override.vendorId}` : ''}`, true, params);
        }

        return promptParams;
    }

    /**
     * Executes the configured prompt.
     * 
     * @param {AIPromptParams} promptParams - The prompt parameters
     * @returns {Promise<AIPromptRunResult>} The prompt execution result
     * @protected
     */
    protected async executePrompt(promptParams: AIPromptParams): Promise<AIPromptRunResult> {
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
    protected async processNextStep<P>(
        params: ExecuteAgentParams,
        agentType: AIAgentTypeEntity,
        promptResult: AIPromptRunResult
    ): Promise<BaseAgentNextStep<P>> {
        this.logStatus(`🤔 Processing next step for agent '${params.agent.Name}' with agent type '${agentType.Name}'`, true, params);

        const agentTypeInstance = await BaseAgentType.GetAgentTypeInstance(agentType);

        // Let the agent type determine the next step
        this.logStatus(`🎯 Agent type '${agentType.Name}' determining next step`, true, params);
        const nextStep = await agentTypeInstance.DetermineNextStep<P>(promptResult);
        
        this.logStatus(`📌 Next step determined: ${nextStep.step}${nextStep.terminate ? ' (terminating)' : ''}`, true, params);

        // Return the next step directly - execution handling is done in execute NextStep
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
    protected createActionResultMessage(actions: AgentAction[], results: ActionResult[]): ChatMessage {
        const resultSummary = actions.map((action, index) => {
            const result = results[index];
            const outputParams = result.Params?.filter((p: any) => 
                p.Type === 'Output' || p.Type === 'Both'
            ) || [];
            
            return {
                actionName: action.name,
                success: result.Success,
                resultCode: result.Result?.ResultCode || 'N/A',
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
    protected createSubAgentResultMessage(subAgent: AgentSubAgentRequest, result: ExecuteAgentResult): ChatMessage {
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
                parentAgentName: agent.Parent ? agent.Parent.trim() : "",
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
     * This method executes one action using the MemberJunction Actions framework.
     * The full ActionResult objects are returned, allowing the caller to access result codes, output parameters,
     * and other execution details.
     * 
     * @param {ExecuteAgentParams} params - Parameters from agent execution for context passing
     * @param {AgentAction} action - Action to execute
     * @param {UserInfo} [contextUser] - Optional user context for permissions
     * 
     * @returns {Promise<ActionResult>} ActionResult object from the action execution
     * 
     * @throws {Error} If the action fails to execute
     */
    public async ExecuteSingleAction(params: ExecuteAgentParams, action: AgentAction, contextUser?: UserInfo): Promise<ActionResult> {
        try {
            this.logStatus(`⚡ Executing action '${action.name}' (ID: ${action.id})`, true, params);
            
            const actionEngine = ActionEngineServer.Instance;
        
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
            
            this.logStatus(`📥 Action parameters: ${JSON.stringify(action.params)}`, true, params);
            
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
            
            this.logStatus(`✅ Action '${action.name}' completed successfully`, true, params);
            
            return result;
            
        } catch (error) {
            this.logError(error, {
                category: 'ActionExecution',
                metadata: {
                    actionId: action.id,
                    actionName: action.name,
                    actionParams: action.params
                }
            });
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
     * @returns {Promise<ExecuteAgentResult>} Result from the sub-agent execution
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
        payload?: SR
    ): Promise<ExecuteAgentResult<SR>> {
        try {
            this.logStatus(`🤖 Executing sub-agent '${subAgentRequest.name}' (ID: ${subAgentRequest.id})`, true, params);
            
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
                // don't include the full conversation of the parent, just the subAgentRequest - we previously did this: ...params.conversationMessages,
                {
                    role: 'user',
                    content: subAgentRequest.message
                }
            ];
            
            // Set parent run ID in the sub-agent's execution
            // This would need to be passed through the AgentRunner in a real implementation
            // For now, we execute normally and the sub-agent will track its parent relationship
            
            this.logStatus(`📨 Sub-agent message: "${subAgentRequest.message}"`, true, params);
            if (subAgentRequest.templateParameters) {
                this.logStatus(`📎 Template parameters: ${JSON.stringify(subAgentRequest.templateParameters)}`, true, params);
            }
            
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
                parentRun: this._agentRun,
                payload: payload, // pass the payload if provided
                data: subAgentRequest.templateParameters,
                context: params.context, // pass along our context to sub-agents so they can keep passing it down and pass to actions as well
                verbose: params.verbose // pass verbose flag to sub-agent
            });
            
            // Check if execution was successful
            if (!result.success) {
                throw new Error(`Sub-agent '${subAgentRequest.name}' failed: ${result.agentRun?.ErrorMessage || 'Unknown error'}`);
            }
            
            this.logStatus(`✅ Sub-agent '${subAgentRequest.name}' completed successfully`, true, params);
            
            // Return the full result for tracking
            return result;
            
        } catch (error) {
            this.logError(error, {
                category: 'SubAgentExecution',
                metadata: {
                    subAgentId: subAgentRequest.id,
                    subAgentName: subAgentRequest.name,
                    message: subAgentRequest.message
                }
            });
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
    private formatActionParameter(param: ActionParamEntity): object {
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
        this._agentRun = await this._metadata.GetEntityObject<AIAgentRunEntityExtended>('MJ: AI Agent Runs', params.contextUser);
        this._agentRun.AgentID = params.agent.ID;
        this._agentRun.Status = 'Running';
        this._agentRun.StartedAt = new Date();
        this._agentRun.UserID = params.contextUser?.ID || null;
        
        // Set parent run ID if we're in a sub-agent context
        this._agentRun.ParentRunID = params.parentRun?.ID;
        
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
        try {
            // Original validation logic
            const validationResult = await this.validateAgent(agent);
            
            if (validationResult) {
                // Create validation step
                const stepEntity = await this.createStepEntity('Validation', 'Agent Validation', contextUser);
                
                
                // Update step entity
                await this.finalizeStepEntity(stepEntity, false, validationResult.agentRun?.ErrorMessage);
                
                return await this.createFailureResult(validationResult.agentRun?.ErrorMessage || 'Validation failed', contextUser);
            }
            
            // Validation successful - create success step
            const stepEntity = await this.createStepEntity('Validation', 'Agent Validation', contextUser);
            
            
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
    private async createStepEntity(stepType: AIAgentRunStepEntityExtended["StepType"], stepName: string, contextUser: UserInfo, targetId?: string, inputData?: any, targetLogId?: string): Promise<AIAgentRunStepEntityExtended> {
        const stepEntity = await this._metadata.GetEntityObject<AIAgentRunStepEntityExtended>('MJ: AI Agent Run Steps', contextUser);
        
        stepEntity.AgentRunID = this._agentRun!.ID;
        stepEntity.StepNumber = this._runContext!.currentStepIndex + 1;
        stepEntity.StepType = stepType;
        // Include hierarchy breadcrumb in StepName for better logging
        stepEntity.StepName = this.formatHierarchicalMessage(stepName);
        // check to see if targetId is a valid UUID
        if (targetId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)) {
            // If not valid, we can just ignore it, but console.warn
            console.warn(`Invalid target ID format: ${targetId}`);
        }
        else {
            stepEntity.TargetID = targetId || null;
        }
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
        
        // Add the step to the agent run's Steps array
        if (this._agentRun) {
            this._agentRun.Steps.push(stepEntity);
        }
        
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
    private async finalizeStepEntity(stepEntity: AIAgentRunStepEntityExtended, success: boolean, errorMessage?: string, outputData?: any): Promise<void> {
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
     * Gets human-readable reasoning for the next step decision.
     * 
     * @private
     * @param {BaseAgentNextStep} nextStep - The next step decision
     * @returns {string} Human-readable reasoning
     */
    private getNextStepReasoning(nextStep: BaseAgentNextStep): string {
        switch (nextStep.step) {
            case 'success':
                return 'Agent completed task successfully';
            case 'failed':
                return nextStep.errorMessage || 'Agent execution failed';
            case 'retry':
                return nextStep.retryReason || 'Retrying with updated context';
            case 'sub-agent':
                return `Delegating to sub-agent: ${nextStep.subAgent?.name || 'Unknown'}`;
            case 'actions':
                const actionCount = nextStep.actions?.length || 0;
                return `Executing ${actionCount} action${actionCount !== 1 ? 's' : ''}`;
            case 'chat':
                return 'Requesting user input';
            default:
                return 'Unknown decision';
        }
    }

    /**
     * Gets details about what will be executed in the next step.
     * 
     * @private
     * @param {BaseAgentNextStep} nextStep - The next step decision
     * @returns {NextStepDetails | undefined} Details about the next step
     */
    private getNextStepDetails(nextStep: BaseAgentNextStep): NextStepDetails | undefined {
        switch (nextStep.step) {
            case 'success':
            case 'failed':
                return { type: 'complete', payload: nextStep.payload };
            case 'retry':
                return { 
                    type: 'retry', 
                    retryReason: nextStep.retryReason || 'Processing results',
                    retryInstructions: nextStep.retryInstructions || '',
                    payload: nextStep.payload
                };
            case 'sub-agent':
                return nextStep.subAgent ? {
                    type: 'sub-agent',
                    subAgent: nextStep.subAgent,
                    payload: nextStep.payload
                } : undefined;
            case 'actions':
                return nextStep.actions ? {
                    type: 'action',
                    actions: nextStep.actions,
                    payload: nextStep.payload
                } : undefined;
            case 'chat':
                return {
                    type: 'chat',
                    message: nextStep.userMessage || 'Awaiting user input',
                    payload: nextStep.payload
                };
            default:
                return undefined;
        }
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
     * @returns {Promise<BaseAgentNextStep<P>>}
     */
    protected async executeNextStep<P = any>(
        params: ExecuteAgentParams, 
        config: AgentConfiguration, 
        previousDecision: BaseAgentNextStep<P> | null
    ): Promise<BaseAgentNextStep<P>> {
        
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
                return await this.executeSubAgentStep(params, previousDecision!);
            case 'actions':
                return await this.executeActionsStep(params, previousDecision);
            case 'chat':
                return await this.executeChatStep(params, previousDecision);
            case 'success':
                const pd = previousDecision as any;
                if (pd.payload?.taskComplete === true && previousDecision.terminate) {
                    // If task is complete and the parent agent previously requested to auto-terminate, after a successful
                    // sub-agent run, we can finalize the agent run                    
                    return { 
                        terminate: true,
                        step: 'success', 
                        payload: previousDecision.payload 
                    };
                }
                else {
                    // either task wasn't complete or was a sub-agent run in which case we ALWAYS process one more time
                    // with the parent prompt
                    return await this.executePromptStep(params, config, previousDecision);
                }
            case 'failed':
                if (previousDecision.terminate) {
                    return { 
                        terminate: true,
                        step: 'failed', 
                        payload: previousDecision.payload 
                    };
                }
                else {
                    // we had a failure in the past step, but we are not terminating
                    // so we will retry the prompt step
                    return await this.executePromptStep(params, config, previousDecision);
                }
            default:
                throw new Error(`Unsupported next step: ${previousDecision.step}`);
        }
    }

    /**
     * Executes a prompt step and tracks it.
     * 
     * @private
     */
    private async executePromptStep<P>(
        params: ExecuteAgentParams, 
        config: AgentConfiguration,
        previousDecision?: BaseAgentNextStep
    ): Promise<BaseAgentNextStep<P>> {
        
        
        // Prepare input data for the step
        const inputData = {
            promptId: config.childPrompt?.ID,
            promptName: config.childPrompt?.Name,
            isRetry: !!previousDecision,
            retryContext: previousDecision ? {
                reason: previousDecision.retryReason,
                instructions: previousDecision.retryInstructions
            } : undefined,
            conversationMessages: params.conversationMessages,
            agentState: this._runContext?.agentState
        };
        
        const stepEntity = await this.createStepEntity('Prompt', 'Execute Agent Prompt', params.contextUser, config.childPrompt?.ID, inputData);
        
        try {
            // Report prompt execution progress with context
            const isRetry = !!previousDecision;
            const promptMessage = isRetry 
                ? `Running ${params.agent.Name} with context from ${previousDecision.retryReason || 'previous actions'}`
                : `Running ${params.agent.Name}'s initial prompt...`;
                
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
            const payload = previousDecision?.payload || params.payload;
            
            // Set PayloadAtStart
            if (stepEntity && payload) {
                stepEntity.PayloadAtStart = JSON.stringify(payload);
            }
            
            const promptParams = await this.preparePromptParams(config, payload, params);
            
            // Pass cancellation token and streaming callbacks to prompt execution
            promptParams.cancellationToken = params.cancellationToken;
            promptParams.onStreaming = params.onStreaming ? (chunk) => {
                params.onStreaming!({
                    ...chunk,
                    stepType: 'prompt',
                    stepEntityId: stepEntity.ID
                });
            } : undefined;
            
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
                    step: 'failed', // Cancelled is treated as failed
                    payload: cancelledResult.payload,   
                }
            }

            // Report decision processing progress
            params.onProgress?.({
                step: 'decision_processing',
                percentage: 70,
                message: this.formatHierarchicalMessage('Analyzing response and determining next steps'),
                displayMode: 'both' // Show in both live and historical modes
            });
            
            // Determine next step using agent type
            const nextStep = await this.processNextStep<P>(params, config.agentType!, promptResult);
            
            
            // Prepare output data
            const outputData = {
                promptResult: {
                    success: promptResult.success,
                    llmResponse: promptResult.rawResult,
                    modelUsed: promptResult.modelInfo?.modelName,
                    tokensUsed: promptResult?.promptRun?.TokensUsed,
                    totalCost: promptResult?.promptRun?.TotalCost
                },
                nextStep: {
                    decision: nextStep.step,
                    reasoning: this.getNextStepReasoning(nextStep),
                    payload: nextStep.payload
                }
            };
            
            // Set PayloadAtEnd
            if (stepEntity && nextStep.payload) {
                stepEntity.PayloadAtEnd = JSON.stringify(nextStep.payload);
            }
            
            // Update the agent run's current payload
            if (this._agentRun && nextStep.payload) {
                this._agentRun.FinalPayloadObject = nextStep.payload;
            }
            
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

            // we had an error, don't throw the exception as that will kill our overall execution/run
            // instead retrun a helpful message in our return value that the parent loop can review and 
            // adjust
            const errString = error?.message || error || 'Unknown error';
            return {
                errorMessage: `Prompt execution failed: ${errString}`,
                step: 'failed',
                terminate: false,
            };
        }
    }



    /**
     * Executes a sub-agent step and tracks it.
     * 
     * @private
     */
    private async executeSubAgentStep<SC = any, SR = any>(
        params: ExecuteAgentParams<SC>,
        previousDecision?: BaseAgentNextStep<SR, SC>,
    ): Promise<BaseAgentNextStep<SR, SC>> {
        const subAgentRequest = previousDecision.subAgent as AgentSubAgentRequest<SC>;
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
        
        
        // Prepare input data for the step
        const inputData = {
            subAgentId: subAgentRequest.id,
            subAgentName: subAgentRequest.name,
            message: subAgentRequest.message,
            terminateAfter: subAgentRequest.terminateAfter,
            conversationMessages: params.conversationMessages,
            parentAgentHierarchy: this._runContext?.agentHierarchy
        };
        
        const stepEntity = await this.createStepEntity('Sub-Agent', `Execute Sub-Agent: ${subAgentRequest.name}`, params.contextUser, subAgentRequest.id, inputData);
        
        try {
            // Get sub-agent entity to access payload paths
            const engine = AIEngine.Instance;
            const subAgentEntity = engine.Agents.find(a => a.ID === subAgentRequest.id);
            
            if (!subAgentEntity) {
                throw new Error(`Sub-agent entity not found for ID: ${subAgentRequest.id}`);
            }
            
            // Parse payload access paths
            let downstreamPaths: string[] = ['*'];
            let upstreamPaths: string[] = ['*'];
            
            try {
                // Note: TypeScript errors on PayloadDownstreamPaths/PayloadUpstreamPaths are expected
                // until CodeGen runs after the migration to add these fields to AIAgentEntity
                if ((subAgentEntity as any).PayloadDownstreamPaths) {
                    downstreamPaths = JSON.parse((subAgentEntity as any).PayloadDownstreamPaths);
                }
                if ((subAgentEntity as any).PayloadUpstreamPaths) {
                    upstreamPaths = JSON.parse((subAgentEntity as any).PayloadUpstreamPaths);
                }
            } catch (parseError) {
                this.logError(`Failed to parse payload paths for sub-agent ${subAgentRequest.name}: ${parseError.message}`, {
                    category: 'SubAgentExecution',
                    metadata: {
                        subAgentId: subAgentRequest.id,
                        downstreamPaths: (subAgentEntity as any).PayloadDownstreamPaths,
                        upstreamPaths: (subAgentEntity as any).PayloadUpstreamPaths
                    }
                });
            }
            
            // Extract only allowed downstream payload
            const downstreamPayload = this._payloadManager.extractDownstreamPayload(
                subAgentRequest.name,
                previousDecision.payload,
                downstreamPaths
            );
            
            // Execute sub-agent with filtered payload
            const subAgentResult = await this.ExecuteSubAgent(
                params,
                subAgentRequest,
                downstreamPayload
            );
            
            // Merge upstream changes back into parent payload
            const mergedPayload = this._payloadManager.mergeUpstreamPayload(
                subAgentRequest.name,
                previousDecision.payload,
                subAgentResult.payload,
                upstreamPaths
            );

            // Update step entity with AIAgentRun ID if available
            if (subAgentResult.agentRun?.ID) {
                stepEntity.TargetLogID = subAgentResult.agentRun.ID;
                // Set the SubAgentRun property for hierarchical tracking
                stepEntity.SubAgentRun = subAgentResult.agentRun;
                stepEntity.PayloadAtStart = JSON.stringify(previousDecision.payload);
                stepEntity.PayloadAtEnd = JSON.stringify(mergedPayload);
                // saving happens later by calling finalizeStepEntity()
            }
            
            // Check for cancellation after sub-agent execution
            if (params.cancellationToken?.aborted) {
                await this.finalizeStepEntity(stepEntity, false, 'Cancelled during sub-agent execution');
                throw new Error('Cancelled during sub-agent execution');
            }
            
            // Store sub-agent run for complete tracking
            this._subAgentRuns.push(subAgentResult);
            
            // Determine if we should terminate after sub-agent
            const shouldTerminate = subAgentRequest.terminateAfter;
            
            // Prepare output data
            const outputData = {
                subAgentResult: {
                    success: subAgentResult.success,
                    finalStep: subAgentResult.agentRun?.FinalStep,
                    payload: subAgentResult.payload,
                    errorMessage: subAgentResult.agentRun?.ErrorMessage,
                    agentRunId: subAgentResult.agentRun?.ID,
                    stepCount: subAgentResult.agentRun?.Steps?.length || 0
                },
                shouldTerminate: shouldTerminate,
                nextStep: shouldTerminate ? 'success' : 'retry'
            };
            
            // Finalize step entity
            await this.finalizeStepEntity(stepEntity, subAgentResult.success, 
                subAgentResult.agentRun?.ErrorMessage, outputData);
            
            // Build a clean summary of sub-agent result
            const subAgentSummary = {
                subAgentName: subAgentRequest.name,
                subAgentId: subAgentRequest.id,
                success: subAgentResult.success,
                finalStep: subAgentResult.agentRun?.FinalStep,
                payload: subAgentResult.payload,
                errorMessage: subAgentResult.agentRun?.ErrorMessage || null
            };
            
            // Add user message with the sub-agent results
            const resultMessage = subAgentResult.success
                ? `Sub-agent completed successfully:\n${JSON.stringify(subAgentSummary, null, 2)}`
                : `Sub-agent failed:\n${JSON.stringify(subAgentSummary, null, 2)}`;
                
            params.conversationMessages.push({
                role: 'user',
                content: resultMessage
            });
            
            // Update the agent run's current payload with the merged result
            if (this._agentRun) {
                this._agentRun.FinalPayloadObject = mergedPayload;
            }
            
            return { 
                ...subAgentResult, 
                step: subAgentResult.success ? 'success' : 'failed', 
                terminate: shouldTerminate,
                payload: mergedPayload 
            };            
        } catch (error) {
            await this.finalizeStepEntity(stepEntity, false, error.message);

            // we had an error, don't throw the exception as that will kill our overall execution/run
            // instead retrun a helpful message in our return value that the parent loop can review and 
            // adjust
            return {
                errorMessage: `Sub-agent execution failed: ${(error as Error).message}`,
                step: 'failed',
                terminate: false,
            };
        }
    }

    /**
     * Executes actions step and tracks it.
     * 
     * @private
     */
    private async executeActionsStep(
        params: ExecuteAgentParams,
        previousDecision: BaseAgentNextStep
    ): Promise<BaseAgentNextStep> {
        try {
            const agentActions: AgentAction[] = previousDecision.actions || [];
            // Check for cancellation before starting
            if (params.cancellationToken?.aborted) {
                throw new Error('Cancelled before action execution');
            }

            // Validate all actions to ensure that the ID and Name provided are both present AND
            // that they match the information in our database.
            agentActions.forEach(aa => {
                // validate action ID and name
                const actionEntity = ActionEngineServer.Instance.Actions.find(a => a.ID.trim().toLowerCase() === aa.id.trim().toLowerCase());
                if (!actionEntity) {
                    throw new Error(`Action with ID ${aa.id} and Name "${aa.name}" not found`);
                }
                if (actionEntity.Name.trim().toLowerCase() !== aa.name.trim().toLowerCase()) {
                    throw new Error(`Action with ID ${aa.id} has a different name "${actionEntity.Name}" than provided "${aa.name}"`);
                }
            });

            // Report action execution progress with markdown formatting for parameters
            let progressMessage: string;
            if (agentActions.length === 1) {
                const aa = agentActions[0];
                progressMessage = `Executing action: **${aa.name}**`;
                
                // Add parameters if they exist
                if (aa.params && Object.keys(aa.params).length > 0) {
                    const paramsList = Object.entries(aa.params)
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
                progressMessage = `Executing ${agentActions.length} actions:`;
                agentActions.forEach(aa => {
                    progressMessage += `\n\n• **${aa.name}**`;
                    if (aa.params && Object.keys(aa.params).length > 0) {
                        const paramsList = Object.entries(aa.params)
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
                    actionCount: agentActions.length,
                    actionNames: agentActions.map(a => a.name)
                },
                displayMode: 'live' // Only show in live mode
            });
            
            // Add assistant message indicating we're executing actions with more detail
            const actionMessage = agentActions.length === 1 
                ? `I'm executing the "${agentActions[0].name}" action...`
                : `I'm executing ${agentActions.length} actions to gather the information needed:\n${agentActions.map(a => `• ${a.name}`).join('\n')}`;
            
            params.conversationMessages.push({
                role: 'assistant',
                content: actionMessage
            });
            
            // Execute all actions in parallel
            const actionPromises = agentActions.map(async (aa) => {
                        const stepEntity = await this.createStepEntity('Actions', `Execute Action: ${aa.name}`, params.contextUser, aa.id);
                let actionResult;
                try {
                    // Execute the action
                    actionResult = await this.ExecuteSingleAction(params, aa, params.contextUser);
                    
                    // Update step entity with ActionExecutionLog ID if available
                    if (actionResult.LogEntry?.ID) {
                        stepEntity.TargetLogID = actionResult.LogEntry.ID;
                        await stepEntity.Save();
                    }
                    
                    // Prepare output data with action result
                    const outputData = {
                        actionResult: {
                            success: actionResult.Success,
                            resultCode: actionResult.Result?.ResultCode,
                            message: actionResult.Message,
                            parameters: actionResult.Params
                        }
                    };
                    
                    // Finalize step entity with output data
                    await this.finalizeStepEntity(stepEntity, actionResult.Success, 
                        actionResult.Success ? undefined : actionResult.Message, outputData);
                    
                    return { success: true, result: actionResult, action: aa, stepEntity };
                    
                } catch (error) {
                    await this.finalizeStepEntity(stepEntity, false, error.message);

                    return { success: false, result: actionResult, error: error.message, action: aa, stepEntity };
                }
            });
            
            // Wait for all actions to complete
            const actionResults = await Promise.all(actionPromises);
            
            // Check for cancellation after actions complete
            if (params.cancellationToken?.aborted) {
                throw new Error('Cancelled after action execution');
            }
            
            // Build a clean summary of action results
            const actionSummaries = actionResults.map(result => {
                const actionResult = result.success ? result.result : null;
                
                return {
                    actionName: result.action.name,
                    actionId: result.action.id,
                    params: result.result?.Params || {},
                    success: result.success,
                    resultCode: actionResult?.Result?.ResultCode || (result.success ? 'SUCCESS' : 'ERROR'),
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
                payload: previousDecision?.payload || null,
                priorStepResult: actionSummaries,
                retryReason: failedActions.length > 0 
                    ? `Processing results with ${failedActions.length} failed action(s): ${failedActions.map(a => a.actionName).join(', ')}`
                    : `Analyzing results from ${actionSummaries.length} completed action(s) to formulate response`
            };
        }
        catch (e) {
            return {
                terminate: false,
                step: 'retry',
                payload: e && e.message ? e.message : e ? e : 'Unknown error execution actions',
                retryReason: 'Error while processing actions, retry'
            };
        }
    }

    /**
     * Executes a chat step (not implemented in base class).
     * 
     * @private
     */
    private async executeChatStep(
        params: ExecuteAgentParams,
        previousDecision: BaseAgentNextStep
    ): Promise<BaseAgentNextStep> {
        // Chat functionality would need to be implemented based on the specific chat system
        // For now, we'll just create a failed step
        const userMessage = previousDecision.userMessage;
        const stepEntity = await this.createStepEntity('Chat', 'User Interaction', params.contextUser);
        
        
        
        await this.finalizeStepEntity(stepEntity, false, 'Chat not implemented');
        
        return { 
            step: 'chat',
            terminate: true,
            priorStepResult: userMessage,
            payload: previousDecision.payload,
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
            agentRun: this._agentRun!
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
            agentRun: this._agentRun!
        };
    }

    /**
     * Finalizes the agent run with success.
     * 
     * @private
     */
    private async finalizeAgentRun<P>(finalStep: AIAgentRunEntityExtended["FinalStep"], payload?: P, contextUser?: UserInfo): Promise<ExecuteAgentResult<P>> {
        if (this._agentRun) {
            this._agentRun.Status = 'Completed';
            this._agentRun.CompletedAt = new Date();
            this._agentRun.Success = finalStep === 'Success' || finalStep === 'Chat';
            this._agentRun.Result = payload ? JSON.stringify(payload) : null;
            this._agentRun.FinalStep = finalStep;
            
            // Set the FinalPayloadObject - this will automatically stringify for the DB
            this._agentRun.FinalPayloadObject = payload;
            
            // Calculate total tokens from all prompts and sub-agents
            const tokenStats = this.calculateTokenStats();
            this._agentRun.TotalTokensUsed = tokenStats.totalTokens;
            this._agentRun.TotalPromptTokensUsed = tokenStats.promptTokens;
            this._agentRun.TotalCompletionTokensUsed = tokenStats.completionTokens;
            this._agentRun.TotalCost = tokenStats.totalCost;
            
            await this._agentRun.Save();
        }
        
        return {
            success: finalStep === 'Success' || finalStep === 'Chat',
            payload,
            agentRun: this._agentRun!
        };
    }


    /**
     * Calculate total token statistics from the agent run's persisted steps.
     * 
     * @returns Token statistics including totals and costs
     * @private
     */
    private calculateTokenStats(): { totalTokens: number; promptTokens: number; completionTokens: number; totalCost: number } {
        let totalTokens = 0;
        let promptTokens = 0;
        let completionTokens = 0;
        let totalCost = 0;

        // Iterate through the agent run's steps to sum up tokens
        if (this._agentRun?.Steps) {
            for (const step of this._agentRun.Steps) {
                if (step.StepType === 'Prompt' && step.PromptRun) {
                    // Add tokens from prompt runs
                    totalTokens += step.PromptRun.TokensUsed || 0;
                    // Note: AIPromptRunEntity doesn't have separate prompt/completion tokens
                    // so we'll just use the total tokens for now
                    promptTokens += 0; // TODO: Add PromptTokens to AIPromptRunEntity if needed
                    completionTokens += 0; // TODO: Add CompletionTokens to AIPromptRunEntity if needed
                    totalCost += step.PromptRun.TotalCost || 0;
                } else if (step.StepType === 'Sub-Agent' && step.SubAgentRun) {
                    // Add tokens from sub-agent runs (these should already be calculated recursively)
                    totalTokens += step.SubAgentRun.TotalTokensUsed || 0;
                    promptTokens += step.SubAgentRun.TotalPromptTokensUsed || 0;
                    completionTokens += step.SubAgentRun.TotalCompletionTokensUsed || 0;
                    totalCost += step.SubAgentRun.TotalCost || 0;
                }
            }
        }

        return { totalTokens, promptTokens, completionTokens, totalCost };
    }
}

