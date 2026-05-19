# Knowledge Hub Implementation Plan

> **Working document** -- checkboxes track progress. Update as work proceeds.

---

## Progress Summary

| Sub-Phase | Description | Status |
|-----------|-------------|--------|
| 1.0  | UX Mockups (HTML prototypes) | Skipped (UX) |
| 1.1  | Knowledge Hub App Shell | Done (metadata + search/config/vectors/dupes/autotagging tabs) |
| 1.2  | Shared Index Architecture | Partial (types + filter, no migration) |
| 1.3  | Knowledge Pipeline | Done |
| 1.4  | Unified Search API | Done |
| 1.5  | Full-Text Index Management | Not Started |
| 1.6  | MJ Agent Client SDK | Done |
| 1.7  | Angular Agent Client Adapter | Done |
| 1.8  | mj-chat Modernization | Done (typing indicator, code blocks, mobile-first, animations) |
| 1.9  | mj-chat-agents-overlay | Done (floating bubble, expand/collapse, auto-hide on conversations route) |
| 1.10 | Conversation Continuity | Done (ConversationBridgeService with shared state + deep links) |
| 1.11 | Knowledge Agent | Partial (metadata + prompt, no server impl) |
| 1.12 | Knowledge Hub Search UX | Done (ng-search overlay + Knowledge Search dashboard) |
| 1.13 | MJ Explorer Global Search Enhancement | Done (Cmd+K palette extended with Knowledge Hub search) |
| 1.14 | Advanced Features (document only) | Not Started |
| --   | ng-search widget (reusable) | Done (SearchOverlay, SearchResults, SearchFilter components) |
| --   | Record Merge Panel | Done (side-by-side field comparison, field-by-field selection) |
| --   | Configuration Dashboard | Done (Pipeline, VectorDB, FTS, Embedding, Thresholds sections) |
| --   | Search Results Detail View | Done (full page + side panel, score breakdown viz) |
| --   | Vector Management Enhancements | Done (index/operations view toggle, EmbeddedMode) |
| --   | Duplicate Detection Enhancements | Done (entity filter, table/kanban toggle, paging, merge panel) |
| --   | Unit Tests | Done (57 tests across 8 test files, all passing) |

---

## Architecture Decisions

### AD-1: Default ONE Shared Vector Index with Metadata Filtering

All vectorized content (entity records, content items, file attachments, autotagged content) is stored in a **single vector index** per deployment. Each vector carries rich metadata fields that enable filtered retrieval:

- `EntityName` -- the MJ entity the vector came from (e.g., `"Contacts"`, `"Content Items"`)
- `SourceType` -- origin classification: `"entity"`, `"content-item"`, `"file"`, `"web-page"`
- `ContentType` -- MIME-like category: `"text/plain"`, `"text/html"`, `"application/pdf"`, etc.
- `Tags` -- string array of human-readable tags produced by autotagging pipeline
- `RecordID` -- composite key serialized string pointing back to the source record
- `EntityDocumentID` -- the Entity Document template used for vectorization
- `ChunkIndex` -- integer for multi-chunk documents

The existing `EntityVectorSyncer` (`packages/AI/Vectors/Sync/src/models/entityVectorSync.ts`) and `DuplicateRecordDetector` (`packages/AI/Vectors/Dupe/src/duplicateRecordDetector.ts`) currently create per-EntityDocument indexes. The migration path is to add a `UseSharedIndex` flag on `MJVectorIndexEntity` and update the syncer to route upserts to the shared index with enriched metadata.

### AD-2: Tags for Humans, Embeddings for AI -- Pipeline Produces Both

The autotagging pipeline (`AutotagBaseEngine` in `packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts`) produces human-readable tags stored in `MJ: Content Item Tags`. The vectorization pipeline produces embeddings for AI retrieval. The **Knowledge Pipeline** (1.3) unifies these into a single orchestrated flow: ingest -> extract text -> autotag -> vectorize. Both outputs are produced in one pass, eliminating redundant processing.

### AD-3: Unified Search = Vector + Full-Text + RRF Fusion

Search queries execute three retrieval paths in parallel:
1. **Vector similarity** -- embed the query, search the shared index (via `VectorDBBase.queryIndex`)
2. **Full-text search** -- SQL Server `CONTAINS`/`FREETEXT` or PostgreSQL `to_tsvector/ts_rank`
3. **Entity metadata** -- existing MJ `RunView` with `ExtraFilter`

Results are fused using the existing `ComputeRRF` function (`packages/AI/Vectors/Dupe/src/scoring/ReciprocalRankFusion.ts`) which is already production-tested in duplicate detection. The RRF implementation is score-scale independent, making it ideal for combining heterogeneous sources.

### AD-4: MJ Agent Client SDK in `packages/AI/AgentsClient/`

A framework-agnostic TypeScript package that any UI framework can consume. Core responsibilities:
- `AgentClientSession` -- manages a WebSocket/SSE connection to the agent server
- `ClientToolRegistry` -- registers client-side tool implementations that the server can invoke
- Transport abstraction (WebSocket, SSE, polling) behind a `TransportAdapter` interface

### AD-5: Angular Adapter in `packages/Angular/Generic/agent-client/`

An Angular wrapper around the SDK providing:
- `AgentClientService` (injectable) -- lifecycle-managed session
- Navigation tools, component-opening tools pre-registered
- RxJS observable bridges for agent state

### AD-6: Floating Chat -- `mj-chat-agents-overlay` Wraps `mj-chat`, Persists Across Navigation

A floating widget component that:
- Renders in the MJExplorer shell (above the router outlet)
- Contains an instance of the modernized `mj-chat` component
- Stays alive across route changes (not destroyed/recreated)
- Can be minimized, expanded, or popped to full-screen

### AD-7: Conversation Continuity -- Overlay <-> Full Workspace via Shared Data Service

A shared Angular service (`ConversationBridgeService`) holds:
- Active conversation ID
- Message history reference
- Agent session reference

When the user clicks "Open in full workspace" from the overlay, the full Conversations UI picks up the same conversation seamlessly. When navigating away from full Conversations UI, the overlay can resume.

### AD-8: Knowledge Agent = Sage Sub-Agent with Server + Client Tools

The Knowledge Agent is implemented as a `BaseAgent` subclass (`KnowledgeAgent`) registered in the MJ agent framework. It is configured as a sub-agent of the Sage orchestrator agent. It has:
- **Server tools**: create entity documents, trigger vectorization, execute unified search, run duplicate detection
- **Client tools**: navigate to entity records, open Knowledge Hub panels, apply search filters in the UI

### AD-9: Client Tools -- Server Invokes Client Functions via PubSub, Async with Timeout (30s)

When the agent needs to invoke a client-side tool (e.g., "navigate to record X"), the server publishes a `ClientToolRequest` event via `PubSubManager` (`packages/MJServer/src/generic/PubSubManager.ts`). The client's `AgentClientSession` receives it over the transport, executes the registered tool, and sends the result back. Server-side waits with a 30-second timeout before treating as a timeout failure.

### AD-10: Overlay Always Available Except in Full Conversations UI, Default Agent Sage but Configurable

The overlay widget:
- Is visible on all MJExplorer routes **except** when the user is in the full Conversations workspace (to avoid dual chat UIs)
- Defaults to the "Sage" agent but allows switching to any available agent
- Persists the selected agent in user preferences via `UserInfoEngine`

### AD-11: Entity Document Templates Use Natural Language Sentences

Instead of the current Nunjucks template syntax (e.g., `{{FirstName}} {{LastName}} works at {{Company}}`), Entity Document templates use natural language: `"The contact's full name is {{FirstName}} {{LastName}}, and they work at {{Company}}."` This produces better embeddings because the surrounding context helps the embedding model understand field semantics. The `EntityDocumentSuggester` (`packages/AI/Vectors/Sync/src/models/EntityDocumentSuggester.ts`) AI prompt is updated to generate natural language templates.

### AD-12: Full-Text Index Management in Knowledge Hub Config

The Configuration tab in Knowledge Hub provides a UI for managing SQL Server full-text catalogs/indexes and PostgreSQL `tsvector` columns. This enables admins to select which entities and fields participate in full-text search, complementing the vector index.

---

## Packages

### New Packages

| Package | Path | Description |
|---------|------|-------------|
| `@memberjunction/ai-knowledge-search` | `packages/AI/Knowledge/Search/` | Unified search service: vector + FTS + RRF fusion. Server-side. |
| `@memberjunction/ai-knowledge-pipeline` | `packages/AI/Knowledge/Pipeline/` | Unified ingest/autotag/vectorize pipeline orchestrator. Server-side. |
| `@memberjunction/ai-agent-client` | `packages/AI/AgentsClient/` | Framework-agnostic Agent Client SDK (transport, tool registry). |
| `@memberjunction/ng-agent-client` | `packages/Angular/Generic/agent-client/` | Angular adapter for Agent Client SDK. |
| `@memberjunction/ng-chat-overlay` | `packages/Angular/Generic/chat-overlay/` | Floating chat overlay component. |

### Modified Packages

