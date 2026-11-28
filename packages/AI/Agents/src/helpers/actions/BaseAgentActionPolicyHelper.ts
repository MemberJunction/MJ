/**
 * @fileoverview Abstract pluggable base seam for `BaseAgent` action security policy,
 * taint/trust tracking, bound/hidden action parameters, per-(Agent, User) action policies,
 * audience & structural common-reach enforcement, withholding/refusal rules, and run scope.
 *
 * **SECURITY INVARIANT (D3 — CODE-ONLY SEAM):**
 * `'actionPolicy'` is listed in `CODE_ONLY_HELPER_SEAMS`. It can **NEVER** be overridden via
 * `AIAgent.Configuration.helperPlugins` metadata — only via server-side `@RegisterClass` code.
 *
 * @module @memberjunction/ai-agents
 */

import type {
    AgentAction,
    AgentRunAudience,
    AgentTaintedSource,
    AIPromptExecutionScope,
    BaseAgentNextStep,
    BoundActionParams,
    ExecuteAgentParams,
    ExecuteAgentResult,
    MJAIAgentEntityExtended,
    SecondaryScopeConfig,
    SecondaryScopeValue,
} from '@memberjunction/ai-core-plus';
import type {
    ActionOutputTrustLevel,
    ActionParam,
    ActionResult,
    ActionRunScope,
    MJActionEntityExtended,
    RunActionParams,
    RuntimeAPIKeyResolver,
} from '@memberjunction/actions-base';
import type { UserInfo } from '@memberjunction/core';
import type { ActiveRunTaint } from '../../ArtifactToolManager';
import type { BoundParamsApplication } from '../../bound-action-params';
import type { AgentRunContext } from '../AgentRunContext';
import type { ExecuteSingleActionOptions, PromptWithholding, RunContextScope } from '../base-agent-types';
import type { PromptComponentScope } from '../../prompt-component-resolver';

/**
 * Code-only base helper encapsulating all security-critical action policy, taint, binding,
 * audience, withholding, and run-scope enforcement for `BaseAgent`.
 */
export class BaseAgentActionPolicyHelper {
    // -------------------------------------------------------------------------
    // Trust & Taint Tracking
    // -------------------------------------------------------------------------

    public ResolveActionTrustLevel(
        _ctx: AgentRunContext,
        _actionName: string,
        _actionEntity?: MJActionEntityExtended,
        _params?: ExecuteAgentParams
    ): ActionOutputTrustLevel {
        throw new Error('BaseAgentActionPolicyHelper.ResolveActionTrustLevel must be implemented by a registered subclass.');
    }

    public RecordTaintedSource(
        _ctx: AgentRunContext,
        _stepNumber: number,
        _sourceName: string,
        _trustLevel: AgentTaintedSource['trustLevel']
    ): void {
        throw new Error('BaseAgentActionPolicyHelper.RecordTaintedSource must be implemented by a registered subclass.');
    }

    public GetHighestRunTaint(_ctx: AgentRunContext): ActiveRunTaint | undefined {
        throw new Error('BaseAgentActionPolicyHelper.GetHighestRunTaint must be implemented by a registered subclass.');
    }

    public SeedTaintFromSecurityEnvelope(_ctx: AgentRunContext, _params: ExecuteAgentParams): void {
        throw new Error('BaseAgentActionPolicyHelper.SeedTaintFromSecurityEnvelope must be implemented by a registered subclass.');
    }

    public SeedTaintFromParentRun(_ctx: AgentRunContext, _params: ExecuteAgentParams): void {
        throw new Error('BaseAgentActionPolicyHelper.SeedTaintFromParentRun must be implemented by a registered subclass.');
    }

    public AbsorbSubAgentTaint(
        _ctx: AgentRunContext,
        _subAgentName: string,
        _subAgentResult: Pick<ExecuteAgentResult, 'taintedSources'>,
        _stepNumber: number
    ): void {
        throw new Error('BaseAgentActionPolicyHelper.AbsorbSubAgentTaint must be implemented by a registered subclass.');
    }

    public CheckTaintedEgress(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _action: AgentAction,
        _actionEntity: MJActionEntityExtended,
        _contextUser?: UserInfo
    ): ActionResult | null {
        throw new Error('BaseAgentActionPolicyHelper.CheckTaintedEgress must be implemented by a registered subclass.');
    }

