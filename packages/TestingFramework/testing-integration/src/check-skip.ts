/**
 * check-skip.ts — how a check says "this host cannot run me" instead of passing or failing.
 *
 * The driver's own gates (RequiresMutation, RequiresLiveModel) cover conditions the driver knows
 * about. A condition only the check's package knows — an optional sibling app that is not
 * installed, a seed that was never pushed — has no gate, and a check that returns early is
 * counted as Passed: coverage reported that the run does not have. Throwing `CheckSkipped`
 * records a real Skipped result through the same path the tier gates use.
 *
 * Throw it before the check does anything. A skip after partial work is still recorded as a
 * skip, and any cleanup is the check's own job, exactly as for a failure.
 */

/**
 * Marks the error across package copies. A check module (often in another repo) can resolve its
 * own copy of this package, so an `instanceof` test in the driver would miss the error and record
 * a failure. `Symbol.for` keys the global symbol registry, which every copy shares.
 */
const CHECK_SKIPPED_MARKER: unique symbol = Symbol.for('@memberjunction/testing-integration/CheckSkipped');

/** Thrown by a check that cannot run on this host. The driver records it as Skipped, not Failed. */
export class CheckSkipped extends Error {
    public readonly [CHECK_SKIPPED_MARKER] = true;

    /** @param Reason why the check cannot run here, e.g. "needs contracts: not installed". */
    constructor(public readonly Reason: string) {
        super(Reason);
        this.name = 'CheckSkipped';
    }
}

/** True for a `CheckSkipped` from any copy of this package. */
export function IsCheckSkipped(error: unknown): error is CheckSkipped {
    return error instanceof Error && (error as Partial<CheckSkipped>)[CHECK_SKIPPED_MARKER] === true;
}
