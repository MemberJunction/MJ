/**
 * The plan rows a submission writes are the platform's bookkeeping, written as the system user —
 * while the graph still belongs to, and runs for, the person who submitted it.
 *
 * The baseline UI role may only READ `MJ: Tasks` and `MJ: Task Dependencies`, and `Submit` used to
 * write the parent, its steps and their edges as the submitter. So a Flow agent run by anyone
 * without the Developer role failed the moment it produced a plan. These pin the split:
 *
 * - every Task / Task Dependency row is written as the system user when the process has one;
 * - the parent records the submitter as `submittedByUserID`, and a Human step is assigned to them;
 * - with no system user available, the rows are written as the submitter, as before — never as
 *   anyone else.
 *
 * Also here: `submittedByUserID` now decides whose permissions every step uses, so a graph's parent
 * row can no longer have its stored input rewritten through Retry or UpdateTaskInput.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { UserInfo, WellKnownUserSource, type IMetadataProvider } from '@memberjunction/core';
import { TaskNode, type TaskGraphSpec } from '@memberjunction/ai-core-plus';
import {
    InputEditRefusal,
    ParseTaskGraphParentMetadata,
    TaskGraphService,
    type TaskGraphSubmitContext,
} from '../TaskGraphService';
import { TaskClaimStore } from '../TaskClaimStore';

const SYSTEM_USER = Object.assign(new UserInfo(), { ID: 'SYSTEM-1', Name: 'System', IsActive: true });
const REQUESTER = Object.assign(new UserInfo(), { ID: 'REQUESTER-1', Name: 'Ursula UI-Role', IsActive: true });

/** One row the fake provider handed out: which entity, as whom, and what was set on it. */
class FakeRow {
    public ID = '';
    public Saved = false;
    public UserID: string | null = null;
    public InputPayload: string | null = null;
    [field: string]: unknown;

    constructor(public readonly EntityName: string, public readonly WrittenAs: UserInfo | undefined, private readonly seq: number) {}

    public NewRecord(): void { this.ID = `${this.EntityName}-${this.seq}`; }
    public async Save(): Promise<boolean> { this.Saved = true; return true; }
}

function recordingProvider() {
    const rows: FakeRow[] = [];
    const provider = {
        GetEntityObject: async (entityName: string, user?: UserInfo) => {
            const row = new FakeRow(entityName, user, rows.length);
            rows.push(row);
            return row;
        },
    } as unknown as IMetadataProvider;
    return { Provider: provider, Rows: rows };
}

const SPEC: TaskGraphSpec = {
    workflowName: 'Onboard a member',
    reasoning: 'test',
    tasks: [
        TaskNode.Action({ tempId: 'fetch', name: 'Fetch the record', description: '', dependsOn: [] }, { actionName: 'Get Record' }),
        TaskNode.Human({ tempId: 'approve', name: 'Approve', description: '', dependsOn: ['fetch'] }, {}),
    ],
};

type ServiceInternals = {
    resolveAgents: () => Promise<{ Success: boolean; Map?: Map<string, string> }>;
    resolveActions: () => Promise<{ Success: boolean; Map?: Map<string, string> }>;
    resolvePrompts: () => Promise<{ Success: boolean; Map?: Map<string, string> }>;
    ensureTaskType: (context: TaskGraphSubmitContext) => Promise<string>;
    loadChildren: () => Promise<unknown[]>;
};

/** A service with name resolution and the task-type lookup stubbed — this is about the writes. */
function serviceWithStubbedLookups() {
    const service = new TaskGraphService();
    const proto = TaskGraphService.prototype as unknown as ServiceInternals;
    vi.spyOn(proto, 'resolveAgents').mockResolvedValue({ Success: true, Map: new Map() });
    vi.spyOn(proto, 'resolveActions').mockResolvedValue({ Success: true, Map: new Map([['Get Record', 'ACTION-1']]) });
    vi.spyOn(proto, 'resolvePrompts').mockResolvedValue({ Success: true, Map: new Map() });
    const ensureTaskType = vi.spyOn(proto, 'ensureTaskType').mockResolvedValue('TASK-TYPE-1');
    return { Service: service, EnsureTaskType: ensureTaskType };
}

