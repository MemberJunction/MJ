import { BaseSingleton, MJLruCache, NormalizeUUID } from '@memberjunction/global';
import { CarryForwardStepRecord } from './tool-result-format';

/**
 * Process-wide cache of the most recent completed root run's Tool-step results per
 * conversation, keeping the prior-turn carry-forward check off the database on the
 * agent hot path.
 *
 * The completing run is the one source that already holds this data with zero I/O:
 * `BaseAgent.finalizeAgentRun` projects its in-memory `Steps` into
 * {@link CarryForwardStepRecord}s and stores them here — **including an empty array**
 * when the run made no tool calls, so tool-free conversations (the common case) skip
 * the lookup queries entirely on every subsequent turn. `loadPriorTurnToolResultSteps`
 * consults this cache first and only falls back to its RunView pair on a miss.
 *
 * Consistency contract — same row predicate as the DB path (single-sourced in
 * `BaseAgent.carryForwardPredicate`):
 * - Only runs that finalize with `Status='Completed'` are stored, so a failed or
 *   feedback-awaiting run leaves the previous completed run's entry in place, just as
 *   the DB query would return it.
 * - Values are the raw completed-`Tool`-step `OutputData` projections; eligibility is
 *   still decided downstream by `BuildPriorTurnToolResultsMessage` via `toolFamily`,
 *   identical for cached and DB-loaded records.
 * - Two benign same-node edges where in-memory truth wins over what the DB fallback
 *   would return: a Tool step whose fire-and-forget INSERT failed is still published
 *   (the result genuinely existed; the DB would omit the lost row), and when two root
 *   runs complete concurrently for one conversation the LAST-completed run's projection
 *   is kept here while the DB orders by creation time. Both only affect which
 *   optimization payload gets carried one turn forward.
 *
 * Multi-node tradeoff (accepted by design): when a conversation's next turn lands on a
 * different server than the one that completed the prior run, this node either misses
 * (falls back to the DB — exact) or, at worst, holds an entry one completed run stale
 * and injects the previous-but-one turn's results. Carry-forward is a contained
 * optimization (errors never break the run, injected messages expire after 2 turns),
 * the TTL bounds the staleness window, and each node self-heals on its next completed
 * run for that conversation — so the fallback keeps the default single-node deployment
 * exact while multi-node degrades gracefully rather than paying the queries every turn.
 */
export class PriorTurnToolResultCache extends BaseSingleton<PriorTurnToolResultCache> {
    /** Protected per the {@link BaseSingleton} contract — obtain via {@link Instance}. */
    protected constructor() {
        super();
    }

    /** Process-wide singleton accessor (Global Object Store backed, bundler-duplication safe). */
    public static get Instance(): PriorTurnToolResultCache {
        return super.getInstance<PriorTurnToolResultCache>();
    }

    /**
     * Bounded + TTL'd so long-lived servers can't accumulate unbounded per-conversation
     * state: 500 concurrently-active conversations is generous for one node, and 30
     * minutes comfortably covers the inter-turn gap of a live conversation while
     * bounding the multi-node staleness window described above.
     */
    private cache = new MJLruCache<string, CarryForwardStepRecord[]>({
        maxSize: 500,
        ttlMs: 30 * 60 * 1000
    });

    /**
     * Returns the carry-forward records of the conversation's most recent completed
     * root run on this node — `[]` means "completed with no tool results" (a valid,
     * query-skipping answer); `undefined` means "not known here, ask the database".
     */
    public Get(conversationId: string): CarryForwardStepRecord[] | undefined {
        return this.cache.Get(NormalizeUUID(conversationId));
    }

    /** Records a completed root run's carry-forward projections (empty array included). */
    public Set(conversationId: string, steps: CarryForwardStepRecord[]): void {
        this.cache.Set(NormalizeUUID(conversationId), steps);
    }

    /** Drops every entry — test isolation hook. */
    public Clear(): void {
        this.cache.Clear();
    }
}
