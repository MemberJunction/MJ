/**
 * @fileoverview Default pluggable implementation of {@link BaseAgentActionsHelper}.
 *
 * Implements parameter normalization, the run-scoped action circuit breaker, failure
 * classification & directives, action catalog resolution & runtime changes, formatting,
 * native tool-result turn management, and delegates action/client-tool/agent-tool execution
 * to {@link AgentActionExecutionHelper}.
 *
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
    AgentToolCallRequest,
    BaseAgentNextStep,
    BoundActionParams,
    ClientToolMetadata,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { ActionResult, MJActionEntityExtended } from '@memberjunction/actions-base';
import { ActionEngineServer } from '@memberjunction/actions';
import type { ChatMessage } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { LogStatus, type UserInfo } from '@memberjunction/core';
import type { MJActionParamEntity } from '@memberjunction/core-entities';
import { IndexByUUID, RegisterClass, UUIDSet } from '@memberjunction/global';
import { ActionLifecycleResolver } from '../../ActionLifecycleResolver';
import { SanitizeToolName } from '../../native-tools/action-tool-builder';
import type { AgentToolResult } from '../../native-tools/agent-tools';
import { BuildToolResultTurn, CompactToolResultContent, type NativeToolResult } from '../../native-tools/tool-result-turns';
import { DEFAULT_AGENT_HELPER_KEY } from '../AgentHelperResolver';
import type { AgentRunContext } from '../AgentRunContext';
import type {
    ActionCircuitBreakerReason,
    ActionFailureClass,
    ActionResultCrushConfig,
    ActionResultSummary,
    CircuitBreakerActionResult,
    ExecuteSingleActionOptions,
} from '../base-agent-types';
import { AgentActionCircuitBreakerHelper } from './AgentActionCircuitBreakerHelper';
import { AgentActionExecutionHelper } from './AgentActionExecutionHelper';
import { BaseAgentActionsHelper } from './BaseAgentActionsHelper';

/**
 * Default pluggable actions helper registered under `'Default'`.
 */
@RegisterClass(BaseAgentActionsHelper, DEFAULT_AGENT_HELPER_KEY)
export class AgentActionsHelper extends BaseAgentActionsHelper {
    private readonly _circuitBreaker = new AgentActionCircuitBreakerHelper();
    private readonly _executor = new AgentActionExecutionHelper();

    // -------------------------------------------------------------------------
    // Parameter Normalization & Run-Scoped Action Circuit Breaker (Delegated)
    // -------------------------------------------------------------------------

    public override NormalizeActionParams(ctx: AgentRunContext, params: Record<string, unknown> | null | undefined): string {
        return this._circuitBreaker.NormalizeActionParams(ctx, params);
    }

    public override NormalizeActionParamEntry(
        ctx: AgentRunContext,
        key: string,
        value: unknown
    ): { key: string; value: unknown } | null {
        return this._circuitBreaker.NormalizeActionParamEntry(ctx, key, value);
    }

    public override NormalizeActionParamValue(ctx: AgentRunContext, value: unknown): unknown {
        return this._circuitBreaker.NormalizeActionParamValue(ctx, value);
    }

    public override IsFatalActionError(
        ctx: AgentRunContext,
        message: string | null | undefined,
        actionParams?: Record<string, unknown> | null
    ): boolean {
        return this._circuitBreaker.IsFatalActionError(ctx, message, actionParams);
    }

    public override HasCredentialShapedArguments(
        _ctx: AgentRunContext,
        actionParams?: Record<string, unknown> | null
    ): boolean {
        return this._circuitBreaker.HasCredentialShapedArguments(actionParams);
    }

    public override RecordActionFailure(
        ctx: AgentRunContext,
        action: AgentAction,
        actionEntity: MJActionEntityExtended | undefined,
        message: string | null | undefined,
        normalizedParams: string
    ): void {
        this._circuitBreaker.RecordActionFailure(ctx, action, actionEntity, message, normalizedParams);
    }

    public override LockOutAction(
        ctx: AgentRunContext,
        action: AgentAction,
        actionEntity: MJActionEntityExtended | undefined,
        reason?: 'fatal' | 'audience' | 'tainted'
    ): void {
        this._circuitBreaker.LockOutAction(ctx, action, actionEntity, reason);
    }

    public override ResetActionCircuitBreaker(ctx: AgentRunContext): void {
        this._circuitBreaker.ResetActionCircuitBreaker(ctx);
    }

