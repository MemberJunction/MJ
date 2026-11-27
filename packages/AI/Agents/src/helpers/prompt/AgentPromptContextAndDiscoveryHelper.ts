/**
 * @fileoverview Collaborator owned by {@link AgentPromptHelper} encapsulating context memory
 * injection, prototype inheritance lookups, persona & instructions injection, scoped prompt
 * parts, pre-execution RAG, and Phase-2 decision discovery.
 *
 * @module @memberjunction/ai-agents
 */

import {
    ReadEdgePreDiscoveryHint,
    SystemPlaceholderManager,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
    type SecondaryScopeConfig,
    type SecondaryScopeValue,
} from '@memberjunction/ai-core-plus';
import type { ChatMessage } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { LogError, LogErrorEx, type UserInfo } from '@memberjunction/core';
import type {
    MJAIAgentActionEntity,
    MJAIAgentExampleEntity,
    MJAIAgentNoteEntity,
    MJAIAgentPromptEntity,
    MJAIAgentUserPolicyEntity,
} from '@memberjunction/core-entities';
import { IsPlainObject, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { ActionLifecycleResolver } from '../../ActionLifecycleResolver';
import { AgentMemoryContextBuilder, type AgentMemoryObservability } from '../../agent-memory-context-builder';
import { BuildAgentPersonaAndInstructionsBlock } from '../../agent-persona-prompt';
import type { AgentPreExecutionRAGResult } from '../../agent-pre-execution-rag';
import { AgentDecisionService } from '../../AgentDecisionService';
import {
    AgentsWithoutDescription,
    BuildDecisionDiscoveryOptionSet,
    BuildDecisionDiscoveryQuestions,
    CanSearchEntities,
    DECISION_DISCOVERY_MAX_RECORDED_IDS,
    DECISION_DISCOVERY_MIN_CONFIDENCE,
    DECISION_DISCOVERY_MIN_OPTIONS,
    DECISION_DISCOVERY_TIMEOUT_MS,
    DecisionDiscoveryAgentSearch,
    DecisionDiscoveryCatalog,
    DecisionDiscoveryFromResult,
    DecisionDiscoveryOptions,
    DecisionDiscoveryRunnableAgents,
    DecisionOptionLimit,
    DecisionPromptOptionCap,
    EvaluateEdgePreDiscoveryHint,
    FailedDecisionDiscovery,
    HostAllowedAgentIDs,
    IsDecisionDiscoveryOn,
    KeepHostAllowedAgents,
    MentionsAgent,
    type DecisionDiscoveryOptionSet,
    type DecisionDiscoveryOutcome,
} from '../../decision-discovery';
import { InjectScopedPromptParts, PromptComponentResolver } from '../../prompt-component-resolver';
import type { AgentRunContext } from '../AgentRunContext';
import type { AgentBaseCatalog } from '../base-agent-types';
import type { BaseAgentPromptHelper } from './BaseAgentPromptHelper';

/**
 * Collaborator handling Phase-2 context enrichment (memory, persona, scoped prompt parts,
 * pre-execution RAG, and agent decision discovery) plus `BaseAgentID` prompt/action inheritance.
 */
export class AgentPromptContextAndDiscoveryHelper {
    private static readonly _uncalibratedDiscoveryModelsWarned = new Set<string>();

    // -------------------------------------------------------------------------
    // Context Memory & Prototype Inheritance Lookups
    // -------------------------------------------------------------------------

    public DetermineNoteScope(note: MJAIAgentNoteEntity): string {
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

    public MemoryObservability(run: MJAIAgentRunEntityExtended | null): AgentMemoryObservability | undefined {
        if (!run) {
            return undefined;
        }
        return {
            agentRunID: run.ID,
            stepNumber: (run.Steps?.length || 0) + 1,
            OnStepCreated: (step) => run.Steps.push(step),
        };
    }

    public async InjectContextMemory(
        ctx: AgentRunContext,
        input: string,
        agent: MJAIAgentEntityExtended,
        userId?: string,
        companyId?: string,
        contextUser?: UserInfo,
        conversationMessages?: ChatMessage[],
        primaryScopeEntityId?: string,
        primaryScopeRecordId?: string,
        secondaryScopes?: Record<string, SecondaryScopeValue>,
        secondaryScopeConfig?: SecondaryScopeConfig | null,
        sharedOnly?: boolean
    ): Promise<{ notes: MJAIAgentNoteEntity[]; examples: MJAIAgentExampleEntity[] }> {
        const observability = ctx.Hooks.MemoryObservability(ctx.AgentRun);

        const result = await new AgentMemoryContextBuilder().InjectContextMemory(
            input,
            agent,
            userId,
            companyId,
            contextUser,
            conversationMessages,
            primaryScopeEntityId,
            primaryScopeRecordId,
            secondaryScopes,
            secondaryScopeConfig,
            observability,
            (message, verboseOnly) => ctx.Hooks.LogStatus(message, verboseOnly),
            sharedOnly
        );

        ctx.InjectedMemory = result;
        return result;
    }

    public GetEffectiveAgentPrompts(agentId: string): MJAIAgentPromptEntity[] {
        const engine = AIEngine.Instance;
        if (typeof engine.GetEffectiveAgentPrompts === 'function') {
            return engine.GetEffectiveAgentPrompts(agentId, 'Active');
        }
        return (engine.AgentPrompts ?? [])
            .filter((ap) => UUIDsEqual(ap.AgentID, agentId) && ap.Status === 'Active')
            .sort((a, b) => (a.ExecutionOrder ?? 0) - (b.ExecutionOrder ?? 0));
    }

    public GetEffectiveAgentActions(agentId: string): MJAIAgentActionEntity[] {
        const engine = AIEngine.Instance;
        if (typeof engine.GetEffectiveAgentActions === 'function') {
            return engine.GetEffectiveAgentActions(agentId);
        }
        return (engine.AgentActions ?? []).filter((aa) => UUIDsEqual(aa.AgentID, agentId) && aa.Status === 'Active');
    }

    public IndexEffectiveAgentActions(
        ctx: AgentRunContext,
        agentId: string
    ): ReturnType<typeof ActionLifecycleResolver.IndexEffectiveAgentActions> {
        return ActionLifecycleResolver.IndexEffectiveAgentActions(ctx.Hooks.GetEffectiveAgentActions(agentId));
    }

    // -------------------------------------------------------------------------
    // Persona, Scoped Prompt Parts & Pre-Execution RAG
    // -------------------------------------------------------------------------

    public InjectAgentPersonaAndInstructions(
        ctx: AgentRunContext,
        agent: MJAIAgentEntityExtended,
        conversationMessages: ChatMessage[],
        contextUser?: UserInfo,
        userPolicy?: MJAIAgentUserPolicyEntity | null
    ): void {
        try {
            const engine = AIEngine.Instance;
            const resolvedPersona =
                typeof engine.ResolveAgentPersona === 'function'
                    ? engine.ResolveAgentPersona(agent.ID, {
                          preferredPersonaId: userPolicy?.PreferredPersonaID ?? null,
                      })
                    : null;
            const persona =
                resolvedPersona && (resolvedPersona.AgentPersona != null || Boolean(userPolicy?.PreferredPersonaID))
                    ? resolvedPersona
                    : null;
            const stackedInstructions =
                typeof engine.GetStackedAdditionalInstructions === 'function'
                    ? engine.GetStackedAdditionalInstructions(agent.ID)
                    : agent.AdditionalInstructions?.trim()
                    ? [
                          {
                              AgentID: agent.ID,
                              AgentName: agent.Name ?? agent.ID,
                              IsRootOrTemplate: !agent.BaseAgentID || agent.InstantiationMode !== 'None',
                              Instructions: agent.AdditionalInstructions.trim(),
                          },
                      ]
                    : [];
            const effectiveAgentName = agent.BaseAgentID
                ? agent.Name || userPolicy?.DisplayNameOverride?.trim() || 'Assistant'
                : userPolicy?.DisplayNameOverride?.trim() || agent.Name || 'Assistant';
            const block = BuildAgentPersonaAndInstructionsBlock({
                AgentName: effectiveAgentName,
                OwnerUserName: contextUser?.Name ?? null,
                Persona: persona,
                StackedInstructions: stackedInstructions,
            });
            if (block) {
                conversationMessages.unshift({
                    role: 'system',
                    content: block,
                });
            }
        } catch (e) {
            ctx.Hooks.LogError(e instanceof Error ? e : new Error(String(e)), { category: 'AgentPersonaInjection' });
        }
    }

    public InjectScopedPromptParts(
        ctx: AgentRunContext,
        agent: MJAIAgentEntityExtended,
        conversationMessages: ChatMessage[],
        primaryScopeEntityId?: string,
        primaryScopeRecordId?: string,
        secondaryScopes?: Record<string, SecondaryScopeValue>
    ): void {
        try {
            const prompts = ctx.Hooks.GetEffectiveAgentPrompts(agent.ID);
            if (prompts.length === 0) return;

            const resolver =
                MJGlobal.Instance.ClassFactory.CreateInstance<PromptComponentResolver>(PromptComponentResolver) ??
                new PromptComponentResolver();

            InjectScopedPromptParts(
                resolver,
                prompts[0].PromptID,
                { primaryScopeEntityId, primaryScopeRecordId, secondaryScopes },
                conversationMessages
            );
        } catch (e) {
            ctx.Hooks.LogError(e instanceof Error ? e : new Error(String(e)), { category: 'ScopedPromptParts' });
        }
    }

    public async ReplaceScopedPartPlaceholders(
        ctx: AgentRunContext,
        messages: ChatMessage[],
        before: ReadonlySet<ChatMessage>,
        contextUser?: UserInfo
    ): Promise<void> {
        const added = messages.filter((m) => !before.has(m));
        if (added.length === 0) return;
        try {
            const replaced = await SystemPlaceholderManager.ReplaceAvailablePlaceholders(added, { contextUser });
            let next = 0;
            for (let i = 0; i < messages.length; i++) {
                if (!before.has(messages[i])) messages[i] = replaced[next++];
            }
        } catch (e) {
            ctx.Hooks.LogError(e instanceof Error ? e : new Error(String(e)), { category: 'ScopedPromptParts' });
        }
    }

    public async InjectPreExecutionRAG(
        ctx: AgentRunContext,
        lastUserMessage: string,
        agent: MJAIAgentEntityExtended,
        contextUser: UserInfo | undefined,
        conversationMessages: ChatMessage[] | undefined,
        originalMessages: ChatMessage[] | undefined,
        primaryScopeEntityId?: string,
        primaryScopeRecordId?: string,
        secondaryScopes?: Record<string, SecondaryScopeValue>,
        payload?: unknown,
        activeSkillIDs?: string[],
        audienceReaders?: UserInfo[]
    ): Promise<AgentPreExecutionRAGResult | null> {
        const result = await new AgentMemoryContextBuilder().InjectPreExecutionRAG(
            lastUserMessage,
            agent,
            contextUser,
            conversationMessages,
            originalMessages,
            primaryScopeEntityId,
            primaryScopeRecordId,
            secondaryScopes,
            payload,
            (message, verboseOnly) => ctx.Hooks.LogStatus(message, verboseOnly),
            (error, options) => ctx.Hooks.LogError(error, options),
            activeSkillIDs,
            audienceReaders
        );

        ctx.InjectedRAG = result;
        return result;
    }

    // -------------------------------------------------------------------------
    // Phase-2 Agent Decision Discovery
    // -------------------------------------------------------------------------

    public async InjectDecisionDiscovery(
        ctx: AgentRunContext,
        promptHelper: BaseAgentPromptHelper,
        agent: MJAIAgentEntityExtended,
        contextUser: UserInfo | undefined,
        conversationMessages: ChatMessage[] | undefined,
        data: Record<string, unknown> | undefined
    ): Promise<void> {
        try {
            const override = data?.__agentTypePromptParams;
            const overrides = IsPlainObject(override) ? override : undefined;
            if (!this.IsDecisionDiscoveryOnFor(ctx, agent, overrides) || !conversationMessages) {
                return;
            }
            if (!ctx.OpeningRequest || !contextUser) {
                ctx.Hooks.LogStatus(
                    `Decision discovery skipped for '${agent.Name}': the run has no ${contextUser ? 'user message' : 'context user'}`,
                    true
                );
                return;
            }
            if (!ctx.IsOpeningTurn) {
                ctx.Hooks.LogStatus(
                    `Decision discovery skipped for '${agent.Name}': a follow-up turn, which may continue with an agent already engaged`,
                    true
                );
                return;
            }
            if (MentionsAgent(ctx.OpeningRequest, AIEngine.Instance.Agents, agent.ID)) {
                ctx.Hooks.LogStatus(`Decision discovery skipped for '${agent.Name}': the request @mentions an agent`, true);
                return;
            }
            const promptParams = this.DecisionDiscoveryPromptParams(ctx, agent, overrides);
            const outcome = await this.RunDecisionDiscovery(
                ctx,
                promptHelper,
                agent,
                contextUser,
                promptParams,
                HostAllowedAgentIDs(data),
                ReadEdgePreDiscoveryHint(data)
            );
            if (outcome.Injected && outcome.Message) {
                conversationMessages.unshift({ role: 'system', content: outcome.Message });
                ctx.Hooks.LogStatus(`Decision discovery suggested '${outcome.Answer?.Agent.Name}' to '${agent.Name}'`, true);
            }
        } catch (error) {
            this.WarnDecisionDiscovery(agent, error instanceof Error ? error.message : String(error));
        }
    }

    public IsDecisionDiscoveryOnFor(
        ctx: AgentRunContext,
        agent: MJAIAgentEntityExtended,
        overrides: Record<string, unknown> | undefined
    ): boolean {
        let base: Record<string, unknown> | undefined;
        const paramsSetting = (key: string): Record<string, unknown> => {
            if (overrides && key in overrides) {
                return overrides;
            }
            base ??= this.CachedBasePromptParams(agent) ?? this.BuildDecisionDiscoveryPromptParams(ctx, agent, undefined);
            return base;
        };
        return ctx.Hooks.DecisionsEnabled(paramsSetting('decisionsEnabled')) && IsDecisionDiscoveryOn(paramsSetting('decisionDiscovery'));
    }

    public DecisionDiscoveryPromptParams(
        ctx: AgentRunContext,
        agent: MJAIAgentEntityExtended,
        overrides: Record<string, unknown> | undefined
    ): Record<string, unknown> {
        const cached = overrides ? undefined : this.CachedBasePromptParams(agent);
        return cached ?? this.BuildDecisionDiscoveryPromptParams(ctx, agent, overrides);
    }

    public CachedBasePromptParams(agent: MJAIAgentEntityExtended): Record<string, unknown> | undefined {
        return AIEngine.Instance.GetAgentBaseCatalog<AgentBaseCatalog>(agent.ID)?.baseAgentTypePromptParams;
    }

    public BuildDecisionDiscoveryPromptParams(
        ctx: AgentRunContext,
        agent: MJAIAgentEntityExtended,
        overrides: Record<string, unknown> | undefined
    ): Record<string, unknown> {
        const agentType = AIEngine.Instance.AgentTypes.find((at) => UUIDsEqual(at.ID, agent.TypeID));
        return ctx.Hooks.BuildAgentTypePromptParams(agentType, agent, overrides);
    }

    public async RunDecisionDiscovery(
        ctx: AgentRunContext,
        promptHelper: BaseAgentPromptHelper,
        agent: MJAIAgentEntityExtended,
        contextUser: UserInfo,
        promptParams: Record<string, unknown>,
        hostAllowedIDs: string[] | undefined,
        rawEdgeHint?: unknown
    ): Promise<DecisionDiscoveryOutcome> {
        const promptName =
            typeof promptParams.decisionPromptName === 'string'
                ? promptParams.decisionPromptName
                : AgentDecisionService.DEFAULT_PROMPT_NAME;
        const step = await this.StartDecisionDiscoveryStep(ctx, contextUser, promptName);
        const outcome = await this.BoundDecisionDiscovery(
            ctx,
            promptHelper,
            (signal) => this.DiscoverAgent(ctx, agent, contextUser, promptName, hostAllowedIDs, rawEdgeHint, signal),
            step
        );
        await this.FinishDecisionDiscoveryStep(ctx, step, outcome);
        if (!outcome.Succeeded) {
            this.WarnDecisionDiscovery(agent, outcome.Reason ?? 'unknown error');
        } else if (!outcome.Injected) {
            if (outcome.UncalibratedModel) {
                AgentPromptContextAndDiscoveryHelper.WarnUncalibratedDiscoveryModel(outcome.UncalibratedModel);
            }
            ctx.Hooks.LogStatus(`Decision discovery for '${agent.Name}' suggested no agent: ${outcome.Reason}`, true);
        }
        return outcome;
    }

    public static WarnUncalibratedDiscoveryModel(model: string): void {
        if (AgentPromptContextAndDiscoveryHelper._uncalibratedDiscoveryModelsWarned.has(model)) {
            return;
        }
        AgentPromptContextAndDiscoveryHelper._uncalibratedDiscoveryModelsWarned.add(model);
        LogErrorEx({
            message:
                `Decision discovery answered by ${model} suggests nothing: the model has no discovery calibration ` +
                "(use 'agent-discovery' in its ModelConfiguration.Decision.Calibrations), so its answers are treated as unsure. " +
                'Fit one with the fit-decision-calibration rig, or check that the model was not renamed or moved to another version.',
            severity: 'warning',
            category: 'DecisionDiscovery',
        });
    }

    public async BoundDecisionDiscovery(
        ctx: AgentRunContext,
        promptHelper: BaseAgentPromptHelper,
        discover: (signal: AbortSignal) => Promise<DecisionDiscoveryOutcome>,
        step?: MJAIAgentRunStepEntityExtended
    ): Promise<DecisionDiscoveryOutcome> {
        const controller = new AbortController();
        let stoppedOutcome: DecisionDiscoveryOutcome | undefined;
        const stopped = new Promise<DecisionDiscoveryOutcome>((resolve) =>
            controller.signal.addEventListener(
                'abort',
                () => {
                    stoppedOutcome = FailedDecisionDiscovery(String(controller.signal.reason));
                    resolve(stoppedOutcome);
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
        const timeoutMS = DECISION_DISCOVERY_TIMEOUT_MS;
        const timer = setTimeout(() => controller.abort(`the decision timed out after ${timeoutMS}ms`), timeoutMS);
        try {
            const discovering = discover(controller.signal);
            const outcome = await Promise.race([discovering, stopped]);
            if (outcome === stoppedOutcome) {
                promptHelper.LinkLateDecisionPromptRun(
                    ctx,
                    step,
                    discovering.then((late) => late.Result)
                );
            }
            return outcome;
        } catch (error) {
            return FailedDecisionDiscovery(error instanceof Error ? error.message : String(error));
        } finally {
            clearTimeout(timer);
            runToken?.removeEventListener('abort', relayRunAbort);
        }
    }

    public async DiscoverAgent(
        ctx: AgentRunContext,
        agent: MJAIAgentEntityExtended,
        contextUser: UserInfo,
        promptName: string,
        hostAllowedIDs: string[] | undefined,
        rawEdgeHint: unknown,
        signal: AbortSignal
    ): Promise<DecisionDiscoveryOutcome> {
        try {
            const runnableAgents = await DecisionDiscoveryRunnableAgents(AIEngine.Instance.Agents, contextUser);
            const catalog = KeepHostAllowedAgents(DecisionDiscoveryCatalog(runnableAgents, agent.ID), hostAllowedIDs);
            const fullOptions = DecisionDiscoveryOptions(catalog);
            const declaredCap = DecisionPromptOptionCap(AIEngine.Instance, promptName);
            const optionLimit = DecisionOptionLimit(declaredCap);

            if (fullOptions.length < DECISION_DISCOVERY_MIN_OPTIONS) {
                return {
                    Injected: false,
                    Succeeded: true,
                    Reason: `there are ${fullOptions.length} agents to choose from, fewer than the ${DECISION_DISCOVERY_MIN_OPTIONS} a suggestion needs, so nothing was asked`,
                    CatalogSize: catalog.length,
                    HostAllowListSize: hostAllowedIDs?.length,
                    WithoutDescription: AgentsWithoutDescription(catalog),
                    OptionCount: fullOptions.length,
                    OptionLimit: optionLimit,
                    DeclaredOptionCap: declaredCap,
                };
            }

            const edgeEval = EvaluateEdgePreDiscoveryHint(rawEdgeHint, fullOptions);
            if (edgeEval.DirectOutcome) {
                return {
                    ...edgeEval.DirectOutcome,
                    CatalogSize: catalog.length,
                    HostAllowListSize: hostAllowedIDs?.length,
                    WithoutDescription: AgentsWithoutDescription(catalog),
                    OptionCount: fullOptions.length,
                    OptionLimit: optionLimit,
                    DeclaredOptionCap: declaredCap,
                };
            }

            const { Options: options, Error: optionsError, ...rest } = await this.DecisionDiscoveryOptionSet(
                ctx,
                agent,
                contextUser,
                promptName,
                hostAllowedIDs,
                runnableAgents,
                declaredCap,
                edgeEval.SanitizedHint?.CandidateAgentIds
            );
            const sizes = {
                ...rest,
                OptionCount: options.length,
                EdgeHintUsed: (edgeEval.SanitizedHint?.CandidateAgentIds.length ?? 0) > 0 && fullOptions.length > optionLimit,
                EdgeHintDiscardedCount: edgeEval.DiscardedCount,
            };
            if (optionsError) {
                return { ...FailedDecisionDiscovery(optionsError), ...sizes };
            }
            if (options.length < DECISION_DISCOVERY_MIN_OPTIONS) {
                return {
                    Injected: false,
                    Succeeded: true,
                    Reason: `there are ${options.length} agents to choose from, fewer than the ${DECISION_DISCOVERY_MIN_OPTIONS} a suggestion needs, so nothing was asked`,
                    ...sizes,
                };
            }
            if (signal.aborted) {
                return { ...FailedDecisionDiscovery(String(signal.reason)), ...sizes };
            }
            const result = await ctx.AgentDecisionService.Ask({
                State: ctx.OpeningRequest,
                Questions: BuildDecisionDiscoveryQuestions(options),
                ContextUser: contextUser,
                AgentID: agent.ID,
                PromptName: promptName,
                CancellationToken: signal,
                ExecutionScope: ctx.RunExecutionScope,
            });
            return {
                ...DecisionDiscoveryFromResult(result, options, DECISION_DISCOVERY_MIN_CONFIDENCE),
                Source: 'decision-model',
                ...sizes,
            };
        } catch (error) {
            return FailedDecisionDiscovery(error instanceof Error ? error.message : String(error));
        }
    }

    public async DecisionDiscoveryOptionSet(
        ctx: AgentRunContext,
        agent: MJAIAgentEntityExtended,
        contextUser: UserInfo,
        promptName: string,
        hostAllowedIDs: string[] | undefined,
        runnableAgents?: MJAIAgentEntityExtended[],
        declaredCap?: number,
        preferredCandidateIDs?: ReadonlyArray<string>
    ): Promise<DecisionDiscoveryOptionSet> {
        const provider = ctx.ProviderToUse;
        return BuildDecisionDiscoveryOptionSet({
            Agents: runnableAgents ?? (await DecisionDiscoveryRunnableAgents(AIEngine.Instance.Agents, contextUser)),
            RunningAgentID: agent.ID,
            HostAllowedIDs: hostAllowedIDs,
            DeclaredCap: declaredCap ?? DecisionPromptOptionCap(AIEngine.Instance, promptName),
            PreferredCandidateIDs: preferredCandidateIDs,
            Search: CanSearchEntities(provider)
                ? DecisionDiscoveryAgentSearch(provider, ctx.OpeningRequest, contextUser)
                : undefined,
        });
    }

    public async StartDecisionDiscoveryStep(
        ctx: AgentRunContext,
        contextUser: UserInfo,
        promptName: string
    ): Promise<MJAIAgentRunStepEntityExtended | undefined> {
        if (!ctx.AgentRun) {
            return undefined;
        }
        try {
            return await ctx.Hooks.CreateStepEntity({
                stepType: 'Decision',
                stepName: 'Agent discovery',
                contextUser,
                inputData: {
                    request: ctx.OpeningRequest,
                    promptName,
                    minConfidence: DECISION_DISCOVERY_MIN_CONFIDENCE,
                    timeoutMS: DECISION_DISCOVERY_TIMEOUT_MS,
                },
            });
        } catch (error) {
            LogError(`Could not record the agent discovery step: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }

    public async FinishDecisionDiscoveryStep(
        ctx: AgentRunContext,
        step: MJAIAgentRunStepEntityExtended | undefined,
        outcome: DecisionDiscoveryOutcome
    ): Promise<void> {
        if (!step) {
            return;
        }
        const result = outcome.Result;
        if (result) {
            ctx.Hooks.AttachDecisionPromptRun(step, result);
        }
        const answer = outcome.Answer;
        const withoutDescription = outcome.WithoutDescription ?? [];
        await ctx.Hooks.FinalizeStepEntity(step, outcome.Succeeded, outcome.Succeeded ? undefined : outcome.Reason, {
            injected: outcome.Injected,
            reason: outcome.Reason,
            catalogSize: outcome.CatalogSize,
            hostAllowList: outcome.HostAllowListSize === undefined ? false : { size: outcome.HostAllowListSize },
            withoutDescription: {
                count: withoutDescription.length,
                agentIds: withoutDescription.slice(0, DECISION_DISCOVERY_MAX_RECORDED_IDS),
            },
            options: outcome.OptionCount,
            optionLimit: outcome.OptionLimit,
            declaredOptionCap: outcome.DeclaredOptionCap,
            narrowed:
                outcome.NarrowedFrom === undefined
                    ? false
                    : { by: 'semantic search', from: outcome.NarrowedFrom, to: outcome.OptionCount },
            answer: answer
                ? {
                      agentId: answer.Agent.ID,
                      agent: answer.Agent.Name,
                      confidence: answer.Confidence,
                      anyApplies: answer.AnyApplies,
                      probabilities: answer.Probabilities,
                  }
                : undefined,
            executionTimeMS: result?.executionTimeMS,
            tokensUsed: result?.tokensUsed,
            model: result?.DecisionResult?.ResolvedModel ?? result?.modelInfo?.modelName,
            promptRunId: result?.promptRun?.ID,
            ...(outcome.Source === 'edge-pre-discovery' ? { source: outcome.Source } : {}),
            ...(outcome.EdgeHintUsed || (outcome.EdgeHintDiscardedCount ?? 0) > 0
                ? {
                      edgePreDiscovery: {
                          used: outcome.EdgeHintUsed ?? false,
                          discardedCount: outcome.EdgeHintDiscardedCount ?? 0,
                      },
                  }
                : {}),
        });
    }

    public WarnDecisionDiscovery(agent: MJAIAgentEntityExtended, reason: string): void {
        LogErrorEx({
            message: `Decision discovery for '${agent.Name}' failed, so no agent is suggested: ${reason}`,
            severity: 'warning',
            category: 'DecisionDiscovery',
        });
    }
}
