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

import { IMetadataProvider, LogError, Metadata, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { SearchSource, SearchFilters, SearchResultItem, ScopeConstraints, ScopeExternalIndexConstraint } from './search.types';
import type { LaneKind } from './ScopeExplanation';

/**
 * Lightweight catalog entry for a registered search provider, returned by
 * `BaseSearchProvider.GetAvailableProviders()`. Designed for UI dropdown
 * population on the SearchScope form (P5.5) — a single call gives the form
 * everything it needs to render selectable options without separately
 * instantiating each registered class.
 */
export interface RegisteredSearchProviderInfo {
    /** ClassFactory registration key — the SearchProvider.DriverClass column value */
    DriverClass: string;
    /** SearchSource the provider implements ('vector' | 'fulltext' | 'entity' | 'storage') */
    SourceType: SearchSource;
}

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

    /**
     * Whether every result this provider returns is a row of the MJ entity its `EntityName` names, with
     * `RecordID` that row's primary key, read from that entity through `RunView` as the searching user — so
     * the entity's permissions and the user's row filters were applied when the row was read.
     *
     * The engine's permission pass trusts such results without re-reading them when no row filter applies
     * (the hot path of the entity and full-text lanes). It verifies every other result with one `PK IN (...)`
     * read per labelled entity, because a vector or external-index hit's `EntityName` is whatever the index
     * says (an index or collection name, a metadata key) and its `RecordID` is the document's own id.
     *
     * Trust follows the provider instance the engine stamped on the result (`SearchResultItem.ProviderId`),
     * never the `SourceType` a provider declares or stamps: `SearchSource` is a closed union, so any provider
     * can call itself `'entity'` or `'fulltext'`. `EntitySearchProvider` and `FullTextSearchProvider` set this.
     * Leave it `false` (the default) unless your hits really come out of `RunView` against the labelled entity;
     * set on any other provider, it lets whoever writes the index choose which entity's permissions apply.
     * It never covers a hit the engine promoted from `MJ: Content Items` to its origin record
     * (`SearchResultItem.PromotedFromContentItemID`): the provider never read that row.
     *
     * A subclass inherits this flag. A subclass that changes `Search` so its hits no longer come out of
     * `RunView` against the labelled entity must override it to `false`.
     */
    public readonly ResultsAreRowsOfLabelledEntity: boolean = false;

    /**
     * Whether this provider applies each entity lane's rendered `ExtraFilter` itself, in the `RunView` that reads
     * the entity — so the engine need not re-check its hits against that lane bound. Only `EntitySearchProvider`
     * sets it. Every other provider's hits for an entity with a lane `ExtraFilter` are re-checked by the engine,
     * as the user, with `PK IN (...) AND (<ExtraFilter>)`.
     *
     * Like {@link ResultsAreRowsOfLabelledEntity}, it is read from the provider the engine stamped on the result
     * (`ProviderId`), never from a label, and never covers a promoted content-item hit (the filter was applied to
     * the content item, not to the origin record it now names). A subclass inherits it; a subclass that changes
     * `Search` so the lane `ExtraFilter` is no longer applied must override it to `false`.
     */
    public readonly AppliesLaneExtraFilter: boolean = false;

    /**
     * The scope lane kinds this provider reads in a scoped search: `'ExternalIndex'` (`ScopeConstraints.ExternalIndexes`),
     * `'Entity'` (`Entities`) and `'StorageAccount'` (`StorageAccounts`).
     *
     * The engine uses it on both paths, so they agree. `ExplainScope` reports a non-global scope unreachable
     * when none of its listed providers reads a lane kind the scope configures. A scoped search never calls a
     * provider whose lane kinds are all empty in that scope: it could only search nothing — or, written with the
     * old `ExternalIndexes?.length ? scoped : defaultIndex` pattern, fall back to its default index.
     *
     * Default `['ExternalIndex']`: a third-party provider serves an external index of its own `IndexType` (see
     * {@link ScopedExternalIndexRows}). A provider that reads another lane kind must override this, or no scoped
     * search without an external-index lane will call it. It is declared rather than derived from `SourceType`
     * because the external-index providers and `FullTextSearchProvider` all declare `'fulltext'` yet read
     * different lanes. A subclass inherits it; override it when the subclass's `Search` reads other lanes.
     */
    public readonly ConsumesLaneKinds: readonly LaneKind[] = ['ExternalIndex'];

    /** Config from the SearchProvider metadata record, set during Initialize() */
    protected config: SearchProviderConfig | null = null;

    /** Optional metadata provider; falls back to Metadata.Provider when not explicitly set. */
    private _provider: IMetadataProvider | undefined;

    /** Set the metadata provider used by this search provider for entity lookups. */
    public set Provider(value: IMetadataProvider | undefined) {
        this._provider = value;
    }

    /** Get the metadata provider used by this search provider, falling back to the global default. */
    public get Provider(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }

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
     * compatible pre-scope behavior). Inside `scopeConstraints`, a lane list that is
     * `undefined` means unscoped too, but a DEFINED, EMPTY list means the scope gives this
     * provider nothing: return no results without querying — never fall back to "everything"
     * or to a default index (see the field docs on `ScopeConstraints`). The engine does not call a
     * provider whose {@link ConsumesLaneKinds} are all empty in a scope, but a provider reading several
     * lane kinds still receives `[]` for the ones a scope leaves empty.
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

    /**
     * The scope's external-index rows of `indexType` that name an index, or `undefined` when the search
     * is unscoped (`ExternalIndexes` absent). An EMPTY array means the scope gives this provider no
     * index: search nothing. A provider falls back to its configured default index only on `undefined`.
     *
     * @param scopeConstraints - The per-scope constraints passed to `Search`, if any
     * @param indexType - The `IndexType` this provider serves (e.g. `'Elasticsearch'`)
     */
    protected ScopedExternalIndexRows(
        scopeConstraints: ScopeConstraints | undefined,
        indexType: string
    ): ScopeExternalIndexConstraint[] | undefined {
        if (!scopeConstraints?.ExternalIndexes) return undefined;
        return scopeConstraints.ExternalIndexes.filter(r => r.IndexType === indexType && !!r.ExternalIndexName);
    }

    /**
     * Enumerate every search provider currently registered with ClassFactory under
     * `BaseSearchProvider`. Designed for the SearchScope form's provider dropdown
     * (P5.5) — populates the dropdown from this single call rather than hardcoding
     * a list, so any ClassFactory-registered provider (including third-party ones)
     * shows up automatically.
     *
     * Each entry includes the driver-class registration key (writes into
     * `SearchProvider.DriverClass`) and the SourceType the provider implements.
     * Sorted by DriverClass for stable UI ordering.
     */
    public static GetAvailableProviders(): RegisteredSearchProviderInfo[] {
        const registrations = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseSearchProvider);
        const seen = new Set<string>();
        const out: RegisteredSearchProviderInfo[] = [];
        for (const reg of registrations) {
            const key = reg.Key;
            if (!key || seen.has(key)) continue;
            seen.add(key);
            try {
                const Ctor = reg.SubClass as unknown as new () => BaseSearchProvider;
                const instance = new Ctor();
                out.push({ DriverClass: key, SourceType: instance.SourceType });
            } catch (err) {
                LogError(`BaseSearchProvider.GetAvailableProviders: could not introspect "${key}" — ${err instanceof Error ? err.message : String(err)}`);
                out.push({ DriverClass: key, SourceType: 'entity' });
            }
        }
        out.sort((a, b) => a.DriverClass.localeCompare(b.DriverClass));
        return out;
    }
}

/**
 * @deprecated Use BaseSearchProvider instead. Kept for backwards compatibility.
 */
export type ISearchProvider = BaseSearchProvider;
