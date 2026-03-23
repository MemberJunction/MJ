# Modernize Vector-Based Duplicate Detection — Implementation Plan

## Executive Summary

The current duplicate detection system in `@memberjunction/ai-vector-dupe` is functional but tightly coupled to Pinecone, uses sequential record-by-record processing, and lacks support for modern retrieval techniques like hybrid search. This plan outlines a phased modernization that improves accuracy, performance, and extensibility while preserving backward compatibility.

---

## Current Architecture Assessment

### What Exists Today

| Component | Location | Role |
|---|---|---|
| `DuplicateRecordDetector` | `packages/AI/Vectors/Dupe/src/duplicateRecordDetector.ts` | Orchestrates the full dupe-detection flow |
| `EntityVectorSyncer` | `packages/AI/Vectors/Sync/src/models/entityVectorSync.ts` | Vectorizes entity records via templates + embeddings, upserts to vector DB |
| `VectorDBBase` | `packages/AI/Vectors/Database/src/generic/VectorDBBase.ts` | Abstract interface for vector database providers |
| `VectorBase` | `packages/AI/Vectors/Core/src/models/VectorBase.ts` | Shared base class with metadata access, RunView, entity helpers |
| `PotentialDuplicateRecordResolver` | `packages/MJServer/src/resolvers/PotentialDuplicateRecordResolver.ts` | GraphQL API endpoint |
| `MJDuplicateRunEntityServer` | `packages/MJCoreEntitiesServer/src/custom/MJDuplicateRunEntityServer.server.ts` | Server-side hook that triggers detection on record save |
| Unit tests | `packages/AI/Vectors/Dupe/src/__tests__/duplicateRecordDetector.test.ts` | Vitest test suite |

### Current Flow
1. User creates a `MJ: Duplicate Runs` record with a source list ID
2. Server-side hook intercepts the save → calls `DuplicateRecordDetector.getDuplicateRecords()`
3. `EntityVectorSyncer.VectorizeEntity()` vectorizes all records using template + embedding model
4. For each record in the list, embeddings are created and queried against the vector DB (Pinecone) one at a time
5. Results above `PotentialMatchThreshold` are stored as `MJ: Duplicate Run Detail Matches`
6. High-confidence matches above `AbsoluteMatchThreshold` are auto-merged

### Key Pain Points
1. **Sequential per-record querying** — each record fires a separate `queryIndex()` call (line 125); no batching
2. **Hardcoded `topK: 5`** — not configurable (line 121)
3. **Pinecone coupling** — the `@memberjunction/ai-vectors-pinecone` dependency is hard-wired in `package.json`
4. **No hybrid search** — pure vector similarity only; no keyword/BM25 complement
5. **No re-ranking** — raw cosine similarity scores are used directly as probability scores
6. **Template casting uses `any`** — line 113: `(entityDocument as any).Template` is a type-safety violation
7. **Sequential DB saves** — `createDuplicateRunDetailRecordsByListID` saves records one at a time in a loop
8. **Stale code** — commented-out code, `//for testing` markers, unused methods (`createListForDupeRun`, `createDuplicateRunDetailRecords`)

---

## Phased Implementation Plan

### Phase 1: Code Quality & Quick Wins (Low Risk, High Value)

**Goal**: Clean up the existing code, fix type safety issues, add batching for DB operations, make `topK` configurable.

#### 1.1 Remove `any` type cast and dead code
- **File**: `duplicateRecordDetector.ts`
- Replace `(entityDocument as any).Template` (line 113) with the proper typed property — the `MJEntityDocumentEntity` has a `TemplateID` and the template text comes from `EntityDocumentTemplateParser`
- Remove all `//for testing` comments and commented-out code blocks
- Remove unused private methods: `createListForDupeRun`, `createDuplicateRunDetailRecords`

#### 1.2 Make `topK` configurable
- Add `TopK` as an optional field on `PotentialDuplicateRequest` (in `@memberjunction/core`)
- Default to `5` for backward compatibility
- Pass through to `queryIndex()` call

#### 1.3 Batch duplicate run detail saves
- Replace the sequential `for` loop in `createDuplicateRunDetailRecordsByListID` with `Promise.all()` batches (e.g., batches of 25)
- Same for `createDuplicateRunDetailMatchesForRecord`

#### 1.4 Batch vector queries
- Instead of querying the vector DB once per record, batch the embedding step (already batched via `EmbedTexts`) and then issue queries in parallel with a configurable concurrency limit (e.g., 5 concurrent queries)

#### 1.5 Update unit tests
- Update existing tests to cover the refactored code
- Add tests for configurable `topK`
- Add tests for batch save operations

---

### Phase 2: Provider Abstraction & Hybrid Search Foundation (Medium Risk)

