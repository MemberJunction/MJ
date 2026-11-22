import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    type IMetadataProvider,
    LimitsConfigResolver,
    Metadata,
    type RunViewParams,
    UserInfo,
} from '@memberjunction/core';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import { MJTaskEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { ActionEngineServer } from '@memberjunction/actions';
import { AIEngine } from '@memberjunction/aiengine';
import {
    Outcome,
    type WorkContext,
    type WorkJson,
    type WorkMessage,
    type WorkOutcome,
} from '@memberjunction/work-queue-core';
import { BaseWorkHandler } from '@memberjunction/work-queue-engine';
import {
    BoundedRunnerSemaphore,
    ForEachEnqueueCoordinator,
    TaskGraphCallerNotificationService,
    TaskGraphQueueRegistry,
    WAITING_STEP_MARKER,
} from '@memberjunction/task-graph';
import {
    TaskGraphEnqueueItemWorkHandler,
    TaskGraphRunWorkHandler,
    TaskGraphWorkQueueExecutors,
} from '../services/TaskGraphWorkQueueService.js';

const TEST_USER = new UserInfo(Metadata.Provider, {
    ID: '80000000-0000-4000-8000-000000000001',
    Name: 'WorkQueue Executor Tester',
    Email: 'wq-exec@example.com',
    IsActive: true,
    UserRoles: [],
});

const WORKFLOW_TYPE_ID = '81000000-0000-4000-8000-000000000001';
const ENV_ID = '82000000-0000-4000-8000-000000000001';

let customHandlerInvocations = 0;

@RegisterClass(BaseWorkHandler, 'CustomCr4EnqueueTarget')
class CustomCr4EnqueueTargetHandler extends BaseWorkHandler<WorkJson> {
    public override async Handle(_message: WorkMessage<WorkJson>, _context: WorkContext): Promise<WorkOutcome> {
        customHandlerInvocations += 1;
        return Outcome.Complete();
    }
}

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
    AgentRunID: string | null;
    ConversationDetailID: string | null;
    CompensatesTaskID: string | null;
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

class InMemoryWorkQueueStore {
    public readonly Tasks = new Map<string, StoredTask>();
    private readonly dialect = new SQLServerDialect();

    public SeedTask(partial: Partial<StoredTask> & { ID: string; Name: string }): StoredTask {
        const row: StoredTask = {
            ParentID: null,
            TypeID: WORKFLOW_TYPE_ID,
            EnvironmentID: ENV_ID,
            Description: null,
            Status: 'Pending',
            StepType: 'External',
            ActionID: null,
            AgentID: null,
            PromptID: null,
            UserID: null,
            AgentRunID: null,
            ConversationDetailID: null,
            CompensatesTaskID: null,
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
                    throw new Error(`Unexpected GetEntityObject: ${entityName}`);
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
            ID: '90000000-0000-4000-8000-000000000099',
            ParentID: null,
            TypeID: WORKFLOW_TYPE_ID,
            EnvironmentID: ENV_ID,
            Name: '',
            Description: null,
            Status: 'Pending',
            StepType: 'External',
            ActionID: null,
            AgentID: null,
            PromptID: null,
            UserID: null,
            AgentRunID: null,
            ConversationDetailID: null,
            CompensatesTaskID: null,
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
        for (const key of Object.keys(row) as Array<keyof StoredTask>) {
            Object.defineProperty(entity, key, {
                get: () => row[key],
                set: (value: StoredTask[typeof key]) => {
                    (row as Record<string, unknown>)[key] = value;
                },
                enumerable: true,
                configurable: true,
            });
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
        if (params.EntityName === 'MJ: Tasks') {
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
            return { Success: true, Results: [] };
        }
        return { Success: true, Results: [] };
    }

    private executeSQL(sql: string, args: ReadonlyArray<string | number | boolean | Date | null>): object[] {
        if (sql.includes('spTaskGraphCompleteWaitingStep')) {
            const [taskId, marker, status, outputPayload, errorMessage] = args as [
                string,
                string,
                MJTaskEntity['Status'],
                string | null,
                string | null,
            ];
            const row = this.Tasks.get(taskId.toLowerCase());
            if (!row || row.Status !== 'Pending' || row.ClaimedBy !== marker) {
                return [{ AffectedRows: 0, Outcome: 'Refused' }];
            }
            row.Status = status;
            row.OutputPayload = outputPayload;
            row.ErrorMessage = errorMessage;
            row.ClaimedBy = null;
            row.CompletedAt = new Date();
            row.PercentComplete = status === 'Complete' ? 100 : 0;
            return [{ AffectedRows: 1, Outcome: 'Completed' }];
        }
        return [{ AffectedRows: 0 }];
    }
}

function makeWorkContext(): WorkContext {
    return {
        SubscriptionName: 'taskgraph.work',
        DeliveryID: 'del-cr4-1',
        Attempt: 1,
        MaxAttempts: 1,
        IsReplay: false,
        Signal: new AbortController().signal,
        Heartbeat: async () => true,
        Log: { Info: () => undefined, Warn: () => undefined, Error: () => undefined },
    };
}

describe('Default WorkQueue Executors (CR-4: ActionName / SubAgentName / HandlerKey + Timeout & Semaphore)', () => {
    afterEach(() => {
        TaskGraphWorkQueueExecutors.Instance.RegisterQueuedGraphExecutor(null);
        TaskGraphWorkQueueExecutors.Instance.RegisterEnqueueItemExecutor(null);
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
        ForEachEnqueueCoordinator.Instance.ResetState();
        TaskGraphCallerNotificationService.Instance.ResetInMemoryState();
        TaskGraphQueueRegistry.Instance.RegisterPublisher(null);
        BoundedRunnerSemaphore.Instance.ResetMetrics();
        customHandlerInvocations = 0;
        vi.restoreAllMocks();
    });

    it('dispatches Enqueue items to custom HandlerKey via ResolveWorkHandler without fake success', async () => {
        void CustomCr4EnqueueTargetHandler;
        const store = new InMemoryWorkQueueStore();
        const provider = store.CreateProvider();
        const taskRow = store.SeedTask({
            ID: '91000000-0000-4000-8000-000000000001',
            ParentID: '91000000-0000-4000-8000-000000000000',
            Name: 'Custom Handler Step',
            Status: 'Pending',
            StepType: 'External',
            ClaimedBy: WAITING_STEP_MARKER,
            CorrelationKey: 'cr4-custom-handler-key',
        });

        const handler = new TaskGraphEnqueueItemWorkHandler();
        handler.BindExecutionContext({ ContextUser: TEST_USER, Provider: provider });

        const outcome = await handler.Handle(
            {
                MessageID: 'msg-custom-1',
                Topic: 'taskgraph.enqueue',
                Attributes: {},
                CorrelationID: 'cr4-custom-handler-key',
                PublishedAt: new Date().toISOString(),
                Payload: {
                    Kind: 'TaskGraph.EnqueueStep',
                    GraphRunID: '91000000-0000-4000-8000-000000000000',
                    StepInvocationID: taskRow.ID,
                    TaskID: taskRow.ID,
                    TaskName: taskRow.Name,
                    CorrelationKey: 'cr4-custom-handler-key',
                    Topic: 'taskgraph.enqueue',
                    HandlerKey: 'CustomCr4EnqueueTarget',
                    InputPayload: { greeting: 'hello' },
                    MaxRetries: 0,
                    PublishedAt: new Date().toISOString(),
                },
            },
            makeWorkContext(),
        );

        expect(outcome.Kind).toBe('Complete');
        expect(customHandlerInvocations).toBe(1);
        expect(taskRow.Status).toBe('Complete');
        expect(BoundedRunnerSemaphore.Instance.ActiveCount).toBe(0);
    });

    it('fails closed with DeadLetter when Enqueue work item specifies no ActionName, SubAgentName, or custom HandlerKey', async () => {
        const store = new InMemoryWorkQueueStore();
        const provider = store.CreateProvider();
        const taskRow = store.SeedTask({
            ID: '92000000-0000-4000-8000-000000000001',
            ParentID: '92000000-0000-4000-8000-000000000000',
            Name: 'Missing Target Step',
            Status: 'Pending',
            StepType: 'External',
            ClaimedBy: WAITING_STEP_MARKER,
            CorrelationKey: 'cr4-missing-target',
        });

        const handler = new TaskGraphEnqueueItemWorkHandler();
        handler.BindExecutionContext({ ContextUser: TEST_USER, Provider: provider });

        const outcome = await handler.Handle(
            {
                MessageID: 'msg-missing-1',
                Topic: 'taskgraph.enqueue',
                Attributes: {},
                CorrelationID: 'cr4-missing-target',
                PublishedAt: new Date().toISOString(),
                Payload: {
                    Kind: 'TaskGraph.EnqueueStep',
                    GraphRunID: '92000000-0000-4000-8000-000000000000',
                    StepInvocationID: taskRow.ID,
                    TaskID: taskRow.ID,
                    TaskName: taskRow.Name,
                    CorrelationKey: 'cr4-missing-target',
                    Topic: 'taskgraph.enqueue',
                    HandlerKey: 'TaskGraph.EnqueueItem',
                    InputPayload: {},
                    MaxRetries: 0,
                    PublishedAt: new Date().toISOString(),
                },
            },
            makeWorkContext(),
        );

        expect(outcome.Kind).toBe('DeadLetter');
        expect(taskRow.Status).toBe('Failed');
        expect(BoundedRunnerSemaphore.Instance.ActiveCount).toBe(0);
    });

    it('fails closed on missing ActionName and missing SubAgentName using ActionEngineServer / AIEngine', async () => {
        const store = new InMemoryWorkQueueStore();
        const provider = store.CreateProvider();
        vi.spyOn(ActionEngineServer.Instance, 'Config').mockResolvedValue(true);
        vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue(true);

        const actionTask = store.SeedTask({
            ID: '93000000-0000-4000-8000-000000000001',
            ParentID: '93000000-0000-4000-8000-000000000000',
            Name: 'Missing Action Step',
            Status: 'Pending',
            StepType: 'External',
            ClaimedBy: WAITING_STEP_MARKER,
            CorrelationKey: 'cr4-missing-action',
        });

        const agentTask = store.SeedTask({
            ID: '93000000-0000-4000-8000-000000000002',
            ParentID: '93000000-0000-4000-8000-000000000000',
            Name: 'Missing SubAgent Step',
            Status: 'Pending',
            StepType: 'External',
            ClaimedBy: WAITING_STEP_MARKER,
            CorrelationKey: 'cr4-missing-agent',
        });

        const handler = new TaskGraphEnqueueItemWorkHandler();
        handler.BindExecutionContext({ ContextUser: TEST_USER, Provider: provider });

        const actionOutcome = await handler.Handle(
            {
                MessageID: 'msg-action-404',
                Topic: 'taskgraph.enqueue',
                Attributes: {},
                CorrelationID: 'cr4-missing-action',
                PublishedAt: new Date().toISOString(),
                Payload: {
                    Kind: 'TaskGraph.EnqueueStep',
                    GraphRunID: '93000000-0000-4000-8000-000000000000',
                    StepInvocationID: actionTask.ID,
                    TaskID: actionTask.ID,
                    TaskName: actionTask.Name,
                    CorrelationKey: 'cr4-missing-action',
                    Topic: 'taskgraph.enqueue',
                    ActionName: 'NonExistentAction__CR4',
                    InputPayload: {},
                    MaxRetries: 2,
                    PublishedAt: new Date().toISOString(),
                },
            },
            makeWorkContext(),
        );
        expect(actionOutcome.Kind).toBe('DeadLetter');
        expect(actionTask.Status).toBe('Failed');

        const agentOutcome = await handler.Handle(
            {
                MessageID: 'msg-agent-404',
                Topic: 'taskgraph.enqueue',
                Attributes: {},
                CorrelationID: 'cr4-missing-agent',
                PublishedAt: new Date().toISOString(),
                Payload: {
                    Kind: 'TaskGraph.EnqueueFanOutItem',
                    GraphRunID: '93000000-0000-4000-8000-000000000000',
                    StepInvocationID: agentTask.ID,
                    TaskID: agentTask.ID,
                    TaskName: agentTask.Name,
                    CorrelationKey: 'cr4-missing-agent-base',
                    ItemCorrelationKey: 'cr4-missing-agent',
                    ItemIndex: 0,
                    ItemKey: '0',
                    ItemVariable: 'item',
                    ItemValue: { id: 1 },
                    Topic: 'taskgraph.enqueue',
                    SubAgentName: 'NonExistentSubAgent__CR4',
                    ContinueOnError: false,
                    Payload: {},
                    MaxRetries: 2,
                    PublishedAt: new Date().toISOString(),
                },
            },
            makeWorkContext(),
        );
        expect(agentOutcome.Kind).toBe('DeadLetter');
        expect(agentTask.Status).toBe('Failed');
    });

    it('bounds defaultQueuedGraphExecutor by QueueDispatchExecutionTimeoutMs and releases BoundedRunnerSemaphore on timeout', async () => {
        const store = new InMemoryWorkQueueStore();
        const provider = store.CreateProvider();
        const parentId = '94000000-0000-4000-8000-000000000001';
        store.SeedTask({
            ID: parentId,
            ParentID: null,
            Name: 'Queued Timeout Graph',
            Status: 'In Progress',
            StepType: 'Simple',
            InputPayload: JSON.stringify({
                version: 1,
                graph: true,
                workflowName: 'Queued Timeout Graph',
                isolation: 'Worker',
                continuation: 'none',
                dispatchMode: 'Queue',
                queueTopic: 'taskgraph.runs',
                queuedMaterialized: true,
                submittedAt: new Date().toISOString(),
                specs: [],
            }),
        });

        LimitsConfigResolver.Instance.RegisterMjConfigLimits({
            TaskGraphQueue: {
                QueueDispatchExecutionTimeoutMs: 65,
                CallerNotificationRetentionMs: 120_000,
            },
        });

        const handler = new TaskGraphRunWorkHandler();
        handler.BindExecutionContext({ ContextUser: TEST_USER, Provider: provider });

        const startedAt = Date.now();
        const outcome = await handler.Handle(
            {
                MessageID: 'msg-run-timeout',
                Topic: 'taskgraph.runs',
                Attributes: {},
                CorrelationID: parentId,
                PublishedAt: new Date().toISOString(),
                Payload: {
                    Kind: 'TaskGraph.RunGraph',
                    ParentTaskID: parentId,
                    WorkflowName: 'Queued Timeout Graph',
                    Isolation: 'Worker',
                    Topic: 'taskgraph.runs',
                    DispatchMode: 'Queue',
                    SubmittedAt: new Date().toISOString(),
                    CorrelationId: parentId,
                },
            },
            makeWorkContext(),
        );
        const elapsedMs = Date.now() - startedAt;

        expect(outcome.Kind).toBe('DeadLetter');
        expect(elapsedMs).toBeLessThan(2000);
        expect(BoundedRunnerSemaphore.Instance.ActiveCount).toBe(0);
    }, 10_000);
});
