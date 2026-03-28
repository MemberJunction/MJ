# Vector/Duplicate Detection — Docker Workbench Test Results

**Date**: 2026-03-28
**Branch**: `claude/modernize-vector-dupe-detection-clAbF`
**Environment**: Docker workbench (SQL Server 2022 + Node 24)

---

## Executive Summary

The modernized vector duplicate detection pipeline (PR #2212) has been validated through:
- **97 unit tests** passing across all vector packages
- **Database schema validation** confirming correct table structures and field metadata
- **TextChunker/TextExtractor utility tests** with real-world data patterns
- **Code quality audit** confirming the modernized code is free of `any` types and `.Get()`/`.Set()` usage
- **Server hook verification** confirming non-blocking fire-and-forget pattern with proper error handling

**End-to-end testing with real AI/vector services was NOT possible** in this Docker workbench because no AI API keys or vector database credentials are configured. The full pipeline test would require Pinecone (or compatible) and OpenAI (or compatible) API keys.

---

## Phase 1: Environment Setup

### Results
| Step | Status | Details |
|------|--------|---------|
| npm install | PASS | 3,484 packages installed, 42s |
| Build all packages | PASS | 175/175 packages built (turbo), 9.8s |
| Create database | PASS | MJ_Workbench created on sql-claude |
| Run migrations | PASS | 54 Flyway migrations applied via `mj migrate`, 80s |
| Install AssociationDB | PASS | 58 tables, 2,000 Members, 200 Organizations, 6,683 registrations |
| Run CodeGen | PASS | 58 AssociationDemo entities registered (AI form layout failed - no API keys, non-critical) |

---

## Phase 2: Unit Test Results

### Vector Core Package (`@memberjunction/ai-vectors`)
| Test File | Tests | Status |
|-----------|-------|--------|
| TextChunker.test.ts | 13 | ALL PASS |
| TextExtractor.test.ts | 25 | ALL PASS |
| VectorBase.test.ts | 20 | ALL PASS |
| **Total** | **58** | **ALL PASS** |

### Vector Dupe Package (`@memberjunction/ai-vector-dupe`)
| Test File | Tests | Status |
|-----------|-------|--------|
| ReciprocalRankFusion.test.ts | 14 | ALL PASS |
| duplicateRecordDetector.test.ts | 10 | ALL PASS |
| **Total** | **24** | **ALL PASS** |

### Vector Sync Package (`@memberjunction/ai-vector-sync`)
| Test File | Tests | Status |
|-----------|-------|--------|
| EntityDocumentCache.test.ts | 15 | ALL PASS |
| **Total** | **15** | **ALL PASS** |

### Grand Total: 97/97 tests passing

---

## Phase 3: Database Schema Validation

### Duplicate Detection Tables
All three tables exist in the `__mj` schema with correct structure:

**DuplicateRun** (13 columns):
- `ID` (uniqueidentifier, PK)
- `EntityID`, `StartedByUserID`, `SourceListID` (FK references)
- `StartedAt` (default: SYSDATETIMEOFFSET()), `EndedAt` (nullable)
- `ApprovalStatus` (default: 'Pending'), `ApprovalComments`
- `ApprovedByUserID` (nullable)
- `ProcessingStatus` (default: 'Pending'), `ProcessingErrorMessage` (nullable)
- Valid ProcessingStatus values: **Pending, In Progress, Complete, Failed**

**DuplicateRunDetail** (10 columns):
- `ID`, `DuplicateRunID` (FK)
- `RecordID` (nvarchar - composite key string)
- `MatchStatus`, `SkippedReason`, `MatchErrorMessage`
- `MergeStatus`, `MergeErrorMessage`

**DuplicateRunDetailMatch** (13 columns):
- `ID`, `DuplicateRunDetailID` (FK)
- `MatchSource` (default: 'Vector'), `MatchRecordID`
- `MatchProbability` (numeric), `MatchedAt`
- `Action` (default: 'Ignore'), `ApprovalStatus` (default: 'Pending')
- `RecordMergeLogID` (nullable), `MergeStatus` (default: 'Pending'), `MergedAt`

### Supporting Tables
- `EntityDocument` (0 rows - ready for configuration)
- `EntityDocumentType` (1 row - base type exists)
- `VectorDatabase` (1 row - base config exists)
- `VectorIndex` (0 rows - ready for vectorization)
- `List`, `ListDetail` (0 rows - ready for test data)

### Schema Verdict: PASS
All tables have correct structures, defaults, and constraints. The schema supports the full pipeline lifecycle.

---

## Phase 4: Code Quality Audit

### Modernized Code (Clean)
| File | `any` types | `.Get()/.Set()` | Verdict |
|------|-------------|-----------------|---------|
| `Dupe/src/duplicateRecordDetector.ts` | 0 | 0 | CLEAN |
| `Dupe/src/scoring/ReciprocalRankFusion.ts` | 0 | 0 | CLEAN |
| `Core/src/generic/TextChunker.ts` | 0 | 0 | CLEAN |
| `Core/src/generic/TextExtractor.ts` | 0 | 0 | CLEAN |
| `Core/src/models/VectorBase.ts` | 0 | 0 | CLEAN |
| `MJCoreEntitiesServer/MJDuplicateRunEntityServer.server.ts` | 0 | 0 | CLEAN |
| `MJCore/src/generic/interfaces.ts` (DuplicateDetectionOptions) | 0 | 0 | CLEAN |
| `Database/src/generic/VectorDBBase.ts` | 0 | 0 | CLEAN |
| `Database/src/generic/query.types.ts` | 0 | 0 | CLEAN |

### Pre-existing Code (Known Issues from Modernization Plan)
| File | Issues | Status |
|------|--------|--------|
| `Core/src/generic/IEmbedding.ts` | 4x `any` | Legacy interface - documented in plan |
| `Core/src/generic/IVectorDatabase.ts` | 6x `any` | Legacy interface - documented in plan |
| `Core/src/generic/IVectorIndex.ts` | 16x `any` | Legacy interface - documented in plan |
| `Database/src/generic/record.ts` | 3x `any` | Base types - documented in plan |
| `Sync/src/models/entityVectorSync.ts` | 9x `.Set()`, 1x `.Get()`, 2x `any` | Documented in Phase 1.3 of plan |
| `Sync/src/generic/vectorSync.types.ts` | 1x `any`, 6x `unknown` | Types file |
| `Sync/src/generic/EntityDocumenTemplateParserBase.ts` | 2x `any` | Parser base |
| `Sync/src/generic/EntityDocumentTemplateParser.ts` | 1x `any`, 1x `as any` | Template parser |

### Audit Verdict: PASS (for modernized code)
All code written/modified in PR #2212 is clean. Pre-existing issues are documented in the modernization plan for future phases.

---

## Phase 5: Extended Testing — TextChunker & TextExtractor

### TextChunker Results
| Test Case | Strategy | Input Size | Chunks | Token Est. | Status |
|-----------|----------|-----------|--------|------------|--------|
| Empty text | sentence | 0 chars | 0 | 0 | PASS |
| Short text | sentence | 12 chars | 1 | 3 | PASS |
| Short text | paragraph | 12 chars | 1 | 3 | PASS |
| Short text | fixed | 12 chars | 1 | 3 | PASS |
| Medium text (5 sentences) | sentence | 292 chars | 2 @ 64 max | 73 est. | PASS |
| Medium text | paragraph | 292 chars | 1 | 73 | PASS |
| Medium text | fixed | 292 chars | 2 w/overlap | 73 | PASS |
| Long text (20 sentences) | sentence | 2810 chars | 20 @ 32 max | 703 | PASS |
| Long text | paragraph | 2810 chars | 1 (no \n\n) | 703 | PASS |
| Long text | fixed | 2810 chars | 13 w/overlap | 703 | PASS |

- Token estimation uses `Math.ceil(text.length / 4)` (~4 chars/token)
- Sentence boundary detection correctly splits on `.`, `!`, `?`
- Overlap between chunks works correctly for `fixed` strategy
- Oversized single sentences are emitted as their own chunk

### TextExtractor Results
| Test Case | Input | Output Size | Status |
|-----------|-------|-------------|--------|
| Simple HTML | `<h1>Title</h1><p>text</p>` | Tags stripped, text preserved | PASS |
| Complex HTML (scripts/styles) | `<script>`, `<style>` blocks | Fully removed | PASS |
| HTML entities | `&amp;`, `&lt;`, `&gt;`, `&#39;` | Correctly decoded | PASS |
| Plain text + control chars | `\x00\x01\x02` | Control chars removed | PASS |
| Empty input | `""` | `""` (no error) | PASS |
| MIME routing | `text/html`, `text/plain` | Correct dispatch | PASS |
| Token truncation | 500-char text, limit=200 | Truncated at word boundary | PASS |

---

## Phase 6: Architecture & Design Review

### DuplicateRecordDetector — Decomposition Assessment
The modernized `DuplicateRecordDetector` class is well-decomposed into focused methods:

| Method | Lines | Purpose | Assessment |
|--------|-------|---------|------------|
| `GetDuplicateRecords()` | 78 | Main orchestrator | Clean pipeline with 11 clear steps |
| `CheckSingleRecord()` | 38 | Single-record check | Clean, focused |
| `ValidateEntityDocument()` | 5 | Validation | Properly delegates to EntityVectorSyncer |
| `InitializeProviders()` | 30 | Provider setup | Uses ClassFactory, proper error messages |
| `VectorizeSourceRecords()` | 12 | Vectorization | Delegates to EntityVectorSyncer |
| `GenerateTemplateTexts()` | 12 | Template generation | Uses EntityDocumentTemplateParser |
| `QueryDuplicatesForRecords()` | 28 | Vector queries | Concurrency-controlled via RunWithConcurrency |
| `executeVectorQuery()` | 20 | Single query | Hybrid search fallback to pure vector |
| `ParseVectorMatches()` | 22 | Match parsing | Public for testability, well-typed |
| `FilterSelfMatches()` | 3 | Self-match exclusion | Simple filter |
| `PersistMatchResults()` | 30 | DB persistence | Batched saves |
| `CreateRunDetailRecordsFromList()` | 24 | Detail creation | Batched parallel saves |
| `CreateMatchRecordsForDetail()` | 20 | Match creation | Batched parallel saves |
| `ProcessAutoMerges()` | 20 | Auto-merge | Threshold-based |
| `reportProgress()` | 10 | Progress callback | Clean interface |

### Key Design Patterns Verified
1. **Concurrency Control**: `RunWithConcurrency()` utility limits parallel vector queries to 5
2. **Batched Saves**: `chunkArray()` + `Promise.all()` for DB saves in batches of 20
3. **Self-Match Exclusion**: `FilterSelfMatches()` prevents records from matching themselves
4. **Configurable TopK**: Read from `DuplicateDetectionOptions`, default 5
5. **Hybrid Search**: Falls back to pure vector when `SupportsHybridSearch` is false
6. **RRF Fusion**: `ComputeRRF()` is a pure function with comprehensive tests
7. **Non-Blocking Hook**: Server hook uses fire-and-forget with error status update on failure
8. **Progress Reporting**: Optional callback at every phase milestone

### Server Hook Assessment
The `MJDuplicateRunEntityServer` correctly implements:
- Fire-and-forget async detection (save returns immediately)
- Error recovery (sets `ProcessingStatus = 'Failed'` on error)
- Guard against re-triggering (only fires when `EndedAt === null`)
- Uses 'Failed' (not 'Error') matching the valid ProcessingStatus enum

---

## Blockers & Limitations

### Cannot Test End-to-End Pipeline
**Reason**: No AI API keys or vector database credentials configured in this Docker workbench.

The full pipeline requires:
1. **Embeddings provider** (OpenAI, Anthropic, Groq, etc.) — to generate vector embeddings
2. **Vector database** (Pinecone, etc.) — to store and query vectors

Without these, we can validate:
- Unit tests (DONE - 97/97 pass)
- Database schema (DONE - all correct)
- Code quality (DONE - modernized code is clean)
- Utility functions (DONE - TextChunker, TextExtractor, RRF all work)
- Architecture (DONE - well-decomposed)

But we CANNOT run:
- `VectorizeSourceRecords()` — needs real embeddings provider
- `EmbedTexts()` — needs real AI API key
- `queryIndex()` / `HybridQuery()` — needs real vector DB
- Full `GetDuplicateRecords()` or `CheckSingleRecord()` flows

### Pre-existing `.Get()`/`.Set()` in Sync Package
The `entityVectorSync.ts` file has 10 `.Get()`/`.Set()` calls that were flagged in the modernization plan (Phase 1, Task 1.3) as known tech debt. These are in the Sync package, not in the modernized Dupe/Core code.

---

## Recommendations

1. **Add API Keys**: Configure Pinecone + OpenAI (or equivalents) in the workbench `.env` to enable end-to-end testing
2. **Test with AssociationDB**: The `Member` entity (2,000 records) is ideal for dupe detection testing — many members share organizations and have overlapping data
3. **Fix Sync Package Types**: The `.Get()`/`.Set()` calls in `entityVectorSync.ts` should be addressed in a follow-up PR (they're documented as Task 1.3 in the plan)
4. **Add Integration Tests**: Consider adding a test fixture with mock vector DB that exercises the full `GetDuplicateRecords()` flow with in-memory data

---

## Conclusion

The modernized vector duplicate detection system (PR #2212) is **architecturally sound and well-tested at the unit level**. All 97 unit tests pass, the database schema is correct, the modernized code is free of type safety violations, and the utility functions work correctly with real-world data patterns. The remaining gap is end-to-end testing with real AI/vector services, which requires API credentials not available in this Docker workbench.