| Package | Path | Changes |
|---------|------|---------|
| `@memberjunction/ai-vectors` | `packages/AI/Vectors/Core/` | Add shared-index metadata types, `VectorMetadataFilter` |
| `@memberjunction/ai-vectordb` | `packages/AI/Vectors/Database/` | Extend `VectorDBBase` with metadata filter support in `queryIndex` |
| `@memberjunction/ai-vector-sync` | `packages/AI/Vectors/Sync/` | Update `EntityVectorSyncer` to support shared index, natural language templates |
| `@memberjunction/ai-vector-dupe` | `packages/AI/Vectors/Dupe/` | Update to use shared index with metadata filtering |
| `@memberjunction/content-autotagging` | `packages/ContentAutotagging/` | Integrate with Knowledge Pipeline for unified processing |
| `@memberjunction/ai-agents` | `packages/AI/Agents/` | Add client-tool invocation protocol, `ClientToolRequest`/`ClientToolResponse` types |
| `@memberjunction/ng-chat` | `packages/Angular/Generic/chat/` | Modernize UX: animations, tool viz, mobile-first, streaming support |
| `@memberjunction/ng-conversations` | `packages/Angular/Generic/conversations/` | Add `ConversationBridgeService` for overlay <-> workspace handoff |
| `@memberjunction/ng-explorer-core` | `packages/Angular/Explorer/explorer-core/` | Extend `CommandPaletteService` with vector+FTS search results |
| `@memberjunction/ng-explorer-dashboards` | `packages/Angular/Explorer/dashboards/` | Add Knowledge Hub app shell, merge vector/dupe/autotag resources |
| `@memberjunction/mjserver` | `packages/MJServer/` | Add unified search GraphQL resolver, client-tool PubSub protocol |
| `@memberjunction/graphql-dataprovider` | `packages/GraphQLDataProvider/` | Add `GraphQLKnowledgeSearchClient` for client-side search API |

---

## Sub-Phases

### 1.0 UX Mockups (Phase 0 -- HTML Prototypes, 3 Options Each)

Static HTML/CSS prototypes for stakeholder review before any Angular code is written. Three design variants per screen.

#### 1.0.1 Knowledge Hub Shell Mockup

- [ ] **1.0.1a** Create `plans/knowledge-hub/mockups/shell-option-a.html` -- search-first layout with prominent search bar, icon-based tab strip below
- [ ] **1.0.1b** Create `plans/knowledge-hub/mockups/shell-option-b.html` -- sidebar navigation with search pinned at top
- [ ] **1.0.1c** Create `plans/knowledge-hub/mockups/shell-option-c.html` -- card-based dashboard with search overlay (Cmd+K style)
- **Dependencies**: None
- **Testing**: Visual review in browser

#### 1.0.2 Search Results Mockup

- [ ] **1.0.2a** Create `plans/knowledge-hub/mockups/search-results-option-a.html` -- grouped by source type with faceted sidebar
- [ ] **1.0.2b** Create `plans/knowledge-hub/mockups/search-results-option-b.html` -- unified ranked list with inline type badges
- [ ] **1.0.2c** Create `plans/knowledge-hub/mockups/search-results-option-c.html` -- split view: list on left, preview on right
- **Dependencies**: None
- **Testing**: Visual review in browser

#### 1.0.3 Floating Chat Overlay Mockup

- [ ] **1.0.3a** Create `plans/knowledge-hub/mockups/chat-overlay-option-a.html` -- bottom-right floating bubble, expands to panel
- [ ] **1.0.3b** Create `plans/knowledge-hub/mockups/chat-overlay-option-b.html` -- right-side slide-in drawer
- [ ] **1.0.3c** Create `plans/knowledge-hub/mockups/chat-overlay-option-c.html` -- top-bar integrated chat, drops down
- **Dependencies**: None
- **Testing**: Visual review in browser

#### 1.0.4 Configuration Panel Mockup

- [ ] **1.0.4a** Create `plans/knowledge-hub/mockups/config-option-a.html` -- tabbed settings (Pipeline, Indexes, Full-Text, Agent)
- [ ] **1.0.4b** Create `plans/knowledge-hub/mockups/config-option-b.html` -- single scrollable page with collapsible sections
- [ ] **1.0.4c** Create `plans/knowledge-hub/mockups/config-option-c.html` -- wizard-style step-by-step configuration
- **Dependencies**: None
- **Testing**: Visual review in browser

---

### 1.1 Knowledge Hub App Shell

Merge the existing Vectors, Duplicates, and Autotagging resource components into a single unified application with a search-first default tab.

#### 1.1.1 Application Metadata

- [x] **1.1.1a** Create `metadata/applications/.knowledge-hub-application.json` with Application entity record:
  - `Name`: "Knowledge Hub"
  - `Description`: "Unified knowledge management: semantic search, vector management, duplicate detection, content autotagging, and AI assistant"
  - `DefaultForNewUser`: false
  - `DefaultNavItems`: array with tabs for Search, Vectors, Duplicates, Autotagging, Configuration
  - Each nav item uses `ResourceType: "Custom"` and a `DriverClass` pointing to the resource component class name
- [ ] **1.1.1b** Push application metadata: `npx mj sync push --dir=metadata --include="applications"`
- **Dependencies**: None
- **Testing**: Verify app appears in MJExplorer app switcher after metadata push

#### 1.1.2 Knowledge Hub Shell Resource Component

- [ ] **1.1.2a** Create `packages/Angular/Explorer/dashboards/src/KnowledgeHub/` directory structure:
  ```
  KnowledgeHub/
    components/
      shell/
        knowledge-hub-shell-resource.component.ts
        knowledge-hub-shell-resource.component.html
        knowledge-hub-shell-resource.component.css
    index.ts
  ```
- [ ] **1.1.2b** Implement `KnowledgeHubShellResourceComponent extends BaseResourceComponent`:
  - `@RegisterClass(BaseResourceComponent, 'KnowledgeHubShellResource')`
  - Internal tab management: `ActiveTab: 'search' | 'vectors' | 'duplicates' | 'autotagging' | 'config'`
  - Default to `'search'` tab on load
  - Lazy-load tab content using `@defer` blocks
- [ ] **1.1.2c** Create `LoadKnowledgeHubShellResource()` tree-shaking prevention function
- [ ] **1.1.2d** Register in `packages/Angular/Explorer/dashboards/src/ai-dashboards.module.ts`:
  - Add to declarations and exports
  - Call loader in module init
- [ ] **1.1.2e** Export from `packages/Angular/Explorer/dashboards/src/KnowledgeHub/index.ts`
- [ ] **1.1.2f** Add export to `packages/Angular/Explorer/dashboards/src/public-api.ts`
- **Dependencies**: 1.1.1 (app metadata)
- **Testing**: Navigate to Knowledge Hub app, verify all five tabs render, default is Search

#### 1.1.3 Migrate Existing Resource Components as Embedded Tabs

- [ ] **1.1.3a** Refactor `VectorManagementResourceComponent` (`packages/Angular/Explorer/dashboards/src/AI/components/vectors/vector-management-resource.component.ts`) to also work as an embedded child (accept optional `@Input() EmbeddedMode: boolean = false` that hides the outer resource chrome)
- [ ] **1.1.3b** Refactor `DuplicateDetectionResourceComponent` (`packages/Angular/Explorer/dashboards/src/AI/components/duplicates/duplicate-detection-resource.component.ts`) similarly
- [ ] **1.1.3c** Refactor `AutotaggingPipelineResourceComponent` (`packages/Angular/Explorer/dashboards/src/AI/components/autotagging/autotagging-pipeline-resource.component.ts`) similarly
- [ ] **1.1.3d** Embed all three in Knowledge Hub shell template using `@if (ActiveTab === 'vectors')` etc.
- **Dependencies**: 1.1.2
- **Testing**: Each tab shows the correct embedded resource, standalone versions still work in AI Dashboard

#### 1.1.4 Search Tab Placeholder

- [ ] **1.1.4a** Create `KnowledgeHubSearchComponent` in `packages/Angular/Explorer/dashboards/src/KnowledgeHub/components/search/`:
  - Big centered search bar
  - Placeholder text: "Search across all your knowledge..."
  - "Ask the Knowledge Agent" suggestion link
  - Empty state with recent activity or popular entities
- [ ] **1.1.4b** Wire into shell as the default tab content
- **Dependencies**: 1.1.2
- **Testing**: Search tab displays, input accepts text (actual search wired in 1.12)

#### 1.1.5 Configuration Tab Placeholder

- [ ] **1.1.5a** Create `KnowledgeHubConfigComponent` in `packages/Angular/Explorer/dashboards/src/KnowledgeHub/components/config/`:
  - Sections: Pipeline Settings, Shared Index Settings, Full-Text Index Settings, Agent Settings
  - Read-only display of current configuration initially
- [ ] **1.1.5b** Wire into shell as the Configuration tab content
- **Dependencies**: 1.1.2
- **Testing**: Configuration tab displays sections

---

### 1.2 Shared Index Architecture

Migrate from per-EntityDocument vector indexes to a single shared index with metadata filtering.

#### 1.2.1 Shared Index Metadata Types

