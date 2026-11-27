/**
 * @fileoverview Collaborator owned by {@link AgentPromptHelper} encapsulating prompt parameter
 * preparation & finalization (`PreparePromptParams`, `FinalizePromptParams`), prompt execution
 * (`ExecutePrompt`, `DetermineNextStep`), and the full `ExecutePromptStep` orchestration loop.
 *
 * @module @memberjunction/ai-agents
 */

import {
    AIPromptParams,
    ChildPromptParam,
    ResolvePromptRunUserID,
    type AgentChatMessage,
    type AgentConfiguration,
    type AIPromptRunResult,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type MJAIPromptEntityExtended,
} from '@memberjunction/ai-core-plus';
import { CredentialScopeAllows } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { IsVerboseLoggingEnabled, LogStatus } from '@memberjunction/core';
import type { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { CopyScalarsAndArrays, MJGlobal } from '@memberjunction/global';
import { BaseAgentType } from '../../agent-types/base-agent-type';
import { LoopAgentType } from '../../agent-types/loop-agent-type';
import type { ArtifactToolCall } from '../../ArtifactToolManager';
import {
    SCRATCHPAD_NOTES_PLACEHOLDER,
    SCRATCHPAD_TASK_SUMMARY_PLACEHOLDER,
    SCRATCHPAD_TASKS_PLACEHOLDER,
} from '../../constants';
import type { ConversationToolCall } from '../../ConversationToolManager';
import type { MemoryWriteRequest } from '../../MemoryWriteManager';
import { CompactAnsweredToolCallArguments, type NativeToolResult } from '../../native-tools/tool-result-turns';
import type { PayloadChangeResultSummary } from '../../PayloadManager';
import { BuildPipelineToolDocs, type PipelineStage } from '../../pipeline';
import { ApplyScopedPromptConfig, ScopedPromptConfigResolver } from '../../scoped-prompt-config-resolver';
import type { AgentRunContext } from '../AgentRunContext';
import { AgentPayloadHelper } from '../payload/AgentPayloadHelper';
import type { BaseAgentPromptHelper } from './BaseAgentPromptHelper';

/**
 * Collaborator executing prompt parameter assembly, finalization, prompt runner invocation,
 * next-step determination, and single-turn `ExecutePromptStep` orchestration.
 */
export class AgentPromptExecutionHelper {
    public async PreparePromptParams<P>(
        ctx: AgentRunContext,
        promptHelper: BaseAgentPromptHelper,
        config: AgentConfiguration,
        payload: P,
        params: ExecuteAgentParams
    ): Promise<AIPromptParams> {
        const agentType: MJAIAgentTypeEntity = config.agentType;
        const systemPrompt: MJAIPromptEntityExtended = config.systemPrompt;
        const childPrompt: MJAIPromptEntityExtended = config.childPrompt;

        const promptTemplateData = await promptHelper.GatherPromptTemplateData(
            ctx,
            params.agent,
            params.contextUser,
            params.data,
            params.actionChanges,
            params.subAgentChanges,
            params.boundActionParams,
            ctx.ActionPolicyHelper.PromptWithholding(ctx, params),
            params.parentRun
        );

        const promptParams = new AIPromptParams();
        promptParams.agentId = params.agent.ID;
        promptParams.UserID =
            ResolvePromptRunUserID({
                UserID: params.userId,
                AgentRun: ctx.AgentRun,
                ContextUser: params.contextUser,
            }) ?? undefined;

        if (systemPrompt) {
            promptParams.prompt = systemPrompt;
            promptParams.templateMessageRole = 'system';
        } else {
            promptParams.prompt = childPrompt;
            promptParams.templateMessageRole = 'user';
        }

        promptParams.data = promptTemplateData;
        promptParams.contextUser = params.contextUser;
        ctx.Hooks.ReconcileUnansweredToolCalls(params);
        if (ctx.Hooks.GetNativeControlConfig(params).CompactToolArguments) {
            const compactionBudget = ctx.Hooks.ResolveCompactionBudget(params, config);
            if (compactionBudget.BoundedBy === 'Default' || ctx.Hooks.IsMidLoopCompactionThresholdReached(params)) {
                const compacted = CompactAnsweredToolCallArguments(params.conversationMessages as AgentChatMessage[]);
                if (compacted > 0) {
                    ctx.Hooks.LogStatus(`[NativeTools] Compacted the large arguments of ${compacted} older tool call(s)`, true, params);
                }
            }
        }
        promptParams.conversationMessages = params.conversationMessages;
        promptParams.verbose = params.verbose;

        ctx.Hooks.ApplyNativeTools(promptParams, params);

        if (params.effortLevel !== undefined && params.effortLevel !== null) {
            promptParams.effortLevel = params.effortLevel;
            ctx.Hooks.LogStatus(`🎯 Using runtime effort level: ${params.effortLevel}`, true, params);
        } else if (params.agent.DefaultPromptEffortLevel !== undefined && params.agent.DefaultPromptEffortLevel !== null) {
            promptParams.effortLevel = params.agent.DefaultPromptEffortLevel;
            ctx.Hooks.LogStatus(`🎯 Using agent default effort level: ${params.agent.DefaultPromptEffortLevel}`, true, params);
        } else if (childPrompt && childPrompt.EffortLevel !== undefined && childPrompt.EffortLevel !== null) {
            promptParams.effortLevel = childPrompt.EffortLevel;
            ctx.Hooks.LogStatus(`🎯 Using child prompt effort level: ${childPrompt.EffortLevel}`, true, params);
        }

        const atInstance = await BaseAgentType.GetAgentTypeInstance(config.agentType);
        await atInstance.InjectPayload<P>(payload, ctx.AgentTypeState, promptParams, {
            agentId: params.agent.ID,
            agentRunId: ctx.AgentRun?.ID,
        });

        if (promptParams.data) {
            const agentTypePromptParams = promptParams.data.__agentTypePromptParams as Record<string, unknown> | undefined;
            const scratchpadEnabled = agentTypePromptParams?.includeScratchpadDocs !== false;
            if (scratchpadEnabled && ctx.ScratchpadManager) {
                promptParams.data[SCRATCHPAD_NOTES_PLACEHOLDER] = ctx.ScratchpadManager.GetNotes() || '_(no notes yet)_';
                promptParams.data[SCRATCHPAD_TASKS_PLACEHOLDER] = ctx.ScratchpadManager.ToPromptString();
                promptParams.data[SCRATCHPAD_TASK_SUMMARY_PLACEHOLDER] = ctx.ScratchpadManager.GetTaskSummary();
            }

            const artifactToolsEnabled = agentTypePromptParams?.includeArtifactToolsDocs !== false;
            promptParams.data['_ARTIFACTS_ENABLED'] = ctx.Hooks.IsArtifactSupportEnabled(params.agent);
            if (artifactToolsEnabled && ctx.ArtifactToolManager.IsWorkspaceEnabled()) {
                promptParams.data['_ARTIFACT_MANIFEST'] = ctx.ArtifactToolManager.ToManifestString();
                if (ctx.Hooks.GetNativeControlConfig(params).NativeOnly) {
                    promptParams.data['_ARTIFACT_MANIFEST_NATIVE'] = ctx.ArtifactToolManager.ToManifestString({ nativeTools: true });
                }
                promptParams.data['_ARTIFACT_TOOLS'] = ctx.ArtifactToolManager.GetToolDocumentation();
                promptParams.data['_ARTIFACT_TOOL_SUMMARY'] = ctx.ArtifactToolManager.GetSummary();
                ctx.Hooks.LogStatus(
                    `[ArtifactTools] Injected workspace/manifest into prompt: ${ctx.ArtifactToolManager.GetSummary() || 'workspace tools ready'}`,
                    true,
                    params
                );
            } else if (ctx.ArtifactToolManager.HasArtifacts()) {
                ctx.Hooks.LogStatus(
                    `[ArtifactTools] Artifacts present but tools disabled by agent config (includeArtifactToolsDocs=false)`,
                    true,
                    params
                );
            }

            const conversationToolsEnabled = agentTypePromptParams?.includeConversationToolsDocs !== false;
            if (conversationToolsEnabled && ctx.ConversationToolManager.IsAvailable) {
                promptParams.data['_CONVERSATION_TOOLS'] = ctx.ConversationToolManager.GetToolDocumentation();
                if (ctx.Hooks.GetNativeControlConfig(params).NativeOnly) {
                    promptParams.data['_CONVERSATION_TOOLS_NATIVE'] = ctx.ConversationToolManager.GetToolDocumentation(true);
                }
            }

            const memoryWritesDocsEnabled = agentTypePromptParams?.includeMemoryWritesDocs !== false;
            if (memoryWritesDocsEnabled && promptHelper.MemoryWriteSkip(ctx, params) === null) {
                promptParams.data['_MEMORY_WRITES_ENABLED'] = true;
            }

            const pipelineDocsEnabled = agentTypePromptParams?.includePipelineDocs !== false;
            if (pipelineDocsEnabled) {
                const sourceNames = [
                    ...ctx.Hooks.GetEffectiveActionsForValidation(params.agent.ID).map((a) => a.Name),
                    ...ctx.ArtifactToolManager.GetAvailableToolNames(),
                ];
                const pipelineDocs = BuildPipelineToolDocs(sourceNames);
                if (pipelineDocs) {
                    promptParams.data['_PIPELINE_TOOLS'] = pipelineDocs;
                }
            }

            if (ctx.ArtifactToolManager.HasArtifacts()) {
                promptParams.nativeFileInputs = await ctx.ArtifactToolManager.GetNativeFileInputCandidates();
            }
        }

        if (systemPrompt) {
            const childPromptParams: AIPromptParams = {
                prompt: childPrompt,
                data: promptTemplateData,
                contextUser: params.contextUser,
                conversationMessages: params.conversationMessages,
                templateMessageRole: 'user',
                verbose: params.verbose,
            };

            if (params.effortLevel !== undefined && params.effortLevel !== null) {
                childPromptParams.effortLevel = params.effortLevel;
            } else if (params.agent.DefaultPromptEffortLevel !== undefined && params.agent.DefaultPromptEffortLevel !== null) {
                childPromptParams.effortLevel = params.agent.DefaultPromptEffortLevel;
            }

            if (params.apiKeys && params.apiKeys.length > 0) {
                childPromptParams.apiKeys = params.apiKeys;
            }
            childPromptParams.CredentialScope = params.CredentialScope;

            if (params.configurationId) {
                promptParams.configurationId = params.configurationId;
                childPromptParams.configurationId = params.configurationId;
            }

            promptParams.childPrompts = [new ChildPromptParam(childPromptParams, agentType.AgentPromptPlaceholder)];
        } else {
            if (params.apiKeys && params.apiKeys.length > 0) {
                promptParams.apiKeys = params.apiKeys;
            }
            if (params.configurationId) {
                promptParams.configurationId = params.configurationId;
            }
        }

        const effectiveModelSelectionMode =
            typeof AIEngine.Instance.ResolveEffectiveAgentProperties === 'function'
                ? AIEngine.Instance.ResolveEffectiveAgentProperties(params.agent).ModelSelectionMode
                : params.agent.ModelSelectionMode;
        if (effectiveModelSelectionMode === 'Agent') {
            promptParams.modelSelectionPrompt = childPrompt;
            ctx.Hooks.LogStatus(`🎯 Agent '${params.agent.Name}' configured to use its own prompt for model selection`, true, params);
        }

        if (params.override) {
            promptParams.override = params.override;
            ctx.Hooks.LogStatus(
                `🎯 Using runtime override: ${params.override.modelId || 'model'} ${params.override.vendorId ? `from vendor ${params.override.vendorId}` : ''}`,
                true,
                params
            );
        }

        if (params.apiKeys && params.apiKeys.length > 0) {
            promptParams.apiKeys = params.apiKeys;
            ctx.Hooks.LogStatus(`🔑 Using ${params.apiKeys.length} API key(s) provided at runtime`, true, params);
        }
        promptParams.CredentialScope = params.CredentialScope;
        if (!CredentialScopeAllows(params.CredentialScope, 'Environment')) {
            ctx.Hooks.LogStatus(
                `🔒 Credential scope is ${params.CredentialScope}: the platform's environment API keys will not be used`,
                true,
                params
            );
        }

        promptParams.provider = params.provider || ctx.ActiveProvider;

        const scopedConfigPromptId = promptParams.prompt?.ID;
        if (scopedConfigPromptId) {
            const configResolver =
                MJGlobal.Instance.ClassFactory.CreateInstance<ScopedPromptConfigResolver>(ScopedPromptConfigResolver) ??
                new ScopedPromptConfigResolver();
            ApplyScopedPromptConfig(
                configResolver,
                scopedConfigPromptId,
                ctx.ActionPolicyHelper.ScopedPromptConfigScope(ctx, params),
                promptParams
            );
        }

        return promptParams;
    }

    public async FinalizePromptParams<P>(
        ctx: AgentRunContext,
        promptHelper: BaseAgentPromptHelper,
        promptParams: AIPromptParams,
        config: AgentConfiguration,
        payload: P,
        params: ExecuteAgentParams
    ): Promise<AIPromptParams> {
        const volatileStateMessage = await ctx.Hooks.BuildVolatileStateMessage(
            params,
            promptParams,
            payload,
            config.childPrompt,
            config.agentType,
            config.systemPrompt
        );
        if (volatileStateMessage) {
            const isAppendOnly = ctx.Hooks.ShouldUseAppendOnlyTrailingState(promptParams);
            ctx.Hooks.RestoreTurn1VolatileStateIfNeeded(params, isAppendOnly);
            promptParams.conversationMessages = ctx.Hooks.AssembleOutgoingMessages(
                promptParams.conversationMessages ?? params.conversationMessages,
                volatileStateMessage,
                isAppendOnly
            );
            if (isAppendOnly) {
                params.conversationMessages.push(volatileStateMessage);
            }
            ctx.LastVolatileStateMessage = volatileStateMessage;
            if (promptParams.data?._SPECIALIZATION_RELOCATED === true) {
                promptParams.OnTemplateDataFinalized = (finalParams) =>
                    promptHelper.RefreshRelocatedSpecialization(ctx, finalParams, config, payload, params, volatileStateMessage);
            }
        }
        if (promptParams.conversationMessages) {
            promptParams.conversationMessages = promptHelper.DropReasoningBehindChangedHistory(
                ctx,
                params,
                promptParams.conversationMessages,
                promptParams
            );
        }
        return promptParams;
    }

    public async ExecutePrompt(ctx: AgentRunContext, promptParams: AIPromptParams): Promise<AIPromptRunResult> {
        const newParams = {
            ...promptParams,
            attemptJSONRepair: true,
        };
        return await ctx.PromptRunner.ExecutePrompt(newParams);
    }

    public async DetermineNextStep<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        agentType: MJAIAgentTypeEntity,
        promptResult: AIPromptRunResult,
        currentPayload: P
    ): Promise<BaseAgentNextStep<P>> {
        ctx.Hooks.LogStatus(`🎯 Agent type '${agentType.Name}' determining next step`, true, params);
        const stepParams: ExecuteAgentParams =
            ctx.AgentTypePromptParams &&
            ctx.AgentTypeInstance instanceof LoopAgentType &&
            params?.data?.__agentTypePromptParams === undefined
                ? {
                      ...params,
                      data: {
                          ...(params.data ?? {}),
                          __agentTypePromptParams: ctx.AgentTypePromptParams,
                      },
                  }
                : params;
        const nextStep = await ctx.AgentTypeInstance!.DetermineNextStep<P>(
            promptResult,
            stepParams,
            currentPayload,
            ctx.AgentTypeState,
            ctx.NativeToolBindings
        );
        return nextStep;
    }

    public async ExecutePromptStep<P = unknown>(
        ctx: AgentRunContext,
        promptHelper: BaseAgentPromptHelper,
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision?: BaseAgentNextStep,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep<P>> {
        await promptHelper.RunHeldDecisions(ctx, params);

        const promptToUse = await ctx.AgentTypeInstance!.GetPromptForStep(
            params,
            config,
            previousDecision?.newPayload || previousDecision?.previousPayload,
            ctx.AgentTypeState,
            previousDecision
        );
        const promptId = promptToUse?.ID;
        const promptName = promptToUse?.Name;

        const scratchpadSnapshotBeforeStep = ctx.ScratchpadManager.HasContent() ? ctx.ScratchpadManager.ToJSON() : undefined;
        const inputData = {
            promptId: promptId,
            promptName: promptName,
            isRetry: !!previousDecision,
            retryContext: previousDecision
                ? {
                      reason: previousDecision.retryReason,
                      instructions: previousDecision.retryInstructions,
                  }
                : undefined,
            ...ctx.Hooks.CapturePromptStepMessages(params.conversationMessages),
            ...(scratchpadSnapshotBeforeStep && { scratchpad: scratchpadSnapshotBeforeStep }),
        };

        const payload = previousDecision?.newPayload || params.payload;
        const stepEntity = await ctx.Hooks.CreateStepEntity({
            stepType: 'Prompt',
            stepName: 'Execute Agent Prompt',
            contextUser: params.contextUser,
            targetId: promptId,
            inputData,
            payloadAtStart: payload,
        });

        try {
            const isRetry = !!previousDecision;
            const promptMessage = ctx.Hooks.BuildPromptProgressMessage(params, previousDecision);
            const hierarchicalStepToEmit = ctx.Hooks.BuildHierarchicalStep(stepCount + 1, ctx.ParentStepCounts);

            ctx.MessagingHelper.SafeOnProgress(ctx, params, {
                step: 'prompt_execution',
                message: ctx.Hooks.FormatHierarchicalMessage(promptMessage),
                metadata: {
                    promptId: promptId,
                    isRetry,
                    promptName: promptName,
                    stepCount: stepCount + 1,
                    hierarchicalStep: hierarchicalStepToEmit,
                },
                displayMode: 'live',
            });

            const workingPayload = ctx.PayloadHelper.WithHeldCompletionChanges(ctx, params, payload);
            let downstreamPayload = workingPayload;
            if (params.agent.PayloadSelfReadPaths) {
                const downstreamPaths = JSON.parse(params.agent.PayloadSelfReadPaths);
                downstreamPayload = ctx.PayloadManager.extractDownstreamPayload(
                    `Self: ${params.agent.Name}`,
                    workingPayload,
                    downstreamPaths
                );
            }

            const promptConfig =
                promptToUse && promptToUse !== config.childPrompt
                    ? {
                          ...config,
                          childPrompt: promptToUse,
                          systemPrompt: null,
                      }
                    : config;

            if (ctx.AgentRun) {
                ctx.AgentRun.TotalPromptIterations = (ctx.AgentRun.TotalPromptIterations || 0) + 1;
            }

            const promptParams = await promptHelper.FinalizePromptParams(
                ctx,
                await ctx.Hooks.PreparePromptParams(promptConfig, downstreamPayload, params),
                promptConfig,
                downstreamPayload,
                params
            );

            promptParams.cancellationToken = params.cancellationToken;
            let pendingStreamingChunk: Parameters<NonNullable<typeof params.onStreaming>>[0] | null = null;
            let streamingCoalesceTimer: ReturnType<typeof setTimeout> | null = null;
            let lastStreamingEmitTime = 0;
            const streamingCoalesceWindowMS = 35; // coalesce rapid token chunks over ~35ms

            const flushPendingStreamingChunk = () => {
                if (streamingCoalesceTimer !== null) {
                    clearTimeout(streamingCoalesceTimer);
                    streamingCoalesceTimer = null;
                }
                if (pendingStreamingChunk !== null && params.onStreaming) {
                    const toEmit = pendingStreamingChunk;
                    pendingStreamingChunk = null;
                    lastStreamingEmitTime = Date.now();
                    params.onStreaming(toEmit);
                }
            };

            const hasLivenessWatchdog = Boolean(ctx.LivenessWatchdog?.IsRunning);
            promptParams.onStreaming =
                params.onStreaming || hasLivenessWatchdog
                    ? (chunk) => {
                          ctx.LivenessWatchdog?.RecordProgress({
                              Kind: 'llm-stream-chunk',
                              StepEntityId: stepEntity.ID,
                              Bytes: chunk.content.length,
                          });
                          if (!params.onStreaming) {
                              return;
                          }
                          const enrichedChunk = {
                              ...chunk,
                              stepType: 'prompt' as const,
                              stepEntityId: stepEntity.ID,
                          };
                          if (chunk.isComplete) {
                              if (pendingStreamingChunk !== null) {
                                  enrichedChunk.content = pendingStreamingChunk.content + enrichedChunk.content;
                                  pendingStreamingChunk = null;
                              }
                              if (streamingCoalesceTimer !== null) {
                                  clearTimeout(streamingCoalesceTimer);
                                  streamingCoalesceTimer = null;
                              }
                              lastStreamingEmitTime = Date.now();
                              params.onStreaming(enrichedChunk);
                              return;
                          }
                          const now = Date.now();
                          if (
                              lastStreamingEmitTime === 0 ||
                              (pendingStreamingChunk === null && now - lastStreamingEmitTime >= streamingCoalesceWindowMS)
                          ) {
                              lastStreamingEmitTime = now;
                              params.onStreaming(enrichedChunk);
                              return;
                          }
                          if (pendingStreamingChunk === null) {
                              pendingStreamingChunk = { ...enrichedChunk };
                          } else {
                              pendingStreamingChunk.content += enrichedChunk.content;
                              if (enrichedChunk.modelName) {
                                  pendingStreamingChunk.modelName = enrichedChunk.modelName;
                              }
                          }
                          if (streamingCoalesceTimer === null) {
                              const delay = Math.max(1, streamingCoalesceWindowMS - (now - lastStreamingEmitTime));
                              streamingCoalesceTimer = setTimeout(() => {
                                  streamingCoalesceTimer = null;
                                  flushPendingStreamingChunk();
                              }, delay);
                          }
                      }
                    : undefined;

            promptParams.onPromptRunCreated = async (promptRunId: string) => {
                stepEntity.TargetLogID = promptRunId;
                ctx.Hooks.QueueStepSave(stepEntity, (s) => {
                    s.TargetLogID = promptRunId;
                });
            };

            let promptResult: AIPromptRunResult;
            try {
                promptResult = await ctx.Hooks.ExecutePrompt(promptParams);
            } finally {
                flushPendingStreamingChunk();
            }
            ctx.Hooks.RecordPromptUsageInTreeBudget(promptResult.promptRun, promptResult, params);
            ctx.Hooks.RecordToolCallingInstrumentation(stepEntity, promptResult);

            ctx.PromptTurnCount++;

            if (promptResult.promptRun?.ID) {
                stepEntity.TargetLogID = promptResult.promptRun.ID;
                stepEntity.PromptRun = promptResult.promptRun;
            }

            if (promptResult.modelSelectionInfo) {
                ctx.LastModelSelectionInfo = promptResult.modelSelectionInfo;
            }
            promptHelper.TrackSentPrefix(ctx, params, promptResult);

            if (params.cancellationToken?.aborted) {
                if (stepEntity && payload) {
                    stepEntity.PayloadAtEnd =
                        (ctx.Hooks.HasDefaultPayloadSerializers()
                            ? ctx.MessagingHelper.ResolveStepPayloadAtStart(ctx, stepEntity)
                            : null) ?? ctx.Hooks.SerializePayloadAtEnd(payload);
                }

                await ctx.Hooks.FinalizeStepEntity(stepEntity, false, 'Cancelled during prompt execution');
                return {
                    errorMessage: 'Cancelled during prompt execution',
                    step: 'Failed',
                    terminate: false,
                    previousPayload: payload,
                    newPayload: payload,
                };
            }

            if (!promptResult.success) {
                if (stepEntity && payload) {
                    stepEntity.PayloadAtEnd =
                        (ctx.Hooks.HasDefaultPayloadSerializers()
                            ? ctx.MessagingHelper.ResolveStepPayloadAtStart(ctx, stepEntity)
                            : null) ?? ctx.Hooks.SerializePayloadAtEnd(payload);
                }

                await ctx.Hooks.FinalizeStepEntity(stepEntity, false, promptResult.errorMessage);

                const isFatal = ctx.Hooks.IsFatalPromptError(promptResult);
                const isContextOverflow = isFatal && promptResult.chatResult?.errorInfo?.errorType === 'ContextLengthExceeded';

                if (isContextOverflow && ctx.ContextRecoveryAttempts < ctx.MaxRecoveryAttempts) {
                    ctx.ContextRecoveryAttempts++;
                    ctx.Hooks.LogStatus(`⚠️ Context length exceeded - attempting recovery by trimming conversation`, true, params);
                    return await ctx.Hooks.AttemptContextRecovery(
                        params,
                        payload,
                        promptResult.errorMessage || 'Context length exceeded',
                        promptResult.modelSelectionInfo
                    );
                }

                ctx.Hooks.LogStatus(`❌ Prompt execution failed: ${promptResult.errorMessage} (fatal: ${isFatal})`, true, params);

                return {
                    errorMessage: promptResult.errorMessage || 'Prompt execution failed',
                    step: 'Failed' as const,
                    terminate: isFatal,
                    previousPayload: payload,
                    newPayload: payload,
                };
            }

            ctx.MessagingHelper.SafeOnProgress(ctx, params, {
                step: 'decision_processing',
                message: ctx.Hooks.FormatHierarchicalMessage('Analyzing response and determining next steps'),
                metadata: {
                    stepCount: stepCount + 1,
                    hierarchicalStep: ctx.Hooks.BuildHierarchicalStep(stepCount + 1, ctx.ParentStepCounts),
                },
                displayMode: 'both',
            });

            let initialNextStep = await ctx.Hooks.DetermineNextStep<P>(params, config.agentType, promptResult, payload);

            const isUnmodifiedInheritedPayload = payload === params.payload;
            let finalPayload =
                initialNextStep.artifactDirective?.behavior === 'create-new' &&
                !initialNextStep.payloadChangeRequest &&
                initialNextStep.step === 'Sub-Agent' &&
                (ctx.PromptTurnCount <= 1 || isUnmodifiedInheritedPayload)
                    ? ({} as P)
                    : payload;
            let currentStepPayloadChangeResult: PayloadChangeResultSummary | undefined = undefined;
            const holdsCompletionChange =
                AgentPayloadHelper.CarriesCompletionChange(initialNextStep) ||
                (initialNextStep.step === 'Success' && ctx.HeldCompletionChanges.length > 0);
            if (initialNextStep.payloadChangeRequest && !holdsCompletionChange) {
                const changeResult = ctx.PayloadHelper.ApplyTurnPayloadChange(
                    ctx,
                    params,
                    initialNextStep,
                    payload,
                    isUnmodifiedInheritedPayload
                );
                currentStepPayloadChangeResult = ctx.PayloadHelper.BuildPayloadChangeResultSummary(ctx, changeResult);
                finalPayload = changeResult.result;

                const payloadCheckParams = promptParams.data?.__agentTypePromptParams as Record<string, unknown> | undefined;
                await ctx.Hooks.CheckPayloadChangesWhenOn(changeResult, initialNextStep, promptResult, payloadCheckParams, params);
            }

            ctx.PendingAgentToolResults = undefined;
            const declined: NativeToolResult[] = (initialNextStep.declinedToolCalls ?? []).map((d) => ({
                toolCallId: d.toolCallId,
                toolName: d.toolName,
                content: `Not executed. ${d.reason}`,
                isError: true,
            }));
            if (initialNextStep.agentToolCalls?.length || declined.length) {
                const ran = await ctx.Hooks.ExecuteAgentToolCallsAsSteps(initialNextStep.agentToolCalls ?? [], finalPayload, params);
                finalPayload = ran.payload;
                const results = [...ran.results, ...declined];
                initialNextStep = ctx.Hooks.DeclineTerminalAfterFailedWrite(initialNextStep, results);
                ctx.PendingAgentToolResults = { results };
            }

            if (initialNextStep.scratchpad) {
                ctx.ScratchpadManager.ApplyScratchpadChanges(initialNextStep.scratchpad);
                const maxTasks = 50; // default scratchpad task retention cap
                const pruned = ctx.ScratchpadManager.EnforceTaskLimit(maxTasks);
                if (pruned > 0 && (params.verbose === true || IsVerboseLoggingEnabled())) {
                    LogStatus(`Scratchpad: pruned ${pruned} completed tasks (limit: ${maxTasks})`);
                }
            }

            const artifactToolCalls = initialNextStep.artifactToolCalls as ArtifactToolCall[] | undefined;
            const artifactToolsExecutedThisTurn = !!artifactToolCalls?.length;
            if (artifactToolsExecutedThisTurn) {
                ctx.Hooks.LogStatus(
                    `[ArtifactTools] LLM requested ${artifactToolCalls!.length} tool call(s): ${artifactToolCalls!.map((c) => `${c.artifactId}.${c.tool}`).join(', ')}`,
                    true,
                    params
                );
                const toolResults = await ctx.Hooks.ExecuteArtifactToolCallsAsSteps(artifactToolCalls!, params);
                ctx.Hooks.InjectArtifactToolResultsMessage(params, toolResults);
            } else if (ctx.ArtifactToolManager.HasArtifacts()) {
                ctx.Hooks.LogStatus(
                    `[ArtifactTools] LLM did not use artifact tools this turn (artifacts available but not accessed)`,
                    true,
                    params
                );
            }

            const conversationToolCalls = initialNextStep.conversationToolCalls as ConversationToolCall[] | undefined;
            if (conversationToolCalls?.length) {
                if (ctx.ConversationToolManager.IsAvailable) {
                    ctx.Hooks.LogStatus(
                        `[ConversationTools] LLM requested ${conversationToolCalls.length} tool call(s): ${conversationToolCalls.map((c) => c.tool).join(', ')}`,
                        true,
                        params
                    );
                    const conversationToolResults = await ctx.Hooks.ExecuteConversationToolCallsAsSteps(conversationToolCalls, params);
                    ctx.Hooks.InjectConversationToolResultsMessage(params, conversationToolResults);
                } else {
                    ctx.Hooks.LogStatus(
                        `[ConversationTools] LLM requested conversation tools but the run has no conversationId — ignored`,
                        true,
                        params
                    );
                }
            }

            const memoryWrites = initialNextStep.memoryWrites as MemoryWriteRequest[] | undefined;
            if (memoryWrites?.length) {
                await ctx.Hooks.ProcessMemoryWritesForTurn(memoryWrites, params);
            }

            if (initialNextStep.pipeline?.steps?.length) {
                ctx.Hooks.LogStatus(
                    `[Pipeline] LLM requested a ${initialNextStep.pipeline.steps.length}-stage pipeline: ${(initialNextStep.pipeline.steps as PipelineStage[]).map((s) => (s.tool as string) ?? Object.keys(s)[0]).join(' | ')}`,
                    true,
                    params
                );
                const pipelineResult = await ctx.Hooks.ExecutePipelineAsStep(initialNextStep.pipeline, params);
                ctx.Hooks.InjectPipelineResultMessage(params, pipelineResult);
            }

            const decisions = initialNextStep.decisions;
            if (decisions?.length) {
                const agentTypePromptParams = promptParams.data?.__agentTypePromptParams as Record<string, unknown> | undefined;
                await promptHelper.ProcessTurnDecisions(ctx, decisions, initialNextStep, finalPayload, agentTypePromptParams, params);
            }

            const draft =
                holdsCompletionChange && initialNextStep.step === 'Success'
                    ? ctx.PayloadHelper.BuildCompletionDraft(
                          ctx,
                          params,
                          initialNextStep,
                          finalPayload,
                          finalPayload === params.payload
                      )
                    : undefined;
            currentStepPayloadChangeResult = draft?.summary ?? currentStepPayloadChangeResult;

            const updatedNextStep = await ctx.Hooks.ProcessNextStep<P>(
                initialNextStep,
                params,
                config.agentType!,
                promptResult,
                draft ? draft.payload : finalPayload,
                stepEntity
            );

            const resolved = ctx.PayloadHelper.ResolveTurnPayload(ctx, updatedNextStep, finalPayload, draft);
            finalPayload = resolved.payload;
            const heldCompletionChange = holdsCompletionChange && !resolved.committedDraft;
            ctx.PayloadHelper.UpdateHeldCompletionChanges(ctx, initialNextStep, resolved.committedDraft, finalPayload === params.payload);
            if (heldCompletionChange && currentStepPayloadChangeResult) {
                currentStepPayloadChangeResult = {
                    ...currentStepPayloadChangeResult,
                    applied: { additions: 0, updates: 0, deletions: 0 },
                };
            }

            const outputData = {
                nextStep: {
                    ...updatedNextStep,
                    reasoning: ctx.MessagingHelper.GetNextStepReasoning(ctx, updatedNextStep),
                },
                ...(currentStepPayloadChangeResult && {
                    payloadChangeResult: currentStepPayloadChangeResult,
                }),
                ...(heldCompletionChange && {
                    payloadChangeHeld:
                        'The completion was refused, so its payload change is held: it is applied with the next accepted completion, or dropped if the run ends without one.',
                }),
                ...(ctx.ScratchpadManager.HasContent() && {
                    scratchpad: ctx.ScratchpadManager.ToJSON(),
                }),
                ...(ctx.ArtifactToolManager.HasArtifacts() && {
                    artifactTools: ctx.ArtifactToolManager.ToJSON(),
                }),
                ...(ctx.InjectedMemory &&
                    (ctx.InjectedMemory.notes.length > 0 || ctx.InjectedMemory.examples.length > 0) && {
                        memoryAttribution: {
                            injectedNoteIds: ctx.InjectedMemory.notes.map((n) => n.ID),
                            injectedNotes: ctx.InjectedMemory.notes.map((n) => ({
                                id: n.ID,
                                type: n.Type,
                                content: n.Note?.substring(0, 100), // preview length for observability
                                scope: promptHelper.DetermineNoteScope(ctx, n),
                            })),
                            injectedExampleIds: ctx.InjectedMemory.examples.map((e) => e.ID),
                            noteCount: ctx.InjectedMemory.notes.length,
                            exampleCount: ctx.InjectedMemory.examples.length,
                        },
                    }),
            };

            if (stepEntity && finalPayload) {
                const canReuseStartPayload =
                    !initialNextStep.payloadChangeRequest &&
                    updatedNextStep.newPayload === undefined &&
                    finalPayload === payload &&
                    ctx.Hooks.HasDefaultPayloadSerializers();
                stepEntity.PayloadAtEnd =
                    (canReuseStartPayload ? ctx.MessagingHelper.ResolveStepPayloadAtStart(ctx, stepEntity) : null) ??
                    ctx.Hooks.SerializePayloadAtEnd(finalPayload);
            }

            if (ctx.AgentRun && finalPayload) {
                ctx.AgentRun.FinalPayloadObject = finalPayload;
            }

            updatedNextStep.newPayload = finalPayload;
            updatedNextStep.previousPayload = payload;

            await ctx.Hooks.FinalizeStepEntity(
                stepEntity,
                promptResult.success,
                promptResult.success ? undefined : promptResult.errorMessage,
                outputData
            );

            if (updatedNextStep.step === 'Chat') {
                if (artifactToolsExecutedThisTurn && ctx.ArtifactToolManager.IsWorkspaceEnabled()) {
                    ctx.Hooks.LogStatus(
                        `[ArtifactTools] Chat step included tool calls — forcing one more turn so LLM can use results`,
                        true,
                        params
                    );
                    return { ...updatedNextStep, terminate: false, step: 'Retry' as BaseAgentNextStep<P>['step'] };
                }

                await ctx.Hooks.RaiseFeedbackRequest(params, stepEntity, updatedNextStep);
                return { ...updatedNextStep, terminate: true };
            } else if (updatedNextStep.step === 'Success' || updatedNextStep.step === 'Failed') {
                return { ...updatedNextStep, terminate: true };
            } else if ((updatedNextStep.step as string) === 'ClientTools') {
                return {
                    ...updatedNextStep,
                    terminate: false,
                    terminateAfterExecution: updatedNextStep.terminate,
                };
            } else {
                return { ...updatedNextStep, terminate: false };
            }
        } catch (error) {
            const existingEnd = ctx.MessagingHelper.ResolveStepPayloadAtEnd(ctx, stepEntity);
            const preservedPayload = existingEnd ? JSON.parse(existingEnd) : previousDecision?.newPayload || params.payload;

            stepEntity.PayloadAtEnd =
                existingEnd ??
                (ctx.Hooks.HasDefaultPayloadSerializers()
                    ? ctx.MessagingHelper.ResolveStepPayloadAtStart(ctx, stepEntity)
                    : null) ??
                ctx.Hooks.SerializePayloadAtEnd(preservedPayload);
            stepEntity.PayloadAtEndSourceStepID = null;

            const errString = error instanceof Error ? error.message : error ? String(error) : 'Unknown error';
            const configCheck = ctx.Hooks.IsConfigurationError(errString, config);
            const isConfigurationError = configCheck.isConfigError;
            const detailedErrorMessage = configCheck.detailedMessage;

            const guardrailCheck = await ctx.Hooks.HasExceededAgentRunGuardrails(params, ctx.AgentRun!);
            const guardrailsExceeded = guardrailCheck && guardrailCheck.exceeded;
            const shouldTerminate = isConfigurationError || guardrailsExceeded;

            let finalErrorMessage: string;
            if (isConfigurationError) {
                finalErrorMessage = detailedErrorMessage;
                ctx.Hooks.LogError(`❌ Configuration error in prompt execution (will terminate):\n${detailedErrorMessage}`, {
                    agent: params.agent,
                    category: 'AgentConfiguration',
                    metadata: {
                        error: CopyScalarsAndArrays(error, true),
                    },
                });
            } else if (guardrailsExceeded) {
                finalErrorMessage = `Guardrails exceeded: ${guardrailCheck.reason}\n\nOriginal error: ${errString}`;
                ctx.Hooks.LogError(`⛔ Guardrails exceeded during prompt execution: ${guardrailCheck.reason}`, {
                    agent: params.agent,
                    category: 'Guardrails',
                    metadata: {
                        guardrailType: guardrailCheck.type,
                        limit: guardrailCheck.limit,
                        current: guardrailCheck.current,
                        originalError: errString,
                    },
                });
            } else {
                finalErrorMessage = `Prompt execution failed: ${errString}`;
                ctx.Hooks.LogError(`⚠️ Prompt execution error (will retry if guardrails allow): ${errString}`, {
                    agent: params.agent,
                    category: 'PromptExecution',
                    metadata: {
                        attemptNumber: ctx.AgentRun?.TotalPromptIterations || 0,
                        retryable: true,
                        error: CopyScalarsAndArrays(error, true),
                    },
                });
            }

            await ctx.Hooks.FinalizeStepEntity(stepEntity, false, finalErrorMessage);

            return {
                errorMessage: finalErrorMessage,
                step: 'Failed' as const,
                terminate: shouldTerminate,
                previousPayload: preservedPayload,
                newPayload: preservedPayload,
            };
        }
    }
}
