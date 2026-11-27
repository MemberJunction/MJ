/**
 * @fileoverview Comprehensive deterministic integration tests for Epic 2 Slice 2:
 *   2.2 Graphs on Queues (`Dispatch: 'Queue'`, Isolation honor, durable caller notification recovery across restarts)
 *   2.3 Queue Steps inside Graphs (`Enqueue` step, 10,000-item bounded `ForEach` + `Enqueue` fan-out,
 *       early completion before waiting persistence, duplicate delivery / repeated `CompleteWaitingStep`
 *       idempotency, worker crash/restart & redelivery, and terminal failure propagation)
 *
 * Tested deterministically across BOTH transports:
 *   - Database transport semantics (`InMemoryTransport`)
 *   - AWS SQS + SNS transport (`AwsTransportDriver` + `FakeSnsGateway` + `FakeSqsGateway`)
 */
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
    LimitsConfigResolver,
    Metadata,
    UserInfo,
    type IMetadataProvider,
    type RunViewParams,
    type TaskGraphIsolationLevel,
} from '@memberjunction/core';
import type { MJTaskDependencyEntity, MJTaskEntity } from '@memberjunction/core-entities';
import { TaskNode, type TaskGraphSpec } from '@memberjunction/ai-core-plus';
import {
    BoundedRunnerSemaphore,
    ForEachEnqueueCoordinator,
    ParseTaskGraphParentMetadata,
    TaskGraphCallerNotificationService,
    TaskGraphDispatcher,
    TaskGraphQueueRegistry,
    TaskGraphService,
    TaskGraphWaitingSteps,
    WAITING_STEP_MARKER,
    type TaskActionRunner,
    type TaskAgentRunner,
    type TaskGraphWorkQueuePublishRequest,
    type TaskGraphWorkQueuePublishResult,
    type TaskGraphWorkQueuePublisher,
} from '@memberjunction/task-graph';
import {
    ConsumerRuntime,
    InMemoryTransport,
    NULL_WORK_LOGGER,
    SUBSCRIPTION_POLICY_DEFAULTS,
    type ITransportDriver,
    type SubscriptionBinding,
    type TopicBinding,
    type WorkContext,
    type WorkHandler,
    type WorkJson,
    type WorkMessage,
    type WorkOutcome,
} from '@memberjunction/work-queue-core';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import { AwsTransportDriver } from '@memberjunction/work-queue-aws';
import { FakeSnsGateway, FakeSqsGateway } from '@memberjunction/work-queue-aws/testing';
import {
    TaskGraphEnqueueItemWorkHandler,
    TaskGraphRunWorkHandler,
    TaskGraphWorkQueueExecutors,
} from '../services/TaskGraphWorkQueueService.js';

const TEST_USER = new UserInfo(null, {
    ID: '10000000-0000-4000-8000-000000000099',
    Name: 'Slice2 Tester',
    Email: 'slice2@example.com',
    IsActive: true,
    UserRoles: [],
});

const WORKFLOW_TYPE_ID = '20000000-0000-4000-8000-000000000002';
const TEST_ACTION_ID = '30000000-0000-4000-8000-000000000002';
const ENV_ID = '60000000-0000-4000-8000-000000000002';
const TERMINAL_STATUSES = new Set(['Complete', 'Failed', 'Cancelled', 'Skipped']);

interface StoredTaskRow {
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
    ClaimedBy: string | null;
    ClaimExpiresAt: Date | null;
    StartedAt: Date | null;
    CompletedAt: Date | null;
    DueAt: Date | null;
    CorrelationKey: string | null;
    NextAttemptAt: Date | null;
    PercentComplete: number;
    ErrorMessage: string | null;
    InputPayload: string | null;
    OutputPayload: string | null;
    Configuration: string | null;
    SecurityEnvelope: string | null;
    RetryCount: number;
    __mj_UpdatedAt: Date;
}

interface StoredDepRow {
    ID: string;
    TaskID: string;
    DependsOnTaskID: string;
    DependencyType: MJTaskDependencyEntity['DependencyType'];
    Condition: string | null;
    ExclusiveGroup: string | null;
    Priority: number;
    Sequence: number;
}

/**
 * Clean strongly-typed in-memory persistence backing `TaskGraphService`, `TaskClaimStore`,
 * `TaskGraphWaitingSteps`, and `TaskGraphDispatcher` with zero `.Get()`/`.Set()` or `any`.
 */
class InMemoryTaskGraphStore {
    public readonly Tasks = new Map<string, StoredTaskRow>();
    public readonly Deps: StoredDepRow[] = [];
    private readonly dialect = new SQLServerDialect();

    public GetRow(id: string): StoredTaskRow | undefined {
        return this.Tasks.get(id.toLowerCase());
    }

    public CreateProvider(): IMetadataProvider {
        const store = this;
        const baseProvider = Metadata.Provider;

        const provider = {
            MJCoreSchemaName: '__mj',
            PlatformKey: 'sqlserver',
            Dialect: store.dialect,
            QuoteIdentifier: (id: string) => `[${id}]`,
            BuildParameterPlaceholder: (i: number) => `@p${i}`,
            Entities: baseProvider?.Entities ?? [],
            EntityByName: () => undefined,
            CurrentUser: TEST_USER,
            GetEntityObject: async <T>(entityName: string): Promise<T> => {
                if (entityName === 'MJ: Tasks') {
                    return store.createTaskWrapper() as T;
                }
                if (entityName === 'MJ: Task Dependencies') {
                    return store.createDepWrapper() as T;
                }
                throw new Error(`Unexpected GetEntityObject entity: ${entityName}`);
            },
            RunView: async (params: RunViewParams) => store.runView(params),
            RunViews: async (items: RunViewParams[]) => {
                const results: Array<{ Success: boolean; Results: object[] }> = [];
                for (const item of items) {
                    results.push(store.runView(item));
                }
                return results;
            },
            ExecuteSQL: async (sql: string, values?: ReadonlyArray<string | number | boolean | Date | null>) =>
                store.executeSQL(sql, values ?? []),
        };
        return provider as IMetadataProvider;
    }

