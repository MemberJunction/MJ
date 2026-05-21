/**
 * @fileoverview Base implementation of the MemberJunction AI Agent framework.
 * 
 * This module provides the core BaseAgent class that handles agent execution
 * using a modular, hierarchical inheritance system. BaseAgent inherits from
 * BaseAgentActions, which links back to the underlying initialization, state,
 * prompt compilation, and core operations layers.
 * 
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 * @since 2.49.0
 */

import { 
    MJAIAgentTypeEntity,  
    MJTemplateParamEntity, 
    MJActionParamEntity, 
    MJAIAgentRelationshipEntity, 
    MJAIAgentNoteEntity, 
    MJAIAgentExampleEntity, 
    MJConversationDetailEntity, 
    MJAIAgentRequestEntity, 
    MJAIAgentRequestTypeEntity, 
    FileStorageEngineBase 
} from '@memberjunction/core-entities';
import { 
    MJAIAgentRunEntityExtended, 
    MJAIAgentRunStepEntityExtended, 
    MJAIPromptEntityExtended, 
    MJAIAgentEntityExtended 
} from "@memberjunction/ai-core-plus";
import { 
    UserInfo, 
    Metadata, 
    RunView, 
    LogStatus, 
    LogStatusEx, 
    LogError, 
    LogErrorEx, 
    IsVerboseLoggingEnabled, 
    IMetadataProvider 
} from '@memberjunction/core';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { ChatMessage, ChatMessageContent, ChatMessageContentBlock, AIErrorType } from '@memberjunction/ai';
import { BaseAgentType } from './agent-types/base-agent-type';
import { CopyScalarsAndArrays, JSONValidator, SafeExpressionEvaluator, UUIDsEqual } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import { AIAgentPermissionHelper } from '@memberjunction/ai-engine-base';
import { AgentContextInjector } from './agent-context-injector';
import { AgentPreExecutionRAG, AgentPreExecutionRAGResult } from './agent-pre-execution-rag';
import { RerankerService } from '@memberjunction/ai-reranker';
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
    BaseAgentNextStep,
    MessageLifecycleCallback,
    MessageLifecycleEvent,
    AgentChatMessage,
    AgentChatMessageMetadata,
    AIModelSelectionInfo,
    ConversationUtility,
    ActionChange,
    ActionChangeScope,
    MediaOutput,
    FileOutputRef,
    ParseFileOutputRef,
    SecondaryScopeConfig,
    SecondaryScopeValue,
    AgentResponseForm,
    AgentRequestAssignmentStrategy,
    parseAssignmentStrategy,
    mergeAssignmentStrategies,
    AgentClientToolInvocation,
    ClientToolResultSummary,
    ClientToolMetadata,
    InputArtifact
} from '@memberjunction/ai-core-plus';
import { MJActionEntityExtended, ActionResult, ActionParam, AIDirective } from '@memberjunction/actions-base';
import { AgentRunner } from './AgentRunner';
import { PayloadManager, PayloadManagerResult, PayloadChangeResultSummary } from './PayloadManager';
import { ScratchpadManager } from './ScratchpadManager';
import { ArtifactToolManager, ArtifactToolCall, StoredToolResult } from './ArtifactToolManager';
import { AgentPayloadChangeRequest } from '@memberjunction/ai-core-plus';
import { AgentDataPreloader } from './AgentDataPreloader';
import { ClientToolRequestManager } from './ClientToolRequestManager';
import { ConversationMessageResolver } from './utils/ConversationMessageResolver';
import { ForEachOperation, WhileOperation } from '@memberjunction/ai-core-plus';
import _ from 'lodash';

// Import our modular layers
import { BaseAgentActions } from './base-agent/baseAgentActions';

// Re-export the types from the state file to maintain full backward compatibility
export { 
    BaseIterationContext, 
    ExtendedProgressStep, 
    ActionResultSummary 
} from './base-agent/baseAgentState';

/**
 * Base implementation for AI Agents in the MemberJunction framework.
 * 
 * The BaseAgent class provides the high-level execution orchestration for AI agents.
 * It coordinates initialization, prompt compilation, execution loops, sub-agent invocation,
 * action invocation, and post-execution cleanup.
 * 
 * Refactored to inherit from BaseAgentActions and other modular parent layers to
 * support single-responsibility components and easier class overrides.
 * 
 * @class BaseAgent
 * @extends BaseAgentActions
 */
export class BaseAgent extends BaseAgentActions {

    /**
     * Engine-default wall-clock timeout applied to any agent run whose
     * `ExecuteAgentParams.maxExecutionTimeMs` is not set. Sub-classes can
     * override to globally change the default. Intentionally generous
     * (2 hours) — tighten per-run for interactive scenarios.
     * 
     * @protected
     * @returns {number} Default timeout in milliseconds (2 hours)
     */
    protected get DefaultAgentTimeoutMS(): number {
        return 2 * 60 * 60 * 1000;
    }

