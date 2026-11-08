import type { RealtimeMemorySeed } from './realtimeConversationMemory';

/**
 * Why a reconnect was started: the provider announced the connection is ending, the
 * connection closed without the consumer asking, or the configured connection duration elapsed.
 */
export type RealtimeReconnectReason = 'connection-ending' | 'connection-lost' | 'duration-expiry';

/**
 * Error code surfaced when a reconnect fails after all attempts or trips the rapid-reconnect circuit breaker.
 */
export type RealtimeReconnectFailureCode = 'reconnect-failed' | 'reconnect-loop-breaker';

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
     * The longest margin the helper keeps before an announced connection end. When no resumable
     * point has arrived by then, it reconnects with the last handle. The margin is a third of the
     * notice, so a turn in progress gets the rest of it to finish, kept between
     * {@link REALTIME_RESUMPTION_MIN_DEADLINE_MARGIN_MS} (what a reconnect needs) and this value.
     * Defaults to {@link REALTIME_RESUMPTION_DEADLINE_MARGIN_MS}.
     */
    DeadlineMarginMs?: number;
    /** Diagnostic sink; defaults to no logging. */
    Log?: (message: string) => void;
}

/** Default attempt schedule: right away, then after 1 s, then after 3 s. */
export const REALTIME_RESUMPTION_RETRY_DELAYS_MS: readonly number[] = [0, 1000, 3000];

/** Default limit on one reconnect attempt. */
export const REALTIME_RESUMPTION_ATTEMPT_TIMEOUT_MS = 15000;

/**
 * Default for the longest margin the helper keeps before an announced connection end (see
 * {@link RealtimeSessionResumptionOptions.DeadlineMarginMs}): reached at a notice of 30 s or more.
 */
export const REALTIME_RESUMPTION_DEADLINE_MARGIN_MS = 10000;

/**
 * The shortest margin the helper keeps before an announced connection end: what a reconnect needs.
 * A resume on Vertex AI had its setup confirmed 0.4 to 0.5 s after the move started.
 */
export const REALTIME_RESUMPTION_MIN_DEADLINE_MARGIN_MS = 1500;

