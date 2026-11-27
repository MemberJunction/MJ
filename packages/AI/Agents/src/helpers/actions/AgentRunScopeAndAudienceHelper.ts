/**
 * @fileoverview Focused collaborator for `AgentActionPolicyHelper` encapsulating audience
 * resolution, structural common-reach enforcement, prompt/tool/task-graph/handoff withholding,
 * and validated run-scope resolution & persistence.
 *
 * @module @memberjunction/ai-agents
 */

import type {
    AgentAction,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    SecondaryScopeConfig,
    SecondaryScopeValue,
} from '@memberjunction/ai-core-plus';
import {
    GetTaskGraphSubmitter,
    IsStructuralCommonReachAudience,
    TenantContextCarryProblem,
    WithAgentRunDataTrustApplied,
} from '@memberjunction/ai-core-plus';
import {
    ActionRunScopeIsBounded,
    AUDIENCE_UNSUPPORTED_RESULT_CODE,
    type ActionResult,
    type ActionRunScope,
    type MJActionEntityExtended,
} from '@memberjunction/actions-base';
import { DatabaseProviderBase, LogError, type UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { IsPlainObject, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { ActionSupportsAudience } from '../../action-audience-support';
import { AgentAudienceAddsReader, AgentAudienceProblem, AgentAudienceReaderIDs, MatchAudienceUsers } from '../../agent-audience';
import { HostAllowedAgentIDs } from '../../decision-discovery';
import type { PromptComponentScope } from '../../prompt-component-resolver';
import type { AgentRunContext } from '../AgentRunContext';
import type { PromptWithholding, RunContextScope } from '../base-agent-types';
import type { BaseAgentActionPolicyHelper } from './BaseAgentActionPolicyHelper';

/**
 * Collaborator owned by {@link AgentActionPolicyHelper} implementing audience hydration,
 * structural common-reach action gates, withholding/refusal predicates, and run-scope validation.
 */
export class AgentRunScopeAndAudienceHelper {
    // -------------------------------------------------------------------------
    // Audience & Structural Common-Reach Enforcement
    // -------------------------------------------------------------------------

    public async AudienceReadersFor(
        ctx: AgentRunContext,
        params: ExecuteAgentParams
    ): Promise<{ Readers: UserInfo[] } | { Error: string }> {
        if (ctx.AudienceReaders && ctx.AudienceSource === params.Audience) {
            return { Readers: ctx.AudienceReaders };
        }
        const resolved = await this.ResolveRunAudience(ctx, params);
        if ('Readers' in resolved) {
            ctx.AudienceReaders = resolved.Readers;
            ctx.AudienceSource = params.Audience;
        }
        return resolved;
    }

    public async ResolveRunAudience(
        ctx: AgentRunContext,
        params: ExecuteAgentParams
    ): Promise<{ Readers: UserInfo[] } | { Error: string }> {
        const problem = AgentAudienceProblem(params.Audience);
        if (problem) {
            return { Error: `Invalid Audience: ${problem}` };
        }
        if (IsStructuralCommonReachAudience(params.Audience)) {
            const scope = ctx.RunScope ?? this.ValidatedRunScope(ctx, params);
            const hasConstrainingScope = ActionRunScopeIsBounded(scope) || (scope.SearchScopeIDs?.length ?? 0) > 0;
            if (!hasConstrainingScope) {
                return {
                    Error: "Invalid Audience: Mode 'ScopeCommonReach' requires a constraining run scope (PrimaryScopeRecordID, SecondaryScopes, or SearchScopeIDs); cannot run unscoped.",
                };
            }
            ctx.Hooks.LogStatus(
                '👥 Run audience: structural common-reach mode — O(1) startup without reader enumeration; audience restrictions active',
                true,
                params
            );
            return { Readers: [] };
        }
        const ids = AgentAudienceReaderIDs(params.Audience, params.contextUser?.ID);
        if (ids.length === 0) {
            return { Readers: [] };
        }
        const match = MatchAudienceUsers(ids, await ctx.Hooks.ResolveAudienceUsers(ids, params));
        if (match.MissingIDs.length > 0) {
            return {
                Error: `Audience names user ID(s) that match no user: ${match.MissingIDs.join(', ')}. The run is refused rather than run without them.`,
            };
        }
        ctx.Hooks.LogStatus(
            `👥 Run audience: ${match.Readers.length} reader(s) besides the caller — output limited to what every one of them may see`,
            true,
            params
        );
        return { Readers: match.Readers };
    }

    public async ResolveAudienceUsers(
        ctx: AgentRunContext,
        ids: string[],
        params: ExecuteAgentParams
    ): Promise<UserInfo[]> {
        const cached = MatchAudienceUsers(ids, UserCache.Instance.Users);
        if (cached.MissingIDs.length === 0) {
            return cached.Readers;
        }
        const provider = params.provider ?? ctx.ProviderToUse;
        if (provider instanceof DatabaseProviderBase) {
            ctx.Hooks.LogStatus(
                `👥 ${cached.MissingIDs.length} audience reader(s) not in the user cache — refreshing it once`,
                true,
                params
            );
            await UserCache.Instance.Refresh(provider);
        }
        return MatchAudienceUsers(ids, UserCache.Instance.Users).Readers;
    }

    public RunAudienceAddsReader(params: ExecuteAgentParams): boolean {
        return AgentAudienceAddsReader(params.Audience, params.contextUser?.ID);
    }

    public DispatchReaders(
        params: ExecuteAgentParams,
        readers: UserInfo[],
        runAs: UserInfo | undefined
    ): UserInfo[] {
        const caller = params.contextUser;
        if (readers.length === 0 || !caller || UUIDsEqual(runAs?.ID, caller.ID)) {
            return readers;
        }
        return [...readers.filter((reader) => !UUIDsEqual(reader.ID, runAs?.ID)), caller];
    }

    public CheckStructuralAudienceAction(
        ctx: AgentRunContext,
        policy: BaseAgentActionPolicyHelper,
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        contextUser: UserInfo | undefined,
        skipBreaker: boolean
    ): ActionResult | null {
        if (!IsStructuralCommonReachAudience(params.Audience)) {
            return null;
        }
        if (ctx.Hooks.ResolveActionSupportsAudience(actionEntity)) {
            return null;
        }
        const reason =
            actionEntity.Type === 'Runtime'
                ? 'a runtime-defined action cannot declare that it honours an audience'
                : 'it has not declared that it can limit what it returns to the shared run scope';
        const message = `Action '${actionEntity.Name || action.name}' is not available here: its output would be shown under structural common-reach audience, and ${reason}.`;
        ctx.Hooks.LogStatus(`   ❌ Action '${action.name}' refused under structural audience — ${reason}`, false, params);
        if (!skipBreaker) {
            ctx.Hooks.LockOutAction(action, actionEntity, 'audience');
        }
        return {
            Success: false,
            ResultCode: AUDIENCE_UNSUPPORTED_RESULT_CODE,
            Message: message,
            Params: [],
            RunParams: {
                Action: actionEntity,
                Params: policy.ToActionParams(ctx, { Params: action.params ?? {}, Bound: [] }, actionEntity),
                ContextUser: contextUser,
                Filters: [],
            },
        };
    }

    public ResolveActionSupportsAudience(actionEntity: MJActionEntityExtended): boolean {
        return ActionSupportsAudience(actionEntity);
    }

    public SessionAudienceRefusal(ctx: AgentRunContext, params: ExecuteAgentParams): string | null {
        if (!ctx.Hooks.RunAudienceAddsReader(params)) {
            return null;
        }
        return (
            `Agent '${params.agent.Name}' is session-driven (realtime), and realtime sessions cannot yet be limited to an audience; ` +
            'run it without an Audience, or use a non-realtime agent for a shared conversation.'
        );
    }

    // -------------------------------------------------------------------------
    // Task Graph, Handoff, Client Tools & Prompt Withholding / Refusals
    // -------------------------------------------------------------------------

    public TaskGraphConstraint(
        ctx: AgentRunContext,
        policy: BaseAgentActionPolicyHelper,
        params: ExecuteAgentParams
    ): string | null {
        if (ctx.Hooks.RunAudienceAddsReader(params)) {
            return 'a run with an audience';
        }
        const scope = ctx.RunScope ?? this.ValidatedRunScope(ctx, params);
        if (scope?.SearchScopeIDs?.length) {
            return 'a run with host-assigned search scopes';
        }
        if (ActionRunScopeIsBounded(scope)) {
            return 'a tenant-scoped run';
        }
        if (policy.HasBoundActionParams(ctx, params.boundActionParams)) {
            return 'a run with bound action parameters';
        }
        if (params.contextUser?.TenantContext) {
            return 'a run with a tenant context';
        }
        return ctx.TaintedSources.length > 0 || params.SecurityEnvelope?.IsRunTainted === true
            ? 'a run that ingested untrusted content'
            : null;
    }

    public TaskGraphWithholdingReason(
        ctx: AgentRunContext,
        policy: BaseAgentActionPolicyHelper,
        params: ExecuteAgentParams
    ): string | null {
        const constraint = this.TaskGraphConstraint(ctx, policy, params);
        if (!constraint) {
            return null;
        }
        if (GetTaskGraphSubmitter()?.SupportsSecurityEnvelope !== true) {
            return constraint;
        }
        if (AgentAudienceProblem(params.Audience) !== null) {
            return 'a run with an audience';
        }
        return TenantContextCarryProblem(params.contextUser?.TenantContext)
            ? 'a run whose tenant context cannot be carried into a task graph'
            : null;
    }

    public RunWithholdsTaskGraphs(
        ctx: AgentRunContext,
        policy: BaseAgentActionPolicyHelper,
        params: ExecuteAgentParams
    ): boolean {
        return this.TaskGraphWithholdingReason(ctx, policy, params) !== null;
    }

    public TaskGraphRefusal(
        ctx: AgentRunContext,
        policy: BaseAgentActionPolicyHelper,
        params: ExecuteAgentParams,
        previousDecision: BaseAgentNextStep
    ): BaseAgentNextStep | null {
        const reason = this.TaskGraphWithholdingReason(ctx, policy, params);
        if (!reason) {
            return null;
        }
        return {
            step: 'Failed',
            terminate: true,
            errorMessage:
                `Task graphs are not available in ${reason}: a graph dispatches its actions and agents outside the run, ` +
                "where nothing limits them to the run's audience or scope.",
            previousPayload: previousDecision.previousPayload,
            newPayload: previousDecision.newPayload || previousDecision.previousPayload,
        };
    }

    public RunWithholdsHandoff(params: ExecuteAgentParams): boolean {
        const hasTrustedHostAllowList =
            params.TrustReservedRunData === true && HostAllowedAgentIDs(params.data) !== undefined;
        const isUnscopedGuest =
            Boolean(params.contextUser?.IsMagicLinkAnonymous || params.contextUser?.WidgetGuestContext) &&
            !hasTrustedHostAllowList;
        return (
            Boolean(params.parentRun) ||
            !params.conversationDetailId ||
            !Array.isArray(params.handoffChain) ||
            isUnscopedGuest
        );
    }

    public PromptWithholding(
        ctx: AgentRunContext,
        policy: BaseAgentActionPolicyHelper,
        params: ExecuteAgentParams
    ): PromptWithholding {
        return {
            TaskGraphs: this.RunWithholdsTaskGraphs(ctx, policy, params),
            Handoff: this.RunWithholdsHandoff(params),
            CallerContext: ctx.Hooks.RunAudienceAddsReader(params),
        };
    }

    public CallerContextSections(
        ctx: AgentRunContext,
        agent: MJAIAgentEntityExtended,
        extraData: Record<string, unknown> | undefined,
        withhold: boolean
    ): { clientToolDetails: string; appContext: string } {
        if (withhold) {
            return { clientToolDetails: '', appContext: '' };
        }
        return {
            clientToolDetails: ctx.ContextAssembler.BuildClientToolPromptSection(agent, extraData),
            appContext: ctx.ContextAssembler.BuildAppContextSection(extraData),
        };
    }

    public ClientToolsRefusal(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        previousDecision: BaseAgentNextStep
    ): BaseAgentNextStep | null {
        if (!ctx.Hooks.RunAudienceAddsReader(params)) {
            return null;
        }
        return {
            step: 'Failed',
            terminate: true,
            errorMessage:
                "Client tools are not available in a run with an audience: they run in the caller's browser, " +
                'and what they return would reach everyone in the conversation.',
            previousPayload: previousDecision.previousPayload,
            newPayload: previousDecision.newPayload || previousDecision.previousPayload,
        };
    }

    public WithoutTaskGraphs(promptParams: Record<string, unknown>): Record<string, unknown> {
        const responseType = IsPlainObject(promptParams.includeResponseTypeDefinition)
            ? (promptParams.includeResponseTypeDefinition as Record<string, unknown>)
            : {};
        return { ...promptParams, enableTaskGraphs: false, includeResponseTypeDefinition: { ...responseType, tasks: false } };
    }

    public WithoutHandoff(promptParams: Record<string, unknown>): Record<string, unknown> {
        const responseType = IsPlainObject(promptParams.includeResponseTypeDefinition)
            ? (promptParams.includeResponseTypeDefinition as Record<string, unknown>)
            : {};
        return { ...promptParams, enableHandoff: false, includeResponseTypeDefinition: { ...responseType, handoff: false } };
    }

    // -------------------------------------------------------------------------
    // Run Scope Validation & Persistence
    // -------------------------------------------------------------------------

    public RunScopeFor(ctx: AgentRunContext, params: ExecuteAgentParams): ActionRunScope {
        const scope = ctx.RunScope ?? this.ValidatedRunScope(ctx, params);
        const secondary = scope.SecondaryScopes
            ? Object.fromEntries(
                  Object.entries(scope.SecondaryScopes).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])
              )
            : null;
        return { ...scope, SecondaryScopes: secondary, ...(scope.SearchScopeIDs ? { SearchScopeIDs: [...scope.SearchScopeIDs] } : {}) };
    }

    public RunScopeInputs(params: ExecuteAgentParams): {
        EntityName: string | undefined;
        RecordID: string | undefined;
        Secondary: Record<string, SecondaryScopeValue> | undefined;
    } {
        const data = WithAgentRunDataTrustApplied(params).Params.data;
        return {
            EntityName: this.ScopeText(params.PrimaryScopeEntityName ?? data?.PrimaryScopeEntityName),
            RecordID: this.ScopeText(params.PrimaryScopeRecordID ?? data?.PrimaryScopeRecordID),
            Secondary: this.ScopeDimensions(params.SecondaryScopes ?? data?.SecondaryScopes, params.agent?.Name),
        };
    }

    public ScopeDimensions(
        value: unknown,
        agentName: string | undefined
    ): Record<string, SecondaryScopeValue> | undefined {
        if (value === undefined || value === null) {
            return undefined;
        }
        if (!IsPlainObject(value)) {
            LogError(`Scoping: SecondaryScopes for agent "${agentName ?? 'unknown'}" must be a plain object of dimension values; ignored.`);
            return undefined;
        }
        return value as Record<string, SecondaryScopeValue>;
    }

    public RunScopeForContext(ctx: AgentRunContext, params: ExecuteAgentParams): RunContextScope {
        const scope = ctx.RunScope ?? this.ValidatedRunScope(ctx, params);
        const entityName = scope.PrimaryScopeEntityName ?? undefined;
        return {
            EntityID: entityName ? ctx.ProviderToUse.EntityByName(entityName)?.ID : undefined,
            RecordID: scope.PrimaryScopeRecordID ?? undefined,
            Secondary: scope.SecondaryScopes ?? undefined,
        };
    }

    public ScopedPromptConfigScope(ctx: AgentRunContext, params: ExecuteAgentParams): PromptComponentScope {
        const scope = this.RunScopeForContext(ctx, params);
        return {
            primaryScopeEntityId: scope.EntityID,
            primaryScopeRecordId: scope.RecordID,
            secondaryScopes: scope.Secondary,
        };
    }

    public ScopeText(value: unknown): string | undefined {
        if (typeof value === 'number') {
            return String(value);
        }
        return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
    }

    public ValidatedRunScope(ctx: AgentRunContext, params: ExecuteAgentParams): ActionRunScope {
        const inputs = this.RunScopeInputs(params);
        const searchScopeIDs = this.HostSearchScopeIDs(params);
        const hostScopes = searchScopeIDs ? { SearchScopeIDs: searchScopeIDs } : {};
        if (!inputs.EntityName && !inputs.RecordID && !inputs.Secondary) {
            return { PrimaryScopeEntityName: null, PrimaryScopeRecordID: null, SecondaryScopes: null, ...hostScopes };
        }
        const secondary = this.ValidateAndApplySecondaryScopes(
            inputs.Secondary,
            this.ParseSecondaryScopeConfig(params.agent),
            params.agent.Name
        );
        return {
            PrimaryScopeEntityName: inputs.EntityName ?? null,
            PrimaryScopeRecordID: inputs.RecordID ?? null,
            SecondaryScopes: secondary && Object.keys(secondary).length > 0 ? secondary : null,
            ...hostScopes,
        };
    }

    public HostSearchScopeIDs(params: ExecuteAgentParams): string[] | null {
        const seen = new UUIDSet();
        const ids: string[] = [];
        for (const id of params.SearchScopeIDs ?? []) {
            const trimmed = typeof id === 'string' ? id.trim() : '';
            if (trimmed && !seen.Has(trimmed)) {
                seen.Add(trimmed);
                ids.push(trimmed);
            }
        }
        return ids.length > 0 ? ids : null;
    }

    public WriteRunScope(ctx: AgentRunContext, params: ExecuteAgentParams, scope: ActionRunScope): void {
        if (!ctx.AgentRun) {
            return;
        }
        if (scope.PrimaryScopeEntityName) {
            const primaryEntity = ctx.ProviderToUse.EntityByName(scope.PrimaryScopeEntityName);
            if (primaryEntity) {
                ctx.AgentRun.PrimaryScopeEntityID = primaryEntity.ID;
            } else {
                LogError(`Scoping: Entity "${scope.PrimaryScopeEntityName}" not found in metadata`);
            }
        }
        if (scope.PrimaryScopeRecordID) {
            ctx.AgentRun.PrimaryScopeRecordID = scope.PrimaryScopeRecordID;
        }
        if (scope.SecondaryScopes) {
            ctx.AgentRun.SecondaryScopes = JSON.stringify(scope.SecondaryScopes);
            if (!scope.PrimaryScopeRecordID && !(this.ParseSecondaryScopeConfig(params.agent)?.allowSecondaryOnly ?? false)) {
                LogError(
                    `Scoping: Agent "${params.agent.Name}" requires primary scope when using secondary scopes. ` +
                        `Set allowSecondaryOnly=true in ScopeConfig to allow secondary-only scoping.`
                );
            }
        }
    }

    public ParseSecondaryScopeConfig(agent: MJAIAgentEntityExtended): SecondaryScopeConfig | null {
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

    public ValidateAndApplySecondaryScopes(
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
                } else if (!(dim.name in result) && dim.defaultValue != null) {
                    result[dim.name] = dim.defaultValue;
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