    private createTaskWrapper(initial?: StoredTaskRow): MJTaskEntity {
        const row: StoredTaskRow = initial
            ? { ...initial }
            : {
                  ID: '',
                  ParentID: null,
                  TypeID: WORKFLOW_TYPE_ID,
                  EnvironmentID: ENV_ID,
                  Name: '',
                  Description: null,
                  Status: 'Pending',
                  StepType: 'Action',
                  ActionID: null,
                  AgentID: null,
                  PromptID: null,
                  UserID: null,
                  AgentRunID: null,
                  ConversationDetailID: null,
                  ClaimedBy: null,
                  ClaimExpiresAt: null,
                  StartedAt: null,
                  CompletedAt: null,
                  DueAt: null,
                  CorrelationKey: null,
                  NextAttemptAt: null,
                  PercentComplete: 0,
                  ErrorMessage: null,
                  InputPayload: null,
                  OutputPayload: null,
                  Configuration: null,
                  SecurityEnvelope: null,
                  RetryCount: 0,
                  __mj_UpdatedAt: new Date(),
              };
        const store = this;
        const wrapper = {
            get ID() { return row.ID; },
            set ID(v: string) { row.ID = v; },
            get ParentID() { return row.ParentID; },
            set ParentID(v: string | null) { row.ParentID = v; },
            get TypeID() { return row.TypeID; },
            set TypeID(v: string) { row.TypeID = v; },
            get EnvironmentID() { return row.EnvironmentID; },
            set EnvironmentID(v: string) { row.EnvironmentID = v; },
            get Name() { return row.Name; },
            set Name(v: string) { row.Name = v; },
            get Description() { return row.Description; },
            set Description(v: string | null) { row.Description = v; },
            get Status() { return row.Status; },
            set Status(v: MJTaskEntity['Status']) { row.Status = v; },
            get StepType() { return row.StepType; },
            set StepType(v: MJTaskEntity['StepType']) { row.StepType = v; },
            get ActionID() { return row.ActionID; },
            set ActionID(v: string | null) { row.ActionID = v; },
            get AgentID() { return row.AgentID; },
            set AgentID(v: string | null) { row.AgentID = v; },
            get PromptID() { return row.PromptID; },
            set PromptID(v: string | null) { row.PromptID = v; },
            get UserID() { return row.UserID; },
            set UserID(v: string | null) { row.UserID = v; },
            get AgentRunID() { return row.AgentRunID; },
            set AgentRunID(v: string | null) { row.AgentRunID = v; },
            get ConversationDetailID() { return row.ConversationDetailID; },
            set ConversationDetailID(v: string | null) { row.ConversationDetailID = v; },
            get ClaimedBy() { return row.ClaimedBy; },
            set ClaimedBy(v: string | null) { row.ClaimedBy = v; },
            get ClaimExpiresAt() { return row.ClaimExpiresAt; },
            set ClaimExpiresAt(v: Date | null) { row.ClaimExpiresAt = v; },
            get StartedAt() { return row.StartedAt; },
            set StartedAt(v: Date | null) { row.StartedAt = v; },
            get CompletedAt() { return row.CompletedAt; },
            set CompletedAt(v: Date | null) { row.CompletedAt = v; },
            get DueAt() { return row.DueAt; },
            set DueAt(v: Date | null) { row.DueAt = v; },
            get CorrelationKey() { return row.CorrelationKey; },
            set CorrelationKey(v: string | null) { row.CorrelationKey = v; },
            get NextAttemptAt() { return row.NextAttemptAt; },
            set NextAttemptAt(v: Date | null) { row.NextAttemptAt = v; },
            get PercentComplete() { return row.PercentComplete; },
            set PercentComplete(v: number) { row.PercentComplete = v; },
            get ErrorMessage() { return row.ErrorMessage; },
            set ErrorMessage(v: string | null) { row.ErrorMessage = v; },
            get InputPayload() { return row.InputPayload; },
            set InputPayload(v: string | null) { row.InputPayload = v; },
            get OutputPayload() { return row.OutputPayload; },
            set OutputPayload(v: string | null) { row.OutputPayload = v; },
            get Configuration() { return row.Configuration; },
            set Configuration(v: string | null) { row.Configuration = v; },
            get SecurityEnvelope() { return row.SecurityEnvelope; },
            set SecurityEnvelope(v: string | null) { row.SecurityEnvelope = v; },
            get RetryCount() { return row.RetryCount; },
            set RetryCount(v: number) { row.RetryCount = v; },
            get __mj_UpdatedAt() { return row.__mj_UpdatedAt; },
            get ConfigurationObject() {
                if (!row.Configuration) return null;
                try {
                    return JSON.parse(row.Configuration) as MJTaskEntity['ConfigurationObject'];
                } catch {
                    return null;
                }
            },
            LatestResult: { CompleteMessage: '' },
            NewRecord: () => {
                if (!row.ID) row.ID = randomUUID();
                return true;
            },
            Load: async (id: string) => {
                const found = store.GetRow(id);
                if (!found) return false;
                Object.assign(row, found);
                return true;
            },
            Save: async () => {
                if (!row.ID) row.ID = randomUUID();
                row.__mj_UpdatedAt = new Date();
                store.Tasks.set(row.ID.toLowerCase(), { ...row });
                return true;
            },
        };
        return wrapper as MJTaskEntity;
    }

    private createDepWrapper(): MJTaskDependencyEntity {
        const dep: StoredDepRow = {
            ID: '',
            TaskID: '',
            DependsOnTaskID: '',
            DependencyType: 'Prerequisite',
            Condition: null,
            ExclusiveGroup: null,
            Priority: 0,
            Sequence: 0,
        };
        const store = this;
        const wrapper = {
            get ID() { return dep.ID; },
            set ID(v: string) { dep.ID = v; },
            get TaskID() { return dep.TaskID; },
            set TaskID(v: string) { dep.TaskID = v; },
            get DependsOnTaskID() { return dep.DependsOnTaskID; },
            set DependsOnTaskID(v: string) { dep.DependsOnTaskID = v; },
            get DependencyType() { return dep.DependencyType; },
            set DependencyType(v: MJTaskDependencyEntity['DependencyType']) { dep.DependencyType = v; },
            get Condition() { return dep.Condition; },
            set Condition(v: string | null) { dep.Condition = v; },
            get ExclusiveGroup() { return dep.ExclusiveGroup; },
            set ExclusiveGroup(v: string | null) { dep.ExclusiveGroup = v; },
            get Priority() { return dep.Priority; },
            set Priority(v: number) { dep.Priority = v; },
            get Sequence() { return dep.Sequence; },
            set Sequence(v: number) { dep.Sequence = v; },
            LatestResult: { CompleteMessage: '' },
            NewRecord: () => {
                if (!dep.ID) dep.ID = randomUUID();
                return true;
            },
            Save: async () => {
                if (!dep.ID) dep.ID = randomUUID();
                store.Deps.push({ ...dep });
                return true;
            },
        };
        return wrapper as MJTaskDependencyEntity;
    }

