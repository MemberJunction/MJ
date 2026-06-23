/**
 * types.ts — the shape the IntegrationTestDriver parses off MJTestEntity.Configuration.
 * The metadata layer is intentionally thin: a Test's Configuration selects an ordered
 * list of registered checks (by Id) plus optional gating.
 */

/** One check selection inside an integration Test's Configuration. */
export interface IntegrationCheckSelection {
    /** Registry key resolved at runtime, e.g. "server-cache.S1". Free-text, like the
     *  existing Configuration.oracles[].type pattern. */
    type: string;
    /** Optional per-check knobs. Schemaless bag, reserved for later phases. */
    config?: Record<string, unknown>;
}

/** Shape parsed off MJTestEntity.Configuration for the Integration Test type. */
export interface IntegrationTestConfig {
    /** Ordered list of checks to run in ONE Execute() against one bootstrapped context.
     *  Order is load-bearing: the driver runs them in array order so stateful pairs like
     *  S1 (warm) → S2 (assert hit) behave like the standalone harness. */
    checks: IntegrationCheckSelection[];
    /** When set, Execute() reads process.env[requiresEnv]; if !== '1' the test is
     *  skip-passed with a gate note (local-dev / gated-tier safety net). */
    requiresEnv?: string;
    /** Which transport the checks need. 'server' = SQLServerDataProvider only;
     *  'client' = also needs a running MJAPI + MJ_API_KEY (deferred past Phase 1). */
    transport?: 'server' | 'client';
}
