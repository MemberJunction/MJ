/**
 * @fileoverview Default pluggable implementation of {@link BaseAgentRunSetupHelper}.
 *
 * Orchestrates `ExecuteRun` (universal timeout/abort wiring, Pre-Work, Phases 1–3,
 * session-driven Realtime branch, iterative loop execution, finalization, and `EndRun`)
 * while composing {@link AgentRunInitializationHelper} and {@link AgentRunFinalizationHelper}.
 *
 * @module @memberjunction/ai-agents
 */

import {
    ResolveEffectiveWorkflowDurationCapMs,
    ResolveWorkflowStartedAtMs,
    WithAgentRunDataTrustApplied,
    type AgentChatMessage,
    type AgentConfiguration,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type ExecuteAgentResult,
    type InputArtifact,
    type MJAIAgentEntityExtended,
} from '@memberjunction/ai-core-plus';
import { ActionEngineServer } from '@memberjunction/actions';
import type { ChatMessage } from '@memberjunction/ai';
import { AIAgentPermissionHelper } from '@memberjunction/ai-engine-base';
import { AIEngine } from '@memberjunction/aiengine';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { ConversationEngine } from '@memberjunction/core-entities';
import { CleanAndParseJSON, RegisterClass } from '@memberjunction/global';
import { ActiveRunGovernanceRegistry } from '../../ActiveRunGovernanceRegistry';
import { AgentDataPreloader } from '../../AgentDataPreloader';
import { AgentRunWatchdog } from '../../agent-run-watchdog';
import { BaseAgentType } from '../../agent-types/base-agent-type';
import type { LoopAgentTypePromptParams } from '../../agent-types/loop-agent-prompt-params';
import { OpeningRequestText } from '../../catalog-narrowing';
import { IsOpeningTurn } from '../../decision-discovery';
import { DEFAULT_AGENT_HELPER_KEY } from '../AgentHelperResolver';
import type { AgentRunContext } from '../AgentRunContext';
import { AgentLivenessWatchdog } from '../limits/AgentLivenessWatchdog';
import { AgentRunFinalizationHelper } from './AgentRunFinalizationHelper';
import { AgentRunInitializationHelper } from './AgentRunInitializationHelper';
import { BaseAgentRunSetupHelper } from './BaseAgentRunSetupHelper';

/**
 * Default pluggable run-setup and lifecycle helper registered under `'Default'`.
 */
@RegisterClass(BaseAgentRunSetupHelper, DEFAULT_AGENT_HELPER_KEY)
export class AgentRunSetupHelper extends BaseAgentRunSetupHelper {
    private readonly _init = new AgentRunInitializationHelper();
    private readonly _finalization = new AgentRunFinalizationHelper();

