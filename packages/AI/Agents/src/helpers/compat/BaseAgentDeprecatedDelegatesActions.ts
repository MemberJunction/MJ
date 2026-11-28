/**
 * @fileoverview Logic-free `@deprecated` compatibility pass-through layer extending
 * {@link BaseAgentDeprecatedDelegatesMid} for seams `s8`–`s11` extracted from `BaseAgent`
 * into pluggable `BaseAgent*Helper` classes during the Phase 2 decomposition.
 *
 * **STRICT INVARIANT:** This class holds **zero state** and **zero business logic** —
 * every member is a 1-line delegate forwarding to the corresponding helper seam via
 * `this.getRunContext()`. Scheduled for removal in MemberJunction `v7.0`.
 *
 * @internal
 * @deprecated Scheduled for removal in v7.0 — migrate overrides and calls to the
 * corresponding `BaseAgent*Helper` seam via `@RegisterClass` or `Configuration.helperPlugins`.
 * @module @memberjunction/ai-agents
 */

import type {
    ActionChange,
    ActionChangeScope,
    AgentAction,
    AgentChatMessage,
    AgentChatMessageMetadata,
    AgentClientToolInvocation,
    AgentConfiguration,
    AgentPayloadChangeRequest,
    AgentTaintedSource,
    AgentToolCallRequest,
    AIPromptExecutionScope,
    BaseAgentNextStep,
    BoundActionParams,
    ClientToolMetadata,
    ExecuteAgentParams,
    ExecuteAgentResult,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
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
import type { ChatMessage } from '@memberjunction/ai';
import type { UserInfo } from '@memberjunction/core';
import type { MJActionParamEntity } from '@memberjunction/core-entities';
import type { ActiveRunTaint } from '../../ArtifactToolManager';
import type { BoundParamsApplication } from '../../bound-action-params';
import type { AgentToolResult } from '../../native-tools/agent-tools';
import type { NativeToolResult } from '../../native-tools/tool-result-turns';
import type { PromptComponentScope } from '../../prompt-component-resolver';
import type {
    ActionCircuitBreakerReason,
    ActionFailureClass,
    ActionResultCrushConfig,
    ActionResultSummary,
    CircuitBreakerActionResult,
    ExecuteSingleActionOptions,
    PromptWithholding,
    RunContextScope,
} from '../base-agent-types';
import type { BaseAgentActionPolicyHelper } from '../actions/BaseAgentActionPolicyHelper';
import type { BaseAgentActionsHelper } from '../actions/BaseAgentActionsHelper';
import { BaseAgentDeprecatedDelegatesMid } from './BaseAgentDeprecatedDelegatesMid';

/**
 * Logic-free compatibility base class extended by `BaseAgent` throughout `v6.x`.
 * Seams `s1`–`s4` live in {@link BaseAgentDeprecatedDelegatesCore};
 * seams `s5`–`s7` live in {@link BaseAgentDeprecatedDelegatesMid};
 * seam `s8` lives here so every compat file stays well below the `1,000`-line limit.
 */
export abstract class BaseAgentDeprecatedDelegatesActions extends BaseAgentDeprecatedDelegatesMid {
    /** Provides the resolved pluggable actions & client-tools helper (`BaseAgentActionsHelper`). */
    protected abstract getActionsHelper(): BaseAgentActionsHelper;

    /** Provides the resolved code-only action policy, taint, audience & scope helper (`BaseAgentActionPolicyHelper`). */
    protected abstract getActionPolicyHelper(): BaseAgentActionPolicyHelper;

    // =========================================================================
    // Seam S8a — Action Security Policy, Taint, Bindings, Audience & Run Scope (Code-Only D3)
    // =========================================================================

    /** @deprecated Use `BaseAgentActionPolicyHelper.ResolveActionTrustLevel` instead (slated for v7.0 removal). */
    protected resolveActionTrustLevel(
        actionName: string,
        actionEntity?: MJActionEntityExtended,
        params?: ExecuteAgentParams
    ): ActionOutputTrustLevel {
        return this.getActionPolicyHelper().ResolveActionTrustLevel(this.getRunContext(), actionName, actionEntity, params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.RecordTaintedSource` instead (slated for v7.0 removal). */
    protected recordTaintedSource(
        stepNumber: number,
        sourceName: string,
        trustLevel: AgentTaintedSource['trustLevel']
    ): void {
        this.getActionPolicyHelper().RecordTaintedSource(this.getRunContext(), stepNumber, sourceName, trustLevel);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.GetHighestRunTaint` instead (slated for v7.0 removal). */
    protected GetHighestRunTaint(): ActiveRunTaint | undefined {
        return this.getActionPolicyHelper().GetHighestRunTaint(this.getRunContext());
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.SeedTaintFromSecurityEnvelope` instead (slated for v7.0 removal). */
    protected seedTaintFromSecurityEnvelope(params: ExecuteAgentParams): void {
        this.getActionPolicyHelper().SeedTaintFromSecurityEnvelope(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.SeedTaintFromParentRun` instead (slated for v7.0 removal). */
    protected seedTaintFromParentRun(params: ExecuteAgentParams): void {
        this.getActionPolicyHelper().SeedTaintFromParentRun(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.AbsorbSubAgentTaint` instead (slated for v7.0 removal). */
    protected absorbSubAgentTaint(
        subAgentName: string,
        subAgentResult: Pick<ExecuteAgentResult, 'taintedSources'>,
        stepNumber: number
    ): void {
        this.getActionPolicyHelper().AbsorbSubAgentTaint(this.getRunContext(), subAgentName, subAgentResult, stepNumber);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.CheckTaintedEgress` instead (slated for v7.0 removal). */
    protected checkTaintedEgress(
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        contextUser?: UserInfo
    ): ActionResult | null {
        return this.getActionPolicyHelper().CheckTaintedEgress(this.getRunContext(), params, action, actionEntity, contextUser);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.ApplyActionBindings` instead (slated for v7.0 removal). */
    protected applyActionBindings(
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        options?: ExecuteSingleActionOptions
    ): BoundParamsApplication {
        return this.getActionPolicyHelper().ApplyActionBindings(this.getRunContext(), params, action, actionEntity, options);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.WhereInRun` instead (slated for v7.0 removal). */
    protected whereInRun(options?: ExecuteSingleActionOptions): string {
        return this.getActionPolicyHelper().WhereInRun(this.getRunContext(), options);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.ToActionParams` instead (slated for v7.0 removal). */
    protected toActionParams(
        application: Pick<BoundParamsApplication, 'Params' | 'Bound'>,
        actionEntity: MJActionEntityExtended
    ): ActionParam[] {
        return this.getActionPolicyHelper().ToActionParams(this.getRunContext(), application, actionEntity);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.RefuseBoundAction` instead (slated for v7.0 removal). */
    protected refuseBoundAction(
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        reason: string,
        options?: ExecuteSingleActionOptions
    ): ActionResult {
        return this.getActionPolicyHelper().RefuseBoundAction(this.getRunContext(), params, action, actionEntity, reason, options);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.BindsAnyAction` instead (slated for v7.0 removal). */
    protected bindsAnyAction(actions: readonly MJActionEntityExtended[], bound: BoundActionParams | undefined): boolean {
        return this.getActionPolicyHelper().BindsAnyAction(this.getRunContext(), actions, bound);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.HasBoundActionParams` instead (slated for v7.0 removal). */
    protected hasBoundActionParams(bound: BoundActionParams | undefined): boolean {
        return this.getActionPolicyHelper().HasBoundActionParams(this.getRunContext(), bound);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.BoundActionParamsError` instead (slated for v7.0 removal). */
    protected boundActionParamsError(params: ExecuteAgentParams): string | null {
        return this.getActionPolicyHelper().BoundActionParamsError(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.InheritBoundActionParams` instead (slated for v7.0 removal). */
    protected inheritBoundActionParams(params: ExecuteAgentParams): Promise<void> {
        return this.getActionPolicyHelper().InheritBoundActionParams(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.ShownActionParamEntries` instead (slated for v7.0 removal). */
    protected shownActionParamEntries(params: ExecuteAgentParams, aa: AgentAction): [string, unknown][] {
        return this.getActionPolicyHelper().ShownActionParamEntries(this.getRunContext(), params, aa);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.CheckUserActionPolicy` instead (slated for v7.0 removal). */
    protected checkUserActionPolicy(
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        contextUser?: UserInfo
    ): Promise<ActionResult | null> {
        return this.getActionPolicyHelper().CheckUserActionPolicy(this.getRunContext(), params, action, actionEntity, contextUser);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.CollectPolicyAgentChain` instead (slated for v7.0 removal). */
    protected collectPolicyAgentChain(params: ExecuteAgentParams): string[] {
        return this.getActionPolicyHelper().CollectPolicyAgentChain(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.RunPromptExecutionScope` instead (slated for v7.0 removal). */
    protected runPromptExecutionScope(params: ExecuteAgentParams): AIPromptExecutionScope {
        return this.getActionPolicyHelper().RunPromptExecutionScope(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.ActionMayUseRuntimeAPIKey` instead (slated for v7.0 removal). */
    protected actionMayUseRuntimeAPIKey(
        action: MJActionEntityExtended,
        driverClass: string,
        params: ExecuteAgentParams
    ): boolean {
        return this.getActionPolicyHelper().ActionMayUseRuntimeAPIKey(this.getRunContext(), action, driverClass, params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.BuildRuntimeAPIKeyResolver` instead (slated for v7.0 removal). */
    protected buildRuntimeAPIKeyResolver(
        params: ExecuteAgentParams,
        actionEntity: MJActionEntityExtended
    ): RuntimeAPIKeyResolver {
        return this.getActionPolicyHelper().BuildRuntimeAPIKeyResolver(this.getRunContext(), params, actionEntity);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.StampActionContext` instead (slated for v7.0 removal). */
    protected stampActionContext(params: ExecuteAgentParams): Record<string, unknown> {
        return this.getActionPolicyHelper().StampActionContext(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.RunBoundDispatchParams` instead (slated for v7.0 removal). */
    protected runBoundDispatchParams(
        params: ExecuteAgentParams,
        actionEntity: MJActionEntityExtended,
        audienceReaders: UserInfo[],
        runAs: UserInfo | undefined
    ): Pick<RunActionParams, 'RuntimeAPIKeyResolver' | 'CredentialScope' | 'Audience' | 'IsStructuralAudience' | 'RunScope'> {
        return this.getActionPolicyHelper().RunBoundDispatchParams(
            this.getRunContext(),
            params,
            actionEntity,
            audienceReaders,
            runAs
        );
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.AudienceReadersFor` instead (slated for v7.0 removal). */
    protected audienceReadersFor(params: ExecuteAgentParams): Promise<{ Readers: UserInfo[] } | { Error: string }> {
        return this.getActionPolicyHelper().AudienceReadersFor(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.ResolveRunAudience` instead (slated for v7.0 removal). */
    protected resolveRunAudience(params: ExecuteAgentParams): Promise<{ Readers: UserInfo[] } | { Error: string }> {
        return this.getActionPolicyHelper().ResolveRunAudience(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.ResolveAudienceUsers` instead (slated for v7.0 removal). */
    protected ResolveAudienceUsers(ids: string[], params: ExecuteAgentParams): Promise<UserInfo[]> {
        return this.getActionPolicyHelper().ResolveAudienceUsers(this.getRunContext(), ids, params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.RunAudienceAddsReader` instead (slated for v7.0 removal). */
    protected runAudienceAddsReader(params: ExecuteAgentParams): boolean {
        return this.getActionPolicyHelper().RunAudienceAddsReader(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.DispatchReaders` instead (slated for v7.0 removal). */
    protected dispatchReaders(
        params: ExecuteAgentParams,
        readers: UserInfo[],
        runAs: UserInfo | undefined
    ): UserInfo[] {
        return this.getActionPolicyHelper().DispatchReaders(this.getRunContext(), params, readers, runAs);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.CheckStructuralAudienceAction` instead (slated for v7.0 removal). */
    protected checkStructuralAudienceAction(
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        contextUser: UserInfo | undefined,
        skipBreaker: boolean
    ): ActionResult | null {
        return this.getActionPolicyHelper().CheckStructuralAudienceAction(
            this.getRunContext(),
            params,
            action,
            actionEntity,
            contextUser,
            skipBreaker
        );
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.ResolveActionSupportsAudience` instead (slated for v7.0 removal). */
    protected resolveActionSupportsAudience(actionEntity: MJActionEntityExtended): boolean {
        return this.getActionPolicyHelper().ResolveActionSupportsAudience(this.getRunContext(), actionEntity);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.SessionAudienceRefusal` instead (slated for v7.0 removal). */
    protected sessionAudienceRefusal(params: ExecuteAgentParams): string | null {
        return this.getActionPolicyHelper().SessionAudienceRefusal(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.TaskGraphConstraint` instead (slated for v7.0 removal). */
    protected taskGraphConstraint(params: ExecuteAgentParams): string | null {
        return this.getActionPolicyHelper().TaskGraphConstraint(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.TaskGraphWithholdingReason` instead (slated for v7.0 removal). */
    protected taskGraphWithholdingReason(params: ExecuteAgentParams): string | null {
        return this.getActionPolicyHelper().TaskGraphWithholdingReason(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.RunWithholdsTaskGraphs` instead (slated for v7.0 removal). */
    protected runWithholdsTaskGraphs(params: ExecuteAgentParams): boolean {
        return this.getActionPolicyHelper().RunWithholdsTaskGraphs(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.TaskGraphRefusal` instead (slated for v7.0 removal). */
    protected taskGraphRefusal(params: ExecuteAgentParams, previousDecision: BaseAgentNextStep): BaseAgentNextStep | null {
        return this.getActionPolicyHelper().TaskGraphRefusal(this.getRunContext(), params, previousDecision);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.RunWithholdsHandoff` instead (slated for v7.0 removal). */
    protected runWithholdsHandoff(params: ExecuteAgentParams): boolean {
        return this.getActionPolicyHelper().RunWithholdsHandoff(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.PromptWithholding` instead (slated for v7.0 removal). */
    protected promptWithholding(params: ExecuteAgentParams): PromptWithholding {
        return this.getActionPolicyHelper().PromptWithholding(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.CallerContextSections` instead (slated for v7.0 removal). */
    protected callerContextSections(
        agent: MJAIAgentEntityExtended,
        extraData: Record<string, unknown> | undefined,
        withhold: boolean
    ): { clientToolDetails: string; appContext: string } {
        return this.getActionPolicyHelper().CallerContextSections(this.getRunContext(), agent, extraData, withhold);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.ClientToolsRefusal` instead (slated for v7.0 removal). */
    protected clientToolsRefusal(params: ExecuteAgentParams, previousDecision: BaseAgentNextStep): BaseAgentNextStep | null {
        return this.getActionPolicyHelper().ClientToolsRefusal(this.getRunContext(), params, previousDecision);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.WithoutTaskGraphs` instead (slated for v7.0 removal). */
    protected withoutTaskGraphs(promptParams: Record<string, unknown>): Record<string, unknown> {
        return this.getActionPolicyHelper().WithoutTaskGraphs(this.getRunContext(), promptParams);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.WithoutHandoff` instead (slated for v7.0 removal). */
    protected withoutHandoff(promptParams: Record<string, unknown>): Record<string, unknown> {
        return this.getActionPolicyHelper().WithoutHandoff(this.getRunContext(), promptParams);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.RunScopeFor` instead (slated for v7.0 removal). */
    protected runScopeFor(params: ExecuteAgentParams): ActionRunScope {
        return this.getActionPolicyHelper().RunScopeFor(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.RunScopeInputs` instead (slated for v7.0 removal). */
    protected runScopeInputs(params: ExecuteAgentParams): {
        EntityName: string | undefined;
        RecordID: string | undefined;
        Secondary: Record<string, SecondaryScopeValue> | undefined;
    } {
        return this.getActionPolicyHelper().RunScopeInputs(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.ScopeDimensions` instead (slated for v7.0 removal). */
    protected scopeDimensions(
        value: unknown,
        agentName: string | undefined
    ): Record<string, SecondaryScopeValue> | undefined {
        return this.getActionPolicyHelper().ScopeDimensions(this.getRunContext(), value, agentName);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.RunScopeForContext` instead (slated for v7.0 removal). */
    protected runScopeForContext(params: ExecuteAgentParams): RunContextScope {
        return this.getActionPolicyHelper().RunScopeForContext(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.ScopedPromptConfigScope` instead (slated for v7.0 removal). */
    protected scopedPromptConfigScope(params: ExecuteAgentParams): PromptComponentScope {
        return this.getActionPolicyHelper().ScopedPromptConfigScope(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.ScopeText` instead (slated for v7.0 removal). */
    protected scopeText(value: unknown): string | undefined {
        return this.getActionPolicyHelper().ScopeText(this.getRunContext(), value);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.ValidatedRunScope` instead (slated for v7.0 removal). */
    protected validatedRunScope(params: ExecuteAgentParams): ActionRunScope {
        return this.getActionPolicyHelper().ValidatedRunScope(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.HostSearchScopeIDs` instead (slated for v7.0 removal). */
    protected hostSearchScopeIDs(params: ExecuteAgentParams): string[] | null {
        return this.getActionPolicyHelper().HostSearchScopeIDs(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.WriteRunScope` instead (slated for v7.0 removal). */
    protected writeRunScope(params: ExecuteAgentParams, scope: ActionRunScope): void {
        this.getActionPolicyHelper().WriteRunScope(this.getRunContext(), params, scope);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.ParseSecondaryScopeConfig` instead (slated for v7.0 removal). */
    protected parseSecondaryScopeConfig(agent: MJAIAgentEntityExtended): SecondaryScopeConfig | null {
        return this.getActionPolicyHelper().ParseSecondaryScopeConfig(this.getRunContext(), agent);
    }

    /** @deprecated Use `BaseAgentActionPolicyHelper.ValidateAndApplySecondaryScopes` instead (slated for v7.0 removal). */
    protected validateAndApplySecondaryScopes(
        secondary: Record<string, SecondaryScopeValue> | undefined,
        scopeConfig: SecondaryScopeConfig | null,
        agentName: string
    ): Record<string, SecondaryScopeValue> | undefined {
        return this.getActionPolicyHelper().ValidateAndApplySecondaryScopes(
            this.getRunContext(),
            secondary,
            scopeConfig,
            agentName
        );
    }

    // =========================================================================
    // Seam S8b — Actions, Circuit Breaker, Client Tools & Agent-Local Tools
    // =========================================================================

    /** @deprecated Use `BaseAgentActionsHelper.NormalizeActionParams` instead (slated for v7.0 removal). */
    protected normalizeActionParams(params: Record<string, unknown> | null | undefined): string {
        return this.getActionsHelper().NormalizeActionParams(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionsHelper.NormalizeActionParamEntry` instead (slated for v7.0 removal). */
    protected normalizeActionParamEntry(key: string, value: unknown): { key: string; value: unknown } | null {
        return this.getActionsHelper().NormalizeActionParamEntry(this.getRunContext(), key, value);
    }

    /** @deprecated Use `BaseAgentActionsHelper.NormalizeActionParamValue` instead (slated for v7.0 removal). */
    protected normalizeActionParamValue(value: unknown): unknown {
        return this.getActionsHelper().NormalizeActionParamValue(this.getRunContext(), value);
    }

    /** @deprecated Use `BaseAgentActionsHelper.IsFatalActionError` instead (slated for v7.0 removal). */
    protected isFatalActionError(message: string | null | undefined, actionParams?: Record<string, unknown> | null): boolean {
        return this.getActionsHelper().IsFatalActionError(this.getRunContext(), message, actionParams);
    }

    /** @deprecated Use `BaseAgentActionsHelper.HasCredentialShapedArguments` instead (slated for v7.0 removal). */
    protected hasCredentialShapedArguments(actionParams?: Record<string, unknown> | null): boolean {
        return this.getActionsHelper().HasCredentialShapedArguments(this.getRunContext(), actionParams);
    }

    /** @deprecated Use `BaseAgentActionsHelper.RecordActionFailure` instead (slated for v7.0 removal). */
    protected recordActionFailure(
        action: AgentAction,
        actionEntity: MJActionEntityExtended | undefined,
        message: string | null | undefined,
        normalizedParams: string
    ): void {
        this.getActionsHelper().RecordActionFailure(this.getRunContext(), action, actionEntity, message, normalizedParams);
    }

    /** @deprecated Use `BaseAgentActionsHelper.LockOutAction` instead (slated for v7.0 removal). */
    protected lockOutAction(
        action: AgentAction,
        actionEntity: MJActionEntityExtended | undefined,
        reason?: 'fatal' | 'audience' | 'tainted'
    ): void {
        this.getActionsHelper().LockOutAction(this.getRunContext(), action, actionEntity, reason);
    }

    /** @deprecated Use `BaseAgentActionsHelper.ResetActionCircuitBreaker` instead (slated for v7.0 removal). */
    protected resetActionCircuitBreaker(): void {
        this.getActionsHelper().ResetActionCircuitBreaker(this.getRunContext());
    }

    /** @deprecated Use `BaseAgentActionsHelper.LockedOutActionResult` instead (slated for v7.0 removal). */
    protected lockedOutActionResult(
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended
    ): CircuitBreakerActionResult | null {
        return this.getActionsHelper().LockedOutActionResult(this.getRunContext(), params, action, actionEntity);
    }

    /** @deprecated Use `BaseAgentActionsHelper.TaintLockoutText` instead (slated for v7.0 removal). */
    protected taintLockoutText(name: string): string {
        return this.getActionsHelper().TaintLockoutText(this.getRunContext(), name);
    }

    /** @deprecated Use `BaseAgentActionsHelper.ClearActionFailureRecord` instead (slated for v7.0 removal). */
    protected clearActionFailureRecord(action: AgentAction, actionEntity: MJActionEntityExtended | undefined): void {
        this.getActionsHelper().ClearActionFailureRecord(this.getRunContext(), action, actionEntity);
    }

    /** @deprecated Use `BaseAgentActionsHelper.CheckActionCircuitBreaker` instead (slated for v7.0 removal). */
    protected checkActionCircuitBreaker(
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        normalizedParams: string
    ): CircuitBreakerActionResult | null {
        return this.getActionsHelper().CheckActionCircuitBreaker(
            this.getRunContext(),
            params,
            action,
            actionEntity,
            normalizedParams
        );
    }

    /** @deprecated Use `BaseAgentActionsHelper.BuildBlockedActionResult` instead (slated for v7.0 removal). */
    protected buildBlockedActionResult(
        actionEntity: MJActionEntityExtended,
        reason: ActionCircuitBreakerReason,
        message: string
    ): CircuitBreakerActionResult {
        return this.getActionsHelper().BuildBlockedActionResult(this.getRunContext(), actionEntity, reason, message);
    }

    /** @deprecated Use `BaseAgentActionsHelper.ClassifyActionFailure` instead (slated for v7.0 removal). */
    protected classifyActionFailure(summary: ActionResultSummary): ActionFailureClass {
        return this.getActionsHelper().ClassifyActionFailure(this.getRunContext(), summary);
    }

    /** @deprecated Use `BaseAgentActionsHelper.FormatPolicyRefusalDirective` instead (slated for v7.0 removal). */
    protected formatPolicyRefusalDirective(summary: ActionResultSummary): string {
        return this.getActionsHelper().FormatPolicyRefusalDirective(this.getRunContext(), summary);
    }

    /** @deprecated Use `BaseAgentActionsHelper.FormatActionFailureDirective` instead (slated for v7.0 removal). */
    protected formatActionFailureDirective(summary: ActionResultSummary): string {
        return this.getActionsHelper().FormatActionFailureDirective(this.getRunContext(), summary);
    }

    /** @deprecated Use `BaseAgentActionsHelper.RecordDispatchOutcome` instead (slated for v7.0 removal). */
    protected recordDispatchOutcome(
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        result: ActionResult,
        normalizedParams: string,
        skipBreaker: boolean
    ): void {
        this.getActionsHelper().RecordDispatchOutcome(
            this.getRunContext(),
            params,
            action,
            actionEntity,
            result,
            normalizedParams,
            skipBreaker
        );
    }

    /** @deprecated Use `BaseAgentActionsHelper.ActionOptionsForAgentType` instead (slated for v7.0 removal). */
    protected actionOptionsForAgentType(): ExecuteSingleActionOptions | undefined {
        return this.getActionsHelper().ActionOptionsForAgentType(this.getRunContext());
    }

    /** @deprecated Use `BaseAgentActionsHelper.ValidateActionsNextStep` instead (slated for v7.0 removal). */
    protected validateActionsNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return this.getActionsHelper().ValidateActionsNextStep(
            this.getRunContext(),
            params,
            nextStep,
            currentPayload,
            agentRun,
            currentStep
        );
    }

    /** @deprecated Use `BaseAgentActionsHelper.ValidateActionInAgent` instead (slated for v7.0 removal). */
    protected validateActionInAgent(actionName: string, agentId?: string): string | null {
        return this.getActionsHelper().ValidateActionInAgent(this.getRunContext(), actionName, agentId);
    }

    /** @deprecated Use `BaseAgentActionsHelper.GetEffectiveActionsForValidation` instead (slated for v7.0 removal). */
    protected getEffectiveActionsForValidation(agentId: string): MJActionEntityExtended[] {
        return this.getActionsHelper().GetEffectiveActionsForValidation(this.getRunContext(), agentId);
    }

    /** @deprecated Use `BaseAgentActionsHelper.GetFlowStepActions` instead (slated for v7.0 removal). */
    protected getFlowStepActions(agentId: string): MJActionEntityExtended[] {
        return this.getActionsHelper().GetFlowStepActions(this.getRunContext(), agentId);
    }

    /** @deprecated Use `BaseAgentActionsHelper.GetAvailableActionsForAgent` instead (slated for v7.0 removal). */
    protected getAvailableActionsForAgent(agentId: string): MJActionEntityExtended[] {
        return this.getActionsHelper().GetAvailableActionsForAgent(this.getRunContext(), agentId);
    }

    /** @deprecated Use `BaseAgentActionsHelper.ResolveActionEntityForAgent` instead (slated for v7.0 removal). */
    protected resolveActionEntityForAgent(
        rawName: string | null | undefined,
        pool: readonly MJActionEntityExtended[],
        params?: ExecuteAgentParams,
        logMatches?: boolean
    ): MJActionEntityExtended | undefined {
        return this.getActionsHelper().ResolveActionEntityForAgent(this.getRunContext(), rawName, pool, params, logMatches);
    }

    /** @deprecated Use `BaseAgentActionsHelper.DoesChangeScopeApply` instead (slated for v7.0 removal). */
    protected doesChangeScopeApply(
        scope: ActionChangeScope,
        agentId: string,
        isRoot: boolean,
        agentIds?: string[]
    ): boolean {
        return this.getActionsHelper().DoesChangeScopeApply(this.getRunContext(), scope, agentId, isRoot, agentIds);
    }

    /** @deprecated Use `BaseAgentActionsHelper.ApplyActionChanges` instead (slated for v7.0 removal). */
    protected applyActionChanges(
        baseActions: MJActionEntityExtended[],
        actionChanges: ActionChange[],
        agentId: string,
        isRoot: boolean
    ): { actions: MJActionEntityExtended[]; dynamicLimits: Record<string, number> } {
        return this.getActionsHelper().ApplyActionChanges(this.getRunContext(), baseActions, actionChanges, agentId, isRoot);
    }

    /** @deprecated Use `BaseAgentActionsHelper.FilterActionChangesForSubAgent` instead (slated for v7.0 removal). */
    protected filterActionChangesForSubAgent(actionChanges: ActionChange[] | undefined): ActionChange[] | undefined {
        return this.getActionsHelper().FilterActionChangesForSubAgent(this.getRunContext(), actionChanges);
    }

    /** @deprecated Use `BaseAgentActionsHelper.BuildActionInvocationMessage` instead (slated for v7.0 removal). */
    protected buildActionInvocationMessage(actions: AgentAction[], params: ExecuteAgentParams): string {
        return this.getActionsHelper().BuildActionInvocationMessage(this.getRunContext(), actions, params);
    }

    /** @deprecated Use `BaseAgentActionsHelper.BuildActionResultsMessage` instead (slated for v7.0 removal). */
    protected buildActionResultsMessage(actionSummaries: ActionResultSummary[]): string {
        return this.getActionsHelper().BuildActionResultsMessage(this.getRunContext(), actionSummaries);
    }

    /** @deprecated Use `BaseAgentActionsHelper.FormatActionResultsAsMarkdown` instead (slated for v7.0 removal). */
    protected formatActionResultsAsMarkdown(actionSummaries: ActionResultSummary[]): string {
        return this.getActionsHelper().FormatActionResultsAsMarkdown(this.getRunContext(), actionSummaries);
    }

    /** @deprecated Use `BaseAgentActionsHelper.ResolveActionResultCrush` instead (slated for v7.0 removal). */
    protected resolveActionResultCrush(params: ExecuteAgentParams): ActionResultCrushConfig | undefined {
        return this.getActionsHelper().ResolveActionResultCrush(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionsHelper.FormatParamValueForMessage` instead (slated for v7.0 removal). */
    protected formatParamValueForMessage(value: unknown, maxLength?: number): string {
        return this.getActionsHelper().FormatParamValueForMessage(this.getRunContext(), value, maxLength);
    }

    /** @deprecated Use `BaseAgentActionsHelper.FormatActionDetails` instead (slated for v7.0 removal). */
    protected formatActionDetails(actions: MJActionEntityExtended[], boundActionParams?: BoundActionParams): string {
        return this.getActionsHelper().FormatActionDetails(this.getRunContext(), actions, boundActionParams);
    }

    /** @deprecated Use `BaseAgentActionsHelper.ResolveClientToolsForRun` instead (slated for v7.0 removal). */
    protected resolveClientToolsForRun(
        agent: MJAIAgentEntityExtended,
        data: Record<string, unknown> | undefined
    ): ClientToolMetadata[] {
        return this.getActionsHelper().ResolveClientToolsForRun(this.getRunContext(), agent, data);
    }

    /** @deprecated Use `BaseAgentActionsHelper.BuildClientToolPromptSection` instead (slated for v7.0 removal). */
    protected buildClientToolPromptSection(
        agent: MJAIAgentEntityExtended,
        extraData?: Record<string, unknown>
    ): string {
        return this.getActionsHelper().BuildClientToolPromptSection(this.getRunContext(), agent, extraData);
    }

    /** @deprecated Use `BaseAgentActionsHelper.FormatActionParameter` instead (slated for v7.0 removal). */
    protected formatActionParameter(param: MJActionParamEntity): string {
        return this.getActionsHelper().FormatActionParameter(this.getRunContext(), param);
    }

    /** @deprecated Use `BaseAgentActionsHelper.PayloadToolResult` instead (slated for v7.0 removal). */
    protected payloadToolResult(previousDecision: BaseAgentNextStep | undefined): NativeToolResult[] {
        return this.getActionsHelper().PayloadToolResult(this.getRunContext(), previousDecision);
    }

    /** @deprecated Use `BaseAgentActionsHelper.AppendActionResults` instead (slated for v7.0 removal). */
    protected appendActionResults(
        params: ExecuteAgentParams,
        summaries: ActionResultSummary[],
        resultsMessage: string,
        metadata: AgentChatMessageMetadata | undefined,
        previousDecision: BaseAgentNextStep,
        failureGuidance?: ReadonlyMap<ActionResultSummary, string>
    ): ReadonlySet<ActionResultSummary> {
        return this.getActionsHelper().AppendActionResults(
            this.getRunContext(),
            params,
            summaries,
            resultsMessage,
            metadata,
            previousDecision,
            failureGuidance
        );
    }

    /** @deprecated Use `BaseAgentActionsHelper.ReconcileUnansweredToolCalls` instead (slated for v7.0 removal). */
    protected reconcileUnansweredToolCalls(params: ExecuteAgentParams): void {
        this.getActionsHelper().ReconcileUnansweredToolCalls(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentActionsHelper.PushToolResultTurn` instead (slated for v7.0 removal). */
    protected PushToolResultTurn(params: ExecuteAgentParams, results: AgentChatMessage): void {
        this.getActionsHelper().PushToolResultTurn(this.getRunContext(), params, results);
    }

    /** @deprecated Use `BaseAgentActionsHelper.InsertToolResultsAfterCallTurn` instead (slated for v7.0 removal). */
    protected insertToolResultsAfterCallTurn(
        messages: ChatMessage[],
        callTurnIndex: number,
        results: AgentChatMessage
    ): void {
        this.getActionsHelper().InsertToolResultsAfterCallTurn(this.getRunContext(), messages, callTurnIndex, results);
    }

    /** @deprecated Use `BaseAgentActionsHelper.StubToolTurn` instead (slated for v7.0 removal). */
    protected stubToolTurn(message: AgentChatMessage, note: string): AgentChatMessage {
        return this.getActionsHelper().StubToolTurn(this.getRunContext(), message, note);
    }

    /** @deprecated Use `BaseAgentActionsHelper.ExecuteActionsStep` instead (slated for v7.0 removal). */
    protected executeActionsStep(
        params: ExecuteAgentParams,
        previousDecision: BaseAgentNextStep,
        parentStepId: string,
        addConversationMessage?: boolean,
        stepCount?: number,
        actionOptions?: ExecuteSingleActionOptions
    ): Promise<BaseAgentNextStep> {
        return this.getActionsHelper().ExecuteActionsStep(
            this.getRunContext(),
            params,
            previousDecision,
            parentStepId,
            addConversationMessage,
            stepCount,
            actionOptions
        );
    }

    /** @deprecated Use `BaseAgentActionsHelper.DescribeClientToolInvocations` instead (slated for v7.0 removal). */
    protected describeClientToolInvocations(clientTools: AgentClientToolInvocation[]): string {
        return this.getActionsHelper().DescribeClientToolInvocations(this.getRunContext(), clientTools);
    }

    /** @deprecated Use `BaseAgentActionsHelper.ExecuteClientToolsStep` instead (slated for v7.0 removal). */
    protected executeClientToolsStep(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep,
        stepCount?: number
    ): Promise<BaseAgentNextStep> {
        return this.getActionsHelper().ExecuteClientToolsStep(
            this.getRunContext(),
            params,
            config,
            previousDecision,
            stepCount
        );
    }

    /** @deprecated Use `BaseAgentActionsHelper.ExecuteAgentToolCallsAsSteps` instead (slated for v7.0 removal). */
    protected ExecuteAgentToolCallsAsSteps<P>(
        calls: AgentToolCallRequest[],
        payload: P,
        params: ExecuteAgentParams
    ): Promise<{ payload: P; results: NativeToolResult[] }> {
        return this.getActionsHelper().ExecuteAgentToolCallsAsSteps(this.getRunContext(), calls, payload, params);
    }

    /** @deprecated Use `BaseAgentActionsHelper.ExecuteAgentToolCallAsStep` instead (slated for v7.0 removal). */
    protected executeAgentToolCallAsStep<P>(
        call: AgentToolCallRequest,
        payload: P,
        params: ExecuteAgentParams
    ): Promise<{ payload: P; result: NativeToolResult }> {
        return this.getActionsHelper().ExecuteAgentToolCallAsStep(this.getRunContext(), call, payload, params);
    }

    /** @deprecated Use `BaseAgentActionsHelper.RunAndApplyAgentTool` instead (slated for v7.0 removal). */
    protected runAndApplyAgentTool<P>(
        call: AgentToolCallRequest,
        payload: P,
        params: ExecuteAgentParams
    ): Promise<{ payload: P; content: string; isError: boolean }> {
        return this.getActionsHelper().RunAndApplyAgentTool(this.getRunContext(), call, payload, params);
    }

    /** @deprecated Use `BaseAgentActionsHelper.AgentToolBreakerKey` instead (slated for v7.0 removal). */
    protected agentToolBreakerKey(call: AgentToolCallRequest): string | null {
        return this.getActionsHelper().AgentToolBreakerKey(this.getRunContext(), call);
    }

    /** @deprecated Use `BaseAgentActionsHelper.RecordAgentToolOutcome` instead (slated for v7.0 removal). */
    protected recordAgentToolOutcome(toolName: string, breakerKey: string | null, isError: boolean): void {
        this.getActionsHelper().RecordAgentToolOutcome(this.getRunContext(), toolName, breakerKey, isError);
    }

    /** @deprecated Use `BaseAgentActionsHelper.RunAgentTool` instead (slated for v7.0 removal). */
    protected runAgentTool<P>(
        call: AgentToolCallRequest,
        payload: P,
        params: ExecuteAgentParams
    ): Promise<AgentToolResult<P>> {
        return this.getActionsHelper().RunAgentTool(this.getRunContext(), call, payload, params);
    }

    /** @deprecated Use `BaseAgentActionsHelper.ApplyAgentToolPayloadChange` instead (slated for v7.0 removal). */
    protected applyAgentToolPayloadChange<P>(
        payload: P,
        change: AgentPayloadChangeRequest<P>,
        params: ExecuteAgentParams,
        partial?: boolean
    ): { payload: P; error?: string } {
        return this.getActionsHelper().ApplyAgentToolPayloadChange(this.getRunContext(), payload, change, params, partial);
    }

    /** @deprecated Use `BaseAgentActionsHelper.AppendAgentToolResults` instead (slated for v7.0 removal). */
    protected appendAgentToolResults(params: ExecuteAgentParams, step: BaseAgentNextStep): void {
        this.getActionsHelper().AppendAgentToolResults(this.getRunContext(), params, step);
    }
}
