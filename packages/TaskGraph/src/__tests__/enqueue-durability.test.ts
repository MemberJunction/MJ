import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    type IMetadataProvider,
    Metadata,
    type RunViewParams,
    UserInfo,
} from '@memberjunction/core';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import { MJTaskEntity } from '@memberjunction/core-entities';
import {
    ForEachEnqueueCoordinator,
    TaskClaimStore,
    TaskGraphCallerNotificationService,
    TaskGraphQueueRegistry,
    TaskGraphWaitingSteps,
    WAITING_STEP_MARKER,
    WaitingStepRunner,
} from '../index';

const TEST_USER = new UserInfo(Metadata.Provider, {
    ID: '10000000-0000-4000-8000-000000000001',
    Name: 'Durability Tester',
    Email: 'durability@example.com',
    IsActive: true,
    UserRoles: [],
});

interface StoredTask {
    ID: string;
    ParentID: string | null;
    TypeID: string;
    EnvironmentID: string;
    Name: string;
    Description: string | null;
    Status: MJTaskEntity['Status'];
    StepType: MJTaskEntity['StepType'];
    ActionID: string | null;
    AgentID: string | null;
    PromptID: string | null;
    UserID: string | null;
    ClaimedBy: string | null;
    ClaimExpiresAt: Date | null;
    StartedAt: Date | null;
    CompletedAt: Date | null;
    DueAt: Date | null;
    CorrelationKey: string | null;
    PercentComplete: number;
    ErrorMessage: string | null;
    InputPayload: string | null;
    OutputPayload: string | null;
    Configuration: string | null;
    SecurityEnvelope: string | null;
    __mj_UpdatedAt: Date;
}

class InMemoryWaitingStore {
    public readonly Tasks = new Map<string, StoredTask>();
    public SentinelQueryCount = 0;
    private readonly dialect = new SQLServerDialect();
    private seq = 0;

    public SeedTask(partial: Partial<StoredTask> & { ID: string; Name: string }): StoredTask {
        const row: StoredTask = {
            ParentID: null,
            TypeID: '20000000-0000-4000-8000-000000000001',
            EnvironmentID: '30000000-0000-4000-8000-000000000001',
            Description: null,
            Status: 'Pending',
            StepType: 'External',
            ActionID: null,
            AgentID: null,
            PromptID: null,
            UserID: null,
            ClaimedBy: null,
            ClaimExpiresAt: null,
            StartedAt: null,
            CompletedAt: null,
            DueAt: null,
            CorrelationKey: null,
            PercentComplete: 0,
            ErrorMessage: null,
            InputPayload: null,
            OutputPayload: null,
            Configuration: null,
            SecurityEnvelope: null,
            __mj_UpdatedAt: new Date(),
            ...partial,
        };
        this.Tasks.set(row.ID.toLowerCase(), row);
        return row;
    }

    public CreateProvider(): IMetadataProvider {
        const store = this;
        const baseProvider = Metadata.Provider;
        const providerLike = {
            MJCoreSchemaName: '__mj',
            PlatformKey: 'sqlserver',
            Dialect: store.dialect,
            QuoteIdentifier: (id: string) => `[${id}]`,
            BuildParameterPlaceholder: (i: number) => `@p${i}`,
            Entities: baseProvider?.Entities ?? [],
            EntityByName: () => undefined,
            CurrentUser: TEST_USER,
            GetEntityObject: async <T>(entityName: string): Promise<T> => {
                if (entityName !== 'MJ: Tasks') {
                    throw new Error(`Unexpected entity requested: ${entityName}`);
                }
                return store.wrapTask() as T;
            },
            RunView: async (params: RunViewParams) => store.runView(params),
            RunViews: async (list: RunViewParams[]) => list.map((p) => store.runView(p)),
            ExecuteSQL: async (sql: string, args?: ReadonlyArray<string | number | boolean | Date | null>) =>
                store.executeSQL(sql, args ?? []),
        };
        return providerLike as unknown as IMetadataProvider;
    }

