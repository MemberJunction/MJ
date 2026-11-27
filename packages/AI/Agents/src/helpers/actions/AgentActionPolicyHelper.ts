/**
 * @fileoverview Default code-only implementation of {@link BaseAgentActionPolicyHelper}.
 *
 * Implements trust/taint classification & egress blocking, bound & hidden action parameters,
 * per-(Agent, User) action policy evaluation, runtime API key resolution & action context
 * stamping, and delegates audience/withholding/run-scope enforcement to
 * {@link AgentRunScopeAndAudienceHelper}.
 *
 * @module @memberjunction/ai-agents
 */

import {
    AgentUserPolicyEngine,
    IsStructuralCommonReachAudience,
    TAINTED_EGRESS_BLOCKED,
    type AgentAction,
    type AgentTaintedSource,
    type AIPromptExecutionScope,
    type BaseAgentNextStep,
    type BoundActionParams,
    type ExecuteAgentParams,
    type ExecuteAgentResult,
    type MJAIAgentEntityExtended,
    type SecondaryScopeConfig,
    type SecondaryScopeValue,
} from '@memberjunction/ai-core-plus';
import {
    ActionEngineBase,
    type ActionOutputTrustLevel,
    type ActionParam,
    type ActionResult,
    type ActionRunScope,
    type MJActionEntityExtended,
    type RunActionParams,
    type RuntimeAPIKeyResolver,
} from '@memberjunction/actions-base';
import { ActionEngineServer } from '@memberjunction/actions';
import { CredentialScopeAllows, GetAIAPIKey } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { RunView, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString, IsPlainObject, RegisterClass, UUIDSet } from '@memberjunction/global';
import { ActionLifecycleResolver } from '../../ActionLifecycleResolver';
import type { ActiveRunTaint } from '../../ArtifactToolManager';
import type { LoopAgentTypePromptParams } from '../../agent-types/loop-agent-prompt-params';
import {
    ApplyBoundActionParams,
    BindingsForAction,
    IsBoundParamName,
    type BoundParamsApplication,
} from '../../bound-action-params';
import { CoerceActionArguments } from '../../native-tools/action-tool-builder';
import type { PromptComponentScope } from '../../prompt-component-resolver';
import { DEFAULT_AGENT_HELPER_KEY } from '../AgentHelperResolver';
import type { AgentRunContext } from '../AgentRunContext';
import {
    POLICY_APPROVAL_REQUIRED_RESULT_CODE,
    POLICY_DEFERRED_RESULT_CODE,
    POLICY_DENIED_RESULT_CODE,
    type ExecuteSingleActionOptions,
    type PromptWithholding,
    type RunContextScope,
} from '../base-agent-types';
import { AgentRunScopeAndAudienceHelper } from './AgentRunScopeAndAudienceHelper';
import { BaseAgentActionPolicyHelper } from './BaseAgentActionPolicyHelper';

/**
 * Default code-only action policy helper registered under `'Default'`.
 */
@RegisterClass(BaseAgentActionPolicyHelper, DEFAULT_AGENT_HELPER_KEY)
export class AgentActionPolicyHelper extends BaseAgentActionPolicyHelper {
    private readonly _scopeAndAudience = new AgentRunScopeAndAudienceHelper();

    // -------------------------------------------------------------------------
    // Trust & Taint Tracking
    // -------------------------------------------------------------------------

