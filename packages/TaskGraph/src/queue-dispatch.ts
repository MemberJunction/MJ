/**
 * @fileoverview WorkQueue dispatch contracts, queued graph run envelopes, and recoverable
 * caller notifications across host restarts for TaskGraphs (`Dispatch: 'Queue'`).
 *
 * @module @memberjunction/task-graph
 */
import {
    IMetadataProvider,
    LimitsConfigResolver,
    LogError,
    LogStatus,
    RunView,
    ServerOperationScopeManager,
    UserInfo,
    type TaskGraphIsolationLevel,
} from '@memberjunction/core';
import { MJTaskEntity } from '@memberjunction/core-entities';
import {
    TASK_GRAPH_RUNTIME_SECURITY_OPERATION,
    type TaskGraphDispatchMode,
    type TaskGraphSpec,
} from '@memberjunction/ai-core-plus';
import { BaseSingleton, GetGlobalObjectStore } from '@memberjunction/global';

/**
 * WorkQueue topic message publish request emitted by `@memberjunction/task-graph` without taking
 * a direct package dependency on `@memberjunction/work-queue-engine`.
 */
export interface TaskGraphWorkQueuePublishRequest<TPayload> {
    Topic: string;
    HandlerKey: string;
    Payload: TPayload;
    CorrelationId: string;
    IdempotencyKey: string;
    SubjectType: string;
    SubjectId: string;
    MaxAttempts?: number;
}

/** Outcome of publishing one message through {@link TaskGraphWorkQueuePublisher}. */
export interface TaskGraphWorkQueuePublishResult {
    WorkItemId: string;
    Status: string;
    MessageId?: string;
}

/** Host-registered bridge to the active WorkQueue engine/transport. */
export interface TaskGraphWorkQueuePublisher {
    Publish<TPayload>(
        requests: TaskGraphWorkQueuePublishRequest<TPayload>[],
        contextUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<TaskGraphWorkQueuePublishResult[]>;
}

/** WorkQueue payload published when `TaskGraph.Submit` runs with `Dispatch: 'Queue'`. */
export interface TaskGraphQueuedRunEnvelope {
    Kind: 'TaskGraph.RunGraph';
    ParentTaskID: string;
    WorkflowName: string;
    Isolation: TaskGraphIsolationLevel;
    Topic: string;
    DispatchMode: TaskGraphDispatchMode;
    SubmittedAt: string;
    CorrelationId: string;
}

/** WorkQueue payload published by an individual `Enqueue` step. */
export interface TaskGraphEnqueueStepWorkPayload {
    Kind: 'TaskGraph.EnqueueStep';
    GraphRunID: string;
    StepInvocationID: string;
    TaskID: string;
    TaskName: string;
    CorrelationKey: string;
    Topic: string;
    HandlerKey?: string;
    ActionName?: string;
    InputPayload: Record<string, unknown>;
    MaxRetries: number;
    PublishedAt: string;
}

/** WorkQueue payload published for each item inside a `ForEach` + `Enqueue` fan-out. */
export interface TaskGraphEnqueueFanOutItemPayload {
    Kind: 'TaskGraph.EnqueueFanOutItem';
    GraphRunID: string;
    StepInvocationID: string;
    TaskID: string;
    TaskName: string;
    CorrelationKey: string;
    ItemCorrelationKey: string;
    ItemIndex: number;
    ItemKey: string;
    ItemVariable: string;
    IndexVariable?: string;
    ItemValue: unknown;
    Topic: string;
    HandlerKey?: string;
    ActionName?: string;
    SubAgentName?: string;
    ContinueOnError: boolean;
    Payload: Record<string, unknown>;
    MaxRetries: number;
    PublishedAt: string;
}

/** Union of all WorkQueue message payloads emitted by TaskGraph dispatch and `Enqueue` steps. */
export type TaskGraphQueueWorkPayload =
    | TaskGraphQueuedRunEnvelope
    | TaskGraphEnqueueStepWorkPayload
    | TaskGraphEnqueueFanOutItemPayload;

/** Lifecycle state of a durable terminal caller notification persisted on a parent graph row. */
export type TaskGraphCallerNotificationStatus = 'Pending' | 'Ready' | 'Delivered' | 'Expired';

/** Terminal outcome classification recorded for callers waiting on a queued graph run. */
export type TaskGraphTerminalOutcome = 'Succeeded' | 'Failed' | 'Cancelled';

/** Durable caller notification record stored on `MJ: Tasks.InputPayload` and delivered across restarts. */
export interface TaskGraphCallerNotificationRecord {
    NotificationID: string;
    ParentTaskID: string;
    WorkflowName: string;
    Status: TaskGraphCallerNotificationStatus;
    TerminalOutcome?: TaskGraphTerminalOutcome;
    Output?: unknown;
    ErrorMessage?: string;
    CreatedAt: string;
    SettledAt?: string;
    DeliveredAt?: string;
}

/** Metadata snapshot persisted onto parent `MJ: Tasks.Configuration` when `Dispatch === 'Queue'`. */
export interface TaskGraphQueuedSubmissionSnapshot {
    Spec: TaskGraphSpec;
    EnvironmentID: string;
    ConversationDetailID: string | null;
    AgentRunID: string | null;
    AgentID: string | null;
    RoutineID: string | null;
    ReinvokeDepth: number;
    SubmittedByUserID: string;
    Topic: string;
    Isolation: TaskGraphIsolationLevel;
    SubmittedAt: string;
}

/**
 * Process-wide registry holding the active {@link TaskGraphWorkQueuePublisher} bridge supplied by
 * MJServer (or a test harness).
 */
export class TaskGraphQueueRegistry extends BaseSingleton<TaskGraphQueueRegistry> {
    private publisher: TaskGraphWorkQueuePublisher | null = null;
    private asyncLockChain: Promise<void> = Promise.resolve();

