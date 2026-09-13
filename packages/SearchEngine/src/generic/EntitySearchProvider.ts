/**
 * @fileoverview Entity search provider using RunView with UserSearchString.
 *
 * Searches entities where AllowUserSearchAPI=true using the database-native
 * LIKE-based search infrastructure. Returns scored candidates suitable for
 * RRF fusion with vector and full-text results.
 *
 * @module @memberjunction/search-engine
 */

import { CompositeKey, IMetadataProvider, LogError, LogStatus, RunView, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseSearchProvider } from './ISearchProvider';
import { SearchSource, SearchFilters, SearchResultItem, SearchResultType, ScopeConstraints, ScopeEntityConstraint } from './search.types';
import { envIntOverride } from './env-config';

/**
 * Why one entity's slice of a fan-out came back empty.
 *
 * `'timeout'` — the per-entity wait elapsed. The query is very likely STILL RUNNING in the
 * database; we stopped waiting, we did not stop the work.
 * `'error'`   — the RunView reported a failure, or threw.
 */
export type EntitySearchIncompleteReason = 'timeout' | 'error';

/** One entity's outcome within a single {@link EntitySearchProvider.Search} fan-out. */
export type EntitySearchOutcome = {
    EntityName: string;
    Items: SearchResultItem[];
    /** `null` when the entity answered — an empty `Items` then genuinely means "no matches". */
    Incomplete: EntitySearchIncompleteReason | null;
};

/**
 * Summary of a fan-out that could not read everything it was asked to read — the payload of
 * {@link EntitySearchProvider.OnIncompleteResults}.
 */
export type EntitySearchIncompleteReport = {
    /** The query text actually issued (post query-transform). */
    Query: string;
    /** How many entities were in scope for this fan-out. */
    EntitiesRequested: number;
    /** Entity names whose per-entity wait elapsed. */
    TimedOutEntities: string[];
    /** Entity names whose query reported a failure or threw. */
    FailedEntities: string[];
};

/**
 * Provides entity-level LIKE-based search using RunView + UserSearchString.
 * Searches all entities where AllowUserSearchAPI=true, returning results
 * with rank-based scores.
 */
@RegisterClass(BaseSearchProvider, 'EntitySearchProvider')
export class EntitySearchProvider extends BaseSearchProvider {
    public readonly SourceType: SearchSource = 'entity';

    /**
     * Minimum trimmed term length we accept. A single-character substring against a
     * `LIKE '%term%'` pattern across every searchable entity is essentially a
     * full-database scan with negligible relevance, so we early-return for those. Set to 2
     * (was 3) so legitimate short queries — product codes, initials, "US", "AI" — are not
     * silently dropped (bug C3: users couldn't find records that exist).
     */
    private static readonly MIN_TERM_LENGTH = 2;

    /**
     * How many rows to fetch PER ENTITY as the relevance-ranking candidate pool. This is
     * DELIBERATELY decoupled from the global `topK` budget (bug C3): previously the per-entity
     * limit was `topK / entityCount` floored at 3, so with ~150 searchable entities each entity
     * returned only ~3 arbitrary rows and real matches beyond row 3 were never fetched — and
     * enabling MORE entities starved each one further. Now each entity contributes up to this
     * many candidates; the engine still trims the fused, relevance-sorted result set back to
     * `topK`, so the returned count is unchanged — we only widen the candidate pool per entity.
     * Public + static so a deployment can tune it at startup (larger entity counts may lower it
     * to bound the row-materialization cost of the parallel fan-out), or override the default at
     * process start via the `MJ_SEARCH_PER_ENTITY_FETCH_DEPTH` environment variable.
     */
    public static PerEntityFetchDepth = envIntOverride('MJ_SEARCH_PER_ENTITY_FETCH_DEPTH', 15);

