import { BaseSingleton } from '@memberjunction/global';
import { LogError, LogStatus, UserInfo, IMetadataProvider } from '@memberjunction/core';
import { QueryEngine } from '@memberjunction/core-entities';
import { SimpleVectorService, VectorEntry } from '@memberjunction/ai-vectors-memory';
import { EmbedTextResult } from '@memberjunction/ai';
import { MJAIModelEntityExtended } from '@memberjunction/ai-core-plus';
import {
    MJQueryEntity,
    MJQueryCategoryEntity,
    MJQueryFieldEntity,
    MJQueryParameterEntity,
    MJQueryEntityEntity,
    MJQueryPermissionEntity
} from '@memberjunction/core-entities';
import { QueryEmbeddingMetadata, QueryMatchResult } from './QueryMatchResult';
import { Subscription } from 'rxjs';

/**
 * Server-side Query Engine that wraps QueryEngine and adds server-only capabilities.
 *
 * Uses composition (containment) rather than inheritance to avoid duplicate
 * data loading. Delegates all base functionality to QueryEngine.Instance while
 * adding server-specific features like embedding-based semantic search.
 *
 * Follows the same pattern as AIEngine containing AIEngineBase.
 *
 * @description ONLY USE ON SERVER-SIDE. For metadata only, use the QueryEngine class which can be used anywhere.
 */
export class QueryEngineServer extends BaseSingleton<QueryEngineServer> {
    // --- Singleton ---
    protected constructor() {
        super();
    }

    public static get Instance(): QueryEngineServer {
        return super.getInstance<QueryEngineServer>();
    }

    // --- Containment ---
    protected get Base(): QueryEngine {
        return QueryEngine.Instance;
    }

    // --- Server-specific state ---
    private _queryVectorService: SimpleVectorService<QueryEmbeddingMetadata> | null = null;
    private _loaded = false;
    private _loading = false;
    private _loadingPromise: Promise<void> | null = null;
    private _contextUser: UserInfo | undefined;
    private _dataChangeSubscription: Subscription | null = null;

    // ========================================================================
    // Delegated Properties from QueryEngine
    // ========================================================================

    /** All queries in the system */
    public get Queries(): MJQueryEntity[] { return this.Base.Queries; }

    /** All query categories */
    public get Categories(): MJQueryCategoryEntity[] { return this.Base.Categories; }

    /** All query field definitions */
    public get Fields(): MJQueryFieldEntity[] { return this.Base.Fields; }

    /** All query parameter definitions */
    public get Parameters(): MJQueryParameterEntity[] { return this.Base.Parameters; }

    /** All query-to-entity relationship mappings */
    public get QueryEntities(): MJQueryEntityEntity[] { return this.Base.QueryEntities; }

    /** All query permission records */
    public get Permissions(): MJQueryPermissionEntity[] { return this.Base.Permissions; }

    /** Returns only queries with Status === 'Approved' */
    public get ApprovedQueries(): MJQueryEntity[] { return this.Base.ApprovedQueries; }

    // --- Delegated methods ---

    /** Find a query by its ID */
    public FindQueryByID(id: string): MJQueryEntity | undefined {
        return this.Base.FindQueryByID(id);
    }

    /** Find a query by name, optionally scoped to a category */
    public FindQueryByName(name: string, categoryId?: string): MJQueryEntity | undefined {
        return this.Base.FindQueryByName(name, categoryId);
    }

    /** Get all field definitions for a specific query */
    public GetQueryFields(queryId: string): MJQueryFieldEntity[] {
        return this.Base.GetQueryFields(queryId);
    }

    /** Get all parameter definitions for a specific query */
    public GetQueryParameters(queryId: string): MJQueryParameterEntity[] {
        return this.Base.GetQueryParameters(queryId);
    }

    /** Get all permission records for a specific query */
    public GetQueryPermissions(queryId: string): MJQueryPermissionEntity[] {
        return this.Base.GetQueryPermissions(queryId);
    }

    /** Get all queries belonging to a specific category */
    public GetQueriesByCategory(categoryId: string): MJQueryEntity[] {
        return this.Base.GetQueriesByCategory(categoryId);
    }

    /** Find a category by name (case-insensitive) */
    public FindCategory(name: string): MJQueryCategoryEntity | undefined {
        return this.Base.FindCategory(name);
    }

    // ========================================================================
    // Server-Only Properties
    // ========================================================================

    /** Returns true if both the base engine and server capabilities are loaded */
    public get Loaded(): boolean {
        return this._loaded;
    }

    /**
     * Get the query vector service for semantic search.
     * Initialized during Config — will be null before Config() completes.
     */
    public get QueryVectorService(): SimpleVectorService<QueryEmbeddingMetadata> | null {
        return this._queryVectorService;
    }

    // ========================================================================
    // Config — Main Entry Point
    // ========================================================================