    public override ResolveActionTrustLevel(
        ctx: AgentRunContext,
        actionName: string,
        actionEntity?: MJActionEntityExtended,
        params?: ExecuteAgentParams
    ): ActionOutputTrustLevel {
        const normalizedName = actionName.trim().toLowerCase();
        const entity =
            actionEntity ??
            ActionEngineBase.Instance.Actions?.find((a) => a.Name?.trim().toLowerCase() === normalizedName);
        const entityName = entity?.Name?.trim().toLowerCase();
        const namesAction = (candidate: string): boolean => {
            const n = candidate.trim().toLowerCase();
            return n === normalizedName || (entityName !== undefined && n === entityName);
        };
        const isLevel = (v: unknown): v is ActionOutputTrustLevel =>
            v === 'Trusted' || v === 'SemiTrusted' || v === 'Untrusted';
        const promptParams = (params?.data?.__agentTypePromptParams ?? ctx.AgentTypePromptParams) as
            | Partial<LoopAgentTypePromptParams>
            | undefined;

        if (promptParams?.actionTrustLevels && typeof promptParams.actionTrustLevels === 'object') {
            for (const [key, level] of Object.entries(promptParams.actionTrustLevels)) {
                if (namesAction(key) && isLevel(level)) {
                    return level;
                }
            }
        }
        if (Array.isArray(promptParams?.trustedActionNames) && promptParams.trustedActionNames.some(namesAction)) {
            return 'Trusted';
        }
        if (Array.isArray(promptParams?.untrustedActionNames) && promptParams.untrustedActionNames.some(namesAction)) {
            return 'Untrusted';
        }
        const actionConfig = ActionLifecycleResolver.GetActionConfigObject(entity);
        if (actionConfig && isLevel(actionConfig.outputTrustLevel)) {
            return actionConfig.outputTrustLevel;
        }
        return 'Trusted';
    }

    public override RecordTaintedSource(
        ctx: AgentRunContext,
        stepNumber: number,
        sourceName: string,
        trustLevel: AgentTaintedSource['trustLevel']
    ): void {
        if (
            !ctx.TaintedSources.some(
                (s) => s.stepNumber === stepNumber && s.sourceName === sourceName && s.trustLevel === trustLevel
            )
        ) {
            ctx.TaintedSources.push({ stepNumber, sourceName, trustLevel });
        }
    }

    public override GetHighestRunTaint(ctx: AgentRunContext): ActiveRunTaint | undefined {
        if (ctx.TaintedSources.length === 0) {
            return undefined;
        }
        const untrusted = ctx.TaintedSources.find((s) => s.trustLevel === 'Untrusted');
        if (untrusted) {
            return { TrustLevel: 'Untrusted', SourceName: untrusted.sourceName };
        }
        const first = ctx.TaintedSources[0];
        return { TrustLevel: first.trustLevel, SourceName: first.sourceName };
    }

    public override SeedTaintFromSecurityEnvelope(ctx: AgentRunContext, params: ExecuteAgentParams): void {
        if (params.SecurityEnvelope?.IsRunTainted === true) {
            ctx.Hooks.RecordTaintedSource(0, 'task-graph:security-envelope', 'Untrusted');
        }
    }

    public override SeedTaintFromParentRun(ctx: AgentRunContext, params: ExecuteAgentParams): void {
        if (params.ParentRunTainted === true) {
            ctx.Hooks.RecordTaintedSource(0, 'parent-run', 'Untrusted');
        }
    }

    public override AbsorbSubAgentTaint(
        ctx: AgentRunContext,
        subAgentName: string,
        subAgentResult: Pick<ExecuteAgentResult, 'taintedSources'>,
        stepNumber: number
    ): void {
        for (const source of subAgentResult.taintedSources ?? []) {
            ctx.Hooks.RecordTaintedSource(stepNumber, `sub-agent:${subAgentName}/${source.sourceName}`, source.trustLevel);
        }
    }

    public override CheckTaintedEgress(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        contextUser?: UserInfo
    ): ActionResult | null {
        if (!params.SecurityEnvelope || ctx.TaintedSources.length === 0 || actionEntity.Config_Object?.disallowWhenTainted !== true) {
            return null;
        }
        return {
            Success: false,
            ResultCode: TAINTED_EGRESS_BLOCKED,
            Message:
                `Action "${actionEntity.Name}" was not run: this workflow step has read untrusted content, and the action ` +
                'sends data out or cannot be undone. A person must review the content in a Human step before it can run.',
            Params: [],
            RunParams: {
                Action: actionEntity,
                Params: this.ToActionParams(ctx, { Params: action.params ?? {}, Bound: [] }, actionEntity),
                ContextUser: contextUser,
                Filters: [],
            },
        };
    }

    // -------------------------------------------------------------------------
    // Bound & Hidden Action Parameters
    // -------------------------------------------------------------------------

