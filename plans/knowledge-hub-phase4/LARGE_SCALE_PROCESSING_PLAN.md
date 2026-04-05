# Large-Scale Processing Plan: Content Classification & Duplicate Detection

> **Scope**: Handle 100K+ documents through the classification pipeline and duplicate detection system without exhausting memory, exceeding API rate limits, or losing progress on failure. Unify all AI model call tracking through the existing AIPromptRun infrastructure.

---

## 1. Extend ContentProcessRun + Add ContentProcessRunDetail

### Extend Existing: ContentProcessRun

Current columns: `ID`, `SourceID`, `StartTime`, `EndTime`, `Status`, `ProcessedItems`, `__mj_*`

**New columns (migration):**

| Column | Type | Default | Purpose |
|---|---|---|---|
| StartedByUserID | UNIQUEIDENTIFIER NULL | — | FK → User |
| TotalItemCount | INT NULL | — | Total items for progress % |
| LastProcessedOffset | INT NULL | 0 | Resume cursor (StartRow of last batch) |
| BatchSize | INT NULL | 100 | Batch size for this run |
| ErrorCount | INT NULL | 0 | Running error count |
| ErrorMessage | NVARCHAR(MAX) NULL | — | Error details if failed |
| CancellationRequested | BIT NOT NULL | 0 | Cancel/pause flag |
| Configuration | NVARCHAR(MAX) NULL | — | JSONType: IContentProcessRunConfiguration |

Status values expanded: `Running` / `Paused` / `Completed` / `Failed` / `Cancelled`

### New: ContentProcessRunDetail

| Column | Type | Purpose |
|---|---|---|
| ID | UNIQUEIDENTIFIER | PK |
| ContentProcessRunID | UNIQUEIDENTIFIER | FK → ContentProcessRun |
| ContentSourceID | UNIQUEIDENTIFIER | FK → ContentSource |
| ContentSourceTypeID | UNIQUEIDENTIFIER | FK → ContentSourceType |
| Status | NVARCHAR(20) | Running / Completed / Failed / Skipped |
| ItemsProcessed | INT | Items processed |
| ItemsTagged | INT | Items tagged by LLM |
| ItemsVectorized | INT | Items embedded + upserted |
| TagsCreated | INT | ContentItemTag records created |
| ErrorCount | INT | Errors for this source |
| StartTime | DATETIMEOFFSET | Source processing start |
| EndTime | DATETIMEOFFSET | Source processing end |
| TotalTokensUsed | INT | Rollup tokens (tag + embed) |
| TotalCost | DECIMAL(18,6) | Rollup cost |

### New: ContentProcessRunPromptRun (Junction)

Links ContentProcessRunDetail to AIPromptRun records (firm FKs, no JSON arrays).

| Column | Type | Purpose |
|---|---|---|
| ID | UNIQUEIDENTIFIER | PK |
| ContentProcessRunDetailID | UNIQUEIDENTIFIER | FK → ContentProcessRunDetail |
| AIPromptRunID | UNIQUEIDENTIFIER | FK → AIPromptRun |
| RunType | NVARCHAR(20) | 'Tag' or 'Embed' |

Cost/token analytics: JOIN through this table to aggregate from AIPromptRun.

### DuplicateRunDetail Extension

Add `StartedAt` / `EndedAt` (DATETIMEOFFSET) to existing `DuplicateRunDetail`.

### DuplicateRun Extension

Add: `TotalItemCount`, `ProcessedItemCount`, `LastProcessedOffset`, `BatchSize`, `CancellationRequested`.

---

## 2. Unified AI Model Call Tracking

### New AIPromptType: Embedding

Add via `metadata/prompt-types/` (NOT migration — seed data goes in metadata):

```json
{
  "fields": {
    "Name": "Embedding",
    "Description": "Uses an embedding model to convert text to vector representation"
  }
}
```

### AIModelRunner (New Class in @memberjunction/ai-core-plus)

Lightweight model call tracker. Creates AIPromptRun records for ANY model type.

**What AIModelRunner handles:**
- AIPromptRun record creation (before call) and completion (after call)
- ModelUsage extraction from any model result → store tokens/cost/timing
- Model selection + vendor failover (reused from existing prompt infra)
- Failover tracking

**What stays in AIPromptRunner (extends AIModelRunner):**
- Template rendering (Nunjucks)
- Prompt composition (`{{query:"..."}}`)
- Output validation + JSON repair
- Retry logic with validation
- Response format enforcement

**No new columns on AIPromptRun** — `PromptID` stays NOT NULL. Embedding calls reference an AIPrompt of type "Embedding". The model type is determined by `PromptID → AIPrompt → TypeID → AIPromptType`.

### New AIPrompts (metadata)

- "Content Embedding" — type: Embedding, linked to embedding models
- "Tag Semantic Matching" — type: Embedding, for TagEngine resolution

---

## 3. Rate Limiting & Throttling

`RateLimiter` class in `@memberjunction/content-autotagging`:
- Token bucket with `tokensPerMinute` and `requestsPerMinute`
- Exponential backoff on 429 errors (1s → 2s → 4s → ... → 60s)
- Per-provider instances (LLM, embedding, vector DB)

