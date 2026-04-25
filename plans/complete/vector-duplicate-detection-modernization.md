# Vector, Content Processing, and Duplicate Detection — Modernization Plan

## Overview

MemberJunction's vector embeddings, duplicate detection, content autotagging, and similarity search systems are functional but fragmented, with poor typing, tight Pinecone coupling, sequential processing, and no hybrid search. This plan unifies and modernizes them into a clean-slate architecture with proper naming, shared infrastructure, and modern retrieval techniques.

**Design principles:**
- Clean slate — no backward compatibility constraints; rename freely for clarity
- Follow MJ naming conventions (PascalCase public, camelCase private/protected)
- Use existing MJ infrastructure (reranker, ClassFactory, BaseSingleton, MJ Storage)
- Zero `any` types, zero `.Get()`/`.Set()` where typed properties exist

---

## Current State Summary

### Vector Packages (`packages/AI/Vectors/`)

| Package | Key Class | Issues |
|---|---|---|
| **Core** | `VectorBase` | SQL injection risk in `BuildExtraFilter` |
| **Database** | `VectorDBBase` | No hybrid search interface |
| **Memory** | `SimpleVectorService<T>` | Solid — minimal changes needed |
| **Sync** | `EntityVectorSyncer` | `.Get()`/`.Set()` usage, returns `null` instead of typed response |
| **Dupe** | `DuplicateRecordDetector` | Monolithic, `any` types, hardcoded topK, sequential queries, no batching, Pinecone coupling |

### Content Autotagging (`packages/ContentAutotagging/`)

| Component | Issues |
|---|---|
| `AutotagBaseEngine` | Extends `AIEngine` (wrong inheritance), `any` types, no caching, character-based chunking |
| Cloud storage | Separate abstraction duplicating MJ Storage's 7 providers |
| Tag system | `ContentItemTag` disconnected from structured `Tag`/`TaggedItem` entities |

### Existing Reranker (USE THIS — do not build new)

| Package | Key Class | Purpose |
|---|---|---|
| `@memberjunction/ai` | `BaseReranker` | Abstract base with `Rerank()`, `sortByRelevance()`, `filterByThreshold()` |
| `@memberjunction/ai-reranker` | `RerankerService` | Singleton service managing reranker instances |
| `@memberjunction/ai-reranker` | `LLMReranker` | LLM-based reranker using AI Prompts |
| `@memberjunction/ai-cohere` | `CohereReranker` | Cohere Rerank API provider |

Types: `RerankDocument`, `RerankResult`, `RerankParams`, `RerankResponse` — all defined in `@memberjunction/ai`.

---

## Phase 1: Code Quality, Type Safety, and Dead Code Removal

**Goal**: Clean foundation. Fix all type violations, remove dead code, improve naming.

### Task 1.1 — Delete dead code and unused files

- [ ] Delete `packages/AI/Vectors/Dupe/src/generic/vectorSyncBase.ts` — unused, contains hardcoded Pinecone import
- [ ] Delete `packages/AI/Vectors/Dupe/src/generic/entitySyncConfig.ts` — verify no imports, then delete
- [ ] Delete `packages/AI/Vectors/Dupe/src/config.ts` — if only used by deleted vectorSyncBase
- [ ] Remove all commented-out code in `DuplicateRecordDetector` (test IDs, commented method calls, logged API keys)
- [ ] Remove unused private methods: `createListForDupeRun`, `createDuplicateRunDetailRecords`
- [ ] Remove `//for testing` markers and debugging artifacts
- [ ] Replace all `let` with `const` where values are never reassigned

### Task 1.2 — Fix type safety in DuplicateRecordDetector

- [ ] Replace `(entityDocument as any).Template` (line 113) — use `EntityDocumentTemplateParser` which is already imported and used
- [ ] Replace `model: null` in `EmbedTexts` call (line 120) with the actual model from the entity document's AI model config
- [ ] Fix `match.MergedAt = new Date()` being set on match creation even when no merge has occurred — only set when merge actually runs
- [ ] Use `super.Metadata` instead of `new Metadata()` in every private method (lines 195, 215, 245, 267, 279, 300, 317, 340)
- [ ] Type the `record` variable in `getVectorDuplicates` (line 384) — replace inline type literal with a named `VectorMatchRecord` interface
- [ ] Remove direct `@memberjunction/ai-vectors-pinecone` dependency from `package.json` — rely on `VectorDBBase` abstraction via ClassFactory

### Task 1.3 — Fix type safety in EntityVectorSyncer

