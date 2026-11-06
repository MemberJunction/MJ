/**
 * Saga compensation (WS-4.3): the pure rules in `saga-compensation.ts` and the dispatcher's saga
 * coordinator, driven against a fake database that enforces `CompensatesTaskID`'s unique index.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView, type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import type { MJTaskEntity } from '@memberjunction/core-entities';
import { UUIDMap } from '@memberjunction/global';
import { SerializeTaskSecurityEnvelope, TASK_SECURITY_ENVELOPE_VERSION, type TaskGraphSpecNode } from '@memberjunction/ai-core-plus';
import {
    BuildCompensationInputPayload,
    MergeActionCompensationSpecs,
    NextSagaStep,
    ReadActionCompensationMetadata,
    RetryBackoffMs,
    SelectTasksToCompensate,
    type CompensatableActionRow,
    type SagaTaskRow,
    type TaskCompensationStepMetadata,
} from '../saga-compensation';
import { TaskGraphDispatcher, type ClaimedTaskCandidate } from '../TaskGraphDispatcher';
import { BuildStepConfiguration, BuildTaskGraphParentInputPayload, ParseTaskGraphParentMetadata, TaskGraphService } from '../TaskGraphService';
import type { TaskActionRunner } from '../types';

const TEST_USER = { ID: '00000000-0000-4000-8000-000000000001', Name: 'Saga Tester', IsActive: true } as UserInfo;
/** The dispatcher's own (system) user, which must never be the one saga reads run as. */
const SYSTEM_USER = { ID: '00000000-0000-4000-8000-0000000000ff', Name: 'Dispatcher', IsActive: true } as UserInfo;
const globalRef = globalThis as typeof globalThis & {
    ___SINGLETON__UserCache?: { Users: UserInfo[]; FindUser(criteria: { ID?: string }): Promise<UserInfo | undefined> };
};
const PARENT_ID = '00000000-0000-4000-8000-000000000100';
const WORKFLOW_TYPE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const RESERVE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INVOICE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CHARGE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const RELEASE = '11111111-1111-4111-8111-111111111111';
const VOID_INVOICE = '22222222-2222-4222-8222-222222222222';

// ───────────────────────────── fake database ─────────────────────────────

type Row = SagaTaskRow & Pick<MJTaskEntity, 'ParentID' | 'TypeID' | 'Description' | 'InputPayload' | 'OutputPayload' | 'ErrorMessage'
    | 'AgentRunID' | 'SecurityEnvelope' | 'PercentComplete'>;

class SagaDb {
    public Rows = new Map<string, Row>();
    public Deps: Array<{ TaskID: string; DependsOnTaskID: string }> = [];
    public Actions: CompensatableActionRow[] = [];
    public Logs: Array<{ ID: string; StartedAt: Date; EndedAt: Date; UserID: string }> = [];
    public RunViewCalls: Array<{ Params: RunViewParams; User?: UserInfo }> = [];
    public SavedExisting: string[] = [];
    private next = 0;

    public Add(row: Partial<Row> & Pick<Row, 'ID' | 'Name'>): Row {
        const full: Row = {
            Status: 'Pending', StepType: 'Action', UserID: null, ActionID: null, CompletedAt: null, Configuration: null,
            CompensatesTaskID: null, ParentID: PARENT_ID, TypeID: WORKFLOW_TYPE_ID, Description: null, InputPayload: '{}',
            OutputPayload: null, ErrorMessage: null, AgentRunID: null, SecurityEnvelope: null, PercentComplete: 0, ...row,
        };
        this.Rows.set(full.ID, full);
        return full;
    }

    /** A `MJ: Tasks` entity over this database; a new row's insert honours the unique CompensatesTaskID. */
    public Entity(): MJTaskEntity {
        const db = this;
        const state: Partial<Row> & { IsNew?: boolean } = {};
        const entity = {
            LatestResult: { CompleteMessage: '' },
            NewRecord() { state.IsNew = true; state.ID = `00000000-0000-4000-9000-${String(++db.next).padStart(12, '0')}`; },
            async Load(id: string) { const r = db.Rows.get(id); if (!r) return false; Object.assign(state, r); return true; },
            async Save() {
                if (state.IsNew && state.CompensatesTaskID && [...db.Rows.values()].some((r) => r.CompensatesTaskID === state.CompensatesTaskID)) {
                    entity.LatestResult.CompleteMessage = "Violation of UNIQUE KEY constraint 'UQ_Task_CompensatesTaskID'";
                    return false;
                }
                if (!state.IsNew) db.SavedExisting.push(state.ID!);
                const { IsNew: _isNew, ...row } = state;
                db.Add(row as Row);
                state.IsNew = false;
                return true;
            },
        };
        return new Proxy(entity, {
            get: (target, key: string) => (key in target ? target[key as keyof typeof target] : state[key as keyof Row]),
            set: (_target, key: string, value) => { (state as Record<string, unknown>)[key] = value; return true; },
        }) as unknown as MJTaskEntity;
    }

