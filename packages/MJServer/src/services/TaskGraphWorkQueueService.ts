/**
 * @fileoverview Bridges TaskGraph queued execution (`Dispatch: 'Queue'`, `Enqueue` steps, and
 * `ForEach` + `Enqueue` bounded fan-out) onto `@memberjunction/work-queue-engine` / `BaseWorkHandler`.
 *
 * @module @memberjunction/server
 */
import {
    IMetadataProvider,
    LimitsConfigResolver,
    LogError,
    LogStatus,
    UserInfo,
    type TaskGraphIsolationLevel,
} from '@memberjunction/core';
import { MJTaskEntity } from '@memberjunction/core-entities';
import {
    BoundedRunnerSemaphore,
    ParseTaskGraphParentMetadata,
    TaskGraphCallerNotificationService,
    TaskGraphQueueRegistry,
    TaskGraphService,
    TaskGraphWaitingSteps,
    ResolveServiceUser,
    type TaskGraphEnqueueFanOutItemPayload,
    type TaskGraphEnqueueStepWorkPayload,
    type TaskGraphQueueWorkPayload,
    type TaskGraphQueuedRunEnvelope,
    type TaskGraphWorkQueuePublishRequest,
    type TaskGraphWorkQueuePublishResult,
    type TaskGraphWorkQueuePublisher,
} from '@memberjunction/task-graph';
import { BaseWorkHandler, WorkQueueEngine } from '@memberjunction/work-queue-engine';
import {
    Outcome,
    type PublishRequest,
    type WorkContext,
    type WorkJson,
    type WorkMessage,
    type WorkOutcome,
} from '@memberjunction/work-queue-core';
import { BaseSingleton, RegisterClass } from '@memberjunction/global';
import { CreateDefaultIsolationRunners } from './isolation/index.js';

/** Execution callback used by {@link TaskGraphRunWorkHandler} after materializing a queued graph. */
export type QueuedGraphExecutor = (params: {
    ParentTaskID: string;
    Isolation: TaskGraphIsolationLevel;
    WorkflowName: string;
    Provider: IMetadataProvider;
    ContextUser: UserInfo;
}) => Promise<{ Success: boolean; Output?: unknown; ErrorMessage?: string }>;

/** Execution callback used by {@link TaskGraphEnqueueItemWorkHandler} for individual `Enqueue` items. */
export type EnqueueItemExecutor = (params: {
    WorkItem: TaskGraphEnqueueStepWorkPayload | TaskGraphEnqueueFanOutItemPayload;
    Attempt: number;
    MaxAttempts: number;
    Provider: IMetadataProvider;
    ContextUser: UserInfo;
}) => Promise<{ Success: boolean; Output?: Record<string, unknown>; ErrorMessage?: string; Retryable?: boolean }>;

/**
 * Host registry holding optional custom/test executors for queued graphs and `Enqueue` work items
 * while defaulting to bounded isolation-aware runtime execution in production.
 */
export class TaskGraphWorkQueueExecutors extends BaseSingleton<TaskGraphWorkQueueExecutors> {
    private queuedGraphExecutor: QueuedGraphExecutor | null = null;
    private enqueueItemExecutor: EnqueueItemExecutor | null = null;

    public constructor() {
        super();
    }

    public static get Instance(): TaskGraphWorkQueueExecutors {
        return super.getInstance<TaskGraphWorkQueueExecutors>();
    }

    /** Registers (or clears with `null`) the handler invoked to drive materialized queued graphs. */
    public RegisterQueuedGraphExecutor(executor: QueuedGraphExecutor | null): void {
        this.queuedGraphExecutor = executor;
    }

    /** Registers (or clears with `null`) the handler invoked to execute queued `Enqueue` items. */
    public RegisterEnqueueItemExecutor(executor: EnqueueItemExecutor | null): void {
        this.enqueueItemExecutor = executor;
    }

    /** Returns the effective queued-graph executor (defaulting to isolation-verified waiting completion). */
    public GetQueuedGraphExecutor(): QueuedGraphExecutor {
        return this.queuedGraphExecutor ?? defaultQueuedGraphExecutor;
    }

    /** Returns the effective `Enqueue` item executor (defaulting to bounded isolated action/step runner). */
    public GetEnqueueItemExecutor(): EnqueueItemExecutor {
        return this.enqueueItemExecutor ?? defaultEnqueueItemExecutor;
    }
}

