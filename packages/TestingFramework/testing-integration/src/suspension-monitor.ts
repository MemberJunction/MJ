/**
 * Detects intervals during which this process's event loop did not run at all — the process was
 * frozen by host sleep (a laptop idling to sleep mid-run) or SIGSTOP, or a synchronous call blocked
 * the loop.
 *
 * Why the integration driver needs it: the per-check budget is a `setTimeout`, and on macOS libuv's
 * clock keeps counting while the machine sleeps. A check that is in flight when the host sleeps
 * therefore "exceeds the remaining run budget" the instant the host wakes, and used to be reported
 * as a hung check, although nothing in the check, the library or the database was stuck. With the
 * stall measured, the failure names the real cause instead.
 *
 * Mechanism: a ticker fires every `TickMs`; when the wall-clock gap since the previous tick exceeds
 * `TickMs + ThresholdMs`, the excess counts as stalled time. The ticker is `unref`'d, so it never
 * keeps a process alive on its own.
 */
export class SuspensionMonitor {
    /** Tick interval of the ticker. */
    public readonly TickMs: number;
    /** Lateness a tick may show before it counts as a stall (normal event-loop jitter stays below it). */
    public readonly ThresholdMs: number;

    private readonly now: () => number;
    private timer: ReturnType<typeof setInterval> | undefined;
    private lastTick = 0;
    private stalledMs = 0;
    private longestStallMs = 0;

    constructor(tickMs: number = 1000, thresholdMs: number = 5000, now: () => number = Date.now) {
        this.TickMs = tickMs;
        this.ThresholdMs = thresholdMs;
        this.now = now;
    }

    /** Start measuring (resets the totals). Calling it while running restarts the measurement. */
    public Start(): void {
        this.Stop();
        this.stalledMs = 0;
        this.longestStallMs = 0;
        this.lastTick = this.now();
        this.timer = setInterval(() => this.Sample(), this.TickMs);
        this.timer.unref?.();
    }

    /** Stop the ticker after taking a final sample, so a stall that just ended is counted. */
    public Stop(): void {
        if (this.timer !== undefined) {
            this.Sample();
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    /**
     * Measure the gap since the previous sample. The ticker calls this; callers may call it to
     * account for a stall that ended after the last tick (a timer that fired on wake runs before
     * the ticker's own overdue tick).
     */
    public Sample(): void {
        const t = this.now();
        const late = t - this.lastTick - this.TickMs;
        if (late > this.ThresholdMs) {
            this.stalledMs += late;
            this.longestStallMs = Math.max(this.longestStallMs, late);
        }
        this.lastTick = t;
    }

    /** Total milliseconds the event loop was stalled since {@link Start}. */
    public get StalledMs(): number {
        return this.stalledMs;
    }

    /** The single longest stall since {@link Start}, in milliseconds. */
    public get LongestStallMs(): number {
        return this.longestStallMs;
    }
}
