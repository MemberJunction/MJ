/**
 * @fileoverview Reranker budget guard (P2D.6).
 *
 * Per-search-invocation circuit breaker that caps real-provider reranker spend
 * (Cohere, Voyage, OpenAI) against `SearchScope.RerankerBudgetCents`. Wired into
 * the SearchEngine's rerank stage so:
 *
 *   1. Before each rerank call, the engine asks the guard whether `EstimateCostCents`
 *      fits in the remaining budget. If not, the engine SKIPS the rerank and uses
 *      the unranked candidate list.
 *   2. After each rerank call, the reranker's `CostReporter` callback (P2D.1
 *      contract) lands in `record()`, accumulating actual spend.
 *
 * NULL budget = uncapped; the guard always returns `canSpend = true` and accumulates
 * spend purely for observability. This preserves Phase 1 behavior for any scope the
 * admin hasn't explicitly capped.
 *
 * @module @memberjunction/search-engine
 */

/**
 * Per-run budget tracker. One instance per search invocation; lives only as long
 * as the SearchEngine.search call. Not thread-safe, but Node is single-threaded
 * within a request so that's fine.
 */
export class RerankerBudgetGuard {
    /** Total budget in cents, or null when uncapped. */
    public readonly Budget: number | null;
    /** Accumulated cost in cents, populated via record(). */
    public Spent = 0;

    constructor(budgetCents: number | null | undefined) {
        this.Budget = budgetCents == null ? null : Math.max(0, budgetCents);
    }

    /**
     * Cents remaining in the budget. Returns null when uncapped, else
     * `max(0, Budget - Spent)`.
     */
    public Remaining(): number | null {
        return this.Budget == null ? null : Math.max(0, this.Budget - this.Spent);
    }

    /**
     * Pre-call check: does `estimatedCents` fit in the remaining budget? Returns
     * true when uncapped or when remaining ≥ estimate.
     *
     * Negative estimates are treated as zero (defensive — a buggy
     * `EstimateCostCents` shouldn't trigger short-circuits prematurely).
     */
    public CanSpend(estimatedCents: number): boolean {
        if (this.Budget == null) return true;
        const need = Math.max(0, estimatedCents);
        return this.Remaining()! >= need;
    }

    /**
     * Post-call accumulator. Negative or non-finite values are clamped to 0.
     */
    public Record(actualCents: number): void {
        if (!Number.isFinite(actualCents) || actualCents <= 0) return;
        this.Spent += actualCents;
    }

    /**
     * Sugar for wiring into a reranker. Returns a closure that records cost on
     * this guard — assignable directly to `BaseReRanker.CostReporter`.
     */
    public AsCostReporter(): (cents: number) => void {
        return (cents) => this.Record(cents);
    }
}