    private wrapTask(existing?: StoredTask): MJTaskEntity {
        const store = this;
        let row: StoredTask = existing ?? {
            ID: `40000000-0000-4000-8000-${String(++store.seq).padStart(12, '0')}`,
            ParentID: null,
            TypeID: '20000000-0000-4000-8000-000000000001',
            EnvironmentID: '30000000-0000-4000-8000-000000000001',
            Name: '',
            Description: null,
            Status: 'Pending',
            StepType: 'External',
            ActionID: null,
            AgentID: null,
            PromptID: null,
            UserID: null,
            ClaimedBy: null,
            ClaimExpiresAt: null,
            StartedAt: null,
            CompletedAt: null,
            DueAt: null,
            CorrelationKey: null,
            PercentComplete: 0,
            ErrorMessage: null,
            InputPayload: null,
            OutputPayload: null,
            Configuration: null,
            SecurityEnvelope: null,
            __mj_UpdatedAt: new Date(),
        };

        const entity = Object.create(MJTaskEntity.prototype) as MJTaskEntity & {
            Load: (id: string) => Promise<boolean>;
            Save: () => Promise<boolean>;
            LatestResult: { Message: string } | null;
        };

        const def = (name: keyof StoredTask): void => {
            Object.defineProperty(entity, name, {
                get: () => row[name],
                set: (value: StoredTask[typeof name]) => {
                    (row as Record<string, unknown>)[name] = value;
                },
                enumerable: true,
                configurable: true,
            });
        };

        for (const key of Object.keys(row) as Array<keyof StoredTask>) {
            def(key);
        }

        Object.defineProperty(entity, 'LatestResult', {
            get: () => null,
            enumerable: true,
            configurable: true,
        });
        Object.defineProperty(entity, 'NewRecord', {
            value: () => true,
            enumerable: true,
            configurable: true,
        });
        entity.Load = async (id: string): Promise<boolean> => {
            const found = store.Tasks.get(id.toLowerCase());
            if (!found) return false;
            row = { ...found };
            return true;
        };
        entity.Save = async (): Promise<boolean> => {
            row.__mj_UpdatedAt = new Date();
            store.Tasks.set(row.ID.toLowerCase(), { ...row });
            return true;
        };
        return entity;
    }

    private runView(params: RunViewParams): { Success: boolean; Results: object[] } {
        const filter = params.ExtraFilter ?? '';
        if (params.EntityName === 'MJ: Task Types') {
            return { Success: true, Results: [{ ID: '20000000-0000-4000-8000-000000000001', Name: 'Orchestrated Workflow' }] };
        }
        if (params.EntityName === 'MJ: Environments') {
            return { Success: true, Results: [{ ID: '30000000-0000-4000-8000-000000000001', Name: 'Default' }] };
        }
        if (params.EntityName === 'MJ: Tasks') {
            if (filter.includes('__early_signal__:')) {
                this.SentinelQueryCount += 1;
            }
            const corrMatch = /CorrelationKey='([^']+)'/.exec(filter);
            if (corrMatch?.[1]) {
                const targetKey = corrMatch[1];
                const stepMatch = /StepType='([^']+)'/.exec(filter);
                const matches = [...this.Tasks.values()].filter(
                    (t) => t.CorrelationKey === targetKey && (!stepMatch || t.StepType === stepMatch[1]),
                );
                return { Success: true, Results: matches.map((m) => this.wrapTask(m)) };
            }
            const parentMatch = /ParentID='([^']+)'/.exec(filter);
            if (parentMatch?.[1]) {
                const pid = parentMatch[1].toLowerCase();
                const matches = [...this.Tasks.values()].filter((t) => t.ParentID?.toLowerCase() === pid);
                return {
                    Success: true,
                    Results: params.ResultType === 'simple' ? matches : matches.map((m) => this.wrapTask(m)),
                };
            }
            return { Success: true, Results: [...this.Tasks.values()].slice(0, 1) };
        }
        return { Success: true, Results: [] };
    }

    private executeSQL(sql: string, args: ReadonlyArray<string | number | boolean | Date | null>): object[] {
        if (sql.includes('spTaskGraphMarkWaiting')) {
            const [taskId, marker, dueAt, correlationKey, payloadAtStart, inputTainted] = args as [
                string,
                string,
                Date | null,
                string | null,
                string | null,
                boolean,
            ];
            const row = this.Tasks.get(taskId.toLowerCase());
            if (!row || row.Status !== 'Pending' || row.ClaimedBy) {
                return [{ AffectedRows: 0 }];
            }
            row.ClaimedBy = marker;
            row.DueAt = dueAt;
            row.CorrelationKey = correlationKey ?? row.CorrelationKey;
            const cfg = JSON.parse(row.Configuration ?? '{}') as Record<string, unknown>;
            const rt = (cfg['runtime'] as Record<string, unknown> | undefined) ?? {};
            rt['payloadAtStart'] = payloadAtStart ? JSON.parse(payloadAtStart) : undefined;
            rt['isInputTainted'] = inputTainted;
            cfg['runtime'] = rt;
            row.Configuration = JSON.stringify(cfg);
            return [{ AffectedRows: 1 }];
        }
        if (sql.includes('spTaskGraphCompleteWaitingStep')) {
            const [taskId, marker, status, outputPayload, errorMessage, signalJson, outputTainted] = args as [
                string,
                string,
                MJTaskEntity['Status'],
                string | null,
                string | null,
                string,
                boolean,
            ];
            const row = this.Tasks.get(taskId.toLowerCase());
            if (!row || row.Status !== 'Pending') {
                return [{ AffectedRows: 0, Outcome: 'Refused' }];
            }
            const cfg = JSON.parse(row.Configuration ?? '{}') as Record<string, unknown>;
            const rt = (cfg['runtime'] as Record<string, unknown> | undefined) ?? {};
            if (row.ClaimedBy === marker) {
                row.Status = status;
                row.OutputPayload = outputPayload;
                row.ErrorMessage = errorMessage;
                row.ClaimedBy = null;
                row.CompletedAt = new Date();
                row.PercentComplete = status === 'Complete' ? 100 : 0;
                rt['isOutputTainted'] = outputTainted;
                cfg['runtime'] = rt;
                row.Configuration = JSON.stringify(cfg);
                return [{ AffectedRows: 1, Outcome: 'Completed' }];
            }
            rt['pendingSignal'] = JSON.parse(signalJson);
            cfg['runtime'] = rt;
            row.Configuration = JSON.stringify(cfg);
            return [{ AffectedRows: 1, Outcome: 'Buffered' }];
        }
        return [{ AffectedRows: 0 }];
    }
}

