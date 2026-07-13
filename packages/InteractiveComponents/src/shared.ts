import { SimpleVectorService } from "@memberjunction/ai-vectors-memory";
import { BaseEntity, EntityInfo, RunQueryParams, RunQueryResult, RunViewParams, RunViewResult, UserInfo } from "@memberjunction/core";

/**
 * This is a simple data context object that is passed into the ComponentInitFunction containing any required `static` data. This object is empty when the mode is `dynamic`  
 */
export type SimpleDataContext = {
    [key: string]: any;
}

/**
 * Access system metadata and get entity objects to do CRUD operations on entities.
 */
export interface SimpleMetadata {
    /**
     * Array of entity metadata objects that describe the entities in the system.
     */
    Entities: EntityInfo[];
    /**
     * Retrieves a single BaseEntity derived class for the specified entity
     * @param entityName 
     */
    GetEntityObject(entityName: string, contextUser?: UserInfo): Promise<BaseEntity>;
}

/**
* Simple interface for running views in MJ
 */
export interface SimpleRunView {
    /**
     * Run a single view and return the results. The view is run dynamically against the MemberJunction host environment.
     * @param params 
     * @returns 
     */
    RunView: (params: RunViewParams, contextUser?: UserInfo) => Promise<RunViewResult>
    /**
     * Runs multiple views and returns the results. This is efficient for running views in **parallel**.
     * @param params 
     * @returns 
     */
    RunViews: (params: RunViewParams[], contextUser?: UserInfo) => Promise<RunViewResult[]>
}

/**
 * Simple interface for running predefined queries in MJ
 */
export interface SimpleRunQuery {
    /**
     * Run a single predefined query.
     * @param params 
     * @returns 
     */
    RunQuery: (params: RunQueryParams, contextUser?: UserInfo) => Promise<RunQueryResult>
}


/**
 * Params for an Interactive Component to execute a prompt
 */
export interface SimpleExecutePromptParams {
    /**
     * Text for the prompt, will be sent in as the system message
     */
    systemPrompt: string;
    /**
     * Optional, message history to append to the conversation after the system prompt
     */
    messages?: Array<{message: string, role: 'user' | 'assistant'}>;
    /**
     * An ordered array of model names that are preferred for this prompt. This is not guaranteed but the preferences
     * are taken into account
     */
    preferredModels?: string[],
    /**
     * Optional power level for model selection when preferredModels is not provided.
     * 'lowest' = least powerful/cheapest model
     * 'medium' = balanced power/cost (default)
     * 'highest' = most powerful model
     */
    modelPower?: 'lowest' | 'medium' | 'highest';
    /**
     * Optional context user information
     */
    contextUser?: UserInfo
}

/**
 * Simple return structure for prompt execution
 */
export interface SimpleExecutePromptResult {
    success: boolean;
    /**
     * Raw string result
     */
    result: string;
    /**
     * If the result was JSON or contained JSON anywhere within it that could be parsed, this will contain
     * the JSON object
     */
    resultObject?: any;
    /**
     * The model that was used for the response
     */
    modelName: string;
}

/**
 * 
 */
export interface SimpleEmbedTextParams {
    /**
     * Either a single string or an array of strings to calculate embeddings for
     */
    textToEmbed: string | string[];
    modelSize: 'small' | 'medium';
    contextUser?: UserInfo;
}

/**
 * Results of a call to EmbedText
 */
export interface SimpleEmbedTextResult {
    /**
     * Either a single vector if a single string was provided in params, or an array of vectors if an array of strings was provided to the method
     */
    result: number[] | Array<number[]>;
    /**
     * Name of the model used for embedding calculation
     */
    modelName: string;
    /**
     * Number of dimensions in each vector
     */
    vectorDimensions: number;
}
 
// =========================================================================
// Search — Semantic + Full-Text + Storage Search
// =========================================================================

/**
 * Parameters for executing a unified search across vector, full-text, entity, and storage sources.
 */
export interface SimpleSearchParams {
    /** The search query text */
    Query: string;
    /** Maximum number of results to return */
    MaxResults?: number;
    /** Minimum relevance score threshold (0-1) */
    MinScore?: number;
    /** Optional filters to narrow search results */
    Filters?: SimpleSearchFilters;
}

/**
 * Filters that can be applied to narrow search results.
 */
export interface SimpleSearchFilters {
    /** Filter to specific entity names */
    EntityNames?: string[];
    /** Filter to specific source types: 'Vector', 'FullText', 'Entity', 'Storage' */
    SourceTypes?: string[];
    /** Filter to results matching specific tags */
    Tags?: string[];
}

/**
 * A single search result item returned from a unified search.
 */