    public constructor() {
        super();
    }

    /** Returns the singleton {@link TaskGraphQueueRegistry}. */
    public static get Instance(): TaskGraphQueueRegistry {
        return super.getInstance<TaskGraphQueueRegistry>();
    }

    /** Returns the active WorkQueue publisher, or `null` when none is registered. */
    public get Publisher(): TaskGraphWorkQueuePublisher | null {
        return this.publisher;
    }

    /** Registers (or clears with `null`) the host WorkQueue publisher. */
    public RegisterPublisher(publisher: TaskGraphWorkQueuePublisher | null): void {
        this.publisher = publisher;
    }

    /** Returns the effective WorkQueue publisher or throws an actionable configuration error. */
    public RequirePublisher(): TaskGraphWorkQueuePublisher {
        if (!this.publisher) {
            throw new Error(
                'No TaskGraphWorkQueuePublisher is registered. Start WorkQueueHost / TaskGraphWorkQueueService or register a publisher first.',
            );
        }
        return this.publisher;
    }

    /** Publishes queue requests with bounded transient retries per `Limits.TaskGraphQueue.EnqueuePublishRetryAttempts`. */
    public async PublishWithRetry<TPayload>(
        requests: TaskGraphWorkQueuePublishRequest<TPayload>[],
        contextUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<TaskGraphWorkQueuePublishResult[]> {
        if (requests.length === 0) return [];
        const pub = this.RequirePublisher();
        const maxRetries = Math.max(1, LimitsConfigResolver.Resolve().Limits.TaskGraphQueue.EnqueuePublishRetryAttempts);
        let lastError: unknown;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await pub.Publish(requests, contextUser, provider);
            } catch (err) {
                lastError = err;
                if (attempt < maxRetries) {
                    await new Promise<void>((resolve) => setTimeout(resolve, 25 * attempt));
                }
            }
        }
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }

    /** Serializes host-local async mutations safely when updating queued state. */
    public async RunSerialized<T>(fn: () => Promise<T>): Promise<T> {
        const next = this.asyncLockChain.then(fn, fn);
        this.asyncLockChain = next.then(() => undefined, () => undefined);
        return next;
    }
}

/** Listener callback invoked when a queued graph settles and produces a terminal notification. */
export type TaskGraphCallerNotificationListener = (record: TaskGraphCallerNotificationRecord) => void | Promise<void>;

/**
 * Durable caller notification service ensuring terminal graph notifications survive host restarts
 * (`Status: 'Ready'` until recovered and acknowledged as `'Delivered'`).
 */
export class TaskGraphCallerNotificationService extends BaseSingleton<TaskGraphCallerNotificationService> {
    private waitersByParent = new Map<string, Array<(record: TaskGraphCallerNotificationRecord) => void>>();
    private listeners = new Set<TaskGraphCallerNotificationListener>();
    private writeLocks = new Map<string, Promise<void>>();

    public constructor() {
        super();
    }

    /** Returns the singleton {@link TaskGraphCallerNotificationService}. */
    public static get Instance(): TaskGraphCallerNotificationService {
        return super.getInstance<TaskGraphCallerNotificationService>();
    }

