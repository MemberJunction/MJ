import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView, type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import type { MJTaskEntity } from '@memberjunction/core-entities';
import {
    A2A_TASK_PROTOCOL,
    A2A_TASK_TYPE_NAME,
    DurableEntityA2ATaskStore,
    MapA2AStatusToMJTaskStatus,
    MapMJTaskStatusToA2AStatus,
    MergeStoredA2ATask,
    type Message,
    type Task,
} from '../TaskStore.js';

interface StoredTaskRow {
    ID: string;
    Name: string;
    UserID: string | null;
    Status: MJTaskEntity['Status'];
    StepType: MJTaskEntity['StepType'];
    TypeID: string;
    PercentComplete: number | null;
    StartedAt: Date | null;
    CompletedAt: Date | null;
    InputPayload: string | null;
    OutputPayload: string | null;
    __mj_UpdatedAt: Date;
}

interface FakeDatabase {
    Rows: Map<string, StoredTaskRow>;
    TaskTypes: Array<{ ID: string; Name: string }>;
    /** Runs once, the next time a task row is loaded (to stage a concurrent writer). */
    OnNextLoad?: (row: StoredTaskRow) => void;
}

const USER_A = fakeUser('AAAAAAAA-0000-4000-8000-000000000001');
const USER_A_LOWER = fakeUser('aaaaaaaa-0000-4000-8000-000000000001');
const USER_B = fakeUser('BBBBBBBB-0000-4000-8000-000000000002');
const TASK_ID = '11111111-2222-4333-8444-555555555555';
const GRAPH_STEP_ID = '66666666-2222-4333-8444-555555555555';
const WORKFLOW_TYPE_ID = '99999999-0000-4000-8000-000000000002';

let clock = 0;

function fakeUser(id: string): UserInfo {
    const user: Pick<UserInfo, 'ID' | 'Name' | 'IsActive'> = { ID: id, Name: id, IsActive: true };
    return user as UserInfo;
}

function emptyRow(): StoredTaskRow {
    return {
        ID: '', Name: '', UserID: null, Status: 'Pending', StepType: null, TypeID: '', PercentComplete: 0,
        StartedAt: null, CompletedAt: null, InputPayload: null, OutputPayload: null, __mj_UpdatedAt: new Date(0),
    };
}

function fakeTaskEntity(db: FakeDatabase): MJTaskEntity {
    const state = emptyRow();
    const entity = {
        NewRecord: () => true,
        Load: async (id: string) => {
            const found = db.Rows.get(id.toLowerCase());
            if (!found) return false;
            const hook = db.OnNextLoad;
            db.OnNextLoad = undefined;
            Object.assign(state, found);
            hook?.(found);
            return true;
        },
        Save: async () => {
            state.__mj_UpdatedAt = new Date(++clock);
            db.Rows.set(state.ID.toLowerCase(), { ...state });
            return true;
        },
        LatestResult: null,
    };
    for (const key of Object.keys(state) as Array<keyof StoredTaskRow>) {
        Object.defineProperty(entity, key, {
            get: () => state[key],
            set: (v: never) => { state[key] = v; },
            enumerable: true,
        });
    }
    return entity as unknown as MJTaskEntity;
}

function fakeProvider(db: FakeDatabase): IMetadataProvider {
    return {
        GetEntityObject: vi.fn(async (entityName: string) => {
            if (entityName === 'MJ: Task Types') {
                const type = {
                    ID: `99999999-0000-4000-8000-00000000010${db.TaskTypes.length}`,
                    Name: '',
                    Description: '',
                    NewRecord: () => true,
                    Save: async () => { db.TaskTypes.push({ ID: type.ID, Name: type.Name }); return true; },
                };
                return type;
            }
            return fakeTaskEntity(db);
        }),
    } as unknown as IMetadataProvider;
}

function message(id: string, at: number): Message {
    return { id, taskId: TASK_ID, role: 'user', parts: [{ id: `${id}-p`, type: 'text', content: id }], created: new Date(at) };
}

function task(status: Task['status'], messages: Message[] = []): Task {
    return { id: TASK_ID, status, messages, artifacts: [], created: new Date(1000), updated: new Date(2000) };
}