    /**
     * Per-entity hard timeout, in milliseconds. If one entity's RunView takes longer
     * than this, we drop its results rather than hold the entire fan-out hostage. The
     * query keeps running in SQL Server until completion (we can't cancel mssql
     * Requests here), but the other entities' results still land for the user.
     *
     * Public + static so a deployment can tune it at startup — mirroring
     * {@link PerEntityFetchDepth}. The 3s default keeps interactive/omnibar fan-outs
     * responsive by dropping a pathological entity promptly instead of stalling the
     * whole fan-out; deployments doing large unindexed LIKE scans can raise it, either
     * by overriding the default at process start via the `MJ_SEARCH_PER_ENTITY_TIMEOUT_MS`
     * environment variable or by assigning the static before serving:
     *
     * ```ts
     * import { EntitySearchProvider } from '@memberjunction/search-engine';
     * EntitySearchProvider.PerEntityTimeoutMS = 30_000;
     * ```
     */
    public static PerEntityTimeoutMS = envIntOverride('MJ_SEARCH_PER_ENTITY_TIMEOUT_MS', 3000);

    /**
     * Maximum number of per-entity RunViews this provider will have IN FLIGHT at once.
     *
     * Previously the fan-out was a flat `Promise.all` over every scoped entity, and that is
     * the innermost of THREE nested unbounded layers: `SearchEngine` fans out per resolved
     * scope, then per provider within each scope, then this fans out per entity. With ~150
     * entities carrying `AllowUserSearchAPI` and a couple of scopes, one keystroke in the
     * omnibar could put several hundred `LIKE '%term%'` scans on the connection pool
     * simultaneously.
     *
     * {@link PerEntityTimeoutMS} does NOT bound that: it bounds how long each query is
     * *waited on*, not how many run. The abandoned query keeps executing in the database
     * (mssql `Request`s are not cancelled here), so under overload the timeouts fire, every
     * entity resolves to an empty list, and the user sees *silently missing results* while
     * the server is still working through the pile.
     *
     * Public + static so a deployment can tune it at startup, or override the default at
     * process start via `MJ_SEARCH_MAX_CONCURRENT_ENTITIES`. The default of 8 is deliberately
     * conservative: the fused result set is capped at `topK` regardless, so a lower ceiling
     * costs latency on pathological fan-outs and buys back the pool.
     *
     * ```ts
     * import { EntitySearchProvider } from '@memberjunction/search-engine';
     * EntitySearchProvider.MaxConcurrentEntitySearches = 16;
     * ```
     */
    public static MaxConcurrentEntitySearches = envIntOverride('MJ_SEARCH_MAX_CONCURRENT_ENTITIES', 8);

    /**
     * Optional deployment hook, invoked once per {@link Search} call that could not read every
     * entity it was asked to read.
     *
     * Exists because a per-entity timeout or query failure resolves to an EMPTY LIST, which is
     * indistinguishable downstream from "this entity genuinely has no matches". Fusion then
     * publishes a confident, complete-looking result set that is quietly missing whole
     * entities. The provider cannot widen its own return type — `BaseSearchProvider.Search`
     * fixes it at `SearchResultItem[]` — so the partial-ness is surfaced here instead, as a
     * report the host can turn into a "showing partial results" signal.
     *
     * The report is a fresh object per call and is never retained, so installing this hook
     * introduces no shared mutable state between concurrent searches.
     *
     * Not invoked when every entity answered.
     */
    public static OnIncompleteResults?: (report: EntitySearchIncompleteReport) => void;

