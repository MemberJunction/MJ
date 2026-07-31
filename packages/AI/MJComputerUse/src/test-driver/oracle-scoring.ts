/**
 * Oracle scoring policy for Computer Use tests (CU-D3).
 *
 * Advisory oracles are reported and scored for diagnostics but do NOT gate the
 * test's Passed/Failed status. This lets efficiency/quality signals — most
 * importantly `step-count` — inform the score without failing an otherwise
 * successful run. (The engine already caps steps at the same limit a step-count
 * oracle would check, so a *gating* step-count check is a tautology.)
 *
 * These are pure functions so the policy can be unit-tested without standing up
 * the full driver.
 */

import type { OracleResult } from '@memberjunction/testing-engine';

/** Oracle types that are advisory by default unless the test config overrides. */
const DEFAULT_ADVISORY_TYPES = new Set<string>(['step-count']);

/**
 * Resolve whether an oracle is advisory (non-gating). An explicit per-oracle
 * `advisory` config value always wins; otherwise the type's default applies.
 */
export function isOracleAdvisory(type: string, explicitAdvisory?: boolean): boolean {
    return explicitAdvisory ?? DEFAULT_ADVISORY_TYPES.has(type);
}

/**
 * The gating subset of oracle results — those that determine Passed/Failed.
 * Advisory results (`advisory === true`) are excluded.
 */
export function partitionGatingOracles(results: OracleResult[]): OracleResult[] {
    return results.filter(r => r.advisory !== true);
}