- [x] **1.2.1a** Create `packages/AI/Vectors/Core/src/generic/SharedIndexMetadata.ts`:
  ```typescript
  export interface SharedVectorMetadata {
      EntityName: string;
      SourceType: 'entity' | 'content-item' | 'file' | 'web-page';
      ContentType: string;  // MIME-like
      Tags: string[];
      RecordID: string;
      EntityDocumentID: string;
      ChunkIndex: number;
      IndexedAt: string;  // ISO date
  }

  export interface SharedIndexFilterOptions {
      EntityNames?: string[];
      SourceTypes?: SharedVectorMetadata['SourceType'][];
      ContentTypes?: string[];
      Tags?: string[];
      EntityDocumentIDs?: string[];
  }
  ```
- [x] **1.2.1b** Export from `packages/AI/Vectors/Core/src/index.ts`
- **Dependencies**: None
- **Testing**: Unit test: type instantiation and validation

#### 1.2.2 Extend VectorDBBase for Metadata Filtering

- [x] **1.2.2a** Add `MetadataFilteredQuery` method to `VectorDBBase` (`packages/AI/Vectors/Database/src/generic/VectorDBBase.ts`):
  ```typescript
  public MetadataFilteredQuery(
      params: QueryOptions & { metadataFilter: SharedIndexFilterOptions }
  ): BaseResponse | Promise<BaseResponse>
  ```
  Default implementation converts `SharedIndexFilterOptions` to the provider's native filter format and delegates to `queryIndex`.
- [x] **1.2.2b** Add `BuildMetadataFilter(options: SharedIndexFilterOptions): object` abstract-optional method for providers to override
- [ ] **1.2.2c** Update `QueryParamsBase` in `packages/AI/Vectors/Database/src/generic/query.types.ts` to support structured `metadataFilter` alongside raw `filter`
- **Dependencies**: 1.2.1
- **Testing**: Unit test: metadata filter converts to expected format

#### 1.2.3 Database Migration -- Shared Index Configuration

- [ ] **1.2.3a** Create migration in `migrations/v5/` to add columns to `__mj.VectorIndex`:
  - `IsSharedIndex BIT NOT NULL DEFAULT 0`
  - `MetadataSchema NVARCHAR(MAX) NULL` -- JSON schema for the metadata fields stored in vectors
- [ ] **1.2.3b** Create migration to add a default shared index record:
  - `Name`: "MJ Shared Knowledge Index"
  - `IsSharedIndex`: 1
  - `Description`: "Default shared vector index for all Knowledge Hub content"
- **Dependencies**: None
- **Testing**: Migration runs cleanly, rollback verified

#### 1.2.4 Update EntityVectorSyncer for Shared Index

- [ ] **1.2.4a** Modify `EntityVectorSyncer.VectorizeEntity()` in `packages/AI/Vectors/Sync/src/models/entityVectorSync.ts`:
  - Check if the EntityDocument's VectorIndex is a shared index (`IsSharedIndex === true`)
  - If shared, enrich each `VectorRecord` metadata with `SharedVectorMetadata` fields
  - The `VectorRecord.id` format becomes `{EntityDocumentID}:{RecordID}:{ChunkIndex}` for dedup
- [ ] **1.2.4b** Update `GetOrCreateVectorIndex()` to prefer the shared index when `EntityDocument.UseSharedIndex` is true
- [ ] **1.2.4c** Add integration tests using the in-memory vector DB (`packages/AI/Vectors/Memory/src/models/SimpleVectorService.ts`)
- **Dependencies**: 1.2.1, 1.2.2, 1.2.3
- **Testing**: Integration test: vectorize entity, verify metadata fields present in index

#### 1.2.5 Update DuplicateRecordDetector for Shared Index

- [ ] **1.2.5a** Modify `DuplicateRecordDetector.executeVectorQuery()` in `packages/AI/Vectors/Dupe/src/duplicateRecordDetector.ts`:
  - When querying the shared index, add metadata filter for `EntityName` and `EntityDocumentID` to scope results
  - Prevents cross-entity false positives
- [ ] **1.2.5b** Update `ParseVectorMatches()` to handle enriched `SharedVectorMetadata`
- **Dependencies**: 1.2.1, 1.2.4
- **Testing**: Unit test: duplicate detection on shared index returns only same-entity matches

#### 1.2.6 Update Autotagging to Write to Shared Index

- [ ] **1.2.6a** Modify `AutotagBaseEngine` (`packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts`) to optionally vectorize content items into the shared index after tagging
- [ ] **1.2.6b** Populate `SharedVectorMetadata.Tags` with the tags produced by the autotagging LLM
- [ ] **1.2.6c** Set `SourceType` based on the content source type (website -> `'web-page'`, file -> `'file'`, etc.)
- **Dependencies**: 1.2.1, 1.2.4
- **Testing**: Integration test: autotag a content item, verify vector appears in shared index with tags

---

### 1.3 Knowledge Pipeline

Unified orchestration for ingest -> extract -> autotag -> vectorize, with progress tracking.

#### 1.3.1 Pipeline Orchestrator Package

- [x] **1.3.1a** Create package structure:
  ```
  packages/AI/Knowledge/Pipeline/
    src/
      generic/
        KnowledgePipeline.ts
        PipelineStage.ts
        PipelineProgress.ts
      index.ts
    package.json
    tsconfig.json
    vitest.config.ts
  ```
- [x] **1.3.1b** Implement `KnowledgePipeline` class:
  ```typescript
  export class KnowledgePipeline {
      public async ProcessEntity(params: PipelineEntityParams, contextUser: UserInfo): Promise<PipelineResult>
      public async ProcessContentSource(params: PipelineContentParams, contextUser: UserInfo): Promise<PipelineResult>
      public async ProcessSingleRecord(entityName: string, recordId: CompositeKey, contextUser: UserInfo): Promise<PipelineResult>
  }
  ```
  Stages: `'extract' | 'autotag' | 'vectorize' | 'index'`
- [x] **1.3.1c** Implement `PipelineProgress` event emitter for real-time progress tracking:
  ```typescript
  export interface PipelineProgressEvent {
      Stage: PipelineStage;
      TotalItems: number;
      ProcessedItems: number;
      CurrentItem?: string;
      ElapsedMs: number;
      EstimatedRemainingMs?: number;
  }
  ```
- **Dependencies**: 1.2.4, 1.2.6
- **Testing**: Unit tests with mocked vector DB and autotagging engine

#### 1.3.2 Natural Language Template Support

- [ ] **1.3.2a** Update `EntityDocumentSuggester.SuggestDocument()` (`packages/AI/Vectors/Sync/src/models/EntityDocumentSuggester.ts`) to generate natural language sentence templates instead of raw field concatenation
- [ ] **1.3.2b** Update the "Entity Document Suggestion" AI prompt in `metadata/prompts/` to instruct the LLM to produce natural language templates
- [ ] **1.3.2c** Add a `TemplateStyle` field to `MJEntityDocumentEntity` migration: `'natural-language' | 'structured' | 'custom'`
- [ ] **1.3.2d** Update `EntityDocumentTemplateParser` (`packages/AI/Vectors/Sync/src/generic/EntityDocumentTemplateParser.ts`) to handle natural language templates (no parser changes needed since Nunjucks already handles embedded `{{}}` in prose)
- **Dependencies**: 1.2.3
- **Testing**: Generate template for Contacts entity, verify output is a readable sentence

#### 1.3.3 Pipeline Progress GraphQL Subscription

- [ ] **1.3.3a** Add GraphQL subscription `knowledgePipelineProgress` in `packages/MJServer/src/generated/generated.ts` (or a new resolver file) using `PubSubManager`
- [ ] **1.3.3b** `KnowledgePipeline` publishes progress events via `PubSubManager.Publish('KNOWLEDGE_PIPELINE_PROGRESS', event)`
- [ ] **1.3.3c** Add `GraphQLKnowledgePipelineClient` to `packages/GraphQLDataProvider/` for client-side subscription
- **Dependencies**: 1.3.1
- **Testing**: Start pipeline, verify progress events arrive via subscription

---

### 1.4 Unified Search API

Server-side search service that combines vector search, full-text search, and entity metadata search with RRF fusion.

#### 1.4.1 Search Service Package

- [x] **1.4.1a** Create package structure:
  ```
  packages/AI/Knowledge/Search/
    src/
      generic/
        UnifiedSearchService.ts
        SearchTypes.ts
        FullTextSearchProvider.ts
        VectorSearchProvider.ts
        SearchFusion.ts
      index.ts
    package.json
    tsconfig.json
    vitest.config.ts
  ```