    /**
     * Execute an entity search across all entities with AllowUserSearchAPI=true.
     *
     * @param query - The search query text
     * @param topK - Maximum number of results per entity
     * @param filters - Optional filters (EntityNames to restrict search scope)
     * @param contextUser - The user performing the search
     * @returns Scored result items from entity search
     */
    public async Search(
        query: string,
        topK: number,
        filters: SearchFilters | undefined,
        contextUser: UserInfo,
        scopeConstraints?: ScopeConstraints
    ): Promise<SearchResultItem[]> {
        const trimmed = (query ?? '').trim();
        if (trimmed.length < EntitySearchProvider.MIN_TERM_LENGTH) return [];
        try {
            // Honor per-provider query transform (e.g., FTS keyword extraction, AI rewrite)
            const rawQuery = scopeConstraints?.QueryTransforms?.[this.SourceType] ?? query;
            // Strip SQL LIKE wildcards (`%`, `_`, `[`, `]`) before passing through to
            // RunView's UserSearchString. The downstream `GenericDatabaseProvider`
            // builds `LIKE '%${input}%'` clauses with only single-quote escaping —
            // unstripped `%` would silently match every row, and `[abc]` would
            // become a LIKE character-class. We treat these characters as
            // not-meaningful for entity LIKE search rather than offering a
            // user-facing "match wildcard" feature.
            const effectiveQuery = this.sanitizeUserSearchString(rawQuery);
            if (!effectiveQuery) {
                // Query was entirely wildcard chars — nothing meaningful to match
                LogStatus('EntitySearchProvider: Query reduced to empty after wildcard strip — returning no results');
                return [];
            }

            // Multi-provider migration (v5.31+): use `this.Provider` instead of
            // `new Metadata()` so the search honors a non-default IMetadataProvider
            // when the calling component supplies one. Falls back to the global
            // default when unset.
            const md = this.Provider;
            // Build the scoped subset: if scopeConstraints.Entities is provided, use those
            // verbatim (they already went through the scope's Nunjucks-rendered ExtraFilter +
            // UserSearchString pipeline). Otherwise fall back to legacy AllowUserSearchAPI
            // behavior with optional filters.EntityNames restriction.
            const scoped = this.buildScopedEntityList(md, scopeConstraints, filters);

            if (scoped.length === 0) {
                LogStatus('EntitySearchProvider: No searchable entities (scope or metadata match empty)');
                return [];
            }

            // Debug: log scoped entities and their search fields
            LogStatus(`EntitySearchProvider: Searching ${scoped.length} entities for "${effectiveQuery}"${scopeConstraints ? ' (scoped)' : ''}`);
            for (const e of scoped.slice(0, 3)) {
                const entity = md.EntityByName(e.EntityName);
                if (entity) {
                    const searchFields = entity.Fields.filter(f => f.IncludeInUserSearchAPI);
                    LogStatus(`  Entity "${e.EntityName}": ${searchFields.length} searchable fields [${searchFields.slice(0, 5).map(f => f.Name).join(', ')}${searchFields.length > 5 ? '...' : ''}]`);
                }
            }

            // Per-entity candidate depth — decoupled from the global topK budget so widening the
            // entity fan-out never starves any single entity (bug C3). Each entity contributes up to
            // PerEntityFetchDepth candidates (but never more than topK, since the final result set is
            // capped at topK anyway); the fused set is relevance-sorted and sliced to topK below.
            const perEntityLimit = Math.min(
                topK,
                Math.max(EntitySearchProvider.PerEntityFetchDepth, Math.ceil(topK / Math.max(1, scoped.length)))
            );

            // Search the entities through a BOUNDED pool, threading per-entity ExtraFilter +
            // UserSearchString override; each call is additionally gated by a hard
            // PerEntityTimeoutMS timeout so a slow entity cannot hold up the whole fan-out —
            // partial results from the other entities still land.
            //
            // The bound is the point: this fan-out is one of THREE nested unbounded layers
            // (SearchEngine fans out per scope, then per provider, then this fans out per
            // entity), so a `Promise.all` over every searchable entity multiplies out to
            // hundreds of simultaneous LIKE scans from a single keystroke. The individual
            // timeouts do not bound the load — they bound how long each query is WAITED on,
            // while the query itself keeps running in the database (see searchOneEntity).
            const outcomes = await EntitySearchProvider.mapWithConcurrency(
                scoped,
                EntitySearchProvider.MaxConcurrentEntitySearches,
                item => this.searchOneEntity(
                    item.EntityName,
                    item.UserSearchString ?? effectiveQuery,
                    perEntityLimit,
                    contextUser,
                    item.ExtraFilter
                )
            );

            this.reportIncompleteEntities(outcomes, effectiveQuery);

            // Re-score against the original query for field-match relevance (not the transform)
            // to keep snippets/field-match semantics consistent with what the user typed.
            const allResults = outcomes.flatMap(o => o.Items);

            // Sort by score descending and limit to topK
            allResults.sort((a, b) => b.Score - a.Score);
            return allResults.slice(0, topK);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`EntitySearchProvider: Search failed: ${msg}`);
            return [];
        }
    }

    /**
     * Resolve the entity list to actually search.
     *
     * - If `scopeConstraints.Entities` is provided, use those directly (each carries its own
     *   rendered ExtraFilter + UserSearchString) — this is the "scoped" path.
     * - Otherwise fall back to the legacy unscoped path (`AllowUserSearchAPI=true` with
     *   optional `filters.EntityNames` restriction) and wrap each in a trivial constraint.
     */
    private buildScopedEntityList(
        md: IMetadataProvider,
        scopeConstraints: ScopeConstraints | undefined,
        filters: SearchFilters | undefined
    ): ScopeEntityConstraint[] {
        if (scopeConstraints?.Entities?.length) {
            // Honor the scope's explicit entity list verbatim.
            return scopeConstraints.Entities;
        }

        const unscoped = this.getSearchableEntities(md, filters);
        return unscoped.map(e => {
            const info = md.EntityByName(e.Name);
            return {
                EntityID: info?.ID ?? '',
                EntityName: e.Name,
            } as ScopeEntityConstraint;
        });
    }

    /**
     * Get the list of entities eligible for search, optionally filtered by name.
     */
    private getSearchableEntities(
        md: IMetadataProvider,
        filters: SearchFilters | undefined
    ): { Name: string }[] {
        let entities = md.Entities.filter(e => e.AllowUserSearchAPI);

        if (filters?.EntityNames?.length) {
            const allowedNames = new Set(filters.EntityNames.map(n => n.toLowerCase()));
            entities = entities.filter(e => allowedNames.has(e.Name.toLowerCase()));
        }

        return entities;
    }

    /**
     * Run `worker` over `items` with at most `limit` calls in flight, preserving input order
     * in the returned array.
     *
     * Static and internal-by-convention (not re-exported from the package index) so it can be
     * exercised directly by the tests that pin the ceiling. `next++` needs no lock: the
     * increment is a single synchronous step and JavaScript gives us one of those at a time,
     * so no two runners can claim the same index.
     */
    public static async mapWithConcurrency<TIn, TOut>(
        items: readonly TIn[],
        limit: number,
        worker: (item: TIn, index: number) => Promise<TOut>
    ): Promise<TOut[]> {
        const out: TOut[] = new Array<TOut>(items.length);
        if (items.length === 0) {
            return out;
        }
        // A non-positive or absurd ceiling must not become "no concurrency" or "unbounded":
        // clamp to [1, items.length].
        const effective = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
        let next = 0;
        const runners: Promise<void>[] = [];
        for (let r = 0; r < effective; r++) {
            runners.push((async () => {
                for (;;) {
                    const index = next++;
                    if (index >= items.length) {
                        return;
                    }
                    out[index] = await worker(items[index], index);
                }
            })());
        }
        await Promise.all(runners);
        return out;
    }

    /**
     * Turn the per-entity outcomes into one report for {@link OnIncompleteResults}, plus a
     * single rolled-up log line.
     *
     * Rolled up on purpose: the previous behaviour logged one line per timed-out entity from
     * inside the race, so an overloaded fan-out produced N separate lines and no statement of
     * the thing that actually matters — that THIS SEARCH's answer is incomplete.
     */
    private reportIncompleteEntities(outcomes: readonly EntitySearchOutcome[], query: string): void {
        const timedOut = outcomes.filter(o => o.Incomplete === 'timeout').map(o => o.EntityName);
        const failed = outcomes.filter(o => o.Incomplete === 'error').map(o => o.EntityName);
        if (timedOut.length === 0 && failed.length === 0) {
            return;
        }

        const report: EntitySearchIncompleteReport = {
            Query: query,
            EntitiesRequested: outcomes.length,
            TimedOutEntities: timedOut,
            FailedEntities: failed,
        };

        LogError(
            `EntitySearchProvider: PARTIAL RESULTS for "${query}" — ` +
            `${timedOut.length + failed.length} of ${outcomes.length} entities did not answer ` +
            `(${timedOut.length} timed out after ${EntitySearchProvider.PerEntityTimeoutMS}ms` +
            `${timedOut.length > 0 ? `: ${timedOut.join(', ')}` : ''}` +
            `${failed.length > 0 ? `; ${failed.length} failed: ${failed.join(', ')}` : ''}).`
        );

        const hook = EntitySearchProvider.OnIncompleteResults;
        if (hook) {
            try {
                hook(report);
            } catch (err) {
                // A host's reporting hook must never be able to fail the search it is
                // reporting on.
                LogError(`EntitySearchProvider: OnIncompleteResults hook threw — ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    /**
     * Search a single entity using RunView with UserSearchString. Wraps the
     * underlying RunView in a hard PerEntityTimeoutMS timeout so a slow
     * entity cannot hold up the whole fan-out — partial results from the
     * other entities still land.
     *
     * Returns an {@link EntitySearchOutcome} rather than a bare array so the caller can tell
     * "this entity has no matches" from "we never heard back about this entity". Those were
     * the same value — `[]` — and that is how an incomplete result set came to be presented
     * as a complete one.
     *
     * Note: `contextUser` is passed to RunView so row-level security (RLS) is applied
     * automatically — this is the Entity provider's permission push-down per Section 3.6
     * of plans/search-scopes-rag-plus.md.
     */
    private async searchOneEntity(
        entityName: string,
        userSearchString: string,
        maxRows: number,
        contextUser: UserInfo,
        extraFilter?: string
    ): Promise<EntitySearchOutcome> {
        const work = this.searchOneEntityRaw(entityName, userSearchString, maxRows, contextUser, extraFilter);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<EntitySearchOutcome>(resolve => {
            timer = setTimeout(() => {
                resolve({ EntityName: entityName, Items: [], Incomplete: 'timeout' });
            }, EntitySearchProvider.PerEntityTimeoutMS);
        });
        try {
            return await Promise.race([work, timeout]);
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    private async searchOneEntityRaw(
        entityName: string,
        userSearchString: string,
        maxRows: number,
        contextUser: UserInfo,
        extraFilter?: string
    ): Promise<EntitySearchOutcome> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<Record<string, unknown>>({
                EntityName: entityName,
                UserSearchString: userSearchString,
                ExtraFilter: extraFilter && extraFilter.trim() ? extraFilter : undefined,
                MaxRows: maxRows,
                ResultType: 'simple'
            }, contextUser);

            if (!result.Success) {
                LogError(`EntitySearchProvider: Failed to search "${entityName}": ${result.ErrorMessage}`);
                return { EntityName: entityName, Items: [], Incomplete: 'error' };
            }

            return {
                EntityName: entityName,
                Items: this.convertResults(result.Results, entityName, userSearchString),
                Incomplete: null,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`EntitySearchProvider: Error searching "${entityName}": ${msg}`);
            return { EntityName: entityName, Items: [], Incomplete: 'error' };
        }
    }

    /**
     * Convert RunView results to SearchResultItem format with field-match relevance scores.
     * Score is based on how many searchable fields contain the query and whether
     * the match is in a name/title field (higher weight) vs description/other fields.
     */
    private convertResults(
        records: Record<string, unknown>[],
        entityName: string,
        query: string
    ): SearchResultItem[] {
        const md = this.Provider;
        const entityInfo = md.EntityByName(entityName);
        const queryLower = query.toLowerCase();

        // Get searchable fields and classify them by importance
        const searchFields = entityInfo?.Fields.filter(f => f.IncludeInUserSearchAPI) ?? [];
        const nameFields = searchFields.filter(f => f.IsNameField);
        const totalSearchableFields = Math.max(searchFields.length, 1);

        return records.map((record) => {
            // Build the key from the entity's actual primary-key column(s) and emit it in compact
            // CompositeKey form: the bare value for a single-column key (whatever it is called),
            // "F1|v1||F2|v2" for a composite one. Reading `record.ID` yielded '' for any entity whose
            // key isn't named ID, and SearchFusion drops empty RecordIDs — so this lane silently
            // contributed nothing for those entities. RunView always returns the PK columns, even
            // with an explicit Fields list, so the values are guaranteed present on the row.
            const recordID = entityInfo
                ? CompositeKey.FromEntityRecord(entityInfo, record).ToCompactURLSegment()
                : String(record.ID ?? '');
            const title = this.extractTitle(record, entityInfo);
            const snippet = this.extractSnippet(record, entityInfo);

            // Calculate relevance: check how many fields match the query
            let matchedFields = 0;
            let nameFieldMatch = false;
            for (const field of searchFields) {
                const val = record[field.Name];
                if (val != null && String(val).toLowerCase().includes(queryLower)) {
                    matchedFields++;
                    if (nameFields.some(nf => nf.Name === field.Name)) {
                        nameFieldMatch = true;
                    }
                }
            }

            // Score: base from field match ratio, boost for name field matches
            // Range: ~0.15 (weak match in one field) to ~0.95 (name field + multiple fields)
            const fieldRatio = matchedFields / totalSearchableFields;
            const baseScore = 0.15 + (fieldRatio * 0.45); // 0.15 to 0.60
            const nameBoost = nameFieldMatch ? 0.35 : 0;  // +0.35 for name field match
            const score = Math.min(baseScore + nameBoost, 0.95);

            return {
                ID: recordID,
                EntityName: entityName,
                RecordID: recordID,
                SourceType: 'entity',
                ResultType: 'entity-record' as SearchResultType,
                Title: title,
                Snippet: snippet,
                Score: Math.round(score * 100) / 100, // Round to 2 decimal places
                ScoreBreakdown: { Entity: Math.round(score * 100) / 100 },
                Tags: [],
                EntityIcon: entityInfo?.Icon ?? undefined,
                MatchedAt: new Date()
            };
        });
    }

    /**
     * Extract a display title from record data using entity metadata.
     * Combines IsNameField fields in Sequence order.
     */
    private extractTitle(
        record: Record<string, unknown>,
        entityInfo: { Fields: Array<{ Name: string; IsNameField: boolean; Sequence?: number }>; NameField?: { Name: string } } | undefined
    ): string {
        if (entityInfo) {
            // Try IsNameField fields first
            const nameFields = entityInfo.Fields
                .filter(f => f.IsNameField)
                .sort((a, b) => (a.Sequence ?? 9999) - (b.Sequence ?? 9999));

            if (nameFields.length > 0) {
                const parts = nameFields
                    .map(f => record[f.Name])
                    .filter(v => v != null && String(v).trim() !== '')
                    .map(v => String(v));
                if (parts.length > 0) return parts.join(' ');
            }

            // Single NameField fallback
            if (entityInfo.NameField && record[entityInfo.NameField.Name]) {
                return String(record[entityInfo.NameField.Name]);
            }
        }

        // Heuristic fallbacks
        const heuristicFields = ['Name', 'Title', 'Subject', 'Label', 'DisplayName'];
        for (const field of heuristicFields) {
            if (record[field] && typeof record[field] === 'string') {
                return record[field] as string;
            }
        }

        return `Record`;
    }

    /**
     * Extract a display snippet from record data using entity metadata.
     */
    private extractSnippet(
        record: Record<string, unknown>,
        entityInfo: { Name: string } | undefined
    ): string {
        const descFields = ['Description', 'Summary', 'Body', 'Content', 'Text', 'Notes'];
        for (const field of descFields) {
            if (record[field] && typeof record[field] === 'string') {
                const val = record[field] as string;
                return val.length > 200 ? val.substring(0, 200) + '...' : val;
            }
        }

        return entityInfo ? `Matched in ${entityInfo.Name}` : 'Matched record';
    }

    /**
     * Remove SQL LIKE wildcard characters from a user-supplied search string.
     *
     * The downstream `GenericDatabaseProvider.createViewUserSearchSQL`
     * interpolates user input directly into `LIKE '%${input}%'`, only
     * escaping single quotes. Unstripped LIKE wildcards (`%`, `_`, `[`, `]`)
     * would either match too much (e.g. `Query="%"` matches every row) or
     * trigger LIKE character-class parsing (`Query="[abc]"`).
     *
     * Behavior intent: these characters are treated as not-meaningful for
     * entity LIKE search. A query containing literal `%` (e.g. `100%`) will
     * not find records that contain `100%` — the trade-off is documented
     * to keep the behavior predictable and safe.
     *
     * Trailing/leading whitespace is collapsed; an all-wildcard query
     * returns empty and the caller short-circuits to zero results.
     */
    private sanitizeUserSearchString(input: string): string {
        return input.replace(/[%_[\]]/g, '').trim();
    }
}