### Configuration (JSONType: IContentProcessRunConfiguration)

```typescript
export interface IContentProcessRunConfiguration {
    Pipeline?: {
        BatchSize?: number;                    // default: 100
        MaxConcurrentBatches?: number;         // default: 1
        DelayBetweenBatchesMs?: number;        // default: 200
        ResumeFromLastBatch?: boolean;         // default: true
        ErrorThresholdPercent?: number;        // default: 20
    };
    RateLimits?: {
        LLM?: { RequestsPerMinute?: number; TokensPerMinute?: number };
        Embedding?: { RequestsPerMinute?: number; TokensPerMinute?: number };
        VectorDB?: { RequestsPerMinute?: number };
    };
}
```

---

## 4. Memory Management

Paginated processing using `RunView` with `StartRow` and `MaxRows`, ordering by `__mj_CreatedAt DESC`:

```typescript
let offset = run.LastProcessedOffset ?? 0;
while (true) {
    const batch = await rv.RunView<Record<string, unknown>>({
        EntityName: 'MJ: Content Items',
        OrderBy: '__mj_CreatedAt DESC',
        StartRow: offset,
        MaxRows: batchSize,
        Fields: ['ID', 'Text', 'Name', 'ContentSourceID', 'Checksum'],
        ResultType: 'simple'
    });
    if (batch.Results.length === 0) break;

    await processBatch(batch.Results);
    offset += batchSize;

    run.LastProcessedOffset = offset;
    run.ProcessedItemCount += batch.Results.length;
    await run.Save(); // Persist cursor for crash recovery
}
```

---

## 5. Progress Tracking

Extend `PipelineProgressNotification` with: `EstimatedRemainingMs`, `SourceID`, `ErrorCount`, `BatchNumber`, `TotalBatches`.

ETA: rolling window of last 10 batch durations.

Circuit breaker: halt if error rate > configurable threshold (default 20%).

---

## 6. Duplicate Detection at Scale

- Batch vector queries (100 at a time)
- Partition by entity
- Incremental-only option
- Store results in existing DuplicateRunDetail + DuplicateRunDetailMatch
- Extended DuplicateRun with resume/progress columns

---

## 7. Pipeline Config UX

Visual widgets for IContentProcessRunConfiguration — NOT raw JSON text:
- Sliders for rate limits and thresholds
- Toggle switches for booleans
- Number inputs with steppers
- Built as custom form section, conditionally shown

---

## 8. Cancel / Pause / Resume

- `CancellationRequested` flag checked between batches
- `PauseClassificationPipeline(runID)` mutation sets flag + Status='Paused'
- `ResumeClassificationPipeline(runID)` reads cursor from DB, continues
- UI buttons in Classify dashboard pipeline monitor

---

## 9. Implementation Steps

1. **Migration**: Extend ContentProcessRun, add ContentProcessRunDetail, ContentProcessRunPromptRun junction, extend DuplicateRun + DuplicateRunDetail
2. **Metadata**: AIPromptType "Embedding", AIPrompts for content embedding + tag matching, JSONType for IContentProcessRunConfiguration
3. **AIModelRunner**: New class in ai-core-plus, AIPromptRunner refactored to extend it
4. **RateLimiter**: Token bucket in content-autotagging
5. **Batched processing**: Refactor VectorizeContentItems + provider loops to use pagination with cursor
6. **Resume support**: Wire cursor into resolver + Pause/Resume mutations
7. **Circuit breaker**: Error rate monitoring in batch loop
8. **ETA calculation**: Rolling window in progress publisher
9. **Batched duplicate detection**: Batch vector queries, incremental detection
10. **Config UX**: Visual widgets for pipeline configuration
11. **Pipeline history**: Run history view in Classify dashboard
12. **Analytics integration**: Cost/token rollups from ContentProcessRunPromptRun → AIPromptRun in Analytics dashboard

---

## 10. Pending Task Backlog

### Completed
- [x] Source filtering params (ContentSourceIDs) on pipeline action
- [x] Force-reprocess param
- [x] Per-source Run button in UI
- [x] Taxonomy bridge for ALL providers
- [x] Embedding chunking for long content items
- [x] Client-side entity/tag filtering in search
- [x] Select All/Clear per filter category
- [x] Persist search preferences
- [x] URL links in expanded search cards
- [x] Remove Source Type filter
- [x] Tags button on entity form toolbar
- [x] Remove dead FormToolbarComponent

### To Build (This Plan)
- [ ] ContentProcessRun extension migration
- [ ] ContentProcessRunDetail + junction migration
- [ ] DuplicateRun + DuplicateRunDetail extensions
- [ ] AIPromptType "Embedding" metadata
- [ ] AIPrompts for embedding operations
- [ ] JSONType for IContentProcessRunConfiguration
- [ ] AIModelRunner class
- [ ] AIPromptRunner refactor to extend AIModelRunner
- [ ] RateLimiter class
- [ ] Batched processing with cursor persistence
- [ ] Pause/Cancel/Resume mutations + UI
- [ ] Pipeline history view
- [ ] Config visual widgets
- [ ] Batched duplicate detection
- [ ] Cost/token analytics integration