- [ ] Replace all `.Get()`/`.Set()` calls in `UpsertEntityRecordDocumentRecords` with typed property access on a proper entity type
- [ ] Fix `GetOrCreateVectorIndex` — replace `.Set('EntityRecordUpdatedAt', new Date())` with typed property
- [ ] Fix `VectorizeEntity` to return a proper `VectorizeEntityResponse` instead of `null`

### Task 1.4 — Type the Options parameter in core interfaces

- [ ] In `packages/MJCore/src/generic/interfaces.ts`, replace `Options?: any` on `PotentialDuplicateRequest` with a typed interface:
  ```typescript
  export interface DuplicateDetectionOptions {
      DuplicateRunID?: string;
      TopK?: number;
      ReRankingEnabled?: boolean;
      ReRankingModelID?: string;
      ReRankingTopK?: number;
      FusionMethod?: 'rrf' | 'weighted';
      KeywordSearchWeight?: number;  // 0.0-1.0, default 0.3
  }
  ```

### Task 1.5 — Fix SQL injection risk in VectorBase

- [ ] In `packages/AI/Vectors/Core/src/models/VectorBase.ts`, parameterize `BuildExtraFilter` to prevent injection via composite key values — use proper escaping or parameterized queries

### Task 1.6 — Compile and test

- [ ] Build `@memberjunction/core` — `cd packages/MJCore && npm run build`
- [ ] Build `@memberjunction/ai-vectors` — `cd packages/AI/Vectors/Core && npm run build`
- [ ] Build `@memberjunction/ai-vector-sync` — `cd packages/AI/Vectors/Sync && npm run build`
- [ ] Build `@memberjunction/ai-vector-dupe` — `cd packages/AI/Vectors/Dupe && npm run build`
- [ ] Run tests — `cd packages/AI/Vectors/Dupe && npm run test`
- [ ] Fix any compilation errors or test failures

---

## Phase 2: Decompose and Modernize DuplicateRecordDetector

**Goal**: Break the monolithic `getDuplicateRecords` into focused, testable methods with batched operations and configurable behavior.

### Task 2.1 — Decompose getDuplicateRecords into focused methods

Break the ~150-line `getDuplicateRecords` into:

- [ ] `ValidateEntityDocument(entityDocumentID: string): Promise<MJEntityDocumentEntity>` — fetch, validate existence, return typed entity document
- [ ] `InitializeProviders(entityDocument: MJEntityDocumentEntity): void` — create embedding and vector DB instances via ClassFactory, store on instance
- [ ] `VectorizeSourceRecords(entityDocument: MJEntityDocumentEntity, listID: string, contextUser: UserInfo): Promise<void>` — delegate to EntityVectorSyncer
- [ ] `EmbedAndQueryRecords(records: BaseEntity[], entityDocument: MJEntityDocumentEntity, options: DuplicateDetectionOptions): Promise<DuplicateQueryResult[]>` — template, embed, query vector DB with configurable topK
- [ ] `PersistMatchResults(queryResults: DuplicateQueryResult[], duplicateRunDetails: MJDuplicateRunDetailEntity[]): Promise<void>` — create match records in batches
- [ ] `ProcessAutoMerges(entityDocument: MJEntityDocumentEntity, results: PotentialDuplicateResult[]): Promise<void>` — handle above-threshold merges

### Task 2.2 — Add self-match exclusion

- [ ] When processing vector query results in `getVectorDuplicates`, filter out matches where the matched record ID equals the source record ID
- [ ] Add unit test for self-match exclusion

### Task 2.3 — Make topK configurable

- [ ] Read `TopK` from `DuplicateDetectionOptions` (default: 5)
- [ ] Pass through to `queryIndex()` call instead of hardcoded `5`
- [ ] Add unit test for configurable topK

### Task 2.4 — Batch vector queries with concurrency control

- [ ] Replace the sequential `for...of` loop that queries the vector DB one record at a time (lines 123-153)
- [ ] Process queries in batches with configurable concurrency (e.g., 5 concurrent queries)
- [ ] Use `Promise.all()` with a concurrency limiter utility function:
  ```typescript
  async function RunWithConcurrency<T>(
      tasks: (() => Promise<T>)[],
      concurrencyLimit: number
  ): Promise<T[]>
  ```

### Task 2.5 — Batch database saves

- [ ] Replace sequential save loop in `createDuplicateRunDetailRecordsByListID` — save in parallel batches of 20
- [ ] Replace sequential save loop in `createDuplicateRunDetailMatchesForRecord` — save in parallel batches of 20
- [ ] Add unit tests for batch save operations

### Task 2.6 — Add single-record duplicate check