    public RunView(params: RunViewParams, user?: UserInfo): { Success: boolean; Results: unknown[] } {
        this.RunViewCalls.push({ Params: params, User: user });
        const filter = params.ExtraFilter ?? '';
        switch (params.EntityName) {
            case 'MJ: Actions':
                return { Success: true, Results: this.Actions.filter((a) => filter.includes(a.ID)) };
            case 'MJ: Tasks': {
                const id = /CompensatesTaskID='([^']+)'/.exec(filter)?.[1];
                return { Success: true, Results: [...this.Rows.values()].filter((r) => r.CompensatesTaskID === id).map((r) => ({ ID: r.ID })) };
            }
            case 'MJ: Action Execution Logs':
                return { Success: true, Results: this.Logs.filter((l) => filter.includes(l.ID)) };
            case 'MJ: Record Changes':
                return { Success: true, Results: [{ ID: 'rc-1', Entity: 'Orders', RecordID: 'O-1', Type: 'Update', ChangesJSON: '{}' }] };
            case 'MJ: Task Types':
                return { Success: true, Results: [{ ID: WORKFLOW_TYPE_ID }] };
            default:
                return { Success: true, Results: [] };
        }
    }

    public Children(): Row[] {
        return [...this.Rows.values()].filter((r) => r.ParentID === PARENT_ID);
    }
}

function parentRow(): MJTaskEntity {
    return {
        ID: PARENT_ID,
        Name: 'Checkout',
        UserID: TEST_USER.ID,
        AgentRunID: 'run-1',
        SecurityEnvelope: null,
        InputPayload: JSON.stringify(BuildTaskGraphParentInputPayload({
            continuation: 'none', reinvokeDepth: 0, failureSemantics: 'block', failurePolicy: 'CompensateCompleted',
            submittedByAgentRunID: 'run-1', submittedByUserID: TEST_USER.ID,
        })),
    } as unknown as MJTaskEntity;
}

/** The graph state the coordinator reads, rebuilt from the database each time. */
function graphOf(db: SagaDb, parent: MJTaskEntity) {
    const children = db.Children().map((r) => ({ ...r }) as unknown as MJTaskEntity);
    return {
        parentTaskID: PARENT_ID,
        parent,
        parentMetadata: ParseTaskGraphParentMetadata(parent.InputPayload),
        rawDependencies: db.Deps,
        nodes: children.map((c) => ({ id: c.ID, status: c.Status })),
        edges: [],
        entityById: new Map(children.map((c) => [c.ID, c])),
        unreachableTaskIDs: new Set<string>(),
        cascadeSkipTaskIDs: new Set<string>(),
        skipSeedTaskIDs: new Set<string>(),
        holdTaskIDs: new Set<string>(),
        handledFailureIDs: new Set<string>(),
    };
}

type Coordinator = { pass: () => Promise<void>; skips: string[]; sagaStates: string[] };

function coordinator(db: SagaDb, parent: MJTaskEntity = parentRow()): Coordinator {
    const provider = { GetEntityObject: vi.fn(async () => db.Entity()) } as unknown as IMetadataProvider;
    const dispatcher = new TaskGraphDispatcher(
        { CreateProvider: vi.fn().mockResolvedValue(provider) },
        { RunAgentForTask: vi.fn() },
        SYSTEM_USER,
        { InstanceID: 'inst-saga' },
    );
    const skips: string[] = [];
    const sagaStates: string[] = [];
    const internals = dispatcher as unknown as {
        claims: { TrySkipPending: unknown; TryWriteDebugFields: unknown };
        loadGraphState: unknown;
        coordinateSagaCompensation: (p: IMetadataProvider, id: string, g: ReturnType<typeof graphOf>) => Promise<unknown>;
    };
    internals.claims.TrySkipPending = vi.fn(async (_p: IMetadataProvider, id: string) => {
        const row = db.Rows.get(id);
        if (row?.Status !== 'Pending') return false;
        row.Status = 'Skipped';
        skips.push(id);
        return true;
    });
    internals.claims.TryWriteDebugFields = vi.fn(async (_p: IMetadataProvider, _id: string, fields: Array<{ Value: { Value: string } }>) => {
        sagaStates.push(fields[0].Value.Value);
        return true;
    });
    internals.loadGraphState = vi.fn(async () => graphOf(db, parent));
    return {
        skips,
        sagaStates,
        pass: async () => { await internals.coordinateSagaCompensation(provider, PARENT_ID, graphOf(db, parent)); },
    };
}

