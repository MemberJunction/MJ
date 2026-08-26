/**
 * Overlaps a cursor-paged connector's NEXT page download with the CURRENT page's processing.
 *
 * ## Why
 *
 * The fetch loop is strictly serial: fetch a page, apply it, fetch the next. But the next cursor
 * is known the moment a page arrives, so the two legs need not be sequential — the shorter one can
 * hide under the longer. On a connector whose fetch dominates its apply (a ~6s fetch against a
 * ~1-2s apply is typical), overlapping them removes most of the shorter leg from the cycle.
 *
 * This is latency hiding, not concurrency: exactly one extra request is ever in flight, and it is
 * the request the loop was about to make anyway. Vendor pacing is unchanged because the prefetch
 * acquires the SAME rate token through the SAME limiter, and error semantics are unchanged because
 * the failure surfaces where the loop awaits it — one iteration earlier than it would have, at the
 * same point in the loop body.
 *
 * ## Why cursor mode only
 *
 * A cursor names the next page unambiguously, so "is the page in flight the page I now want?" has
 * an exact answer. Offset and page modes interact with the gap-skip resume logic — a persistent
 * fetch error advances past a page — so the position the loop will ask for next is not knowable at
 * the time a prefetch would have to start. Those modes stay serial.
 *
 * ## The claim check is the safety property
 *
 * The loop's cursor can move somewhere the prefetch did not anticipate (a gap skip, a reset, a
 * connector rewriting its own cursor). {@link Claim} therefore matches on the cursor the loop is
 * ACTUALLY about to use; a mismatch discards the in-flight page rather than serving it. Serving a
 * page for the wrong cursor would silently skip or duplicate records, which is the one failure this
 * class must make impossible.
 */

/** A page already being fetched, and the cursor it belongs to. */
interface InFlightPage<TBatch> {
    /** The cursor this page was requested with. `''` represents "no cursor" (first page). */
    Key: string;
    Promise: Promise<TBatch>;
}

export class PagePrefetcher<TBatch> {
    private inFlight: InFlightPage<TBatch> | null = null;

    /**
     * @param enabled false disables prefetching entirely — {@link Start} becomes a no-op and
     * {@link Claim} never matches, so the loop behaves exactly as it did before.
     */
    constructor(private readonly enabled: boolean) {}

    /** True while a page is downloading — for logging; the loop never branches on it. */
    public get HasPageInFlight(): boolean {
        return this.inFlight !== null;
    }

    /**
     * Hands back the in-flight page IF it is the page the loop now wants, and clears it either way.
     *
     * Returns null when nothing is in flight or when the cursor moved — in which case the caller
     * fetches normally. Clearing on a miss is deliberate: a page nobody will consume must not be
     * retained across iterations, where a later cursor could coincidentally match it.
     */
    public Claim(cursor: string | null | undefined): Promise<TBatch> | null {
        const page = this.inFlight;
        this.inFlight = null;
        if (!page || !this.enabled) return null;
        return page.Key === (cursor ?? '') ? page.Promise : null;
    }

    /**
     * Begins the next page when the batch just processed says there is one.
     *
     * `start` is invoked immediately — the point is that it runs while the caller processes the
     * current page — and its rejection is absorbed here so an in-flight failure can never become an
     * unhandled rejection. The error is not swallowed: the same promise is handed to the loop by
     * {@link Claim}, which awaits it and lets it throw into the loop's own error handling.
     */
    public Start(hasMore: boolean | undefined, nextCursor: string | null | undefined, start: () => Promise<TBatch>): void {
        if (!this.enabled || hasMore !== true || !nextCursor) return;
        const promise = start();
        promise.catch(() => { /* surfaced when Claim's caller awaits it */ });
        this.inFlight = { Key: nextCursor, Promise: promise };
    }

    /**
     * Drops any in-flight page without consuming it — for the loop's exit and error paths, where
     * continuing to hold a promise nobody will await keeps the request alive for no reason.
     */
    public Discard(): void {
        this.inFlight = null;
    }
}

/** Reads the kill switch. Prefetching is ON unless explicitly disabled. */
export function PrefetchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    return (env.MJ_INTEGRATION_PREFETCH ?? 'on').toLowerCase() !== 'off';
}