    public override LockedOutActionResult(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended
    ): CircuitBreakerActionResult | null {
        return this._circuitBreaker.LockedOutActionResult(ctx, params, action, actionEntity);
    }

    public override TaintLockoutText(_ctx: AgentRunContext, name: string): string {
        return this._circuitBreaker.TaintLockoutText(name);
    }

    public override ClearActionFailureRecord(
        ctx: AgentRunContext,
        action: AgentAction,
        actionEntity: MJActionEntityExtended | undefined
    ): void {
        this._circuitBreaker.ClearActionFailureRecord(ctx, action, actionEntity);
    }

    public override CheckActionCircuitBreaker(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        normalizedParams: string
    ): CircuitBreakerActionResult | null {
        return this._circuitBreaker.CheckActionCircuitBreaker(ctx, params, action, actionEntity, normalizedParams);
    }

    public override BuildBlockedActionResult(
        _ctx: AgentRunContext,
        actionEntity: MJActionEntityExtended,
        reason: ActionCircuitBreakerReason,
        message: string
    ): CircuitBreakerActionResult {
        return this._circuitBreaker.BuildBlockedActionResult(actionEntity, reason, message);
    }

    public override ClassifyActionFailure(ctx: AgentRunContext, summary: ActionResultSummary): ActionFailureClass {
        return this._circuitBreaker.ClassifyActionFailure(ctx, summary);
    }

    public override FormatPolicyRefusalDirective(_ctx: AgentRunContext, summary: ActionResultSummary): string {
        return this._circuitBreaker.FormatPolicyRefusalDirective(summary);
    }

    public override FormatActionFailureDirective(ctx: AgentRunContext, summary: ActionResultSummary): string {
        return this._circuitBreaker.FormatActionFailureDirective(ctx, summary);
    }

    public override RecordDispatchOutcome(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        result: ActionResult,
        normalizedParams: string,
        skipBreaker: boolean
    ): void {
        this._circuitBreaker.RecordDispatchOutcome(ctx, params, action, actionEntity, result, normalizedParams, skipBreaker);
    }

    public override ActionOptionsForAgentType(ctx: AgentRunContext): ExecuteSingleActionOptions | undefined {
        return this._circuitBreaker.ActionOptionsForAgentType(ctx);
    }

    // -------------------------------------------------------------------------
    // Action Catalog Resolution, Validation & Runtime Changes
    // -------------------------------------------------------------------------

    public override async ValidateActionsNextStep<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        _currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        _currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        const effectiveActions = ctx.Hooks.GetEffectiveActionsForValidation(params.agent.ID);

        const resolvedByAction = new Map<AgentAction, MJActionEntityExtended>();
        const missingActions = nextStep.actions?.filter((action) => {
            if (!action || typeof action.name !== 'string' || action.name.trim().length === 0) {
                return true;
            }
            const matched = ctx.Hooks.ResolveActionEntityForAgent(action.name, effectiveActions, params, true);
            if (matched) {
                resolvedByAction.set(action, matched);
                return false;
            }
            return true;
        });

        if (missingActions && missingActions.length > 0) {
            const missingActionNames = missingActions
                .map((a) => (a && typeof a.name === 'string' && a.name.trim().length > 0 ? a.name.trim() : '<missing action name>'))
                .join(', ');
            const availableActionNames = effectiveActions.map((a) => a.Name).join(', ');
            ctx.Hooks.LogError(
                `Actions '${missingActionNames}' not found or not active for agent '${params.agent.Name}'. Available actions: ${availableActionNames}`,
                {
                    agent: params.agent,
                    category: 'ActionExecution',
                }
            );
            if (nextStep.step !== 'Retry') {
                ctx.GeneralValidationRetryCount++;
            }
            return {
                step: 'Retry',
                terminate: false,
                errorMessage: `Actions '${missingActionNames}' not found or not active. Available: ${availableActionNames}`,
            };
        }