**Goal**: Decouple from Pinecone, establish interfaces for hybrid search, add optional keyword-based pre-filtering.

#### 2.1 Remove direct Pinecone dependency
- **File**: `package.json` of `@memberjunction/ai-vector-dupe`
- Remove `@memberjunction/ai-vectors-pinecone` from direct dependencies
- The detector should only depend on `VectorDBBase` (the abstract interface)
- The concrete Pinecone provider is injected via MJ's ClassFactory at runtime

#### 2.2 Extend `VectorDBBase` with optional hybrid search interface
- **File**: `packages/AI/Vectors/Database/src/generic/VectorDBBase.ts`
- Add optional method: `hybridQuery?(params: HybridQueryOptions): BaseResponse | Promise<BaseResponse>`
- `HybridQueryOptions` extends `QueryOptions` with:
  - `keywordQuery?: string` — BM25/text search component
  - `alpha?: number` — vector vs keyword weight (0.0 = pure keyword, 1.0 = pure vector, default 0.7)
  - `fusionMethod?: 'rrf' | 'weighted'` — Reciprocal Rank Fusion or weighted combination
- Providers that support hybrid search (Weaviate, Qdrant, Elasticsearch) can implement this; Pinecone just ignores it

#### 2.3 Add keyword search fallback in `DuplicateRecordDetector`
- If the vector DB implements `hybridQuery`, use it with the template text as keyword query
- If not, fall back to pure vector search (current behavior)
- This gives a natural improvement path as providers add hybrid support

#### 2.4 Add RRF (Reciprocal Rank Fusion) utility
- **New file**: `packages/AI/Vectors/Dupe/src/scoring/reciprocalRankFusion.ts`
- Implements the formula: `score(d) = Σ 1/(k + rank_i(d))` where `k` defaults to 60
- Used when combining vector and keyword results from separate queries
- Keep it as a pure utility function, no external dependencies

#### 2.5 Update tests for Phase 2
- Test hybrid search path when provider supports it
- Test fallback to pure vector when provider doesn't support hybrid
- Test RRF scoring utility

---

### Phase 3: Re-Ranking & Confidence Calibration (Medium Risk)

**Goal**: Improve match quality by adding an optional LLM-based or cross-encoder re-ranking step.

#### 3.1 Add re-ranking interface
- **New file**: `packages/AI/Vectors/Dupe/src/scoring/reRanker.ts`
- Abstract `BaseReRanker` class with method: `ReRank(query: string, candidates: ScoredCandidate[]): Promise<ScoredCandidate[]>`
- Concrete implementations:
  - `CrossEncoderReRanker` — uses an AI model to score query-candidate pairs
  - `NoOpReRanker` — passthrough (default, preserves current behavior)

#### 3.2 Integrate re-ranking into detection flow
- After vector DB returns initial candidates, optionally pass through re-ranker
- Re-ranker uses the template text (human-readable record representation) for comparison
- Configurable via `PotentialDuplicateRequest.Options`:
  - `ReRankingEnabled?: boolean` (default: false)
  - `ReRankingModelID?: string` (which AI model to use)
  - `ReRankingTopK?: number` (how many candidates to re-rank, default: all)

#### 3.3 Confidence score normalization
- Current scores are raw cosine similarity (0-1) — meaning varies by embedding model
- Add optional score normalization that maps raw scores to calibrated confidence percentages
- Use configurable thresholds per entity document rather than global thresholds

#### 3.4 Update tests

---

### Phase 4: Scalability & Performance (Higher Risk, Long-Term)

**Goal**: Handle large-scale duplicate detection across millions of records efficiently.

#### 4.1 Streaming/pagination for large lists
- Current approach loads all list records into memory at once (line 100)
- Add pagination support: process records in configurable page sizes
- Emit progress events so the UI can show real-time status

#### 4.2 Parallel processing with concurrency control
- Process pages in parallel with a configurable concurrency limit
- Use the existing `BatchWorker` pattern from `EntityVectorSyncer` as inspiration

#### 4.3 Incremental duplicate detection
- Track which records have been checked against which
- On re-runs, only check new/modified records
- Store last-checked timestamps on `MJ: Duplicate Run Details`

#### 4.4 Database migration for new fields
- Add `TopK` column to `MJ: Duplicate Runs` entity (INT, nullable, default 5)
- Add `FusionMethod` column (NVARCHAR, nullable — 'rrf' | 'weighted' | null)
- Add `ReRankingEnabled` column (BIT, default 0)
- Add `ReRankingModelID` column (UNIQUEIDENTIFIER, nullable, FK to AI Models)
- Run CodeGen after migration

---

## Architecture Diagram (Target State)