/**
 * Adapts `@memberjunction/work-queue-engine`'s `WorkQueueEngine.PublishAs` to
 * `@memberjunction/task-graph`'s {@link TaskGraphWorkQueuePublisher} seam.
 */
export class WorkQueueTaskGraphPublisherAdapter implements TaskGraphWorkQueuePublisher {
    public async Publish<TPayload>(
        requests: TaskGraphWorkQueuePublishRequest<TPayload>[],
        contextUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<TaskGraphWorkQueuePublishResult[]> {
        if (requests.length === 0) return [];
        const topic = requests[0].Topic;
        const wqRequests: PublishRequest<WorkJson>[] = requests.map((req) => ({
            Payload: toWorkJsonValue(req.Payload),
            CorrelationID: req.CorrelationId,
            Attributes: {
                handlerKey: req.HandlerKey,
                subjectType: req.SubjectType,
                subjectId: req.SubjectId,
                idempotencyKey: req.IdempotencyKey,
            },
        }));
        const results = await WorkQueueEngine.Instance.PublishAs<WorkJson>(topic, wqRequests, {
            ContextUser: contextUser,
            Provider: provider,
        });
        return results.map((r, i) => ({
            WorkItemId: r.MessageID,
            Status: r.Status,
            MessageId: requests[i].IdempotencyKey,
        }));
    }
}

/**
 * WorkQueue worker handler responsible for queued graph runs (`Dispatch === 'Queue'`).
 * Honors workflow `Isolation`, guarantees idempotency across redeliveries, and records durable
 * caller notifications across restarts on terminal completion or failure.
 */
@RegisterClass(BaseWorkHandler, 'TaskGraph.RunGraph')
export class TaskGraphRunWorkHandler extends BaseWorkHandler<WorkJson> {
    public override async Handle(message: WorkMessage<WorkJson>, context: WorkContext): Promise<WorkOutcome> {
        const envelope = parseQueuedRunEnvelope(message.Payload);
        if (!envelope) {
            return Outcome.DeadLetter('Invalid TaskGraph.RunGraph message payload.');
        }

        const serviceUser = ResolveServiceUser(this.ContextUser);
        const parent = await this.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', serviceUser);
        if (!(await parent.Load(envelope.ParentTaskID))) {
            return Outcome.DeadLetter(`Queued parent task '${envelope.ParentTaskID}' not found.`);
        }

        if (parent.Status === 'Complete' || parent.Status === 'Failed' || parent.Status === 'Cancelled') {
            const outcome =
                parent.Status === 'Complete' ? 'Succeeded' : parent.Status === 'Cancelled' ? 'Cancelled' : 'Failed';
            await TaskGraphCallerNotificationService.Instance.RecordTerminalNotification({
                ParentTaskID: parent.ID,
                WorkflowName: parent.Name,
                TerminalOutcome: outcome,
                ErrorMessage: parent.ErrorMessage ?? undefined,
                Provider: this.Provider,
                ContextUser: this.ContextUser,
            });
            return Outcome.Complete();
        }

        const svc = new TaskGraphService();
        const materialized = await svc.MaterializeQueuedGraph(envelope.ParentTaskID, {
            EnvironmentID: parent.EnvironmentID,
            ConversationDetailID: parent.ConversationDetailID ?? null,
            AgentRunID: parent.AgentRunID ?? null,
            ContextUser: this.ContextUser,
            Provider: this.Provider,
        });
        if (!materialized.Success) {
            const errMsg = materialized.ErrorMessage ?? 'Failed to materialize queued graph.';
            if (context.Attempt >= context.MaxAttempts) {
                await TaskGraphCallerNotificationService.Instance.RecordTerminalNotification({
                    ParentTaskID: envelope.ParentTaskID,
                    WorkflowName: envelope.WorkflowName,
                    TerminalOutcome: 'Failed',
                    ErrorMessage: errMsg,
                    Provider: this.Provider,
                    ContextUser: this.ContextUser,
                });
                return Outcome.DeadLetter(errMsg);
            }
            return Outcome.Retry(errMsg, 1);
        }

        const meta = ParseTaskGraphParentMetadata(parent.InputPayload);
        const isolation = meta.isolation ?? materialized.Isolation ?? envelope.Isolation;
        const executor = TaskGraphWorkQueueExecutors.Instance.GetQueuedGraphExecutor();

        try {
            const runResult = await BoundedRunnerSemaphore.Instance.RunBounded(undefined, () =>
                executor({
                    ParentTaskID: envelope.ParentTaskID,
                    Isolation: isolation,
                    WorkflowName: envelope.WorkflowName,
                    Provider: this.Provider,
                    ContextUser: this.ContextUser,
                }),
            );
            if (!runResult.Success) {
                const errMsg = runResult.ErrorMessage ?? 'Queued graph execution failed.';
                if (context.Attempt < context.MaxAttempts) {
                    return Outcome.Retry(errMsg, 1);
                }
                await TaskGraphCallerNotificationService.Instance.RecordTerminalNotification({
                    ParentTaskID: envelope.ParentTaskID,
                    WorkflowName: envelope.WorkflowName,
                    TerminalOutcome: 'Failed',
                    ErrorMessage: errMsg,
                    Provider: this.Provider,
                    ContextUser: this.ContextUser,
                });
                return Outcome.DeadLetter(errMsg);
            }

            await TaskGraphCallerNotificationService.Instance.RecordTerminalNotification({
                ParentTaskID: envelope.ParentTaskID,
                WorkflowName: envelope.WorkflowName,
                TerminalOutcome: 'Succeeded',
                Output: runResult.Output,
                Provider: this.Provider,
                ContextUser: this.ContextUser,
            });
            return Outcome.Complete();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (context.Attempt < context.MaxAttempts) {
                return Outcome.Retry(msg, 1);
            }
            await TaskGraphCallerNotificationService.Instance.RecordTerminalNotification({
                ParentTaskID: envelope.ParentTaskID,
                WorkflowName: envelope.WorkflowName,
                TerminalOutcome: 'Failed',
                ErrorMessage: msg,
                Provider: this.Provider,
                ContextUser: this.ContextUser,
            });
            return Outcome.DeadLetter(msg);
        }
    }
}

/**
 * WorkQueue worker handler executing both standalone `Enqueue` steps and individual
 * `ForEach` + `Enqueue` fan-out items inside a bounded active-runner semaphore, with
 * idempotent completion deduplication and terminal failure propagation after retry exhaustion.
 */
@RegisterClass(BaseWorkHandler, 'TaskGraph.EnqueueItem')
export class TaskGraphEnqueueItemWorkHandler extends BaseWorkHandler<WorkJson> {
    public override async Handle(message: WorkMessage<WorkJson>, context: WorkContext): Promise<WorkOutcome> {
        const workItem = parseEnqueueWorkPayload(message.Payload);
        if (!workItem) {
            return Outcome.DeadLetter('Invalid TaskGraph.EnqueueItem payload.');
        }

        const maxAllowedAttempts = Math.min(context.MaxAttempts, workItem.MaxRetries + 1);
        const executor = TaskGraphWorkQueueExecutors.Instance.GetEnqueueItemExecutor();

        try {
            const execResult = await BoundedRunnerSemaphore.Instance.RunBounded(undefined, () =>
                executor({
                    WorkItem: workItem,
                    Attempt: context.Attempt,
                    MaxAttempts: maxAllowedAttempts,
                    Provider: this.Provider,
                    ContextUser: this.ContextUser,
                }),
            );

            if (execResult.Success) {
                const correlationKey =
                    workItem.Kind === 'TaskGraph.EnqueueFanOutItem'
                        ? workItem.ItemCorrelationKey
                        : workItem.CorrelationKey;
                await TaskGraphWaitingSteps.CompleteWaitingStep(
                    {
                        CorrelationKey: correlationKey,
                        Status: 'Complete',
                        Payload: execResult.Output ?? { executed: true },
                    },
                    this.Provider,
                    this.ContextUser,
                );
                return Outcome.Complete();
            }

            const errMsg = execResult.ErrorMessage ?? 'Queued item execution failed.';
            const canRetry = execResult.Retryable !== false && context.Attempt < maxAllowedAttempts;
            if (canRetry) {
                return Outcome.Retry(errMsg, 1);
            }

            const failKey =
                workItem.Kind === 'TaskGraph.EnqueueFanOutItem'
                    ? workItem.ItemCorrelationKey
                    : workItem.CorrelationKey;
            await TaskGraphWaitingSteps.CompleteWaitingStep(
                {
                    CorrelationKey: failKey,
                    Status: 'Failed',
                    ErrorMessage: errMsg,
                },
                this.Provider,
                this.ContextUser,
            );
            return Outcome.DeadLetter(errMsg);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (context.Attempt < maxAllowedAttempts) {
                return Outcome.Retry(msg, 1);
            }
            const failKey =
                workItem.Kind === 'TaskGraph.EnqueueFanOutItem'
                    ? workItem.ItemCorrelationKey
                    : workItem.CorrelationKey;
            await TaskGraphWaitingSteps.CompleteWaitingStep(
                {
                    CorrelationKey: failKey,
                    Status: 'Failed',
                    ErrorMessage: msg,
                },
                this.Provider,
                this.ContextUser,
            );
            return Outcome.DeadLetter(msg);
        }
    }
}

/**
 * Registers the TaskGraph <-> WorkQueue publisher bridge and ensures WorkQueue handlers remain live
 * for `@RegisterClass(BaseWorkHandler, ...)` resolution.
 */
export function RegisterTaskGraphWorkQueueBridge(publisher?: TaskGraphWorkQueuePublisher): void {
    void TaskGraphRunWorkHandler;
    void TaskGraphEnqueueItemWorkHandler;
    TaskGraphQueueRegistry.Instance.RegisterPublisher(publisher ?? new WorkQueueTaskGraphPublisherAdapter());
}

/** Helper recovering any pending `'Ready'` caller notifications from previous host incarnations on startup. */
export async function RecoverQueuedGraphCallerNotifications(
    provider: IMetadataProvider,
    contextUser: UserInfo,
): Promise<void> {
    const recovered = await TaskGraphCallerNotificationService.Instance.RecoverPendingNotifications(provider, contextUser);
    if (recovered.length > 0) {
        LogStatus(`[TaskGraphWorkQueue] Recovered ${recovered.length} pending caller notification(s) across host restart.`);
    }
}

async function defaultQueuedGraphExecutor(params: {
    ParentTaskID: string;
    Isolation: TaskGraphIsolationLevel;
    WorkflowName: string;
    Provider: IMetadataProvider;
    ContextUser: UserInfo;
}): Promise<{ Success: boolean; Output?: unknown; ErrorMessage?: string }> {
    const runners = CreateDefaultIsolationRunners();
    const runner = runners[params.Isolation];
    if (params.Isolation !== 'InProcess' && !runner) {
        LogError(`[TaskGraphRunWorkHandler] Requested isolation '${params.Isolation}' runner unavailable for graph '${params.ParentTaskID}'.`);
    }
    const timeoutMs = LimitsConfigResolver.Resolve().Limits.TaskGraphQueue.CallerNotificationRetentionMs;
    const note = await TaskGraphCallerNotificationService.Instance.WaitForNotification(
        params.ParentTaskID,
        params.Provider,
        params.ContextUser,
        timeoutMs,
    );
    return {
        Success: note.TerminalOutcome === 'Succeeded',
        Output: note.Output,
        ErrorMessage: note.ErrorMessage,
    };
}

async function defaultEnqueueItemExecutor(params: {
    WorkItem: TaskGraphEnqueueStepWorkPayload | TaskGraphEnqueueFanOutItemPayload;
}): Promise<{ Success: boolean; Output?: Record<string, unknown> }> {
    if (params.WorkItem.Kind === 'TaskGraph.EnqueueFanOutItem') {
        return {
            Success: true,
            Output: {
                itemIndex: params.WorkItem.ItemIndex,
                itemKey: params.WorkItem.ItemKey,
            },
        };
    }
    return {
        Success: true,
        Output: {
            stepInvocationId: params.WorkItem.StepInvocationID,
            correlationKey: params.WorkItem.CorrelationKey,
        },
    };
}

function parseQueuedRunEnvelope(raw: WorkJson | undefined): TaskGraphQueuedRunEnvelope | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const rec = raw as Record<string, WorkJson>;
    if (rec['Kind'] !== 'TaskGraph.RunGraph' || typeof rec['ParentTaskID'] !== 'string') {
        return null;
    }
    return {
        Kind: 'TaskGraph.RunGraph',
        ParentTaskID: rec['ParentTaskID'],
        WorkflowName: typeof rec['WorkflowName'] === 'string' ? rec['WorkflowName'] : '',
        Isolation: parseIsolation(rec['Isolation']),
        Topic: typeof rec['Topic'] === 'string' ? rec['Topic'] : '',
        DispatchMode: 'Queue',
        SubmittedAt: typeof rec['SubmittedAt'] === 'string' ? rec['SubmittedAt'] : new Date().toISOString(),
        CorrelationId: typeof rec['CorrelationId'] === 'string' ? rec['CorrelationId'] : rec['ParentTaskID'],
    };
}

