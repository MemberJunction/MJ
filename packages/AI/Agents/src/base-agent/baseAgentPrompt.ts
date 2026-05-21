/**
 * @fileoverview BaseAgentPrompt - Layer 3 of the BaseAgent modular inheritance hierarchy.
 * Handles prompt configuration compilation, template variables resolution, client tool documentation,
 * system and child prompt runner execution, token estimation, and context recovery / message compaction.
 * 
 * @module @memberjunction/ai-agents
 */

import {
    MJAIAgentTypeEntity,
    MJTemplateParamEntity,
    MJActionParamEntity
} from '@memberjunction/core-entities';
import {
    AIPromptParams,
    AIPromptRunResult,
    ChildPromptParam,
    ExecuteAgentParams,
    AgentContextData,
    AgentConfiguration,
    BaseAgentNextStep,
    MessageLifecycleEvent,
    AgentChatMessage,
    AIModelSelectionInfo,
    ActionChange,
    ActionChangeScope,
    ClientToolMetadata,
    MJAIAgentRunStepEntityExtended,
    MJAIPromptEntityExtended,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended
} from '@memberjunction/ai-core-plus';
import { ChatMessage, AIErrorType } from '@memberjunction/ai';
import { UserInfo, LogStatus, LogError, LogErrorEx, LogStatusEx, IsVerboseLoggingEnabled } from '@memberjunction/core';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import { MJActionEntityExtended } from '@memberjunction/actions-base';
import { UUIDsEqual, CopyScalarsAndArrays } from '@memberjunction/global';
import { BaseAgentInit } from './baseAgentInit';
import { BaseAgentState } from './baseAgentState';
import { ClientToolRequestManager } from '../ClientToolRequestManager';

/**
 * BaseAgentPrompt handles prompt composition, template data collection,
 * execution of prompts, token calculations, and context window recovery/message compaction.
 */
export class BaseAgentPrompt extends BaseAgentInit {

    /**
     * Prepares parameters for executing the hierarchical prompt runner.
     * Integrates template variable data, effort levels, scratchpad files, artifact tools,
     * child prompts placeholders, API keys, and model selections.
     * 
     * @param config - The active agent configuration
     * @param payload - The payload context to inject into prompt schemas
     * @param params - Execution run parameters
     * @returns Prepared AIPromptParams object
     * @protected
     */
    protected async preparePromptParams<P>(
        config: AgentConfiguration,
        payload: P,
        params: ExecuteAgentParams
    ): Promise<AIPromptParams> {
        const systemPrompt: MJAIPromptEntityExtended = config.systemPrompt;
        const childPrompt: MJAIPromptEntityExtended = config.childPrompt;
        const agentType: MJAIAgentTypeEntity = config.agentType;

        // Gather context data (including runtime action changes)
        const promptTemplateData = await this.gatherPromptTemplateData(
            params.agent,
            params.contextUser,
            params.data,
            params.actionChanges
        );

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

        // Apply effortLevel with precedence hierarchy
        if (params.effortLevel !== undefined && params.effortLevel !== null) {
            promptParams.effortLevel = params.effortLevel;
            this.logStatus(`🎯 Using runtime effort level: ${params.effortLevel}`, true, params);
        } else if (params.agent.DefaultPromptEffortLevel !== undefined && params.agent.DefaultPromptEffortLevel !== null) {
            promptParams.effortLevel = params.agent.DefaultPromptEffortLevel;
            this.logStatus(`🎯 Using agent default effort level: ${params.agent.DefaultPromptEffortLevel}`, true, params);
        } else {
            if (childPrompt && childPrompt.EffortLevel !== undefined && childPrompt.EffortLevel !== null) {
                promptParams.effortLevel = childPrompt.EffortLevel;
                this.logStatus(`🎯 Using child prompt effort level: ${childPrompt.EffortLevel}`, true, params);
            }
        }

        // Let Agent Type inject the payload
        const atInstance = this._agentTypeInstance;
        await atInstance.InjectPayload<P>(payload, this.AgentTypeState, promptParams, {
            agentId: params.agent.ID,
            agentRunId: this._agentRun?.ID
        });

        // Inject scratchpad template variables if scratchpad is enabled
        if (promptParams.data) {
            const agentTypePromptParams = promptParams.data.__agentTypePromptParams as Record<string, unknown> | undefined;
            const scratchpadEnabled = agentTypePromptParams?.includeScratchpadDocs !== false;
            if (scratchpadEnabled && this._scratchpadManager) {
                promptParams.data['_SCRATCHPAD_NOTES'] = this._scratchpadManager.GetNotes() || '_(no notes yet)_';
                promptParams.data['_SCRATCHPAD_TASKS'] = this._scratchpadManager.ToPromptString();
                promptParams.data['_SCRATCHPAD_TASK_SUMMARY'] = this._scratchpadManager.GetTaskSummary();
            }

            // Inject artifact tools template variables if enabled and artifacts are present
            const artifactToolsEnabled = agentTypePromptParams?.includeArtifactToolsDocs !== false;
            if (artifactToolsEnabled && this._artifactToolManager.HasArtifacts()) {
                promptParams.data['_ARTIFACT_MANIFEST'] = this._artifactToolManager.ToManifestString();
                promptParams.data['_ARTIFACT_TOOLS'] = this._artifactToolManager.GetToolDocumentation();
                promptParams.data['_ARTIFACT_TOOL_SUMMARY'] = this._artifactToolManager.GetSummary();
                this.logStatus(`[ArtifactTools] Injected manifest into prompt: ${this._artifactToolManager.GetSummary()}`, true, params);
            } else if (this._artifactToolManager.HasArtifacts()) {
                this.logStatus(`[ArtifactTools] Artifacts present but tools disabled by agent config (includeArtifactToolsDocs=false)`, true, params);
            }

            // Pass file artifacts as candidate native file inputs
            if (this._artifactToolManager.HasArtifacts()) {
                promptParams.nativeFileInputs = await this._artifactToolManager.GetNativeFileInputCandidates();
            }
        }

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

            // Pass through effortLevel to child prompt
            if (params.effortLevel !== undefined && params.effortLevel !== null) {
                childPromptParams.effortLevel = params.effortLevel;
            } else if (params.agent.DefaultPromptEffortLevel !== undefined && params.agent.DefaultPromptEffortLevel !== null) {
                childPromptParams.effortLevel = params.agent.DefaultPromptEffortLevel;
            }
            
            // Pass through API keys
            if (params.apiKeys && params.apiKeys.length > 0) {
                childPromptParams.apiKeys = params.apiKeys;
            }
            
            // Pass through configurationId
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
            promptParams.modelSelectionPrompt = childPrompt;
            this.logStatus(`🎯 Agent '${params.agent.Name}' configured to use its own prompt for model selection`, true, params);
        }

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

        // Thread the per-request provider
        promptParams.provider = params.provider || this._activeProvider;

