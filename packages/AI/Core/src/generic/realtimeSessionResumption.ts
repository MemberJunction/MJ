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
 * Default start of the attempt schedule: right away, then after 1 s, then after 3 s. These attempts always run; later
 * ones wait {@link REALTIME_RESUMPTION_MAX_RETRY_DELAY_MS} each, while the recovery window is open.
 */
export const REALTIME_RESUMPTION_RETRY_DELAYS_MS: readonly number[] = [0, 1000, 3000];

/** Default wait between attempts once the listed schedule is used up: the cap of the backoff. */
export const REALTIME_RESUMPTION_MAX_RETRY_DELAY_MS = 5000;

/**
 * Default time a reconnect keeps trying after the connection is gone: from the start of the cycle for a lost
 * connection, and from the end of the old connection (the provider limit, or the end a `goAway` announced) for a planned
 * move, whose old connection keeps the call going until then. 45 s outlasts the outages a call should survive (Wi-Fi
 * roaming, a VPN reconnect, a short tunnel: the #6462 smoke's 10 s cut ended the call under the old 4 s schedule), yet
 * is short enough that the user is not left on "Resuming" for an outage that is not ending.
 *
 * The window only stops new attempts: one already running finishes on its own timeouts (up to
 * {@link REALTIME_RESUMPTION_PREPARE_TIMEOUT_MS} plus {@link REALTIME_RESUMPTION_ATTEMPT_TIMEOUT_MS}, 30 s by default),
 * and the listed schedule ({@link REALTIME_RESUMPTION_RETRY_DELAYS_MS}) always runs in full. So with the defaults a lost
 * connection can stay on "Resuming" for up to about 94 s (three attempts that each time out after 30 s, plus the 1 s and
 * 3 s waits), and a planned move's cycle can run until about 75 s after its old connection ends. A close the provider
 * meant (not a network loss) is retried the same way: closes are not classified.
 */
export const REALTIME_RESUMPTION_RECOVERY_WINDOW_MS = 45_000;

/**
 * Hard cap on attempts in one reconnect cycle, whatever the window: about 2.5 times what the default window and backoff
 * use for a planned move (40 s of old connection plus 45 s, one attempt per 5 s), so it only stops a misconfiguration.
 */
export const MAX_REALTIME_RESUMPTION_ATTEMPTS = 40;

/** Default limit on one reconnect attempt's transport work (`Reconnect`), not counting its `PrepareAttempt`. */
export const REALTIME_RESUMPTION_ATTEMPT_TIMEOUT_MS = 15000;

/**
 * Default limit on one attempt's `PrepareAttempt` step (e.g. minting a credential). A separate budget, so a slow
 * server round trip cannot use up the transport timeout and abort the attempt just after the credential arrives.
 */
export const REALTIME_RESUMPTION_PREPARE_TIMEOUT_MS = 15000;

/**
 * Default for the longest margin the helper keeps before an announced connection end (see
 * {@link RealtimeReconnectControllerOptions.DeadlineMarginMs}): reached at a notice of 30 s or more.
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
 * milliseconds for {@link RealtimeReconnectController.ConnectionEnding}.
 *
 * @returns The duration in milliseconds, or `undefined` when absent or not in that form.
 */
