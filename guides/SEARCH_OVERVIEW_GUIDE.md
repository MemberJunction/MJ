# MemberJunction Search — Overview Guide

MJ has **multiple search APIs**, each tuned for a different question. They're complementary, not competing. This guide helps you pick the right one and points to the deeper docs for each.

## The decision tree

```
What are you looking for?
│
├─ A specific entity definition (by exact name or ID)?
│  └─ EntityByName(name) / EntityByID(id)
│     Synchronous, deterministic, returns one EntityInfo.
│
├─ Ranked records of ONE entity, by free-text query?
│  └─ Metadata.Provider.SearchEntity({ entityName, searchText, options })
│     Hybrid lexical + semantic. Returns EntitySearchResult[].
│     See: ENTITY_SEARCH_GUIDE.md
│
├─ Ranked records of MANY entities in one round-trip?
│  └─ Metadata.Provider.SearchEntities([ {entityName, searchText, options}, ... ])
│     Batched form of SearchEntity. Returns EntitySearchResult[][] aligned by input.
│     See: ENTITY_SEARCH_GUIDE.md
│
├─ Full-text scan across multiple entities (no semantic, no ranking blend)?
│  └─ Metadata.Provider.FullTextSearch(params)
│     Uses each entity's UserSearchString rule (LIKE / FTS at the DB layer).
│     See: packages/MJCore/docs/FULL_TEXT_SEARCH_GUIDE.md
│
└─ Cross-source unified search (vectors + FTS + entities + storage, scoped)?
   └─ SearchEngine.Search(params, contextUser)   // @memberjunction/search-engine
      Multi-provider, RRF-fused, optional reranker, scope-aware.
      See: guides/SEARCH_SCOPES_AND_RAG_GUIDE.md
```

## What each API actually does

### 1. `EntityByName` / `EntityByID` — definition lookup

**On:** `IMetadataProvider` (sync). **Source:** in-memory metadata maps populated at provider config. **Returns:** `EntityInfo | undefined`.

Not search. These are the canonical way to resolve "the entity called *Accounts*" or "the entity whose ID is *…*" without touching the database. O(1) lookup via the provider's internal map. Always prefer over `Entities.find(e => e.Name === ...)` — that linear scan is case-sensitive and slow.

### 2. `SearchEntity` / `SearchEntities` — per-entity ranked record search ⭐ NEW

**On:** `IMetadataProvider` (async). **Source:** RunView (lexical) + EntityDocument-backed vector index (semantic). **Returns:** `EntitySearchResult[]` (singular) / `EntitySearchResult[][]` (plural).

The use case is: *"find the N records of entity X most relevant to this free-text query"*. Hybrid lexical + semantic ranking, RRF-blended, post-filtered by the caller's row-level read permissions on that entity. Backed by an `EntityDocument` of type `Search`.

Use for agent prompt seeding (swap "here's the whole 1500-entity catalog" for "here are 10 likely candidates"), in-app "find a customer / invoice / document" UX, and any time you know the entity but don't know which records.

**Singular** = one entity. **Plural** = many entities in one call (one GraphQL round-trip on the client; `Promise.all` fan-out on the server).

See **[ENTITY_SEARCH_GUIDE.md](./ENTITY_SEARCH_GUIDE.md)** for configuration, the seeded `MJ: Entities` example, weighted-RRF tuning, and how to enable on your own entities.

### 3. `FullTextSearch` — multi-entity DB-level text search

**On:** `IMetadataProvider` (async). **Source:** RunView with `UserSearchString`, hitting each entity's SQL Server / PostgreSQL full-text index where configured. **Returns:** `FullTextSearchResult` grouped by entity.

Lexical only — no semantic ranking. The right choice when you want fast, broad text recall across many entities and the FTS infrastructure is already in place. Each entity opts in by setting `FullTextSearchEnabled = true` on its `EntityInfo`, which drives CodeGen DDL.