        if (nextStep.actions) {
            const violatedActions: string[] = [];
            const agentActionsByActionId = ctx.Hooks.IndexEffectiveAgentActions(params.agent.ID);

            for (const action of nextStep.actions) {
                const normalizedActionName = typeof action?.name === 'string' ? action.name.trim().toLowerCase() : '';
                const actionEntity =
                    resolvedByAction.get(action) ??
                    (normalizedActionName
                        ? effectiveActions.find(
                              (a) => typeof a.Name === 'string' && a.Name.trim().toLowerCase() === normalizedActionName
                          )
                        : undefined);

                if (!actionEntity) continue;

                const maxExecutions = ActionLifecycleResolver.ResolveMaxExecutionsPerRun(
                    actionEntity,
                    params.agent.ID,
                    ctx.DynamicActionLimits,
                    agentActionsByActionId
                );

                if (maxExecutions != null) {
                    const executionCount = await ctx.Hooks.GetActionExecutionCount(agentRun.ID, actionEntity.ID);
                    if (executionCount >= maxExecutions) {
                        violatedActions.push(`${action.name} (limit: ${maxExecutions}, current: ${executionCount})`);
                    }
                }
            }

            if (violatedActions.length > 0) {
                const violationMessage = `Actions have reached execution limits: ${violatedActions.join(', ')}`;
                ctx.Hooks.LogError(violationMessage, {
                    agent: params.agent,
                    category: 'ActionExecution',
                    metadata: { violatedActions },
                });
                if (nextStep.step !== 'Retry') {
                    ctx.GeneralValidationRetryCount++;
                }
                return {
                    step: 'Retry',
                    terminate: false,
                    errorMessage: violationMessage,
                };
            }
        }

