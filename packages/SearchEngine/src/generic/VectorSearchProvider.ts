/**
 * @fileoverview Vector similarity search provider for the SearchEngine.
 *
 * Searches ALL configured vector indexes by grouping them by embedding model,
 * embedding the query once per model, then querying all indexes for that model
 * in parallel. Gracefully returns empty results when no vector indexes are
 * configured.
 *
 * @module @memberjunction/search-engine
 */

import { EntityInfo, LogError, LogStatus, Metadata, RunView, UserInfo, CompositeKey } from '@memberjunction/core';
import { MJVectorIndexEntity, MJVectorDatabaseEntity, MJContentSourceEntity, KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { BaseEmbeddings, GetAIAPIKey } from '@memberjunction/ai';
import { VectorDBBase, BaseResponse } from '@memberjunction/ai-vectordb';
import { MJGlobal, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseSearchProvider } from './ISearchProvider';
import { SearchSource, SearchFilters, SearchResultItem, SearchResultType, ScopeConstraints, ScopeExternalIndexConstraint } from './search.types';
import { CheckScopeJsonFilter, ScopeFilterCheck } from './ScopeFilterGuard';

/**
 * Provides vector similarity search across all configured vector indexes.
 * Handles multiple embedding models and vector databases transparently.
 */
/** Shape of a cached embedding entry */
interface EmbeddingCacheEntry {
    vector: number[];
    timestamp: number;
}

@RegisterClass(BaseSearchProvider, 'VectorSearchProvider')
export class VectorSearchProvider extends BaseSearchProvider {
    public readonly SourceType: SearchSource = 'vector';

    private available = false;

    /** LRU cache for query embeddings. Key = `${modelDriverClass}::${query}`, Value = embedding vector */
    private static EmbeddingCache = new Map<string, EmbeddingCacheEntry>();
    private static readonly CACHE_MAX_SIZE = 200;
    private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    /**
     * Check and cache availability. Requires at least one vector index to be
     * configured. Called by SearchEngine during Config().
     */
    public async CheckAvailability(contextUser: UserInfo): Promise<void> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<{ ID: string }>({
                EntityName: 'MJ: Vector Indexes',
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple'
            }, contextUser);
            this.available = result.Success && result.Results.length > 0;
        } catch {
            this.available = false;
        }
    }

    public IsAvailable(): boolean {
        return this.available;
    }

    /**
     * Search all vector indexes. Groups indexes by embedding model, embeds the
     * query once per model, then queries all indexes for that model in parallel.
     */
    public async Search(
        query: string,
        topK: number,
        filters: SearchFilters | undefined,
        contextUser: UserInfo,
        scopeConstraints?: ScopeConstraints
    ): Promise<SearchResultItem[]> {
        try {
            await AIEngine.Instance.Config(false, contextUser);

            // Honor per-provider query transform
            const effectiveQuery = scopeConstraints?.QueryTransforms?.[this.SourceType] ?? query;

            // Determine the scoped vector-index subset. When scopeConstraints.ExternalIndexes
            // is provided, filter to rows where IndexType='Vector' (3rd-party rows are for
            // other providers) and match the listed VectorIndexIDs. When absent, fall back
            // to "all configured vector indexes" (unscoped legacy behavior).
            const scopedVectorRows = scopeConstraints?.ExternalIndexes
                ? scopeConstraints.ExternalIndexes.filter(r => r.IndexType === 'Vector' && r.VectorIndexID)
                : undefined;

            const rv = new RunView();
            const indexResult = await rv.RunView<MJVectorIndexEntity>({
                EntityName: 'MJ: Vector Indexes',
                ResultType: 'entity_object'
            }, contextUser);

            if (!indexResult.Success || indexResult.Results.length === 0) {
                LogStatus('VectorSearchProvider: No vector indexes configured');
                return [];
            }

            let activeIndexes = indexResult.Results;
            if (scopedVectorRows !== undefined) {
                const allowedIDs = new Set(scopedVectorRows.map(r => r.VectorIndexID!.toLowerCase()));
                activeIndexes = activeIndexes.filter(idx => allowedIDs.has(idx.ID.toLowerCase()));
                if (activeIndexes.length === 0) {
                    // Scope explicitly restricts vector indexes and none of the configured
                    // indexes matched — return empty (scope says "search nothing here").
                    return [];
                }
            }

            const indexesByModel = this.groupIndexesByModel(activeIndexes);
            const baseFilter = this.buildMetadataFilter(filters);

            // For each model group: embed + query all indexes in parallel, optionally merging
            // the scope's per-index MetadataFilter into the baseFilter.
            const modelGroupPromises = Array.from(indexesByModel.entries()).map(
                ([embeddingModelID, indexes]) =>
                    this.embedAndQueryGroup(
                        effectiveQuery,
                        embeddingModelID,
                        indexes,
                        topK,
                        baseFilter,
                        scopedVectorRows,
                        contextUser
                    )
            );

            const groupResults = await Promise.all(modelGroupPromises);
            return groupResults.flat();
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`VectorSearchProvider: Search failed: ${msg}`);
            return [];
        }
    }

    // ────────────────────────────────────────────────────────────────
    // Embedding cache helpers
    // ────────────────────────────────────────────────────────────────

    /** Retrieve a cached embedding if present and not expired, promoting it for LRU */
    private getCachedEmbedding(key: string): number[] | null {
        const entry = VectorSearchProvider.EmbeddingCache.get(key);
        if (entry && (Date.now() - entry.timestamp) < VectorSearchProvider.CACHE_TTL_MS) {
            // Promote to most-recently-used by re-inserting
            VectorSearchProvider.EmbeddingCache.delete(key);
            VectorSearchProvider.EmbeddingCache.set(key, entry);
            return entry.vector;
        }
        // Expired or not found — clean up stale entry if present
        if (entry) VectorSearchProvider.EmbeddingCache.delete(key);
        return null;
    }

    /** Store an embedding in the cache, evicting the oldest entry if at capacity */
    private setCachedEmbedding(key: string, vector: number[]): void {
        // Evict least-recently-used (first key in insertion order) if at capacity
        if (VectorSearchProvider.EmbeddingCache.size >= VectorSearchProvider.CACHE_MAX_SIZE) {
            const oldestKey = VectorSearchProvider.EmbeddingCache.keys().next().value;
            if (oldestKey !== undefined) VectorSearchProvider.EmbeddingCache.delete(oldestKey);
        }
        VectorSearchProvider.EmbeddingCache.set(key, { vector, timestamp: Date.now() });
    }

    // ────────────────────────────────────────────────────────────────
    // Private helpers
    // ────────────────────────────────────────────────────────────────

    /** Group vector indexes by their EmbeddingModelID */
    private groupIndexesByModel(indexes: MJVectorIndexEntity[]): Map<string, MJVectorIndexEntity[]> {
        const groups = new Map<string, MJVectorIndexEntity[]>();
        for (const index of indexes) {
            const modelId = index.EmbeddingModelID;
            const existing = groups.get(modelId);
            if (existing) {
                existing.push(index);
            } else {
                groups.set(modelId, [index]);
            }
        }
        return groups;
    }

    /**
     * Embed query with one model, then query all indexes for that model in parallel.
     */
    private async embedAndQueryGroup(
        query: string,
        embeddingModelID: string,
        indexes: MJVectorIndexEntity[],
        topK: number,
        filter: object | undefined,
        scopedRows: ScopeExternalIndexConstraint[] | undefined,
        contextUser: UserInfo
    ): Promise<SearchResultItem[]> {
        try {
            const model = AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, embeddingModelID));
            if (!model) {
                LogError(`VectorSearchProvider: Embedding model ${embeddingModelID} not found`);
                return [];
            }

            const apiKey = GetAIAPIKey(model.DriverClass);
            // All indexes in this model group share the same embedding model; they should also
            // share the same dimension config. Take the first non-null Dimensions value —
            // undefined means "use the model's native default".
            const dimensions = indexes.find(idx => idx.Dimensions != null)?.Dimensions ?? undefined;
            // Check embedding cache before calling the model
            const cacheKey = `${model.DriverClass}::${query}`;
            let queryVector = this.getCachedEmbedding(cacheKey);

            if (queryVector) {
                LogStatus(`VectorSearchProvider: Embedding cache hit for model ${model.Name}`);
            } else {
                const embeddingInstance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseEmbeddings>(
                    BaseEmbeddings, model.DriverClass, apiKey
                );
                if (!embeddingInstance) {
                    LogError(`VectorSearchProvider: Failed to create embedding for ${model.DriverClass}`);
                    return [];
                }

                // Some embedding drivers (e.g. LocalEmbedding via Xenova/transformers)
                // require the model identifier to load the correct pipeline.
                // Prefer APIName (the canonical identifier the driver expects)
                // and fall back to Name when APIName isn't set or is empty.
                // `||` (not `??`) so an empty-string `APIName` also falls back.
                const modelName = model.APIName || model.Name;
                const embedResult = await embeddingInstance.EmbedText({ text: query, model: modelName, dimensions });
                if (!embedResult?.vector?.length) {
                    LogError(`VectorSearchProvider: Failed to embed with ${model.Name}`);
                    return [];
                }

                queryVector = embedResult.vector;
                this.setCachedEmbedding(cacheKey, queryVector);
            }

            const indexPromises = indexes.map(vectorIndex => {
                // Merge per-index rendered MetadataFilter (from scope) into the base filter
                const perIndexRow = scopedRows?.find(
                    r => r.VectorIndexID && UUIDsEqual(r.VectorIndexID, vectorIndex.ID)
                );
                const merge = this.mergeMetadataFilters(filter, perIndexRow?.MetadataFilter);
                if (merge.Status === 'unusable') {
                    // FAIL CLOSED. A filter was authored for this index but cannot be applied,
                    // so querying would silently drop the scope's restriction — including the
                    // tenant clause — and read the entire index. Skip this index instead.
                    LogError(
                        `VectorSearchProvider: skipping index "${vectorIndex.Name}" because its scope MetadataFilter cannot be applied — ${merge.Reason}. ` +
                        `The index is NOT queried, because running it unfiltered would ignore the scope's tenant/permission push-down.`
                    );
                    return Promise.resolve([] as SearchResultItem[]);
                }
                const mergedFilter = merge.Status === 'usable' ? merge.Value : undefined;
                const providerConfig = perIndexRow?.ExternalIndexConfig as Record<string, unknown> | undefined;
                return this.queryOneIndex(vectorIndex, queryVector!, query, topK, mergedFilter, providerConfig, contextUser)
                    .catch(error => {
                        LogError(`VectorSearchProvider: Error querying index "${vectorIndex.Name}": ${error}`);
                        return [] as SearchResultItem[];
                    });
            });

            const indexResults = await Promise.all(indexPromises);
            return indexResults.flat();
        } catch (error) {
            LogError(`VectorSearchProvider: Error in embedding group ${embeddingModelID}: ${error}`);
            return [];
        }
    }

    /**
     * Query a single vector index.
     *
     * When the index's vector database is **colocated** (vectors stored in the application's
     * own relational DB — e.g. `PgVectorColocated`), this routes through `ColocatedQuery`,
     * wiring in the active data-provider connection and passing the original query text so the
     * provider can fuse a keyword (full-text) component with the vector search in one statement.
     * Otherwise it falls back to the standard external `QueryIndex` path.
     *
     * @param providerConfig - Optional opaque config blob passed through to the vector DB
     *   driver. Each driver reads the keys it understands (e.g. Pinecone reads `namespace`).
     *   Sourced from the scope's rendered `ExternalIndexConfig`. Ignored by the colocated path.
     */
    private async queryOneIndex(
        vectorIndex: MJVectorIndexEntity,
        queryVector: number[],
        queryText: string,
        topK: number,
        filter: object | undefined,
        providerConfig: Record<string, unknown> | undefined,
        contextUser: UserInfo
    ): Promise<SearchResultItem[]> {
        const rv = new RunView();
        const dbResult = await rv.RunView<MJVectorDatabaseEntity>({
            EntityName: 'MJ: Vector Databases',
            ExtraFilter: `ID='${vectorIndex.VectorDatabaseID}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (!dbResult.Success || dbResult.Results.length === 0) {
            LogError(`VectorSearchProvider: VectorDatabase not found for index "${vectorIndex.Name}"`);
            return [];
        }

        const vectorDB = dbResult.Results[0];
        const apiKey = GetAIAPIKey(vectorDB.ClassKey);
        const vectorDBInstance = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(
            VectorDBBase, vectorDB.ClassKey, apiKey
        );

        if (!vectorDBInstance) {
            LogError(`VectorSearchProvider: Failed to create VectorDB instance for "${vectorDB.ClassKey}"`);
            return [];
        }

        // Colocated path: wire in the active data-provider connection and run a hybrid
        // (vector + keyword) query in the same database as the entity rows. TryWireColocatedHost
        // is a no-op for non-colocated providers, so this is safe to attempt unconditionally.
        vectorDBInstance.TryWireColocatedHost(this.Provider);
        if (vectorDBInstance.SupportsColocatedQuery) {
            const colocated = await vectorDBInstance.ColocatedQuery({
                indexName: vectorIndex.Name,
                vector: queryVector,
                keyword: queryText,
                topK,
                filter,
                fusion: 'rrf',
                includeMetadata: true,
            }, contextUser);
            const [fallbackEntity, entityByContentSourceID] = await Promise.all([
                this.getFallbackEntityName(colocated.matches, vectorIndex, contextUser),
                this.resolveContentSourceEntities(colocated.matches, contextUser),
            ]);
            return this.convertMatches(colocated.matches, vectorIndex.Name, fallbackEntity, entityByContentSourceID);
        }

        // contextUser is passed as the 2nd arg per VectorDBBase.QueryIndex's
        // contract. Remote drivers (Pinecone/Qdrant) ignore it and authenticate
        // via their own API key; in-process drivers (e.g. SimpleVectorDatabase)
        // use it to honor server-side row-level security when loading vectors
        // via RunView.
        const response: BaseResponse = await vectorDBInstance.QueryIndex({
            id: vectorIndex.Name,
            vector: queryVector,
            topK,
            includeMetadata: true,
            filter,
            providerConfig,
        }, contextUser);

        if (!response.success || !response.data?.matches) {
            return [];
        }

        const [fallbackEntity, entityByContentSourceID] = await Promise.all([
            this.getFallbackEntityName(response.data.matches, vectorIndex, contextUser),
            this.resolveContentSourceEntities(response.data.matches, contextUser),
        ]);
        return this.convertMatches(response.data.matches, vectorIndex.Name, fallbackEntity, entityByContentSourceID);
    }

    /**
     * Resolve a fallback entity name for matches whose metadata omits the `Entity` key
     * (e.g. indexes populated with fieldStrategy 'explicit'). Only does the lookup when
     * at least one match actually needs it.
     */
    private async getFallbackEntityName(
        matches: Array<{ metadata?: Record<string, unknown> }> | undefined,
        vectorIndex: MJVectorIndexEntity,
        contextUser: UserInfo
    ): Promise<string | null> {
        if (!matches?.some(m => !m.metadata?.['Entity'])) {
            return null;
        }
        return this.resolveIndexEntityName(vectorIndex.ID, contextUser);
    }

    /**
     * Resolve, per **content source**, the entity that source declares its vectors to be.
     *
     * This is the attribution path for an index populated by the ContentSource pipeline with
     * `fieldStrategy: 'explicit'`, where `ContentSourceID` is present but the identity keys are not.
     * It is strictly better than any index-wide fallback for two reasons:
     *
     *  - **It is per match.** One index can hold vectors from many content sources, so an index-wide
     *    answer is wrong the moment a second source shares the index. A `ContentSourceID` is carried
     *    by the vector itself.
     *  - **It is declared, not inferred.** `Configuration.VectorEntityName` is set by the source's
     *    owner; nothing here guesses. That matters because attribution decides *which* entity's
     *    CanRead/RLS `SearchEngine.filterEntityResults` evaluates — an inferred name would put the
     *    wrong object's permissions in front of the records.
     *
     * Declaring it also lets a source point at an **ISA extension** rather than the base entity it
     * inherits from, which an index-wide or pipeline-hardcoded name cannot express: the extension is
     * usually where row-level security lives, so the distinction is a security one, not cosmetic.
     *
     * Returns a map keyed by `ContentSourceID`; sources with no declared entity are simply absent, so
     * their matches fall through to the Entity Document path and then to 'Unknown' exactly as before.
     */
    private async resolveContentSourceEntities(
        matches: Array<{ metadata?: Record<string, unknown> }> | undefined,
        contextUser: UserInfo
    ): Promise<Map<string, string>> {
        const byContentSourceID = new Map<string, string>();
        const needAttribution = matches?.filter(m => !m.metadata?.['Entity']) ?? [];
        if (needAttribution.length === 0) {
            return byContentSourceID;
        }

        const engine = KnowledgeHubMetadataEngine.Instance;
        try {
            // Pass `this.Provider`, not just the user: the declared entity is resolved through this
            // provider a few methods down, so loading the sources against the process-global default
            // would read one metadata set and validate against another.
            await engine.Config(false, contextUser, this.Provider);
        } catch (error) {
            // Attribution is best-effort — never let a metadata failure sink the query results.
            LogError(`VectorSearchProvider: Failed to load knowledge-hub metadata: ${error}`);
            return byContentSourceID;
        }

        // An empty content-source collection is NOT evidence that nothing is declared. On a
        // permission-denied load `BaseEngine` empties every collection, records the load as
        // SUCCESSFUL, flags itself constrained, and does not throw — and this engine exposes its
        // backing arrays directly rather than through `GetConfigData`, so no PermissionConstrainedError
        // surfaces. Declining explicitly (rather than reading "nothing declared") is the difference
        // between "no declaration" and "cannot see the declaration".
        //
        // Two properties of that flag a reader should know, because they bound what this guard achieves:
        // it is set when ANY of the engine's configs is denied — not necessarily the content sources —
        // and it is process-wide and sticky, reset only on a fresh or forced load. So it reflects
        // whoever warmed the singleton first, not the caller. Naming the denied entities rather than
        // guessing is the least this can do; the real fix is registering the engine for startup so the
        // first search does not decide this for everyone. See the PR's open questions.
        if (engine.IsPermissionConstrained) {
            // `?? []` because this is a diagnostic on the path that has just decided to return nothing,
            // and it sits outside the try/catch above — a throw here would take the whole query down to
            // improve a log message.
            const denied = engine.PermissionConstrainedEntities ?? [];
            LogStatus(
                'VectorSearchProvider: the knowledge-hub metadata cache is permission-constrained, so ' +
                'vector matches cannot be attributed from their content source. Denied: ' +
                (denied.length > 0 ? denied.join(', ') : 'not reported') +
                '. Grant Read on those to this role, or set an `Entity` metadata key on the vectors. ' +
                'Note this state is process-wide and set by whichever user loaded the cache first.'
            );
            return byContentSourceID;
        }

        const seen = new Set<string>();
        for (const match of needAttribution) {
            const contentSourceID = match.metadata?.['ContentSourceID'];
            if (typeof contentSourceID !== 'string' || contentSourceID.trim().length === 0 || seen.has(contentSourceID)) {
                continue; // distinct sources only — a batch of matches usually shares a handful
            }
            seen.add(contentSourceID);
            try {
                // Per source, NOT one guard around the loop: `ConfigurationObject` is a bare
                // `JSON.parse`, so one malformed blob would otherwise abandon every source after it
                // and silently downgrade those matches to a different entity's permissions.
                const declared = this.declaredVectorEntityName(engine.GetContentSourceByID(contentSourceID));
                if (declared) {
                    byContentSourceID.set(contentSourceID, declared);
                }
            } catch (error) {
                LogError(`VectorSearchProvider: content source ${contentSourceID} has unreadable configuration: ${error}`);
            }
        }
        return byContentSourceID;
    }

    /**
     * The entity a content source declares its VECTORS to be.
     *
     * ⚠️ REVIEWERS — this is the one open design decision in this PR. The key is read from the
     * source's `Configuration` JSON, which is where every other per-source vector knob already lives
     * (`EnableVectorization`, `VectorIDStrategy`, `ChunkTextStorage`, `Metadata`). The alternative is
     * a dedicated `VectorEntityID` column with a real FK to `MJ: Entities`, which is more queryable
     * and self-documenting at the cost of a migration. Either is a small change from here — the
     * mechanism above does not care which.
     *
     * It is deliberately NOT `ContentSource.EntityID`. That column means "the MJ Entity to pull
     * records **from**, NULL for non-entity sources (files, RSS, websites)" and is already consumed
     * that way by `AutotagEntity` when it stamps `EntityRecordDocument.EntityID`. It is the opposite
     * direction from what attribution needs, and it is null for precisely the source types that most
     * need attributing.
     *
     * Read through the generated `ConfigurationObject` accessor, which CodeGen emits from the
     * `IContentSourceConfiguration` JSONType definition — so the property name cannot drift from the
     * metadata without failing to compile.
     */
    private declaredVectorEntityName(source: MJContentSourceEntity | undefined): string | null {
        if (!source) {
            return null;
        }
        const declared = source.ConfigurationObject?.VectorEntityName;
        if (typeof declared !== 'string' || declared.trim().length === 0) {
            return null;
        }
        return this.validatedAttributionEntity(declared.trim(), source.ID);
    }

    /**
     * Entities a content source is allowed to declare its vectors to be: the content-item entities
     * themselves, or anything that IS-A one of them.
     */
    private static readonly AttributionRoots: readonly string[] = ['MJ: Content Items', 'MJ: Content Item Chunks'];

    /**
     * Validate a declared attribution before it is trusted, and return the entity's CANONICAL name.
     *
     * Two checks, each closing a way this could go wrong, because whatever is returned here becomes
     * the entity whose CanRead and row-level security `SearchEngine.filterEntityResults` evaluates —
     * and that method never verifies the matched record ids actually belong to it.
     *
     *  - **It must resolve.** An unresolvable name is not a labelling slip: the permission filter
     *    silently discards the whole group, so a typo (or a core-entity name missing its `MJ: `
     *    prefix) would delete a source's search results with no error anywhere. Declining instead
     *    leaves the index's own Entity Document to answer, which is the pre-existing behaviour.
     *  - **It must be a content-item entity.** Without this, the declaration is an arbitrary entity
     *    name in a writable configuration blob deciding which permissions apply — point it at
     *    something world-readable with no row filter and every vector from that source is admitted
     *    for every user. Restricting to the IS-A family of the content-item entities keeps the
     *    legitimate case (naming a subtype whose row-level security differs from its parent's) and
     *    removes the arbitrary-entity case entirely.
     */
    private validatedAttributionEntity(declared: string, contentSourceID: string): string | null {
        const entity = this.Provider.EntityByName(declared);
        if (!entity) {
            LogError(
                `VectorSearchProvider: content source ${contentSourceID} declares vector entity ` +
                `"${declared}", which does not resolve in metadata — ignoring it. Core entities carry ` +
                `the \`MJ: \` prefix.`
            );
            return null;
        }
        if (!this.isContentItemEntity(entity)) {
            LogError(
                `VectorSearchProvider: content source ${contentSourceID} declares vector entity ` +
                `"${entity.Name}", which is not a content-item entity — ignoring it. A source may only ` +
                `declare ${VectorSearchProvider.AttributionRoots.join(' / ')} or a subtype of one.`
            );
            return null;
        }
        return entity.Name; // canonical casing, so downstream grouping is consistent
    }

    /**
     * Whether an entity IS-A content-item entity — itself one of {@link AttributionRoots}, or a subtype
     * of one somewhere up its IS-A chain.
     *
     * Walks `ParentID` through **this provider** rather than using `EntityInfo.ParentChain`, which
     * resolves each step against the process-global `Metadata.Provider` by design. Mixing the two would
     * resolve the declared entity on the request's provider and then walk its ancestry on a different
     * metadata set — under a non-default provider the chain comes back empty and a legitimate subtype is
     * refused. Fail-closed, but wrong, and invisible until someone runs multi-provider.
     */
    private isContentItemEntity(entity: EntityInfo): boolean {
        const roots = VectorSearchProvider.AttributionRoots;
        const provider = this.Provider;
        const visited = new Set<string>();
        let current: EntityInfo | undefined = entity;
        while (current) {
            if (roots.includes(current.Name)) {
                return true;
            }
            if (!current.ParentID || visited.has(current.ID)) {
                return false; // root reached, or a cycle in the metadata
            }
            visited.add(current.ID);
            const parentID: string = current.ParentID;
            current = provider.EntityByID
                ? provider.EntityByID(parentID) ?? undefined
                : provider.Entities?.find(e => UUIDsEqual(e.ID, parentID));
        }
        return false;
    }

    /**
     * Resolve the entity name an index serves by inspecting its entity documents.
     *
     * Sourced from `KnowledgeHubMetadataEngine` rather than a `RunView` — Entity Documents
     * are small in number and change infrequently, and the engine already caches them
     * (event-driven auto-refresh on entity change, per `BaseEngine`), so a per-query RunView
     * here would be pure waste. `Config()` is a no-op once loaded, so this call is cheap on
     * every invocation.
     *
     * Unambiguous only when every entity document targeting the index vectorizes the same
     * entity — otherwise returns null and results stay 'Unknown'.
     */
    private async resolveIndexEntityName(vectorIndexID: string, contextUser: UserInfo): Promise<string | null> {
        try {
            // Same provider argument as the content-source path — the engine is a process-wide
            // singleton whose provider binds on first load, so if only one of its two callers passes
            // one, which metadata set gets cached depends on which search happens to run first.
            await KnowledgeHubMetadataEngine.Instance.Config(false, contextUser, this.Provider);

            const distinct = new Set(
                KnowledgeHubMetadataEngine.Instance.EntityDocuments
                    .filter(d => UUIDsEqual(d.VectorIndexID, vectorIndexID) && d.Entity)
                    .map(d => d.Entity)
            );

            return distinct.size === 1 ? (distinct.values().next().value ?? null) : null;
        } catch (error) {
            // A fallback display name is a nice-to-have — never let a resolution failure
            // sink the actual query results for this index.
            LogError(`VectorSearchProvider: Failed to resolve entity name for vector index ${vectorIndexID}: ${error}`);
            return null;
        }
    }

    /** Convert vector DB matches to SearchResultItem[] */
    private convertMatches(
        matches: Array<{ id: string; score?: number; metadata?: Record<string, unknown> }>,
        indexName: string,
        fallbackEntityName?: string | null,
        entityByContentSourceID?: Map<string, string>
    ): SearchResultItem[] {
        const unattributed: string[] = [];
        const items = matches.map(match => {
            const meta = match.metadata ?? {};
            // Attribution, most specific first: the vector's own key, then the entity its CONTENT
            // SOURCE declares (per match), then the index's Entity Document (index-wide).
            //
            // `||` rather than `??` deliberately: an `Entity: ''` in the metadata is falsy, and the
            // "does this match need attributing" test upstream treats it as needing one. With `??` a
            // resolved name would then be discarded — '' is not nullish — and the result dropped by
            // the permission filter with the resolution already paid for. The two tests must agree.
            const contentSourceID = meta['ContentSourceID'];
            const declaredBySource = typeof contentSourceID === 'string'
                ? entityByContentSourceID?.get(contentSourceID)
                : undefined;
            const resolvedEntity = (meta['Entity'] as string) || declaredBySource || fallbackEntityName || null;
            if (!resolvedEntity) {
                unattributed.push(match.id);
            }
            const entityName = resolvedEntity ?? 'Unknown';
            // Vector metadata stores RecordID in CompositeKey URL format: "FieldName|Value" or "F1|V1||F2|V2"
            // Use CompositeKey to properly parse it, then extract just the values for consistent
            // matching with entity search results (which use plain record IDs)
            // `||` for the same reason as the entity name above: a producer that writes `RecordID: ''`
            // rather than omitting the key must still fall through to the vector's own id, or the item
            // ships an empty RecordID and the permission filter drops it on an `IN ('')`.
            const rawRecordID = (meta['RecordID'] as string) || match.id;
            const recordID = this.extractRecordIDFromCompositeKey(rawRecordID);

            const title = this.extractDisplayTitle(meta, entityName);
            const snippet = this.extractDisplaySnippet(meta, indexName, match.score);
            const entityIcon = (meta['EntityIcon'] as string) || undefined;
            const updatedAt = meta['__mj_UpdatedAt'] ? new Date(meta['__mj_UpdatedAt'] as string) : new Date();
            const metaTags = Array.isArray(meta['Tags']) ? (meta['Tags'] as string[]) : [];

            const rawScore = match.score ?? 0;

            return {
                ID: recordID,
                EntityName: entityName,
                RecordID: recordID,
                SourceType: 'vector',
                ResultType: 'entity-record' as SearchResultType,
                Title: title,
                Snippet: snippet,
                Score: rawScore,
                ScoreBreakdown: { Vector: rawScore },
                Tags: metaTags,
                EntityIcon: entityIcon,
                RecordName: title,
                MatchedAt: updatedAt,
                RawMetadata: JSON.stringify(meta),
            };
        });
        this.warnOnUnattributedMatches(unattributed, indexName);
        return items;
    }

    /** How many vector ids to name in the unattributed-match warning. */
    private static readonly UnattributedSampleSize = 3;

    /**
     * Report matches that no attribution step could name, because they are about to disappear.
     *
     * `SearchEngine.filterEntityResults` resolves each group's `EntityName` through `EntityByName` and
     * returns before admitting a group it cannot resolve — fail-closed, and with no log of its own. The
     * one trace that does exist is the aggregate `Residual permission filter removed N result(s)`, whose
     * wording attributes the loss to incomplete provider push-down. So the only signal a deployment gets
     * today points away from the cause: vectors are demonstrably in the index and never surface.
     *
     * Logged once per index per batch rather than per match, and it names the three ways to fix it,
     * because the audience is whoever populated the index rather than whoever wrote this code.
     */
    private warnOnUnattributedMatches(vectorIDs: string[], indexName: string): void {
        if (vectorIDs.length === 0) {
            return;
        }
        const sample = vectorIDs.slice(0, VectorSearchProvider.UnattributedSampleSize).join(', ');
        LogError(
            `VectorSearchProvider: ${vectorIDs.length} match(es) from index "${indexName}" carry no ` +
            `resolvable entity and will be dropped by the permission filter rather than returned. Give ` +
            `the vectors an \`Entity\` metadata key, declare \`VectorEntityName\` on their content source ` +
            `(which also needs \`ContentSourceID\` in the metadata to be found), or point an Entity ` +
            `Document at this index. Sample vector id(s): ${sample}`
        );
    }

    /**
     * Extract best display title from vector metadata using entity field metadata.
     * Combines all IsNameField fields in Sequence order.
     */
    private extractDisplayTitle(meta: Record<string, unknown>, fallbackEntity: string): string {
        // DELIBERATELY reads `meta['Entity']` and NOT the resolved entity name. It looks like an
        // oversight and is not: when the metadata carries no name fields this method falls through to
        // `` `${fallbackEntity} Record` ``, and that string is a SENTINEL —
        // `SearchEnricher.resolveRecordNames` matches `RecordName === `${EntityName} Record`` and
        // replaces it with the live name from the database. Feeding the resolved entity in here makes
        // the name-field branch succeed off the embedding-time metadata snapshot instead, the sentinel
        // never forms, and renamed records show a stale title in every search result until re-embedded.
        // Titles for attributed-but-unlabelled matches are meant to come from the enricher.
        const entityName = meta['Entity'] as string | undefined;
        if (entityName) {
            const md = this.Provider;
            const entityInfo = md.EntityByName(entityName);
            if (entityInfo) {
                const nameFields = entityInfo.Fields
                    .filter(f => f.IsNameField)
                    .sort((a, b) => (a.Sequence ?? 9999) - (b.Sequence ?? 9999));
                if (nameFields.length > 0) {
                    const parts = nameFields
                        .map(f => meta[f.Name])
                        .filter(v => v != null && String(v).trim() !== '')
                        .map(v => String(v));
                    if (parts.length > 0) return parts.join(' ');
                }
                if (entityInfo.NameField && meta[entityInfo.NameField.Name]) {
                    return String(meta[entityInfo.NameField.Name]);
                }
            }
        }

        const heuristicFields = ['Name', 'Title', 'Subject', 'Label', 'DisplayName'];
        for (const field of heuristicFields) {
            if (meta[field] && typeof meta[field] === 'string') {
                return meta[field] as string;
            }
        }
        return `${fallbackEntity} Record`;
    }

    /** Extract best display snippet from vector metadata */
    private extractDisplaySnippet(meta: Record<string, unknown>, indexName: string, score?: number): string {
        const descFields = ['Description', 'Summary', 'Body', 'Content', 'Text', 'Notes'];
        for (const field of descFields) {
            if (meta[field] && typeof meta[field] === 'string') {
                const val = meta[field] as string;
                return val.length > 200 ? val.substring(0, 200) + '...' : val;
            }
        }

        const skipFields = new Set(['RecordID', 'Entity', 'TemplateID', 'EntityIcon', '__mj_UpdatedAt']);
        const parts: string[] = [];
        for (const [key, val] of Object.entries(meta)) {
            if (skipFields.has(key) || val == null) continue;
            const strVal = String(val);
            if (strVal.length > 0 && strVal.length < 100) {
                parts.push(`${key}: ${strVal}`);
            }
            if (parts.length >= 3) break;
        }
        if (parts.length > 0) return parts.join(' · ');

        return `Matched from index "${indexName}" with score ${(score ?? 0).toFixed(4)}`;
    }

    /**
     * Merge a scope's per-index rendered MetadataFilter into the base filter.
     * Both sides are optional. Scope filter is combined with the base filter via `$and`
     * so scope and user filters compose conjunctively. Scope filter may be either an
     * object (already parsed) or a JSON string — both are accepted.
     */
    protected mergeMetadataFilters(
        baseFilter: object | undefined,
        scopeFilter: unknown
    ): ScopeFilterCheck<object> {
        const check = CheckScopeJsonFilter(scopeFilter);
        // A filter was authored but is unusable — propagate so the caller fails the index
        // closed. Previously this returned `baseFilter` (usually `undefined`), which meant
        // an unparseable filter silently became NO filter and the query read the whole index.
        if (check.Status === 'unusable') return check;
        if (check.Status === 'absent') {
            return baseFilter ? { Status: 'usable', Value: baseFilter } : { Status: 'absent' };
        }
        return {
            Status: 'usable',
            Value: baseFilter ? { $and: [baseFilter, check.Value] } : check.Value,
        };
    }

    /** Build metadata filter from SearchFilters for vector DB queries */
    private buildMetadataFilter(filters?: SearchFilters): object | undefined {
        if (!filters) return undefined;
        const conditions: object[] = [];

        if (filters.EntityNames?.length) {
            conditions.push({ Entity: { $in: filters.EntityNames } });
        }
        if (filters.SourceTypes?.length) {
            conditions.push({ SourceType: { $in: filters.SourceTypes } });
        }
        if (filters.Tags?.length) {
            conditions.push({ Tags: { $in: filters.Tags } });
        }

        if (conditions.length === 0) return undefined;
        if (conditions.length === 1) return conditions[0];
        return { $and: conditions };
    }

    /**
     * Extract a plain record ID from a CompositeKey URL segment string.
     * Vector metadata stores RecordID in format "FieldName|Value" or "F1|V1||F2|V2".
     * For deduplication with entity search results, we need just the value(s).
     * Uses CompositeKey.SimpleLoadFromURLSegment for proper multi-field parsing.
     */
    private extractRecordIDFromCompositeKey(raw: string): string {
        if (!raw.includes('|')) {
            return raw; // Already a plain ID (no composite key format)
        }

        const ck = new CompositeKey();
        ck.SimpleLoadFromURLSegment(raw);

        if (ck.KeyValuePairs.length === 0) {
            return raw; // Parsing failed, return as-is
        }

        if (ck.KeyValuePairs.length === 1) {
            return ck.KeyValuePairs[0].Value; // Single-key: just the UUID
        }

        // Multi-key: join values with || for consistent dedup key
        return ck.KeyValuePairs.map(kv => kv.Value).join('||');
    }

}