    /**
     * Executes an AI agent using hierarchical prompt composition.
     * 
     * This method orchestrates the entire agent execution process, from loading
     * configuration to executing prompts and determining next steps. It ensures
     * all required metadata is present and handles errors gracefully.
     * 
     * @param {ExecuteAgentParams} params - Parameters for agent execution
     * @param {MJAIAgentEntityExtended} params.agent - The agent entity to execute
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
        // Capture per-request provider for the duration of this execution so all entity
        // saves go through the isolated provider, never the global singleton's transaction.
        this._activeProvider = params.provider ?? Metadata.Provider;

        const agentTimeoutMS = params.maxExecutionTimeMs ?? this.DefaultAgentTimeoutMS;
        const upstreamToken = params.cancellationToken;
        const timeoutController = new AbortController();
        const relayUpstreamAbort = () => {
            if (!timeoutController.signal.aborted) {
                timeoutController.abort(upstreamToken?.reason ?? 'upstream cancellation');
            }
        };
        if (upstreamToken) {
            if (upstreamToken.aborted) {
                relayUpstreamAbort();
            } else {
                upstreamToken.addEventListener('abort', relayUpstreamAbort, { once: true });
            }
        }
        const timeoutId = setTimeout(() => {
            if (!timeoutController.signal.aborted) {
                timeoutController.abort(
                    `Agent '${params.agent.Name}' exceeded maxExecutionTimeMs (${agentTimeoutMS}ms)`
                );
            }
        }, agentTimeoutMS);
        params.cancellationToken = timeoutController.signal;

        try {
            this.logStatus(`🤖 Starting execution of agent '${params.agent.Name}'`, true, params);

            // Wrap the progress callback to capture all events
            const wrappedParams = {
                ...params,
                onProgress: this.wrapProgressCallback(params.onProgress)
            };

            // Convert UI markup in conversation messages to plain text if requested (default: true)
            if (params.convertUIMarkupToPlainText !== false) {
                this.convertUIMarkupInMessages(wrappedParams.conversationMessages);
            }

            // Reset scratchpad and artifact tools for each new execution (ephemeral per run)
            this._scratchpadManager.Clear();
            this._artifactToolManager.Clear();

            // Initialize artifact tools with any input artifacts attached to the run.
            if (params.inputArtifacts && params.inputArtifacts.length > 0) {
                this._artifactToolManager.Initialize(params.inputArtifacts);
            }

            // Run Phase 1 & Phase 2 in parallel.
            const validationPromise = AIAgentPermissionHelper.HasPermission(params.agent.ID, params.contextUser, 'run');
            const enginesPromise = this.initializeEngines(params.contextUser);
            const initRunPromise = this.initializeAgentRun(wrappedParams);

            await Promise.all([validationPromise, enginesPromise, initRunPromise]);

            // Ensure permissions checks passed
            const canRun = await validationPromise;
            if (!canRun) {
                const errorMessage = `User ${params.contextUser?.Email || 'Unknown'} does not have permission to run agent '${params.agent.Name}' (ID: ${params.agent.ID})`;
                this.logStatus(`🚫 ${errorMessage}`, false, params);
                if (this._agentRun) {
                    this._agentRun.Status = 'Failed';
                    this._agentRun.ErrorMessage = errorMessage;
                    await this._agentRun.Save();
                }
                throw new Error(errorMessage);
            }

            // Phase 2 Initialization (Parallel execution of data preload, config load, context memory and RAG)
            const configPromise = this.loadAgentConfiguration(params.agent);
            const preloadPromise = this.preloadAgentData(wrappedParams);

            // Run notes injection and pre-execution RAG in parallel
            let lastUserMsg = '';
            if (wrappedParams.conversationMessages && wrappedParams.conversationMessages.length > 0) {
                const lastMsgObj = wrappedParams.conversationMessages[wrappedParams.conversationMessages.length - 1];
                if (typeof lastMsgObj.content === 'string') {
                    lastUserMsg = lastMsgObj.content;
                } else if (Array.isArray(lastMsgObj.content)) {
                    const textBlock = lastMsgObj.content.find(b => b.type === 'text');
                    if (textBlock && typeof textBlock.content === 'string') {
                        lastUserMsg = textBlock.content;
                    }
                }
            }

            // Context memory injection and RAG checks
            const primaryScopeConfig = this.parseSecondaryScopeConfig(params.agent);
            const primaryScopeEntityId = this._agentRun?.PrimaryScopeEntityID || undefined;
            const primaryScopeRecordId = this._agentRun?.PrimaryScopeRecordID || undefined;
            const secondaryScopes = params.SecondaryScopes;

            const injectMemoryPromise = this.InjectContextMemory(
                lastUserMsg,
                params.agent,
                params.userId,
                params.companyId,
                params.contextUser,
                wrappedParams.conversationMessages,
                primaryScopeEntityId,
                primaryScopeRecordId,
                secondaryScopes,
                primaryScopeConfig
            );

            // Copy messages before mutation so template variables like `recentMessages` see the unmutated history
            const originalMessagesCopy = wrappedParams.conversationMessages ? [...wrappedParams.conversationMessages] : undefined;

            const injectRAGPromise = this.InjectPreExecutionRAG(
                lastUserMsg,
                params.agent,
                params.contextUser,
                wrappedParams.conversationMessages,
                originalMessagesCopy,
                primaryScopeEntityId,
                primaryScopeRecordId,
                secondaryScopes,
                params.payload
            );

            await Promise.all([configPromise, preloadPromise, injectMemoryPromise, injectRAGPromise]);

            const config = await configPromise;

            // Handle early validation failure
            const earlyValidationResult = await this.validateAgentWithTracking(params.agent, params.contextUser);
            if (earlyValidationResult) {
                return earlyValidationResult as ExecuteAgentResult<R>;
            }

            // Phase 3 Initialization
            await this.initializeAgentType(wrappedParams, config);

            // Perform post-initialization starting payload modifications
            await this.initializeStartingPayload(wrappedParams);

            // Validate starting payload format
            const startingPayloadValidationResult = await this.handleStartingPayloadValidation(wrappedParams);
            if (startingPayloadValidationResult) {
                return startingPayloadValidationResult as ExecuteAgentResult<R>;
            }

            // Run execution loop
            const executionResult = await this.executeAgentInternal<R>(wrappedParams, config);

            // Finalize execution
            return await this.finalizeAgentRun<R>(executionResult.finalStep, executionResult.finalStep.newPayload || executionResult.finalStep.previousPayload || params.payload, params.contextUser);

        } catch (error) {
            clearTimeout(timeoutId);
            const isCancellation = error instanceof Error && (error.message.includes('Cancelled') || error.message.includes('exceeded maxExecutionTimeMs'));
            const errorMessage = error instanceof Error ? error.message : String(error);

            if (isCancellation) {
                this.logStatus(`⏹️ Agent execution cancelled: ${errorMessage}`, false, params);
                return await this.createCancelledResult(errorMessage, params.contextUser) as ExecuteAgentResult<R>;
            } else {
                this.logError(`Agent execution failed with error: ${errorMessage}`, {
                    agent: params.agent,
                    category: 'AgentExecution',
                    metadata: { error }
                });
                return await this.createFailureResult(errorMessage, params.contextUser) as ExecuteAgentResult<R>;
            }
        } finally {
            clearTimeout(timeoutId);
            if (upstreamToken) {
                upstreamToken.removeEventListener('abort', relayUpstreamAbort);
            }
        }
    }

    /**
     * Sub-classes can override this method to perform specialized starting payload
     * initialization. By default, it does nothing.
     * 
     * @param {ExecuteAgentParams} params - The execution parameters
     * @protected
     */
    protected async initializeStartingPayload<P = any>(params: ExecuteAgentParams<any, P>): Promise<void> {
        // Base class does nothing; intended for subclass overrides.
    }