See **[packages/MJCore/docs/FULL_TEXT_SEARCH_GUIDE.md](../packages/MJCore/docs/FULL_TEXT_SEARCH_GUIDE.md)** for entity / field configuration, CodeGen DDL behavior, permissions, and the SQL Server vs. PostgreSQL details.

### 4. `SearchEngine.Search` — cross-source unified search

**On:** `SearchEngine` from `@memberjunction/search-engine`. **Source:** orchestrates multiple providers — vector store, full-text, entity, storage — selected via `SearchScope` metadata. **Returns:** `SearchResult` with per-source counts, RRF-fused matches, optional reranker scores.

The most general API. Use when the caller doesn't know which entity (or source) to look in, or when results from multiple sources should be merged (e.g., "anything matching 'late payment'" → invoices + email threads + uploaded contracts). Supports streaming (`streamSearch`), preview (`PreviewSearch`), and per-scope weight tuning via the shared `ComputeRRF` weights API.

GraphQL surface: `SearchKnowledge` / `SearchScopes` / `PreviewSearch` resolvers in MJServer.

See **[guides/SEARCH_SCOPES_AND_RAG_GUIDE.md](./SEARCH_SCOPES_AND_RAG_GUIDE.md)** for the scope architecture, provider configuration, RAG+ patterns, and the agent integration story.

## Shared infrastructure

### `ComputeRRF` — canonical weighted Reciprocal Rank Fusion

**In:** `@memberjunction/core`. **Used by:** `SearchEntity` (hybrid mode), `SearchEngine.Search` (cross-source / cross-scope fusion), `DuplicateRecordDetector` (vector + keyword blending), and any caller that wants to combine ranked lists.

```typescript
import { ComputeRRF, ScoredCandidate } from '@memberjunction/core';
const fused = ComputeRRF([listA, listB], /* k */ 60, /* weights */ [1.0, 1.5]);
```

Optional per-list `weights`. Omitting them gives canonical unweighted RRF (the paper-standard formula). One source of truth across all MJ search blending.

### `SimpleVectorServiceProvider` — in-process VectorDBBase

**In:** `@memberjunction/ai-vectors-memory`. **For:** semantic ranking when you don't want to stand up a remote vector DB. Loads `EntityRecordDocument.VectorJSON` lazily per `EntityDocumentID`, ranks via in-memory cosine. Out-of-box for the entity-catalog use case; for high-scale corpora, swap to Pinecone / Qdrant / pgvector at the `EntityDocument.VectorDatabaseID` level — `SearchEntity`'s orchestration is provider-agnostic.

### `EntityDocument` / `EntityRecordDocument`

**In:** MJ core schema. **What:** per-entity template + per-record rendered text + persisted embedding (`VectorJSON`). Drives both this guide's `SearchEntity` semantic pass and the wider vector-sync pipeline used by `SearchEngine` vector providers, dupe detection, knowledge pipelines, etc. The same pipeline powers all of them.

## Pointers to the deep docs

| For | Read |
|---|---|
| Per-entity ranked search, configuring `EntityDocument`s, tuning weights | [`guides/ENTITY_SEARCH_GUIDE.md`](./ENTITY_SEARCH_GUIDE.md) |
| Full-text search architecture, DDL generation, entity/field flags | [`packages/MJCore/docs/FULL_TEXT_SEARCH_GUIDE.md`](../packages/MJCore/docs/FULL_TEXT_SEARCH_GUIDE.md) |
| Cross-source unified search, scopes, RAG+, reranking | [`guides/SEARCH_SCOPES_AND_RAG_GUIDE.md`](./SEARCH_SCOPES_AND_RAG_GUIDE.md) |
| RRF math + the weighted variant | [`packages/MJCore/readme.md` § Weighted Reciprocal Rank Fusion](../packages/MJCore/readme.md) |
| In-memory vector ranking primitive | [`packages/AI/Vectors/Memory/README.md`](../packages/AI/Vectors/Memory/README.md) |
