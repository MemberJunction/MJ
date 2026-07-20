/**
 * tiers.ts — the single source of truth for integration-test tier gating.
 *
 * An integration check belongs to a tier that decides whether it runs by default:
 *   - 'deterministic' — credential-free, read-only-or-self-cleaning; the blocking CI gate. Ungated.
 *   - 'mutation'      — writes to the DB and cleans up unconditionally; gated by RUN_MUTATION_TESTS.
 *   - 'live-model'    — incurs LLM token cost; opt-in/nightly; gated by RUN_AGENT_TESTS.
 *
 * Both the standalone tsx scripts and the IntegrationTestDriver call IsTierEnabled(),
 * so a gate is honored identically in both execution paths (no drift). This is a
 * verbatim port of the harness's gate semantics (RUN_MUTATION_TESTS === '1' /
 * RUN_AGENT_TESTS === '1').
 */

/** The three execution tiers an integration check (or Test) can belong to. */
export type IntegrationTier = 'deterministic' | 'mutation' | 'live-model';

/** Maps a tier to the env var that must equal '1' for it to run. Deterministic is ungated. */
export const TIER_ENV_GATE: Readonly<Record<IntegrationTier, string | null>> = {
    'deterministic': null,
    'mutation': 'RUN_MUTATION_TESTS',
    'live-model': 'RUN_AGENT_TESTS'
};

/**
 * Returns true if the given tier is enabled in the current process environment.
 * Deterministic is always enabled; mutation/live-model require their env gate === '1'.
 * Single source of truth honored by both the tsx scripts and IntegrationTestDriver.
 */
export function IsTierEnabled(tier: IntegrationTier, env: NodeJS.ProcessEnv = process.env): boolean {
    const gate = TIER_ENV_GATE[tier];
    if (gate === null) {
        return true;
    }
    return env[gate] === '1';
}
