# @memberjunction/ai-vector-dupe

<!-- Badges -->
<!-- [![npm version](https://img.shields.io/npm/v/@memberjunction/ai-vector-dupe)](https://www.npmjs.com/package/@memberjunction/ai-vector-dupe) -->
<!-- [![build](https://img.shields.io/github/actions/workflow/status/MemberJunction/MJ/ci.yml?branch=next)](https://github.com/MemberJunction/MJ/actions) -->

**AI-powered duplicate record detection for MemberJunction entities** -- finds, scores, tracks, and optionally auto-merges duplicate records using vector similarity and hybrid search (RRF), with an optional **LLM reasoning layer** that judges borderline matches per-candidate before they ever reach a human, and an **entry-time check** that flags likely duplicates while a person is still typing a new record.

> **Two-stage by design.** Vector/hybrid search is the cheap, fast recall stage; the LLM reasoning layer is an *opt-in, threshold-gated* precision stage. Reasoning is **off by default** and, when enabled, only fires for matched sets whose top vector score clears a per-entity `ReasoningThreshold` -- so you pay for the LLM only on the matches that are actually ambiguous. See [LLM Reasoning Layer](#llm-reasoning-layer).

> **The whole feature, end to end.** This README is the package reference. Setting an entity up, running and reviewing detection, the merge engine and every configuration knob are covered in the **[Duplicate Management Guide](../../../../guides/DUPLICATE_MANAGEMENT_GUIDE.md)**.

---

## Architecture

```
                              +-----------------------------+
                              |   DuplicateRecordDetector   |
                              |     (extends VectorBase)    |
                              +--+-----------+-----------+--+
                                 |           |           |
          +----------------------+           |           +----------------------+
          |                                  |                                  |
+---------v-----------+       +--------------v-------+       +------------------v---+
| GetDuplicateRecords |       |  CheckSingleRecord   |       |  CheckRecordValues   |
| (batch: list, view, |       |  (one saved record,  |       |  (unsaved values,    |
|  filter, or entity) |       |   nothing persisted) |       |   entry-time, flags) |
+---------+-----------+       +--------------+-------+       +------------------+---+
          |                                  |                                  |
          +----------------------------------+----------------------------------+
                                             |
                               +-------------v--------------+
                               |     Detection Pipeline     |
                               +----------------------------+
                               | 1. Resolve Entity Document |
                               | 2. Re-vectorize (opt-in)   |
                               | 3. Render template + embed |
                               | 4. Query vector DB         |
                               |    (hybrid if supported)   |
                               | 5. Drop self, ghost and    |
                               |    record-filtered matches |
                               | 6. Apply potential-match   |
                               |    threshold, trim to TopK |
                               | 7. LLM reasoning (opt-in,  |
                               |    threshold-gated)        |
                               | 8. Persist match results   |
                               |    (batch runs only)       |
                               | 9. Auto-merge (see below)  |
                               +----------------------------+
                                             |
              +------------------------------+-------------------------------+
              |                              |                               |
    +---------v------+             +---------v------+             +----------v--------+
    | ai-vector-sync |             | ai-vectordb    |             | ai-prompts        |
    | (vectorizer,   |             | (VectorDBBase, |             | (AIEmbeddingRunner|
    |  templates,    |             |  hybrid query) |             |  AIPromptRunner,  |
    |  record filter)|             |                |             |  AIDecisionRunner)|
    +----------------+             +----------------+             +-------------------+
```

**Key dependencies:**

| Package | Role |
|---|---|
| `@memberjunction/ai` | Embedding model abstraction and API key resolution |
| `@memberjunction/ai-vectordb` | Vector database abstraction (query, hybrid search) |
| `@memberjunction/ai-vectors` | `VectorBase` base class with metadata and RunView helpers |
| `@memberjunction/ai-vector-sync` | `EntityVectorSyncer` for record vectorization, template parsing |
| `@memberjunction/ai-prompts` | Runs the reasoning prompt in `'Prompt'` mode (`PromptReasoningProvider`) and the typed decision in the `'Decision'` modes (`AIDecisionRunner`) |
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
    ListID: 'your-list-uuid',       // or ViewID, or ExtraFilter, or none of them for the whole entity
    EntityID: 'your-entity-uuid',
    EntityDocumentID: 'your-entity-document-uuid',
    RecordIDs: [],                  // required by the type; batch runs read the records from the list/view/filter
    Options: {
        TopK: 10,
        OnProgress: (progress) => {
            console.log(`[${progress.Phase}] ${progress.ProcessedRecords}/${progress.TotalRecords} -- ${progress.MatchesFound} matches`);
        },
    },
};

const response = await detector.GetDuplicateRecords(request, contextUser);

if (response.Status === 'Success') {
    // PotentialDuplicateResult is capped at 1,000 entries (ResultsTruncated says so);
    // the persisted Duplicate Run Detail Match rows are the full record of the run.
    console.log(`${response.TotalRecordsWithDuplicates} records have potential duplicates`);
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

## The Query Text Is the Stored Text

Each record is matched by embedding its entity document's template text and querying the index with that vector. The text must be the text vector sync embedded for the record, or the query describes a different document than the one stored and genuine duplicates fall below the threshold. So the detector renders the template the way sync does, through the same `EntityDocumentTemplateDataBuilder` from `@memberjunction/ai-vector-sync`:

- from the row `RunView` returns for the record (`ResultType: 'simple'`), not `BaseEntity.GetAll()`, which turns date fields into `Date` objects;
- with the rows of every `Entity` template param (a person's Phones, Emails, Addresses...), loaded once per sub-batch.

If a related param's rows can't be loaded, the batch fails rather than query with text that can't match. An unsaved record (the entry-time check) renders from its own values, with empty related rows.

### Batch runs reuse the stored vector

A batch run first reads the vectors sync already stored for the batch's records (`MJ: Entity Record Documents.VectorBinary`, falling back to `VectorJSON`) in one `RunView`, and queries with those instead of embedding the records again. A stored vector is used only when it was written to the document's current vector index, has the index's `Dimensions`, and its `EntityRecordUpdatedAt` is not older than the record's `__mj_UpdatedAt`; with several rows for a record, the newest is used. Every other record is embedded as before, in one call. This saves one embedding call per record per run and queries with exactly the vector that was indexed. The template text is still rendered for every record, because the hybrid keyword half of the query uses it. The run's completion log line counts stored vectors reused and records embedded. The single-record and entry-time checks always embed.

A run started from a `MJ: Duplicate Runs` record scans the whole entity, one list (`SourceListID`), or one saved view (`SourceViewID`); never a list and a view together.

## DuplicateDetectionOptions Reference

Options are passed via the `Options` property on `PotentialDuplicateRequest`, or directly to `CheckSingleRecord`.

| Option | Type | Default | Description |
|---|---|---|---|
| `TopK` | `number` | `5` | Number of nearest neighbors to keep per record. With a record filter set, the query asks for `3 x TopK` and trims back after filtering. |
| `DuplicateRunID` | `string` | -- | Load and continue an existing Duplicate Run (batch mode only). Processing resumes at the run's `LastProcessedOffset`. |
| `Revectorize` | `boolean` | `false` | Run `EntityVectorSyncer.VectorizeEntity` for the document before detecting. Off by default: detection assumes vectors already exist. |
| `PotentialMatchThreshold` | `number` | -- | Override the Entity Document's `PotentialMatchThreshold` for this run. |
| `AbsoluteMatchThreshold` | `number` | -- | Override the Entity Document's `AbsoluteMatchThreshold` for this run (drives auto-merge). |
| `KeywordSearchWeight` | `number` | `0.3` | Hybrid search only: keyword weight (0.0 = vector only, 1.0 = keyword only). Sent to the provider as `Alpha = 1 - KeywordSearchWeight`. |
| `FusionMethod` | `'rrf' \| 'weighted'` | `'rrf'` | Hybrid search only: passed through to the vector database's `HybridQuery`. |
| `OnProgress` | `(progress: DuplicateDetectionProgress) => void` | -- | Callback for real-time progress reporting. |
| `ReRankingEnabled`, `ReRankingModelID`, `ReRankingTopK` | -- | -- | **Declared on the interface but not implemented** by `DuplicateRecordDetector`; setting them has no effect. See [Reranking](#reranking). |
| `IncrementalOnly` | `boolean` | -- | **Declared on the interface but not implemented**; every run checks every record in its scope. |

### Thresholds

Thresholds can be configured at two levels -- on the `EntityDocument` record (default) or overridden per-run via `DuplicateDetectionOptions`. When threshold overrides are provided in the options, they take precedence over the EntityDocument values.

| Threshold | Purpose |
|---|---|
| `PotentialMatchThreshold` | Minimum similarity score to report a candidate as a potential duplicate |
| `AbsoluteMatchThreshold` | Minimum similarity score to trigger automatic record merge |

When a run is started by saving a `MJ: Duplicate Runs` record (the dashboard path), the server entity (`MJDuplicateRunEntityServer`) treats a threshold `<= 0` or `>= 1.0` as unconfigured and substitutes `0.70` (potential) or `0.95` (absolute), then passes both as per-run overrides. Calling `GetDuplicateRecords` directly applies the document's values as they are.

> **Auto-merge without reasoning.** With `EnableLLMReasoning = false`, any candidate at or above `AbsoluteMatchThreshold` is **merged automatically** at the end of a batch run when the entity has `AllowRecordMerge = true` -- `AutomationLevel` is ignored on that path. Keep `AbsoluteMatchThreshold` high (or `AllowRecordMerge` off) until you trust the scores. See [Auto-merge](#auto-merge).

---

## Hybrid Search and Reciprocal Rank Fusion (RRF)

When the configured vector database supports hybrid search (`VectorDBBase.SupportsHybridSearch === true`), the detector calls `HybridQuery` instead of `QueryIndex`, combining **vector similarity** and **keyword search**. Today only the colocated pgvector provider (`PgVectorColocatedDatabase`) reports hybrid support; the Simple Vector Service, Pinecone, Qdrant, SQL Server and standalone pgvector providers run pure vector queries, so `KeywordSearchWeight` and `FusionMethod` have no effect there.

### How It Works

1. The record's template text is sent as both a vector embedding and a keyword query.
2. The vector DB returns results from both retrieval methods.
3. The vector DB fuses them with the requested `FusionMethod` (`'rrf'`, **Reciprocal Rank Fusion**, by default -- a rank-based algorithm that is score-scale independent).

### RRF Formula

```
FusedScore(d) = SUM_i [ 1 / (k + rank_i(d)) ]
```

Where `rank_i(d)` is the 1-based rank of document `d` in list `i`, and `k` is a smoothing constant (default: 60).

### Using ComputeRRF Directly

`ComputeRRF` lives in `@memberjunction/core`; this package still re-exports it for backward compatibility, but new code should import it from core:

```typescript
import { ComputeRRF, ScoredCandidate } from '@memberjunction/core';

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

`DuplicateDetectionOptions` declares `ReRankingEnabled`, `ReRankingModelID` and `ReRankingTopK`, but `DuplicateRecordDetector` does **not** apply a reranking pass today: the options are accepted and ignored. Candidates are ordered by the vector (or hybrid) score the vector database returns. For a precision stage on top of vector recall, use the [LLM Reasoning Layer](#llm-reasoning-layer), which judges each candidate individually.

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
| `ReasoningMode` | `'Prompt' \| 'Agent' \| 'Decision' \| 'DecisionThenPrompt'` | `'Prompt'` | Which provider runs (see below). |
| `ReasoningThreshold` | `number \| null` | `null` | Vector-score gate (0–1). LLM runs only when the set's top score clears this. `null` = reason over any non-empty set. |
| `ReasoningPromptID` | `string \| null` | -- | The AI Prompt to use in `'Prompt'` mode. Falls back to the seeded "Duplicate Resolution" prompt. |
| `ReasoningAgentID` | `string \| null` | -- | The AI Agent to use in `'Agent'` mode. Falls back to the seeded "Duplicate Resolution Agent". |
| `AutomationLevel` | `'ReviewAll' \| 'LLMGated' \| 'AutoMergeAboveAbsolute'` | `'ReviewAll'` | How far automation goes after reasoning (review everything / let the LLM gate review / auto-merge a candidate above the absolute threshold whose own verdict is `Merge`). |

### The pluggable provider seam

Reasoning is delegated through an abstract `DuplicateReasoningProvider`, resolved at runtime via the MJ class factory by `ReasoningMode`. Four providers ship, and all emit the same `DuplicateReasoningOutput`. `Prompt` and `Agent` run the same instruction set, so promoting an entity from `Prompt` to `Agent` is a config change, not a rewrite. The two decision modes put a typed decision model (the seeded "Default Decision" prompt, run through `AIDecisionRunner`) in front of, or in place of, the prompt.

| Provider | `@RegisterClass` key | Package | Path |
|---|---|---|---|
| `PromptReasoningProvider` | `PROMPT_REASONING_PROVIDER_KEY` (`'Prompt'`) | `@memberjunction/ai-vector-dupe` | Single-shot AI Prompt. Persists `AIPromptRunID`. |
| `DuplicateReasoningAgentProvider` | `AGENT_REASONING_PROVIDER_KEY` (`'Agent'`) | `@memberjunction/ai-agents` | Orchestrated agent run (unlocks memory-note injection + future context tools). Persists `AIAgentRunID`. |
| `DecisionReasoningProvider` | `DECISION_REASONING_PROVIDER_KEY` (`'Decision'`) | `@memberjunction/ai-vector-dupe` | One decision call per set, with one Likelihood per candidate. The probability is **calibrated** per decision model (`DUPLICATE_DECISION_CALIBRATION`; override `CalibrationFor` for another model). Recommends only: `Uncertain` (flagged for review) at or above its threshold (a calibrated `0.7` by default, `DEFAULT_UNCERTAIN_ABOVE`), else `NotDuplicate`. A candidate with no calibrated probability (no answer, or a model with no calibration) is `Uncertain`. Never `Merge`, so it never auto-merges. Persists `AIPromptRunID`. |
| `DecisionThenPromptReasoningProvider` | `DECISION_THEN_PROMPT_REASONING_PROVIDER_KEY` (`'DecisionThenPrompt'`) | `@memberjunction/ai-vector-dupe` | The decision drops candidates below its pre-filter threshold (a calibrated `0.3`, `PRE_FILTER_UNCERTAIN_ABOVE`, which keeps recall), then the `'Prompt'` provider reasons over the survivors and may recommend `Merge`. A candidate with no calibrated probability is kept. A dropped candidate reads `NotDuplicate` and its row points at the decision run. With no survivors the prompt never runs; if the decision fails, every candidate goes to the prompt. Both stages resolve through the class factory, so overrides of `'Decision'` and `'Prompt'` apply inside the chain. |

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

A matched set is the top-K neighbors of one source record, so it routinely mixes true duplicates with false positives. The reasoner therefore returns a verdict **per candidate** (`DuplicateReasoningOutput.CandidateVerdicts`), each judged independently against the source -- a false-positive candidate reads `NotDuplicate` even when another candidate in the same set is a confident `Merge`. The detector stamps each candidate's own verdict onto its match row; the set-level `Recommendation`/`Confidence` are *derived* values used for the group's dominant display. Auto-merge (`AutoMergeAboveAbsolute`) requires both the set-level recommendation and the candidate's own verdict (carried on `PotentialDuplicate.ReasoningRecommendation`) to be `Merge`, so a candidate is never merged because another candidate in its set is a duplicate.

The output also carries a proposed `SurvivorRecordID` and per-field survivor choices (`FieldChoices`) that feed `Metadata.MergeRecords` at merge time. A `null` `Confidence` means the model returned no usable confidence and must be rendered/stored as "unknown" -- never conflated with a real `0` (which reads as "confidently NOT a duplicate"). See `DuplicateReasoningTypes` for the full contract.

---

## Entry-Time Check

`CheckRecordValues` checks the values a person is entering for a **new** record and flags existing records that look like the same thing. It saves, merges and blocks nothing. The `CheckDuplicateEntry` GraphQL mutation (in `@memberjunction/server`) and `GraphQLAIClient.CheckDuplicateEntry` (in `@memberjunction/graphql-dataprovider`) expose it to clients, and `@memberjunction/ng-base-forms` calls it from new-record forms.

```typescript
import { DuplicateRecordDetector } from '@memberjunction/ai-vector-dupe';

const detector = new DuplicateRecordDetector(provider);
const result = await detector.CheckRecordValues('Accounts', { Name: 'Acme Corp', City: 'Boston' }, contextUser);
if (result.Status === 'Checked') {
    for (const c of result.Candidates) {
        console.log(`${c.DisplayName}: vector ${c.VectorScore}, probability ${c.Probability ?? 'unknown'}`);
    }
}
```

- **The switch.** The check runs only for an entity with an **Active** entity document that has `EnableLLMReasoning = true` and `ReasoningMode` of `'Decision'` or `'DecisionThenPrompt'`. Otherwise the result is `NotConfigured`. When several documents qualify, the oldest (earliest `__mj_CreatedAt`, then lowest ID) wins.
- **Candidates.** The values become an unsaved entity object (each text value cut to `DUPLICATE_ENTRY_CHECK_MAX_FIELD_TEXT_LENGTH`, 500 characters), rendered by the document's template, embedded and queried with the same TopK and potential-match threshold as `CheckSingleRecord`.
- **Permission.** The candidates are narrowed to the records the context user can read, with one `RunView` as that user. A context user is required.
- **Decision.** One typed-decision call (`DecisionReasoningProvider.DecideCandidates`) over the readable candidates, in either mode -- the prompt half of `'DecisionThenPrompt'` is too slow for typing. The decision state carries at most `DUPLICATE_ENTRY_CHECK_MAX_DECISION_FIELDS` (40) differing fields, the entered ones first. A candidate is flagged when the decision bands it `Uncertain` (calibrated probability at or above `DecisionReasoningProvider.UncertainAbove`), or when the decision gave no answer for it.
- **Failure.** A failed decision, or a decision from a model with no calibration, flags nothing and returns `Failed` with the reason.
- **Budget.** The whole check is bounded by `options.TimeoutMS` (default `DUPLICATE_ENTRY_CHECK_SERVER_BUDGET_MS`, 2,000 ms) and `options.CancellationToken`; the decision's model call is aborted with it. A check that runs out of time is `Failed`.

## Auto-Merge

After a batch run (`GetDuplicateRecords`) has processed every record, the detector merges the eligible pairs with `Metadata.MergeRecords`, using the **source record as the survivor** and applying the reasoner's resolved field map when there is one. Nothing is merged when the entity has `AllowRecordMerge = false`; the matches are kept for manual review. `CheckSingleRecord` and `CheckRecordValues` never merge.

| `EnableLLMReasoning` | `AutomationLevel` | A candidate auto-merges when |
|---|---|---|
| `false` | *(ignored)* | its vector score is at or above `AbsoluteMatchThreshold` |
| `true` | `ReviewAll` or `LLMGated` | never |
| `true` | `AutoMergeAboveAbsolute` | its vector score is at or above `AbsoluteMatchThreshold` **and** the set's recommendation is `Merge` **and** the candidate's own verdict is `Merge` |

Each merge is guarded on its own: a failure is logged and the run continues. A successful merge sets the match row's `MergeStatus = 'Complete'`, `Action = 'Merged'` and `MergedAt`.

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
| `Vectorizing` | Records are being vectorized via `EntityVectorSyncer` (only with `Revectorize: true`) |
| `Loading` | The ids of the records to check are being loaded |
| `Embedding` | Template texts are being embedded via the AI model |
| `Querying` | Vector DB is being queried for each record |
| `Matching` | Results are being persisted and match records created |
| `Merging` | High-confidence matches are being auto-merged |

### DuplicateDetectionProgress Shape

```typescript
interface DuplicateDetectionProgress {
    Phase: 'Vectorizing' | 'Loading' | 'Embedding' | 'Querying' | 'Matching' | 'Merging';
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
| `constructor` | `(provider?: IMetadataProvider \| null)` | Pass the request-scoped provider on a server so every read and write uses that connection. |
| `GetDuplicateRecords` | `(params: PotentialDuplicateRequest, contextUser?: UserInfo) => Promise<PotentialDuplicateResponse>` | Batch detection over a list (`ListID`), a saved view (`ViewID`), an `ExtraFilter`, or the whole entity. Persists a Duplicate Run, its details and matches, then auto-merges eligible pairs. |
| `CheckSingleRecord` | `(EntityDocumentID: string, RecordID: CompositeKey, Options?: DuplicateDetectionOptions, ContextUser?: UserInfo) => Promise<PotentialDuplicateResult>` | Check one saved record. Runs reasoning when the gate opens; persists nothing and never merges. Throws when the document or record is missing. |
| `CheckRecordValues` | `(entityName: string, values: Record<string, unknown>, contextUser: UserInfo, options?: DuplicateEntryCheckOptions) => Promise<DuplicateEntryCheckResult>` | Entry-time check of unsaved values. Flags only; never throws. See [Entry-Time Check](#entry-time-check). |
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

## Excluding Records: the Record Filter

An entity document can name the records that take part in duplicate detection with `recordFilter.extraFilter` in its `Configuration` JSON, a RunView `ExtraFilter` predicate on the document's entity:

```json
{ "recordFilter": { "extraFilter": "ind_delete_flag <> '1'" } }
```

A record that fails the filter is never checked by a batch run and never offered as a candidate, yet stays readable everywhere else. `CheckSingleRecord` and the entry-time check still check the record they are given, since the caller asked about that record; only its candidates are filtered. Typical uses are records a source system has flagged deleted or merged, and inactive records.

- **Records checked.** A whole-entity run ANDs the filter into its own `ExtraFilter`; a list or view run is narrowed to the members that pass it.
- **Candidates.** Vector sync skips filtered records too, but their vectors can already be in the index, so every match is checked against the filter with the existence check that drops orphaned vectors. This applies to batch runs, `CheckSingleRecord` and the entry-time check.
- **TopK.** With a filter set, the query asks for three times TopK and the result is trimmed back to TopK after filtering, so excluded records don't take a genuine duplicate's slot.
- **Errors.** If the filter can't be applied (a typo in a column name, say), the run fails instead of letting excluded records through.
- **SQL.** Keep the filter to plain comparisons on the entity's columns (`=`, `<>`, `IN`, `IS NULL`, `AND`/`OR`). On PostgreSQL, MJ quotes identifiers, converts `[brackets]`, turns `= 0`/`= 1` on boolean columns into `FALSE`/`TRUE`, and translates `GETDATE()`, `GETUTCDATE()`, `SYSDATETIMEOFFSET()` and `DATEADD`. Other T-SQL, such as `ISNULL`, `LEN` or `+` string concatenation, is passed through unchanged and fails there.

Vector sync applies the same filter to the records it vectorizes; see the [Sync README](../Sync/README.md#record-filter). Vectors already stored for records the filter now excludes are not removed by sync.

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
| `MJ: Duplicate Runs` | Tracks each detection run: status, timing, the Entity Document used, progress (`TotalItemCount`, `ProcessedItemCount`), the resume cursor (`LastProcessedOffset`) and `CancellationRequested` |
| `MJ: Duplicate Run Details` | Per-record tracking within a run; includes `RecordMetadata` (vector DB metadata snapshot) |
| `MJ: Duplicate Run Detail Matches` | Individual match results with probability scores; includes `RecordMetadata` and, when reasoning ran, the per-candidate LLM verdict columns (recommendation, confidence, reasoning, and `AIPromptRunID`/`AIAgentRunID`) |
| `MJ: Record Merge Logs` / `MJ: Record Merge Deletion Logs` | Written by `MergeRecords` for every auto-merge (one log per merge, one deletion log per merged-away record) |

---

## Further Reading

- **[Duplicate Management Guide](../../../../guides/DUPLICATE_MANAGEMENT_GUIDE.md)** -- the end-to-end guide: entity setup, vectorization, running and reviewing detection, LLM reasoning, the entry-time check, merging, configuration reference and troubleshooting
- **[Record Comparison](../../../RecordComparison/README.md)** -- the field-delta engine behind the reasoning input and the merge comparison panel
- **[Agents](../../Agents/README.md)** -- home of the `'Agent'`-mode reasoning provider
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

Business Source License 1.1 — see [LICENSE](../../../../LICENSE) for details.
