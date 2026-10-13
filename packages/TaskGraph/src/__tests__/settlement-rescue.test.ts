/**
 * The crash-window rescue: which settled-but-undelivered graphs get a second look, and when a
 * second look is too late to pretend nothing happened. (P3, PR #3745.)
 *
 * The bug these defend against was invisible by construction. A graph settles in two steps — the
 * parent's terminal write, then cost rollup + run settlement + continuation delivery — and a process
 * that died between them left a graph that reads as finished to every query the dispatcher ran, with
 * its submitting agent run `Paused` forever and nothing that would ever look again. The metadata's
 * own doc comment promised "the next sweep retries"; that sweep did not exist.
 *
 * A fixed clock is passed in rather than mocked, so "23h59m is in, 24h01m is out" is a statement
 * about the function instead of a statement about how well the test froze `Date.now`.
 */
import { describe, it, expect } from 'vitest';
import {
    IsSettlementExpired,
    IsSubmittingRunReady,
    SUBMITTER_PARK_GRACE_MS,
    SelectUnsettledGraphIDs,
    SweepCutoff,
    UNSETTLED_SWEEP_WINDOW_HOURS,
    UNSETTLED_STARTUP_WINDOW_HOURS,
} from '../settlement-rescue';

const NOW = new Date('2026-08-11T12:00:00.000Z');
const hoursBefore = (h: number): Date => new Date(NOW.getTime() - h * 3600_000);

describe('SelectUnsettledGraphIDs — what the third sweep arm rescues', () => {
    it('picks a terminal graph whose continuation never delivered', () => {
        // The crash window itself: the terminal write landed, the delivery did not.
        expect(SelectUnsettledGraphIDs([
            { ID: 'stranded', InputPayload: JSON.stringify({ continuation: 'reinvoke', submittedByAgentRunID: 'r1' }) },
        ])).toEqual(['stranded']);
    });

    it('leaves a graph that already delivered alone', () => {
        // Without this the rescue becomes the bug: every settled graph in the window re-delivers on
        // every poll. For `continuation: 'reinvoke'` that is a fresh billed agent turn each time.
        expect(SelectUnsettledGraphIDs([
            { ID: 'done', InputPayload: JSON.stringify({ continuationDeliveredAt: '2026-08-11T11:00:00.000Z' }) },
        ])).toEqual([]);
    });

    it('treats a payload it cannot read as undelivered, not as delivered', () => {
        // We cannot prove delivery, so we must not assume it. The claim's ISJSON guard then refuses
        // the row, and the sweep window is what keeps "cannot prove" from meaning "retry forever".
        expect(SelectUnsettledGraphIDs([
            { ID: 'garbled', InputPayload: 'not json' },
            { ID: 'empty', InputPayload: null },
        ])).toEqual(['garbled', 'empty']);
    });

    it('ignores a row with no ID rather than emitting a hole', () => {
        expect(SelectUnsettledGraphIDs([{ ID: null, InputPayload: '{}' }])).toEqual([]);
    });

    it('a marker written as an empty string does not count as delivery', () => {
        // JSON_MODIFY always writes a timestamp, so this shape means something else edited the bag.
        // Truthiness is the test precisely so a blank does not silently suppress the rescue.
        expect(SelectUnsettledGraphIDs([
            { ID: 'blank', InputPayload: JSON.stringify({ continuationDeliveredAt: '' }) },
        ])).toEqual(['blank']);
    });

    it('keeps the other metadata out of the decision entirely', () => {
        // Only the marker decides. A graph carrying a submitting run, a depth and a mode is judged
        // exactly like a bare one — otherwise the rescue's coverage depends on submission details.
        const rich = JSON.stringify({ continuation: 'reinvoke', reinvokeDepth: 3, submittedByAgentRunID: 'r9' });
        expect(SelectUnsettledGraphIDs([{ ID: 'g', InputPayload: rich }])).toEqual(['g']);
    });
});

describe('IsSettlementExpired — deliver late, but say that it was late', () => {
    it('is false for a graph that never settled', () => {
        // No CompletedAt means the graph has not settled at all, so nothing has expired. Reading
        // this as expired would downgrade every live graph the sweep touches.
        expect(IsSettlementExpired(null, NOW)).toBe(false);
        expect(IsSettlementExpired(undefined, NOW)).toBe(false);
    });

    it('is false inside the window — a normal, if slightly late, delivery', () => {
        expect(IsSettlementExpired(hoursBefore(1), NOW)).toBe(false);
        expect(IsSettlementExpired(hoursBefore(23.9), NOW)).toBe(false);
    });

    it('is false exactly AT the boundary, true past it', () => {
        // Stated because the comparison is strict: a graph settled exactly one window ago still
        // delivers normally. An off-by-one here silently downgrades a whole cohort.
        expect(IsSettlementExpired(hoursBefore(UNSETTLED_SWEEP_WINDOW_HOURS), NOW)).toBe(false);
        expect(IsSettlementExpired(hoursBefore(UNSETTLED_SWEEP_WINDOW_HOURS + 0.001), NOW)).toBe(true);
    });

    it('is true for the outage case the startup sweep exists to find', () => {
        // Found weeks later by the wide startup scan: still worth settling the run and clearing
        // `Paused`, not worth re-invoking an agent on context that old.
        expect(IsSettlementExpired(hoursBefore(24 * 20), NOW)).toBe(true);
    });

    it('honours a caller-supplied window rather than hardcoding the steady-state one', () => {
        expect(IsSettlementExpired(hoursBefore(30), NOW, UNSETTLED_STARTUP_WINDOW_HOURS)).toBe(false);
    });

    it('does not call a future timestamp expired', () => {
        // Clock skew between an app server and the database is ordinary. A negative age must read as
        // "just settled", never wrap into expiry.
        expect(IsSettlementExpired(new Date(NOW.getTime() + 3600_000), NOW)).toBe(false);
    });
});