    private runView(params: RunViewParams): { Success: boolean; Results: object[] } {
        const filter = params.ExtraFilter ?? '';
        if (params.EntityName === 'MJ: Task Types') {
            return { Success: true, Results: [{ ID: WORKFLOW_TYPE_ID, Name: 'Orchestrated Workflow' }] };
        }
        if (params.EntityName === 'MJ: Actions') {
            return {
                Success: true,
                Results: [
                    { ID: TEST_ACTION_ID, Name: 'DoWork', Status: 'Active' },
                    { ID: TEST_ACTION_ID, Name: 'DownstreamWork', Status: 'Active' },
                ],
            };
        }
        if (params.EntityName === 'MJ: Task Dependencies') {
            const idsMatch = /TaskID IN \(([^)]+)\)/.exec(filter);
            if (!idsMatch) return { Success: true, Results: [...this.Deps] };
            const ids = new Set(idsMatch[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '').toLowerCase()));
            return { Success: true, Results: this.Deps.filter((d) => ids.has(d.TaskID.toLowerCase())) };
        }
        if (params.EntityName === 'MJ: Tasks') {
            if (filter.includes('ParentID IS NOT NULL') && filter.includes("Status IN ('Pending','In Progress')")) {
                const seen = new Set<string>();
                const rows: Array<{ ParentID: string }> = [];
                for (const t of this.Tasks.values()) {
                    if (t.ParentID && (t.Status === 'Pending' || t.Status === 'In Progress') && !seen.has(t.ParentID.toLowerCase())) {
                        seen.add(t.ParentID.toLowerCase());
                        rows.push({ ParentID: t.ParentID });
                    }
                }
                return { Success: true, Results: rows };
            }
            if (filter.includes('ParentID IS NULL') && filter.includes("Status IN ('Complete','Failed','Cancelled')")) {
                const parents = [...this.Tasks.values()].filter(
                    (t) => !t.ParentID && (t.Status === 'Complete' || t.Status === 'Failed' || t.Status === 'Cancelled'),
                );
                return { Success: true, Results: parents.map((p) => this.createTaskWrapper(p)) };
            }
            if (filter.includes('ParentID IS NULL') && filter.includes("Status IN ('Pending','In Progress')")) {
                return {
                    Success: true,
                    Results: [...this.Tasks.values()]
                        .filter((t) => !t.ParentID && (t.Status === 'Pending' || t.Status === 'In Progress'))
                        .map((p) => ({ ID: p.ID })),
                };
            }
            const corrMatch = /CorrelationKey='([^']+)'/.exec(filter);
            if (corrMatch?.[1]) {
                const targetKey = corrMatch[1];
                const stepMatch = /StepType='([^']+)'/.exec(filter);
                const matches = [...this.Tasks.values()].filter(
                    (t) => t.CorrelationKey === targetKey && (!stepMatch || t.StepType === stepMatch[1]),
                );
                return { Success: true, Results: matches.map((m) => this.createTaskWrapper(m)) };
            }
            const parentMatch = /ParentID='([^']+)'/.exec(filter);
            if (parentMatch?.[1]) {
                const pid = parentMatch[1].toLowerCase();
                const children = [...this.Tasks.values()].filter((t) => t.ParentID?.toLowerCase() === pid);
                return {
                    Success: true,
                    Results: params.ResultType === 'simple'
                        ? children
                        : children.map((c) => this.createTaskWrapper(c)),
                };
            }
            const idMatch = /\bID='([^']+)'/.exec(filter);
            if (idMatch?.[1]) {
                const found = this.GetRow(idMatch[1]);
                return { Success: true, Results: found ? [this.createTaskWrapper(found)] : [] };
            }
            return { Success: true, Results: [] };
        }
        return { Success: true, Results: [] };
    }

    private executeSQL(sql: string, args: ReadonlyArray<string | number | boolean | Date | null>): object[] {
        if (sql.includes('spTaskGraphClaimTask')) {
            const [taskId, claimedBy, ttlSec] = args as [string, string, number];
            const row = this.GetRow(taskId);
            if (!row || row.Status !== 'Pending' || row.ClaimedBy === WAITING_STEP_MARKER) {
                return [{ AffectedRows: 0 }];
            }
            row.Status = 'In Progress';
            row.ClaimedBy = claimedBy;
            row.ClaimExpiresAt = new Date(Date.now() + Number(ttlSec || 60) * 1000);
            row.StartedAt = row.StartedAt ?? new Date();
            row.__mj_UpdatedAt = new Date();
            return [{ AffectedRows: 1 }];
        }
        if (sql.includes('spTaskGraphCompleteClaimed')) {
            const [taskId, claimedBy, status, outputPayload, errorMessage, agentRunID, configuration, setConfiguration] =
                args as [string, string, MJTaskEntity['Status'], string | null, string | null, string | null, string | null, boolean];
            const row = this.GetRow(taskId);
            if (!row || row.Status !== 'In Progress' || row.ClaimedBy !== claimedBy) {
                return [{ AffectedRows: 0 }];
            }
            row.Status = status;
            row.OutputPayload = outputPayload;
            row.ErrorMessage = errorMessage;
            row.AgentRunID = agentRunID;
            if (setConfiguration) row.Configuration = configuration;
            row.ClaimedBy = null;
            row.ClaimExpiresAt = null;
            row.CompletedAt = new Date();
            row.PercentComplete = status === 'Complete' ? 100 : 0;
            row.__mj_UpdatedAt = new Date();
            return [{ AffectedRows: 1 }];
        }
        if (sql.includes('spTaskGraphMarkWaiting')) {
            const [taskId, marker, dueAt, correlationKey, payloadAtStart, inputTainted] = args as [
                string,
                string,
                Date | null,
                string | null,
                string | null,
                boolean,
            ];
            const row = this.GetRow(taskId);
            if (!row || row.Status !== 'Pending' || row.ClaimedBy) {
                return [{ AffectedRows: 0 }];
            }
            row.ClaimedBy = marker;
            row.DueAt = dueAt;
            row.CorrelationKey = correlationKey ?? row.CorrelationKey;
            const cfg = parseJson(row.Configuration);
            const rt = parseJson(cfg['runtime']);
            rt['payloadAtStart'] = payloadAtStart ? parseJson(payloadAtStart) : undefined;
            rt['isInputTainted'] = inputTainted;
            cfg['runtime'] = rt;
            row.Configuration = JSON.stringify(cfg);
            row.__mj_UpdatedAt = new Date();
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
            const row = this.GetRow(taskId);
            if (!row || row.Status !== 'Pending') {
                return [{ AffectedRows: 0, Outcome: 'Refused' }];
            }
            const cfg = parseJson(row.Configuration);
            const rt = parseJson(cfg['runtime']);
            if (row.ClaimedBy === marker) {
                row.Status = status;
                row.OutputPayload = outputPayload;
                row.ErrorMessage = errorMessage;
                row.ClaimedBy = null;
                row.CompletedAt = new Date();
                row.PercentComplete = status === 'Complete' ? 100 : 0;
                rt['isOutputTainted'] = outputTainted;
                delete rt['pendingSignal'];
                cfg['runtime'] = rt;
                row.Configuration = JSON.stringify(cfg);
                row.__mj_UpdatedAt = new Date();
                return [{ AffectedRows: 1, Outcome: 'Completed' }];
            }
            if (!rt['pendingSignal']) {
                rt['pendingSignal'] = parseJson(signalJson);
                cfg['runtime'] = rt;
                row.Configuration = JSON.stringify(cfg);
                row.__mj_UpdatedAt = new Date();
                return [{ AffectedRows: 1, Outcome: 'Buffered' }];
            }
            return [{ AffectedRows: 0, Outcome: 'Refused' }];
        }
        if (sql.includes('spTaskGraphStampParentStart')) {
            const [parentId, startedAt] = args as [string, Date];
            const row = this.GetRow(parentId);
            if (!row || row.StartedAt) return [{ AffectedRows: 0 }];
            row.StartedAt = startedAt;
            return [{ AffectedRows: 1 }];
        }
        if (sql.includes('spTaskGraphUpdateParentProgress')) {
            const [parentId, status, pct] = args as [string, MJTaskEntity['Status'], number];
            const row = this.GetRow(parentId);
            if (!row || TERMINAL_STATUSES.has(row.Status)) return [{ AffectedRows: 0 }];
            row.Status = status;
            row.PercentComplete = pct;
            return [{ AffectedRows: 1 }];
        }
        if (sql.includes('spTaskGraphSettleParent')) {
            const [parentId, status, pct] = args as [string, MJTaskEntity['Status'], number];
            const row = this.GetRow(parentId);
            if (!row || TERMINAL_STATUSES.has(row.Status)) return [{ AffectedRows: 0 }];
            row.Status = status;
            row.PercentComplete = pct;
            row.CompletedAt = new Date();
            return [{ AffectedRows: 1 }];
        }
        return [{ AffectedRows: 1 }];
    }
}

