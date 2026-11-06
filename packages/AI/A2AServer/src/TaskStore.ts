import { IMetadataProvider, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJTaskEntity, MJTaskTypeEntity } from '@memberjunction/core-entities';
import { IShutdownable, IsValidUUID, UUIDsEqual } from '@memberjunction/global';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'failed';

export interface Part {
    id: string; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    type: 'text' | 'file' | 'data'; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    content: string | object; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    metadata?: object; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
}

export interface Message {
    id: string; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    taskId: string; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    role: 'user' | 'agent'; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    parts: Part[]; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    created: Date; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
}

export interface Artifact {
    id: string; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    taskId: string; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    name: string; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    parts: Part[]; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    created: Date; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
}

export interface Task {
    id: string; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    status: TaskStatus; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    messages: Message[]; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    artifacts: Artifact[]; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    created: Date; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    updated: Date; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
}

/**
 * Terminal task statuses — tasks in these states are eligible for cleanup
 * after the retention window elapses.
 */
export const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set(['completed', 'cancelled', 'failed']);

export interface TaskStoreOptions {
    /** How often to scan for terminal tasks. Default 5 minutes. */
    sweepIntervalMs?: number; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    /** How long a terminal task is retained before sweep removes it. Default 1 hour. */
    retentionMs?: number; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
}

/**
 * Contract for A2A task storage implementations (`InMemoryA2ATaskStore` and `DurableEntityA2ATaskStore`).
 */