- [x] **1.4.1b** Define search types in `SearchTypes.ts`:
  ```typescript
  export interface UnifiedSearchRequest {
      Query: string;
      Filters?: SearchFilters;
      MaxResults?: number;
      IncludeSources?: ('vector' | 'fulltext' | 'entity')[];
      FusionMethod?: 'rrf' | 'weighted';
      ContextUser: UserInfo;
  }

  export interface SearchFilters {
      EntityNames?: string[];
      SourceTypes?: ('entity' | 'content-item' | 'file' | 'web-page')[];
      ContentTypes?: string[];
      Tags?: string[];
      DateRange?: { Start?: Date; End?: Date };
  }

  export interface UnifiedSearchResult {
      ID: string;
      EntityName: string;
      RecordID: string;
      SourceType: string;
      Title: string;
      Snippet: string;
      Score: number;
      ScoreBreakdown: { Vector?: number; FullText?: number; Entity?: number };
      Tags: string[];
      MatchedAt: Date;
  }

  export interface UnifiedSearchResponse {
      Success: boolean;
      Results: UnifiedSearchResult[];
      TotalCount: number;
      ElapsedMs: number;
      SourceCounts: { Vector: number; FullText: number; Entity: number };
  }
  ```
- **Dependencies**: None
- **Testing**: Type compilation

#### 1.4.2 Vector Search Provider

- [x] **1.4.2a** Implement `VectorSearchProvider` class:
  - Accepts query string, embeds it using configured embedding model
  - Queries shared vector index with optional metadata filters
  - Returns `ScoredCandidate[]` compatible with `ComputeRRF`
- [x] **1.4.2b** Reuse existing `VectorDBBase.MetadataFilteredQuery()` (from 1.2.2)
- **Dependencies**: 1.2.2, 1.4.1
- **Testing**: Unit test with mocked embedding + vector DB

#### 1.4.3 Full-Text Search Provider

- [x] **1.4.3a** Implement `FullTextSearchProvider` class:
  - SQL Server path: generates `SELECT ... WHERE CONTAINS(columns, @query)` or `FREETEXT(columns, @query)`
  - PostgreSQL path: generates `SELECT ... WHERE to_tsvector(columns) @@ plainto_tsquery(@query)` with `ts_rank`
  - Uses `RunView` with raw SQL filter for cross-database compatibility
- [ ] **1.4.3b** Add configuration for which entities/fields are full-text indexed (reads from `KnowledgeHubConfig` entity, see 1.5)
- **Dependencies**: 1.4.1, 1.5.1
- **Testing**: Unit test with mocked RunView returning FTS results

#### 1.4.4 Search Fusion (RRF)

- [x] **1.4.4a** Implement `SearchFusion` class that:
  - Takes ranked lists from vector, FTS, and entity providers
  - Maps results to `ScoredCandidate[]` format
  - Calls `ComputeRRF()` from `packages/AI/Vectors/Dupe/src/scoring/ReciprocalRankFusion.ts`
  - Enriches fused results with metadata (title, snippet, tags) from the source providers
- [ ] **1.4.4b** Optionally apply post-fusion reranking via `RerankerService` from `@memberjunction/ai-reranker`
- **Dependencies**: 1.4.2, 1.4.3
- **Testing**: Unit test: fusion of 3 lists produces expected ordering

#### 1.4.5 Unified Search Service

- [x] **1.4.5a** Implement `UnifiedSearchService` class that orchestrates:
  1. Parse query and filters
  2. Execute all enabled search providers in parallel (`Promise.all`)
  3. Fuse results
  4. Return `UnifiedSearchResponse`
- **Dependencies**: 1.4.2, 1.4.3, 1.4.4
- **Testing**: Integration test with in-memory providers

#### 1.4.6 GraphQL Search Resolver

- [ ] **1.4.6a** Add `unifiedSearch` query to GraphQL schema:
  ```graphql
  type Query {
      unifiedSearch(input: UnifiedSearchInput!): UnifiedSearchResponse!
  }
  ```
- [ ] **1.4.6b** Implement resolver in `packages/MJServer/` that calls `UnifiedSearchService`
- [ ] **1.4.6c** Add `GraphQLKnowledgeSearchClient` to `packages/GraphQLDataProvider/`:
  ```typescript
  export class GraphQLKnowledgeSearchClient {
      public async Search(request: UnifiedSearchRequest): Promise<UnifiedSearchResponse>
  }
  ```
- **Dependencies**: 1.4.5
- **Testing**: End-to-end: GraphQL query returns search results

---

### 1.5 Full-Text Index Management

UI and backend for managing SQL Server FTS catalogs/indexes and PostgreSQL tsvector configuration.

#### 1.5.1 Full-Text Index Configuration Entities

- [ ] **1.5.1a** Create migration in `migrations/v5/` for:
  - `__mj.KnowledgeHubFullTextIndex` table:
    - `ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID()`
    - `EntityID UNIQUEIDENTIFIER NOT NULL` (FK to Entity)
    - `FieldList NVARCHAR(MAX) NOT NULL` -- comma-separated field names
    - `IsActive BIT NOT NULL DEFAULT 1`
    - `DatabasePlatform NVARCHAR(50) NOT NULL` -- 'SQL Server' or 'PostgreSQL'
    - `CatalogName NVARCHAR(255) NULL` -- SQL Server FTS catalog name
    - `Language NVARCHAR(100) NOT NULL DEFAULT 'English'`
- [ ] **1.5.1b** Run CodeGen to generate entity classes
- [ ] **1.5.1c** Create metadata seed file `metadata/knowledge-hub-fts/`
- **Dependencies**: None
- **Testing**: Migration runs, entity accessible via RunView

#### 1.5.2 Full-Text Index Admin Service (Server)

- [ ] **1.5.2a** Create `FullTextIndexAdminService` in `packages/AI/Knowledge/Search/src/generic/`:
  - `CreateFullTextIndex(entityName: string, fields: string[], contextUser: UserInfo): Promise<boolean>`
  - `DropFullTextIndex(entityName: string, contextUser: UserInfo): Promise<boolean>`
  - `RebuildFullTextIndex(entityName: string, contextUser: UserInfo): Promise<boolean>`
  - `GetFullTextIndexStatus(entityName: string, contextUser: UserInfo): Promise<FTSIndexStatus>`
- [ ] **1.5.2b** SQL Server implementation: generates `CREATE FULLTEXT CATALOG`, `CREATE FULLTEXT INDEX`
- [ ] **1.5.2c** PostgreSQL implementation: generates `ALTER TABLE ... ADD COLUMN search_vector tsvector`, creates GIN index and trigger
- **Dependencies**: 1.5.1
- **Testing**: Integration test against dev database

#### 1.5.3 Full-Text Index Configuration UI

- [ ] **1.5.3a** Create `FullTextConfigComponent` in `packages/Angular/Explorer/dashboards/src/KnowledgeHub/components/config/fts/`:
  - List of entities with FTS indexes (grid)
  - Add/Edit dialog: pick entity, select fields, choose language
  - Status indicators (active, rebuilding, error)
  - Rebuild button per entity
- [ ] **1.5.3b** Wire into the Configuration tab of Knowledge Hub shell
- **Dependencies**: 1.5.1, 1.5.2, 1.1.5
- **Testing**: Create FTS index from UI, verify it appears in SQL Server/PostgreSQL

---

### 1.6 MJ Agent Client SDK

Framework-agnostic TypeScript package for connecting to MJ agents from any client.

#### 1.6.1 Package Scaffold

- [x] **1.6.1a** Create package structure:
  ```
  packages/AI/AgentsClient/
    src/
      generic/
        AgentClientSession.ts
        ClientToolRegistry.ts
        TransportAdapter.ts
        WebSocketTransport.ts
        SSETransport.ts
        AgentClientTypes.ts
      index.ts
    package.json   (name: @memberjunction/ai-agent-client)
    tsconfig.json
    vitest.config.ts
  ```
- [x] **1.6.1b** Add to root `package.json` workspaces array
- [x] **1.6.1c** Run `npm install` at repo root
- **Dependencies**: None
- **Testing**: Package compiles

#### 1.6.2 Transport Abstraction

- [x] **1.6.2a** Define `TransportAdapter` interface in `TransportAdapter.ts`:
  ```typescript
  export interface TransportAdapter {
      Connect(url: string, options?: TransportOptions): Promise<void>;
      Disconnect(): Promise<void>;
      Send(message: ClientMessage): Promise<void>;
      OnMessage(handler: (message: ServerMessage) => void): void;
      OnError(handler: (error: Error) => void): void;
      OnDisconnect(handler: () => void): void;
      get IsConnected(): boolean;
  }
  ```
- [x] **1.6.2b** Implement `WebSocketTransport` -- wraps native WebSocket
- [ ] **1.6.2c** Implement `SSETransport` -- uses EventSource for server->client, fetch POST for client->server
- **Dependencies**: 1.6.1
- **Testing**: Unit tests with mock WebSocket

#### 1.6.3 Client Tool Registry

- [x] **1.6.3a** Implement `ClientToolRegistry` in `ClientToolRegistry.ts`:
  ```typescript
  export type ClientToolHandler = (params: Record<string, unknown>) => Promise<ClientToolResult>;

  export interface ClientToolDefinition {
      Name: string;
      Description: string;
      ParameterSchema: Record<string, unknown>;  // JSON Schema
      Handler: ClientToolHandler;
  }

  export class ClientToolRegistry {
      public Register(tool: ClientToolDefinition): void;
      public Unregister(toolName: string): void;
      public GetTool(name: string): ClientToolDefinition | undefined;
      public GetAllTools(): ClientToolDefinition[];
      public async Execute(name: string, params: Record<string, unknown>): Promise<ClientToolResult>;
  }
  ```