export function ParseDurationToMs(duration: string | undefined): number | undefined {
    const match = duration ? /^(\d+(?:\.\d+)?)s$/.exec(duration.trim()) : null;
    return match ? Math.round(Number(match[1]) * 1000) : undefined;
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
    /**
     * The most attempts the cycle can make ({@link MAX_REALTIME_RESUMPTION_ATTEMPTS}). The recovery window usually ends
     * the cycle sooner, so this is an upper bound, not a promise that a failed attempt is followed by another.
     */
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
    /**
     * Optional work an attempt needs before it opens the transport, such as minting a fresh credential. It runs
     * on its own `PrepareTimeoutMs` budget, and `Reconnect` starts (with its own `AttemptTimeoutMs`) only when it
     * resolves in time: an attempt abandoned during preparation never reaches `Reconnect`. A rejection or a
     * timeout fails the attempt like a `Reconnect` failure, so the retry schedule bounds it.
     */
    PrepareAttempt?: (context: RealtimeReconnectContext) => Promise<void>;
    /**
     * Invoked once when the cycle gives up (its recovery window closed, or it made {@link MAX_REALTIME_RESUMPTION_ATTEMPTS}
     * attempts) or the rapid-reconnect circuit breaker trips.
     */
    OnReconnectFailed: (error: Error, code: RealtimeReconnectFailureCode) => void;
    /** Invoked when a reconnect cycle begins. */
    OnReconnecting?: (reason: RealtimeReconnectReason) => void;
    /** Invoked when an attempt succeeds and the replacement connection is active. */
    OnReconnected?: (usedNativeResumption: boolean) => void;
    /**
     * A planned move's attempt failed while its old connection still carries the call (before the last call before
     * its end). The driver goes back to live on that connection (its state, its input) and returns `true`, or returns
     * `false` when it cannot (the old connection is gone too, or the driver tore it down for the attempt). After `true`,
     * {@link RealtimeReconnectController.IsReconnecting} is `false` until the next attempt, which waits for the retry
     * delay and then for the next idle boundary, the hard point (unless a turn or `HoldsHardMove` holds it), or the last
     * call; `OnReconnecting` fires again when it starts. A loss of the old connection (`TriggerReconnect('connection-lost')`)
     * fires it at once instead and ends the wait, and the cycle goes on as a lost connection. Omitted or `false`: the
     * next attempt follows the retry schedule, with the client still reconnecting. A throw counts as `false`, and
     * `OnReconnecting` fires again, since the driver may have gone part way back.
     */
    ReturnToOldConnection?: () => boolean;
    /** Builds the conversation memory seed when reconnecting without native resumption. */
    BuildSeed: () => RealtimeMemorySeed | null;
    /** Returns true when no turn is open and no tool calls are in flight. */
    IsIdle?: () => boolean;
    /**
     * Returns true when the user has said something the current connection has not answered yet and no turn is open for
     * it: a provider that opens the turn only when its answer starts (Gemini) would otherwise lose those words at the hard
     * point. The hard-point move then waits as it does for an open turn (see `deferHardMoveToTurnEnd`); the driver calls
     * {@link RealtimeReconnectController.NotifyIdleStateChanged} when the hold ends without a turn. Omitted: only an open
     * turn holds the hard point.
     */
    HoldsHardMove?: () => boolean;
    /** Returns true when native resumption handles are trusted on the current session/topology. */
    TrustsNativeResumption?: () => boolean;
    /**
     * Returns true when the provider emits a fresh resumable handle shortly after each `turnComplete`
     * (e.g. Gemini / Vertex AI Live), so a planned move (`goAway` or soft window) that occurs during a
     * turn should wait for that post-turn `RecordHandle(..., true)` (bounded by the deadline timer)
     * rather than resuming from the pre-turn handle.
     */
    RequiresPostTurnHandle?: () => boolean;
    /**
     * Start of the attempt schedule in milliseconds (default `[0, 1000, 3000]`). These attempts always run; after them,
     * attempts wait `MaxRetryDelayMs` each while the recovery window is open.
     */
    RetryDelaysMs?: readonly number[];
    /** Wait in milliseconds between attempts after `RetryDelaysMs` is used up (default `5000`). */
    MaxRetryDelayMs?: number;
    /**
     * How long in milliseconds a cycle keeps trying once the connection is gone (default `45000`); see
     * {@link REALTIME_RESUMPTION_RECOVERY_WINDOW_MS}. `0` limits a lost connection to the `RetryDelaysMs` attempts, and a
     * planned move to the life left on its old connection.
     */
    RecoveryWindowMs?: number;
    /** Per-attempt timeout in milliseconds for `Reconnect` (default `15000`). */
    AttemptTimeoutMs?: number;
    /** Per-attempt timeout in milliseconds for `PrepareAttempt` (default `15000`). */
    PrepareTimeoutMs?: number;
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
    /** Set once the attempt's preparation is done and its transport work (`Reconnect`) has started. */
    TransportStarted: boolean;
    readonly Controller: AbortController;
}

/**
 * Single I/O-free reconnect orchestrator shared by {@link BaseRealtimeSession} and `BaseRealtimeClient`.
 *
 * Unifies:
 * 1. Provider resumption handle tracking (`RecordHandle`, `InvalidateHandle`) with post-turn handle awareness,
 * 2. Proactive connection duration timers (soft turn-boundary window + hard buffer deadline, which an answer in
 *    progress may extend to just before the provider limit),
 * 3. Independent credential/relay refresh timer (`ScheduleCredentialRefresh`),
 * 4. Provider `ConnectionEnding(timeLeftMs)` notice (`goAway` / `session.going_away`) with scaled `1/3` margin,
 * 5. Reactive `TriggerReconnect('connection-lost')` trigger,
 * 6. Retry loop bounded by a recovery window (a planned move's window starts when its old connection ends) and
 *    {@link MAX_REALTIME_RESUMPTION_ATTEMPTS}, with capped backoff, an early retry on {@link NotifyNetworkOnline},
 *    per-attempt timeout, `Abandoned` + `AbortSignal` cancellation, and Attempt-2 automatic fallback from native handle
 *    to `RealtimeConversationMemory` seed,
 * 7. Rapid-reconnect sliding-window circuit breaker (`reconnect-loop-breaker`).
 */
