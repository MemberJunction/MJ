/**
 * BaseAgent and a run's scope (A12.14): the scope every action dispatch is handed (`RunActionParams.RunScope`), and
 * the sub-agent build that keeps the model from setting a child's scope through `templateParameters`.
 *
 * - `ExecuteSingleAction` called outside `Execute` (the realtime tool path, harnesses) resolves the scope from its
 *   params the way the run row does — explicit fields, else the `data` fallbacks, with the agent's configured
 *   secondary defaults — and always stamps it (nulls when unscoped). The full-run path, where the scope comes from
 *   `initializeAgentRun`, is in base-agent-loop.test.ts.
 * - `ExecuteSubAgent` strips the reserved run-data keys from the model's template parameters before they are merged
 *   into the child's `data`, keeps everything else, leaves the parent's `data` as it is, and logs the keys once.
 *
 * The BaseAgent logic and the reserved-key list are real; the action engine, the metadata engine and the sub-agent
 * runner are the boundaries.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogStatus, UserInfo } from '@memberjunction/core';
import type {
    AgentAction, AgentSubAgentRequest, ExecuteAgentParams, MJAIAgentEntityExtended, MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import { RESERVED_AGENT_RUN_DATA_KEYS } from '@memberjunction/ai-core-plus';
import type { ActionRunScope, MJActionEntityExtended, RunActionParams } from '@memberjunction/actions-base';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn(), LogStatusEx: vi.fn(), LogErrorEx: vi.fn(), IsVerboseLoggingEnabled: vi.fn(() => false) };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return { Config: async (): Promise<void> => undefined, Agents: [], AgentRelationships: [], AgentActions: [], GetSubAgents: (): unknown[] => [] };
        },
    },
}));

const h = vi.hoisted(() => ({
    /** Every RunActionParams the mocked engine received. */
    dispatched: [] as Array<Record<string, unknown>>,
    /** Every ExecuteAgentParams the mocked sub-agent runner received. */
    childRuns: [] as Array<Record<string, unknown>>,
}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
    ActionEngineServer: {
        get Instance() {
            return {
                RunAction: async (input: Record<string, unknown>): Promise<Record<string, unknown>> => {
                    h.dispatched.push(input);
                    return { Success: true, ResultCode: 'SUCCESS', Message: 'ok', Params: [], RunParams: input };
                },
            };
        },
    },
}));

vi.mock('../AgentRunner', () => ({
    AgentRunner: class {
        RunAgent = async (input: Record<string, unknown>): Promise<Record<string, unknown>> => {
            h.childRuns.push(input);
            return { success: true, agentRun: { ID: 'child-run-id' }, payload: {} };
        };
    },
}));

import { BaseAgent } from '../base-agent';

const TENANT = 'aaaaaaaa-0000-4000-8000-0000000000a7';
const CALLER = new UserInfo(undefined, { ID: 'aaaaaaaa-0000-4000-8000-0000000000c7', Name: 'Caller', Email: 'caller@test.mj', UserRoles: [] });
const ACTION_ENTITY = { ID: 'aaaaaaaa-0000-4000-8000-0000000000f7', Name: 'Scoped Search', Params: { Items: [] } } as unknown as MJActionEntityExtended;
const ACTION: AgentAction = { name: 'Scoped Search', params: { Query: 'refund policy' } };

function agentRow(scopeConfig: string | null = null): MJAIAgentEntityExtended {
    return { ID: 'aaaaaaaa-0000-4000-8000-0000000000a1', Name: 'Scoped Agent', ScopeConfig: scopeConfig } as unknown as MJAIAgentEntityExtended;
}

function paramsWith(extra: Partial<ExecuteAgentParams> = {}, scopeConfig: string | null = null): ExecuteAgentParams {
    return { agent: agentRow(scopeConfig), conversationMessages: [{ role: 'user', content: 'hello' }], contextUser: CALLER, ...extra };
}