describe('Enqueue & ForEach+Enqueue Durability and O(1) Early Reconciliation (CR-5, CR-8)', () => {
    afterEach(() => {
        ForEachEnqueueCoordinator.Instance.ResetState();
        TaskGraphCallerNotificationService.Instance.ResetInMemoryState();
        TaskGraphQueueRegistry.Instance.RegisterPublisher(null);
        vi.restoreAllMocks();
    });

    it('persists early completions durably so WaitingStepRunner settles the Enqueue step across a host ResetState()', async () => {
        const store = new InMemoryWaitingStore();
        const provider = store.CreateProvider();
        const correlationKey = 'early-survive-host-restart';

        // 1. Signal arrives BEFORE the Enqueue task exists / has reached waiting state
        const earlyOutcome = await TaskGraphWaitingSteps.CompleteWaitingStep(
            {
                CorrelationKey: correlationKey,
                Status: 'Complete',
                Payload: { approved: true, score: 99 },
            },
            provider,
            TEST_USER,
        );
        expect(earlyOutcome.Success).toBe(true);
        expect(earlyOutcome.Completed).toEqual([]);
        expect(earlyOutcome.Buffered).toEqual([correlationKey]);

        // 2. Simulate full process restart wiping in-memory earlyByKey state
        ForEachEnqueueCoordinator.Instance.ResetState();

        // 3. Seed parent + Enqueue step and reach it via WaitingStepRunner
        const parentId = '50000000-0000-4000-8000-000000000001';
        const stepId = '50000000-0000-4000-8000-000000000002';
        store.SeedTask({ ID: parentId, Name: 'Enqueue Parent', Status: 'In Progress' });
        const stepRow = store.SeedTask({
            ID: stepId,
            ParentID: parentId,
            Name: 'Queued Approval',
            Status: 'Pending',
            StepType: 'External',
            Configuration: JSON.stringify({
                stepKind: 'Enqueue',
                enqueue: {
                    topic: 'taskgraph.enqueue',
                    actionName: 'Send Email',
                    correlationKey,
                },
            }),
        });

        TaskGraphQueueRegistry.Instance.RegisterPublisher({
            Publish: async () => [{ WorkItemId: 'wi-1', Status: 'Queued', MessageId: 'm-1' }],
        });

        const runner = new WaitingStepRunner(new TaskClaimStore('inst-cr5', 60), () => TEST_USER);
        const taskEntity = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', TEST_USER);
        await taskEntity.Load(stepRow.ID);

        const changed = await runner.Reach(
            {
                Task: taskEntity,
                Payload: { origin: 'workflow' },
                OwnerUserID: TEST_USER.ID,
                InputTainted: false,
            },
            provider,
        );
        expect(changed).toBe(true);

        const persisted = store.Tasks.get(stepId)!;
        expect(persisted.Status).toBe('Complete');
        expect(JSON.parse(persisted.OutputPayload ?? '{}')).toEqual({
            origin: 'workflow',
            approved: true,
            score: 99,
        });
    });

    it('does not clobber a concurrent Cancelled status in ForEachEnqueueCoordinator checkpoints (CR-5)', async () => {
        const store = new InMemoryWaitingStore();
        const provider = store.CreateProvider();
        const parentId = '60000000-0000-4000-8000-000000000001';
        const fanOutId = '60000000-0000-4000-8000-000000000002';
        const correlationKey = 'fanout-cancel-race';

        store.SeedTask({ ID: parentId, Name: 'Cancel Race Parent', Status: 'In Progress' });
        const fanOutRow = store.SeedTask({
            ID: fanOutId,
            ParentID: parentId,
            Name: 'Bounded FanOut',
            Status: 'Pending',
            StepType: 'Loop',
            ClaimedBy: WAITING_STEP_MARKER,
            CorrelationKey: correlationKey,
            Configuration: JSON.stringify({
                forEach: {
                    collectionPath: 'items',
                    itemVariable: 'item',
                    enqueue: {
                        topic: 'fanout.topic',
                        actionName: 'ProcessItem',
                        correlationKey,
                    },
                },
                runtime: {
                    forEachEnqueue: {
                        correlationKey,
                        topic: 'fanout.topic',
                        totalItems: 2,
                        completedCount: 0,
                        failedCount: 0,
                        completionBitmapHex: '00',
                        publishFinished: false,
                        continueOnError: false,
                        publishedAt: new Date().toISOString(),
                    },
                },
            }),
        });

        // Concurrent operator cancellation transitions task row to Cancelled
        fanOutRow.Status = 'Cancelled';
        fanOutRow.ClaimedBy = null;

        const outcome = await ForEachEnqueueCoordinator.Instance.RecordItemCompletion({
            TaskID: fanOutId,
            CorrelationKey: `${correlationKey}:item:0`,
            ItemIndex: 0,
            Status: 'Complete',
            Payload: { ok: true },
            Provider: provider,
            ContextUser: TEST_USER,
        });
        expect(outcome.Success).toBe(true);
        expect(outcome.DuplicateIgnored).toBe(true);
        expect(outcome.FanOutSettled).toBe(true);
        expect(store.Tasks.get(fanOutId)?.Status).toBe('Cancelled');
    });

    it('short-circuits reconcileEarlyCompletions in O(1) without scanning 0..totalItems when no early completions exist (CR-8)', async () => {
        const store = new InMemoryWaitingStore();
        const provider = store.CreateProvider();
        const parentId = '70000000-0000-4000-8000-000000000001';
        const fanOutId = '70000000-0000-4000-8000-000000000002';

        store.SeedTask({ ID: parentId, Name: 'Large FanOut Parent', Status: 'In Progress' });
        const fanOutRow = store.SeedTask({
            ID: fanOutId,
            ParentID: parentId,
            Name: '10k Enqueue FanOut',
            Status: 'Pending',
            StepType: 'Loop',
            Configuration: JSON.stringify({
                forEach: {
                    collectionPath: 'items',
                    itemVariable: 'item',
                    enqueue: {
                        topic: 'fanout.large',
                        actionName: 'ProcessItem',
                        correlationKey: 'large-fanout-key',
                        publishBatchSize: 500,
                    },
                },
            }),
        });

        TaskGraphQueueRegistry.Instance.RegisterPublisher({
            Publish: async (reqs) => reqs.map((_, i) => ({ WorkItemId: `w-${i}`, Status: 'Queued', MessageId: `m-${i}` })),
        });

        const parseSpy = vi.spyOn(ForEachEnqueueCoordinator.Instance, 'ParseFanOutItemCorrelationKey');
        const taskEntity = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', TEST_USER);
        await taskEntity.Load(fanOutRow.ID);

        const startedAt = Date.now();
        const started = await ForEachEnqueueCoordinator.Instance.StartFanOut({
            Task: taskEntity,
            Payload: { items: Array.from({ length: 10_000 }, (_, i) => ({ id: i })) },
            InputTainted: false,
            Provider: provider,
            ContextUser: TEST_USER,
        });
        const elapsedMs = Date.now() - startedAt;

        expect(started).toBe(true);
        // CR-8 guarantee: empty early buffer skips 0..10_000 key parsing entirely
        expect(parseSpy).not.toHaveBeenCalled();
        expect(store.SentinelQueryCount).toBe(1);
        expect(elapsedMs).toBeLessThan(2000);
    });
});
