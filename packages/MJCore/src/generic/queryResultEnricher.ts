import { MJGlobal } from '@memberjunction/global';
import { QueryInfo } from './queryInfo';
import { UserInfo } from './securityInfo';
import { IMetadataProvider } from './interfaces';

/**
 * Declarative, runtime-only directive that asks RunQuery to post-process its result
 * rows through a registered {@link QueryResultEnricherBase}. Supplied on
 * `RunQueryParams.Enrichment` per-call — there is intentionally NO persisted query
 * column for this (a saved per-query annotation is a deliberate follow-up), so the
 * feature is purely additive and requires no schema change / CodeGen.
 *
 * The enrichment is decoupled from MJCore: the `EnricherKey` is resolved through the
 * MJGlobal ClassFactory at runtime (see {@link resolveQueryResultEnricher}). When no
 * enricher is registered under the key (e.g. the package that provides it isn't
 * loaded), RunQuery simply no-ops and returns the un-enriched rows.
 */
export interface RunQueryEnrichment {
    /**
     * The ClassFactory key the enricher is registered under
     * (`@RegisterClass(QueryResultEnricherBase, '<key>')`). Resolved at runtime so
     * MJCore never takes a static dependency on any concrete enricher.
     */
    EnricherKey: string;
    /**
     * Free-form, enricher-specific configuration. Passed through verbatim to the
     * resolved enricher's {@link QueryResultEnricherBase.EnrichResults}; its shape is
     * owned by the concrete enricher, not by MJCore.
     */
    Config: Record<string, unknown>;
}

/**
 * Abstract seam for a post-query row enricher. Concrete enrichers live OUTSIDE
 * MJCore (e.g. an ML-scoring enricher in Predictive Studio) and register themselves
 * on the MJGlobal ClassFactory via `@RegisterClass(QueryResultEnricherBase, '<key>')`.
 * RunQuery resolves the registered enricher by key and awaits {@link EnrichResults}
 * just before returning, appending whatever columns the enricher produces.
 *
 * Enrichers MUST be resilient: an enrichment failure must never break the underlying
 * query. RunQuery wraps the call in a try/catch and falls back to the original rows,
 * but enrichers should also degrade gracefully (return the input rows unchanged)
 * rather than throwing for recoverable conditions.
 */
export abstract class QueryResultEnricherBase {
    /**
     * Enrich (append columns to) the query result rows. Implementations should return
     * a row array of the same length and order, mutating/cloning each row to add their
     * derived column(s). On any unrecoverable condition they may throw — RunQuery's
     * guard will log and fall back to the original rows.
     *
     * @param opts.rows the assembled query result rows to enrich
     * @param opts.config the enricher-specific config from {@link RunQueryEnrichment.Config}
     * @param opts.query the loaded query metadata, when available (lets an enricher
     *  read the query's associated entity, fields, etc.)
     * @param opts.contextUser the request user — required server-side for isolation/audit
     * @param opts.provider the owning provider for multi-provider-correct data access
     */
    public abstract EnrichResults(opts: {
        rows: Record<string, unknown>[];
        config: Record<string, unknown>;
        query?: QueryInfo;
        contextUser?: UserInfo;
        provider?: IMetadataProvider;
    }): Promise<Record<string, unknown>[]>;
}

/**
 * Resolve the {@link QueryResultEnricherBase} registered under `key` via the MJGlobal
 * ClassFactory, or `null` when nothing is registered (so MJCore / RunQuery no-op
 * cleanly when the providing package isn't loaded).
 *
 * We check {@link MJGlobal.ClassFactory.GetRegistration} for an actual registration
 * BEFORE constructing — `CreateInstance` would otherwise fall back to instantiating
 * the abstract base, which is not what we want here. Mirrors the defensive resolution
 * style of `resolveMLInferenceProcessor` in Predictive Studio's scoring layer.
 *
 * @param key the `EnricherKey` to resolve
 */
export function resolveQueryResultEnricher(key: string): QueryResultEnricherBase | null {
    if (!key) {
        return null;
    }
    const factory = MJGlobal.Instance.ClassFactory;
    // Only construct when there's a real registration — otherwise CreateInstance would
    // return a bogus instance of the abstract base class.
    const registration = factory.GetRegistration(QueryResultEnricherBase, key);
    if (!registration) {
        return null;
    }
    return factory.CreateInstance<QueryResultEnricherBase>(QueryResultEnricherBase, key);
}