    // -------------------------------------------------------------------------
    // Bound & Hidden Action Parameters
    // -------------------------------------------------------------------------

    public ApplyActionBindings(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _action: AgentAction,
        _actionEntity: MJActionEntityExtended,
        _options?: ExecuteSingleActionOptions
    ): BoundParamsApplication {
        throw new Error('BaseAgentActionPolicyHelper.ApplyActionBindings must be implemented by a registered subclass.');
    }

    public WhereInRun(_ctx: AgentRunContext, _options?: ExecuteSingleActionOptions): string {
        throw new Error('BaseAgentActionPolicyHelper.WhereInRun must be implemented by a registered subclass.');
    }

    public ToActionParams(
        _ctx: AgentRunContext,
        _application: Pick<BoundParamsApplication, 'Params' | 'Bound'>,
        _actionEntity: MJActionEntityExtended
    ): ActionParam[] {
        throw new Error('BaseAgentActionPolicyHelper.ToActionParams must be implemented by a registered subclass.');
    }

    public RefuseBoundAction(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _action: AgentAction,
        _actionEntity: MJActionEntityExtended,
        _reason: string,
        _options?: ExecuteSingleActionOptions
    ): ActionResult {
        throw new Error('BaseAgentActionPolicyHelper.RefuseBoundAction must be implemented by a registered subclass.');
    }

    public BindsAnyAction(
        _ctx: AgentRunContext,
        _actions: readonly MJActionEntityExtended[],
        _bound: BoundActionParams | undefined
    ): boolean {
        throw new Error('BaseAgentActionPolicyHelper.BindsAnyAction must be implemented by a registered subclass.');
    }

    public HasBoundActionParams(_ctx: AgentRunContext, _bound: BoundActionParams | undefined): boolean {
        throw new Error('BaseAgentActionPolicyHelper.HasBoundActionParams must be implemented by a registered subclass.');
    }

    public BoundActionParamsError(_ctx: AgentRunContext, _params: ExecuteAgentParams): string | null {
        throw new Error('BaseAgentActionPolicyHelper.BoundActionParamsError must be implemented by a registered subclass.');
    }

    public async InheritBoundActionParams(_ctx: AgentRunContext, _params: ExecuteAgentParams): Promise<void> {
        throw new Error('BaseAgentActionPolicyHelper.InheritBoundActionParams must be implemented by a registered subclass.');
    }

    public ShownActionParamEntries(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _aa: AgentAction
    ): [string, unknown][] {
        throw new Error('BaseAgentActionPolicyHelper.ShownActionParamEntries must be implemented by a registered subclass.');
    }

    // -------------------------------------------------------------------------
    // Per-(Agent, User) Action Policies & Runtime Credentials / Context Stamping
    // -------------------------------------------------------------------------

    public async CheckUserActionPolicy(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _action: AgentAction,
        _actionEntity: MJActionEntityExtended,
        _contextUser?: UserInfo
    ): Promise<ActionResult | null> {
        throw new Error('BaseAgentActionPolicyHelper.CheckUserActionPolicy must be implemented by a registered subclass.');
    }

    public CollectPolicyAgentChain(_ctx: AgentRunContext, _params: ExecuteAgentParams): string[] {
        throw new Error('BaseAgentActionPolicyHelper.CollectPolicyAgentChain must be implemented by a registered subclass.');
    }

    public RunPromptExecutionScope(_ctx: AgentRunContext, _params: ExecuteAgentParams): AIPromptExecutionScope {
        throw new Error('BaseAgentActionPolicyHelper.RunPromptExecutionScope must be implemented by a registered subclass.');
    }

    public ActionMayUseRuntimeAPIKey(
        _ctx: AgentRunContext,
        _action: MJActionEntityExtended,
        _driverClass: string,
        _params: ExecuteAgentParams
    ): boolean {
        throw new Error('BaseAgentActionPolicyHelper.ActionMayUseRuntimeAPIKey must be implemented by a registered subclass.');
    }

    public BuildRuntimeAPIKeyResolver(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _actionEntity: MJActionEntityExtended
    ): RuntimeAPIKeyResolver {
        throw new Error('BaseAgentActionPolicyHelper.BuildRuntimeAPIKeyResolver must be implemented by a registered subclass.');
    }

    public StampActionContext(_ctx: AgentRunContext, _params: ExecuteAgentParams): Record<string, unknown> {
        throw new Error('BaseAgentActionPolicyHelper.StampActionContext must be implemented by a registered subclass.');
    }

