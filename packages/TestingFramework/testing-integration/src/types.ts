/**
 * types.ts — the shape the IntegrationTestDriver parses off MJTestEntity.Configuration.
 * The metadata layer is intentionally thin: a Test's Configuration selects an ordered
 * list of registered checks (by Id) plus optional gating.
 */
import type { IntegrationTier } from './tiers';

/** Per-selector knobs the driver reads off a check-bundle selection. */
export interface IntegrationCheckSelectionConfig {
    /** Include the bundle's RequiresMutation checks (the original RUN_MUTATION_TESTS gate). */
    runMutationTests?: boolean;
    /** `dataset-cache` bundle: the dataset name to exercise (default 'MJ_Metadata'). */
    datasetName?: string;
    /** `aggregates-cache` bundle: the entity to aggregate over (default 'MJ: User Settings'). */
    entityName?: string;
    /** `rls-isolation` bundle: require two distinct non-exempt users (else degrade to skip). */
    requireTwoDistinctUsers?: boolean;
}

/** One check-BUNDLE selection inside an integration Test's Configuration. */
export interface IntegrationCheckSelection {
    /** Bundle name resolved at runtime via IntegrationCheckRegistry.GetBundle, e.g.
     *  "server-cache" / "runquery-cache" / "client-cache". Free-text, like the
     *  existing Configuration.oracles[].type pattern; the driver expands it to the
     *  bundle's ordered NamedCheck[]. */
    type: string;
    /** Optional per-bundle gating knobs. */
    config?: IntegrationCheckSelectionConfig;
}

/** Shape parsed off MJTestEntity.Configuration for the Integration Test type. */
export interface IntegrationTestConfig {
    /** Ordered list of check BUNDLES to run in ONE Execute() against one bootstrapped
     *  context. Order is load-bearing both across bundles and WITHIN each bundle: the
     *  driver runs each bundle's checks in array order so stateful pairs like S1 (warm)
     *  → S2 (assert hit) behave like the standalone harness. */
    checks: IntegrationCheckSelection[];
    /** Which tier this Test belongs to. Decides the whole-test env gate via TIER_ENV_GATE:
     *  'deterministic' (default) runs unconditionally; 'mutation' requires RUN_MUTATION_TESTS;
     *  'live-model' requires RUN_AGENT_TESTS. When the tier is gated and its env var is unset,
     *  Execute() skip-passes with a gate note. Per-check RequiresMutation/RequiresLiveModel
     *  flags are gated independently (a deterministic Test can still carry mutation checks
     *  that only fire under RUN_MUTATION_TESTS). */
    tier?: IntegrationTier;
    /** Explicit env-gate override. When set, takes precedence over the tier-derived gate:
     *  Execute() reads process.env[requiresEnv] and skip-passes if !== '1'. Normally omitted
     *  in favor of `tier` (local-dev / gated-tier safety net). */
    requiresEnv?: string;
    /** Which transport the checks need. 'server' = SQLServerDataProvider only;
     *  'client' = also needs a running MJAPI + MJ_API_KEY. When omitted, inferred
     *  from the selected bundles (client-cache ⇒ client; everything else ⇒ server). */
    transport?: 'server' | 'client';
}