        return promptParams;
    }

    /**
     * Executes the compiled prompt parameters using AIPromptRunner.
     * Enforces JSON repair automatically to correct syntax errors.
     * 
     * @param promptParams - Parameters for executing the prompt runner
     * @returns The prompt runner execution output
     * @protected
     */
    protected async executePrompt(promptParams: AIPromptParams): Promise<AIPromptRunResult> {
        const newParams = {
            ...promptParams,
            attemptJSONRepair: true
        };
        return await this._promptRunner.ExecutePrompt(newParams);
    }

    /**
     * Executes a prompt step, logs stats, processes downstreams, handles streaming,
     * and intercepts context overflows to attempt message compaction.
     * 
     * @param params - Execution params
     * @param config - Agent configuration
     * @param previousDecision - Previous next-step decision if retrying
     * @param stepCount - Sequence count of steps in this run
     * @returns Next-step decision parsed from response
     * @protected
     */
    protected async executePromptStep<P = any>(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision?: BaseAgentNextStep,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep<P>> {
        // Ask the agent type if it has a custom prompt for this step
        const promptToUse = await this.AgentTypeInstance.GetPromptForStep(params, config, previousDecision?.newPayload || previousDecision?.previousPayload, this.AgentTypeState, previousDecision);
        const promptId = promptToUse?.ID;
        const promptName = promptToUse?.Name;
        
        // Prepare input data for the step (includes scratchpad snapshot before LLM response)
        const scratchpadSnapshotBeforeStep = this._scratchpadManager.HasContent() ? this._scratchpadManager.ToJSON() : undefined;
        const inputData = {
            promptId: promptId,
            promptName: promptName,
            isRetry: !!previousDecision,
            retryContext: previousDecision ? {
                reason: previousDecision.retryReason,
                instructions: previousDecision.retryInstructions
            } : undefined,
            conversationMessages: params.conversationMessages,
            ...(scratchpadSnapshotBeforeStep && { scratchpad: scratchpadSnapshotBeforeStep }),
        };
        
        // Prepare prompt parameters
        const payload = previousDecision?.newPayload || params.payload;
        const stepEntity = await this.createStepEntity({ stepType: 'Prompt', stepName: 'Execute Agent Prompt', contextUser: params.contextUser, targetId: promptId, inputData, payloadAtStart: payload });
        
        try {
            // Report prompt execution progress with context
            const isRetry = !!previousDecision;
            const promptMessage = isRetry
                ? `Running ${params.agent.Name} with context from ${previousDecision.retryReason || 'previous actions'}`
                : `Running ${params.agent.Name}'s initial prompt...`;

            const hierarchicalStepToEmit = this.buildHierarchicalStep(stepCount + 1, this._parentStepCounts);

            params.onProgress?.({
                step: 'prompt_execution',
                message: this.formatHierarchicalMessage(promptMessage),
                metadata: {
                    promptId: promptId,
                    isRetry,
                    promptName: promptName,
                    stepCount: stepCount + 1,
                    hierarchicalStep: hierarchicalStepToEmit
                },
                displayMode: 'live'
            });
            
            // Set PayloadAtStart
            if (stepEntity && payload) {
                stepEntity.PayloadAtStart = this.serializePayloadAtStart(payload);
            }
            
            let downstreamPayload = payload;
            if (params.agent.PayloadSelfReadPaths) {
                const downstreamPaths = JSON.parse(params.agent.PayloadSelfReadPaths);
                downstreamPayload = this._payloadManager.extractDownstreamPayload(
                    `Self: ${params.agent.Name}`,
                    payload,
                    downstreamPaths
                );
            }
            
            const promptConfig = (promptToUse && promptToUse !== config.childPrompt) ? {
                ...config,
                childPrompt: promptToUse,
                systemPrompt: null
            } : config;
            
            // Increment prompt iterations counter
            if (this._agentRun) {
                this._agentRun.TotalPromptIterations = (this._agentRun.TotalPromptIterations || 0) + 1;
            }

            const promptParams = await this.preparePromptParams(promptConfig, downstreamPayload, params);
            
            // Pass cancellation token and streaming callbacks
            promptParams.cancellationToken = params.cancellationToken;
            promptParams.onStreaming = params.onStreaming ? (chunk) => {
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

            // Increment prompt-specific turn counter
            this._promptTurnCount++;

            // Update step entity with AIPromptRun ID if available
            if (promptResult.promptRun?.ID) {
                stepEntity.TargetLogID = promptResult.promptRun.ID;
                stepEntity.PromptRun = promptResult.promptRun;
            }

            // Check if prompt execution failed
            if (!promptResult.success) {
                if (stepEntity && payload) {
                    stepEntity.PayloadAtEnd = this.serializePayloadAtEnd(payload);
                }

                await this.finalizeStepEntity(stepEntity, false, promptResult.errorMessage);

                const isFatal = this.isFatalPromptError(promptResult);
                const isContextOverflow = isFatal &&
                    promptResult.chatResult?.errorInfo?.errorType === 'ContextLengthExceeded';

                if (isContextOverflow && this._contextRecoveryAttempts < this.MAX_RECOVERY_ATTEMPTS) {
                    this._contextRecoveryAttempts++;
                    this.logStatus(
                        `⚠️ Context length exceeded - attempting recovery by trimming conversation`,
                        true,
                        params
                    );
                    return await this.attemptContextRecovery(params, payload, promptResult.errorMessage || 'Context length exceeded', promptResult.modelSelectionInfo);
                }

                this.logStatus(
                    `❌ Prompt execution failed: ${promptResult.errorMessage} (fatal: ${isFatal})`,
                    true,
                    params
                );

                return {
                    errorMessage: promptResult.errorMessage || 'Prompt execution failed',
                    step: 'Failed' as const,
                    terminate: isFatal,
                    previousPayload: payload,
                    newPayload: payload
                };
            }

            // Check for cancellation after prompt execution
            if (params.cancellationToken?.aborted) {
                if (stepEntity && payload) {
                    stepEntity.PayloadAtEnd = this.serializePayloadAtEnd(payload);
                }

                await this.finalizeStepEntity(stepEntity, false, 'Cancelled during prompt execution');
                const cancelledResult = await this.createCancelledResult('Cancelled during prompt execution', params.contextUser);
                return {
                    ...cancelledResult,
                    terminate: true,
                    step: 'Failed',
                    previousPayload: cancelledResult.payload,
                    newPayload: cancelledResult.payload
                };
            }

            // Report decision processing progress
            params.onProgress?.({
                step: 'decision_processing',
                message: this.formatHierarchicalMessage('Analyzing response and determining next steps'),
                metadata: {
                    stepCount: stepCount + 1,
                    hierarchicalStep: this.buildHierarchicalStep(stepCount + 1, this._parentStepCounts)
                },
                displayMode: 'both'
            });

            // Let the Agent Type parse and structure the response
            const decisionResult = await this.determineNextStep<P>(
                params,
                config.agentType,
                promptResult,
                payload
            );

            // Clean step message from media placeholders to keep UI text clean
            if (decisionResult.message) {
                decisionResult.message = this.processMessageMediaPlaceholders(decisionResult.message);
            }

            if (stepEntity && decisionResult.newPayload) {
                stepEntity.PayloadAtEnd = this.serializePayloadAtEnd(decisionResult.newPayload);
            } else if (stepEntity && payload) {
                stepEntity.PayloadAtEnd = this.serializePayloadAtEnd(payload);
            }

            // Finalize step with success
            await this.finalizeStepEntity(
                stepEntity,
                true,
                undefined,
                {
                    decision: decisionResult,
                    tokensUsed: promptResult.tokensUsed,
                    cost: promptResult.cost
                }
            );

            return decisionResult;

        } catch (error) {
            // in this case, we have a failed prompt execution. In this situation, let's make sure our payload at end isn't adjusted as
            // that affects downstream things in the agent run
            // Preserve payload on error
            const payload = stepEntity.PayloadAtEnd
                ? JSON.parse(stepEntity.PayloadAtEnd)
                : (previousDecision?.newPayload || params.payload);

            stepEntity.PayloadAtEnd = this.serializePayloadAtEnd(payload);

            // we had an error, don't throw the exception as that will kill our overall execution/run
            // instead return a helpful message in our return value that the parent loop can review and adjust
            const errString = error instanceof Error ? error.message : String(error);

            // Classify error type - configuration errors are fatal and should not be retried
            const configCheck = this.isConfigurationError(errString, config);
            const isConfigurationError = configCheck.isConfigError;
            const detailedErrorMessage = configCheck.detailedMessage;

            // Check guardrails to see if we've exceeded limits
            const guardailCheck = await this.hasExceededAgentRunGuardrails(params, this.AgentRun);
            const guardrailsExceeded = guardailCheck && guardailCheck.exceeded;

            // Determine if we should terminate
            // Terminate if: configuration error OR guardrails exceeded
            const shouldTerminate = isConfigurationError || guardrailsExceeded;

            // Build the error message for the step entity and return value
            let finalErrorMessage: string;
            if (isConfigurationError) {
                finalErrorMessage = detailedErrorMessage;
                this.logError(`❌ Configuration error in prompt execution (will terminate):\n${detailedErrorMessage}`, {
                    agent: params.agent,
                    category: 'AgentConfiguration',
                    metadata: {
                        error: CopyScalarsAndArrays(error, true)
                    }
                });
            } else if (guardrailsExceeded) {
                finalErrorMessage = `Guardrails exceeded: ${guardailCheck.reason}\n\nOriginal error: ${errString}`;
                this.logError(`⛔ Guardrails exceeded during prompt execution: ${guardailCheck.reason}`, {
                    agent: params.agent,
                    category: 'Guardrails',
                    metadata: {
                        guardrailType: guardailCheck.type,
                        limit: guardailCheck.limit,
                        current: guardailCheck.current,
                        originalError: errString
                    }
                });
            } else {
                finalErrorMessage = `Prompt execution failed: ${errString}`;
                this.logError(`⚠️ Prompt execution error (will retry if guardrails allow): ${errString}`, {
                    agent: params.agent,
                    category: 'PromptExecution',
                    metadata: {
                        attemptNumber: this._agentRun?.TotalPromptIterations || 0,
                        retryable: true,
                        error: CopyScalarsAndArrays(error, true)
                    }
                });
            }

            // Finalize the step entity with the appropriate error message
            await this.finalizeStepEntity(stepEntity, false, finalErrorMessage);

            const errorNextStep = {
                errorMessage: finalErrorMessage,
                step: 'Failed' as const,
                terminate: shouldTerminate,
                previousPayload: payload,
                newPayload: payload
            };

            return errorNextStep;
        }
    }

    /**
     * Let the agent type determine the next step from prompt execution results.
     * 
     * @param params Execution params
     * @param agentType Agent type entity
     * @param promptResult Prompt execution result
     * @param currentPayload Current payload state
     * @returns Determined next step
     */
    protected async determineNextStep<P>(
        params: ExecuteAgentParams,
        agentType: MJAIAgentTypeEntity,
        promptResult: AIPromptRunResult,
        currentPayload: P
    ): Promise<BaseAgentNextStep<P>> {
        this.logStatus(`🎯 Agent type '${agentType.Name}' determining next step`, true, params);
        const nextStep = await this.AgentTypeInstance.DetermineNextStep<P>(
            promptResult,
            params,
            currentPayload,
            this.AgentTypeState
        );
        return nextStep;
    }

    /**
     * Recovers from prompt context overflows by applying trimming and compaction strategies.
     * 
     * @param params - Execution params
     * @param payload - Payload context
     * @param reason - Reason for overflow
     * @param modelSelectionInfo - Active model info
     * @returns Next step decision from the retried execution
     * @protected
     */
    protected async attemptContextRecovery<P>(
        params: ExecuteAgentParams,
        payload: P,
        reason: string,
        modelSelectionInfo?: AIModelSelectionInfo
    ): Promise<BaseAgentNextStep<P>> {
        const stepEntity = await this.createStepEntity({
            stepType: 'Validation',
            stepName: 'Context Recovery',
            contextUser: params.contextUser,
            inputData: { reason, recoveryAttempt: this._contextRecoveryAttempts }
        });

        try {
            const contextLimit = this.getModelContextLimit(modelSelectionInfo);
            const currentTurn = this._promptTurnCount;
            
            // Build collection of recovery strategies
            const strategies = [
                () => this.recoveryStrategy_RemoveOldestToolResults(params, contextLimit, currentTurn, 5),
                () => this.recoveryStrategy_CompactOldToolResults(params, contextLimit, currentTurn, 3),
                () => this.recoveryStrategy_RemoveOldestToolResults(params, contextLimit, currentTurn, 2),
                () => this.recoveryStrategy_CompactAllToolResults(params, contextLimit),
                () => Promise.resolve(this.recoveryStrategy_TrimLastUserMessage(params, contextLimit))
            ];

            let success = false;
            let strategyIndex = 0;
            let tokensSaved = 0;

            for (const strategy of strategies) {
                const initialTokens = this.estimateConversationTokens(params.conversationMessages);
                const strategyResult = await strategy();
                const postTokens = this.estimateConversationTokens(params.conversationMessages);
                
                if (strategyResult || postTokens < initialTokens) {
                    tokensSaved = initialTokens - postTokens;
                    this.logStatus(
                        `🔄 Strategy ${strategyIndex + 1} succeeded - saved ~${tokensSaved} tokens. New size: ~${postTokens} tokens`,
                        true,
                        params
                    );
                    success = true;
                    break;
                }
                strategyIndex++;
            }

            if (!success) {
                throw new Error('All context recovery strategies failed to reduce context size');
            }

            await this.finalizeStepEntity(stepEntity, true, undefined, {
                recoveryAttempt: this._contextRecoveryAttempts,
                strategyApplied: strategyIndex + 1,
                tokensSaved
            });

            // Retry prompt execution
            return {
                step: 'Retry' as const,
                newPayload: payload,
                previousPayload: payload,
                retryReason: 'Context length recovered',
                retryInstructions: 'Prior messages were compacted or removed to fit context window.',
                terminate: false
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            await this.finalizeStepEntity(stepEntity, false, errorMessage);
            
            this.logError(`Context recovery failed: ${errorMessage}`, {
                agent: params.agent,
                category: 'ContextRecovery'
            });

            return {
                step: 'Failed',
                terminate: true,
                errorMessage: `Context recovery failed: ${errorMessage}`,
                previousPayload: payload,
                newPayload: payload
            };
        }
    }

    /**
     * Context recovery strategy: removes oldest tool/action result messages from conversation.
     * 
     * @param params - Execution params
     * @param contextLimit - Target token limit
     * @param currentTurn - Current execution turn number
     * @param ageThreshold - Threshold age in turns to filter
     * @returns True if any message was removed
     * @protected
     */
    protected recoveryStrategy_RemoveOldestToolResults(
        params: ExecuteAgentParams,
        contextLimit: number,
        currentTurn: number,
        ageThreshold: number
    ): boolean {
        let removedCount = 0;

        for (let i = params.conversationMessages.length - 1; i >= 0; i--) {
            const msg = params.conversationMessages[i] as AgentChatMessage;
            if (!this.IsToolResultMessage(msg)) continue;

            const turnAdded = msg.metadata?.turnAdded || 0;
            const age = currentTurn - turnAdded;

            if (age >= ageThreshold) {
                params.conversationMessages.splice(i, 1);
                removedCount++;

                this.emitMessageLifecycleEvent({
                    type: 'message-removed',
                    turn: currentTurn,
                    messageIndex: i,
                    message: msg,
                    reason: `Context recovery: removed tool result from turn ${turnAdded} (age: ${age} turns)`
                });
            }
        }

        return removedCount > 0;
    }

    /**
     * Context recovery strategy: compacts tool results that are older than threshold turns.
     * 
     * @param params - Execution params
     * @param contextLimit - Target token limit
     * @param currentTurn - Current execution turn number
     * @param ageThreshold - Threshold age in turns to filter
     * @returns True if any message was compacted
     * @protected
     */
    protected async recoveryStrategy_CompactOldToolResults(
        params: ExecuteAgentParams,
        contextLimit: number,
        currentTurn: number,
        ageThreshold: number
    ): Promise<boolean> {
        let compactedCount = 0;

        for (let i = 0; i < params.conversationMessages.length; i++) {
            const msg = params.conversationMessages[i] as AgentChatMessage;
            if (!this.IsToolResultMessage(msg)) continue;
            if (msg.metadata?.wasCompacted) continue;

            const turnAdded = msg.metadata?.turnAdded || 0;
            const age = currentTurn - turnAdded;

            if (age >= ageThreshold) {
                const originalContent = msg.content;
                const compacted = await this.compactMessage(msg, {
                    compactMode: 'AISummary' as any,
                    compactLength: 300,
                    compactPromptId: '',
                    originalLength: typeof originalContent === 'string' ? originalContent.length : JSON.stringify(originalContent).length
                }, params);

                params.conversationMessages[i] = {
                    ...msg,
                    content: compacted,
                    metadata: {
                        ...msg.metadata,
                        wasCompacted: true,
                        originalContent: originalContent,
                        canExpand: true
                    }
                };

                compactedCount++;

                this.emitMessageLifecycleEvent({
                    type: 'message-compacted',
                    turn: currentTurn,
                    messageIndex: i,
                    message: params.conversationMessages[i] as AgentChatMessage,
                    reason: `Context recovery: compacted tool result from turn ${turnAdded} (age: ${age} turns)`
                });
            }
        }

        return compactedCount > 0;
    }

    /**
     * Context recovery strategy: compacts all tool results in the conversation history.
     * 
     * @param params - Execution params
     * @param contextLimit - Target token limit
     * @returns True if any message was compacted
     * @protected
     */
    protected async recoveryStrategy_CompactAllToolResults(
        params: ExecuteAgentParams,
        contextLimit: number
    ): Promise<boolean> {
        let compactedCount = 0;
        const currentTurn = this._promptTurnCount;

        for (let i = 0; i < params.conversationMessages.length; i++) {
            const msg = params.conversationMessages[i] as AgentChatMessage;
            if (!this.IsToolResultMessage(msg)) continue;
            if (msg.metadata?.wasCompacted) continue;

            const originalContent = msg.content;
            const compacted = await this.compactMessage(msg, {
                compactMode: 'AISummary' as any,
                compactLength: 200,
                compactPromptId: '',
                originalLength: typeof originalContent === 'string' ? originalContent.length : JSON.stringify(originalContent).length
            }, params);

            params.conversationMessages[i] = {
                ...msg,
                content: compacted,
                metadata: {
                    ...msg.metadata,
                    wasCompacted: true,
                    originalContent: originalContent,
                    canExpand: true
                }
            };

            compactedCount++;

            this.emitMessageLifecycleEvent({
                type: 'message-compacted',
                turn: currentTurn,
                messageIndex: i,
                message: params.conversationMessages[i] as AgentChatMessage,
                reason: `Context recovery: aggressive compaction of tool result`
            });
        }

        return compactedCount > 0;
    }

    /**
     * Context recovery strategy: trims the tail end of the very last user message.
     * 
     * @param params - Execution params
     * @param contextLimit - Target token limit
     * @returns True if message was trimmed
     * @protected
     */
    protected recoveryStrategy_TrimLastUserMessage(
        params: ExecuteAgentParams,
        contextLimit: number
    ): boolean {
        const lastUserMsgIndex = [...params.conversationMessages]
            .reverse()
            .findIndex(msg => msg.role === 'user');

        if (lastUserMsgIndex === -1) return false;

        const actualIndex = params.conversationMessages.length - 1 - lastUserMsgIndex;
        const msg = params.conversationMessages[actualIndex] as AgentChatMessage;
        const contentStr = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

        if (contentStr.length <= 1000) return false;

        // Truncate to 1000 chars
        const trimmed = contentStr.substring(0, 1000);
        msg.content = `${trimmed}...\n\n[Context length exceeded: user message truncated for recovery.]`;
        
        this.emitMessageLifecycleEvent({
            type: 'message-compacted',
            turn: this._promptTurnCount,
            messageIndex: actualIndex,
            message: msg,
            reason: 'Context recovery: truncated user message to 1000 characters'
        });

        return true;
    }

    /**
     * Identifies, removes, or compacts expired messages according to age and expiration mode rules.
     * 
     * @param params - Execution params
     * @param currentTurn - Current prompt execution turn sequence number
     * @protected
     */
    protected async pruneAndCompactExpiredMessages(
        params: ExecuteAgentParams,
        currentTurn: number
    ): Promise<void> {
        const messagesToCompact: Array<{
            index: number;
            message: AgentChatMessage;
            metadata: {
                compactMode: 'First N Chars' | 'AI Summary';
                compactLength: number;
                compactPromptId: string;
                originalLength: number;
            };
        }> = [];
        const messagesToRemove: number[] = [];

        // Phase 1: Identify expired messages
        for (let i = 0; i < params.conversationMessages.length; i++) {
            const msg = params.conversationMessages[i] as AgentChatMessage;

            if (!msg.metadata?.expirationTurns && msg.metadata?.expirationTurns !== 0) {
                continue;
            }

            if (msg.metadata.expirationMode === 'None') {
                continue;
            }

            const turnAdded = msg.metadata.turnAdded || 0;
            const turnsAlive = currentTurn - turnAdded;

            if (turnsAlive > msg.metadata.expirationTurns) {
                msg.metadata.isExpired = true;

                if (msg.metadata.expirationMode === 'Remove') {
                    messagesToRemove.push(i);

                    this.emitMessageLifecycleEvent({
                        type: 'message-expired',
                        turn: currentTurn,
                        messageIndex: i,
                        message: msg,
                        reason: `Expired after ${turnsAlive} turns (limit: ${msg.metadata.expirationTurns})`
                    });
                } else if (msg.metadata.expirationMode === 'Compact') {
                    if (msg.metadata.compactMode) {
                        messagesToCompact.push({
                            index: i,
                            message: msg,
                            metadata: {
                                compactMode: msg.metadata.compactMode,
                                compactLength: msg.metadata.compactLength || 500,
                                compactPromptId: msg.metadata.compactPromptId || '',
                                originalLength: typeof msg.content === 'string'
                                    ? msg.content.length
                                    : JSON.stringify(msg.content).length
                            }
                        });
                    }
                }
            }
        }

        // Phase 2: Compact messages
        const preserveOriginal = params.messageExpirationOverride?.preserveOriginalContent !== false;

        for (const item of messagesToCompact) {
            const originalContent = item.message.content;
            const compacted = await this.compactMessage(
                item.message,
                item.metadata,
                params
            );

            const originalTokens = this.estimateTokens(originalContent);
            const compactedTokens = this.estimateTokens(compacted);
            const tokensSaved = originalTokens - compactedTokens;

            params.conversationMessages[item.index] = {
                ...item.message,
                content: compacted,
                metadata: {
                    ...item.message.metadata,
                    wasCompacted: true,
                    originalContent: preserveOriginal ? originalContent : undefined,
                    originalLength: item.metadata.originalLength,
                    tokensSaved,
                    canExpand: preserveOriginal
                }
            };

            this.emitMessageLifecycleEvent({
                type: 'message-compacted',
                turn: currentTurn,
                messageIndex: item.index,
                message: params.conversationMessages[item.index] as AgentChatMessage,
                reason: `Compacted using ${item.metadata.compactMode} (saved ${tokensSaved} tokens)`,
                tokensSaved
            });
        }

        // Phase 3: Remove expired messages (reverse order)
        for (let i = messagesToRemove.length - 1; i >= 0; i--) {
            const index = messagesToRemove[i];
            const removed = params.conversationMessages.splice(index, 1)[0];

            this.emitMessageLifecycleEvent({
                type: 'message-removed',
                turn: currentTurn,
                messageIndex: index,
                message: removed as AgentChatMessage,
                reason: 'Removed due to expiration'
            });
        }

        if (params.verbose && (messagesToCompact.length > 0 || messagesToRemove.length > 0)) {
            const totalSaved = messagesToCompact.reduce((sum, item) => {
                const msg = params.conversationMessages[item.index] as AgentChatMessage;
                return sum + (msg.metadata?.tokensSaved || 0);
            }, 0);

            console.log(`[Turn ${currentTurn}] Message pruning: ` +
                `${messagesToCompact.length} compacted (saved ~${totalSaved} tokens), ` +
                `${messagesToRemove.length} removed`);
        }
    }

    /**
     * Compacts message content using truncated character length or an AI Prompt model summary.
     * 
     * @param message - Message to compact
     * @param metadata - Compaction metadata configuration
     * @param params - Execution params
     * @returns Compacted text content
     * @protected
     */
    protected async compactMessage(
        message: AgentChatMessage,
        metadata: {
            compactMode: 'First N Chars' | 'AI Summary';
            compactLength: number;
            compactPromptId: string;
            originalLength: number;
        },
        params: ExecuteAgentParams
    ): Promise<string> {
        const originalContent = typeof message.content === 'string'
            ? message.content
            : JSON.stringify(message.content);

        switch (metadata.compactMode) {
            case 'First N Chars': {
                const length = metadata.compactLength;

                if (originalContent.length <= length) {
                    return originalContent;
                }

                const truncated = originalContent.substring(0, length);
                return `${truncated}...\n\n[Compacted: showing first ${length} of ${originalContent.length} characters. Agent can request expansion if needed.]`;
            }

            case 'AI Summary': {
                try {
                    const promptId = metadata.compactPromptId || this.getSystemDefaultCompactPromptId();
                    const prompt = AIEngine.Instance.Prompts.find(p => UUIDsEqual(p.ID, promptId));

                    if (!prompt) {
                        console.warn(`Compact prompt ${promptId} not found, falling back to First N Chars`);
                        return this.compactMessage(message,
                            { ...metadata, compactMode: 'First N Chars' },
                            params
                        );
                    }

                    const step = await this.createCompactionStep(prompt, message, params);

                    const promptParams = new AIPromptParams();
                    promptParams.prompt = prompt;
                    promptParams.data = {
                        originalContent,
                        originalLength: metadata.originalLength,
                        targetLength: metadata.compactLength || 500,
                        messageType: message.metadata?.messageType || 'unknown',
                        turnAdded: message.metadata?.turnAdded || 0
                    };
                    promptParams.contextUser = params.contextUser;

                    const runner = new AIPromptRunner();
                    const result = await runner.ExecutePrompt<{ summary: string }>(promptParams);

                    await this.updateCompactionStep(step, result, message, params);

                    if (!result.success || !result.result?.summary) {
                        console.warn('AI summary failed, falling back to First N Chars');
                        return this.compactMessage(message,
                            { ...metadata, compactMode: 'First N Chars' },
                            params
                        );
                    }

                    return `[AI Summary of ${metadata.originalLength} chars. Agent can request full expansion if needed.]\n\n${result.result.summary}`;

                } catch (error) {
                    console.error('Error during AI summary:', error);
                    return this.compactMessage(message,
                        { ...metadata, compactMode: 'First N Chars' },
                        params
                    );
                }
            }

            default:
                return originalContent;
        }
    }

    /**
     * Creates an AIAgentRunStep representing message compaction execution.
     * 
     * @param prompt - The compaction prompt entity
     * @param message - Message being compacted
     * @param params - Execution params
     * @returns Saved run step entity
     * @protected
     */
    protected async createCompactionStep(
        prompt: MJAIPromptEntityExtended,
        message: AgentChatMessage,
        params: ExecuteAgentParams
    ): Promise<MJAIAgentRunStepEntityExtended> {
        if (!this._agentRun) {
            throw new Error('Cannot create compaction step: agent run not initialized');
        }

        const step = await (params.provider || this._activeProvider).GetEntityObject<MJAIAgentRunStepEntityExtended>(
            'MJ: AI Agent Run Steps',
            params.contextUser
        );

        step.NewRecord();
        step.AgentRunID = this._agentRun.ID;
        step.StepType = 'Prompt';
        step.Status = 'Running';
        step.InputData = JSON.stringify({
            stepName: 'Message Compaction',
            description: `Compacting message using AI Summary (${message.metadata?.messageType || 'unknown'} from turn ${message.metadata?.turnAdded || 0})`,
            messageType: message.metadata?.messageType,
            turnAdded: message.metadata?.turnAdded,
            originalLength: message.metadata?.originalLength ||
                (typeof message.content === 'string' ? message.content.length : JSON.stringify(message.content).length),
            compactMode: 'AI Summary',
            promptId: prompt.ID,
            promptName: prompt.Name
        });

        await step.Save();
        return step;
    }

    /**
     * Updates an existing compaction run step with execution outputs and token cost rollups.
     * 
     * @param step - The compaction step entity
     * @param result - Compilation prompt run output
     * @param message - Original chat message
     * @param params - Execution params
     * @protected
     */
    protected async updateCompactionStep(
        step: MJAIAgentRunStepEntityExtended,
        result: AIPromptRunResult<{ summary: string }>,
        message: AgentChatMessage,
        params: ExecuteAgentParams
    ): Promise<void> {
        step.Status = result.success ? 'Completed' : 'Failed';
        const promptTokens = result.promptTokens || 0;
        const completionTokens = result.completionTokens || 0;
        step.OutputData = JSON.stringify({
            success: result.success,
            summaryLength: result.result?.summary?.length || 0,
            tokensSaved: message.metadata?.tokensSaved || 0,
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            cost: result.cost
        });

        if (!result.success) {
            step.ErrorMessage = result.errorMessage || 'AI Summary compaction failed';
        }

        await step.Save();
    }

    /**
     * Resolves system-wide default prompt for message compaction.
     * 
     * @returns System compact prompt ID
     * @protected
     */
    protected getSystemDefaultCompactPromptId(): string {
        const prompt = AIEngine.Instance.Prompts.find(p => p.Name === 'Compact Agent Message');
        if (!prompt) {
            console.warn('System default compact prompt not found. Ensure "Compact Agent Message" prompt exists.');
            return '';
        }
        return prompt.ID;
    }

    /**
     * Helper to verify if a given conversation message is a tool/action execution output.
     * 
     * @param msg - The message to check
     * @returns True if the message represents a tool result
     * @protected
     */
    protected IsToolResultMessage(msg: ChatMessage): boolean {
        const messageType = (msg as AgentChatMessage).metadata?.messageType;
        return messageType === 'action-result'
            || messageType === 'client-tool-result'
            || messageType === 'tool-result';
    }

    /**
     * Estimates character-based tokens usage for message content.
     * 
     * @param content - Text or JSON content representation
     * @param modelName - Active model ID
     * @returns Estimated tokens count
     * @protected
     */
    protected estimateTokens(content: ChatMessage['content'], modelName?: string): number {
        const text = typeof content === 'string'
            ? content
            : JSON.stringify(content);
        return this.heuristicTokenCount(text);
    }

    /**
     * Runs a character length and syntax heuristic estimation to calculate tokens count.
     * 
     * @param text - The text to process
     * @returns Estimated count
     * @private
     */
    private heuristicTokenCount(text: string): number {
        const charCount = text.length;
        const structuralChars = (text.match(/[\{\}\[\],:]/g) || []).length;
        const whitespaceChars = (text.match(/\s/g) || []).length;
        const effectiveChars = charCount - (whitespaceChars * 0.5);
        const baseTokens = effectiveChars / 4;
        const structuralTokens = structuralChars * 0.05;
        return Math.ceil(baseTokens + structuralTokens);
    }

    /**
     * Resolves the maximum input context limits for the active vendor model.
     * 
     * @param modelSelectionInfo - Active model selection details
     * @returns Token context limit
     * @protected
     */
    protected getModelContextLimit(modelSelectionInfo?: AIModelSelectionInfo): number {
        const DEFAULT_LIMIT = 8000;

        if (!modelSelectionInfo) {
            this.logStatus(`No model selection info available, using default limit: ${DEFAULT_LIMIT}`, true);
            return DEFAULT_LIMIT;
        }

        try {
            const modelSelected = modelSelectionInfo.modelSelected;
            const vendorSelected = modelSelectionInfo.vendorSelected;

            if (!modelSelected) {
                this.logStatus(`No model selected in model selection info, using default limit: ${DEFAULT_LIMIT}`, true);
                return DEFAULT_LIMIT;
            }

            if (!vendorSelected) {
                this.logStatus(`No vendor selected, using default limit: ${DEFAULT_LIMIT}`, true);
                return DEFAULT_LIMIT;
            }

            const modelVendors = modelSelected.ModelVendors;
            if (!modelVendors || modelVendors.length === 0) {
                this.logStatus(`No ModelVendors array found on model, using default limit: ${DEFAULT_LIMIT}`, true);
                return DEFAULT_LIMIT;
            }

            const vendorEntry = modelVendors.find((mv: any) => UUIDsEqual(mv.VendorID, vendorSelected.ID));
            if (!vendorEntry) {
                this.logStatus(`No matching vendor entry found in ModelVendors, using default limit: ${DEFAULT_LIMIT}`, true);
                return DEFAULT_LIMIT;
            }

            const maxInputTokens = vendorEntry.MaxInputTokens;
            if (!maxInputTokens || maxInputTokens <= 0) {
                this.logStatus(`MaxInputTokens not set or invalid on vendor entry, using default limit: ${DEFAULT_LIMIT}`, true);
                return DEFAULT_LIMIT;
            }

            this.logStatus(`Using vendor-specific MaxInputTokens: ${maxInputTokens} (Model: ${modelSelected.Name}, Vendor: ${vendorSelected.Name})`, true);
            return maxInputTokens;

        } catch (error) {
            this.logStatus(`Error extracting model context limit: ${error}, using default limit: ${DEFAULT_LIMIT}`, true);
            return DEFAULT_LIMIT;
        }
    }

    /**
     * Estimates total token count across a collection of conversation messages.
     * 
     * @param messages - Array of conversation messages
     * @returns Total aggregated token estimate
     * @protected
     */
    protected estimateConversationTokens(messages: ChatMessage[]): number {
        return messages.reduce((total, msg) => {
            return total + this.estimateTokens(msg.content);
        }, 0);
    }

    /**
     * Dispatches message lifecycle callbacks to register changes under AgentRunner.
     * 
     * @param event - Message lifecycle event structure
     * @protected
     */
    protected emitMessageLifecycleEvent(event: MessageLifecycleEvent): void {
        if (this._messageLifecycleCallback) {
            this._messageLifecycleCallback(event);
        }
    }

    /**
     * Restores an AI-compacted message back to its uncompacted original representation.
     * 
     * @param request - Decision request detailing the messageIndex to restore
     * @param params - Execution params
     * @param currentTurn - Current sequence turn number
     * @protected
     */
    protected executeExpandMessageStep(
        request: BaseAgentNextStep,
        params: ExecuteAgentParams,
        currentTurn: number
    ): void {
        const messageIndex = request.messageIndex;
        const reason = request.expandReason;

        if (messageIndex === undefined || messageIndex < 0 || messageIndex >= params.conversationMessages.length) {
            console.warn(`Cannot expand message: index ${messageIndex} out of bounds`);
            return;
        }

        const message = params.conversationMessages[messageIndex] as AgentChatMessage;

        if (!message.metadata?.canExpand || !message.metadata?.originalContent) {
            console.warn(`Cannot expand message at index ${messageIndex}: not expandable or no original content`);
            return;
        }

        message.content = message.metadata.originalContent;
        message.metadata.wasCompacted = false;
        message.metadata.canExpand = false;
        delete message.metadata.originalContent;

        this.emitMessageLifecycleEvent({
            type: 'message-expanded',
            turn: currentTurn,
            messageIndex,
            message,
            reason: reason || 'Agent requested expansion'
        });

        if (params.verbose) {
            console.log(`[Turn ${currentTurn}] Expanded message at index ${messageIndex}`);
        }
    }

    /**
     * Checks if a prompt execution result represents a fatal setup/auth configuration error.
     * 
     * @param promptResult - The prompt execution result
     * @returns True if error is fatal, false otherwise
     * @protected
     */
    protected isFatalPromptError(promptResult: AIPromptRunResult): boolean {
        if (promptResult?.errorMessage) {
            const templateErrorPattern = /Failed to render/i;
            if (templateErrorPattern.test(promptResult.errorMessage)) {
                return true;
            }

            if (promptResult.errorMessage.includes('No suitable model found') ||
                promptResult.errorMessage.includes('No credentials found') ||
                promptResult.errorMessage.includes('No valid API credentials')) {
                return true;
            }
        }

        if (!promptResult?.chatResult?.errorInfo) {
            return false;
        }

        const errorInfo = promptResult.chatResult.errorInfo;

        if (errorInfo.severity === 'Fatal') {
            return true;
        }

        const fatalErrorTypes: AIErrorType[] = [
            'ContextLengthExceeded',
            'Authentication',
            'NoCredentials',
            'InvalidRequest'
        ];

        return fatalErrorTypes.includes(errorInfo.errorType);
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
        agentRun: MJAIAgentRunEntityExtended
    ): Promise<{
        exceeded: boolean;
        type?: 'cost' | 'tokens' | 'iterations' | 'time';
        limit?: number;
        current?: number;
        reason?: string;
    }> {
        const agent = params.agent;

        // Check absolute maximum iterations (safety net to prevent infinite loops)
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
        if (this._generalValidationRetryCount >= BaseAgentState.MAX_VALIDATION_RETRIES) {
            return {
                exceeded: true,
                type: 'iterations', // Using iterations type since validation retries are a form of iteration
                limit: BaseAgentState.MAX_VALIDATION_RETRIES,
                current: this._generalValidationRetryCount,
                reason: `Maximum validation retries of ${BaseAgentState.MAX_VALIDATION_RETRIES} exceeded. The agent is unable to produce valid output after ${this._generalValidationRetryCount} validation failures.`
            };
        }
        
        // No guardrails exceeded
        return { exceeded: false };
    }

    /**
     * Helper method to determine if a prompt execution error is caused by missing or incorrect configuration.
     *
     * This method provides detailed diagnostic information to help identify what configuration
     * is missing or incorrect.
     *
     * @param {string} errorMessage - The error message string
     * @param {AgentConfiguration} [config] - Optional agent configuration to check for missing pieces
     * @returns {{isConfigError: boolean, detailedMessage: string}} Object with determination and detailed diagnostic message
     * @protected
     */
    protected isConfigurationError(
        errorMessage: string,
        config?: AgentConfiguration
    ): { isConfigError: boolean; detailedMessage: string } {
        // Extract the property name from the error up front — used by the
        // narrowed classifier below to decide whether this is a genuine config
        // issue or a generic runtime exception that should bubble up normally.
        const propertyMatch = errorMessage.match(/reading '(\w+)'/i);
        const accessedProperty = propertyMatch ? propertyMatch[1].toLowerCase() : '';

        // Only `.map/.x on undefined` errors that reference config-related
        // properties are treated as configuration errors. Generic runtime
        // errors (e.g. a tool handler crashing on `rows.map`) should not
        // terminate the run as "unrecoverable config issue" — they should
        // fail the step and let the agent try to recover.
        const CONFIG_RELATED_PROPERTIES = new Set([
            'prompt', 'childprompt', 'systemprompt', 'prompts',
            'agent', 'agents', 'agenttype', 'agenttypes',
            'model', 'models', 'vendor', 'vendors',
            'template', 'templates',
        ]);
        const isConfigRelatedProperty = accessedProperty !== ''
            && CONFIG_RELATED_PROPERTIES.has(accessedProperty);

        // Check for common configuration error patterns
        const configErrorPatterns = [
            {
                // Only match when the accessed property is config-related.
                // Without this guard, any runtime `.map on undefined` (e.g.
                // in an artifact tool handler) gets misclassified as a fatal
                // configuration error and the agent run terminates.
                pattern: isConfigRelatedProperty
                    ? /cannot read propert(y|ies) of (undefined|null)/i
                    : /__NEVER_MATCH_GENERIC_UNDEFINED_ACCESS__/,
                getMessage: () => {
                    const property = accessedProperty || 'unknown property';

                    let details = `Attempted to access property '${property}' on an undefined or null object.`;

                    // Provide specific guidance based on the property name
                    if (property.toLowerCase().includes('prompt')) {
                        details += `\n\n🔧 Configuration Issue: Missing prompt configuration.`;
                        if (config) {
                            if (!config.childPrompt) {
                                details += `\n   - Agent does not have a child prompt configured`;
                                // Get agent-type-specific guidance
                                if (this.AgentTypeInstance) {
                                    const guidance = this.AgentTypeInstance.GetPromptConfigurationGuidance();
                                    details += `\n${guidance}`;
                                }
                            }
                            if (!config.systemPrompt) {
                                details += `\n   - Agent type does not have a system prompt configured`;
                             }
                        }
                    } else if (property.toLowerCase().includes('agent')) {
                        details += `\n\n🔧 Configuration Issue: Missing agent configuration.`;
                        details += `\n   - Ensure agent type is properly configured`;
                        details += `\n   - Check that agent metadata is complete`;
                    }

                    return details;
                }
            },
            {
                pattern: /childprompt is (undefined|null|not defined)/i,
                getMessage: () => {
                    let details = `Agent is missing required child prompt configuration.\n\n` +
                           `🔧 Configuration Fix:\n`;

                    if (this.AgentTypeInstance) {
                        const guidance = this.AgentTypeInstance.GetPromptConfigurationGuidance();
                        details += `${guidance}`;
                    } else {
                        details += `   - Ensure agent has AI Agent Prompts relationship configured\n` +
                                   `   - Verify that prompt exists in AI Prompts table and is active`;
                    }

                    return details;
                }
            },
            {
                pattern: /systemprompt is (undefined|null|not defined)/i,
                getMessage: () => {
                    return `Agent type is missing system prompt configuration.\n\n` +
                           `🔧 Configuration Fix:\n` +
                           `   - Check agent type's SystemPromptID in AI Agent Types table\n` +
                           `   - Verify system prompt exists and is active\n` +
                           `   - Some agent types (like Flow) may not require system prompts`;
                }
            },
            {
                pattern: /no prompts configured/i,
                getMessage: () => {
                    return `Agent has no prompts configured.\n\n` +
                           `🔧 Configuration Fix:\n` +
                           `   - Add at least one AI Agent Prompt relationship to this agent\n` +
                           `   - Or for Flow agents: Add Prompt-type steps to the agent's step graph`;
                }
            },
            {
                pattern: /agent type not found/i,
                getMessage: () => {
                    return `Agent references an agent type that doesn't exist.\n\n` +
                           `🔧 Configuration Fix:\n` +
                           `   - Verify TypeID in AI Agents table matches existing AI Agent Types record\n` +
                           `   - Check that AIEngine.Instance.AgentTypes includes the required type\n` +
                           `   - Ensure Config() has been called to load agent types`;
                }
            },
            {
                pattern: /child prompt not found/i,
                getMessage: () => {
                    return `Referenced child prompt doesn't exist or isn't loaded.\n\n` +
                           `🔧 Configuration Fix:\n` +
                           `   - Check AI Agent Prompts relationship has valid PromptID\n` +
                           `   - Verify prompt exists in AI Prompts table\n` +
                           `   - Ensure AIEngine.Instance.Prompts includes the prompt`;
                }
            },
            {
                pattern: /agent configuration/i,
                getMessage: () => {
                    return `General agent configuration error.\n\n` +
                           `🔧 Configuration Check:\n` +
                           `   - Review agent metadata in AI Agents table\n` +
                           `   - Check all foreign key relationships are valid\n` +
                           `   - Verify agent type is properly configured`;
                }
            },
            {
                pattern: /Failed to render.*child prompt templates/i,
                getMessage: () => {
                    return `Template rendering error: ${errorMessage}\n\n` +
                           `🔧 Template Configuration Fix:\n` +
                           `   - Check nunjucks template syntax in prompt content\n` +
                           `   - Use {% raw %}{{}}{% endraw %} for literal braces in examples\n` +
                           `   - Verify all template variables are properly defined\n` +
                           `   - Ensure template variables referenced in content exist in context`;
                }
            }
        ];

        // Check each pattern
        for (const { pattern, getMessage } of configErrorPatterns) {
            if (pattern.test(errorMessage)) {
                const detailedMessage = getMessage();
                return {
                    isConfigError: true,
                    detailedMessage: `Configuration Error: ${detailedMessage}\n\nOriginal Error: ${errorMessage}`
                };
            }
        }

        // Not a configuration error
        return {
            isConfigError: false,
            detailedMessage: errorMessage
        };
    }


    /**
     * Gathers all template variables and context information for rendering prompts.
     * Combines agent metadata, active actions, sub-agents, client tools, and application states.
     * 
     * @param agent - Agent entity configuration
     * @param _contextUser - User context
     * @param extraData - Custom parameters and session states
     * @param actionChanges - Runtime additions or removals of actions
     * @returns Context data structure for templates compile
     * @private
     */
    private async gatherPromptTemplateData(
        agent: MJAIAgentEntityExtended,
        _contextUser?: UserInfo,
        extraData?: any,
        actionChanges?: ActionChange[]
    ): Promise<AgentContextData> {
        try {
            const engine = AIEngine.Instance;

            const activeSubAgents = engine.Agents.filter(a => UUIDsEqual(a.ParentID, agent.ID) && a.Status === 'Active')
                .sort((a, b) => a.ExecutionOrder - b.ExecutionOrder);
            const activeAgentRelationships = engine.AgentRelationships.filter(ar => UUIDsEqual(ar.AgentID, agent.ID) && ar.Status === 'Active');
            
            const uniqueActiveSubAgentIDs = new Set<string>();
            activeSubAgents.forEach(a => uniqueActiveSubAgentIDs.add(a.ID));
            activeAgentRelationships.forEach(ar => uniqueActiveSubAgentIDs.add(ar.SubAgentID));
            const uniqueActiveSubAgents = Array.from(uniqueActiveSubAgentIDs).map(id => engine.Agents.find(a => UUIDsEqual(a.ID, id)));

            const agentActions = engine.AgentActions.filter(aa => UUIDsEqual(aa.AgentID, agent.ID) && aa.Status === 'Active');
            let actions: MJActionEntityExtended[] = ActionEngineServer.Instance.Actions.filter(a => agentActions.some(aa => UUIDsEqual(aa.ActionID, a.ID)));

            if (actionChanges?.length) {
                const isRoot = this._depth === 0;
                const result = this.applyActionChanges(actions, actionChanges, agent.ID, isRoot);
                actions = result.actions;
                this._dynamicActionLimits = result.dynamicLimits;
            }

            const activeActions = actions.filter(a => a.Status === 'Active');
            this._effectiveActions = activeActions;

            const agentType = engine.AgentTypes.find(at => UUIDsEqual(at.ID, agent.TypeID));
            const runtimePromptParamOverrides = extraData?.__agentTypePromptParams as Record<string, unknown> | undefined;
            const agentTypePromptParams = this.buildAgentTypePromptParams(
                agentType,
                agent,
                runtimePromptParamOverrides
            );

            const clientToolDetails = this.buildClientToolPromptSection(agent, extraData);
            const appContext = this.buildAppContextSection(extraData);

            const contextData: AgentContextData = {
                agentName: agent.Name,
                agentDescription: agent.Description,
                parentAgentName: agent.Parent ? agent.Parent.trim() : "",
                subAgentCount: uniqueActiveSubAgents.length,
                subAgentDetails: this.formatSubAgentDetails(uniqueActiveSubAgents),
                actionCount: activeActions.length,
                actionDetails: this.formatActionDetails(activeActions),
                clientToolDetails: clientToolDetails,
                appContext: appContext,
            };

            const result: AgentContextData & Record<string, unknown> = {
                ...contextData,
                __agentTypePromptParams: agentTypePromptParams
            };

            if (extraData) {
                const { __agentTypePromptParams: _ignored, appContext: _ignoredAppContext, ...restExtraData } = extraData;
                return {
                    ...result,
                    ...restExtraData
                };
            } else {
                return result;
            }
        } catch (error) {
            throw new Error(`Error gathering context data: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Resolves the parameters metadata object using the schema definitions.
     * 
     * @param agentType - Agent type metadata
     * @param agent - Agent entity instance
     * @param runtimeOverrides - Explicit prompt configuration overrides
     * @returns Merged parameters map
     * @protected
     */
    protected buildAgentTypePromptParams(
        agentType: MJAIAgentTypeEntity | undefined,
        agent: MJAIAgentEntityExtended,
        runtimeOverrides?: Record<string, unknown>
    ): Record<string, unknown> {
        const schemaJson = agentType?.PromptParamsSchema;
        const schemaDefaults = this.extractSchemaDefaults(schemaJson);

        const agentParamsJson = agent.AgentTypePromptParams;
        let agentParams: Record<string, unknown> = {};
        if (agentParamsJson) {
            try {
                agentParams = JSON.parse(agentParamsJson);
            } catch (e) {
                LogError(`Failed to parse AgentTypePromptParams for agent ${agent.Name}: ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        const merged = {
            ...schemaDefaults,
            ...agentParams,
            ...(runtimeOverrides || {})
        };

        const explicitResponseType = (runtimeOverrides?.includeResponseTypeDefinition as Record<string, unknown> | undefined) ||
                                     (agentParams.includeResponseTypeDefinition as Record<string, unknown> | undefined);
        this.applyResponseTypeAutoAlignment(merged, explicitResponseType);

        return merged;
    }

    /**
     * Align Response Type Definitions options with documentation flags.
     * 
     * @param params - Merged parameters object modified in place
     * @param explicitResponseType - Explicit response type configuration
     * @protected
     */
    protected applyResponseTypeAutoAlignment(
        params: Record<string, unknown>,
        explicitResponseType?: Record<string, unknown>
    ): void {
        if (!params.includeResponseTypeDefinition || typeof params.includeResponseTypeDefinition !== 'object') {
            params.includeResponseTypeDefinition = {
                payload: true,
                responseForms: true,
                commands: true,
                forEach: true,
                while: true,
                scratchpad: true
            };
        }

        const responseType = params.includeResponseTypeDefinition as Record<string, unknown>;

        const alignmentMappings: Array<{ docsFlag: string; responseTypeKey: string }> = [
            { docsFlag: 'includePayloadInPrompt', responseTypeKey: 'payload' },
            { docsFlag: 'includeResponseFormDocs', responseTypeKey: 'responseForms' },
            { docsFlag: 'includeCommandDocs', responseTypeKey: 'commands' },
            { docsFlag: 'includeForEachDocs', responseTypeKey: 'forEach' },
            { docsFlag: 'includeWhileDocs', responseTypeKey: 'while' },
            { docsFlag: 'includeScratchpadDocs', responseTypeKey: 'scratchpad' }
        ];

        for (const { docsFlag, responseTypeKey } of alignmentMappings) {
            const explicitVal = explicitResponseType?.[responseTypeKey];
            if (explicitVal !== undefined) {
                responseType[responseTypeKey] = explicitVal;
                continue;
            }

            const docsEnabled = params[docsFlag];
            if (docsEnabled === false) {
                responseType[responseTypeKey] = false;
            }
        }
    }

    /**
     * Extracts default key-value pairs from prompt schema JSON definitions.
     * 
     * @param schemaJson - Prompt parameter schema JSON
     * @returns Object mapping property names to default values
     * @protected
     */
    protected extractSchemaDefaults(schemaJson: string | null | undefined): Record<string, unknown> {
        if (!schemaJson) return {};

        try {
            const schema = JSON.parse(schemaJson);
            const defaults: Record<string, unknown> = {};

            if (schema.properties) {
                for (const [key, prop] of Object.entries(schema.properties)) {
                    const propDef = prop as { default?: unknown };
                    if (propDef.default !== undefined) {
                        defaults[key] = propDef.default;
                    }
                }
            }

            return defaults;
        } catch (e) {
            LogError(`Failed to parse PromptParamsSchema: ${e instanceof Error ? e.message : String(e)}`);
            return {};
        }
    }

    /**
     * Applies runtime modifications (additions/removals) on available Actions list.
     * 
     * @param baseActions - The base actions allowed for the agent
     * @param actionChanges - Runtime adjustments configuration
     * @param agentId - Active Agent ID
     * @param isRoot - True if this agent runs at root depth 0
     * @returns Adjusted actions list and dynamic execution limits
     * @protected
     */
    protected applyActionChanges(
        baseActions: MJActionEntityExtended[],
        actionChanges: ActionChange[],
        agentId: string,
        isRoot: boolean
    ): { actions: MJActionEntityExtended[]; dynamicLimits: Record<string, number> } {
        let actions = [...baseActions];
        const dynamicLimits: Record<string, number> = {};

        for (const change of actionChanges) {
            if (!this.doesChangeScopeApply(change.scope, agentId, isRoot, change.agentIds)) {
                continue;
            }

            if (change.mode === 'add') {
                for (const actionId of change.actionIds) {
                    if (!actions.some(a => UUIDsEqual(a.ID, actionId))) {
                        const actionToAdd = ActionEngineServer.Instance.Actions.find(a => UUIDsEqual(a.ID, actionId));
                        if (actionToAdd) {
                            actions.push(actionToAdd);
                            if (change.actionLimits?.[actionId] != null) {
                                dynamicLimits[actionId] = change.actionLimits[actionId];
                            }
                        } else {
                            LogStatus(`Action with ID '${actionId}' not found in ActionEngineServer - skipping add`);
                        }
                    }
                }
            } else if (change.mode === 'remove') {
                actions = actions.filter(a => !change.actionIds.some(id => UUIDsEqual(id, a.ID)));
            }
        }

        return { actions, dynamicLimits };
    }

    /**
     * Propagates relevant action updates to downstream sub-agents execution.
     * 
     * @param actionChanges - Original action updates
     * @returns Filtered updates array for downstream runs
     * @protected
     */
    protected filterActionChangesForSubAgent(
        actionChanges: ActionChange[] | undefined
    ): ActionChange[] | undefined {
        if (!actionChanges?.length) {
            return undefined;
        }

        const filtered: ActionChange[] = [];

        for (const change of actionChanges) {
            switch (change.scope) {
                case 'root':
                    continue;

                case 'global':
                    filtered.push(change);
                    break;

                case 'all-subagents':
                    filtered.push({ ...change, scope: 'global' });
                    break;

                case 'specific':
                    filtered.push(change);
                    break;
            }
        }

        return filtered.length > 0 ? filtered : undefined;
    }

    /**
     * Filters action modifications scopes according to hierarchy rules.
     * 
     * @param scope - Scope mode
     * @param agentId - Active Agent ID
     * @param isRoot - True if running at root depth 0
     * @param agentIds - Scope specific target agent IDs
     * @returns True if modification applies to this agent
     * @protected
     */
    protected doesChangeScopeApply(
        scope: ActionChangeScope,
        agentId: string,
        isRoot: boolean,
        agentIds?: string[]
    ): boolean {
        switch (scope) {
            case 'global':
                return true;
            case 'root':
                return isRoot;
            case 'all-subagents':
                return !isRoot;
            case 'specific':
                return agentIds?.includes(agentId) ?? false;
            default:
                return false;
        }
    }

    /**
     * Compiles client browser tools documentation to inject into the system prompt context.
     * 
     * @param agent - Active agent configuration
     * @param extraData - Custom session data containing session ID and browser tools
     * @returns Markdown text of browser tools documentation
     * @private
     */
    private buildClientToolPromptSection(agent: MJAIAgentEntityExtended, extraData?: Record<string, unknown>): string {
        const toolMap = new Map<string, ClientToolMetadata>();

        const engine = AIEngine.Instance;
        const metadataTools = engine.GetClientToolsForAgent(agent.ID);
        for (const tool of metadataTools) {
            toolMap.set(tool.Name, {
                Name: tool.Name,
                Description: tool.Description,
                InputSchema: tool.InputSchemaJSON ? JSON.parse(tool.InputSchemaJSON) : {},
                OutputSchema: tool.OutputSchemaJSON ? JSON.parse(tool.OutputSchemaJSON) : undefined,
                Category: tool.Category || undefined,
                DefaultTimeoutMs: tool.DefaultTimeoutMs || undefined
            });
        }

        const sessionID = extraData?.sessionID as string | undefined;
        if (sessionID) {
            for (const tool of ClientToolRequestManager.Instance.GetSessionTools(sessionID)) {
                if (!toolMap.has(tool.Name)) {
                    toolMap.set(tool.Name, tool);
                }
            }
        }

        if (extraData?.clientTools) {
            for (const tool of extraData.clientTools as ClientToolMetadata[]) {
                if (!toolMap.has(tool.Name)) {
                    toolMap.set(tool.Name, tool);
                }
            }
        }

        const tools = Array.from(toolMap.values());

        if (tools.length === 0) {
            return '';
        }

        const lines: string[] = [];
        lines.push('### Client Tools (execute in the user\'s browser)');
        lines.push('Client tools run in the user\'s browser and interact with the UI. Use these when you need');
        lines.push('to navigate the user somewhere, display a specific view, switch dashboard tabs, or show');
        lines.push('records. When you choose client tools, set nextStep.type to "ClientTools".');
        lines.push('');
        lines.push('NOTE: Do NOT use client tools for asking the user questions or collecting input.');
        lines.push('Use the "Chat" step for that. Client tools are for programmatic UI interaction only.');
        lines.push('');

        for (const tool of tools) {
            const categoryTag = tool.Category ? ` [${tool.Category}]` : '';
            lines.push(`- **${tool.Name}**${categoryTag}: ${tool.Description}`);

            const props = (tool.InputSchema as Record<string, unknown>)?.properties as Record<string, Record<string, unknown>> | undefined;
            const required = (tool.InputSchema as Record<string, unknown>)?.required as string[] | undefined;
            if (props) {
                const paramParts = Object.entries(props).map(([name, schema]) => {
                    const req = required?.includes(name) ? '\\*' : '';
                    const desc = schema.description ? ` — ${schema.description}` : '';
                    return `\`${name}\`${req}${desc}`;
                });
                lines.push(`  Inputs: ${paramParts.join(', ')}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Compiles the user's active application interface and view metadata for system prompts.
     * 
     * @param extraData - Custom session data containing app context
     * @returns Markdown text summarizing current app context
     * @private
     */
    private buildAppContextSection(extraData?: Record<string, unknown>): string {
        const ctx = extraData?.appContext as Record<string, unknown> | undefined;
        if (!ctx) return '';

        const app = ctx['App'] as { Name?: string; Description?: string } | undefined;
        const activeNav = ctx['ActiveNavItem'] as { Name?: string; Description?: string; ResourceType?: string } | undefined;
        const otherNavs = ctx['OtherNavItems'] as Array<{ Name?: string; Description?: string }> | undefined;
        const user = ctx['User'] as { Name?: string; Roles?: string[] } | undefined;

        if (!app?.Name) return '';

        const lines: string[] = [];
        lines.push('### Current Application Context');
        lines.push(`The user is currently in the **${app.Name}** application${app.Description ? ` — ${app.Description}` : ''}.`);

        if (activeNav?.Name) {
            lines.push('');
            lines.push(`**Active view:** ${activeNav.Name}${activeNav.Description ? ` — ${activeNav.Description}` : ''}${activeNav.ResourceType ? ` (${activeNav.ResourceType})` : ''}`);
        }

        if (otherNavs && otherNavs.length > 0) {
            lines.push('');
            lines.push('**Other views available in this app:**');
            for (const nav of otherNavs) {
                lines.push(`- ${nav.Name}${nav.Description ? ` — ${nav.Description}` : ''}`);
            }
        }

        if (user?.Name) {
            lines.push('');
            lines.push(`**User:** ${user.Name}${user.Roles?.length ? ` (Roles: ${user.Roles.join(', ')})` : ''}`);
        }

        return lines.join('\n');
    }

    /**
     * Renders a markdown list describing child sub-agents properties.
     * 
     * @param subAgents - Sub-agent entity records list
     * @returns Formatted markdown string
     * @private
     */
    private formatSubAgentDetails(subAgents: MJAIAgentEntityExtended[]): string {
        return subAgents.map(sa => {
            let line = `- **${sa.Name}** — ${sa.Description}`;
            if (sa.ExecutionMode !== 'Sequential') {
                line += ` _(${sa.ExecutionMode}, order: ${sa.ExecutionOrder})_`;
            }
            return line;
        }).join('\n');
    }

    /**
     * Resolves variables metadata array defined on an agent's main prompt templates.
     * 
     * @param agent - Agent entity
     * @returns Array of template parameters
     * @protected
     */
    protected getAgentPromptParameters(agent: MJAIAgentEntityExtended): Array<MJTemplateParamEntity> {
        const engine = AIEngine.Instance;
        const agentPrompt = engine.AgentPrompts
            .filter(ap => UUIDsEqual(ap.AgentID, agent.ID) && ap.Status === 'Active')
            .sort((a, b) => a.ExecutionOrder - b.ExecutionOrder)[0];

        if (!agentPrompt) return [];

        const prompt = engine.Prompts.find(p => UUIDsEqual(p.ID, agentPrompt.PromptID));
        if (!prompt) return [];

        return prompt.TemplateParams;
    }

    /**
     * JSON formats the active parameters metadata defined on the agent's primary prompt.
     * 
     * @param agent - Agent entity
     * @returns JSON string of parameters metadata
     * @protected
     */
    protected getAgentPromptParametersJSON(agent: MJAIAgentEntityExtended): string {
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
     * Formats available actions parameters, constraints, and success/error codes as markdown sections.
     * 
     * @param actions - Active actions array
     * @returns Markdown text of actions details
     * @private
     */
    private formatActionDetails(actions: MJActionEntityExtended[]): string {
        return actions.map(action => {
            const lines: string[] = [];
            lines.push(`### ${action.Name}`);
            lines.push(action.Description);

            const inputParams = action.Params
                .filter(p => {
                    const t = p.Type.trim().toLowerCase();
                    return t === 'input' || t === 'both';
                });
            const outputParams = action.Params
                .filter(p => {
                    const t = p.Type.trim().toLowerCase();
                    return t === 'output' || t === 'both';
                });

            if (inputParams.length > 0) {
                lines.push(`**Input:** ${inputParams.map(p => this.formatActionParameter(p)).join(', ')}`);
            }
            if (outputParams.length > 0) {
                lines.push(`**Output:** ${outputParams.map(p => this.formatActionParameter(p)).join(', ')}`);
            }

            if (action.ResultCodes.length > 0) {
                const rcParts = action.ResultCodes.map(rc => {
                    const marker = rc.IsSuccess ? '✓' : '✗';
                    const desc = rc.Description && rc.Description.toLowerCase() !== rc.ResultCode.toLowerCase()
                        ? ` ${rc.Description}`
                        : '';
                    return `${rc.ResultCode} ${marker}${desc}`;
                });
                lines.push(`**Results:** ${rcParts.join(' · ')}`);
            }

            return lines.join('\n');
        }).join('\n\n');
    }

    /**
     * Translates a single action parameter entity to a compact inline description string.
     * 
     * @param param - Parameter metadata entity
     * @returns Inline description string
     * @private
     */
    private formatActionParameter(param: MJActionParamEntity): string {
        const requiredMarker = param.IsRequired ? '\\*' : '';
        const parts: string[] = [];

        if (param.IsArray) {
            parts.push('array');
        }

        const vt = param.ValueType?.trim();
        if (vt && vt !== 'Scalar' && vt !== 'Other') {
            parts.push(vt);
        }

        const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : '';

        let defaultStr = '';
        if (param.DefaultValue != null && param.DefaultValue !== '') {
            defaultStr = ` (default: ${JSON.stringify(param.DefaultValue)})`;
        }

        const desc = param.Description ? ` — ${param.Description}` : '';
        return `\`${param.Name}\`${requiredMarker}${suffix}${desc}${defaultStr}`;
    }

    /**
     * Scans message content for media ref placeholders and flags matching media for database persistence.
     * Strips browser incompatible media source tags from clean output messages.
     * 
     * @param message - The raw message content
     * @returns Cleansed message content string
     * @protected
     */
    protected processMessageMediaPlaceholders(message: string): string {
        if (!message) {
            return message;
        }

        const hasRefIds = this._mediaOutputs.some(m => m.refId);
        if (!hasRefIds) {
            return message;
        }

        const placeholderRegex = /\$\{media:([a-zA-Z0-9_-]+)\}/g;
        let match;
        let promotedCount = 0;

        while ((match = placeholderRegex.exec(message)) !== null) {
            const refId = match[1];
            const media = this._mediaOutputs.find(m => m.refId === refId);
            if (media && media.persist !== true) {
                media.persist = true;
                promotedCount++;
            }
        }

        if (promotedCount > 0) {
            this.logStatus(`📎 Auto-promoted ${promotedCount} media output(s) from message placeholders`, true);
        }

        let cleanedMessage = message
            .replace(/<img[^>]*src=["']\$\{media:[^}]+\}["'][^>]*\/?>/gi, '')
            .replace(/<audio[^>]*src=["']\$\{media:[^}]+\}["'][^>]*>.*?<\/audio>/gi, '')
            .replace(/<video[^>]*src=["']\$\{media:[^}]+\}["'][^>]*>.*?<\/video>/gi, '')
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            .trim();

        return cleanedMessage;
    }
}
