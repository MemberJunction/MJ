/**
 * @fileoverview Entity-agnostic per-key serial task queue. The lowest-layer primitive behind the
 * fire-and-forget save pattern: tasks enqueued under the same key run strictly in order (the next
 * cannot start until the prior settles), tasks under different keys run concurrently, and failures
 * are captured for a later `flush()` rather than propagated outward. MJGlobal cannot reference
 * `BaseEntity`, so this knows nothing about entities — see `BaseEntitySaveQueue` for the entity façade.
 *
 * Self-bounding: only *in-flight* tasks are retained (they drop out as they settle), and failures are
 * tallied into counters — so a long-lived queue that never flushes does not grow without bound.
 * @module @memberjunction/global
 */

/** Aggregate outcome of a {@link KeyedSerialTaskQueue.flush}. */
export interface SerialTaskFlushResult {
    /** Tasks that rejected (threw) OR resolved a falsy "not ok" value, since the last flush. */
    failures: number;
    /** Tasks that rejected (threw), since the last flush. */
    rejections: number;
}

/**
 * A per-key serial task chain. Tasks for the **same key** (compared by object identity) run one at a
 * time in enqueue order; tasks for **different keys** run concurrently. Enqueuing is fire-and-forget —
 * the returned promise never rejects, and failures are tallied for {@link flush}.
 *
 * This is what makes "mutate after the prior task lands" structural: a task enqueued after another on
 * the same key physically cannot begin until the prior one resolves.
 */
export class KeyedSerialTaskQueue {
    /** Latest tail promise per key (object identity) — never rejects, so the chain can't break. */
    private tails = new WeakMap<object, Promise<void>>();
    /** Currently-running tasks (each removes itself on settle), for `flush()` to await. */
    private inFlight = new Set<Promise<void>>();
    /** Failures/rejections since the last flush (counters, not a growing list — keeps memory bounded). */
    private failures = 0;
    private rejections = 0;
    private readonly onError?: (err: unknown, label?: string) => void;

    constructor(opts?: { onError?: (err: unknown, label?: string) => void }) {
        this.onError = opts?.onError;
    }

    /**
     * Enqueues `task` to run after all prior tasks for `key` have settled. Fire-and-forget: returns
     * the task's result promise, but the caller need not await it — it resolves to the task's value on
     * success or `undefined` on failure, and **never rejects**. Failures (a thrown error, or a resolved
     * value `opts.isOk` deems falsy) are counted for {@link flush} and routed to `onError`.
     *
     * @param key Serialization key (object identity). Same key → serialized; different keys → concurrent.
     * @param task The work to run.
     * @param opts.label Diagnostic label passed to `onError`.
     * @param opts.isOk Treats a resolved value as a failure when it returns false (e.g. `Save()` → `false`).
     * @param opts.after Optional dependency key — the task waits for this key's latest task to settle
     *   before running, in addition to waiting for its own key's prior tasks. Use this to honour
     *   cross-instance ordering constraints like self-referencing foreign keys (e.g. a child step's
     *   INSERT must land after its parent step's INSERT).
     */
    public enqueue<T>(key: object, task: () => Promise<T>, opts?: { label?: string; isOk?: (v: T) => boolean; after?: object }): Promise<T | undefined> {
        const prior = this.tails.get(key) ?? Promise.resolve();
        const dependency = opts?.after ? (this.tails.get(opts.after) ?? Promise.resolve()) : Promise.resolve();

        // Run the task exactly once, after `prior` AND `dependency` settle, collapsing to a never-rejecting outcome.
        const gate = Promise.all([prior, dependency]);
        const settled = gate.then(() => task(), () => task()).then(
            (value) => ({ value: value as T | undefined, ok: opts?.isOk ? !!opts.isOk(value) : true, rejected: false, err: undefined as unknown }),
            (err: unknown) => ({ value: undefined as T | undefined, ok: false, rejected: true, err }),
        );

        // Never-rejecting tail: tally failures + route to onError. Serves as the per-key chain link.
        const tail: Promise<void> = settled.then((o) => {
            if (!o.ok) {
                this.failures++;
                if (o.rejected) {
                    this.rejections++;
                }
                const err = o.rejected ? o.err : new Error(`task resolved not-ok${opts?.label ? `: ${opts.label}` : ''}`);
                this.onError?.(err, opts?.label);
            }
        });
        this.tails.set(key, tail);

        // Track only while in flight — self-remove on settle so the set stays bounded by concurrency.
        let tracked!: Promise<void>;
        tracked = tail.finally(() => this.inFlight.delete(tracked));
        this.inFlight.add(tracked);

        return settled.then((o) => (o.ok ? o.value : undefined));
    }

    /**
     * Awaits the currently in-flight tasks, then reports and resets the failure tally accumulated since
     * the last flush. Tasks enqueued after this call begins are not awaited here.
     */
    public async flush(): Promise<SerialTaskFlushResult> {
        await Promise.all([...this.inFlight]);
        const result: SerialTaskFlushResult = { failures: this.failures, rejections: this.rejections };
        this.failures = 0;
        this.rejections = 0;
        return result;
    }
}