describe('DurableEntityA2ATaskStore', () => {
    let db: FakeDatabase;
    beforeEach(() => {
        clock = 10_000;
        db = { Rows: new Map(), TaskTypes: [{ ID: WORKFLOW_TYPE_ID, Name: 'AI Workflow' }] };
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (params: RunViewParams) => {
                const name = /Name='([^']*)'/.exec(params.ExtraFilter ?? '')?.[1];
                return { Success: true, Results: db.TaskTypes.filter((t) => t.Name === name).map((t) => ({ ID: t.ID })) };
            }),
        } as unknown as RunView);
    });
    afterEach(() => vi.restoreAllMocks());

    it('maps A2A statuses bidirectionally with MJ: Tasks statuses', () => {
        expect(MapA2AStatusToMJTaskStatus('pending')).toBe('Pending');
        expect(MapA2AStatusToMJTaskStatus('cancelled')).toBe('Cancelled');
        expect(MapMJTaskStatusToA2AStatus('In Progress')).toBe('in_progress');
        expect(MapMJTaskStatusToA2AStatus('Failed')).toBe('failed');
    });

    it('persists on one replica and hydrates and cancels on another', async () => {
        const provider = fakeProvider(db);
        const replica1 = new DurableEntityA2ATaskStore();
        const replica2 = new DurableEntityA2ATaskStore();

        expect(await replica1.SaveTask(task('in_progress', [message('m1', 1000)]), USER_A, provider)).toBe(true);
        const hydrated = await replica2.LoadTaskForUser(TASK_ID, USER_A_LOWER, provider);
        expect(hydrated?.messages.map((m) => m.id)).toEqual(['m1']);

        expect(await replica2.CancelTaskForUser(TASK_ID, USER_A, 'stop', provider)).toBe(true);
        expect((await replica1.LoadTaskForUser(TASK_ID, USER_A, provider))?.status).toBe('cancelled');
    });

    it("files rows under the 'A2A Task' type, created once by name", async () => {
        const provider = fakeProvider(db);
        await new DurableEntityA2ATaskStore().SaveTask(task('pending'), USER_A, provider);
        await new DurableEntityA2ATaskStore().SaveTask({ ...task('pending'), id: '22222222-2222-4333-8444-555555555555' }, USER_A, provider);

        const a2aTypes = db.TaskTypes.filter((t) => t.Name === A2A_TASK_TYPE_NAME);
        expect(a2aTypes).toHaveLength(1);
        for (const row of db.Rows.values()) {
            expect(row.TypeID).toBe(a2aTypes[0].ID);
            expect(JSON.parse(row.InputPayload ?? '{}').protocol).toBe(A2A_TASK_PROTOCOL);
        }
    });

    it("keeps one user's task from another", async () => {
        const provider = fakeProvider(db);
        const store = new DurableEntityA2ATaskStore();
        expect(await store.SaveTask(task('pending'), USER_A, provider)).toBe(true);
        expect(await store.LoadTaskForUser(TASK_ID, USER_B, provider)).toBeUndefined();
        expect(await store.CancelTaskForUser(TASK_ID, USER_B, 'x', provider)).toBe(false);
        expect(await new DurableEntityA2ATaskStore().SaveTask(task('completed'), USER_B, provider)).toBe(false);
        expect((await store.LoadTaskForUser(TASK_ID, USER_A, provider))?.status).toBe('pending');
    });

    describe('only A2A rows (S5)', () => {
        function stageGraphStep(): StoredTaskRow {
            const row: StoredTaskRow = {
                ...emptyRow(),
                ID: GRAPH_STEP_ID,
                Name: 'Approve refund',
                UserID: USER_A.ID,
                Status: 'Pending',
                StepType: 'Human',
                TypeID: WORKFLOW_TYPE_ID,
                InputPayload: JSON.stringify({ instructions: 'approve' }),
            };
            db.Rows.set(GRAPH_STEP_ID.toLowerCase(), { ...row });
            return row;
        }

        it("reads the caller's own task-graph step as not found", async () => {
            stageGraphStep();
            expect(await new DurableEntityA2ATaskStore().LoadTaskForUser(GRAPH_STEP_ID, USER_A, fakeProvider(db))).toBeUndefined();
        });

        it('refuses to write over it or cancel it', async () => {
            const before = stageGraphStep();
            const store = new DurableEntityA2ATaskStore();
            const provider = fakeProvider(db);
            expect(await store.SaveTask({ ...task('completed'), id: GRAPH_STEP_ID }, USER_A, provider)).toBe(false);
            expect(await store.CancelTaskForUser(GRAPH_STEP_ID, USER_A, 'x', provider)).toBe(false);
            expect(db.Rows.get(GRAPH_STEP_ID.toLowerCase())).toEqual(before);
        });

        it('never creates the A2A type just to read', async () => {
            await new DurableEntityA2ATaskStore().LoadTaskForUser(TASK_ID, USER_A, fakeProvider(db));
            expect(db.TaskTypes.some((t) => t.Name === A2A_TASK_TYPE_NAME)).toBe(false);
        });
    });

    describe('concurrent replicas (B5)', () => {
        it('merges messages two replicas added from stale copies', async () => {
            const provider = fakeProvider(db);
            const replica1 = new DurableEntityA2ATaskStore();
            const replica2 = new DurableEntityA2ATaskStore();
            await replica1.SaveTask(task('in_progress', [message('m1', 1000)]), USER_A, provider);
            const copy2 = await replica2.LoadTaskForUser(TASK_ID, USER_A, provider);
            if (!copy2) throw new Error('expected the task');

            const copy1 = task('in_progress', [message('m1', 1000), message('m2', 3000)]);
            expect(await replica1.SaveTask(copy1, USER_A, provider)).toBe(true);
            copy2.messages.push(message('m3', 4000));
            expect(await replica2.SaveTask(copy2, USER_A, provider)).toBe(true);

            const stored = await new DurableEntityA2ATaskStore().LoadTaskForUser(TASK_ID, USER_A, provider);
            expect(stored?.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
        });

        it('re-reads and merges when the row moves between its read and its write', async () => {
            const provider = fakeProvider(db);
            const store = new DurableEntityA2ATaskStore();
            await store.SaveTask(task('in_progress', [message('m1', 1000)]), USER_A, provider);

            // Another replica's save lands right after this save reads the row.
            db.OnNextLoad = (row) => {
                const payload = JSON.parse(row.InputPayload ?? '{}');
                payload.messages.push({ ...message('other', 2500), created: new Date(2500).toISOString() });
                db.Rows.set(TASK_ID.toLowerCase(), { ...row, InputPayload: JSON.stringify(payload), __mj_UpdatedAt: new Date(++clock) });
            };
            const mine = task('in_progress', [message('m1', 1000), message('mine', 3000)]);
            expect(await store.SaveTask(mine, USER_A, provider)).toBe(true);

            const stored = await new DurableEntityA2ATaskStore().LoadTaskForUser(TASK_ID, USER_A, provider);
            expect(stored?.messages.map((m) => m.id)).toEqual(['m1', 'other', 'mine']);
        });

        it('never writes Complete over a cancellation another replica saved, and stops the local work', async () => {
            const provider = fakeProvider(db);
            const owner = new DurableEntityA2ATaskStore();
            const other = new DurableEntityA2ATaskStore();
            const running = task('in_progress', [message('m1', 1000)]);
            await owner.SaveTask(running, USER_A, provider);
            const controller = owner.RegisterAbortController(TASK_ID);

            expect(await other.CancelTaskForUser(TASK_ID, USER_A, 'stop', provider)).toBe(true);
            running.status = 'completed';
            await owner.NotifyTask(running, USER_A, provider);

            expect(db.Rows.get(TASK_ID.toLowerCase())?.Status).toBe('Cancelled');
            expect(running.status).toBe('cancelled');
            expect(controller.signal.aborted).toBe(true);
        });
    });

    describe('MergeStoredA2ATask', () => {
        it('keeps a terminal stored status and reports that it won', () => {
            const current = task('in_progress');
            expect(MergeStoredA2ATask(current, task('failed'))).toBe(true);
            expect(current.status).toBe('failed');
        });

        it('lets a non-terminal stored status give way', () => {
            const current = task('completed');
            expect(MergeStoredA2ATask(current, task('in_progress'))).toBe(false);
            expect(current.status).toBe('completed');
        });
    });
});