/** A BaseAgent whose protected sub-agent build a test can call. */
class SubAgentCaller extends BaseAgent {
    public async CallSubAgent(params: ExecuteAgentParams, request: AgentSubAgentRequest): Promise<void> {
        const child = { ID: 'child-agent-id', Name: 'Child', Status: 'Active' } as unknown as MJAIAgentEntityExtended;
        const step = { ID: 'step-1', TargetLogID: null } as unknown as MJAIAgentRunStepEntityExtended;
        await this.ExecuteSubAgent(params, request, child, step);
    }
}

describe('BaseAgent — the run scope on every action dispatch (RunActionParams.RunScope)', () => {
    let agent: BaseAgent;
    const dispatch = (params: ExecuteAgentParams) => agent.ExecuteSingleAction(params, ACTION, ACTION_ENTITY, CALLER, { skipCircuitBreaker: true });
    const lastScope = (): ActionRunScope | undefined => (h.dispatched[h.dispatched.length - 1] as Partial<RunActionParams>).RunScope;

    beforeEach(() => {
        h.dispatched.length = 0;
        agent = new BaseAgent();
    });

    it('called directly, stamps the scope resolved from its params: tenant, entity and secondary dimensions', async () => {
        await dispatch(paramsWith({ PrimaryScopeEntityName: 'Organizations', PrimaryScopeRecordID: TENANT, SecondaryScopes: { Region: 'EMEA', Tags: ['a'] } }));
        expect(lastScope()).toEqual({
            PrimaryScopeEntityName: 'Organizations', PrimaryScopeRecordID: TENANT, SecondaryScopes: { Region: 'EMEA', Tags: ['a'] },
        });
    });

    it('an unscoped run still stamps a RunScope — nulls, which an action reads as "inside a run with no tenant"', async () => {
        await dispatch(paramsWith());
        expect(lastScope()).toEqual({ PrimaryScopeEntityName: null, PrimaryScopeRecordID: null, SecondaryScopes: null });
    });

    it('reads the scope from data when the host passed it there (the GraphQL fallback the run row uses)', async () => {
        await dispatch(paramsWith({ data: { PrimaryScopeRecordID: ` ${TENANT} `, SecondaryScopes: { Region: 'US' } } }));
        expect(lastScope()).toMatchObject({ PrimaryScopeRecordID: TENANT, SecondaryScopes: { Region: 'US' } });
    });

    it("the explicit params win over data, as they do for the run row", async () => {
        await dispatch(paramsWith({ PrimaryScopeRecordID: TENANT, data: { PrimaryScopeRecordID: 'aaaaaaaa-0000-4000-8000-0000000000ff' } }));
        expect(lastScope()?.PrimaryScopeRecordID).toBe(TENANT);
    });

    it("applies the agent's configured secondary defaults, as the run row records them", async () => {
        const config = JSON.stringify({ dimensions: [{ name: 'Region', defaultValue: 'EMEA' }], allowSecondaryOnly: true });
        await dispatch(paramsWith({ PrimaryScopeRecordID: TENANT, SecondaryScopes: { Team: 'alpha' } }, config));
        expect(lastScope()?.SecondaryScopes).toEqual({ Team: 'alpha', Region: 'EMEA' });
    });

    it('prefers the scope the run recorded (initializeAgentRun) over the params, while a run is in progress', async () => {
        const recorded: ActionRunScope = { PrimaryScopeEntityName: null, PrimaryScopeRecordID: TENANT, SecondaryScopes: { Region: 'EMEA' } };
        (agent as unknown as { _runScope: ActionRunScope })._runScope = recorded;
        await dispatch(paramsWith({ PrimaryScopeRecordID: 'aaaaaaaa-0000-4000-8000-0000000000ff' }));
        expect(lastScope()).toEqual({ PrimaryScopeEntityName: null, PrimaryScopeRecordID: TENANT, SecondaryScopes: { Region: 'EMEA' } });
    });

    it('hands each dispatch its own copy: an action that mutates it cannot change what the next one sees', async () => {
        const params = paramsWith({ PrimaryScopeRecordID: TENANT, SecondaryScopes: { Tags: ['a'] } });
        await dispatch(params);
        const first = lastScope()!;
        first.PrimaryScopeRecordID = 'tampered';
        (first.SecondaryScopes!.Tags as string[]).push('b');
        await dispatch(params);
        expect(lastScope()).toEqual({ PrimaryScopeEntityName: null, PrimaryScopeRecordID: TENANT, SecondaryScopes: { Tags: ['a'] } });
        expect(params.SecondaryScopes).toEqual({ Tags: ['a'] });
    });

    it('puts the scope on the dispatch only — never on the shared action context', async () => {
        const context: Record<string, unknown> = {};
        await dispatch(paramsWith({ PrimaryScopeRecordID: TENANT, context }));
        expect(Object.keys(context)).not.toContain('RunScope');
        expect(JSON.stringify(context)).not.toContain(TENANT);
    });
});