    /**
     * Runs the internal sequential execution loop for the agent.
     * 
     * Coordinates prompt execution, message compaction, step tracking, execution
     * retry limits, and safety termination conditions.
     * 
     * @param {ExecuteAgentParams} params - The execution parameters
     * @param {AgentConfiguration} config - The agent configuration
     * @returns {Promise<{finalStep: BaseAgentNextStep<P>, stepCount: number}>} The terminal step result and count
     * @protected
     */
    protected async executeAgentInternal<P = any>(
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<{finalStep: BaseAgentNextStep<P>, stepCount: number}> {
        let continueExecution = true;
        let currentNextStep: BaseAgentNextStep<P> | null = null;
        let stepCount = 0;
        let consecutiveFailedSteps = 0;

        while (continueExecution) {
            if (params.cancellationToken?.aborted) {
                throw new Error('Cancelled during execution');
            }

            await this.pruneAndCompactExpiredMessages(params, this._promptTurnCount);

            this.logStatus(`🔄 Executing step ${stepCount + 1} for agent '${params.agent.Name}'`, true, params);
            const nextStep = await this.executeNextStep<P>(params, config, currentNextStep, stepCount);
            stepCount++;

            if (nextStep.promoteMediaOutputs && nextStep.promoteMediaOutputs.length > 0) {
                this.promoteMediaOutputs(nextStep.promoteMediaOutputs);
            }

            if (nextStep.step === 'Failed' && !nextStep.terminate) {
                consecutiveFailedSteps++;
                if (consecutiveFailedSteps >= BaseAgent.MAX_CONSECUTIVE_FAILED_STEPS) {
                    this.logError(
                        `⛔ Agent '${params.agent.Name}' reached maximum consecutive failed steps ` +
                        `(${BaseAgent.MAX_CONSECUTIVE_FAILED_STEPS}). Forcing termination to prevent infinite loop.`,
                        {
                            agent: params.agent,
                            category: 'ExecutionSafetyNet',
                            metadata: {
                                consecutiveFailures: consecutiveFailedSteps,
                                lastError: nextStep.errorMessage
                            }
                        }
                    );
                    nextStep.terminate = true;
                    nextStep.errorMessage = `Agent terminated after ${consecutiveFailedSteps} consecutive failed steps. ` +
                        `Last error: ${nextStep.errorMessage || 'Unknown'}`;
                }
            } else if (nextStep.step !== 'Failed') {
                consecutiveFailedSteps = 0;
            }

            if (nextStep.terminate) {
                continueExecution = false;
                this.logStatus(`🏁 Agent '${params.agent.Name}' terminating after ${stepCount} steps with result: ${nextStep.step}`, true, params);
            } else {
                currentNextStep = nextStep;
                if (!currentNextStep.newPayload && currentNextStep.previousPayload) {
                    currentNextStep.newPayload = currentNextStep.previousPayload;
                }
                this.logStatus(`➡️ Agent '${params.agent.Name}' continuing to next step: ${nextStep.step}`, true, params);
            }

            currentNextStep = nextStep;
            if (!currentNextStep.newPayload && currentNextStep.previousPayload) {
                currentNextStep.newPayload = currentNextStep.previousPayload;
            }
        }

        return { finalStep: currentNextStep, stepCount };
    }

    /**
     * Determine note scope label for memory attribution.
     * 
     * @param {MJAIAgentNoteEntity} note - The note entity
     * @returns {string} The scope description string
     * @private
     */
    private determineNoteScope(note: MJAIAgentNoteEntity): string {
        const hasAgent = note.AgentID !== null;
        const hasUser = note.UserID !== null;
        const hasCompany = note.CompanyID !== null;
        const hasPrimaryScope = note.PrimaryScopeEntityID !== null || note.PrimaryScopeRecordID !== null;

        if (!hasAgent && !hasUser && !hasCompany && !hasPrimaryScope) {
            return 'global';
        }
        if (hasAgent && !hasUser && !hasCompany) {
            return 'agent-only';
        }
        if (!hasAgent && hasUser && !hasCompany) {
            return 'user-only';
        }
        if (!hasAgent && !hasUser && hasCompany) {
            return 'company-only';
        }
        if (hasPrimaryScope && !hasUser) {
            return 'company';
        }
        if (hasPrimaryScope && hasUser) {
            return 'user';
        }
        return 'combined';
    }

    /**
     * Injects matching agent notes and examples into system context memory.
     * Injected messages are prepended to the user's conversation messages.
     * 
     * @protected
     */
    protected async InjectContextMemory(
        input: string,
        agent: MJAIAgentEntityExtended,
        userId?: string,
        companyId?: string,
        contextUser?: UserInfo,
        conversationMessages?: ChatMessage[],
        primaryScopeEntityId?: string,
        primaryScopeRecordId?: string,
        secondaryScopes?: Record<string, SecondaryScopeValue>,
        secondaryScopeConfig?: SecondaryScopeConfig | null
    ): Promise<{ notes: MJAIAgentNoteEntity[]; examples: MJAIAgentExampleEntity[] }> {
        if (!agent.InjectNotes && !agent.InjectExamples) {
            return { notes: [], examples: [] };
        }

        const injector = new AgentContextInjector();
        const rerankerConfigJson = agent.RerankerConfiguration;
        const rerankerConfig = RerankerService.Instance.parseConfiguration(rerankerConfigJson);

        const notes = agent.InjectNotes
            ? await injector.GetNotesForContext({
                agentId: agent.ID,
                userId,
                companyId,
                currentInput: input,
                strategy: agent.NoteInjectionStrategy as 'Relevant' | 'Recent' | 'All',
                maxNotes: agent.MaxNotesToInject || 5,
                contextUser: contextUser!,
                rerankerConfig,
                primaryScopeEntityId,
                primaryScopeRecordId,
                secondaryScopes,
                secondaryScopeConfig,
                observability: this._agentRun ? {
                    agentRunID: this._agentRun.ID,
                    stepNumber: (this._agentRun.Steps?.length || 0) + 1
                } : undefined
            })
            : [];
        this.logStatus(`BaseAgent: Got ${notes.length} notes from injector`, true);

        const examples = agent.InjectExamples
            ? await injector.GetExamplesForContext({
                agentId: agent.ID,
                userId,
                companyId,
                currentInput: input,
                strategy: agent.ExampleInjectionStrategy as 'Semantic' | 'Recent' | 'Rated',
                maxExamples: agent.MaxExamplesToInject || 3,
                contextUser: contextUser!,
                primaryScopeEntityId,
                primaryScopeRecordId,
                secondaryScopes,
                secondaryScopeConfig
            })
            : [];

        if ((notes.length > 0 || examples.length > 0) && conversationMessages) {
            const notesText = injector.FormatNotesForInjection(notes);
            const examplesText = injector.FormatExamplesForInjection(examples);

            this._memoryContext = '';
            if (notesText) this._memoryContext += notesText + '\n\n';
            if (examplesText) this._memoryContext += examplesText + '\n\n';

            conversationMessages.unshift({
                role: 'system',
                content: this._memoryContext
            });

            this.logStatus(
                `💾 Injected ${notes.length} notes and ${examples.length} examples into conversation context`,
                true
            );
        }

        this._injectedMemory = { notes, examples };
        return { notes, examples };
    }

    /**
     * Executes Phase 1C pre-execution RAG search scopes retrieval and fuses the results.
     * Injects fused context system message if any search scopes return values.
     * 
     * @protected
     */
    protected async InjectPreExecutionRAG(
        lastUserMessage: string,
        agent: MJAIAgentEntityExtended,
        contextUser: UserInfo | undefined,
        conversationMessages: ChatMessage[] | undefined,
        originalMessages: ChatMessage[] | undefined,
        primaryScopeEntityId?: string,
        primaryScopeRecordId?: string,
        secondaryScopes?: Record<string, SecondaryScopeValue>,
        payload?: unknown
    ): Promise<AgentPreExecutionRAGResult | null> {
        try {
            if (!contextUser) return null;
            if (!agent?.ID) return null;

            const rag = new AgentPreExecutionRAG();
            const result = await rag.Execute({
                agent,
                lastUserMessage,
                recentMessages: originalMessages ? originalMessages.slice(-5) : undefined,
                payload,
                primaryScopeRecordId,
                primaryScopeEntityId,
                secondaryScopes,
                contextUser
            });

            if (!result) return null;

            if (conversationMessages && result.formattedSystemMessage) {
                this._ragContext = result.formattedSystemMessage;
                conversationMessages.unshift({ role: 'system', content: this._ragContext });
                this.logStatus(
                    `🔎 Injected pre-execution RAG context: ${result.combinedResults.length} result(s) from ${result.queriedScopeIDs.length} scope(s)`,
                    true
                );
            }

            this._injectedRAG = result;
            return result;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logError(`InjectPreExecutionRAG failed — continuing without RAG context: ${msg}`, {
                agent,
                category: 'AgentPreExecutionRAG'
            });
            return null;
        }
    }

    /**
     * Converts UI markup elements (@{mention...}) in-place inside user conversation messages.
     * 
     * @protected
     * @param {ChatMessage[]} messages - Chat message array
     */
    protected convertUIMarkupInMessages(messages: ChatMessage[]): void {
        if (!messages || messages.length === 0) {
            return;
        }

        for (const message of messages) {
            if (message.role !== 'user') {
                continue;
            }

            if (typeof message.content === 'string') {
                message.content = ConversationUtility.ToPlainText(message.content);
            }
            else if (Array.isArray(message.content)) {
                for (const block of message.content) {
                    if (block.type === 'text' && typeof block.content === 'string') {
                        block.content = ConversationUtility.ToPlainText(block.content);
                    }
                }
            }
        }
    }

    /**
     * Validates that there are no circular references in the run chaining.
     * 
     * @param {string} lastRunId - The last run ID to check
     * @param {UserInfo} [contextUser] - Optional user context
     * @private
     */
    private async validateRunChain(lastRunId: string, contextUser?: UserInfo): Promise<void> {
        const visitedRunIds = new Set<string>();
        visitedRunIds.add(this._agentRun!.ID);
        
        let currentRunId = lastRunId;
        const maxChainLength = 1000;
        let chainLength = 0;
        
        while (currentRunId) {
            if (visitedRunIds.has(currentRunId)) {
                throw new Error(`Circular reference detected in run chain. Run ID '${currentRunId}' creates a loop.`);
            }
            
            if (++chainLength > maxChainLength) {
                throw new Error(`Run chain exceeds maximum length of ${maxChainLength}. This may indicate a data issue.`);
            }
            
            visitedRunIds.add(currentRunId);
            
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: `ID='${currentRunId}'`,
                ResultType: 'simple'
            }, contextUser);
            
            if (!result.Success || result.Results.length === 0) {
                break;
            }
            
            currentRunId = result.Results[0].LastRunID;
        }
    }

    /**
     * Validates that the next step proposed by the agent type is valid for this agent.
     * Handles routing to sub-agent validation, action validation, chat validation, etc.
     * 
     * @protected
     */
    protected async validateNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
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
            case 'ForEach':
            case 'While':
            case 'ClientTools' as typeof nextStep.step:
                return nextStep;
            default:
                this.logError(`Invalid next step '${nextStep.step}' for agent '${params.agent.Name}'`, {
                    agent: params.agent,
                    category: 'NextStepValidation'
                });
                return {
                    step: 'Failed',
                    terminate: true,
                    errorMessage: `Invalid next step '${nextStep.step}'`
                };
        }
    }

    /**
     * Validates sub-agent invocation step (existence, limits, and state checks).
     * 
     * @protected
     */
    protected async validateSubAgentNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        const name = nextStep.subAgent?.name;
        const curAgentSubAgents = AIEngine.Instance.GetSubAgents(params.agent.ID, 'Active');
        const subAgent = curAgentSubAgents.find(a => a.Name.trim().toLowerCase() === name?.trim().toLowerCase());
        
        if (!name || !subAgent) {
            this.logError(`Sub-agent '${name}' not found or not active for agent '${params.agent.Name}'`, {
                agent: params.agent,
                category: 'SubAgentExecution'
            });
            if (nextStep.step !== 'Retry') {
                this._generalValidationRetryCount++;
            }
            return {
                step: 'Retry',
                terminate: false,
                errorMessage: `Sub-agent '${name}' not found or not active`
            };
        }

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

        return nextStep;
    }

    /**
     * Validates action invocation step (existence, fuzzy matches, and limits checks).
     * 
     * @protected
     */
    protected async validateActionsNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        const effectiveActions = this.getEffectiveActionsForValidation(params.agent.ID);
        const dbAgentActions = AIEngine.Instance.AgentActions.filter(
            aa => UUIDsEqual(aa.AgentID, params.agent.ID) && aa.Status === 'Active'
        );

        const missingActions = nextStep.actions?.filter(action => {
            const actionName = action.name.trim().toLowerCase();
            const exactMatch = effectiveActions.find(a =>
                a.Name.trim().toLowerCase() === actionName
            );
            if (exactMatch) return false;

            const containsMatches = effectiveActions.filter(a =>
                a.Name.trim().toLowerCase().includes(actionName)
            );

            if (containsMatches.length === 1) {
                const correctedName = containsMatches[0].Name;
                this.logStatus(`Action name fuzzy matched: '${action.name}' → '${correctedName}'`, true, params);
                action.name = correctedName;
                return false;
            }

            if (containsMatches.length > 1) {
                this.logStatus(`Ambiguous action name '${action.name}' matches ${containsMatches.length} actions: ${containsMatches.map(a => a.Name).join(', ')}`, true, params);
            }
            return true;
        });

        if (missingActions && missingActions.length > 0) {
            const missingActionNames = missingActions.map(a => a.name).join(', ');
            const availableActionNames = effectiveActions.map(a => a.Name).join(', ');
            this.logError(`Actions '${missingActionNames}' not found or not active for agent '${params.agent.Name}'. Available actions: ${availableActionNames}`, {
                agent: params.agent,
                category: 'ActionExecution'
            });
            if (nextStep.step !== 'Retry') {
                this._generalValidationRetryCount++;
            }
            return {
                step: 'Retry',
                terminate: false,
                errorMessage: `Actions '${missingActionNames}' not found or not active. Available: ${availableActionNames}`
            };
        }

        if (nextStep.actions) {
            const violatedActions: string[] = [];

            for (const action of nextStep.actions) {
                const actionEntity = effectiveActions.find(a =>
                    a.Name.trim().toLowerCase() === action.name.trim().toLowerCase()
                );

                if (!actionEntity) continue;

                const dbAgentAction = dbAgentActions.find(aa => UUIDsEqual(aa.ActionID, actionEntity.ID));
                let maxExecutions: number | null = null;

                if (dbAgentAction?.MaxExecutionsPerRun != null) {
                    maxExecutions = dbAgentAction.MaxExecutionsPerRun;
                } else if (this._dynamicActionLimits[actionEntity.ID] != null) {
                    maxExecutions = this._dynamicActionLimits[actionEntity.ID];
                }

                if (maxExecutions != null) {
                    const executionCount = await this.getActionExecutionCount(agentRun.ID, actionEntity.ID);
                    if (executionCount >= maxExecutions) {
                        violatedActions.push(`${action.name} (limit: ${maxExecutions}, current: ${executionCount})`);
                    }
                }
            }

            if (violatedActions.length > 0) {
                const violationMessage = `Actions have reached execution limits: ${violatedActions.join(', ')}`;
                this.logError(violationMessage, {
                    agent: params.agent,
                    category: 'ActionExecution',
                    metadata: { violatedActions }
                });
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

        return nextStep;
    }

    /**
     * Returns the array of active actions available for the agent to validate.
     * 
     * @param {string} agentId - The agent ID
     * @returns {MJActionEntityExtended[]} Array of actions
     * @protected
     */
    protected getEffectiveActionsForValidation(agentId: string): MJActionEntityExtended[] {
        if (this._effectiveActions.length > 0) {
            return this._effectiveActions;
        }

        const agentActions = AIEngine.Instance.AgentActions.filter(
            aa => UUIDsEqual(aa.AgentID, agentId) && aa.Status === 'Active'
        );
        return ActionEngineServer.Instance.Actions.filter(a =>
            agentActions.some(aa => UUIDsEqual(aa.ActionID, a.ID)) && a.Status === 'Active'
        );
    }

    /**
     * Validates details after a successful step.
     * Checks minimum requirements and performs FinalPayloadValidation if configured.
     * 
     * @protected
     */
    protected async validateSuccessNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        const minViolations = await this.checkMinimumExecutionRequirements(params.agent, agentRun);
        if (minViolations.length > 0) {
            const violationMessage = `Minimum execution requirements not met:\n${minViolations.join('\n')}`;
            this.logError(violationMessage, {
                agent: params.agent,
                category: 'MinimumExecutionValidation'
            });
            if (nextStep.step !== 'Retry') {
                this._generalValidationRetryCount++;
            }
            return {
                step: 'Retry',
                terminate: false,
                errorMessage: violationMessage
            };
        }

        const agent = params.agent;
        if (!agent.FinalPayloadValidation || !currentPayload) {
            return nextStep;
        }

        try {
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
                return nextStep;
            }

            let payloadToValidate = currentPayload;
            if (agent.PayloadScope) {
                payloadToValidate = this._payloadManager.applyPayloadScope(currentPayload, agent.PayloadScope) as P;
                if (payloadToValidate === null) {
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

            const jsonValidator = new JSONValidator();
            const validationResult = jsonValidator.validate(payloadToValidate, validationSchema);

            if (!validationResult.Success) {
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

            this.logStatus(`✅ Final payload validation passed for agent ${agent.Name}`, true, params);
            
            try {
                currentStep.FinalPayloadValidationResult = 'Pass';
                currentStep.FinalPayloadValidationMessages = null;
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
            return nextStep;
        }
    }

    /**
     * Action to perform when FinalPayloadValidation fails. Remaps to Retry, Fail or Warn.
     * 
     * @protected
     */
    protected async handleFinalPayloadValidationFailure<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        mode: string,
        errorMessages: string[],
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        const validationFeedback = `Final payload validation failed:\n${errorMessages.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;

        try {
            currentStep.FinalPayloadValidationMessages = errorMessages.join('; ');
            
            switch (mode) {
                case 'Retry':
                    this._validationRetryCount++;
                    const maxRetries = params.agent.FinalPayloadValidationMaxRetries || 3;
                    if (this._validationRetryCount >= maxRetries) {
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
                    currentStep.FinalPayloadValidationResult = 'Fail';
                    await currentStep.Save();
                    return {
                        ...nextStep,
                        step: 'Failed',
                        message: validationFeedback,
                        terminate: true
                    };

                case 'Warn':
                    this.logStatus(`⚠️ WARNING: ${validationFeedback}`, false, params);
                    currentStep.FinalPayloadValidationResult = 'Warn';
                    await currentStep.Save();
                    return nextStep;

                default:
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
            return mode === 'Warn' ? nextStep : {
                ...nextStep,
                step: mode === 'Fail' ? 'Failed' : 'Retry',
                message: validationFeedback,
                terminate: mode === 'Fail'
            };
        }
    }

    /**
     * Validates Failed next step. Intended for subclass overrides.
     * 
     * @protected
     */
    protected async validateFailedNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return nextStep;
    }

    /**
     * Validates Retry next step. Intended for subclass overrides.
     * 
     * @protected
     */
    protected async validateRetryNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return nextStep;
    }

    /**
     * Validates Chat next step. Re-maps the Chat step if ChatHandlingOption is set.
     * 
     * @protected
     */
    protected async validateChatNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        const chatHandlingOption = params.agent.ChatHandlingOption;
        
        if (chatHandlingOption) {
            let mappedStep: 'Success' | 'Failed' | 'Retry';
            
            switch (chatHandlingOption) {
                case 'Success':
                    mappedStep = 'Success';
                    break;
                case 'Failed':
                    mappedStep = 'Failed';
                    break;
                case 'Retry':
                    mappedStep = 'Retry';
                    break;
                default:
                    LogError(`Invalid ChatHandlingOption value: ${chatHandlingOption}. Expected 'Success', 'Failed', or 'Retry'. Treating as null and allowing Chat to propagate.`);
                    return nextStep;
            }
            
            const remappedStep: BaseAgentNextStep<P> = {
                ...nextStep,
                step: mappedStep
            };
            
            if (params.verbose === true || IsVerboseLoggingEnabled()) {
                LogStatus(`Remapping Chat step to ${chatHandlingOption} based on agent's ChatHandlingOption`);
            }
            
            return await this.validateNextStep(params, remappedStep, currentPayload, agentRun, currentStep);
        }
        
        return nextStep;
    }

    /**
     * Checks cost, token, time, and iteration limits and converts nextStep to Failed if exceeded.
     * 
     * @protected
     */
    protected async checkExecutionGuardrails<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        if (nextStep.step === 'Success' || nextStep.step === 'Failed' || nextStep.step === 'Chat') {
            return nextStep;
        }

        const guardrailResult = await this.hasExceededAgentRunGuardrails(params, agentRun);
        
        if (guardrailResult.exceeded) {
            this.logStatus(`⛔ Execution guardrail exceeded: ${guardrailResult.reason}`, false, params);
            
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
            
            return {
                ...nextStep,
                step: 'Failed',
                terminate: true,
                message: guardrailResult.reason!,
                errorMessage: guardrailResult.reason
            };
        }
        
        return nextStep;
    }

    /**
     * Checks if cost, token, time, iteration, or validation retry safety parameters are violated.
     * 
     * @protected
     */
    protected async hasExceededAgentRunGuardrails(
        params: ExecuteAgentParams,
        agentRun: MJAIAgentRunEntityExtended
    ): Promise<{
        exceeded: boolean;
        type?: 'cost' | 'tokens' | 'iterations' | 'time';
        limit?: number;
        current?: number;
        reason?: string;
    }> {
        const agent = params.agent;
        const DEFAULT_ABSOLUTE_MAX_ITERATIONS = 5000;
        const absoluteMaxIterations = params.absoluteMaxIterations ?? DEFAULT_ABSOLUTE_MAX_ITERATIONS;

        if (agentRun.TotalPromptIterations && agentRun.TotalPromptIterations >= absoluteMaxIterations) {
            return {
                exceeded: true,
                type: 'iterations',
                limit: absoluteMaxIterations,
                current: agentRun.TotalPromptIterations,
                reason: `Absolute maximum iteration safety limit of ${absoluteMaxIterations} exceeded. Current iterations: ${agentRun.TotalPromptIterations}. This is a system-wide safety measure to prevent infinite loops.`
            };
        }

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
        
        if (this._generalValidationRetryCount >= BaseAgent.MAX_VALIDATION_RETRIES) {
            return {
                exceeded: true,
                type: 'iterations',
                limit: BaseAgent.MAX_VALIDATION_RETRIES,
                current: this._generalValidationRetryCount,
                reason: `Maximum validation retries of ${BaseAgent.MAX_VALIDATION_RETRIES} exceeded. The agent is unable to produce valid output after ${this._generalValidationRetryCount} validation failures.`
            };
        }
        
        return { exceeded: false };
    }

    /**
     * Initializes the MJAIAgentRunEntity. Sets up starting payload and scope details.
     * 
     * @param {ExecuteAgentParams} params - The execution parameters
     * @private
     */
    private async initializeAgentRun(params: ExecuteAgentParams): Promise<void> {
        let modifiedParams = params;
        if (params.lastRunId && params.autoPopulateLastRunPayload) {
            const rv = new RunView();
            const lastRunResult = await rv.RunView({
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: `ID='${params.lastRunId}'`,
                ResultType: 'simple'
            }, params.contextUser);
            
            if (lastRunResult.Success && lastRunResult.Results.length > 0) {
                const lastRun = lastRunResult.Results[0];
                if (lastRun.FinalPayload) {
                    try {
                        const lastPayload = JSON.parse(lastRun.FinalPayload);
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
        
        this._promptTurnCount = 0;

        this._agentRun = await (params.provider || this._activeProvider).GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', params.contextUser);
        this._agentRun.AgentID = params.agent.ID;
        if (params.conversationDetailId) {
            this._agentRun.ConversationDetailID = params.conversationDetailId;
        }
        if (params.data?.conversationId) {
            this._agentRun.ConversationID = params.data.conversationId;
        }
        this._agentRun.Status = 'Running';
        this._agentRun.StartedAt = new Date();
        this._agentRun.UserID = params.userId || params.contextUser?.ID || null;
        this._agentRun.CompanyID = params.companyId || null;

        if (params.effortLevel !== undefined && params.effortLevel !== null) {
            this._agentRun.EffortLevel = params.effortLevel;
        } else if (params.agent.DefaultPromptEffortLevel !== undefined && params.agent.DefaultPromptEffortLevel !== null) {
            this._agentRun.EffortLevel = params.agent.DefaultPromptEffortLevel;
        }
        
        this._agentRun.ParentRunID = params.parentRun?.ID;
        
        if (params.lastRunId) {
            await this.validateRunChain(params.lastRunId, params.contextUser);
            this._agentRun.LastRunID = params.lastRunId;
        }
        
        if (modifiedParams.payload) {
            this._agentRun.StartingPayload = JSON.stringify(modifiedParams.payload);
        }
        
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

        if (params.testRunId) {
            this._agentRun.TestRunID = params.testRunId;
        }

        const primaryScopeEntityName = params.PrimaryScopeEntityName ?? (params.data?.PrimaryScopeEntityName as string | undefined);
        const primaryScopeRecordID = params.PrimaryScopeRecordID ?? (params.data?.PrimaryScopeRecordID as string | undefined);
        const secondaryScopes = params.SecondaryScopes ?? (params.data?.SecondaryScopes as Record<string, SecondaryScopeValue> | undefined);

        if (primaryScopeEntityName || primaryScopeRecordID || secondaryScopes) {
            const scopeConfig = this.parseSecondaryScopeConfig(params.agent);

            const validatedSecondary = this.validateAndApplySecondaryScopes(
                secondaryScopes,
                scopeConfig,
                params.agent.Name
            );

            const hasSecondary = validatedSecondary && Object.keys(validatedSecondary).length > 0;
            const hasPrimary = !!primaryScopeRecordID;
            const allowSecondaryOnly = scopeConfig?.allowSecondaryOnly ?? false;

            if (hasSecondary && !hasPrimary && !allowSecondaryOnly) {
                LogError(
                    `Scoping: Agent "${params.agent.Name}" requires primary scope when using secondary scopes. ` +
                    `Set allowSecondaryOnly=true in ScopeConfig to allow secondary-only scoping.`
                );
            }

            if (primaryScopeEntityName) {
                const primaryEntity = this.ProviderToUse.EntityByName(primaryScopeEntityName);
                if (primaryEntity) {
                    this._agentRun.PrimaryScopeEntityID = primaryEntity.ID;
                } else {
                    LogError(`Scoping: Entity "${primaryScopeEntityName}" not found in metadata`);
                }
            }
            if (primaryScopeRecordID) {
                this._agentRun.PrimaryScopeRecordID = primaryScopeRecordID;
            }
            if (validatedSecondary && Object.keys(validatedSecondary).length > 0) {
                this._agentRun.SecondaryScopes = JSON.stringify(validatedSecondary);
            }
        }

        if (!await this._agentRun.Save()) {
            const errorMessage = JSON.stringify(CopyScalarsAndArrays(this._agentRun.LatestResult));
            throw new Error(`Failed to create agent run record: Details: ${errorMessage}`);
        }
        
        if (modifiedParams.onAgentRunCreated) {
            try {
                await modifiedParams.onAgentRunCreated(this._agentRun.ID);
            } catch (callbackError) {
                LogStatus(`Error in onAgentRunCreated callback: ${callbackError.message}`);
            }
        }
    }

    /**
     * Performs validation checks before beginning agent execution.
     * 
     * @param {MJAIAgentEntityExtended} agent - The agent entity
     * @param {UserInfo} contextUser - The user context
     * @returns {Promise<ExecuteAgentResult | null>} Error result if invalid, null if valid
     * @private
     */
    private async validateAgentWithTracking(agent: MJAIAgentEntityExtended, contextUser: UserInfo): Promise<ExecuteAgentResult | null> {
        const validationResult = await this.validateAgent(agent);
        
        if (validationResult) {
            // Create validation step
            const stepEntity = await this.createStepEntity({ stepType: 'Validation', stepName: 'Agent Validation', contextUser });
            
            // Update step entity
            await this.finalizeStepEntity(stepEntity, false, validationResult.agentRun?.ErrorMessage);
            
            return await this.createFailureResult(validationResult.agentRun?.ErrorMessage || 'Validation failed', contextUser);
        }
        
        // Validation successful - create success step
        const stepEntity = await this.createStepEntity({ stepType: 'Validation', stepName: 'Agent Validation', contextUser });
        
        await this.finalizeStepEntity(stepEntity, true);
        
        return null;
    }

    /**
     * Executes standard decision logic for routing execution based on previous decision.
     * 
     * @protected
     */
    protected async executeNextStep<P = any>(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P> | null,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep<P>> {
        if (!previousDecision) {
            const initialStep = await this.AgentTypeInstance.DetermineInitialStep<P>(params, params.payload, this.AgentTypeState);
            if (initialStep) {
                return initialStep;
            }
            return await this.executePromptStep(params, config, undefined, stepCount);
        }
        
        const customNextStep = await this.AgentTypeInstance.PreProcessNextStep(params, previousDecision, previousDecision.newPayload || previousDecision.previousPayload, this.AgentTypeState);

        if (customNextStep) {
            return customNextStep;
        }

        switch (previousDecision.step) {
            case 'Retry':
                if (previousDecision.messageIndex !== undefined) {
                    this.executeExpandMessageStep(previousDecision, params, this._promptTurnCount);
                }
                return await this.executePromptStep(params, config, previousDecision, stepCount);
            case 'Sub-Agent':
                return await this.processSubAgentStep<P, P>(params, previousDecision!, undefined, undefined, stepCount);
            case 'Actions':
                return await this.executeActionsStep(params, previousDecision, undefined, true, stepCount);
            case 'ClientTools' as typeof previousDecision.step:
                return await this.executeClientToolsStep(params, config, previousDecision, stepCount);
            case 'Chat':
                return await this.executeChatStep(params, previousDecision);
            case 'Success':
                if (previousDecision.terminate) {
                    return {
                        terminate: true,
                        step: 'Success',
                        previousPayload: previousDecision.previousPayload,
                        newPayload: previousDecision.newPayload
                    };
                }
                else {
                    const fallbackStep = await this.AgentTypeInstance.HandleStepFallback(
                        previousDecision,
                        config,
                        params,
                        previousDecision.newPayload || previousDecision.previousPayload,
                        this.AgentTypeState
                    );

                    if (fallbackStep) {
                        if (fallbackStep.terminate) {
                            const terminationMessage = `Agent completed successfully. Agent type '${config.agentType.Name}' terminated execution.`;

                            const stepEntity = await this.createStepEntity({
                                stepType: 'Decision',
                                stepName: terminationMessage,
                                contextUser: params.contextUser,
                                payloadAtStart: fallbackStep.previousPayload,
                                payloadAtEnd: fallbackStep.newPayload
                            });

                            await this.finalizeStepEntity(stepEntity, true, undefined, {
                                reason: 'Agent type intervention - Success',
                                agentType: config.agentType.Name,
                                decision: 'Success'
                            });
                        }

                        return fallbackStep;
                    } else {
                        return await this.executePromptStep(params, config, previousDecision, stepCount);
                    }
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
                    const fallbackStep = await this.AgentTypeInstance.HandleStepFallback(
                        previousDecision,
                        config,
                        params,
                        previousDecision.newPayload || previousDecision.previousPayload,
                        this.AgentTypeState
                    );

                    if (fallbackStep) {
                        if (fallbackStep.terminate) {
                            const errorDetails = fallbackStep.errorMessage || 'No error details provided';
                            const terminationMessage = `Agent failed. Agent type '${config.agentType.Name}' terminated execution: ${errorDetails}`;

                            const stepEntity = await this.createStepEntity({
                                stepType: 'Decision',
                                stepName: terminationMessage,
                                contextUser: params.contextUser,
                                payloadAtStart: fallbackStep.previousPayload,
                                payloadAtEnd: fallbackStep.newPayload
                            });

                            await this.finalizeStepEntity(stepEntity, false, errorDetails, {
                                reason: 'Agent type intervention - Failed',
                                agentType: config.agentType.Name,
                                decision: 'Failed'
                            });

                            if (this.AgentRun) {
                                this.AgentRun.ErrorMessage = terminationMessage;
                                await this.AgentRun.Save();
                            }

                            this.logError(`Agent type '${config.agentType.Name}' handling Failed step with termination`, {
                                agent: params.agent,
                                category: 'AgentExecution',
                                metadata: {
                                    errorDetails,
                                    agentType: config.agentType.Name
                                }
                            });
                        }

                        return fallbackStep;
                    } else {
                        return await this.executePromptStep(params, config, previousDecision, stepCount);
                    }
                }
            case 'ForEach':
                return await this.executeForEachLoop(params, config, previousDecision);
            case 'While':
                return await this.executeWhileLoop(params, config, previousDecision);
            default:
                throw new Error(`Unsupported next step: ${previousDecision.step}`);
        }
    }

    /**
     * Creates failed result entity tracking and returns the result object.
     * 
     * @private
     */
    private async createFailureResult(errorMessage: string, contextUser?: UserInfo): Promise<ExecuteAgentResult> {
        if (this._agentRun) {
            this._agentRun.Status = 'Failed';
            this._agentRun.CompletedAt = new Date();
            this._agentRun.Success = false;
            this._agentRun.ErrorMessage = errorMessage;
            
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
     * Finalizes execution for a successful agent run, resolving placeholders and saving final state.
     * 
     * @private
     */
    private async finalizeAgentRun<P>(finalStep: BaseAgentNextStep, payload?: P, contextUser?: UserInfo): Promise<ExecuteAgentResult<P>> {
        const isRootAgent = this._depth === 0;
        const resolvedPayload = (payload && isRootAgent)
            ? this.resolveMediaPlaceholdersInPayload(payload)
            : payload;

        const resolvedActionableCommands = (finalStep.actionableCommands && isRootAgent)
            ? this.resolveMediaPlaceholdersInPayload(finalStep.actionableCommands)
            : finalStep.actionableCommands;

        const processedMessage = (finalStep.message && isRootAgent)
            ? this.processMessageMediaPlaceholders(finalStep.message)
            : finalStep.message;

        if (this._agentRun) {
            this._agentRun.CompletedAt = new Date();
            this._agentRun.Success = finalStep.step === 'Success' || finalStep.step === 'Chat';
            if (!this._agentRun.Success) {
                const errorText = finalStep.errorMessage || finalStep.message;
                if (errorText) {
                    this._agentRun.ErrorMessage = (this._agentRun.ErrorMessage ? this._agentRun.ErrorMessage + '\n\n' : '') + errorText;
                }
            }
            if (!this._agentRun.Success) {
                this._agentRun.Status = 'Failed';
            }
            else if (finalStep.step === 'Chat') {
                this._agentRun.Status = 'AwaitingFeedback';
            }
            else {
                this._agentRun.Status = 'Completed';
            }

            this._agentRun.Result = resolvedPayload ? JSON.stringify(resolvedPayload) : null;
            this._agentRun.FinalStep = finalStep.step;
            this._agentRun.Message = processedMessage;

            this._agentRun.FinalPayloadObject = resolvedPayload;
            this._agentRun.FinalPayload = resolvedPayload ? JSON.stringify(resolvedPayload) : null;
            
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
        
        if (finalStep.promoteMediaOutputs && finalStep.promoteMediaOutputs.length > 0) {
            this.promoteMediaOutputs(finalStep.promoteMediaOutputs);
        }

        return {
            success: finalStep.step === 'Success' || finalStep.step === 'Chat',
            payload: resolvedPayload,
            agentRun: this._agentRun!,
            responseForm: finalStep.responseForm,
            actionableCommands: resolvedActionableCommands,
            automaticCommands: finalStep.automaticCommands,
            memoryContext: this._injectedMemory.notes.length > 0 || this._injectedMemory.examples.length > 0
                ? this._injectedMemory
                : undefined,
            mediaOutputs: this._mediaOutputs.length > 0 ? this._mediaOutputs : undefined,
            fileOutputs: this._fileOutputs.length > 0 ? this._fileOutputs : undefined,
            feedbackRequestId: this._feedbackRequestId || undefined,
            resolvedStorageAccountId: this._resolvedStorageAccountId || undefined
        };
    }

    /**
     * Parses SecondaryScopeConfig JSON from the agent's ScopeConfig field.
     * 
     * @param {MJAIAgentEntityExtended} agent - The agent entity
     * @returns {SecondaryScopeConfig | null} The config or null if invalid
     * @private
     */
    private parseSecondaryScopeConfig(agent: MJAIAgentEntityExtended): SecondaryScopeConfig | null {
        const configJson = agent.ScopeConfig;
        if (!configJson) {
            return null;
        }

        try {
            return JSON.parse(configJson) as SecondaryScopeConfig;
        } catch (e) {
            LogError(`Failed to parse SecondaryScopeConfig for agent "${agent.Name}": ${e}`);
            return null;
        }
    }

    /**
     * Validates and applies defaults for multi-tenant secondary scope variables.
     * 
     * @private
     */
    private validateAndApplySecondaryScopes(
        secondary: Record<string, SecondaryScopeValue> | undefined,
        scopeConfig: SecondaryScopeConfig | null,
        agentName: string
    ): Record<string, SecondaryScopeValue> | undefined {
        if (!scopeConfig) {
            return secondary;
        }

        const result: Record<string, SecondaryScopeValue> = { ...(secondary || {}) };
        const definedDimensions = new Set<string>();

        if (scopeConfig.dimensions) {
            for (const dim of scopeConfig.dimensions) {
                definedDimensions.add(dim.name);

                if (dim.required) {
                    if (!(dim.name in result)) {
                        if (dim.defaultValue != null) {
                            result[dim.name] = dim.defaultValue;
                        } else {
                            LogError(
                                `Scoping: Required dimension "${dim.name}" not provided for agent "${agentName}" ` +
                                `and no defaultValue is configured.`
                            );
                        }
                    }
                } else {
                    if (!(dim.name in result) && dim.defaultValue != null) {
                        result[dim.name] = dim.defaultValue;
                    }
                }
            }
        }

        if (scopeConfig.strictValidation && secondary) {
            for (const key of Object.keys(secondary)) {
                if (!definedDimensions.has(key)) {
                    LogError(
                        `Scoping: Unknown dimension "${key}" provided for agent "${agentName}". ` +
                        `Agent's SecondaryScopeConfig has strictValidation enabled.`
                    );
                }
            }
        }

        return Object.keys(result).length > 0 ? result : undefined;
    }
}
