import { IMetadataProvider, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import type { MJTaskEntity, MJTaskTypeEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, IShutdownable, IsValidUUID, UUIDMap, UUIDSet, UUIDsEqual } from '@memberjunction/global';

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
    /** Drops a task from this process's cache (and its listeners and abort controller). */
    Delete(id: string): boolean;
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
    // Keyed by task ID through UUIDMap: an ID read back from `MJ: Tasks` can differ in case from the
    // lower-case one the server minted (SQL Server returns upper-case), and both must find the same task,
    // owner, listeners and abort controller.
    protected readonly _tasks = new UUIDMap<Task>();
    protected readonly _listeners = new UUIDMap<Set<(task: Task) => void>>();
    protected readonly _abortControllers = new UUIDMap<AbortController>();
    /**
     * The ID of the user each task was created for. Kept beside the task rather than on it,
     * because the task is the wire shape returned to clients.
     */
    protected readonly _owners = new UUIDMap<string>();
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
        for (const controller of this._abortControllers.Values()) {
            if (!controller.signal.aborted) {
                controller.abort('A2AServer.TaskStore shutdown');
            }
        }
        this._abortControllers.Clear();
        this._listeners.Clear();
        this._owners.Clear();
        this._tasks.Clear();
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
                this._tasks.Delete(id);
                this._listeners.Delete(id);
                this._abortControllers.Delete(id);
                this._owners.Delete(id);
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
        let set = this._listeners.Get(taskId);
        if (!set) {
            set = new Set();
            this._listeners.Set(taskId, set);
        }
        set.add(listener);
        return () => {
            const current = this._listeners.Get(taskId);
            if (current) {
                current.delete(listener);
                if (current.size === 0) {
                    this._listeners.Delete(taskId);
                }
            }
        };
    }

    /**
     * Notify all subscribers of a task state change. Automatically cleans up
     * listeners and abort controllers once the task reaches a terminal state.
     */
    public Notify(task: Task): void {
        this._tasks.Set(task.id, task);
        const set = this._listeners.Get(task.id);
        if (set) {
            for (const listener of Array.from(set)) {
                listener(task);
            }
        }
        if (TERMINAL_STATUSES.has(task.status)) {
            this._listeners.Delete(task.id);
            this._abortControllers.Delete(task.id);
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
        this._abortControllers.Set(taskId, controller);
        return controller;
    }

    /**
     * Cancel an in-flight task, aborting its registered `AbortController` (if any) and
     * notifying any active SSE subscribers immediately.
     */
    public CancelTask(taskId: string, reason: string = 'Task cancelled via A2A'): boolean {
        const task = this._tasks.Get(taskId);
        if (!task) {
            return false;
        }
        task.status = 'cancelled';
        task.updated = new Date();
        const controller = this._abortControllers.Get(taskId);
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
        this._tasks.Set(id, task);
        if (ownerUserId) {
            this._owners.Set(id, ownerUserId);
        }
        return this;
    }

    /**
     * The task with this ID when it belongs to `userId`, otherwise undefined. A task that belongs
     * to someone else is indistinguishable from one that does not exist, so a caller cannot learn
     * another user's task IDs, nor read, continue or cancel their tasks.
     */
    public GetForUser(id: string, userId: string): Task | undefined {
        const owner = this._owners.Get(id);
        return owner && UUIDsEqual(owner, userId) ? this._tasks.Get(id) : undefined;
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
        return this._tasks.Get(id);
    }

    /** @deprecated Use {@link Get}. */
    public get(id: string): Task | undefined {
        return this.Get(id);
    }
    public Has(id: string): boolean {
        return this._tasks.Has(id);
    }

    /** @deprecated Use {@link Has}. */
    public has(id: string): boolean {
        return this.Has(id);
    }
    public Delete(id: string): boolean {
        this._listeners.Delete(id);
        this._abortControllers.Delete(id);
        this._owners.Delete(id);
        return this._tasks.Delete(id);
    }

    /** @deprecated Use {@link Delete}. */
    public delete(id: string): boolean {
        return this.Delete(id);
    }
    public get Size(): number {
        return this._tasks.Size;
    }

    /** @deprecated Use {@link Size}. */
    public get size(): number {
        return this.Size;
    }
    public Values(): IterableIterator<Task> {
        return this._tasks.Values();
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
 * The `MJ: Task Types` row every A2A task is filed under. Seeded as metadata (`metadata/task-types`) and found
 * by name; the store never creates it, so a caller's request never writes task-type metadata.
 */
export const A2A_TASK_TYPE_NAME = 'A2A Task';

/**
 * The store `a2aServerSettings.taskStoreMode` asks for. `'memory'` (the default) keeps tasks in this process;
 * `'entity'` keeps them in `MJ: Tasks`, which needs every A2A caller to hold Create and Update on `MJ: Tasks`.
 */
export function CreateA2ATaskStore(mode: 'entity' | 'memory' = 'memory'): TaskStore {
    return mode === 'entity' ? new DurableEntityA2ATaskStore() : new InMemoryA2ATaskStore();
}

/** The protocol marker every A2A task row's payloads carry. */
export const A2A_TASK_PROTOCOL = 'a2a/v1';

/** How many times {@link DurableEntityA2ATaskStore.SaveTask} re-reads and merges before giving up on a contended row. */
const MAX_SAVE_ATTEMPTS = 5;

/**
 * Serialized JSON envelope written to `MJTaskEntity.InputPayload` for A2A tasks.
 */
interface SerializedA2ATaskInputPayload {
    protocol: typeof A2A_TASK_PROTOCOL;
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
    protocol: typeof A2A_TASK_PROTOCOL;
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
}

/** One attempt at {@link DurableEntityA2ATaskStore.SaveTask}: written, refused for good, or lost to a concurrent writer. */
type SaveAttempt = 'saved' | 'refused' | 'conflict';

/**
 * Merges a task's stored state into the in-memory one: messages and artifacts are the union of both
 * (by ID, in creation order), and a status that is terminal in storage stays terminal — so a pod that
 * finishes a task another pod already cancelled cannot write `Complete` over `Cancelled`, and a stale
 * pod cannot move a finished task back to `in_progress`.
 *
 * @returns true when the stored status won, so the caller can stop work on a task finished elsewhere
 */
export function MergeStoredA2ATask(task: Task, stored: Task): boolean {
    task.messages = unionByID(stored.messages, task.messages);
    task.artifacts = unionByID(stored.artifacts, task.artifacts);
    if (TERMINAL_STATUSES.has(stored.status) && stored.status !== task.status) {
        task.status = stored.status;
        task.updated = stored.updated > task.updated ? stored.updated : task.updated;
        return true;
    }
    return false;
}

function unionByID<T extends { id: string; created: Date }>(stored: T[], current: T[]): T[] {
    const byID = new UUIDMap<T>();
    for (const item of [...stored, ...current]) {
        byID.Set(item.id, item);
    }
    return [...byID.Values()].sort((a, b) => a.created.getTime() - b.created.getTime());
}

/**
 * Durable `MJ: Tasks`-backed implementation of {@link IA2ATaskStore} (`WS-4.5b`).
 *
 * Combines the in-process L1 cache and SSE subscriber notifications of {@link TaskStore}
 * with durable persistence through `MJTaskEntity` (`'MJ: Tasks'`). Enables horizontal scaling
 * (multiple A2A server replicas behind a load balancer) and zero-data-loss rolling restarts:
 * any replica can serve `GET /a2a/tasks/:taskId`, continue a multi-turn task on `POST /a2a/tasks/send`,
 * or cancel a task on `POST /a2a/tasks/:taskId/cancel`.
 *
 * **Only A2A rows.** `MJ: Tasks` also holds task-graph steps, conversation tasks and people's to-dos,
 * and a caller who owns one of those knows its ID. The store reads and writes a row only when it is
 * filed under the {@link A2A_TASK_TYPE_NAME} type, carries the {@link A2A_TASK_PROTOCOL} payloads and
 * belongs to the caller; any other row is "not found". Without that, `tasks/send` on a task-graph step's
 * ID overwrote its payloads (its envelope, failure policy and continuation) and status, and could
 * complete a pending Human step.
 *
 * **Concurrent writers.** Two replicas can save the same task at once (two sends, or a cancel and the
 * owning replica's completion). Each save re-reads the row and merges ({@link MergeStoredA2ATask}),
 * checks `__mj_UpdatedAt` has not moved before writing, and reads the row back afterwards; a row that
 * moved, or that came back without what this save wrote, is merged and written again. `BaseEntity.Save()`
 * has no conditional update, so this narrows the lost-update window to the gap between the check and the
 * write rather than closing it; the read-back makes the losing writer repair it.
 */
export class DurableEntityA2ATaskStore extends TaskStore {
    private readonly _persistenceEnabled: boolean;
    private _a2aTaskTypeID: string | null = null;

    constructor(options: DurableEntityA2ATaskStoreOptions = {}) {
        super(options);
        this._persistenceEnabled = options.PersistenceEnabled ?? true;
    }

    public override get ShutdownName(): string {
        return 'A2AServer.DurableEntityA2ATaskStore';
    }

    /**
     * Whether durable `MJ: Tasks` persistence is enabled on this store instance.
     */
    public get PersistenceEnabled(): boolean {
        return this._persistenceEnabled;
    }

    /**
     * Persists an A2A `Task` into both the local L1 cache and the `MJ: Tasks` entity. Returns false when
     * the task could not be written — no authenticated owner, someone else's task, a row that is not an
     * A2A task, a failed save, or a row too contended to settle — so the caller can report it rather
     * than carry on with a task that exists only in this process's memory.
     */
    public override async SaveTask(
        task: Task,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<boolean> {
        if (!contextUser?.ID) {
            return false;
        }
        const existingOwner = this._owners.Get(task.id);
        if (existingOwner && !UUIDsEqual(existingOwner, contextUser.ID)) {
            LogError(`DurableEntityA2ATaskStore.SaveTask refused: task ${task.id} belongs to a different user`);
            return false;
        }
        if (!this._persistenceEnabled) {
            this.Set(task.id, task, contextUser.ID);
            return true;
        }
        if (!IsValidUUID(task.id)) {
            LogError(`DurableEntityA2ATaskStore.SaveTask refused: task ID ${task.id} is not a UUID`);
            return false;
        }

        const md = provider ?? Metadata.Provider; // global-provider-ok: fallback when caller does not supply per-request provider
        try {
            for (let attempt = 1; attempt <= MAX_SAVE_ATTEMPTS; attempt++) {
                const outcome = await this.saveOnce(task, contextUser, md);
                if (outcome === 'saved') {
                    this.Set(task.id, task, contextUser.ID);
                    return true;
                }
                if (outcome === 'refused') {
                    return false;
                }
            }
            LogError(`DurableEntityA2ATaskStore: task ${task.id} changed under ${MAX_SAVE_ATTEMPTS} consecutive saves; not saved`);
            return false;
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
     * local L1 cache when persistence is disabled or the row does not exist yet. A row that is not
     * the caller's A2A task reads as missing.
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
        if (!this._persistenceEnabled || !IsValidUUID(id)) {
            return cached;
        }

        const md = provider ?? Metadata.Provider; // global-provider-ok: fallback when caller does not supply per-request provider
        try {
            const entity = await md.GetEntityObject<MJTaskEntity>('MJ: Tasks', contextUser);
            if (!(await entity.Load(id))) {
                return cached;
            }
            const typeID = await this.a2aTaskTypeID(contextUser, md);
            if (!this.isCallersA2ARow(entity, typeID, contextUser.ID)) {
                return undefined;
            }
            const hydrated = this.hydrateTaskFromEntity(entity);
            this.Set(hydrated.id, hydrated, contextUser.ID);
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
     * In durable mode, the replica running the task polls stored status (default 5 s, {@link WatchCancellation})
     * and aborts its local work when it observes `Cancelled`, or stops on its next save via {@link MergeStoredA2ATask}.
     * Returns false when the task is not the caller's, or the cancellation could not be saved.
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
        if (TERMINAL_STATUSES.has(task.status)) {
            return true;
        }
        this.CancelTask(id, reason);
        task.status = 'cancelled';
        task.updated = new Date();
        return this.SaveTask(task, contextUser, provider);
    }

    /**
     * Notifies any in-process SSE subscribers and persists the updated task state to `MJ: Tasks`.
     */
    public override async NotifyTask(
        task: Task,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<void> {
        if (contextUser?.ID && !(await this.SaveTask(task, contextUser, provider))) {
            LogError(`DurableEntityA2ATaskStore: task ${task.id} reached '${task.status}' but could not be saved`);
        }
        this.Notify(task);
    }

    /** One read-merge-write of the task's row. */
    private async saveOnce(task: Task, contextUser: UserInfo, md: IMetadataProvider): Promise<SaveAttempt> {
        const typeID = await this.a2aTaskTypeID(contextUser, md);
        if (!typeID) {
            LogError(
                `DurableEntityA2ATaskStore: the '${A2A_TASK_TYPE_NAME}' task type is not in this database, so task ${task.id} was not saved. ` +
                'It ships as metadata (metadata/task-types); push it with mj sync, or set a2aServerSettings.taskStoreMode to \'memory\'.'
            );
            return 'refused';
        }
        const entity = await md.GetEntityObject<MJTaskEntity>('MJ: Tasks', contextUser);
        const exists = await entity.Load(task.id);
        if (exists) {
            if (!this.isCallersA2ARow(entity, typeID, contextUser.ID)) {
                LogError(`DurableEntityA2ATaskStore.SaveTask refused: task ${task.id} is not this caller's A2A task`);
                return 'refused';
            }
            if (MergeStoredA2ATask(task, this.hydrateTaskFromEntity(entity))) {
                this.stopLocalWork(task.id);
            }
        } else {
            this.initializeRow(entity, task, contextUser.ID, typeID);
        }
        this.writeTaskToRow(entity, task);

        if (exists && (await this.rowMovedSince(entity, contextUser, md))) {
            return 'conflict';
        }
        if (!(await entity.Save())) {
            LogError(
                `DurableEntityA2ATaskStore: Failed to save MJ: Tasks row for task ${task.id}: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`
            );
            return 'refused';
        }
        return (await this.storedRowHolds(task, contextUser, md)) ? 'saved' : 'conflict';
    }

    /** True when the row's `__mj_UpdatedAt` is no longer the one `loaded` was read at. */
    private async rowMovedSince(loaded: MJTaskEntity, contextUser: UserInfo, md: IMetadataProvider): Promise<boolean> {
        const fresh = await md.GetEntityObject<MJTaskEntity>('MJ: Tasks', contextUser);
        if (!(await fresh.Load(loaded.ID))) {
            return true;
        }
        return fresh.__mj_UpdatedAt?.getTime() !== loaded.__mj_UpdatedAt?.getTime();
    }

    /**
     * True when the stored row holds everything this save wrote: every message and artifact, and the
     * same status. False means a concurrent writer's save landed after ours and dropped something.
     */
    private async storedRowHolds(task: Task, contextUser: UserInfo, md: IMetadataProvider): Promise<boolean> {
        const fresh = await md.GetEntityObject<MJTaskEntity>('MJ: Tasks', contextUser);
        if (!(await fresh.Load(task.id))) {
            return false;
        }
        const stored = this.hydrateTaskFromEntity(fresh);
        const storedMessages = new UUIDSet(stored.messages.map((m) => m.id));
        const storedArtifacts = new UUIDSet(stored.artifacts.map((a) => a.id));
        return stored.status === task.status
            && task.messages.every((m) => storedMessages.Has(m.id))
            && task.artifacts.every((a) => storedArtifacts.Has(a.id));
    }

    /**
     * In durable mode, periodically checks the stored status of an in-flight task while this
     * replica is running it. When stored status is observed as 'cancelled' (e.g. cancelled
     * on another replica), aborts local work via the registered AbortController (S10).
     *
     * @returns A cleanup function to stop polling when the task finishes locally.
     */
    public WatchCancellation(
        taskId: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        intervalMs: number = 5000
    ): () => void {
        const interval = setInterval(async () => {
            try {
                const stored = await this.LoadTaskForUser(taskId, contextUser, provider);
                if (stored?.status === 'cancelled') {
                    this.stopLocalWork(taskId);
                    clearInterval(interval);
                }
            } catch {
                // Ignore transient read errors during cancellation poll
            }
        }, intervalMs);

        if (typeof interval.unref === 'function') {
            interval.unref();
        }

        return () => {
            clearInterval(interval);
        };
    }

    /**
     * In durable mode, subscribes to task updates across replicas by combining in-process events
     * with periodic polling of the stored row in `MJ: Tasks` (S10).
     */
    public SubscribeWithPolling(
        taskId: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        listener: (task: Task) => void,
        intervalMs: number = 5000
    ): () => void {
        const unsubscribeLocal = this.Subscribe(taskId, listener);
        let active = true;

        const interval = setInterval(async () => {
            if (!active) return;
            try {
                const stored = await this.LoadTaskForUser(taskId, contextUser, provider);
                if (stored && active) {
                    listener(stored);
                    if (TERMINAL_STATUSES.has(stored.status)) {
                        cleanup();
                    }
                }
            } catch {
                // Ignore transient polling errors
            }
        }, intervalMs);

        if (typeof interval.unref === 'function') {
            interval.unref();
        }

        const cleanup = () => {
            if (!active) return;
            active = false;
            clearInterval(interval);
            unsubscribeLocal();
        };

        return cleanup;
    }

    /** Aborts this replica's in-flight work on a task another replica finished or cancelled. */
    private stopLocalWork(taskId: string): void {
        const controller = this._abortControllers.Get(taskId);
        if (controller && !controller.signal.aborted) {
            controller.abort('Task finished on another replica');
        }
    }

    /** True for a row filed under the A2A task type, carrying A2A payloads, owned by `userId`. */
    private isCallersA2ARow(entity: MJTaskEntity, a2aTypeID: string | null, userId: string): boolean {
        if (!a2aTypeID || !entity.TypeID || !UUIDsEqual(entity.TypeID, a2aTypeID)) {
            return false;
        }
        if (!entity.UserID || !UUIDsEqual(entity.UserID, userId)) {
            return false;
        }
        return this.payloadProtocol(entity.InputPayload) === A2A_TASK_PROTOCOL;
    }

    private payloadProtocol(raw: string | null): string | null {
        if (!raw) return null;
        try {
            const parsed: unknown = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && 'protocol' in parsed && typeof parsed.protocol === 'string'
                ? parsed.protocol
                : null;
        } catch {
            return null;
        }
    }

    private initializeRow(entity: MJTaskEntity, task: Task, userId: string, typeID: string): void {
        entity.NewRecord();
        entity.ID = task.id;
        entity.Name = `A2A Task ${task.id}`;
        entity.UserID = userId;
        entity.StepType = 'External';
        entity.TypeID = typeID;
        entity.StartedAt = task.created;
    }

    private writeTaskToRow(entity: MJTaskEntity, task: Task): void {
        entity.Status = MapA2AStatusToMJTaskStatus(task.status);
        entity.PercentComplete = task.status === 'completed' ? 100 : task.status === 'in_progress' ? 50 : 0;
        if (TERMINAL_STATUSES.has(task.status) && !entity.CompletedAt) {
            entity.CompletedAt = task.updated;
        }
        const inputPayload: SerializedA2ATaskInputPayload = {
            protocol: A2A_TASK_PROTOCOL,
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
            protocol: A2A_TASK_PROTOCOL,
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
    }

    private hydrateTaskFromEntity(entity: MJTaskEntity): Task {
        const taskId = entity.ID;
        let created = entity.StartedAt ? new Date(entity.StartedAt) : new Date();
        let updated = entity.CompletedAt ? new Date(entity.CompletedAt) : new Date(created);
        let messages: Message[] = [];
        let artifacts: Artifact[] = [];

        if (entity.InputPayload) {
            try {
                const parsed = JSON.parse(entity.InputPayload) as Partial<SerializedA2ATaskInputPayload>;
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

    /**
     * The `A2A Task` type's ID, found by name — deterministically, the oldest when a database holds
     * duplicates. Never created here: it is seeded metadata, and a caller's request must not write it.
     * Not found means no A2A row can exist, and a save is refused.
     */
    private async a2aTaskTypeID(contextUser: UserInfo, md: IMetadataProvider): Promise<string | null> {
        if (!this._a2aTaskTypeID) {
            this._a2aTaskTypeID = await this.findA2ATaskTypeID(contextUser, md);
        }
        return this._a2aTaskTypeID;
    }

    private async findA2ATaskTypeID(contextUser: UserInfo, md: IMetadataProvider): Promise<string | null> {
        const rv = RunView.FromMetadataProvider(md);
        const res = await rv.RunView<Pick<MJTaskTypeEntity, 'ID'>>(
            {
                EntityName: 'MJ: Task Types',
                ExtraFilter: `Name='${EscapeSQLString(A2A_TASK_TYPE_NAME)}'`,
                Fields: ['ID'],
                OrderBy: '__mj_CreatedAt ASC, ID ASC',
                ResultType: 'simple',
                MaxRows: 2,
            },
            contextUser
        );
        if (!res.Success) {
            LogError(`DurableEntityA2ATaskStore: could not read task types: ${res.ErrorMessage}`);
            return null;
        }
        if (res.Results.length > 1) {
            LogError(`DurableEntityA2ATaskStore: more than one '${A2A_TASK_TYPE_NAME}' task type exists; binding the oldest (${res.Results[0].ID})`);
        }
        return res.Results[0]?.ID ?? null;
    }
}