    public override ApplyActionBindings(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        options?: ExecuteSingleActionOptions
    ): BoundParamsApplication {
        const bindings = BindingsForAction(params.boundActionParams, actionEntity.ID);
        const application = ApplyBoundActionParams(
            action.params,
            bindings,
            actionEntity.Params?.Items ?? [],
            actionEntity.Name
        );
        if (application.Overridden.length > 0) {
            const names = application.Overridden.map((n) => `'${n}'`).join(', ');
            ctx.Hooks.LogStatus(
                `   🔒 Action '${action.name}': the model supplied ${names}, which this run binds; the model's value is discarded (${this.WhereInRun(ctx, options)})`,
                false,
                params
            );
        }
        return application;
    }

    public override WhereInRun(ctx: AgentRunContext, options?: ExecuteSingleActionOptions): string {
        return `run ${ctx.AgentRun?.ID ?? 'n/a'}, step ${options?.StepID ?? 'n/a'}`;
    }

    public override ToActionParams(
        _ctx: AgentRunContext,
        application: Pick<BoundParamsApplication, 'Params' | 'Bound'>,
        actionEntity: MJActionEntityExtended
    ): ActionParam[] {
        const coerced = CoerceActionArguments(actionEntity.Params?.Items ?? [], application.Params);
        return Object.entries(coerced).map(([key, value]) => {
            const bound = application.Bound.includes(key);
            const param: ActionParam = { Name: key, Value: bound ? application.Params[key] : value, Type: 'Input' };
            if (bound) {
                param.Bound = true;
            }
            return param;
        });
    }

    public override RefuseBoundAction(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        reason: string,
        options?: ExecuteSingleActionOptions
    ): ActionResult {
        ctx.Hooks.LogError(
            `Bound action parameters refused '${actionEntity.Name}' (${this.WhereInRun(ctx, options)}): ${reason}`,
            {
                category: 'ActionExecution',
                agent: params.agent,
                metadata: { actionName: action.name, runId: ctx.AgentRun?.ID, stepId: options?.StepID },
            }
        );
        ctx.FatalActionFailures.add(action.name);
        if (actionEntity.Name) {
            ctx.FatalActionFailures.add(actionEntity.Name);
        }
        return ctx.Hooks.BuildBlockedActionResult(
            actionEntity,
            'fatal',
            `Action '${action.name}' is not available in this run's configuration. Do not call it again; use another tool or proceed with the data you have.`
        );
    }

    public override BindsAnyAction(
        _ctx: AgentRunContext,
        actions: readonly MJActionEntityExtended[],
        bound: BoundActionParams | undefined
    ): boolean {
        return bound !== undefined && actions.some((a) => BindingsForAction(bound, a.ID) !== undefined);
    }

    public override HasBoundActionParams(_ctx: AgentRunContext, bound: BoundActionParams | undefined): boolean {
        return bound !== undefined && Object.keys(bound).length > 0;
    }

    public override BoundActionParamsError(ctx: AgentRunContext, params: ExecuteAgentParams): string | null {
        const bound = params.boundActionParams;
        if (ctx.Depth !== 0 || !bound || Object.keys(bound).length === 0) {
            return null;
        }
        const known = new UUIDSet(ActionEngineServer.Instance.Actions.map((a) => a.ID));
        const unknown = Object.keys(bound).filter((id) => !known.Has(id));
        if (unknown.length === 0) {
            return null;
        }
        return `boundActionParams names no known action: ${unknown.map((id) => `'${id}'`).join(', ')}. Keys are Action IDs.`;
    }