- [x] **1.6.3b** Add timeout wrapper (30s default) around tool execution
- **Dependencies**: 1.6.1
- **Testing**: Unit tests: register tool, execute, timeout

#### 1.6.4 Agent Client Session

- [x] **1.6.4a** Implement `AgentClientSession` in `AgentClientSession.ts`:
  ```typescript
  export class AgentClientSession {
      constructor(transport: TransportAdapter, toolRegistry: ClientToolRegistry);

      public async Connect(agentId: string, conversationId?: string): Promise<void>;
      public async SendMessage(content: string, attachments?: Attachment[]): Promise<void>;
      public async Disconnect(): Promise<void>;

      // Event handlers
      public OnAgentMessage(handler: (msg: AgentMessage) => void): void;
      public OnToolRequest(handler: (req: ClientToolRequest) => void): void;
      public OnProgress(handler: (progress: AgentProgress) => void): void;
      public OnError(handler: (error: AgentError) => void): void;

      public get AgentId(): string;
      public get ConversationId(): string | null;
      public get IsConnected(): boolean;
  }
  ```
- [x] **1.6.4b** Handle `ClientToolRequest` flow:
  1. Server sends `ClientToolRequest` with `toolName` and `params`
  2. Session looks up tool in registry
  3. Executes tool handler
  4. Sends `ClientToolResponse` back with result
- [x] **1.6.4c** Handle conversation ID assignment (server may assign on first message)
- **Dependencies**: 1.6.2, 1.6.3
- **Testing**: Integration test with mock transport: send message, receive response, handle tool request

#### 1.6.5 Server-Side Client Tool Protocol

- [ ] **1.6.5a** Add types to `packages/AI/Agents/src/` (or `packages/AI/CorePlus/src/`):
  ```typescript
  export interface ClientToolRequest {
      RequestID: string;
      ToolName: string;
      Params: Record<string, unknown>;
      TimeoutMs: number;
  }

  export interface ClientToolResponse {
      RequestID: string;
      Success: boolean;
      Result?: unknown;
      ErrorMessage?: string;
  }
  ```
- [ ] **1.6.5b** Add `ClientToolInvoker` to `BaseAgent` that publishes `ClientToolRequest` via `PubSubManager` and awaits `ClientToolResponse` with timeout
- [ ] **1.6.5c** Integrate with `AgentRunner` (`packages/AI/Agents/src/AgentRunner.ts`) to route client tool requests through the session transport
- **Dependencies**: 1.6.4
- **Testing**: Unit test: agent invokes client tool, receives result within timeout; test timeout behavior

---

### 1.7 Angular Agent Client Adapter

#### 1.7.1 Package Scaffold

- [x] **1.7.1a** Create package structure:
  ```
  packages/Angular/Generic/agent-client/
    src/
      lib/
        agent-client.service.ts
        agent-client.module.ts
        tools/
          navigation-tool.ts
          component-tool.ts
      public-api.ts
    ng-package.json
    package.json   (name: @memberjunction/ng-agent-client)
    tsconfig.lib.json
  ```
- [x] **1.7.1b** Add to root workspaces, run `npm install`
- **Dependencies**: 1.6.1
- **Testing**: Package compiles

#### 1.7.2 AgentClientService

- [x] **1.7.2a** Implement `AgentClientService` as injectable Angular service:
  ```typescript
  @Injectable({ providedIn: 'root' })
  export class AgentClientService {
      private session: AgentClientSession | null = null;
      private toolRegistry = new ClientToolRegistry();

      public AgentMessages$ = new BehaviorSubject<AgentMessage[]>([]);
      public IsConnected$ = new BehaviorSubject<boolean>(false);
      public Progress$ = new Subject<AgentProgress>();

      public async ConnectToAgent(agentId: string, conversationId?: string): Promise<void>;
      public async SendMessage(content: string): Promise<void>;
      public async Disconnect(): Promise<void>;
      public RegisterTool(tool: ClientToolDefinition): void;
  }
  ```
- [x] **1.7.2b** Auto-register built-in navigation and component tools (see 1.7.3)
- [ ] **1.7.2c** Connect transport to GraphQL WebSocket endpoint
- **Dependencies**: 1.7.1, 1.6.4
- **Testing**: Unit test with mock transport

#### 1.7.3 Built-in Client Tools

- [x] **1.7.3a** Implement `NavigationTool` in `tools/navigation-tool.ts`:
  - `navigate_to_record` -- opens entity record in MJExplorer
  - `navigate_to_app` -- switches to a different MJExplorer application
  - `navigate_to_tab` -- switches tab within current app
  - Uses Angular `Router` injected from the service
- [x] **1.7.3b** Implement `ComponentTool` in `tools/component-tool.ts`:
  - `open_search_panel` -- opens/focuses search in Knowledge Hub
  - `apply_search_filter` -- applies filter to current search results
  - `show_entity_details` -- opens entity record details panel
- **Dependencies**: 1.7.2
- **Testing**: Unit test: tool handler invoked with correct params

---

### 1.8 mj-chat Modernization

Upgrade the existing `ChatComponent` (`packages/Angular/Generic/chat/src/lib/chat/chat.component.ts`) to a modern, mobile-first UX.

#### 1.8.1 Streaming Message Support

- [ ] **1.8.1a** Add `StreamingMessage` concept to `ChatMessage` class:
  - `IsStreaming: boolean` flag
  - `StreamChunks: string[]` for incremental rendering
- [ ] **1.8.1b** Update template to render streaming messages with typing animation
- [ ] **1.8.1c** Add `@Input() StreamingEnabled: boolean = false` to opt-in
- **Dependencies**: None
- **Testing**: Visual test: message appears character-by-character

#### 1.8.2 Tool Execution Visualization

- [ ] **1.8.2a** Add `ToolExecution` interface:
  ```typescript
  export interface ToolExecution {
      ToolName: string;
      Status: 'pending' | 'running' | 'complete' | 'error';
      StartedAt: Date;
      CompletedAt?: Date;
      Result?: string;
  }
  ```
- [ ] **1.8.2b** Create `ChatToolStatusComponent` that renders tool executions inline in the message list (collapsible, shows tool name and status icon)
- [ ] **1.8.2c** Add `@Input() ToolExecutions: ToolExecution[] = []` to `ChatComponent`
- **Dependencies**: None
- **Testing**: Visual test: tool status badges appear in conversation

#### 1.8.3 Mobile-First Layout

- [ ] **1.8.3a** Refactor chat CSS to use CSS container queries and flexbox
- [ ] **1.8.3b** Message bubbles: full-width on mobile, max-width on desktop
- [ ] **1.8.3c** Input area: sticky bottom, auto-grow textarea
- [ ] **1.8.3d** Use design tokens from `_tokens.scss` (no hardcoded colors)
- **Dependencies**: None
- **Testing**: Responsive test at 320px, 768px, 1024px widths

#### 1.8.4 Animations

- [ ] **1.8.4a** Add Angular `@angular/animations` for message enter/exit transitions
- [ ] **1.8.4b** Smooth scroll to bottom on new messages
- [ ] **1.8.4c** Typing indicator animation (three-dot bounce)
- **Dependencies**: None
- **Testing**: Visual test: animations are smooth, no janky layout shifts

---

### 1.9 mj-chat-agents-overlay

Floating chat widget that persists across navigation.

#### 1.9.1 Package Scaffold

- [ ] **1.9.1a** Create package structure:
  ```
  packages/Angular/Generic/chat-overlay/
    src/
      lib/
        chat-overlay.component.ts
        chat-overlay.component.html
        chat-overlay.component.css
        chat-overlay.module.ts
      public-api.ts
    ng-package.json
    package.json   (name: @memberjunction/ng-chat-overlay)
    tsconfig.lib.json
  ```
- [ ] **1.9.1b** Add to root workspaces, run `npm install`
- **Dependencies**: 1.8
- **Testing**: Package compiles

#### 1.9.2 Overlay Component

- [ ] **1.9.2a** Implement `ChatOverlayComponent`:
  - States: `'minimized'` (floating button), `'open'` (panel), `'maximized'` (full-height)
  - Contains `<mj-chat>` instance
  - Agent selector dropdown (defaults to Sage)
  - Conversation list/switcher
  - "Open in full workspace" button
  - CSS: `position: fixed; bottom: 20px; right: 20px; z-index: 1000`
- [ ] **1.9.2b** Persist overlay state (open/minimized/maximized) in `localStorage`
- [ ] **1.9.2c** Integrate with `AgentClientService` for agent communication
- [ ] **1.9.2d** Animate transitions between states using CSS transitions
- **Dependencies**: 1.7.2, 1.8, 1.9.1
- **Testing**: Visual test: click button -> panel opens, minimize, maximize, navigate to different route -> stays open

#### 1.9.3 Shell Integration

- [ ] **1.9.3a** Add `<mj-chat-overlay>` to MJExplorer shell template (`packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts`)
- [ ] **1.9.3b** Add visibility logic: hide overlay when current route is the full Conversations workspace
  - Listen to Router events, check if active resource is Conversations
  - Use `@if (!IsInConversationsWorkspace)` in template
