import { describe, it, expect, vi, afterEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import {
    RegisterTaskGraphSubmitter,
    TaskGraphSubmitter,
    type ExecuteAgentParams,
    type TaskGraphSubmitOutcome,
    type TaskGraphSubmitRequest,
} from '@memberjunction/ai-core-plus';
import { BaseAgent } from '../base-agent';

const CALLER_USER = { ID: '00000000-0000-0000-0000-000000000010', Name: 'Caller', IsActive: true } as UserInfo;
const READER_USER_ID = '00000000-0000-0000-0000-000000000020';

class LegacyMockSubmitter extends TaskGraphSubmitter {
    public LastRequest: TaskGraphSubmitRequest | null = null;
    public async Submit(request: TaskGraphSubmitRequest): Promise<TaskGraphSubmitOutcome> {
        this.LastRequest = request;
        return {
            Success: true,
            ParentTaskID: 'parent-task-legacy',
            TaskIDByTempID: new Map([['t1', 'task-row-1']]),
        };
    }
}

class EnvelopeAwareMockSubmitter extends TaskGraphSubmitter {
    public override readonly SupportsSecurityEnvelope = true;
    public LastRequest: TaskGraphSubmitRequest | null = null;
    public async Submit(request: TaskGraphSubmitRequest): Promise<TaskGraphSubmitOutcome> {
        this.LastRequest = request;
        return {
            Success: true,
            ParentTaskID: 'parent-task-secure',
            TaskIDByTempID: new Map([['t1', 'task-row-1']]),
        };
    }
}

describe('BaseAgent durable TaskSecurityEnvelope gating and propagation (WS-4.1)', () => {
    afterEach(() => {
        RegisterTaskGraphSubmitter(null);
    });

    it('withholds task graphs under boundActionParams, Audience, or tenant scope when submitter does not support security envelopes', () => {
        RegisterTaskGraphSubmitter(new LegacyMockSubmitter());
        const agent = new BaseAgent();
        const reasonFn = (agent as unknown as {
            taskGraphWithholdingReason: (p: ExecuteAgentParams) => string | null;
        }).taskGraphWithholdingReason.bind(agent);

        expect(
            reasonFn({
                agent: { ID: 'a1' },
                conversationMessages: [],
                contextUser: CALLER_USER,
                Audience: { Mode: 'Intersection', UserIDs: [READER_USER_ID] },
            } as unknown as ExecuteAgentParams),
        ).toBe('a run with an audience');

        expect(
            reasonFn({
                agent: { ID: 'a1' },
                conversationMessages: [],
                contextUser: CALLER_USER,
                PrimaryScopeEntityName: 'MJ: Organizations',
                PrimaryScopeRecordID: 'org-1',
            } as unknown as ExecuteAgentParams),
        ).toBe('a tenant-scoped run');
    });

    it('allows task graphs and stamps SecurityEnvelope onto TaskGraphSubmitRequest when submitter SupportsSecurityEnvelope is true', async () => {
        const submitter = new EnvelopeAwareMockSubmitter();
        RegisterTaskGraphSubmitter(submitter);

        const agent = new BaseAgent();
        const reasonFn = (agent as unknown as {
            taskGraphWithholdingReason: (p: ExecuteAgentParams) => string | null;
        }).taskGraphWithholdingReason.bind(agent);

        const params = {
            agent: { ID: 'a1', Name: 'TestAgent' },
            conversationMessages: [],
            contextUser: CALLER_USER,
            boundActionParams: { OrganizationID: 'org-42' },
            Audience: { Mode: 'Intersection', UserIDs: [READER_USER_ID] },
            PrimaryScopeEntityName: 'MJ: Organizations',
            PrimaryScopeRecordID: 'org-42',
            SecondaryScopes: { department: 'finance' },
            securityEnvelope: {
                IsRunTainted: true,
                AllowedEgressActionIDs: ['33333333-3333-4333-8333-333333333333'],
            },
        } as unknown as ExecuteAgentParams;

        expect(reasonFn(params)).toBeNull();

        // Stub step entity helpers on BaseAgent instance
        (agent as unknown as { createStepEntity: ReturnType<typeof vi.fn> }).createStepEntity = vi
            .fn()
            .mockResolvedValue(null);
        (agent as unknown as { finalizeStepEntity: ReturnType<typeof vi.fn> }).finalizeStepEntity = vi
            .fn()
            .mockResolvedValue(undefined);

        const executeTasksStep = (agent as unknown as {
            executeTasksStep: (p: ExecuteAgentParams, prev: unknown) => Promise<{ step: string; errorMessage?: string }>;
        }).executeTasksStep.bind(agent);

        const outcome = await executeTasksStep(params, {
            step: 'Tasks',
            taskGraph: {
                spec: {
                    workflowName: 'Secure Tenant Workflow',
                    tasks: [{ tempId: 't1', name: 'Step 1', description: 'Run scoped action' }],
                },
            },
            previousPayload: {},
            newPayload: {},
        });

        expect(outcome.step).toBe('Success');
        expect(submitter.LastRequest).not.toBeNull();
        expect(submitter.LastRequest?.SecurityEnvelope).toEqual({
            BoundActionParams: { OrganizationID: 'org-42' },
            Audience: { Mode: 'Intersection', ReaderUserIDs: [READER_USER_ID] },
            PrimaryScopeEntityName: 'MJ: Organizations',
            PrimaryScopeRecordID: 'org-42',
            SecondaryScopes: { department: 'finance' },
            TenantContext: {
                PrimaryScopeEntityName: 'MJ: Organizations',
                PrimaryScopeRecordID: 'org-42',
                SecondaryScopes: { department: 'finance' },
            },
            IsRunTainted: true,
            AllowedEgressActionIDs: ['33333333-3333-4333-8333-333333333333'],
        });
    });
});