    public override async InheritBoundActionParams(ctx: AgentRunContext, params: ExecuteAgentParams): Promise<void> {
        if (this.HasBoundActionParams(ctx, params.boundActionParams) || !params.lastRunId) {
            return;
        }
        ctx.Hooks.AssertLastRunIdIsUUID(params.lastRunId);
        const result = await new RunView().RunView<{ BoundActionParams: string | null }>(
            {
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: `ID='${EscapeSQLString(params.lastRunId)}'`,
                Fields: ['BoundActionParams'],
                ResultType: 'simple',
                BypassCache: true,
            },
            params.contextUser
        );
        if (!result.Success) {
            throw new Error(`Could not read the bindings of run ${params.lastRunId}: ${result.ErrorMessage}`);
        }
        if (result.Results.length === 0) {
            throw new Error(`Could not read the bindings of run ${params.lastRunId}: no such run is visible to this user`);
        }
        const stored = result.Results[0].BoundActionParams;
        if (stored) {
            const parsed: unknown = JSON.parse(stored);
            if (!IsPlainObject(parsed)) {
                throw new Error(`The stored bindings of run ${params.lastRunId} are not an object of action bindings`);
            }
            params.boundActionParams = parsed as BoundActionParams;
        }
    }

    public override ShownActionParamEntries(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        aa: AgentAction
    ): [string, unknown][] {
        const entries = Object.entries(aa.params ?? {});
        if (!params.boundActionParams) {
            return entries;
        }
        const actionEntity = ctx.Hooks.GetEffectiveActionsForValidation(params.agent.ID).find((a) => a.Name === aa.name);
        const bindings = BindingsForAction(params.boundActionParams, actionEntity?.ID ?? '');
        return bindings ? entries.filter(([key]) => !IsBoundParamName(key, bindings)) : entries;
    }

    // -------------------------------------------------------------------------
    // Per-(Agent, User) Action Policies & Runtime Credentials / Context Stamping
    // -------------------------------------------------------------------------

    public override async CheckUserActionPolicy(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        contextUser?: UserInfo
    ): Promise<ActionResult | null> {
        if (!contextUser?.ID || !params?.agent?.ID) {
            return null;
        }
        const policyAgentIDs = this.CollectPolicyAgentChain(ctx, params);
        const actionParamsRecord: Record<string, string | number | boolean | null | undefined> = {};
        if (action.params) {
            for (const [key, val] of Object.entries(action.params)) {
                if (val == null || typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
                    actionParamsRecord[key] = val as string | number | boolean | null | undefined;
                } else {
                    actionParamsRecord[key] = JSON.stringify(val);
                }
            }
        }

        const verdictRank: Record<'Allow' | 'RequireApproval' | 'DeferUntilNextWindow' | 'Deny', number> = {
            Allow: 0,
            RequireApproval: 1,
            DeferUntilNextWindow: 2,
            Deny: 3,
        };
        let strictestVerdict: 'Allow' | 'RequireApproval' | 'DeferUntilNextWindow' | 'Deny' = 'Allow';
        let strictestReason = '';

        for (const agentId of policyAgentIDs) {
            let policy = AgentUserPolicyEngine.Instance.GetCachedPolicy(agentId, contextUser.ID, params.provider);
            if (!policy) {
                const lookup = await AgentUserPolicyEngine.Instance.ResolvePolicyForAgentAndUser(
                    agentId,
                    contextUser.ID,
                    contextUser,
                    { provider: params.provider }
                );
                if (lookup.status === 'error') {
                    return {
                        Success: false,
                        ResultCode: POLICY_DENIED_RESULT_CODE,
                        Message: `Action "${actionEntity.Name || action.name}" blocked (fail-closed): user policy lookup failed (${lookup.errorMessage}).`,
                        Params: [],
                        RunParams: {
                            Action: actionEntity,
                            Params: this.ToActionParams(ctx, { Params: action.params ?? {}, Bound: [] }, actionEntity),
                            ContextUser: contextUser,
                            Filters: [],
                        },
                    };
                }
                policy = lookup.policy;
            }
            if (!policy) {
                continue;
            }
            const evaluation = AgentUserPolicyEngine.Instance.EvaluateActionExecution({
                actionName: actionEntity.Name || action.name,
                params: actionParamsRecord,
                contextUser,
                policy,
            });
            if (verdictRank[evaluation.verdict] > verdictRank[strictestVerdict]) {
                strictestVerdict = evaluation.verdict;
                strictestReason = evaluation.reason;
            }
        }

        if (strictestVerdict === 'Allow') {
            return null;
        }
        const resultCode =
            strictestVerdict === 'Deny'
                ? POLICY_DENIED_RESULT_CODE
                : strictestVerdict === 'DeferUntilNextWindow'
                ? POLICY_DEFERRED_RESULT_CODE
                : POLICY_APPROVAL_REQUIRED_RESULT_CODE;
        return {
            Success: false,
            ResultCode: resultCode,
            Message: strictestReason,
            Params: [],
            RunParams: {
                Action: actionEntity,
                Params: this.ToActionParams(ctx, { Params: action.params ?? {}, Bound: [] }, actionEntity),
                ContextUser: contextUser,
                Filters: [],
            },
        };
    }