- [ ] **1.9.3c** Import `ChatOverlayModule` in `ShellModule` (`packages/Angular/Explorer/explorer-core/src/lib/shell/shell.module.ts`)
- **Dependencies**: 1.9.2
- **Testing**: Navigate to Conversations -> overlay hidden. Navigate elsewhere -> overlay visible.

---

### 1.10 Conversation Continuity

Shared data service enabling seamless handoff between overlay and full workspace.

#### 1.10.1 ConversationBridgeService

- [ ] **1.10.1a** Create `ConversationBridgeService` in `packages/Angular/Generic/conversations/src/lib/services/`:
  ```typescript
  @Injectable({ providedIn: 'root' })
  export class ConversationBridgeService {
      private _activeConversationId$ = new BehaviorSubject<string | null>(null);
      private _activeAgentId$ = new BehaviorSubject<string | null>(null);
      private _handoffRequested$ = new Subject<HandoffRequest>();

      public ActiveConversationId$: Observable<string | null>;
      public ActiveAgentId$: Observable<string | null>;
      public HandoffRequested$: Observable<HandoffRequest>;

      public SetActiveConversation(conversationId: string, agentId: string): void;
      public RequestHandoff(target: 'overlay' | 'workspace', conversationId: string): void;
      public ClearActive(): void;
  }

  export interface HandoffRequest {
      Target: 'overlay' | 'workspace';
      ConversationId: string;
      AgentId?: string;
  }
  ```
- [ ] **1.10.1b** Export from `packages/Angular/Generic/conversations/src/public-api.ts`
- **Dependencies**: None
- **Testing**: Unit test: set conversation, request handoff, verify observable emissions

#### 1.10.2 Overlay Handoff Integration

- [ ] **1.10.2a** Update `ChatOverlayComponent` to:
  - Call `ConversationBridgeService.SetActiveConversation()` when a conversation is active
  - Listen to `HandoffRequested$` for incoming handoff from workspace
  - "Open in workspace" button calls `RequestHandoff('workspace', conversationId)` and navigates to Conversations app
- **Dependencies**: 1.10.1, 1.9.2
- **Testing**: Click "Open in workspace" -> navigates to Conversations with same conversation loaded

#### 1.10.3 Workspace Handoff Integration

- [ ] **1.10.3a** Update the Conversations resource component in `packages/Angular/Explorer/explorer-core/` to:
  - Listen to `HandoffRequested$` for incoming handoffs from overlay
  - Auto-select the handed-off conversation
  - "Continue in overlay" button calls `RequestHandoff('overlay', conversationId)`
- **Dependencies**: 1.10.1
- **Testing**: Hand off conversation from overlay to workspace and back

#### 1.10.4 Deep Links

- [ ] **1.10.4a** Add query parameter support: `?conversationId=xxx&agentId=yyy`
- [ ] **1.10.4b** `ChatOverlayComponent` checks URL params on init and auto-opens if present
- [ ] **1.10.4c** Update `CommandPaletteService` to allow opening overlay with a specific conversation
- **Dependencies**: 1.10.1, 1.9.3
- **Testing**: Navigate to URL with `?conversationId=xxx` -> overlay opens with that conversation

---

### 1.11 Knowledge Agent

BaseAgent subclass with server and client tools for knowledge management.

#### 1.11.1 Agent Entity Record

- [x] **1.11.1a** Create metadata file `metadata/agents/.knowledge-agent.json`:
  - Name: "Knowledge Agent"
  - Description: "AI assistant specialized in knowledge management: search, vectorization, duplicate detection, and content navigation"
  - Agent Type: reference to appropriate type (e.g., Sage sub-agent type)
  - IsActive: true
- [x] **1.11.1b** Create AI prompt metadata for the Knowledge Agent system prompt
- [ ] **1.11.1c** Push metadata: `npx mj sync push --dir=metadata --include="agents"`
- **Dependencies**: None
- **Testing**: Agent record appears in MJ: AI Agents entity

#### 1.11.2 KnowledgeAgent Server Implementation

- [ ] **1.11.2a** Create `packages/AI/Agents/src/agents/KnowledgeAgent.ts`:
  ```typescript
  @RegisterClass(BaseAgent, 'KnowledgeAgent')
  export class KnowledgeAgent extends BaseAgent {
      protected override async ExecuteAgent(params: ExecuteAgentParams): Promise<ExecuteAgentResult>
  }
  ```
- [ ] **1.11.2b** Register agent actions (server-side tools):
  - `create_entity_document` -- creates an Entity Document with AI-suggested template
  - `vectorize_entity` -- triggers vectorization for an entity via `KnowledgePipeline`
  - `search_knowledge` -- executes `UnifiedSearchService.Search()`
  - `detect_duplicates` -- runs `DuplicateRecordDetector.CheckSingleRecord()` or batch
  - `get_entity_stats` -- returns vectorization stats, record counts, index health
  - `get_content_sources` -- lists configured content sources and their status
- [ ] **1.11.2c** Register client-side tool declarations (tool definitions sent to client):
  - `navigate_to_record` -- navigate user's browser to a specific record
  - `open_knowledge_hub_tab` -- switch to a specific tab in Knowledge Hub
  - `apply_search_filter` -- apply filters to the Knowledge Hub search UI
  - `show_duplicate_review` -- open the duplicate review panel for a specific run
- **Dependencies**: 1.3.1, 1.4.5, 1.6.5, 1.11.1
- **Testing**: Unit test: mock agent execution, verify tool calls produce expected results

#### 1.11.3 Knowledge Agent Prompts

- [x] **1.11.3a** Create system prompt for Knowledge Agent in `metadata/prompts/`:
  - Persona: knowledgeable assistant specialized in data management
  - Available tools described with examples
  - Decision tree: when to search vs. when to vectorize vs. when to detect duplicates
  - Guidance on when to use client tools (navigate, filter) vs. server tools (search, vectorize)
- [ ] **1.11.3b** Create few-shot examples for common queries:
  - "Find all contacts related to Acme Corp" -> search_knowledge
  - "Set up duplicate detection for the Accounts entity" -> create_entity_document + detect_duplicates
  - "Show me the vectorization status" -> navigate to Vectors tab
- **Dependencies**: 1.11.1
- **Testing**: Prompt renders correctly with template engine

---

### 1.12 Knowledge Hub Search UX

The search-first default tab of Knowledge Hub.

#### 1.12.1 Search Bar Component

- [ ] **1.12.1a** Create `KnowledgeSearchBarComponent` in `packages/Angular/Explorer/dashboards/src/KnowledgeHub/components/search/`:
  - Large centered search input with icon
  - Debounced input (300ms) triggers search
  - Search-as-you-type with dropdown suggestions
  - Keyboard shortcuts: Enter to search, Escape to clear
  - Design tokens for all colors
- [ ] **1.12.1b** Add search history (last 10 queries, persisted via `UserInfoEngine`)
- **Dependencies**: 1.1.4
- **Testing**: Type query, verify debounced event fires

#### 1.12.2 Search Results Component

- [ ] **1.12.2a** Create `KnowledgeSearchResultsComponent`:
  - Grouped by source type (Entities, Content Items, Files, Web Pages)
  - Each result shows: title, snippet with highlighted matches, source badge, score, tags
  - Expandable preview panel on click
  - Pagination or infinite scroll
- [ ] **1.12.2b** Integrate with `GraphQLKnowledgeSearchClient` (from 1.4.6c)
- [ ] **1.12.2c** Loading state using `<mj-loading>`
- **Dependencies**: 1.4.6, 1.12.1
- **Testing**: Execute search, verify results grouped and displayed correctly

#### 1.12.3 Faceted Filters

- [ ] **1.12.3a** Create `KnowledgeSearchFiltersComponent`:
  - Entity type checkboxes
  - Source type checkboxes
  - Tag multi-select
  - Date range picker
  - Score threshold slider
- [ ] **1.12.3b** Filters update the `SearchFilters` and re-execute search
- [ ] **1.12.3c** Show active filter count badge on filter toggle button
- **Dependencies**: 1.12.2
- **Testing**: Apply filter, verify results update

#### 1.12.4 "Ask the Knowledge Agent" Integration

- [ ] **1.12.4a** Add "Ask the Knowledge Agent" suggestion card below search results:
  - Appears when: search returns few results, or query looks like a natural language question
  - Click opens the chat overlay with the Knowledge Agent pre-selected and the search query pre-filled
- [ ] **1.12.4b** Integrate with `ConversationBridgeService` and `ChatOverlayComponent`
- **Dependencies**: 1.9.2, 1.11.1, 1.12.2
- **Testing**: Click "Ask Agent" -> overlay opens with query, agent responds

---

### 1.13 MJ Explorer Global Search Enhancement

Enhance the existing command palette (`packages/Angular/Explorer/explorer-core/src/lib/command-palette/`) with Knowledge Hub search.

#### 1.13.1 Command Palette Search Integration

