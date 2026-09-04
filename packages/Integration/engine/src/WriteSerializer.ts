/**
 * Orders the engine's writes against one provider.
 *
 * The provider holds a SINGLE transaction bound to a single connection, so any write issued while
 * that transaction is open joins it. That is why every engine write was funnelled through one
 * provider-wide chain: it made it impossible for a batch's transaction to swallow an unrelated
 * entity map's watermark save.
 *
 * The cost was that writes belonging to DIFFERENT entity maps also queued behind each other, even
 * when no transaction was involved at all — which is the common case once a connection uses batched
 * writes, since those carry their own TransactionGroup and never open the provider's.
 *
 * So this is a two-mode lock rather than a single queue:
 *
 *   - {@link RunExclusive} is for work that opens the provider transaction. Nothing else writes
 *     while it runs, and it waits for everything already in flight.
 *   - {@link RunKeyed} is for work scoped to one entity map that opens no transaction. Different
 *     keys overlap; the SAME key stays ordered, so one map never races its own writes.
 *
 * DEADLOCK SAFETY: each call waits only on work that existed BEFORE it. An exclusive section
 * snapshots the in-flight keyed work at call time; a keyed call captures the barrier at call time.
 * Neither ever waits on something created after it, so the wait graph cannot contain a cycle.
 *
 * A rejected operation never breaks ordering for anyone else: every chain continues past failures,
 * so one errored batch cannot deadlock later writers.
 */
export class WriteSerializer {
    /** Resolves when the most recently queued exclusive section has finished. */
    private barrier: Promise<unknown> = Promise.resolve();
    /** Tail of in-flight work per key, so same-key calls stay ordered. */
    private readonly keyed = new Map<string, Promise<unknown>>();
    /** Keyed work not yet settled — what an exclusive section must wait out. */
    private readonly active = new Set<Promise<unknown>>();

    /** Runs `fn` with no other write in flight against this provider. */
    public RunExclusive<T>(fn: () => Promise<T>): Promise<T> {
        // Snapshot: everything queued before this call. Work queued AFTER waits on our barrier
        // instead, which is what keeps the wait graph acyclic.
        const gate = Promise.allSettled([this.barrier, ...this.active]);
        const run = gate.then(() => fn());
        this.barrier = run.then(() => undefined, () => undefined);
        return run;
    }

    /**
     * Runs `fn` ordered against other work for the same `key`, concurrently with other keys, and
     * never overlapping an exclusive section queued before it.
     */
    public RunKeyed<T>(key: string, fn: () => Promise<T>): Promise<T> {
        const priorSameKey = this.keyed.get(key) ?? Promise.resolve();
        const gate = Promise.allSettled([this.barrier, priorSameKey]);
        const run = gate.then(() => fn());
        const settled = run.then(() => undefined, () => undefined);
        this.keyed.set(key, settled);
        this.active.add(settled);
        void settled.then(() => {
            this.active.delete(settled);
            // Drop the key only if nothing newer claimed it, so a long run over many entity maps
            // does not grow this map without bound.
            if (this.keyed.get(key) === settled) this.keyed.delete(key);
        });
        return run;
    }

    /** Keys currently tracked — for tests and diagnostics only. */
    public get TrackedKeyCount(): number {
        return this.keyed.size;
    }
}
