/**
 * @fileoverview Collaborator owned by {@link AgentPromptHelper} encapsulating prompt template
 * data assembly, agent base catalog building & caching, catalog narrowing, sub-agent change
 * propagation, agent-type prompt param merging, and prompt parameter formatting.
 *
 * @module @memberjunction/ai-agents
 */

import {
    AgentUserPolicyEngine,
    type ActionChange,
    type AgentContextData,
    type BoundActionParams,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
    type SubAgentChange,
} from '@memberjunction/ai-core-plus';
import type { MJActionEntityExtended } from '@memberjunction/actions-base';
import { ActionEngineServer } from '@memberjunction/actions';
import type { DecisionQuestion } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import type { AIDecisionRunResult } from '@memberjunction/ai-prompts';
import { LimitsConfigResolver, LogError, LogErrorEx, LogStatus, type UserInfo } from '@memberjunction/core';
import type {
    MJAIAgentRelationshipEntity,
    MJAIAgentTypeEntity,
    MJAISkillEntity,
    MJTemplateParamEntity,
} from '@memberjunction/core-entities';
import { IndexByUUID, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { AgentDecisionService } from '../../AgentDecisionService';
import {
    ApplyCatalogNarrowing,
    BuildCatalogNarrowingQuestions,
    CATALOG_NARROWING_FIND_ACTIONS,
    CATALOG_NARROWING_FIND_SKILLS,
    CatalogNarrowingCandidatesToAsk,
    CatalogNarrowingNote,
    IsAlwaysShownAction,
    IsCatalogListNarrowed,
    NoCatalogNarrowing,
    PreFilterSkillCandidatesForDecision,
    ReachableCatalogNarrowingLimits,
    ResolveCatalogNarrowingLimits,
    SelectCatalogNarrowing,
    type CatalogNarrowingCandidate,
    type CatalogNarrowingKind,
    type CatalogNarrowingLimits,
    type CatalogNarrowingOutcome,
} from '../../catalog-narrowing';
import { FinishIfModeWarnings } from '../../finish-if-mode-warnings';
import type { AgentRunContext } from '../AgentRunContext';
import { AgentStepTypeRegistry } from '../steps/AgentStepTypeRegistry';
import type { AgentBaseCatalog, PromptWithholding } from '../base-agent-types';
import type { BaseAgentPromptHelper } from './BaseAgentPromptHelper';

/**
 * Collaborator handling `GatherPromptTemplateData`, base catalog caching, catalog narrowing,
 * runtime `SubAgentChange` application, and merged agent-type prompt parameters.
 */
export class AgentPromptCatalogAndNarrowingHelper {
    private static readonly _finishIfModeWarnings = new FinishIfModeWarnings();

    public async GatherPromptTemplateData(
        ctx: AgentRunContext,
        promptHelper: BaseAgentPromptHelper,
        agent: MJAIAgentEntityExtended,
        _contextUser?: UserInfo,
        extraData?: Record<string, unknown>,
        actionChanges?: ActionChange[],
        subAgentChanges?: SubAgentChange[],
        boundActionParams?: BoundActionParams,
        withholdingOrParentRun?: PromptWithholding | MJAIAgentRunEntityExtended,
        parentRun?: MJAIAgentRunEntityExtended
    ): Promise<AgentContextData> {
        const isWithholdingShape = (
            val: PromptWithholding | MJAIAgentRunEntityExtended | undefined
        ): val is PromptWithholding => typeof val === 'object' && val !== null && 'TaskGraphs' in val;
        const withholding = isWithholdingShape(withholdingOrParentRun) ? withholdingOrParentRun : undefined;
        const resolvedParentRun = isWithholdingShape(withholdingOrParentRun)
            ? parentRun
            : (parentRun ?? withholdingOrParentRun);
        try {
            const engine = AIEngine.Instance;

            let catalog = engine.GetAgentBaseCatalog<AgentBaseCatalog>(agent.ID);
            if (!catalog) {
                catalog = ctx.Hooks.BuildAgentBaseCatalog(agent, engine);
                engine.SetAgentBaseCatalog(agent.ID, catalog);
            }

            const isRoot = ctx.Depth === 0;

            let uniqueActiveSubAgents = catalog.uniqueActiveSubAgents;
            let subAgentDetails = catalog.subAgentDetails;
            let subAgentCount = catalog.subAgentCount;
            if (subAgentChanges?.length) {
                uniqueActiveSubAgents = ctx.Hooks.ApplySubAgentChanges(
                    catalog.uniqueActiveSubAgents,
                    subAgentChanges,
                    agent.ID,
                    isRoot,
                    engine
                );
                subAgentCount = uniqueActiveSubAgents.length;
                subAgentDetails = this.FormatSubAgentDetails(ctx, uniqueActiveSubAgents);
            }

            let activeActions = catalog.activeActions;
            let actionDetails = catalog.actionDetails;
            if (actionChanges?.length) {
                const result = ctx.Hooks.ApplyActionChanges([...catalog.baseActionsRaw], actionChanges, agent.ID, isRoot);
                activeActions = result.actions.filter((a) => a.Status === 'Active');
                ctx.DynamicActionLimits = result.dynamicLimits;
                actionDetails = ctx.ActionsHelper.FormatActionDetails(ctx, activeActions, boundActionParams);
            } else {
                ctx.DynamicActionLimits = {};
                if (ctx.ActionPolicyHelper.BindsAnyAction(ctx, activeActions, boundActionParams)) {
                    actionDetails = ctx.ActionsHelper.FormatActionDetails(ctx, activeActions, boundActionParams);
                }
            }
            ctx.EffectiveActions = activeActions;
            ctx.EffectiveSubAgents = uniqueActiveSubAgents;
            ctx.EffectiveCatalogComputed = true;

            const runtimePromptParamOverrides = extraData?.__agentTypePromptParams as Record<string, unknown> | undefined;
            const effectiveProps =
                typeof engine.ResolveEffectiveAgentProperties === 'function'
                    ? engine.ResolveEffectiveAgentProperties(agent)
                    : null;
            let agentTypePromptParams: Record<string, unknown>;
            if (runtimePromptParamOverrides) {
                const effectiveTypeID = effectiveProps?.TypeID ?? agent.TypeID;
                const agentType = engine.AgentTypes.find((at) => UUIDsEqual(at.ID, effectiveTypeID));
                agentTypePromptParams = ctx.Hooks.BuildAgentTypePromptParams(agentType, agent, runtimePromptParamOverrides);
            } else {
                agentTypePromptParams = { ...catalog.baseAgentTypePromptParams };
            }
            if (withholding?.TaskGraphs) {
                agentTypePromptParams = ctx.ActionPolicyHelper.WithoutTaskGraphs(ctx, agentTypePromptParams);
            }
            if (withholding?.Handoff) {
                agentTypePromptParams = ctx.ActionPolicyHelper.WithoutHandoff(ctx, agentTypePromptParams);
            }
            ctx.AgentTypePromptParams = agentTypePromptParams;

            const availableSkills = await ctx.Hooks.AvailableSkills(
                engine.GetAutoActivatableSkillsForAgent(agent, _contextUser),
                'catalog',
                agent,
                _contextUser
            );

            await this.EnsureCatalogNarrowing(
                ctx,
                promptHelper,
                agent,
                _contextUser,
                agentTypePromptParams,
                activeActions,
                uniqueActiveSubAgents,
                availableSkills
            );
            actionDetails = this.NarrowedCatalogSection(ctx, 'action', activeActions, actionDetails, (shown) =>
                ctx.ActionsHelper.FormatActionDetails(ctx, shown, boundActionParams)
            );
            subAgentDetails = this.NarrowedCatalogSection(ctx, 'agent', uniqueActiveSubAgents, subAgentDetails, (shown) =>
                this.FormatSubAgentDetails(ctx, shown)
            );
            const skillsCatalog = this.NarrowedCatalogSection(
                ctx,
                'skill',
                availableSkills,
                this.FormatSkillsCatalog(ctx, availableSkills),
                (shown) => this.FormatSkillsCatalog(ctx, shown)
            );

            const { clientToolDetails, appContext } = ctx.ActionPolicyHelper.CallerContextSections(
                ctx,
                agent,
                extraData,
                withholding?.CallerContext === true
            );

            const subAgentConsultEnabled = uniqueActiveSubAgents.some((sa) =>
                ctx.Hooks.IsSubAgentConsultEnabledForSubAgent(agent, sa)
            );
            const subAgentPresetsAvailable = uniqueActiveSubAgents.some(
                (sa) => AIEngine.Instance.GetAgentConfigurationPresets(sa.ID, true).length > 0
            );

            let parentConsults = false;
            const effectiveParentRun = resolvedParentRun ?? ctx.ExecuteParams?.parentRun;
            if (!isRoot && effectiveParentRun?.AgentID) {
                const parentAgent = (engine.Agents ?? []).find((a) => UUIDsEqual(a.ID, effectiveParentRun.AgentID));
                if (parentAgent) {
                    const isDirectChild = agent.ParentID != null && UUIDsEqual(agent.ParentID, parentAgent.ID);
                    const relationship = isDirectChild
                        ? undefined
                        : (engine.AgentRelationships ?? []).find(
                              (r) =>
                                  UUIDsEqual(r.AgentID, parentAgent.ID) &&
                                  UUIDsEqual(r.SubAgentID, agent.ID) &&
                                  r.Status === 'Active'
                          );
                    parentConsults = ctx.Hooks.ResolveSubAgentChatHandlingOption(parentAgent, relationship) === 'Consult';
                }
            }

            const inheritanceChain =
                typeof engine.GetAgentInheritanceChain === 'function' ? engine.GetAgentInheritanceChain(agent.ID) : [agent];
            const cachedUserPolicy = _contextUser?.ID
                ? agent.BaseAgentID && inheritanceChain.length > 1
                    ? AgentUserPolicyEngine.Instance.GetCachedEffectivePolicyForAgentChain(
                          inheritanceChain.map((a) => a.ID),
                          _contextUser.ID
                      )
                    : AgentUserPolicyEngine.Instance.GetCachedPolicy(agent.ID, _contextUser.ID)
                : null;

            const agentIsDerivedInstance = Boolean(agent.BaseAgentID);
            const baseAgentEntity = agent.BaseAgentID
                ? engine.Agents.find((a) => UUIDsEqual(a.ID, agent.BaseAgentID))
                : undefined;
            const agentBaseAgentName = baseAgentEntity?.Name ?? '';
            const effectiveAgentName = agentIsDerivedInstance
                ? agent.Name
                : cachedUserPolicy?.DisplayNameOverride?.trim() || agent.Name;
            const activeConversationId = ctx.ExecuteParams?.conversationId ?? ctx.AgentRun?.ConversationID ?? '';

            const runnableAgentDirectory =
                typeof engine.GetUserRunnableAgentDirectory === 'function'
                    ? engine.GetUserRunnableAgentDirectory(_contextUser)
                    : [];
            const maxPreloadedAgents = 25; // cap preloaded directory entries in prompt context
            const visibleRunnableAgents = runnableAgentDirectory.slice(0, maxPreloadedAgents);
            const availableAgentLines = visibleRunnableAgents.map((a) =>
                a.Description ? `- **${a.Name}**: ${a.Description}` : `- **${a.Name}**`
            );
            if (runnableAgentDirectory.length > maxPreloadedAgents) {
                availableAgentLines.push(
                    `*(Showing ${maxPreloadedAgents} of ${runnableAgentDirectory.length} runnable agents — use "Find Candidate Agents" to search the full catalog)*`
                );
            }
            const availableAgentDetails = availableAgentLines.join('\n');

            const contextData: AgentContextData = {
                agentName: effectiveAgentName,
                agentDescription: agent.Description || baseAgentEntity?.Description || '',
                parentAgentName: agent.Parent ? agent.Parent.trim() : '',
                subAgentCount: subAgentCount,
                subAgentDetails: subAgentDetails,
                availableAgentCount: runnableAgentDirectory.length,
                availableAgentDetails: availableAgentDetails,
                actionCount: activeActions.length,
                actionDetails: actionDetails,
                clientToolDetails: clientToolDetails,
                skillCount: availableSkills.length,
                skillsCatalog: skillsCatalog,
                planModeActive: ctx.PlanModeActive,
                planApproved: ctx.PlanApproved,
                ...(subAgentConsultEnabled ? { subAgentConsultEnabled: true } : {}),
                ...(parentConsults ? { parentConsults: true } : {}),
                ...(subAgentPresetsAvailable ? { subAgentPresetsAvailable: true } : {}),
                appContext: appContext,
            };

            const result: AgentContextData & Record<string, unknown> = {
                ...contextData,
                ...(agentIsDerivedInstance
                    ? {
                          agentIsDerivedInstance: true,
                          agentBaseAgentName,
                          agentInstanceID: agent.ID,
                      }
                    : {}),
                ...(activeConversationId ? { conversationId: activeConversationId } : {}),
                __agentTypePromptParams: agentTypePromptParams,
                ...(cachedUserPolicy
                    ? {
                          userPolicyContext: AgentUserPolicyEngine.Instance.BuildPromptPolicyContextBlock(
                              cachedUserPolicy,
                              _contextUser
                          ),
                      }
                    : {}),
            };

            if (extraData) {
                const { __agentTypePromptParams: _ignored, appContext: _ignoredAppContext, ...restExtraData } = extraData;
                return {
                    ...result,
                    ...restExtraData,
                };
            }
            return result;
        } catch (error) {
            throw new Error(`Error gathering context data: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // -------------------------------------------------------------------------
    // Catalog Narrowing
    // -------------------------------------------------------------------------

    public async EnsureCatalogNarrowing(
        ctx: AgentRunContext,
        promptHelper: BaseAgentPromptHelper,
        agent: MJAIAgentEntityExtended,
        contextUser: UserInfo | undefined,
        promptParams: Record<string, unknown>,
        actions: MJActionEntityExtended[],
        subAgents: MJAIAgentEntityExtended[],
        skills: MJAISkillEntity[]
    ): Promise<void> {
        if (ctx.CatalogNarrowing) {
            return;
        }
        ctx.CatalogNarrowing = NoCatalogNarrowing();
        if (!ctx.Hooks.DecisionsEnabled(promptParams)) {
            return;
        }
        const limits = this.ReachableCatalogNarrowingLimits(agent, promptParams, actions);
        if (limits.Actions === 0 && limits.SubAgents === 0 && limits.Skills === 0) {
            return;
        }
        try {
            const rawCandidates = this.CatalogNarrowingCandidates(ctx, agent, actions, subAgents, skills);
            const maxSkillDecisionCandidates =
                typeof promptParams.maxSkillDecisionCandidates === 'number' && promptParams.maxSkillDecisionCandidates >= 1
                    ? Math.floor(promptParams.maxSkillDecisionCandidates)
                    : LimitsConfigResolver.Resolve().Limits.Tuning.MaxSkillDecisionCandidates;
            const { FilteredCandidates: candidates, PreHiddenSkillIDs: preHiddenSkillIDs } =
                PreFilterSkillCandidatesForDecision(rawCandidates, ctx.OpeningRequest ?? '', maxSkillDecisionCandidates);
            const asked = CatalogNarrowingCandidatesToAsk(candidates, limits);
            if (asked.length > 0) {
                const outcome = await this.NarrowCatalog(
                    ctx,
                    promptHelper,
                    agent,
                    contextUser,
                    promptParams,
                    candidates,
                    asked,
                    limits
                );
                if (preHiddenSkillIDs.size > 0) {
                    const mergedSkillHidden = new Set<string>(outcome.Hidden.skill);
                    for (const id of preHiddenSkillIDs) {
                        mergedSkillHidden.add(id);
                    }
                    outcome.Hidden.skill = mergedSkillHidden;
                }
                ctx.CatalogNarrowing = outcome;
            } else if (preHiddenSkillIDs.size > 0) {
                ctx.CatalogNarrowing = {
                    Hidden: {
                        action: new Set<string>(),
                        agent: new Set<string>(),
                        skill: preHiddenSkillIDs,
                    },
                    Lists: {},
                };
            }
        } catch (error) {
            this.WarnCatalogNarrowing(agent, error instanceof Error ? error.message : String(error));
        }
    }

    public ReachableCatalogNarrowingLimits(
        agent: MJAIAgentEntityExtended,
        promptParams: Record<string, unknown>,
        actions: MJActionEntityExtended[]
    ): CatalogNarrowingLimits {
        const configured = ResolveCatalogNarrowingLimits(promptParams);
        const limits = ReachableCatalogNarrowingLimits(
            configured,
            actions.map((a) => a.Name)
        );
        if (limits.Actions !== configured.Actions && IsCatalogListNarrowed(configured.Actions, actions.length)) {
            LogErrorEx({
                message: `Catalog narrowing for '${agent.Name}' shows every action: the agent has no ${CATALOG_NARROWING_FIND_ACTIONS} action, so a hidden action could not be found`,
                severity: 'warning',
                category: 'CatalogNarrowing',
            });
        }
        return limits;
    }

    public CatalogNarrowingCandidates(
        ctx: AgentRunContext,
        agent: MJAIAgentEntityExtended,
        actions: MJActionEntityExtended[],
        subAgents: MJAIAgentEntityExtended[],
        skills: MJAISkillEntity[]
    ): CatalogNarrowingCandidate[] {
        const requiredActionIds = new UUIDSet(
            ctx.Hooks.GetEffectiveAgentActions(agent.ID)
                .filter((aa) => (aa.MinExecutionsPerRun ?? 0) > 0)
                .map((aa) => aa.ActionID)
        );
        const chainIdSet = new UUIDSet(
            typeof AIEngine.Instance.GetAgentInheritanceChain === 'function'
                ? AIEngine.Instance.GetAgentInheritanceChain(agent.ID).map((a) => a.ID)
                : [agent.ID]
        );
        const assignedSkillIDs = new UUIDSet(
            (AIEngine.Instance.AgentSkills ?? [])
                .filter((as) => chainIdSet.Has(as.AgentID) && as.Status === 'Active')
                .map((as) => as.SkillID)
        );
        const hasUnpinnedSkills = skills.some((s) => !assignedSkillIDs.Has(s.ID));
        const candidate = (
            kind: CatalogNarrowingKind,
            item: { ID: string; Name: string; Description: string | null },
            pinned: boolean
        ): CatalogNarrowingCandidate => ({
            Kind: kind,
            ID: item.ID,
            Name: item.Name,
            Description: item.Description ?? '',
            Pinned: pinned,
        });
        const subAgentMinExec = (s: MJAIAgentEntityExtended): number =>
            (typeof AIEngine.Instance?.ResolveEffectiveAgentProperties === 'function'
                ? AIEngine.Instance.ResolveEffectiveAgentProperties(s).MinExecutionsPerRun
                : s.MinExecutionsPerRun) ?? 0;
        return [
            ...actions.map((a) => candidate('action', a, IsAlwaysShownAction(a.Name) || requiredActionIds.Has(a.ID))),
            ...subAgents.filter((s) => !!s).map((s) => candidate('agent', s, subAgentMinExec(s) > 0)),
            ...skills.map((s) => candidate('skill', s, hasUnpinnedSkills && assignedSkillIDs.Has(s.ID))),
        ];
    }

    public async NarrowCatalog(
        ctx: AgentRunContext,
        promptHelper: BaseAgentPromptHelper,
        agent: MJAIAgentEntityExtended,
        contextUser: UserInfo | undefined,
        promptParams: Record<string, unknown>,
        candidates: CatalogNarrowingCandidate[],
        asked: CatalogNarrowingCandidate[],
        limits: CatalogNarrowingLimits
    ): Promise<CatalogNarrowingOutcome> {
        if (!ctx.OpeningRequest || !contextUser) {
            this.WarnCatalogNarrowing(
                agent,
                contextUser ? 'the run has no user message to judge the catalog against' : 'the run has no context user'
            );
            return NoCatalogNarrowing();
        }
        const promptName =
            typeof promptParams.decisionPromptName === 'string'
                ? promptParams.decisionPromptName
                : AgentDecisionService.DEFAULT_PROMPT_NAME;
        const step = await this.StartCatalogNarrowingStep(ctx, contextUser, promptName, asked, limits);
        const result = await this.AskCatalogNarrowing(
            ctx,
            promptHelper,
            agent,
            contextUser,
            BuildCatalogNarrowingQuestions(asked),
            promptName,
            step
        );
        const outcome = result.success ? SelectCatalogNarrowing(candidates, asked, result.Answers, limits) : undefined;
        if (!outcome) {
            const reason = result.success
                ? 'an answer was missing or was not a probability'
                : result.errorMessage || 'the decision call failed';
            this.WarnCatalogNarrowing(agent, reason);
            await this.FinishCatalogNarrowingStep(ctx, step, result, undefined, reason);
            return NoCatalogNarrowing();
        }
        await this.FinishCatalogNarrowingStep(ctx, step, result, outcome);
        return outcome;
    }

    public async AskCatalogNarrowing(
        ctx: AgentRunContext,
        promptHelper: BaseAgentPromptHelper,
        agent: MJAIAgentEntityExtended,
        contextUser: UserInfo,
        questions: Record<string, DecisionQuestion>,
        promptName: string,
        step?: MJAIAgentRunStepEntityExtended
    ): Promise<AIDecisionRunResult> {
        const failed = (errorMessage: string): AIDecisionRunResult => ({ success: false, errorMessage, Answers: {} });
        const controller = new AbortController();
        let stoppedResult: AIDecisionRunResult | undefined;
        const stopped = new Promise<AIDecisionRunResult>((resolve) =>
            controller.signal.addEventListener(
                'abort',
                () => {
                    stoppedResult = failed(String(controller.signal.reason));
                    resolve(stoppedResult);
                },
                { once: true }
            )
        );
        const runToken = ctx.ExecuteParams?.cancellationToken;
        const relayRunAbort = (): void => controller.abort('the run was cancelled');
        if (runToken?.aborted) {
            relayRunAbort();
        } else {
            runToken?.addEventListener('abort', relayRunAbort, { once: true });
        }
        const timeoutMS = ctx.CatalogNarrowingTimeoutMs;
        const timer = setTimeout(() => controller.abort(`the decision call timed out after ${timeoutMS}ms`), timeoutMS);
        try {
            const ask = ctx.AgentDecisionService.Ask({
                State: ctx.OpeningRequest,
                Questions: questions,
                ContextUser: contextUser,
                AgentID: agent.ID,
                PromptName: promptName,
                CancellationToken: controller.signal,
                ExecutionScope: ctx.RunExecutionScope,
            });
            const result = await Promise.race([ask, stopped]);
            if (result === stoppedResult) {
                promptHelper.LinkLateDecisionPromptRun(ctx, step, ask);
            }
            return result;
        } catch (error) {
            return failed(error instanceof Error ? error.message : String(error));
        } finally {
            clearTimeout(timer);
            runToken?.removeEventListener('abort', relayRunAbort);
        }
    }

    public async StartCatalogNarrowingStep(
        ctx: AgentRunContext,
        contextUser: UserInfo,
        promptName: string,
        asked: CatalogNarrowingCandidate[],
        limits: CatalogNarrowingLimits
    ): Promise<MJAIAgentRunStepEntityExtended | undefined> {
        if (!ctx.AgentRun) {
            return undefined;
        }
        const count = (kind: CatalogNarrowingKind): number => asked.filter((c) => c.Kind === kind).length;
        try {
            return await ctx.Hooks.CreateStepEntity({
                stepType: 'Decision',
                stepName: 'Catalog narrowing',
                contextUser,
                inputData: {
                    request: ctx.OpeningRequest,
                    promptName,
                    limits: { actions: limits.Actions, subAgents: limits.SubAgents, skills: limits.Skills },
                    asked: { actions: count('action'), subAgents: count('agent'), skills: count('skill') },
                },
            });
        } catch (error) {
            LogError(`Could not record the catalog narrowing step: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }

    public async FinishCatalogNarrowingStep(
        ctx: AgentRunContext,
        step: MJAIAgentRunStepEntityExtended | undefined,
        result: AIDecisionRunResult,
        outcome: CatalogNarrowingOutcome | undefined,
        reason?: string
    ): Promise<void> {
        if (!step) {
            return;
        }
        ctx.Hooks.AttachDecisionPromptRun(step, result);
        const usage = {
            executionTimeMS: result.executionTimeMS,
            tokensUsed: result.tokensUsed,
            model: result.DecisionResult?.ResolvedModel ?? result.modelInfo?.modelName,
            promptRunId: result.promptRun?.ID,
        };
        if (!outcome) {
            await ctx.Hooks.FinalizeStepEntity(step, false, reason, { failedOpen: true, reason, ...usage });
            return;
        }
        const lists: Record<string, unknown> = {};
        const stepKeys: Record<CatalogNarrowingKind, string> = { action: 'actions', agent: 'subAgents', skill: 'skills' };
        for (const kind of ['action', 'agent', 'skill'] as const) {
            const list = outcome.Lists[kind];
            if (list) {
                lists[stepKeys[kind]] = {
                    total: list.Total,
                    limit: list.Limit,
                    shown: list.Kept.length,
                    kept: list.Kept,
                    pinned: list.Pinned,
                    probabilities: list.Probabilities,
                };
            }
        }
        await ctx.Hooks.FinalizeStepEntity(step, true, undefined, { ...lists, ...usage });
    }

    public WarnCatalogNarrowing(agent: MJAIAgentEntityExtended, reason: string): void {
        LogErrorEx({
            message: `Catalog narrowing for '${agent.Name}' failed, so the full catalog is shown: ${reason}`,
            severity: 'warning',
            category: 'CatalogNarrowing',
        });
    }

    public HideNarrowedOut<T extends { ID: string }>(
        ctx: AgentRunContext,
        kind: CatalogNarrowingKind,
        items: T[]
    ): T[] {
        return ApplyCatalogNarrowing(items, ctx.CatalogNarrowing?.Hidden[kind]);
    }

    public NarrowedCatalogSection<T extends { ID: string; Name: string }>(
        ctx: AgentRunContext,
        kind: CatalogNarrowingKind,
        items: T[],
        full: string,
        format: (shown: T[]) => string
    ): string {
        try {
            const shown = ctx.Hooks.HideNarrowedOut(kind, items);
            if (shown === items) {
                return full;
            }
            const shownSet = new Set(shown);
            const hiddenNames = items.filter((item) => !shownSet.has(item)).map((item) => item.Name);
            const hasFindCandidateSkills =
                kind === 'skill' &&
                ctx.EffectiveActions.some(
                    (a) => (a.Name ?? '').trim().toLowerCase() === CATALOG_NARROWING_FIND_SKILLS.toLowerCase()
                );
            const note = CatalogNarrowingNote(
                kind,
                hiddenNames,
                hasFindCandidateSkills ? { hasFindCandidateSkills: true } : undefined
            );
            return `${note}\n\n${format(shown)}`;
        } catch (error) {
            LogErrorEx({
                message: `Catalog narrowing could not narrow the ${kind} list, so all of it is shown: ${error instanceof Error ? error.message : String(error)}`,
                severity: 'warning',
                category: 'CatalogNarrowing',
            });
            return full;
        }
    }

    // -------------------------------------------------------------------------
    // Base Catalog, SubAgent Changes & Agent-Type Prompt Params
    // -------------------------------------------------------------------------

    public BuildAgentBaseCatalog(ctx: AgentRunContext, agent: MJAIAgentEntityExtended, engine: AIEngine): AgentBaseCatalog {
        const chainIDs =
            agent.BaseAgentID && typeof engine.GetAgentInheritanceChain === 'function'
                ? engine.GetAgentInheritanceChain(agent.ID).map((a) => a.ID)
                : agent.ID
                ? [agent.ID]
                : [];
        const chainIdSet = new UUIDSet(chainIDs);
        const agentsById = IndexByUUID(engine.Agents ?? [], (a) => a.ID);
        const childrenByParent = new Map<string, MJAIAgentEntityExtended[]>();
        for (const a of engine.Agents ?? []) {
            if (a.Status === 'Active' && a.ParentID && chainIdSet.Has(a.ParentID)) {
                const key = a.ParentID.toLowerCase();
                const list = childrenByParent.get(key) ?? [];
                list.push(a);
                childrenByParent.set(key, list);
            }
        }
        const relsByAgent = new Map<string, MJAIAgentRelationshipEntity[]>();
        for (const ar of engine.AgentRelationships ?? []) {
            if (ar.Status === 'Active' && ar.AgentID && chainIdSet.Has(ar.AgentID)) {
                const key = ar.AgentID.toLowerCase();
                const list = relsByAgent.get(key) ?? [];
                list.push(ar);
                relsByAgent.set(key, list);
            }
        }
        const uniqueActiveSubAgentIDs = new Set<string>();
        for (const cid of chainIDs) {
            if (!cid) continue;
            const key = cid.toLowerCase();
            const activeSubAgents = (childrenByParent.get(key) ?? []).sort((a, b) => a.ExecutionOrder - b.ExecutionOrder);
            const activeAgentRelationships = relsByAgent.get(key) ?? [];
            activeSubAgents.forEach((a) => uniqueActiveSubAgentIDs.add(a.ID));
            activeAgentRelationships.forEach((ar) => uniqueActiveSubAgentIDs.add(ar.SubAgentID));
        }
        const uniqueActiveSubAgents = Array.from(uniqueActiveSubAgentIDs)
            .map((id) => agentsById.Get(id))
            .filter((a): a is MJAIAgentEntityExtended => !!a && a.Status === 'Active');

        const agentActions = ctx.Hooks.GetEffectiveAgentActions(agent.ID);
        const agentActionIds = new UUIDSet(agentActions.map((aa) => aa.ActionID));
        const baseActionsRaw: MJActionEntityExtended[] = ActionEngineServer.Instance.Actions.filter((a) =>
            agentActionIds.Has(a.ID)
        );
        const activeActions = baseActionsRaw.filter((a) => a.Status === 'Active');

        const effectiveProps =
            typeof engine.ResolveEffectiveAgentProperties === 'function'
                ? engine.ResolveEffectiveAgentProperties(agent)
                : null;
        const effectiveTypeID = effectiveProps?.TypeID ?? agent.TypeID;
        const agentType = engine.AgentTypes.find((at) => UUIDsEqual(at.ID, effectiveTypeID));
        const baseAgentTypePromptParams = ctx.Hooks.BuildAgentTypePromptParams(agentType, agent, undefined);

        return {
            uniqueActiveSubAgents,
            subAgentCount: uniqueActiveSubAgents.length,
            subAgentDetails: this.FormatSubAgentDetails(ctx, uniqueActiveSubAgents),
            baseActionsRaw,
            activeActions,
            actionDetails: ctx.ActionsHelper.FormatActionDetails(ctx, activeActions),
            baseAgentTypePromptParams,
        };
    }

    public ApplySubAgentChanges(
        ctx: AgentRunContext,
        baseSubAgents: MJAIAgentEntityExtended[],
        subAgentChanges: SubAgentChange[],
        agentId: string,
        isRoot: boolean,
        engine: AIEngine
    ): MJAIAgentEntityExtended[] {
        let subAgents = [...baseSubAgents];
        const presentIds = new UUIDSet(subAgents.map((a) => a.ID));
        const agentsById = IndexByUUID(engine.Agents ?? [], (a) => a.ID);

        for (const change of subAgentChanges) {
            if (!ctx.Hooks.DoesChangeScopeApply(change.scope, agentId, isRoot, change.agentIds)) {
                continue;
            }
            if (change.mode === 'add') {
                for (const subAgentId of change.subAgentIds) {
                    if (!presentIds.Has(subAgentId)) {
                        const toAdd = agentsById.Get(subAgentId);
                        if (toAdd) {
                            subAgents.push(toAdd);
                            presentIds.Add(toAdd.ID);
                        } else {
                            LogStatus(`Sub-agent with ID '${subAgentId}' not found in AIEngine - skipping add`);
                        }
                    }
                }
            } else if (change.mode === 'remove') {
                const removeIds = new UUIDSet(change.subAgentIds);
                subAgents = subAgents.filter((a) => !removeIds.Has(a.ID));
                for (const id of change.subAgentIds) {
                    presentIds.Delete(id);
                }
            }
        }

        return subAgents;
    }

    public FilterSubAgentChangesForSubAgent(subAgentChanges: SubAgentChange[] | undefined): SubAgentChange[] | undefined {
        if (!subAgentChanges?.length) {
            return undefined;
        }
        const filtered: SubAgentChange[] = [];
        for (const change of subAgentChanges) {
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

    public BuildAgentTypePromptParams(
        ctx: AgentRunContext,
        agentType: MJAIAgentTypeEntity | undefined,
        agent: MJAIAgentEntityExtended,
        runtimeOverrides?: Record<string, unknown>
    ): Record<string, unknown> {
        const schemaJson = agentType?.PromptParamsSchema;
        const schemaDefaults = ctx.Hooks.ExtractSchemaDefaults(schemaJson);

        // Resolve effective AgentTypePromptParams / promptDefaults across the full 3-table cascade
        // for BOTH root and derived agents (AgentType.DefaultAgentConfiguration -> Category tree -> BaseAgent chain -> Agent).
        const effectiveProps = (() => {
            try {
                if (typeof AIEngine.Instance?.ResolveEffectiveAgentProperties === 'function') {
                    return AIEngine.Instance.ResolveEffectiveAgentProperties(agent);
                }
            } catch {
                // Uninitialized engine in unit tests
            }
            return null;
        })();
        const agentParamsJson = effectiveProps?.AgentTypePromptParams ?? agent.AgentTypePromptParams;
        let agentParams: Record<string, unknown> = {};
        if (agentParamsJson) {
            try {
                agentParams = JSON.parse(agentParamsJson);
            } catch (e) {
                LogError(`Failed to parse AgentTypePromptParams for agent ${agent.Name}: ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        const merged: Record<string, unknown> = {
            ...schemaDefaults,
            ...agentParams,
            ...(runtimeOverrides || {}),
        };

        // Surface active custom (non-built-in) step types with DefaultEnabledInPrompt=true so Loop/Flow
        // prompt templates can instruct the model on registered OpenApp step types (0-byte impact when none exist).
        const scopeName = agentType?.Name?.toLowerCase();
        const stepScope: 'Loop' | 'Flow' | undefined = scopeName?.includes('flow')
            ? 'Flow'
            : scopeName?.includes('loop')
              ? 'Loop'
              : undefined;
        const activeCustomSteps = AgentStepTypeRegistry.Instance.GetActiveCustomStepPolicies(stepScope).filter(
            (p) => p.DefaultEnabledInPrompt
        );
        if (activeCustomSteps.length > 0) {
            merged.customStepTypes = activeCustomSteps.map((p) => ({
                name: p.StepKey,
                appliesTo: p.AppliesTo,
                allowedInUnapprovedPlanMode: p.AllowedInUnapprovedPlanMode,
                instructions: p.PromptInstructions ?? null,
            }));
            const instructionBlocks = activeCustomSteps
                .map((p) => (p.PromptInstructions ? `### Custom Step Type: ${p.StepKey}\n${p.PromptInstructions}` : null))
                .filter((s): s is string => s !== null);
            if (instructionBlocks.length > 0) {
                merged.customStepTypeInstructions = instructionBlocks.join('\n\n');
            }
        }

        const explicitResponseType =
            (runtimeOverrides?.includeResponseTypeDefinition as Record<string, unknown> | undefined) ||
            (agentParams.includeResponseTypeDefinition as Record<string, unknown> | undefined);
        this.WarnOnceOnUnknownFinishIfMode(ctx, merged.finishIfMode, agent);
        ctx.Hooks.ApplyResponseTypeAutoAlignment(merged, explicitResponseType);

        return merged;
    }

    public WarnOnceOnUnknownFinishIfMode(ctx: AgentRunContext, value: unknown, agent: MJAIAgentEntityExtended): void {
        const warning = AgentPromptCatalogAndNarrowingHelper._finishIfModeWarnings.WarningFor(agent.ID, agent.Name, value);
        if (warning) {
            ctx.Hooks.LogError(warning, { agent, category: 'AgentConfiguration', severity: 'warning' });
        }
    }

    public DecisionsEnabled(promptParams: Record<string, unknown> | undefined): boolean {
        return promptParams?.decisionsEnabled === true;
    }

    public ApplyResponseTypeAutoAlignment(
        ctx: AgentRunContext,
        params: Record<string, unknown>,
        explicitResponseType?: Record<string, unknown>
    ): void {
        ctx.ContextAssembler.ApplyResponseTypeAutoAlignment(params, explicitResponseType, ctx.Hooks.DecisionsEnabled(params));
    }

    public ExtractSchemaDefaults(ctx: AgentRunContext, schemaJson: string | null | undefined): Record<string, unknown> {
        return ctx.ContextAssembler.ExtractSchemaDefaults(schemaJson);
    }

    public FormatSubAgentDetails(ctx: AgentRunContext, subAgents: MJAIAgentEntityExtended[]): string {
        return ctx.ContextAssembler.FormatSubAgentDetails(subAgents);
    }

    public FormatSkillsCatalog(ctx: AgentRunContext, skills: MJAISkillEntity[]): string {
        return ctx.ContextAssembler.FormatSkillsCatalog(skills);
    }

    public GetAgentPromptParameters(ctx: AgentRunContext, agent: MJAIAgentEntityExtended): Array<MJTemplateParamEntity> {
        const engine = AIEngine.Instance;
        const agentPrompt = ctx.Hooks.GetEffectiveAgentPrompts(agent.ID).sort((a, b) => a.ExecutionOrder - b.ExecutionOrder)[0];
        if (!agentPrompt) return [];
        const prompt = engine.Prompts.find((p) => UUIDsEqual(p.ID, agentPrompt.PromptID));
        if (!prompt) return [];
        return prompt.TemplateParams;
    }

    public GetAgentPromptParametersJSON(ctx: AgentRunContext, agent: MJAIAgentEntityExtended): string {
        const params = ctx.Hooks.GetAgentPromptParameters(agent);
        return JSON.stringify(
            params.map((param) => ({
                Name: param.Name,
                Type: param.Type,
                IsRequired: param.IsRequired,
                DefaultValue: param.DefaultValue,
                Description: param.Description,
            })),
            null,
            2
        );
    }

    public BuildAppContextSection(ctx: AgentRunContext, extraData?: Record<string, unknown>): string {
        return ctx.ContextAssembler.BuildAppContextSection(extraData);
    }
}