    /** Registers a global listener invoked when a queued graph records or recovers a terminal notification. */
    public AddListener(listener: TaskGraphCallerNotificationListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /** Clears in-memory waiters and listeners (primarily for deterministic test isolation). */
    public ResetInMemoryState(): void {
        this.waitersByParent.clear();
        this.listeners.clear();
        this.writeLocks.clear();
    }

    /**
     * Records a terminal outcome & durable caller notification (`Status: 'Ready'`) on the parent `MJ: Tasks` row.
     * Idempotent once recorded as `'Ready'`, `'Delivered'`, or `'Expired'`.
     */
    public async RecordTerminalNotification(params: {
        ParentTaskID: string;
        TerminalOutcome: TaskGraphTerminalOutcome;
        WorkflowName?: string;
        Output?: unknown;
        ErrorMessage?: string;
        Provider: IMetadataProvider;
        ContextUser: UserInfo;
    }): Promise<TaskGraphCallerNotificationRecord> {
        return this.withParentLock(params.ParentTaskID, async () => {
            const serviceUser = ResolveServiceUser(params.ContextUser);
            const parent = await params.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', serviceUser);
            if (!(await parent.Load(params.ParentTaskID))) {
                throw new Error(`Parent task '${params.ParentTaskID}' not found when recording terminal notification.`);
            }

            const existingMeta = readRawParentPayload(parent.InputPayload);
            const existingNotification = existingMeta.callerNotification;
            if (
                existingNotification &&
                (existingNotification.Status === 'Ready' ||
                    existingNotification.Status === 'Delivered' ||
                    existingNotification.Status === 'Expired')
            ) {
                await this.notifyInMemoryWaiters(existingNotification);
                return existingNotification;
            }

            const nowIso = new Date().toISOString();
            const record: TaskGraphCallerNotificationRecord = {
                NotificationID: existingNotification?.NotificationID ?? `${params.ParentTaskID}:${Date.now()}`,
                ParentTaskID: params.ParentTaskID,
                WorkflowName: params.WorkflowName ?? parent.Name,
                Status: 'Ready',
                TerminalOutcome: params.TerminalOutcome,
                ...(params.Output !== undefined ? { Output: params.Output } : {}),
                ...(params.ErrorMessage ? { ErrorMessage: params.ErrorMessage } : {}),
                CreatedAt: existingNotification?.CreatedAt ?? nowIso,
                SettledAt: nowIso,
            };

            const nextPayload: Record<string, unknown> = {
                ...existingMeta.raw,
                callerNotification: record,
            };
            parent.InputPayload = JSON.stringify(nextPayload);
            applyTerminalParentFields(parent, params.TerminalOutcome, params.Output, params.ErrorMessage);

            const saved = await SaveTaskWithAuthority(parent, serviceUser);
            if (!saved) {
                throw new Error(`Failed saving terminal caller notification on task '${params.ParentTaskID}': ${parent.LatestResult?.CompleteMessage ?? 'unknown'}`);
            }

            await this.notifyInMemoryWaiters(record);
            return record;
        });
    }

    /**
     * Waits for a queued graph's terminal caller notification, polling durable storage cleanly so a
     * caller host restarted mid-flight recovers the notification without hanging or losing the result.
     */
    public async WaitForNotification(
        parentTaskID: string,
        provider: IMetadataProvider,
        contextUser: UserInfo,
        timeoutMs: number = 30_000,
        pollIntervalMs: number = 50,
    ): Promise<TaskGraphCallerNotificationRecord> {
        const immediate = await this.GetDurableNotification(parentTaskID, provider, contextUser);
        if (immediate && immediate.Status !== 'Pending') {
            return immediate;
        }

        return new Promise<TaskGraphCallerNotificationRecord>((resolve, reject) => {
            const deadlineAt = Date.now() + Math.max(100, timeoutMs);
            let settled = false;
            let timer: ReturnType<typeof setInterval> | null = null;

            const finish = (record: TaskGraphCallerNotificationRecord): void => {
                if (settled) return;
                settled = true;
                if (timer) clearInterval(timer);
                resolve(record);
            };

            const existingList = this.waitersByParent.get(parentTaskID) ?? [];
            existingList.push(finish);
            this.waitersByParent.set(parentTaskID, existingList);

            timer = setInterval(() => {
                void (async () => {
                    try {
                        const rec = await this.GetDurableNotification(parentTaskID, provider, contextUser);
                        if (rec && rec.Status !== 'Pending') {
                            finish(rec);
                            return;
                        }
                        if (Date.now() >= deadlineAt) {
                            settled = true;
                            if (timer) clearInterval(timer);
                            reject(new Error(`Timed out waiting for caller notification on graph '${parentTaskID}'.`));
                        }
                    } catch (err) {
                        if (Date.now() >= deadlineAt && !settled) {
                            settled = true;
                            if (timer) clearInterval(timer);
                            reject(err instanceof Error ? err : new Error(String(err)));
                        }
                    }
                })();
            }, Math.max(15, pollIntervalMs));
        });
    }

    /** Reads the current durable caller notification record from `MJ: Tasks.InputPayload`, if present. */
    public async GetDurableNotification(
        parentTaskID: string,
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<TaskGraphCallerNotificationRecord | null> {
        const serviceUser = ResolveServiceUser(contextUser);
        const parent = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', serviceUser);
        if (!(await parent.Load(parentTaskID))) {
            return null;
        }
        const parsed = readRawParentPayload(parent.InputPayload);
        if (parsed.callerNotification) {
            return parsed.callerNotification;
        }
        if (parent.Status === 'Complete' || parent.Status === 'Failed' || parent.Status === 'Cancelled') {
            const outcome: TaskGraphTerminalOutcome =
                parent.Status === 'Complete' ? 'Succeeded' : parent.Status === 'Cancelled' ? 'Cancelled' : 'Failed';
            return {
                NotificationID: parent.ID,
                ParentTaskID: parent.ID,
                WorkflowName: parent.Name,
                Status: 'Ready',
                TerminalOutcome: outcome,
                ...(parent.ErrorMessage ? { ErrorMessage: parent.ErrorMessage } : {}),
                CreatedAt: new Date().toISOString(),
                SettledAt: parent.CompletedAt ? new Date(parent.CompletedAt).toISOString() : new Date().toISOString(),
            };
        }
        return null;
    }

    /**
     * Scans terminal queued parent graphs on startup or sweep for `callerNotification.status === 'Ready'`,
     * delivers them to registered listeners, and transitions expired records past retention.
     */
    public async RecoverPendingNotifications(
        provider: IMetadataProvider,
        contextUser: UserInfo,
        acknowledgeOnDeliver: boolean = false,
    ): Promise<TaskGraphCallerNotificationRecord[]> {
        const serviceUser = ResolveServiceUser(contextUser);
        const result = await RunView.FromMetadataProvider(provider).RunView<MJTaskEntity>(
            {
                EntityName: 'MJ: Tasks',
                ExtraFilter: `ParentID IS NULL AND Status IN ('Complete','Failed','Cancelled')`,
                OrderBy: '__mj_UpdatedAt ASC',
                MaxRows: 500,
                ResultType: 'entity_object',
                BypassCache: true,
            },
            serviceUser,
        );
        if (!result.Success || !result.Results?.length) {
            return [];
        }

        const retentionMs = LimitsConfigResolver.Resolve().Limits.TaskGraphQueue.CallerNotificationRetentionMs;
        const nowMs = Date.now();
        const recovered: TaskGraphCallerNotificationRecord[] = [];

        for (const parent of result.Results) {
            const parsed = readRawParentPayload(parent.InputPayload);
            const note = parsed.callerNotification;
            if (!note || note.Status !== 'Ready') continue;

            const settledMs = note.SettledAt ? Date.parse(note.SettledAt) : nowMs;
            if (Number.isFinite(settledMs) && nowMs - settledMs > retentionMs) {
                await this.updateNotificationStatus(parent, parsed.raw, note, 'Expired', serviceUser);
                continue;
            }

            recovered.push(note);
            await this.notifyInMemoryWaiters(note);
            if (acknowledgeOnDeliver) {
                await this.updateNotificationStatus(parent, parsed.raw, note, 'Delivered', serviceUser);
            }
        }
        return recovered;
    }

    /** Transitions a `'Ready'` notification to `'Delivered'` idempotently. */
    public async AcknowledgeNotification(
        parentTaskID: string,
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<boolean> {
        return this.withParentLock(parentTaskID, async () => {
            const serviceUser = ResolveServiceUser(contextUser);
            const parent = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', serviceUser);
            if (!(await parent.Load(parentTaskID))) return false;
            const parsed = readRawParentPayload(parent.InputPayload);
            const note = parsed.callerNotification;
            if (!note || note.Status === 'Delivered') return !!note;
            if (note.Status !== 'Ready') return false;
            return this.updateNotificationStatus(parent, parsed.raw, note, 'Delivered', serviceUser);
        });
    }

    private async updateNotificationStatus(
        parent: MJTaskEntity,
        rawPayload: Record<string, unknown>,
        note: TaskGraphCallerNotificationRecord,
        status: 'Delivered' | 'Expired',
        serviceUser: UserInfo,
    ): Promise<boolean> {
        const updated: TaskGraphCallerNotificationRecord = {
            ...note,
            Status: status,
            ...(status === 'Delivered' ? { DeliveredAt: new Date().toISOString() } : {}),
        };
        parent.InputPayload = JSON.stringify({ ...rawPayload, callerNotification: updated });
        return SaveTaskWithAuthority(parent, serviceUser);
    }

    private async notifyInMemoryWaiters(record: TaskGraphCallerNotificationRecord): Promise<void> {
        const waiters = this.waitersByParent.get(record.ParentTaskID);
        if (waiters && waiters.length > 0) {
            this.waitersByParent.delete(record.ParentTaskID);
            for (const w of waiters) {
                w(record);
            }
        }
        for (const listener of this.listeners) {
            try {
                await listener(record);
            } catch (err) {
                LogError(`[TaskGraphCallerNotification] Listener threw: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    private async withParentLock<T>(parentTaskID: string, fn: () => Promise<T>): Promise<T> {
        const prior = this.writeLocks.get(parentTaskID) ?? Promise.resolve();
        const next = prior.then(fn, fn);
        const tail = next.then(() => undefined, () => undefined);
        this.writeLocks.set(parentTaskID, tail);
        try {
            return await next;
        } finally {
            if (this.writeLocks.get(parentTaskID) === tail) {
                this.writeLocks.delete(parentTaskID);
            }
        }
    }
}

/** Resolves the server-trusted system user when available, falling back to `fallbackUser`. */
export function ResolveServiceUser(fallbackUser: UserInfo): UserInfo {
    const store = GetGlobalObjectStore() as {
        ___SINGLETON__UserCache?: { GetSystemUser?: () => UserInfo | undefined };
    } | null;
    return store?.___SINGLETON__UserCache?.GetSystemUser?.() ?? fallbackUser;
}

/** Saves an `MJ: Tasks` entity inside the TaskGraph runtime authority scope. */
export function SaveTaskWithAuthority(task: MJTaskEntity, serviceUser: UserInfo): Promise<boolean> {
    return ServerOperationScopeManager.Instance.RunWithAuthority(
        {
            operationKey: TASK_GRAPH_RUNTIME_SECURITY_OPERATION,
            source: 'ServerEngine',
            allowedEntities: ['MJ: Tasks'],
            userId: serviceUser.ID,
        },
        () => task.Save(),
    );
}

/** Helper converting terminal `MJ: Tasks.Status` string to {@link TaskGraphTerminalOutcome}. */
export function TerminalOutcomeFromTaskStatus(status: string): TaskGraphTerminalOutcome | null {
    if (status === 'Complete') return 'Succeeded';
    if (status === 'Failed') return 'Failed';
    if (status === 'Cancelled') return 'Cancelled';
    return null;
}

function applyTerminalParentFields(
    parent: MJTaskEntity,
    outcome: TaskGraphTerminalOutcome,
    output: unknown,
    errorMessage?: string,
): void {
    const targetStatus = outcome === 'Succeeded' ? 'Complete' : outcome;
    if (parent.Status !== 'Complete' && parent.Status !== 'Failed' && parent.Status !== 'Cancelled') {
        parent.Status = targetStatus;
        parent.PercentComplete = outcome === 'Succeeded' ? 100 : parent.PercentComplete ?? 0;
        if (!parent.CompletedAt) {
            parent.CompletedAt = new Date();
        }
    }
    if (output !== undefined && !parent.OutputPayload) {
        parent.OutputPayload = typeof output === 'string' ? output : JSON.stringify(output);
    }
    if (errorMessage && !parent.ErrorMessage) {
        parent.ErrorMessage = errorMessage;
    }
}

function readRawParentPayload(rawJson: string | null | undefined): {
    raw: Record<string, unknown>;
    callerNotification?: TaskGraphCallerNotificationRecord;
} {
    if (!rawJson) return { raw: {} };
    try {
        const parsed: unknown = JSON.parse(rawJson);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return { raw: {} };
        }
        const record = parsed as Record<string, unknown>;
        const note = record['callerNotification'];
        return {
            raw: record,
            callerNotification: isCallerNotificationRecord(note) ? note : undefined,
        };
    } catch {
        return { raw: {} };
    }
}

function isCallerNotificationRecord(value: unknown): value is TaskGraphCallerNotificationRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const rec = value as Partial<TaskGraphCallerNotificationRecord>;
    return typeof rec.ParentTaskID === 'string' && typeof rec.Status === 'string';
}
