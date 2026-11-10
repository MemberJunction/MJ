import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    ParseDurationToMs,
    RealtimeReconnectController,
    REALTIME_RESUMPTION_DEADLINE_MARGIN_MS,
    REALTIME_RESUMPTION_MIN_DEADLINE_MARGIN_MS,
    REALTIME_RESUMPTION_RECOVERY_WINDOW_MS,
    MAX_REALTIME_RESUMPTION_ATTEMPTS,
    type RealtimeReconnectControllerOptions,
    type RealtimeReconnectContext,
    type RealtimeReconnectFailureCode,
    type RealtimeReconnectReason,
} from '../generic/realtimeSessionResumption';

describe('ParseDurationToMs', () => {
    it.each([
        ['60s', 60000],
        ['59.5s', 59500],
        [' 3s ', 3000],
    ])('reads %s as %d ms', (value, ms) => {
        expect(ParseDurationToMs(value)).toBe(ms);
    });

    it.each([[undefined], [''], ['60'], ['1m'], ['abc']])('returns undefined for %s', (value) => {
        expect(ParseDurationToMs(value)).toBeUndefined();
    });
});

/** Records every callback the controller makes; `Reconnect` succeeds unless told to fail. */
class Harness {
    public Reconnects: Array<string | null> = [];
    public AttemptTimes: number[] = [];
    public Reconnecting: RealtimeReconnectReason[] = [];
    public Reconnected = 0;
    public Failures: Error[] = [];
    public FailureCodes: RealtimeReconnectFailureCode[] = [];
    public FailNext = 0;
    /** `Reconnect` fails while the fake clock is before this time (a network outage). */
    public FailUntilMs = 0;
    public TrustsNative = true;
    public RequiresPostTurn = true;
    public Idle = true;
    /** The next attempts stay in flight until the test ends them with `SettleAttempt`. */
    public HoldNext = 0;
    public Resumption: RealtimeReconnectController;
    private settleHeldAttempt: ((error?: Error) => void) | null = null;

    constructor(retryDelaysMs?: readonly number[], extra: Partial<RealtimeReconnectControllerOptions> = {}) {
        this.Resumption = new RealtimeReconnectController({
            Reconnect: async (context) => {
                this.Reconnects.push(context.ResumptionHandle);
                this.AttemptTimes.push(Date.now());
                if (this.HoldNext > 0) {
                    this.HoldNext--;
                    await new Promise<void>((resolve, reject) => {
                        this.settleHeldAttempt = (error) => (error ? reject(error) : resolve());
                    });
                    return;
                }
                if (this.FailNext > 0) {
                    this.FailNext--;
                    throw new Error(`connect failed for ${context.ResumptionHandle ?? 'seed'}`);
                }
                if (Date.now() < this.FailUntilMs) {
                    throw new Error('network unreachable');
                }
            },
            OnReconnectFailed: (error, code) => {
                this.Failures.push(error);
                this.FailureCodes.push(code);
            },
            OnReconnecting: (reason) => this.Reconnecting.push(reason),
            OnReconnected: () => this.Reconnected++,
            BuildSeed: () => null,
            IsIdle: () => this.Idle,
            TrustsNativeResumption: () => this.TrustsNative,
            RequiresPostTurnHandle: () => this.RequiresPostTurn,
            RetryDelaysMs: retryDelaysMs,
            ...extra,
        });
    }

    /** Ends the attempt held in flight: it fails with `error`, or connects when there is none. */
    public SettleAttempt(error?: Error): void {
        const settle = this.settleHeldAttempt;
        this.settleHeldAttempt = null;
        settle?.(error);
    }
}

