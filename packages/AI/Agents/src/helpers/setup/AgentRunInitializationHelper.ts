/**
 * @fileoverview Collaborator owned by {@link AgentRunSetupHelper} encapsulating Phase 1 & 2
 * initialization helpers: data preloading, run-chain cycle detection, agent validation,
 * agent configuration loading, `InitializeAgentRun`, checkpoint restoration, and Plan Mode
 * gate resolution.
 *
 * @module @memberjunction/ai-agents
 */

import {
    AttachLimitsDiagnosticsToAgentRun,
    BuildLimitsDiagnosticsSnapshot,
    ExtractBudgetCostEventsFromRunData,
    ExtractBudgetDayBaselinesFromRunData,
    StringifyForPersistence,
    type AgentConfiguration,
    type ExecuteAgentParams,
    type ExecuteAgentResult,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import {
    DatabaseProviderBase,
    LimitsConfigResolver,
    LogStatus,
    RunView,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';
import { CopyScalarsAndArrays, IsValidUUID, UUIDsEqual } from '@memberjunction/global';
import { AgentDataPreloader } from '../../AgentDataPreloader';
import { AgentRunWatchdog } from '../../agent-run-watchdog';
import { BaseAgentType } from '../../agent-types/base-agent-type';
import type { AgentRunContext } from '../AgentRunContext';
import { SafeResolveEffectiveAgentProperties } from '../AgentHelperResolver';

/**
 * Collaborator handling data preloading, run creation, checkpoint resume, config load & validation.
 */
export class AgentRunInitializationHelper {
    public async PreloadAgentData(ctx: AgentRunContext, params: ExecuteAgentParams): Promise<void> {
        if (params.disableDataPreloading === true) {
            ctx.Hooks.LogStatus(`⏭️  Data preloading disabled for agent '${params.agent.Name}'`, true, params);
            return;
        }
        if (ctx.Hooks.RunAudienceAddsReader(params)) {
            ctx.Hooks.LogStatus(
                `⏭️  Data preloading skipped for agent '${params.agent.Name}': the run has an audience, ` +
                    `and preloaded data is loaded with the caller's rights alone`,
                false,
                params
            );
            return;
        }

        try {
            const preloadedResult = await AgentDataPreloader.Instance.PreloadAgentData(
                params.agent.ID,
                params.contextUser,
                ctx.AgentRun?.ID,
                params.provider || ctx.ActiveProvider
            );

            const totalSources =
                Object.keys(preloadedResult.data).length +
                Object.keys(preloadedResult.context).length +
                Object.keys(preloadedResult.payload).length;

            const hadActivity = totalSources > 0 || preloadedResult.failedSources.length > 0;

            if (totalSources > 0) {
                const destinations: string[] = [];
                if (Object.keys(preloadedResult.data).length > 0) {
                    destinations.push(`data(${Object.keys(preloadedResult.data).length})`);
                }
                if (Object.keys(preloadedResult.context).length > 0) {
                    destinations.push(`context(${Object.keys(preloadedResult.context).length})`);
                }
                if (Object.keys(preloadedResult.payload).length > 0) {
                    destinations.push(`payload(${Object.keys(preloadedResult.payload).length})`);
                }

                ctx.Hooks.LogStatus(
                    `📊 Preloaded ${totalSources} data source(s) for agent '${params.agent.Name}': ${destinations.join(', ')}`,
                    true,
                    params
                );

                params.data = {
                    ...preloadedResult.data,
                    ...params.data,
                };

                if (preloadedResult.context && typeof preloadedResult.context === 'object') {
                    if (!params.context || typeof params.context !== 'object') {
                        params.context = preloadedResult.context;
                    } else {
                        for (const key of Object.keys(preloadedResult.context)) {
                            if (!(key in params.context)) {
                                (params.context as Record<string, unknown>)[key] = (
                                    preloadedResult.context as Record<string, unknown>
                                )[key];
                            }
                        }
                    }
                }

                params.payload = {
                    ...preloadedResult.payload,
                    ...params.payload,
                };
            } else if (!hadActivity) {
                ctx.Hooks.LogStatus(`📭 No data sources configured for agent '${params.agent.Name}'`, true, params);
                return;
            }

            const hasFailures = preloadedResult.failedSources.length > 0;
            let warningMessage: string | undefined;
            if (hasFailures) {
                const failureDetails = preloadedResult.failedSources
                    .map((f) => `${f.name}${f.entityName ? ` (Entity: ${f.entityName})` : ''}: ${f.errorMessage}`)
                    .join('; ');

                warningMessage = `${preloadedResult.failedSources.length} data source(s) failed to load: ${failureDetails}`;
            }

            await ctx.Hooks.CreateStepEntity({
                stepType: 'Validation',
                stepName: 'Data Source Preloading',
                contextUser: params.contextUser,
                completed: {
                    success: true,
                    errorMessage: warningMessage,
                    outputData: hasFailures
                        ? { loadedSources: preloadedResult.loadedSources, failedSources: preloadedResult.failedSources }
                        : { loadedSources: preloadedResult.loadedSources },
                },
            });

            if (hasFailures && ctx.AgentRun && warningMessage) {
                const existing = ctx.AgentRun.ErrorMessage || '';
                ctx.AgentRun.ErrorMessage = existing
                    ? `${existing}\n\n[Data Preloading Warning] ${warningMessage}`
                    : `[Data Preloading Warning] ${warningMessage}`;
                await ctx.AgentRun.Save({ SaveReturnMode: 'datestamps_only' });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            ctx.Hooks.LogError(`Failed to preload data for agent '${params.agent.Name}': ${errorMessage}`, {
                agent: params.agent,
                category: 'DataPreloading',
                severity: 'warning',
            });
        }
    }

    public async ValidateRunChain(
        ctx: AgentRunContext,
        lastRunId: string,
        contextUser?: UserInfo,
        preloadedLastRun?: { LastRunID?: string | null } | null
    ): Promise<void> {
        const visitedRunIds = new Set<string>();
        visitedRunIds.add(ctx.AgentRun!.ID);

        let currentRunId: string | null | undefined = lastRunId;
        const maxChainLength = LimitsConfigResolver.Resolve().Limits.ResourceGuards.MaxRunChainLength;
        let chainLength = 0;
        let rv: RunView | undefined;

        while (currentRunId) {
            if (visitedRunIds.has(currentRunId)) {
                throw new Error(`Circular reference detected in run chain. Run ID '${currentRunId}' creates a loop.`);
            }

            if (++chainLength > maxChainLength) {
                throw new Error(
                    `Run chain exceeds maximum length of ${maxChainLength}. This may indicate a data issue.`
                );
            }

            visitedRunIds.add(currentRunId);

            if (chainLength === 1 && preloadedLastRun !== undefined) {
                if (preloadedLastRun === null) {
                    break;
                }
                currentRunId = preloadedLastRun.LastRunID;
                continue;
            }

            rv ??= new RunView();
            const result = await rv.RunView<{ LastRunID?: string | null }>(
                {
                    EntityName: 'MJ: AI Agent Runs',
                    ExtraFilter: `ID='${currentRunId}'`,
                    ResultType: 'simple',
                },
                contextUser
            );

            if (!result.Success || result.Results.length === 0) {
                break;
            }

            currentRunId = result.Results[0].LastRunID;
        }
    }

    public async ValidateAgent(
        ctx: AgentRunContext,
        agent: MJAIAgentEntityExtended
    ): Promise<ExecuteAgentResult | null> {
        if (agent.Status !== 'Active') {
            if (ctx.AgentRun) {
                ctx.AgentRun.ErrorMessage = `Agent '${agent.Name}' is not active. Current status: ${agent.Status}`;
                ctx.AgentRun.Status = 'Failed';
                ctx.AgentRun.Success = false;
                ctx.AgentRun.FinalStep = 'Failed';
            }
            return {
                success: false,
                agentRun: ctx.AgentRun!,
            };
        }
        return null;
    }

    public async LoadAgentConfiguration(
        ctx: AgentRunContext,
        agent: MJAIAgentEntityExtended
    ): Promise<AgentConfiguration> {
        const engine = AIEngine.Instance;

        const effectiveProps =
            typeof engine.ResolveEffectiveAgentProperties === 'function'
                ? engine.ResolveEffectiveAgentProperties(agent)
                : null;
        const effectiveDriverClass = effectiveProps?.DriverClass ?? agent.DriverClass;
        const effectiveTypeId = effectiveProps?.TypeID ?? agent.TypeID;

        let metadataOptional: boolean = false;
        if (effectiveDriverClass) {
            ctx.Hooks.LogStatus(`🔧 Using custom driver class '${effectiveDriverClass}' for agent '${agent.Name}'`, true);
            metadataOptional = true;
        }

        const agentType = engine.AgentTypes.find((at) => UUIDsEqual(at.ID, effectiveTypeId));
        if (!agentType && !metadataOptional) {
            return {
                success: false,
                errorMessage: `Agent type not found for ID: ${effectiveTypeId}`,
            };
        }

        const agentTypeInstance = await BaseAgentType.GetAgentTypeInstance(agentType);
        const requiresAgentLevelPrompts = agentTypeInstance.RequiresAgentLevelPrompts;

        const systemPrompt = engine.Prompts.find((p) => UUIDsEqual(p.ID, agentType?.SystemPromptID));

        if (!systemPrompt) {
            metadataOptional = true;
        }

        const agentPrompt = ctx.Hooks.GetEffectiveAgentPrompts(agent.ID)[0];

        if (!agentPrompt && !metadataOptional && requiresAgentLevelPrompts) {
            return {
                success: false,
                errorMessage: `No prompts configured for agent: ${agent.Name}`,
            };
        }

        const childPrompt = agentPrompt ? engine.Prompts.find((p) => UUIDsEqual(p.ID, agentPrompt.PromptID)) : undefined;

        if (!childPrompt && !metadataOptional && requiresAgentLevelPrompts) {
            return {
                success: false,
                errorMessage: `Child prompt not found for ID: ${agentPrompt?.PromptID}`,
            };
        }

        if (!agentType?.AgentPromptPlaceholder && !metadataOptional) {
            return {
                success: false,
                errorMessage: `Agent type '${agentType?.Name}' does not have AgentPromptPlaceholder configured.`,
            };
        }

        return {
            success: true,
            agentType,
            systemPrompt,
            childPrompt,
        };
    }

    public AssertLastRunIdIsUUID(lastRunId: string | undefined): void {
        if (lastRunId && !IsValidUUID(lastRunId)) {
            throw new Error('Invalid lastRunId: expected the UUID of a prior AI Agent Run.');
        }
    }

    public GetAgentTypeName(typeID: string): string {
        const agentType = AIEngine.Instance.AgentTypes.find((at) => UUIDsEqual(at.ID, typeID));
        return agentType?.Name || 'Unknown';
    }

    public GetValueListItems(_valueListID: string): string[] | null {
        return null;
    }

    public GetActionCategoryName(_categoryID: string): string {
        return 'General';
    }

    public async InitializeAgentRun(ctx: AgentRunContext, params: ExecuteAgentParams): Promise<void> {
        ctx.Hooks.AssertLastRunIdIsUUID(params.lastRunId);

        let modifiedParams = params;
        let preloadedLastRun: { LastRunID?: string | null } | null | undefined;
        if (params.lastRunId && params.autoPopulateLastRunPayload) {
            const rv = new RunView();
            const lastRunResult = await rv.RunView<{ LastRunID?: string | null; FinalPayload?: string | null }>(
                {
                    EntityName: 'MJ: AI Agent Runs',
                    ExtraFilter: `ID='${params.lastRunId}'`,
                    ResultType: 'simple',
                    BypassCache: true,
                },
                params.contextUser
            );

            if (lastRunResult.Success) {
                preloadedLastRun = lastRunResult.Results[0] ?? null;
            }
            if (lastRunResult.Success && lastRunResult.Results.length > 0) {
                const lastRun = lastRunResult.Results[0];
                if (lastRun.FinalPayload) {
                    try {
                        const lastPayload = JSON.parse(lastRun.FinalPayload);
                        if (!params.payload) {
                            modifiedParams = {
                                ...params,
                                payload: lastPayload,
                            };
                        }
                    } catch (e) {
                        ctx.Hooks.LogError(`Failed to parse FinalPayload from last run: ${e}`, {
                            category: 'LastRunPayload',
                            metadata: { lastRunId: params.lastRunId },
                        });
                    }
                }
            }
        }

        ctx.PromptTurnCount = 0;
        ctx.LastRecordedPromptStack = null;
        ctx.TemplateEngineConfiguredForRun = false;
        ctx.HeldDecisions = undefined;
        ctx.AwaitingWorkflowTaskID = null;
        ctx.TaintedSources = [];
        ctx.ActionSpilloverManager.Clear();

        ctx.ActionResultCrush = ctx.Hooks.ResolveActionResultCrush(params);

        const runProvider = params.provider || ctx.ActiveProvider;
        if (params.resumeCheckpointRunId) {
            await this.RestorePausedRunFromCheckpoint(ctx, params, runProvider);
            return;
        }

        const agentRun = await runProvider.GetEntityObject<MJAIAgentRunEntityExtended>(
            'MJ: AI Agent Runs',
            params.contextUser
        );
        ctx.AgentRun = agentRun;
        agentRun.AgentID = params.agent.ID;
        if (params.scheduledJobRunId) {
            agentRun.ScheduledJobRunID = params.scheduledJobRunId;
        }
        if (params.conversationDetailId) {
            agentRun.ConversationDetailID = params.conversationDetailId;
        }
        const conversationIdFromParams =
            params.conversationId || (params.data?.conversationId as string | undefined);
        if (conversationIdFromParams) {
            agentRun.ConversationID = conversationIdFromParams;
        } else if (params.conversationDetailId) {
            const convDetail = await (params.provider || ctx.ActiveProvider).GetEntityObject<MJConversationDetailEntity>(
                'MJ: Conversation Details',
                params.contextUser
            );
            if (await convDetail.Load(params.conversationDetailId)) {
                agentRun.ConversationID = convDetail.ConversationID;
            }
        }
        if (params.agentSessionID) {
            agentRun.AgentSessionID = params.agentSessionID;
        }
        agentRun.Status = 'Running';
        agentRun.StartedAt = new Date();
        agentRun.UserID = params.userId || params.contextUser?.ID || null;
        agentRun.CompanyID = params.companyId || null;

        const effectiveInitProps = SafeResolveEffectiveAgentProperties(params.agent);
        const defaultEffort = effectiveInitProps?.DefaultPromptEffortLevel ?? params.agent.DefaultPromptEffortLevel;
        if (params.effortLevel !== undefined && params.effortLevel !== null) {
            agentRun.EffortLevel = params.effortLevel;
        } else if (defaultEffort !== undefined && defaultEffort !== null) {
            agentRun.EffortLevel = defaultEffort;
        }

        agentRun.ParentRunID = params.parentRun?.ID ?? null;
        agentRun.ContinuationDepth = params.continuationDepth ?? 0;

        if (params.boundActionParams) {
            const serialized = JSON.stringify(params.boundActionParams, (_key, value) =>
                value === undefined ? null : value
            );
            if (typeof agentRun.SetServerBoundActionParams === 'function') {
                agentRun.SetServerBoundActionParams(serialized);
            } else {
                agentRun.BoundActionParams = serialized;
            }
        }

        if (params.lastRunId) {
            await this.ValidateRunChain(ctx, params.lastRunId, params.contextUser, preloadedLastRun);
            agentRun.LastRunID = params.lastRunId;
        }

        if (modifiedParams.payload) {
            const sanitized = StringifyForPersistence(modifiedParams.payload, 'payload');
            agentRun.StartingPayload = sanitized.JSON;
            ctx.Hooks.WarnAboutDroppedValues('StartingPayload', sanitized.DroppedPaths, params);
        }

        if (params.configurationId) {
            agentRun.ConfigurationID = params.configurationId;
        }
        if (params.override?.modelId) {
            agentRun.OverrideModelID = params.override.modelId;
        }
        if (params.override?.vendorId) {
            agentRun.OverrideVendorID = params.override.vendorId;
        }
        if (params.data) {
            const sanitized = StringifyForPersistence(params.data, 'data');
            agentRun.Data = sanitized.JSON;
            ctx.Hooks.WarnAboutDroppedValues('Data', sanitized.DroppedPaths, params);
        }
        agentRun.Verbose = params.verbose || false;

        if (params.testRunId) {
            agentRun.TestRunID = params.testRunId;
        }

        ctx.RunScope = ctx.Hooks.ValidatedRunScope(params);
        ctx.Hooks.WriteRunScope(params, ctx.RunScope);

        ctx.AgentHierarchy = params.parentAgentHierarchy
            ? [...params.parentAgentHierarchy, params.agent.Name || 'Unknown Agent']
            : [params.agent.Name || 'Unknown Agent'];
        ctx.Depth = params.parentDepth !== undefined ? params.parentDepth + 1 : 0;
        ctx.ParentStepCounts = params.parentStepCounts || [];

        if (ctx.ActiveLimitsResolution) {
            const snapshot = BuildLimitsDiagnosticsSnapshot(ctx.ActiveLimitsResolution, {
                AgentID: params.agent.ID,
                AgentName: params.agent.Name ?? undefined,
                AgentRunID: agentRun.ID,
                UserID: agentRun.UserID ?? undefined,
                RoutineID: params.routineId,
            });
            AttachLimitsDiagnosticsToAgentRun(agentRun, snapshot);
        }

        const planModeGatePromise = ctx.Hooks.ResolvePlanModeGate(params);

        if (!(await agentRun.Save({ SaveReturnMode: 'datestamps_only' }))) {
            await planModeGatePromise.catch(() => undefined);
            const errorMessage = JSON.stringify(CopyScalarsAndArrays(agentRun.LatestResult));
            throw new Error(`Failed to create agent run record: Details: ${errorMessage}`);
        }
        if (ctx.CurrentLateJudgeScope) {
            ctx.CurrentLateJudgeScope.AgentRun = agentRun;
            ctx.CurrentLateJudgeScope.TreeBudget = ctx.TreeBudget;
        }

        if (runProvider instanceof DatabaseProviderBase && params.contextUser) {
            AgentRunWatchdog.Instance.Track(
                agentRun.ID,
                runProvider,
                params.contextUser,
                ctx.RunAbortController ?? undefined
            );
        }
        ctx.Hooks.RegisterActiveRunForCooperativePause();

        if (modifiedParams.onAgentRunCreated) {
            try {
                await modifiedParams.onAgentRunCreated(agentRun.ID);
            } catch (callbackError) {
                const msg = callbackError instanceof Error ? callbackError.message : String(callbackError);
                LogStatus(`Error in onAgentRunCreated callback: ${msg}`);
            }
        }

        const planModeGate = await planModeGatePromise;
        ctx.PlanModeActive = planModeGate.active;
        ctx.PlanApproved = planModeGate.approved;

        if (ctx.AgentRun && planModeGate.active) {
            ctx.AgentRun.PlanMode = true;
        }

        await ctx.Hooks.PreActivateRequestedSkills(params);

        ctx.AllProgressSteps = [];

        if (modifiedParams !== params && modifiedParams.payload !== undefined) {
            params.payload = modifiedParams.payload;
        }
    }

    public async RestorePausedRunFromCheckpoint(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        runProvider: IMetadataProvider
    ): Promise<void> {
        const flushedPending = await ctx.Hooks.FlushPendingCheckpointPersistence(
            params.resumeCheckpointRunId,
            runProvider
        );
        if (flushedPending && !flushedPending.Saved) {
            throw new Error(
                `Cannot resume run ${params.resumeCheckpointRunId}: safe-point checkpoint persistence is still pending (${flushedPending.SaveError ?? 'storage unavailable'}).`
            );
        }
        ctx.PendingCheckpointPersistence = null;
        const baseBudgets = ctx.ActiveBudgets ?? ctx.Hooks.ResolvedLimits(params).Budgets;
        const restored = await ctx.CheckpointManager.PrepareResumeFromCheckpoint({
            AgentRunID: params.resumeCheckpointRunId!,
            BaseBudgets: baseBudgets,
            HumanApprovalOverride: params.humanResumeApproval,
            Provider: runProvider,
            ContextUser: params.contextUser,
        });

        ctx.AgentRun = restored.AgentRun;
        ctx.ResumedCheckpointContext = restored;
        ctx.ActiveBudgets = restored.ExtendedBudgets;
        ctx.BudgetTracker.UpdateTreeBudgetFromExtendedBudgets(ctx.TreeBudget, restored.ExtendedBudgets);
        if (!params.routineId && restored.Checkpoint.RoutineID) {
            params.routineId = restored.Checkpoint.RoutineID;
        }
        if (ctx.ActiveLimitsResolution) {
            ctx.ActiveLimitsResolution = {
                ...ctx.ActiveLimitsResolution,
                Limits: {
                    ...ctx.ActiveLimitsResolution.Limits,
                    Budgets: restored.ExtendedBudgets,
                },
            };
        }
        const initialStepStats = ctx.Hooks.CalculateTokenStats();
        ctx.CheckpointStepCostBaseline = initialStepStats.TotalCost;
        ctx.PriorNonStepCostUsd = Math.max(0, restored.PriorCumulativeCostUsd - ctx.CheckpointStepCostBaseline);
        ctx.PriorNonStepTokensUsed = Math.max(
            0,
            restored.Checkpoint.CumulativeLedger.RunTokens - initialStepStats.TotalTokens
        );
        ctx.FastJudgeCostUsd = 0;
        ctx.FastJudgeTokensUsed = 0;
        ctx.ReconciledFastJudgeInvocationIds.clear();
        ctx.FastConvergenceJudge.ResetTracking();
        ctx.PriorDayCostBaselineUsd = restored.PriorDayCostBaselineUsd;
        ctx.PriorDayWallClockBaselineMs = restored.PriorDayWallClockBaselineMs;
        ctx.LastObservedDaySnapshot = {
            DayBucketUTC: restored.Checkpoint.CumulativeLedger.DayBucketUTC,
            CostUsd: restored.PriorCumulativeCostUsd,
            WallClockMs: restored.PriorCumulativeActiveWallClockMs,
        };
        const storedEvents = ExtractBudgetCostEventsFromRunData(ctx.AgentRun.Data);
        ctx.BudgetCostEvents =
            storedEvents.length > 0 ? storedEvents : [...(restored.Checkpoint.CumulativeLedger.CostEvents ?? [])];
        const storedBaselines = ExtractBudgetDayBaselinesFromRunData(ctx.AgentRun.Data);
        ctx.BudgetDayBaselines =
            Object.keys(storedBaselines).length > 0
                ? storedBaselines
                : { ...(restored.Checkpoint.CumulativeLedger.DayCostBaselines ?? {}) };
        ctx.LastRecordedCostUsd = restored.PriorCumulativeCostUsd;
        if (ctx.CurrentLateJudgeScope) {
            ctx.CurrentLateJudgeScope.AgentRun = ctx.AgentRun;
            ctx.CurrentLateJudgeScope.CostEvents = ctx.BudgetCostEvents;
            ctx.CurrentLateJudgeScope.DayCostBaselines = ctx.BudgetDayBaselines;
            ctx.CurrentLateJudgeScope.TreeBudget = ctx.TreeBudget;
            ctx.CurrentLateJudgeScope.LoopExited = false;
        }
        await ctx.CheckpointManager.MarkResumeStarted(ctx.AgentRun);
        ctx.PromptTurnCount = restored.StartingPromptTurns;

        ctx.ScratchpadManager.Clear();
        ctx.ScratchpadManager.SetNotes(restored.RestoredScratchpad.notes);
        ctx.ScratchpadManager.UpsertTasks(restored.RestoredScratchpad.tasks);

        if (restored.ResetProgressDetectorWindow) {
            ctx.ProgressDetector.Reset();
            ctx.FastConvergenceJudge.ResetCooldown();
        }

        if (restored.RestoredPayload !== undefined) {
            params.payload = restored.RestoredPayload;
        }
        if (restored.RestoredMessages.length > 0) {
            const newMessages = [...params.conversationMessages];
            params.conversationMessages.length = 0;
            params.conversationMessages.push(...restored.RestoredMessages, ...newMessages);
        }

        ctx.RunScope = ctx.Hooks.ValidatedRunScope(params);
        ctx.AgentHierarchy = params.parentAgentHierarchy
            ? [...params.parentAgentHierarchy, params.agent.Name || 'Unknown Agent']
            : [params.agent.Name || 'Unknown Agent'];
        ctx.Depth = params.parentDepth !== undefined ? params.parentDepth + 1 : 0;
        ctx.ParentStepCounts = params.parentStepCounts || [];
        // Re-evaluate the Plan Mode gate on checkpoint resume via virtual hook (honoring subclass
        // overrides) and checking the prior run (`LastRunID`, where the approved Plan Mode request
        // lives) before falling back to the paused run's own ID.
        const resumedPlanGate = await ctx.Hooks.ResolvePlanModeGate({
            ...params,
            lastRunId: params.lastRunId ?? ctx.AgentRun.LastRunID ?? ctx.AgentRun.ID,
        });
        ctx.PlanModeActive = resumedPlanGate.active;
        ctx.PlanApproved = resumedPlanGate.approved;
        ctx.AllProgressSteps = [];

        if (ctx.ActiveLimitsResolution) {
            const snapshot = BuildLimitsDiagnosticsSnapshot(ctx.ActiveLimitsResolution, {
                AgentID: params.agent.ID,
                AgentName: params.agent.Name ?? undefined,
                AgentRunID: ctx.AgentRun.ID,
                UserID: ctx.AgentRun.UserID ?? undefined,
                RoutineID: params.routineId,
            });
            AttachLimitsDiagnosticsToAgentRun(ctx.AgentRun, snapshot);
        }

        if (runProvider instanceof DatabaseProviderBase && params.contextUser) {
            AgentRunWatchdog.Instance.Track(
                ctx.AgentRun.ID,
                runProvider,
                params.contextUser,
                ctx.RunAbortController ?? undefined
            );
        }
        ctx.Hooks.RegisterActiveRunForCooperativePause();
    }

    public async ResolvePlanModeGate(
        ctx: AgentRunContext,
        params: ExecuteAgentParams
    ): Promise<{ active: boolean; approved: boolean }> {
        let effectivePlanProps: ReturnType<typeof SafeResolveEffectiveAgentProperties> = null;
        try {
            effectivePlanProps = SafeResolveEffectiveAgentProperties(params.agent, true);
        } catch {
            // Fail closed on unexpected cascade resolution errors: require Plan Mode approval.
            return { active: ctx.Depth === 0, approved: false };
        }
        const requiredByAgent = (effectivePlanProps?.RequirePlanMode ?? params.agent.RequirePlanMode) === true;
        const supportsPlan = (effectivePlanProps?.SupportsPlanMode ?? params.agent.SupportsPlanMode) !== false;
        const requestedByCaller = !!(supportsPlan && params.planMode === true);
        const active = ctx.Depth === 0 && (requiredByAgent || requestedByCaller);
        if (!active) {
            return { active: false, approved: false };
        }

        if (!params.lastRunId) {
            return { active: true, approved: false };
        }

        const rv = new RunView();
        const requestResult = await rv.RunView<{ Status: string; OriginatingAgentRunStepID: string | null }>(
            {
                EntityName: 'MJ: AI Agent Requests',
                ExtraFilter: `OriginatingAgentRunID='${params.lastRunId}'`,
                Fields: ['Status', 'OriginatingAgentRunStepID'],
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 1,
                SkipTotalRowCount: true,
                ResultType: 'simple',
            },
            params.contextUser
        );

        if (!requestResult.Success || requestResult.Results.length === 0) {
            return { active: true, approved: false };
        }

        const request = requestResult.Results[0];
        const resolved = request.Status === 'Approved' || request.Status === 'Responded';
        if (!resolved || !request.OriginatingAgentRunStepID) {
            return { active: true, approved: false };
        }

        const stepResult = await rv.RunView<{ StepType: string }>(
            {
                EntityName: 'MJ: AI Agent Run Steps',
                ExtraFilter: `ID='${request.OriginatingAgentRunStepID}'`,
                Fields: ['StepType'],
                MaxRows: 1,
                SkipTotalRowCount: true,
                ResultType: 'simple',
            },
            params.contextUser
        );

        const approved =
            stepResult.Success && stepResult.Results.length > 0 && stepResult.Results[0].StepType === 'Plan';

        return { active: true, approved };
    }

    public async ValidateAgentWithTracking(
        ctx: AgentRunContext,
        agent: MJAIAgentEntityExtended,
        contextUser: UserInfo
    ): Promise<ExecuteAgentResult | null> {
        try {
            const validationResult = await ctx.Hooks.ValidateAgent(agent);

            if (validationResult) {
                await ctx.Hooks.CreateStepEntity({
                    stepType: 'Validation',
                    stepName: 'Agent Validation',
                    contextUser,
                    completed: {
                        success: false,
                        errorMessage: validationResult.agentRun?.ErrorMessage ?? undefined,
                    },
                });

                return await ctx.Hooks.CreateFailureResult(
                    validationResult.agentRun?.ErrorMessage || 'Validation failed',
                    contextUser
                );
            }

            await ctx.Hooks.CreateStepEntity({
                stepType: 'Validation',
                stepName: 'Agent Validation',
                contextUser,
                completed: {
                    success: true,
                },
            });

            return null;
        } catch (error) {
            return await ctx.Hooks.CreateFailureResult(`Validation error: ${(error as Error).message}`, contextUser);
        }
    }
}
