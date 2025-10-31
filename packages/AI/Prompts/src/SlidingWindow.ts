/**
 * Sliding window counter for rate limiting
 *
 * Tracks counts over a rolling time window, automatically expiring entries
 * that fall outside the window. Used for implementing TPM (tokens per minute)
 * and RPM (requests per minute) rate limiting.
 *
 * @example
 * ```typescript
 * // Create 60-second window for tracking tokens
 * const window = new SlidingWindow(60000);
 *
 * // Add token usage
 * window.add(Date.now(), 1000);
 *
 * // Check current usage
 * const tokensUsed = window.getCount(Date.now()); // 1000
 *
 * // After 61 seconds, usage automatically expires
 * const laterCount = window.getCount(Date.now() + 61000); // 0
 * ```
 */
export class SlidingWindow {
    /**
     * Window duration in milliseconds
     */
    private windowMS: number;

    /**
     * Entries within the window
     * Sorted by timestamp (oldest first)
     */
    private entries: Array<{ timestamp: number; count: number }> = [];

    /**
     * Creates a sliding window counter
     *
     * @param windowMS - Window duration in milliseconds (e.g., 60000 for 1 minute)
     */
    constructor(windowMS: number) {
        if (windowMS <= 0) {
            throw new Error('Window duration must be positive');
        }
        this.windowMS = windowMS;
    }

    /**
     * Add a count to the window at a specific timestamp
     *
     * @param timestamp - Unix timestamp in milliseconds
     * @param count - Count to add (e.g., token count, request count)
     */
    public add(timestamp: number, count: number): void {
        if (count < 0) {
            throw new Error('Count must be non-negative');
        }
        if (count === 0) {
            return; // No-op for zero counts
        }

        this.entries.push({ timestamp, count });
        this.prune(timestamp);
    }

    /**
     * Get total count within the window
     *
     * @param now - Current timestamp in milliseconds
     * @returns Sum of all counts within the window
     */
    public getCount(now: number): number {
        this.prune(now);
        return this.entries.reduce((sum, entry) => sum + entry.count, 0);
    }

    /**
     * Get number of entries in the window
     *
     * @param now - Current timestamp in milliseconds
     * @returns Number of entries within the window
     */
    public getEntryCount(now: number): number {
        this.prune(now);
        return this.entries.length;
    }

    /**
     * Remove entries that have fallen outside the window
     *
     * @param now - Current timestamp in milliseconds
     * @private
     */
    private prune(now: number): void {
        const cutoff = now - this.windowMS;

        // Remove all entries with timestamp <= cutoff
        // Since entries are sorted by timestamp, we can find the first valid entry
        let firstValidIndex = 0;
        while (firstValidIndex < this.entries.length && this.entries[firstValidIndex].timestamp <= cutoff) {
            firstValidIndex++;
        }

        if (firstValidIndex > 0) {
            this.entries.splice(0, firstValidIndex);
        }
    }

    /**
     * Clear all entries from the window
     *
     * Useful for testing or resetting state
     */
    public clear(): void {
        this.entries = [];
    }

    /**
     * Get the window duration
     *
     * @returns Window duration in milliseconds
     */
    public getWindowDuration(): number {
        return this.windowMS;
    }

    /**
     * Get the oldest entry timestamp in the window
     *
     * @param now - Current timestamp in milliseconds
     * @returns Oldest entry timestamp, or null if window is empty
     */
    public getOldestTimestamp(now: number): number | null {
        this.prune(now);
        return this.entries.length > 0 ? this.entries[0].timestamp : null;
    }

    /**
     * Get the newest entry timestamp in the window
     *
     * @param now - Current timestamp in milliseconds
     * @returns Newest entry timestamp, or null if window is empty
     */
    public getNewestTimestamp(now: number): number | null {
        this.prune(now);
        return this.entries.length > 0 ? this.entries[this.entries.length - 1].timestamp : null;
    }

    /**
     * Check if window is empty
     *
     * @param now - Current timestamp in milliseconds
     * @returns True if no entries in window
     */
    public isEmpty(now: number): boolean {
        this.prune(now);
        return this.entries.length === 0;
    }

    /**
     * Get statistics about the window
     *
     * @param now - Current timestamp in milliseconds
     * @returns Window statistics
     */
    public getStatistics(now: number): SlidingWindowStatistics {
        this.prune(now);

        if (this.entries.length === 0) {
            return {
                totalCount: 0,
                entryCount: 0,
                oldestTimestamp: null,
                newestTimestamp: null,
                windowDurationMS: this.windowMS,
                averageCountPerEntry: 0
            };
        }

        const totalCount = this.entries.reduce((sum, entry) => sum + entry.count, 0);

        return {
            totalCount,
            entryCount: this.entries.length,
            oldestTimestamp: this.entries[0].timestamp,
            newestTimestamp: this.entries[this.entries.length - 1].timestamp,
            windowDurationMS: this.windowMS,
            averageCountPerEntry: totalCount / this.entries.length
        };
    }
}

/**
 * Statistics about a sliding window
 */
export interface SlidingWindowStatistics {
    /**
     * Total count across all entries in window
     */
    totalCount: number;

    /**
     * Number of entries in window
     */
    entryCount: number;

    /**
     * Oldest entry timestamp (null if empty)
     */
    oldestTimestamp: number | null;

    /**
     * Newest entry timestamp (null if empty)
     */
    newestTimestamp: number | null;

    /**
     * Window duration in milliseconds
     */
    windowDurationMS: number;

    /**
     * Average count per entry
     */
    averageCountPerEntry: number;
}