interface TransportHarness {
    readonly Name: 'Database' | 'AwsSqs';
    readonly Driver: ITransportDriver;
    readonly Subscription: SubscriptionBinding;
    readonly Topic: TopicBinding;
    readonly Publisher: TaskGraphWorkQueuePublisher;
    readonly FakeSqs?: FakeSqsGateway;
    Now?: () => number;
    DrainNextCycle?: () => void;
    SnapshotPublishCount: () => number;
}

function buildTransportHarnesses(): Array<() => TransportHarness> {
    return [
        () => createInMemoryDatabaseHarness(),
        () => createAwsSqsHarness(),
    ];
}

function createInMemoryDatabaseHarness(): TransportHarness {
    let fakeNow = Date.now();
    const driver = new InMemoryTransport({ Now: () => fakeNow });
    const topic: TopicBinding = {
        TopicName: 'mj.taskgraph.steps',
        IsFifo: false,
        MaxPayloadBytes: 262_144,
        Config: {},
    };
    const subscription: SubscriptionBinding = {
        Policy: {
            SubscriptionName: 'taskgraph-sub',
            TopicName: 'mj.taskgraph.steps',
            PartitionMode: 'None',
            MaxAttempts: 5,
            BackoffBaseSeconds: 0,
            BackoffMaxSeconds: 0,
            LeaseSeconds: 60,
            HeartbeatMode: 'Auto',
            MaxProcessingSeconds: 30,
        },
        Filter: null,
        HostType: 'MJWorker',
        Config: {},
    };
    let publishedCount = 0;

    const publisher: TaskGraphWorkQueuePublisher = {
        async Publish<TPayload>(
            requests: TaskGraphWorkQueuePublishRequest<TPayload>[],
        ): Promise<TaskGraphWorkQueuePublishResult[]> {
            const msgs: WorkMessage<WorkJson>[] = requests.map((req) => ({
                MessageID: randomUUID(),
                Topic: req.Topic,
                CorrelationID: req.CorrelationId,
                Attributes: {
                    handlerKey: req.HandlerKey,
                    idempotencyKey: req.IdempotencyKey,
                },
                Payload: toWorkJson(req.Payload),
                PublishedAt: new Date().toISOString(),
            }));
            publishedCount += msgs.length;
            const res = await driver.Publish({ ...topic, TopicName: requests[0]?.Topic ?? topic.TopicName }, msgs, [subscription]);
            return res.map((r, i) => ({
                WorkItemId: r.MessageID,
                Status: r.Status,
                MessageId: requests[i].IdempotencyKey,
            }));
        },
    };

    return {
        Name: 'Database',
        Driver: driver,
        Subscription: subscription,
        Topic: topic,
        Publisher: publisher,
        Now: () => fakeNow,
        DrainNextCycle: () => {
            fakeNow += 1_500;
            driver.RunSweep();
        },
        SnapshotPublishCount: () => publishedCount,
    };
}