export class RealtimeReconnectController {
    private _handle: string | null = null;
    private _resumableNow = false;
    private _turnOpen = false;
    private _awaitingPostToolTurn = false;
    private _toolResultSentDuringOpenTurn = false;
    private _endingAnnounced = false;
    private _inSoftWindow = false;
    private _reconnecting = false;
    /** A cycle is running, but between attempts the call is live again on its old connection (see `ReturnToOldConnection`). */
    private _liveOnOldConnection = false;
    /** The running cycle's old connection was lost (`TriggerReconnect('connection-lost')` during the cycle). */
    private _oldConnectionLost = false;
    /** Ends the wait for the next planned attempt's boundary (see {@link waitForMoveBoundary}). */
    private _wakeBoundaryWait: (() => void) | null = null;
    private _boundaryTimers: Array<ReturnType<typeof setTimeout>> = [];
    private _exhausted = false;
    private _disposed = false;
    private _connectionOpenedAtMs: number | null = null;
    /** When the current connection hits its provider limit (from `ArmDurationTimers`), or `null` when unknown. */
    private _connectionLimitAtMs: number | null = null;
    /** When a `goAway` said the current connection ends, or `null` when none came or it gave no time. */
    private _announcedEndAtMs: number | null = null;
    /** The last call before the end a `goAway` announced (the time its deadline timer moves at), or `null`. */
    private _announcedLastCallAtMs: number | null = null;
    /** The current connection's hard reconnect point (from `ArmDurationTimers`), or `null` when unknown. */
    private _hardPointAtMs: number | null = null;
    private _softTimer: ReturnType<typeof setTimeout> | null = null;
    private _hardTimer: ReturnType<typeof setTimeout> | null = null;
    /** The last-call move armed when the hard point came during an answer; see {@link deferHardMoveToTurnEnd}. */
    private _limitTimer: ReturnType<typeof setTimeout> | null = null;
    /** Margin a deferred hard move keeps before the provider limit, fixed by the buffer when the timers are armed. */
    private _hardMoveMarginMs = 0;
    private _deadlineTimer: ReturnType<typeof setTimeout> | null = null;
    private _retryTimer: ReturnType<typeof setTimeout> | null = null;
    /** Ends the wait for the pending retry timer early (network back, or `Dispose`). */
    private _wakeRetry: (() => void) | null = null;
    private _credentialRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    private _currentAttempt: ActiveAttemptState | null = null;
    private _reconnectPromise: Promise<boolean> | null = null;
    private _rapidReconnectTimestamps: number[] = [];

    constructor(private readonly options: RealtimeReconnectControllerOptions) {}

    /** Latest recorded provider resumption handle, or `null` if none. */
    public get Handle(): string | null {
        return this._handle;
    }

    /**
     * True while an in-place reconnect cycle is running, except while a planned move waits between attempts with the
     * call live again on its old connection (see {@link RealtimeReconnectControllerOptions.ReturnToOldConnection}).
     */
    public get IsReconnecting(): boolean {
        return this._reconnecting && !this._liveOnOldConnection;
    }

