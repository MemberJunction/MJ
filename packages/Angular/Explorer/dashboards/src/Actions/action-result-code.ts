/**
 * @fileoverview One place that decides what an `ActionExecutionLog.ResultCode` MEANS.
 *
 * ## Why this exists
 *
 * `ResultCode` is free text: the column has no CHECK constraint, and the value is whatever
 * the executing runtime wrote. The Runtime action executor emits UPPER_SNAKE codes
 * (`SUCCESS`, `RUNTIME_ERROR`, `TIMEOUT`, `NOT_APPROVED`, … — see
 * `packages/Actions/Runtime/src/types.ts`, passed through verbatim by `ActionEngine`), while
 * older/custom actions wrote Title Case (`Success`, `Failed`, `Error`).
 *
 * Every dashboard then invented its own comparison:
 *
 * - the Execution Monitor compared `=== 'Success'` and `['Failed','Error']` — so on a
 *   database of `SUCCESS` rows it reported **0 % (0/181)**…
 * - …while its own `getResultColor` / `getResultIcon` lowercased first, which is why 181
 *   green rows rendered directly beneath that 0 % tile;
 * - the Actions Overview lowercased and accepted `success|ok|completed|200`, which is why
 *   *its* success rate was the believable one;
 * - the Action Card looked codes up in `MJ: Action Result Codes.IsSuccess` and fell back to
 *   a third, narrower heuristic.
 *
 * Four vocabularies, one column. This module is the single one.
 *
 * ## How classification works
 *
 * The code is normalised (trimmed, upper-cased, separators folded to `_`) and then matched
 * by SHAPE rather than against a copied list of the runtime's constants. That is deliberate:
 * this package does not depend on `@memberjunction/action-runtime`, so a copied list would
 * silently drift the first time a new failure code is added upstream. Every failure code the
 * runtime can emit contains one of the failure markers below, and the test file pins that
 * claim against the actual constant list.
 *
 * `'unknown'` is a real answer, not a bucket for laziness: a code this module does not
 * recognise must not be counted as a success (inflating the rate) or as a failure (inventing
 * an incident). It is excluded from both numerator and denominator of the success rate.
 */

/** What a result code says about the run that produced it. */
export type ActionResultClass =
    /** The action completed and reported success. */
    | 'success'
    /** The action ended without succeeding — failed, errored, refused, timed out. */
    | 'failure'
    /** The action had not finished when the row was written. */
    | 'running'
    /** Recognised as nothing: a custom code, or a code from a newer writer. */
    | 'unknown';

/** Normalise a raw code for matching: trim, upper-case, fold `-`/space/`.`/`/` to `_`. */
function normalize(code: string): string {
    return code.trim().toUpperCase().replace(/[\s\-./]+/g, '_');
}

/** Codes that mean the action succeeded. */
const SUCCESS_CODES: readonly string[] = ['SUCCESS', 'SUCCEEDED', 'OK', 'COMPLETE', 'COMPLETED'];

/** Codes that mean the action had not finished. */
const RUNNING_CODES: readonly string[] = ['RUNNING', 'IN_PROGRESS', 'STARTED'];

/**
 * Substrings that mark a code as a failure.
 *
 * Covers every failure constant the Runtime executor can write without naming them:
 * `INVALID_TYPE`→INVALID, `MISSING_CODE`→MISSING, `NOT_APPROVED`→NOT_APPROVED,
 * `INACTIVE`→INACTIVE, `RUNTIME_ERROR`/`SYNTAX_ERROR`/`SECURITY_ERROR`/`UNEXPECTED_ERROR`→ERROR,
 * `TIMEOUT`→TIMEOUT, `MEMORY_LIMIT`→LIMIT — plus the legacy `Failed` / `Error` pair.
 */
const FAILURE_MARKERS: readonly string[] = [
    'ERROR',
    'FAIL',
    'TIMEOUT',
    'TIMED_OUT',
    'LIMIT',
    'NOT_APPROVED',
    'UNAPPROVED',
    'INACTIVE',
    'INVALID',
    'MISSING',
    'REJECTED',
    'REFUSED',
    'DENIED',
    'CANCELLED',
    'CANCELED',
    'ABORTED',
    'EXCEPTION',
];

/**
 * Classify a raw `ResultCode`.
 *
 * Order matters: the success and running lists are exact matches checked FIRST, so a
 * hypothetical `SUCCESS_NO_FAILURES` cannot be dragged into `'failure'` by a marker, and a
 * genuine `NOT_SUCCESSFUL` is not dragged into `'success'` by a substring. Null, undefined
 * and blank all classify as `'unknown'` — a row with no code recorded says nothing.
 */
export function classifyActionResultCode(code: string | null | undefined): ActionResultClass {
    if (code == null) {
        return 'unknown';
    }
    const normalized = normalize(code);
    if (normalized.length === 0) {
        return 'unknown';
    }

    if (SUCCESS_CODES.includes(normalized)) {
        return 'success';
    }
    if (RUNNING_CODES.includes(normalized)) {
        return 'running';
    }

    // Bare HTTP-style numerics: some integrations write the status they got back.
    if (/^\d{3}$/.test(normalized)) {
        const status = Number(normalized);
        return status >= 200 && status < 300 ? 'success' : 'failure';
    }

    if (FAILURE_MARKERS.some(marker => normalized.includes(marker))) {
        return 'failure';
    }

    return 'unknown';
}

/** Convenience predicate — `classifyActionResultCode(code) === 'success'`. */
export function isActionResultSuccess(code: string | null | undefined): boolean {
    return classifyActionResultCode(code) === 'success';
}

/** Convenience predicate — `classifyActionResultCode(code) === 'failure'`. */
export function isActionResultFailure(code: string | null | undefined): boolean {
    return classifyActionResultCode(code) === 'failure';
}

/**
 * Success rate over a set of coded runs, as a whole percentage.
 *
 * Runs whose code classifies as `'unknown'` or `'running'` are excluded from BOTH halves of
 * the fraction: a run still in flight has not succeeded or failed yet, and a code we cannot
 * read is not evidence either way. Counting them in the denominator is what makes a healthy
 * system look broken; counting them as successes is what hides a broken one.
 *
 * Returns 0 when nothing in the set has settled — there is no rate to report, and 0 with an
 * accompanying `0/0` detail is the honest rendering of that.
 */
export function actionSuccessRate(codes: readonly (string | null | undefined)[]): number {
    let succeeded = 0;
    let settled = 0;
    for (const code of codes) {
        const klass = classifyActionResultCode(code);
        if (klass === 'success') {
            succeeded++;
            settled++;
        } else if (klass === 'failure') {
            settled++;
        }
    }
    if (settled === 0) {
        return 0;
    }
    return Math.round((succeeded / settled) * 100);
}

/**
 * The colour token a code should render with. Shared by the status chips and the row icons so
 * a chip can never disagree with the tile that counted it.
 */
export function actionResultColor(code: string | null | undefined): 'success' | 'warning' | 'error' | 'info' {
    switch (classifyActionResultCode(code)) {
        case 'success': return 'success';
        case 'failure': return 'error';
        case 'running': return 'warning';
        default: return 'info';
    }
}

/** The Font Awesome class a code should render with. Paired with {@link actionResultColor}. */
export function actionResultIcon(code: string | null | undefined): string {
    switch (classifyActionResultCode(code)) {
        case 'success': return 'fa-solid fa-check-circle';
        case 'failure': return 'fa-solid fa-exclamation-circle';
        case 'running': return 'fa-solid fa-spinner fa-spin';
        default: return 'fa-solid fa-info-circle';
    }
}
