import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    AUDIENCE_UNSUPPORTED_RESULT_CODE,
    type ActionResult,
    type MJActionEntityExtended,
} from '@memberjunction/actions-base';
import {
    TAINTED_EGRESS_BLOCKED,
    type ActionChange,
    type AgentAction,
    type AgentChatMessage,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { ChatMessage } from '@memberjunction/ai';
import type { UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { ActionLifecycleResolver } from '../ActionLifecycleResolver';
import { AgentActionPolicyHelper } from '../helpers/actions/AgentActionPolicyHelper';
import { AgentActionsHelper } from '../helpers/actions/AgentActionsHelper';
import { BaseAgentActionPolicyHelper } from '../helpers/actions/BaseAgentActionPolicyHelper';
import { BaseAgentActionsHelper } from '../helpers/actions/BaseAgentActionsHelper';
import { ResolveAgentHelper } from '../helpers/AgentHelperResolver';
import {
    ACTION_FAILURE_BUDGET,
    IDENTICAL_FAILURE_THRESHOLD,
    POLICY_APPROVAL_REQUIRED_RESULT_CODE,
    POLICY_DEFERRED_RESULT_CODE,
    POLICY_DENIED_RESULT_CODE,
    type ActionResultSummary,
} from '../helpers/base-agent-types';
import { BuildAssistantToolCallTurn, BuildToolResultTurn } from '../native-tools/tool-result-turns';
import { CreateMockAgentRunContext } from './helpers/mock-agent-run-context';

@RegisterClass(BaseAgentActionsHelper, 'TestCustomActionsHelper')
class TestCustomActionsHelper extends AgentActionsHelper {
    public readonly CustomTag = 'TestCustomActionsHelper';
}

function makeAgent(overrides: Partial<MJAIAgentEntityExtended> = {}): MJAIAgentEntityExtended {
    return {
        ID: '10000000-0000-4000-8000-000000000001',
        Name: 'TestAgent',
        Status: 'Active',
        ...overrides,
    } as MJAIAgentEntityExtended;
}

function makeActionEntity(overrides: Partial<MJActionEntityExtended> = {}): MJActionEntityExtended {
    return {
        ID: '20000000-0000-4000-8000-000000000001',
        Name: 'SearchDocs',
        Status: 'Active',
        Params: { Items: [] },
        ...overrides,
    } as MJActionEntityExtended;
}

function makeParams(overrides: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    return {
        agent: makeAgent(),
        conversationMessages: [],
        ...overrides,
    } as ExecuteAgentParams;
}

function makeSummary(overrides: Partial<ActionResultSummary> = {}): ActionResultSummary {
    return {
        actionName: 'SearchDocs',
        success: false,
        params: [],
        resultCode: 'FAILED',
        message: 'Something failed',
        ...overrides,
    };
}

describe('AgentActionPolicyHelper & AgentActionsHelper (Slice s8)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves default AgentActionPolicyHelper and rejects metadata DriverClass overrides (D3 code-only)', () => {
        const helper = ResolveAgentHelper({
            SeamKey: 'actionPolicy',
            BaseClass: BaseAgentActionPolicyHelper,
            DefaultClass: AgentActionPolicyHelper,
        });
        expect(helper).toBeInstanceOf(AgentActionPolicyHelper);

        expect(() =>
            ResolveAgentHelper({
                SeamKey: 'actionPolicy',
                BaseClass: BaseAgentActionPolicyHelper,
                DefaultClass: AgentActionPolicyHelper,
                DriverClass: 'UntrustedCustomActionPolicy',
            })
        ).toThrow(/code-only/);
    });

    it('resolves default AgentActionsHelper and rejects metadata helperPlugins override for code-only actions seam (S3)', () => {
        const defaultHelper = ResolveAgentHelper({
            SeamKey: 'actions',
            BaseClass: BaseAgentActionsHelper,
            DefaultClass: AgentActionsHelper,
        });
        expect(defaultHelper).toBeInstanceOf(AgentActionsHelper);

        expect(() =>
            ResolveAgentHelper({
                SeamKey: 'actions',
                BaseClass: BaseAgentActionsHelper,
                DefaultClass: AgentActionsHelper,
                DriverClass: 'TestCustomActionsHelper',
            })
        ).toThrow(/code-only/);
    });

    it('normalizes nested action parameter keys and arrays deterministically and handles null/circular inputs', () => {
        const helper = new AgentActionsHelper();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                NormalizeActionParamEntry: (key, value) => helper.NormalizeActionParamEntry(ctx, key, value),
                NormalizeActionParamValue: (value) => helper.NormalizeActionParamValue(ctx, value),
            },
        });

        const a = helper.NormalizeActionParams(ctx, { z: 1, a: { d: 4, b: [{ y: 2, x: 1 }] } });
        const b = helper.NormalizeActionParams(ctx, { a: { b: [{ x: 1, y: 2 }], d: 4 }, z: 1 });
        expect(a).toBe(b);
        expect(helper.NormalizeActionParams(ctx, null)).toBe('');
        expect(helper.NormalizeActionParams(ctx, undefined)).toBe('');

        const circular: Record<string, unknown> = { b: 1, a: 2 };
        circular.self = circular;
        expect(helper.NormalizeActionParams(ctx, circular)).toBe('[unserializable:a,b,self]');
    });

    it('classifies fatal credential/config errors while sparing parameter errors and credential-shaped arguments', () => {
        const helper = new AgentActionsHelper();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                HasCredentialShapedArguments: (p) => helper.HasCredentialShapedArguments(ctx, p),
            },
        });

        expect(helper.IsFatalActionError(ctx, null)).toBe(false);
        expect(helper.IsFatalActionError(ctx, '')).toBe(false);
        expect(helper.IsFatalActionError(ctx, 'Missing API key for provider')).toBe(true);
        expect(helper.IsFatalActionError(ctx, 'Authentication failed')).toBe(true);
        expect(helper.IsFatalActionError(ctx, 'Integration is not configured')).toBe(true);
        expect(helper.IsFatalActionError(ctx, 'Invalid parameter value for filter')).toBe(false);
        expect(helper.IsFatalActionError(ctx, 'Authentication failed', { apiKey: 'user-supplied' })).toBe(false);
        expect(helper.HasCredentialShapedArguments(ctx, { access_token: 'abc' })).toBe(true);
        expect(helper.HasCredentialShapedArguments(ctx, { query: 'hello' })).toBe(false);
    });

    it('blocks identical failing action retries on threshold and resets cleanly on clear/reset', () => {
        const helper = new AgentActionsHelper();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                IsFatalActionError: (msg, p) => helper.IsFatalActionError(ctx, msg, p),
                HasCredentialShapedArguments: (p) => helper.HasCredentialShapedArguments(ctx, p),
                BuildBlockedActionResult: (e, r, m) => helper.BuildBlockedActionResult(ctx, e, r, m),
            },
        });
        const actionEntity = makeActionEntity();
        const action: AgentAction = { name: 'SearchDocs', params: { query: 'test' } };
        const params = makeParams();

        for (let i = 1; i < IDENTICAL_FAILURE_THRESHOLD; i++) {
            helper.RecordActionFailure(ctx, action, actionEntity, 'Not found', '{"query":"test"}');
            expect(helper.CheckActionCircuitBreaker(ctx, params, action, actionEntity, '{"query":"test"}')).toBeNull();
        }

        helper.RecordActionFailure(ctx, action, actionEntity, 'Not found', '{"query":"test"}');
        const blocked = helper.CheckActionCircuitBreaker(ctx, params, action, actionEntity, '{"query":"test"}');
        expect(blocked).not.toBeNull();
        expect(blocked?.Reason).toBe('identical-arguments');

        // Different args still allowed until overall budget exhausted
        expect(helper.CheckActionCircuitBreaker(ctx, params, action, actionEntity, '{"query":"other"}')).toBeNull();

        helper.ClearActionFailureRecord(ctx, action, actionEntity);
        expect(helper.CheckActionCircuitBreaker(ctx, params, action, actionEntity, '{"query":"test"}')).toBeNull();
    });

    it('blocks action with attempts-exhausted after ACTION_FAILURE_BUDGET consecutive failures across distinct args', () => {
        const helper = new AgentActionsHelper();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                IsFatalActionError: () => false,
                BuildBlockedActionResult: (e, r, m) => helper.BuildBlockedActionResult(ctx, e, r, m),
            },
        });
        const actionEntity = makeActionEntity();
        const action: AgentAction = { name: 'SearchDocs', params: {} };
        const params = makeParams();

        for (let i = 0; i < ACTION_FAILURE_BUDGET; i++) {
            helper.RecordActionFailure(ctx, action, actionEntity, `err ${i}`, `{"q":${i}}`);
        }

        const blocked = helper.CheckActionCircuitBreaker(ctx, params, action, actionEntity, '{"q":999}');
        expect(blocked).not.toBeNull();
        expect(blocked?.Reason).toBe('attempts-exhausted');

        helper.ResetActionCircuitBreaker(ctx);
        expect(helper.CheckActionCircuitBreaker(ctx, params, action, actionEntity, '{"q":999}')).toBeNull();
    });

    it('enforces LockOutAction precedence (audience > tainted > fatal) in LockedOutActionResult', () => {
        const helper = new AgentActionsHelper();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                BuildBlockedActionResult: (e, r, m) => helper.BuildBlockedActionResult(ctx, e, r, m),
            },
        });
        const entity = makeActionEntity({ Name: 'ExportData' });
        const action: AgentAction = { name: 'ExportData', params: {} };
        const params = makeParams();

        helper.LockOutAction(ctx, action, entity, 'fatal');
        expect(helper.LockedOutActionResult(ctx, params, action, entity)?.Reason).toBe('fatal');

        helper.LockOutAction(ctx, action, entity, 'tainted');
        expect(helper.LockedOutActionResult(ctx, params, action, entity)?.Reason).toBe('tainted');

        helper.LockOutAction(ctx, action, entity, 'audience');
        expect(helper.LockedOutActionResult(ctx, params, action, entity)?.Reason).toBe('audience');
    });

    it('classifies failures and formats distinct model-facing directives for every failure class', () => {
        const helper = new AgentActionsHelper();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                ClassifyActionFailure: (s) => helper.ClassifyActionFailure(ctx, s),
            },
        });

        expect(helper.FormatActionFailureDirective(ctx, makeSummary({ resultCode: POLICY_DENIED_RESULT_CODE }))).toContain(
            '[CRITICAL/POLICY_DENIED]'
        );
        expect(
            helper.FormatActionFailureDirective(ctx, makeSummary({ resultCode: POLICY_APPROVAL_REQUIRED_RESULT_CODE }))
        ).toContain('[CRITICAL/POLICY_APPROVAL_REQUIRED]');
        expect(
            helper.FormatActionFailureDirective(ctx, makeSummary({ resultCode: POLICY_DEFERRED_RESULT_CODE }))
        ).toContain('[CRITICAL/POLICY_DEFERRED]');

        expect(
            helper.FormatActionFailureDirective(
                ctx,
                makeSummary({
                    resultCode: 'VALIDATION_ERROR',
                    errorRecovery: {
                        Retryable: false,
                        RecoverySuggestion: 'Use another endpoint.',
                        SuggestedNextActions: ['ListRecords'],
                    },
                })
            )
        ).toContain('[CRITICAL/NON_RETRYABLE_FAILURE]');

        expect(helper.FormatActionFailureDirective(ctx, makeSummary({ breakerReason: 'audience' }))).toContain(
            '[CRITICAL/NOT_AVAILABLE_IN_SHARED_CONVERSATION]'
        );
        expect(helper.FormatActionFailureDirective(ctx, makeSummary({ breakerReason: 'tainted' }))).toContain(
            '[CRITICAL/NOT_ALLOWED_AFTER_UNTRUSTED_CONTENT]'
        );
        expect(helper.FormatActionFailureDirective(ctx, makeSummary({ breakerReason: 'fatal' }))).toContain(
            '[CRITICAL/ACTION_UNAVAILABLE]'
        );
        expect(helper.FormatActionFailureDirective(ctx, makeSummary({ breakerReason: 'attempts-exhausted' }))).toContain(
            '[CRITICAL/ATTEMPTS_EXHAUSTED]'
        );
        expect(helper.FormatActionFailureDirective(ctx, makeSummary({ breakerReason: 'identical-arguments' }))).toContain(
            '[CRITICAL/REPEATED_IDENTICAL_CALL]'
        );
        expect(
            helper.FormatActionFailureDirective(
                ctx,
                makeSummary({ errorRecovery: { SuggestedValues: ['Open', 'Closed'] } })
            )
        ).toContain('[WARNING/ACTION_FAILURE]');
    });

    it('RecordDispatchOutcome clears history on success, locks audience-unsupported, and honors skipBreaker', () => {
        const helper = new AgentActionsHelper();
        const clearSpy = vi.fn();
        const recordSpy = vi.fn();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                ClearActionFailureRecord: clearSpy,
                RecordActionFailure: recordSpy,
            },
        });
        const params = makeParams();
        const action: AgentAction = { name: 'ReadSecret', params: {} };
        const entity = makeActionEntity({ Name: 'ReadSecret' });

        helper.RecordDispatchOutcome(ctx, params, action, entity, { Success: true, Params: [] }, '{}', false);
        expect(clearSpy).toHaveBeenCalledTimes(1);

        helper.RecordDispatchOutcome(
            ctx,
            params,
            action,
            entity,
            { Success: false, ResultCode: AUDIENCE_UNSUPPORTED_RESULT_CODE, Message: 'no audience', Params: [] },
            '{}',
            false
        );
        expect(ctx.AudienceLockedActions.has('ReadSecret')).toBe(true);

        helper.RecordDispatchOutcome(ctx, params, action, entity, { Success: false, Message: 'boom', Params: [] }, '{}', true);
        expect(recordSpy).not.toHaveBeenCalled();

        helper.RecordDispatchOutcome(ctx, params, action, entity, { Success: false, Message: 'boom', Params: [] }, '{}', false);
        expect(recordSpy).toHaveBeenCalledTimes(1);
    });

    it('ValidateActionsNextStep rejects missing/blank actions and enforces DynamicActionLimits', async () => {
        const helper = new AgentActionsHelper();
        const searchAction = makeActionEntity({ ID: 'act-search', Name: 'SearchDocs' });
        const getCount = vi.fn(async () => 2);
        const ctx = CreateMockAgentRunContext({
            DynamicActionLimits: { 'act-search': 2 },
            Hooks: {
                GetEffectiveActionsForValidation: () => [searchAction],
                IndexEffectiveAgentActions: () => ActionLifecycleResolver.IndexEffectiveAgentActions([]),
                ResolveActionEntityForAgent: (raw, pool) =>
                    pool.find((a) => a.Name.toLowerCase() === String(raw ?? '').trim().toLowerCase()),
                GetActionExecutionCount: getCount,
            },
        });
        const params = makeParams();
        const run = { ID: 'run-1' } as MJAIAgentRunEntityExtended;
        const stepEntity = { ID: 'step-1' } as MJAIAgentRunStepEntityExtended;

        const missing = await helper.ValidateActionsNextStep(
            ctx,
            params,
            { step: 'Actions', terminate: false, actions: [{ name: '   ', params: {} }] },
            {},
            run,
            stepEntity
        );
        expect(missing.step).toBe('Retry');
        expect(missing.errorMessage).toContain('<missing action name>');
        expect(ctx.GeneralValidationRetryCount).toBe(1);

        const overLimit = await helper.ValidateActionsNextStep(
            ctx,
            params,
            { step: 'Actions', terminate: false, actions: [{ name: 'SearchDocs', params: {} }] },
            {},
            run,
            stepEntity
        );
        expect(overLimit.step).toBe('Retry');
        expect(overLimit.errorMessage).toContain('execution limits');
        expect(ctx.GeneralValidationRetryCount).toBe(2);

        getCount.mockResolvedValueOnce(1);
        const valid = await helper.ValidateActionsNextStep(
            ctx,
            params,
            { step: 'Actions', terminate: false, actions: [{ name: 'SearchDocs', params: {} }] },
            {},
            run,
            stepEntity
        );
        expect(valid.step).toBe('Actions');
    });

    it('ValidateActionInAgent & ResolveActionEntityForAgent handle exact, sanitized, fuzzy, ambiguous, and blank names', () => {
        const helper = new AgentActionsHelper();
        const pool = [
            makeActionEntity({ ID: 'a1', Name: 'Search Records' }),
            makeActionEntity({ ID: 'a2', Name: 'Search Users' }),
            makeActionEntity({ ID: 'a3', Name: 'Export CSV' }),
        ];
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                GetAvailableActionsForAgent: () => pool,
                MatchNamedBySanitizedToolName: (raw, items) => {
                    const normalized = raw.toLowerCase().replace(/[^a-z0-9]/g, '_');
                    const matches = items.filter(
                        (i) => (i.Name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '_') === normalized
                    );
                    return matches.length === 1 ? { match: matches[0] } : matches.length > 1 ? { ambiguous: matches } : {};
                },
            },
        });

        expect(helper.ValidateActionInAgent(ctx, 'Search Records', 'agent-1')).toBeNull();
        expect(helper.ValidateActionInAgent(ctx, 'export_csv', 'agent-1')).toBeNull();
        expect(helper.ValidateActionInAgent(ctx, 'CSV', 'agent-1')).toBeNull();
        expect(helper.ValidateActionInAgent(ctx, 'Search', 'agent-1')).toContain('Ambiguous');
        expect(helper.ValidateActionInAgent(ctx, 'NonExistent', 'agent-1')).toContain('No action');

        expect(helper.ResolveActionEntityForAgent(ctx, '', pool)).toBeUndefined();
        expect(helper.ResolveActionEntityForAgent(ctx, 'export_csv', pool)?.Name).toBe('Export CSV');
        expect(helper.ResolveActionEntityForAgent(ctx, 'Search', pool)).toBeUndefined();
    });

    it('DoesChangeScopeApply and FilterActionChangesForSubAgent propagate scopes accurately', () => {
        const helper = new AgentActionsHelper();
        const ctx = CreateMockAgentRunContext();

        expect(helper.DoesChangeScopeApply(ctx, 'global', 'a1', true)).toBe(true);
        expect(helper.DoesChangeScopeApply(ctx, 'root', 'a1', true)).toBe(true);
        expect(helper.DoesChangeScopeApply(ctx, 'root', 'a1', false)).toBe(false);
        expect(helper.DoesChangeScopeApply(ctx, 'all-subagents', 'a1', false)).toBe(true);
        expect(helper.DoesChangeScopeApply(ctx, 'specific', 'a2', false, ['a1', 'a2'])).toBe(true);
        expect(helper.DoesChangeScopeApply(ctx, 'specific', 'a3', false, ['a1', 'a2'])).toBe(false);

        const changes: ActionChange[] = [
            { scope: 'root', mode: 'add', actionIds: ['x1'] },
            { scope: 'global', mode: 'add', actionIds: ['x2'] },
            { scope: 'all-subagents', mode: 'remove', actionIds: ['x3'] },
            { scope: 'specific', mode: 'add', actionIds: ['x4'], agentIds: ['sub-1'] },
        ];
        const filtered = helper.FilterActionChangesForSubAgent(ctx, changes);
        expect(filtered).toEqual([
            { scope: 'global', mode: 'add', actionIds: ['x2'] },
            { scope: 'global', mode: 'remove', actionIds: ['x3'] },
            { scope: 'specific', mode: 'add', actionIds: ['x4'], agentIds: ['sub-1'] },
        ]);
        expect(helper.FilterActionChangesForSubAgent(ctx, [{ scope: 'root', mode: 'add', actionIds: ['x1'] }])).toBeUndefined();
    });

    it('AppendActionResults handles non-native, paired native tool results with payload result, and orphan summaries', () => {
        const helper = new AgentActionsHelper();
        const pushedTurns: AgentChatMessage[] = [];
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                FormatActionResultsAsMarkdown: (items) => items.map((i) => `${i.actionName}:${i.message}`).join(';'),
                PushToolResultTurn: (_params, msg) => pushedTurns.push(msg),
            },
        });

        // Non-native fallback pushes a single user message
        const nonNativeParams = makeParams();
        const answeredNonNative = helper.AppendActionResults(
            ctx,
            nonNativeParams,
            [makeSummary({ success: true, message: 'ok' })],
            'Action results:\nok',
            undefined,
            { step: 'Actions', terminate: false }
        );
        expect(answeredNonNative.size).toBe(0);
        expect(nonNativeParams.conversationMessages).toHaveLength(1);

        // Native mode pairs actions with toolCallId, includes PayloadToolResult & failure guidance, and emits orphans separately
        const nativeParams = makeParams();
        const pairedSummary = makeSummary({ actionName: 'SearchDocs', success: false, message: 'denied' });
        const orphanSummary = makeSummary({ actionName: 'OrphanAction', success: true, message: 'done' });
        const guidance = new Map<ActionResultSummary, string>([[pairedSummary, '[WARNING] Retry differently']]);
        const decision: BaseAgentNextStep = {
            step: 'Actions',
            terminate: false,
            payloadToolCallId: 'call-payload',
            actions: [{ name: 'SearchDocs', params: {}, toolCallId: 'call-search' }],
            nativeTurn: {
                toolCalls: [{ id: 'call-search', name: 'searchdocs', arguments: {} }],
                sendResultsNatively: true,
            },
        };

        const answeredNative = helper.AppendActionResults(
            ctx,
            nativeParams,
            [pairedSummary, orphanSummary],
            'ignored',
            undefined,
            decision,
            guidance
        );
        expect(answeredNative.has(pairedSummary)).toBe(true);
        expect(answeredNative.has(orphanSummary)).toBe(false);
        expect(pushedTurns).toHaveLength(1);
        expect(Array.isArray(pushedTurns[0].content)).toBe(true);
        expect(nativeParams.conversationMessages).toHaveLength(1);
        expect(String(nativeParams.conversationMessages[0].content)).toContain('OrphanAction:done');
    });

    it('ReconcileUnansweredToolCalls inserts synthetic error results and merges adjacent tool turns', () => {
        const helper = new AgentActionsHelper();
        const ctx = CreateMockAgentRunContext({ PromptTurnCount: 3 });

        const assistantTurn = BuildAssistantToolCallTurn({
            text: 'Running two tools',
            toolCalls: [
                { id: 'c1', name: 'tool_a', arguments: {} },
                { id: 'c2', name: 'tool_b', arguments: {} },
            ],
            sendResultsNatively: true,
        }) as AgentChatMessage;
        const partialResult = BuildToolResultTurn([
            { toolCallId: 'c1', toolName: 'tool_a', content: 'ok', isError: false },
        ]) as AgentChatMessage;

        const messages: ChatMessage[] = [assistantTurn, partialResult];
        const params = makeParams({ conversationMessages: messages });

        helper.ReconcileUnansweredToolCalls(ctx, params);
        // Merged into the single adjacent tool turn after assistantTurn
        expect(messages).toHaveLength(2);
        const answeredIds = helper.ToolCallIdsAnsweredAfter(messages, 0);
        expect(answeredIds.has('c1')).toBe(true);
        expect(answeredIds.has('c2')).toBe(true);

        const stubbed = helper.StubToolTurn(ctx, messages[1] as AgentChatMessage, '[stubbed]');
        expect(JSON.stringify(stubbed.content)).toContain('[stubbed]');
    });

    it('ResolveActionTrustLevel follows precedence: actionTrustLevels > trusted/untrusted lists > action config > Trusted default', () => {
        const policy = new AgentActionPolicyHelper();
        const entity = makeActionEntity({
            Name: 'WebFetch',
            Config_Object: { outputTrustLevel: 'SemiTrusted' },
        });
        const ctx = CreateMockAgentRunContext({
            AgentTypePromptParams: {
                actionTrustLevels: { webfetch: 'Untrusted' },
                trustedActionNames: ['WebFetch'],
            },
        });
        expect(policy.ResolveActionTrustLevel(ctx, 'WebFetch', entity)).toBe('Untrusted');

        const ctxTrusted = CreateMockAgentRunContext({
            AgentTypePromptParams: { trustedActionNames: ['WebFetch'], untrustedActionNames: ['WebFetch'] },
        });
        expect(policy.ResolveActionTrustLevel(ctxTrusted, 'WebFetch', entity)).toBe('Trusted');

        const ctxUntrusted = CreateMockAgentRunContext({
            AgentTypePromptParams: { untrustedActionNames: ['WebFetch'] },
        });
        expect(policy.ResolveActionTrustLevel(ctxUntrusted, 'WebFetch', entity)).toBe('Untrusted');

        const ctxConfig = CreateMockAgentRunContext();
        expect(policy.ResolveActionTrustLevel(ctxConfig, 'WebFetch', entity)).toBe('SemiTrusted');
        expect(policy.ResolveActionTrustLevel(ctxConfig, 'CleanAction', makeActionEntity({ Name: 'CleanAction' }))).toBe(
            'Trusted'
        );
    });

    it('propagates taint across security envelope, parent run, and sub-agents and blocks tainted egress', () => {
        const policy = new AgentActionPolicyHelper();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                RecordTaintedSource: (step, name, level) => policy.RecordTaintedSource(ctx, step, name, level),
            },
        });

        expect(policy.GetHighestRunTaint(ctx)).toBeUndefined();

        policy.RecordTaintedSource(ctx, 1, 'action:ReadNotes', 'SemiTrusted');
        policy.RecordTaintedSource(ctx, 1, 'action:ReadNotes', 'SemiTrusted'); // deduplicated
        expect(ctx.TaintedSources).toHaveLength(1);
        expect(policy.GetHighestRunTaint(ctx)).toEqual({ TrustLevel: 'SemiTrusted', SourceName: 'action:ReadNotes' });

        policy.AbsorbSubAgentTaint(
            ctx,
            'Researcher',
            { taintedSources: [{ stepNumber: 2, sourceName: 'action:WebSearch', trustLevel: 'Untrusted' }] },
            2
        );
        expect(policy.GetHighestRunTaint(ctx)).toEqual({
            TrustLevel: 'Untrusted',
            SourceName: 'sub-agent:Researcher/action:WebSearch',
        });

        const sendEmail = makeActionEntity({
            ID: 'act-send',
            Name: 'SendEmail',
            Config_Object: { disallowWhenTainted: true },
        });
        const paramsWithEnvelope = makeParams({ SecurityEnvelope: { IsRunTainted: true } });
        const blocked: ActionResult | null = policy.CheckTaintedEgress(
            ctx,
            paramsWithEnvelope,
            { name: 'SendEmail', params: { to: 'a@b.com' } },
            sendEmail
        );
        expect(blocked).not.toBeNull();
        expect(blocked?.Success).toBe(false);
        expect(blocked?.ResultCode).toBe(TAINTED_EGRESS_BLOCKED);

        // Without SecurityEnvelope, CheckTaintedEgress returns null
        expect(policy.CheckTaintedEgress(ctx, makeParams(), { name: 'SendEmail', params: {} }, sendEmail)).toBeNull();
    });

    it('CheckStructuralAudienceAction blocks unsupported actions under ScopeCommonReach and locks out unless skipBreaker', () => {
        const policy = new AgentActionPolicyHelper();
        const lockOutSpy = vi.fn();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                ResolveActionSupportsAudience: () => false,
                LockOutAction: lockOutSpy,
            },
        });
        const runtimeEntity = makeActionEntity({ Name: 'CustomRuntimeAction', Type: 'Runtime' });
        const params = makeParams({ Audience: { Mode: 'ScopeCommonReach' } });

        const refused = policy.CheckStructuralAudienceAction(
            ctx,
            params,
            { name: 'CustomRuntimeAction', params: {} },
            runtimeEntity,
            undefined,
            false
        );
        expect(refused).not.toBeNull();
        expect(refused?.ResultCode).toBe(AUDIENCE_UNSUPPORTED_RESULT_CODE);
        expect(refused?.Message).toContain('runtime-defined action');
        expect(lockOutSpy).toHaveBeenCalledTimes(1);

        // Allowed when action declares audience support
        const supportedCtx = CreateMockAgentRunContext({
            Hooks: { ResolveActionSupportsAudience: () => true },
        });
        expect(
            policy.CheckStructuralAudienceAction(
                supportedCtx,
                params,
                { name: 'CustomRuntimeAction', params: {} },
                runtimeEntity,
                undefined,
                false
            )
        ).toBeNull();
    });

    it('ResolveRunAudience & AudienceReadersFor reject unscoped ScopeCommonReach, cache readers, and fail closed on missing users', async () => {
        const policy = new AgentActionPolicyHelper();
        const ctx = CreateMockAgentRunContext();

        const unscoped = await policy.ResolveRunAudience(ctx, makeParams({ Audience: { Mode: 'ScopeCommonReach' } }));
        expect('Error' in unscoped).toBe(true);

        const scopedCtx = CreateMockAgentRunContext({
            RunScope: { PrimaryScopeEntityName: 'Accounts', PrimaryScopeRecordID: 'acc-1', SecondaryScopes: null },
        });
        const scoped = await policy.ResolveRunAudience(
            scopedCtx,
            makeParams({ Audience: { Mode: 'ScopeCommonReach' } })
        );
        expect(scoped).toEqual({ Readers: [] });

        const readerA = { ID: '11111111-1111-4111-8111-111111111111', Email: 'a@test.com' } as UserInfo;
        const resolveUsers = vi.fn(async () => [readerA]);
        const cachedCtx = CreateMockAgentRunContext({
            Hooks: { ResolveAudienceUsers: resolveUsers },
        });
        const audienceObj = {
            Mode: 'Intersection' as const,
            UserIDs: ['11111111-1111-4111-8111-111111111111'],
        };
        const first = await policy.AudienceReadersFor(cachedCtx, makeParams({ Audience: audienceObj }));
        const second = await policy.AudienceReadersFor(cachedCtx, makeParams({ Audience: audienceObj }));
        expect(first).toEqual({ Readers: [readerA] });
        expect(second).toEqual({ Readers: [readerA] });
        expect(resolveUsers).toHaveBeenCalledTimes(1);

        const missingUser = await policy.ResolveRunAudience(
            cachedCtx,
            makeParams({
                Audience: {
                    Mode: 'Intersection',
                    UserIDs: ['22222222-2222-4222-8222-222222222222'],
                },
            })
        );
        expect('Error' in missingUser).toBe(true);
    });

    it('withholds task graphs, handoff, client tools, and realtime sessions under audience/scope/taint constraints', () => {
        const policy = new AgentActionPolicyHelper();
        const ctx = CreateMockAgentRunContext({
            Hooks: { RunAudienceAddsReader: () => true },
        });
        const params = makeParams();

        expect(policy.SessionAudienceRefusal(ctx, params)).toContain('session-driven');
        const clientRefusal = policy.ClientToolsRefusal(ctx, params, { step: 'ClientTools', terminate: false });
        expect(clientRefusal?.step).toBe('Failed');
        expect(clientRefusal?.terminate).toBe(true);

        const tgRefusal = policy.TaskGraphRefusal(ctx, params, { step: 'Tasks', terminate: false });
        expect(tgRefusal?.step).toBe('Failed');
        expect(tgRefusal?.errorMessage).toContain('audience');

        expect(policy.PromptWithholding(ctx, params)).toEqual({
            TaskGraphs: true,
            Handoff: true,
            CallerContext: true,
        });

        expect(policy.WithoutTaskGraphs(ctx, { enableTaskGraphs: true, includeResponseTypeDefinition: { tasks: true, chat: true } })).toEqual({
            enableTaskGraphs: false,
            includeResponseTypeDefinition: { tasks: false, chat: true },
        });
        expect(policy.WithoutHandoff(ctx, { enableHandoff: true, includeResponseTypeDefinition: { handoff: true } })).toEqual({
            enableHandoff: false,
            includeResponseTypeDefinition: { handoff: false },
        });
    });

    it('validates secondary scopes, deduplicates search scopes, stamps action context, and collects policy chain', () => {
        const policy = new AgentActionPolicyHelper();
        const ctx = CreateMockAgentRunContext({
            ResolvedStorageAccountId: 'storage-9',
            Hooks: { ActiveSkillIDsForRun: () => ['skill-1'] },
        });
        const agent = makeAgent({
            ScopeConfig: JSON.stringify({
                dimensions: [
                    { name: 'region', required: true, defaultValue: 'us-east' },
                    { name: 'tier', required: false, defaultValue: 'free' },
                ],
                strictValidation: true,
            }),
        });
        const params = makeParams({
            agent,
            conversationId: 'conv-42',
            PrimaryScopeEntityName: '  Accounts  ',
            PrimaryScopeRecordID: 'acc-99',
            SecondaryScopes: { tier: 'pro' },
            SearchScopeIDs: [
                'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
                'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                '   ',
            ],
            policyCeilingAgentIDs: ['30000000-0000-4000-8000-000000000003'],
        });

        const scope = policy.ValidatedRunScope(ctx, params);
        expect(scope.PrimaryScopeEntityName).toBe('Accounts');
        expect(scope.PrimaryScopeRecordID).toBe('acc-99');
        expect(scope.SecondaryScopes).toEqual({ tier: 'pro', region: 'us-east' });
        expect(scope.SearchScopeIDs).toEqual(['AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA']);

        const stamped = policy.StampActionContext(ctx, params);
        expect(stamped.AgentID).toBe(agent.ID);
        expect(stamped.AgentRunID).toBe(ctx.AgentRun?.ID);
        expect(stamped.ConversationID).toBe('conv-42');
        expect(stamped.ActiveSkillIDs).toEqual(['skill-1']);
        expect(stamped.__resolvedStorageAccountId).toBe('storage-9');

        const chain = policy.CollectPolicyAgentChain(ctx, params);
        expect(chain).toEqual([agent.ID, '30000000-0000-4000-8000-000000000003']);

        // Malformed ScopeConfig JSON returns null cleanly
        expect(policy.ParseSecondaryScopeConfig(ctx, makeAgent({ ScopeConfig: '{not-json' }))).toBeNull();
    });

    it('ExecuteActionsStep short-circuits on exceeded tree budget and handles pre-aborted AbortSignal', async () => {
        const helper = new AgentActionsHelper();
        const budgetCtx = CreateMockAgentRunContext({
            Hooks: {
                CheckTreeBudgetLimit: () => ({ exceeded: true, reason: 'Step budget exceeded' }),
            },
        });
        const budgetRes = await helper.ExecuteActionsStep(
            budgetCtx,
            makeParams(),
            { step: 'Actions', terminate: false, actions: [{ name: 'SearchDocs', params: {} }] },
            'parent-step-1'
        );
        expect(budgetRes.step).toBe('Failed');
        expect(budgetRes.terminate).toBe(true);
        expect(budgetRes.errorMessage).toContain('Step budget exceeded');

        const abortController = new AbortController();
        abortController.abort('user cancelled');
        const abortCtx = CreateMockAgentRunContext();
        const abortRes = await helper.ExecuteActionsStep(
            abortCtx,
            makeParams({ cancellationToken: abortController.signal }),
            { step: 'Actions', terminate: false, actions: [{ name: 'SearchDocs', params: {} }] },
            'parent-step-2'
        );
        expect(abortRes.step).toBe('Retry');
        expect(abortRes.terminate).toBe(false);
        expect(abortRes.errorMessage).toContain('Cancelled before action execution');
    });
});