- [ ] Add new public method:
  ```typescript
  public async CheckSingleRecord(
      EntityDocumentID: string,
      RecordID: CompositeKey,
      Options?: DuplicateDetectionOptions,
      ContextUser?: UserInfo
  ): Promise<PotentialDuplicateResult>
  ```
- [ ] This bypasses the List requirement — embeds one record and queries for matches directly
- [ ] Useful for real-time dupe checking on record save or in UI
- [ ] Add unit tests

### Task 2.7 — Make save hook non-blocking

- [ ] In `MJDuplicateRunEntityServer.server.ts`, change from `await detector.getDuplicateRecords(...)` to fire-and-forget
- [ ] On error, update `DuplicateRun.ProcessingStatus = 'Error'` and set `ProcessingErrorMessage`
- [ ] The save should return immediately; detection runs asynchronously

### Task 2.8 — Compile and test

- [ ] Build all affected packages
- [ ] Run all tests in `@memberjunction/ai-vector-dupe`
- [ ] Verify no regressions

---

## Phase 3: Hybrid Search and Reranking Integration

**Goal**: Add hybrid search (vector + keyword) with RRF fusion, and integrate the existing MJ reranker for optional result refinement.

### Task 3.1 — Extend VectorDBBase with optional hybrid search

- [ ] In `packages/AI/Vectors/Database/src/generic/query.types.ts`, add:
  ```typescript
  export interface HybridQueryOptions extends QueryOptions {
      KeywordQuery?: string;
      Alpha?: number;              // 0.0 = pure keyword, 1.0 = pure vector, default 0.7
      FusionMethod?: 'rrf' | 'weighted';
  }
  ```
- [ ] In `VectorDBBase`, add optional method:
  ```typescript
  HybridQuery?(params: HybridQueryOptions): BaseResponse | Promise<BaseResponse>;
  ```
- [ ] Add `SupportsHybridSearch` boolean getter (default `false`, override in providers)

### Task 3.2 — Implement Reciprocal Rank Fusion utility

- [ ] New file: `packages/AI/Vectors/Dupe/src/scoring/ReciprocalRankFusion.ts`
- [ ] Implement: `ComputeRRF(rankedLists: ScoredCandidate[][], k?: number): ScoredCandidate[]`
- [ ] Formula: `score(d) = Σ 1/(k + rank_i(d))` where `k` defaults to 60
- [ ] Pure function, no external dependencies
- [ ] Add comprehensive unit tests: `packages/AI/Vectors/Dupe/src/__tests__/ReciprocalRankFusion.test.ts`
  - Test with empty lists
  - Test with single list (passthrough)
  - Test with two lists having overlapping and non-overlapping candidates
  - Test k parameter sensitivity

### Task 3.3 — Integrate hybrid search into DuplicateRecordDetector

- [ ] In `EmbedAndQueryRecords`, check if vector DB implements `HybridQuery`
- [ ] If yes, use hybrid query with template text as keyword query and embedding vector as vector query
- [ ] If no, fall back to pure vector search (current behavior)
- [ ] When both vector-only and keyword-only results are available (separate queries), combine with RRF
- [ ] Read `FusionMethod` and `KeywordSearchWeight` from `DuplicateDetectionOptions`

### Task 3.4 — Integrate existing reranker

- [ ] In `DuplicateRecordDetector`, add optional reranking step after initial retrieval
- [ ] If `Options.ReRankingEnabled` is true:
  1. Convert vector matches to `RerankDocument[]` (using template text as document text)
  2. Call `RerankerService.Instance` to get the appropriate reranker
  3. Call `BaseReranker.Rerank()` with the query template and candidate documents
  4. Replace raw similarity scores with reranker relevance scores
  5. Re-filter against `PotentialMatchThreshold` with new scores
- [ ] If `Options.ReRankingModelID` is provided, use that model; otherwise use the default reranker
- [ ] If `Options.ReRankingTopK` is provided, limit the number of candidates sent to the reranker
- [ ] Add unit tests mocking `RerankerService` and `BaseReranker`

### Task 3.5 — Compile and test

- [ ] Build all affected packages (Database, Dupe)
- [ ] Run all tests
- [ ] Verify pure-vector fallback still works when hybrid/reranking not configured

---

## Phase 4: Shared Text Processing Infrastructure

**Goal**: Create shared text processing utilities used by both vectorization and autotagging.

### Task 4.1 — Create token-aware text chunker

- [ ] New file: `packages/AI/Vectors/Core/src/generic/TextChunker.ts`
- [ ] Class: `TextChunker` with method:
  ```typescript
  public static ChunkText(params: ChunkTextParams): TextChunk[]
  ```
