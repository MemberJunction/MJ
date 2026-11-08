import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    ParseDurationToMs,
    RealtimeReconnectController,
    REALTIME_RESUMPTION_DEADLINE_MARGIN_MS,
    REALTIME_RESUMPTION_MIN_DEADLINE_MARGIN_MS,
    type RealtimeReconnectContext,
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
    public Reconnecting: RealtimeReconnectReason[] = [];
    public Reconnected = 0;
    public Failures: Error[] = [];
    public FailNext = 0;
    public TrustsNative = true;
    public RequiresPostTurn = true;
    public Idle = true;
    public Resumption: RealtimeReconnectController;

    constructor(retryDelaysMs?: readonly number[]) {
        this.Resumption = new RealtimeReconnectController({
            Reconnect: async (context) => {
                this.Reconnects.push(context.ResumptionHandle);
                if (this.FailNext > 0) {
                    this.FailNext--;
                    throw new Error(`connect failed for ${context.ResumptionHandle ?? 'seed'}`);
                }
            },
            OnReconnectFailed: (error) => this.Failures.push(error),
            OnReconnecting: (reason) => this.Reconnecting.push(reason),
            OnReconnected: () => this.Reconnected++,
            BuildSeed: () => null,
            IsIdle: () => this.Idle,
            TrustsNativeResumption: () => this.TrustsNative,
            RequiresPostTurnHandle: () => this.RequiresPostTurn,
            RetryDelaysMs: retryDelaysMs,
        });
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
            const h = new Harness([0, 1000, 3000]);
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

