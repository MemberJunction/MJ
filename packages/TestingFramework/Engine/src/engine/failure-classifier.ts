/**
 * Failure classification for retry policy (DR-D2).
 *
 * The recheck run proved that retrying deterministic failures under the same
 * conditions is the single largest waste in the suite: 27 cross-run-deterministic
 * failures were retried 3× each. The fix is to classify a failure BEFORE deciding
 * whether to retry it — `impossible`/`app-error` get zero retries; transient
 * classes get retried (health-gated in DR-D3).
 *
 * The authoritative source is the driver's own `failureClass` (Computer Use sets
 * one — CU-F5). This module normalizes that free-form string into the canonical
 * {@link FailureCategory}, and — as the plan's explicit stopgap "until the CU
 * taxonomy lands" — regex-classifies the judge/error message when the driver
 * emitted nothing. Pure + engine-free so the taxonomy is unit-testable.
 */
import { FailureCategory, OracleResult, TestRunResult } from '@memberjunction/testing-engine-base';

/** The nine canonical categories, kept as a set for validation. */
const CANONICAL: ReadonlySet<FailureCategory> = new Set<FailureCategory>([
    'timeout', 'nav-loop', 'blank-page', 'app-error', 'auth-detour', 'assertion', 'impossible', 'infra', 'unknown',
]);

/**
 * Normalize a driver's free-form `failureClass` into a canonical category.
 * Tolerant of the naming drift between the CU taxonomy and this plan's enum
 * (open question #5): `stuck-page`→`blank-page`, `env-stall`→`infra`, etc.
 * Returns `undefined` when `raw` is empty; `unknown` when it's unrecognized.
 */
export function normalizeFailureClass(raw: string | undefined | null): FailureCategory | undefined {
    if (!raw || !raw.trim()) {
        return undefined;
    }
    const key = raw.toLowerCase().replace(/[^a-z]/g, '');
    const synonyms: Record<string, FailureCategory> = {
        timeout: 'timeout', timedout: 'timeout', deadline: 'timeout',
        // CU taxonomy: both timeout variants are env/transient → full retry budget.
        timeoutstuck: 'timeout', timeoutprogressing: 'timeout',
        navloop: 'nav-loop', navigationloop: 'nav-loop', loop: 'nav-loop',
        loopdetected: 'nav-loop', // CU taxonomy: 'loop-detected'
        blankpage: 'blank-page', stuckpage: 'blank-page', emptypage: 'blank-page', whitescreen: 'blank-page',
        apperror: 'app-error', applicationerror: 'app-error', servererror: 'app-error',
        authdetour: 'auth-detour', auth: 'auth-detour', login: 'auth-detour', unauthorized: 'auth-detour',
        assertion: 'assertion', assert: 'assertion', oraclefailed: 'assertion',
        judgedisagreement: 'assertion', // CU taxonomy: 'judge-disagreement' (output judged wrong)
        impossible: 'impossible', infeasible: 'impossible', gaveup: 'impossible',
        infra: 'infra', infrastructure: 'infra', envstall: 'infra', environment: 'infra', network: 'infra',
        unknown: 'unknown',
    };
    return synonyms[key] ?? (CANONICAL.has(raw as FailureCategory) ? (raw as FailureCategory) : 'unknown');
}

/**
 * Prioritized regex rules for the stopgap message classifier. First match wins,
 * so the list is ordered most-specific/most-deterministic first (an `impossible`
 * verdict or an explicit 500 beats a generic "timeout" wrapper). This is a
 * deliberately conservative heuristic — the driver's `failureClass` supersedes it.
 */
const MESSAGE_RULES: ReadonlyArray<readonly [FailureCategory, RegExp]> = [
    ['impossible', /\b(impossible|infeasible|not possible|cannot be (completed|done)|no way to|gave up|unable to (complete|proceed|accomplish))\b/i],
    ['app-error', /\b(500|internal server error|uncaught|unhandled|stack trace|failed to load (bundle|chunk)|missing (bundle|api ?key|key)|empty dataset|no data (found|available))\b/i],
    ['auth-detour', /\b(auth0|unauthorized|401|redirected to (the )?(login|auth|sign)|session expired|log ?in (page|screen|required))\b/i],
    ['assertion', /\b(assert|assertion|expected .*(but|to be)|did not match|mismatch|oracle (failed|reported)|incorrect (value|output|result))\b/i],
    ['nav-loop', /\b(navigation loop|stuck in a loop|loop detected|repeated the same|circular navigation|kept (clicking|navigating))\b/i],
    ['blank-page', /\b(blank page|empty page|white screen|nothing rendered|no content|page (did not|didn't|never) (load|render)|stuck[- ]page)\b/i],
    ['infra', /\b(econnrefused|econnreset|etimedout|getaddrinfo|dns|socket hang up|502|503|504|connection (refused|reset)|browser (crash|disconnect|closed))\b/i],
    ['timeout', /\b(timed?\s*out|timeout|exceeded .*(time|deadline)|deadline exceeded)\b/i],
];

/** Pull the human-readable text out of the goal/judge oracles for classification. */
function oracleText(oracleResults: OracleResult[] | undefined): string {
    if (!oracleResults?.length) {
        return '';
    }
    return oracleResults
        .filter(o => !o.passed)
        .map(o => {
            const reason = (o.details && typeof o.details === 'object' && 'reason' in o.details)
                ? String((o.details as { reason?: unknown }).reason ?? '')
                : '';
            return `${o.message ?? ''} ${reason}`;
        })
        .join(' ');
}

/**
 * Classify a non-passing result into a {@link FailureCategory}.
 *
 * Precedence: (1) the driver's own `failureClass` (authoritative, CU-F5); then
 * (2) the stopgap regex over the error message + failing-oracle text; else
 * `unknown`. Returns `undefined` for a passing/skipped result (no failure to
 * classify).
 *
 * @param result           The resolved test result.
 * @param driverFailureClass The driver's raw `failureClass`, if it set one.
 */
export function classifyFailure(result: TestRunResult, driverFailureClass?: string): FailureCategory | undefined {
    if (result.status === 'Passed' || result.status === 'Skipped') {
        return undefined;
    }
    const fromDriver = normalizeFailureClass(driverFailureClass);
    if (fromDriver && fromDriver !== 'unknown') {
        return fromDriver;
    }
    const haystack = `${result.errorMessage ?? ''} ${oracleText(result.oracleResults)}`.trim();
    if (haystack) {
        for (const [category, rule] of MESSAGE_RULES) {
            if (rule.test(haystack)) {
                return category;
            }
        }
    }
    // A driver that emitted an unrecognized class still beats a blind "unknown".
    return fromDriver ?? 'unknown';
}