    public RunBoundDispatchParams(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _actionEntity: MJActionEntityExtended,
        _audienceReaders: UserInfo[],
        _runAs: UserInfo | undefined
    ): Pick<RunActionParams, 'RuntimeAPIKeyResolver' | 'CredentialScope' | 'Audience' | 'IsStructuralAudience' | 'RunScope'> {
        throw new Error('BaseAgentActionPolicyHelper.RunBoundDispatchParams must be implemented by a registered subclass.');
    }

    // -------------------------------------------------------------------------
    // Audience, Structural Common-Reach & Withholding / Refusals
    // -------------------------------------------------------------------------

    public async AudienceReadersFor(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams
    ): Promise<{ Readers: UserInfo[] } | { Error: string }> {
        throw new Error('BaseAgentActionPolicyHelper.AudienceReadersFor must be implemented by a registered subclass.');
    }

    public async ResolveRunAudience(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams
    ): Promise<{ Readers: UserInfo[] } | { Error: string }> {
        throw new Error('BaseAgentActionPolicyHelper.ResolveRunAudience must be implemented by a registered subclass.');
    }

    public async ResolveAudienceUsers(
        _ctx: AgentRunContext,
        _ids: string[],
        _params: ExecuteAgentParams
    ): Promise<UserInfo[]> {
        throw new Error('BaseAgentActionPolicyHelper.ResolveAudienceUsers must be implemented by a registered subclass.');
    }

    public RunAudienceAddsReader(_ctx: AgentRunContext, _params: ExecuteAgentParams): boolean {
        throw new Error('BaseAgentActionPolicyHelper.RunAudienceAddsReader must be implemented by a registered subclass.');
    }

    public DispatchReaders(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _readers: UserInfo[],
        _runAs: UserInfo | undefined
    ): UserInfo[] {
        throw new Error('BaseAgentActionPolicyHelper.DispatchReaders must be implemented by a registered subclass.');
    }

    public CheckStructuralAudienceAction(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _action: AgentAction,
        _actionEntity: MJActionEntityExtended,
        _contextUser: UserInfo | undefined,
        _skipBreaker: boolean
    ): ActionResult | null {
        throw new Error('BaseAgentActionPolicyHelper.CheckStructuralAudienceAction must be implemented by a registered subclass.');
    }

    public ResolveActionSupportsAudience(_ctx: AgentRunContext, _actionEntity: MJActionEntityExtended): boolean {
        throw new Error('BaseAgentActionPolicyHelper.ResolveActionSupportsAudience must be implemented by a registered subclass.');
    }

    public SessionAudienceRefusal(_ctx: AgentRunContext, _params: ExecuteAgentParams): string | null {
        throw new Error('BaseAgentActionPolicyHelper.SessionAudienceRefusal must be implemented by a registered subclass.');
    }

    public TaskGraphConstraint(_ctx: AgentRunContext, _params: ExecuteAgentParams): string | null {
        throw new Error('BaseAgentActionPolicyHelper.TaskGraphConstraint must be implemented by a registered subclass.');
    }

    public TaskGraphWithholdingReason(_ctx: AgentRunContext, _params: ExecuteAgentParams): string | null {
        throw new Error('BaseAgentActionPolicyHelper.TaskGraphWithholdingReason must be implemented by a registered subclass.');
    }

    public RunWithholdsTaskGraphs(_ctx: AgentRunContext, _params: ExecuteAgentParams): boolean {
        throw new Error('BaseAgentActionPolicyHelper.RunWithholdsTaskGraphs must be implemented by a registered subclass.');
    }

    public TaskGraphRefusal(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _previousDecision: BaseAgentNextStep
    ): BaseAgentNextStep | null {
        throw new Error('BaseAgentActionPolicyHelper.TaskGraphRefusal must be implemented by a registered subclass.');
    }

    public RunWithholdsHandoff(_ctx: AgentRunContext, _params: ExecuteAgentParams): boolean {
        throw new Error('BaseAgentActionPolicyHelper.RunWithholdsHandoff must be implemented by a registered subclass.');
    }

    public PromptWithholding(_ctx: AgentRunContext, _params: ExecuteAgentParams): PromptWithholding {
        throw new Error('BaseAgentActionPolicyHelper.PromptWithholding must be implemented by a registered subclass.');
    }

