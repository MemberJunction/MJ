# @memberjunction/ai-vector-dupe

<!-- Badges -->
<!-- [![npm version](https://img.shields.io/npm/v/@memberjunction/ai-vector-dupe)](https://www.npmjs.com/package/@memberjunction/ai-vector-dupe) -->
<!-- [![build](https://img.shields.io/github/actions/workflow/status/MemberJunction/MJ/ci.yml?branch=next)](https://github.com/MemberJunction/MJ/actions) -->

**AI-powered duplicate record detection for MemberJunction entities** -- finds, scores, tracks, and optionally auto-merges duplicate records using vector similarity, hybrid search (RRF), and optional reranking, with an optional **LLM reasoning layer** that judges borderline matches per-candidate before they ever reach a human.

> **Two-stage by design.** Vector/hybrid search is the cheap, fast recall stage; the LLM reasoning layer is an *opt-in, threshold-gated* precision stage. Reasoning is **off by default** and, when enabled, only fires for matched sets whose top vector score clears a per-entity `ReasoningThreshold` -- so you pay for the LLM only on the matches that are actually ambiguous. See [LLM Reasoning Layer](#llm-reasoning-layer).

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
                    | 7. LLM reasoning (opt-in,|
                    |    threshold-gated)     |
                    | 8. Persist match results|
                    | 9. Auto-merge (optional)|
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
| `@memberjunction/ai-prompts` | Runs the reasoning prompt in `'Prompt'` mode (`PromptReasoningProvider`) |
| `@memberjunction/record-comparison` | Computes the field-level deltas across a matched set that the reasoner judges |
| `@memberjunction/core` | Core types: `PotentialDuplicateRequest`, `DuplicateDetectionOptions`, etc. |
| `@memberjunction/core-entities` | Generated entity classes for Duplicate Runs, Lists, Entity Documents (incl. the `*Reasoning*` / `AutomationLevel` columns) |
| `@memberjunction/global` | `MJGlobal` class factory (resolves the reasoning provider by mode), `UUIDsEqual` |

> The `'Agent'`-mode provider (`DuplicateReasoningAgentProvider`) is **not** a dependency of this package -- it lives in `@memberjunction/ai-agents` and registers against the reasoning seam at runtime. See [LLM Reasoning Layer](#llm-reasoning-layer).

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

## LLM Reasoning Layer

Vector and hybrid search are good at *recall* (surfacing candidates) but not great at the final *is-this-actually-the-same-entity?* judgment -- two records can be semantically near without being duplicates (a parent company vs. its subsidiary), and two true duplicates can look lexically different (typos, abbreviations, stale addresses). The reasoning layer lets a (possibly small/cheap) LLM make that judgment **per candidate**, on top of the vector scores.

It is **additive and off by default** -- when `EnableLLMReasoning` is false on the Entity Document, the pipeline behaves exactly as the vector-only path documented above.

### Cost control: the reasoning gate

The whole point is *not* to run an LLM on every record. Reasoning runs **once per source record's matched set**, and only when the gate is open. The gate (`DuplicateRecordDetector.IsReasoningGateOpen`) opens when:

1. `EntityDocument.EnableLLMReasoning` is `true`, **and**
2. the set has at least one candidate, **and**
3. the set's **top** vector `MatchProbability` is `>= EntityDocument.ReasoningThreshold` (a `null` threshold means "reason over any non-empty set").

So configuring `ReasoningThreshold = 0.85` means "only spend an LLM call when vector search is already fairly confident" -- you tune the recall/precision/cost tradeoff per entity.

### Configuration (on the Entity Document)

All reasoning configuration lives on the `MJ: Entity Documents` record, per entity:

| Field | Type | Default | Purpose |
|---|---|---|---|
| `EnableLLMReasoning` | `boolean` | `false` | Master switch. Off = vector-only behavior, unchanged. |
| `ReasoningMode` | `'Prompt' \| 'Agent'` | `'Prompt'` | Which provider runs (see below). |
| `ReasoningThreshold` | `number \| null` | `null` | Vector-score gate (0–1). LLM runs only when the set's top score clears this. `null` = reason over any non-empty set. |
| `ReasoningPromptID` | `string \| null` | -- | The AI Prompt to use in `'Prompt'` mode. Falls back to the seeded "Duplicate Resolution" prompt. |
| `ReasoningAgentID` | `string \| null` | -- | The AI Agent to use in `'Agent'` mode. Falls back to the seeded "Duplicate Resolution Agent". |
| `AutomationLevel` | `'ReviewAll' \| 'LLMGated' \| 'AutoMergeAboveAbsolute'` | `'ReviewAll'` | How far automation goes after reasoning (review everything / let the LLM gate review / auto-merge above the absolute threshold). |

### The pluggable provider seam

Reasoning is delegated through an abstract `DuplicateReasoningProvider`, resolved at runtime via the MJ class factory by `ReasoningMode`. Two providers ship; both emit the **identical** `DuplicateReasoningOutput`, so promoting an entity from `Prompt` to `Agent` is a config change, not a rewrite.

| Provider | `@RegisterClass` key | Package | Path |
|---|---|---|---|
| `PromptReasoningProvider` | `PROMPT_REASONING_PROVIDER_KEY` (`'Prompt'`) | `@memberjunction/ai-vector-dupe` | Single-shot AI Prompt. Persists `AIPromptRunID`. |
| `DuplicateReasoningAgentProvider` | `AGENT_REASONING_PROVIDER_KEY` (`'Agent'`) | `@memberjunction/ai-agents` | Orchestrated agent run (unlocks memory-note injection + future context tools). Persists `AIAgentRunID`. |

> The Agent provider lives in `@memberjunction/ai-agents`, **not** this package, because `ai-agents` depends on `ai-vector-dupe` -- importing `AgentRunner` here would create a build cycle. It registers against the seam under the `'Agent'` key, so the detector resolves it via the class factory with no static import back into the pipeline. Registration is handled by the class-registration manifest (no `Load*()` helper needed).

To add a custom reasoning strategy, subclass `DuplicateReasoningProvider`, implement `Reason(input, context)`, and register it under a new mode key:

```typescript
import { RegisterClass } from '@memberjunction/global';
import {
    DuplicateReasoningProvider,
    DuplicateReasoningInput,
    DuplicateReasoningOutput,
    DuplicateReasoningContext,
} from '@memberjunction/ai-vector-dupe';

@RegisterClass(DuplicateReasoningProvider, 'MyMode')
export class MyReasoningProvider extends DuplicateReasoningProvider {
    public async Reason(
        input: DuplicateReasoningInput,
        context: DuplicateReasoningContext,
    ): Promise<DuplicateReasoningOutput> {
        // ...inspect input.SourceRecord, input.Candidates, input.FieldDeltas...
        // return a structured verdict with per-candidate CandidateVerdicts
    }
}
```

### Per-candidate verdicts

A matched set is the top-K neighbors of one source record, so it routinely mixes true duplicates with false positives. The reasoner therefore returns a verdict **per candidate** (`DuplicateReasoningOutput.CandidateVerdicts`), each judged independently against the source -- a false-positive candidate reads `NotDuplicate` even when another candidate in the same set is a confident `Merge`. The detector stamps each candidate's own verdict onto its match row; the set-level `Recommendation`/`Confidence` are *derived* values used only for the group's dominant display and the auto-merge gate.

The output also carries a proposed `SurvivorRecordID` and per-field survivor choices (`FieldChoices`) that feed `Metadata.MergeRecords` at merge time. A `null` `Confidence` means the model returned no usable confidence and must be rendered/stored as "unknown" -- never conflated with a real `0` (which reads as "confidently NOT a duplicate"). See `DuplicateReasoningTypes` for the full contract.

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
| `MJ: Entity Documents` | Configuration: template, AI model, vector DB, thresholds, **and the reasoning config** (`EnableLLMReasoning`, `ReasoningMode`, `ReasoningThreshold`, `ReasoningPromptID`, `ReasoningAgentID`, `AutomationLevel`) |
| `MJ: Lists` / `MJ: List Details` | Source records to check for duplicates |
| `MJ: Duplicate Runs` | Tracks each detection run (status, timing) |
| `MJ: Duplicate Run Details` | Per-record tracking within a run; includes `RecordMetadata` (vector DB metadata snapshot) |
| `MJ: Duplicate Run Detail Matches` | Individual match results with probability scores; includes `RecordMetadata` and, when reasoning ran, the per-candidate LLM verdict columns (recommendation, confidence, reasoning, and `AIPromptRunID`/`AIAgentRunID`) |

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
