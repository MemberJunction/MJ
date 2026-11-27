import { describe, expect, it } from 'vitest';
import type { ActionResult, MJActionEntityExtended } from '@memberjunction/actions-base';
import type { ExecuteAgentParams, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AgentActionPolicyHelper } from '../helpers/actions/AgentActionPolicyHelper';
import { AgentActionsHelper } from '../helpers/actions/AgentActionsHelper';
import { BaseAgentActionPolicyHelper } from '../helpers/actions/BaseAgentActionPolicyHelper';
import { BaseAgentActionsHelper } from '../helpers/actions/BaseAgentActionsHelper';
import { ResolveAgentHelper } from '../helpers/AgentHelperResolver';
import { CreateMockAgentRunContext } from './helpers/mock-agent-run-context';

describe('AgentActionPolicyHelper & AgentActionsHelper (Slice s8)', () => {
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

    it('resolves default AgentActionsHelper via ClassFactory', () => {
        const helper = ResolveAgentHelper({
            SeamKey: 'actions',
            BaseClass: BaseAgentActionsHelper,
            DefaultClass: AgentActionsHelper,
        });
        expect(helper).toBeInstanceOf(AgentActionsHelper);
    });

    it('normalizes nested action parameter keys deterministically regardless of key order', () => {
        const helper = new AgentActionsHelper();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                NormalizeActionParamEntry: (key, value) => helper.NormalizeActionParamEntry(ctx, key, value),
                NormalizeActionParamValue: (value) => helper.NormalizeActionParamValue(ctx, value),
            },
        });

        const a = helper.NormalizeActionParams(ctx, { z: 1, a: { d: 4, b: 2 } });
        const b = helper.NormalizeActionParams(ctx, { a: { b: 2, d: 4 }, z: 1 });
        expect(a).toBe(b);
    });

    it('blocks identical failing action retries on threshold via run-scoped circuit breaker', () => {
        const helper = new AgentActionsHelper();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                IsFatalActionError: (msg, p) => helper.IsFatalActionError(ctx, msg, p),
                HasCredentialShapedArguments: (p) => helper.HasCredentialShapedArguments(ctx, p),
                BuildBlockedActionResult: (e, r, m) => helper.BuildBlockedActionResult(ctx, e, r, m),
            },
        });
        const actionEntity = { ID: 'act-1', Name: 'SearchDocs' } as MJActionEntityExtended;
        const action = { name: 'SearchDocs', params: { query: 'test' } };
        const params = {
            agent: { ID: 'agent-1', Name: 'TestAgent' } as MJAIAgentEntityExtended,
            conversationMessages: [],
        } as ExecuteAgentParams;

        helper.RecordActionFailure(ctx, action, actionEntity, 'Not found', '{"query":"test"}');
        expect(helper.CheckActionCircuitBreaker(ctx, params, action, actionEntity, '{"query":"test"}')).toBeNull();

        helper.RecordActionFailure(ctx, action, actionEntity, 'Not found', '{"query":"test"}');
        const blocked = helper.CheckActionCircuitBreaker(ctx, params, action, actionEntity, '{"query":"test"}');
        expect(blocked).not.toBeNull();
        expect(blocked?.Reason).toBe('identical-arguments');
    });

    it('blocks tainted egress under a task-graph security envelope', () => {
        const policy = new AgentActionPolicyHelper();
        const ctx = CreateMockAgentRunContext();
        policy.RecordTaintedSource(ctx, 1, 'action:WebSearch', 'Untrusted');

        const actionEntity = {
            ID: 'act-send',
            Name: 'SendEmail',
            Config_Object: { disallowWhenTainted: true },
        } as MJActionEntityExtended;
        const params = {
            agent: { ID: 'agent-1', Name: 'TestAgent' } as MJAIAgentEntityExtended,
            conversationMessages: [],
            SecurityEnvelope: { IsRunTainted: true },
        } as ExecuteAgentParams;

        const blocked: ActionResult | null = policy.CheckTaintedEgress(
            ctx,
            params,
            { name: 'SendEmail', params: { to: 'a@b.com' } },
            actionEntity
        );
        expect(blocked).not.toBeNull();
        expect(blocked?.Success).toBe(false);
        expect(blocked?.ResultCode).toBe('TAINTED_EGRESS_BLOCKED');
    });
});
