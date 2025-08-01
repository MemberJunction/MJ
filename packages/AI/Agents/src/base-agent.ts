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

import { AIAgentEntity, AIAgentTypeEntity, AIAgentRunEntityExtended, AIAgentRunStepEntityExtended, TemplateParamEntity, AIPromptEntity, ActionParamEntity, AIAgentEntityExtended } from '@memberjunction/core-entities';
import { UserInfo, Metadata, RunView, LogStatus, LogStatusEx, LogError, LogErrorEx, IsVerboseLoggingEnabled } from '@memberjunction/core';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { ChatMessage } from '@memberjunction/ai';
import { BaseAgentType } from './agent-types/base-agent-type';
import { CopyScalarsAndArrays, JSONValidator } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import {
    AIPromptParams,
    AIPromptRunResult,
    ChildPromptParam,
    ExecuteAgentParams, 
    AgentContextData,
    AgentConfiguration,
    AgentExecutionProgressCallback,
    ExecuteAgentResult,
    AgentAction,
    AgentSubAgentRequest,
    BaseAgentNextStep
} from '@memberjunction/ai-core-plus';
import { ActionEntityExtended, ActionResult } from '@memberjunction/actions-base';
import { AgentRunner } from './AgentRunner';
import { PayloadManager, PayloadManagerResult, PayloadChangeResultSummary } from './PayloadManager';
import { AgentPayloadChangeRequest } from '@memberjunction/ai-core-plus';
import * as _ from 'lodash';

/**
 * Extended progress step that includes additional metadata for execution tracking
 */
