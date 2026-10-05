/**
 * Why a reconnect was started: the provider announced the connection is ending, or the
 * connection closed without the consumer asking.
 */
export type RealtimeReconnectReason = 'connection-ending' | 'connection-lost';

/**
 * One reconnect attempt, handed to {@link RealtimeSessionResumptionOptions.Reconnect}.
 * `Abandoned` turns `true` when the attempt timed out or the session was disposed; a connection
 * that opens after that must be closed by the driver and not used.
 */
export interface RealtimeResumeAttempt {
    readonly Abandoned: boolean;
}

/** Callbacks and tuning for {@link RealtimeSessionResumption}. */
export interface RealtimeSessionResumptionOptions {
    /**
     * Opens a replacement connection that resumes the session from `handle`, and makes it the
     * driver's current connection. Resolves once the new connection is in use; rejects on failure.
     */
    Reconnect: (handle: string, attempt: RealtimeResumeAttempt) => Promise<void>;
    /**
     * Every attempt failed. The driver surfaces its usual fatal error here; the helper never
     * reconnects again after this.
     */
    OnReconnectFailed: (error: Error) => void;
    /** A reconnect started. Drivers report this as `'connecting'` so hosts can show "reconnecting". */
    OnReconnecting?: (reason: RealtimeReconnectReason) => void;
    /** The replacement connection is in use. */
    OnReconnected?: () => void;
    /**
     * Delay before each attempt, in milliseconds; the array length is the attempt count.
     * Defaults to {@link REALTIME_RESUMPTION_RETRY_DELAYS_MS}.
     */
    RetryDelaysMs?: readonly number[];
    /**
     * How long one attempt may take before it counts as failed. A socket that never opens would
     * otherwise leave the session reconnecting forever. Defaults to
     * {@link REALTIME_RESUMPTION_ATTEMPT_TIMEOUT_MS}.
     */
    AttemptTimeoutMs?: number;
    /**
     * When the provider announces the connection is ending, how long before the deadline to
     * reconnect with the last handle if no resumable point has arrived. Defaults to
     * {@link REALTIME_RESUMPTION_DEADLINE_MARGIN_MS}.
     */
    DeadlineMarginMs?: number;
    /** Diagnostic sink; defaults to no logging. */
    Log?: (message: string) => void;
}

/** Default attempt schedule: right away, then after 1 s, then after 3 s. */
export const REALTIME_RESUMPTION_RETRY_DELAYS_MS: readonly number[] = [0, 1000, 3000];

/** Default limit on one reconnect attempt. */
export const REALTIME_RESUMPTION_ATTEMPT_TIMEOUT_MS = 15000;

/** Default margin before an announced connection end at which the helper stops waiting for a resumable point. */
export const REALTIME_RESUMPTION_DEADLINE_MARGIN_MS = 10000;

/** Used when the provider announces a connection end without saying how long is left. */
const UNKNOWN_TIME_LEFT_DELAY_MS = 30000;

/**
 * Reads a protobuf JSON `Duration` string, such as Gemini Live's `goAway.timeLeft` (`"59.5s"`), as
 * milliseconds for {@link RealtimeSessionResumption.ConnectionEnding}.
 *
 * @returns The duration in milliseconds, or `undefined` when absent or not in that form.
 */
export function ParseDurationToMs(duration: string | undefined): number | undefined {
    const match = duration ? /^(\d+(?:\.\d+)?)s$/.exec(duration.trim()) : null;
    return match ? Math.round(Number(match[1]) * 1000) : undefined;
}

/**
 * Decides **when** a realtime session with provider-side resumption moves to a new connection,
 * and drives the move. It holds no transport: the driver reports what the provider says and
 * supplies the call that opens the replacement connection.
 *
 * Two triggers:
 * - **The connection is ending** ({@link ConnectionEnding}). Gemini Live sends `goAway` about 60 s
 *   before a connection reaches its ~10-minute limit. The helper reconnects at the next point the
 *   provider marks as resumable, because resuming from an older handle drops whatever happened
 *   since it was issued. If no resumable point arrives, it reconnects with the last handle
 *   {@link RealtimeSessionResumptionOptions.DeadlineMarginMs} before the deadline.
 * - **The connection was lost** ({@link ConnectionLost}): a network change or a server reset. The
 *   helper reconnects with the last handle.
 *
 * Attempts follow {@link RealtimeSessionResumptionOptions.RetryDelaysMs}, each limited by
 * {@link RealtimeSessionResumptionOptions.AttemptTimeoutMs}. When every attempt fails it calls
 * `OnReconnectFailed` once and stops. With no handle (resumption disabled, or no update received
 * yet) {@link ConnectionLost} returns `false` and the driver keeps its usual fatal path.
 */
export class RealtimeSessionResumption {
    private _handle: string | null = null;
    private _resumableNow = false;
    private _endingAnnounced = false;
    private _reconnecting = false;
    private _exhausted = false;
    private _disposed = false;
    private _deadlineTimer: ReturnType<typeof setTimeout> | null = null;
    private _retryTimer: ReturnType<typeof setTimeout> | null = null;
    private _currentAttempt: { Abandoned: boolean } | null = null;
    private readonly options: RealtimeSessionResumptionOptions;

    constructor(options: RealtimeSessionResumptionOptions) {
        this.options = options;
    }

    /** The latest handle the provider issued, or `null` before the first update. */
    public get Handle(): string | null {
        return this._handle;
    }

    /** Whether a reconnect is in progress. */
    public get IsReconnecting(): boolean {
        return this._reconnecting;
    }

