# @memberjunction/ai-vector-dupe

<!-- Badges -->
<!-- [![npm version](https://img.shields.io/npm/v/@memberjunction/ai-vector-dupe)](https://www.npmjs.com/package/@memberjunction/ai-vector-dupe) -->
<!-- [![build](https://img.shields.io/github/actions/workflow/status/MemberJunction/MJ/ci.yml?branch=next)](https://github.com/MemberJunction/MJ/actions) -->

**AI-powered duplicate record detection for MemberJunction entities** -- finds, scores, tracks, and optionally auto-merges duplicate records using vector similarity, hybrid search (RRF), and optional reranking.

---

## Architecture

```
                         +--------------------------+
                         |   DuplicateRecordDetector |
                         |   (extends VectorBase)    |
                         +-----+----------+---------+
                               |          |
              +----------------+          +----------------+
              |                                            |
    +---------v----------+                     +-----------v---------+
    | GetDuplicateRecords|                     |  CheckSingleRecord  |
    | (list-based batch) |                     |  (single record)    |
    +--------+-----------+                     +-----------+---------+
             |                                             |
             +-------------------+-------------------------+
                                 |
                    +------------v------------+
                    |    Detection Pipeline   |
                    +-------------------------+
                    | 1. Validate Entity Doc  |
                    | 2. Vectorize records    |
                    | 3. Embed via AI model   |
                    | 4. Query vector DB      |
                    |    (hybrid if supported)|
                    | 5. Filter self-matches  |
                    | 6. Apply thresholds     |
                    | 7. Persist match results|
                    | 8. Auto-merge (optional)|
                    +-------------------------+
                                 |
              +------------------+------------------+
              |                  |                   |
    +---------v------+  +-------v--------+  +-------v--------+
    | ai-vector-sync |  | ai-vectordb    |  | ai (Embeddings)|
    | (vectorizer,   |  | (VectorDBBase, |  | (BaseEmbeddings|
    |  templates)    |  |  hybrid query) |  |  GetAIAPIKey)  |
    +----------------+  +----------------+  +----------------+
```

**Key dependencies:**

| Package | Role |
|---|---|
| `@memberjunction/ai` | Embedding model abstraction and API key resolution |
| `@memberjunction/ai-vectordb` | Vector database abstraction (query, hybrid search) |
| `@memberjunction/ai-vectors` | `VectorBase` base class with metadata and RunView helpers |
| `@memberjunction/ai-vector-sync` | `EntityVectorSyncer` for record vectorization, template parsing |
| `@memberjunction/core` | Core types: `PotentialDuplicateRequest`, `DuplicateDetectionOptions`, etc. |
| `@memberjunction/core-entities` | Generated entity classes for Duplicate Runs, Lists, Entity Documents |
| `@memberjunction/global` | `MJGlobal` class factory, `UUIDsEqual` |

---

## Installation

```bash
npm install @memberjunction/ai-vector-dupe
```

---

## Quick Start

### List-Based Batch Detection

Detect duplicates across all records in an MJ List:

```typescript
import { DuplicateRecordDetector } from '@memberjunction/ai-vector-dupe';
import { PotentialDuplicateRequest } from '@memberjunction/core';

const detector = new DuplicateRecordDetector();

const request: PotentialDuplicateRequest = {
    ListID: 'your-list-uuid',
    EntityID: 'your-entity-uuid',
    EntityDocumentID: 'your-entity-document-uuid',
    Options: {
        TopK: 10,
        OnProgress: (progress) => {
            console.log(`[${progress.Phase}] ${progress.ProcessedRecords}/${progress.TotalRecords} -- ${progress.MatchesFound} matches`);
        },
    },
};

const response = await detector.GetDuplicateRecords(request, contextUser);

if (response.Status === 'Success') {
    for (const result of response.PotentialDuplicateResult) {
        console.log(`Record: ${result.RecordCompositeKey.ToString()}`);
        for (const dupe of result.Duplicates) {
            console.log(`  Match: ${dupe.ToString()} (${(dupe.ProbabilityScore * 100).toFixed(1)}%)`);
        }
    }
}
```

### Single-Record Check

Check one record for duplicates without creating a list -- ideal for server hooks (e.g., fire-and-forget after record save):

```typescript
import { DuplicateRecordDetector } from '@memberjunction/ai-vector-dupe';
import { CompositeKey } from '@memberjunction/core';

const detector = new DuplicateRecordDetector();

const recordKey = new CompositeKey([{ FieldName: 'ID', Value: 'record-uuid' }]);

const result = await detector.CheckSingleRecord(
    'your-entity-document-uuid',
    recordKey,
    { TopK: 5 },
    contextUser
);

for (const dupe of result.Duplicates) {
    console.log(`Potential duplicate: ${dupe.ToString()} (score: ${dupe.ProbabilityScore})`);
}
```

---

## DuplicateDetectionOptions Reference

Options are passed via the `Options` property on `PotentialDuplicateRequest`, or directly to `CheckSingleRecord`.

| Option | Type | Default | Description |
|---|---|---|---|
| `TopK` | `number` | `5` | Number of nearest neighbors to retrieve per record |
| `DuplicateRunID` | `string` | -- | Resume an existing duplicate run (batch mode only) |
| `KeywordSearchWeight` | `number` | `0.3` | Weight for keyword search in hybrid mode (0.0 = vector only, 1.0 = keyword only). Vector weight is `1.0 - KeywordSearchWeight`. |
| `FusionMethod` | `string` | `'rrf'` | Fusion method for hybrid search. Currently supports `'rrf'` (Reciprocal Rank Fusion). |
| `PotentialMatchThreshold` | `number` | -- | Override the EntityDocument's PotentialMatchThreshold for this run |
| `AbsoluteMatchThreshold` | `number` | -- | Override the EntityDocument's AbsoluteMatchThreshold for this run |
| `OnProgress` | `(progress: DuplicateDetectionProgress) => void` | -- | Callback for real-time progress reporting |

### Thresholds

Thresholds can be configured at two levels -- on the `EntityDocument` record (default) or overridden per-run via `DuplicateDetectionOptions`. When threshold overrides are provided in the options, they take precedence over the EntityDocument values.

| Threshold | Purpose |
|---|---|
| `PotentialMatchThreshold` | Minimum similarity score to report a candidate as a potential duplicate |
| `AbsoluteMatchThreshold` | Minimum similarity score to trigger automatic record merge |

A server hook normalizes `1.0` thresholds to sensible defaults (`0.70` for potential, `0.95` for absolute) to prevent degenerate behavior when thresholds are left at the maximum.

---

## Hybrid Search and Reciprocal Rank Fusion (RRF)

When the configured vector database supports hybrid search (`VectorDBBase.SupportsHybridSearch === true`), the detector automatically combines **vector similarity** and **keyword search** for higher-quality results.

### How It Works

1. The record's template text is sent as both a vector embedding and a keyword query.
2. The vector DB returns results from both retrieval methods.
3. Results are fused using **Reciprocal Rank Fusion (RRF)**, a rank-based algorithm that is score-scale independent.

### RRF Formula

```
FusedScore(d) = SUM_i [ 1 / (k + rank_i(d)) ]
```

Where `rank_i(d)` is the 1-based rank of document `d` in list `i`, and `k` is a smoothing constant (default: 60).

### Using ComputeRRF Directly

The `ComputeRRF` utility is exported for use in custom pipelines:

```typescript
import { ComputeRRF, ScoredCandidate } from '@memberjunction/ai-vector-dupe';

const vectorResults: ScoredCandidate[] = [
    { ID: 'rec-1', Score: 0.95 },
    { ID: 'rec-2', Score: 0.87 },
    { ID: 'rec-3', Score: 0.82 },
];

const keywordResults: ScoredCandidate[] = [
    { ID: 'rec-2', Score: 12.5 },  // Different scale -- RRF handles this
    { ID: 'rec-4', Score: 10.1 },
    { ID: 'rec-1', Score: 8.3 },
];

const fused = ComputeRRF([vectorResults, keywordResults], 60);
// Results sorted by fused RRF score, score-scale independent
```

### Tuning Hybrid Search

- **`KeywordSearchWeight = 0.0`**: Pure vector similarity (semantic matching).
- **`KeywordSearchWeight = 0.3`** (default): Slight keyword boost. Good for entities with distinctive names or codes.
- **`KeywordSearchWeight = 0.5`**: Equal weight. Useful when both semantic and lexical matches matter.
- **`KeywordSearchWeight = 1.0`**: Pure keyword search (not recommended for duplicate detection).

---

## Reranking

When MJ's `BaseReranker` / `RerankerService` is configured, the detector can apply a second-stage reranking pass after initial retrieval. Reranking uses a cross-encoder model to re-score candidates with higher precision than embedding-based similarity alone.

Reranking is especially effective when:
- Initial retrieval returns many borderline candidates
- Entity records have complex, multi-field structures
- You need to maximize precision at the cost of slightly higher latency

See the [Duplicate Detection Guide](docs/DUPLICATE_DETECTION_GUIDE.md#reranking-integration) for configuration details.

---

## Progress Reporting

The `OnProgress` callback fires at each phase of the pipeline:

```typescript
const request: PotentialDuplicateRequest = {
    // ...
    Options: {
        OnProgress: (progress) => {
            const { Phase, TotalRecords, ProcessedRecords, MatchesFound, ElapsedMs } = progress;
            const pct = TotalRecords > 0 ? ((ProcessedRecords / TotalRecords) * 100).toFixed(0) : '0';
            console.log(`[${Phase}] ${pct}% -- ${MatchesFound} matches (${ElapsedMs}ms)`);
        },
    },
};
```

### Progress Phases

| Phase | Description |
|---|---|
| `Vectorizing` | Records are being vectorized via `EntityVectorSyncer` |
| `Embedding` | Template texts are being embedded via the AI model |
| `Querying` | Vector DB is being queried for each record |
| `Matching` | Results are being persisted and match records created |
| `Merging` | High-confidence matches are being auto-merged |

### DuplicateDetectionProgress Shape

```typescript
interface DuplicateDetectionProgress {
    Phase: 'Vectorizing' | 'Embedding' | 'Querying' | 'Matching' | 'Merging';
    TotalRecords: number;
    ProcessedRecords: number;
    MatchesFound: number;
    CurrentRecordID?: string;
    ElapsedMs: number;
}
```

---

## API Reference Summary

### DuplicateRecordDetector

| Method | Signature | Description |
|---|---|---|
| `GetDuplicateRecords` | `(params: PotentialDuplicateRequest, contextUser?: UserInfo) => Promise<PotentialDuplicateResponse>` | Run batch duplicate detection for all records in a list |
| `CheckSingleRecord` | `(EntityDocumentID: string, RecordID: CompositeKey, Options?: DuplicateDetectionOptions, ContextUser?: UserInfo) => Promise<PotentialDuplicateResult>` | Check a single record for duplicates |
| `ParseVectorMatches` | `(queryResponse: BaseResponse, sourceKey?: CompositeKey) => PotentialDuplicateResult` | Parse raw vector DB response into typed results |

### ComputeRRF

```typescript
function ComputeRRF(rankedLists: ScoredCandidate[][], k?: number): ScoredCandidate[]
```

Compute Reciprocal Rank Fusion across multiple ranked result lists. Returns candidates sorted by descending fused score.

### ScoredCandidate

```typescript
interface ScoredCandidate {
    ID: string;
    Score: number;
    Metadata?: Record<string, unknown>;
}
```

---

## Inverse Match Deduplication

The detector maintains a `_seenPairs` set across the entire run to suppress inverse duplicates. If record A is identified as a duplicate of record B (A->B), the reverse match (B->A) is automatically suppressed. Pair keys use canonical ordering (`smallerID::largerID`) for consistent deduplication regardless of query direction.

## RecordID Format and Metadata

- **RecordID and MatchRecordID** are stored in MJ URL segment format (e.g., `ID|uuid`), making them compatible with `CompositeKey` for entities with composite primary keys.
- **RecordMetadata** is stored on both `DuplicateRunDetail` and `DuplicateRunDetailMatch` entities, capturing the vector database metadata snapshot at detection time. This preserves the context used for matching even if the source record changes later.

## Database Entities

The package reads from and writes to these MJ entities:

| Entity | Purpose |
|---|---|
| `MJ: Entity Documents` | Configuration: template, AI model, vector DB, thresholds |
| `MJ: Lists` / `MJ: List Details` | Source records to check for duplicates |
| `MJ: Duplicate Runs` | Tracks each detection run (status, timing) |
| `MJ: Duplicate Run Details` | Per-record tracking within a run; includes `RecordMetadata` (vector DB metadata snapshot) |
| `MJ: Duplicate Run Detail Matches` | Individual match results with probability scores; includes `RecordMetadata` for the matched record |

---

## Further Reading

- **[Duplicate Detection Guide](docs/DUPLICATE_DETECTION_GUIDE.md)** -- comprehensive developer guide covering end-to-end workflow, threshold tuning, hybrid search deep dive, performance optimization, and troubleshooting
- **[MemberJunction AI Vectors](../Core/README.md)** -- base vector infrastructure
- **[AI Vector Sync](../Sync/README.md)** -- entity vectorization and template parsing

---

## Development

```bash
# Build
npm run build

# Run tests
npm run test

# Watch mode
npm run test:watch
```

## License

ISC