- [ ] **1.13.1a** Extend `CommandPaletteService` (`packages/Angular/Explorer/explorer-core/src/lib/command-palette/command-palette.service.ts`) to include a "Knowledge" search category
- [ ] **1.13.1b** Update `CommandPaletteComponent` (`packages/Angular/Explorer/explorer-core/src/lib/command-palette/command-palette.component.ts`) to:
  - Show a "Knowledge" section in results (after Apps, Entities, Records)
  - Display top 5 vector+FTS results from `GraphQLKnowledgeSearchClient`
  - "See all results in Knowledge Hub" link at bottom
- [ ] **1.13.1c** Keyboard shortcut: Cmd+K opens palette, typing searches across all sources

- **Dependencies**: 1.4.6
- **Testing**: Press Cmd+K, type query, verify Knowledge results appear alongside existing results

#### 1.13.2 Content Item Results in Search

- [ ] **1.13.2a** Add content item result type to command palette (currently only has apps, entities, records)
- [ ] **1.13.2b** Show content items with appropriate icons (file type, source type)
- [ ] **1.13.2c** Click opens the content item detail or navigates to Knowledge Hub with the item focused
- **Dependencies**: 1.13.1
- **Testing**: Search for content item name, verify it appears in results

---

### 1.14 Advanced Features (Document Only)

These features are documented for future phases but not implemented in Phase 1.

#### 1.14.1 Clustering

- [ ] **1.14.1a** Document design for automatic vector clustering:
  - Use k-means or HDBSCAN on the shared index embeddings
  - Group similar content across entities
  - Surface clusters as "Topics" in the Knowledge Hub
  - Reference: `packages/AI/Vectors/Memory/test-clustering.ts` (existing test file)

#### 1.14.2 Relationship Graphs

- [ ] **1.14.2a** Document design for relationship visualization:
  - Build a graph of entities connected by vector similarity
  - Use `@memberjunction/ng-entity-relationship-diagram` as starting point
  - Show connections between records that are semantically similar but not relationally linked

#### 1.14.3 RAG (Retrieval-Augmented Generation)

- [ ] **1.14.3a** Document design for RAG integration:
  - Knowledge Agent uses `search_knowledge` to retrieve relevant context
  - Injects context into LLM prompt for grounded answers
  - Show source attribution in responses

#### 1.14.4 Related-To Widget

- [ ] **1.14.4a** Document design for a "Related Content" widget:
  - Embeddable in any entity form
  - Shows records from other entities that are semantically similar
  - Uses shared index with metadata filtering

#### 1.14.5 Voice Input

- [ ] **1.14.5a** Document design for voice input:
  - Web Speech API integration for search queries
  - Voice-to-text for agent chat
  - Push-to-talk button on chat overlay

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Shared index performance at scale** | High | Medium | Metadata filtering reduces search space. Start with 1M vectors, load test before production. Index partitioning can be added later. |
| **RRF fusion quality** | Medium | Low | RRF is well-studied and already production-tested in duplicate detection. A/B test against pure vector search. |
| **Client tool timeout (30s)** | Medium | Medium | Most client tools (navigate, open panel) complete in <1s. Longer tools (apply complex filter) have graceful degradation. Server continues without client result on timeout. |
| **Shared index migration** | High | Medium | Keep per-EntityDocument indexes working (backward compatible). Shared index is opt-in via `IsSharedIndex` flag. Gradual migration. |
| **Full-text index admin privileges** | Medium | Low | FTS catalog/index creation requires elevated SQL permissions. Document required grants. Provide a migration script alternative for locked-down environments. |
| **WebSocket transport reliability** | Medium | Medium | SSE fallback transport. Automatic reconnection with exponential backoff. Message queuing during disconnection. |
| **Chat overlay z-index conflicts** | Low | Medium | Use a high but not maximum z-index (1000). Provide CSS variable `--mj-chat-overlay-z-index` for customization. |
| **Natural language templates vs structured** | Low | Low | Both formats continue to work. `TemplateStyle` field lets users choose. Natural language is the new default; structured remains supported. |

---

## Testing Strategy

### Unit Tests

Every new package includes a `vitest.config.ts` and `src/__tests__/` directory. Minimum coverage targets:

| Package | Target Coverage | Key Test Areas |
|---------|----------------|----------------|
| `@memberjunction/ai-knowledge-search` | 85% | Fusion logic, filter parsing, provider orchestration |
| `@memberjunction/ai-knowledge-pipeline` | 80% | Stage transitions, progress events, error recovery |
| `@memberjunction/ai-agent-client` | 90% | Transport, tool registry, session lifecycle, timeout |
| `@memberjunction/ng-agent-client` | 75% | Service lifecycle, tool registration, observable emissions |
| `@memberjunction/ng-chat-overlay` | 70% | State transitions, visibility logic, handoff |

### Integration Tests

- [ ] Vector search + FTS + RRF fusion with in-memory vector DB and mock SQL
- [ ] Knowledge Pipeline end-to-end with mock content source
- [ ] Agent Client SDK: mock server WebSocket, full tool request/response cycle
- [ ] Client tool invocation: server -> PubSub -> client -> response

### E2E Tests (Playwright)

- [ ] Knowledge Hub navigation: all 5 tabs accessible
- [ ] Search: type query, verify results appear
- [ ] Chat overlay: open, send message, minimize, navigate, verify persistence
- [ ] Handoff: overlay -> workspace -> overlay
- [ ] Command palette: Cmd+K, type query, see Knowledge results

### Performance Benchmarks

- [ ] Shared index query latency with 100K, 500K, 1M vectors
- [ ] RRF fusion time with 3 lists of 100 results each
- [ ] Pipeline throughput: records/second for vectorization
- [ ] Chat overlay render time and memory footprint

---

## Migration Plan

### Phase 1: Backward-Compatible Foundation (Sub-phases 1.1-1.5)

1. **Shared index is opt-in** -- existing per-EntityDocument indexes continue to work
2. **Knowledge Hub shell wraps existing components** -- no breaking changes to AI Dashboard
3. **New packages are additive** -- no existing package APIs are removed
4. **Database migrations are additive** -- new tables and columns only, no drops

### Phase 2: Agent Infrastructure (Sub-phases 1.6-1.10)

1. **Agent Client SDK is new** -- no migration needed, greenfield
2. **mj-chat modernization** -- backward-compatible `@Input` additions; existing consumers unaffected
3. **Overlay is new** -- added to shell template, hidden by default until user enables it
4. **ConversationBridgeService is additive** -- existing conversation components continue to work without it

### Phase 3: Intelligence Layer (Sub-phases 1.11-1.13)

1. **Knowledge Agent is a new agent** -- no changes to existing agents
2. **Search UX is new tab content** -- no changes to existing search
3. **Command palette enhancement** -- additive results section, existing behavior unchanged

### Data Migration Checklist

- [ ] Run migrations to add shared index tables/columns
- [ ] Run CodeGen to regenerate entity classes
- [ ] Create default shared vector index record
- [ ] (Optional) Migrate existing per-EntityDocument vectors to shared index using batch script
- [ ] Configure full-text indexes for key entities
- [ ] Push Knowledge Agent metadata
- [ ] Regenerate class manifests: `npm run mj:manifest`

---

## Regression Test Suite

Comprehensive UI regression tests executed via Playwright in Docker workbench. Each test has a numbered ID for tracking.

### Prerequisites
- [ ] **R-0.1** Docker workbench running with 32GB RAM
- [ ] **R-0.2** Clone/pull branch `claude/modernize-vector-dupe-detection-clAbF`
- [ ] **R-0.3** `npm install` + `npm run build` (all 176 packages)
- [ ] **R-0.4** Database bootstrap: `mj migrate` + AssociationDB install
- [ ] **R-0.5** `mj sync push` for applications, agents, prompts metadata
- [ ] **R-0.6** Start MJAPI (port 4000) and MJExplorer (port 4200)
- [ ] **R-0.7** Clear browser data (IndexedDB, localStorage, cookies) for clean start
- [ ] **R-0.8** Auth0 login with da-robot-tester credentials

### Test Group 1: Knowledge Hub App Shell
- [ ] **R-1.1** Knowledge Hub app appears in app menu
- [ ] **R-1.2** Clicking Knowledge Hub loads the app with tab navigation
- [ ] **R-1.3** All 5 tabs render: Search, Vectors, Duplicates, Autotagging, Configuration
- [ ] **R-1.4** Tab switching works without errors
- [ ] **R-1.5** App icon and description are correct

### Test Group 2: Search Dashboard (default tab)
- [ ] **R-2.1** Search bar renders centered on load
- [ ] **R-2.2** Typing in search bar shows search state
- [ ] **R-2.3** "Ask Knowledge Agent" CTA visible
- [ ] **R-2.4** Recent searches section visible (empty initially)
- [ ] **R-2.5** Mobile responsive: search bar stacks on narrow viewport

### Test Group 3: Vector Management Dashboard
- [ ] **R-3.1** KPI cards render with real data (Total Vectors, Entities Synced, Last Sync, Vector Indexes)
- [ ] **R-3.2** Entity Sync Status table shows entity documents
- [ ] **R-3.3** Sidebar panels render (Vector DB Health, Embedding Model, Coverage)
- [ ] **R-3.4** View mode toggle works (Index View ↔ Operations)
- [ ] **R-3.5** Refresh button reloads data
- [ ] **R-3.6** "Suggest Document" button opens slide-in panel