    public override async ExecuteRun<C, R>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams<C>
    ): Promise<ExecuteAgentResult<R>> {
        ctx.TreeBudget = undefined;
        ctx.AgentRun = null;
        ctx.PausedRunOutcome = null;
        if (!params.resumeCheckpointRunId) {
            ctx.PendingCheckpointPersistence = null;
        }
        ctx.ResolvedUserPolicy = null;
        ctx.ResumedCheckpointContext = null;
        ctx.PendingLoopCursorToResume = null;
        ctx.CooperativePauseState = null;
        ctx.CheckpointStepCostBaseline = 0;
        ctx.PriorNonStepCostUsd = 0;
        ctx.PriorNonStepTokensUsed = 0;
        ctx.FastJudgeCostUsd = 0;
        ctx.FastJudgeTokensUsed = 0;
        ctx.ReconciledFastJudgeInvocationIds.clear();
        ctx.CurrentLateJudgeScope = null;
        ctx.PriorDayCostBaselineUsd = undefined;
        ctx.PriorDayWallClockBaselineMs = undefined;
        ctx.LastObservedDaySnapshot = null;
        ctx.BudgetCostEvents = [];
        ctx.BudgetDayBaselines = {};
        ctx.LastRecordedCostUsd = 0;
        ctx.LastRemotePausePollMs = params.resumeCheckpointRunId ? 0 : Date.now();
        ctx.ProgressDetector.Reset();
        ctx.StuckDetector.Reset();
        ctx.FastConvergenceJudge.ResetTracking();
        const policyResolution = await ctx.Hooks.ResolveServerUserPolicy(params);
        ctx.ResolvedUserPolicy = policyResolution.policy;
        ctx.ActiveLimitsResolution = ctx.Hooks.ResolveFullRunLimits(params);
        ctx.ActiveBudgets = ctx.ActiveLimitsResolution.Limits.Budgets;
        ctx.Hooks.EnsureTreeBudget(params);

        params = this.WithRunDataTrustApplied(ctx, params);
        ctx.Hooks.EnsureTreeBudget(params);

        ctx.ActiveProvider = params.provider ?? Metadata.Provider; // global-provider-ok: fallback when ExecuteAgentParams.provider is omitted
        ctx.Hooks.InitCurrentLateJudgeScope(params);

        const treeBudget = ctx.Hooks.EnsureTreeBudget(params);

        // Clamp MaxTimePerRun across the full BaseAgentID ancestor chain so derived instances
        // cannot loosen an ancestor's finite MaxTimePerRun ceiling via null or larger values.
        const ancestorEffectiveMaxTimeSec = (() => {
            const agent = params.agent;
            if (!agent) return undefined;
            const candidates: number[] = [];
            if (typeof agent.MaxTimePerRun === 'number' && agent.MaxTimePerRun > 0) {
                candidates.push(agent.MaxTimePerRun);
            }
            try {
                if (agent.BaseAgentID && typeof AIEngine.Instance?.GetAgentByID === 'function') {
                    let curId: string | null | undefined = agent.BaseAgentID;
                    const seen = new Set<string>([agent.ID.toLowerCase()]);
                    while (curId) {
                        const key = curId.toLowerCase();
                        if (seen.has(key)) break;
                        seen.add(key);
                        const anc = AIEngine.Instance.GetAgentByID(curId);
                        if (!anc) break;
                        if (typeof anc.MaxTimePerRun === 'number' && anc.MaxTimePerRun > 0) {
                            candidates.push(anc.MaxTimePerRun);
                        }
                        curId = anc.BaseAgentID;
                    }
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                const isUnconfigured = !AIEngine.Instance?.Loaded || /not configured|Config\(\)/i.test(msg);
                if (!isUnconfigured) {
                    ctx.Hooks.LogError(
                        `ExecuteRun: failed walking BaseAgentID ancestor MaxTimePerRun for '${agent.Name ?? agent.ID}': ${msg}`,
                        { agent, category: 'AgentLimits' }
                    );
                }
            }
            return candidates.length > 0 ? Math.min(...candidates) : undefined;
        })();
        const configuredMaxTimeMs =
            ancestorEffectiveMaxTimeSec !== undefined ? ancestorEffectiveMaxTimeSec * 1000 : undefined;
        const wallClockProvenance = ctx.ActiveLimitsResolution?.Provenance['Budgets.PerRun.MaxWallClockMs'];
        const explicitResolvedMaxWallClockMs =
            wallClockProvenance?.IsOverridden &&
            typeof wallClockProvenance.Value === 'number' &&
            wallClockProvenance.Value > 0
                ? wallClockProvenance.Value
                : undefined;
        const workflowDurationCapMs = ResolveEffectiveWorkflowDurationCapMs(treeBudget);
        const workflowStartedAtMs = ResolveWorkflowStartedAtMs(treeBudget);
        const workflowRemainingMs =
            workflowDurationCapMs !== undefined
                ? Math.max(0, workflowDurationCapMs - Math.max(0, Date.now() - workflowStartedAtMs))
                : undefined;
        const livenessConfig = ctx.ActiveLimitsResolution?.Limits.Liveness;
        const subclassDefaultTimeoutMs = ctx.HasCustomDefaultAgentTimeout ? ctx.DefaultAgentTimeoutMS : undefined;
        const explicitBaseCapMs =
            explicitResolvedMaxWallClockMs ?? params.maxExecutionTimeMs ?? configuredMaxTimeMs ?? subclassDefaultTimeoutMs;
        const baseOuterCeilingMs =
            explicitBaseCapMs ??
            (livenessConfig?.Enabled === false
                ? ctx.DefaultAgentTimeoutMS
                : (livenessConfig?.OuterMaxWallClockMs ?? ctx.DefaultAgentTimeoutMS));
        const outerCeilingMs =
            workflowRemainingMs !== undefined
                ? Math.min(baseOuterCeilingMs, Math.max(1, workflowRemainingMs))
                : baseOuterCeilingMs;
        const upstreamToken = params.cancellationToken;
        const budgetAbortSignal = ctx.Hooks.HasExplicitWorkflowBudgetCaps(params)
            ? treeBudget.abortController?.signal
            : undefined;
        const timeoutController = new AbortController();
        const relayUpstreamAbort = () => {
            if (!timeoutController.signal.aborted) {
                timeoutController.abort(upstreamToken?.reason ?? 'upstream cancellation');
            }
        };
        const relayBudgetAbort = () => {
            if (!timeoutController.signal.aborted) {
                timeoutController.abort(
                    budgetAbortSignal?.reason ?? treeBudget.breachDiagnostic?.Reason ?? 'workflow budget exceeded'
                );
            }
        };
        if (upstreamToken) {
            if (upstreamToken.aborted) {
                relayUpstreamAbort();
            } else {
                upstreamToken.addEventListener('abort', relayUpstreamAbort, { once: true });
            }
        }
        if (budgetAbortSignal) {
            if (budgetAbortSignal.aborted) {
                relayBudgetAbort();
            } else {
                budgetAbortSignal.addEventListener('abort', relayBudgetAbort, { once: true });
            }
        }
        const livenessWatchdog = new AgentLivenessWatchdog({
            AgentName: params.agent.Name ?? 'Agent',
            Enabled: livenessConfig?.Enabled ?? true,
            InactivityTimeoutMs: livenessConfig?.InactivityTimeoutMs,
            OuterMaxWallClockMs: outerCeilingMs,
            StreamChunkTouchThrottleMs: livenessConfig?.StreamChunkTouchThrottleMs,
            InactivityAbortReasonPrefix: ctx.AgentInactivityAbortReason,
            TimeoutAbortReasonPrefix: ctx.AgentTimeoutAbortReason,
        });
        livenessWatchdog.Start(timeoutController);
        ctx.LivenessWatchdog = livenessWatchdog;
        params.cancellationToken = timeoutController.signal;
        ctx.RunAbortController = timeoutController;

        try {
            if (policyResolution.status === 'error') {
                throw new Error(`Fail-closed: unable to verify user agent policy (${policyResolution.errorMessage})`);
            }
            const preRunTreeBudgetCheck = ctx.Hooks.CheckTreeBudgetLimit(params);
            if (preRunTreeBudgetCheck.exceeded) {
                const reason = preRunTreeBudgetCheck.reason ?? 'Workflow budget exceeded before agent execution';
                ctx.Hooks.LogStatus(`⛔ ${reason}`, false, params);
                return (await ctx.Hooks.CreateFailureResult(reason, params.contextUser)) as ExecuteAgentResult<R>;
            }
            ctx.Hooks.LogStatus(`🤖 Starting execution of agent '${params.agent.Name}'`, true, params);

            await ctx.Hooks.InheritBoundActionParams(params);

            const wrappedParams: ExecuteAgentParams<C> = {
                ...params,
                onProgress: ctx.MessagingHelper.WrapProgressCallback(ctx, params.onProgress),
            };

            ctx.ExecuteParams = wrappedParams;
            ctx.Hooks.EnsureTreeBudget(wrappedParams);
            ctx.AgentConfig = undefined;
            ctx.LastModelSelectionInfo = undefined;
            ctx.LastVolatileStateMessage = undefined;
            ctx.HeldCompletionChanges = [];
            ctx.ResolvedTrailingStateMode = undefined;
            ctx.LastSentFingerprints = undefined;
            ctx.LastSentPrefix = undefined;
            ctx.Turn1InsertionIndex = -1;
            ctx.RunScope = undefined;
            ctx.Hooks.ResetActionCircuitBreaker();

            if (params.convertUIMarkupToPlainText !== false) {
                ctx.Hooks.ConvertUIMarkupInMessages(wrappedParams.conversationMessages);
            }

            ctx.ScratchpadManager.Clear();
            ctx.ArtifactToolManager.Clear();
            ctx.MemoryWriteManager.Clear();

            ctx.ConversationBranches =
                wrappedParams.conversationId && wrappedParams.ConversationBranchID
                    ? await ConversationEngine.LoadBranchesFresh(
                          wrappedParams.conversationId,
                          params.contextUser,
                          ctx.ProviderToUse
                      )
                    : [];
            ctx.ConversationToolManager.Initialize(
                wrappedParams.conversationId || null,
                params.contextUser,
                wrappedParams.ConversationHistoryFrom ?? null,
                wrappedParams.ConversationBranchID ?? null,
                ctx.ConversationBranches,
                ctx.ProviderToUse
            );
            ctx.ConversationToolManager.SetSummaryHost(ctx.Hooks.BuildConversationSummaryHost(wrappedParams));

            const inputArtifacts: InputArtifact[] | undefined = wrappedParams.inputArtifacts;
            ctx.ArtifactToolManager.Initialize(inputArtifacts ?? [], {
                contextUser: params.contextUser,
                provider: ctx.ProviderToUse,
                getAgentRun: () => ctx.AgentRun,
                agentName: params.agent?.Name ?? undefined,
                workspaceEnabled: true,
            });
            if (inputArtifacts?.length) {
                ctx.Hooks.LogStatus(
                    `[ArtifactTools] Initialized with ${inputArtifacts.length} artifact(s): ${inputArtifacts.map((a) => `${a.typeName}:"${a.name}"`).join(', ')}`,
                    true,
                    params
                );
            } else {
                ctx.Hooks.LogStatus(`[ArtifactTools] Workspace enabled with 0 initial input artifacts`, true, params);
            }

            await ctx.Hooks.InitializeStartingPayload(wrappedParams);

            if (params.cancellationToken?.aborted) {
                ctx.Hooks.LogStatus(`⚠️ Agent '${params.agent.Name}' execution cancelled before start`, true, params);
                return (await ctx.Hooks.CreateCancelledResult(
                    'Cancelled before execution started',
                    params.contextUser
                )) as ExecuteAgentResult<R>;
            }

            const startingValidationResult = await ctx.Hooks.HandleStartingPayloadValidation(wrappedParams);
            if (startingValidationResult) {
                return startingValidationResult as ExecuteAgentResult<R>;
            }

            wrappedParams.onProgress?.({
                step: 'initialization',
                message: ctx.Hooks.BuildInitializationProgressMessage(params),
                metadata: {
                    stepCount: 0,
                    hierarchicalStep: ctx.Hooks.BuildHierarchicalStep(0, ctx.ParentStepCounts),
                },
            });

            // PHASE 1 (parallel): Permission check + Engine init + AgentRun creation
            const [canRun] = await Promise.all([
                AIAgentPermissionHelper.HasPermission(params.agent.ID, params.contextUser, 'run'),
                ctx.Hooks.InitializeEngines(params.contextUser),
                ctx.Hooks.InitializeAgentRun(wrappedParams),
            ]);

            if (!canRun) {
                const errorMessage = `User ${params.contextUser.Email} does not have permission to run agent '${params.agent.Name}' (ID: ${params.agent.ID})`;
                await this.FailRunAtStart(ctx, errorMessage, params);
            }

            const bindingError = ctx.Hooks.BoundActionParamsError(params);
            if (bindingError) {
                ctx.Hooks.LogStatus(`🚫 ${bindingError}`, false, params);
                if (ctx.AgentRun) {
                    ctx.AgentRun.Status = 'Failed';
                    ctx.AgentRun.ErrorMessage = bindingError;
                    this.ReleaseFinishedRun(ctx, await ctx.AgentRun.Save());
                }
                throw new Error(bindingError);
            }

            ctx.AudienceReaders = undefined;
            ctx.AudienceSource = undefined;
            ctx.ValidationRetryCount = 0;
            ctx.GeneralValidationRetryCount = 0;
            ctx.ContextRecoveryAttempts = 0;
            ctx.SubAgentConsultRounds.clear();
            ctx.OpenSubAgentConsults.clear();
            ctx.LoggedConsultUnsupportedAgentType = false;
            ctx.EffectiveActions = [];
            ctx.EffectiveSubAgents = [];
            ctx.EffectiveCatalogComputed = false;
            ctx.DynamicActionLimits = {};
            ctx.MediaOutputs = [];
            ctx.HandoffResult = null;
            ctx.ResolvedHandoffTarget = null;
            ctx.LastSubAgentArtifactDirective = undefined;
            ctx.LastSubAgentPayloadArtifactTypeID = undefined;
            ctx.TaintedSources = [];
            ctx.ActionSpilloverManager.Clear();
            ctx.Hooks.SeedTaintFromSecurityEnvelope(params);
            ctx.Hooks.SeedTaintFromParentRun(params);
            ctx.MessageLifecycleCallback = params.onMessageLifecycle;
            ctx.CatalogNarrowing = undefined;
            ctx.OpeningRequest = OpeningRequestText(params.conversationMessages);
            ctx.RunExecutionScope = ctx.Hooks.RunPromptExecutionScope(params);
            ctx.IsOpeningTurn = IsOpeningTurn(params.conversationMessages);

            const audience = await ctx.Hooks.AudienceReadersFor(params);
            if ('Error' in audience) {
                await this.FailRunAtStart(ctx, audience.Error, params);
            }

            ctx.ResolvedStorageAccountId = await ctx.Hooks.GetStorageAccountID(wrappedParams);

            if (params.cancellationToken?.aborted) {
                return (await ctx.Hooks.CreateCancelledResult(
                    'Cancelled during initialization',
                    params.contextUser
                )) as ExecuteAgentResult<R>;
            }

            wrappedParams.onProgress?.({
                step: 'validation',
                message: ctx.Hooks.FormatHierarchicalMessage('Gathering context...'),
                metadata: {
                    stepCount: 0,
                    hierarchicalStep: ctx.Hooks.BuildHierarchicalStep(0, ctx.ParentStepCounts),
                },
            });

            const validationResult = await ctx.Hooks.ValidateAgentWithTracking(params.agent, params.contextUser);
            if (validationResult) return validationResult as ExecuteAgentResult<R>;

            // PHASE 2 (parallel): Config load + Data preload + Context memory + RAG + Continuation + Consults
            ctx.Hooks.LogStatus(`📋 Loading configuration for agent '${params.agent.Name}'`, true, params);

            const userId = params.userId || params.contextUser?.ID;
            const companyId = params.companyId;
            const lastUserMessage = params.conversationMessages
                .filter((m) => m.role === 'user')
                .pop() as AgentChatMessage | undefined;
            const inputText = lastUserMessage?.metadata?.rawContent ?? (lastUserMessage?.content || '');

            const runScope = ctx.Hooks.RunScopeForContext(params);
            const continuationMessage =
                wrappedParams.conversationMessages[wrappedParams.conversationMessages.length - 1];

            const memoryStagedMessages: ChatMessage[] = [];
            const ragStagedMessages: ChatMessage[] = [];
            const discoveryStagedMessages: ChatMessage[] = [];

            const [config, , , , , stoppedRunContinuation, , openConsults] = await Promise.all([
                ctx.Hooks.LoadAgentConfiguration(params.agent),
                ctx.Hooks.PreloadAgentData(wrappedParams),
                ctx.Hooks.InjectContextMemory(
                    typeof inputText === 'string' ? inputText : '',
                    params.agent,
                    userId,
                    companyId,
                    params.contextUser,
                    memoryStagedMessages,
                    runScope.EntityID,
                    runScope.RecordID,
                    runScope.Secondary,
                    ctx.Hooks.ParseSecondaryScopeConfig(params.agent),
                    ctx.Hooks.RunAudienceAddsReader(params)
                ),
                ctx.Hooks.InjectPreExecutionRAG(
                    typeof inputText === 'string' ? inputText : '',
                    params.agent,
                    params.contextUser,
                    ragStagedMessages,
                    params.conversationMessages,
                    runScope.EntityID,
                    runScope.RecordID,
                    runScope.Secondary,
                    params.payload,
                    ctx.Hooks.ActiveSkillIDsForRun(params),
                    ctx.AudienceReaders ?? []
                ),
                ctx.Hooks.InjectPriorTurnToolResults(wrappedParams),
                ctx.Hooks.LoadStoppedRunContinuation(wrappedParams),
                ctx.Hooks.InjectDecisionDiscovery(
                    params.agent,
                    params.contextUser,
                    discoveryStagedMessages,
                    params.data
                ),
                ctx.MessagingHelper.LoadOpenConsults(ctx, wrappedParams),
            ]);

            if (
                memoryStagedMessages.length > 0 ||
                ragStagedMessages.length > 0 ||
                discoveryStagedMessages.length > 0
            ) {
                wrappedParams.conversationMessages.unshift(
                    ...memoryStagedMessages,
                    ...ragStagedMessages,
                    ...discoveryStagedMessages
                );
            }

            ctx.Hooks.ApplyStoppedRunContinuation(wrappedParams, stoppedRunContinuation, continuationMessage);

            const messagesBeforeParts = new Set(wrappedParams.conversationMessages);
            ctx.Hooks.InjectScopedPromptParts(
                params.agent,
                wrappedParams.conversationMessages,
                runScope.EntityID,
                runScope.RecordID,
                runScope.Secondary
            );
            ctx.Hooks.InjectAgentPersonaAndInstructions(
                params.agent,
                wrappedParams.conversationMessages,
                params.contextUser,
                ctx.ResolvedUserPolicy
            );
            await ctx.Hooks.ReplaceScopedPartPlaceholders(
                wrappedParams.conversationMessages,
                messagesBeforeParts,
                params.contextUser
            );

            ctx.MessagingHelper.ApplyOpenConsults(ctx, wrappedParams, openConsults, continuationMessage);

            if (!config.success) {
                ctx.Hooks.LogError(`Failed to load agent configuration: ${config.errorMessage}`, {
                    agent: params.agent,
                    category: 'AgentConfiguration',
                });
                return (await ctx.Hooks.CreateFailureResult(
                    config.errorMessage || 'Failed to load agent configuration',
                    params.contextUser
                )) as ExecuteAgentResult<R>;
            }

            // PHASE 3: Agent type initialization
            ctx.AgentConfig = config;
            await ctx.Hooks.InitializeAgentType(wrappedParams, config);

            if (ctx.AgentTypeInstance && ctx.Hooks.IsSessionDrivenAgentType(ctx.AgentTypeInstance)) {
                const audienceRefusal = ctx.Hooks.SessionAudienceRefusal(params);
                if (audienceRefusal) {
                    ctx.Hooks.LogError(audienceRefusal, { agent: params.agent, category: 'RealtimeSession' });
                    return (await ctx.Hooks.CreateFailureResult(
                        audienceRefusal,
                        params.contextUser
                    )) as ExecuteAgentResult<R>;
                }
                ctx.Hooks.LogStatus(
                    `🎙️ Agent '${params.agent.Name}' is session-driven — routing to RealtimeSessionRunner`,
                    true,
                    params
                );
                // Realtime sessions manage their own turn/idle lifecycle; suspend the sliding
                // inactivity timer so active audio/video sessions are not aborted at 15m while the
                // outer wall-clock ceiling remains enforced.
                livenessWatchdog.SuspendForExternalWait('realtime-session', 'session-driven-agent');
                try {
                    return await ctx.Hooks.ExecuteRealtimeSession<R>(wrappedParams, config);
                } finally {
                    livenessWatchdog.ResumeFromExternalWait('realtime-session');
                }
            }

            await ctx.Hooks.CheckPreTurnCompaction(wrappedParams, config);

            ctx.Hooks.LogStatus(`🚀 Executing agent '${params.agent.Name}' internal logic`, true, params);
            // Downstream subclasses overriding `executeAgentInternal` bypass BaseAgent's step/prompt
            // loop and may not emit progress callbacks on every internal operation. Suspend the
            // sliding inactivity timer for those custom drivers (outer wall-clock ceiling stays on).
            const customLoopWaitId = ctx.HasCustomExecuteAgentInternal ? 'custom-execute-agent-internal' : null;
            if (customLoopWaitId) {
                livenessWatchdog.SuspendForExternalWait(customLoopWaitId, 'custom-driver-loop');
            }
            let executionResult: { finalStep: BaseAgentNextStep<R>; stepCount: number };
            try {
                executionResult = await ctx.Hooks.ExecuteAgentInternal<R, C>(wrappedParams, config);
            } finally {
                if (customLoopWaitId) {
                    livenessWatchdog.ResumeFromExternalWait(customLoopWaitId);
                }
            }

            if (ctx.PausedRunOutcome) {
                return ctx.Hooks.BuildPausedExecuteResult<R>(ctx.PausedRunOutcome);
            }

            wrappedParams.onProgress?.({
                step: 'finalization',
                metadata: {
                    result: executionResult,
                    stepCount: executionResult.stepCount,
                    hierarchicalStep: ctx.Hooks.BuildHierarchicalStep(executionResult.stepCount, ctx.ParentStepCounts),
                },
                message: ctx.Hooks.FormatHierarchicalMessage('Wrapping up...'),
            });

            ctx.Hooks.LogStatus(`✅ Finalizing execution for agent '${params.agent.Name}'`, true, params);
            const finalPayload = executionResult.finalStep.newPayload || executionResult.finalStep.previousPayload;

            return await ctx.Hooks.FinalizeAgentRun<R>(executionResult.finalStep, finalPayload, params.contextUser);
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            if (params.cancellationToken?.aborted || errMsg === 'Cancelled during execution') {
                const reason =
                    typeof timeoutController.signal.reason === 'string' ? timeoutController.signal.reason : errMsg;
                ctx.Hooks.LogStatus(`⚠️ Agent '${params.agent.Name}' execution cancelled: ${reason}`, true, params);
                return (await ctx.Hooks.CreateCancelledResult(
                    reason || 'Cancelled due to error during execution',
                    params.contextUser
                )) as ExecuteAgentResult<R>;
            }
            ctx.Hooks.LogError(error instanceof Error ? error : errMsg, {
                agent: params.agent,
                category: 'AgentExecution',
                severity: 'critical',
            });
            return (await ctx.Hooks.CreateFailureResult(errMsg, params.contextUser)) as ExecuteAgentResult<R>;
        } finally {
            livenessWatchdog.Stop();
            ctx.LivenessWatchdog = null;
            if (upstreamToken) {
                upstreamToken.removeEventListener('abort', relayUpstreamAbort);
            }
            if (budgetAbortSignal) {
                budgetAbortSignal.removeEventListener('abort', relayBudgetAbort);
            }
            params.cancellationToken = upstreamToken;
            ctx.RunAbortController = null;
            await this.EndRun(ctx, params);
        }
    }

    public override async EndRun(ctx: AgentRunContext, params: ExecuteAgentParams): Promise<void> {
        const hasPendingPausePersistence = Boolean(
            ctx.PendingCheckpointPersistence ||
                (ctx.AgentRun?.ID &&
                    ActiveRunGovernanceRegistry.Instance.IsPausePersistencePending(ctx.AgentRun.ID, ctx.ActiveProvider))
        );
        if (ctx.AgentRun?.ID && !hasPendingPausePersistence) {
            AgentRunWatchdog.Instance.Untrack(ctx.AgentRun.ID);
            ActiveRunGovernanceRegistry.Instance.UnregisterActiveRun(ctx.AgentRun.ID, ctx.ActiveProvider);
        }
        if (ctx.CooperativePauseState && ctx.CooperativePauseState.Waiters.length > 0) {
            const summary =
                ctx.PausedRunOutcome?.PauseResult.Checkpoint.Summary ?? 'Run finished before safe-point pause';
            const waiters = [...ctx.CooperativePauseState.Waiters];
            ctx.CooperativePauseState.Waiters.length = 0;
            const isPending = Boolean(ctx.PausedRunOutcome?.PausePersistencePending || hasPendingPausePersistence);
            for (const resolve of waiters) {
                resolve(
                    ctx.PausedRunOutcome
                        ? {
                              Paused: !isPending,
                              ...(isPending ? { Pending: true } : {}),
                              CheckpointID: ctx.PausedRunOutcome.PauseResult.Checkpoint.CheckpointID,
                              Status: isPending ? 'PausePersistencePending' : (ctx.AgentRun?.Status ?? 'Paused'),
                              Summary: summary,
                          }
                        : null
                );
            }
        }
        ctx.CooperativePauseState = null;
        ctx.Hooks.SkipHeldDecisions(params, ctx.Hooks.RunEndForHeldDecisions());
        this.ReleasePerRunDataCache(ctx);
        try {
            await ctx.ArtifactToolManager.NotifyRunCompleted();
        } catch (presenceErr) {
            ctx.Hooks.LogError(presenceErr instanceof Error ? presenceErr : String(presenceErr), {
                category: 'ArtifactPresenceExit',
            });
        }
        await ctx.Hooks.FinalizeRun(this.DeriveRunOutcome(ctx));
        this.ClearRunBoundState(ctx);
    }

    public override async FailRunAtStart(
        ctx: AgentRunContext,
        errorMessage: string,
        params: ExecuteAgentParams
    ): Promise<never> {
        ctx.Hooks.LogStatus(`🚫 ${errorMessage}`, false, params);
        if (ctx.AgentRun) {
            ctx.AgentRun.Status = 'Failed';
            ctx.AgentRun.ErrorMessage = errorMessage;
            await ctx.AgentRun.Save({ SaveReturnMode: 'datestamps_only' });
        }
        throw new Error(errorMessage);
    }

    public override ClearRunBoundState(ctx: AgentRunContext): void {
        ctx.RunScope = undefined;
        ctx.AudienceReaders = undefined;
        ctx.AudienceSource = undefined;
        ctx.ConversationToolManager.Clear();
        ctx.ConversationBranches = [];
        ctx.ActionSpilloverManager.Clear();
    }

    public override ReleasePerRunDataCache(ctx: AgentRunContext): void {
        if (ctx.AgentRun?.ID) {
            AgentDataPreloader.Instance.clearRunCache(ctx.AgentRun.ID);
        }
    }

    public override async FinalizeRun(
        _ctx: AgentRunContext,
        _outcome: 'success' | 'failure' | 'cancelled'
    ): Promise<void> {
        // Intentionally empty — subclasses override as needed.
    }

    public override DeriveRunOutcome(ctx: AgentRunContext): 'success' | 'failure' | 'cancelled' {
        switch (ctx.AgentRun?.Status) {
            case 'Cancelled':
                return 'cancelled';
            case 'Failed':
                return 'failure';
            default:
                return 'success';
        }
    }

    public override IsSessionDrivenAgentType(_ctx: AgentRunContext, agentType: BaseAgentType): boolean {
        return (agentType as Partial<{ IsSessionDriven: boolean }>).IsSessionDriven === true;
    }

    public override async InitializeAgentType(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<void> {
        const instance = await BaseAgentType.GetAgentTypeInstance(config.agentType);
        ctx.AgentTypeInstance = instance;
        ctx.AgentTypeState = await instance.InitializeAgentTypeState(params);
    }

    public override PreloadAgentData(ctx: AgentRunContext, params: ExecuteAgentParams): Promise<void> {
        return this._init.PreloadAgentData(ctx, params);
    }

    public override WithRunDataTrustApplied<C>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams<C>
    ): ExecuteAgentParams<C> {
        const { Params, StrippedKeys } = WithAgentRunDataTrustApplied(params);
        if (StrippedKeys.length > 0) {
            ctx.Hooks.LogStatus(
                `🔒 Ignored reserved run-data key(s) ${StrippedKeys.join(', ')} for agent '${params.agent?.Name}' ` +
                    `(user ${params.contextUser?.Email ?? 'unknown'}): a run's scope and agent-type parameters come from the ` +
                    `ExecuteAgentParams fields, or from data only when the server sets TrustReservedRunData.`,
                false,
                params
            );
        }
        return Params;
    }

    public override async InitializeEngines(_ctx: AgentRunContext, contextUser?: UserInfo): Promise<void> {
        await ActionEngineServer.Instance.Config(false, contextUser);
        await AIEngine.Instance.Config(false, contextUser);
    }

    public override ValidateRunChain(ctx: AgentRunContext, lastRunId: string, contextUser?: UserInfo, preloadedLastRun?: { LastRunID?: string | null } | null): Promise<void> {
        return this._init.ValidateRunChain(ctx, lastRunId, contextUser, preloadedLastRun);
    }

    public override ValidateAgent(ctx: AgentRunContext, agent: MJAIAgentEntityExtended): Promise<ExecuteAgentResult | null> {
        return this._init.ValidateAgent(ctx, agent);
    }

    public override LoadAgentConfiguration(ctx: AgentRunContext, agent: MJAIAgentEntityExtended): Promise<AgentConfiguration> {
        return this._init.LoadAgentConfiguration(ctx, agent);
    }

    public override InitializeAgentRun(ctx: AgentRunContext, params: ExecuteAgentParams): Promise<void> {
        return this._init.InitializeAgentRun(ctx, params);
    }

    public override RestorePausedRunFromCheckpoint(ctx: AgentRunContext, params: ExecuteAgentParams, runProvider: IMetadataProvider): Promise<void> {
        return this._init.RestorePausedRunFromCheckpoint(ctx, params, runProvider);
    }

    public override ResolvePlanModeGate(ctx: AgentRunContext, params: ExecuteAgentParams): Promise<{ active: boolean; approved: boolean }> {
        return this._init.ResolvePlanModeGate(ctx, params);
    }

    public override ValidateAgentWithTracking(ctx: AgentRunContext, agent: MJAIAgentEntityExtended, contextUser: UserInfo): Promise<ExecuteAgentResult | null> {
        return this._init.ValidateAgentWithTracking(ctx, agent, contextUser);
    }

    public override async GetStorageAccountID(
        _ctx: AgentRunContext,
        params: ExecuteAgentParams
    ): Promise<string | null> {
        return AIEngine.Instance.ResolveAgentStorageAccountID(params.agent, params.override?.storageAccountId);
    }

    public override AreArtifactToolsEnabled(ctx: AgentRunContext, params?: ExecuteAgentParams): boolean {
        if (!ctx.ArtifactToolManager.IsWorkspaceEnabled()) {
            return false;
        }
        const overrideParams = params?.data?.__agentTypePromptParams as Partial<LoopAgentTypePromptParams> | undefined;
        if (overrideParams?.includeArtifactToolsDocs !== undefined) {
            return overrideParams.includeArtifactToolsDocs !== false;
        }
        const mergedParams = ctx.AgentTypePromptParams as Partial<LoopAgentTypePromptParams> | undefined;
        if (mergedParams !== undefined) {
            return mergedParams.includeArtifactToolsDocs !== false;
        }
        const rawAgentParams = params?.agent?.AgentTypePromptParams;
        if (typeof rawAgentParams === 'string' && rawAgentParams.trim().length > 0) {
            const parsed = CleanAndParseJSON<Partial<LoopAgentTypePromptParams>>(rawAgentParams, false);
            if (parsed?.includeArtifactToolsDocs === false) {
                return false;
            }
        }
        return true;
    }

    public override GetAgentTypeName(_ctx: AgentRunContext, typeID: string): string {
        return this._init.GetAgentTypeName(typeID);
    }

    public override GetValueListItems(_ctx: AgentRunContext, valueListID: string): string[] | null {
        return this._init.GetValueListItems(valueListID);
    }

    public override GetActionCategoryName(_ctx: AgentRunContext, categoryID: string): string {
        return this._init.GetActionCategoryName(categoryID);
    }

    public override AssertLastRunIdIsUUID(_ctx: AgentRunContext, lastRunId: string | undefined): void {
        this._init.AssertLastRunIdIsUUID(lastRunId);
    }

    public override FlushPromptRunnerSaves(ctx: AgentRunContext): Promise<void> {
        return this._finalization.FlushPromptRunnerSaves(ctx);
    }

    public override CreateFailureResult(ctx: AgentRunContext, errorMessage: string, contextUser?: UserInfo): Promise<ExecuteAgentResult> {
        return this._finalization.CreateFailureResult(ctx, errorMessage, contextUser);
    }

    public override CreateCancelledResult(ctx: AgentRunContext, message: string, contextUser?: UserInfo): Promise<ExecuteAgentResult> {
        return this._finalization.CreateCancelledResult(ctx, message, contextUser);
    }

    public override ReleaseFinishedRun(ctx: AgentRunContext, saved: boolean): void {
        this._finalization.ReleaseFinishedRun(ctx, saved);
    }

    public override FinalizeAgentRun<P>(ctx: AgentRunContext, finalStep: BaseAgentNextStep, payload?: P, contextUser?: UserInfo): Promise<ExecuteAgentResult<P>> {
        return this._finalization.FinalizeAgentRun(ctx, finalStep, payload, contextUser);
    }
}