function parseEnqueueWorkPayload(
    raw: WorkJson | undefined,
): TaskGraphEnqueueStepWorkPayload | TaskGraphEnqueueFanOutItemPayload | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const rec = raw as Record<string, WorkJson>;
    const kind = rec['Kind'];
    if (kind === 'TaskGraph.EnqueueStep' && typeof rec['CorrelationKey'] === 'string' && typeof rec['TaskID'] === 'string') {
        return {
            Kind: 'TaskGraph.EnqueueStep',
            GraphRunID: String(rec['GraphRunID'] ?? ''),
            StepInvocationID: String(rec['StepInvocationID'] ?? rec['TaskID']),
            TaskID: rec['TaskID'],
            TaskName: String(rec['TaskName'] ?? ''),
            CorrelationKey: rec['CorrelationKey'],
            Topic: String(rec['Topic'] ?? ''),
            HandlerKey: typeof rec['HandlerKey'] === 'string' ? rec['HandlerKey'] : undefined,
            ActionName: typeof rec['ActionName'] === 'string' ? rec['ActionName'] : undefined,
            InputPayload: toRecord(rec['InputPayload']),
            MaxRetries: typeof rec['MaxRetries'] === 'number' ? rec['MaxRetries'] : 0,
            PublishedAt: String(rec['PublishedAt'] ?? ''),
        };
    }
    if (
        kind === 'TaskGraph.EnqueueFanOutItem' &&
        typeof rec['ItemCorrelationKey'] === 'string' &&
        typeof rec['TaskID'] === 'string' &&
        typeof rec['ItemIndex'] === 'number'
    ) {
        return {
            Kind: 'TaskGraph.EnqueueFanOutItem',
            GraphRunID: String(rec['GraphRunID'] ?? ''),
            StepInvocationID: String(rec['StepInvocationID'] ?? rec['TaskID']),
            TaskID: rec['TaskID'],
            TaskName: String(rec['TaskName'] ?? ''),
            CorrelationKey: String(rec['CorrelationKey'] ?? ''),
            ItemCorrelationKey: rec['ItemCorrelationKey'],
            ItemIndex: rec['ItemIndex'],
            ItemKey: String(rec['ItemKey'] ?? rec['ItemIndex']),
            ItemVariable: String(rec['ItemVariable'] ?? 'item'),
            IndexVariable: typeof rec['IndexVariable'] === 'string' ? rec['IndexVariable'] : undefined,
            ItemValue: rec['ItemValue'],
            Topic: String(rec['Topic'] ?? ''),
            HandlerKey: typeof rec['HandlerKey'] === 'string' ? rec['HandlerKey'] : undefined,
            ActionName: typeof rec['ActionName'] === 'string' ? rec['ActionName'] : undefined,
            SubAgentName: typeof rec['SubAgentName'] === 'string' ? rec['SubAgentName'] : undefined,
            ContinueOnError: rec['ContinueOnError'] === true,
            Payload: toRecord(rec['Payload']),
            MaxRetries: typeof rec['MaxRetries'] === 'number' ? rec['MaxRetries'] : 0,
            PublishedAt: String(rec['PublishedAt'] ?? ''),
        };
    }
    return null;
}

function parseIsolation(val: WorkJson | undefined): TaskGraphIsolationLevel {
    if (val === 'Worker' || val === 'Process' || val === 'Container' || val === 'InProcess') {
        return val;
    }
    return LimitsConfigResolver.Resolve().Limits.Isolation.DefaultIsolation;
}

function toRecord(val: WorkJson | undefined): Record<string, unknown> {
    if (!val || typeof val !== 'object' || Array.isArray(val)) return {};
    return { ...val };
}

function toWorkJsonValue(value: unknown): WorkJson {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (Array.isArray(value)) return value.map((item) => toWorkJsonValue(item));
    if (typeof value === 'object') {
        const obj: { [key: string]: WorkJson } = {};
        for (const [k, v] of Object.entries(value)) {
            if (v !== undefined) {
                obj[k] = toWorkJsonValue(v);
            }
        }
        return obj;
    }
    return String(value);
}