type ExtendedProgressStep = Parameters<AgentExecutionProgressCallback>[0] & {
    /** Timestamp when this progress step was recorded */
    timestamp: Date;
    /** Hierarchy of agent names from root to current agent */
    agentHierarchy: string[];
    /** Depth of the current agent in the execution hierarchy */
    depth: number;
};

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
     * Maximum allowed validation retries before forcing failure.
     * @private
     */
    private static readonly MAX_VALIDATION_RETRIES = 10;

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
     * Map to track execution counts for actions and sub-agents.
     * Key is the item ID (action ID or sub-agent ID), value is the count.
     * @private
     */
    private _executionCounts: Map<string, number> = new Map();

    /**
     * Counter for validation-induced retries (when validation changes a step to Retry).
     * This is separate from FinalPayloadValidation retries.
     * @private
     */
    private _generalValidationRetryCount: number = 0;

    /**
     * Current agent run entity.
     * @private
     */
    private _agentRun: AIAgentRunEntityExtended | null = null;

    /**
     * Access the current run for the agent
     */
    public get AgentRun(): AIAgentRunEntityExtended | null {
        return this._agentRun;
    }

    /**
     * Agent hierarchy for display purposes (e.g., ["Marketing Agent", "Copywriter Agent"]).
     * Tracked separately as it's display-only and doesn't need persistence.
     * @private
     */
    private _agentHierarchy: string[] = [];

    /**
     * Current depth in the agent hierarchy (0 = root agent, 1 = first sub-agent, etc.).
     * @private
     */
    private _depth: number = 0;

    
    /**
     * All progress steps including intermediate ones for complete execution tracking.
     * @private
     */
    private _allProgressSteps: ExtendedProgressStep[] = [];

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
     * Counter for tracking validation retry attempts during FinalPayloadValidation.
     * Reset at the start of each agent run.
     * @private
     */
    private _validationRetryCount: number = 0;

    /**
     * Gets the current validation retry count for the agent run.
     * This count tracks how many times the agent has retried validation
     * during the FinalPayloadValidation step.
     * @readonly
     */
    public get ValidationRetryCount(): number {
        return this._validationRetryCount;
    }

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
                agentHierarchy: this._agentHierarchy || [],
                depth: this._depth || 0
            });
            
            // Include agent run in metadata if available
            try {
                const enhancedProgress = {
                    ...progress,
                    metadata: {
                        ...progress.metadata,
                        agentRun: this._agentRun 
                    }
                };
            
                // Call original callback with enhanced progress
                originalCallback(enhancedProgress);
            }
            catch (e) {
                this.logError(`Failed to enhance progress with agent run: ${e instanceof Error ? e.message : e}`, {
                    category: 'ProgressEnhancement',
                    metadata: {
                        progress: progress,
                        agentRunId: this._agentRun?.ID || 'N/A'
                    }
                });     

                // Call original callback without enhancement
                originalCallback(progress);
            }
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

            await this.initializeStartingPayload(wrappedParams);
            
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

            // Reset validation retry counters for this run
            this._validationRetryCount = 0;
            this._generalValidationRetryCount = 0;

            // Initialize engines
            await this.initializeEngines(params.contextUser);

            // Check for cancellation after initialization
            if (params.cancellationToken?.aborted) {
                return await this.createCancelledResult('Cancelled during initialization', params.contextUser);
            }

            // Handle starting payload validation if configured
            const startingValidationResult = await this.handleStartingPayloadValidation(wrappedParams);
            if (startingValidationResult) {
                return startingValidationResult;
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
                metadata: { result: executionResult },
                message: this.formatHierarchicalMessage('Finalizing agent execution')
            });

            // Finalize the agent run
            this.logStatus(`✅ Finalizing execution for agent '${params.agent.Name}'`, true, params);

            // finalize the run, favor the new payload if we have one, otehrwise fall back to the previous payload
            return await this.finalizeAgentRun<R>(executionResult.finalStep, executionResult.finalStep.newPayload || executionResult.finalStep.previousPayload, params.contextUser);
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
     * Sub-classes can override this method to perform any specialized initialization
     * @param params 
     */
    protected async initializeStartingPayload<P = any>(params: ExecuteAgentParams<any, P>): Promise<void> { 
        // the base class doesn't do anything here, this allows sub-classes
        // to do specialized initialization of the starting payload
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
                this.logStatus(`🏁 Agent '${params.agent.Name}' terminating after ${stepCount} steps with result: ${nextStep.step}`, true, params);
            } else {
                currentNextStep = nextStep;
                // If the last step didn't have a new payload make sure to carry forward
                // the previous payload to the next step
                if (!currentNextStep.newPayload && currentNextStep.previousPayload) {
                    currentNextStep.newPayload = currentNextStep.previousPayload;
                }          
                this.logStatus(`➡️ Agent '${params.agent.Name}' continuing to next step: ${nextStep.step}`, true, params);
            }

            // in both cases at the end of the loop we need to advanced the currentNextStep
            currentNextStep = nextStep;
            // if we get to the end and for some reason the newPayload is not set, we should
            // grab the previousPayload to ensure we have something to for the next loop
            // or to return as a failed step shouldn't kill the chain of execution's payload
            // carryforward.
            if (!currentNextStep.newPayload && currentNextStep.previousPayload) {
                currentNextStep.newPayload = currentNextStep.previousPayload;
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
     * Validates that there are no circular references in the run chain.
     * Follows the LastRunID chain to ensure it doesn't loop back to the current run.
     * 
     * @param {string} lastRunId - The ID of the last run to check
     * @param {UserInfo} [contextUser] - Optional user context
     * @private
     */
    private async validateRunChain(lastRunId: string, contextUser?: UserInfo): Promise<void> {
        const visitedRunIds = new Set<string>();
        visitedRunIds.add(this._agentRun!.ID); // Add current run ID
        
        let currentRunId = lastRunId;
        const maxChainLength = 1000; // Reasonable limit to prevent infinite loops
        let chainLength = 0;
        
        while (currentRunId) {
            // Check if we've seen this run ID before
            if (visitedRunIds.has(currentRunId)) {
                throw new Error(`Circular reference detected in run chain. Run ID '${currentRunId}' creates a loop.`);
            }
            
            // Check chain length
            if (++chainLength > maxChainLength) {
                throw new Error(`Run chain exceeds maximum length of ${maxChainLength}. This may indicate a data issue.`);
            }
            
            visitedRunIds.add(currentRunId);
            
            // Load the run to check its LastRunID
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: `ID='${currentRunId}'`,
                ResultType: 'simple'
            }, contextUser);
            
            if (!result.Success || result.Results.length === 0) {
                // Run not found, chain ends here
                break;
            }
            
            // Get the LastRunID from this run to continue checking
            currentRunId = result.Results[0].LastRunID;
        }
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
     * Handles validation of the starting payload if configured.
     * 
     * This method validates the input payload against the agent's StartingPayloadValidation
     * schema before execution begins. It respects the agent's PayloadScope if configured.
     * 
     * @param {ExecuteAgentParams} params - The execution parameters
     * @returns {Promise<ExecuteAgentResult | null>} Error result if validation fails and mode is 'Fail', null otherwise
     * @protected
     */
    protected async handleStartingPayloadValidation<P = any>(params: ExecuteAgentParams<any, P>): Promise<ExecuteAgentResult | null> {
        const agent = params.agent;
        
        // Skip if no validation configured or no payload provided
        if (!agent.StartingPayloadValidation || params.payload === undefined) {
            return null;
        }

        try {
            // Parse the validation schema
            let validationSchema: any;
            try {
                validationSchema = JSON.parse(agent.StartingPayloadValidation);
            } catch (parseError) {
                this.logError(`Invalid StartingPayloadValidation JSON for agent ${agent.Name}: ${parseError.message}`, {
                    category: 'StartingPayloadValidation',
                    metadata: {
                        agentName: agent.Name,
                        agentId: agent.ID,
                        validationSchema: agent.StartingPayloadValidation
                    }
                });
                // Invalid schema, skip validation
                return null;
            }

            // Determine which payload to validate based on PayloadScope
            let payloadToValidate = params.payload;

            // Validate the payload using JSONValidator
            const jsonValidator = new JSONValidator();
            const validationResult = jsonValidator.validate(payloadToValidate, validationSchema);

            if (!validationResult.Success) {
                // Validation failed
                const errorMessages = validationResult.Errors.map(e => e.Message);
                return this.handleStartingValidationFailure(params, errorMessages);
            }

            // Validation passed
            this.logStatus(`✅ Starting payload validation passed for agent ${agent.Name}`, true, params);
            return null;

        } catch (error) {
            this.logError(`Unexpected error during starting payload validation: ${error.message}`, {
                category: 'StartingPayloadValidation',
                metadata: {
                    agentName: agent.Name,
                    agentId: agent.ID,
                    error: error.message
                }
            });
            // On unexpected errors, let execution proceed
            return null;
        }
    }

    /**
     * Handles starting payload validation failures based on the configured mode.
     * 
     * @param {ExecuteAgentParams} params - The execution parameters
     * @param {string[]} errorMessages - The validation error messages
     * @returns {ExecuteAgentResult | null} Error result if mode is 'Fail', null if mode is 'Warn'
     * @private
     */
    private handleStartingValidationFailure(
        params: ExecuteAgentParams,
        errorMessages: string[]
    ): ExecuteAgentResult | null {
        const mode = params.agent.StartingPayloadValidationMode || 'Fail';
        const validationFeedback = `Starting payload validation failed:\n${errorMessages.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;

        if (mode === 'Fail') {
            this.logError(`Starting payload validation failed for agent ${params.agent.Name}`, {
                agent: params.agent,
                category: 'StartingPayloadValidation',
                metadata: { errors: errorMessages }
            });

            // Update agent run with validation failure
            if (this._agentRun) {
                this._agentRun.ErrorMessage = validationFeedback;
                this._agentRun.Status = 'Failed';
                this._agentRun.Success = false;
                this._agentRun.FinalStep = 'Failed';
                // Note: We don't save here as the agent run will be saved in finalizeAgentRun
            }

            return {
                success: false,
                agentRun: this._agentRun!,
                payload: params.payload // must pass back the original payload for consistency
            };
        } else { // if (mode === 'Warn') {
            // Log warning but continue execution
            this.logStatus(
                `⚠️ WARNING: ${validationFeedback}`,
                false,
                params
            );
            return null;
        }
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

        // first check to see if we have a custom driver class if we do, we do NOT validate the rest of
        // the metadata as the custom sub-class can do whatever it wants with/without prompts/etc.
        let metadataOptional: boolean = false;
        if (agent.DriverClass) {
            this.logStatus(`🔧 Using custom driver class '${agent.DriverClass}' for agent '${agent.Name}'`, true);   
            metadataOptional = true;
        }

        // Find the agent type
        const agentType = engine.AgentTypes.find(at => at.ID === agent.TypeID);
        if (!agentType && !metadataOptional) {
            return {
                success: false,
                errorMessage: `Agent type not found for ID: ${agent.TypeID}`
            };
        }

        // Find the system prompt (optional)
        const systemPrompt = engine.Prompts.find(p => p.ID === agentType.SystemPromptID);

        if (!systemPrompt)
            metadataOptional = true; // If no system prompt, we can skip some validations
        
        // Find the first active agent prompt
        const agentPrompt = engine.AgentPrompts
            .filter(ap => ap.AgentID === agent.ID && ap.Status === 'Active')
            .sort((a, b) => a.ExecutionOrder - b.ExecutionOrder)[0];
        
        if (!agentPrompt && !metadataOptional) {
            return {
                success: false,
                errorMessage: `No prompts configured for agent: ${agent.Name}`
            };
        }

        // Find the actual prompt entity
        const childPrompt = engine.Prompts.find(p => p.ID === agentPrompt?.PromptID);
        if (!childPrompt && !metadataOptional) {
            return {
                success: false,
                errorMessage: `Child prompt not found for ID: ${agentPrompt?.PromptID}`
            };
        }

        // Validate placeholder configuration
        if (!agentType.AgentPromptPlaceholder && !metadataOptional) {
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
        
        // Handle case where systemPrompt is optional (e.g., Flow Agent Type)
        if (systemPrompt) {
            promptParams.prompt = systemPrompt;
            promptParams.templateMessageRole = 'system';
        } else {
            // For agents without system prompts, use the child prompt directly
            promptParams.prompt = childPrompt;
            promptParams.templateMessageRole = 'user';
        }
        
        promptParams.data = promptTemplateData;
        promptParams.agentRunId = this.AgentRun?.ID;
        promptParams.contextUser = params.contextUser;
        promptParams.conversationMessages = params.conversationMessages;
        promptParams.verbose = params.verbose; // Pass through verbose flag

        // before we execute the prompt, we ask our Agent Type to inject the
        // payload - as the way a payload is injected is dependent on the agent type and its
        // prompting strategy. At this level in BaseAgent we don't know the format, location etc
        // NOTE: We do this even if payload is empty, each agent type can have its own
        //       logic for handling empty payloads.
        const atInstance = await BaseAgentType.GetAgentTypeInstance(config.agentType);
        await atInstance.InjectPayload<P>(payload, promptParams, {
            agentId: params.agent.ID,
            agentRunId: this._agentRun?.ID
        });

        // Only set up child prompts if we have a system prompt
        if (systemPrompt) {
            // Setup child prompt parameters
            const childPromptParams: AIPromptParams = {
                prompt: childPrompt,
                data: promptTemplateData,
                contextUser: params.contextUser,
                conversationMessages: params.conversationMessages,
                templateMessageRole: 'user',
                verbose: params.verbose,
                agentRunId: this.AgentRun?.ID
            };
            
            // Pass through API keys to child prompt if provided
            if (params.apiKeys && params.apiKeys.length > 0) {
                childPromptParams.apiKeys = params.apiKeys;
            }
            
            // Pass through configurationId to both parent and child prompts if provided
            if (params.configurationId) {
                promptParams.configurationId = params.configurationId;
                childPromptParams.configurationId = params.configurationId;
            }
            
            promptParams.childPrompts = [
                new ChildPromptParam(
                    childPromptParams,
                    agentType.AgentPromptPlaceholder
                )
            ];
        } else {
            // Pass through API keys and configuration ID for direct prompt execution
            if (params.apiKeys && params.apiKeys.length > 0) {
                promptParams.apiKeys = params.apiKeys;
            }
            if (params.configurationId) {
                promptParams.configurationId = params.configurationId;
            }
        }

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

        // Pass through API keys if provided
        if (params.apiKeys && params.apiKeys.length > 0) {
            promptParams.apiKeys = params.apiKeys;
            this.logStatus(`🔑 Using ${params.apiKeys.length} API key(s) provided at runtime`, true, params);
        }

        return promptParams;
    }

    /**
     * Executes the configured prompt. Always uses the attemptJSONRepair option to try to fix LLM
     * JSON syntax issues if they arise.
     * 
     * @param {AIPromptParams} promptParams - The prompt parameters
     * @returns {Promise<AIPromptRunResult>} The prompt execution result
     * @protected
     */
    protected async executePrompt(promptParams: AIPromptParams): Promise<AIPromptRunResult> {
        const newParams = {
            ...promptParams,
            attemptJSONRepair: true 
        }
        return await this._promptRunner.ExecutePrompt(newParams);
    }

    /**
     * Base class method that determines the next step by contacting the agent type class for the specified agent type and delegating
     * that decision. Sub-classes can override this method to implement custom next step logic if needed.
     * @param params 
     * @param agentType 
     * @param promptResult 
     * @returns 
     */
    protected async determineNextStep<P>(
        params: ExecuteAgentParams,
        agentType: AIAgentTypeEntity,
        promptResult: AIPromptRunResult,
        currentPayload: P
    ): Promise<BaseAgentNextStep<P>> {
        this.logStatus(`🤔 Processing next step for agent '${params.agent.Name}' with agent type '${agentType.Name}'`, true, params);
        const agentTypeInstance = await BaseAgentType.GetAgentTypeInstance(agentType);

        // Let the agent type determine the next step
        this.logStatus(`🎯 Agent type '${agentType.Name}' determining next step`, true, params);
        const nextStep = await agentTypeInstance.DetermineNextStep<P>(promptResult, params);
        return nextStep;
    }


    /**
     * Validates if the next step is valid, or not. If the next step is invalid, it returns a retry step with an error message
     * that can be processed by the agent via a retry prompt to attempt to correct the issue. Alternatively, subclasses can
     * handle this scenario differently as desired. 
     * 
     * The BaseAgent class implements checking for sub-agents and actions to ensure that the next step is valid in the 
     * context of the current agent. If the next step is a sub-agent, it checks if the sub-agent is active and available for execution.
     * If the next step is actions, it checks if the actions are valid and available for execution.
     * @param params 
     * @param nextStep 
     * @returns 
     */
    protected async validateNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: AIAgentRunEntityExtended,
        currentStep: AIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // for next step, let's do a little quick validation here for sub-agent and actions to ensure requests are valid
        switch (nextStep.step) {
            case 'Sub-Agent':           
                return this.validateSubAgentNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
            case 'Actions':
                return this.validateActionsNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
            case 'Success':
                return this.validateSuccessNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
            case 'Chat':
                return this.validateChatNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
            case 'Retry':
                return this.validateRetryNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
            case 'Failed':
                return this.validateFailedNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
            default:
                // if we get here, the next step is not recognized, we can return a retry step
                this.logError(`Invalid next step '${nextStep.step}' for agent '${params.agent.Name}'`, {
                    agent: params.agent,
                    category: 'NextStepValidation'
                });
                return {
                    step: 'Failed',
                    terminate: true, // final condition
                    errorMessage: `Invalid next step '${nextStep.step}'`
                };
        }
    }

    /**
     * Validates that the sub-agent next step is valid and can be executed by the current agent. Subclasses can override 
     * this method to implement custom validation logic if needed.
     * @param params 
     * @param nextStep 
     * @returns 
     */
    protected async validateSubAgentNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: AIAgentRunEntityExtended,
        currentStep: AIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // check to make sure the current agent can execute the specified sub-agent
        const name = nextStep.subAgent?.name;
        const curAgentSubAgents = AIEngine.Instance.GetSubAgents(params.agent.ID, 'Active');
        const subAgent = curAgentSubAgents.find(a => a.Name.trim().toLowerCase() === name?.trim().toLowerCase());
        
        if (!name || !subAgent) {
            this.logError(`Sub-agent '${name}' not found or not active for agent '${params.agent.Name}'`, {
                agent: params.agent,
                category: 'SubAgentExecution'
            });
            // Increment validation retry count since we're changing to Retry
            if (nextStep.step !== 'Retry') {
                this._generalValidationRetryCount++;
            }
            return {
                step: 'Retry',
                terminate: false, // this will kick it back to the prompt to run again
                errorMessage: `Sub-agent '${name}' not found or not active`
            };
        }

        // Check MaxExecutionsPerRun limit
        if (subAgent.MaxExecutionsPerRun != null) {
            const executionCount = await this.getSubAgentExecutionCount(agentRun.ID, subAgent.ID);
            if (executionCount >= subAgent.MaxExecutionsPerRun) {
                this.logError(`Sub-agent '${name}' has reached its maximum execution limit of ${subAgent.MaxExecutionsPerRun}`, {
                    agent: params.agent,
                    category: 'SubAgentExecution',
                    metadata: {
                        subAgentName: name,
                        executionCount,
                        maxExecutions: subAgent.MaxExecutionsPerRun
                    }
                });
                // Increment validation retry count since we're changing to Retry
                if (nextStep.step !== 'Retry') {
                    this._generalValidationRetryCount++;
                }
                return {
                    step: 'Retry',
                    terminate: false,
                    errorMessage: `Sub-agent '${name}' has reached its maximum execution limit of ${subAgent.MaxExecutionsPerRun}`
                };
            }
        }

        // if we get here, the next step is valid and we can return it
        return nextStep;
    }

    /**
     * Validates that the actions next step is valid and can be executed by the current agent. Subclasses can override
     * this method to implement custom validation logic if needed.
     * @param params 
     * @param nextStep 
     * @returns 
     */
    protected async validateActionsNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: AIAgentRunEntityExtended,
        currentStep: AIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // check to make sure the current agent can execute the specified action
        const curAgentActions = AIEngine.Instance.AgentActions.filter(aa => aa.AgentID === params.agent.ID && aa.Status === 'Active');
        const missingActions = nextStep.actions?.filter(action => 
            !curAgentActions.some(aa => aa.Action.trim().toLowerCase() === action.name.trim().toLowerCase())
        );
        // we should have zero missing actions, if we do, we need to log an error and return a retry step
        if (missingActions && missingActions.length > 0) {
            const missingActionNames = missingActions.map(a => a.name).join(', ');
            this.logError(`Actions '${missingActionNames}' not found or not active for agent '${params.agent.Name}'`, {
                agent: params.agent,
                category: 'ActionExecution'
            });
            // Increment validation retry count since we're changing to Retry
            if (nextStep.step !== 'Retry') {
                this._generalValidationRetryCount++;
            }
            return {
                step: 'Retry',
                terminate: false, // this will kick it back to the prompt to run again
                errorMessage: `Actions '${missingActionNames}' not found or not active`
            };
        }

        // Check MaxExecutionsPerRun limits for each action
        if (nextStep.actions) {
            const violatedActions: string[] = [];
            
            for (const action of nextStep.actions) {
                const agentAction = curAgentActions.find(aa => 
                    aa.Action.trim().toLowerCase() === action.name.trim().toLowerCase()
                );
                
                if (agentAction && agentAction.MaxExecutionsPerRun != null) {
                    const executionCount = await this.getActionExecutionCount(agentRun.ID, agentAction.ActionID);
                    if (executionCount >= agentAction.MaxExecutionsPerRun) {
                        violatedActions.push(`${action.name} (limit: ${agentAction.MaxExecutionsPerRun}, current: ${executionCount})`);
                    }
                }
            }
            
            if (violatedActions.length > 0) {
                const violationMessage = `Actions have reached execution limits: ${violatedActions.join(', ')}`;
                this.logError(violationMessage, {
                    agent: params.agent,
                    category: 'ActionExecution',
                    metadata: {
                        violatedActions
                    }
                });
                // Increment validation retry count since we're changing to Retry
                if (nextStep.step !== 'Retry') {
                    this._generalValidationRetryCount++;
                }
                return {
                    step: 'Retry',
                    terminate: false,
                    errorMessage: violationMessage
                };
            }
        }

        // if we get here, the next step is valid and we can return it
        return nextStep;
    }


    /**
     * Validates that the Success next step is valid and can be executed by the current agent. Subclasses can override
     * this method to implement custom validation logic if needed.
     * @param params 
     * @param nextStep 
     * @returns 
     */
    protected async validateSuccessNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: AIAgentRunEntityExtended,
        currentStep: AIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // First check minimum execution requirements
        const minViolations = await this.checkMinimumExecutionRequirements(params.agent, agentRun);
        if (minViolations.length > 0) {
            const violationMessage = `Minimum execution requirements not met:\n${minViolations.join('\n')}`;
            this.logError(violationMessage, {
                agent: params.agent,
                category: 'MinimumExecutionValidation'
            });
            
            // Increment validation retry count since we're changing to Retry
            if (nextStep.step !== 'Retry') {
                this._generalValidationRetryCount++;
            }
            
            return {
                step: 'Retry',
                terminate: false,
                errorMessage: violationMessage
            };
        }

        // Check if the agent has FinalPayloadValidation configured
        const agent = params.agent;
        if (!agent.FinalPayloadValidation || !currentPayload) {
            // No validation configured or no payload to validate
            return nextStep;
        }

        try {
            // Parse the validation schema/example
            let validationSchema: any;
            try {
                validationSchema = JSON.parse(agent.FinalPayloadValidation);
            } catch (parseError) {
                this.logError(`Invalid FinalPayloadValidation JSON for agent ${agent.Name}: ${parseError.message}`, {
                    category: 'PayloadValidation',
                    metadata: {
                        agentName: agent.Name,
                        agentId: agent.ID,
                        validationSchema: agent.FinalPayloadValidation
                    }
                });
                // Invalid schema, skip validation
                return nextStep;
            }

            // Determine which payload to validate based on PayloadScope
            let payloadToValidate = currentPayload;
            if (agent.PayloadScope) {
                // For scoped agents, validate only the scoped portion
                payloadToValidate = this._payloadManager.applyPayloadScope(currentPayload, agent.PayloadScope) as P;
                if (payloadToValidate === null) {
                    // Scope doesn't exist, this is already a validation failure
                    const errorMessage = `PayloadScope '${agent.PayloadScope}' not found in payload`;
                    return this.handleFinalPayloadValidationFailure(
                        params,
                        nextStep,
                        currentPayload,
                        agent.FinalPayloadValidationMode || 'Retry',
                        [errorMessage],
                        agentRun,
                        currentStep
                    );
                }
            }

            // Validate the payload against the schema using JSONValidator
            const jsonValidator = new JSONValidator();
            const validationResult = jsonValidator.validate(payloadToValidate, validationSchema);

            if (!validationResult.Success) {
                // Validation failed
                const mode = agent.FinalPayloadValidationMode || 'Retry';
                const errorMessages = validationResult.Errors.map(e => e.Message);
                
                this.logStatus(`⚠️ Final payload validation failed for agent ${agent.Name} (mode: ${mode}):`, true, params);
                errorMessages.forEach((error, index) => {
                    this.logStatus(`   ${index + 1}. ${error}`, true, params);
                });

                return this.handleFinalPayloadValidationFailure(
                    params,
                    nextStep,
                    currentPayload,
                    mode,
                    errorMessages,
                    agentRun,
                    currentStep
                );
            }

            // Validation passed
            this.logStatus(`✅ Final payload validation passed for agent ${agent.Name}`, true, params);
            
            // Save success result to step
            try {
                currentStep.FinalPayloadValidationResult = 'Pass';
                currentStep.FinalPayloadValidationMessages = null; // Clear any previous messages
                await currentStep.Save();
            } catch (error) {
                this.logError(`Failed to save validation success result: ${error.message}`, {
                    category: 'PayloadValidation', 
                    metadata: { stepId: currentStep.ID }
                });
            }
            
            return nextStep;

        } catch (error) {
            this.logError(`Unexpected error during final payload validation: ${error.message}`, {
                category: 'PayloadValidation',
                metadata: {
                    agentName: agent.Name,
                    agentId: agent.ID,
                    error: error.message
                }
            });
            // On unexpected errors, let the success proceed
            return nextStep;
        }
    }

    /**
     * Handles final payload validation failures based on the configured mode.
     * 
     * @param params - Execution parameters
     * @param nextStep - The original success next step
     * @param currentPayload - The current payload
     * @param mode - The validation mode (Retry, Fail, Warn)
     * @param errorMessages - The validation error messages
     * @returns Modified next step based on validation mode
     */
    protected async handleFinalPayloadValidationFailure<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        mode: string,
        errorMessages: string[],
        agentRun: AIAgentRunEntityExtended,
        currentStep: AIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        const validationFeedback = `Final payload validation failed:\n${errorMessages.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;

        // Always save validation results to the new fields
        try {
            currentStep.FinalPayloadValidationMessages = errorMessages.join('; ');
            
            switch (mode) {
                case 'Retry':
                    // Increment retry counter
                    this._validationRetryCount++;
                    
                    // Check if max retries exceeded
                    const maxRetries = params.agent.FinalPayloadValidationMaxRetries || 3;
                    if (this._validationRetryCount >= maxRetries) {
                        // Max retries exceeded, force to Fail
                        this.logStatus(`❌ Max validation retries (${maxRetries}) exceeded, forcing failure`, false, params);
                        
                        currentStep.FinalPayloadValidationResult = 'Fail';
                        await currentStep.Save();
                        
                        return {
                            ...nextStep,
                            step: 'Failed',
                            message: `${validationFeedback}\n\nMax validation retries (${maxRetries}) exceeded.`,
                            terminate: true
                        };
                    }
                    
                    // Still have retries left
                    currentStep.FinalPayloadValidationResult = 'Retry';
                    await currentStep.Save();
                    
                    this.logStatus(`🔄 Validation retry ${this._validationRetryCount}/${maxRetries}`, true, params);
                    
                    return {
                        ...nextStep,
                        step: 'Retry',
                        retryInstructions: `${validationFeedback}\n\nRetry attempt ${this._validationRetryCount} of ${maxRetries}`,
                        terminate: false
                    };

                case 'Fail':
                    // Convert success to error
                    currentStep.FinalPayloadValidationResult = 'Fail';
                    await currentStep.Save();
                    
                    return {
                        ...nextStep,
                        step: 'Failed',
                        message: validationFeedback,
                        terminate: true
                    };

                case 'Warn':
                    // Log warning but allow success
                    this.logStatus(`⚠️ WARNING: ${validationFeedback}`, false, params);
                    
                    currentStep.FinalPayloadValidationResult = 'Warn';
                    await currentStep.Save();
                    
                    return nextStep; // Return original success

                default:
                    // Default to retry
                    this._validationRetryCount++;
                    currentStep.FinalPayloadValidationResult = 'Retry';
                    await currentStep.Save();
                    
                    return {
                        ...nextStep,
                        step: 'Retry',
                        retryInstructions: validationFeedback,
                        terminate: false
                    };
            }
        } catch (error) {
            this.logError(`Failed to save validation results: ${error.message}`, {
                category: 'PayloadValidation',
                metadata: { stepId: currentStep.ID }
            });
            // Still return the appropriate result even if save failed
            return mode === 'Warn' ? nextStep : {
                ...nextStep,
                step: mode === 'Fail' ? 'Failed' : 'Retry',
                message: validationFeedback,
                terminate: mode === 'Fail'
            };
        }
    }

    /**
     * Validates that the Failed next step is valid and can be executed by the current agent. Subclasses can override
     * this method to implement custom validation logic if needed.
     * @param params 
     * @param nextStep 
     * @returns 
     */
    protected async validateFailedNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: AIAgentRunEntityExtended,
        currentStep: AIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // currently the base class doesn't do anything, subclasses can implement any custom logic in their override
        return nextStep;
    }

    /**
     * Validates that the Retry next step is valid and can be executed by the current agent. Subclasses can override
     * this method to implement custom validation logic if needed. The retry step is typically used to
     * handle cases where the agent needs to re-attempt a step due to an error or invalid state.
     * @param params 
     * @param nextStep 
     * @returns 
     */
    protected async validateRetryNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: AIAgentRunEntityExtended,
        currentStep: AIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // currently the base class doesn't do anything, subclasses can implement any custom logic in their override
        return nextStep;
    }

    /**
     * Validates that the Chat next step is valid and can be executed by the current agent. Subclasses can override
     * this method to implement custom validation logic if needed.
     * @param params 
     * @param nextStep 
     * @returns 
     */
    protected async validateChatNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: AIAgentRunEntityExtended,
        currentStep: AIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // currently the base class doesn't do anything, subclasses can implement any custom logic in their override
        return nextStep;
    }


    /**
     * Checks execution guardrails and modifies next step if limits are exceeded.
     * This method is called after validation but before execution of non-terminal steps.
     * 
     * @param params - Execution parameters
     * @param nextStep - The validated next step
     * @param currentPayload - Current payload
     * @param agentRun - Current agent run
     * @param currentStep - Current execution step
     * @returns Modified next step if guardrails exceeded, or original next step
     * @protected
     */
    protected async checkExecutionGuardrails<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: AIAgentRunEntityExtended,
        currentStep: AIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // Skip guardrail checks for terminal steps
        if (nextStep.step === 'Success' || nextStep.step === 'Failed' || nextStep.step === 'Chat') {
            return nextStep;
        }

        // Check if any guardrails are exceeded
        const guardrailResult = await this.hasExceededAgentRunGuardrails(params, agentRun);
        
        if (guardrailResult.exceeded) {
            // Log the guardrail violation
            this.logStatus(`⛔ Execution guardrail exceeded: ${guardrailResult.reason}`, false, params);
            
            // Update the current step with guardrail information
            try {
                const outputData = currentStep.OutputData ? JSON.parse(currentStep.OutputData) : {};
                currentStep.OutputData = JSON.stringify({
                    ...outputData,
                    guardrailExceeded: {
                        type: guardrailResult.type,
                        limit: guardrailResult.limit,
                        current: guardrailResult.current,
                        reason: guardrailResult.reason,
                        timestamp: new Date().toISOString()
                    }
                });
                await currentStep.Save();
            } catch (error) {
                this.logError(`Failed to save guardrail violation to step: ${error.message}`, {
                    category: 'Guardrails',
                    metadata: { stepId: currentStep.ID }
                });
            }
            
            // Convert next step to Failed with guardrail reason
            return {
                ...nextStep,
                step: 'Failed',
                terminate: true,
                message: guardrailResult.reason,
                errorMessage: guardrailResult.reason
            };
        }
        
        // No guardrails exceeded, return original next step
        return nextStep;
    }

    /**
     * Checks if any agent run guardrails have been exceeded.
     * Override this method to implement custom guardrail logic.
     * 
     * @param params - Execution parameters
     * @param agentRun - Current agent run
     * @returns Object indicating if guardrails exceeded and details
     * @protected
     */
    protected async hasExceededAgentRunGuardrails(
        params: ExecuteAgentParams,
        agentRun: AIAgentRunEntityExtended
    ): Promise<{
        exceeded: boolean;
        type?: 'cost' | 'tokens' | 'iterations' | 'time';
        limit?: number;
        current?: number;
        reason?: string;
    }> {
        const agent = params.agent;
        
        // Check cost limit
        if (agent.MaxCostPerRun && agentRun.TotalCost) {
            if (agentRun.TotalCost >= agent.MaxCostPerRun) {
                return {
                    exceeded: true,
                    type: 'cost',
                    limit: agent.MaxCostPerRun,
                    current: agentRun.TotalCost,
                    reason: `Maximum cost limit of $${agent.MaxCostPerRun} exceeded. Current cost: $${agentRun.TotalCost.toFixed(4)}`
                };
            }
        }
        
        // Check token limit
        if (agent.MaxTokensPerRun && agentRun.TotalTokensUsed) {
            if (agentRun.TotalTokensUsed >= agent.MaxTokensPerRun) {
                return {
                    exceeded: true,
                    type: 'tokens',
                    limit: agent.MaxTokensPerRun,
                    current: agentRun.TotalTokensUsed,
                    reason: `Maximum token limit of ${agent.MaxTokensPerRun} exceeded. Current tokens: ${agentRun.TotalTokensUsed}`
                };
            }
        }
        
        // Check iteration limit
        if (agent.MaxIterationsPerRun && agentRun.TotalPromptIterations) {
            if (agentRun.TotalPromptIterations >= agent.MaxIterationsPerRun) {
                return {
                    exceeded: true,
                    type: 'iterations',
                    limit: agent.MaxIterationsPerRun,
                    current: agentRun.TotalPromptIterations,
                    reason: `Maximum iteration limit of ${agent.MaxIterationsPerRun} exceeded. Current iterations: ${agentRun.TotalPromptIterations}`
                };
            }
        }
        
        // Check time limit
        if (agent.MaxTimePerRun && agentRun.StartedAt) {
            const elapsedSeconds = Math.floor((Date.now() - new Date(agentRun.StartedAt).getTime()) / 1000);
            if (elapsedSeconds >= agent.MaxTimePerRun) {
                return {
                    exceeded: true,
                    type: 'time',
                    limit: agent.MaxTimePerRun,
                    current: elapsedSeconds,
                    reason: `Maximum time limit of ${agent.MaxTimePerRun} seconds exceeded. Elapsed time: ${elapsedSeconds} seconds`
                };
            }
        }
        
        // Check validation retry limit
        if (this._generalValidationRetryCount >= BaseAgent.MAX_VALIDATION_RETRIES) {
            return {
                exceeded: true,
                type: 'iterations', // Using iterations type since validation retries are a form of iteration
                limit: BaseAgent.MAX_VALIDATION_RETRIES,
                current: this._generalValidationRetryCount,
                reason: `Maximum validation retries of ${BaseAgent.MAX_VALIDATION_RETRIES} exceeded. The agent is unable to produce valid output after ${this._generalValidationRetryCount} validation failures.`
            };
        }
        
        // No guardrails exceeded
        return { exceeded: false };
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
        nextStep: BaseAgentNextStep<P>,
        params: ExecuteAgentParams,
        agentType: AIAgentTypeEntity,
        promptResult: AIPromptRunResult,
        currentPayload: P,
        currentStep: AIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        const validatedNextStep = await this.validateNextStep<P>(params, nextStep, currentPayload, this._agentRun, currentStep);
        
        // Check guardrails if next step would continue execution
        const guardrailCheckedStep = await this.checkExecutionGuardrails<P>(
            params, 
            validatedNextStep, 
            currentPayload, 
            this._agentRun!, 
            currentStep
        );
        
        this.logStatus(`📌 Next step determined: ${guardrailCheckedStep.step}${guardrailCheckedStep.terminate ? ' (terminating)' : ''}`, true, params);

        // if we need to retry make sure we add the retry message to the conversation messages
        if (guardrailCheckedStep.step === 'Retry' && (guardrailCheckedStep.message || guardrailCheckedStep.errorMessage || guardrailCheckedStep.retryInstructions)) {
            params.conversationMessages.push({
                role: 'user',
                content: `Retrying due to: ${guardrailCheckedStep.retryInstructions || guardrailCheckedStep.message || guardrailCheckedStep.errorMessage}`
            });
        }   

        // Return the next step directly - execution handling is done in execute NextStep
        return guardrailCheckedStep;
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
            const activeSubAgents = engine.Agents.filter(a => a.ParentID === agent.ID && a.Status === 'Active')
                .sort((a, b) => a.ExecutionOrder - b.ExecutionOrder);
            
            // Load available actions (placeholder for now - would integrate with Actions framework)
            const agentActions = engine.AgentActions.filter(aa => aa.AgentID === agent.ID && aa.Status === 'Active');
            const actions: ActionEntityExtended[] = ActionEngineServer.Instance.Actions.filter(a => agentActions.some(aa => aa.ActionID === a.ID));
            const activeActions = actions.filter(a => a.Status === 'Active');

            const contextData: AgentContextData = {
                agentName: agent.Name,
                agentDescription: agent.Description,
                parentAgentName: agent.Parent ? agent.Parent.trim() : "",
                subAgentCount: activeSubAgents.length,
                subAgentDetails: this.formatSubAgentDetails(activeSubAgents),
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
    public async ExecuteSingleAction(params: ExecuteAgentParams, action: AgentAction, actionEntity: ActionEntityExtended, 
        contextUser?: UserInfo): Promise<ActionResult> {
        try {
            const actionEngine = ActionEngineServer.Instance;

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
            
            if (result.Success) {
                this.logStatus(`   ✅ Action '${action.name}' completed successfully`, true, params);
            } else {
                this.logStatus(`   ❌ Action '${action.name}' failed: ${result.Message || 'Unknown error'}`, false, params);
            }
            
            return result;
            
        } catch (error) {
            this.logError(error, {
                category: 'ActionExecution',
                metadata: {
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
        subAgent: AIAgentEntityExtended,
        stepEntity: AIAgentRunStepEntityExtended,
        payload?: SR
    ): Promise<ExecuteAgentResult<SR>> {
        try {
            this.logStatus(`🤖 Executing sub-agent '${subAgentRequest.name}'`, true, params);
            
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
            const result = await runner.RunAgent<SC, SR>({
                agent: subAgent,
                conversationMessages: subAgentMessages,
                contextUser: params.contextUser,
                cancellationToken: params.cancellationToken,
                onProgress:  params.onProgress,
                onStreaming: params.onStreaming,
                parentAgentHierarchy: this._agentHierarchy,
                parentDepth: this._depth,
                parentRun: this._agentRun,
                payload: payload, // pass the payload if provided
                configurationId: params.configurationId, // propagate configuration ID to sub-agent
                data: {
                        ...subAgentRequest.templateParameters,
                        ...params.data, 
                      }, // merge any template parameters, but override with explicitly provided data so that hallucinated input params don't override data provided by caller
                context: params.context, // pass along our context to sub-agents so they can keep passing it down and pass to actions as well
                verbose: params.verbose, // pass verbose flag to sub-agent
                // Add callback to link AgentRun ID immediately when created
                onAgentRunCreated: async (agentRunId: string) => {
                    stepEntity.TargetLogID = agentRunId;
                    await stepEntity.Save();
                }
            });
            
            // Check if execution was successful
            if (result.success) {
                this.logStatus(`✅ Sub-agent '${subAgentRequest.name}' completed successfully`, true, params);
            }
            else {
                this.logStatus(`Sub-agent '${subAgentRequest.name}' failed: ${result.agentRun?.ErrorMessage || 'Unknown error'}`);
            }
            
            // Return the full result for tracking
            return result;
        } catch (error) {
            this.logError(error, {
                category: 'SubAgentExecution',
                metadata: {
                    agentName: params.agent.Name,
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
        return JSON.stringify(subAgents.map(sa => {
            const result = {
                Name: sa.Name,
                Description: sa.Description,
            };
            if (sa.ExecutionMode !== 'Sequential') {
                // no need to include these two attributes for sub-agents
                // that are sequential and the order is implied via the array order
                // saves tokens
                result['ExecutionMode'] = sa.ExecutionMode;
                result['ExecutionOrder'] = sa.ExecutionOrder;
            }

            return result;
        }), null, 2);
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
     * Initializes the agent run tracking by creating AIAgentRunEntity and setting up context.
     * 
     * @private
     * @param {ExecuteAgentParams} params - The execution parameters
     */
    private async initializeAgentRun(params: ExecuteAgentParams): Promise<void> {
        // Handle autoPopulateLastRunPayload if requested
        let modifiedParams = params;
        if (params.lastRunId && params.autoPopulateLastRunPayload) {
            // Load the last run to get its FinalPayload
            const rv = new RunView();
            const lastRunResult = await rv.RunView({
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: `ID='${params.lastRunId}'`,
                ResultType: 'simple' // Avoid recursive loading
            }, params.contextUser);
            
            if (lastRunResult.Success && lastRunResult.Results.length > 0) {
                const lastRun = lastRunResult.Results[0];
                if (lastRun.FinalPayload) {
                    try {
                        const lastPayload = JSON.parse(lastRun.FinalPayload);
                        // Only set payload if not explicitly provided
                        if (!params.payload) {
                            modifiedParams = {
                                ...params,
                                payload: lastPayload
                            };
                        }
                    } catch (e) {
                        this.logError(`Failed to parse FinalPayload from last run: ${e}`, {
                            category: 'LastRunPayload',
                            metadata: { lastRunId: params.lastRunId }
                        });
                    }
                }
            }
        }
        
        // Create AIAgentRunEntity
        this._agentRun = await this._metadata.GetEntityObject<AIAgentRunEntityExtended>('MJ: AI Agent Runs', params.contextUser);
        this._agentRun.AgentID = params.agent.ID;
        this._agentRun.Status = 'Running';
        this._agentRun.StartedAt = new Date();
        this._agentRun.UserID = params.contextUser?.ID || null;
        
        // Set parent run ID if we're in a sub-agent context
        this._agentRun.ParentRunID = params.parentRun?.ID;
        
        // Set LastRunID for run chaining (different from ParentRunID)
        if (params.lastRunId) {
            // Check for circular references in the run chain
            await this.validateRunChain(params.lastRunId, params.contextUser);
            
            this._agentRun.LastRunID = params.lastRunId;
        }
        
        // Set StartingPayload if we have a payload (either from params or auto-populated)
        if (modifiedParams.payload) {
            this._agentRun.StartingPayload = JSON.stringify(modifiedParams.payload);
        }
        
        // Set new fields from ExecuteAgentParams
        if (params.configurationId) {
            this._agentRun.ConfigurationID = params.configurationId;
        }
        if (params.override?.modelId) {
            this._agentRun.OverrideModelID = params.override.modelId;
        }
        if (params.override?.vendorId) {
            this._agentRun.OverrideVendorID = params.override.vendorId;
        }
        if (params.data) {
            this._agentRun.Data = JSON.stringify(params.data);
        }
        this._agentRun.Verbose = params.verbose || false;
        
        // Save the agent run
        if (!await this._agentRun.Save()) {
            const errorMessage = JSON.stringify(CopyScalarsAndArrays(this._agentRun.LatestResult));
            throw new Error(`Failed to create agent run record: Details: ${errorMessage}`);
        }
        
        // Invoke callback if provided
        if (modifiedParams.onAgentRunCreated) {
            try {
                await modifiedParams.onAgentRunCreated(this._agentRun.ID);
            } catch (callbackError) {
                LogStatus(`Error in onAgentRunCreated callback: ${callbackError.message}`);
                // Don't fail the execution if callback fails
            }
        }

        // Initialize hierarchy tracking
        this._agentHierarchy = params.parentAgentHierarchy 
            ? [...params.parentAgentHierarchy, params.agent.Name || 'Unknown Agent']
            : [params.agent.Name || 'Unknown Agent'];
        this._depth = params.parentDepth !== undefined ? params.parentDepth + 1 : 0;

        // Reset execution chain and progress tracking
        this._allProgressSteps = [];
        
        // Update params with the modified payload if auto-populated
        if (modifiedParams !== params && modifiedParams.payload !== undefined) {
            // Directly update the params object's payload property
            // This ensures the rest of the execution uses the correct payload
            params.payload = modifiedParams.payload;
        }
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
    private async createStepEntity(stepType: AIAgentRunStepEntityExtended["StepType"], stepName: string, contextUser: UserInfo, targetId?: string, inputData?: any, targetLogId?: string, payloadAtStart?: any, payloadAtEnd?: any): Promise<AIAgentRunStepEntityExtended> {
        const stepEntity = await this._metadata.GetEntityObject<AIAgentRunStepEntityExtended>('MJ: AI Agent Run Steps', contextUser);
        
        stepEntity.AgentRunID = this._agentRun!.ID;
        // Step number is based on current count of steps + 1
        stepEntity.StepNumber = (this._agentRun!.Steps?.length || 0) + 1;
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
        stepEntity.PayloadAtStart = payloadAtStart ? JSON.stringify(payloadAtStart) : null;
        stepEntity.PayloadAtEnd = payloadAtEnd ? JSON.stringify(payloadAtEnd) : null;
        
        // Populate InputData if provided
        if (inputData) {
            stepEntity.InputData = JSON.stringify({
                ...inputData,
                context: {
                    agentHierarchy: this._agentHierarchy,
                    depth: this._depth,
                    stepNumber: stepEntity.StepNumber
                }
            });
        }
        
        if (!await stepEntity.Save()) {
            throw new Error(`Failed to create agent run step record: ${JSON.stringify(stepEntity.LatestResult)}`);
        }
        
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
    /**
     * Builds a summary of payload change results for storage
     * @param changeResult The result from PayloadManager operations
     * @returns A serializable summary object
     */
    private buildPayloadChangeResultSummary(changeResult: PayloadManagerResult<any>): PayloadChangeResultSummary {
        return {
            applied: changeResult.applied,
            warnings: changeResult.warnings,
            requiresFeedback: changeResult.requiresFeedback,
            timestamp: changeResult.timestamp,
            
            // Include blocked operations for payload validation tracking
            payloadValidation: changeResult.blockedOperations && changeResult.blockedOperations.length > 0 ? {
                selfWriteViolations: {
                    deniedOperations: changeResult.blockedOperations,
                    timestamp: changeResult.timestamp.toISOString()
                }
            } : undefined,
            
            // Include analysis summary if available
            analysis: changeResult.analysis ? {
                totalWarnings: changeResult.analysis.summary.totalWarnings,
                warningsByType: changeResult.analysis.summary.warningsByType,
                suspiciousChanges: changeResult.analysis.summary.suspiciousChanges,
                // Only store critical warnings to save space
                criticalWarnings: changeResult.analysis.criticalWarnings.map(w => ({
                    type: w.type,
                    severity: w.severity,
                    path: w.path,
                    message: w.message
                }))
            } : undefined,
            
            // Store compact diff summary instead of full diff
            diffSummary: changeResult.diff ? {
                added: changeResult.diff.summary.added,
                removed: changeResult.diff.summary.removed,
                modified: changeResult.diff.summary.modified,
                totalChanges: changeResult.diff.summary.totalPaths
            } : undefined
        };
    }

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
        if (this._depth > 0) {
            // Build breadcrumb from agent hierarchy (skip root agent)
            const breadcrumb = this._agentHierarchy
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
            case 'Failed':
                return nextStep.errorMessage || 'Agent execution failed';
            case 'Retry':
                return nextStep.retryReason || 'Retrying with updated context';
            default:
                return nextStep.reasoning || 'Continuing to next step';
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
            // First execution - ask the agent type what to do
            const agentTypeInstance = await BaseAgentType.GetAgentTypeInstance(config.agentType);
            const initialStep = await agentTypeInstance.DetermineInitialStep<P>(params);
            
            if (initialStep) {
                // Agent type provided an initial step
                return initialStep;
            }
            
            // Default behavior - run the initial prompt
            return await this.executePromptStep(params, config);
        }
        
        // Execute based on the previous decision
        switch (previousDecision.step) {
            case 'Retry':
                // Ask agent type if it wants to handle retry differently
                const agentTypeInstance = await BaseAgentType.GetAgentTypeInstance(config.agentType);
                const customRetryStep = await agentTypeInstance.PreProcessRetryStep(params, previousDecision);
                
                if (customRetryStep) {
                    // Agent type provided custom handling
                    return customRetryStep;
                }
                
                // Default behavior - execute prompt step
                return await this.executePromptStep(params, config, previousDecision);
            case 'Sub-Agent':
                return await this.executeSubAgentStep<P, P>(params, previousDecision!);
            case 'Actions':
                return await this.executeActionsStep(params, config, previousDecision);
            case 'Chat':
                return await this.executeChatStep(params, previousDecision);
            case 'Success':
                const pd = previousDecision as BaseAgentNextStep<P> & { previousPayload?: { taskComplete?: boolean } };
                if (pd.previousPayload?.taskComplete === true && previousDecision.terminate) {
                    // If task is complete and the parent agent previously requested to auto-terminate, after a successful
                    // sub-agent run, we can finalize the agent run                    
                    return { 
                        terminate: true,
                        step: 'Success', 
                        previousPayload: previousDecision.previousPayload,
                        newPayload: previousDecision.newPayload 
                    };
                }
                else {
                    // either task wasn't complete or was a sub-agent run in which case we ALWAYS process one more time
                    // with the parent prompt
                    return await this.executePromptStep(params, config, previousDecision);
                }
            case 'Failed':
                if (previousDecision.terminate) {
                    return { 
                        terminate: true,
                        step: 'Failed', 
                        previousPayload: previousDecision.previousPayload,
                        newPayload: previousDecision.newPayload
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
    private async executePromptStep<P = any>(
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
        };
        
        // Prepare prompt parameters
        const payload = previousDecision?.newPayload || params.payload;
        const stepEntity = await this.createStepEntity('Prompt', 'Execute Agent Prompt', params.contextUser, config.childPrompt?.ID, inputData, undefined, payload);
        
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
            
            // Set PayloadAtStart
            if (stepEntity && payload) {
                stepEntity.PayloadAtStart = JSON.stringify(payload);
            }
            
            let downstreamPayload = payload; // Start with current payload
            if (params.agent.PayloadSelfReadPaths) {
                const downstreamPaths = JSON.parse(params.agent.PayloadSelfReadPaths);
                // Extract only allowed downstream payload
                downstreamPayload = this._payloadManager.extractDownstreamPayload(
                    `Self: ${params.agent.Name}`,
                    payload, // our inbound payload before prompt
                    downstreamPaths
                );
            }
            // now prep the params using the downstream payload - which is often the full
            // payload but the above allows us to narrow the scope of what we send back to the
            // main prompt if desired in some prompting cases.
            const promptParams = await this.preparePromptParams(config, downstreamPayload, params);
            
            // Pass cancellation token and streaming callbacks to prompt execution
            promptParams.cancellationToken = params.cancellationToken;
            promptParams.onStreaming = params.onStreaming ? (chunk) => {
                // For streaming, we need to wrap it differently since chunk doesn't have metadata
                // The server resolver should get the agent run from the closure
                params.onStreaming!({
                    ...chunk,
                    stepType: 'prompt',
                    stepEntityId: stepEntity.ID
                });
            } : undefined;
            
            // Add callback to link PromptRun ID immediately when created
            promptParams.onPromptRunCreated = async (promptRunId: string) => {
                stepEntity.TargetLogID = promptRunId;
                await stepEntity.Save();
            };
            
            // Execute the prompt
            const promptResult = await this.executePrompt(promptParams);

            // Update step entity with AIPromptRun ID if available
            if (promptResult.promptRun?.ID) {
                stepEntity.TargetLogID = promptResult.promptRun.ID;
                stepEntity.PromptRun = promptResult.promptRun; // Store the prompt run object
                // don't save here, we save when we call finalizeStepEntity()
            }
            
            // Increment prompt iterations counter
            if (this._agentRun) {
                this._agentRun.TotalPromptIterations = (this._agentRun.TotalPromptIterations || 0) + 1;
                // We don't save here as the run will be saved later with all accumulated data
            }
            
            // Check for cancellation after prompt execution
            if (params.cancellationToken?.aborted) {
                await this.finalizeStepEntity(stepEntity, false, 'Cancelled during prompt execution');
                const cancelledResult = await this.createCancelledResult('Cancelled during prompt execution', params.contextUser);
                return { 
                    ...cancelledResult,
                    terminate: true, 
                    step: 'Failed', // Cancelled is treated as failed
                    previousPayload: cancelledResult.payload,
                    newPayload: cancelledResult.payload // No changes, just return the same payload   
                }
            }

            // Report decision processing progress
            params.onProgress?.({
                step: 'decision_processing',
                percentage: 70,
                message: this.formatHierarchicalMessage('Analyzing response and determining next steps'),
                displayMode: 'both' // Show in both live and historical modes
            });
            
            // Determine next step using agent type, this doesn't validate, just gets the LLM response and then we can process payload changes
            const initialNextStep = await this.determineNextStep<P>(params, config.agentType, promptResult, payload);
            
            // Apply payload changes if provided
            let finalPayload = payload; // Start with current payload
            let currentStepPayloadChangeResult = undefined;
            if (initialNextStep.payloadChangeRequest) {
                // Parse the allowed paths if configured
                const allowedPaths = params.agent.PayloadSelfWritePaths 
                    ? JSON.parse(params.agent.PayloadSelfWritePaths) 
                    : undefined;

                // Apply the changes to the payload with operation control
                const changeResult = this._payloadManager.applyAgentChangeRequest(
                    payload,
                    initialNextStep.payloadChangeRequest,
                    {
                        validateChanges: true,
                        logChanges: true,
                        agentName: params.agent.Name,
                        analyzeChanges: true,
                        generateDiff: true,
                        allowedPaths: allowedPaths,
                        verbose: params.verbose === true || IsVerboseLoggingEnabled()
                    }
                );
                
                if (changeResult.warnings.length > 0 && (params.verbose === true || IsVerboseLoggingEnabled())) {
                    LogStatus(`Payload warnings: ${changeResult.warnings.join('; ')}`);
                }
                
                // Store payload change metadata for audit trail
                // This will be merged into outputData later
                currentStepPayloadChangeResult = this.buildPayloadChangeResultSummary(changeResult);

                // Set the final payload - the changeResult already respects the allowed paths
                finalPayload = changeResult.result;
            }

            // now that we have processed the payload, we can process the next step which does validation and changes the next step if
            // validation fails
            const updatedNextStep = await this.processNextStep<P>(initialNextStep, params, config.agentType!, promptResult, finalPayload, stepEntity);

            // Prepare output data, these are simple elements of the state that are not typically
            // included in payload but are helpful. We do not include the prompt result here
            // or the payload as those are stored already(prompt result via TargetLogID -> AIPromptRunEntity)
            // and payload via the specialied PayloadAtStart/End fields on the step entity.
            const outputData = {
                nextStep: {
                    ...updatedNextStep,
                    reasoning: this.getNextStepReasoning(updatedNextStep),
                },
                // Include payload change metadata if changes were made
                ...(currentStepPayloadChangeResult && {
                    payloadChangeResult: currentStepPayloadChangeResult
                })
            };
            
            // Set PayloadAtEnd with the final payload after changes
            if (stepEntity && finalPayload) {
                stepEntity.PayloadAtEnd = JSON.stringify(finalPayload);
            }
            
            // Update the agent run's current payload
            if (this._agentRun && finalPayload) {
                this._agentRun.FinalPayloadObject = finalPayload;
            }
            
            // Update nextStep to include the final payload
            updatedNextStep.newPayload = finalPayload;
            updatedNextStep.previousPayload = payload;
            
            // Finalize step entity
            await this.finalizeStepEntity(stepEntity, promptResult.success, 
                promptResult.success ? undefined : promptResult.errorMessage, outputData);
            
            // Return based on next step
            if (updatedNextStep.step === 'Chat') {
                return { ...updatedNextStep, terminate: true };
            }
            else if (updatedNextStep.step === 'Success' || updatedNextStep.step === 'Failed') {
                return { ...updatedNextStep, terminate: true };
            } else {
                return { ...updatedNextStep, terminate: false };
            }
            
        } catch (error) {
            // in this case, we have a failed prompt execution. In this situation, let's make sure our payload at end isn't adjusted as
            // that affects downstream things in the agent run
            // if we got far enough along where PayloadAtEnd was set, honor that, otherwise use the previous decision's payload or params.payload
            const payload = stepEntity.PayloadAtEnd ? JSON.parse(stepEntity.PayloadAtEnd) : previousDecision?.newPayload || params.payload; 
            stepEntity.PayloadAtEnd = payload ? JSON.stringify(payload) : null;
            await this.finalizeStepEntity(stepEntity, false, error.message);

            // we had an error, don't throw the exception as that will kill our overall execution/run
            // instead retrun a helpful message in our return value that the parent loop can review and 
            // adjust
            const errString = error?.message || error || 'Unknown error';
            return {
                errorMessage: `Prompt execution failed: ${errString}`,
                step: 'Failed',
                terminate: false,
                previousPayload: payload,
                newPayload: payload
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
                agentName: params.agent.Name,
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
            agentName: params.agent.Name,
            subAgentName: subAgentRequest.name,
            message: subAgentRequest.message,
            terminateAfter: subAgentRequest.terminateAfter,
            conversationMessages: params.conversationMessages,
            parentAgentHierarchy: this._agentHierarchy
        };
        
        // Get sub-agent entity to access payload paths
        const subAgentEntity = AIEngine.Instance.Agents.find(a => a.Name === subAgentRequest.name &&
                                                            a.ParentID === params.agent.ID);
        if (!subAgentEntity) {
            throw new Error(`Sub-agent '${subAgentRequest.name}' not found`);
        }
        const stepEntity = await this.createStepEntity('Sub-Agent', `Execute Sub-Agent: ${subAgentRequest.name}`, params.contextUser, subAgentEntity.ID, inputData, undefined, previousDecision.newPayload);
        
        // Increment execution count for this sub-agent
        this.incrementExecutionCount(subAgentEntity.ID);
        
        try {
            // Parse payload access paths
            let downstreamPaths: string[] = ['*'];
            let upstreamPaths: string[] = ['*'];
            
            try {
                // Note: TypeScript errors on PayloadDownstreamPaths/PayloadUpstreamPaths are expected
                // until CodeGen runs after the migration to add these fields to AIAgentEntity
                if (subAgentEntity.PayloadDownstreamPaths) {
                    downstreamPaths = JSON.parse(subAgentEntity.PayloadDownstreamPaths);
                }
                if (subAgentEntity.PayloadUpstreamPaths) {
                    upstreamPaths = JSON.parse(subAgentEntity.PayloadUpstreamPaths);
                }
            } catch (parseError) {
                this.logError(`Failed to parse payload paths for sub-agent ${subAgentRequest.name}: ${parseError.message}`, {
                    category: 'SubAgentExecution',
                    metadata: {
                        agentName: params.agent.Name,
                        subAgentName: subAgentRequest.name,
                        subAgentId: subAgentEntity.ID,
                        downstreamPaths: subAgentEntity.PayloadDownstreamPaths,
                        upstreamPaths: subAgentEntity.PayloadUpstreamPaths
                    }
                });
            }
            
            // Extract only allowed downstream payload
            let downstreamPayload = this._payloadManager.extractDownstreamPayload(
                subAgentRequest.name,
                previousDecision.newPayload,
                downstreamPaths
            );
            
            // Apply payload scope if defined
            let scopedPayload = downstreamPayload;
            if (subAgentEntity.PayloadScope) {
                scopedPayload = this._payloadManager.applyPayloadScope(downstreamPayload, subAgentEntity.PayloadScope) as Partial<SR>;
                if (scopedPayload === null) {
                    // Critical failure - scope path doesn't exist in payload
                    const errorMessage = `Critical: Failed to extract payload scope '${subAgentEntity.PayloadScope}' for sub-agent '${subAgentRequest.name}'. The specified path does not exist in the payload.`;
                    this.logError(errorMessage, {
                        category: 'SubAgentExecution',
                        metadata: {
                            agentName: params.agent.Name,
                            subAgentName: subAgentRequest.name,
                            payloadScope: subAgentEntity.PayloadScope,
                            availableKeys: Object.keys(downstreamPayload || {})
                        }
                    });
                    throw new Error(errorMessage);
                }
            }
            
            stepEntity.PayloadAtStart = JSON.stringify(previousDecision.newPayload);

            // Execute sub-agent with scoped payload
            const subAgentResult = await this.ExecuteSubAgent<SC, SR>(
                params,
                subAgentRequest,
                subAgentEntity,
                stepEntity,
                scopedPayload as SR
            );
            
            let mergedPayload = previousDecision.newPayload; // Start with the original payload
            let currentStepPayloadChangeResult: PayloadChangeResultSummary | undefined = undefined;
            if (subAgentResult.success) {
                // Handle scope transformation for the result
                let resultPayloadForMerge = subAgentResult.payload;
                if (subAgentEntity.PayloadScope) {
                    // The sub-agent returned a scoped payload, we need to wrap it back
                    resultPayloadForMerge = this._payloadManager.reversePayloadScope(
                        subAgentResult.payload,
                        subAgentEntity.PayloadScope
                    );
                }
                
                // Merge upstream changes back into parent payload
                const mergeResult = this._payloadManager.mergeUpstreamPayload(
                    subAgentRequest.name,
                    previousDecision.newPayload,
                    resultPayloadForMerge,
                    upstreamPaths,
                    params.verbose === true || IsVerboseLoggingEnabled()
                );
                
                // update the merged payload with the result
                mergedPayload = mergeResult.result;                
                
                // Track the merge operation to detect what changed
                // We create a synthetic change request that represents the merge
                const mergeChangeRequest: AgentPayloadChangeRequest<any> = {
                    newElements: {},
                    updateElements: {},
                    removeElements: {}
                };
                
                // Identify what changed in the merge by comparing original and merged payloads
                const originalKeys = Object.keys(previousDecision.newPayload || {});
                const mergedKeys = Object.keys(mergedPayload || {});
                
                // Find updates and additions
                for (const key of mergedKeys) {
                    if (!(key in (previousDecision.newPayload || {}))) {
                        mergeChangeRequest.newElements![key] = mergedPayload[key];
                    } else if (!_.isEqual(previousDecision.newPayload[key], mergedPayload[key])) {
                        mergeChangeRequest.updateElements![key] = mergedPayload[key];
                    }
                }
                
                // Find removals
                for (const key of originalKeys) {
                    if (!(key in (mergedPayload || {}))) {
                        mergeChangeRequest.removeElements![key] = '_DELETE_';
                    }
                }
                
                // Analyze the merge if there were any changes
                if (Object.keys(mergeChangeRequest.newElements!).length > 0 || 
                    Object.keys(mergeChangeRequest.updateElements!).length > 0 || 
                    Object.keys(mergeChangeRequest.removeElements!).length > 0) {
                    
                    const mergeAnalysis = this._payloadManager.applyAgentChangeRequest<SR>(
                        previousDecision.previousPayload,
                        mergeChangeRequest as AgentPayloadChangeRequest<SR>,
                        {
                            validateChanges: false,
                            logChanges: true,
                            analyzeChanges: true,
                            generateDiff: true,
                            agentName: `${subAgentRequest.name} (upstream merge)`,
                            verbose: params.verbose === true || IsVerboseLoggingEnabled()
                        }
                    );
                    
                    // Store merge analysis with upstream violations
                    currentStepPayloadChangeResult = this.buildPayloadChangeResultSummary(mergeAnalysis);
                    
                    // Add upstream merge violations if any occurred
                    if (mergeResult.blockedOperations && mergeResult.blockedOperations.length > 0) {
                        if (!currentStepPayloadChangeResult.payloadValidation) {
                            currentStepPayloadChangeResult.payloadValidation = {};
                        }
                        currentStepPayloadChangeResult.payloadValidation.upstreamMergeViolations = {
                            subAgentName: subAgentRequest.name,
                            attemptedOperations: mergeResult.blockedOperations,
                            authorizedPaths: upstreamPaths,
                            timestamp: new Date().toISOString()
                        };
                    }
                    
                    if (mergeAnalysis.warnings.length > 0 && (params.verbose === true || IsVerboseLoggingEnabled())) {
                        LogStatus(`Sub-agent merge warnings: ${mergeAnalysis.warnings.join('; ')}`);
                    }
                }
            }
            else {
                // if we have a failed sub-agent run we do NOT update the payload!!!
                const msg = `Sub-agent '${subAgentRequest.name}' execution failed: ${subAgentResult.agentRun?.ErrorMessage || 'Unknown error'}`;
                LogError(msg);
                // merged payload is already set to the original payload so the rest of the below is okay
                stepEntity.Success = false; // we had a failure
                stepEntity.ErrorMessage = msg;
            }


            // Update step entity with AIAgentRun ID if available
            if (subAgentResult.agentRun?.ID) {
                stepEntity.TargetLogID = subAgentResult.agentRun.ID;
                // Set the SubAgentRun property for hierarchical tracking
                stepEntity.SubAgentRun = subAgentResult.agentRun;
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
                    // we have a link to the AIAgentRunEntity via the TargetLogID above
                    // but we throw in just a few things here for convenience/summary that are
                    // light - we don't want to store the payload again for example
                    // that is stored in PayloadAtEnd on the step and also in PayloadAtEnd in the sub-agent's run
                    success: subAgentResult.success,
                    finalStep: subAgentResult.agentRun?.FinalStep,
                    errorMessage: subAgentResult.agentRun?.ErrorMessage,
                    stepCount: subAgentResult.agentRun?.Steps?.length || 0,
                },
                shouldTerminate: shouldTerminate,
                nextStep: shouldTerminate ? 'success' : 'retry',
                // Include payload change metadata if changes were made during merge
                ...(currentStepPayloadChangeResult && {
                    payloadChangeResult: currentStepPayloadChangeResult
                })
            }; 

            // Finalize step entity
            await this.finalizeStepEntity(stepEntity, subAgentResult.success, 
                subAgentResult.agentRun?.ErrorMessage, outputData);
            
            // Build a clean summary of sub-agent result
            const subAgentSummary = {
                agentName: params.agent.Name,
                subAgentName: subAgentRequest.name,
                subAgentId: subAgentEntity.ID,
                success: subAgentResult.success,
                finalStep: subAgentResult.agentRun?.FinalStep,
                errorMessage: subAgentResult.agentRun?.ErrorMessage || null
                // do NOT include payload here as this goes to the LLM and
                // we don't need that there, too many tokens and LLM already gets
                // payload the normal way
            };
            
            // Add user message with the sub-agent results
            const resultMessage = subAgentResult.success
                ? `Sub-agent completed successfully:\n${JSON.stringify(subAgentSummary, null, 2)}`
                : `Sub-agent failed:\n${JSON.stringify(subAgentSummary, null, 2)}`;
                
            params.conversationMessages.push({
                role: 'user',
                content: resultMessage
            });
            
            // Set PayloadAtEnd with the merged payload
            if (stepEntity) {
                stepEntity.PayloadAtEnd = JSON.stringify(mergedPayload);
            }
            
            // Update the agent run's current payload with the merged result
            if (this._agentRun) {
                this._agentRun.FinalPayloadObject = mergedPayload;
            }
            
            return { 
                ...subAgentResult, 
                step: subAgentResult.success ? 'Success' : 'Failed', 
                terminate: shouldTerminate,
                previousPayload: previousDecision?.newPayload,
                newPayload: mergedPayload
            };            
        } catch (error) {
            // in this case, we have a failed sub-agent execution. In this situation, let's make sure our payload at end isn't adjusted as
            // that affects downstream things in the agent run
            // if we got far enough along where PayloadAtEnd was set, honor that, otherwise use the previous decision's payload or params.payload
            const payload = stepEntity.PayloadAtEnd ? JSON.parse(stepEntity.PayloadAtEnd) : previousDecision?.newPayload || params.payload;
            stepEntity.PayloadAtEnd = payload ? JSON.stringify(payload) : null;
            await this.finalizeStepEntity(stepEntity, false, error.message);

            // we had an error, don't throw the exception as that will kill our overall execution/run
            // instead retrun a helpful message in our return value that the parent loop can review and 
            // adjust
            return {
                errorMessage: `Sub-agent execution failed: ${(error as Error).message}`,
                step: 'Failed',
                terminate: false,
                previousPayload: payload,
                newPayload: payload
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
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep
    ): Promise<BaseAgentNextStep> {
        try {
            const currentPayload = previousDecision?.newPayload || previousDecision?.previousPayload || params.payload;
            const actions: AgentAction[] = previousDecision.actions || [];
            // Check for cancellation before starting
            if (params.cancellationToken?.aborted) {
                throw new Error('Cancelled before action execution');
            }

            // Report action execution progress with markdown formatting for parameters
            let progressMessage: string;
            if (actions.length === 1) {
                const aa = actions[0];
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
                progressMessage = `Executing ${actions.length} actions:`;
                actions.forEach(aa => {
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
            
            const actionEngine = ActionEngineServer.Instance;
            const agentActions = AIEngine.Instance.AgentActions.filter(aa => aa.AgentID === params.agent.ID);

            // Call agent type's pre-processing for actions
            try {
                const agentTypeInstance = await BaseAgentType.GetAgentTypeInstance(config.agentType);
                const currentPayload = previousDecision?.newPayload || previousDecision?.previousPayload || params.payload;
                
                // Pre-process actions - this may modify the actions array in place
                await agentTypeInstance.PreProcessActionStep(
                    actions,
                    currentPayload,
                    previousDecision
                );
            } catch (error) {
                LogError(`Error in PreProcessActionStep: ${error.message}`);
                // Continue with unmodified actions if pre-processing fails
            }

            // Track step numbers for parallel actions
            let numActionsProcessed = 0;
            const baseStepNumber = (this._agentRun!.Steps?.length || 0) + 1;

            // Execute all actions in parallel
            let lastStep: AIAgentRunStepEntityExtended | undefined = undefined;
            const actionPromises = actions.map(async (aa) => {
                // get all agent actions first for this agent
                const actionEntity = actionEngine.Actions.find(a => a.Name === aa.name && agentActions.some(aa => aa.ActionID === a.ID));
                if (!actionEntity) {
                    throw new Error(`Action "${aa.name}" Not Found for Agent "${params.agent.Name}"`);
                }

                const stepEntity = await this.createStepEntity('Actions', `Execute Action: ${aa.name}`, params.contextUser, actionEntity.ID, undefined, undefined, currentPayload, currentPayload);
                lastStep = stepEntity;
                // Override step number to ensure unique values for parallel actions
                stepEntity.StepNumber = baseStepNumber + numActionsProcessed++;
                
                // Increment execution count for this action
                this.incrementExecutionCount(actionEntity.ID);
                
                let actionResult: ActionResult;
                try {
                    // Execute the action
                    actionResult = await this.ExecuteSingleAction(params, aa, actionEntity, params.contextUser);
                    
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
                    
                    return { success: true, result: actionResult, action: aa, actionEntity, stepEntity };
                    
                } catch (error) {
                    await this.finalizeStepEntity(stepEntity, false, error.message);

                    return { success: false, result: actionResult, error: error.message, action: aa, actionEntity, stepEntity };
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
                    success: result.success,
                    params: result.result?.Params.filter(p => p.Type ==='Both' || p.Type ==='Output'), // only emit the output params which are type of output or both. This reduces tokens going back to LLM
                    resultCode: actionResult?.Result?.ResultCode || (result.success ? 'SUCCESS' : 'ERROR'),
                    message: result.success ? actionResult?.Message || 'Action completed' : result.error
                };
            });
            
            // Check if any actions failed
            const failedActions = actionSummaries.filter(a => !a.success);
            
            // Add user message with the results
            const resultsMessage = (failedActions.length > 0 ? `${failedActions.length} of ${actionSummaries.length} failed:` : `Action results:`) + `\n${JSON.stringify(actionSummaries, null, 2)}`;
                
            params.conversationMessages.push({
                role: 'user',
                content: resultsMessage
            });
            
            // Call agent type's post-processing for actions
            let finalPayload = currentPayload;
            
            try {
                const agentTypeInstance = await BaseAgentType.GetAgentTypeInstance(config.agentType);
                const actionResultsOnly = actionResults.map(r => r.result).filter(r => r !== undefined) as ActionResult[];
                
                const payloadChangeRequest = await agentTypeInstance.PostProcessActionStep(
                    actionResultsOnly,
                    actions,
                    currentPayload,
                    previousDecision
                );
                
                // If we got a payload change request, apply it
                if (payloadChangeRequest) {
                    const allowedPaths = params.agent.PayloadSelfWritePaths 
                        ? JSON.parse(params.agent.PayloadSelfWritePaths) 
                        : undefined;
                    
                    const changeResult = this._payloadManager.applyAgentChangeRequest(
                        currentPayload,
                        payloadChangeRequest,
                        {
                            validateChanges: true,
                            logChanges: true,
                            agentName: params.agent.Name,
                            analyzeChanges: true,
                            generateDiff: true,
                            allowedPaths: allowedPaths,
                            verbose: params.verbose === true || IsVerboseLoggingEnabled()
                        }
                    );
                    
                    finalPayload = changeResult.result;
                    if (lastStep) {
                        lastStep.PayloadAtEnd = JSON.stringify(finalPayload);
                        await lastStep.Save();
                    }
                    
                    if (changeResult.warnings.length > 0 && (params.verbose === true || IsVerboseLoggingEnabled())) {
                        LogStatus(`Action post-processing payload warnings: ${changeResult.warnings.join('; ')}`);
                    }
                }
            } catch (error) {
                LogError(`Error in PostProcessActionStep: ${error.message}`);
            }
            
            // After actions complete, we need to process the results
            // The retry step is used to re-execute the prompt with the action results
            // This allows the agent to analyze the results and determine what to do next
            return {
                terminate: false,
                step: 'Retry',
                previousPayload: previousDecision?.previousPayload || null,
                newPayload: finalPayload, // Use the final payload after any post-processing
                priorStepResult: actionSummaries,
                retryReason: failedActions.length > 0 
                    ? `Processing results with ${failedActions.length} failed action(s): ${failedActions.map(a => a.actionName).join(', ')}`
                    : `Analyzing results from ${actionSummaries.length} completed action(s) to formulate response`
            };
        }
        catch (e) {
            return {
                terminate: false,
                step: 'Retry',
                errorMessage: e && e.message ? e.message : e ? e : 'Unknown error executing actions',
                retryReason: 'Error while processing actions, retry',
                newPayload: previousDecision?.newPayload || null, // pass along from last step, no change
                previousPayload: previousDecision?.previousPayload || null, // pass along from last step, no change
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
        const stepEntity = await this.createStepEntity('Chat', 'User Interaction', params.contextUser);
        
        await this.finalizeStepEntity(stepEntity, false, 'Chat not implemented');
        
        return { 
            step: 'Chat',
            terminate: true,
            priorStepResult: previousDecision.message,
            reasoning: previousDecision.reasoning,
            confidence: previousDecision.confidence,
            previousPayload: previousDecision.previousPayload,
            newPayload: previousDecision.newPayload || previousDecision.previousPayload, // chat steps don't modify the payload
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
    private async finalizeAgentRun<P>(finalStep: BaseAgentNextStep, payload?: P, contextUser?: UserInfo): Promise<ExecuteAgentResult<P>> {
        if (this._agentRun) {
            this._agentRun.Status = 'Completed';
            this._agentRun.CompletedAt = new Date();
            this._agentRun.Success = finalStep.step === 'Success' || finalStep.step === 'Chat';
            this._agentRun.Result = payload ? JSON.stringify(payload) : null;
            this._agentRun.FinalStep = finalStep.step;
            this._agentRun.Message = finalStep.message;

            // Set the FinalPayloadObject - this will automatically stringify for the DB
            this._agentRun.FinalPayloadObject = payload;
            this._agentRun.FinalPayload = payload ? JSON.stringify(payload) : null;
            
            // Calculate total tokens from all prompts and sub-agents
            const tokenStats = this.calculateTokenStats();
            this._agentRun.TotalTokensUsed = tokenStats.totalTokens;
            this._agentRun.TotalPromptTokensUsed = tokenStats.promptTokens;
            this._agentRun.TotalCompletionTokensUsed = tokenStats.completionTokens;
            this._agentRun.TotalCost = tokenStats.totalCost;
            
            const ok = await this._agentRun.Save();
            if (!ok) {
                LogError(`Failed to finalize agent run ${this._agentRun.ID}`);
            }
        }
        
        return {
            success: finalStep.step === 'Success' || finalStep.step === 'Chat',
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
                    totalTokens += step.PromptRun.TokensUsedRollup || 0;
                    promptTokens += step.PromptRun.TokensPromptRollup || 0;  
                    completionTokens += step.PromptRun.TokensCompletionRollup || 0;
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

    /**
     * Gets the count of how many times a specific action has been executed in this agent run.
     * 
     * @param agentRunId - The agent run ID (not used anymore, kept for signature compatibility)
     * @param actionId - The action ID to count
     * @returns The number of times the action has been executed
     */
    protected async getActionExecutionCount(agentRunId: string, actionId: string): Promise<number> {
        return this.getExecutionCount(actionId);
    }

    /**
     * Gets the count of how many times a specific sub-agent has been executed in this agent run.
     * 
     * @param agentRunId - The agent run ID (not used anymore, kept for signature compatibility)
     * @param subAgentId - The sub-agent ID to count
     * @returns The number of times the sub-agent has been executed
     */
    protected async getSubAgentExecutionCount(agentRunId: string, subAgentId: string): Promise<number> {
        return this.getExecutionCount(subAgentId);
    }

    /**
     * Increments the execution count for an item (action or sub-agent).
     * 
     * @param itemId - The item ID to increment (action ID or sub-agent ID)
     * @private
     */
    private incrementExecutionCount(itemId: string): void {
        const currentCount = this._executionCounts.get(itemId) || 0;
        this._executionCounts.set(itemId, currentCount + 1);
    }

    /**
     * Gets the execution count for an item (action or sub-agent).
     * 
     * @param itemId - The item ID to get count for
     * @returns The execution count (0 if never executed)
     * @private
     */
    private getExecutionCount(itemId: string): number {
        return this._executionCounts.get(itemId) || 0;
    }

    /**
     * Checks if all minimum execution requirements are met for actions and sub-agents.
     * 
     * @param agent - The agent to check
     * @param agentRun - The current agent run
     * @returns Array of violation messages (empty if all requirements are met)
     */
    protected async checkMinimumExecutionRequirements(agent: AIAgentEntity, agentRun: AIAgentRunEntityExtended): Promise<string[]> {
        const violations: string[] = [];
        
        // Check action minimum requirements
        const agentActions = AIEngine.Instance.AgentActions.filter(aa => 
            aa.AgentID === agent.ID && 
            aa.Status === 'Active' && 
            aa.MinExecutionsPerRun != null && 
            aa.MinExecutionsPerRun > 0
        );
        
        for (const agentAction of agentActions) {
            const executionCount = await this.getActionExecutionCount(agentRun.ID, agentAction.ActionID);
            if (executionCount < agentAction.MinExecutionsPerRun) {
                violations.push(`Action '${agentAction.Action}' requires ${agentAction.MinExecutionsPerRun} execution(s) but was executed ${executionCount} time(s)`);
            }
        }
        
        // Check sub-agent minimum requirements
        const subAgents = AIEngine.Instance.GetSubAgents(agent.ID, "Active").filter(a => 
            a.MinExecutionsPerRun != null && 
            a.MinExecutionsPerRun > 0
        );

        for (const subAgent of subAgents) {
            const executionCount = await this.getSubAgentExecutionCount(agentRun.ID, subAgent.ID);
            if (executionCount < subAgent.MinExecutionsPerRun) {
                violations.push(`Sub-agent '${subAgent.Name}' requires ${subAgent.MinExecutionsPerRun} execution(s) but was executed ${executionCount} time(s)`);
            }
        }
        
        return violations;
    }
}