### Test Group 4: Entity Document Suggestion (Slide-in)
- [ ] **R-4.1** Slide-in panel opens from right edge
- [ ] **R-4.2** Entity picker shows grouped entities by schema
- [ ] **R-4.3** Entity picker search filters entities correctly
- [ ] **R-4.4** Selecting an entity populates the field
- [ ] **R-4.5** Use case button group toggles correctly (Duplicate Detection, Search, Classification)
- [ ] **R-4.6** "Generate Template" calls AI and shows results
- [ ] **R-4.7** Generated template appears in code editor (markdown mode, editable)
- [ ] **R-4.8** Selected fields, related entities, thresholds, reasoning all display
- [ ] **R-4.9** Document Name field is pre-filled
- [ ] **R-4.10** "Save as Entity Document" creates record and shows success toast
- [ ] **R-4.11** "Try Again" clears result and shows form again
- [ ] **R-4.12** Close button dismisses panel
- [ ] **R-4.13** Error state displays properly when AI call fails

### Test Group 5: Duplicate Detection Dashboard
- [ ] **R-5.1** KPI strip shows counts (Total, Pending, Approved, Rejected)
- [ ] **R-5.2** Kanban board renders with three columns
- [ ] **R-5.3** Entity filter dropdown filters by entity
- [ ] **R-5.4** Min/Max score filters work
- [ ] **R-5.5** Approve button moves card to Approved column and updates KPIs
- [ ] **R-5.6** Reject button moves card to Rejected column and updates KPIs
- [ ] **R-5.7** Clear Filters button resets all filters
- [ ] **R-5.8** Auto-switches to table view when >50 items (if applicable)
- [ ] **R-5.9** Paging works in table view (if applicable)

### Test Group 6: Autotagging Pipeline Dashboard
- [ ] **R-6.1** KPI metrics render (Active Sources, Items Processed, Tags Generated, Errors)
- [ ] **R-6.2** Pipeline stages visualization shows (Ingest, Extract, Chunk, Tag, Vectorize)
- [ ] **R-6.3** Recent Processing feed renders
- [ ] **R-6.4** Content Sources panel renders
- [ ] **R-6.5** Refresh button reloads data

### Test Group 7: Configuration Dashboard
- [ ] **R-7.1** Left navigation renders with 5 sections
- [ ] **R-7.2** Clicking sections scrolls to corresponding content
- [ ] **R-7.3** Toggle switches and inputs are interactive
- [ ] **R-7.4** Save bar appears when changes are made

### Test Group 8: Floating Chat Overlay
- [ ] **R-8.1** Chat bubble appears bottom-right on all pages
- [ ] **R-8.2** Clicking bubble expands to chat panel
- [ ] **R-8.3** Chat panel shows input area and send button
- [ ] **R-8.4** Minimizing returns to bubble state
- [ ] **R-8.5** Chat bubble persists across navigation (switch apps)
- [ ] **R-8.6** Chat bubble auto-hides when in Conversations workspace
- [ ] **R-8.7** "Open in workspace" button navigates to full Conversations

### Test Group 9: mj-chat (Kendo removed)
- [ ] **R-9.1** Chat buttons render with custom styling (no Kendo)
- [ ] **R-9.2** Clear chat dialog works (custom dialog, not Kendo)
- [ ] **R-9.3** Send button enables/disables correctly
- [ ] **R-9.4** Typing indicator animation works
- [ ] **R-9.5** Messages have slide-in animation

### Test Group 10: Entity Document Setup & Vectorization E2E
- [ ] **R-10.1** Create Entity Document for "AI Prompts" via suggestion panel
- [ ] **R-10.2** Create Entity Document for "AI Models" via suggestion panel
- [ ] **R-10.3** Verify entity documents appear in sync table
- [ ] **R-10.4** Trigger vectorization (if supported via UI)
- [ ] **R-10.5** Verify vector counts update after vectorization

### Test Group 11: Global Search (Cmd+K)
- [ ] **R-11.1** Cmd+K opens search overlay in MJ Explorer
- [ ] **R-11.2** "Search Knowledge Hub" action item appears when typing
- [ ] **R-11.3** Search overlay has keyboard navigation

### Test Group 12: Cross-cutting
- [ ] **R-12.1** No JavaScript console errors on any dashboard
- [ ] **R-12.2** All design tokens applied (no hardcoded colors visible)
- [ ] **R-12.3** Mobile responsive: all dashboards usable at 768px width
- [ ] **R-12.4** Loading states use <mj-loading> component
- [ ] **R-12.5** All buttons follow MJ convention (action left, cancel right)


---

## Follow-Up: MJ Storage Provider Search Integration

**Context**: MJ Storage supports multiple cloud storage providers (Azure Blob, AWS S3, Box, Google Drive, etc.). Some providers like Box have sophisticated built-in AI search capabilities (Box AI Search, Box Skills for auto-classification). 

**Opportunity**: The Unified Search API should optionally incorporate provider-native search results from MJ Storage providers that support it. For providers with strong AI search (Box, Google Drive with Gemini), we could:
1. Query the provider's native search API alongside our vector + FTS search
2. Fuse results via RRF (same pattern as vector + FTS fusion)
3. Avoid redundant autotagging of content that the provider already classifies — if the user has Box with AI features, don't re-process content Box already tagged

**Considerations**:
- AutoTagger should detect if the content source is backed by a storage provider with AI capabilities and skip redundant processing
- Storage provider search results should include source attribution so users know the result came from Box/Google/etc.
- This requires the `@memberjunction/storage` provider interface to expose an optional `Search()` method
- Not all providers will support this — graceful fallback to our own vector search when provider search is unavailable

**Priority**: Follow-up after Knowledge Hub v1 is stable. Add as Phase 1.15 when ready to implement.


---

## Follow-Up: Cross-Entity Similarity Clustering

**Concept**: Given a record in Entity A, find semantically similar records across ALL other entities (or specific selected entities) and content/documents in the shared vector index. Visualize as a cluster/network graph showing relationships by similarity score.

**Use Cases**:
- "Show me everything related to this customer" — finds similar contacts, related organizations, relevant documents, matching support tickets, all by vector similarity
- "What entities have records similar to this AI Model?" — cross-entity discovery
- "Cluster all records above 0.7 similarity" — discover hidden relationships
- Surface related content (PDFs, web pages, tagged items) alongside entity records

**UX**: 3 HTML mockup prototypes needed (to be created after current phase):
- Option A: Network/force-directed graph visualization — nodes are records, edges are similarity scores, color by entity type
- Option B: Radial/sunburst layout — selected record at center, related items radiating outward by score, grouped by entity type in concentric rings  
- Option C: List-based with entity grouping — "Related Items" panel showing grouped results with expandable entity sections, similarity bars, and quick-view previews

This could become a standalone "Related Items" widget embeddable in any entity form — not just in Knowledge Hub.

**Priority**: Phase 1.14 (Advanced Features). Build after Knowledge Hub v1 is stable.


---

## Follow-Up: Incremental Vector Index Sync

**Problem**: Currently, vectorization is a full re-sync — all records for an entity document are re-embedded and re-upserted. There's no automatic mechanism to keep vector indexes up-to-date as source data changes (inserts, updates, deletes).

**Proposed Approach**:

### Incremental Updates
- Track `__mj_UpdatedAt` on `EntityRecordDocument` records
- On sync, only process records where the source entity record's `__mj_UpdatedAt` is newer than the ERD's `EntityRecordUpdatedAt`
- For new records (no ERD exists), create new vectors
- For deleted records (ERD exists but source record gone), remove vectors from the index

### Automatic Scheduling
- Use MJ's existing Scheduled Jobs infrastructure (`MJ: Scheduled Jobs` entity)
- Create a "Vector Index Sync" Action that can be scheduled
- Configurable per entity document: 15 min, 30 min, hourly, daily
- The Action calls `EntityVectorSyncer.VectorizeEntity()` with an `IncrementalOnly` flag
- Dashboard shows last sync time, next scheduled sync, sync history

### Delete Propagation
- When a source record is deleted, the corresponding vector should be removed from the index
- Option 1: Server-side entity hook on BaseEntity delete → remove vector (real-time but adds latency)
- Option 2: Batch cleanup during scheduled sync — compare ERDs against source records, delete orphans
- Option 2 is safer and doesn't impact normal delete performance

### Implementation Tasks
- [ ] Add `IncrementalOnly` flag to `VectorizeEntityParams`
- [ ] Update `EntityVectorSyncer` to check `EntityRecordUpdatedAt` vs source `__mj_UpdatedAt`
- [ ] Create "Vector Index Sync" Action in `packages/Actions/`
- [ ] Add scheduling UI to Knowledge Hub Configuration tab
- [ ] Implement orphan detection and vector deletion during sync
- [ ] Add sync history/log display to Vector Management dashboard

**Priority**: High — essential for production use. Without this, vector indexes go stale.