describe('IsSubmittingRunReady — the graph can finish before its submitter parks (R2-2)', () => {
    // `finalizeAgentRun` parks the run AFTER the graph is durable and dispatchable, so a fast graph
    // settles first. Both of the settled branch's writes then land wrong — the lifecycle write
    // silently returns on its `Paused` guard, and the cost write is overwritten by finalize's own
    // full-row save — and the pass then claims the delivery marker, making itself the last pass ever
    // to look at the graph. The run stays Paused forever, with nothing logged.

    it('defers while the run is still Running', () => {
        expect(IsSubmittingRunReady('Running', 0)).toBe(false);
        expect(IsSubmittingRunReady('Running', 1_000)).toBe(false);
    });

    it('proceeds once the run has parked — the case settlement exists for', () => {
        expect(IsSubmittingRunReady('Paused', 0)).toBe(true);
    });

    it('proceeds for a run that already reached its own terminal state', () => {
        // Completed/Failed/Cancelled happened for the run's own reasons; the lifecycle write's guard
        // declines them, which is right. Delivery must not be held hostage to that.
        for (const status of ['Completed', 'Failed', 'Cancelled']) {
            expect(IsSubmittingRunReady(status, 0)).toBe(true);
        }
    });

    it('stops waiting once the grace period is past — a dead submitter must not eat the outcome', () => {
        // "Not parked yet" and "the submitting process died before parking" are indistinguishable
        // from here. Waiting forever on the second loses the outcome of work that actually
        // completed, which is strictly worse than announcing it late.
        expect(IsSubmittingRunReady('Running', SUBMITTER_PARK_GRACE_MS)).toBe(false);
        expect(IsSubmittingRunReady('Running', SUBMITTER_PARK_GRACE_MS + 1)).toBe(true);
    });

    it('honours a caller-supplied grace rather than hardcoding it', () => {
        expect(IsSubmittingRunReady('Running', 500, 1_000)).toBe(false);
        expect(IsSubmittingRunReady('Running', 1_500, 1_000)).toBe(true);
    });

    it('does not read a negative age as ready — clock skew is ordinary', () => {
        expect(IsSubmittingRunReady('Running', -60_000)).toBe(false);
    });

    it('reads as a GATE, not as a report — the sense of the answer is the fix', () => {
        // The one this suite could not catch, recorded so it cannot come back. `IsSubmittingRunReady`
        // was always correct; the dispatcher inverted it at the call site and returned 'ready' from
        // both branches, so the gate never deferred and R2-2 was inert. A decision extracted for
        // testability is only half the job — the wiring is the other half, and only IT74's TX13
        // could see it. Pinning the sense here at least makes a future inversion a two-place change.
        expect(IsSubmittingRunReady('Running', 0)).toBe(false);   // false ⇒ DEFER
        expect(IsSubmittingRunReady('Paused', 0)).toBe(true);     // true  ⇒ PROCEED
    });

    it('the grace is short relative to the delivery window it sits inside', () => {
        // If the grace ever exceeded the rescue window, a deferred graph would age out of the sweep
        // before it was ever allowed to proceed — deferral would become permanent loss.
        expect(SUBMITTER_PARK_GRACE_MS).toBeLessThan(UNSETTLED_SWEEP_WINDOW_HOURS * 3600_000);
    });
});

describe('SweepCutoff — the bound is on abandonment, not on age', () => {
    it('subtracts the window and hands SQL an ISO 8601 string', () => {
        expect(SweepCutoff(NOW, UNSETTLED_SWEEP_WINDOW_HOURS)).toBe('2026-08-10T12:00:00.000Z');
    });

    it('reaches a month back for the one startup sweep', () => {
        // The realistic producer of a >24h-stale unsettled graph is the dispatcher being down — so
        // the steady-state window alone would leave exactly those runs Paused forever, invisibly.
        expect(SweepCutoff(NOW, UNSETTLED_STARTUP_WINDOW_HOURS)).toBe('2026-07-12T12:00:00.000Z');
        expect(UNSETTLED_STARTUP_WINDOW_HOURS).toBeGreaterThan(UNSETTLED_SWEEP_WINDOW_HOURS);
    });

    it('produces a format SQL Server compares as a datetime, not as text', () => {
        expect(SweepCutoff(NOW, 1)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
});