export interface IA2ATaskStore extends IShutdownable {
    Start(): void;
    Shutdown(): void;
    Set(id: string, task: Task, ownerUserId?: string): this;
    GetForUser(id: string, userId: string): Task | undefined;
    CancelTask(taskId: string, reason?: string): boolean;
    Notify(task: Task): void;
    Subscribe(taskId: string, listener: (task: Task) => void): () => void;
    RegisterAbortController(taskId: string, controller?: AbortController): AbortController;
    SaveTask(task: Task, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<boolean>;
    LoadTaskForUser(id: string, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<Task | undefined>;
    CancelTaskForUser(
        id: string,
        contextUser?: UserInfo,
        reason?: string,
        provider?: IMetadataProvider
    ): Promise<boolean>;
    NotifyTask(task: Task, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void>;
}

/**
 * Maps an A2A wire `TaskStatus` to the corresponding `MJ: Tasks` entity `Status` value.
 */
export function MapA2AStatusToMJTaskStatus(status: TaskStatus): MJTaskEntity['Status'] {
    switch (status) {
        case 'pending':
            return 'Pending';
        case 'in_progress':
            return 'In Progress';
        case 'completed':
            return 'Complete';
        case 'cancelled':
            return 'Cancelled';
        case 'failed':
            return 'Failed';
        default: {
            const _exhaustiveCheck: never = status;
            return _exhaustiveCheck;
        }
    }
}

/**
 * Maps an `MJ: Tasks` entity `Status` value back to the A2A wire `TaskStatus`.
 */
export function MapMJTaskStatusToA2AStatus(status: MJTaskEntity['Status']): TaskStatus {
    switch (status) {
        case 'Pending':
        case 'Deferred':
        case 'Blocked':
            return 'pending';
        case 'In Progress':
            return 'in_progress';
        case 'Complete':
        case 'Skipped':
            return 'completed';
        case 'Cancelled':
            return 'cancelled';
        case 'Failed':
            return 'failed';
        default: {
            const _exhaustiveCheck: never = status;
            return _exhaustiveCheck;
        }
    }
}

/**
 * Bounded in-memory task store with periodic terminal-state cleanup.
 *
 * Replaces the unbounded module-level `Map<string, Task>` that was the single
 * largest leak found in the audit (R2-C11): tasks accumulated forever with
 * their `messages[]` and `artifacts[]` arrays, growing memory roughly as
 * `tasks × messages × artifact-bytes`. The store keeps the same `Map`-like
 * surface (`set`/`get`/`delete`/`has`/`size`) so callers don't change, and
 * adds a sweeper that drops tasks in terminal state older than `retentionMs`.
 * Implements `IShutdownable` so the sweeper timer is cleared during graceful
 * shutdown.
 */
export class TaskStore implements IA2ATaskStore {
    protected readonly _tasks: Map<string, Task> = new Map();
    protected readonly _listeners: Map<string, Set<(task: Task) => void>> = new Map();
    protected readonly _abortControllers: Map<string, AbortController> = new Map();
    /**
     * The ID of the user each task was created for. Kept beside the task rather than on it,
     * because the task is the wire shape returned to clients.
     */
    protected readonly _owners: Map<string, string> = new Map();
    private readonly _sweepIntervalMs: number;
    private readonly _retentionMs: number;
    private _timer: ReturnType<typeof setInterval> | null = null;

    constructor(options: TaskStoreOptions = {}) {
        this._sweepIntervalMs = options.sweepIntervalMs ?? 5 * 60 * 1000;
        this._retentionMs = options.retentionMs ?? 60 * 60 * 1000;
    }

    public get ShutdownName(): string {
        return 'A2AServer.TaskStore';
    }

    /**
     * Begin the periodic sweep. Idempotent; calling twice is safe. Uses `unref()`
     * so the sweep timer doesn't hold the process alive on its own.
     */
    public Start(): void {
        if (this._timer) return;
        this._timer = setInterval(() => this.Sweep(), this._sweepIntervalMs);
        if (this._timer && typeof (this._timer as { unref?: () => void }).unref === 'function') {
            (this._timer as { unref: () => void }).unref();
        }
    }

    /**
     * Stop the sweep timer and drop all tasks, listeners, and abort controllers. Idempotent.
     */
    public Shutdown(): void {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
        for (const controller of this._abortControllers.values()) {
            if (!controller.signal.aborted) {
                controller.abort('A2AServer.TaskStore shutdown');
            }
        }
        this._abortControllers.clear();
        this._listeners.clear();
        this._owners.clear();
        this._tasks.clear();
    }

    /**
     * Configured retention window in milliseconds.
     */
    public get RetentionMs(): number {
        return this._retentionMs;
    }

    /**
     * Drop terminal-state tasks that haven't been updated in `retentionMs`.
     * Returns the count evicted (useful for tests and diagnostics).
     */
    public Sweep(now: number = Date.now()): number {
        const cutoff = now - this._retentionMs;
        let evicted = 0;
        for (const [id, task] of this._tasks) {
            if (TERMINAL_STATUSES.has(task.status) && task.updated.getTime() <= cutoff) {
                this._tasks.delete(id);
                this._listeners.delete(id);
                this._abortControllers.delete(id);
                this._owners.delete(id);
                evicted++;
            }
        }
        if (evicted > 0) {
            LogStatus(`A2AServer.TaskStore swept ${evicted} terminal task(s)`);
        }
        return evicted;
    }

    /**
     * Subscribe to event-driven updates for a specific task ID (replaces 500ms polling).
     * Returns an unsubscribe function.
     */
    public Subscribe(taskId: string, listener: (task: Task) => void): () => void {
        let set = this._listeners.get(taskId);
        if (!set) {
            set = new Set();
            this._listeners.set(taskId, set);
        }
        set.add(listener);
        return () => {
            const current = this._listeners.get(taskId);
            if (current) {
                current.delete(listener);
                if (current.size === 0) {
                    this._listeners.delete(taskId);
                }
            }
        };
    }

    /**
     * Notify all subscribers of a task state change. Automatically cleans up
     * listeners and abort controllers once the task reaches a terminal state.
     */
    public Notify(task: Task): void {
        this._tasks.set(task.id, task);
        const set = this._listeners.get(task.id);
        if (set) {
            for (const listener of Array.from(set)) {
                listener(task);
            }
        }
        if (TERMINAL_STATUSES.has(task.status)) {
            this._listeners.delete(task.id);
            this._abortControllers.delete(task.id);
        }
    }

    /**
     * Register an `AbortController` for an in-flight task so `CancelTask` can propagate
     * cancellation down to `AgentOperations` / `AgentRunner`.
     */
    public RegisterAbortController(
        taskId: string,
        controller: AbortController = new AbortController()
    ): AbortController {
        this._abortControllers.set(taskId, controller);
        return controller;
    }

    /**
     * Cancel an in-flight task, aborting its registered `AbortController` (if any) and
     * notifying any active SSE subscribers immediately.
     */
    public CancelTask(taskId: string, reason: string = 'Task cancelled via A2A'): boolean {
        const task = this._tasks.get(taskId);
        if (!task) {
            return false;
        }
        task.status = 'cancelled';
        task.updated = new Date();
        const controller = this._abortControllers.get(taskId);
        if (controller && !controller.signal.aborted) {
            controller.abort(reason);
        }
        this.Notify(task);
        return true;
    }

    /**
     * Stores a task.
     * @param ownerUserId The user the task was created for. Only that user can retrieve it
     *   through {@link GetForUser}; a task stored without an owner is retrievable by no one.
     *   Omit it when replacing a stored task, to keep its owner.
     */
    public Set(id: string, task: Task, ownerUserId?: string): this {
        this._tasks.set(id, task);
        if (ownerUserId) {
            this._owners.set(id, ownerUserId);
        }
        return this;
    }

    /**
     * The task with this ID when it belongs to `userId`, otherwise undefined. A task that belongs
     * to someone else is indistinguishable from one that does not exist, so a caller cannot learn
     * another user's task IDs, nor read, continue or cancel their tasks.
     */
    public GetForUser(id: string, userId: string): Task | undefined {
        const owner = this._owners.get(id);
        return owner && UUIDsEqual(owner, userId) ? this._tasks.get(id) : undefined;
    }

    /**
     * Async persistence hook for `IA2ATaskStore`. In-memory store updates local Map only.
     */
    public async SaveTask(task: Task, contextUser?: UserInfo, _provider?: IMetadataProvider): Promise<boolean> {
        if (!contextUser?.ID) {
            return false;
        }
        this.Set(task.id, task, contextUser.ID);
        return true;
    }

    /**
     * Async caller-scoped task lookup for `IA2ATaskStore`.
     */
    public async LoadTaskForUser(
        id: string,
        contextUser?: UserInfo,
        _provider?: IMetadataProvider
    ): Promise<Task | undefined> {
        if (!contextUser?.ID) {
            return undefined;
        }
        return this.GetForUser(id, contextUser.ID);
    }

    /**
     * Async caller-scoped task cancellation for `IA2ATaskStore`.
     */
    public async CancelTaskForUser(
        id: string,
        contextUser?: UserInfo,
        reason: string = 'Task cancelled via A2A',
        _provider?: IMetadataProvider
    ): Promise<boolean> {
        if (!contextUser?.ID) {
            return false;
        }
        const existing = this.GetForUser(id, contextUser.ID);
        if (!existing) {
            return false;
        }
        return this.CancelTask(id, reason);
    }

    /**
     * Notifies subscribers and persists the updated task state.
     */
    public async NotifyTask(task: Task, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        this.Notify(task);
        if (contextUser?.ID) {
            await this.SaveTask(task, contextUser, provider);
        }
    }

    /** @deprecated Use {@link Set}. */
    public set(id: string, task: Task): this {
        return this.Set(id, task);
    }
    public Get(id: string): Task | undefined {
        return this._tasks.get(id);
    }

    /** @deprecated Use {@link Get}. */
    public get(id: string): Task | undefined {
        return this.Get(id);
    }
    public Has(id: string): boolean {
        return this._tasks.has(id);
    }

    /** @deprecated Use {@link Has}. */
    public has(id: string): boolean {
        return this.Has(id);
    }
    public Delete(id: string): boolean {
        this._listeners.delete(id);
        this._abortControllers.delete(id);
        this._owners.delete(id);
        return this._tasks.delete(id);
    }

    /** @deprecated Use {@link Delete}. */
    public delete(id: string): boolean {
        return this.Delete(id);
    }
    public get Size(): number {
        return this._tasks.size;
    }

    /** @deprecated Use {@link Size}. */
    public get size(): number {
        return this.Size;
    }
    public Values(): IterableIterator<Task> {
        return this._tasks.values();
    }

    /** @deprecated Use {@link Values}. */
    public values(): IterableIterator<Task> {
        return this.Values();
    }
}

/**
 * In-memory implementation of {@link IA2ATaskStore} for unit testing and non-persistent dev runs.
 */
export class InMemoryA2ATaskStore extends TaskStore {}

/**
 * Serialized JSON envelope written to `MJTaskEntity.InputPayload` for A2A tasks.
 */
interface SerializedA2ATaskInputPayload {
    protocol: 'a2a/v1';
    taskId: string;
    created: string;
    messages: Array<{
        id: string;
        taskId: string;
        role: 'user' | 'agent';
        parts: Part[];
        created: string;
    }>;
}

/**
 * Serialized JSON envelope written to `MJTaskEntity.OutputPayload` for A2A tasks.
 */
interface SerializedA2ATaskOutputPayload {
    protocol: 'a2a/v1';
    taskId: string;
    updated: string;
    artifacts: Array<{
        id: string;
        taskId: string;
        name: string;
        parts: Part[];
        created: string;
    }>;
}

export interface DurableEntityA2ATaskStoreOptions extends TaskStoreOptions {
    /**
     * Whether to persist and hydrate tasks via the `MJ: Tasks` entity.
     * Defaults to `true`. Set to `false` when `a2aServerSettings.taskStoreMode === 'memory'`.
     */
    PersistenceEnabled?: boolean;
    /**
     * Optional `MJ: Task Types` ID to assign when creating new `MJ: Tasks` records.
     * If omitted, the store resolves and caches the first available task type via `RunView`.
     */
    DefaultTaskTypeId?: string;
}

/**
 * Durable `MJ: Tasks`-backed implementation of {@link IA2ATaskStore} (`WS-4.5b`).
 *
 * Combines the in-process L1 cache and SSE subscriber notifications of {@link TaskStore}
 * with durable persistence through `MJTaskEntity` (`'MJ: Tasks'`). Enables horizontal scaling
 * (multiple A2A server replicas behind a load balancer) and zero-data-loss rolling restarts:
 * any replica can serve `GET /a2a/tasks/:taskId`, continue a multi-turn task on `POST /a2a/tasks/send`,
 * or cancel a task on `POST /a2a/tasks/:taskId/cancel`, while strictly enforcing caller ownership
 * via `UUIDsEqual(entity.UserID, contextUser.ID)`.
 */
export class DurableEntityA2ATaskStore extends TaskStore {
    private readonly _persistenceEnabled: boolean;
    private _cachedTaskTypeId: string | null;
    private readonly _entityIdByTaskId: Map<string, string> = new Map();

    constructor(options: DurableEntityA2ATaskStoreOptions = {}) {
        super(options);
        this._persistenceEnabled = options.PersistenceEnabled ?? true;
        this._cachedTaskTypeId = options.DefaultTaskTypeId ?? null;
    }

    public override get ShutdownName(): string {
        return 'A2AServer.DurableEntityA2ATaskStore';
    }

    public override Shutdown(): void {
        this._entityIdByTaskId.clear();
        super.Shutdown();
    }

    /**
     * Whether durable `MJ: Tasks` persistence is enabled on this store instance.
     */
    public get PersistenceEnabled(): boolean {
        return this._persistenceEnabled;
    }

    /**
     * Persists an A2A `Task` into both the local L1 cache and the `MJ: Tasks` entity.
     * Refuses when `contextUser` is missing so no task is ever written without an authenticated owner.
     */
    public override async SaveTask(
        task: Task,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<boolean> {
        if (!contextUser?.ID) {
            return false;
        }
        const existingOwner = this._owners.get(task.id);
        if (existingOwner && !UUIDsEqual(existingOwner, contextUser.ID)) {
            LogError(`DurableEntityA2ATaskStore.SaveTask refused: task ${task.id} belongs to a different user`);
            return false;
        }

        if (!this._persistenceEnabled) {
            this.Set(task.id, task, contextUser.ID);
            return true;
        }

        const md = provider ?? Metadata.Provider; // global-provider-ok: fallback when caller does not supply per-request provider
        try {
            const entity = await md.GetEntityObject<MJTaskEntity>('MJ: Tasks', contextUser);
            const lookupId = IsValidUUID(task.id) ? task.id : this._entityIdByTaskId.get(task.id);
            const loaded = lookupId && IsValidUUID(lookupId) ? await entity.Load(lookupId) : false;

            if (loaded) {
                if (!entity.UserID || !UUIDsEqual(entity.UserID, contextUser.ID)) {
                    LogError(
                        `DurableEntityA2ATaskStore.SaveTask refused: task ${task.id} belongs to a different user`
                    );
                    return false;
                }
            } else {
                entity.NewRecord();
                if (IsValidUUID(task.id)) {
                    entity.ID = task.id;
                }
                entity.Name = `A2A Task ${task.id}`;
                entity.UserID = contextUser.ID;
                entity.StepType = 'External';
                const typeId = await this.resolveTaskTypeId(contextUser, md);
                if (typeId) {
                    entity.TypeID = typeId;
                }
                entity.StartedAt = task.created;
            }

            entity.Status = MapA2AStatusToMJTaskStatus(task.status);
            entity.PercentComplete = task.status === 'completed' ? 100 : task.status === 'in_progress' ? 50 : 0;
            if (TERMINAL_STATUSES.has(task.status) && !entity.CompletedAt) {
                entity.CompletedAt = task.updated;
            }

            const inputPayload: SerializedA2ATaskInputPayload = {
                protocol: 'a2a/v1',
                taskId: task.id,
                created: task.created.toISOString(),
                messages: task.messages.map((m) => ({
                    id: m.id,
                    taskId: m.taskId,
                    role: m.role,
                    parts: m.parts,
                    created: m.created instanceof Date ? m.created.toISOString() : new Date(m.created).toISOString(),
                })),
            };
            const outputPayload: SerializedA2ATaskOutputPayload = {
                protocol: 'a2a/v1',
                taskId: task.id,
                updated: task.updated.toISOString(),
                artifacts: task.artifacts.map((a) => ({
                    id: a.id,
                    taskId: a.taskId,
                    name: a.name,
                    parts: a.parts,
                    created: a.created instanceof Date ? a.created.toISOString() : new Date(a.created).toISOString(),
                })),
            };

            entity.InputPayload = JSON.stringify(inputPayload);
            entity.OutputPayload = JSON.stringify(outputPayload);

            const saved = await entity.Save();
            if (!saved) {
                LogError(
                    `DurableEntityA2ATaskStore: Failed to save MJ: Tasks row for task ${task.id}: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`
                );
                return false;
            }
            if (!IsValidUUID(task.id) && entity.ID) {
                this._entityIdByTaskId.set(task.id, entity.ID);
            }
            this.Set(task.id, task, contextUser.ID);
            return true;
        } catch (error: unknown) {
            LogError(
                `DurableEntityA2ATaskStore: Error saving task ${task.id}: ${error instanceof Error ? error.message : String(error)}`
            );
            return false;
        }
    }

    /**
     * Loads an A2A `Task` for `contextUser`, consulting `MJ: Tasks` when persistence is enabled
     * so cross-replica updates/cancellations are observed immediately, and falling back to the
     * local L1 cache when persistence is disabled or unavailable.
     * Strictly verifies `UUIDsEqual(entity.UserID, contextUser.ID)`.
     */
    public override async LoadTaskForUser(
        id: string,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<Task | undefined> {
        if (!contextUser?.ID) {
            return undefined;
        }

        const cached = this.GetForUser(id, contextUser.ID);
        if (!this._persistenceEnabled) {
            return cached;
        }

        const md = provider ?? Metadata.Provider; // global-provider-ok: fallback when caller does not supply per-request provider
        try {
            const lookupId = IsValidUUID(id) ? id : this._entityIdByTaskId.get(id);
            if (!lookupId || !IsValidUUID(lookupId)) {
                return cached;
            }

            const entity = await md.GetEntityObject<MJTaskEntity>('MJ: Tasks', contextUser);
            const loaded = await entity.Load(lookupId);
            if (!loaded) {
                return cached;
            }

            if (!entity.UserID || !UUIDsEqual(entity.UserID, contextUser.ID)) {
                return undefined;
            }

            const hydrated = this.hydrateTaskFromEntity(entity);
            this.Set(hydrated.id, hydrated, entity.UserID);
            return hydrated;
        } catch (error: unknown) {
            LogError(
                `DurableEntityA2ATaskStore: Error loading task ${id}: ${error instanceof Error ? error.message : String(error)}`
            );
            return cached;
        }
    }

    /**
     * Cancels a task owned by `contextUser` across both local in-flight execution and durable `MJ: Tasks` storage.
     */
    public override async CancelTaskForUser(
        id: string,
        contextUser?: UserInfo,
        reason: string = 'Task cancelled via A2A',
        provider?: IMetadataProvider
    ): Promise<boolean> {
        const task = await this.LoadTaskForUser(id, contextUser, provider);
        if (!task || !contextUser?.ID) {
            return false;
        }
        this.CancelTask(id, reason);
        task.status = 'cancelled';
        task.updated = new Date();
        await this.SaveTask(task, contextUser, provider);
        return true;
    }

    /**
     * Notifies any in-process SSE subscribers and persists the updated task state to `MJ: Tasks`.
     */
    public override async NotifyTask(
        task: Task,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<void> {
        this.Notify(task);
        if (contextUser?.ID) {
            await this.SaveTask(task, contextUser, provider);
        }
    }

    private hydrateTaskFromEntity(entity: MJTaskEntity): Task {
        let taskId = entity.ID;
        let created = entity.StartedAt ? new Date(entity.StartedAt) : new Date();
        let updated = entity.CompletedAt ? new Date(entity.CompletedAt) : new Date(created);
        let messages: Message[] = [];
        let artifacts: Artifact[] = [];

        if (entity.InputPayload) {
            try {
                const parsed = JSON.parse(entity.InputPayload) as Partial<SerializedA2ATaskInputPayload>;
                if (typeof parsed.taskId === 'string' && parsed.taskId.trim().length > 0) {
                    taskId = parsed.taskId;
                }
                if (parsed.created) {
                    created = new Date(parsed.created);
                }
                if (Array.isArray(parsed.messages)) {
                    messages = parsed.messages.map((m) => ({
                        id: m.id,
                        taskId: m.taskId,
                        role: m.role,
                        parts: m.parts ?? [],
                        created: new Date(m.created),
                    }));
                }
            } catch (error: unknown) {
                LogError(
                    `DurableEntityA2ATaskStore: Failed to parse InputPayload on task ${entity.ID}: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }

        if (entity.OutputPayload) {
            try {
                const parsed = JSON.parse(entity.OutputPayload) as Partial<SerializedA2ATaskOutputPayload>;
                if (parsed.updated) {
                    updated = new Date(parsed.updated);
                }
                if (Array.isArray(parsed.artifacts)) {
                    artifacts = parsed.artifacts.map((a) => ({
                        id: a.id,
                        taskId: a.taskId,
                        name: a.name,
                        parts: a.parts ?? [],
                        created: new Date(a.created),
                    }));
                }
            } catch (error: unknown) {
                LogError(
                    `DurableEntityA2ATaskStore: Failed to parse OutputPayload on task ${entity.ID}: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }

        return {
            id: taskId,
            status: MapMJTaskStatusToA2AStatus(entity.Status),
            messages,
            artifacts,
            created,
            updated,
        };
    }

    private async resolveTaskTypeId(
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<string | null> {
        if (this._cachedTaskTypeId) {
            return this._cachedTaskTypeId;
        }
        try {
            const rv = RunView.FromMetadataProvider(provider);
            const res = await rv.RunView<Pick<MJTaskTypeEntity, 'ID' | 'Name'>>(
                {
                    EntityName: 'MJ: Task Types',
                    Fields: ['ID', 'Name'],
                    ResultType: 'simple',
                    MaxRows: 10,
                },
                contextUser
            );
            if (res.Success && res.Results && res.Results.length > 0) {
                const preferred =
                    res.Results.find((r) => r.Name?.toLowerCase().includes('agent')) ?? res.Results[0];
                this._cachedTaskTypeId = preferred.ID;
                return this._cachedTaskTypeId;
            }
        } catch {
            // Fall through when MJ: Task Types lookup is unavailable in unit-test environments
        }
        return null;
    }
}