export interface SimpleSearchResultItem {
    /** Unique identifier for this search result */
    ID: string;
    /** The entity name this result belongs to */
    EntityName: string;
    /** The primary key of the matched record */
    RecordID: string;
    /** The source type that produced this result: 'Vector', 'FullText', 'Entity', 'Storage' */
    SourceType: string;
    /** Discriminator for UI rendering: 'entity-record', 'storage-file', or 'content-item' */
    ResultType: string;
    /** Display title for the result */
    Title: string;
    /** A snippet of matching text or content preview */
    Snippet: string;
    /** Overall relevance score (0-1) */
    Score: number;
    /** Breakdown of the score by source type */
    ScoreBreakdown: { Vector?: number; FullText?: number; Entity?: number; Storage?: number };
    /** Tags associated with this result */
    Tags: string[];
    /** Icon class for the entity */
    EntityIcon?: string;
    /** Human-readable name of the matched record */
    RecordName?: string;
    /** ISO timestamp of when the match was found */
    MatchedAt: string;
    /** Raw metadata JSON from the search provider */
    RawMetadata?: string;
    /** ID of the SearchProvider metadata record that produced this result */
    ProviderId?: string;
    /** Display label from the SearchProvider metadata */
    ProviderLabel?: string;
    /** Font Awesome icon class from the SearchProvider metadata */
    ProviderIcon?: string;
}

/**
 * Breakdown of search result counts by source type.
 */
export interface SimpleSearchSourceCounts {
    /** Number of results from vector search */
    Vector: number;
    /** Number of results from full-text search */
    FullText: number;
    /** Number of results from entity search */
    Entity: number;
    /** Number of results from file storage search */
    Storage: number;
}

/**
 * Metadata about an active search provider.
 */
export interface SimpleSearchProviderInfo {
    /** SearchProvider record ID */
    ID: string;
    /** Provider name */
    Name: string;
    /** UI display label */
    DisplayName: string;
    /** Font Awesome icon class */
    Icon: string;
    /** The SourceType key this provider uses */
    SourceType: string;
    /** Priority (lower = higher) */
    Priority: number;
}

/**
 * Response from a search execution.
 */
export interface SimpleSearchResult {
    /** Whether the search executed successfully */
    Success: boolean;
    /** The search result items */
    Results: SimpleSearchResultItem[];
    /** Total count of matching results */
    TotalCount: number;
    /** Time in milliseconds the search took to execute */
    ElapsedMs: number;
    /** Breakdown of results by source type */
    SourceCounts: SimpleSearchSourceCounts;
    /** Metadata for all active search providers */
    Providers: SimpleSearchProviderInfo[];
    /** Error message if Success is false */
    ErrorMessage?: string;
}

/**
 * Provides unified search across vector, full-text, entity, and storage sources.
 * This allows Interactive Components to invoke semantic and keyword search at runtime
 * against the host MJ instance's search infrastructure.
 */
export interface SimpleSearch {
    /**
     * Execute a full knowledge search with optional filters and scoring controls.
     * Returns ranked results from multiple source types (vector, full-text, entity, storage).
     */
    Search: (params: SimpleSearchParams) => Promise<SimpleSearchResult>;
    /**
     * Execute a lightweight preview search suitable for autocomplete / type-ahead.
     * @param query - The search query text
     * @param maxResults - Optional maximum number of results (server default: 8)
     */
    PreviewSearch: (query: string, maxResults?: number) => Promise<SimpleSearchResult>;
}

// =========================================================================
// GeoData — Coordinate-based geographic resolution
// =========================================================================

/**
 * Result of resolving a coordinate to geographic regions.
 */
export interface SimpleGeoPointResolution {
    Country?: { ID: string; Name: string; BoundaryGeoJSON?: string | null } | undefined;
    State?: { ID: string; Name: string; BoundaryGeoJSON?: string | null } | undefined;
}

/**
 * Provides coordinate-based geographic resolution via point-in-polygon.
 * Used by map components to resolve lat/lng to country/state for choropleth rendering.
 */
export interface SimpleGeoDataEngine {
    /**
     * Resolve a coordinate pair to its containing country and state/province.
     * Callers should `await EnsureLoaded()` first if the resolver lazy-loads.
     */
    ResolvePointToLocation(lat: number, lng: number): SimpleGeoPointResolution;

    /** Idempotent loader for reference geometries. Optional for backwards compatibility. */
    EnsureLoaded?: () => Promise<void>;

    /** True once the underlying engine has finished loading reference geometries. */
    Loaded?: boolean;
}

// =========================================================================
// ML — Trained predictive models (catalog + scoring)
// =========================================================================

/**
 * A single trained predictive model from the catalog, surfaced to Interactive Components
 * so they can let users pick a model and weave its predictions into charts/tables.
 * Sourced from the `MJ: ML Models` entity (one row per immutable, versioned model).
 */