/** reserve (A) → invoice (B) → charge (C, failed); plus an independent pending step. */
function checkoutGraph(db: SagaDb, opts: { invoiceConfig?: TaskCompensationStepMetadata } = {}): void {
    db.Add({ ID: 'T-A', Name: 'Reserve', Status: 'Complete', ActionID: RESERVE, OutputPayload: JSON.stringify({ reservationId: 'R-1' }),
        CompletedAt: new Date('2026-11-02T10:00:00Z'), Configuration: JSON.stringify({ runtime: { actionLogID: 'log-A', isOutputTainted: false } }) });
    db.Add({ ID: 'T-B', Name: 'Invoice', Status: 'Complete', ActionID: INVOICE, OutputPayload: JSON.stringify({ invoiceId: 'I-1' }),
        CompletedAt: new Date('2026-11-02T10:01:00Z'),
        Configuration: JSON.stringify({ runtime: { actionLogID: 'log-B', isOutputTainted: true }, ...(opts.invoiceConfig ? { compensation: opts.invoiceConfig } : {}) }) });
    db.Add({ ID: 'T-C', Name: 'Charge', Status: 'Failed', ActionID: CHARGE, ErrorMessage: 'card declined' });
    db.Add({ ID: 'T-D', Name: 'Notify', Status: 'Pending', ActionID: CHARGE });
    db.Deps.push({ TaskID: 'T-B', DependsOnTaskID: 'T-A' }, { TaskID: 'T-C', DependsOnTaskID: 'T-B' });
    db.Actions.push(
        { ID: RESERVE, CompensationActionID: RELEASE, CompensationInputMapping: JSON.stringify({ ReservationID: 'output.reservationId' }), IsIdempotent: true },
        { ID: INVOICE, CompensationActionID: VOID_INVOICE, CompensationInputMapping: null, IsIdempotent: false },
        { ID: CHARGE, CompensationActionID: null, CompensationInputMapping: null, IsIdempotent: false },
    );
    db.Logs.push({ ID: 'log-B', StartedAt: new Date('2026-11-02T10:00:30Z'), EndedAt: new Date('2026-11-02T10:00:59Z'), UserID: TEST_USER.ID });
}

function compensationOf(db: SagaDb, forwardID: string): Row | undefined {
    return [...db.Rows.values()].find((r) => r.CompensatesTaskID === forwardID && r.StepType !== 'Human');
}

// ───────────────────────────── tests ─────────────────────────────

describe('saga-compensation rules', () => {
    it('reads compensation from the typed MJ: Actions columns, the stored mapping parsed from JSON (B4b)', () => {
        const row: CompensatableActionRow = { ID: RESERVE, CompensationActionID: RELEASE, CompensationInputMapping: '{"ReservationID":"output.reservationId"}', IsIdempotent: true };
        expect(ReadActionCompensationMetadata(row)).toEqual({
            compensationActionId: RELEASE,
            inputMapping: { ReservationID: 'output.reservationId' },
            isIdempotent: true,
        });
        expect(ReadActionCompensationMetadata({ ...row, CompensationActionID: null })).toBeNull();
    });

    it("lets a node's settings win over its action's", () => {
        const merged = MergeActionCompensationSpecs(
            { compensationActionId: RELEASE, inputMapping: { A: 'input.a' } },
            { onCompensationFailure: 'HaltSaga', retryCount: 3 },
        );
        expect(merged).toEqual({ compensationActionId: RELEASE, inputMapping: { A: 'input.a' }, onCompensationFailure: 'HaltSaga', retryCount: 3 });
    });

    it('keeps a spec node\'s retryCount and compensationInputMapping (B4c)', () => {
        const node: TaskGraphSpecNode = {
            tempId: 'n1', name: 'Reserve', kind: 'Action',
            configuration: { actionName: 'Reserve', compensation: { compensationActionId: RELEASE, compensationInputMapping: { ID: 'output.id' }, retryCount: 2, isIdempotent: true } },
        };
        expect(BuildStepConfiguration(node)?.compensation).toEqual({
            compensationActionId: RELEASE, inputMapping: { ID: 'output.id' }, retryCount: 2, isIdempotent: true,
        });
    });

    it('orders completed compensatable steps in reverse topological order, leaving out compensation rows', () => {
        const db = new SagaDb();
        checkoutGraph(db);
        db.Add({ ID: 'T-X', Name: 'Compensate: Reserve', Status: 'Complete', ActionID: RELEASE, CompensatesTaskID: 'T-A' });
        const defaults = new UUIDMap<TaskCompensationStepMetadata>();
        for (const a of db.Actions) {
            const meta = ReadActionCompensationMetadata(a);
            if (meta) defaults.Set(a.ID, meta);
        }
        const plan = SelectTasksToCompensate(db.Children(), defaults, db.Deps);
        expect(plan.map((p) => p.Task.ID)).toEqual(['T-B', 'T-A']);
    });

    it('maps forward input and output into the compensation input', () => {
        expect(BuildCompensationInputPayload({
            ForwardInput: { reason: 'r' }, ForwardOutput: { reservationId: 'R-1' }, InputMapping: '{"ReservationID":"output.reservationId","Why":"input.reason"}',
        })).toEqual({ ReservationID: 'R-1', Why: 'r' });
    });

    it('backs off exponentially, capped', () => {
        expect([1, 2, 3, 10].map((a) => RetryBackoffMs(a, 100))).toEqual([100, 200, 400, 3000]);
    });

    describe('NextSagaStep', () => {
        const forward = (id: string): SagaTaskRow => ({ ID: id, Name: id, Status: 'Complete', StepType: 'Action', UserID: null, ActionID: RESERVE, CompletedAt: null, Configuration: null, CompensatesTaskID: null });
        const comp = (status: MJTaskEntity['Status'], onFailure?: string): SagaTaskRow => ({
            ...forward('C'), Status: status, CompensatesTaskID: 'F1',
            Configuration: onFailure ? JSON.stringify({ compensation: { onCompensationFailure: onFailure } }) : null,
        });
        const human = (status: MJTaskEntity['Status']): SagaTaskRow => ({ ...forward('H'), StepType: 'Human', Status: status, CompensatesTaskID: 'C' });
        const plan = [{ Task: forward('F1'), Compensation: { compensationActionId: RELEASE } }, { Task: forward('F2'), Compensation: { compensationActionId: RELEASE } }];
        const step = (c?: SagaTaskRow, h?: SagaTaskRow) => NextSagaStep({ Plan: plan, CompensationFor: (id) => (id === 'F1' ? c : undefined), EscalationFor: () => h });

        it('compensates the first step first', () => expect(step().Kind).toBe('Compensate'));
        it('waits on a running compensation', () => expect(step(comp('In Progress')).Kind).toBe('Wait'));
        it('moves to the next step once one is compensated', () => {
            const next = step(comp('Complete'));
            expect(next.Kind === 'Compensate' && next.Forward.ID).toBe('F2');
        });
        it('stops on HaltSaga', () => expect(step(comp('Failed', 'HaltSaga'))).toEqual({ Kind: 'Finished', State: 'CompensationFailed' }));
        it('carries on past ContinueCompensation', () => {
            const next = step(comp('Failed', 'ContinueCompensation'));
            expect(next.Kind === 'Compensate' && next.Forward.ID).toBe('F2');
        });
        it('escalates a failure to a person by default, and waits on them (B23)', () => {
            expect(step(comp('Failed')).Kind).toBe('Escalate');
            expect(step(comp('Failed'), human('Pending')).Kind).toBe('Wait');
        });
        it('resumes when the person completes the step, and stops when they cancel it (B23)', () => {
            const resumed = step(comp('Failed'), human('Complete'));
            expect(resumed.Kind === 'Compensate' && resumed.Forward.ID).toBe('F2');
            expect(step(comp('Failed'), human('Cancelled'))).toEqual({ Kind: 'Finished', State: 'CompensationEscalated' });
        });
    });
});

