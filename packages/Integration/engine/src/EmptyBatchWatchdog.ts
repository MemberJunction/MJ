/**
 * P3-D refinement: decides when a run of empty batches is WORTH WARNING ABOUT.
 *
 * A connector returning empty pages with HasMore=true forever would spin silently to the
 * per-map batch cap; the original watchdog warned after N consecutive empties. But "empty"
 * alone is the wrong signal: a per-item fan-out connector (one upstream call per parent
 * record) legitimately returns long runs of empty batches while its position walks forward
 * over sparse data. Counting those trained operators to ignore the warning — right up until
 * a real stuck cursor arrived wearing the same message.
 *
 * A stuck cursor, by definition, leaves the position where it was. So the streak only counts
 * empties whose position tuple (watermark, afterKey, page, offset, cursor) did not move.
 */
export class EmptyBatchWatchdog {
    private streak = 0;
    private lastEmptyPosition: string | null = null;

    /**
     * Observe one fetched batch. Returns the current stuck-empty streak length — the caller
     * warns when it crosses its threshold. Movement (records, no-more, or an advanced
     * position) resets the streak.
     */
    public Observe(recordCount: number, hasMore: boolean, position: ReadonlyArray<unknown>): number {
        if (recordCount !== 0 || hasMore !== true) {
            this.streak = 0;
            this.lastEmptyPosition = null;
            return 0;
        }
        const key = position.map(v => (v === undefined || v === null ? '' : String(v))).join('|');
        if (key === this.lastEmptyPosition) {
            this.streak++;
        } else {
            this.streak = 1;
            this.lastEmptyPosition = key;
        }
        return this.streak;
    }
}
