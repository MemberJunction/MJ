# Vector, Content Processing, and Duplicate Detection — Modernization Plan

## Overview

MemberJunction has a comprehensive but fragmented set of capabilities for vector embeddings, duplicate detection, content autotagging, and similarity search. This plan unifies and modernizes these systems into a cohesive architecture with shared infrastructure, clean code, proper typing, and support for both structured (database entities) and unstructured (files, web, RSS) content.

---

## Current Architecture

### Vector Packages (`packages/AI/Vectors/`)

| Package | Class | Purpose |
|---------|-------|---------|
| **Core** (`@memberjunction/ai-vectors`) | `VectorBase` | Base class with RunView, Metadata, entity loading utilities |
| **Database** (`@memberjunction/ai-vectordb`) | `VectorDBBase` | Abstract provider interface for vector database operations |
| **Memory** (`@memberjunction/ai-vectors-memory`) | `SimpleVectorService<T>` | In-memory vector math (6 distance metrics) + clustering (K-Means, DBSCAN) |
| **Sync** (`@memberjunction/ai-vector-sync`) | `EntityVectorSyncer` | Record -> template -> embedding -> vector DB pipeline |
| **Dupe** (`@memberjunction/ai-vector-dupe`) | `DuplicateRecordDetector` | List-based duplicate record detection using vector similarity |

### Vector DB Provider (`packages/AI/Providers/Vectors-Pinecone/`)

| Package | Class | Purpose |
|---------|-------|---------|
| **Pinecone** (`@memberjunction/ai-vectors-pinecone`) | `PineconeDatabase` | Pinecone implementation of `VectorDBBase` |

### Content Autotagging (`packages/ContentAutotagging/`)

| Component | Class | Purpose |
|-----------|-------|---------|
| **Engine** | `AutotagBaseEngine` | Orchestrates text extraction, chunking, LLM-based tagging |
| **Core** | `AutotagBase` | Abstract base for content source implementations |
| **LocalFileSystem** | `AutotagLocalFileSystem` | Ingests content from local directories |
| **RSSFeed** | `AutotagRSSFeed` | Ingests content from RSS feeds |
| **Websites** | `AutotagWebsite` | Web crawler with configurable depth/pattern |
| **CloudStorage** | `CloudStorageBase` / `AutotagAzureBlob` | Cloud storage integration |
| **Entity** | `AutotagEntity` | Ingests content from MJ entity records |

### Actions (`packages/Actions/`)

| Package | Class | Purpose |
|---------|-------|---------|
| **CoreActions** | `VectorizeEntityAction` | Vectorizes entities via EntityVectorSyncer |
| **ContentAutotag** | `AutotagAndVectorizeContentAction` | Combines autotagging + vectorization in one action |

### Related Systems

| System | Location | Relevance |
|--------|----------|-----------|
| **Tag / TaggedItem** | Core entities | Structured hierarchical tagging for any entity record |
| **ContentItemTag** | ContentAutotagging schema | Flat text tags from LLM extraction (disconnected from Tag system) |
| **MJ Storage** | `packages/MJStorage/` | File storage abstraction (7 providers: S3, Azure, GCS, Drive, SharePoint, Dropbox, Box) |
| **SimpleVectorService** in AIEngine | `packages/AI/Engine/` | In-memory vector search for agents, actions, notes |
| **QueryGen vectors** | `packages/QueryGen/src/vectors/` | Weighted similarity search for query matching |

---

## Identified Improvements

### Dupe Package (`packages/AI/Vectors/Dupe/`)