function createAwsSqsHarness(): TransportHarness {
    const sqs = new FakeSqsGateway();
    const topicArn = 'arn:aws:sns:us-east-1:000000000000:mj-taskgraph';
    const queueUrl = 'https://sqs.us-east-1.amazonaws.com/000000000000/mj-taskgraph';
    const dlqUrl = 'https://sqs.us-east-1.amazonaws.com/000000000000/mj-taskgraph-dlq';
    sqs.AddQueue(queueUrl, { Fifo: false, VisibilityTimeoutSeconds: 60 });
    sqs.AddQueue(dlqUrl, { Fifo: false, VisibilityTimeoutSeconds: 60 });

    class ForwardToSqsFakeSnsGateway extends FakeSnsGateway {
        public override async PublishBatch(
            targetTopicArn: string,
            entries: Parameters<FakeSnsGateway['PublishBatch']>[1],
        ): ReturnType<FakeSnsGateway['PublishBatch']> {
            const results = await super.PublishBatch(targetTopicArn, entries);
            for (let i = 0; i < entries.length; i++) {
                if (results[i]?.Kind === 'Published') {
                    await sqs.Send({
                        QueueUrl: queueUrl,
                        Body: entries[i].Message,
                        Attributes: entries[i].MessageAttributes,
                    });
                }
            }
            return results;
        }
    }

    const sns = new ForwardToSqsFakeSnsGateway();
    sns.TopicAttributes.set(topicArn, { TopicArn: topicArn });

    const driver = new AwsTransportDriver(sns, sqs, { Now: () => sqs.Now });
    const topic: TopicBinding = {
        TopicName: 'mj.taskgraph.steps',
        IsFifo: false,
        MaxPayloadBytes: 262_144,
        Config: { SnsTopicArn: topicArn },
    };
    const subscription: SubscriptionBinding = {
        Policy: {
            SubscriptionName: 'aws-taskgraph-sub',
            TopicName: 'mj.taskgraph.steps',
            PartitionMode: 'None',
            MaxAttempts: 5,
            BackoffBaseSeconds: 0,
            BackoffMaxSeconds: 0,
            LeaseSeconds: 60,
            HeartbeatMode: 'Auto',
            MaxProcessingSeconds: 30,
        },
        Filter: null,
        HostType: 'MJWorker',
        Config: {
            Region: 'us-east-1',
            QueueUrl: queueUrl,
            QueueArn: 'arn:aws:sqs:us-east-1:000000000000:mj-taskgraph',
            DeadLetterQueueUrl: dlqUrl,
            DeadLetterQueueArn: 'arn:aws:sqs:us-east-1:000000000000:mj-taskgraph-dlq',
            IsFifo: false,
        },
    };
    let publishedCount = 0;

    const publisher: TaskGraphWorkQueuePublisher = {
        async Publish<TPayload>(
            requests: TaskGraphWorkQueuePublishRequest<TPayload>[],
        ): Promise<TaskGraphWorkQueuePublishResult[]> {
            const msgs: WorkMessage<WorkJson>[] = requests.map((req) => ({
                MessageID: randomUUID(),
                Topic: req.Topic,
                CorrelationID: req.CorrelationId,
                Attributes: {
                    handlerKey: req.HandlerKey,
                    idempotencyKey: req.IdempotencyKey,
                },
                Payload: toWorkJson(req.Payload),
                PublishedAt: new Date().toISOString(),
            }));
            publishedCount += msgs.length;
            const res = await driver.Publish(topic, msgs, [subscription]);
            return res.map((r, i) => ({
                WorkItemId: r.MessageID,
                Status: r.Status,
                MessageId: requests[i].IdempotencyKey,
            }));
        },
    };

    return {
        Name: 'AwsSqs',
        Driver: driver,
        Subscription: subscription,
        Topic: topic,
        Publisher: publisher,
        FakeSqs: sqs,
        Now: () => sqs.Now,
        DrainNextCycle: () => {
            sqs.Advance(1.5);
        },
        SnapshotPublishCount: () => publishedCount,
    };
}

/**
 * Outer bound for the 10,000-item fan-out case: its real failure detector is the 25 s stall deadline of
 * `pumpGraphAndQueue` (`Progress`), so this only stops a run that advances but never finishes. 1.3–3.8 s
 * alone; above 25 s under a full-repo test run's CPU contention (D-091 item 8).
 */
const FANOUT_10K_TEST_TIMEOUT_MS = 300_000;

/**
 * Drives pending deliveries through real `ConsumerRuntime` (against `InMemoryTransport` or
 * `AwsTransportDriver`) and real `TaskGraphDispatcher` until `Until()` resolves true.
 *
 * With `progress`, `timeoutMs` is a stall deadline: it restarts whenever `progress()` returns a larger
 * number, so a CPU-bound run that keeps advancing on a loaded machine is not failed by wall-clock time
 * alone, while a run that stops advancing still fails after `timeoutMs`.
 */
async function waitUntil(until: () => Promise<boolean>, timeoutMs: number = 15_000, onPoll?: () => void, progress?: () => number): Promise<void> {
    let deadline = Date.now() + timeoutMs;
    let lastProgress = progress ? progress() : 0;
    while (Date.now() < deadline) {
        if (await until()) return;
        onPoll?.();
        await new Promise<void>((r) => setTimeout(r, 15));
        if (progress) {
            const current = progress();
            if (current > lastProgress) {
                lastProgress = current;
                deadline = Date.now() + timeoutMs;
            }
        }
    }
    throw new Error(`Timed out after ${timeoutMs}ms ${progress ? 'without progress ' : ''}waiting for expected TaskGraph/WorkQueue state`);
}

async function pumpGraphAndQueue(params: {
    Harness: TransportHarness;
    Provider: IMetadataProvider;
    Dispatcher?: TaskGraphDispatcher;
    Until: () => Promise<boolean>;
    TimeoutMs?: number;
    /** A monotonically increasing count of work done; makes `TimeoutMs` a stall deadline (see `waitUntil`). */
    Progress?: () => number;
}): Promise<void> {
    if (params.Dispatcher) {
        await params.Dispatcher.Start();
    }
    const consumer = params.Harness.Driver.OpenConsumer<WorkJson>(params.Harness.Subscription);
    const handlerFactory = (): WorkHandler<WorkJson> => ({
        Handle: async (msg: WorkMessage<WorkJson>, ctx: WorkContext): Promise<WorkOutcome> => {
            const key = msg.Attributes['handlerKey'] ?? '';
            if (key === 'TaskGraph.RunGraph') {
                const runHandler = new TaskGraphRunWorkHandler();
                runHandler.BindExecutionContext({ ContextUser: TEST_USER, Provider: params.Provider });
                return runHandler.Handle(msg, ctx);
            }
            const enqueueHandler = new TaskGraphEnqueueItemWorkHandler();
            enqueueHandler.BindExecutionContext({ ContextUser: TEST_USER, Provider: params.Provider });
            return enqueueHandler.Handle(msg, ctx);
        },
    });

    const runtime = new ConsumerRuntime<WorkJson>(
        consumer,
        handlerFactory,
        { ...SUBSCRIPTION_POLICY_DEFAULTS, ...params.Harness.Subscription.Policy },
        {
            Concurrency: 32,
            ReceiveBatchSize: 10,
            IdlePollMinMs: 2,
            IdlePollMaxMs: 10,
            ShutdownDrainMs: 500,
        },
        NULL_WORK_LOGGER,
        params.Harness.Now,
    );
    runtime.Start();
    try {
        await waitUntil(params.Until, params.TimeoutMs ?? 20_000, () => {
            params.Harness.DrainNextCycle?.();
            runtime.Kick();
            params.Dispatcher?.Kick();
        }, params.Progress);
    } finally {
        await runtime.Stop();
        if (params.Dispatcher) {
            await params.Dispatcher.Stop();
        }
    }
}

const createdDispatchers: TaskGraphDispatcher[] = [];

