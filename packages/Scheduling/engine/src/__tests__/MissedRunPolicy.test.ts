/**
 * Tests for `DecideMissedRun`.
 *
 * The behavior that matters most is the **default**, and it is not the one this feature was almost
 * built with. The engine has always recomputed `NextRunAt` from *now* rather than from the missed
 * occurrence, so a job whose fire time passed during an outage runs once immediately and then jumps
 * forward — that is `RunOnce`. Defaulting to `Skip` would have silently stopped every existing job
 * in every install from catching up. So the tests below pin `RunOnce` as the no-change default.
 *
 * The second thing worth defending is what counts as "missed". It is defined cron-relatively — a
 * later occurrence has *also* come due — rather than by a grace window, because a fixed window
 * misjudges both ends of the range: a per-minute job looks missed after a short pause, and a
 * monthly job looks on time a week late.
 */
import { describe, it, expect } from 'vitest';
import { DecideMissedRun } from '../MissedRunPolicy';

const at = (iso: string) => new Date(iso);

/** An hourly job scheduled for 09:00, whose following occurrence is 10:00. */
const SCHEDULED = at('2026-08-08T09:00:00Z');
const NEXT_OCCURRENCE = at('2026-08-08T10:00:00Z');

/** Now, while the 10:00 occurrence has NOT yet come due — the job is merely due, nothing missed. */
const JUST_DUE = at('2026-08-08T09:00:30Z');
/** Now, well after 10:00 — at least one occurrence was missed. */
const AFTER_OUTAGE = at('2026-08-08T14:00:00Z');

describe('a job that is merely due — no policy applies', () => {
    it.each(['Skip', 'RunOnce', 'RunAll'] as const)('%s still runs it', (policy) => {
        // Nothing was missed: the next occurrence has not arrived. Every policy must run it, or a
        // Skip job would never run at all.
        expect(DecideMissedRun(policy, SCHEDULED, NEXT_OCCURRENCE, JUST_DUE))
            .toEqual({ Action: 'Run', AdvanceFrom: 'Now' });
    });

    it('is not fooled by a job that came due one second ago', () => {
        expect(DecideMissedRun('Skip', SCHEDULED, NEXT_OCCURRENCE, at('2026-08-08T09:00:01Z')).Action).toBe('Run');
    });

    it('treats the exact moment the next occurrence comes due as missed', () => {
        // The boundary is inclusive: at 10:00 the 09:00 run is definitively late.
        expect(DecideMissedRun('Skip', SCHEDULED, NEXT_OCCURRENCE, NEXT_OCCURRENCE).Action).toBe('SkipAndAdvance');
    });
});

describe('RunOnce — the default, and what the engine already did', () => {
    it('catches up with a single run and then rejoins the schedule', () => {
        // Advancing from Now is what collapses a backlog into one run: the next NextRunAt is the
        // next FUTURE occurrence, not the one after the missed one.
        expect(DecideMissedRun('RunOnce', SCHEDULED, NEXT_OCCURRENCE, AFTER_OUTAGE))
            .toEqual({ Action: 'Run', AdvanceFrom: 'Now' });
    });

    it('is the fallback for an unrecognized policy, so a bad value degrades to today\'s behavior', () => {
        // A value the CHECK constraint should have refused must not produce silence.
        expect(DecideMissedRun('Nonsense' as never, SCHEDULED, NEXT_OCCURRENCE, AFTER_OUTAGE))
            .toEqual({ Action: 'Run', AdvanceFrom: 'Now' });
    });
});

describe('Skip — for work whose value expires', () => {
    it('does not run, and moves past the missed occurrences', () => {
        expect(DecideMissedRun('Skip', SCHEDULED, NEXT_OCCURRENCE, AFTER_OUTAGE))
            .toEqual({ Action: 'SkipAndAdvance' });
    });
});

describe('RunAll — for work where each period is its own unit', () => {
    it('runs, and advances from the missed occurrence rather than from now', () => {
        // This is the whole mechanism: advancing from the occurrence just consumed walks the
        // backlog one step per poll tick. Advancing from Now would silently collapse it into
        // RunOnce and lose every intermediate period.
        expect(DecideMissedRun('RunAll', SCHEDULED, NEXT_OCCURRENCE, AFTER_OUTAGE))
            .toEqual({ Action: 'Run', AdvanceFrom: 'MissedOccurrence' });
    });

    it('drains gradually rather than dispatching the whole backlog at once', () => {
        // Simulate successive poll ticks over a five-hour outage: each tick consumes exactly one
        // occurrence, which is what keeps a week-long outage from firing 168 jobs simultaneously.
        let scheduled = SCHEDULED;
        const hour = 60 * 60 * 1000;
        const runs: string[] = [];

        for (let tick = 0; tick < 5; tick++) {
            const next = new Date(scheduled.getTime() + hour);
            const decision = DecideMissedRun('RunAll', scheduled, next, AFTER_OUTAGE);
            expect(decision).toEqual({ Action: 'Run', AdvanceFrom: 'MissedOccurrence' });
            runs.push(scheduled.toISOString());
            scheduled = next;
        }

        // Every missed hour was run exactly once, in order — none collapsed, none repeated.
        expect(runs).toEqual([
            '2026-08-08T09:00:00.000Z',
            '2026-08-08T10:00:00.000Z',
            '2026-08-08T11:00:00.000Z',
            '2026-08-08T12:00:00.000Z',
            '2026-08-08T13:00:00.000Z',
        ]);
    });

    it('stops catching up once it reaches the present', () => {
        // The drain terminates on its own: when the next occurrence is in the future, the job is
        // merely due and advances from Now like any other.
        const scheduled = at('2026-08-08T14:00:00Z');
        const next = at('2026-08-08T15:00:00Z');
        expect(DecideMissedRun('RunAll', scheduled, next, AFTER_OUTAGE))
            .toEqual({ Action: 'Run', AdvanceFrom: 'Now' });
    });
});