1. `VectorSyncBase` (`src/generic/vectorSyncBase.ts`) is unused — `DuplicateRecordDetector` extends `VectorBase` instead. Contains hardcoded `PineconeDatabase` import (breaks provider abstraction), `any` types, `fs` dependency, and unused fields.
2. `DuplicateRecordDetector.getDuplicateRecords` is a ~150-line monolithic method handling vectorization, querying, record creation, and merge in one function.
3. Commented-out testing/debugging code throughout.
4. `let` used instead of `const` in many places where values are never reassigned.
5. `(entityDocument as any).Template` cast bypasses typing.
6. `new Metadata()` created in nearly every private method instead of reusing the inherited instance.
7. `DuplicateRunDetail` records saved one at a time in a serial loop (N+1 pattern).
8. Vector DB queried one record at a time in a serial loop — no batching.
9. `match.MergedAt = new Date()` set on match creation even when no merge has occurred.
10. No self-match exclusion — a record's own vector returns as its top match.
11. `topK` hardcoded to 5 — not configurable.
12. `model: null` passed to `EmbedTexts` instead of using the model from the entity document.
13. `PotentialDuplicateRequest.Options` typed as `any` in core interfaces.
14. No single-record duplicate check — must create a List first.
15. Entity save hook (`MJDuplicateRunEntityServer`) blocks synchronously during the entire detection run.

### Sync Package (`packages/AI/Vectors/Sync/`)

1. `UpsertEntityRecordDocumentRecords` uses `.Get()` and `.Set()` extensively instead of typed properties.
2. `VectorizeEntity` returns `null` despite declaring `VectorizeEntityResponse` return type.
3. `GetOrCreateVectorIndex` uses `.Set('EntityRecordUpdatedAt', new Date())` — weak typing.

### Core Package (`packages/AI/Vectors/Core/`)

1. `BuildExtraFilter` concatenates values directly into SQL — potential injection vector.

### Content Autotagging (`packages/ContentAutotagging/`)

1. `AutotagBaseEngine` extends `AIEngine` — it is not an AI engine, it is a content processor that *uses* AI. This creates unnecessary coupling.
2. `GetEntityObject<any>` used in multiple places instead of proper entity types.
3. `.Get()` calls used to access typed fields (e.g., `Get('__mj_CreatedAt')`, `Get('Name')`).
4. `new Metadata()` and `new RunView()` created in nearly every method.
5. No caching of lookup data — `getContentTypeName`, `getContentSourceTypeName`, etc. each query the DB every time, even for repeated calls with the same ID.
6. Character-based text chunking splits at arbitrary boundaries (mid-word, mid-sentence) with no overlap between chunks. Uses rough `tokenLimit / 1.5` estimate.
7. Tags saved one at a time in a serial loop. Attributes saved one at a time. Content items processed one at a time.
8. `ContentItemTag` records are flat text strings with no connection to the structured `Tag`/`TaggedItem` system.
9. LLM JSON response parsed with raw `JSON.parse` — no error handling for malformed output.
10. `AutotagAndVectorizeContentAction` hardcodes which source types to run (LocalFileSystem, RSSFeed, Website) — not extensible.

### Architectural Gaps

1. **Two disconnected pipelines** — autotagging and vectorization share no infrastructure despite both needing text extraction, chunking, and AI processing.
2. **Two disconnected tag systems** — `ContentItemTag` (flat strings from LLM) and `Tag`/`TaggedItem` (structured hierarchy) have zero integration.
3. **No MJ Storage integration** — the autotagging system has its own cloud storage abstraction (`CloudStorageBase`) separate from the established `MJStorage` package with its 7 providers.
4. **No general-purpose similarity search API** — only list-based dupe detection; no "find records similar to X" capability.
5. **No progress reporting or cancellation** for long-running operations.

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Content Sources                               │
│  MJ Entities  │  MJ Storage (7 providers)  │  Web/RSS/Files    │
└───────┬───────┴──────────────┬──────────────┴─────────┬─────────┘
        │                      │                        │
        ▼                      ▼                        ▼
┌─────────────────────────────────────────────────────────────────┐
│              Shared Text Processing Infrastructure               │
│                                                                  │
│  Text Extraction (PDF, DOCX, HTML, plain text)                  │
│  Token-Aware Chunking (sentence boundaries, configurable overlap)│
│  Template Rendering (Entity Document templates)                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────┴────────────────┐
              ▼                             ▼
┌──────────────────────┐      ┌──────────────────────────┐
│   Embedding Pipeline  │      │   LLM Processing Pipeline │
│                      │      │                           │
│  Generate embeddings │      │  Tag extraction           │
│  Upsert to VectorDB  │      │  Summarization            │
│  Track in metadata   │      │  Custom attribute extract  │
└──────────┬───────────┘      └─────────────┬─────────────┘
           │                                │
           ▼                                ▼