```
┌─────────────────────────────────────────────────────┐
│                   GraphQL API                        │
│         PotentialDuplicateRecordResolver              │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│            DuplicateRecordDetector                    │
│  ┌──────────┐  ┌────────────┐  ┌─────────────────┐  │
│  │ Vectorize │  │  Query &   │  │   Score &       │  │
│  │ Records   │  │  Retrieve  │  │   Re-Rank       │  │
│  │ (batched) │  │  (hybrid)  │  │   (optional)    │  │
│  └─────┬─────┘  └──────┬─────┘  └───────┬─────────┘  │
│        │               │                │             │
│        ▼               ▼                ▼             │
│  ┌──────────┐  ┌────────────┐  ┌─────────────────┐  │
│  │ Embedding │  │ VectorDB   │  │  ReRanker       │  │
│  │ Provider  │  │ Provider   │  │  (CrossEncoder  │  │
│  │ (any)     │  │ (any)      │  │   or NoOp)      │  │
│  └──────────┘  └────────────┘  └─────────────────┘  │
│                       │                               │
│              ┌────────┴────────┐                      │
│              │  Optional RRF   │                      │
│              │  Fusion Layer   │                      │
│              └─────────────────┘                      │
└─────────────────────────────────────────────────────┘
```

---

## Implementation Priority & Effort

| Phase | Effort | Risk | Value | Recommended Order |
|---|---|---|---|---|
| Phase 1: Code Quality | 1-2 days | Low | High | **Do first** |
| Phase 2: Hybrid Search | 2-3 days | Medium | High | Second |
| Phase 3: Re-Ranking | 2-3 days | Medium | Medium | Third |
| Phase 4: Scalability | 3-5 days | Higher | Medium | Fourth (as needed) |

---

## Files That Will Be Modified

### Phase 1
- `packages/AI/Vectors/Dupe/src/duplicateRecordDetector.ts` — main refactor
- `packages/AI/Vectors/Dupe/src/__tests__/duplicateRecordDetector.test.ts` — test updates
- `packages/AI/Vectors/Dupe/package.json` — remove unused deps

### Phase 2
- `packages/AI/Vectors/Database/src/generic/VectorDBBase.ts` — add hybrid query interface
- `packages/AI/Vectors/Database/src/generic/query.types.ts` — add hybrid query types
- `packages/AI/Vectors/Dupe/src/duplicateRecordDetector.ts` — integrate hybrid path
- `packages/AI/Vectors/Dupe/src/scoring/reciprocalRankFusion.ts` — **new file**
- `packages/AI/Vectors/Dupe/src/__tests__/reciprocalRankFusion.test.ts` — **new file**

### Phase 3
- `packages/AI/Vectors/Dupe/src/scoring/reRanker.ts` — **new file**
- `packages/AI/Vectors/Dupe/src/scoring/crossEncoderReRanker.ts` — **new file**
- `packages/AI/Vectors/Dupe/src/duplicateRecordDetector.ts` — integrate re-ranking

### Phase 4
- `migrations/v5/` — new migration for additional columns
- Various files for pagination and incremental detection support

---

## Research References

The following resources informed this plan (from web research conducted during planning):

### Hybrid Search & RRF
- [Azure AI Search: Hybrid Search Scoring with RRF](https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking) — `score = Σ 1/(k + rank)`, k=60 default
- [OpenSearch: Introducing RRF for Hybrid Search](https://opensearch.org/blog/introducing-reciprocal-rank-fusion-hybrid-search/) — OpenSearch 2.19 implementation
- [Better RAG with RRF and Hybrid Search](https://www.assembled.com/blog/better-rag-results-with-reciprocal-rank-fusion-and-hybrid-search)

### Vector Database Flexibility
- Current system is Pinecone-only; Weaviate, Qdrant, and Milvus all support hybrid search natively
- Qdrant (Rust-based) is particularly strong for complex filtering + vector search
- Weaviate has built-in BM25+vector hybrid with alpha parameter

### Embedding Models (MTEB Benchmark)
- Qwen3-Embedding-8B leads MTEB overall
- Cohere embed-v4 (65.2) and OpenAI text-embedding-3-large (64.6) for API-based
- BGE-M3 for self-hosted; all-MiniLM-L6-v2 for quick prototyping
- The system should remain model-agnostic (it already is via ClassFactory)

### Advanced RAG Patterns
- Graph RAG (Microsoft Research) for relationship-aware duplicate detection — potential Phase 5
- Self-RAG and Corrective RAG patterns for confidence calibration
- Semantic chunking strategies for better template text preparation

### Re-Ranking
- Cross-encoder re-ranking consistently improves precision by 10-20% in RAG benchmarks
- Can use any MJ-registered AI model via the existing ClassFactory pattern
