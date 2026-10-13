/**
 * @fileoverview The time budget and cancellation of one entry-time duplicate check,
 * {@link DuplicateRecordDetector.CheckRecordValues}.
 *
 * @module @memberjunction/ai-vector-dupe
 */

/** Why an entry-time check stopped before it finished. */
export type EntryCheckStopReason = 'TimedOut' | 'Cancelled';

/**
 * Thrown inside an entry-time check when its budget runs out or its caller cancels it.
 * `CheckRecordValues` turns it into a `Failed` result; it never reaches the caller.
 */
export class EntryCheckStoppedError extends Error {
    /** Why the check stopped. */
    public readonly Reason: EntryCheckStopReason;

    /**
     * @param reason why the check stopped
     * @param step the step that was running or about to start, for the message
     * @param budgetMS the check's budget, for the message
     */
    constructor(reason: EntryCheckStopReason, step: string, budgetMS: number) {
        super(reason === 'TimedOut'
            ? `The duplicate entry check ran out of its ${budgetMS} ms budget while ${step}`
            : `The duplicate entry check was cancelled while ${step}`);
        this.name = 'EntryCheckStoppedError';
        this.Reason = reason;
    }
}

/**
 * One entry-time check's deadline: an `AbortSignal` that aborts when the budget runs out or when
 * the caller's own signal aborts, whichever comes first.
 *
 * Each step of the check runs through {@link Run}, which refuses to start a step once the check
 * has stopped, and stops waiting for a running step the moment it does. The decision call also
 * receives {@link Signal} and {@link RemainingMS}, so the model call itself is aborted. The
 * embedding, vector-query and RunView APIs take no signal, so a step already running there
 * finishes in the background, but nothing after it starts.
 *
 * Call {@link Dispose} when the check ends, to clear the timer.
 */
export class EntryCheckDeadline {
    private readonly controller = new AbortController();
    private readonly startedAt = Date.now();
    private readonly timer: ReturnType<typeof setTimeout>;
    private stopReason: EntryCheckStopReason | null = null;
    private readonly onCallerAbort = (): void => this.stop('Cancelled');

    /**
     * @param BudgetMS the most time the check may take, in milliseconds
     * @param callerSignal the caller's cancellation; the check stops when it aborts
     */
    constructor(public readonly BudgetMS: number, private readonly callerSignal?: AbortSignal) {
        this.timer = setTimeout(() => this.stop('TimedOut'), BudgetMS);
        if (callerSignal?.aborted) {
            this.stop('Cancelled');
        } else {
            callerSignal?.addEventListener('abort', this.onCallerAbort, { once: true });
        }
    }

    /** Aborts when the check must stop. Pass it to any call that accepts a cancellation token. */
    public get Signal(): AbortSignal {
        return this.controller.signal;
    }

    /** The budget still left, in milliseconds; at least 1, so a bound built from it is never "no bound". */
    public get RemainingMS(): number {
        return Math.max(1, this.BudgetMS - (Date.now() - this.startedAt));
    }

    /**
     * Throws {@link EntryCheckStoppedError} when the check must stop: it was cancelled, or its
     * budget is spent (even when the timer has not fired yet).
     *
     * @param step what the check is about to do, for the message
     */
    public ThrowIfStopped(step: string): void {
        if (!this.stopReason && Date.now() - this.startedAt >= this.BudgetMS) {
            this.stop('TimedOut');
        }
        if (this.stopReason) {
            throw new EntryCheckStoppedError(this.stopReason, step, this.BudgetMS);
        }
    }

    /**
     * Runs one step of the check. It does not start once the check has stopped, and the check
     * stops waiting for it the moment the check must stop.
     *
     * @param step what the step does, for the message
     * @param work the step
     * @returns the step's result
     * @throws EntryCheckStoppedError when the check stops before the step finishes
     */
    public async Run<T>(step: string, work: () => Promise<T>): Promise<T> {
        this.ThrowIfStopped(step);
        let onStop: (() => void) | undefined;
        const stopped = new Promise<never>((_, reject) => {
            onStop = () => reject(new EntryCheckStoppedError(this.stopReason ?? 'Cancelled', step, this.BudgetMS));
            this.controller.signal.addEventListener('abort', onStop, { once: true });
        });
        try {
            return await Promise.race([work(), stopped]);
        } finally {
            if (onStop) {
                this.controller.signal.removeEventListener('abort', onStop);
            }
        }
    }

    /** Clears the timer and stops listening to the caller's signal. Safe to call more than once. */
    public Dispose(): void {
        clearTimeout(this.timer);
        this.callerSignal?.removeEventListener('abort', this.onCallerAbort);
    }

    private stop(reason: EntryCheckStopReason): void {
        if (this.stopReason) {
            return;
        }
        this.stopReason = reason;
        clearTimeout(this.timer);
        this.controller.abort(reason);
    }
}