    public override CollectPolicyAgentChain(_ctx: AgentRunContext, params: ExecuteAgentParams): string[] {
        const seen = new Set<string>();
        const result: string[] = [];
        const add = (id: string | null | undefined): void => {
            const clean = id?.trim();
            if (!clean) {
                return;
            }
            const lower = clean.toLowerCase();
            if (!seen.has(lower)) {
                seen.add(lower);
                result.push(clean);
            }
        };
        add(params.agent?.ID);
        if (params.agent?.BaseAgentID && typeof AIEngine.Instance.GetAgentInheritanceChain === 'function') {
            for (const chainMember of AIEngine.Instance.GetAgentInheritanceChain(params.agent.ID)) {
                add(chainMember.ID);
            }
        }
        for (const ceilingId of params.policyCeilingAgentIDs ?? []) {
            add(ceilingId);
        }
        return result;
    }

    public override RunPromptExecutionScope(ctx: AgentRunContext, params: ExecuteAgentParams): AIPromptExecutionScope {
        return {
            contextUser: params.contextUser,
            provider: params.provider || ctx.ActiveProvider,
            configurationId: params.configurationId,
            apiKeys: params.apiKeys,
            CredentialScope: params.CredentialScope,
        };
    }

    public override ActionMayUseRuntimeAPIKey(
        _ctx: AgentRunContext,
        _action: MJActionEntityExtended,
        _driverClass: string,
        _params: ExecuteAgentParams
    ): boolean {
        return true;
    }

    public override BuildRuntimeAPIKeyResolver(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        actionEntity: MJActionEntityExtended
    ): RuntimeAPIKeyResolver {
        const runKeys = params.apiKeys;
        return (driverClass: string): string | undefined => {
            const platformAllowed = CredentialScopeAllows(params.CredentialScope, 'Environment');
            if (!ctx.Hooks.ActionMayUseRuntimeAPIKey(actionEntity, driverClass, params)) {
                ctx.Hooks.LogStatus(
                    `🔑 Runtime API key for '${driverClass}' refused to action '${actionEntity.Name}' by policy — ${platformAllowed ? 'platform key applies' : `credential scope is ${params.CredentialScope}, so no key applies`}`,
                    true,
                    params
                );
                return undefined;
            }
            const key = GetAIAPIKey(driverClass, runKeys, false, params.CredentialScope);
            const source = runKeys?.some((k) => k.driverClass === driverClass)
                ? 'run'
                : platformAllowed
                ? 'platform'
                : `none — credential scope is ${params.CredentialScope}`;
            ctx.Hooks.LogStatus(`🔑 Action '${actionEntity.Name}' resolved an API key for '${driverClass}' (${source})`, true, params);
            return key || undefined;
        };
    }

    public override StampActionContext(ctx: AgentRunContext, params: ExecuteAgentParams): Record<string, unknown> {
        const actionContext = (typeof params.context === 'object' && params.context ? params.context : {}) as Record<
            string,
            unknown
        >;
        actionContext.AgentID = params.agent.ID;
        if (ctx.AgentRun?.ID) {
            actionContext.AgentRunID = ctx.AgentRun.ID;
        }
        if (params.agent?.Name) {
            actionContext.AgentName = params.agent.Name;
        }
        if (params.conversationId && !actionContext.ConversationID) {
            actionContext.ConversationID = params.conversationId;
        }
        actionContext.ActiveSkillIDs = ctx.Hooks.ActiveSkillIDsForRun(params);
        if (params.boundActionParams) {
            actionContext.BoundActionParams = params.boundActionParams;
        }
        if (ctx.ResolvedStorageAccountId) {
            actionContext.__resolvedStorageAccountId = ctx.ResolvedStorageAccountId;
        }
        return actionContext;
    }