    /**
     * Records the provider's latest resumption state. `resumable: false` means the session is
     * mid-generation or mid-tool-call: the previous handle stays as a fallback for a lost
     * connection, but a planned move waits for the next resumable point.
     *
     * @param handle The new handle, when the provider sent one.
     * @param resumable Whether the session can be resumed from this point without losing data.
     */
    public RecordHandle(handle: string | null | undefined, resumable: boolean): void {
        if (!resumable) {
            this._resumableNow = false;
            return;
        }
        if (handle) {
            this._handle = handle;
            this._resumableNow = true;
        }
        if (this._endingAnnounced && this._resumableNow) {
            this.startReconnect('connection-ending');
        }
    }

    /**
     * The provider announced the current connection ends in `timeLeftMs`.
     *
     * @param timeLeftMs Time until the provider closes the connection; `undefined` when not given.
     */
    public ConnectionEnding(timeLeftMs?: number): void {
        if (this._disposed || this._exhausted || this._reconnecting) {
            return;
        }
        this._endingAnnounced = true;
        if (this._resumableNow && this._handle) {
            this.startReconnect('connection-ending');
            return;
        }
        this.armDeadline(timeLeftMs);
    }

    /**
     * The connection closed without the consumer asking.
     *
     * @returns `true` when a reconnect started (or was already running), so the driver reports
     *          "reconnecting" rather than an error; `false` when there is no handle to resume
     *          from, so the driver keeps its fatal path.
     */
    public ConnectionLost(): boolean {
        if (this._disposed || this._exhausted || !this._handle) {
            return false;
        }
        if (!this._reconnecting) {
            this.startReconnect('connection-lost');
        }
        return true;
    }

    /** Cancels timers, abandons any attempt in flight and stops retries. Call when the consumer closes the session. */
    public Dispose(): void {
        this._disposed = true;
        this.clearDeadline();
        this.clearRetry();
        if (this._currentAttempt) {
            this._currentAttempt.Abandoned = true;
        }
    }

    private startReconnect(reason: RealtimeReconnectReason): void {
        if (this._reconnecting || this._disposed || this._exhausted || !this._handle) {
            return;
        }
        this._reconnecting = true;
        this.clearDeadline();
        this.options.Log?.(`[RealtimeSessionResumption] reconnecting (${reason})`);
        this.options.OnReconnecting?.(reason);
        this.scheduleAttempt(0);
    }

    private scheduleAttempt(index: number): void {
        this._retryTimer = setTimeout(() => {
            this._retryTimer = null;
            void this.attempt(index);
        }, this.retryDelays()[index]);
    }

    private async attempt(index: number): Promise<void> {
        if (this._disposed || !this._handle) {
            return;
        }
        const attempt = { Abandoned: false };
        this._currentAttempt = attempt;
        try {
            await this.withTimeout(this.options.Reconnect(this._handle, attempt), attempt);
            this.onAttemptSucceeded();
        } catch (error) {
            attempt.Abandoned = true;
            this.onAttemptFailed(index, error);
        } finally {
            if (this._currentAttempt === attempt) {
                this._currentAttempt = null;
            }
        }
    }

    /** Rejects when `work` outlives the attempt timeout; the attempt is then abandoned. */
    private withTimeout(work: Promise<void>, attempt: { Abandoned: boolean }): Promise<void> {
        const timeoutMs = this.options.AttemptTimeoutMs ?? REALTIME_RESUMPTION_ATTEMPT_TIMEOUT_MS;
        // A connect that fails after the timeout already settled the race must not surface as
        // an unhandled rejection; the race reports the outcome that counts.
        work.catch(() => undefined);
        let timer: ReturnType<typeof setTimeout> | null = null;
        const timeout = new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
                attempt.Abandoned = true;
                reject(new Error(`reconnect attempt timed out after ${timeoutMs} ms`));
            }, timeoutMs);
        });
        return Promise.race([work, timeout]).finally(() => {
            if (timer) {
                clearTimeout(timer);
            }
        });
    }

    private onAttemptSucceeded(): void {
        this._reconnecting = false;
        this._endingAnnounced = false;
        // The new connection has not reported a resumable point yet.
        this._resumableNow = false;
        if (!this._disposed) {
            this.options.OnReconnected?.();
        }
    }

    private onAttemptFailed(index: number, error: unknown): void {
        const message = error instanceof Error ? error.message : String(error);
        this.options.Log?.(`[RealtimeSessionResumption] attempt ${index + 1} failed: ${message}`);
        if (this._disposed) {
            return;
        }
        if (index + 1 < this.retryDelays().length) {
            this.scheduleAttempt(index + 1);
            return;
        }
        this._reconnecting = false;
        this._exhausted = true;
        this.options.OnReconnectFailed(error instanceof Error ? error : new Error(message));
    }

    private armDeadline(timeLeftMs: number | undefined): void {
        this.clearDeadline();
        const margin = this.options.DeadlineMarginMs ?? REALTIME_RESUMPTION_DEADLINE_MARGIN_MS;
        const delay = timeLeftMs === undefined ? UNKNOWN_TIME_LEFT_DELAY_MS : Math.max(0, timeLeftMs - margin);
        this._deadlineTimer = setTimeout(() => {
            this._deadlineTimer = null;
            this.startReconnect('connection-ending');
        }, delay);
    }

    private retryDelays(): readonly number[] {
        const delays = this.options.RetryDelaysMs;
        return delays && delays.length > 0 ? delays : REALTIME_RESUMPTION_RETRY_DELAYS_MS;
    }

    private clearDeadline(): void {
        if (this._deadlineTimer) {
            clearTimeout(this._deadlineTimer);
            this._deadlineTimer = null;
        }
    }

    private clearRetry(): void {
        if (this._retryTimer) {
            clearTimeout(this._retryTimer);
            this._retryTimer = null;
        }
    }
}
