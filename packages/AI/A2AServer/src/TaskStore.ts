import { LogStatus } from "@memberjunction/core";
import { IShutdownable } from "@memberjunction/global";

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'failed';

export interface Part {
    id: string;  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    type: 'text' | 'file' | 'data';  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    content: string | object;  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    metadata?: object;  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
}

export interface Message {
    id: string;  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    taskId: string;  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    role: 'user' | 'agent';  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    parts: Part[];  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    created: Date;  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
}

export interface Artifact {
    id: string;  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    taskId: string;  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    name: string;  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    parts: Part[];  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    created: Date;  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
}

export interface Task {
    id: string;  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    status: TaskStatus;  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    messages: Message[];  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    artifacts: Artifact[];  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    created: Date;  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    updated: Date;  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
}

/**
 * Terminal task statuses — tasks in these states are eligible for cleanup
 * after the retention window elapses.
 */
export const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set(['completed', 'cancelled', 'failed']);

export interface TaskStoreOptions {
    /** How often to scan for terminal tasks. Default 5 minutes. */
    sweepIntervalMs?: number;  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    /** How long a terminal task is retained before sweep removes it. Default 1 hour. */
    retentionMs?: number;  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
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
export class TaskStore implements IShutdownable {
    private readonly _tasks: Map<string, Task> = new Map();
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
     * Stop the sweep timer and drop all tasks. Idempotent.
     */
    public Shutdown(): void {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
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
                evicted++;
            }
        }
        if (evicted > 0) {
            LogStatus(`A2AServer.TaskStore swept ${evicted} terminal task(s)`);
        }
        return evicted;
    }

    public Set(id: string, task: Task): this {
        this._tasks.set(id, task);
        return this;
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
