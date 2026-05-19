# MemberJunction Universal Search — Design Plan

> **Extension:** Phase 1 of the Search Scopes & RAG+ initiative extends this architecture with scoped search, agent pre-execution RAG, and a new `ScopedSearchAction`. See [`plans/search-scopes-rag-plus.md`](../search-scopes-rag-plus.md) and the implementation guide at [`guides/SEARCH_SCOPES_AND_RAG_GUIDE.md`](../../guides/SEARCH_SCOPES_AND_RAG_GUIDE.md). The universal search `SearchEngine`, provider contract, and fusion pipeline described below are unchanged — scopes layer on top as an optional constraint that providers honor via `scopeConstraints?: ScopeConstraints`.

## Executive Summary

This plan transforms MJ Explorer's search from a fragmented, entity-at-a-time LIKE-based experience into a unified, sub-500ms hybrid search platform. The work spans six layers: CodeGen intelligence, a new `@memberjunction/search-engine` server package, a `GraphQLSearchClient` in GraphQLDataProvider, enhanced `@memberjunction/ng-search` widgets (including autocomplete), a shell quick-search bar, and instance-level feature configuration.

The Knowledge Hub search (v5.24.0) proved the hybrid vector + FTS + RRF fusion architecture works. This project extracts that power into reusable infrastructure and makes it the default search experience everywhere.

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Design Goals & Constraints](#2-design-goals--constraints)
3. [Architecture Overview](#3-architecture-overview)
4. [Workstream 1: Server-Side Search Engine Package](#4-workstream-1-server-side-search-engine-package)
5. [Workstream 2: GraphQL Client SDK](#5-workstream-2-graphql-client-sdk)
6. [Workstream 3: CodeGen Search Intelligence](#6-workstream-3-codegen-search-intelligence)
7. [Workstream 4: Angular Search Widgets (ng-search)](#7-workstream-4-angular-search-widgets-ng-search)
8. [Workstream 5: Shell Quick Search Bar](#8-workstream-5-shell-quick-search-bar)
9. [Workstream 6: Instance-Level Feature Configuration](#9-workstream-6-instance-level-feature-configuration)
10. [Security & Permissions](#10-security--permissions)
11. [Performance Strategy](#11-performance-strategy)
12. [Search Predicate System](#12-search-predicate-system)
13. [Migration & Rollout](#13-migration--rollout)
14. [Testing Strategy](#14-testing-strategy)
15. [Resolved Design Decisions](#15-resolved-design-decisions)

---

## 1. Current State Analysis

### Two Disconnected Search Worlds

**World 1: Shell Header Search (Primitive)**
- Location: `packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts`
- UX: Small popup in top-right, user picks ONE entity from dropdown, types query (min 3 chars)
- Backend: `RunView` with `UserSearchString` parameter generates SQL `LIKE '%query%'` on all text fields
- Results: Navigates to `/resource/search/:input?Entity=EntityName`, shows entity grid or auto-navigates if 1 result
- Limitations: Single-entity only, no ranking, no preview, no semantic understanding, no cross-entity search
- Does NOT use `@memberjunction/ng-search` at all

**World 2: Knowledge Hub Search (Powerful but Isolated)**
- Location: `packages/Angular/Explorer/dashboards/src/KnowledgeHub/components/search/`
- UX: Google-style hero search bar, grouped results, faceted filters, relevance threshold, saved searches, agent integration
- Backend: `SearchKnowledgeResolver` (872 lines) — hybrid vector (Pinecone) + FTS (SQL FREETEXT / PG tsvector) + RRF fusion
- Results: Ranked, scored, grouped by source type, with entity icons, snippets, tags
- Limitation: Only accessible inside the Knowledge Hub app dashboard — buried, not the default experience

### Infrastructure That Exists

| Layer | Package | What It Does | Reusable? |
|-------|---------|-------------|-----------|
| Vector DB | `@memberjunction/ai-vectors-pinecone`, `pgvector`, `qdrant` | Similarity search across embedded content | Yes |
| Embeddings | `@memberjunction/ai-openai`, `azure`, `ollama` | Generate embeddings for queries and content | Yes |
| FTS | Inline in `SearchKnowledgeResolver` | SQL Server FREETEXT / PostgreSQL tsvector | **No** — locked in resolver |
| Entity Search | `RunView` + `UserSearchString` | LIKE-based search across entity fields | Yes, but primitive |
| File Search | `@memberjunction/storage` — 7 providers | Native search on GDrive, SharePoint, Dropbox, Box | Yes |
| Content Pipeline | `@memberjunction/knowledge-pipeline` | Ingest -> Extract -> Autotag -> Vectorize | Yes |
| Tag System | `@memberjunction/tag-engine` | Hierarchical taxonomy, semantic resolution, weighted tags | Yes |
| Reranking | `@memberjunction/ai-reranker` | LLM + Cohere rerankers for result quality | Yes |
| Angular Service | `@memberjunction/ng-search` | SearchService, SearchOverlayComponent, SearchResultsComponent, SearchFilterComponent | Yes |
| Duplicate Detection | `@memberjunction/ai-vectors-dupe` | Vector-based dedup with optional hybrid + reranking | Yes |

### Key Gaps Identified

1. **No `@memberjunction/search-engine` package** — All search logic (RRF fusion, FTS provider orchestration, vector search coordination) is trapped inside `SearchKnowledgeResolver`. Server-side code that wants search must go through GraphQL network calls.

2. **No `GraphQLSearchClient`** — `ng-search`'s SearchService calls `Metadata.Provider.ExecuteGQL()` with inline GraphQL strings. No client SDK in `GraphQLDataProvider` like we have for AI (`GraphQLAIClient`), Actions (`GraphQLActionClient`), and Files (`GraphQLFileStorageClient`).

3. **No autocomplete/typeahead** — Zero suggestion infrastructure anywhere in the codebase.

4. **No search input component** — ng-search has search inputs embedded inside `SearchOverlayComponent` and Knowledge Hub dashboard, but no standalone `<mj-search-input>` that can be dropped into a navbar.

5. **No search predicates** — `IncludeInUserSearchAPI` is a boolean. No per-field control over HOW to search (begins with, contains, exact, soundex). Everything is `LIKE '%query%'`.

6. **No instance-level feature toggles** — No way to enable/disable search bar, chat overlay, or any feature per MJE deployment. Only user-level `UserApplication.IsActive` and app-level `Application.Status` exist.

7. **File/Storage search not integrated** — MJ Storage `SearchFiles()` is not wired into `SearchKnowledgeResolver`. Files are a separate world.

8. **CodeGen doesn't auto-configure search** — FTS enablement, which fields to index, and `IncludeInUserSearchAPI` are mostly manual. The `SmartFieldIdentification` LLM feature exists and can set `IncludeInUserSearchAPI`, but FTS configuration has no LLM integration.

---

## 2. Design Goals & Constraints

### Goals

1. **Universal search from the shell** — A persistent quick-search bar at the top of MJ Explorer that searches across all entities, content, and files with sub-500ms preview results
2. **Reusable at every layer** — Search engine (server), GraphQL client SDK, Angular widgets, and Actions all independently usable
3. **Smart defaults from CodeGen** — LLM-powered auto-configuration of FTS indexes, search predicates, and field inclusion
4. **Sub-500ms preview** — Lightweight "preview" mode for typeahead showing top 5-8 results with minimal latency
5. **Streaming results** — Return results as each source completes rather than waiting for all sources
6. **Instance-level configurability** — Any MJE deployment can enable/disable search bar, chat bubble, and other features
7. **Autocomplete / typeahead** — Real-time suggestions as the user types, including recent searches, popular tags, and result previews

### Constraints

- Must work with SQL Server AND PostgreSQL
- Must not break existing Knowledge Hub search
- Must follow MJ patterns: PascalCase public members, design tokens, no `any` types, `@RegisterClass`, etc.
- ng-search widgets must be framework-context-agnostic (no routing, no NavigationService dependencies)
- New packages must follow existing monorepo conventions (package.json, tsconfig.json, turbo dependencies)
- Feature toggles must be metadata-driven (not environment files) for runtime configurability

---

## 3. Architecture Overview

### Target Architecture (All Layers)

```
┌─────────────────────────────────────────────────────────────────────┐
│  MJ Explorer Shell                                                  │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  <mj-quick-search>  (shell-level wrapper)                     │ │
│  │  ┌──────────────────────────────────┐                         │ │
│  │  │ 🔍 Search everything... [Ctrl+K] │  ← mj-search-input     │ │
│  │  └──────────────┬───────────────────┘                         │ │
│  │                 │ debounced keystrokes                         │ │
│  │  ┌──────────────▼───────────────────┐                         │ │
│  │  │ Autocomplete Preview Dropdown    │  ← mj-search-suggest    │ │
│  │  │ ┌──────────────────────────────┐ │                         │ │
│  │  │ │ 📄 John Smith (Contact) 0.95 │ │                         │ │
│  │  │ │ 📋 Q4 Report (Doc)     0.88 │ │                         │ │
│  │  │ │ 🏢 Acme Corp (Account) 0.82 │ │                         │ │
│  │  │ └──────────────────────────────┘ │                         │ │
│  │  │      [See all 47 results →]      │                         │ │
│  │  └──────────────────────────────────┘                         │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                            │ "See all" or Enter                     │
│                            ▼                                        │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  SearchResultsResource (standalone tab, NOT Knowledge Hub)     │ │
│  │  Uses: mj-search-results + mj-search-filter from ng-search    │ │
│  │  View modes: [List] [Cards] [Grid]   Sort: [Score▼]           │ │
│  │  Filters: [Entity ▼] [Source ▼] [Tags ▼] [Min Score]         │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  Knowledge Hub Search Dashboard (enhanced, uses same ng-search)     │
└─────────────────────────────────────────────────────────────────────┘
         │                              │
         │  Angular SearchService       │  (ng-search)
         │  (thin wrapper)              │
         ▼                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  GraphQLSearchClient (in GraphQLDataProvider)                       │
│  - ExecuteSearch(params): SearchResponse                            │
│  - PreviewSearch(query, maxResults=8): SearchResponse               │
│  - GetSuggestions(prefix): Suggestion[]  (future)                   │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ GraphQL
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SearchKnowledgeResolver (thin wrapper)                             │
│  - SearchKnowledge mutation                                         │
│  - PreviewSearch mutation (new — lightweight, fewer fields)         │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ delegates to
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  @memberjunction/search-engine (NEW server-side package)            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  SearchEngine (singleton)                                    │   │
│  │  ├── VectorSearchProvider   (Pinecone/pgvector/Qdrant)      │   │
│  │  ├── FullTextSearchProvider (SQL Server / PostgreSQL)        │   │
│  │  ├── EntitySearchProvider   (RunView + LIKE)                │   │
│  │  ├── StorageSearchProvider  (NEW — MJ Storage files)        │   │
│  │  ├── SearchFusion           (RRF algorithm)                 │   │
│  │  └── SearchEnricher         (icons, names, tags)            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Parallel execution → RRF fusion → dedup → enrich → filter         │
└─────────────────────────────────────────────────────────────────────┘
```

### Package Dependency Graph (New + Modified)

```
@memberjunction/search-engine (NEW)
├── @memberjunction/core
├── @memberjunction/core-entities
├── @memberjunction/ai-vectors-database
├── @memberjunction/ai-core
├── @memberjunction/storage (for file search)
└── @memberjunction/knowledge-hub-metadata (engine)

GraphQLDataProvider (MODIFIED — add GraphQLSearchClient)
├── @memberjunction/core (existing)
└── graphql-request (existing)

@memberjunction/ng-search (MODIFIED — add new components, refactor to use client SDK)
├── @memberjunction/core (existing)
├── @memberjunction/graphql-dataprovider (NEW dep — for GraphQLSearchClient)
├── @memberjunction/ng-shared-generic (existing)
└── @memberjunction/ng-ui-components (for mj-input etc.)

MJServer (MODIFIED — thin resolver wrapping search-engine)
├── @memberjunction/search-engine (NEW dependency)
└── type-graphql (existing)

@memberjunction/ng-explorer-core (MODIFIED — add quick search bar to shell)
├── @memberjunction/ng-search (existing dep)
└── @memberjunction/ng-shared (existing)
```

> **Note:** MJExplorer is a super-thin runtime app — we do NOT modify it. All shell/UI changes go into `@memberjunction/ng-explorer-core` which contains the actual shell component, navigation, and resource wrappers. MJExplorer just bootstraps explorer-core.

---

## 4. Workstream 1: Server-Side Search Engine Package

### Package: `@memberjunction/search-engine`

**Location:** `packages/AI/Knowledge/SearchEngine/` (new)

**Purpose:** Extract all search logic from `SearchKnowledgeResolver` into a reusable, framework-agnostic server-side package. Any server-side code (Actions, agents, resolvers) can use search without GraphQL network calls.

### Core Classes

#### `SearchEngine` (Singleton, extends `BaseSingleton`)

```typescript
export class SearchEngine extends BaseSingleton<SearchEngine> {
    protected constructor() { super(); }
    public static get Instance(): SearchEngine {
        return SearchEngine.getInstance<SearchEngine>();
    }

    // Full search with all sources
    public async Search(params: SearchParams, contextUser: UserInfo): Promise<SearchResult> { ... }

    // Lightweight preview for typeahead (fewer fields, smaller maxResults, skip enrichment)
    public async PreviewSearch(query: string, maxResults: number, contextUser: UserInfo): Promise<SearchResult> { ... }

    // Configure which providers are active
    public async Config(contextUser: UserInfo): Promise<void> { ... }
}
```

#### `SearchParams` / `SearchResult` Types

```typescript
export interface SearchParams {
    Query: string;
    MaxResults?: number;              // default 25
    MinScore?: number;                // default 0.0 (let client filter)
    Filters?: SearchFilters;
    IncludeSources?: SearchSource[];  // 'vector' | 'fulltext' | 'entity' | 'storage'
    Mode?: 'full' | 'preview';       // preview = fewer fields, faster
    PredicateOverrides?: Record<string, SearchPredicate>;  // per-entity predicate override
}

export interface SearchResult {
    Success: boolean;
    Results: SearchResultItem[];
    TotalCount: number;
    ElapsedMs: number;
    SourceCounts: Record<SearchSource, number>;
    ErrorMessage?: string;
}

export interface SearchResultItem {
    ID: string;
    EntityName: string;
    RecordID: string;
    SourceType: SearchSource;
    Title: string;
    Snippet: string;
    Score: number;
    ScoreBreakdown: Record<SearchSource, number>;
    Tags: string[];
    EntityIcon?: string;
    RecordName?: string;
    RawMetadata?: string;
    MatchedAt: Date;
}
```

#### Search Providers (Extracted from Resolver)

Each provider implements a common interface:

```typescript
export interface ISearchProvider {
    readonly SourceType: SearchSource;
    Search(query: string, maxResults: number, filters: SearchFilters, contextUser: UserInfo): Promise<ScoredCandidate[]>;
    readonly IsAvailable: boolean;  // runtime check (e.g., no vector DB configured = false)
}
```

Providers:
1. **`VectorSearchProvider`** — Already partially exists at `packages/AI/Knowledge/Search/src/generic/VectorSearchProvider.ts`. Refine and move into this package.
2. **`FullTextSearchProvider`** — Already exists at `packages/AI/Knowledge/Search/src/generic/FullTextSearchProvider.ts`. Move and enhance with predicate support.
3. **`EntitySearchProvider`** (new) — Uses `RunView` with `UserSearchString` + new predicate system. Searches entities that don't have FTS or vector indexes.
4. **`StorageSearchProvider`** (new) — Queries `FileStorageAccount` records where `IncludeInGlobalSearch = true` and the provider's `SupportsSearch = true`. Calls `FileStorageBase.SearchFiles()` across those accounts in parallel. Wraps results into `ScoredCandidate` format. Accounts on providers that don't support search (S3, Azure Blob, GCS) are automatically excluded even if `IncludeInGlobalSearch` is set.

#### SearchFusion (RRF)

Extracted from `SearchKnowledgeResolver.fuseResults()`:

```typescript
export class SearchFusion {
    // Reciprocal Rank Fusion across multiple ranked lists
    public static Fuse(candidateLists: ScoredCandidate[][], k?: number): SearchResultItem[] { ... }

    // Deduplicate by entity + recordID, keeping highest score
    public static Deduplicate(results: SearchResultItem[]): SearchResultItem[] { ... }
}
```

#### SearchEnricher

```typescript
export class SearchEnricher {
    // Add entity icons, record names, tags from metadata
    public static async Enrich(results: SearchResultItem[], contextUser: UserInfo): Promise<SearchResultItem[]> { ... }
}
```

### Resolver Changes

`SearchKnowledgeResolver` becomes a thin wrapper:

```typescript
@Mutation(() => SearchKnowledgeResult)
async SearchKnowledge(
    @Arg('query') query: string,
    @Arg('maxResults', () => Float, { nullable: true }) maxResults: number | undefined,
    @Arg('filters', () => SearchFiltersInput, { nullable: true }) filters: SearchFiltersInput | undefined,
    @Arg('minScore', () => Float, { nullable: true }) minScore: number | undefined,
    @Ctx() { userPayload }: AppContext
): Promise<SearchKnowledgeResult> {
    const contextUser = UserCache.Instance.Users.find(u => u.Email === userPayload.email);
    const result = await SearchEngine.Instance.Search({
        Query: query,
        MaxResults: maxResults,
        MinScore: minScore,
        Filters: filters ? { EntityNames: filters.EntityNames, SourceTypes: filters.SourceTypes, Tags: filters.Tags } : undefined,
    }, contextUser);
    return result;
}
```

Add a new lightweight mutation for preview:

```typescript
@Mutation(() => SearchKnowledgeResult)
async PreviewSearch(
    @Arg('query') query: string,
    @Arg('maxResults', () => Float, { nullable: true, defaultValue: 8 }) maxResults: number,
    @Ctx() { userPayload }: AppContext
): Promise<SearchKnowledgeResult> {
    const contextUser = UserCache.Instance.Users.find(u => u.Email === userPayload.email);
    return SearchEngine.Instance.PreviewSearch(query, maxResults, contextUser);
}
```

**Preview mode optimizations:**
- Skip tag enrichment (saves RunView calls)
- Skip raw metadata serialization
- Use smaller vector topK (e.g., 5 instead of 25)
- Skip FTS if vector returns enough high-confidence results
- Return minimal fields (ID, EntityName, RecordID, Title, Score, EntityIcon)

### Search Action (for Agents, MCP, A2A)

#### Naming Decision

The existing GraphQL mutation is `SearchKnowledge` (tied to Knowledge Hub branding). Since we're making this universal, we should consider the name carefully:

| Option | Pros | Cons |
|--------|------|------|
| `Search` | Simple, universal, obvious | Very generic, could conflict with other "search" concepts |
| `SearchKnowledge` | Established (already in use), implies searching org knowledge | Ties to "Knowledge Hub" branding which may not persist |
| `UniversalSearch` | Clearly describes cross-entity/cross-source nature | Verbose, marketing-speak |
| `GlobalSearch` | Common pattern (Salesforce, etc.), clear meaning | "Global" overloaded in programming |

**Recommendation: `Search`** for the Action name (clean, simple, what agents will call). Keep `SearchKnowledge` as the GraphQL mutation name for backwards compatibility but add `Search` as an alias. The server-side package is `@memberjunction/search-engine` and the class is `SearchEngine` — both use the simple name.

Create a `Search` Action that wraps `SearchEngine.Instance.Search()`. This automatically becomes available to:
- **Sage and other MJ agents** — as a tool they can invoke to search the org's full knowledge base (this is RAG — Retrieval-Augmented Generation)
- **MCP connectors** — external tools can search MJ via Model Context Protocol
- **A2A connectors** — agent-to-agent search capabilities

**Location:** `packages/Actions/CoreActions/src/custom/search/search.action.ts`

```typescript
@RegisterClass(BaseAction, "Search")
export class SearchAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const query = params.Params.find(p => p.Name === 'Query')?.Value;
        const maxResults = Number(params.Params.find(p => p.Name === 'MaxResults')?.Value) || 25;
        const minScore = Number(params.Params.find(p => p.Name === 'MinScore')?.Value) || 0;
        const includeSources = params.Params.find(p => p.Name === 'IncludeSources')?.Value;

        if (!query) {
            return { Success: false, ResultCode: 'MISSING_QUERY', Message: 'Query parameter is required' };
        }

        const result = await SearchEngine.Instance.Search({
            Query: query,
            MaxResults: maxResults,
            MinScore: minScore,
            IncludeSources: includeSources ? JSON.parse(includeSources) : undefined,
        }, params.ContextUser);

        // Set output params
        params.Params.push(
            { Name: 'Results', Type: 'Output', Value: JSON.stringify(result.Results) },
            { Name: 'TotalCount', Type: 'Output', Value: String(result.TotalCount) },
            { Name: 'ElapsedMs', Type: 'Output', Value: String(result.ElapsedMs) },
        );

        return {
            Success: result.Success,
            ResultCode: result.Success ? 'SUCCESS' : 'SEARCH_FAILED',
            Message: result.Success
                ? `Found ${result.TotalCount} results in ${result.ElapsedMs}ms`
                : result.ErrorMessage ?? 'Search failed',
        };
    }
}
```

**Action metadata** (to be registered in the database via metadata sync):
- **Name:** Search
- **Params:** Query (Input, required), MaxResults (Input, optional), MinScore (Input, optional), IncludeSources (Input, optional), Results (Output), TotalCount (Output), ElapsedMs (Output)
- **Category:** Utilities

---

## 5. Workstream 2: GraphQL Client SDK

### `GraphQLSearchClient` in GraphQLDataProvider

**Location:** `packages/GraphQLDataProvider/src/graphQLSearchClient.ts` (new file)

Follows the established pattern from `GraphQLAIClient`, `GraphQLActionClient`, and `GraphQLFileStorageClient`.

```typescript
export class GraphQLSearchClient {
    private _dataProvider: GraphQLDataProvider;

    constructor(dataProvider: GraphQLDataProvider) {
        this._dataProvider = dataProvider;
    }

    // Full search
    public async ExecuteSearch(params: SearchClientParams): Promise<SearchClientResponse> { ... }

    // Lightweight preview for typeahead
    public async PreviewSearch(query: string, maxResults?: number): Promise<SearchClientResponse> { ... }
}
```

**Types** (exported alongside the class):

```typescript
export interface SearchClientParams {
    Query: string;
    MaxResults?: number;
    MinScore?: number;
    Filters?: {
        EntityNames?: string[];
        SourceTypes?: string[];
        Tags?: string[];
    };
    IncludeSources?: string[];
}

export interface SearchClientResponse {
    Success: boolean;
    Results: SearchClientResultItem[];
    TotalCount: number;
    ElapsedMs: number;
    SourceCounts: { Vector: number; FullText: number; Entity: number; Storage: number };
    ErrorMessage?: string;
}

export interface SearchClientResultItem {
    ID: string;
    EntityName: string;
    RecordID: string;
    SourceType: string;
    Title: string;
    Snippet: string;
    Score: number;
    ScoreBreakdown: { Vector?: number; FullText?: number; Entity?: number; Storage?: number };
    Tags: string[];
    EntityIcon?: string;
    RecordName?: string;
    MatchedAt: Date;
}
```

**Export from index.ts:**
```typescript
export { GraphQLSearchClient } from './graphQLSearchClient';
export type { SearchClientParams, SearchClientResponse, SearchClientResultItem } from './graphQLSearchClient';
```

### ng-search SearchService Refactor

Once `GraphQLSearchClient` exists, `SearchService` in ng-search stops writing inline GraphQL:

```typescript
// Before (current)
private async executeGraphQLSearch(request: SearchRequest): Promise<SearchResponse> {
    const provider = Metadata.Provider as { ExecuteGQL?: ... };
    const mutation = `mutation SearchKnowledge(...) { ... }`;  // inline GQL string
    const gqlResult = await provider.ExecuteGQL(mutation, variables);
}

// After (refactored)
private async executeGraphQLSearch(request: SearchRequest): Promise<SearchResponse> {
    const client = new GraphQLSearchClient(Metadata.Provider as GraphQLDataProvider);
    return client.ExecuteSearch({
        Query: request.Query,
        MaxResults: request.MaxResults,
        MinScore: request.MinScore,
        Filters: request.ActiveFilters,
    });
}
```

**Search History Persistence (Firm Requirement):**

SearchService's `RecentSearches$` must be backed by `UserInfoEngine.SetSettingDebounced()` so search history persists across clients (web, mobile, different browsers) and page refreshes:

```typescript
// On init — load persisted history
private async LoadRecentSearches(): Promise<void> {
    const stored = UserInfoEngine.Instance.GetSetting('search.recentSearches');
    if (stored) {
        this.RecentSearches$.next(JSON.parse(stored));
    }
}

// After each search — persist (debounced to avoid excessive writes)
private PersistRecentSearches(searches: RecentSearch[]): void {
    UserInfoEngine.Instance.SetSettingDebounced(
        'search.recentSearches',
        JSON.stringify(searches.slice(0, 20))  // cap at 20
    );
}
```

---

## 6. Workstream 3: CodeGen Search Intelligence

### 6.1 Auto-Configure IncludeInUserSearchAPI

**Already exists:** `SmartFieldIdentification` in `packages/CodeGenLib/src/Misc/advanced_generation.ts` already uses LLM to set `IncludeInUserSearchAPI` when `AutoUpdateIncludeInUserSearchAPI = 1` (default: true). This means every new entity gets smart search field selection automatically.

**No changes needed** — just verify the LLM prompt produces good results and enable `SmartFieldIdentification` by default in CodeGen config.

### 6.2 Auto-Configure Full-Text Search (NEW)

**New feature:** CodeGen should auto-decide whether to enable FTS for an entity and which fields to include.

#### New Entity-Level Fields

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `AutoUpdateFullTextSearch` | bit | 1 | When true, CodeGen/LLM can auto-configure FTS settings |

#### New EntityField-Level Fields

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `AutoUpdateFullTextSearch` | bit | 1 | When true, CodeGen/LLM can auto-configure this field's FTS inclusion |

#### LLM Integration

Add a new method to `AdvancedGeneration`:

```typescript
interface FullTextSearchConfig {
    EnableFTS: boolean;                    // Should this entity have FTS?
    EnableFTSReason: string;               // Why/why not
    IndexedFields: string[];               // Which fields to include
    IndexedFieldsReason: string;
    Confidence: 'high' | 'medium' | 'low';
}
```

**LLM Prompt Strategy:** Pass entity name, description, field list (with types and lengths), and ask the model to decide:
1. Does this entity benefit from full-text search? (Entities with mostly FK/numeric fields = no. Entities with Name, Description, Notes, Content = yes.)
2. Which text fields should be indexed? (Prioritize: Name, Title, Description, Notes, Content, Summary, Comments. Exclude: IDs, codes, short enum-like fields.)

**Application:** During CodeGen run, if `Entity.AutoUpdateFullTextSearch = 1`:
- Call LLM for FTS config
- Set `Entity.FullTextSearchEnabled`, create catalog/index/function if needed
- For each field where `EntityField.AutoUpdateFullTextSearch = 1`, set `EntityField.FullTextSearchEnabled`

#### CodeGen-Generated SQL Objects

When FTS is enabled, CodeGen should generate:

**SQL Server:**
```sql
-- Full-text catalog (one per schema, reused)
CREATE FULLTEXT CATALOG MJ_FTS_Catalog AS DEFAULT;

-- Full-text index per entity
CREATE FULLTEXT INDEX ON ${schema}.${tableName} (
    ${indexedFields.map(f => f.Name).join(', ')}
)
KEY INDEX PK_${tableName}
ON MJ_FTS_Catalog
WITH CHANGE_TRACKING AUTO;
```

**PostgreSQL:**
```sql
-- GIN index on tsvector column
CREATE INDEX idx_${tableName}_fts
ON ${schema}.${tableName}
USING GIN (to_tsvector('english', ${indexedFields.map(f => `COALESCE(${f.Name}, '')`).join(" || ' ' || ")}));
```

### 6.3 Auto-Configure Search Predicates (NEW)

Add a new field to EntityField:

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `UserSearchPredicateAPI` | nvarchar(20) | 'Contains' | How to match this field: `BeginsWith`, `Contains`, `EndsWith`, `Exact` |
| `AutoUpdateUserSearchPredicate` | bit | 1 | Allow CodeGen/LLM to auto-set predicate |

**LLM can decide:**
- Name fields → `BeginsWith` (users usually type the start of a name)
- Description/Notes fields → `Contains` (searching within body text)
- Email fields → `Contains` (searching for domain or username)
- Code/identifier fields → `Exact` (looking up a specific code)
- Short enum-like fields → `Exact`

### 6.4 Auto-Configure AllowUserSearchAPI (NEW Enhancement)

Currently `AllowUserSearchAPI` defaults to `false` and is manually set. CodeGen should auto-set this:

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `AutoUpdateAllowUserSearchAPI` | bit | 1 | Allow CodeGen/LLM to auto-decide if entity is searchable |

**LLM Logic:**
- Entities with meaningful user-facing data (Contacts, Companies, Products, Documents) → true
- System/junction/audit/log tables → false
- Entities with only FK columns and no text → false

### 6.5 Additional Non-FK Indexes

CodeGen currently auto-creates indexes for foreign key columns. Extend to also create indexes for fields marked `IncludeInUserSearchAPI = true` that are commonly filtered:

```sql
-- For fields marked IncludeInUserSearchAPI where type is suitable for indexing
CREATE INDEX IDX_AUTO_MJ_SEARCH_${tableName}_${fieldName}
ON ${schema}.${tableName} (${fieldName});
```

Only for fields with selective data types (varchar, nvarchar up to 450 chars, date, int, uniqueidentifier). Skip large text fields (nvarchar(max), text) — those get FTS instead.

### 6.6 SoundEx / Phonetic Search Consideration

**SQL Server:** Has native `SOUNDEX()` function and `DIFFERENCE()` for comparison. `SOUNDEX()` converts a string to a 4-character code based on pronunciation. `DIFFERENCE()` returns 0-4 (4 = most similar). Example: `WHERE DIFFERENCE(LastName, 'Smith') >= 3` finds "Smyth", "Smithe", etc. Cheap to compute but coarse — doesn't handle non-English names well.

**PostgreSQL:** Has two relevant extensions:
- `fuzzystrmatch`: Provides `soundex()`, `levenshtein()`, `metaphone()`, `dmetaphone()`. Double Metaphone is generally superior to SoundEx for phonetic matching.
- `pg_trgm`: Provides `similarity()` and `%` operator for trigram-based fuzzy matching. More flexible than SoundEx — works on any string, not just names. Example: `WHERE similarity(name, 'Smith') > 0.3`.

**Cross-platform mapping:**
| Feature | SQL Server | PostgreSQL |
|---------|-----------|-----------|
| Basic phonetic | `SOUNDEX()` + `DIFFERENCE()` | `soundex()` (via `fuzzystrmatch`) |
| Better phonetic | N/A (would need CLR) | `dmetaphone()` (via `fuzzystrmatch`) |
| Fuzzy/trigram | N/A | `similarity()` + `%` (via `pg_trgm`) |
| Edit distance | N/A (would need CLR) | `levenshtein()` (via `fuzzystrmatch`) |

**Decision: Deferred — likely unnecessary.** SoundEx is older technology (1918 patent, originally designed for US Census name matching). Between semantic/vector search (which understands meaning) and FTS with stemming (which handles word forms like "running" → "run"), the use cases for SoundEx are largely covered by modern approaches. That said, the `UserSearchPredicateAPI` field is `nvarchar(20)` specifically so we *could* add `'Phonetic'` or `'Fuzzy'` values later without schema changes, and the `SearchEngine` provider architecture supports adding a `PhoneticSearchProvider` if a real need emerges. PostgreSQL's `pg_trgm` trigram matching is arguably more useful than SoundEx for fuzzy matching and could be a better candidate if we ever revisit this.

---

## 7. Workstream 4: Angular Search Widgets (ng-search)

### Current ng-search Inventory

| Component | Status | Reusable? |
|-----------|--------|-----------|
| `SearchService` | Exists | Yes (refactor to use GraphQLSearchClient) |
| `SearchOverlayComponent` | Exists | Yes — Cmd+K spotlight modal |
| `SearchResultsComponent` | Exists | Yes — flat/grouped display with pagination |
| `SearchFilterComponent` | Exists | Yes — faceted sidebar |

### New Components to Add

#### 7.1 `SearchInputComponent` (NEW)

A standalone search text input that can be placed anywhere (navbar, hero section, dialog).

```typescript
@Component({
    selector: 'mj-search-input',
    standalone: false,
    template: `
        <div class="mj-search-input-wrapper">
            <i class="fa-solid fa-magnifying-glass search-icon"></i>
            <input
                #searchInput
                class="mj-input"
                [placeholder]="Placeholder"
                [(ngModel)]="Query"
                (input)="OnQueryChange()"
                (keydown.enter)="OnSubmit()"
                (keydown.escape)="OnEscape()"
                (focus)="OnFocus()"
                (blur)="OnBlur()"
            />
            @if (Query) {
                <button class="clear-btn" (click)="OnClear()">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            }
            @if (ShowShortcutHint && !IsFocused) {
                <kbd class="shortcut-hint">{{ ShortcutHint }}</kbd>
            }
        </div>
    `
})
export class SearchInputComponent {
    @Input() Placeholder = 'Search everything...';
    @Input() Query = '';
    @Input() ShowShortcutHint = true;
    @Input() ShortcutHint = 'Ctrl+K';
    @Input() DebounceMs = 200;

    @Output() QueryChange = new EventEmitter<string>();        // debounced text changes
    @Output() QuerySubmit = new EventEmitter<string>();        // Enter pressed
    @Output() InputFocused = new EventEmitter<void>();
    @Output() InputBlurred = new EventEmitter<void>();
    @Output() InputEscaped = new EventEmitter<void>();
    @Output() InputCleared = new EventEmitter<void>();

    public Focus(): void { ... }  // programmatic focus
    public Clear(): void { ... }
}
```

#### 7.2 `SearchSuggestComponent` (NEW)

Autocomplete/typeahead dropdown that shows preview results, recent searches, and popular tags.

```typescript
@Component({
    selector: 'mj-search-suggest',
    standalone: false,
    template: `
        <div class="mj-search-suggest-dropdown" [class.open]="IsOpen">
            @if (IsLoading) {
                <div class="suggest-loading"><mj-loading size="small" [showText]="false"></mj-loading></div>
            }

            <!-- Recent searches section (shown when query is empty or short) -->
            @if (ShowRecent && RecentSearches.length > 0) {
                <div class="suggest-section">
                    <div class="suggest-section-header">Recent Searches</div>
                    @for (recent of RecentSearches; track recent.Query) {
                        <div class="suggest-item recent-item"
                             [class.highlighted]="HighlightedIndex === $index"
                             (click)="OnRecentClick(recent)">
                            <i class="fa-solid fa-clock-rotate-left"></i>
                            <span>{{ recent.Query }}</span>
                        </div>
                    }
                </div>
            }

            <!-- Preview results section -->
            @if (PreviewResults.length > 0) {
                <div class="suggest-section">
                    <div class="suggest-section-header">Results</div>
                    @for (result of PreviewResults; track result.ID) {
                        <div class="suggest-item result-item"
                             [class.highlighted]="HighlightedIndex === RecentSearches.length + $index"
                             (click)="OnResultClick(result)">
                            <i [class]="result.EntityIcon || 'fa-solid fa-file'"></i>
                            <div class="result-text">
                                <span class="result-title">{{ result.Title }}</span>
                                <span class="result-entity">{{ result.EntityName }}</span>
                            </div>
                            <span class="result-score">{{ (result.Score * 100) | number:'1.0-0' }}%</span>
                        </div>
                    }
                </div>
            }

            <!-- See all results footer -->
            @if (TotalCount > PreviewResults.length) {
                <div class="suggest-footer" (click)="OnSeeAllClick()">
                    See all {{ TotalCount }} results
                    <i class="fa-solid fa-arrow-right"></i>
                </div>
            }

            <!-- No results state -->
            @if (!IsLoading && Query.length >= MinQueryLength && PreviewResults.length === 0 && !ShowRecent) {
                <div class="suggest-empty">No results found</div>
            }
        </div>
    `
})
export class SearchSuggestComponent {
    @Input() IsOpen = false;
    @Input() PreviewResults: SearchResultItem[] = [];
    @Input() RecentSearches: RecentSearch[] = [];
    @Input() TotalCount = 0;
    @Input() IsLoading = false;
    @Input() Query = '';
    @Input() MinQueryLength = 2;
    @Input() MaxPreviewResults = 8;
    @Input() ShowRecent = true;

    @Output() ResultSelected = new EventEmitter<SearchResultItem>();
    @Output() RecentSelected = new EventEmitter<RecentSearch>();
    @Output() SeeAllRequested = new EventEmitter<string>();

    // Keyboard navigation
    public HighlightedIndex = -1;
    public NavigateUp(): void { ... }
    public NavigateDown(): void { ... }
    public SelectHighlighted(): void { ... }
}
```

#### 7.3 `SearchCompositeComponent` (NEW)

A composite widget combining input + suggestions + overlay results. Drop-in ready for any app.

```typescript
@Component({
    selector: 'mj-search-composite',
    standalone: false,
    template: `
        <div class="mj-search-composite" [class.expanded]="IsExpanded">
            <mj-search-input
                [Placeholder]="Placeholder"
                [ShowShortcutHint]="ShowShortcutHint"
                [DebounceMs]="DebounceMs"
                (QueryChange)="OnQueryChange($event)"
                (QuerySubmit)="OnQuerySubmit($event)"
                (InputFocused)="OnInputFocused()"
                (InputBlurred)="OnInputBlurred()"
                (InputEscaped)="OnInputEscaped()"
            ></mj-search-input>

            <mj-search-suggest
                [IsOpen]="ShowSuggestions"
                [PreviewResults]="PreviewResults"
                [RecentSearches]="RecentSearches"
                [TotalCount]="TotalCount"
                [IsLoading]="IsLoading"
                [Query]="CurrentQuery"
                (ResultSelected)="OnResultSelected($event)"
                (RecentSelected)="OnRecentSelected($event)"
                (SeeAllRequested)="OnSeeAllRequested($event)"
            ></mj-search-suggest>
        </div>
    `
})
export class SearchCompositeComponent {
    @Input() Placeholder = 'Search everything...';
    @Input() ShowShortcutHint = true;
    @Input() DebounceMs = 200;
    @Input() MinQueryLength = 2;
    @Input() MaxPreviewResults = 8;
    @Input() EnablePreview = true;       // Auto-fetch preview results on type
    @Input() EnableRecent = true;

    @Output() ResultSelected = new EventEmitter<SearchResultItem>();
    @Output() SearchSubmitted = new EventEmitter<string>();        // Enter or "See all"
    @Output() SeeAllRequested = new EventEmitter<{ Query: string; TotalCount: number }>();
}
```

This is the **drop-in widget** that both the Shell quick search bar and the Knowledge Hub can use. It handles:
- Debounced preview search via SearchService
- Recent search display
- Keyboard navigation (arrow keys in suggestions)
- Emits events for parent to handle navigation

#### 7.4 View Mode Support in SearchResultsComponent

Enhance the existing `SearchResultsComponent` with view mode toggle:

```typescript
// New inputs
@Input() ViewMode: 'list' | 'cards' | 'grid' = 'list';
@Input() ShowViewModeToggle = true;
@Input() SortField: 'score' | 'title' | 'entity' | 'date' = 'score';
@Input() SortDirection: 'asc' | 'desc' = 'desc';
@Input() ShowSortControls = true;

@Output() ViewModeChanged = new EventEmitter<'list' | 'cards' | 'grid'>();
@Output() SortChanged = new EventEmitter<{ Field: string; Direction: 'asc' | 'desc' }>();
```

**View modes:**
- **List** (default): Compact rows with icon, title, entity badge, score, snippet preview. High density.
- **Cards**: Rich tiles with larger snippet, tag pills, score bar, metadata. Good for exploration.
- **Grid**: Tabular with sortable columns (Title, Entity, Score, Source, Date). Power-user mode.

### Updated ng-search Exports

```typescript
// Existing
export { SearchService, SearchOverlayComponent, SearchResultsComponent, SearchFilterComponent, SearchModule };

// New
export { SearchInputComponent };
export { SearchSuggestComponent };
export { SearchCompositeComponent };

// Types (existing + new)
export type { SearchRequest, SearchResponse, SearchResultItem, SearchResultGroup, ... };
export type { SearchSuggestion, ViewMode, SortConfig };
```

---

## 8. Workstream 5: Shell Quick Search Bar

### Location

Replace the current shell search popup in `packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.html`.

### Design

The shell consumes `<mj-search-composite>` from ng-search and wires it to MJ Explorer's navigation:

```html
<!-- In shell header, always visible -->
<div class="shell-search-bar">
    <mj-search-composite
        Placeholder="Search everything..."
        [ShowShortcutHint]="true"
        [EnablePreview]="true"
        [EnableRecent]="true"
        [MaxPreviewResults]="8"
        (ResultSelected)="OnSearchResultSelected($event)"
        (SeeAllRequested)="OnSeeAllSearch($event)"
    ></mj-search-composite>
</div>
```

### Shell Event Handlers

```typescript
OnSearchResultSelected(result: SearchResultItem): void {
    // Navigate to entity record
    this.navigationService.NavigateToEntity(result.EntityName, result.RecordID);
}

OnSeeAllSearch(event: { Query: string; TotalCount: number }): void {
    // Open full SearchResultsResource tab with the query
    this.navigationService.NavigateToResource('SearchResults', {
        Configuration: { Query: event.Query }
    });
}
```

### SearchResultsResource (Enhanced)

Replace the current `SingleSearchResultComponent` with a proper search results page that uses ng-search widgets:

```typescript
@RegisterClass(BaseResourceComponent, 'SearchResults')
@Component({
    selector: 'mj-search-results-resource',
    template: `
        <div class="search-results-page">
            <!-- Search bar at top (reuse composite, minus suggestions) -->
            <div class="search-header">
                <mj-search-input
                    [Query]="CurrentQuery"
                    Placeholder="Refine your search..."
                    [ShowShortcutHint]="false"
                    (QuerySubmit)="OnSearchSubmit($event)"
                ></mj-search-input>
            </div>

            <!-- Results with filters -->
            <div class="search-body">
                @if (ShowFilters) {
                    <aside class="search-sidebar">
                        <mj-search-filter
                            [Filters]="Filters"
                            [ActiveFilters]="ActiveFilters"
                            (FilterChanged)="OnFilterChanged($event)"
                            (FiltersCleared)="OnFiltersCleared()"
                        ></mj-search-filter>
                    </aside>
                }
                <main class="search-main">
                    <mj-search-results
                        [FlatResults]="FilteredResults"
                        [IsLoading]="IsSearching"
                        [TotalCount]="TotalCount"
                        [ElapsedMs]="ElapsedMs"
                        [ViewMode]="CurrentViewMode"
                        [ShowViewModeToggle]="true"
                        [ShowSortControls]="true"
                        [ShowScores]="true"
                        [ShowTags]="true"
                        (ResultSelected)="OnResultSelected($event)"
                        (ViewModeChanged)="OnViewModeChanged($event)"
                        (SortChanged)="OnSortChanged($event)"
                    ></mj-search-results>
                </main>
            </div>
        </div>
    `
})
export class SearchResultsResourceComponent extends BaseResourceComponent { ... }
```

### Keyboard Shortcut

Register `Ctrl+K` (or `Cmd+K` on Mac) globally in the shell to focus the search bar:

```typescript
@HostListener('document:keydown', ['$event'])
OnKeyDown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        this.searchComposite.Focus();
    }
}
```

### Migration from Old Shell Search

- Remove the old entity-picker + search popup from shell HTML
- Remove `searchableEntities`, `selectedEntity`, `onSearch()` from shell component
- Keep `SingleSearchResultComponent` for backwards compatibility (deep links to `/resource/search/:input?Entity=EntityName` still work)
- New search goes to `/resource/SearchResults?q=query`

---

## 9. Workstream 6: Instance-Level Feature Configuration

### Current State

MJ Explorer has:
- **User-level:** `UserApplication` entity controls which apps a user sees (per-user IsActive + Sequence)
- **App-level:** `Application.Status` (Active/Disabled/Deprecated) controls global app visibility
- **No instance-level feature toggles** — No way to disable search bar, chat overlay, or other features per deployment

### Proposed: InstanceConfiguration Entity

**New entity:** `MJ: Instance Configurations`

```sql
CREATE TABLE ${flyway:defaultSchema}.InstanceConfiguration (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FeatureKey NVARCHAR(200) NOT NULL,           -- e.g. 'Shell.SearchBar.Enabled'
    Value NVARCHAR(MAX) NOT NULL,                -- JSON value
    ValueType NVARCHAR(20) NOT NULL DEFAULT 'boolean',  -- boolean, string, number, json
    Category NVARCHAR(100) NOT NULL DEFAULT 'General',   -- grouping for admin UI
    DisplayName NVARCHAR(200) NOT NULL,          -- human-readable name
    Description NVARCHAR(MAX) NULL,              -- help text
    DefaultValue NVARCHAR(MAX) NOT NULL,         -- factory default
    CONSTRAINT PK_InstanceConfiguration PRIMARY KEY (ID),
    CONSTRAINT UQ_InstanceConfiguration_Key UNIQUE (FeatureKey)
);
```

**Seed data (managed via metadata sync at `/metadata/instance-configurations/`):**

| FeatureKey | DisplayName | DefaultValue | Category |
|------------|------------|--------------|----------|
| `Shell.SearchBar.Enabled` | Show Global Search Bar | `true` | Shell |
| `Shell.SearchBar.EnablePreview` | Enable Search Preview Dropdown | `true` | Shell |
| `Shell.ChatOverlay.Enabled` | Show Chat Overlay Bubble | `true` | Shell |
| `Shell.ChatOverlay.AllowOpenInFullApp` | Allow Opening Chat in Full App | `true` | Shell |
| `KnowledgeHub.Enabled` | Enable Knowledge Hub Application | `true` | Applications |
| `Search.VectorSearch.Enabled` | Enable Vector/Semantic Search | `true` | Search |
| `Search.FullTextSearch.Enabled` | Enable Full-Text Search | `true` | Search |
| `Search.DefaultMinScore` | Default Minimum Relevance Score | `0.35` | Search |

> **Note:** File/Storage search is NOT controlled by InstanceConfiguration. Instead, it uses the per-account `FileStorageAccount.IncludeInGlobalSearch` bit. This is more granular — an org can include "Marketing Dropbox" in global search but exclude "IT Backups S3." The `StorageSearchProvider` automatically queries only accounts where `IncludeInGlobalSearch = true` AND the provider's `SupportsSearch = true`.

### InstanceConfigEngine (Client + Server)

```typescript
export class InstanceConfigEngine extends BaseEngine<InstanceConfigEngine> {
    // Loaded at startup, cached, refreshed on entity events
    public Get(featureKey: string): string | undefined { ... }
    public GetBoolean(featureKey: string, defaultValue?: boolean): boolean { ... }
    public GetNumber(featureKey: string, defaultValue?: number): number { ... }
    public GetJSON<T>(featureKey: string, defaultValue?: T): T { ... }

    // Admin only
    public async Set(featureKey: string, value: string, contextUser: UserInfo): Promise<boolean> { ... }
}
```

### Shell Integration

```typescript
// In shell component
get ShowSearchBar(): boolean {
    return InstanceConfigEngine.Instance.GetBoolean('Shell.SearchBar.Enabled', true);
}

get ShowChatOverlay(): boolean {
    return InstanceConfigEngine.Instance.GetBoolean('Shell.ChatOverlay.Enabled', true);
}
```

```html
<!-- In shell template -->
@if (ShowSearchBar) {
    <div class="shell-search-bar">
        <mj-search-composite ...></mj-search-composite>
    </div>
}
```

### NavigationService Helpers

Add to NavigationService for components that need to check feature availability:

```typescript
public IsFeatureEnabled(featureKey: string): boolean {
    return InstanceConfigEngine.Instance.GetBoolean(featureKey, true);
}

public GetInstalledApps(): ApplicationInfo[] {
    return Metadata.Applications.filter(a => a.Status === 'Active');
}

public IsAppInstalled(appName: string): boolean {
    return Metadata.Applications.some(a => a.Name === appName && a.Status === 'Active');
}
```

### Admin UI

A settings panel (accessible to Admins only) in MJ Explorer for managing instance configuration. Could be part of Explorer Settings or a standalone admin dashboard. This is a lower priority — database-level configuration works for initial rollout.

---

## 10. Security & Permissions

### Principle: Users Must Never See Results They Cannot Read

This is a hard requirement. Every search result returned to a user must pass the same permission checks that `RunView` enforces. No search path (vector, FTS, entity LIKE, storage) may bypass entity-level permissions or Row-Level Security (RLS).

### MJ Permission Model (Existing)

MJ has a three-layer permission system:

1. **Entity-Level Permissions** (`EntityPermission`) — Links Roles to Entities with `CanRead`, `CanCreate`, `CanUpdate`, `CanDelete` flags. If no role grants `CanRead`, the user cannot see ANY records from that entity.

2. **Row-Level Security** (`RowLevelSecurityFilter`) — SQL WHERE clause templates with user tokens (e.g., `{{UserID}}`, `{{UserEmail}}`). Applied per-role per-entity. When RLS is active, `RunView` automatically appends the filter to every query. Users exempt from RLS only if they have a role that grants permission WITHOUT an RLS filter.

3. **Access Control Rules** — Record-level permissions for specific records, with GranteeType (User, Role, Everyone, Public).

### How Each Search Source Must Handle Permissions

#### Entity Search (RunView + LIKE) — Already Secure
- `RunView` calls `CheckUserReadPermissions()` before executing
- RLS filters are automatically appended to the WHERE clause by `GenericDatabaseProvider`
- No changes needed — this path is already secure

#### Full-Text Search — Mostly Secure, Needs Verification
- `FullTextSearchProvider` uses `Metadata.FullTextSearch()` which delegates to the database provider
- Provider should apply RLS via the same path as RunView
- **Action item:** Verify that the FTS code path applies RLS. If it uses raw SQL queries that bypass the provider, we need to add RLS filter injection.

#### Vector Search — GAP: Not Currently Secure
- Vector DB queries (Pinecone, pgvector, Qdrant) return results based on embedding similarity
- The vector DB has NO knowledge of MJ permissions — it stores metadata like `{Entity, RecordID}` but not permission data
- **Current behavior:** `SearchKnowledgeResolver.searchAllVectorIndexes()` returns results without any permission filtering

**Required fix for vector results:**

```
Vector results come back as [{EntityName, RecordID, Score}, ...]
                                    │
                                    ▼
Step 1: Group results by EntityName
                                    │
                                    ▼
Step 2: For each entity, check user.GetUserPermissions(entity).CanRead
        → Remove ALL results for entities user cannot read
                                    │
                                    ▼
Step 3: For entities WITH RLS filters:
        Option A (recommended): Re-validate via lightweight RunView
            - Build: SELECT ID FROM Entity WHERE ID IN (...recordIDs...) AND (RLS_filter)
            - Records NOT returned = user cannot see them → remove from results
        Option B: Exclude vector results entirely for RLS entities (simpler but loses semantic search)
        Option C: Store RLS-relevant fields in vector metadata at indexing time (complex, fragile)
                                    │
                                    ▼
Step 4: Return only permitted results to RRF fusion
```

**Recommendation: Option A** — lightweight re-validation query. It's one SQL query per entity (batched by entity name), checking only IDs against RLS filters. Fast and correct. The `SearchEngine` can batch these efficiently.

#### Storage Search — Needs Account-Level Permissions (NEW)

**Current gap:** MJ Storage has no user-level access control on storage accounts. All users with entity-level read permission on `MJ: Files` can access all storage accounts. This is a significant hole.

**Proposed: FileStorageAccountPermission Entity (NEW)**

```sql
CREATE TABLE ${flyway:defaultSchema}.FileStorageAccountPermission (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FileStorageAccountID UNIQUEIDENTIFIER NOT NULL,
    GranteeType NVARCHAR(20) NOT NULL DEFAULT 'Role',  -- 'User', 'Role', 'Everyone'
    GranteeID UNIQUEIDENTIFIER NULL,                     -- UserID or RoleID (NULL for Everyone)
    CanRead BIT NOT NULL DEFAULT 1,
    CanWrite BIT NOT NULL DEFAULT 0,
    CONSTRAINT PK_FileStorageAccountPermission PRIMARY KEY (ID),
    CONSTRAINT FK_FSAP_Account FOREIGN KEY (FileStorageAccountID)
        REFERENCES ${flyway:defaultSchema}.FileStorageAccount(ID),
    CONSTRAINT UQ_FSAP UNIQUE (FileStorageAccountID, GranteeType, GranteeID)
);
```

**Behavior:**
- If NO permission records exist for an account → account is accessible to Everyone (backwards compatible)
- If ANY permission records exist → only users matching a permission record can access that account
- `StorageSearchProvider` filters to accounts the user can access before searching
- This same permission model should be used for ALL storage operations (list, upload, download), not just search

### Permission Filtering in SearchEngine

The `SearchEngine` class handles permission filtering as a post-processing step after all providers return results:

```typescript
// In SearchEngine.Search()
async Search(params: SearchParams, contextUser: UserInfo): Promise<SearchResult> {
    // 1. Run all providers in parallel
    const rawResults = await this.executeProviders(params, contextUser);

    // 2. RRF fusion
    const fused = SearchFusion.Fuse(rawResults);

    // 3. Permission filtering (NEW)
    const permitted = await this.filterByPermissions(fused, contextUser);

    // 4. Enrichment, dedup, score threshold
    return this.finalizeResults(permitted, params);
}

private async filterByPermissions(
    results: SearchResultItem[],
    contextUser: UserInfo
): Promise<SearchResultItem[]> {
    // Group by entity
    const byEntity = this.groupByEntity(results);

    const permitted: SearchResultItem[] = [];
    for (const [entityName, entityResults] of byEntity) {
        const entity = Metadata.Entities.find(e => e.Name === entityName);

        // Check entity-level read permission
        const perms = entity.GetUserPermisions(contextUser);
        if (!perms.CanRead) continue;  // Skip entire entity

        // Check RLS
        if (entity.UserExemptFromRowLevelSecurity(contextUser, EntityPermissionType.Read)) {
            permitted.push(...entityResults);  // No RLS, all results OK
        } else {
            // Re-validate record IDs against RLS filter
            const validIDs = await this.validateRecordIDsAgainstRLS(
                entity, entityResults.map(r => r.RecordID), contextUser
            );
            permitted.push(...entityResults.filter(r => validIDs.has(r.RecordID)));
        }
    }
    return permitted;
}
```

### Performance Impact of Permission Filtering

- **Entity-level checks:** In-memory, trivial (~0ms). Just checking cached permission metadata.
- **RLS re-validation:** One SQL query per entity with RLS. Uses `WHERE ID IN (...)` which is efficient with PK index. Typically <10ms per entity.
- **Storage account filtering:** In-memory check against cached permission records. Trivial.
- **Worst case:** 5 entities with RLS, 50 record IDs each = 5 queries of ~10ms = ~50ms added. Well within budget.

---

## 11. Performance Strategy

### Goal: Sub-500ms Preview Results

**Budget breakdown for preview search (8 results):**

| Phase | Target | Strategy |
|-------|--------|----------|
| Client debounce | 200ms | Wait for user to stop typing |
| GraphQL round-trip | 50ms | Local network / same server |
| Embedding generation | 100-150ms | OpenAI text-embedding-3-small is ~100ms for short queries |
| Vector search | 50-100ms | Pinecone query is typically <50ms |
| FTS query | 30-50ms | SQL Server FREETEXT is fast on indexed tables |
| Entity search | 20-30ms | RunView LIKE on indexed fields |
| RRF fusion + dedup | <5ms | In-memory, trivial |
| Enrichment | 0ms | **Skip in preview mode** |
| **Total server time** | **~200-350ms** | Well under 500ms budget |

### Optimization Strategies

1. **Preview mode skips enrichment** — No tag loading, no raw metadata serialization, minimal fields returned
2. **Parallel source execution** — Vector, FTS, Entity, Storage all run concurrently via `Promise.all()`
3. **Early termination** — If vector search returns 8+ results with score > 0.8, skip FTS/entity sources
4. **Embedding caching** — Cache recent query embeddings (LRU, 100 entries, 5-minute TTL) to avoid re-embedding repeated or similar queries
5. **Connection pooling** — Reuse Pinecone/DB connections (already handled by providers)
6. **Batch entity icon resolution** — Pre-cache entity icons at startup (they rarely change)

### Streaming Results (Future Enhancement)

For full search (not preview), consider GraphQL subscriptions to stream results as each source completes:

```graphql
subscription SearchKnowledgeStream($query: String!) {
    SearchKnowledgeStream(query: $query) {
        Source    # which source just returned
        Results   # partial results from that source
        IsComplete # all sources done?
    }
}
```

This is a **Phase 4 fallback** — only pursued if `Promise.all()` doesn't hit the sub-500ms preview benchmark. Parallel execution is the default strategy.

---

## 12. Search Predicate System

### Entity Field Metadata

New field on `EntityField`:

| Field | Type | Values | Default |
|-------|------|--------|---------|
| `UserSearchPredicateAPI` | nvarchar(20) | `BeginsWith`, `Contains`, `EndsWith`, `Exact` | `Contains` |
| `AutoUpdateUserSearchPredicate` | bit | 0/1 | 1 |

### SQL Generation per Predicate

**SQL Server:**

| Predicate | SQL Pattern | Index Impact |
|-----------|------------|-------------|
| `BeginsWith` | `field LIKE 'query%'` | Can use B-tree index (fast) |
| `Contains` | `field LIKE '%query%'` | Cannot use index (scan) |
| `EndsWith` | `field LIKE '%query'` | Cannot use index (scan) |
| `Exact` | `field = 'query'` | Uses index (fastest) |

**PostgreSQL:** Same patterns with `ILIKE` for case-insensitive matching.

### RunView Integration

The `UserSearchString` parameter in RunView needs to respect per-field predicates. Currently it generates `LIKE '%query%'` for all fields. The enhanced version:

```typescript
// Pseudo-code for generating search WHERE clause
for (const field of searchableFields) {
    switch (field.UserSearchPredicateAPI) {
        case 'BeginsWith': clauses.push(`${field.Name} LIKE '${escapedQuery}%'`);  break;
        case 'Contains':   clauses.push(`${field.Name} LIKE '%${escapedQuery}%'`); break;
        case 'EndsWith':   clauses.push(`${field.Name} LIKE '%${escapedQuery}'`);  break;
        case 'Exact':      clauses.push(`${field.Name} = '${escapedQuery}'`);      break;
    }
}
return clauses.join(' OR ');
```

**Important:** All values must be properly parameterized to prevent SQL injection. The pseudo-code above is illustrative — actual implementation uses parameterized queries.

### Performance Implications

- `BeginsWith` is dramatically faster than `Contains` on indexed fields — encourage CodeGen to default Name fields to `BeginsWith`
- `Contains` should only be used on fields that genuinely need substring matching (descriptions, notes)
- `Exact` is fastest but least user-friendly — good for codes, identifiers
- FTS (`FREETEXT`/`tsvector`) should be preferred over `Contains` for large text fields — it's both faster and produces better results

---

## 13. Migration & Rollout

### Database Migration (Single Mega-Migration)

All schema changes ship in ONE migration file: `V{timestamp}__v5.25.x__universal_search_infrastructure.sql`

Note: ALTER TABLEs are consolidated (one per table), and every new column gets `sp_addextendedproperty` for CodeGen descriptions.

```sql
-- =============================================================
-- 1. EntityField: Search predicate and auto-update fields
-- =============================================================
ALTER TABLE ${flyway:defaultSchema}.EntityField ADD
    UserSearchPredicateAPI NVARCHAR(20) NOT NULL DEFAULT 'Contains',
    AutoUpdateUserSearchPredicate BIT NOT NULL DEFAULT 1,
    AutoUpdateFullTextSearch BIT NOT NULL DEFAULT 1;

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Search predicate for this field: BeginsWith, Contains, EndsWith, or Exact. Controls how user search queries match against this field.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'EntityField', @level2type=N'COLUMN', @level2name=N'UserSearchPredicateAPI';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When true, CodeGen LLM can auto-set the UserSearchPredicateAPI value during code generation runs.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'EntityField', @level2type=N'COLUMN', @level2name=N'AutoUpdateUserSearchPredicate';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When true, CodeGen LLM can auto-set the FullTextSearchEnabled value during code generation runs.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'EntityField', @level2type=N'COLUMN', @level2name=N'AutoUpdateFullTextSearch';

-- =============================================================
-- 2. Entity: FTS and search API auto-update fields
-- =============================================================
ALTER TABLE ${flyway:defaultSchema}.Entity ADD
    AutoUpdateFullTextSearch BIT NOT NULL DEFAULT 1,
    AutoUpdateAllowUserSearchAPI BIT NOT NULL DEFAULT 1;

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When true, CodeGen LLM can auto-configure full-text search settings (FullTextSearchEnabled, catalog, index, function) during code generation runs.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'Entity', @level2type=N'COLUMN', @level2name=N'AutoUpdateFullTextSearch';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When true, CodeGen LLM can auto-set AllowUserSearchAPI during code generation runs.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'Entity', @level2type=N'COLUMN', @level2name=N'AutoUpdateAllowUserSearchAPI';

-- =============================================================
-- 3. FileStorageAccount: Global search inclusion
-- =============================================================
ALTER TABLE ${flyway:defaultSchema}.FileStorageAccount ADD
    IncludeInGlobalSearch BIT NOT NULL DEFAULT 0;

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When true, this storage account is included in universal/global search results. Only effective if the associated provider supports search.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'FileStorageAccount', @level2type=N'COLUMN', @level2name=N'IncludeInGlobalSearch';

-- =============================================================
-- 4. FileStorageAccountPermission: Account-level access control
-- =============================================================
CREATE TABLE ${flyway:defaultSchema}.FileStorageAccountPermission (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FileStorageAccountID UNIQUEIDENTIFIER NOT NULL,
    GranteeType NVARCHAR(20) NOT NULL DEFAULT 'Role',
    GranteeID UNIQUEIDENTIFIER NULL,
    CanRead BIT NOT NULL DEFAULT 1,
    CanWrite BIT NOT NULL DEFAULT 0,
    CONSTRAINT PK_FileStorageAccountPermission PRIMARY KEY (ID),
    CONSTRAINT FK_FSAP_Account FOREIGN KEY (FileStorageAccountID)
        REFERENCES ${flyway:defaultSchema}.FileStorageAccount(ID),
    CONSTRAINT UQ_FSAP UNIQUE (FileStorageAccountID, GranteeType, GranteeID)
);

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Controls which users and roles can access specific file storage accounts. If no permission records exist for an account, it is accessible to everyone (backwards compatible).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'FileStorageAccountPermission';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The storage account this permission applies to.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'FileStorageAccountPermission', @level2type=N'COLUMN', @level2name=N'FileStorageAccountID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Type of grantee: User, Role, or Everyone. When Everyone, GranteeID should be NULL.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'FileStorageAccountPermission', @level2type=N'COLUMN', @level2name=N'GranteeType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'ID of the User or Role. NULL when GranteeType is Everyone.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'FileStorageAccountPermission', @level2type=N'COLUMN', @level2name=N'GranteeID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether the grantee can read/search files in this storage account.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'FileStorageAccountPermission', @level2type=N'COLUMN', @level2name=N'CanRead';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether the grantee can upload/modify files in this storage account.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'FileStorageAccountPermission', @level2type=N'COLUMN', @level2name=N'CanWrite';

-- =============================================================
-- 5. InstanceConfiguration: Feature toggle system
-- =============================================================
CREATE TABLE ${flyway:defaultSchema}.InstanceConfiguration (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FeatureKey NVARCHAR(200) NOT NULL,
    Value NVARCHAR(MAX) NOT NULL,
    ValueType NVARCHAR(20) NOT NULL DEFAULT 'boolean',
    Category NVARCHAR(100) NOT NULL DEFAULT 'General',
    DisplayName NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    DefaultValue NVARCHAR(MAX) NOT NULL,
    CONSTRAINT PK_InstanceConfiguration PRIMARY KEY (ID),
    CONSTRAINT UQ_InstanceConfiguration_Key UNIQUE (FeatureKey)
);

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Instance-level feature toggles and configuration. Controls which features are enabled per MJ Explorer deployment.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'InstanceConfiguration';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique dot-notation key identifying the feature, e.g. Shell.SearchBar.Enabled',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'InstanceConfiguration', @level2type=N'COLUMN', @level2name=N'FeatureKey';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Current value for this feature setting.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'InstanceConfiguration', @level2type=N'COLUMN', @level2name=N'Value';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Data type of the value: boolean, string, number, or json.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'InstanceConfiguration', @level2type=N'COLUMN', @level2name=N'ValueType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Grouping category for admin UI display.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'InstanceConfiguration', @level2type=N'COLUMN', @level2name=N'Category';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Human-readable display name for the setting.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'InstanceConfiguration', @level2type=N'COLUMN', @level2name=N'DisplayName';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Factory default value. Used when resetting to defaults.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'InstanceConfiguration', @level2type=N'COLUMN', @level2name=N'DefaultValue';
```

> **InstanceConfiguration seed data** is managed via metadata sync (`/metadata/instance-configurations/`), NOT SQL INSERT statements. See [Seeding New Lookup/Reference Tables](../../CLAUDE.md) in CLAUDE.md for the pattern. This ensures the seed data is version-controlled, declarative, and safe to re-run.

**After migration:** Run CodeGen to generate updated entity types, then run CodeGen LLM pipeline to auto-populate new fields (FTS config, predicates, AllowUserSearchAPI) across all entities.

### Rollout Phases

**Phase 1: Foundation + Schema + CodeGen (Merged)**

All schema changes happen in ONE mega-migration. Server-side search engine, client SDK, and CodeGen intelligence ship together.

1. **Mega-migration** — All schema changes in a single migration file:
   - `EntityField`: Add `UserSearchPredicateAPI`, `AutoUpdateUserSearchPredicate`, `AutoUpdateFullTextSearch`
   - `Entity`: Add `AutoUpdateFullTextSearch`, `AutoUpdateAllowUserSearchAPI`
   - `FileStorageAccount`: Add `IncludeInGlobalSearch`
   - `FileStorageAccountPermission`: Create table (account-level access control)
   - `InstanceConfiguration`: Create table (feature toggles)
   - Seed InstanceConfiguration defaults via metadata sync (not SQL)
   - Run CodeGen after migration to generate updated types
2. **Create `@memberjunction/search-engine` package** — Extract logic from `SearchKnowledgeResolver`, add `EntitySearchProvider`, `StorageSearchProvider`
3. **Add `GraphQLSearchClient`** to GraphQLDataProvider
4. **Add `PreviewSearch` mutation** to `SearchKnowledgeResolver`
5. **Refactor ng-search `SearchService`** to use `GraphQLSearchClient`
6. **CodeGen FTS auto-configuration** — LLM pipeline for FTS enablement + field selection + predicate assignment + `AllowUserSearchAPI`
7. **Create `Search` Action** — Wraps `SearchEngine.Instance.Search()` for agents/workflows/MCP/A2A
8. **Implement permission filtering** — Entity-level read checks + RLS re-validation for vector results + storage account permissions
9. **Unit tests** for search-engine package, GraphQLSearchClient, CodeGen FTS logic, permission filtering

**Phase 2: UI Widgets**
1. Build `SearchInputComponent`
2. Build `SearchSuggestComponent`
3. Build `SearchCompositeComponent`
4. Add view modes (list/cards/grid) to `SearchResultsComponent`
5. Add sort controls
6. Comprehensive component documentation

**Phase 3: Shell Integration + Instance Config**
1. Build `InstanceConfigEngine`
2. Wire shell features to instance config (search bar, chat overlay)
3. Add `<mj-search-composite>` to shell header
4. Build enhanced `SearchResultsResource`
5. Wire Ctrl+K keyboard shortcut
6. Maintain backwards compatibility with old search URLs
7. Evaluate Knowledge Hub search dashboard — consolidate or differentiate from universal search

**Phase 4: Polish & Performance**
1. Embedding cache for repeated queries
2. Early termination optimization
3. Storage search integration (accounts with `IncludeInGlobalSearch = true`)
4. End-to-end performance testing (target sub-500ms preview)
5. Cross-platform testing (SQL Server + PostgreSQL)
6. If Promise.all doesn't hit benchmarks, evaluate streaming

---

## 14. Testing Strategy

### Unit Tests

| Package | Key Tests |
|---------|-----------|
| `@memberjunction/search-engine` | SearchFusion (RRF correctness), each provider (mock vector/FTS responses), SearchEngine.Search() and PreviewSearch() integration |
| `GraphQLSearchClient` | Correct GQL mutation construction, parameter serialization, response parsing |
| `ng-search` components | SearchInputComponent (debounce, events), SearchSuggestComponent (keyboard nav, highlighting), SearchCompositeComponent (preview flow) |
| `InstanceConfigEngine` | Get/Set/GetBoolean/GetJSON, default values, cache refresh |
| CodeGen | FTS auto-config LLM prompt validation, predicate assignment logic |

### Integration Tests

1. **Full search pipeline:** Query -> SearchEngine -> Vector + FTS + Entity -> RRF -> Results
2. **Preview search pipeline:** Query -> SearchEngine.PreviewSearch -> Fast path -> Minimal results
3. **Shell search flow:** Type in search bar -> Preview dropdown appears -> Click result -> Navigate to record
4. **Cross-platform FTS:** Same queries on SQL Server and PostgreSQL produce comparable results
5. **Instance config:** Set `Shell.SearchBar.Enabled = false` -> Verify search bar hidden

### Browser Tests (Playwright CLI)

1. Open MJ Explorer, verify search bar visible in shell header
2. Type query, verify preview dropdown appears within 500ms
3. Arrow-key through suggestions, verify highlighting
4. Press Enter, verify SearchResultsResource tab opens
5. Toggle view modes (list/cards/grid), verify display changes
6. Apply filters, verify results update
7. Ctrl+K shortcut focuses search bar from anywhere

---

## 15. Resolved Design Decisions

All open questions have been resolved through design review:

1. **Storage search scope — RESOLVED: Per-account opt-in.** A new `IncludeInGlobalSearch` bit on `FileStorageAccount` controls which storage accounts participate in universal search. This is more granular than an instance-level toggle — an org might want their "Marketing Dropbox" searchable but not their "IT Backups S3." The `StorageSearchProvider` queries only accounts where `IncludeInGlobalSearch = true` AND the provider's `SupportsSearch = true` (which excludes S3, Azure Blob, GCS that lack native search). Users can still search within a specific storage provider directly through the Storage UI regardless of this setting.

2. **Search results: Resource tab — RESOLVED.** "Search Results" is a `BaseResourceComponent` opened as a tab in whatever app the user is in. Not a standalone Application. The Knowledge Hub search dashboard becomes either (a) a differentiated "power search" experience with agent integration, saved searches, and tag cloud that goes beyond the universal search, or (b) consolidated into the universal search results page if there's no meaningful differentiation. Decision on KH dashboard fate deferred to Phase 3 — build the universal search first, then evaluate overlap.

3. **Search history persistence — RESOLVED: Firm requirement.** Via `UserInfoEngine.SetSettingDebounced()`. Cross-client, cross-device.

4. **FTS index maintenance — RESOLVED: Automatic.** CodeGen emits `CHANGE_TRACKING AUTO` (SQL Server) by default. PostgreSQL GIN indexes update automatically on INSERT/UPDATE. No DBA intervention needed.

5. **Graceful degradation — RESOLVED: Required.** Shell search works with whatever infrastructure exists:
   - Vector + FTS + Entity LIKE (full stack)
   - FTS + Entity LIKE (no vector DB configured)
   - Entity LIKE only (no FTS indexes)
   - This is critical — many orgs set up DB first, add vector/FTS later.

6. **Search Action — RESOLVED: Phase 1, ship with search-engine.** Create a `SearchKnowledge` Action (registered via `@RegisterClass(BaseAction, "Search Knowledge")`) that wraps `SearchEngine.Instance.Search()`. This is automatically exposed via MCP and A2A connectors, making search available to any external agent or tool. Give this Action to Sage and other MJ agents as a tool — this is essentially RAG (Retrieval-Augmented Generation) where agents can search the org's full knowledge base and incorporate results into their responses. Params: `Query` (string), `MaxResults` (number), `MinScore` (number), `IncludeSources` (string). Returns: `Results` (JSON), `TotalCount`, `ElapsedMs`.

7. **Streaming vs. batched — RESOLVED: Promise.all for now.** Parallel execution with `Promise.all()` targeting sub-500ms preview. If benchmarks aren't met, evaluate GraphQL subscriptions for streaming in Phase 4.

---

## Appendix A: File Reference

### Files to Create

| File | Package | Purpose |
|------|---------|---------|
| `packages/AI/Knowledge/SearchEngine/src/generic/SearchEngine.ts` | `@memberjunction/search-engine` | Core search orchestrator |
| `packages/AI/Knowledge/SearchEngine/src/generic/SearchFusion.ts` | `@memberjunction/search-engine` | RRF algorithm |
| `packages/AI/Knowledge/SearchEngine/src/generic/SearchEnricher.ts` | `@memberjunction/search-engine` | Result enrichment |
| `packages/AI/Knowledge/SearchEngine/src/generic/EntitySearchProvider.ts` | `@memberjunction/search-engine` | LIKE-based entity search |
| `packages/AI/Knowledge/SearchEngine/src/generic/StorageSearchProvider.ts` | `@memberjunction/search-engine` | File search integration |
| `packages/AI/Knowledge/SearchEngine/src/generic/search.types.ts` | `@memberjunction/search-engine` | Shared types |
| `packages/Actions/CoreActions/src/custom/search/search.action.ts` | `@memberjunction/core-actions` | Search Action for agents/MCP/A2A |
| `packages/GraphQLDataProvider/src/graphQLSearchClient.ts` | `@memberjunction/graphql-dataprovider` | Client SDK |
| `packages/Angular/Generic/search/src/lib/search-input.component.ts` | `@memberjunction/ng-search` | Standalone search input |
| `packages/Angular/Generic/search/src/lib/search-suggest.component.ts` | `@memberjunction/ng-search` | Autocomplete dropdown |
| `packages/Angular/Generic/search/src/lib/search-composite.component.ts` | `@memberjunction/ng-search` | Composite drop-in widget |
| `packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/search-results-resource-v2.component.ts` | Explorer | Enhanced search results page |
| `migrations/v5/VYYYYMMDD__v5.25.x__universal_search_infrastructure.sql` | Migrations | Single mega-migration (all schema changes) |
| `metadata/instance-configurations/.mj-sync.json` | Metadata sync | Instance config entity sync config |
| `metadata/instance-configurations/.instance-configurations.json` | Metadata sync | Seed data for feature toggles |

### Files to Modify

| File | Changes |
|------|---------|
| `packages/MJServer/src/resolvers/SearchKnowledgeResolver.ts` | Thin wrapper delegating to SearchEngine |
| `packages/Angular/Generic/search/src/lib/search.service.ts` | Use GraphQLSearchClient instead of inline GQL |
| `packages/Angular/Generic/search/src/lib/search-results.component.ts` | Add view modes, sort controls |
| `packages/Angular/Generic/search/src/lib/module.ts` | Declare new components |
| `packages/Angular/Generic/search/src/lib/public-api.ts` | Export new components |
| `packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.html` | Replace old search with mj-search-composite |
| `packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts` | Ctrl+K handler, new search event handlers |
| `packages/GraphQLDataProvider/src/index.ts` | Export GraphQLSearchClient |
| `packages/CodeGenLib/src/Misc/advanced_generation.ts` | Add FTS auto-config LLM method |
| `packages/CodeGenLib/src/Database/manage-metadata.ts` | Apply FTS and predicate LLM results |

### Existing Files for Reference (Patterns to Follow)

| File | Pattern |
|------|---------|
| `packages/GraphQLDataProvider/src/graphQLAIClient.ts` | GraphQL client SDK pattern |
| `packages/AI/AgentsClient/src/generic/AgentClientSession.ts` | Framework-agnostic client SDK |
| `packages/Angular/Generic/agent-client/src/lib/agent-client.service.ts` | Angular thin wrapper over SDK |
| `packages/AI/Knowledge/Search/src/generic/VectorSearchProvider.ts` | Search provider pattern |
| `packages/AI/Knowledge/Search/src/generic/FullTextSearchProvider.ts` | FTS provider pattern |
| `packages/CodeGenLib/src/Misc/advanced_generation.ts` | LLM integration in CodeGen |