describe('TaskGraphDispatcher saga coordinator', () => {
    let db: SagaDb;
    let previousCache: typeof globalRef.___SINGLETON__UserCache;
    beforeEach(() => {
        previousCache = globalRef.___SINGLETON__UserCache;
        globalRef.___SINGLETON__UserCache = { Users: [TEST_USER], FindUser: async ({ ID }) => (ID === TEST_USER.ID ? TEST_USER : undefined) };
        db = new SagaDb();
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (params: RunViewParams, user?: UserInfo) => db.RunView(params, user)),
        } as unknown as RunView);
    });
    afterEach(() => {
        globalRef.___SINGLETON__UserCache = previousCache;
        vi.restoreAllMocks();
    });

    it('skips the remaining forward work through the guarded write and compensates the latest step first, linked by CompensatesTaskID (B4, B4d)', async () => {
        checkoutGraph(db);
        const c = coordinator(db);
        await c.pass();

        expect(c.skips).toEqual(['T-D']);
        const voidInvoice = compensationOf(db, 'T-B');
        expect(voidInvoice?.ActionID).toBe(VOID_INVOICE);
        expect(compensationOf(db, 'T-A')).toBeUndefined();
        // No full-row save of an existing row: not the forward steps, not the parent.
        expect(db.SavedExisting).toEqual([]);
        expect(c.sagaStates).toContain('Compensating');
    });

    it('reads the action defaults through explicit typed columns (B4b)', async () => {
        checkoutGraph(db);
        await coordinator(db).pass();
        const actionsRead = db.RunViewCalls.find((call) => call.Params.EntityName === 'MJ: Actions');
        expect(actionsRead?.Params.Fields).toEqual(['ID', 'CompensationActionID', 'CompensationInputMapping', 'IsIdempotent']);
    });

    it('creates exactly one compensation when two dispatchers decide at once (B4)', async () => {
        checkoutGraph(db);
        const first = coordinator(db);
        const second = coordinator(db);
        await Promise.all([first.pass(), second.pass()]);
        expect([...db.Rows.values()].filter((r) => r.CompensatesTaskID === 'T-B')).toHaveLength(1);
    });

    it('compensates the next step only after the previous compensation completes', async () => {
        checkoutGraph(db);
        const c = coordinator(db);
        await c.pass();
        await c.pass();
        expect(compensationOf(db, 'T-A')).toBeUndefined();
        compensationOf(db, 'T-B')!.Status = 'Complete';
        await c.pass();
        const release = compensationOf(db, 'T-A');
        expect(release?.ActionID).toBe(RELEASE);
        expect(JSON.parse(release!.InputPayload!)).toEqual({ ReservationID: 'R-1' });
        release!.Status = 'Complete';
        await c.pass();
        expect(c.sagaStates.at(-1)).toBe('Compensated');
    });

    it('reads the forward step\'s record changes as the acting user, bounded to its action log window (S10)', async () => {
        checkoutGraph(db);
        await coordinator(db).pass();
        const changesRead = db.RunViewCalls.find((call) => call.Params.EntityName === 'MJ: Record Changes');
        expect(changesRead?.User).toBe(TEST_USER);
        expect(changesRead?.Params.ExtraFilter).toContain(`UserID='${TEST_USER.ID}'`);
        expect(changesRead?.Params.ExtraFilter).toContain("ChangedAt >= '2026-11-02T10:00:30.000Z'");
        expect(changesRead?.Params.ExtraFilter).toContain("ChangedAt <= '2026-11-02T10:00:59.000Z'");
    });

    it('gives a compensation task the forward step\'s envelope and its output taint (S7)', async () => {
        checkoutGraph(db);
        db.Rows.get('T-B')!.SecurityEnvelope = SerializeTaskSecurityEnvelope({ Version: TASK_SECURITY_ENVELOPE_VERSION, IsRunTainted: false, RunScope: { PrimaryScopeEntityName: null, PrimaryScopeRecordID: 'org-A', SecondaryScopes: null } });
        await coordinator(db).pass();
        const envelope = JSON.parse(compensationOf(db, 'T-B')!.SecurityEnvelope!);
        expect(envelope.IsRunTainted).toBe(true);
        expect(envelope.RunScope.PrimaryScopeRecordID).toBe('org-A');
    });

    it('escalates a failed compensation to a Human step for the submitter, then resumes when it completes (B23)', async () => {
        checkoutGraph(db);
        const c = coordinator(db);
        await c.pass();
        const voidInvoice = compensationOf(db, 'T-B')!;
        voidInvoice.Status = 'Failed';
        voidInvoice.ErrorMessage = 'void API down';
        await c.pass();

        const human = [...db.Rows.values()].find((r) => r.StepType === 'Human')!;
        expect(human.CompensatesTaskID).toBe(voidInvoice.ID);
        expect(human.UserID).toBe(TEST_USER.ID);
        expect(human.Description).toContain('void API down');
        expect(compensationOf(db, 'T-A')).toBeUndefined();

        await c.pass();
        expect([...db.Rows.values()].filter((r) => r.StepType === 'Human')).toHaveLength(1);

        human.Status = 'Complete';
        await c.pass();
        expect(compensationOf(db, 'T-A')?.ActionID).toBe(RELEASE);
    });

    it('stops the rollback when the person cancels the escalation (B23)', async () => {
        checkoutGraph(db);
        const c = coordinator(db);
        await c.pass();
        compensationOf(db, 'T-B')!.Status = 'Failed';
        await c.pass();
        [...db.Rows.values()].find((r) => r.StepType === 'Human')!.Status = 'Cancelled';
        await c.pass();
        expect(compensationOf(db, 'T-A')).toBeUndefined();
        expect(c.sagaStates.at(-1)).toBe('CompensationEscalated');
    });

    it('does nothing under the default Halt policy', async () => {
        checkoutGraph(db);
        const parent = parentRow();
        (parent as unknown as { InputPayload: string }).InputPayload = JSON.stringify(BuildTaskGraphParentInputPayload({
            continuation: 'none', reinvokeDepth: 0, failureSemantics: 'block', submittedByAgentRunID: null, submittedByUserID: TEST_USER.ID,
        }));
        const c = coordinator(db, parent);
        await c.pass();
        expect(c.skips).toEqual([]);
        expect(compensationOf(db, 'T-B')).toBeUndefined();
    });

    it("sets aside a graph whose saga cannot resolve its submitter and keeps processing the next graph (S6)", async () => {
        const OTHER_PARENT = '00000000-0000-4000-8000-000000000200';
        checkoutGraph(db);
        // The submitter of the saga graph has been deactivated, so resolving who compensations run as throws.
        const inactive = { ...TEST_USER, IsActive: false } as UserInfo;
        globalRef.___SINGLETON__UserCache = { Users: [inactive], FindUser: async ({ ID }) => (ID === TEST_USER.ID ? inactive : undefined) };
        const provider = { GetEntityObject: vi.fn(async () => db.Entity()) } as unknown as IMetadataProvider;
        const dispatcher = new TaskGraphDispatcher(
            { CreateProvider: vi.fn().mockResolvedValue(provider) }, { RunAgentForTask: vi.fn() }, SYSTEM_USER, { InstanceID: 'inst-isolate' },
        );
        const otherParent = { ...parentRow(), ID: OTHER_PARENT, Status: 'Pending', PercentComplete: 0 } as unknown as MJTaskEntity;
        (otherParent as unknown as { InputPayload: string }).InputPayload = JSON.stringify(BuildTaskGraphParentInputPayload({
            continuation: 'none', reinvokeDepth: 0, failureSemantics: 'block', submittedByAgentRunID: null, submittedByUserID: TEST_USER.ID,
        }));
        const otherTask = { ID: 'O-1', Name: 'Other', Status: 'Pending', ParentID: OTHER_PARENT, StepType: 'Action', CompensatesTaskID: null } as unknown as MJTaskEntity;
        const otherGraph = {
            ...graphOf(new SagaDb(), otherParent), parentTaskID: OTHER_PARENT, rawDependencies: [],
            nodes: [{ id: 'O-1', status: 'Pending' }], entityById: new Map([['O-1', otherTask]]),
        };
        const internals = dispatcher as unknown as {
            claims: Record<string, unknown>;
            debugStateByGraph: Map<string, object>;
            loadGraphState: ReturnType<typeof vi.fn>;
            propagateAndRollup: (p: IMetadataProvider, ids: string[]) => Promise<Array<{ parentTaskID: string }>>;
        };
        internals.claims.TrySkipPending = vi.fn(async () => false);
        internals.claims.TryWriteDebugFields = vi.fn(async () => true);
        internals.claims.TryUpdateParentProgress = vi.fn(async () => true);
        internals.debugStateByGraph.set(PARENT_ID, {});
        internals.debugStateByGraph.set(OTHER_PARENT, {});
        internals.loadGraphState = vi.fn(async (_p: IMetadataProvider, id: string) => (id === PARENT_ID ? graphOf(db, parentRow()) : otherGraph));
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const live = await internals.propagateAndRollup(provider, [PARENT_ID, OTHER_PARENT]);
        expect(live.map((g) => g.parentTaskID)).toEqual([OTHER_PARENT]);
        expect(internals.claims.TryUpdateParentProgress).toHaveBeenCalledWith(provider, OTHER_PARENT, expect.anything(), expect.anything(), SYSTEM_USER);

        // The next pass leaves the failing graph alone instead of failing on it again, and says nothing new about it.
        const reportsAfterFirstPass = errors.mock.calls.filter((call) => String(call[0]).includes(PARENT_ID)).length;
        internals.loadGraphState.mockClear();
        await internals.propagateAndRollup(provider, [PARENT_ID, OTHER_PARENT]);
        expect(internals.loadGraphState.mock.calls.map((call) => call[1])).toEqual([OTHER_PARENT]);
        expect(reportsAfterFirstPass).toBe(1);
        expect(errors.mock.calls.filter((call) => String(call[0]).includes(PARENT_ID)).length).toBe(1);
    });
});

