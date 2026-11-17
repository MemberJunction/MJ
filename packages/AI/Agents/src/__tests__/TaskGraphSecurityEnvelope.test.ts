/**
 * BaseAgent's task-graph gate and the security envelope it submits (WS-4.1, S1): which runs may use
 * graphs, that the prompt and the step gate agree, and that the envelope carries the run exactly.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { TenantContext, UserInfo } from '@memberjunction/core';
import {
    RegisterTaskGraphSubmitter,
    TASK_SECURITY_ENVELOPE_VERSION,
    TaskGraphSubmitter,
    type ExecuteAgentParams,
    type TaskGraphSubmitOutcome,
    type TaskGraphSubmitRequest,
} from '@memberjunction/ai-core-plus';
import { BaseAgent } from '../base-agent';

const CALLER_USER = { ID: '00000000-0000-4000-8000-000000000010', Name: 'Caller', IsActive: true } as UserInfo;
const READER_USER_ID = '00000000-0000-4000-8000-000000000020';
const ACTION_ID = '33333333-3333-4333-8333-333333333333';
const SEARCH_SCOPE_ID = '44444444-4444-4444-8444-444444444444';

class RecordingSubmitter extends TaskGraphSubmitter {
    public LastRequest: TaskGraphSubmitRequest | null = null;
    public async Submit(request: TaskGraphSubmitRequest): Promise<TaskGraphSubmitOutcome> {
        this.LastRequest = request;
        return { Success: true, ParentTaskID: 'parent-task', TaskIDByTempID: new Map([['t1', 'task-row-1']]) };
    }
}

class EnvelopeSubmitter extends RecordingSubmitter {
    public override readonly SupportsSecurityEnvelope = true;
}

type AgentInternals = {
    taskGraphWithholdingReason: (p: ExecuteAgentParams) => string | null;
    promptWithholding: (p: ExecuteAgentParams) => { TaskGraphs: boolean };
    executeTasksStep: (p: ExecuteAgentParams, prev: unknown) => Promise<{ step: string; errorMessage?: string }>;
    seedTaintFromSecurityEnvelope: (p: ExecuteAgentParams) => void;
    recordTaintedSource: (stepNumber: number, sourceName: string, trustLevel: 'Untrusted') => void;
    createStepEntity: ReturnType<typeof vi.fn>;
    finalizeStepEntity: ReturnType<typeof vi.fn>;
};

function agentInternals(): { agent: BaseAgent; internals: AgentInternals } {
    const agent = new BaseAgent();
    const internals = agent as unknown as AgentInternals;
    internals.createStepEntity = vi.fn().mockResolvedValue(null);
    internals.finalizeStepEntity = vi.fn().mockResolvedValue(undefined);
    return { agent, internals };
}

function params(extra: Partial<ExecuteAgentParams> & { contextUser?: UserInfo } = {}): ExecuteAgentParams {
    return {
        agent: { ID: 'a1', Name: 'TestAgent' },
        conversationMessages: [],
        contextUser: CALLER_USER,
        ...extra,
    } as unknown as ExecuteAgentParams;
}

function userWithTenant(tenant: TenantContext): UserInfo {
    return { ...CALLER_USER, TenantContext: tenant } as UserInfo;
}

const TASKS_STEP = {
    step: 'Tasks',
    taskGraph: { spec: { workflowName: 'W', tasks: [{ tempId: 't1', name: 'Step 1', description: 'd' }] } },
    previousPayload: {},
    newPayload: {},
};

const CONSTRAINED_RUNS: Array<[string, Partial<ExecuteAgentParams> & { contextUser?: UserInfo }]> = [
    ['an audience', { Audience: { Mode: 'Intersection', UserIDs: [READER_USER_ID] } }],
    ['a tenant', { PrimaryScopeEntityName: 'MJ: Organizations', PrimaryScopeRecordID: 'org-1' }],
    ['host-assigned search scopes', { SearchScopeIDs: [SEARCH_SCOPE_ID] }],
    ['bound parameters', { boundActionParams: { [ACTION_ID]: { OrganizationID: 'org-1' } } }],
    ["the caller's tenant context", { contextUser: userWithTenant({ TenantID: 'org-1', Source: 'header' }) }],
    ['tainted input from its task-graph node', { SecurityEnvelope: { Version: TASK_SECURITY_ENVELOPE_VERSION, IsRunTainted: true } }],
];

describe('BaseAgent task-graph gate (S1)', () => {
    afterEach(() => RegisterTaskGraphSubmitter(null));

    it.each(CONSTRAINED_RUNS)('withholds graphs from a run with %s when the submitter does not enforce envelopes', async (_label, extra) => {
        RegisterTaskGraphSubmitter(new RecordingSubmitter());
        const { internals } = agentInternals();
        const p = params(extra);
        expect(internals.taskGraphWithholdingReason(p)).not.toBeNull();
        // The prompt and the step gate read the same predicate, so they agree.
        expect(internals.promptWithholding(p).TaskGraphs).toBe(true);
        expect((await internals.executeTasksStep(p, TASKS_STEP)).step).toBe('Failed');
    });

    it('never lets a caller-supplied envelope open the gate', async () => {
        const submitter = new RecordingSubmitter();
        RegisterTaskGraphSubmitter(submitter);
        const { internals } = agentInternals();
        const p = params({
            PrimaryScopeEntityName: 'MJ: Organizations',
            PrimaryScopeRecordID: 'org-1',
            SecurityEnvelope: { Version: TASK_SECURITY_ENVELOPE_VERSION, IsRunTainted: false },
        });
        expect(internals.taskGraphWithholdingReason(p)).toBe('a tenant-scoped run');
        expect((await internals.executeTasksStep(p, TASKS_STEP)).step).toBe('Failed');
        expect(submitter.LastRequest).toBeNull();
    });

    it.each(CONSTRAINED_RUNS)('offers graphs to a run with %s when the submitter enforces envelopes', (_label, extra) => {
        RegisterTaskGraphSubmitter(new EnvelopeSubmitter());
        const { internals } = agentInternals();
        const p = params(extra);
        expect(internals.taskGraphWithholdingReason(p)).toBeNull();
        expect(internals.promptWithholding(p).TaskGraphs).toBe(false);
    });

    it('withholds graphs from a run that became tainted when the submitter would drop the taint (M2)', async () => {
        RegisterTaskGraphSubmitter(new RecordingSubmitter());
        const { internals } = agentInternals();
        internals.recordTaintedSource(1, 'Web Page Fetch', 'Untrusted');
        expect(internals.taskGraphWithholdingReason(params())).toBe('a run that ingested untrusted content');
        expect((await internals.executeTasksStep(params(), TASKS_STEP)).step).toBe('Failed');
    });

    it('still withholds graphs when the tenant context cannot travel in an envelope', () => {
        RegisterTaskGraphSubmitter(new EnvelopeSubmitter());
        const { internals } = agentInternals();
        const tenant = { TenantID: 'org-1', Source: 'custom', ResolvedAt: new Date() } as TenantContext;
        expect(internals.taskGraphWithholdingReason(params({ contextUser: userWithTenant(tenant) }))).toContain('cannot be carried');
    });

    it('submits an envelope that carries the run exactly: scope with search scopes, readers, bindings, tenant, taint', async () => {
        const submitter = new EnvelopeSubmitter();
        RegisterTaskGraphSubmitter(submitter);
        const { internals } = agentInternals();
        const tenant: TenantContext = { TenantID: 'org-42', Source: 'header' };
        const p = params({
            contextUser: userWithTenant(tenant),
            boundActionParams: { [ACTION_ID]: { OrganizationID: 'org-42' } },
            Audience: { Mode: 'Intersection', UserIDs: [READER_USER_ID] },
            PrimaryScopeEntityName: 'MJ: Organizations',
            PrimaryScopeRecordID: 'org-42',
            SearchScopeIDs: [SEARCH_SCOPE_ID],
            SecurityEnvelope: { Version: TASK_SECURITY_ENVELOPE_VERSION, IsRunTainted: true },
        });

        const outcome = await internals.executeTasksStep(p, TASKS_STEP);

        expect(outcome.step).toBe('Success');
        expect(submitter.LastRequest?.SecurityEnvelope).toEqual({
            Version: TASK_SECURITY_ENVELOPE_VERSION,
            BoundActionParams: { [ACTION_ID]: { OrganizationID: 'org-42' } },
            Audience: { ReaderUserIDs: [READER_USER_ID] },
            RunScope: {
                PrimaryScopeEntityName: 'MJ: Organizations',
                PrimaryScopeRecordID: 'org-42',
                SecondaryScopes: null,
                SearchScopeIDs: [SEARCH_SCOPE_ID],
            },
            CallerTenantContext: tenant,
            IsRunTainted: true,
        });
    });
});

describe('BaseAgent taint seeded from a task-graph node (S7)', () => {
    it('starts a run tainted when its node envelope is tainted', () => {
        const { agent, internals } = agentInternals();
        internals.seedTaintFromSecurityEnvelope(params({ SecurityEnvelope: { Version: TASK_SECURITY_ENVELOPE_VERSION, IsRunTainted: true } }));
        expect(agent.IsRunTainted).toBe(true);
    });

    it('leaves a run clean when its node envelope is clean', () => {
        const { agent, internals } = agentInternals();
        internals.seedTaintFromSecurityEnvelope(params({ SecurityEnvelope: { Version: TASK_SECURITY_ENVELOPE_VERSION, IsRunTainted: false } }));
        expect(agent.IsRunTainted).toBe(false);
    });
});