    /**
     * True from the start of a reconnect cycle until it succeeds or fails, including while a planned move waits between
     * attempts with the call live again on its old connection (when {@link IsReconnecting} reads `false`). A driver
     * checks it to hand a loss of that old connection to the running cycle instead of treating it as the end of the call.
     */
    public get IsReconnectCycleActive(): boolean {
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

    /** True while any connection-duration timer (soft, hard, or the deferred hard move's last call) is armed. */
    public get HasDurationTimersArmed(): boolean {
        return this._softTimer !== null || this._hardTimer !== null || this._limitTimer !== null;
    }

    /** Records a provider resumption handle and whether the provider marked this point resumable. */
    public RecordHandle(handle: string | null | undefined, resumable = true): void {
        if (!resumable) {
            this._resumableNow = false;
            return;
        }
        const trustsNative = this.trustsNativeResumption();
        if (typeof handle === 'string' && handle.trim().length > 0) {
            this._handle = handle.trim();
            if (trustsNative) {
                this._awaitingPostToolTurn = false;
                this._toolResultSentDuringOpenTurn = false;
            }
            this._resumableNow = !this._turnOpen && !this._awaitingPostToolTurn;
        }
        if (trustsNative && (this._endingAnnounced || this._inSoftWindow) && this._resumableNow && this.isIdle()) {
            void this.TriggerReconnect(this._endingAnnounced ? 'connection-ending' : 'duration-expiry');
        }
    }

    /** Clears the stored resumption handle so subsequent reconnects use history seeding. */
    public InvalidateHandle(): void {
        this._handle = null;
        this._resumableNow = false;
    }

    /**
     * Marks a turn as open so soft-window and `ConnectionEnding` moves wait for the turn boundary, and a hard-point move
     * waits for it until shortly before the provider limit.
     */
    public TurnStarted(): void {
        this._turnOpen = true;
        this._resumableNow = false;
        this._awaitingPostToolTurn = false;
        this._toolResultSentDuringOpenTurn = false;
    }

    /** Marks a turn as ended and triggers any queued soft-window or `ConnectionEnding` move when ready. */
    public TurnEnded(keepPostToolTurnWait = false): void {
        this._turnOpen = false;
        const preserveWait = keepPostToolTurnWait || this._toolResultSentDuringOpenTurn;
        this._toolResultSentDuringOpenTurn = false;
        if (!preserveWait) {
            this._awaitingPostToolTurn = false;
        }
        this.NotifyIdleStateChanged();
    }

    /**
     * Records that a tool result was sent on the active connection.
     * When `expectsReply` is `true` (non-silent tool result), a soft-window or `ConnectionEnding`
     * move waits for the model's post-tool turn (or a fresh trusted native handle that captures
     * the tool output) rather than reconnecting in the gap between `SendToolResult` and the first
     * model output frame.
     */
    public ToolResultSent(expectsReply = true): void {
        this._resumableNow = false;
        if (expectsReply) {
            this._awaitingPostToolTurn = true;
            this._toolResultSentDuringOpenTurn = this._turnOpen;
            return;
        }
        this._awaitingPostToolTurn = false;
        this._toolResultSentDuringOpenTurn = false;
        this.NotifyIdleStateChanged();
    }

    /**
     * Re-evaluates whether a queued soft-window or `ConnectionEnding` reconnect can proceed now that
     * a turn or tool batch has finished.
     */
    public NotifyIdleStateChanged(): void {
        if (this._liveOnOldConnection) {
            this.checkMoveBoundary();
            return;
        }
        if (
            this._disposed ||
            this._exhausted ||
            this._reconnecting ||
            this._turnOpen ||
            this._awaitingPostToolTurn ||
            !this.isIdle()
        ) {
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
        if (this._disposed || this._exhausted) {
            return;
        }
        this._endingAnnounced = true;
        if (timeLeftMs !== undefined) {
            this._announcedEndAtMs = Date.now() + timeLeftMs;
        }
        this._announcedLastCallAtMs = Date.now() + this.deadlineDelayFor(timeLeftMs);
        if (this._reconnecting && !this._liveOnOldConnection) {
            // A move is already under way (an attempt in flight, or the next one due on the retry schedule). The notice
            // is kept (a successful attempt clears it): if an attempt fails and the call goes back to the old connection,
            // the last call is the announced one.
            return;
        }
        if (this._liveOnOldConnection) {
            // A failed move's cycle is waiting on this connection: its next attempt now has this earlier last call.
            this.armBoundaryTimers();
            this.checkMoveBoundary();
            return;
        }
        if (this.isIdle() && !this._awaitingPostToolTurn && !this.shouldWaitForPostTurnHandle()) {
            void this.TriggerReconnect('connection-ending');
            return;
        }
        this.armDeadline(timeLeftMs);
    }

    /**
     * Arms (or re-arms) the proactive soft and hard duration timers for the active connection.
     * Re-arming mid-connection (for example when a dynamic video cap engages or clears) measures
     * remaining time against when the current connection opened and preserves any active
     * `ConnectionEnding` (`goAway`) deadline.
     *
     * @param connectionDeadlineAtMs When the provider ends this connection regardless of its duration limit (epoch ms),
     *   such as the expiry of the credential a Gemini connection opened on. The earlier of the two is the limit the soft
     *   window, the hard point and the hard move's last call measure from.
     */
    public ArmDurationTimers(
        connectionLimitSeconds: number | undefined,
        bufferSeconds: number,
        softLeadCapSeconds: number = DEFAULT_REALTIME_SOFT_RECONNECT_WINDOW_SECONDS,
        connectionDeadlineAtMs?: number
    ): void {
        this.clearDurationTimers();
        if (this._disposed) {
            return;
        }
        const now = Date.now();
        if (this._connectionOpenedAtMs === null) {
            this._connectionOpenedAtMs = now;
        }
        this._inSoftWindow = false;
        this._connectionLimitAtMs = null;
        this._hardPointAtMs = null;

        const durationSeconds = this.effectiveDurationSeconds(connectionLimitSeconds, connectionDeadlineAtMs, this._connectionOpenedAtMs);
        if (durationSeconds === undefined) {
            this.followLimitChangeInBoundaryWait();
            return;
        }
        this._connectionLimitAtMs = this._connectionOpenedAtMs + durationSeconds * 1000;

        const elapsedMs = Math.max(0, now - this._connectionOpenedAtMs);
        const bufferSec = Math.min(bufferSeconds, Math.max(1, Math.floor(durationSeconds / 2)));
        const totalHardMs = Math.max(100, (durationSeconds - bufferSec) * 1000);
        const softLeadSec = Math.min(
            softLeadCapSeconds,
            Math.max(0, Math.floor(durationSeconds * REALTIME_SOFT_WINDOW_DURATION_SHARE))
        );
        const softWindowSec = Math.min(
            Math.floor(durationSeconds * REALTIME_MAX_SOFT_WINDOW_DURATION_SHARE),
            bufferSec + softLeadSec
        );
        const totalSoftMs = Math.max(50, (durationSeconds - softWindowSec) * 1000);
        const remainingHardMs = Math.max(0, totalHardMs - elapsedMs);
        this._hardPointAtMs = this._connectionOpenedAtMs + totalHardMs;
        this._hardMoveMarginMs = this.deadlineMarginFor(Math.max(0, durationSeconds * 1000 - totalHardMs));
        const remainingSoftMs = Math.max(0, totalSoftMs - elapsedMs);

        if (totalSoftMs < totalHardMs) {
            this._softTimer = setTimeout(() => {
                this._softTimer = null;
                if (this._disposed || this._exhausted || this._reconnecting) {
                    return;
                }
                this._inSoftWindow = true;
                if (this.isIdle() && !this._awaitingPostToolTurn && !this.shouldWaitForPostTurnHandle()) {
                    void this.TriggerReconnect('duration-expiry');
                }
            }, remainingSoftMs);
        }

        this._hardTimer = setTimeout(() => {
            this._hardTimer = null;
            if (this._disposed || this._exhausted || this._reconnecting) {
                return;
            }
            if (this._turnOpen || this.options.HoldsHardMove?.() === true) {
                this.deferHardMoveToTurnEnd();
                return;
            }
            void this.TriggerReconnect('duration-expiry');
        }, remainingHardMs);
        this.followLimitChangeInBoundaryWait();
    }

    /**
     * A planned move's cycle is waiting on its old connection while that connection's limit changes (a driver re-arms
     * for a video cap or a credential deadline). The wait's timers follow the new hard point and last call, and a last
     * call that is now earlier can end the wait at once, before the provider closes the connection.
     */
    private followLimitChangeInBoundaryWait(): void {
        if (this._wakeBoundaryWait) {
            this.armBoundaryTimers();
            this.checkMoveBoundary();
        }
    }

    /**
     * The connection's duration: its limit, narrowed to the time from its open to `deadlineAtMs` when that comes first.
     * `undefined` when neither bounds it. A deadline already past leaves one second, so the move happens at once
     * (through the same idle and hold rules) instead of the connection running with no timer at all.
     */
    private effectiveDurationSeconds(
        durationSeconds: number | undefined,
        deadlineAtMs: number | undefined,
        openedAtMs: number
    ): number | undefined {
        const limit =
            typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : undefined;
        if (typeof deadlineAtMs !== 'number' || !Number.isFinite(deadlineAtMs)) {
            return limit;
        }
        const untilDeadline = Math.max(1, (deadlineAtMs - openedAtMs) / 1000);
        return limit === undefined ? untilDeadline : Math.min(limit, untilDeadline);
    }

    /**
     * The hard point came while the model is answering. The buffer before the provider limit exists for this: rather
     * than cut the answer, the move waits for the turn to end and the session to be idle (as a soft-window move does,
     * so the audio tail plays out too), but only until the limit less the margin a reconnect needs. That margin scales
     * with the buffer as for a `goAway` notice ({@link deadlineMarginFor}): a 10 s buffer leaves the answer 6.7 s.
     * Only an open turn, or a driver's `HoldsHardMove` (a user utterance the connection has not answered yet, on a
     * provider whose turn opens only when the answer starts), defers it: anything else that holds a soft-window move
     * (a tool call, or a pending utterance a driver tracks for the soft window only) has its own bound, and the hard
     * point stays the deadline for it.
     */
    private deferHardMoveToTurnEnd(): void {
        const timeLeftMs = this._connectionLimitAtMs === null ? 0 : this._connectionLimitAtMs - Date.now();
        const lastCallMs = Math.max(0, timeLeftMs - this._hardMoveMarginMs);
        this._inSoftWindow = true;
        this.options.Log?.(
            `[RealtimeReconnectController] hard reconnect point reached mid-answer; waiting up to ${lastCallMs} ms for the turn to end`
        );
        this._limitTimer = setTimeout(() => {
            this._limitTimer = null;
            if (!this._disposed && !this._exhausted && !this._reconnecting) {
                this.options.Log?.('[RealtimeReconnectController] provider limit is near; moving mid-answer');
                void this.TriggerReconnect('duration-expiry');
            }
        }, lastCallMs);
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
            if (reason === 'connection-lost') {
                this._oldConnectionLost = true;
                if (this._liveOnOldConnection) {
                    // The connection the call went back to is gone. The driver must hold input from now, not from the
                    // end of the retry delay, so it is told at once; the next attempt still keeps its retry delay.
                    this.leaveOldConnection('connection-lost');
                }
            }
            this.checkMoveBoundary();
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
        this._oldConnectionLost = false;
        this.clearDurationTimers();
        this.clearDeadline();
        this.options.Log?.(`[RealtimeReconnectController] reconnecting (${reason})`);
        this.options.OnReconnecting?.(reason);

        const openedAtMs = this._connectionOpenedAtMs ?? now;
        const elapsedSeconds = Math.max(0, Math.round((now - openedAtMs) / 1000));
        const promise = this.runReconnectLoop(reason, elapsedSeconds).finally(() => {
            this._reconnectPromise = null;
        });
        this._reconnectPromise = promise;
        return promise;
    }

    /**
     * The host reports the network is back (a browser `online` event): a reconnect waiting out a retry delay starts its
     * next attempt now instead of at the end of the delay. Does nothing when no retry is waiting.
     */
    public NotifyNetworkOnline(): void {
        if (this._wakeRetry) {
            this.options.Log?.('[RealtimeReconnectController] network is back; retrying now');
            this.wakeRetry();
        }
    }

    /** Cancels all timers, abandons any in-flight attempt, and prevents further reconnects. */
    public Dispose(): void {
        this._disposed = true;
        this.clearDurationTimers();
        this.clearDeadline();
        this.wakeRetry();
        this.wakeBoundaryWait();
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
        this._liveOnOldConnection = false;
        this._oldConnectionLost = false;
        this._endingAnnounced = false;
        this._inSoftWindow = false;
        this._turnOpen = false;
        this._awaitingPostToolTurn = false;
        this._toolResultSentDuringOpenTurn = false;
        this._resumableNow = false;
        this._handle = null;
        this._connectionOpenedAtMs = null;
        this._connectionLimitAtMs = null;
        this._hardPointAtMs = null;
        this._announcedEndAtMs = null;
        this._announcedLastCallAtMs = null;
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

    /**
     * Makes attempts until one succeeds, the cycle's recovery deadline passes ({@link recoveryDeadlineFor}), or it has
     * made {@link MAX_REALTIME_RESUMPTION_ATTEMPTS}; either limit ends it with `reconnect-failed`. No attempt starts
     * after the deadline, but one already running is allowed to finish (its own timeouts bound it), so the cycle can
     * outlast the deadline by one attempt's preparation and transport timeouts; see
     * {@link REALTIME_RESUMPTION_RECOVERY_WINDOW_MS} for the worst-case numbers.
     *
     * After a failed attempt of a planned move whose old connection still carries the call, the call goes back to live
     * on it ({@link returnToOldConnection}) and the next attempt waits for a move boundary as well as its retry delay;
     * a lost connection's attempts follow the retry schedule alone.
     */
    private async runReconnectLoop(startReason: RealtimeReconnectReason, elapsedSeconds: number): Promise<boolean> {
        let reason = startReason;
        let deadlineMs = this.recoveryDeadlineFor(reason);
        let lastError: Error = new Error('Realtime session reconnect failed');
        let forceSeedFallback = false;
        // The old connection is gone after all: from there the cycle is a lost connection's, with its window. Checked
        // before each attempt and again after a failed one, so a loss noticed while an attempt was in flight extends
        // the window before the cycle decides whether to stop.
        const continueAsLostConnection = (): void => {
            if (this._oldConnectionLost && reason !== 'connection-lost') {
                reason = 'connection-lost';
                deadlineMs = Math.max(deadlineMs, this.recoveryDeadlineFor(reason));
            }
        };

        for (let attempt = 1; attempt <= MAX_REALTIME_RESUMPTION_ATTEMPTS; attempt++) {
            const delayMs = this.retryDelayBefore(attempt);
            if (delayMs > 0) {
                await this.waitBeforeRetry(delayMs);
            }
            if (this._liveOnOldConnection) {
                await this.waitForMoveBoundary();
            }
            if (this._disposed) {
                this._reconnecting = false;
                this._liveOnOldConnection = false;
                return false;
            }
            continueAsLostConnection();
            if (this._liveOnOldConnection) {
                // Still live on the old connection (a loss of it has already left): the attempt starts now.
                this.leaveOldConnection(reason);
            }

            const canUseNative = !forceSeedFallback && this.trustsNativeResumption() && this._handle !== null;
            const handleToUse = canUseNative ? this._handle : null;
            const seed = !canUseNative ? this.options.BuildSeed() : null;
            const attemptState: ActiveAttemptState = {
                Abandoned: false,
                TransportStarted: false,
                Controller: new AbortController(),
            };
            this._currentAttempt = attemptState;
            const controllerSelf = this;
            const context: RealtimeReconnectContext = {
                Reason: reason,
                Attempt: attempt,
                MaxAttempts: MAX_REALTIME_RESUMPTION_ATTEMPTS,
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
                await this.runAttempt(context, attemptState);
                if (this._disposed || attemptState.Abandoned) {
                    this.abandonAttempt(attemptState);
                    this._reconnecting = false;
                    return false;
                }
                this._reconnecting = false;
                this._endingAnnounced = false;
                this._announcedEndAtMs = null;
                this._inSoftWindow = false;
                this._resumableNow = false;
                this._turnOpen = false;
                this._awaitingPostToolTurn = false;
                this._toolResultSentDuringOpenTurn = false;
                this._connectionOpenedAtMs = Date.now();
                this._connectionLimitAtMs = null;
                this._hardPointAtMs = null;
                this._announcedLastCallAtMs = null;
                this._oldConnectionLost = false;
                this.options.OnReconnected?.(canUseNative);
                return true;
            } catch (err) {
                this.abandonAttempt(attemptState);
                lastError = err instanceof Error ? err : new Error(String(err));
                this.options.Log?.(
                    `[RealtimeReconnectController] attempt ${attempt} failed (${reason}): ${lastError.message}`
                );
                // Only a failed transport attempt says anything about the handle: one that failed in its preparation
                // (a credential refresh) never offered it to the provider.
                if (canUseNative && attemptState.TransportStarted) {
                    forceSeedFallback = true;
                    this.InvalidateHandle();
                }
            } finally {
                if (this._currentAttempt === attemptState) {
                    this._currentAttempt = null;
                }
            }

            continueAsLostConnection();
            const stop = this.whyStopAfter(attempt, deadlineMs);
            if (stop) {
                this.options.Log?.(`[RealtimeReconnectController] giving up (${reason}): ${stop}`);
                break;
            }
            this.returnToOldConnection(reason);
        }

        this._reconnecting = false;
        this._exhausted = true;
        if (!this._disposed) {
            this.options.OnReconnectFailed(lastError, 'reconnect-failed');
        }
        return false;
    }

    /**
     * After a failed attempt of a planned move, hands the call back to its old connection while that connection still
     * carries it (see {@link RealtimeReconnectControllerOptions.ReturnToOldConnection}). `true` when the call is live on
     * it again, so the next attempt waits for a move boundary ({@link waitForMoveBoundary}).
     */
    private returnToOldConnection(reason: RealtimeReconnectReason): boolean {
        const lastCallAtMs = this.oldConnectionLastCallAtMs();
        if (
            reason === 'connection-lost' ||
            this._oldConnectionLost ||
            this._disposed ||
            !this.options.ReturnToOldConnection ||
            lastCallAtMs === null ||
            Date.now() >= lastCallAtMs
        ) {
            return false;
        }
        // Set first: the driver resumes sending on the old connection, which it does only when not reconnecting.
        this._liveOnOldConnection = true;
        let returned = false;
        try {
            returned = this.options.ReturnToOldConnection();
        } catch (err) {
            // A throw part way back (a host state handler, a send on a closing transport) must not leave the cycle marked
            // live on a connection nobody is sure about, so it retries on its schedule. The driver may already have let
            // input go, or reported a live state, so it is told the move goes on, as when the call leaves the old
            // connection (unless a loss of that connection, reported meanwhile, has already told it).
            this.options.Log?.(
                `[RealtimeReconnectController] going back to the old connection failed: ${err instanceof Error ? err.message : String(err)}`
            );
            if (this._liveOnOldConnection) {
                this.leaveOldConnection(reason);
            }
            return false;
        }
        if (!returned) {
            this._liveOnOldConnection = false;
            return false;
        }
        this.options.Log?.(
            `[RealtimeReconnectController] the move's attempt failed; the call is live on the old connection until the next boundary (last call in ${lastCallAtMs - Date.now()} ms)`
        );
        return true;
    }

    /**
     * Ends the time a planned move's cycle spent live on its old connection: the next attempt is starting, or that
     * connection was lost. Timers armed while the call was live on it belong to it, so they go, and the driver is told
     * through `OnReconnecting`, exactly once per return.
     */
    private leaveOldConnection(reason: RealtimeReconnectReason): void {
        this._liveOnOldConnection = false;
        this.clearDurationTimers();
        this.clearDeadline();
        this.options.Log?.(`[RealtimeReconnectController] leaving the old connection again (${reason})`);
        this.options.OnReconnecting?.(reason);
    }

    /**
     * The last moment a move off the current connection can start: the provider limit less the hard move's margin, or
     * the time a `goAway`'s deadline timer moves at, whichever comes first. `null` when neither is known.
     */
    private oldConnectionLastCallAtMs(): number | null {
        const fromLimit = this._connectionLimitAtMs === null ? null : this._connectionLimitAtMs - this._hardMoveMarginMs;
        const announced = this._announcedLastCallAtMs;
        if (fromLimit === null) {
            return announced;
        }
        return announced === null ? fromLimit : Math.min(fromLimit, announced);
    }

    /**
     * Waits, with the call live on the old connection, for the moment the next attempt of a planned move may start:
     * the next idle boundary (as a soft-window move waits for), the hard point when no turn or driver hold is open, the
     * last call before the old connection ends, a loss of the old connection, or `Dispose`. The last call bounds it.
     */
    private waitForMoveBoundary(): Promise<void> {
        return new Promise<void>((resolve) => {
            this._wakeBoundaryWait = resolve;
            this.armBoundaryTimers();
            this.checkMoveBoundary();
        });
    }

    /**
     * Arms the timed ends of the boundary wait: the hard point and the last call (re-armed when a `goAway` comes). A
     * timer can fire a moment before its time (timers and the clock are not exact), when the check still says no; the
     * wait would then outlast the last call, so the timers still ahead are armed again after each check.
     */
    private armBoundaryTimers(): void {
        this.clearBoundaryTimers();
        const now = Date.now();
        for (const atMs of [this._hardPointAtMs, this.oldConnectionLastCallAtMs()]) {
            if (atMs !== null && atMs > now) {
                this._boundaryTimers.push(
                    setTimeout(() => {
                        this.checkMoveBoundary();
                        if (this._wakeBoundaryWait) {
                            this.armBoundaryTimers();
                        }
                    }, atMs - now)
                );
            }
        }
    }

    /** Ends the boundary wait when its moment has come; does nothing when no wait is running. */
    private checkMoveBoundary(): void {
        if (this._wakeBoundaryWait && this.isMoveBoundaryReached()) {
            this.wakeBoundaryWait();
        }
    }

    private isMoveBoundaryReached(): boolean {
        if (this._disposed || this._oldConnectionLost) {
            return true;
        }
        const now = Date.now();
        const lastCallAtMs = this.oldConnectionLastCallAtMs();
        if (lastCallAtMs === null || now >= lastCallAtMs) {
            return true;
        }
        const turnHolds = this._turnOpen || this.options.HoldsHardMove?.() === true;
        if (this._hardPointAtMs !== null && now >= this._hardPointAtMs && !turnHolds) {
            return true;
        }
        return !this._turnOpen && !this._awaitingPostToolTurn && this.isIdle() && !this.shouldWaitForPostTurnHandle();
    }

    private wakeBoundaryWait(): void {
        const wake = this._wakeBoundaryWait;
        this._wakeBoundaryWait = null;
        this.clearBoundaryTimers();
        wake?.();
    }

    private clearBoundaryTimers(): void {
        for (const timer of this._boundaryTimers) {
            clearTimeout(timer);
        }
        this._boundaryTimers = [];
    }

    /**
     * When the cycle stops starting attempts. A lost connection gets the recovery window from now. A planned move still
     * has its old connection until the provider limit or the announced end, so its window starts there: a failed
     * refresh or attempt is retried on the healthy connection, and the call ends only once it is truly gone.
     */
    private recoveryDeadlineFor(reason: RealtimeReconnectReason): number {
        const now = Date.now();
        const windowMs = this.options.RecoveryWindowMs ?? REALTIME_RESUMPTION_RECOVERY_WINDOW_MS;
        const oldConnectionEndsAtMs =
            reason === 'duration-expiry'
                ? this._connectionLimitAtMs
                : reason === 'connection-ending'
                  ? this._announcedEndAtMs
                  : null;
        return Math.max(now, oldConnectionEndsAtMs ?? now) + windowMs;
    }

    /** The wait before `attempt`: the listed schedule first, then the backoff cap. */
    private retryDelayBefore(attempt: number): number {
        const delays = this.retryDelays();
        return attempt <= delays.length
            ? (delays[attempt - 1] ?? 0)
            : (this.options.MaxRetryDelayMs ?? REALTIME_RESUMPTION_MAX_RETRY_DELAY_MS);
    }

    /** Why the cycle stops after a failed `attempt`, or `null` to go on. The listed schedule always runs in full. */
    private whyStopAfter(attempt: number, deadlineMs: number): string | null {
        if (attempt >= MAX_REALTIME_RESUMPTION_ATTEMPTS) {
            return `made the maximum of ${MAX_REALTIME_RESUMPTION_ATTEMPTS} attempts`;
        }
        const next = attempt + 1;
        if (next > this.retryDelays().length && Date.now() + this.retryDelayBefore(next) > deadlineMs) {
            return `the recovery window closed after ${attempt} attempts`;
        }
        return null;
    }

    /** Waits `delayMs`, or less when {@link NotifyNetworkOnline} or {@link Dispose} ends the wait. */
    private waitBeforeRetry(delayMs: number): Promise<void> {
        return new Promise<void>((resolve) => {
            this._wakeRetry = resolve;
            this._retryTimer = setTimeout(() => this.wakeRetry(), delayMs);
        });
    }

    private wakeRetry(): void {
        const wake = this._wakeRetry;
        this._wakeRetry = null;
        if (this._retryTimer) {
            clearTimeout(this._retryTimer);
            this._retryTimer = null;
        }
        wake?.();
    }

    /** Runs the attempt's optional preparation, then its transport work, each under its own timeout. */
    private async runAttempt(context: RealtimeReconnectContext, attemptState: ActiveAttemptState): Promise<void> {
        const prepare = this.options.PrepareAttempt;
        if (prepare) {
            const prepareTimeoutMs = this.options.PrepareTimeoutMs ?? REALTIME_RESUMPTION_PREPARE_TIMEOUT_MS;
            await this.withTimeout(prepare(context), attemptState, prepareTimeoutMs, 'preparation');
            if (this._disposed || attemptState.Abandoned) {
                return;
            }
        }
        const timeoutMs = this.options.AttemptTimeoutMs ?? REALTIME_RESUMPTION_ATTEMPT_TIMEOUT_MS;
        attemptState.TransportStarted = true;
        await this.withTimeout(this.options.Reconnect(context), attemptState, timeoutMs, 'attempt');
    }

    private withTimeout(
        work: Promise<void>,
        attemptState: ActiveAttemptState,
        timeoutMs: number,
        phase: 'preparation' | 'attempt'
    ): Promise<void> {
        // After a timeout nobody awaits `work`; log a later failure instead of leaving it unhandled.
        work.catch((err: unknown) => {
            if (attemptState.Abandoned) {
                this.options.Log?.(
                    `[RealtimeReconnectController] reconnect ${phase} failed after its attempt was abandoned: ${
                        err instanceof Error ? err.message : String(err)
                    }`
                );
            }
        });
        let timer: ReturnType<typeof setTimeout> | null = null;
        const timeout = new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
                this.abandonAttempt(attemptState);
                reject(new Error(`reconnect ${phase} timed out after ${timeoutMs} ms`));
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
        const delay = this.deadlineDelayFor(timeLeftMs);
        this._deadlineTimer = setTimeout(() => {
            this._deadlineTimer = null;
            if (!this._disposed && !this._exhausted && !this._reconnecting) {
                void this.TriggerReconnect('connection-ending');
            }
        }, delay);
    }

    /** How long after a `goAway` its deadline timer moves the session: the notice less its margin. */
    private deadlineDelayFor(timeLeftMs: number | undefined): number {
        return timeLeftMs === undefined ? UNKNOWN_TIME_LEFT_DELAY_MS : Math.max(0, timeLeftMs - this.deadlineMarginFor(timeLeftMs));
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
        if (this._limitTimer) {
            clearTimeout(this._limitTimer);
            this._limitTimer = null;
        }
    }

    private clearDeadline(): void {
        if (this._deadlineTimer) {
            clearTimeout(this._deadlineTimer);
            this._deadlineTimer = null;
        }
    }

}