describe('a graph rolling back does not settle under its saga (S7)', () => {
    let db: SagaDb;
    let previousCache: typeof globalRef.___SINGLETON__UserCache;
    beforeEach(() => {
        previousCache = globalRef.___SINGLETON__UserCache;
        globalRef.___SINGLETON__UserCache = { Users: [TEST_USER], FindUser: async ({ ID }) => (ID === TEST_USER.ID ? TEST_USER : undefined) };
        db = new SagaDb();
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (params: RunViewParams, user?: UserInfo) => db.RunView(params, user)),
        } as unknown as RunView);
    });
    afterEach(() => {
        globalRef.___SINGLETON__UserCache = previousCache;
        vi.restoreAllMocks();
    });

    /** Runs one rollup pass over the saga graph; `firstSnapshot` is what the pass loads first. */
    async function rollupPass(firstSnapshot: ReturnType<typeof graphOf>, provider: IMetadataProvider) {
        const dispatcher = new TaskGraphDispatcher(
            { CreateProvider: vi.fn().mockResolvedValue(provider) }, { RunAgentForTask: vi.fn() }, SYSTEM_USER, { InstanceID: 'inst-s7' },
        );
        const internals = dispatcher as unknown as {
            claims: Record<string, ReturnType<typeof vi.fn>>;
            debugStateByGraph: Map<string, object>;
            loadGraphState: ReturnType<typeof vi.fn>;
            propagateAndRollup: (p: IMetadataProvider, ids: string[]) => Promise<Array<{ parentTaskID: string }>>;
        };
        internals.claims.TrySkipPending = vi.fn(async () => true);
        internals.claims.TryWriteDebugFields = vi.fn(async () => true);
        internals.claims.TrySettleParent = vi.fn(async () => true);
        internals.claims.TryUpdateParentProgress = vi.fn(async () => true);
        internals.debugStateByGraph.set(PARENT_ID, {});
        internals.loadGraphState = vi.fn()
            .mockResolvedValueOnce(firstSnapshot)
            .mockImplementation(async () => graphOf(db, parentRow()));
        const live = await internals.propagateAndRollup(provider, [PARENT_ID]);
        return { live, claims: internals.claims };
    }

    /** reserve → invoice → charge (failed), every forward step already terminal. */
    function finishedForwardWork(): void {
        checkoutGraph(db);
        db.Rows.get('T-D')!.Status = 'Skipped';
    }

    it('reloads after losing the compensation insert and does not settle the graph Failed', async () => {
        finishedForwardWork();
        const stale = graphOf(db, parentRow());
        // Another dispatcher created the compensation for T-B after this pass loaded its snapshot.
        db.Add({ ID: 'C-B', Name: 'Compensate: Invoice', ActionID: VOID_INVOICE, CompensatesTaskID: 'T-B' });
        const provider = { GetEntityObject: vi.fn(async () => db.Entity()) } as unknown as IMetadataProvider;

        const { live, claims } = await rollupPass(stale, provider);

        expect(claims.TrySettleParent).not.toHaveBeenCalled();
        expect(live.map((g) => g.parentTaskID)).toEqual([PARENT_ID]);
        expect([...db.Rows.values()].filter((r) => r.CompensatesTaskID === 'T-B')).toHaveLength(1);
    });

    it('keeps the graph In Progress while a compensation it must create cannot be written yet', async () => {
        finishedForwardWork();
        const provider = {
            // Every insert fails, as when the database is briefly unavailable.
            GetEntityObject: vi.fn(async () => {
                const entity = db.Entity();
                return new Proxy(entity, { get: (target, key) => (key === 'Save' ? async () => false : Reflect.get(target, key)) });
            }),
        } as unknown as IMetadataProvider;

        const { live, claims } = await rollupPass(graphOf(db, parentRow()), provider);

        expect(claims.TrySettleParent).not.toHaveBeenCalled();
        expect(claims.TryUpdateParentProgress).toHaveBeenCalledWith(provider, PARENT_ID, 'In Progress', expect.any(Number), SYSTEM_USER);
        expect(live.map((g) => g.parentTaskID)).toEqual([PARENT_ID]);
    });

    it('settles the graph once the rollback has finished', async () => {
        finishedForwardWork();
        db.Add({ ID: 'C-B', Name: 'Compensate: Invoice', Status: 'Complete', ActionID: VOID_INVOICE, CompensatesTaskID: 'T-B' });
        db.Add({ ID: 'C-A', Name: 'Compensate: Reserve', Status: 'Complete', ActionID: RELEASE, CompensatesTaskID: 'T-A' });
        const provider = { GetEntityObject: vi.fn(async () => db.Entity()) } as unknown as IMetadataProvider;

        const { claims } = await rollupPass(graphOf(db, parentRow()), provider);

        expect(claims.TrySettleParent).toHaveBeenCalledWith(provider, PARENT_ID, 'Failed', expect.any(Number), SYSTEM_USER);
    });
});

