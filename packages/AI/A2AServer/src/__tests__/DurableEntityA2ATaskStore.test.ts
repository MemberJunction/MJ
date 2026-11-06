import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJTaskEntity } from '@memberjunction/core-entities';
import {
    DurableEntityA2ATaskStore,
    MapA2AStatusToMJTaskStatus,
    MapMJTaskStatusToA2AStatus,
    Task,
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
}

function createFakeUser(id: string, name: string): UserInfo {
    const user: Pick<UserInfo, 'ID' | 'Name' | 'Email' | 'IsActive'> = {
        ID: id,
        Name: name,
        Email: `${name.toLowerCase()}@example.com`,
        IsActive: true,
    };
    return user as UserInfo;
}

function createFakeTaskEntityProvider(rows: Map<string, StoredTaskRow>): IMetadataProvider {
    const getEntityObject = vi.fn(async (): Promise<MJTaskEntity> => {
        const state: StoredTaskRow = {
            ID: '',
            Name: '',
            UserID: null,
            Status: 'Pending',
            StepType: null,
            TypeID: '',
            PercentComplete: 0,
            StartedAt: null,
            CompletedAt: null,
            InputPayload: null,
            OutputPayload: null,
        };

        const entity: Pick<
            MJTaskEntity,
            | 'ID'
            | 'Name'
            | 'UserID'
            | 'Status'
            | 'StepType'
            | 'TypeID'
            | 'PercentComplete'
            | 'StartedAt'
            | 'CompletedAt'
            | 'InputPayload'
            | 'OutputPayload'
            | 'NewRecord'
            | 'Load'
            | 'Save'
            | 'LatestResult'
        > = {
            get ID() {
                return state.ID;
            },
            set ID(v: string) {
                state.ID = v;
            },
            get Name() {
                return state.Name;
            },
            set Name(v: string) {
                state.Name = v;
            },
            get UserID() {
                return state.UserID;
            },
            set UserID(v: string | null) {
                state.UserID = v;
            },
            get Status() {
                return state.Status;
            },
            set Status(v: MJTaskEntity['Status']) {
                state.Status = v;
            },
            get StepType() {
                return state.StepType;
            },
            set StepType(v: MJTaskEntity['StepType']) {
                state.StepType = v;
            },
            get TypeID() {
                return state.TypeID;
            },
            set TypeID(v: string) {
                state.TypeID = v;
            },
            get PercentComplete() {
                return state.PercentComplete;
            },
            set PercentComplete(v: number | null) {
                state.PercentComplete = v;
            },
            get StartedAt() {
                return state.StartedAt;
            },
            set StartedAt(v: Date | null) {
                state.StartedAt = v;
            },
            get CompletedAt() {
                return state.CompletedAt;
            },
            set CompletedAt(v: Date | null) {
                state.CompletedAt = v;
            },
            get InputPayload() {
                return state.InputPayload;
            },
            set InputPayload(v: string | null) {
                state.InputPayload = v;
            },
            get OutputPayload() {
                return state.OutputPayload;
            },
            set OutputPayload(v: string | null) {
                state.OutputPayload = v;
            },
            NewRecord: () => true,
            Load: async (id: string) => {
                const found = rows.get(id.toLowerCase());
                if (!found) {
                    return false;
                }
                Object.assign(state, found);
                return true;
            },
            Save: async () => {
                rows.set(state.ID.toLowerCase(), { ...state });
                return true;
            },
            LatestResult: null,
        };
        return entity as MJTaskEntity;
    });

    const provider: Pick<IMetadataProvider, 'GetEntityObject'> = {
        GetEntityObject: getEntityObject as IMetadataProvider['GetEntityObject'],
    };
    return provider as IMetadataProvider;
}