function submitContext(provider: IMetadataProvider): TaskGraphSubmitContext {
    return { EnvironmentID: 'ENV-1', ContextUser: REQUESTER, Provider: provider, AgentRunID: 'RUN-1' };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Submit writes the plan as the system user', () => {
    it('writes the parent, every step and every edge as the system user', async () => {
        const getSystemUser = vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(SYSTEM_USER);
        const { Service } = serviceWithStubbedLookups();
        const { Provider, Rows } = recordingProvider();

        const result = await Service.Submit(SPEC, submitContext(Provider));

        expect(result.Success).toBe(true);
        expect(getSystemUser).toHaveBeenCalledWith(Provider);
        const planRows = Rows.filter((r) => r.EntityName === 'MJ: Tasks' || r.EntityName === 'MJ: Task Dependencies');
        // Parent + two steps + one edge.
        expect(planRows).toHaveLength(4);
        expect(planRows.every((r) => r.Saved && r.WrittenAs === SYSTEM_USER)).toBe(true);
    });

    it('still records the submitter as the person the graph is for', async () => {
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(SYSTEM_USER);
        const { Service } = serviceWithStubbedLookups();
        const { Provider, Rows } = recordingProvider();

        const result = await Service.Submit(SPEC, submitContext(Provider));

        const parent = Rows.find((r) => r.ID === result.ParentTaskID)!;
        expect(ParseTaskGraphParentMetadata(parent.InputPayload).submittedByUserID).toBe(REQUESTER.ID);
        const approve = Rows.find((r) => r.EntityName === 'MJ: Tasks' && r['Name'] === 'Approve')!;
        expect(approve.UserID).toBe(REQUESTER.ID);
    });

    it('resolves the workflow task type as the system user too', async () => {
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(SYSTEM_USER);
        const { Service, EnsureTaskType } = serviceWithStubbedLookups();

        await Service.Submit(SPEC, submitContext(recordingProvider().Provider));

        expect(EnsureTaskType.mock.calls[0][0].ContextUser).toBe(SYSTEM_USER);
    });

    it('writes as the submitter when this process has no system user — never as anyone else', async () => {
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(null);
        const { Service } = serviceWithStubbedLookups();
        const { Provider, Rows } = recordingProvider();

        await Service.Submit(SPEC, submitContext(Provider));

        const planRows = Rows.filter((r) => r.EntityName === 'MJ: Tasks' || r.EntityName === 'MJ: Task Dependencies');
        expect(planRows.every((r) => r.WrittenAs === REQUESTER)).toBe(true);
    });

    it('writes as the submitter when resolving the system user throws', async () => {
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockRejectedValue(new Error('no connection'));
        const { Service } = serviceWithStubbedLookups();
        const { Provider, Rows } = recordingProvider();

        const result = await Service.Submit(SPEC, submitContext(Provider));

        expect(result.Success).toBe(true);
        expect(Rows.filter((r) => r.EntityName === 'MJ: Tasks').every((r) => r.WrittenAs === REQUESTER)).toBe(true);
    });
});

describe('a graph parent\'s stored input cannot be rewritten', () => {
    /** A provider whose only row is the given Task. */
    function taskProvider(task: { ParentID: string | null; Status: string }) {
        const row = { ...task, StepType: 'Agent', OutputPayload: null, Configuration: null, InputPayload: '{}',
            Load: async () => true, Save: vi.fn().mockResolvedValue(true) };
        return { GetEntityObject: async () => row } as unknown as IMetadataProvider;
    }

    function context(provider: IMetadataProvider): TaskGraphSubmitContext {
        return { EnvironmentID: '', ContextUser: REQUESTER, Provider: provider };
    }

    it('names the parent row as uneditable and leaves a step alone', () => {
        expect(InputEditRefusal({ ParentID: null })).toMatch(/whom the workflow runs for/);
        expect(InputEditRefusal({ ParentID: 'P-1' })).toBeNull();
    });

    it('refuses a Retry that would replace a failed parent\'s input, before writing anything', async () => {
        const write = vi.spyOn(TaskClaimStore.prototype, 'TryUpdateInputPayload').mockResolvedValue(true);
        const { Service } = serviceWithStubbedLookups();

        const ok = await Service.Retry('P-1', context(taskProvider({ ParentID: null, Status: 'Failed' })), { submittedByUserID: null });

        expect(ok).toBe(false);
        expect(write).not.toHaveBeenCalled();
    });

    it('still lets a Retry replace a failed step\'s input', async () => {
        const write = vi.spyOn(TaskClaimStore.prototype, 'TryUpdateInputPayload').mockResolvedValue(true);
        const { Service } = serviceWithStubbedLookups();
        vi.spyOn(TaskGraphService.prototype as unknown as ServiceInternals, 'loadChildren').mockResolvedValue([]);

        const ok = await Service.Retry('T-1', context(taskProvider({ ParentID: 'P-1', Status: 'Failed' })), { brief: 'better' });

        expect(ok).toBe(true);
        expect(write).toHaveBeenCalledTimes(1);
    });

    it('refuses UpdateTaskInput on a parent, before writing anything', async () => {
        const write = vi.spyOn(TaskClaimStore.prototype, 'TryUpdateInputPayload').mockResolvedValue(true);
        const { Service } = serviceWithStubbedLookups();

        const result = await Service.UpdateTaskInput('P-1', { submittedByUserID: 'someone-else' }, context(taskProvider({ ParentID: null, Status: 'Pending' })));

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/whom the workflow runs for/);
        expect(write).not.toHaveBeenCalled();
    });

    it('still lets UpdateTaskInput edit a pending step', async () => {
        const write = vi.spyOn(TaskClaimStore.prototype, 'TryUpdateInputPayload').mockResolvedValue(true);
        const { Service } = serviceWithStubbedLookups();

        const result = await Service.UpdateTaskInput('T-1', { brief: 'better' }, context(taskProvider({ ParentID: 'P-1', Status: 'Pending' })));

        expect(result.Success).toBe(true);
        expect(write).toHaveBeenCalledTimes(1);
    });
});