┌──────────────────────┐      ┌──────────────────────────┐
│   Vector Operations   │      │   Structured Tags         │
│                      │      │                           │
│  Similarity search   │      │  Tag + TaggedItem entities │
│  Duplicate detection │      │  Hierarchical categories  │
│  Clustering          │      │  ContentItem integration  │
│  In-memory search    │      │                           │
└──────────────────────┘      └──────────────────────────┘
```

---

## Implementation Plan

### 1. Delete Dead Code and Unused Files

| File | Action | Reason |
|------|--------|--------|
| `packages/AI/Vectors/Dupe/src/generic/vectorSyncBase.ts` | Delete | Unused — `DuplicateRecordDetector` extends `VectorBase`, not this class. Contains hardcoded Pinecone import. |
| `packages/AI/Vectors/Dupe/src/generic/entitySyncConfig.ts` | Delete if unused | Check for imports first |
| Remove all commented-out code in `DuplicateRecordDetector` | Clean | Debugging artifacts (test IDs, commented method calls, logged API keys) |

### 2. Fix Core Type Safety

| File | Changes |
|------|---------|
| `packages/MJCore/src/generic/interfaces.ts` | Replace `Options?: any` on `PotentialDuplicateRequest` with a typed `DuplicateDetectionOptions` interface containing `DuplicateRunID?: string`, `TopK?: number`, and room for future fields |
| `packages/AI/Vectors/Core/src/models/VectorBase.ts` | Parameterize `BuildExtraFilter` to prevent SQL injection via composite key values |
| `packages/AI/Vectors/Sync/src/models/entityVectorSync.ts` | Replace all `.Get()`/`.Set()` calls in `UpsertEntityRecordDocumentRecords` with typed property access. Fix `VectorizeEntity` to return a proper `VectorizeEntityResponse` instead of `null`. Remove `.Set('EntityRecordUpdatedAt', ...)` in `GetOrCreateVectorIndex`. |
| `packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts` | Replace all `GetEntityObject<any>` with proper entity types. Replace `.Get()` calls with typed property access. Add error handling around `JSON.parse` of LLM responses. |
| `packages/ContentAutotagging/src/Entity/generic/AutotagEntity.ts` | Replace `.Get()` calls and `(this as any)` casts with typed access |

### 3. Refactor DuplicateRecordDetector

**File:** `packages/AI/Vectors/Dupe/src/duplicateRecordDetector.ts`

- Decompose `getDuplicateRecords` into focused methods:
  - `loadAndValidateEntityDocument()` — fetch and validate the entity document
  - `initializeProviders()` — create embedding and vector DB instances
  - `vectorizeRecords()` — template + embed all records
  - `findDuplicatesForRecords()` — query vector DB for each record
  - `createMatchRecords()` — persist match results
  - `processAutoMerges()` — handle above-threshold merges
- Replace all `let` with `const` where values are not reassigned
- Use `super.Metadata` instead of `new Metadata()` in every method
- Add self-match exclusion when processing vector query results
- Make `topK` configurable via `DuplicateDetectionOptions`
- Pass proper model name to `EmbedTexts`
- Only set `MergedAt` when a merge actually occurs
- Batch `DuplicateRunDetail` creation with parallel saves (batches of 10-20)

### 4. Add Single-Record Duplicate Check

**File:** `packages/AI/Vectors/Dupe/src/duplicateRecordDetector.ts`

Add a new method:
```typescript
public async CheckSingleRecord(
    entityDocumentID: string,
    recordID: CompositeKey,
    options?: DuplicateDetectionOptions,
    contextUser?: UserInfo
): Promise<PotentialDuplicateResult>
```

This bypasses the List requirement — embeds one record and queries for matches. Useful for real-time dupe checking on record save or in UI.

### 5. Make Save Hook Non-Blocking

**File:** `packages/MJCoreEntitiesServer/src/custom/MJDuplicateRunEntityServer.server.ts`

- Change from `await duplicateRecordDetector.getDuplicateRecords(...)` to fire-and-forget with error handling that updates the `DuplicateRun` record's `ProcessingStatus` and `ProcessingErrorMessage` on failure.
- The save should return immediately; the detection runs asynchronously.

### 6. Create Shared Text Processing Utilities

**New file:** `packages/AI/Vectors/Core/src/generic/TextChunker.ts`

Create a proper text chunking service:
- Token-aware chunking (not character-based)
- Sentence boundary detection — never split mid-sentence
- Configurable chunk overlap (default ~10% for context continuity)
- Configurable max chunk size
- Support for different content types (prose, structured data, code)

**New file:** `packages/AI/Vectors/Core/src/generic/TextExtractor.ts`

Move text extraction utilities from `AutotagBaseEngine` into shared infrastructure:
- `extractFromPDF(buffer)` — wraps `pdf-parse`
- `extractFromDOCX(buffer)` — wraps `officeparser`
- `extractFromHTML(html)` — wraps `cheerio` with cleaning
- `extractFromPlainText(text)` — passthrough with normalization
- `extractFromPath(filePath)` — routes to correct extractor

These become shared building blocks used by both autotagging and vectorization.

### 7. Refactor AutotagBaseEngine

**File:** `packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts`

- **Stop extending `AIEngine`** — change to a standalone class that uses `AIEngine.Instance` as a dependency. `AutotagBaseEngine` is a content processor, not an AI engine.
- Cache lookup data (content type names, source type names, file type names) to eliminate repeated DB queries for the same IDs.
- Use the new shared `TextChunker` and `TextExtractor` instead of inline implementations.
- Add error handling around LLM JSON parsing with retry/fallback.
- Batch tag and attribute saves instead of serial one-at-a-time loops.

### 8. Bridge the Tag Systems

**File:** `packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts` (tag saving logic)

When the autotagging LLM extracts keywords:
1. Find or create a `Tag` entity for each keyword
2. Create a `TaggedItem` linking the tag to the `ContentItem` entity record
3. Continue creating `ContentItemTag` for backward compatibility

This connects LLM-extracted tags to the structured `Tag`/`TaggedItem` hierarchy, making autotagged content searchable via the same tag system used everywhere else in MJ.

### 9. Integrate MJ Storage as Content Source

**File:** `packages/ContentAutotagging/src/CloudStorage/generic/CloudStorageBase.ts` and new provider files

Replace the standalone `CloudStorageBase` in ContentAutotagging with integration to `@memberjunction/mjstorage`'s `FileStorageBase`:
- Use `FileStorageBase` providers (already supports 7 cloud providers) instead of maintaining a separate Azure Blob implementation
- Add a new `AutotagMJStorage` content source that works with any configured `FileStorageAccount`
- Leverage existing `FileStorageBase.ListObjects()`, `GetObject()`, and `SearchFiles()` methods

### 10. Add Progress Reporting

**File:** `packages/AI/Vectors/Dupe/src/duplicateRecordDetector.ts` and `packages/AI/Vectors/Sync/src/models/entityVectorSync.ts`

Add an optional progress callback to long-running operations:

```typescript
export interface ProcessingProgress {
    Phase: 'vectorizing' | 'querying' | 'matching' | 'merging';
    TotalRecords: number;
    ProcessedRecords: number;
    MatchesFound: number;
    CurrentRecord?: string;
}
```

This enables UI progress bars and logging without blocking.

### 11. Clean Up VectorizeEntityAction

**File:** `packages/Actions/CoreActions/src/custom/utilities/vectorize-entity.action.ts`

- Replace `error as any` cast with proper error typing
- Type the `options: {}` parameter properly

**File:** `packages/Actions/ContentAutotag/src/generic/content-autotag-and-vectorize.action.ts`

- Replace hardcoded source type instantiation with dynamic discovery via `@RegisterClass`
- Replace `error as any` cast
- Replace `Value === 1` comparison with proper boolean/truthy check

### 12. Update and Expand Unit Tests

| Test File | Changes |
|-----------|---------|
| `packages/AI/Vectors/Dupe/src/__tests__/duplicateRecordDetector.test.ts` | Update mocks for refactored methods. Add tests for: single-record check, self-match exclusion, configurable topK, batch operations, progress callbacks, error cases (missing API keys, failed embeddings, malformed vector responses). |
| `packages/AI/Vectors/Core/src/__tests__/` | Add tests for `TextChunker` (sentence boundaries, overlap, token limits) and `TextExtractor` (PDF, DOCX, HTML) |
| `packages/ContentAutotagging/src/__tests__/` | Update existing tests. Add tests for: tag system bridging, cached lookups, LLM JSON parse error handling |
| `packages/AI/Vectors/Sync/src/__tests__/` | Add tests for typed `UpsertEntityRecordDocumentRecords`, proper `VectorizeEntityResponse` return |

### 13. Compile and Verify

- Build each modified package individually with `npm run build` in the package directory
- Run tests for each modified package with `npm run test`
- Fix any TypeScript compilation errors
- Fix any test failures introduced by the refactoring

---

## Files Modified (Complete List)

### Deleted
| File | Reason |
|------|--------|
| `packages/AI/Vectors/Dupe/src/generic/vectorSyncBase.ts` | Unused, breaks provider abstraction |
| `packages/AI/Vectors/Dupe/src/generic/entitySyncConfig.ts` | Unused (verify first) |

### New Files
| File | Purpose |
|------|---------|
| `packages/AI/Vectors/Core/src/generic/TextChunker.ts` | Token-aware text chunking with sentence boundaries and overlap |
| `packages/AI/Vectors/Core/src/generic/TextExtractor.ts` | Shared PDF/DOCX/HTML/text extraction |

### Modified — Vector Packages
| File | Summary of Changes |
|------|--------------------|
| `packages/MJCore/src/generic/interfaces.ts` | Type `Options` on `PotentialDuplicateRequest` with `DuplicateDetectionOptions` |
| `packages/AI/Vectors/Core/src/models/VectorBase.ts` | Parameterize `BuildExtraFilter` for SQL safety |
| `packages/AI/Vectors/Dupe/src/duplicateRecordDetector.ts` | Major refactor: decompose, fix types, add single-record check, batch operations, self-match exclusion, configurable topK, progress reporting |
| `packages/AI/Vectors/Sync/src/models/entityVectorSync.ts` | Replace `.Get()`/`.Set()` with typed access, fix return type, remove weak typing |
| `packages/MJCoreEntitiesServer/src/custom/MJDuplicateRunEntityServer.server.ts` | Make save hook non-blocking |

### Modified — Content Autotagging
| File | Summary of Changes |
|------|--------------------|
| `packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts` | Stop extending AIEngine, use shared TextChunker/TextExtractor, cache lookups, bridge to Tag system, batch saves, handle JSON parse errors |
| `packages/ContentAutotagging/src/Entity/generic/AutotagEntity.ts` | Fix `.Get()` usage and `any` casts |
| `packages/ContentAutotagging/src/CloudStorage/generic/CloudStorageBase.ts` | Integrate with MJ Storage providers |

### Modified — Actions
| File | Summary of Changes |
|------|--------------------|
| `packages/Actions/CoreActions/src/custom/utilities/vectorize-entity.action.ts` | Fix `any` casts and typing |
| `packages/Actions/ContentAutotag/src/generic/content-autotag-and-vectorize.action.ts` | Dynamic source discovery, fix typing |

### Modified — Tests
| File | Summary of Changes |
|------|--------------------|
| `packages/AI/Vectors/Dupe/src/__tests__/duplicateRecordDetector.test.ts` | Update for refactored API, add new test cases |
| `packages/ContentAutotagging/src/__tests__/AutotagBaseEngine.test.ts` | Update for refactored engine |
| New test files for TextChunker, TextExtractor, and Sync package | Comprehensive coverage |

---

## Success Criteria

1. All modified packages compile cleanly with `npm run build`
2. All unit tests pass with `npm run test`
3. Zero `any` types in modified code
4. Zero `.Get()`/`.Set()` usage where typed properties exist
5. `DuplicateRecordDetector` supports both list-based and single-record duplicate checks
6. Text chunking is token-aware with sentence boundary detection
7. Autotagged content creates proper `Tag`/`TaggedItem` records
8. All long-running operations support progress reporting
9. Save hook for duplicate runs is non-blocking