    public override RunBoundDispatchParams(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        actionEntity: MJActionEntityExtended,
        audienceReaders: UserInfo[],
        runAs: UserInfo | undefined
    ): Pick<RunActionParams, 'RuntimeAPIKeyResolver' | 'CredentialScope' | 'Audience' | 'IsStructuralAudience' | 'RunScope'> {
        const readers = this.DispatchReaders(ctx, params, audienceReaders, runAs);
        const isStructuralAudience = IsStructuralCommonReachAudience(params.Audience);
        return {
            RuntimeAPIKeyResolver:
                params.apiKeys && params.apiKeys.length > 0
                    ? this.BuildRuntimeAPIKeyResolver(ctx, params, actionEntity)
                    : undefined,
            CredentialScope: params.CredentialScope,
            Audience: readers.length > 0 ? { Readers: readers } : undefined,
            ...(isStructuralAudience ? { IsStructuralAudience: true } : {}),
            RunScope: ctx.Hooks.RunScopeFor(params),
        };
    }

    // -------------------------------------------------------------------------
    // Delegated Audience, Withholding & Run Scope Methods
    // -------------------------------------------------------------------------

    public override AudienceReadersFor(
        ctx: AgentRunContext,
        params: ExecuteAgentParams
    ): Promise<{ Readers: UserInfo[] } | { Error: string }> {
        return this._scopeAndAudience.AudienceReadersFor(ctx, params);
    }

    public override ResolveRunAudience(
        ctx: AgentRunContext,
        params: ExecuteAgentParams
    ): Promise<{ Readers: UserInfo[] } | { Error: string }> {
        return this._scopeAndAudience.ResolveRunAudience(ctx, params);
    }

    public override ResolveAudienceUsers(
        ctx: AgentRunContext,
        ids: string[],
        params: ExecuteAgentParams
    ): Promise<UserInfo[]> {
        return this._scopeAndAudience.ResolveAudienceUsers(ctx, ids, params);
    }

    public override RunAudienceAddsReader(_ctx: AgentRunContext, params: ExecuteAgentParams): boolean {
        return this._scopeAndAudience.RunAudienceAddsReader(params);
    }

    public override DispatchReaders(
        _ctx: AgentRunContext,
        params: ExecuteAgentParams,
        readers: UserInfo[],
        runAs: UserInfo | undefined
    ): UserInfo[] {
        return this._scopeAndAudience.DispatchReaders(params, readers, runAs);
    }

    public override CheckStructuralAudienceAction(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        contextUser: UserInfo | undefined,
        skipBreaker: boolean
    ): ActionResult | null {
        return this._scopeAndAudience.CheckStructuralAudienceAction(
            ctx,
            this,
            params,
            action,
            actionEntity,
            contextUser,
            skipBreaker
        );
    }

    public override ResolveActionSupportsAudience(_ctx: AgentRunContext, actionEntity: MJActionEntityExtended): boolean {
        return this._scopeAndAudience.ResolveActionSupportsAudience(actionEntity);
    }

    public override SessionAudienceRefusal(ctx: AgentRunContext, params: ExecuteAgentParams): string | null {
        return this._scopeAndAudience.SessionAudienceRefusal(ctx, params);
    }

    public override TaskGraphConstraint(ctx: AgentRunContext, params: ExecuteAgentParams): string | null {
        return this._scopeAndAudience.TaskGraphConstraint(ctx, this, params);
    }

    public override TaskGraphWithholdingReason(ctx: AgentRunContext, params: ExecuteAgentParams): string | null {
        return this._scopeAndAudience.TaskGraphWithholdingReason(ctx, this, params);
    }

    public override RunWithholdsTaskGraphs(ctx: AgentRunContext, params: ExecuteAgentParams): boolean {
        return this._scopeAndAudience.RunWithholdsTaskGraphs(ctx, this, params);
    }