/** The share of the notice kept as the margin; the rest is the time a turn in progress has to finish. */
const DEADLINE_MARGIN_SHARE_OF_NOTICE = 1 / 3;

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
 * - **The connection is ending** ({@link ConnectionEnding}). Gemini Live sends `goAway` with the
 *   time left before it closes a connection; the notice varies (on Vertex AI it came about 9
 *   minutes after the connection opened, with 30 s left). The helper reconnects at the next resumable
 *   point, because resuming from an older handle drops whatever happened since it was issued. A
 *   resumable point is a handle the provider marks resumable, issued while no turn is in progress:
 *   the driver reports turns ({@link TurnStarted}, {@link TurnEnded}), because a provider's own
 *   word is not enough (Vertex AI marks every update resumable, mid-answer too). If no resumable
 *   point arrives, it reconnects with the last handle shortly before the deadline: a third of the
 *   notice before it, between {@link REALTIME_RESUMPTION_MIN_DEADLINE_MARGIN_MS} and
 *   {@link RealtimeSessionResumptionOptions.DeadlineMarginMs}.
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
    /** A resumable handle arrived after the last turn ended, and no turn has started since. */
    private _resumableNow = false;
    private _turnOpen = false;
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
     * connection, but a planned move waits for the next resumable point. A resumable handle that
     * arrives while a turn is in progress is kept as that fallback too: resuming from it would cut
     * the turn, so it is not a point to move at.
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
            this._resumableNow = !this._turnOpen;
        }
        if (this._endingAnnounced && this._resumableNow) {
            this.startReconnect('connection-ending');
        }
    }

    /**
     * A turn started or continued: the user's first transcribed words, a turn the client sent, or
     * the model's output. Until {@link TurnEnded}, a planned move waits, whatever the provider's
     * updates say; the deadline still bounds the wait. Call it for every sign of the turn: a repeat
     * changes nothing.
     */
    public TurnStarted(): void {
        this._turnOpen = true;
        // The latest handle predates the turn: resuming from it would drop the turn.
        this._resumableNow = false;
    }

    /**
     * The turn ended (its `turnComplete`, with no tool call pending). A planned move now happens at
     * the next resumable handle, which the provider issues after the turn (Vertex AI: 20-70 ms
     * after `turnComplete`), so the new connection resumes with the finished turn.
     */
    public TurnEnded(): void {
        this._turnOpen = false;
    }

    /**
     * The provider announced the current connection ends in `timeLeftMs`. The helper moves at once
     * when the latest handle is a resumable point (issued after the last turn ended, with no turn
     * since); otherwise it waits for one, until the deadline.
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
        // The new connection has not reported a resumable point yet, and a turn the move cut off
        // never completes there.
        this._resumableNow = false;
        this._turnOpen = false;
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
        const delay = timeLeftMs === undefined ? UNKNOWN_TIME_LEFT_DELAY_MS : Math.max(0, timeLeftMs - this.deadlineMarginFor(timeLeftMs));
        this._deadlineTimer = setTimeout(() => {
            this._deadlineTimer = null;
            this.startReconnect('connection-ending');
        }, delay);
    }

    /**
     * The margin kept before an announced connection end: a third of the notice, so a turn in
     * progress gets the rest of it, between {@link REALTIME_RESUMPTION_MIN_DEADLINE_MARGIN_MS} and
     * {@link RealtimeSessionResumptionOptions.DeadlineMarginMs}. A notice shorter than the least
     * margin moves at once.
     */
    private deadlineMarginFor(timeLeftMs: number): number {
        const most = this.options.DeadlineMarginMs ?? REALTIME_RESUMPTION_DEADLINE_MARGIN_MS;
        const least = Math.min(most, REALTIME_RESUMPTION_MIN_DEADLINE_MARGIN_MS);
        return Math.min(most, Math.max(least, Math.round(timeLeftMs * DEADLINE_MARGIN_SHARE_OF_NOTICE)));
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

/** Default buffer in seconds before connection duration expiry when the framework triggers a reconnect. */
export const DEFAULT_REALTIME_RECONNECT_BUFFER_SECONDS = 10;

/** Default soft turn-boundary window in seconds before connection duration expiry. */
export const DEFAULT_REALTIME_SOFT_RECONNECT_WINDOW_SECONDS = 30;

/** Maximum number of rapid reconnects allowed within REALTIME_RAPID_RECONNECT_WINDOW_MS before tripping the circuit breaker. */
export const MAX_REALTIME_RAPID_RECONNECTS = 5;

/** Sliding window in milliseconds for the rapid-reconnect circuit breaker. */
export const REALTIME_RAPID_RECONNECT_WINDOW_MS = 30_000;

/** Fraction of connection duration allocated as the soft turn-boundary lead window before the hard buffer. */
export const REALTIME_SOFT_WINDOW_DURATION_SHARE = 0.15;

/** Maximum fraction of connection duration that the combined soft window + buffer may consume. */
export const REALTIME_MAX_SOFT_WINDOW_DURATION_SHARE = 0.5;

/** Default lead time in milliseconds before credential/relay `ExpiresAt` at which proactive refresh fires. */
export const DEFAULT_CREDENTIAL_REFRESH_LEAD_MS = 60_000;

/** Minimum lead share of remaining credential lifetime used when `ExpiresAt` is shorter than `DEFAULT_CREDENTIAL_REFRESH_LEAD_MS * 4`. */
export const CREDENTIAL_REFRESH_MIN_LEAD_SHARE = 0.25;

/** Context passed by the framework to a server or client driver's reconnect implementation. */
export interface RealtimeReconnectContext {
    /** Why the reconnect was triggered ('duration-expiry' | 'connection-ending' | 'connection-lost'). */
    readonly Reason: RealtimeReconnectReason;
    /** 1-based attempt number within the current reconnect cycle (1..MaxAttempts). */
    readonly Attempt: number;
    /** Maximum attempts permitted before the reconnect fails fatally. */
    readonly MaxAttempts: number;
    /** Elapsed seconds on the current connection when the reconnect began. */
    readonly ElapsedConnectionSeconds: number;
    /**
     * Native provider resumption handle or conversation ID captured from the active connection,
     * or `null` if none has been recorded or native resumption is disabled/untrusted.
     */
    readonly ResumptionHandle: string | null;
    /**
     * True when the driver should use `ResumptionHandle` for native continuation and MUST NOT
     * re-send conversation history. False when the driver must seed from `ConversationSeed`.
     */
    readonly UseNativeResumption: boolean;
    /**
     * Snapshot of accumulated conversation history from `RealtimeConversationMemory.Seed()`.
     * Populated when `UseNativeResumption` is `false` (or on retry fallback after a native handle
     * is rejected); `null` when `UseNativeResumption` is `true` on the primary attempt or when no
     * turns have occurred yet.
     */
    readonly ConversationSeed: RealtimeMemorySeed | null;
    /**
     * Turns `true` when the attempt timed out, failed, or the session/client was closed.
     * Drivers MUST check `context.Abandoned` after asynchronous setup steps and immediately
     * close any newly opened socket/peer-connection without swapping it into active state.
     */
    readonly Abandoned: boolean;
    /**
     * AbortSignal that fires when `Abandoned` turns `true` (attempt timeout, failure, or session close).
     */
    readonly Signal: AbortSignal;
}

/** Options for the unified I/O-free {@link RealtimeReconnectController}. */
export interface RealtimeReconnectControllerOptions {
    /** Opens a replacement connection using either a native handle or a memory seed and swaps it in. */
    Reconnect: (context: RealtimeReconnectContext) => Promise<void>;
    /** Invoked once when all retry attempts fail or the rapid-reconnect circuit breaker trips. */
    OnReconnectFailed: (error: Error, code: RealtimeReconnectFailureCode) => void;
    /** Invoked when a reconnect cycle begins. */
    OnReconnecting?: (reason: RealtimeReconnectReason) => void;
    /** Invoked when an attempt succeeds and the replacement connection is active. */
    OnReconnected?: (usedNativeResumption: boolean) => void;
    /** Builds the conversation memory seed when reconnecting without native resumption. */
    BuildSeed: () => RealtimeMemorySeed | null;
    /** Returns true when no turn is open and no tool calls are in flight. */
    IsIdle?: () => boolean;
    /** Returns true when native resumption handles are trusted on the current session/topology. */
    TrustsNativeResumption?: () => boolean;
    /**
     * Returns true when the provider emits a fresh resumable handle shortly after each `turnComplete`
     * (e.g. Gemini / Vertex AI Live), so a planned move (`goAway` or soft window) that occurs during a
     * turn should wait for that post-turn `RecordHandle(..., true)` (bounded by the deadline timer)
     * rather than resuming from the pre-turn handle.
     */
    RequiresPostTurnHandle?: () => boolean;
    /** Retry delay schedule in milliseconds (default `[0, 1000, 3000]`). */
    RetryDelaysMs?: readonly number[];
    /** Per-attempt timeout in milliseconds (default `15000`). */
    AttemptTimeoutMs?: number;
    /** Maximum deadline margin in milliseconds for `ConnectionEnding` notices (default `10000`). */
    DeadlineMarginMs?: number;
    /** Maximum rapid reconnects allowed within `RapidReconnectWindowMs` (default `5`). */
    MaxRapidReconnects?: number;
    /** Sliding window in milliseconds for the rapid-reconnect circuit breaker (default `30000`). */
    RapidReconnectWindowMs?: number;
    /** Diagnostic logger. */
    Log?: (message: string) => void;
}

interface ActiveAttemptState {
    Abandoned: boolean;
    readonly Controller: AbortController;
}

/**
 * Single I/O-free reconnect orchestrator shared by {@link BaseRealtimeSession} and `BaseRealtimeClient`.
 *
 * Unifies:
 * 1. Provider resumption handle tracking (`RecordHandle`, `InvalidateHandle`) with post-turn handle awareness,
 * 2. Proactive connection duration timers (soft turn-boundary window + hard buffer deadline),
 * 3. Independent credential/relay refresh timer (`ScheduleCredentialRefresh`),
 * 4. Provider `ConnectionEnding(timeLeftMs)` notice (`goAway` / `session.going_away`) with scaled `1/3` margin,
 * 5. Reactive `ConnectionLost()` trigger,
 * 6. Bounded retry loop with per-attempt timeout, `Abandoned` + `AbortSignal` cancellation, and Attempt-2
 *    automatic fallback from native handle to `RealtimeConversationMemory` seed,
 * 7. Rapid-reconnect sliding-window circuit breaker (`reconnect-loop-breaker`).
 */
export class RealtimeReconnectController {
    private _handle: string | null = null;
    private _resumableNow = false;
    private _turnOpen = false;
    private _endingAnnounced = false;
    private _inSoftWindow = false;
    private _reconnecting = false;
    private _exhausted = false;
    private _disposed = false;
    private _connectionOpenedAtMs: number = Date.now();
    private _softTimer: ReturnType<typeof setTimeout> | null = null;
    private _hardTimer: ReturnType<typeof setTimeout> | null = null;
    private _deadlineTimer: ReturnType<typeof setTimeout> | null = null;
    private _retryTimer: ReturnType<typeof setTimeout> | null = null;
    private _credentialRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    private _currentAttempt: ActiveAttemptState | null = null;
    private _reconnectPromise: Promise<boolean> | null = null;
    private _rapidReconnectTimestamps: number[] = [];

    constructor(private readonly options: RealtimeReconnectControllerOptions) {}

    /** Latest recorded provider resumption handle, or `null` if none. */
    public get Handle(): string | null {
        return this._handle;
    }

    /** True while an in-place reconnect cycle is running. */
    public get IsReconnecting(): boolean {
        return this._reconnecting;
    }

    /** True once `Dispose()` has been called. */
    public get IsDisposed(): boolean {
        return this._disposed;
    }

    /** True while a turn has started and not yet ended. */
    public get IsTurnOpen(): boolean {
        return this._turnOpen;
    }

    /** True when inside the proactive soft reconnect window or after a `ConnectionEnding` notice. */
    public get IsInSoftWindow(): boolean {
        return this._inSoftWindow || this._endingAnnounced;
    }

    /** True while either the soft or hard connection-duration timer is armed. */
    public get HasDurationTimersArmed(): boolean {
        return this._softTimer !== null || this._hardTimer !== null;
    }

    /** Records a provider resumption handle and whether the provider marked this point resumable. */
    public RecordHandle(handle: string | null | undefined, resumable = true): void {
        if (!resumable) {
            this._resumableNow = false;
            return;
        }
        if (typeof handle === 'string' && handle.trim().length > 0) {
            this._handle = handle.trim();
            this._resumableNow = !this._turnOpen;
        }
        if ((this._endingAnnounced || this._inSoftWindow) && this._resumableNow && this.isIdle()) {
            void this.TriggerReconnect(this._endingAnnounced ? 'connection-ending' : 'duration-expiry');
        }
    }

    /** Clears the stored resumption handle so subsequent reconnects use history seeding. */
    public InvalidateHandle(): void {
        this._handle = null;
        this._resumableNow = false;
    }

    /** Marks a turn as open so soft-window and `ConnectionEnding` moves wait for the turn boundary. */
    public TurnStarted(): void {
        this._turnOpen = true;
        this._resumableNow = false;
    }

    /** Marks a turn as ended and triggers any queued soft-window or `ConnectionEnding` move when ready. */
    public TurnEnded(): void {
        this._turnOpen = false;
        this.NotifyIdleStateChanged();
    }

    /**
     * Re-evaluates whether a queued soft-window or `ConnectionEnding` reconnect can proceed now that
     * a turn or tool batch has finished.
     */
    public NotifyIdleStateChanged(): void {
        if (this._disposed || this._exhausted || this._reconnecting || this._turnOpen || !this.isIdle()) {
            return;
        }
        if (this._endingAnnounced) {
            if (this.shouldWaitForPostTurnHandle()) {
                return;
            }
            void this.TriggerReconnect('connection-ending');
            return;
        }
        if (this._inSoftWindow) {
            if (this.shouldWaitForPostTurnHandle()) {
                return;
            }
            void this.TriggerReconnect('duration-expiry');
        }
    }

    /**
     * Handles a provider connection-ending notice (`goAway` / `session.going_away`).
     * Reconnects immediately if idle and ready; otherwise waits for the turn/handle boundary up to
     * `timeLeftMs - margin` (where `margin = clamp(round(timeLeftMs / 3), 1500, 10000)`).
     */
    public ConnectionEnding(timeLeftMs?: number): void {
        if (this._disposed || this._exhausted || this._reconnecting) {
            return;
        }
        this._endingAnnounced = true;
        if (this.isIdle() && !this.shouldWaitForPostTurnHandle()) {
            void this.TriggerReconnect('connection-ending');
            return;
        }
        this.armDeadline(timeLeftMs);
    }

    /**
     * Arms (or re-arms) the proactive soft and hard duration timers for the active connection.
     */
    public ArmDurationTimers(
        durationSeconds: number | undefined,
        bufferSeconds: number,
        softLeadCapSeconds: number = DEFAULT_REALTIME_SOFT_RECONNECT_WINDOW_SECONDS
    ): void {
        this.clearDurationTimers();
        this.clearDeadline();
        if (this._disposed) {
            return;
        }
        this._connectionOpenedAtMs = Date.now();
        this._inSoftWindow = false;
        this._endingAnnounced = false;

        if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
            return;
        }

        const bufferSec = Math.min(bufferSeconds, Math.max(1, Math.floor(durationSeconds / 2)));
        const hardDelayMs = Math.max(100, (durationSeconds - bufferSec) * 1000);
        const softLeadSec = Math.min(
            softLeadCapSeconds,
            Math.max(0, Math.floor(durationSeconds * REALTIME_SOFT_WINDOW_DURATION_SHARE))
        );
        const softWindowSec = Math.min(
            Math.floor(durationSeconds * REALTIME_MAX_SOFT_WINDOW_DURATION_SHARE),
            bufferSec + softLeadSec
        );
        const softDelayMs = Math.max(50, (durationSeconds - softWindowSec) * 1000);

        if (softDelayMs < hardDelayMs) {
            this._softTimer = setTimeout(() => {
                this._softTimer = null;
                if (this._disposed || this._exhausted || this._reconnecting) {
                    return;
                }
                this._inSoftWindow = true;
                if (this.isIdle() && !this.shouldWaitForPostTurnHandle()) {
                    void this.TriggerReconnect('duration-expiry');
                }
            }, softDelayMs);
        }

        this._hardTimer = setTimeout(() => {
            this._hardTimer = null;
            if (this._disposed || this._exhausted || this._reconnecting) {
                return;
            }
            void this.TriggerReconnect('duration-expiry');
        }, hardDelayMs);
    }

    /**
     * Schedules a proactive credential or relay-session refresh before `expiresAtIso` (or
     * `fallbackLifetimeSeconds`), independent of connection reconnects.
     */
    public ScheduleCredentialRefresh(
        expiresAtIso: string | undefined,
        onRefreshDue: () => void,
        leadTimeMs: number = DEFAULT_CREDENTIAL_REFRESH_LEAD_MS,
        fallbackLifetimeSeconds?: number
    ): void {
        this.ClearCredentialRefresh();
        if (this._disposed) {
            return;
        }
        const parsedMs = expiresAtIso ? Date.parse(expiresAtIso) : NaN;
        const expiresAtMs = Number.isFinite(parsedMs)
            ? parsedMs
            : typeof fallbackLifetimeSeconds === 'number' && Number.isFinite(fallbackLifetimeSeconds) && fallbackLifetimeSeconds > 0
              ? Date.now() + fallbackLifetimeSeconds * 1000
              : NaN;
        if (!Number.isFinite(expiresAtMs)) {
            return;
        }
        const remainingMs = expiresAtMs - Date.now();
        if (remainingMs <= 0) {
            return;
        }
        const effectiveLeadMs = Math.min(
            leadTimeMs,
            Math.max(1000, Math.floor(remainingMs * CREDENTIAL_REFRESH_MIN_LEAD_SHARE))
        );
        const delayMs = Math.max(250, remainingMs - effectiveLeadMs);
        this._credentialRefreshTimer = setTimeout(() => {
            this._credentialRefreshTimer = null;
            if (!this._disposed && !this._exhausted) {
                onRefreshDue();
            }
        }, delayMs);
    }

    /** Cancels any pending credential refresh timer. */
    public ClearCredentialRefresh(): void {
        if (this._credentialRefreshTimer) {
            clearTimeout(this._credentialRefreshTimer);
            this._credentialRefreshTimer = null;
        }
    }

    /**
     * Initiates an in-place reconnect with coalescing, rapid-reconnect circuit breaker, per-attempt
     * timeout + `Abandoned` cancellation, and Attempt-2 fallback from native handle to memory seed.
     */
    public TriggerReconnect(reason: RealtimeReconnectReason): Promise<boolean> {
        if (this._disposed || this._exhausted) {
            return Promise.resolve(false);
        }
        if (this._reconnectPromise) {
            return this._reconnectPromise;
        }

        const now = Date.now();
        const windowMs = this.options.RapidReconnectWindowMs ?? REALTIME_RAPID_RECONNECT_WINDOW_MS;
        const maxRapid = this.options.MaxRapidReconnects ?? MAX_REALTIME_RAPID_RECONNECTS;
        this._rapidReconnectTimestamps = this._rapidReconnectTimestamps.filter((ts) => now - ts < windowMs);
        if (this._rapidReconnectTimestamps.length >= maxRapid) {
            this._exhausted = true;
            const breakerErr = new Error(
                `Realtime session reconnect circuit breaker tripped (${maxRapid} reconnects within ${windowMs}ms)`
            );
            this.options.OnReconnectFailed(breakerErr, 'reconnect-loop-breaker');
            return Promise.resolve(false);
        }
        this._rapidReconnectTimestamps.push(now);

        this._reconnecting = true;
        this.clearDurationTimers();
        this.clearDeadline();
        this.options.Log?.(`[RealtimeReconnectController] reconnecting (${reason})`);
        this.options.OnReconnecting?.(reason);

        const elapsedSeconds = Math.max(0, Math.round((now - this._connectionOpenedAtMs) / 1000));
        const promise = this.runReconnectLoop(reason, elapsedSeconds).finally(() => {
            this._reconnectPromise = null;
        });
        this._reconnectPromise = promise;
        return promise;
    }

    /** Cancels all timers, abandons any in-flight attempt, and prevents further reconnects. */
    public Dispose(): void {
        this._disposed = true;
        this.clearDurationTimers();
        this.clearDeadline();
        this.clearRetry();
        this.ClearCredentialRefresh();
        if (this._currentAttempt) {
            this.abandonAttempt(this._currentAttempt);
        }
    }

    /** Resets disposed/exhausted state and clears timers so a reused session/client instance can arm fresh timers. */
    public Reset(): void {
        this.Dispose();
        this._disposed = false;
        this._exhausted = false;
        this._reconnecting = false;
        this._endingAnnounced = false;
        this._inSoftWindow = false;
        this._turnOpen = false;
        this._resumableNow = false;
        this._handle = null;
        this._rapidReconnectTimestamps = [];
    }

    private isIdle(): boolean {
        if (this._turnOpen) {
            return false;
        }
        return this.options.IsIdle ? this.options.IsIdle() : true;
    }

    private trustsNativeResumption(): boolean {
        return this.options.TrustsNativeResumption ? this.options.TrustsNativeResumption() : false;
    }

    private requiresPostTurnHandle(): boolean {
        return this.options.RequiresPostTurnHandle ? this.options.RequiresPostTurnHandle() : false;
    }

    private shouldWaitForPostTurnHandle(): boolean {
        return (
            this.requiresPostTurnHandle() &&
            this.trustsNativeResumption() &&
            this._handle !== null &&
            !this._resumableNow
        );
    }

    private abandonAttempt(attempt: ActiveAttemptState): void {
        if (!attempt.Abandoned) {
            attempt.Abandoned = true;
            attempt.Controller.abort();
        }
    }

    private async runReconnectLoop(reason: RealtimeReconnectReason, elapsedSeconds: number): Promise<boolean> {
        const delays = this.retryDelays();
        const maxAttempts = delays.length;
        let lastError: Error = new Error('Realtime session reconnect failed');
        let forceSeedFallback = false;

        for (let i = 0; i < maxAttempts; i++) {
            if (this._disposed) {
                this._reconnecting = false;
                return false;
            }
            const delayMs = delays[i] ?? 0;
            if (delayMs > 0) {
                await new Promise<void>((resolve) => {
                    this._retryTimer = setTimeout(() => {
                        this._retryTimer = null;
                        resolve();
                    }, delayMs);
                });
                if (this._disposed) {
                    this._reconnecting = false;
                    return false;
                }
            }

            const canUseNative = !forceSeedFallback && this.trustsNativeResumption() && this._handle !== null;
            const handleToUse = canUseNative ? this._handle : null;
            const seed = !canUseNative ? this.options.BuildSeed() : null;
            const attemptState: ActiveAttemptState = {
                Abandoned: false,
                Controller: new AbortController(),
            };
            this._currentAttempt = attemptState;
            const controllerSelf = this;
            const context: RealtimeReconnectContext = {
                Reason: reason,
                Attempt: i + 1,
                MaxAttempts: maxAttempts,
                ElapsedConnectionSeconds: elapsedSeconds,
                ResumptionHandle: handleToUse,
                UseNativeResumption: canUseNative,
                ConversationSeed: seed,
                get Abandoned(): boolean {
                    return attemptState.Abandoned || controllerSelf._disposed;
                },
                Signal: attemptState.Controller.signal,
            };

            try {
                await this.withTimeout(this.options.Reconnect(context), attemptState);
                if (this._disposed || attemptState.Abandoned) {
                    this.abandonAttempt(attemptState);
                    this._reconnecting = false;
                    return false;
                }
                this._reconnecting = false;
                this._endingAnnounced = false;
                this._inSoftWindow = false;
                this._resumableNow = false;
                this._turnOpen = false;
                this.options.OnReconnected?.(canUseNative);
                return true;
            } catch (err) {
                this.abandonAttempt(attemptState);
                lastError = err instanceof Error ? err : new Error(String(err));
                this.options.Log?.(
                    `[RealtimeReconnectController] attempt ${i + 1}/${maxAttempts} failed (${reason}): ${lastError.message}`
                );
                if (canUseNative) {
                    forceSeedFallback = true;
                    this.InvalidateHandle();
                }
            } finally {
                if (this._currentAttempt === attemptState) {
                    this._currentAttempt = null;
                }
            }
        }

        this._reconnecting = false;
        this._exhausted = true;
        if (!this._disposed) {
            this.options.OnReconnectFailed(lastError, 'reconnect-failed');
        }
        return false;
    }

    private withTimeout(work: Promise<void>, attemptState: ActiveAttemptState): Promise<void> {
        const timeoutMs = this.options.AttemptTimeoutMs ?? REALTIME_RESUMPTION_ATTEMPT_TIMEOUT_MS;
        work.catch(() => undefined);
        let timer: ReturnType<typeof setTimeout> | null = null;
        const timeout = new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
                this.abandonAttempt(attemptState);
                reject(new Error(`reconnect attempt timed out after ${timeoutMs} ms`));
            }, timeoutMs);
        });
        return Promise.race([work, timeout]).finally(() => {
            if (timer) {
                clearTimeout(timer);
            }
        });
    }

    private armDeadline(timeLeftMs: number | undefined): void {
        this.clearDeadline();
        const delay =
            timeLeftMs === undefined
                ? UNKNOWN_TIME_LEFT_DELAY_MS
                : Math.max(0, timeLeftMs - this.deadlineMarginFor(timeLeftMs));
        this._deadlineTimer = setTimeout(() => {
            this._deadlineTimer = null;
            if (!this._disposed && !this._exhausted && !this._reconnecting) {
                void this.TriggerReconnect('connection-ending');
            }
        }, delay);
    }

    private deadlineMarginFor(timeLeftMs: number): number {
        const most = this.options.DeadlineMarginMs ?? REALTIME_RESUMPTION_DEADLINE_MARGIN_MS;
        const least = Math.min(most, REALTIME_RESUMPTION_MIN_DEADLINE_MARGIN_MS);
        return Math.min(most, Math.max(least, Math.round(timeLeftMs * DEADLINE_MARGIN_SHARE_OF_NOTICE)));
    }

    private retryDelays(): readonly number[] {
        const delays = this.options.RetryDelaysMs;
        return delays && delays.length > 0 ? delays : REALTIME_RESUMPTION_RETRY_DELAYS_MS;
    }

    private clearDurationTimers(): void {
        if (this._softTimer) {
            clearTimeout(this._softTimer);
            this._softTimer = null;
        }
        if (this._hardTimer) {
            clearTimeout(this._hardTimer);
            this._hardTimer = null;
        }
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

