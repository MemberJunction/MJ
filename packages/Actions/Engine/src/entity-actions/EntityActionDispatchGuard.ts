/**
 * @fileoverview Re-entrancy and burst control for automatically-dispatched entity actions.
 *
 * **The problem.** An entity action that runs on `AfterUpdate` and writes back to the record that
 * triggered it re-fires itself, forever. This is not an exotic case — it is the *normal* shape of
 * every enrich-and-write-back automation: "when a ticket changes, summarize it and store the
 * summary" saves the ticket. The same is true of a workflow bound to an entity-change trigger whose
 * graph touches the record it was started by.
 *
 * A second, quieter problem shares the same key: a record saved ten times in a second launches ten
 * overlapping runs of the same after-save action, each reading a state the next one invalidates.
 *
 * **The mechanism.** Every automatic dispatch is keyed by
 * `(entity action, entity, record)` — the identity that both problems are about.
 *
 * - **Self-trigger → suppress.** A dispatch that arrives while its own key is on the origin stack
 *   is the action re-entering itself, and is dropped. Deferring it instead would turn an infinite
 *   loop into an infinite *sequence*, which is no better.
 * - **Overlap → coalesce, latest wins.** A dispatch for a key that is merely in flight (not on the
 *   origin stack — so it came from somewhere else) does not stack. It sets a rerun flag, and one
 *   more run happens after the current one finishes. A burst of saves collapses to at most one
 *   pending run, and that run sees the final state rather than a stale one.
 *
 * Origin tracking uses `AsyncLocalStorage`, so it propagates through every `await` inside an
 * action — including an agent run, its sub-agents, and any action they invoke — without a single
 * call site having to pass anything down.
 *
 * **Known limit: a durable hop escapes the ambient context.** When work detaches to another process
 * or a later moment (a task graph handed to the dispatcher, a queued job), the origin stack does not
 * travel with it, so a write-back from there is indistinguishable from a user's edit. For those
 * paths the origin must be declared explicitly — `EntitySaveOptions.OriginatingEntityActionIDs`
 * exists for exactly that, and carries the same meaning.
 *
 * @module @memberjunction/actions
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { BaseSingleton } from '@memberjunction/global';
import { LogStatus } from '@memberjunction/core';

/** What the guard decided to do with a dispatch. */
export type EntityActionDispatchOutcome =
    /** It ran (possibly followed by coalesced reruns). */
    | 'Ran'
    /** The action was re-entering itself on the same record; dropped. */
    | 'Suppressed'
    /** A run for this key was already in flight; folded into one pending rerun. */
    | 'Coalesced';

/**
 * The identity a dispatch is guarded by. Record-level rather than entity-level on purpose: two
 * different invoices changing at once are unrelated events and must not block each other.
 */
export function BuildEntityActionDispatchKey(entityActionID: string, entityID: string, recordKey: string): string {
    return `${entityActionID}|${entityID}|${recordKey}`.toLowerCase();
}

/** Bookkeeping for one key with a run in flight. */
type InFlightEntry = {
    /** A dispatch arrived while this one was running; run once more when it finishes. */
    RerunPending: boolean;
    /** The most recent arrival's work — latest wins, so an earlier pending run is discarded. */
    LatestRun: (() => Promise<unknown>) | null;
    /** How many reruns this slot has already drained, for the runaway warning. */
    RerunCount: number;
};

/** Reruns after which a sustained rerun chain is worth a log line. Not a cap — see `drain`. */
const RERUN_WARN_THRESHOLD = 10;

/**
 * Guards automatic entity-action dispatch against self-triggering and save bursts.
 *
 * Process-scoped. Two servers behind a load balancer each hold their own view, which is correct for
 * the burst case (each coalesces its own traffic) and is the reason the durable case needs the
 * explicit marker rather than this.
 */
export class EntityActionDispatchGuard extends BaseSingleton<EntityActionDispatchGuard> {
    public static get Instance(): EntityActionDispatchGuard {
        return super.getInstance<EntityActionDispatchGuard>();
    }

    /**
     * The set of dispatch keys currently executing *above* this point in the async call tree.
     * A set rather than a single value because actions legitimately chain: A on record 1 may save
     * record 2 and fire B, and B must still be able to detect re-entry into A.
     */
    private originStack = new AsyncLocalStorage<ReadonlySet<string>>();

    private inFlight = new Map<string, InFlightEntry>();

    /** True when this key is already executing somewhere up the current async call tree. */
    public IsSelfTriggered(key: string): boolean {
        return this.originStack.getStore()?.has(key) ?? false;
    }

    /** True when a run for this key is executing anywhere in this process. */
    public IsInFlight(key: string): boolean {
        return this.inFlight.has(key);
    }

    /**
     * Run an automatic entity-action dispatch under the guard.
     *
     * @param key from {@link BuildEntityActionDispatchKey}
     * @param run the dispatch itself; invoked at most once per call, possibly later than the call
     * @returns what the guard decided. `'Ran'` resolves only after the run and any coalesced
     *          reruns have finished, so a caller that awaits it awaits the whole settled chain.
     */
    public async Dispatch(key: string, run: () => Promise<unknown>): Promise<EntityActionDispatchOutcome> {
        if (this.IsSelfTriggered(key)) {
            // The action wrote back to the record that triggered it. Dropping the dispatch is the
            // only outcome that terminates; queuing it would just move the loop.
            return 'Suppressed';
        }

        const existing = this.inFlight.get(key);
        if (existing) {
            // Latest wins: whatever was pending is replaced, because the newer dispatch reflects a
            // newer state of the record and running both would only re-read the same final row.
            existing.RerunPending = true;
            existing.LatestRun = run;
            return 'Coalesced';
        }

        const entry: InFlightEntry = { RerunPending: false, LatestRun: null, RerunCount: 0 };
        this.inFlight.set(key, entry);
        try {
            await this.runWithOrigin(key, run);
            await this.drain(key, entry);
        } finally {
            // Released only here — arrivals during the drain coalesce onto this same slot, which is
            // what keeps a burst collapsed instead of alternating run/queue/run.
            this.inFlight.delete(key);
        }
        return 'Ran';
    }

    /** Run `fn` with `key` pushed onto the ambient origin stack. */
    private runWithOrigin<T>(key: string, fn: () => Promise<T>): Promise<T> {
        const parent = this.originStack.getStore();
        const scope = new Set(parent ?? []);
        scope.add(key);
        return this.originStack.run(scope, fn);
    }

    /**
     * Run whatever queued up while the slot was busy, until nothing is left.
     *
     * Deliberately uncapped: each iteration means real dispatches arrived while the previous run was
     * executing, so stopping early would silently drop work. It terminates because arrivals stop —
     * and the case that would *not* terminate, an action re-triggering itself, never reaches here
     * (it is suppressed above). The threshold log exists so a chain that does run away is visible.
     */
    private async drain(key: string, entry: InFlightEntry): Promise<void> {
        while (entry.RerunPending) {
            entry.RerunPending = false;
            const next = entry.LatestRun;
            entry.LatestRun = null;
            if (!next) {
                break;
            }
            entry.RerunCount++;
            if (entry.RerunCount === RERUN_WARN_THRESHOLD) {
                LogStatus(
                    `[EntityActionDispatchGuard] ${RERUN_WARN_THRESHOLD} coalesced reruns for ${key} — ` +
                    `the record is being saved faster than its after-save action completes.`
                );
            }
            await this.runWithOrigin(key, next);
        }
    }

    /** Drops all in-flight bookkeeping. For tests — never call this from application code. */
    public ResetForTesting(): void {
        this.inFlight.clear();
    }
}