    public override TaskGraphRefusal(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        previousDecision: BaseAgentNextStep
    ): BaseAgentNextStep | null {
        return this._scopeAndAudience.TaskGraphRefusal(ctx, this, params, previousDecision);
    }

    public override RunWithholdsHandoff(_ctx: AgentRunContext, params: ExecuteAgentParams): boolean {
        return this._scopeAndAudience.RunWithholdsHandoff(params);
    }

    public override PromptWithholding(ctx: AgentRunContext, params: ExecuteAgentParams): PromptWithholding {
        return this._scopeAndAudience.PromptWithholding(ctx, this, params);
    }

    public override CallerContextSections(
        ctx: AgentRunContext,
        agent: MJAIAgentEntityExtended,
        extraData: Record<string, unknown> | undefined,
        withhold: boolean
    ): { clientToolDetails: string; appContext: string } {
        return this._scopeAndAudience.CallerContextSections(ctx, agent, extraData, withhold);
    }

    public override ClientToolsRefusal(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        previousDecision: BaseAgentNextStep
    ): BaseAgentNextStep | null {
        return this._scopeAndAudience.ClientToolsRefusal(ctx, params, previousDecision);
    }

    public override WithoutTaskGraphs(_ctx: AgentRunContext, promptParams: Record<string, unknown>): Record<string, unknown> {
        return this._scopeAndAudience.WithoutTaskGraphs(promptParams);
    }

    public override WithoutHandoff(_ctx: AgentRunContext, promptParams: Record<string, unknown>): Record<string, unknown> {
        return this._scopeAndAudience.WithoutHandoff(promptParams);
    }

    public override RunScopeFor(ctx: AgentRunContext, params: ExecuteAgentParams): ActionRunScope {
        return this._scopeAndAudience.RunScopeFor(ctx, params);
    }

    public override RunScopeInputs(_ctx: AgentRunContext, params: ExecuteAgentParams): {
        EntityName: string | undefined;
        RecordID: string | undefined;
        Secondary: Record<string, SecondaryScopeValue> | undefined;
    } {
        return this._scopeAndAudience.RunScopeInputs(params);
    }

    public override ScopeDimensions(
        _ctx: AgentRunContext,
        value: unknown,
        agentName: string | undefined
    ): Record<string, SecondaryScopeValue> | undefined {
        return this._scopeAndAudience.ScopeDimensions(value, agentName);
    }

    public override RunScopeForContext(ctx: AgentRunContext, params: ExecuteAgentParams): RunContextScope {
        return this._scopeAndAudience.RunScopeForContext(ctx, params);
    }

    public override ScopedPromptConfigScope(ctx: AgentRunContext, params: ExecuteAgentParams): PromptComponentScope {
        return this._scopeAndAudience.ScopedPromptConfigScope(ctx, params);
    }

    public override ScopeText(_ctx: AgentRunContext, value: unknown): string | undefined {
        return this._scopeAndAudience.ScopeText(value);
    }

    public override ValidatedRunScope(ctx: AgentRunContext, params: ExecuteAgentParams): ActionRunScope {
        return this._scopeAndAudience.ValidatedRunScope(ctx, params);
    }

    public override HostSearchScopeIDs(_ctx: AgentRunContext, params: ExecuteAgentParams): string[] | null {
        return this._scopeAndAudience.HostSearchScopeIDs(params);
    }

    public override WriteRunScope(ctx: AgentRunContext, params: ExecuteAgentParams, scope: ActionRunScope): void {
        this._scopeAndAudience.WriteRunScope(ctx, params, scope);
    }

    public override ParseSecondaryScopeConfig(_ctx: AgentRunContext, agent: MJAIAgentEntityExtended): SecondaryScopeConfig | null {
        return this._scopeAndAudience.ParseSecondaryScopeConfig(agent);
    }

    public override ValidateAndApplySecondaryScopes(
        _ctx: AgentRunContext,
        secondary: Record<string, SecondaryScopeValue> | undefined,
        scopeConfig: SecondaryScopeConfig | null,
        agentName: string
    ): Record<string, SecondaryScopeValue> | undefined {
        return this._scopeAndAudience.ValidateAndApplySecondaryScopes(secondary, scopeConfig, agentName);
    }
}