function createDispatcherForStore(store: InMemoryTaskGraphStore): TaskGraphDispatcher {
    const providerFactory = { CreateProvider: async () => store.CreateProvider() };
    const agentRunner: TaskAgentRunner = {
        EnforcesSecurityEnvelope: true,
        RunAgentForTask: async () => ({ Success: true, Output: { ranAgent: true } }),
    };
    const actionRunner: TaskActionRunner = {
        EnforcesSecurityEnvelope: true,
        RunActionForTask: async (params) => ({
            Success: true,
            Output: { actionRan: true, receivedInput: params.InputPayload },
        }),
    };
    const dispatcher = new TaskGraphDispatcher(
        providerFactory,
        agentRunner,
        TEST_USER,
        { InstanceID: `test-dispatcher-${randomUUID()}`, PollIntervalSeconds: 0.05 },
        { PostMessage: async () => undefined },
        undefined,
        actionRunner,
    );
    createdDispatchers.push(dispatcher);
    return dispatcher;
}

describe.each(buildTransportHarnesses())('Epic 2 Slice 2 — Queued Graphs & Enqueue Fan-Out ($Name)', (createHarness) => {
    afterEach(async () => {
        while (createdDispatchers.length > 0) {
            const d = createdDispatchers.pop();
            if (d) await d.Stop();
        }
        ForEachEnqueueCoordinator.Instance.ResetState();
        TaskGraphCallerNotificationService.Instance.ResetInMemoryState();
        TaskGraphQueueRegistry.Instance.RegisterPublisher(null);
        TaskGraphWorkQueueExecutors.Instance.RegisterQueuedGraphExecutor(null);
        TaskGraphWorkQueueExecutors.Instance.RegisterEnqueueItemExecutor(null);
        BoundedRunnerSemaphore.Instance.ResetMetrics();
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
    });

    it('(a) executes queued graph (Dispatch: "Queue") honoring Isolation & recovers caller notification across host restart', async () => {
        const harness = createHarness();
        const store = new InMemoryTaskGraphStore();
        const provider = store.CreateProvider();
        TaskGraphQueueRegistry.Instance.RegisterPublisher(harness.Publisher);

        const observedIsolations: TaskGraphIsolationLevel[] = [];
        const dispatcher = createDispatcherForStore(store);

        TaskGraphWorkQueueExecutors.Instance.RegisterQueuedGraphExecutor(async (ctx) => {
            observedIsolations.push(ctx.Isolation);
            await dispatcher.Start();
            await waitUntil(async () => {
                const parent = store.GetRow(ctx.ParentTaskID);
                return !!parent && (parent.Status === 'Complete' || parent.Status === 'Failed');
            }, 10_000, () => dispatcher.Kick());
            const settled = store.GetRow(ctx.ParentTaskID);
            return {
                Success: settled?.Status === 'Complete',
                Output: { finishedStatus: settled?.Status },
                ErrorMessage: settled?.ErrorMessage ?? undefined,
            };
        });

        const spec: TaskGraphSpec = {
            workflowName: 'Queued Isolated Workflow',
            isolation: 'Worker',
            dispatch: 'Queue',
            tasks: [
                TaskNode.Action(
                    { tempId: 's1', name: 'Step 1', description: 'Run queued step', dependsOn: [] },
                    { actionName: 'DoWork' },
                ),
            ],
        };

        const submitResult = await new TaskGraphService().Submit(spec, {
            EnvironmentID: ENV_ID,
            ContextUser: TEST_USER,
            Provider: provider,
            Dispatch: 'Queue',
        });

        expect(submitResult.Success).toBe(true);
        expect(submitResult.Dispatch).toBe('Queue');
        expect(submitResult.ParentTaskID).toBeTruthy();
        expect(submitResult.QueueMessageID).toBeTruthy();

        const parentBeforeConsumer = store.GetRow(submitResult.ParentTaskID!);
        expect(parentBeforeConsumer?.Status).toBe('Pending');
        expect(ParseTaskGraphParentMetadata(parentBeforeConsumer?.InputPayload).isolation).toBe('Worker');
        expect(ParseTaskGraphParentMetadata(parentBeforeConsumer?.InputPayload).callerNotification?.Status).toBe('Pending');

        await pumpGraphAndQueue({
            Harness: harness,
            Provider: provider,
            Until: async () => store.GetRow(submitResult.ParentTaskID!)?.Status === 'Complete',
        });

        expect(observedIsolations).toEqual(['Worker']);

        // Simulate caller host restart BEFORE acknowledging caller notification!
        TaskGraphCallerNotificationService.Instance.ResetInMemoryState();
        const recovered = await TaskGraphCallerNotificationService.Instance.RecoverPendingNotifications(provider, TEST_USER);
        expect(recovered).toHaveLength(1);
        expect(recovered[0].ParentTaskID).toBe(submitResult.ParentTaskID);
        expect(recovered[0].Status).toBe('Ready');
        expect(recovered[0].TerminalOutcome).toBe('Succeeded');

        const acked = await TaskGraphCallerNotificationService.Instance.AcknowledgeNotification(
            submitResult.ParentTaskID!,
            provider,
            TEST_USER,
        );
        expect(acked).toBe(true);
        const afterAck = await TaskGraphCallerNotificationService.Instance.RecoverPendingNotifications(provider, TEST_USER);
        expect(afterAck).toHaveLength(0);
    });

    it('(b) executes single Enqueue step round-trip & passes output payload to downstream dependency', async () => {
        const harness = createHarness();
        const store = new InMemoryTaskGraphStore();
        const provider = store.CreateProvider();
        TaskGraphQueueRegistry.Instance.RegisterPublisher(harness.Publisher);

        const executedCorrelations: string[] = [];
        TaskGraphWorkQueueExecutors.Instance.RegisterEnqueueItemExecutor(async ({ WorkItem }) => {
            executedCorrelations.push(WorkItem.CorrelationKey);
            return { Success: true, Output: { approvedByQueue: true, ticketNumber: 'TCK-101' } };
        });

        const spec: TaskGraphSpec = {
            workflowName: 'Single Enqueue Step Graph',
            tasks: [
                TaskNode.Enqueue(
                    { tempId: 'enq', name: 'Enqueue Ticket', description: 'Queue step', dependsOn: [] },
                    { topic: 'mj.taskgraph.steps', handlerKey: 'TaskGraph.EnqueueItem' },
                ),
                TaskNode.Action(
                    { tempId: 'after', name: 'Downstream Action', description: 'Reads queue output', dependsOn: ['enq'] },
                    { actionName: 'DownstreamWork', inputMapping: JSON.stringify({ ticket: 'payload.ticketNumber' }) },
                ),
            ],
        };

        const sub = await new TaskGraphService().Submit(spec, {
            EnvironmentID: ENV_ID,
            ContextUser: TEST_USER,
            Provider: provider,
        });
        expect(sub.Success).toBe(true);

        const dispatcher = createDispatcherForStore(store);
        await pumpGraphAndQueue({
            Harness: harness,
            Provider: provider,
            Dispatcher: dispatcher,
            Until: async () => store.GetRow(sub.ParentTaskID!)?.Status === 'Complete',
        });

        expect(executedCorrelations).toHaveLength(1);
        const enqTask = store.GetRow(sub.TaskIDMap!.get('enq')!);
        const afterTask = store.GetRow(sub.TaskIDMap!.get('after')!);
        expect(enqTask?.Status).toBe('Complete');
        expect(afterTask?.Status).toBe('Complete');
        expect(afterTask?.OutputPayload).toContain('TCK-101');
    });

    it('(c) fans out 10,000 items via ForEach + Enqueue under bounded publish concurrency & bounded active isolated runners', async () => {
        const harness = createHarness();
        const store = new InMemoryTaskGraphStore();
        const provider = store.CreateProvider();
        TaskGraphQueueRegistry.Instance.RegisterPublisher(harness.Publisher);

        LimitsConfigResolver.Instance.RegisterMjConfigLimits({
            TaskGraphQueue: {
                MaxEnqueuePublishConcurrency: 6,
                EnqueuePublishBatchSize: 250,
                MaxConcurrentIsolatedRunners: 8,
                MaxEnqueueItemsPerFanOut: 20_000,
            },
        });

        let processedItems = 0;
        TaskGraphWorkQueueExecutors.Instance.RegisterEnqueueItemExecutor(async ({ WorkItem }) => {
            processedItems++;
            return {
                Success: true,
                Output: { itemIdx: WorkItem.Kind === 'TaskGraph.EnqueueFanOutItem' ? WorkItem.ItemIndex : -1 },
            };
        });

        const tenThousandItems = Array.from({ length: 10_000 }, (_, i) => ({ id: i }));
        const spec: TaskGraphSpec = {
            workflowName: '10k Bounded FanOut',
            tasks: [
                TaskNode.ForEach(
                    {
                        tempId: 'fanout',
                        name: 'FanOut 10k Items',
                        description: 'Queue 10k work items cleanly',
                        dependsOn: [],
                        inputPayload: { items: tenThousandItems },
                    },
                    {
                        collectionPath: 'payload.items',
                        itemVariable: 'item',
                        publishConcurrency: 50,
                        enqueue: {
                            topic: 'mj.taskgraph.steps',
                            actionName: 'DoWork',
                            publishConcurrency: 6,
                            maxActiveRunners: 8,
                        },
                    },
                ),
            ],
        };

        const sub = await new TaskGraphService().Submit(spec, {
            EnvironmentID: ENV_ID,
            ContextUser: TEST_USER,
            Provider: provider,
        });
        expect(sub.Success).toBe(true);

        const dispatcher = createDispatcherForStore(store);
        await pumpGraphAndQueue({
            Harness: harness,
            Provider: provider,
            Dispatcher: dispatcher,
            TimeoutMs: 25_000,
            Until: async () => store.GetRow(sub.ParentTaskID!)?.Status === 'Complete',
            // 10,000 CPU-bound items: fail on a stall, not on a slow machine (D-091 item 8).
            Progress: () => processedItems + harness.SnapshotPublishCount(),
        });

        expect(processedItems).toBe(10_000);
        expect(harness.SnapshotPublishCount()).toBe(10_000);
        expect(ForEachEnqueueCoordinator.Instance.PeakPublishConcurrency).toBeLessThanOrEqual(6);
        expect(BoundedRunnerSemaphore.Instance.PeakActiveCount).toBeLessThanOrEqual(8);

        const fanoutTask = store.GetRow(sub.TaskIDMap!.get('fanout')!);
        expect(fanoutTask?.Status).toBe('Complete');
        const fanoutCfg = parseJson(fanoutTask?.Configuration);
        const state = parseJson(parseJson(fanoutCfg['runtime'])['enqueueFanOut']);
        expect(state['totalItems']).toBe(10_000);
        expect(state['completedCount']).toBe(10_000);
        expect(String(state['completedBitmapHex']).length).toBe(2500);
    }, FANOUT_10K_TEST_TIMEOUT_MS);

    it('(d) deduplicates duplicate WorkQueue deliveries and repeated CompleteWaitingStep calls idempotently', async () => {
        const harness = createHarness();
        const store = new InMemoryTaskGraphStore();
        const provider = store.CreateProvider();
        TaskGraphQueueRegistry.Instance.RegisterPublisher(harness.Publisher);

        const spec: TaskGraphSpec = {
            workflowName: 'Duplicate Idempotency Graph',
            tasks: [
                TaskNode.ForEach(
                    {
                        tempId: 'fanout',
                        name: 'Three Item FanOut',
                        description: 'Deduplicate completions',
                        dependsOn: [],
                        inputPayload: { items: ['a', 'b', 'c'] },
                    },
                    {
                        collectionPath: 'payload.items',
                        enqueue: { topic: 'mj.taskgraph.steps', correlationKey: 'dup-batch' },
                    },
                ),
            ],
        };

        const sub = await new TaskGraphService().Submit(spec, {
            EnvironmentID: ENV_ID,
            ContextUser: TEST_USER,
            Provider: provider,
        });
        expect(sub.Success).toBe(true);
        const dispatcher = createDispatcherForStore(store);
        await dispatcher.Start();
        await waitUntil(async () => {
            const r = store.GetRow(sub.TaskIDMap!.get('fanout')!);
            return r?.ClaimedBy === WAITING_STEP_MARKER;
        }, 5_000, () => dispatcher.Kick());

        const firstCall = await TaskGraphWaitingSteps.CompleteWaitingStep(
            { CorrelationKey: 'dup-batch:item:0', Status: 'Complete', Payload: { v: 1 } },
            provider,
            TEST_USER,
        );
        expect(firstCall.Success).toBe(true);

        // Repeat completion of item 0 five times — must NEVER double-count or settle prematurely!
        for (let repeat = 0; repeat < 5; repeat++) {
            const dup = await TaskGraphWaitingSteps.CompleteWaitingStep(
                { CorrelationKey: 'dup-batch:item:0', Status: 'Complete', Payload: { v: 1 } },
                provider,
                TEST_USER,
            );
            expect(dup.Success).toBe(true);
            expect(dup.DuplicateIgnored).toBe(true);
        }

        const midRow = store.GetRow(sub.TaskIDMap!.get('fanout')!);
        const midFanout = parseJson(parseJson(parseJson(midRow?.Configuration)['runtime'])['enqueueFanOut']);
        expect(midFanout['completedCount']).toBe(1);
        expect(midRow?.Status).toBe('Pending');

        // Now complete remaining items 1 and 2
        await TaskGraphWaitingSteps.CompleteWaitingStep(
            { CorrelationKey: 'dup-batch:item:1', Status: 'Complete', Payload: { v: 2 } },
            provider,
            TEST_USER,
        );
        const finalItem = await TaskGraphWaitingSteps.CompleteWaitingStep(
            { CorrelationKey: 'dup-batch:item:2', Status: 'Complete', Payload: { v: 3 } },
            provider,
            TEST_USER,
        );
        expect(finalItem.Success).toBe(true);

        await waitUntil(async () => store.GetRow(sub.ParentTaskID!)?.Status === 'Complete', 5_000, () => dispatcher.Kick());
        expect(store.GetRow(sub.ParentTaskID!)?.Status).toBe('Complete');
    });

    it('(e) reconciles early completions arriving BEFORE waiting-state persistence without stranding', async () => {
        const harness = createHarness();
        const store = new InMemoryTaskGraphStore();
        const provider = store.CreateProvider();
        TaskGraphQueueRegistry.Instance.RegisterPublisher(harness.Publisher);

        const earlyKey = 'early-step-correlation-99';
        // Fire early signal BEFORE graph is even submitted or reached!
        const earlyResult = await TaskGraphWaitingSteps.CompleteWaitingStep(
            { CorrelationKey: earlyKey, Status: 'Complete', Payload: { precomputed: 'yes' } },
            provider,
            TEST_USER,
        );
        expect(earlyResult.Success).toBe(true);
        expect(earlyResult.Buffered).toEqual([earlyKey]);

        const spec: TaskGraphSpec = {
            workflowName: 'Early Completion Reconciliation',
            tasks: [
                TaskNode.Enqueue(
                    { tempId: 'early', name: 'Pre-Signalled Enqueue', description: 'Resolves from buffer', dependsOn: [] },
                    { topic: 'mj.taskgraph.steps', correlationKey: earlyKey },
                ),
            ],
        };

        const sub = await new TaskGraphService().Submit(spec, {
            EnvironmentID: ENV_ID,
            ContextUser: TEST_USER,
            Provider: provider,
        });
        expect(sub.Success).toBe(true);

        const dispatcher = createDispatcherForStore(store);
        await dispatcher.Start();
        await waitUntil(async () => store.GetRow(sub.ParentTaskID!)?.Status === 'Complete', 5_000, () => dispatcher.Kick());

        const stepRow = store.GetRow(sub.TaskIDMap!.get('early')!);
        expect(stepRow?.Status).toBe('Complete');
        expect(stepRow?.OutputPayload).toContain('precomputed');
        expect(store.GetRow(sub.ParentTaskID!)?.Status).toBe('Complete');
    });

    it('(f) recovers cleanly across worker crash/redelivery AND propagates terminal failure after retry exhaustion to parent + caller notification', async () => {
        const harness = createHarness();
        const store = new InMemoryTaskGraphStore();
        const provider = store.CreateProvider();
        TaskGraphQueueRegistry.Instance.RegisterPublisher(harness.Publisher);

        let item0Attempts = 0;
        let simulateCrashOnce = true;

        TaskGraphWorkQueueExecutors.Instance.RegisterEnqueueItemExecutor(async ({ WorkItem }) => {
            const idx = WorkItem.Kind === 'TaskGraph.EnqueueFanOutItem' ? WorkItem.ItemIndex : -1;
            if (idx === 0) {
                item0Attempts++;
                if (simulateCrashOnce) {
                    simulateCrashOnce = false;
                    return { Success: false, ErrorMessage: 'Transient worker crash before ack', Retryable: true };
                }
                return { Success: true, Output: { recovered: true } };
            }
            return { Success: false, ErrorMessage: 'Permanent downstream failure', Retryable: true };
        });

        const spec: TaskGraphSpec = {
            workflowName: 'Crash + Terminal Failure Graph',
            dispatch: 'Queue',
            tasks: [
                TaskNode.ForEach(
                    {
                        tempId: 'fanout',
                        name: 'Two Item Retry Test',
                        description: 'Tests transient redelivery and terminal failure propagation',
                        dependsOn: [],
                        inputPayload: { items: ['recover-me', 'fail-forever'] },
                    },
                    {
                        collectionPath: 'payload.items',
                        enqueue: { topic: 'mj.taskgraph.steps', maxRetries: 1 },
                    },
                ),
            ],
        };

        const sub = await new TaskGraphService().Submit(spec, {
            EnvironmentID: ENV_ID,
            ContextUser: TEST_USER,
            Provider: provider,
            Dispatch: 'Queue',
        });
        expect(sub.Success).toBe(true);

        const dispatcher = createDispatcherForStore(store);
        TaskGraphWorkQueueExecutors.Instance.RegisterQueuedGraphExecutor(async (ctx) => {
            await dispatcher.Start();
            await waitUntil(async () => {
                const parent = store.GetRow(ctx.ParentTaskID);
                return !!parent && (parent.Status === 'Complete' || parent.Status === 'Failed');
            }, 10_000, () => dispatcher.Kick());
            const parent = store.GetRow(ctx.ParentTaskID);
            return {
                Success: parent?.Status === 'Complete',
                ErrorMessage: parent?.ErrorMessage ?? undefined,
            };
        });

        await pumpGraphAndQueue({
            Harness: harness,
            Provider: provider,
            Until: async () => store.GetRow(sub.ParentTaskID!)?.Status === 'Failed',
        });

        expect(item0Attempts).toBe(2); // Redelivered once after transient failure and recovered cleanly!
        TaskGraphCallerNotificationService.Instance.ResetInMemoryState();
        const notifications = await TaskGraphCallerNotificationService.Instance.RecoverPendingNotifications(provider, TEST_USER);
        expect(notifications).toHaveLength(1);
        expect(notifications[0].TerminalOutcome).toBe('Failed');
        expect(notifications[0].ErrorMessage).toContain('Permanent downstream failure');
    });
});

function parseJson(raw: string | object | null | undefined): Record<string, string | number | boolean | object | null | undefined> {
    if (!raw) return {};
    if (typeof raw === 'object') return raw as Record<string, string | number | boolean | object | null | undefined>;
    try {
        const parsed: unknown = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, string | number | boolean | object | null | undefined>)
            : {};
    } catch {
        return {};
    }
}

function toWorkJson(value: unknown): WorkJson {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (Array.isArray(value)) return value.map((v) => toWorkJson(v));
    if (typeof value === 'object') {
        const out: { [key: string]: WorkJson } = {};
        for (const [k, v] of Object.entries(value)) {
            if (v !== undefined) out[k] = toWorkJson(v);
        }
        return out;
    }
    return String(value);
}