describe('RealtimeReconnectController', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    describe('RecordHandle', () => {
        it('keeps the latest resumable handle', () => {
            const h = new Harness();
            h.Resumption.RecordHandle('h1', true);
            h.Resumption.RecordHandle('h2', true);
            expect(h.Resumption.Handle).toBe('h2');
        });

        it('keeps the previous handle when the provider reports a non-resumable point', () => {
            const h = new Harness();
            h.Resumption.RecordHandle('h1', true);
            h.Resumption.RecordHandle(undefined, false);
            expect(h.Resumption.Handle).toBe('h1');
        });
    });

    describe('connection ending (provider goAway)', () => {
        it('reconnects right away when the latest update was resumable', async () => {
            const h = new Harness();
            h.Resumption.RecordHandle('h1', true);
            h.Resumption.ConnectionEnding(60000);
            await vi.advanceTimersByTimeAsync(0);
            expect(h.Reconnects).toEqual(['h1']);
            expect(h.Reconnecting).toEqual(['connection-ending']);
            expect(h.Reconnected).toBe(1);
        });

        it('waits for the next resumable point instead of resuming from a stale handle', async () => {
            const h = new Harness();
            h.Resumption.RecordHandle('h1', true);
            h.Resumption.RecordHandle(undefined, false); // mid-turn
            h.Resumption.ConnectionEnding(60000);
            await vi.advanceTimersByTimeAsync(1000);
            expect(h.Reconnects).toEqual([]);

            h.Resumption.RecordHandle('h2', true); // turn finished
            await vi.advanceTimersByTimeAsync(0);
            expect(h.Reconnects).toEqual(['h2']);
        });

        it('falls back to the last handle shortly before the deadline when no resumable point arrives', async () => {
            const h = new Harness();
            h.Resumption.RecordHandle('h1', true);
            h.Resumption.RecordHandle(undefined, false);
            h.Resumption.ConnectionEnding(60000);
            await vi.advanceTimersByTimeAsync(60000 - REALTIME_RESUMPTION_DEADLINE_MARGIN_MS - 1);
            expect(h.Reconnects).toEqual([]);
            // The deadline fires at the margin; its zero-delay attempt runs on the next tick.
            await vi.advanceTimersByTimeAsync(2);
            expect(h.Reconnects).toEqual(['h1']);
        });
    });

    // Vertex AI marks every update resumable and sends one 20-70 ms after each turnComplete, never `resumable: false`;
    // these runs replay that cadence (#5354).
    describe('turns (the driver reports them; the provider never says a point is not resumable)', () => {
        it('a goAway mid-answer waits for the turn to end and the handle that follows it', async () => {
            const h = new Harness();
            h.Resumption.RecordHandle('h1', true); // after the previous turn
            h.Resumption.TurnStarted(); // the user asked; the model is answering
            h.Resumption.ConnectionEnding(30000);
            await vi.advanceTimersByTimeAsync(5000);
            expect(h.Reconnects).toEqual([]);

            h.Resumption.TurnEnded(); // turnComplete
            await vi.advanceTimersByTimeAsync(50);
            expect(h.Reconnects).toEqual([]); // h1 predates the turn: resuming from it would drop the answer

            h.Resumption.RecordHandle('h2', true);
            await vi.advanceTimersByTimeAsync(0);
            expect(h.Reconnects).toEqual(['h2']);
            expect(h.Reconnecting).toEqual(['connection-ending']);
        });

        it('a goAway right after a question waits too, though no answer has started', async () => {
            const h = new Harness();
            h.Resumption.RecordHandle('h1', true);
            h.Resumption.TurnStarted(); // the first transcription of the question
            h.Resumption.ConnectionEnding(30000);
            await vi.advanceTimersByTimeAsync(1000);
            expect(h.Reconnects).toEqual([]);

            h.Resumption.TurnEnded();
            h.Resumption.RecordHandle('h2', true);
            await vi.advanceTimersByTimeAsync(0);
            expect(h.Reconnects).toEqual(['h2']);
        });

        it('keeps a resumable handle issued mid-turn as the fallback, without moving on it', async () => {
            const h = new Harness();
            h.Resumption.RecordHandle('h1', true);
            h.Resumption.TurnStarted();
            h.Resumption.ConnectionEnding(30000);
            h.Resumption.RecordHandle('h2', true);
            await vi.advanceTimersByTimeAsync(1000);
            expect(h.Reconnects).toEqual([]);
            expect(h.Resumption.Handle).toBe('h2');

            // A drop resumes from it at once.
            void h.Resumption.TriggerReconnect('connection-lost');
            await vi.advanceTimersByTimeAsync(0);
            expect(h.Reconnects).toEqual(['h2']);
        });

        it('with no answer coming, the deadline still moves the session, with the last handle', async () => {
            const h = new Harness();
            h.Resumption.RecordHandle('h1', true);
            h.Resumption.TurnStarted();
            h.Resumption.ConnectionEnding(30000);
            // 30 s of notice keeps a 10 s margin: the deadline is at 20 s.
            await vi.advanceTimersByTimeAsync(19999);
            expect(h.Reconnects).toEqual([]);
            await vi.advanceTimersByTimeAsync(2);
            expect(h.Reconnects).toEqual(['h1']);
        });

        it('does not move at once on a goAway when the latest handle predates a turn that has since ended', async () => {
            const h = new Harness();
            h.Resumption.RecordHandle('h1', true);
            h.Resumption.TurnStarted();
            h.Resumption.TurnEnded();
            h.Resumption.ConnectionEnding(30000); // in the 20-70 ms before the turn's handle
            await vi.advanceTimersByTimeAsync(10);
            expect(h.Reconnects).toEqual([]);

            h.Resumption.RecordHandle('h2', true);
            await vi.advanceTimersByTimeAsync(0);
            expect(h.Reconnects).toEqual(['h2']);
        });

        it('moves at once on a goAway when a handle arrived after the last turn ended', async () => {
            const h = new Harness();
            h.Resumption.TurnStarted();
            h.Resumption.TurnEnded();
            h.Resumption.RecordHandle('h1', true);
            h.Resumption.ConnectionEnding(30000);
            await vi.advanceTimersByTimeAsync(0);
            expect(h.Reconnects).toEqual(['h1']);
        });

        it('a resume ends the turn it cut off: the next planned move does not wait for it', async () => {
            const h = new Harness();
            h.Resumption.RecordHandle('h1', true);
            h.Resumption.TurnStarted();
            void h.Resumption.TriggerReconnect('connection-lost');
            await vi.advanceTimersByTimeAsync(0);
            expect(h.Reconnected).toBe(1);

            h.Resumption.RecordHandle('h2', true);
            h.Resumption.ConnectionEnding(30000);
            await vi.advanceTimersByTimeAsync(0);
            expect(h.Reconnects).toEqual(['h1', 'h2']);
        });
    });

    // A notice of 10 s or less used to move at once, cutting the turn (#5313).
    describe('deadline margin (scaled to the notice)', () => {
        it.each([
            [60000, 50000],
            [30000, 20000],
            [9000, 6000],
            [5000, 3333],
            [3000, 1500],
        ])('with %d ms of notice and no resumable point, moves %d ms after the goAway', async (notice, movesAt) => {
            const h = new Harness();
            h.Resumption.RecordHandle('h1', true);
            h.Resumption.TurnStarted();
            h.Resumption.ConnectionEnding(notice);
            await vi.advanceTimersByTimeAsync(movesAt - 1);
            expect(h.Reconnects).toEqual([]);
            await vi.advanceTimersByTimeAsync(2);
            expect(h.Reconnects).toEqual(['h1']);
        });

        it('moves at once when the notice is shorter than what a reconnect needs', async () => {
            const h = new Harness();
            h.Resumption.RecordHandle('h1', true);
            h.Resumption.TurnStarted();
            h.Resumption.ConnectionEnding(REALTIME_RESUMPTION_MIN_DEADLINE_MARGIN_MS - 500);
            // The deadline fires at once; its zero-delay attempt runs on the next tick.
            await vi.advanceTimersByTimeAsync(2);
            expect(h.Reconnects).toEqual(['h1']);
        });

        it('a 5 s notice with a turn that ends in 2 s does not cut the turn', async () => {
            const h = new Harness();
            h.Resumption.RecordHandle('h1', true);
            h.Resumption.TurnStarted();
            h.Resumption.ConnectionEnding(5000);
            await vi.advanceTimersByTimeAsync(2000);
            h.Resumption.TurnEnded();
            await vi.advanceTimersByTimeAsync(50);
            h.Resumption.RecordHandle('h2', true);
            await vi.advanceTimersByTimeAsync(5000);
            expect(h.Reconnects).toEqual(['h2']);
        });

        it('a 5 s notice with a turn that does not end cuts it, with the last handle, before the deadline', async () => {
            const h = new Harness();
            h.Resumption.RecordHandle('h1', true);
            h.Resumption.TurnStarted();
            h.Resumption.ConnectionEnding(5000);
            await vi.advanceTimersByTimeAsync(5000);
            expect(h.Reconnects).toEqual(['h1']);
        });

        it('keeps at most DeadlineMarginMs when it is set', async () => {
            const reasons: RealtimeReconnectReason[] = [];
            const resumption = new RealtimeReconnectController({
                Reconnect: async () => undefined,
                OnReconnectFailed: () => undefined,
                OnReconnecting: (reason) => reasons.push(reason),
                BuildSeed: () => null,
                TrustsNativeResumption: () => true,
                RequiresPostTurnHandle: () => true,
                DeadlineMarginMs: 2000,
            });
            resumption.RecordHandle('h1', true);
            resumption.TurnStarted();
            resumption.ConnectionEnding(30000);
            await vi.advanceTimersByTimeAsync(27999);
            expect(reasons).toEqual([]);
            await vi.advanceTimersByTimeAsync(1);
            expect(reasons).toEqual(['connection-ending']);
        });
    });

    describe('post-tool-result timing (#13)', () => {
        it('in seed mode, ToolResultSent(true) holds soft-window and goAway reconnects until the post-tool turn ends', async () => {
            const h = new Harness();
            h.TrustsNative = false;
            h.RequiresPostTurn = false;
            h.Resumption.ArmDurationTimers(60, 10);

            // Advance into the soft window (41s) while a tool call is pending
            h.Idle = false;
            await vi.advanceTimersByTimeAsync(42_000);
            expect(h.Reconnects).toEqual([]);

            // Tool result is sent; pending tool calls are now 0 (Idle = true), but we await the model's post-tool turn
            h.Idle = true;
            h.Resumption.ToolResultSent(true);
            await vi.advanceTimersByTimeAsync(500);
            expect(h.Reconnects).toEqual([]);

            // Post-tool turn starts and finishes
            h.Resumption.TurnStarted();
            await vi.advanceTimersByTimeAsync(500);
            expect(h.Reconnects).toEqual([]);

            h.Resumption.TurnEnded();
            await vi.advanceTimersByTimeAsync(0);
            expect(h.Reconnects).toEqual([null]);
            expect(h.Reconnecting).toEqual(['duration-expiry']);
        });

        it('ToolResultSent(false) for a silent tool result allows an idle soft-window reconnect immediately', async () => {
            const h = new Harness();
            h.TrustsNative = false;
            h.RequiresPostTurn = false;
            h.Resumption.ArmDurationTimers(60, 10);

            h.Idle = false;
            await vi.advanceTimersByTimeAsync(42_000);
            expect(h.Reconnects).toEqual([]);

            h.Idle = true;
            h.Resumption.ToolResultSent(false);
            await vi.advanceTimersByTimeAsync(0);
            expect(h.Reconnects).toEqual([null]);
        });

        it('preserves awaitingPostToolTurn when a non-blocking ToolResultSent(true) arrives while the pre-tool turn is still open (#30)', async () => {
            const h = new Harness();
            h.TrustsNative = false;
            h.RequiresPostTurn = false;
            h.Resumption.ArmDurationTimers(60, 10);

            // Model is speaking (turn open) when the soft window is entered
            h.Idle = false;
            h.Resumption.TurnStarted();
            await vi.advanceTimersByTimeAsync(42_000);
            expect(h.Reconnects).toEqual([]);

            // Non-blocking tool result is sent while the model's pre-tool turn is still open
            h.Resumption.ToolResultSent(true);

            // The pre-tool turn ends; the controller must STILL wait for the post-tool reply turn
            h.Idle = true;
            h.Resumption.TurnEnded();
            await vi.advanceTimersByTimeAsync(500);
            expect(h.Reconnects).toEqual([]);

            // Now the post-tool reply turn starts and ends -> reconnect fires
            h.Idle = false;
            h.Resumption.TurnStarted();
            await vi.advanceTimersByTimeAsync(200);
            expect(h.Reconnects).toEqual([]);

            h.Idle = true;
            h.Resumption.TurnEnded();
            await vi.advanceTimersByTimeAsync(0);
            expect(h.Reconnects).toEqual([null]);
        });
    });

    describe('ArmDurationTimers mid-connection re-arming (#26)', () => {
        it('measures remaining time from when the connection opened and preserves an active goAway deadline', async () => {
            const h = new Harness();
            h.TrustsNative = false;
            h.RequiresPostTurn = false;

            // Connection opens at t=0 with 600s cap (hard at 590s, soft at 560s)
            h.Resumption.ArmDurationTimers(600, 10);
            await vi.advanceTimersByTimeAsync(100_000);

            // At t=100s, uncompressed video starts (120s cap -> totalHardMs=110s, totalSoftMs=92s)
            // Because 100s > 92s, soft window fires at once (0ms remaining) and hard timer is 10s away
            h.Idle = false; // mid-turn so soft window waits
            h.Resumption.ConnectionEnding(15_000); // goAway also announced with 15s (deadline in 10s)
            h.Resumption.ArmDurationTimers(120, 10);

            // Video stops at t=102s and re-arms back to 600s:
            // - remaining hard time is 590s - 102s = 488s (not a fresh 590s!)
            // - the active goAway deadline (8s left) is NOT cleared!
            await vi.advanceTimersByTimeAsync(2_000);
            h.Resumption.ArmDurationTimers(600, 10);

            // 8s later (t=110s), the preserved goAway deadline fires
            await vi.advanceTimersByTimeAsync(8_000);
            expect(h.Reconnecting).toEqual(['connection-ending']);
        });
    });

    // F14: Google closes a Gemini connection opened on an ephemeral token when the token expires. A deadline before the
    // connection limit is the connection's real end, so the soft window, hard point and last call measure from it.
    describe('a connection deadline before the connection limit (F14)', () => {
        function seedHarness(): Harness {
            const h = new Harness();
            h.TrustsNative = false;
            h.RequiresPostTurn = false;
            return h;
        }

        it('opens the soft window before the deadline, not before the connection limit', async () => {
            const h = seedHarness();
            const t0 = Date.now();
            // 300 s left: soft window (10 s buffer + 30 s lead) at 260 s, instead of at 560 s for the 600 s limit.
            h.Resumption.ArmDurationTimers(600, 10, 30, t0 + 300_000);
            await vi.advanceTimersByTimeAsync(259_999);
            expect(h.Reconnecting).toEqual([]);
            await vi.advanceTimersByTimeAsync(1);
            expect(h.Reconnecting).toEqual(['duration-expiry']);
        });

        it('holds the move for an answer only until the margin before the deadline', async () => {
            const h = seedHarness();
            const t0 = Date.now();
            h.Resumption.ArmDurationTimers(600, 10, 30, t0 + 300_000);
            await vi.advanceTimersByTimeAsync(250_000);
            h.Resumption.TurnStarted();
            await vi.advanceTimersByTimeAsync(46_000); // past the hard point (290 s): the answer holds it
            expect(h.Reconnecting).toEqual([]);
            await vi.advanceTimersByTimeAsync(1_000); // 300 s - 3333 ms margin = 296.667 s
            expect(h.Reconnecting).toEqual(['duration-expiry']);
        });

        it('a deadline after the connection limit changes nothing', async () => {
            const h = seedHarness();
            const t0 = Date.now();
            h.Resumption.ArmDurationTimers(600, 10, 30, t0 + 1_800_000);
            await vi.advanceTimersByTimeAsync(559_999);
            expect(h.Reconnecting).toEqual([]);
            await vi.advanceTimersByTimeAsync(1);
            expect(h.Reconnecting).toEqual(['duration-expiry']);
        });
    });

    // ConnectionMaxSeconds 45 with a 10 s buffer, as in the #6462 smoke: soft window at 29 s, hard point at 35 s,
    // provider limit at 45 s. The margin kept before the limit scales with the buffer like a goAway notice: 3333 ms.
    describe('the hard point during an answer (F2)', () => {
        const HARD_POINT_MS = 35_000;
        const LIMIT_MS = 45_000;
        const MARGIN_MS = 3_333;

        let t0 = 0;
        beforeEach(() => {
            t0 = Date.now();
        });
        /** Moves the fake clock to `ms` after the connection opened. */
        async function advanceTo(ms: number): Promise<void> {
            await vi.advanceTimersByTimeAsync(t0 + ms - Date.now());
        }

        function seedHarness(): Harness {
            const h = new Harness();
            h.TrustsNative = false;
            h.RequiresPostTurn = false;
            return h;
        }

        it('does not swap at the hard point while the model is answering, and swaps when the answer ends', async () => {
            const h = seedHarness();
            h.Resumption.ArmDurationTimers(45, 10);
            h.Idle = false; // the user is still talking when the soft window opens, so it waits
            await vi.advanceTimersByTimeAsync(34_000);
            h.Resumption.TurnStarted();

            await advanceTo(HARD_POINT_MS + 2_000);
            expect(h.Reconnecting).toEqual([]);

            h.Idle = true;
            h.Resumption.TurnEnded();
            await vi.advanceTimersByTimeAsync(0);
            expect(h.Reconnecting).toEqual(['duration-expiry']);
            expect(h.AttemptTimes[0] - t0).toBe(HARD_POINT_MS + 2_000);
        });

        it('after the answer, still waits for the rest of the turn (audio tail) to be idle', async () => {
            const h = seedHarness();
            h.Resumption.ArmDurationTimers(45, 10);
            h.Idle = false; // the user is still talking when the soft window opens, so it waits
            await vi.advanceTimersByTimeAsync(34_000);
            h.Resumption.TurnStarted();
            await vi.advanceTimersByTimeAsync(2_000);

            h.Resumption.TurnEnded(); // the response is done, its audio still plays
            await vi.advanceTimersByTimeAsync(1_000);
            expect(h.Reconnecting).toEqual([]);

            h.Idle = true;
            h.Resumption.NotifyIdleStateChanged();
            await vi.advanceTimersByTimeAsync(0);
            expect(h.Reconnecting).toEqual(['duration-expiry']);
        });

        it('cuts an answer that outlasts the buffer only when the provider limit is near', async () => {
            const h = seedHarness();
            h.Resumption.ArmDurationTimers(45, 10);
            h.Idle = false; // the user is still talking when the soft window opens, so it waits
            await vi.advanceTimersByTimeAsync(30_000);
            h.Resumption.TurnStarted();

            await advanceTo(LIMIT_MS - MARGIN_MS - 1);
            expect(h.Reconnecting).toEqual([]);
            await vi.advanceTimersByTimeAsync(2);
            expect(h.Reconnecting).toEqual(['duration-expiry']);
        });

        it('still swaps at the hard point when no turn is open', async () => {
            const h = seedHarness();
            h.Resumption.ArmDurationTimers(45, 10);
            h.Idle = false; // something else (a pending utterance, a tool) holds the soft window
            await advanceTo(HARD_POINT_MS + 1);
            expect(h.Reconnecting).toEqual(['duration-expiry']);
            expect(h.AttemptTimes[0] - t0).toBe(HARD_POINT_MS);
        });

        // F16: Gemini opens the turn only once the answer starts, so a driver holds the hard point for the user's words
        // the connection has not answered yet; the hold has the same bound as an open turn.
        it('a driver hold (HoldsHardMove) defers the hard point like an open turn, until the hold ends', async () => {
            let holding = true;
            const h = new Harness(undefined, { HoldsHardMove: () => holding });
            h.TrustsNative = false;
            h.RequiresPostTurn = false;
            h.Resumption.ArmDurationTimers(45, 10);
            h.Idle = false; // the unanswered words hold the soft window too
            await advanceTo(HARD_POINT_MS + 2_000);
            expect(h.Reconnecting).toEqual([]);

            holding = false;
            h.Idle = true;
            h.Resumption.NotifyIdleStateChanged();
            await vi.advanceTimersByTimeAsync(0);
            expect(h.Reconnecting).toEqual(['duration-expiry']);
            expect(h.AttemptTimes[0] - t0).toBe(HARD_POINT_MS + 2_000);
        });

        it('a driver hold that never ends still moves when the provider limit is near', async () => {
            const h = new Harness(undefined, { HoldsHardMove: () => true });
            h.TrustsNative = false;
            h.RequiresPostTurn = false;
            h.Resumption.ArmDurationTimers(45, 10);
            h.Idle = false;
            await advanceTo(LIMIT_MS - MARGIN_MS - 1);
            expect(h.Reconnecting).toEqual([]);
            await vi.advanceTimersByTimeAsync(2);
            expect(h.Reconnecting).toEqual(['duration-expiry']);
        });

        it('a waiting hard move keeps the F10 retry window until the old connection ends', async () => {
            let failUntil = Number.POSITIVE_INFINITY;
            const h = new Harness(undefined, {
                RecoveryWindowMs: 0,
                PrepareAttempt: async () => {
                    if (Date.now() < failUntil) {
                        throw new Error('token refresh failed');
                    }
                },
            });
            h.TrustsNative = false;
            h.RequiresPostTurn = false;
            h.Resumption.ArmDurationTimers(45, 10);
            h.Idle = false; // the user is still talking when the soft window opens, so it waits
            await vi.advanceTimersByTimeAsync(34_000);
            h.Resumption.TurnStarted();
            await vi.advanceTimersByTimeAsync(3_000);
            h.Idle = true;
            h.Resumption.TurnEnded();
            failUntil = Date.now() + 2_000;
            await advanceTo(LIMIT_MS);
            expect(h.Failures).toEqual([]);
            expect(h.Reconnected).toBe(1);
        });

        it('re-arming the timers while the hard move waits recomputes it against the same connection', async () => {
            const h = seedHarness();
            h.Resumption.ArmDurationTimers(45, 10);
            h.Idle = false; // the user is still talking when the soft window opens, so it waits
            await vi.advanceTimersByTimeAsync(34_000);
            h.Resumption.TurnStarted();
            await vi.advanceTimersByTimeAsync(2_000);
            h.Resumption.ArmDurationTimers(45, 10);
            await advanceTo(LIMIT_MS - MARGIN_MS - 1);
            expect(h.Reconnecting).toEqual([]);
            await vi.advanceTimersByTimeAsync(2);
            expect(h.Reconnecting).toEqual(['duration-expiry']);
        });
    });

    describe('connection lost & retries', () => {
        it('reconnects with the last handle and reports success', async () => {
            const h = new Harness();
            h.Resumption.RecordHandle('h1', true);
            const p = h.Resumption.TriggerReconnect('connection-lost');
            expect(h.Resumption.IsReconnecting).toBe(true);
            await vi.advanceTimersByTimeAsync(0);
            expect(await p).toBe(true);
            expect(h.Reconnects).toEqual(['h1']);
            expect(h.Reconnecting).toEqual(['connection-lost']);
            expect(h.Reconnected).toBe(1);
            expect(h.Resumption.IsReconnecting).toBe(false);
        });

        it('retries on the delay schedule, falling back from native handle to seed on Attempt 2, then reports failure once and stops', async () => {
            // No recovery window: only the listed schedule runs.
            const h = new Harness([0, 1000, 3000], { RecoveryWindowMs: 0 });
            h.FailNext = 3;
            h.Resumption.RecordHandle('h1', true);
            void h.Resumption.TriggerReconnect('connection-lost');
            await vi.advanceTimersByTimeAsync(0);
            expect(h.Reconnects).toEqual(['h1']);
            await vi.advanceTimersByTimeAsync(999);
            expect(h.Reconnects).toHaveLength(1);
            await vi.advanceTimersByTimeAsync(1);
            expect(h.Reconnects).toEqual(['h1', null]);
            await vi.advanceTimersByTimeAsync(3000);
            expect(h.Reconnects).toEqual(['h1', null, null]);
            expect(h.Failures).toHaveLength(1);
            expect(h.Reconnected).toBe(0);
            // Exhausted: a later drop does not start another round.
            expect(await h.Resumption.TriggerReconnect('connection-lost')).toBe(false);
        });

        // Live (#6462 smoke, F10): a 10 s network cut ended the call at ~4 s, because the only attempts were at
        // 0 / 1 / 3 s. Wi-Fi roaming, a VPN reconnect or a tunnel lasts longer than that.
        it('recovers from a 10 s outage by retrying past the initial schedule, inside the recovery window (F10)', async () => {
            const h = new Harness();
            h.FailUntilMs = Date.now() + 10_000;
            h.Resumption.RecordHandle('h1', true);
            const result = h.Resumption.TriggerReconnect('connection-lost');
            await vi.advanceTimersByTimeAsync(20_000);
            expect(await result).toBe(true);
            expect(h.Failures).toEqual([]);
            expect(h.Reconnected).toBe(1);
            expect(h.Reconnects.length).toBeGreaterThan(3);
        });

        it('ends with reconnect-failed once an outage outlasts the recovery window (F10)', async () => {
            const startedAt = Date.now();
            const h = new Harness();
            h.FailUntilMs = Number.POSITIVE_INFINITY;
            const result = h.Resumption.TriggerReconnect('connection-lost');
            await vi.advanceTimersByTimeAsync(40_000);
            expect(h.Failures).toEqual([]);
            expect(h.Resumption.IsReconnecting).toBe(true);
            await vi.advanceTimersByTimeAsync(10_000);
            expect(await result).toBe(false);
            expect(h.FailureCodes).toEqual(['reconnect-failed']);
            expect(h.Failures[0].message).toBe('network unreachable');
            // Attempts went on past the old 0 / 1 / 3 s schedule, and none started after the window closed.
            expect(h.AttemptTimes.length).toBeGreaterThan(3);
            expect(h.AttemptTimes.at(-1)! - startedAt).toBeLessThanOrEqual(REALTIME_RESUMPTION_RECOVERY_WINDOW_MS);
        });

        it('stops at MAX_REALTIME_RESUMPTION_ATTEMPTS however long the window is (F10)', async () => {
            const h = new Harness([0], { RecoveryWindowMs: 24 * 3600_000, MaxRetryDelayMs: 1 });
            h.FailUntilMs = Number.POSITIVE_INFINITY;
            const result = h.Resumption.TriggerReconnect('connection-lost');
            await vi.advanceTimersByTimeAsync(60_000);
            expect(await result).toBe(false);
            expect(h.Reconnects).toHaveLength(MAX_REALTIME_RESUMPTION_ATTEMPTS);
            expect(h.FailureCodes).toEqual(['reconnect-failed']);
        });

        it('starts the next attempt at once when the host reports the network is back (F10)', async () => {
            const h = new Harness([0], { MaxRetryDelayMs: 5000 });
            h.FailUntilMs = Date.now() + 2000;
            const result = h.Resumption.TriggerReconnect('connection-lost');
            await vi.advanceTimersByTimeAsync(2500);
            expect(h.Reconnects).toHaveLength(1);
            h.Resumption.NotifyNetworkOnline();
            await vi.advanceTimersByTimeAsync(0);
            expect(h.Reconnects).toHaveLength(2);
            expect(await result).toBe(true);
        });

        it('ends a reconnect waiting out a retry delay when disposed', async () => {
            const h = new Harness([0, 5000]);
            h.FailNext = 1;
            const result = h.Resumption.TriggerReconnect('connection-lost');
            await vi.advanceTimersByTimeAsync(100);
            h.Resumption.Dispose();
            expect(await result).toBe(false);
            expect(h.Reconnects).toHaveLength(1);
        });

        it('does not start a second reconnect while one is running', async () => {
            const h = new Harness([0, 1000]);
            h.FailNext = 1;
            h.Resumption.RecordHandle('h1', true);
            const p1 = h.Resumption.TriggerReconnect('connection-lost');
            const p2 = h.Resumption.TriggerReconnect('connection-lost');
            expect(p1).toBe(p2);
            await vi.advanceTimersByTimeAsync(1000);
            expect(await p1).toBe(true);
            expect(h.Reconnecting).toEqual(['connection-lost']);
            expect(h.Reconnects).toHaveLength(2);
        });
    });

    // Live (#6462 smoke, F10, A6/A9/R6): a timed move starts while the old connection still has time left (on a 600 s
    // cap, 40 s). When the token refresh failed 3 times in 4 s the call ended, though the old connection was healthy.
    describe('a planned move whose attempts fail while the old connection is still open (F10)', () => {
        function plannedHarness(extra: Partial<RealtimeReconnectControllerOptions>, failPrepareUntilMs: () => number): Harness {
            const h = new Harness(undefined, {
                PrepareAttempt: async () => {
                    if (Date.now() < failPrepareUntilMs()) {
                        throw new Error('token refresh failed');
                    }
                },
                ...extra,
            });
            h.TrustsNative = false;
            h.RequiresPostTurn = false;
            return h;
        }

        it('keeps retrying when the refresh fails for 5 s at the soft window, and moves once it succeeds', async () => {
            let failUntil = Number.POSITIVE_INFINITY;
            const h = plannedHarness({}, () => failUntil);
            h.Resumption.ArmDurationTimers(600, 10); // soft window at 560 s, provider limit at 600 s
            await vi.advanceTimersByTimeAsync(560_000);
            expect(h.Reconnecting).toEqual(['duration-expiry']);
            failUntil = Date.now() + 5000;
            await vi.advanceTimersByTimeAsync(15_000);
            expect(h.Failures).toEqual([]);
            expect(h.Reconnected).toBe(1);
        });

        it('retries until the provider limit even with no recovery window, then ends with reconnect-failed', async () => {
            const h = plannedHarness({ RecoveryWindowMs: 0 }, () => Number.POSITIVE_INFINITY);
            h.Resumption.ArmDurationTimers(600, 10);
            await vi.advanceTimersByTimeAsync(560_000 + 35_000);
            expect(h.Failures).toEqual([]);
            expect(h.Resumption.IsReconnecting).toBe(true);
            await vi.advanceTimersByTimeAsync(10_000);
            expect(h.FailureCodes).toEqual(['reconnect-failed']);
            expect(h.Failures[0].message).toBe('token refresh failed');
        });

        it('retries until the end a goAway announced, not only the initial schedule', async () => {
            const h = plannedHarness({ RecoveryWindowMs: 0 }, () => Number.POSITIVE_INFINITY);
            h.Resumption.ConnectionEnding(30_000);
            await vi.advanceTimersByTimeAsync(25_000);
            expect(h.Failures).toEqual([]);
            await vi.advanceTimersByTimeAsync(10_000);
            expect(h.FailureCodes).toEqual(['reconnect-failed']);
        });
    });

    // #34: a failed planned attempt used to keep the client on 'connecting' (Gemini's mic held) and retry on the backoff
    // schedule, whatever the turn. Now the call goes back to live on the healthy old connection, and the next attempt
    // waits for the next idle boundary, or the hard point, or the last call before the provider limit.
    describe('a failed planned attempt goes back to live on the old connection (#34)', () => {
        // ArmDurationTimers(600, 10): soft window at 560 s, hard point at 590 s, provider limit at 600 s, and the
        // last call 3.333 s before the limit.
        const SOFT_MS = 560_000;
        const HARD_MS = 590_000;
        const LAST_CALL_MS = 600_000 - 3_333;
        let t0 = 0;
        let returns = 0;
        beforeEach(() => {
            t0 = Date.now();
            returns = 0;
        });
        async function advanceTo(ms: number): Promise<void> {
            await vi.advanceTimersByTimeAsync(t0 + ms - Date.now());
        }
        /** A seed-mode harness whose first attempt fails at the soft window; `canReturn` is the driver's answer. */
        async function failedAtSoftWindow(canReturn = true): Promise<Harness> {
            const h = new Harness(undefined, {
                ReturnToOldConnection: () => {
                    returns++;
                    return canReturn;
                },
            });
            h.TrustsNative = false;
            h.RequiresPostTurn = false;
            h.FailNext = 1;
            h.Resumption.ArmDurationTimers(600, 10);
            await advanceTo(SOFT_MS);
            expect(h.Reconnects).toHaveLength(1);
            return h;
        }

        it('reports the call live again on the old connection, and retries at the next idle boundary', async () => {
            const h = await failedAtSoftWindow();
            expect(returns).toBe(1);
            expect(h.Resumption.IsReconnecting).toBe(false);
            h.Resumption.TurnStarted(); // the user asks something on the old connection
            await advanceTo(SOFT_MS + 10_000);
            expect(h.Reconnects).toHaveLength(1);

            h.Resumption.TurnEnded();
            await vi.advanceTimersByTimeAsync(0);
            expect(h.Reconnects).toHaveLength(2);
            expect(h.Reconnecting).toEqual(['duration-expiry', 'duration-expiry']);
            expect(h.Reconnected).toBe(1);
            expect(h.Failures).toEqual([]);
        });

        it('waits out the retry delay even when the boundary has already come', async () => {
            const h = await failedAtSoftWindow();
            await vi.advanceTimersByTimeAsync(999);
            expect(h.Reconnects).toHaveLength(1);
            await vi.advanceTimersByTimeAsync(1);
            expect(h.Reconnects).toHaveLength(2);
        });

        it('a pending utterance (the driver is not idle) holds the retry until the hard point', async () => {
            const h = await failedAtSoftWindow();
            h.Idle = false;
            await advanceTo(HARD_MS - 1);
            expect(h.Reconnects).toHaveLength(1);
            await advanceTo(HARD_MS);
            expect(h.Reconnects).toHaveLength(2);
        });

        it('an open turn holds the retry past the hard point, until the last call before the provider limit', async () => {
            const h = await failedAtSoftWindow();
            h.Resumption.TurnStarted();
            await advanceTo(LAST_CALL_MS - 1);
            expect(h.Reconnects).toHaveLength(1);
            await advanceTo(LAST_CALL_MS);
            expect(h.Reconnects).toHaveLength(2);
        });

        it('retries as a lost connection once the old connection is lost while live on it', async () => {
            const h = await failedAtSoftWindow();
            h.Resumption.TurnStarted();
            await advanceTo(SOFT_MS + 5_000);
            void h.Resumption.TriggerReconnect('connection-lost');
            await vi.advanceTimersByTimeAsync(0);
            expect(h.Reconnects).toHaveLength(2);
            expect(h.Reconnecting).toEqual(['duration-expiry', 'connection-lost']);
        });

        it('keeps the retry schedule when the driver cannot go back to the old connection', async () => {
            const h = await failedAtSoftWindow(false);
            expect(returns).toBe(1);
            h.Resumption.TurnStarted();
            await vi.advanceTimersByTimeAsync(1_000);
            expect(h.Reconnects).toHaveLength(2);
        });

        it('a goAway while live on the old connection moves the last call up to its deadline', async () => {
            const h = await failedAtSoftWindow();
            h.Resumption.TurnStarted();
            await advanceTo(SOFT_MS + 2_000);
            h.Resumption.ConnectionEnding(6_000); // ends at 568 s; the margin is 2 s
            await advanceTo(SOFT_MS + 2_000 + 3_999);
            expect(h.Reconnects).toHaveLength(1);
            await advanceTo(SOFT_MS + 2_000 + 4_000);
            expect(h.Reconnects).toHaveLength(2);
        });

        // Before, a loss during the retry delay left IsReconnecting false until the delay ended: the driver kept
        // sending into a dead transport for up to 5 s.
        it('a loss of the old connection during the retry delay holds input at once and tells the driver once', async () => {
            const h = await failedAtSoftWindow();
            expect(h.Resumption.IsReconnectCycleActive).toBe(true);
            await vi.advanceTimersByTimeAsync(200); // inside the 1 s retry delay
            void h.Resumption.TriggerReconnect('connection-lost');
            expect(h.Resumption.IsReconnecting).toBe(true);
            expect(h.Reconnecting).toEqual(['duration-expiry', 'connection-lost']);

            await vi.advanceTimersByTimeAsync(799);
            expect(h.Reconnects).toHaveLength(1); // the retry delay still runs
            await vi.advanceTimersByTimeAsync(1);
            expect(h.Reconnects).toHaveLength(2);
            expect(h.Reconnecting).toEqual(['duration-expiry', 'connection-lost']);
            expect(h.Resumption.IsReconnectCycleActive).toBe(false);
        });

        it('a boundary timer that fires a moment early is armed again, so the wait still ends at the last call', async () => {
            const h = await failedAtSoftWindow();
            h.Resumption.TurnStarted(); // the answer holds the next attempt until the last call
            await advanceTo(SOFT_MS + 1_000); // the retry delay is over; the boundary wait has armed its timers
            vi.setSystemTime(Date.now() - 5); // the clock now reads 5 ms behind the timers: each fires 5 ms early
            await advanceTo(LAST_CALL_MS);
            expect(h.Reconnects).toHaveLength(2);
            expect(h.AttemptTimes[1] - t0).toBe(LAST_CALL_MS);
        });

        it('a connection limit that shrinks while the call waits on the old connection moves the wait up to its new last call', async () => {
            const h = await failedAtSoftWindow();
            h.Resumption.TurnStarted(); // the answer holds the next attempt until the last call
            await advanceTo(SOFT_MS + 2_000); // the boundary wait has armed its timers for the 600 s limit
            h.Resumption.ArmDurationTimers(580, 10); // a driver re-arms for a shorter connection (a video cap)
            const shrunkLastCallMs = 580_000 - 3_333;
            await advanceTo(shrunkLastCallMs - 1);
            expect(h.Reconnects).toHaveLength(1);
            await advanceTo(shrunkLastCallMs);
            expect(h.Reconnects).toHaveLength(2);
            expect(h.AttemptTimes[1] - t0).toBe(shrunkLastCallMs);
        });

        it('a goAway during an attempt in flight moves up the last call the call goes back to the old connection with', async () => {
            const h = new Harness(undefined, { ReturnToOldConnection: () => ++returns > 0 });
            h.TrustsNative = false;
            h.RequiresPostTurn = false;
            h.HoldNext = 1;
            h.Resumption.ArmDurationTimers(600, 10);
            await advanceTo(SOFT_MS);
            expect(h.Reconnects).toHaveLength(1);
            await advanceTo(SOFT_MS + 1_000);
            h.Resumption.ConnectionEnding(6_000); // ends at 567 s; the margin is 2 s, so the last call is at 565 s
            await advanceTo(SOFT_MS + 2_000);
            h.SettleAttempt(new Error('connect failed'));
            await vi.advanceTimersByTimeAsync(0);
            expect(returns).toBe(1);
            h.Resumption.TurnStarted(); // an answer on the old connection holds the next attempt until the last call
            await advanceTo(SOFT_MS + 4_999);
            expect(h.Reconnects).toHaveLength(1);
            await advanceTo(SOFT_MS + 5_000);
            expect(h.Reconnects).toHaveLength(2);
        });

        it('a driver that throws on the way back counts as not gone back, and is told the move goes on', async () => {
            const h = new Harness(undefined, {
                ReturnToOldConnection: () => {
                    returns++;
                    throw new Error('the host state handler failed');
                },
            });
            h.TrustsNative = false;
            h.RequiresPostTurn = false;
            h.FailNext = 1;
            h.Resumption.ArmDurationTimers(600, 10);
            const result = h.Resumption.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(0);
            expect(returns).toBe(1);
            // The driver may have let input go part way back: it holds it again, and the next attempt keeps the schedule.
            expect(h.Resumption.IsReconnecting).toBe(true);
            expect(h.Reconnecting).toEqual(['duration-expiry', 'duration-expiry']);
            h.Resumption.TurnStarted(); // would hold a boundary wait; the retry schedule does not wait for it
            await vi.advanceTimersByTimeAsync(1_000);
            expect(await result).toBe(true);
            expect(h.Reconnects).toHaveLength(2);
        });

        it('does not go back after a failed attempt on a lost connection', async () => {
            const h = new Harness([0, 1000], { ReturnToOldConnection: () => ++returns > 0 });
            h.TrustsNative = false;
            h.FailNext = 1;
            const result = h.Resumption.TriggerReconnect('connection-lost');
            await vi.advanceTimersByTimeAsync(1000);
            expect(await result).toBe(true);
            expect(returns).toBe(0);
        });
    });

    describe('a loss of the old connection while an attempt is in flight', () => {
        // Before, the switch to a lost connection's window waited for the next attempt, so a failed attempt near the
        // planned deadline ended the call although the cycle had just become a lost connection's.
        it('continues as a lost connection with its own window instead of stopping at the planned one', async () => {
            const h = new Harness(undefined, { RecoveryWindowMs: 10_000 });
            h.TrustsNative = false;
            h.RequiresPostTurn = false;
            h.FailNext = 3;
            h.Resumption.ConnectionEnding(3_000); // idle: moves at once; the planned window closes at 3 s + 10 s
            await vi.advanceTimersByTimeAsync(4_000); // attempts at 0, 1 and 4 s fail
            expect(h.Reconnects).toHaveLength(3);
            h.HoldNext = 1;
            await vi.advanceTimersByTimeAsync(6_000); // attempt 4, at 9 s, is in flight
            expect(h.Reconnects).toHaveLength(4);
            void h.Resumption.TriggerReconnect('connection-lost'); // the old connection closes at 10 s
            await vi.advanceTimersByTimeAsync(500);
            h.SettleAttempt(new Error('connect failed')); // at 10.5 s: a next attempt at 15.5 s is past 13 s
            await vi.advanceTimersByTimeAsync(5_000);
            expect(h.FailureCodes).toEqual([]);
            expect(h.Reconnects).toHaveLength(5);
            expect(h.Reconnected).toBe(1);
        });
    });

    describe('attempt timeout & Dispose', () => {
        it('abandons an attempt that never settles and moves on to the next one', async () => {
            const attempts: RealtimeReconnectContext[] = [];
            const resumption = new RealtimeReconnectController({
                Reconnect: (ctx) => {
                    attempts.push(ctx);
                    // The first socket never opens; the second one does.
                    return attempts.length === 1 ? new Promise<void>(() => undefined) : Promise.resolve();
                },
                OnReconnectFailed: () => undefined,
                BuildSeed: () => null,
                TrustsNativeResumption: () => true,
                RetryDelaysMs: [0, 1000],
                AttemptTimeoutMs: 5000,
            });
            resumption.RecordHandle('h1', true);
            void resumption.TriggerReconnect('connection-lost');
            await vi.advanceTimersByTimeAsync(0);
            expect(attempts).toHaveLength(1);

            await vi.advanceTimersByTimeAsync(5000);
            expect(attempts[0].Abandoned).toBe(true);
            await vi.advanceTimersByTimeAsync(1000);
            expect(attempts).toHaveLength(2);
            expect(resumption.IsReconnecting).toBe(false);
        });

        it('times PrepareAttempt on its own budget, so a slow preparation does not shorten the transport attempt (F5)', async () => {
            const reconnects: RealtimeReconnectContext[] = [];
            const resumption = new RealtimeReconnectController({
                PrepareAttempt: () => new Promise<void>((resolve) => setTimeout(resolve, 4000)),
                Reconnect: (ctx) => {
                    reconnects.push(ctx);
                    return new Promise<void>((resolve) => setTimeout(resolve, 4000));
                },
                OnReconnectFailed: () => undefined,
                BuildSeed: () => null,
                RetryDelaysMs: [0],
                PrepareTimeoutMs: 5000,
                AttemptTimeoutMs: 5000,
            });
            const result = resumption.TriggerReconnect('connection-lost');
            await vi.advanceTimersByTimeAsync(8000);
            // 4 s + 4 s fits two 5 s budgets, though it overruns either one alone.
            expect(await result).toBe(true);
            expect(reconnects).toHaveLength(1);
            expect(reconnects[0].Abandoned).toBe(false);
        });

        it('never calls Reconnect for an attempt whose PrepareAttempt timed out, even when it resolves later (F5)', async () => {
            const reconnects: RealtimeReconnectContext[] = [];
            const prepared: RealtimeReconnectContext[] = [];
            const failures: Error[] = [];
            const resumption = new RealtimeReconnectController({
                PrepareAttempt: (ctx) => {
                    prepared.push(ctx);
                    return new Promise<void>((resolve) => setTimeout(resolve, 7000));
                },
                Reconnect: (ctx) => {
                    reconnects.push(ctx);
                    return Promise.resolve();
                },
                OnReconnectFailed: (err) => failures.push(err),
                BuildSeed: () => null,
                RetryDelaysMs: [0],
                RecoveryWindowMs: 0,
                PrepareTimeoutMs: 5000,
            });
            const result = resumption.TriggerReconnect('connection-lost');
            await vi.advanceTimersByTimeAsync(10_000);
            expect(await result).toBe(false);
            expect(prepared[0].Abandoned).toBe(true);
            expect(reconnects).toHaveLength(0);
            expect(failures[0].message).toBe('reconnect preparation timed out after 5000 ms');
        });

        it('keeps the native handle when an attempt fails in its preparation, which never used the handle (#39)', async () => {
            let prepares = 0;
            const h = new Harness([0, 1000], {
                PrepareAttempt: async () => {
                    prepares++;
                    if (prepares === 1) {
                        throw new Error('token refresh failed');
                    }
                },
            });
            h.Resumption.RecordHandle('h1', true);
            const result = h.Resumption.TriggerReconnect('connection-lost');
            await vi.advanceTimersByTimeAsync(1000);
            expect(await result).toBe(true);
            // Attempt 1 never reached the transport, so attempt 2 still resumes natively.
            expect(h.Reconnects).toEqual(['h1']);
            expect(h.Resumption.Handle).toBe('h1');
        });

        it('falls back to the seed after a failed transport attempt with the handle', async () => {
            const h = new Harness([0, 1000]);
            h.FailNext = 1;
            h.Resumption.RecordHandle('h1', true);
            const result = h.Resumption.TriggerReconnect('connection-lost');
            await vi.advanceTimersByTimeAsync(1000);
            expect(await result).toBe(true);
            expect(h.Reconnects).toEqual(['h1', null]);
        });

        it('marks an attempt in flight as abandoned and cancels pending timers on Dispose', async () => {
            const attempts: RealtimeReconnectContext[] = [];
            const resumption = new RealtimeReconnectController({
                Reconnect: (ctx) => {
                    attempts.push(ctx);
                    return new Promise<void>(() => undefined);
                },
                OnReconnectFailed: () => undefined,
                BuildSeed: () => null,
                TrustsNativeResumption: () => true,
            });
            resumption.RecordHandle('h1', true);
            void resumption.TriggerReconnect('connection-lost');
            await vi.advanceTimersByTimeAsync(0);
            resumption.Dispose();
            expect(attempts[0].Abandoned).toBe(true);
            expect(await resumption.TriggerReconnect('connection-lost')).toBe(false);
        });
    });
});

