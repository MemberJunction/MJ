/**
 * @fileoverview Ordering for the Workflows Runs list — pure, so it can be checked.
 *
 * A run list is opened to answer two questions: which run took longest, and which one failed.
 * Neither is answerable by scrolling, so every column sorts. The rule that needs pinning is what
 * happens to a run that never started: it has no start time, and letting `null` compare as though it
 * were the beginning of time puts work that did NOT happen above work that did. The run tree's
 * ORDER BY had to fix exactly that, and a second implementation is free to get it wrong
 * independently — which is the reason this is a module and not a method.
 */
import { DateCellTime } from '../../shared/date-cell';

/** Which column the list is ordered by. */
export type WorkflowRunSortColumn = 'Name' | 'Status' | 'StartedAt' | 'CompletedAt' | 'Duration';

/** The fields ordering reads. Deliberately narrower than the row type — this is all sorting needs. */
export type SortableRun = {
    Name: string;
    Status: string;
    StartedAt: Date | null;
    CompletedAt: Date | null;
};

/**
 * How long a run took, in ms, or null when it never started.
 *
 * An unfinished run measures to now, so a running workflow's elapsed time grows while it is
 * watched — which is what a duration column should show for work still in flight.
 */
export function RunElapsedMs(run: SortableRun, now: number): number | null {
    const started = DateCellTime(run.StartedAt);
    if (started === null) return null;
    return (DateCellTime(run.CompletedAt) ?? now) - started;
}

/**
 * The rows in the chosen order, as a NEW array.
 *
 * Never in place: the caller reads this from a template getter on every change-detection pass, and
 * sorting the source would reorder it underneath everything else that holds it.
 *
 * **Unset sorts last in BOTH directions.** That is not an arbitrary tie-break — an absent timestamp
 * is not a value at one end of the range, it is the absence of one, so flipping the direction must
 * not promote it to the top. Two unset values fall back to name, so the order is stable rather than
 * dependent on how the rows happened to arrive.
 */
export function SortWorkflowRuns<T extends SortableRun>(
    rows: readonly T[],
    column: WorkflowRunSortColumn,
    descending: boolean,
    now: number = Date.now(),
): T[] {
    const direction = descending ? -1 : 1;

    return [...rows].sort((a, b) => {
        if (column === 'StartedAt' || column === 'CompletedAt') {
            return compareOptional(DateCellTime(a[column]), DateCellTime(b[column]), direction, a, b);
        }
        if (column === 'Duration') {
            return compareOptional(RunElapsedMs(a, now), RunElapsedMs(b, now), direction, a, b);
        }
        // Name and Status are strings. `localeCompare`, not `<`, so casing and accents order the way
        // a reader expects rather than by code point.
        return a[column].localeCompare(b[column]) * direction;
    });
}

/** Compares two possibly-absent numbers, with absent always last and a stable name tie-break. */
function compareOptional(
    left: number | null,
    right: number | null,
    direction: number,
    a: SortableRun,
    b: SortableRun,
): number {
    if (left === null && right === null) return a.Name.localeCompare(b.Name);
    if (left === null) return 1;
    if (right === null) return -1;
    return (left - right) * direction;
}