describe('TaskGraphService.Submit compensation actions (S7)', () => {
    afterEach(() => vi.restoreAllMocks());

    function submitWith(compensationActionId: string, knownActionIDs: string[]) {
        const saved: string[] = [];
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (params: RunViewParams) => {
                if (params.EntityName === 'MJ: Task Types') return { Success: true, Results: [{ ID: WORKFLOW_TYPE_ID }] };
                if (params.EntityName === 'MJ: Actions' && params.Fields?.length === 1) {
                    return { Success: true, Results: knownActionIDs.filter((id) => (params.ExtraFilter ?? '').includes(id)).map((ID) => ({ ID })) };
                }
                if (params.EntityName === 'MJ: Actions') return { Success: true, Results: [{ ID: RESERVE, Name: 'Reserve' }] };
                return { Success: true, Results: [] };
            }),
        } as unknown as RunView);
        let counter = 0;
        const provider = {
            GetEntityObject: vi.fn(async () => {
                const row = { ID: `00000000-0000-4000-8000-0000000003${String(++counter).padStart(2, '0')}`, NewRecord: () => undefined, Save: async () => { saved.push(row.ID); return true; } };
                return row;
            }),
        } as unknown as IMetadataProvider;
        const spec = {
            workflowName: 'Checkout',
            continuation: 'none' as const,
            failurePolicy: 'CompensateCompleted' as const,
            tasks: [{ tempId: 'r', name: 'Reserve', kind: 'Action' as const, configuration: { actionName: 'Reserve', compensation: { compensationActionId } } }],
        };
        return { saved, result: new TaskGraphService().Submit(spec, { Provider: provider, ContextUser: TEST_USER }) };
    }

    it('refuses, before writing anything, a graph whose compensationActionId is not an action', async () => {
        const missing = '33333333-3333-4333-8333-333333333333';
        const { saved, result } = submitWith(missing, [RELEASE]);
        const outcome = await result;
        expect(outcome.Success).toBe(false);
        expect(outcome.ErrorMessage).toContain('compensation action(s) that do not exist');
        expect(outcome.ErrorMessage).toContain(missing);
        expect(saved).toEqual([]);
    });

    it('refuses a compensationActionId that is not an ID at all', async () => {
        const outcome = await submitWith('release the reservation', [RELEASE]).result;
        expect(outcome.Success).toBe(false);
        expect(outcome.ErrorMessage).toContain('are not action IDs');
    });

    it('accepts a compensationActionId that names an existing action', async () => {
        const outcome = await submitWith(RELEASE.toUpperCase(), [RELEASE]).result;
        expect(outcome.Success).toBe(true);
    });
});

