/**
 * tier-scope.ts — process state that applies only while the driver runs a test of given tiers.
 *
 * Check content sometimes has to change host behaviour for a tier (for example the deterministic
 * tier switches off the save-time AI prompts so it makes no live model call). Doing that at module
 * load would leak into every other test the same process runs — `mj test` loads the check modules
 * for every run, including the live-model suite and non-integration test types. A tier scope
 * instead is entered by {@link IntegrationTestDriver} right before it runs the bundles of a test
 * whose tier matches, and undone in a `finally` when that test ends, whatever its outcome.
 *
 * Limitations: a scope changes PROCESS-GLOBAL state. A parallel suite run (TestEngine
 * `options.parallel`) that mixes live-model and deterministic tests therefore sees the switch off
 * (or on) for every test running at that moment, not just the matching tier's. Also, a check that
 * timed out keeps running in the background (the driver only stops waiting for it), so it continues
 * after the scope has exited and sees the restored state.
 */
import type { IntegrationTier } from './tiers';

/** Undoes what {@link IntegrationTierScope.Enter} did. */
export type IntegrationTierScopeExit = () => void;

/** A reversible change to process state, bound to the tests of one or more tiers. */
export interface IntegrationTierScope {
    /** Unique name; registering the same name again with an equivalent scope replaces it (a bundler's duplicate module copy). */
    Name: string;
    /** The tiers whose tests run inside this scope. */
    Tiers: readonly IntegrationTier[];
    /** Applies the change and returns the function that restores the previous state. */
    Enter(): IntegrationTierScopeExit;
}