    public CallerContextSections(
        _ctx: AgentRunContext,
        _agent: MJAIAgentEntityExtended,
        _extraData: Record<string, unknown> | undefined,
        _withhold: boolean
    ): { clientToolDetails: string; appContext: string } {
        throw new Error('BaseAgentActionPolicyHelper.CallerContextSections must be implemented by a registered subclass.');
    }

    public ClientToolsRefusal(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _previousDecision: BaseAgentNextStep
    ): BaseAgentNextStep | null {
        throw new Error('BaseAgentActionPolicyHelper.ClientToolsRefusal must be implemented by a registered subclass.');
    }

    public WithoutTaskGraphs(_ctx: AgentRunContext, _promptParams: Record<string, unknown>): Record<string, unknown> {
        throw new Error('BaseAgentActionPolicyHelper.WithoutTaskGraphs must be implemented by a registered subclass.');
    }

    public WithoutHandoff(_ctx: AgentRunContext, _promptParams: Record<string, unknown>): Record<string, unknown> {
        throw new Error('BaseAgentActionPolicyHelper.WithoutHandoff must be implemented by a registered subclass.');
    }

    // -------------------------------------------------------------------------
    // Run Scope Validation & Serialization
    // -------------------------------------------------------------------------

    public RunScopeFor(_ctx: AgentRunContext, _params: ExecuteAgentParams): ActionRunScope {
        throw new Error('BaseAgentActionPolicyHelper.RunScopeFor must be implemented by a registered subclass.');
    }

    public RunScopeInputs(_ctx: AgentRunContext, _params: ExecuteAgentParams): {
        EntityName: string | undefined;
        RecordID: string | undefined;
        Secondary: Record<string, SecondaryScopeValue> | undefined;
    } {
        throw new Error('BaseAgentActionPolicyHelper.RunScopeInputs must be implemented by a registered subclass.');
    }

    public ScopeDimensions(
        _ctx: AgentRunContext,
        _value: unknown,
        _agentName: string | undefined
    ): Record<string, SecondaryScopeValue> | undefined {
        throw new Error('BaseAgentActionPolicyHelper.ScopeDimensions must be implemented by a registered subclass.');
    }

    public RunScopeForContext(_ctx: AgentRunContext, _params: ExecuteAgentParams): RunContextScope {
        throw new Error('BaseAgentActionPolicyHelper.RunScopeForContext must be implemented by a registered subclass.');
    }

    public ScopedPromptConfigScope(_ctx: AgentRunContext, _params: ExecuteAgentParams): PromptComponentScope {
        throw new Error('BaseAgentActionPolicyHelper.ScopedPromptConfigScope must be implemented by a registered subclass.');
    }

    public ScopeText(_ctx: AgentRunContext, _value: unknown): string | undefined {
        throw new Error('BaseAgentActionPolicyHelper.ScopeText must be implemented by a registered subclass.');
    }

    public ValidatedRunScope(_ctx: AgentRunContext, _params: ExecuteAgentParams): ActionRunScope {
        throw new Error('BaseAgentActionPolicyHelper.ValidatedRunScope must be implemented by a registered subclass.');
    }

    public HostSearchScopeIDs(_ctx: AgentRunContext, _params: ExecuteAgentParams): string[] | null {
        throw new Error('BaseAgentActionPolicyHelper.HostSearchScopeIDs must be implemented by a registered subclass.');
    }

    public WriteRunScope(_ctx: AgentRunContext, _params: ExecuteAgentParams, _scope: ActionRunScope): void {
        throw new Error('BaseAgentActionPolicyHelper.WriteRunScope must be implemented by a registered subclass.');
    }

    public ParseSecondaryScopeConfig(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended): SecondaryScopeConfig | null {
        throw new Error('BaseAgentActionPolicyHelper.ParseSecondaryScopeConfig must be implemented by a registered subclass.');
    }

    public ValidateAndApplySecondaryScopes(
        _ctx: AgentRunContext,
        _secondary: Record<string, SecondaryScopeValue> | undefined,
        _scopeConfig: SecondaryScopeConfig | null,
        _agentName: string
    ): Record<string, SecondaryScopeValue> | undefined {
        throw new Error('BaseAgentActionPolicyHelper.ValidateAndApplySecondaryScopes must be implemented by a registered subclass.');
    }
}

export type { AgentRunAudience };