describe('TaskGraphDispatcher action retries (B4c)', () => {
    let db: SagaDb;
    beforeEach(() => {
        db = new SagaDb();
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (params: RunViewParams, user?: UserInfo) => db.RunView(params, user)),
        } as unknown as RunView);
    });
    afterEach(() => vi.restoreAllMocks());

    async function runStep(row: Row, failures: number): Promise<number> {
        const run = vi.fn();
        for (let i = 0; i < failures; i++) run.mockResolvedValueOnce({ Success: false, ErrorMessage: 'transient' });
        run.mockResolvedValue({ Success: true, Output: {} });
        const actionRunner: TaskActionRunner = { EnforcesSecurityEnvelope: true, RunActionForTask: run };
        const dispatcher = new TaskGraphDispatcher(
            { CreateProvider: vi.fn().mockResolvedValue({} as IMetadataProvider) },
            { RunAgentForTask: vi.fn() },
            TEST_USER,
            { InstanceID: 'inst-retry', RetryBackoffBaseMs: 1 },
            undefined,
            undefined,
            actionRunner,
        );
        (dispatcher as unknown as { claims: { CompleteClaimed: unknown } }).claims.CompleteClaimed = vi.fn().mockResolvedValue(true);
        const task = { ...row, get ConfigurationObject() { return row.Configuration ? JSON.parse(row.Configuration) : null; } } as unknown as MJTaskEntity;
        const parent = parentRow();
        await (dispatcher as unknown as { executeClaimed: (c: ClaimedTaskCandidate) => Promise<void> }).executeClaimed({
            ID: row.ID, ParentID: PARENT_ID, taskEntity: task, parentTask: parent,
            parentMetadata: ParseTaskGraphParentMetadata(parent.InputPayload), dependencyOutputs: new Map(), upstreamTasks: [],
        });
        return run.mock.calls.length;
    }

    it("retries a forward step whose action's IsIdempotent column says so", async () => {
        db.Actions.push({ ID: RESERVE, CompensationActionID: null, CompensationInputMapping: null, IsIdempotent: true });
        const row = db.Add({ ID: 'T-1', Name: 'Reserve', ActionID: RESERVE, Configuration: JSON.stringify({ policy: { retryCount: 2 } }) });
        expect(await runStep(row, 1)).toBe(2);
    });

    it('never retries a forward step whose action is not idempotent', async () => {
        db.Actions.push({ ID: CHARGE, CompensationActionID: null, CompensationInputMapping: null, IsIdempotent: false });
        const row = db.Add({ ID: 'T-2', Name: 'Charge', ActionID: CHARGE, Configuration: JSON.stringify({ policy: { retryCount: 3 } }) });
        expect(await runStep(row, 1)).toBe(1);
    });

    it("never lets a node's isIdempotent: true make a non-idempotent action retryable (S8)", async () => {
        db.Actions.push({ ID: CHARGE, CompensationActionID: null, CompensationInputMapping: null, IsIdempotent: false });
        const row = db.Add({ ID: 'T-3', Name: 'Charge', ActionID: CHARGE, Configuration: JSON.stringify({ policy: { retryCount: 1 }, compensation: { isIdempotent: true } }) });
        expect(await runStep(row, 1)).toBe(1);
    });

    it("lets a node's isIdempotent: false stop retries of an idempotent action", async () => {
        db.Actions.push({ ID: RESERVE, CompensationActionID: null, CompensationInputMapping: null, IsIdempotent: true });
        const row = db.Add({ ID: 'T-5', Name: 'Reserve', ActionID: RESERVE, Configuration: JSON.stringify({ policy: { retryCount: 2 }, compensation: { isIdempotent: false } }) });
        expect(await runStep(row, 1)).toBe(1);
    });

    it("retries a compensation task only when its compensation action is idempotent", async () => {
        db.Actions.push({ ID: VOID_INVOICE, CompensationActionID: null, CompensationInputMapping: null, IsIdempotent: false });
        const row = db.Add({ ID: 'T-4', Name: 'Compensate: Invoice', ActionID: VOID_INVOICE, CompensatesTaskID: 'T-B', Configuration: JSON.stringify({ policy: { retryCount: 3 } }) });
        expect(await runStep(row, 1)).toBe(1);
    });
});
