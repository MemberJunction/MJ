/**
 * @fileoverview Focused collaborator owned by {@link AgentActionsHelper} encapsulating
 * deterministic action parameter normalization, the run-scoped action circuit breaker,
 * failure classification, and model-facing failure/policy directives.
 *
 * @module @memberjunction/ai-agents
 */

import type { AgentAction, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import {
    AUDIENCE_UNSUPPORTED_RESULT_CODE,
    RunActionParams,
    type ActionResult,
    type MJActionEntityExtended,
} from '@memberjunction/actions-base';
import type { AgentRunContext } from '../AgentRunContext';
import {
    ACTION_FAILURE_BUDGET,
    CircuitBreakerActionResult,
    IDENTICAL_FAILURE_THRESHOLD,
    NON_RETRYABLE_RESULT_CODES,
    POLICY_APPROVAL_REQUIRED_RESULT_CODE,
    POLICY_DEFERRED_RESULT_CODE,
    POLICY_REFUSAL_RESULT_CODES,
    type ActionCircuitBreakerReason,
    type ActionFailureClass,
    type ActionResultSummary,
    type ExecuteSingleActionOptions,
} from '../base-agent-types';

/**
 * Collaborator owned by {@link AgentActionsHelper} implementing parameter normalization,
 * circuit-breaker lockout/budget rules, and failure directive formatting.
 */
export class AgentActionCircuitBreakerHelper {
    public NormalizeActionParams(
        ctx: AgentRunContext,
        params: Record<string, unknown> | null | undefined
    ): string {
        if (!params || typeof params !== 'object') {
            return '';
        }
        try {
            const normalized: Record<string, unknown> = {};
            for (const key of Object.keys(params).sort()) {
                const entry = ctx.Hooks.NormalizeActionParamEntry(key, params[key]);
                if (entry) {
                    normalized[entry.key] = entry.value;
                }
            }
            return JSON.stringify(normalized);
        } catch {
            return `[unserializable:${Object.keys(params).sort().join(',')}]`;
        }
    }

    public NormalizeActionParamEntry(
        ctx: AgentRunContext,
        key: string,
        value: unknown
    ): { key: string; value: unknown } | null {
        return { key, value: ctx.Hooks.NormalizeActionParamValue(value) };
    }

    public NormalizeActionParamValue(ctx: AgentRunContext, value: unknown): unknown {
        if (Array.isArray(value)) {
            return value.map((item) => ctx.Hooks.NormalizeActionParamValue(item));
        }
        if (
            value !== null &&
            typeof value === 'object' &&
            (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
        ) {
            const source = value as Record<string, unknown>;
            const sorted: Record<string, unknown> = {};
            for (const key of Object.keys(source).sort()) {
                sorted[key] = ctx.Hooks.NormalizeActionParamValue(source[key]);
            }
            return sorted;
        }
        return value;
    }

    public IsFatalActionError(
        ctx: AgentRunContext,
        message: string | null | undefined,
        actionParams?: Record<string, unknown> | null
    ): boolean {
        if (!message) {
            return false;
        }
        const isParamError = /\b(?:parameter|argument|param|input|field|option|property|value|column|filter|header)\b/i.test(message);
        if (isParamError || ctx.Hooks.HasCredentialShapedArguments(actionParams)) {
            return false;
        }
        const fatalCredentialPattern =
            /(?:api[\s_-]?key\s+(?:is\s+)?(?:not\s+found|missing|required|invalid)|(?:missing|invalid)\s+api[\s_-]?key|no\s+api[\s_-]?key|credentials?\s+(?:not\s+found|missing)|authentication\s+failed)/i;
        if (fatalCredentialPattern.test(message)) {
            return true;
        }
        const fatalConfigPattern =
            /(?:(?:action|tool|service|provider|integration|driver|client|api|extension|engine|server)\s+(?:is\s+)?not\s+configured|not\s+configured\s+(?:for\s+(?:this\s+)?tenant|in\s+(?:this\s+)?environment|on\s+this\s+server|in\s+(?:config|mj\.config))|^\s*(?:action\s+)?(?:is\s+)?not\s+configured[.!]*\s*$)/i;
        return fatalConfigPattern.test(message);
    }

    public HasCredentialShapedArguments(actionParams?: Record<string, unknown> | null): boolean {
        if (!actionParams || typeof actionParams !== 'object') {
            return false;
        }
        const credentialKey = /password|passwd|secret|credential|api[_-]?key|(?:access|auth|bearer|refresh|id)[_-]?token|^token$/i;
        return Object.keys(actionParams).some((key) => credentialKey.test(key));
    }

    public RecordActionFailure(
        ctx: AgentRunContext,
        action: AgentAction,
        actionEntity: MJActionEntityExtended | undefined,
        message: string | null | undefined,
        normalizedParams: string
    ): void {
        if (ctx.Hooks.IsFatalActionError(message, action.params)) {
            this.LockOutAction(ctx, action, actionEntity);
            return;
        }
        const existing =
            ctx.ActionFailureHistory.get(action.name) ||
            (actionEntity?.Name ? ctx.ActionFailureHistory.get(actionEntity.Name) : undefined);
        const isIdentical = existing !== undefined && existing.lastParamsString === normalizedParams;
        const record = {
            lastParamsString: normalizedParams,
            identicalFailures: isIdentical && existing ? existing.identicalFailures + 1 : 1,
            totalConsecutiveFailures: (existing?.totalConsecutiveFailures ?? 0) + 1,
        };
        ctx.ActionFailureHistory.set(action.name, record);
        if (actionEntity?.Name) {
            ctx.ActionFailureHistory.set(actionEntity.Name, record);
        }
    }

    public LockOutAction(
        ctx: AgentRunContext,
        action: AgentAction,
        actionEntity: MJActionEntityExtended | undefined,
        reason: 'fatal' | 'audience' | 'tainted' = 'fatal'
    ): void {
        const lockouts =
            reason === 'audience'
                ? ctx.AudienceLockedActions
                : reason === 'tainted'
                ? ctx.TaintLockedActions
                : ctx.FatalActionFailures;
        lockouts.add(action.name);
        if (actionEntity?.Name) {
            lockouts.add(actionEntity.Name);
        }
    }

    public ResetActionCircuitBreaker(ctx: AgentRunContext): void {
        ctx.FatalActionFailures.clear();
        ctx.AudienceLockedActions.clear();
        ctx.TaintLockedActions.clear();
        ctx.ActionFailureHistory.clear();
        ctx.AgentToolBreaker.Reset();
    }

    public LockedOutActionResult(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended
    ): CircuitBreakerActionResult | null {
        const isLocked = (lockouts: Set<string>): boolean =>
            lockouts.has(action.name) || (!!actionEntity?.Name && lockouts.has(actionEntity.Name));
        if (isLocked(ctx.AudienceLockedActions)) {
            ctx.Hooks.LogStatus(
                `   ⚡ Circuit breaker: Action '${action.name}' short-circuited (0ms): not available under this run's audience`,
                false,
                params
            );
            return ctx.Hooks.BuildBlockedActionResult(
                actionEntity,
                'audience',
                `Action '${action.name}' is not available in this shared conversation: what it returns could not be limited to what ` +
                    'everyone here may see. Do not call it again in this run; use another tool or answer from what you have.'
            );
        }
        if (isLocked(ctx.TaintLockedActions)) {
            ctx.Hooks.LogStatus(
                `   ⚡ Circuit breaker: Action '${action.name}' short-circuited (0ms): this run read untrusted content`,
                false,
                params
            );
            return ctx.Hooks.BuildBlockedActionResult(actionEntity, 'tainted', this.TaintLockoutText(action.name));
        }
        if (isLocked(ctx.FatalActionFailures)) {
            ctx.Hooks.LogStatus(
                `   ⚡ Circuit breaker: Action '${action.name}' short-circuited (0ms): fatal configuration or credential error earlier in this run`,
                false,
                params
            );
            return ctx.Hooks.BuildBlockedActionResult(
                actionEntity,
                'fatal',
                `Action '${action.name}' is disabled for this run because it previously failed with an unrecoverable configuration or ` +
                    'credential error. You must select an alternative action.'
            );
        }
        return null;
    }

    public TaintLockoutText(name: string): string {
        return (
            `Action '${name}' is not allowed in this run: the run has read untrusted content, and this action sends data ` +
            'out or cannot be undone, so it cannot run until a person reviews that content. It is not broken or misconfigured, ' +
            `and no change to its arguments will help. DO NOT call '${name}' again during this run; use another tool, or tell ` +
            'the user it needs a person to review the content first.'
        );
    }

    public ClearActionFailureRecord(
        ctx: AgentRunContext,
        action: AgentAction,
        actionEntity: MJActionEntityExtended | undefined
    ): void {
        ctx.ActionFailureHistory.delete(action.name);
        if (actionEntity?.Name) {
            ctx.ActionFailureHistory.delete(actionEntity.Name);
        }
    }

    public CheckActionCircuitBreaker(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        normalizedParams: string
    ): CircuitBreakerActionResult | null {
        const lockedOut = this.LockedOutActionResult(ctx, params, action, actionEntity);
        if (lockedOut) {
            return lockedOut;
        }
        const entityKey = actionEntity?.Name;

        const record =
            ctx.ActionFailureHistory.get(action.name) || (entityKey ? ctx.ActionFailureHistory.get(entityKey) : undefined);
        if (!record) {
            return null;
        }
        if (record.lastParamsString === normalizedParams && record.identicalFailures >= IDENTICAL_FAILURE_THRESHOLD) {
            ctx.Hooks.LogStatus(
                `   ⚡ Circuit breaker: Action '${action.name}' short-circuited on identical retry loop (0ms)`,
                false,
                params
            );
            return ctx.Hooks.BuildBlockedActionResult(
                actionEntity,
                'identical-arguments',
                `Action '${action.name}' is disabled for these inputs because it already failed ${record.identicalFailures} times with identical arguments. You must modify your parameters or select an alternative tool.`
            );
        }
        if (record.totalConsecutiveFailures >= ACTION_FAILURE_BUDGET) {
            ctx.Hooks.LogStatus(
                `   ⚡ Circuit breaker: Action '${action.name}' short-circuited on max retry attempts (0ms)`,
                false,
                params
            );
            return ctx.Hooks.BuildBlockedActionResult(
                actionEntity,
                'attempts-exhausted',
                `Action '${action.name}' is disabled for this run after ${ACTION_FAILURE_BUDGET} consecutive failures across parameter attempts. You must select an alternative tool or proceed with available data.`
            );
        }
        return null;
    }

    public BuildBlockedActionResult(
        actionEntity: MJActionEntityExtended,
        reason: ActionCircuitBreakerReason,
        message: string
    ): CircuitBreakerActionResult {
        const blocked = new CircuitBreakerActionResult(reason);
        blocked.Success = false;
        blocked.Message = message;
        blocked.Params = [];
        blocked.RunParams = new RunActionParams();
        blocked.RunParams.Action = actionEntity;
        return blocked;
    }

    public ClassifyActionFailure(ctx: AgentRunContext, summary: ActionResultSummary): ActionFailureClass {
        if (summary.breakerReason) {
            return summary.breakerReason;
        }
        if (ctx.AudienceLockedActions.has(summary.actionName)) {
            return 'audience';
        }
        if (ctx.TaintLockedActions.has(summary.actionName)) {
            return 'tainted';
        }
        if (ctx.FatalActionFailures.has(summary.actionName)) {
            return 'fatal';
        }
        const record = ctx.ActionFailureHistory.get(summary.actionName);
        if (record && record.totalConsecutiveFailures >= ACTION_FAILURE_BUDGET) {
            return 'attempts-exhausted';
        }
        if (POLICY_REFUSAL_RESULT_CODES.has(summary.resultCode)) {
            return 'policy';
        }
        if (NON_RETRYABLE_RESULT_CODES.has(summary.resultCode) || summary.errorRecovery?.Retryable === false) {
            return 'non-retryable';
        }
        if (record && record.identicalFailures >= IDENTICAL_FAILURE_THRESHOLD) {
            return 'identical-arguments';
        }
        return 'warning';
    }

    public FormatPolicyRefusalDirective(summary: ActionResultSummary): string {
        const name = summary.actionName;
        switch (summary.resultCode) {
            case POLICY_APPROVAL_REQUIRED_RESULT_CODE:
                return (
                    `[CRITICAL/POLICY_APPROVAL_REQUIRED] Action '${name}' requires the user's approval under their agent policy: "${summary.message}". ` +
                    `Approval cannot be granted inside this run, so DO NOT retry '${name}'. Tell the user exactly what you intended to do and why, ` +
                    'and ask them to approve it or do it themselves.'
                );
            case POLICY_DEFERRED_RESULT_CODE:
                return (
                    `[CRITICAL/POLICY_DEFERRED] Action '${name}' is outside the time window the user's agent policy allows: "${summary.message}". ` +
                    `Retrying now will not help; DO NOT call '${name}' again during this run. Tell the user it was deferred and when it can run.`
                );
            default:
                return (
                    `[CRITICAL/POLICY_DENIED] Action '${name}' was refused by the user's agent policy: "${summary.message}". ` +
                    'This is a governance decision, not a problem with your arguments: the same call will be refused again. ' +
                    `Call '${name}' again only with materially different parameters, and only if the reason says the refusal depends on them; ` +
                    'otherwise use another tool or tell the user what you could not do.'
                );
        }
    }

    public FormatActionFailureDirective(ctx: AgentRunContext, summary: ActionResultSummary): string {
        const name = summary.actionName;
        const record = ctx.ActionFailureHistory.get(name);
        switch (ctx.Hooks.ClassifyActionFailure(summary)) {
            case 'policy':
                return this.FormatPolicyRefusalDirective(summary);
            case 'non-retryable': {
                const suggestion = summary.errorRecovery?.RecoverySuggestion
                    ? ` ${summary.errorRecovery.RecoverySuggestion}`
                    : '';
                const nextActions = summary.errorRecovery?.SuggestedNextActions?.length
                    ? ` Suggested alternative actions: ${summary.errorRecovery.SuggestedNextActions.map((a) => `\`${a}\``).join(', ')}.`
                    : '';
                return `[CRITICAL/NON_RETRYABLE_FAILURE] Action '${name}' failed with non-retryable error (${summary.resultCode}): "${summary.message}".${suggestion}${nextActions} DO NOT retry '${name}' against the same target or with the same parameters; pivot to an alternative tool, a different target, or inform the user.`;
            }
            case 'audience':
                return (
                    `[CRITICAL/NOT_AVAILABLE_IN_SHARED_CONVERSATION] Action '${name}' is not available in this shared conversation: what it ` +
                    `returns could not be limited to what everyone in it may see ("${summary.message}"). It is not broken or misconfigured. ` +
                    `DO NOT call '${name}' again during this run. Use another tool, or answer from what you already have.`
                );
            case 'tainted':
                return `[CRITICAL/NOT_ALLOWED_AFTER_UNTRUSTED_CONTENT] ${this.TaintLockoutText(name)}`;
            case 'fatal':
                return `[CRITICAL/ACTION_UNAVAILABLE] Action '${name}' failed with an unrecoverable configuration or credential error: "${summary.message}". This action cannot execute in this environment. DO NOT call '${name}' again during this run. You MUST select an alternative tool or proceed with available data.`;
            case 'attempts-exhausted':
                return `[CRITICAL/ATTEMPTS_EXHAUSTED] Action '${name}' has failed ${record?.totalConsecutiveFailures ?? ACTION_FAILURE_BUDGET} consecutive times: "${summary.message}". Retries for this action are exhausted. You MUST pivot to an alternative tool or continue with available data.`;
            case 'identical-arguments':
                return `[CRITICAL/REPEATED_IDENTICAL_CALL] Action '${name}' failed again with the EXACT SAME arguments: "${summary.message}". Calling '${name}' with these parameters will not work. You MUST either adjust your parameters or pivot to an alternative tool.`;
            default: {
                const suggestion = summary.errorRecovery?.RecoverySuggestion
                    ? ` ${summary.errorRecovery.RecoverySuggestion}`
                    : '';
                const suggestedValues = summary.errorRecovery?.SuggestedValues?.length
                    ? ` Valid alternatives: ${summary.errorRecovery.SuggestedValues.join(', ')}.`
                    : '';
                return `[WARNING/ACTION_FAILURE] Action '${name}' failed: "${summary.message}".${suggestion}${suggestedValues} Review the error and adjust your input parameters (attempt ${record?.totalConsecutiveFailures ?? 1} of ${ACTION_FAILURE_BUDGET}). DO NOT retry calling '${name}' with identical arguments.`;
            }
        }
    }

    public RecordDispatchOutcome(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        result: ActionResult,
        normalizedParams: string,
        skipBreaker: boolean
    ): void {
        if (result.Success) {
            ctx.Hooks.LogStatus(`   ✅ Action '${action.name}' completed successfully`, true, params);
            if (!skipBreaker) {
                ctx.Hooks.ClearActionFailureRecord(action, actionEntity);
            }
            return;
        }
        ctx.Hooks.LogStatus(`   ❌ Action '${action.name}' failed: ${result.Message || 'Unknown error'}`, false, params);
        if (skipBreaker) {
            return;
        }
        if (result.ResultCode === AUDIENCE_UNSUPPORTED_RESULT_CODE) {
            this.LockOutAction(ctx, action, actionEntity, 'audience');
            return;
        }
        ctx.Hooks.RecordActionFailure(action, actionEntity, result.Message, normalizedParams);
    }

    public ActionOptionsForAgentType(ctx: AgentRunContext): ExecuteSingleActionOptions | undefined {
        return ctx.AgentTypeInstance?.UsesActionCircuitBreaker === false ? { skipCircuitBreaker: true } : undefined;
    }
}
