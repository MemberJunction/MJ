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
import { ActionEngineServer } from '@memberjunction/actions';
import { AIEngine } from '@memberjunction/aiengine';
import {
    BoundedRunnerSemaphore,
    ParseTaskGraphParentMetadata,
    TaskGraphCallerNotificationService,
    TaskGraphDispatcher,
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
import { BaseWorkHandler, ResolveWorkHandler, WorkQueueEngine } from '@memberjunction/work-queue-engine';
import {
    NULL_WORK_LOGGER,
    Outcome,
    type PublishRequest,
    type WorkContext,
    type WorkJson,
    type WorkMessage,
    type WorkOutcome,
} from '@memberjunction/work-queue-core';
import { BaseSingleton, RegisterClass } from '@memberjunction/global';
import { CreateDefaultIsolationRunners } from './isolation/index.js';
import { TaskGraphActionRunner } from './TaskGraphActionRunner.js';
import { TaskGraphAgentRunner } from './TaskGraphAgentRunner.js';
import { TaskGraphPromptRunner } from './TaskGraphPromptRunner.js';

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
    WorkContext?: WorkContext;
    Message?: WorkMessage<WorkJson>;
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
                    WorkContext: context,
                    Message: message,
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
    if (params.Isolation !== 'InProcess' && !runners[params.Isolation]) {
        const msg = `Requested isolation '${params.Isolation}' runner unavailable for graph '${params.ParentTaskID}'.`;
        LogError(`[TaskGraphRunWorkHandler] ${msg}`);
        return { Success: false, ErrorMessage: msg };
    }

    const serviceUser = ResolveServiceUser(params.ContextUser);
    const timeoutMs = LimitsConfigResolver.Resolve().Limits.TaskGraphQueue.QueueDispatchExecutionTimeoutMs;
    const dispatcher = new TaskGraphDispatcher(
        { CreateProvider: async () => params.Provider },
        new TaskGraphAgentRunner(),
        serviceUser,
        {
            InstanceID: `wq-graph-${params.ParentTaskID}-${Date.now()}`,
            IsolationRunners: runners,
        },
        undefined,
        undefined,
        new TaskGraphActionRunner(),
        new TaskGraphPromptRunner(),
    );

    try {
        await dispatcher.Start();
        const note = await TaskGraphCallerNotificationService.Instance.WaitForNotification(
            params.ParentTaskID,
            params.Provider,
            serviceUser,
            timeoutMs,
        );
        return {
            Success: note.TerminalOutcome === 'Succeeded',
            Output: note.Output,
            ErrorMessage: note.ErrorMessage,
        };
    } catch (err) {
        return {
            Success: false,
            ErrorMessage: err instanceof Error ? err.message : String(err),
        };
    } finally {
        await dispatcher.Stop().catch((stopErr) => {
            LogError(
                `[TaskGraphRunWorkHandler] Failed to stop scoped dispatcher for graph '${params.ParentTaskID}': ${
                    stopErr instanceof Error ? stopErr.message : String(stopErr)
                }`,
            );
        });
    }
}

