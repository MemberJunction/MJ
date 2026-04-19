/**
 * @fileoverview Base class and interface for search providers.
 *
 * Each search provider implements a single retrieval strategy
 * (vector similarity, full-text, entity LIKE-search, storage, etc.)
 * and returns scored candidates suitable for RRF fusion.
 *
 * Providers are discovered at runtime via @RegisterClass and the
 * SearchProvider metadata entity. The DriverClass column in the
 * SearchProvider table maps to the @RegisterClass key.
 *
 * @module @memberjunction/search-engine
 */

import { UserInfo } from '@memberjunction/core';
import { SearchSource, SearchFilters, SearchResultItem, ScopeConstraints } from './search.types';

/**
 * Configuration passed to a search provider during initialization.
 * Populated from the SearchProvider entity record.
 */
export interface SearchProviderConfig {
    /** The provider's display name from the metadata record */
    Name: string;
    /** Optional JSON config blob from ProviderConfig column (already parsed) */
    ProviderConfig: Record<string, unknown> | null;
    /** Optional credential ID for providers that need authentication */
    CredentialID: string | null;
    /** Per-provider max results override (null = use engine default) */
    MaxResultsOverride: number | null;
    /** Whether this provider should participate in preview/autocomplete searches */
    SupportsPreview: boolean;
    /** Priority value from the metadata record (lower = higher priority) */
    Priority: number;
}

/**
 * Abstract base class for search providers. Subclasses must be registered
 * with @RegisterClass(BaseSearchProvider, 'DriverClassName') to be
 * discoverable by the SearchEngine.
 *
 * Lifecycle:
 * 1. SearchEngine loads active SearchProvider records from the database
 * 2. For each record, ClassFactory creates an instance using DriverClass
 * 3. Initialize() is called with the provider's config from the DB record
 * 4. CheckAvailability() is called to verify the provider is operational
 * 5. If IsAvailable(), the provider participates in searches
 */
export abstract class BaseSearchProvider {
    /** Which search source this provider represents */
    abstract readonly SourceType: SearchSource;

    /** Config from the SearchProvider metadata record, set during Initialize() */
    protected config: SearchProviderConfig | null = null;

    /**
     * Initialize the provider with configuration from the SearchProvider entity.
     * Called once during SearchEngine.Config(). Override to perform provider-specific
     * setup (e.g., connecting to external APIs using credentials).
     *
     * @param config - Configuration from the SearchProvider metadata record
     * @param contextUser - The user context for initialization
     */
    public async Initialize(config: SearchProviderConfig, contextUser: UserInfo): Promise<void> {
        this.config = config;
    }

    /**
     * Check and cache whether this provider is operational.
     * Called after Initialize(). Override for providers that need to verify
     * external dependencies (e.g., vector indexes exist, API keys are valid).
     *
     * The default implementation returns true (always available).
     *
     * @param contextUser - The user context for availability checks
     */
    public async CheckAvailability(contextUser: UserInfo): Promise<void> {
        // Default: no-op, provider is always available
    }

    /**
     * Whether this provider is currently available (configured and operational).
     * The SearchEngine will skip providers that return false.
     */
    public IsAvailable(): boolean {
        return true;
    }

    /**
     * Execute a search and return result items with scores.
     *
     * When `scopeConstraints` is provided, the provider MUST:
     * 1. Narrow its retrieval surface to match the constraint (e.g., VectorSearchProvider
     *    queries only the listed ExternalIndexes with matching IndexType, EntitySearchProvider
     *    queries only the listed Entities, StorageSearchProvider queries only the listed
     *    accounts/folders, 3rd-party providers filter by their own IndexType).
     * 2. Apply any rendered `MetadataFilter` / `ExtraFilter` / `UserSearchString` /
     *    `FolderPath` values as native filters.
     * 3. Implement permission push-down (see Section 3.6 of
     *    plans/search-scopes-rag-plus.md) — never surface results the `contextUser` cannot see.
     * 4. Honor `scopeConstraints.QueryTransforms` when a per-provider rewrite is supplied —
     *    look up by your `SourceType` or provider-specific key and use that string in place
     *    of the raw `query`.
     *
     * When `scopeConstraints` is undefined, the provider runs unconstrained (backward
     * compatible pre-scope behavior).
     *
     * @param query - The search query text
     * @param topK - Maximum number of results to retrieve
     * @param filters - Optional filters to narrow results
     * @param contextUser - The user performing the search
     * @param scopeConstraints - Optional per-scope constraint set, pre-rendered with SearchContext values
     * @returns Scored result items from this provider
     */
    abstract Search(
        query: string,
        topK: number,
        filters: SearchFilters | undefined,
        contextUser: UserInfo,
        scopeConstraints?: ScopeConstraints
    ): Promise<SearchResultItem[]>;
}

/**
 * @deprecated Use BaseSearchProvider instead. Kept for backwards compatibility.
 */
export type ISearchProvider = BaseSearchProvider;