    /**
     * Configures the QueryEngineServer by first ensuring QueryEngine is configured,
     * then building the in-memory vector index from cached query embeddings.
     *
     * Safe to call from multiple places concurrently — returns the same promise
     * to all callers during loading.
     *
     * @param forceRefresh - If true, forces a full reload even if already loaded
     * @param contextUser - User context for server-side operations
     * @param provider - Optional metadata provider override
     */
    public async Config(
        forceRefresh?: boolean,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<void> {
        if (this._loaded && !forceRefresh) return;
        if (this._loading && this._loadingPromise) return this._loadingPromise;

        this._loading = true;
        this._loadingPromise = this.InnerLoad(forceRefresh, contextUser, provider);
        try {
            await this._loadingPromise;
        } finally {
            this._loading = false;
            this._loadingPromise = null;
        }
    }

    private async InnerLoad(
        forceRefresh?: boolean,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<void> {
        try {
            this._contextUser = contextUser;

            // 1. Ensure QueryEngine (the base) is configured first
            await QueryEngine.Instance.Config(forceRefresh, contextUser, provider);

            // 2. Build vector index from already-loaded queries (NO RunView)
            this.RefreshQueryEmbeddings();

            // 3. Subscribe to DataChange$ for ongoing updates (only once)
            this.SubscribeToDataChanges();

            this._loaded = true;
        } catch (error) {
            LogError(error);
            throw error;
        }
    }

    // ========================================================================
    // Embedding Management
    // ========================================================================

    /**
     * Rebuilds the in-memory vector index from QueryEngine's cached queries.
     * This is a synchronous, in-memory-only operation — no database call.
     *
     * Called automatically on Config() and whenever QueryEngine emits a
     * DataChange$ event for the 'MJ: Queries' entity.
     */
    public RefreshQueryEmbeddings(): void {
        const queries = this.Base.Queries;
        const entries: VectorEntry<QueryEmbeddingMetadata>[] = [];

        for (const query of queries) {
            if (!query.EmbeddingVector) continue;
            try {
                const vector = JSON.parse(query.EmbeddingVector);
                if (!Array.isArray(vector) || vector.length === 0) continue;
                entries.push({
                    key: query.ID,
                    vector,
                    metadata: this.PackageQueryMetadata(query)
                });
            } catch {
                LogError(`QueryEngineServer: Failed to parse embedding for query ${query.Name}`);
            }
        }

        this._queryVectorService = new SimpleVectorService<QueryEmbeddingMetadata>();
        if (entries.length > 0) {
            this._queryVectorService.LoadVectors(entries);
        }
        LogStatus(`QueryEngineServer: Loaded ${entries.length} query embeddings from cached queries`);
    }

    /**
     * Packages a query entity into the metadata shape stored in the vector service.
     */
    protected PackageQueryMetadata(query: MJQueryEntity): QueryEmbeddingMetadata {
        return {
            id: query.ID,
            name: query.Name,
            description: query.Description || '',
            category: query.Category || '',
            status: query.Status || '',
            reusable: query.Reusable ?? false,
            sql: query.SQL || '',
            userQuestion: query.UserQuestion || ''
        };
    }

    // ========================================================================
    // DataChange$ Subscription
    // ========================================================================

    /**
     * Subscribes (once) to QueryEngine.DataChange$ so the vector index stays
     * in sync whenever queries are added, updated, or deleted.
     *
     * BaseEngine's auto-refresh already debounces entity events (default 5000ms).
     * By the time DataChange$ fires, this.Base.Queries is already updated.
     */
    private SubscribeToDataChanges(): void {
        if (this._dataChangeSubscription) return;

        this._dataChangeSubscription = this.Base.DataChange$.subscribe(event => {
            if (event.config.EntityName === 'MJ: Queries') {
                this.RefreshQueryEmbeddings();
            }
        });
    }

    // ========================================================================
    // Semantic Search
    // ========================================================================

    /**
     * Find queries semantically similar to a natural language search text.
     *
     * Uses the persistent in-memory vector index built from QueryEngine's
     * cached query data. Supports an optional metadata filter callback for
     * filtering by status, reusable flag, etc. at search time.
     *
     * @param searchText - Natural language description of what data is needed
     * @param embedFunction - Function to generate embeddings (typically from AIEngine.EmbedTextLocal)
     * @param topK - Maximum number of results to return (default: 10)
     * @param minSimilarity - Minimum similarity score 0-1 (default: 0.3)
     * @param filter - Optional filter callback applied to metadata before similarity scoring
     * @returns Array of matching queries sorted by similarity score (highest first)
     */
    public async FindSimilarQueries(
        searchText: string,
        embedFunction: (text: string) => Promise<{ result: EmbedTextResult; model: MJAIModelEntityExtended } | null>,
        topK: number = 10,
        minSimilarity: number = 0.3,
        filter?: (metadata: QueryEmbeddingMetadata) => boolean
    ): Promise<QueryMatchResult[]> {
        if (!searchText || searchText.trim().length === 0) {
            throw new Error('searchText cannot be empty');
        }
        if (!this._queryVectorService) {
            throw new Error('QueryEngineServer not configured. Call Config() first.');
        }

        const embedding = await embedFunction(searchText);
        if (!embedding?.result?.vector?.length) {
            throw new Error('Failed to generate embedding for search text');
        }

        const results = this._queryVectorService.FindNearest(
            embedding.result.vector,
            topK,
            minSimilarity,
            'cosine',
            filter
        );

        return results.map(r => ({
            queryId: r.key,
            queryName: r.metadata?.name || 'Unknown',
            description: r.metadata?.description || '',
            category: r.metadata?.category || '',
            similarityScore: r.score,
            status: r.metadata?.status || '',
            reusable: r.metadata?.reusable ?? false,
            sql: r.metadata?.sql,
            userQuestion: r.metadata?.userQuestion
        }));
    }
}
