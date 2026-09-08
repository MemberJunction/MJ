/**
 * The decisions that rescue a graph whose settlement never finished.
 *
 * **Why these live here and not inside the dispatcher.** A graph settles in two steps that are not
 * one transaction: the parent's terminal write, and then the post-settlement sequence — cost rollup,
 * agent-run settlement, continuation delivery. A process that dies between them leaves a graph that
 * is finished by every query the dispatcher runs and yet has delivered nothing, with the submitting
 * agent run `Paused` forever. The third sweep arm exists to find exactly those.
 *
 * That makes this the one part of settlement whose correctness is a *predicate*, not a statement:
 * which rows are unfinished, and when is an unfinished one too old to deliver normally. Left inside
 * `TaskGraphDispatcher` they could only be exercised through a fake `RunView`, a fake entity object
 * and a fake clock — a test that mostly asserts the shape of its own mocks. Pulled out, they are
 * ordinary functions with ordinary tests, and the dispatcher keeps the I/O.
 *
 * The guarded WRITES stay in `TaskClaimStore`, where the statement is the guarantee. This module
 * decides *whether* to attempt them; that module decides what happens when two instances both do.
 */
import { ParseTaskGraphParentMetadata } from './TaskGraphService';

/** How long after settling a graph is still eligible for a normal continuation delivery. */
export const UNSETTLED_SWEEP_WINDOW_HOURS = 24;

/**
 * How far back the ONE startup sweep looks.
 *
 * Wider than the steady-state window because a deployment gap is exactly the case the rescue exists
 * for: nothing was running, so nothing swept, and the graphs stranded by whatever took the process
 * down are older than a day by the time it returns. Runs once at `Start()`, so the cost of the wider
 * scan is paid once per process, not once per poll.
 */
export const UNSETTLED_STARTUP_WINDOW_HOURS = 24 * 30;

/**
 * How long a settled graph waits for its submitting run to park before giving up on it.
 *
 * `BaseAgent.finalizeAgentRun` parks the run within moments of the graph becoming dispatchable, so
 * the honest window is seconds; anything beyond this means the submitting process is gone. Generous
 * enough that a loaded machine does not trip it, short enough that a dead submitter cannot hold a
 * completed workflow's announcement hostage for a day.
 */
export const SUBMITTER_PARK_GRACE_MS = 5 * 60_000;

/**
 * Whether this pass's writes to the submitting run will mean anything yet.
 *
 * **The `Running` case is the whole point.** A graph can settle before the run that submitted it has
 * parked at all: `finalizeAgentRun` sets `Paused` *after* the graph is durable and dispatchable, so
 * a fast graph finishes first. Both of the settled branch's writes then land wrong — the lifecycle
 * write silently returns (its guard is `Status === 'Paused'`), and the cost write is overwritten
 * moments later by finalize's own full-row save carrying the nulls it held before the dispatcher
 * wrote anything. Neither failure is visible, and the pass then claims the delivery marker, making
 * itself the last pass ever to look at the graph. The run stays `Paused` forever.
 *
 * Every other status proceeds: `Paused` is the case settlement exists for, and a run already
 * `Completed`/`Failed`/`Cancelled` reached that for its own reasons — the lifecycle write's own
 * guard declines it, which is correct, and delivery should not be held up by it.
 *
 * **Bounded, because "not parked yet" and "the submitter died before parking" look identical from
 * here.** Waiting forever on the second loses the outcome of work that actually completed, which is
 * strictly worse than announcing it late — so past the grace period the caller proceeds and says
 * why. The run stays `Running`, which is visibly wrong and belongs to whatever reconciles abandoned
 * runs, not to the graph that finished correctly.
 *
 * @param settledForMs how long ago the graph reached its terminal status
 */
export function IsSubmittingRunReady(
    runStatus: string,
    settledForMs: number,
    graceMs: number = SUBMITTER_PARK_GRACE_MS,
): boolean {
    if (runStatus !== 'Running') return true;
    return settledForMs > graceMs;
}

/** The shape the third sweep arm selects — everything needed to judge "settled but undelivered". */
export type UnsettledCandidate = {
    ID: string | null;
    InputPayload: string | null;
};

/**
 * The oldest `__mj_UpdatedAt` still worth rescuing, as an ISO string for the SQL filter.
 *
 * The bound is on ABANDONMENT, not age: `__mj_UpdatedAt` advances on every settle attempt, so a
 * graph something is still actively retrying keeps re-entering the window. What ages out is a graph
 * nothing has touched — which is the only kind this sweep can help.
 */
export function SweepCutoff(now: Date, windowHours: number): string {
    return new Date(now.getTime() - windowHours * 3600_000).toISOString();
}

/**
 * Picks the graphs that reached a terminal status without delivering their continuation.
 *
 * Filtered here rather than in SQL because the delivery marker lives inside the parent's
 * `InputPayload` JSON, and it lives there deliberately: one representation means the writer
 * (`TryClaimContinuation`) and the reader are pinned to each other, and a graph settled before any
 * of this existed is judged by the same parser as one settled after — which a new column plus a
 * backfill could not promise.
 *
 * **An unreadable payload counts as undelivered.** It is selected, the claim then refuses it
 * (`ISJSON` guard), and it is selected again next pass until it ages out of the window. That is the
 * intended shape: we cannot prove such a graph was delivered, so we must not assume it, and the
 * window is what keeps "cannot prove" from meaning "retry forever".
 */
export function SelectUnsettledGraphIDs(rows: readonly UnsettledCandidate[]): string[] {
    const ids: string[] = [];
    for (const row of rows) {
        if (!row.ID) continue;
        if (ParseTaskGraphParentMetadata(row.InputPayload).continuationDeliveredAt) continue;
        ids.push(row.ID);
    }
    return ids;
}

/**
 * Whether a settlement is too old to deliver as if it had just happened.
 *
 * A graph stranded by a crash and found days later should still settle its run and stop showing as
 * `Paused` — but re-invoking the submitting agent on stale context, or messaging a conversation
 * about work that finished last week, is worse than not delivering. So an expired settlement takes
 * the same once-only claim and records itself as `expired`, which keeps the distinction visible
 * afterwards instead of erasing it.
 *
 * A graph with no `CompletedAt` has not settled at all, so there is nothing to have expired.
 */
export function IsSettlementExpired(
    completedAt: Date | null | undefined,
    now: Date,
    windowHours: number = UNSETTLED_SWEEP_WINDOW_HOURS,
): boolean {
    if (!completedAt) return false;
    return now.getTime() - completedAt.getTime() > windowHours * 3600_000;
}