async function defaultEnqueueItemExecutor(params: {
    WorkItem: TaskGraphEnqueueStepWorkPayload | TaskGraphEnqueueFanOutItemPayload;
    Attempt: number;
    MaxAttempts: number;
    Provider: IMetadataProvider;
    ContextUser: UserInfo;
    WorkContext?: WorkContext;
    Message?: WorkMessage<WorkJson>;
}): Promise<{ Success: boolean; Output?: Record<string, unknown>; ErrorMessage?: string; Retryable?: boolean }> {
    const serviceUser = ResolveServiceUser(params.ContextUser);
    const item = params.WorkItem;
    const mergedPayload = buildEnqueueExecutionPayload(item);
    const isolation: TaskGraphIsolationLevel = item.Isolation ?? 'InProcess';
    const runners = CreateDefaultIsolationRunners();
    const runner = runners[isolation];
    if (isolation !== 'InProcess' && !runner) {
        return {
            Success: false,
            Retryable: false,
            ErrorMessage: `Requested isolation '${isolation}' runner unavailable for queued work item '${item.TaskID}'.`,
        };
    }

    const invokeTarget = (): Promise<{
        Success: boolean;
        Output?: Record<string, unknown>;
        ErrorMessage?: string;
        Retryable?: boolean;
    }> => executeEnqueueTarget(item, mergedPayload, serviceUser, params);

    if (isolation === 'InProcess' || !runner) {
        return invokeTarget();
    }

    const stepType = item.ActionName ? 'Action' : item.SubAgentName ? 'Agent' : 'External';
    const execResult = await runner.Execute({
        Level: isolation,
        TaskID: item.TaskID,
        TaskName: item.TaskName,
        GraphID: item.GraphRunID || item.TaskID,
        Workload: {
            Kind: 'IsolatedTaskStep',
            TaskID: item.TaskID,
            TaskName: item.TaskName,
            GraphID: item.GraphRunID || item.TaskID,
            StepType: stepType,
            ActionID: null,
            AgentID: null,
            PromptID: null,
            InputPayload: mergedPayload,
            DependencyOutputs: {},
            Configuration: null,
            InputTainted: false,
        },
        HostRpc: {
            Invoke: async (method) => {
                if (method !== 'executeTaskStep') {
                    throw new Error(`Unsupported TaskGraph isolation HostRpc method "${method}".`);
                }
                const outcome = await invokeTarget();
                return {
                    BodyOutcome: {
                        Success: outcome.Success,
                        Output: outcome.Output,
                        ErrorMessage: outcome.ErrorMessage,
                        ResultCode: outcome.Retryable === false ? 'NON_RETRYABLE_ENQUEUE_ERROR' : undefined,
                    },
                };
            },
        },
    });

    return {
        Success: execResult.Success,
        Output: toPlainRecord(execResult.BodyOutcome?.Output ?? execResult.Output),
        ErrorMessage: execResult.BodyOutcome?.ErrorMessage ?? execResult.ErrorMessage,
        Retryable:
            execResult.BodyOutcome?.ResultCode === 'NON_RETRYABLE_ENQUEUE_ERROR' ||
            execResult.ErrorCode === 'NON_RETRYABLE_ENQUEUE_ERROR'
                ? false
                : execResult.Success
                    ? undefined
                    : true,
    };
}

function buildEnqueueExecutionPayload(
    item: TaskGraphEnqueueStepWorkPayload | TaskGraphEnqueueFanOutItemPayload,
): Record<string, unknown> {
    if (item.Kind === 'TaskGraph.EnqueueFanOutItem') {
        const merged: Record<string, unknown> = {
            ...item.Payload,
            [item.ItemVariable]: item.ItemValue,
        };
        if (item.IndexVariable) {
            merged[item.IndexVariable] = item.ItemIndex;
        }
        return merged;
    }
    return { ...item.InputPayload };
}