- [ ] `ChunkTextParams`:
  - `Text: string`
  - `MaxChunkTokens: number` (default: 512)
  - `OverlapTokens: number` (default: ~10% of MaxChunkTokens)
  - `Strategy: 'sentence' | 'paragraph' | 'fixed'` (default: 'sentence')
- [ ] `TextChunk`:
  - `Text: string`
  - `StartOffset: number`
  - `EndOffset: number`
  - `TokenCount: number`
- [ ] Sentence boundary detection — never split mid-sentence
- [ ] Token counting via simple whitespace tokenizer (or tiktoken if available)
- [ ] Add comprehensive unit tests

### Task 4.2 — Create shared text extractor

- [ ] New file: `packages/AI/Vectors/Core/src/generic/TextExtractor.ts`
- [ ] Class: `TextExtractor` with static methods:
  - `ExtractFromHTML(html: string): string`
  - `ExtractFromPlainText(text: string): string`
  - `ExtractFromBuffer(buffer: Buffer, mimeType: string): Promise<string>`
- [ ] Move extraction logic from `AutotagBaseEngine` into shared utility
- [ ] Add unit tests

### Task 4.3 — Refactor AutotagBaseEngine to use shared utilities

- [ ] Stop extending `AIEngine` — change to standalone class that uses `AIEngine.Instance`
- [ ] Replace inline character-based chunking with `TextChunker`
- [ ] Replace inline extraction with `TextExtractor`
- [ ] Cache lookup data (content type names, source type names) — load once, reuse
- [ ] Replace all `GetEntityObject<any>` with proper entity types
- [ ] Replace all `.Get()` calls with typed property access
- [ ] Add error handling around `JSON.parse` of LLM responses
- [ ] Batch tag and attribute saves

### Task 4.4 — Bridge tag systems

- [ ] When autotagging LLM extracts keywords, also create `Tag` + `TaggedItem` records (not just `ContentItemTag`)
- [ ] Find or create `Tag` entity for each keyword
- [ ] Create `TaggedItem` linking tag to the `ContentItem` entity record

### Task 4.5 — Integrate MJ Storage as content source

- [ ] Replace standalone `CloudStorageBase` with integration to `@memberjunction/mjstorage` `FileStorageBase`
- [ ] Add `AutotagMJStorage` content source working with any configured `FileStorageAccount`
- [ ] Leverage existing `FileStorageBase.ListObjects()`, `GetObject()`, `SearchFiles()`

### Task 4.6 — Compile and test

- [ ] Build all affected packages
- [ ] Run all tests
- [ ] Verify autotagging still works end-to-end

---

## Phase 5: Scalability and Progress Reporting

**Goal**: Handle large-scale operations with pagination, progress events, and incremental detection.

### Task 5.1 — Add progress reporting interface

- [ ] New interface:
  ```typescript
  export interface DuplicateDetectionProgress {
      Phase: 'Vectorizing' | 'Querying' | 'Matching' | 'Merging';
      TotalRecords: number;
      ProcessedRecords: number;
      MatchesFound: number;
      CurrentRecordID?: string;
      ElapsedMs: number;
  }

  export type ProgressCallback = (progress: DuplicateDetectionProgress) => void;
  ```
- [ ] Add optional `OnProgress?: ProgressCallback` to `DuplicateDetectionOptions`
- [ ] Call progress callback at natural milestones in the detection flow

### Task 5.2 — Paginated record processing

- [ ] Replace `GetRecordsByListID` loading all records at once with paginated loading
- [ ] Process records in configurable page sizes (default: 100)
- [ ] Report progress after each page

### Task 5.3 — Incremental duplicate detection

- [ ] Track which records have been checked in previous runs via `MJ: Duplicate Run Details`
- [ ] Add option `IncrementalOnly?: boolean` to `DuplicateDetectionOptions`
- [ ] When enabled, only check records not present in a completed run for the same entity document
- [ ] Store last-checked timestamps

### Task 5.4 — Database migration for new configuration columns

- [ ] Add migration file: `migrations/v5/VYYYYMMDDHHMM__v5.x__Duplicate_Detection_Options.sql`
- [ ] Add columns to `MJ: Duplicate Runs`:
  - `TopK` — INT, nullable, default 5
  - `FusionMethod` — NVARCHAR(20), nullable, CHECK ('rrf', 'weighted')
  - `ReRankingEnabled` — BIT, default 0
  - `ReRankingModelID` — UNIQUEIDENTIFIER, nullable, FK to AI Models
  - `KeywordSearchWeight` — DECIMAL(3,2), nullable, default 0.3