describe('DurableEntityA2ATaskStore', () => {
    const USER_A = createFakeUser('AAAAAAAA-0000-0000-0000-000000000001', 'Alice');
    const USER_A_LOWER = createFakeUser('aaaaaaaa-0000-0000-0000-000000000001', 'Alice');
    const USER_B = createFakeUser('BBBBBBBB-0000-0000-0000-000000000002', 'Bob');
    const TASK_ID = '11111111-2222-4333-8444-555555555555';
    const TASK_TYPE_ID = '99999999-0000-4000-8000-000000000001';

    describe('Status mapping', () => {
        it('should map A2A statuses bidirectionally with MJ: Tasks statuses', () => {
            expect(MapA2AStatusToMJTaskStatus('pending')).toBe('Pending');
            expect(MapA2AStatusToMJTaskStatus('in_progress')).toBe('In Progress');
            expect(MapA2AStatusToMJTaskStatus('completed')).toBe('Complete');
            expect(MapA2AStatusToMJTaskStatus('cancelled')).toBe('Cancelled');
            expect(MapA2AStatusToMJTaskStatus('failed')).toBe('Failed');

            expect(MapMJTaskStatusToA2AStatus('Pending')).toBe('pending');
            expect(MapMJTaskStatusToA2AStatus('In Progress')).toBe('in_progress');
            expect(MapMJTaskStatusToA2AStatus('Complete')).toBe('completed');
            expect(MapMJTaskStatusToA2AStatus('Cancelled')).toBe('cancelled');
            expect(MapMJTaskStatusToA2AStatus('Failed')).toBe('failed');
        });
    });

    describe('Cross-replica persistence and restart recovery', () => {
        it('should persist tasks on Instance 1 and hydrate/cancel them on Instance 2 with full fidelity', async () => {
            const sharedRows = new Map<string, StoredTaskRow>();
            const provider = createFakeTaskEntityProvider(sharedRows);

            const replica1 = new DurableEntityA2ATaskStore({ DefaultTaskTypeId: TASK_TYPE_ID });
            const replica2 = new DurableEntityA2ATaskStore({ DefaultTaskTypeId: TASK_TYPE_ID });

            const createdDate = new Date('2026-11-02T12:00:00.000Z');
            const updatedDate = new Date('2026-11-02T12:01:00.000Z');
            const initialTask: Task = {
                id: TASK_ID,
                status: 'in_progress',
                messages: [
                    {
                        id: 'msg-1',
                        taskId: TASK_ID,
                        role: 'user',
                        parts: [{ id: 'part-1', type: 'text', content: 'Run financial summary' }],
                        created: createdDate,
                    },
                ],
                artifacts: [
                    {
                        id: 'art-1',
                        taskId: TASK_ID,
                        name: 'partial_result',
                        parts: [{ id: 'part-2', type: 'data', content: { progress: 50 } }],
                        created: updatedDate,
                    },
                ],
                created: createdDate,
                updated: updatedDate,
            };

            const saved = await replica1.SaveTask(initialTask, USER_A, provider);
            expect(saved).toBe(true);
            expect(sharedRows.size).toBe(1);

            // Replica 2 has an empty in-memory Map but shares the backing MJ: Tasks table
            expect(replica2.GetForUser(TASK_ID, USER_A.ID)).toBeUndefined();

            const hydrated = await replica2.LoadTaskForUser(TASK_ID, USER_A_LOWER, provider);
            expect(hydrated).toBeDefined();
            expect(hydrated?.id).toBe(TASK_ID);
            expect(hydrated?.status).toBe('in_progress');
            expect(hydrated?.messages).toHaveLength(1);
            expect(hydrated?.messages[0].parts[0].content).toBe('Run financial summary');
            expect(hydrated?.artifacts).toHaveLength(1);
            expect(hydrated?.artifacts[0].name).toBe('partial_result');
            expect(hydrated?.created.toISOString()).toBe(createdDate.toISOString());

            // Cancel on Replica 2 and verify Replica 1 sees the persisted cancellation when reloading
            const cancelled = await replica2.CancelTaskForUser(TASK_ID, USER_A, 'Stopped on replica 2', provider);
            expect(cancelled).toBe(true);

            const reloadedOnReplica1 = await replica1.LoadTaskForUser(TASK_ID, USER_A, provider);
            expect(reloadedOnReplica1?.status).toBe('cancelled');
            expect(sharedRows.get(TASK_ID.toLowerCase())?.Status).toBe('Cancelled');
        });
    });

    describe('Caller ownership isolation', () => {
        it('should refuse LoadTaskForUser, SaveTask, and CancelTaskForUser to a different user', async () => {
            const sharedRows = new Map<string, StoredTaskRow>();
            const provider = createFakeTaskEntityProvider(sharedRows);
            const store = new DurableEntityA2ATaskStore({ DefaultTaskTypeId: TASK_TYPE_ID });

            const task: Task = {
                id: TASK_ID,
                status: 'pending',
                messages: [],
                artifacts: [],
                created: new Date(),
                updated: new Date(),
            };

            expect(await store.SaveTask(task, USER_A, provider)).toBe(true);

            // User B cannot read User A's task
            expect(await store.LoadTaskForUser(TASK_ID, USER_B, provider)).toBeUndefined();

            // User B cannot cancel User A's task
            expect(await store.CancelTaskForUser(TASK_ID, USER_B, 'Malicious cancel', provider)).toBe(false);

            // User B cannot overwrite User A's task
            const tampered: Task = { ...task, status: 'completed' };
            expect(await store.SaveTask(tampered, USER_B, provider)).toBe(false);

            // User A still sees original 'pending' status
            const ownerView = await store.LoadTaskForUser(TASK_ID, USER_A, provider);
            expect(ownerView?.status).toBe('pending');
        });

        it('should support non-UUID client task IDs by mapping to a generated MJ: Tasks UUID and preserving task.id', async () => {
            const sharedRows = new Map<string, StoredTaskRow>();
            const provider = createFakeTaskEntityProvider(sharedRows);
            const store = new DurableEntityA2ATaskStore({ DefaultTaskTypeId: TASK_TYPE_ID });

            const nonUuidTaskId = 'client-task-custom-42';
            const task: Task = {
                id: nonUuidTaskId,
                status: 'in_progress',
                messages: [],
                artifacts: [],
                created: new Date(),
                updated: new Date(),
            };

            // Assign a generated UUID when NewRecord() runs on the mock entity
            const origGetEntityObject = provider.GetEntityObject.bind(provider);
            provider.GetEntityObject = (async (entityName: string, contextUser?: UserInfo) => {
                const ent = await origGetEntityObject<MJTaskEntity>(entityName, contextUser);
                const origNewRecord = ent.NewRecord.bind(ent);
                ent.NewRecord = () => {
                    const ok = origNewRecord();
                    ent.ID = '77777777-8888-4999-8000-111111111111';
                    return ok;
                };
                return ent;
            }) as IMetadataProvider['GetEntityObject'];

            expect(await store.SaveTask(task, USER_A, provider)).toBe(true);
            const loaded = await store.LoadTaskForUser(nonUuidTaskId, USER_A, provider);
            expect(loaded?.id).toBe(nonUuidTaskId);
            expect(loaded?.status).toBe('in_progress');
        });
    });
});