async function executeEnqueueTarget(
    item: TaskGraphEnqueueStepWorkPayload | TaskGraphEnqueueFanOutItemPayload,
    mergedPayload: Record<string, unknown>,
    serviceUser: UserInfo,
    params: {
        Attempt: number;
        MaxAttempts: number;
        Provider: IMetadataProvider;
        WorkContext?: WorkContext;
        Message?: WorkMessage<WorkJson>;
    },
): Promise<{ Success: boolean; Output?: Record<string, unknown>; ErrorMessage?: string; Retryable?: boolean }> {
    const actionName = item.ActionName?.trim();
    if (actionName) {
        await ActionEngineServer.Instance.Config(false, serviceUser);
        const action = ActionEngineServer.Instance.Actions.find(
            (a) => a.Name.trim().toLowerCase() === actionName.toLowerCase(),
        );
        if (!action) {
            return {
                Success: false,
                Retryable: false,
                ErrorMessage: `Action '${actionName}' not found for queued work item '${item.TaskID}'.`,
            };
        }
        const actionResult = await new TaskGraphActionRunner().RunActionForTask({
            TaskID: item.TaskID,
            ActionID: action.ID,
            InputPayload: mergedPayload,
            DependencyOutputs: new Map<string, unknown>(),
            Provider: params.Provider,
            ContextUser: serviceUser,
        });
        return {
            Success: actionResult.Success,
            Output: toPlainRecord(actionResult.Output),
            ErrorMessage: actionResult.ErrorMessage,
            Retryable: actionResult.Success ? undefined : true,
        };
    }

    const subAgentName = item.SubAgentName?.trim();
    if (subAgentName) {
        await AIEngine.Instance.Config(false, serviceUser);
        const agent = AIEngine.Instance.Agents.find(
            (a) => a.Name.trim().toLowerCase() === subAgentName.toLowerCase(),
        );
        if (!agent) {
            return {
                Success: false,
                Retryable: false,
                ErrorMessage: `Sub-agent '${subAgentName}' not found for queued work item '${item.TaskID}'.`,
            };
        }
        const agentResult = await new TaskGraphAgentRunner().RunAgentForTask({
            TaskID: item.TaskID,
            AgentID: agent.ID,
            InputPayload: mergedPayload,
            DependencyOutputs: new Map<string, unknown>(),
            Provider: params.Provider,
            ContextUser: serviceUser,
        });
        return {
            Success: agentResult.Success,
            Output: toPlainRecord(agentResult.Output),
            ErrorMessage: agentResult.ErrorMessage,
            Retryable: agentResult.Success ? undefined : true,
        };
    }

    const handlerKey = item.HandlerKey?.trim();
    if (handlerKey && handlerKey !== 'TaskGraph.EnqueueItem') {
        const customHandler = ResolveWorkHandler(handlerKey);
        if (!customHandler || customHandler instanceof TaskGraphEnqueueItemWorkHandler) {
            return {
                Success: false,
                Retryable: false,
                ErrorMessage: `Custom WorkQueue handler '${handlerKey}' is not registered for queued work item '${item.TaskID}'.`,
            };
        }
        customHandler.BindExecutionContext({ ContextUser: serviceUser, Provider: params.Provider });
        const fallbackMessage: WorkMessage<WorkJson> = params.Message ?? {
            MessageID: item.StepInvocationID,
            Topic: item.Topic,
            Payload: toWorkJsonValue(mergedPayload),
            Attributes: {},
            CorrelationID:
                item.Kind === 'TaskGraph.EnqueueFanOutItem'
                    ? item.ItemCorrelationKey
                    : item.CorrelationKey,
            PublishedAt: item.PublishedAt || new Date().toISOString(),
        };
        const fallbackContext: WorkContext = params.WorkContext ?? {
            SubscriptionName: item.Topic,
            DeliveryID: item.StepInvocationID,
            Attempt: params.Attempt,
            MaxAttempts: params.MaxAttempts,
            IsReplay: params.Attempt > 1,
            Signal: new AbortController().signal,
            Heartbeat: async () => true,
            Log: NULL_WORK_LOGGER,
        };
        const outcome = await customHandler.Handle(fallbackMessage, fallbackContext);
        if (outcome.Kind === 'Complete') {
            return {
                Success: true,
                Output: {
                    handlerKey,
                    executed: true,
                },
            };
        }
        if (outcome.Kind === 'Retry') {
            return {
                Success: false,
                Retryable: true,
                ErrorMessage: outcome.Reason ?? `Handler '${handlerKey}' requested retry.`,
            };
        }
        return {
            Success: false,
            Retryable: false,
            ErrorMessage: outcome.Reason,
        };
    }

    return {
        Success: false,
        Retryable: false,
        ErrorMessage: `Enqueue work item '${item.TaskID}' does not specify ActionName, SubAgentName, or a custom HandlerKey.`,
    };
}

function toPlainRecord(val: unknown): Record<string, unknown> | undefined {
    if (val === null || val === undefined) return undefined;
    if (typeof val === 'object' && !Array.isArray(val)) {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(val)) {
            result[k] = v;
        }
        return result;
    }
    return { value: val };
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
            SubAgentName: typeof rec['SubAgentName'] === 'string' ? rec['SubAgentName'] : undefined,
            Isolation: rec['Isolation'] !== undefined ? parseIsolation(rec['Isolation']) : undefined,
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
            Isolation: rec['Isolation'] !== undefined ? parseIsolation(rec['Isolation']) : undefined,
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
    return 'InProcess';
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