describe('BaseAgent.ExecuteSubAgent — template parameters cannot set the child run scope', () => {
    const caller = (): SubAgentCaller => new SubAgentCaller();
    const childData = (): Record<string, unknown> => h.childRuns[0].data as Record<string, unknown>;
    const request = (templateParameters: Record<string, string>): AgentSubAgentRequest =>
        ({ name: 'Child', message: 'go', terminateAfter: false, templateParameters });

    beforeEach(() => {
        h.childRuns.length = 0;
        vi.mocked(LogStatus).mockClear();
    });

    it("strips every reserved key from the model's template parameters and keeps the rest", async () => {
        const hostile: Record<string, string> = Object.fromEntries(RESERVED_AGENT_RUN_DATA_KEYS.map((key) => [key, 'aaaaaaaa-0000-4000-8000-0000000000bb']));
        await caller().CallSubAgent(paramsWith(), request({ ...hostile, topic: 'refunds' }));
        expect(h.childRuns).toHaveLength(1);
        for (const key of RESERVED_AGENT_RUN_DATA_KEYS) {
            expect(childData()).not.toHaveProperty(key);
        }
        expect(childData().topic).toBe('refunds');
    });

    it("the parent's scope in data reaches the child as it is, and the model cannot override it", async () => {
        const parentData = { PrimaryScopeRecordID: TENANT, SecondaryScopes: { Region: 'EMEA' }, conversationId: 'conv-1' };
        const snapshot = JSON.parse(JSON.stringify(parentData));
        await caller().CallSubAgent(paramsWith({ data: parentData }), request({
            PrimaryScopeRecordID: 'aaaaaaaa-0000-4000-8000-0000000000bb', SecondaryScopes: '{"Region":"US"}', topic: 'refunds',
        }));
        expect(childData()).toEqual({ PrimaryScopeRecordID: TENANT, SecondaryScopes: { Region: 'EMEA' }, conversationId: 'conv-1', topic: 'refunds' });
        expect(parentData).toEqual(snapshot);
    });

    it('logs the stripped keys once, never their values', async () => {
        const secret = 'aaaaaaaa-0000-4000-8000-0000000000bb';
        await caller().CallSubAgent(paramsWith(), request({ PrimaryScopeRecordID: secret, __agentTypePromptParams: '{}' }));
        const messages = vi.mocked(LogStatus).mock.calls.map((c) => String(c[0])).filter((m) => m.includes('reserved key'));
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain('PrimaryScopeRecordID');
        expect(messages[0]).toContain('__agentTypePromptParams');
        expect(messages[0]).not.toContain(secret);
    });

    it('logs nothing and passes ordinary template parameters through untouched', async () => {
        await caller().CallSubAgent(paramsWith({ data: { a: 1 } }), request({ topic: 'refunds' }));
        expect(childData()).toEqual({ a: 1, topic: 'refunds' });
        expect(vi.mocked(LogStatus).mock.calls.some((c) => String(c[0]).includes('reserved key'))).toBe(false);
    });
});
