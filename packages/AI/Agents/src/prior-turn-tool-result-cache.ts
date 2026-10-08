import { BaseEntity, type BaseEntityEvent } from '@memberjunction/core';
import { ConversationEngine, MJConversationDetailEntity } from '@memberjunction/core-entities';
import { BaseSingleton, MJEventType, MJGlobal, MJLruCache, NormalizeUUID, type MJEvent } from '@memberjunction/global';
import { CarryForwardStepRecord } from './tool-result-format';

/** One cached projection, with the reply row of the run that stored it. */
interface PriorTurnEntry {
    readonly Steps: CarryForwardStepRecord[];
    /** The run's reply row (its `ConversationDetailID`); null when not known. */
    readonly SourceDetailID: string | null;
}

/**
 * Process-wide cache of the most recent settled root run's Tool-step results per
 * conversation + agent, keeping the prior-turn carry-forward check off the database on
 * the agent hot path.
 *
 * The completing run is the one source that already holds this data with zero I/O:
 * `BaseAgent.finalizeAgentRun` projects its in-memory `Steps` into
 * {@link CarryForwardStepRecord}s and stores them here — **including an empty array**
 * when the run made no tool calls, so tool-free conversations (the common case) skip
 * the lookup queries entirely on every subsequent turn. `loadPriorTurnToolResultSteps`
 * consults this cache first and only falls back to its RunView pair on a miss.
 *
 * Consistency contract — same row predicate as the DB path (single-sourced in
 * `BaseAgent.carryForwardPredicate` + `BaseAgent.settledRunStatuses`):
 * - Only runs that settle as Completed OR AwaitingFeedback (the normal chat-turn
 *   ending) are stored, so a failed run leaves the previous settled run's entry in
 *   place, just as the DB query would return it.
 * - Entries are keyed by conversation AND agent, mirroring the DB path's `AgentID`
 *   filter — in a multi-agent conversation, agent B must never inherit agent A's
 *   results labeled "your previous turn".
 * - Entries are also keyed by branch, mirroring the DB path's branch-path filter — a
 *   run never inherits results from a run whose reply row is off its path. A branch with
 *   no entry yet falls back to the DB path, which can return a trunk run from before the fork.
 * - Entries carry the reply row of the run that stored them. When a save on this server
 *   marks that row replaced (`ReplacedAt` set by an in-place rerun of its turn), the entry
 *   is no longer served, just as the DB path leaves out runs whose reply row is replaced:
 *   a replaced answer's tool results are never carried forward.
 * - Values are the raw completed-`Tool`-step `OutputData` projections; eligibility is
 *   still decided downstream by `BuildPriorTurnToolResultsMessage` via `toolFamily`,
 *   identical for cached and DB-loaded records.
 * - Two benign same-node edges where in-memory truth wins over what the DB fallback
 *   would return: a Tool step whose fire-and-forget INSERT failed is still published
 *   (the result genuinely existed; the DB would omit the lost row), and when two root
 *   runs of the same agent complete concurrently for one conversation the
 *   LAST-completed run's projection is kept here while the DB orders by creation time.
 *   Both only affect which optimization payload gets carried one turn forward.
 *
 * Multi-node tradeoff (accepted by design): when a conversation's next turn lands on a
 * different server than the one that completed the prior run, this node either misses
 * (falls back to the DB — exact) or, at worst, holds an entry one completed run stale
 * and injects the previous-but-one turn's results. Carry-forward is a contained
 * optimization (errors never break the run, injected messages expire after 2 turns),
 * the TTL bounds the staleness window, and each node self-heals on its next completed
 * run for that conversation — so the fallback keeps the default single-node deployment
 * exact while multi-node degrades gracefully rather than paying the queries every turn.
 * The replaced-row rule has the same limit: a replacement saved on another server is not
 * seen here, so this node can still serve that run's entry until it expires or is replaced.
 */
export class PriorTurnToolResultCache extends BaseSingleton<PriorTurnToolResultCache> {
    /**
     * Protected per the {@link BaseSingleton} contract — obtain via {@link Instance}. Listens for
     * entity saves on this server to learn which conversation details were replaced.
     */
    protected constructor() {
        super();
        MJGlobal.Instance.GetEventListener(false).subscribe(event => this.onGlobalEvent(event));
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
    private cache = new MJLruCache<string, PriorTurnEntry>({
        maxSize: 500,
        ttlMs: 30 * 60 * 1000
    });

    /** Normalized ids of conversation details replaced by an in-place rerun, seen on this server. */
    private replacedDetails = new MJLruCache<string, true>({ maxSize: 5000 });

    /** Key: conversation, agent and branch ('trunk' when none), so an entry serves only runs on the branch that stored it. */
    private static buildKey(conversationId: string, agentId: string, branchId: string | null): string {
        return `${NormalizeUUID(conversationId)}::${NormalizeUUID(agentId)}::${branchId ? NormalizeUUID(branchId) : 'trunk'}`;
    }

    /**
     * Returns the carry-forward records of this agent's most recent settled root run in
     * the conversation on this node, on one branch path (`branchId` null is the trunk) —
     * `[]` means "settled with no tool results" (a valid, query-skipping answer);
     * `undefined` means "not known here, ask the database". An entry whose run's reply row
     * was replaced is dropped and reads as `undefined`.
     */
    public Get(conversationId: string, agentId: string, branchId: string | null): CarryForwardStepRecord[] | undefined {
        const key = PriorTurnToolResultCache.buildKey(conversationId, agentId, branchId);
        const entry = this.cache.Get(key);
        if (!entry) {
            return undefined;
        }
        if (entry.SourceDetailID && this.replacedDetails.Has(NormalizeUUID(entry.SourceDetailID))) {
            this.cache.Delete(key);
            return undefined;
        }
        return entry.Steps;
    }

    /**
     * Records a settled root run's carry-forward projections (empty array included) for one branch path.
     * `sourceDetailId` is the run's reply row; the entry is not served once that row is replaced.
     */
    public Set(conversationId: string, agentId: string, branchId: string | null, steps: CarryForwardStepRecord[], sourceDetailId: string | null = null): void {
        this.cache.Set(PriorTurnToolResultCache.buildKey(conversationId, agentId, branchId), { Steps: steps, SourceDetailID: sourceDetailId });
    }

    /** Records that an in-place rerun replaced a conversation detail; entries whose run replied with it are no longer served. */
    public MarkDetailReplaced(detailId: string): void {
        this.replacedDetails.Set(NormalizeUUID(detailId), true);
    }

    /** Drops every entry and every replaced-detail mark — test isolation hook. */
    public Clear(): void {
        this.cache.Clear();
        this.replacedDetails.Clear();
    }

    /** Marks a conversation detail replaced when a save on this server leaves its `ReplacedAt` set. */
    private onGlobalEvent(event: MJEvent): void {
        if (event.event !== MJEventType.ComponentEvent || event.eventCode !== BaseEntity.BaseEventCode) {
            return;
        }
        const entityEvent: BaseEntityEvent | undefined = event.args;
        const detail = entityEvent?.baseEntity;
        if (entityEvent?.type === 'save' && detail instanceof MJConversationDetailEntity && ConversationEngine.IsReplacedRow(detail)) {
            this.MarkDetailReplaced(detail.ID);
        }
    }
}
