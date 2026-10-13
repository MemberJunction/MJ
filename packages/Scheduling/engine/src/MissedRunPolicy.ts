/**
 * @fileoverview What a scheduled job does about fire times that passed while nothing was running.
 *
 * A scheduler is down sometimes — a deploy, a crash, a machine that slept. When it comes back, a
 * job whose `NextRunAt` is in the past has to answer a question the schema never asked: *should the
 * missed occurrences happen now?* The right answer depends entirely on what the job does, and only
 * its author knows:
 *
 * - A **nightly digest** wants one catch-up run. The latest state is the whole point; running it
 *   five times because the server was down five days sends five identical emails.
 * - A **per-period billing snapshot** wants every occurrence. Each period is its own unit of work,
 *   and skipping one loses data nothing else will recreate.
 * - A **cache warm** wants none of them. Whatever it was warming is stale anyway; the next scheduled
 *   run will do the job.
 *
 * @module @memberjunction/scheduling-engine
 */
import { MJScheduledJobEntity } from '@memberjunction/core-entities';

/**
 * Derived from the entity rather than restated, so a CHECK-constraint change flows through instead
 * of silently drifting from a hand-copied union.
 */
export type MissedRunPolicy = MJScheduledJobEntity['MissedRunPolicy'];

/** What the engine should do with a job this tick. */
export type MissedRunDecision =
    /** Run it now. Either it is normally due, or its policy says to catch up. */
    | { Action: 'Run'; /** Base date for computing the following `NextRunAt`. */ AdvanceFrom: 'Now' | 'MissedOccurrence' }
    /** Do not run; just move `NextRunAt` forward past the occurrences that were missed. */
    | { Action: 'SkipAndAdvance' };

/**
 * Decide what to do with a job whose `NextRunAt` has passed.
 *
 * **"Missed" is defined cron-relatively, not by a grace constant.** A run is missed only when
 * *another* occurrence has already come due since the one we are looking at — i.e.
 * `nextOccurrenceAfter(NextRunAt) <= now`. A job that simply came due a few seconds ago has not
 * missed anything; it is just due, and every policy runs it. Defining it with a fixed grace window
 * would misclassify both ends of the range: an every-minute job would look "missed" after a 90-second
 * pause, and a monthly job would look "on time" a week late.
 *
 * @param policy the job's declared policy
 * @param scheduledFor the occurrence being evaluated (`Job.NextRunAt`)
 * @param nextOccurrenceAfterScheduled the following cron occurrence after `scheduledFor`
 * @param now evaluation time
 */
export function DecideMissedRun(
    policy: MissedRunPolicy,
    scheduledFor: Date,
    nextOccurrenceAfterScheduled: Date,
    now: Date,
): MissedRunDecision {
    const missedAnOccurrence = nextOccurrenceAfterScheduled.getTime() <= now.getTime();

    if (!missedAnOccurrence) {
        // Normally due. No policy has anything to say about this case — advancing from `now` is what
        // the engine has always done.
        return { Action: 'Run', AdvanceFrom: 'Now' };
    }

    switch (policy) {
        case 'Skip':
            return { Action: 'SkipAndAdvance' };

        case 'RunAll':
            // Advance from the occurrence just consumed, not from now, so the backlog is walked one
            // occurrence per tick rather than collapsed. That is also what keeps a long outage from
            // firing a week of runs simultaneously — the engine drains at its poll cadence.
            return { Action: 'Run', AdvanceFrom: 'MissedOccurrence' };

        case 'RunOnce':
        default:
            // The default, and what the engine did before this policy existed: run once, then jump
            // to the next future occurrence. Kept as the fallback so an unrecognized value degrades
            // to today's behavior rather than to silence.
            return { Action: 'Run', AdvanceFrom: 'Now' };
    }
}