- [ ] Run CodeGen after migration to generate typed properties

### Task 5.5 — Clean up Actions

- [ ] In `packages/Actions/CoreActions/src/custom/utilities/vectorize-entity.action.ts`:
  - Replace `error as any` with proper error typing
  - Type the `options: {}` parameter
- [ ] In `packages/Actions/ContentAutotag/src/generic/content-autotag-and-vectorize.action.ts`:
  - Replace hardcoded source type instantiation with dynamic discovery via `@RegisterClass`
  - Replace `error as any`

### Task 5.6 — Compile and test everything

- [ ] Build all modified packages
- [ ] Run full test suite
- [ ] Verify end-to-end: list-based detection, single-record detection, hybrid search, reranking

---

## Complete File Inventory

### Files to Delete
| File | Reason |
|---|---|
| `packages/AI/Vectors/Dupe/src/generic/vectorSyncBase.ts` | Unused, hardcoded Pinecone import |
| `packages/AI/Vectors/Dupe/src/generic/entitySyncConfig.ts` | Unused (verify imports first) |
| `packages/AI/Vectors/Dupe/MODERNIZATION_PLAN.md` | Superseded by this plan |
| `guides/VECTOR_AND_CONTENT_PROCESSING_MODERNIZATION.md` | Superseded by this plan |

### New Files
| File | Purpose |
|---|---|
| `packages/AI/Vectors/Core/src/generic/TextChunker.ts` | Token-aware text chunking |
| `packages/AI/Vectors/Core/src/generic/TextExtractor.ts` | Shared text extraction |
| `packages/AI/Vectors/Dupe/src/scoring/ReciprocalRankFusion.ts` | RRF fusion utility |
| `packages/AI/Vectors/Dupe/src/__tests__/ReciprocalRankFusion.test.ts` | RRF tests |
| `packages/AI/Vectors/Core/src/__tests__/TextChunker.test.ts` | Chunker tests |
| `packages/AI/Vectors/Core/src/__tests__/TextExtractor.test.ts` | Extractor tests |
| `migrations/v5/VYYYYMMDDHHMM__v5.x__Duplicate_Detection_Options.sql` | New columns |

### Modified Files
| File | Phase | Summary |
|---|---|---|
| `packages/MJCore/src/generic/interfaces.ts` | 1 | Type `DuplicateDetectionOptions`, replace `any` |
| `packages/AI/Vectors/Core/src/models/VectorBase.ts` | 1 | SQL injection fix in `BuildExtraFilter` |
| `packages/AI/Vectors/Dupe/src/duplicateRecordDetector.ts` | 1-3 | Major refactor across all phases |
| `packages/AI/Vectors/Dupe/package.json` | 1 | Remove Pinecone direct dependency |
| `packages/AI/Vectors/Sync/src/models/entityVectorSync.ts` | 1 | Fix `.Get()`/`.Set()`, return type |
| `packages/AI/Vectors/Database/src/generic/VectorDBBase.ts` | 3 | Add optional hybrid query |
| `packages/AI/Vectors/Database/src/generic/query.types.ts` | 3 | Add `HybridQueryOptions` |
| `packages/MJCoreEntitiesServer/src/custom/MJDuplicateRunEntityServer.server.ts` | 2 | Non-blocking hook |
| `packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts` | 4 | Stop extending AIEngine, use shared infra |
| `packages/ContentAutotagging/src/Entity/generic/AutotagEntity.ts` | 4 | Fix typing |
| `packages/ContentAutotagging/src/CloudStorage/generic/CloudStorageBase.ts` | 4 | Integrate MJ Storage |
| `packages/Actions/CoreActions/src/custom/utilities/vectorize-entity.action.ts` | 5 | Fix typing |
| `packages/Actions/ContentAutotag/src/generic/content-autotag-and-vectorize.action.ts` | 5 | Dynamic discovery, fix typing |
| `packages/AI/Vectors/Dupe/src/__tests__/duplicateRecordDetector.test.ts` | 1-3 | Update for refactored API |

---

## Success Criteria

1. All modified packages compile cleanly with `npm run build`
2. All unit tests pass with `npm run test`
3. Zero `any` types in modified code
4. Zero `.Get()`/`.Set()` usage where typed properties exist
5. `DuplicateRecordDetector` supports both list-based and single-record duplicate checks
6. Hybrid search works when vector DB supports it, falls back gracefully when not
7. Existing `BaseReranker`/`RerankerService` integrated for optional post-retrieval refinement
8. Text chunking is token-aware with sentence boundary detection
9. All long-running operations support progress reporting
10. Save hook for duplicate runs is non-blocking
