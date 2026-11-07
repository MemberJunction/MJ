/**
 * BaseAgent and taint inside a task graph:
 *
 * - S2: a sub-agent starts tainted when its parent is (the same `SecurityEnvelope.IsRunTainted` seed a graph's
 *   agent node uses), keeps the parent's node envelope, and the parent absorbs the child's taint back.
 * - M1: a run under a task-graph envelope refuses a `disallowWhenTainted` action once it is tainted, whenever the
 *   taint arrived — not only when it started tainted.
 *
 * The BaseAgent logic is real; the action engine and the sub-agent runner are the boundaries.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import {
    TAINTED_EGRESS_BLOCKED,
    TASK_SECURITY_ENVELOPE_VERSION,
    type AgentAction,
    type AgentSubAgentRequest,
    type AgentTaintedSource,
    type ExecuteAgentParams,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunStepEntityExtended,
    type TaskSecurityEnvelope,
} from '@memberjunction/ai-core-plus';
import type { MJActionEntityExtended } from '@memberjunction/actions-base';

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
    /** What the next sub-agent run reports it ingested. */
    childTaint: [] as AgentTaintedSource[],
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
            return { success: true, agentRun: { ID: 'child-run-id' }, payload: {}, taintedSources: [...h.childTaint] };
        };
    },
}));

import { BaseAgent } from '../base-agent';

const CALLER = new UserInfo(undefined, { ID: 'aaaaaaaa-0000-4000-8000-0000000000c7', Name: 'Caller', Email: 'caller@test.mj', UserRoles: [] });
const SEND_EMAIL = { ID: 'aaaaaaaa-0000-4000-8000-0000000000e1', Name: 'Send Email', Params: { Items: [] }, Config_Object: { disallowWhenTainted: true } } as unknown as MJActionEntityExtended;
const SEARCH = { ID: 'aaaaaaaa-0000-4000-8000-0000000000e2', Name: 'Search', Params: { Items: [] }, Config_Object: null } as unknown as MJActionEntityExtended;
const EMAIL: AgentAction = { name: 'Send Email', params: { To: 'someone@example.com' } };
const CLEAN_NODE: TaskSecurityEnvelope = { Version: TASK_SECURITY_ENVELOPE_VERSION, IsRunTainted: false };
const SCOPED_NODE: TaskSecurityEnvelope = {
    Version: TASK_SECURITY_ENVELOPE_VERSION,
    IsRunTainted: false,
    RunScope: { PrimaryScopeEntityName: 'Organizations', PrimaryScopeRecordID: 'org-1', SecondaryScopes: null },
};

function paramsWith(extra: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    const agent = { ID: 'aaaaaaaa-0000-4000-8000-0000000000a1', Name: 'Parent' } as unknown as MJAIAgentEntityExtended;
    return { agent, conversationMessages: [{ role: 'user', content: 'hello' }], contextUser: CALLER, ...extra };
}

/** A BaseAgent a test can taint and whose protected sub-agent call it can make. */
class TaintableAgent extends BaseAgent {
    public ReadUntrusted(): void {
        this.recordTaintedSource(1, 'Web Page Fetch', 'Untrusted');
    }

    public async CallSubAgent(params: ExecuteAgentParams): Promise<void> {
        const child = { ID: 'child-agent-id', Name: 'Child', Status: 'Active' } as unknown as MJAIAgentEntityExtended;
        const step = { ID: 'step-1', StepNumber: 3, TargetLogID: null } as unknown as MJAIAgentRunStepEntityExtended;
        const request: AgentSubAgentRequest = { name: 'Child', message: 'go', terminateAfter: false };
        await this.ExecuteSubAgent(params, request, child, step);
    }
}

describe('BaseAgent sub-agents and taint (S2)', () => {
    beforeEach(() => {
        h.childRuns.length = 0;
        h.childTaint.length = 0;
    });

    const childEnvelope = (): TaskSecurityEnvelope | undefined => h.childRuns[0].SecurityEnvelope as TaskSecurityEnvelope | undefined;

    it('starts the sub-agent tainted when the parent is tainted', async () => {
        const parent = new TaintableAgent();
        parent.ReadUntrusted();
        await parent.CallSubAgent(paramsWith());
        expect(childEnvelope()).toEqual({ Version: TASK_SECURITY_ENVELOPE_VERSION, IsRunTainted: true });
    });

    it("keeps the parent's node envelope for the sub-agent, tainted once the parent became tainted", async () => {
        const parent = new TaintableAgent();
        await parent.CallSubAgent(paramsWith({ SecurityEnvelope: SCOPED_NODE }));
        expect(childEnvelope()).toEqual(SCOPED_NODE);

        h.childRuns.length = 0;
        parent.ReadUntrusted();
        await parent.CallSubAgent(paramsWith({ SecurityEnvelope: SCOPED_NODE }));
        expect(childEnvelope()).toEqual({ ...SCOPED_NODE, IsRunTainted: true });
    });

    it('gives a clean parent with no envelope a sub-agent with none', async () => {
        await new TaintableAgent().CallSubAgent(paramsWith());
        expect(childEnvelope()).toBeUndefined();
    });

    it("absorbs the sub-agent's taint back into the parent", async () => {
        const parent = new TaintableAgent();
        h.childTaint.push({ stepNumber: 2, sourceName: 'Web Search', trustLevel: 'Untrusted' });
        await parent.CallSubAgent(paramsWith());
        expect(parent.IsRunTainted).toBe(true);
        expect(parent.TaintedSources.map((s) => s.sourceName)).toEqual(['sub-agent:Child/Web Search']);
    });
});

describe('BaseAgent egress gate on taint gained mid-run (M1)', () => {
    beforeEach(() => {
        h.dispatched.length = 0;
    });

    const send = (agent: BaseAgent, params: ExecuteAgentParams, entity: MJActionEntityExtended = SEND_EMAIL) =>
        agent.ExecuteSingleAction(params, EMAIL, entity, CALLER, { skipCircuitBreaker: true });

    it('refuses a disallowWhenTainted action once a graph node becomes tainted, without dispatching it', async () => {
        const agent = new TaintableAgent();
        expect((await send(agent, paramsWith({ SecurityEnvelope: CLEAN_NODE }))).Success).toBe(true);
        agent.ReadUntrusted();
        const refused = await send(agent, paramsWith({ SecurityEnvelope: CLEAN_NODE }));
        expect(refused.Success).toBe(false);
        expect(refused.ResultCode).toBe(TAINTED_EGRESS_BLOCKED);
        expect(h.dispatched).toHaveLength(1);
    });

    it('still runs an action that is not disallowWhenTainted', async () => {
        const agent = new TaintableAgent();
        agent.ReadUntrusted();
        expect((await send(agent, paramsWith({ SecurityEnvelope: CLEAN_NODE }), SEARCH)).Success).toBe(true);
        expect(h.dispatched).toHaveLength(1);
    });

    it('leaves a run outside any task graph to its own policies', async () => {
        const agent = new TaintableAgent();
        agent.ReadUntrusted();
        expect((await send(agent, paramsWith())).Success).toBe(true);
    });
});