export interface SimpleMLModelInfo {
    /** The `MJ: ML Models` row id — pass this to {@link SimpleMLTools.score}. */
    id: string;
    /** Denormalized name of the training pipeline that produced this model. */
    pipeline: string;
    /** Monotonic model version under the pipeline (higher = newer). */
    version: number;
    /** The label/column the model predicts (e.g. "Renewed"). */
    targetVariable: string;
    /** The kind of prediction the model makes: 'classification' or 'regression'. */
    problemType: string;
    /** Lifecycle status of the model (e.g. 'Published', 'Validated', 'Draft', 'Archived'). */
    status: string;
    /** Parsed training metrics, when the model carries them. Shape is algorithm-dependent. */
    metrics?: Record<string, unknown>;
    /** Parsed holdout metrics scored once on the locked holdout — the honest performance number. */
    holdoutMetrics?: Record<string, unknown>;
}

/** A single prediction returned from {@link SimpleMLTools.score} (ephemeral — not written back). */
export interface SimpleMLPrediction {
    /** The scored record's primary-key value, when known. */
    recordId?: string;
    /** Numeric model output (probability for classification, value for regression). */
    score: number;
    /** Predicted class label (classification only). */
    class?: string;
}

/** The summary of a {@link SimpleMLTools.score} call. */
export interface SimpleMLScoreResult {
    /** Number of records successfully scored. */
    scoredCount: number;
    /** Number of records that failed to score. */
    failedCount: number;
    /** Number of records skipped (no selector matched / nothing to score). */
    skippedCount: number;
    /** The ephemeral predictions, one per successfully scored record. */
    predictions?: SimpleMLPrediction[];
}

/** Optional filter narrowing the models returned by {@link SimpleMLTools.listModels}. */
export interface SimpleMLListModelsFilter {
    /** Restrict to models with this lifecycle status (defaults to 'Published' when omitted). */
    status?: string;
    /** Restrict to models predicting this target variable. */
    targetVariable?: string;
    /** Cap the number of models returned. */
    maxResults?: number;
}

/**
 * Provides a simple interface for InteractiveComponents to use the host MJ instance's trained
 * predictive models — listing what models are available and scoring records with them so the
 * component can fold predictions (renewal likelihood, lead scores, churn risk, …) into its
 * visualizations. Scoring is invoked over the wire against the host's Predictive Studio engine,
 * so no model-training machinery runs in the browser.
 *
 * NOTE: the owning `ComponentUtilities.ml` property may be `undefined` when this capability is not
 * available in the current environment/security context — component code must guard for that.
 */
export interface SimpleMLTools {
    /**
     * List the trained predictive models available to the component, newest version first.
     * Resilient: returns an empty array if the catalog cannot be read.
     * @param filter - Optional filter to narrow by status / target variable / count.
     * @param contextUser - Optional context user (server-side scoping; ignored in the browser).
     */
    listModels: (filter?: SimpleMLListModelsFilter, contextUser?: UserInfo) => Promise<SimpleMLModelInfo[]>;

    /**
     * Score a set of records with a trained model and return the predictions ephemerally
     * (nothing is written back to the database).
     * @param modelId - The {@link SimpleMLModelInfo.id} of the model to score with.
     * @param records - The records to score, either as primary-key strings or as row objects
     *                  (the primary key is then read from `options.primaryKeyField`, default `'ID'`).
     * @param options - Optional primary-key field name and context user.
     */
    score: (
        modelId: string,
        records: Array<Record<string, unknown> | string>,
        options?: { primaryKeyField?: string; contextUser?: UserInfo }
    ) => Promise<SimpleMLScoreResult>;
}

/**
 * Provides a simple interface for InteractiveComponents to perform a wide variety of common AI operations
 * such as prompt execution with LLMs, calculating embeddings on strings, and using vector search for small to mediun
 * sized datasets in memory.
 */
export interface SimpleAITools {
    /**
     * Uses an LLM to respond to a provided prompt. Often used by interactive components to provide rich analysis of data within a component that a user 
     * is interested in gaining qualitative insights on
     * @param params 
     * @returns 
     */
    ExecutePrompt: (params: SimpleExecutePromptParams) => Promise<SimpleExecutePromptResult>

    /**
     * Used to calculate vector embeddings for one or more strings. Uses very fast small/medium sized
     * local models so the embeddings can be rapidly calculated for hundreds or even thousands of pieces of text.
     * This allows interactive components to dynamically compute similarity/distance between any kinds of data
     * and generate very interesting interactive experiences for users
     * @param params 
     * @returns 
     */
    EmbedText: (params: SimpleEmbedTextParams) => Promise<SimpleEmbedTextResult>

    /**
     * Instance of the SimpleVectorService that can be used by Interactive Components
     * @see SimpleVectorService for more details on this. This object can perform a wide array
     * of vector data operations such as KNN, Similarity Scoring, and more.
     */
    VectorService: SimpleVectorService
}