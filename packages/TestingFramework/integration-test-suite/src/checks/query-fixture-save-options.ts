/**
 * query-fixture-save-options.ts — how the integration bundles save the `MJ: Queries`,
 * `MJ: Query SQLs` and `MJ: Template Contents` rows they create.
 *
 * Saving a query or a template content runs its extraction pipeline, and with an AI vendor key in
 * the environment that includes an LLM enrichment call per save. The bundles that use this assert only on the
 * deterministic extraction (rows, totals, UsesTemplate), and the deterministic tier is meant to be
 * credential-free, so they skip the enrichment rather than make one paid model call per fixture.
 */
import { EntitySaveOptions } from '@memberjunction/core';

/** Save options for a fixture query, query SQL variant or template content: skips the AI enrichment step. */
export function FixtureQuerySaveOptions(): EntitySaveOptions {
    const options = new EntitySaveOptions();
    options.SkipEntityAIActions = true;
    return options;
}