        return nextStep;
    }

    public override ValidateActionInAgent(
        ctx: AgentRunContext,
        actionName: string,
        agentId: string = ctx.AgentRun?.AgentID ?? ''
    ): string | null {
        const effectiveActions = ctx.Hooks.GetAvailableActionsForAgent(agentId);
        const normalizedName = actionName.trim().toLowerCase();

        const exactMatch = effectiveActions.find((a) => a.Name.trim().toLowerCase() === normalizedName);
        if (exactMatch) {
            return null;
        }

        const sanitizedMatch = ctx.Hooks.MatchNamedBySanitizedToolName(actionName, effectiveActions);
        if (sanitizedMatch.match) {
            return null;
        }
        if (sanitizedMatch.ambiguous) {
            return `Ambiguous action '${actionName}' specified. Matches: ${sanitizedMatch.ambiguous.map((a) => a.Name).join(', ')}`;
        }

        const partialMatches = effectiveActions.filter((a) => a.Name.trim().toLowerCase().includes(normalizedName));

        if (partialMatches.length === 1) {
            return null;
        } else if (partialMatches.length > 1) {
            return `Ambiguous action '${actionName}' specified. Matches: ${partialMatches.map((a) => a.Name).join(', ')}`;
        } else {
            return `No action '${actionName}' found. Available: ${effectiveActions.map((a) => a.Name).join(', ')}`;
        }
    }

    public override GetEffectiveActionsForValidation(ctx: AgentRunContext, agentId: string): MJActionEntityExtended[] {
        if (ctx.EffectiveCatalogComputed || ctx.EffectiveActions.length > 0) {
            return ctx.EffectiveActions;
        }
        const agentActions = ctx.Hooks.GetEffectiveAgentActions(agentId);
        const allowedActionIds = new UUIDSet(agentActions.map((aa) => aa.ActionID));
        return ActionEngineServer.Instance.Actions.filter((a) => allowedActionIds.Has(a.ID) && a.Status === 'Active');
    }

    public override GetFlowStepActions(_ctx: AgentRunContext, agentId: string): MJActionEntityExtended[] {
        const allActions = ActionEngineServer.Instance?.Actions;
        if (!Array.isArray(allActions) || allActions.length === 0 || !agentId) {
            return [];
        }
        const agentSteps = AIEngine.Instance.GetAgentSteps?.(agentId) || [];
        if (agentSteps.length === 0) {
            return [];
        }
        const stepActionIds = new UUIDSet(
            agentSteps.map((s) => s.ActionID).filter((id): id is string => typeof id === 'string' && id.length > 0)
        );
        const stepActionNamesLower = new Set<string>();
        const stepActionNamesSanitized = new Set<string>();
        for (const s of agentSteps) {
            if (!s.Configuration) continue;
            try {
                const cfg = JSON.parse(s.Configuration) as { steps?: Array<{ name?: string }> };
                if (Array.isArray(cfg?.steps)) {
                    for (const bodyStep of cfg.steps) {
                        const raw = bodyStep?.name?.trim();
                        if (raw) {
                            stepActionNamesLower.add(raw.toLowerCase());
                            const san = SanitizeToolName(raw);
                            if (san) stepActionNamesSanitized.add(san);
                        }
                    }
                }
            } catch {
                // Malformed step configuration JSON is reported by FlowAgentType when that step runs.
            }
        }
        return allActions.filter(
            (a) =>
                a.Status !== 'Disabled' &&
                (stepActionIds.Has(a.ID) ||
                    stepActionNamesLower.has(a.Name.trim().toLowerCase()) ||
                    stepActionNamesSanitized.has(SanitizeToolName(a.Name)))
        );
    }

    public override GetAvailableActionsForAgent(ctx: AgentRunContext, agentId: string): MJActionEntityExtended[] {
        const effective = ctx.Hooks.GetEffectiveActionsForValidation(agentId);
        const flowActions = this.GetFlowStepActions(ctx, agentId);
        if (flowActions.length === 0) {
            return effective;
        }
        const seen = new UUIDSet(effective.map((a) => a.ID));
        const combined = [...effective];
        for (const fa of flowActions) {
            if (!seen.Has(fa.ID)) {
                seen.Add(fa.ID);
                combined.push(fa);
            }
        }
        return combined;
    }

    public override ResolveActionEntityForAgent(
        ctx: AgentRunContext,
        rawName: string | null | undefined,
        pool: readonly MJActionEntityExtended[],
        params?: ExecuteAgentParams,
        logMatches = false
    ): MJActionEntityExtended | undefined {
        const normalizedName = typeof rawName === 'string' ? rawName.trim() : '';
        const trimmedLower = normalizedName.toLowerCase();
        if (!trimmedLower) {
            return undefined;
        }
        const exact = pool.find((a) => typeof a.Name === 'string' && a.Name.trim().toLowerCase() === trimmedLower);
        if (exact) {
            return exact;
        }
        const sanitizedMatch = ctx.Hooks.MatchNamedBySanitizedToolName(normalizedName, pool);
        if (sanitizedMatch.match) {
            if (logMatches && params) {
                ctx.Hooks.LogStatus(`Action native tool name matched: '${normalizedName}' → '${sanitizedMatch.match.Name}'`, true, params);
            }
            return sanitizedMatch.match;
        }
        if (sanitizedMatch.ambiguous) {
            if (logMatches && params) {
                ctx.Hooks.LogStatus(
                    `Ambiguous action tool name '${normalizedName}' matches ${sanitizedMatch.ambiguous.length} actions: ${sanitizedMatch.ambiguous.map((a) => a.Name).join(', ')}`,
                    true,
                    params
                );
            }
            return undefined;
        }
        const containsMatches = pool.filter(
            (a) => typeof a.Name === 'string' && a.Name.trim().toLowerCase().includes(trimmedLower)
        );
        if (containsMatches.length === 1) {
            if (logMatches && params) {
                ctx.Hooks.LogStatus(`Action name fuzzy matched: '${normalizedName}' → '${containsMatches[0].Name}'`, true, params);
            }
            return containsMatches[0];
        }
        if (containsMatches.length > 1 && logMatches && params) {
            ctx.Hooks.LogStatus(
                `Ambiguous action name '${normalizedName}' matches ${containsMatches.length} actions: ${containsMatches.map((a) => a.Name).join(', ')}`,
                true,
                params
            );
        }
        return undefined;
    }

    public override DoesChangeScopeApply(
        _ctx: AgentRunContext,
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

    public override ApplyActionChanges(
        ctx: AgentRunContext,
        baseActions: MJActionEntityExtended[],
        actionChanges: ActionChange[],
        agentId: string,
        isRoot: boolean
    ): { actions: MJActionEntityExtended[]; dynamicLimits: Record<string, number> } {
        let actions = [...baseActions];
        const presentActionIds = new UUIDSet(actions.map((a) => a.ID));
        const allActionsById = IndexByUUID(ActionEngineServer.Instance.Actions, (a) => a.ID);
        const dynamicLimits: Record<string, number> = {};

        for (const change of actionChanges) {
            if (!ctx.Hooks.DoesChangeScopeApply(change.scope, agentId, isRoot, change.agentIds)) {
                continue;
            }
            if (change.mode === 'add') {
                for (const actionId of change.actionIds) {
                    if (!presentActionIds.Has(actionId)) {
                        const actionToAdd = allActionsById.Get(actionId);
                        if (actionToAdd) {
                            actions.push(actionToAdd);
                            presentActionIds.Add(actionToAdd.ID);
                            if (change.actionLimits?.[actionId] != null) {
                                dynamicLimits[actionId] = change.actionLimits[actionId];
                            }
                        } else {
                            LogStatus(`Action with ID '${actionId}' not found in ActionEngineServer - skipping add`);
                        }
                    }
                }
            } else if (change.mode === 'remove') {
                const removeIds = new UUIDSet(change.actionIds);
                actions = actions.filter((a) => !removeIds.Has(a.ID));
                for (const id of change.actionIds) {
                    presentActionIds.Delete(id);
                }
            }
        }

        return { actions, dynamicLimits };
    }

    public override FilterActionChangesForSubAgent(
        _ctx: AgentRunContext,
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

    // -------------------------------------------------------------------------
    // Formatting & Native Tool-Result Turn Management
    // -------------------------------------------------------------------------

    public override BuildActionInvocationMessage(
        ctx: AgentRunContext,
        actions: AgentAction[],
        params: ExecuteAgentParams
    ): string {
        return ctx.StepDispatcher.BuildActionInvocationMessage(actions, (aa) =>
            ctx.ActionPolicyHelper.ShownActionParamEntries(ctx, params, aa)
        );
    }

    public override BuildActionResultsMessage(ctx: AgentRunContext, actionSummaries: ActionResultSummary[]): string {
        const failed = actionSummaries.filter((a) => !a.success).length;
        const header = failed > 0 ? `${failed} of ${actionSummaries.length} action(s) failed:` : 'Action results:';
        return `${header}\n${ctx.Hooks.FormatActionResultsAsMarkdown(actionSummaries)}`;
    }

    public override FormatActionResultsAsMarkdown(ctx: AgentRunContext, actionSummaries: ActionResultSummary[]): string {
        return ctx.StepDispatcher.FormatActionResultsAsMarkdown(actionSummaries, ctx.ActionResultCrush);
    }

    public override ResolveActionResultCrush(
        ctx: AgentRunContext,
        params: ExecuteAgentParams
    ): ActionResultCrushConfig | undefined {
        return ctx.StepDispatcher.ResolveActionResultCrush(
            params,
            ctx.AgentTypePromptParams,
            ctx.ActionResultCrushThreshold
        );
    }

    public override FormatParamValueForMessage(ctx: AgentRunContext, value: unknown, maxLength: number = 100): string {
        return ctx.StepDispatcher.FormatParamValueForMessage(value, maxLength);
    }

    public override FormatActionDetails(
        ctx: AgentRunContext,
        actions: MJActionEntityExtended[],
        boundActionParams?: BoundActionParams
    ): string {
        return ctx.ContextAssembler.FormatActionDetails(actions, boundActionParams);
    }

    public override ResolveClientToolsForRun(
        ctx: AgentRunContext,
        agent: MJAIAgentEntityExtended,
        data: Record<string, unknown> | undefined
    ): ClientToolMetadata[] {
        return ctx.ContextAssembler.ResolveClientToolsForRun(agent, data);
    }

    public override BuildClientToolPromptSection(
        ctx: AgentRunContext,
        agent: MJAIAgentEntityExtended,
        extraData?: Record<string, unknown>
    ): string {
        return ctx.ContextAssembler.BuildClientToolPromptSection(agent, extraData);
    }

    public override FormatActionParameter(ctx: AgentRunContext, param: MJActionParamEntity): string {
        return ctx.ContextAssembler.FormatActionParameter(param);
    }

    public override PayloadToolResult(
        _ctx: AgentRunContext,
        previousDecision: BaseAgentNextStep | undefined
    ): NativeToolResult[] {
        if (!previousDecision?.payloadToolCallId) {
            return [];
        }
        return [
            {
                toolCallId: previousDecision.payloadToolCallId,
                toolName: 'payload_change_request',
                content: 'Payload change applied.',
                isError: false,
            },
        ];
    }

    public override AppendActionResults(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        summaries: ActionResultSummary[],
        resultsMessage: string,
        metadata: AgentChatMessageMetadata | undefined,
        previousDecision: BaseAgentNextStep,
        failureGuidance?: ReadonlyMap<ActionResultSummary, string>
    ): ReadonlySet<ActionResultSummary> {
        const answered = new Set<ActionResultSummary>();
        if (!previousDecision.nativeTurn?.sendResultsNatively) {
            params.conversationMessages.push({ role: 'user', content: resultsMessage, metadata } as AgentChatMessage);
            return answered;
        }
        const unpaired = [...(previousDecision.actions ?? [])];
        const results: NativeToolResult[] = [...this.PayloadToolResult(ctx, previousDecision)];
        const orphans: ActionResultSummary[] = [];
        for (const summary of summaries) {
            const at = unpaired.findIndex((a) => a.name === summary.actionName && !!a.toolCallId);
            const action = at >= 0 ? unpaired.splice(at, 1)[0] : undefined;
            if (!action?.toolCallId) {
                orphans.push(summary);
                continue;
            }
            const guidance = failureGuidance?.get(summary);
            results.push({
                toolCallId: action.toolCallId,
                toolName: SanitizeToolName(summary.actionName),
                content: ctx.Hooks.FormatActionResultsAsMarkdown([summary]) + (guidance ? `\n\n${guidance}` : ''),
                isError: !summary.success,
            });
            answered.add(summary);
        }
        if (results.length > 0) {
            ctx.Hooks.PushToolResultTurn(params, BuildToolResultTurn(results, metadata) as AgentChatMessage);
        }
        if (orphans.length > 0) {
            const orphanMetadata = results.length > 0 && metadata ? { ...metadata } : metadata;
            params.conversationMessages.push({
                role: 'user',
                content: `Action results:\n${ctx.Hooks.FormatActionResultsAsMarkdown(orphans)}`,
                metadata: orphanMetadata,
            } as AgentChatMessage);
        }
        return answered;
    }

    public override ReconcileUnansweredToolCalls(ctx: AgentRunContext, params: ExecuteAgentParams): void {
        const messages = params.conversationMessages;
        if (!messages?.length) {
            return;
        }
        const at = this.LastToolCallTurnIndex(messages);
        if (at < 0) {
            return;
        }
        const answered = this.ToolCallIdsAnsweredAfter(messages, at);
        const unanswered = ((messages[at] as AgentChatMessage).toolCalls ?? []).filter(
            (call) => !!call.id && !answered.has(call.id)
        );
        if (unanswered.length === 0) {
            return;
        }
        const synthetic = BuildToolResultTurn(
            unanswered.map((call) => ({
                toolCallId: call.id,
                toolName: call.name,
                content: 'Not executed — the agent did not run this call on this turn. See the message that follows.',
                isError: true,
            })),
            { turnAdded: ctx.PromptTurnCount, messageType: 'action-result' }
        ) as AgentChatMessage;
        this.InsertToolResultsAfterCallTurn(ctx, messages, at, synthetic);
    }

    public override PushToolResultTurn(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        results: AgentChatMessage
    ): void {
        const messages = params.conversationMessages;
        const at = this.LastToolCallTurnIndex(messages);
        if (at >= 0 && at === messages.length - 2 && messages[at + 1].role === 'tool') {
            this.InsertToolResultsAfterCallTurn(ctx, messages, at, results);
            return;
        }
        messages.push(results);
    }

    public override LastToolCallTurnIndex(messages: ChatMessage[]): number {
        for (let i = messages.length - 1; i >= 0; i--) {
            const candidate = messages[i] as AgentChatMessage;
            if (candidate.role === 'assistant' && candidate.toolCalls?.length) {
                return i;
            }
        }
        return -1;
    }

    public override ToolCallIdsAnsweredAfter(messages: ChatMessage[], callTurnIndex: number): Set<string> {
        const answered = new Set<string>();
        for (let i = callTurnIndex + 1; i < messages.length; i++) {
            const content = messages[i].content;
            if (!Array.isArray(content)) {
                continue;
            }
            for (const block of content) {
                if (block.type === 'tool_result' && block.toolCallId) {
                    answered.add(block.toolCallId);
                }
            }
        }
        return answered;
    }

    public override InsertToolResultsAfterCallTurn(
        ctx: AgentRunContext,
        messages: ChatMessage[],
        callTurnIndex: number,
        results: AgentChatMessage
    ): void {
        const adjacent = messages[callTurnIndex + 1] as AgentChatMessage | undefined;
        if (adjacent?.role === 'tool' && Array.isArray(adjacent.content) && Array.isArray(results.content)) {
            const mergedMetadata = ActionLifecycleResolver.MergeToolTurnMetadata(adjacent.metadata, results.metadata);
            if (mergedMetadata) {
                ctx.ActionSpilloverManager.TransferPending(adjacent.metadata, mergedMetadata);
                ctx.ActionSpilloverManager.TransferPending(results.metadata, mergedMetadata);
            }
            messages[callTurnIndex + 1] = {
                ...adjacent,
                content: [...adjacent.content, ...results.content],
                ...(mergedMetadata ? { metadata: mergedMetadata } : {}),
            };
            return;
        }
        messages.splice(callTurnIndex + 1, 0, results);
    }

    public override StubToolTurn(_ctx: AgentRunContext, message: AgentChatMessage, note: string): AgentChatMessage {
        return CompactToolResultContent(message, () => note);
    }

    // -------------------------------------------------------------------------
    // Delegated Execution Methods
    // -------------------------------------------------------------------------

    public override ExecuteSingleAction(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        contextUser?: UserInfo,
        options?: ExecuteSingleActionOptions
    ): Promise<ActionResult> {
        return this._executor.ExecuteSingleAction(ctx, this, params, action, actionEntity, contextUser, options);
    }

    public override ExecuteActionsStep(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        previousDecision: BaseAgentNextStep,
        parentStepId: string,
        addConversationMessage?: boolean,
        stepCount?: number,
        actionOptions?: ExecuteSingleActionOptions
    ): Promise<BaseAgentNextStep> {
        return this._executor.ExecuteActionsStep(
            ctx,
            this,
            params,
            previousDecision,
            parentStepId,
            addConversationMessage,
            stepCount,
            actionOptions
        );
    }

    public override DescribeClientToolInvocations(
        _ctx: AgentRunContext,
        clientTools: AgentClientToolInvocation[]
    ): string {
        return this._executor.DescribeClientToolInvocations(clientTools);
    }

    public override ExecuteClientToolsStep(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep,
        stepCount?: number
    ): Promise<BaseAgentNextStep> {
        return this._executor.ExecuteClientToolsStep(ctx, this, params, config, previousDecision, stepCount);
    }

    public override ExecuteAgentToolCallsAsSteps<P>(
        ctx: AgentRunContext,
        calls: AgentToolCallRequest[],
        payload: P,
        params: ExecuteAgentParams
    ): Promise<{ payload: P; results: NativeToolResult[] }> {
        return this._executor.ExecuteAgentToolCallsAsSteps(ctx, calls, payload, params);
    }

    public override ExecuteAgentToolCallAsStep<P>(
        ctx: AgentRunContext,
        call: AgentToolCallRequest,
        payload: P,
        params: ExecuteAgentParams
    ): Promise<{ payload: P; result: NativeToolResult }> {
        return this._executor.ExecuteAgentToolCallAsStep(ctx, call, payload, params);
    }

    public override RunAndApplyAgentTool<P>(
        ctx: AgentRunContext,
        call: AgentToolCallRequest,
        payload: P,
        params: ExecuteAgentParams
    ): Promise<{ payload: P; content: string; isError: boolean }> {
        return this._executor.RunAndApplyAgentTool(ctx, call, payload, params);
    }

    public override AgentToolBreakerKey(ctx: AgentRunContext, call: AgentToolCallRequest): string | null {
        return this._executor.AgentToolBreakerKey(ctx, call);
    }

    public override RecordAgentToolOutcome(
        ctx: AgentRunContext,
        toolName: string,
        breakerKey: string | null,
        isError: boolean
    ): void {
        this._executor.RecordAgentToolOutcome(ctx, toolName, breakerKey, isError);
    }

    public override RunAgentTool<P>(
        ctx: AgentRunContext,
        call: AgentToolCallRequest,
        payload: P,
        params: ExecuteAgentParams
    ): Promise<AgentToolResult<P>> {
        return this._executor.RunAgentTool(ctx, call, payload, params);
    }

    public override ApplyAgentToolPayloadChange<P>(
        ctx: AgentRunContext,
        payload: P,
        change: AgentPayloadChangeRequest<P>,
        params: ExecuteAgentParams,
        partial?: boolean
    ): { payload: P; error?: string } {
        return this._executor.ApplyAgentToolPayloadChange(ctx, payload, change, params, partial);
    }

    public override AppendAgentToolResults(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        step: BaseAgentNextStep
    ): void {
        this._executor.AppendAgentToolResults(ctx, params, step);
    }
}
