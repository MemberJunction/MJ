# Content Pipeline, Training, and Retrieval Guide

**Read this before building or customizing content ingestion, document extraction, classification/autotagging, segmentation, vector embedding, or RAG retrieval pipelines in MemberJunction.**

- **Packages**:
  - [`@memberjunction/content-pipeline-base`](../packages/ContentPipeline/base/README.md) — `WorkingRecord`, `BasePipelineStage`, `ConfidenceScale`, `BaseAccessDriver`, `BaseContentExtractor`, `BaseContentClassifier`, byte-signature detection, and `PipelineTuning` (zero database dependencies)
  - [`@memberjunction/content-pipeline`](../packages/ContentPipeline/engine/README.md) — `PipelineProcessor` (`WorkType = 'Pipeline Stage'`), `WorkingRecordHydrator`, `WorkingRecordCommitter`, `AccessResolver`, `ExtractorCascade`, and the built-in stages (`Discover`, `Extract`, `Tag`, `Segment`, `Embed`, `Delete`, `DeleteContentItem`, `NoOp`)
  - [`@memberjunction/content-autotagging`](../packages/ContentAutotagging/README.md) — Source-type drivers (`AutotagBase` subclasses) and shared vector/prompt infrastructure (`ContentVectorInfrastructure`, `ContentVectorMetadata`, `ContentAutotagPrompt`)
  - [`@memberjunction/document-parsing`](../packages/DocumentParsing/src/index.ts) — Shared PDF, Word (`docx`), and Excel (`xlsx`) text extraction helpers
- **Companion Guides**:
  - **[Record Set Processing & Record Processes Guide](RECORD_SET_PROCESSING_GUIDE.md)** — The execution substrate (`MJ: Record Processes`, batching, concurrency, rate limiting, resume, and `DryRun`)
  - **[Content Segmentation Guide](CONTENT_SEGMENTATION_GUIDE.md)** — How text and media are split into meaningful chunks via [`@memberjunction/ai-segmentation`](../packages/AI/Segmentation/README.md)
  - **[Content Autotagging Guide](CONTENT_AUTOTAGGING_GUIDE.md)** — The Knowledge Hub autotagging prompt, weight tiers, and taxonomy bridge
  - **[Taxonomy & Tagging Guide](TAXONOMY_TAGGING_GUIDE.md)** — How the formal `MJ: Tags` taxonomy is governed, scoped, embedded, and resolved
  - **[Search Overview Guide](SEARCH_OVERVIEW_GUIDE.md)** & **[Search Scopes & RAG+ Guide](SEARCH_SCOPES_AND_RAG_GUIDE.md)** — How trained content and vectors are queried by `SearchEngine.Search` and injected into AI agents

---

## 1. Overview: Content Training to Retrieval

MemberJunction treats **content training (ingestion and indexing)** and **retrieval (search and RAG)** as two halves of one lifecycle:

1. **Content Training (`ContentPipeline`)**: Discovers items across external and internal sources, extracts normalized text and metadata, classifies items into the governed tag taxonomy, segments content into semantic chunks, and embeds those chunks into vector indexes — while tracking per-stage state so re-runs, incremental updates, metadata-only refreshes, and deletions are idempotent.
2. **Retrieval (`SearchEngine` & Agent RAG+)**: Queries the resulting vector indexes, full-text indexes, entity rows, and `MJ: Tagged Items` inside governed **[Search Scopes](SEARCH_SCOPES_AND_RAG_GUIDE.md)**, fuses results via Reciprocal Rank Fusion (RRF), enforces entity row-level permissions and scope filters, and injects cited context into AI agent runs.

```mermaid
flowchart LR
    subgraph "1. Content Training (ContentPipeline)"
        S["MJ: Content Sources"] --> D["Discover / Sync"]
        D --> CI["MJ: Content Items"]
        CI --> E["Extract"]
        E --> T["Tag"]
        E --> SEG["Segment"]
        T --> TAGS["MJ: Content Item Tags<br/>& MJ: Tagged Items"]
        SEG --> CH["MJ: Content Item Chunks"]
        CH --> EMB["Embed"]
        EMB --> VEC[("Vector Index<br/>(Pinecone / Qdrant / pgvector)")]
        CI -. "Orphan / Removed" .-> DEL["Delete / Delete Chunks"]
        DEL -. "Purge vectors & rows" .-> VEC
    end

    subgraph "2. Retrieval (SearchEngine & RAG+)"
        VEC --> SE["SearchEngine.Search<br/>(Scoped RRF + Rerank)"]
        TAGS --> SE
        CI --> SE
        SE --> AG["AI Agents (RAG+)<br/>& Explorer Search"]
    end
```

---

## 2. How `ContentPipeline` and `ContentAutotagging` Relate

Historically, [`@memberjunction/content-autotagging`](../packages/ContentAutotagging/README.md) handled source crawling, file parsing, LLM keyword extraction, and vectorization inside a single monolithic loop (`AutotagBaseEngine` + `AutotagAndVectorizeContentAction`), where each provider's `Autotag()` method ran the entire pipeline start-to-finish.

The **Content Pipeline Framework** (`@memberjunction/content-pipeline-base` and `@memberjunction/content-pipeline`) decomposes that monolithic loop into **six independent, observable, resumable stages** (`Discover`, `Extract`, `Tag`, `Segment`, `Embed`, `Delete`) orchestrated by **[Record Set Processing](RECORD_SET_PROCESSING_GUIDE.md)** (`WorkType = 'Pipeline Stage'`).

Rather than duplicating provider or AI logic, `ContentPipeline` and `ContentAutotagging` share the underlying drivers and helpers:

| Capability | Shared Component | How `ContentPipeline` Uses It | How Legacy `ContentAutotagging` Uses It |
|---|---|---|---|
| **Source Drivers** | `AutotagBase` subclasses (`AutotagLocalFileSystem`, `AutotagCloudStorage`, `AutotagRSSFeed`, `AutotagWebsite`, `AutotagEntity`) | Calls `driver.Discover(request)` in `DiscoverStage` and `driver.Fetch(request)` in `ExtractStage` | Calls `driver.Autotag()` and `driver.SetContentItemsToProcess()` via `AutotagAndVectorizeContentAction` |
| **Document Parsing** | [`@memberjunction/document-parsing`](../packages/DocumentParsing/src/index.ts) (`ParsePDF`, `ParseDOCX`, `ParseXLSX`) | Invoked by `DocumentExtractor` during `ExtractStage` | Invoked by `AutotagBaseEngine` text extraction helpers |
| **LLM Classification** | `ContentAutotagPrompt` (`@memberjunction/content-autotagging`) | Wrapped by `ManagedPromptClassifier` (the default `BaseContentClassifier` in `TagStage`) | Called directly by `AutotagBaseEngine.ExtractTextAndProcessWithLLM` |
| **Taxonomy Promotion** | `ContentItemTagBridge` & `TagEngine` (`@memberjunction/tag-engine`) | `TagStage` resolves free-text tags into `MJ: Tags` and creates `MJ: Tagged Items` | `AutotagEntity` bridges saved `ContentItemTag` rows via callback |
| **Vector Routing & Metadata** | `ContentVectorInfrastructure` & `ContentVectorMetadata` (`@memberjunction/content-autotagging`) | `EmbedStage` and `DeleteStage` resolve the vector index, embedding model, credential, namespace, and vector metadata payload | `AutotagBaseEngine.VectorizeContentItems` resolves index/model and builds vector records |

> [!NOTE]
> **Long-Term Direction**: `AutotagBaseEngine` and `AutotagAndVectorizeContentAction` remain in `@memberjunction/content-autotagging` for backward compatibility with existing scheduled actions and callers. Over time, the monolithic `Autotag()` entrypoints can be deprecated and retired so `@memberjunction/content-autotagging` serves purely as the source-driver and prompt/vector helper library beneath `ContentPipeline` (or is folded directly into `ContentPipeline`). New implementations should use the `Content Pipeline — *` Record Processes.

---

## 3. Architecture & Execution Model

### Record Set Processing Integration

`ContentPipelineStartup` registers the `'Pipeline Stage'` work type and `PipelineProcessRunTracker` with [`@memberjunction/record-set-processor`](RECORD_SET_PROCESSING_GUIDE.md). Each stage is configured as an `MJ: Record Processes` row whose `ScopeFilter` selects records ready for that stage:

```mermaid
sequenceDiagram
    participant RSP as RecordSetProcessor
    participant PP as PipelineProcessor
    participant Hyd as WorkingRecordHydrator
    participant Stg as BasePipelineStage (e.g. ExtractStage)
    participant Com as WorkingRecordCommitter
    participant DB as MJ Database

    RSP->>PP: ProcessRecord / ProcessBatch (BaseEntity[], StageConfiguration)
    PP->>Hyd: Hydrate(entity, stageContext)
    Hyd->>DB: Load lookup names, FieldConfidence, chunk/item state
    Hyd-->>PP: WorkingRecord (in-memory)
    PP->>Stg: Run(workingRecord, stageContext)
    Stg-->>PP: StageOutcome (Complete | Skipped | Retry | Fatal)
    alt Finalize supported (e.g. EmbedStage batch)
        PP->>Stg: Finalize(records, stageContext)
    end
    alt IsTest === false && DryRun === false
        PP->>Com: Commit(workingRecord, outcome, stageContext)
        Com->>DB: Save entity, child items/chunks, tags, status & FieldConfidence
    else IsTest === true or DryRun === true
        PP-->>RSP: Withhold all DB writes; report in-memory preview
    end
```

### Strict Separation of Concerns

1. **Stages never touch the database directly** for the working record. They read and mutate an in-memory `WorkingRecord` (`Propose`, `SetColumn`, `SetExtension`, `ProduceChild`, `ReplaceChunks`, `SetTags`) and return a `StageOutcome`.
2. **`WorkingRecordHydrator` and `WorkingRecordCommitter` own persistence.** Only the hydrator and committer translate between `WorkingRecord` fields and `MJContentSourceEntity`, `MJContentItemEntity`, and `MJContentItemChunkEntity`.
3. **Cold-start resilience.** Every stage runs against a freshly hydrated `WorkingRecord` with no assumption that an earlier stage ran in the same process. When `Stages` chains multiple stages in a test run (e.g. `["Discover", "Extract"]`), `PipelineProcessor` passes produced records in memory from stage to stage without writing to the database.

---

## 4. The `WorkingRecord` & Confidence Scoring

### Well-Known Fields and Competition on Merit

Multiple stages can discover values for the same field — for example, an RSS feed provides an item title during `Discover`, an HTML `<title>` or `<h1>` provides one during `Extract`, and an LLM generates a title during `Tag`.

Instead of letting whichever stage runs last blindly overwrite earlier values, `WorkingRecord.Propose(field, value, confidence, source)` resolves shared fields **by integer confidence score**:

```typescript
// In DiscoverStage (RSS feed title):
record.Propose('Title', item.Name, ResolveConfidence(context.Configuration, 'Discover.RSS', 6), 'Discover.RSS');

// In ExtractStage (HTML heading):
record.Propose('Title', extractedTitle, ResolveConfidence(context.Configuration, 'Extract.Html', 5), 'Extract.Html');

// In TagStage (LLM-generated title):
record.Propose('Title', classified.Title, ResolveConfidence(context.Configuration, 'Tag.LLM', 3), 'Tag.LLM');
```

A proposal wins **only if its confidence score is strictly greater** than the field's recorded score in `FieldConfidence` (a JSON column persisted on `MJ: Content Items`). Because `Discover.RSS` (`6`) outranks `Extract.Html` (`5`) and `Tag.LLM` (`3`), the authoritative RSS title is preserved even when `Extract` and `Tag` run later.

### Default `ConfidenceScale`

Defined in [`packages/ContentPipeline/base/src/ConfidenceScale.ts`](../packages/ContentPipeline/base/src/ConfidenceScale.ts):

| Producer Key | Default Score | Typical Source |
|---|---|---|
| `Human` | `10` | Manual user edit in MJ Explorer |
| `Discover.Entity` | `9` | Structured MJ entity fields |
| `Extract.FrontMatter` | `8` | Explicit YAML/TOML document front matter |
| `Extract.DocumentProp` | `7` | PDF/Office embedded document properties |
| `Discover.RSS` | `6` | Syndicated feed item metadata |
| `Extract.Html` | `5` | HTML `<title>`, `<meta>`, or top heading |
| `Extract.Filename` | `4` | Derived from filename or URL slug |
| `Tag.LLM` | `3` | LLM-generated summary or title during tagging |
| `Fallback` | `1` | Last-resort default |

Any producer key can be overridden under `Configuration.Confidence` (at the Source Type, Source, or Run level) via `ResolveConfidence(config, key)`. When an item's extracted content checksum changes on re-extraction, `WorkingRecordCommitter` resets non-human `FieldConfidence` entries so stale metadata from old content does not block fresh extraction proposals.

---

## 5. Five-Level Configuration Precedence

Every stage resolves its driver keys (`ExtractorKey`, `SegmenterKey`, `ClassifierKey`, `AccessDriverKey`), confidence overrides (`Confidence`), and operational tuning (`Tuning`) through a single 5-level cascade implemented in [`ContentSourceConfigurationResolver`](../packages/ContentPipeline/engine/src/ContentSourceConfigurationResolver.ts):

```
1. Item Override          (e.g., ContentItem.ExtractorKeyOverride)
       ↓
2. Run Configuration      (StageContext.Configuration, from RecordProcess.Configuration.Options)
       ↓
3. Content Source         (ContentSource.Configuration JSON + per-extension Configuration.Extractors)
       ↓
4. Source Type / Type     (ContentSourceType.Configuration / ContentType.Configuration JSON)
       ↓
5. File Type / Default    (ContentFileType.ExtractorKey, capability auto-detection, or built-in default)
```

---

## 6. Stage-by-Stage Reference

### Stage 1: `Discover` and `Sync`

- **Class**: [`DiscoverStage`](../packages/ContentPipeline/engine/src/stages/DiscoverStage.ts) (`@RegisterClass(BasePipelineStage, 'Discover')`)
- **Entity**: `MJ: Content Sources`
- **Drivers**: Resolves `ContentSourceType.DriverClass` via `ClassFactory.CreateInstance<AutotagBase>(AutotagBase, driverClass)` and calls `driver.Discover(request)`.

#### Incremental `Discover` vs Exhaustive `Sync`

`DiscoverStage` supports two modes controlled by `Options.Mode`:

| Mode | Record Process | Watermark Passed (`request.Since`) | Orphan Reconciliation | Timestamps Updated on Source |
|---|---|---|---|---|
| `'Discover'` (default) | `Content Pipeline — Discover` | `LastDiscoveredAt - ClockSkewOverlapMs` (or `null` on first run) | None — only upserts discovered items | Stamps `LastDiscoveredAt`, clears `ForceDiscovery = 0` |
| `'Sync'` | `Content Pipeline — Sync` | `null` (forces an exhaustive walk of the source) | Marks existing top-level items missing from the walk as `DeleteStatus = 'Pending'` (when `driver.SupportsExhaustiveWalk === true`) | Stamps both `LastDiscoveredAt` and `LastSyncedAt` (leaves `ForceDiscovery` untouched) |

#### Safeguards in `Discover` and `Sync`

- **Clock-Skew Overlap (`ClockSkewOverlapMs`)**: Defaults to `300,000` ms (5 minutes). Subtracted from `LastDiscoveredAt` when computing `request.Since` so items committed just before the watermark on a clock-drifted remote server are never missed. Also subtracted from `walkStartedAt` during `Sync` so items created concurrently during the walk are never falsely marked as orphans.
- **Mass-Deletion Circuit Breaker (`MaxSyncRemovalShare`)**: Defaults to `0.5` (50%). If a `Sync` walk would mark more than 50% of a source's active top-level items as `DeleteStatus = 'Pending'` (for example, when an upstream API returns a partial outage response), `PipelineProcessor` aborts orphan marking for that source and logs a warning.
- **Inline Text Checksum Optimization**: When a driver supplies inline `Text` during `Discover` (such as `AutotagEntity` or `AutotagRSSFeed`), `DiscoverStage` computes its SHA-256 `Checksum` immediately. If the item already exists with the identical SHA-256 checksum and `ExtractionStatus = 'Complete'`, `WorkingRecordCommitter` skips resetting `ExtractionStatus` to `'Pending'` — avoiding redundant downstream work on every `Sync` or `Discover` pass. If item metadata (`Name`, `Description`, or driver `Columns`) changed while the text checksum stayed the same and `EmbeddingStatus = 'Complete'`, it promotes `EmbeddingStatus` to `'MetadataOnly'`.
- **Two Driver Channels (`Columns` vs `Request`)**:
  - `DiscoveredContentItem.Columns`: Whitelisted entity columns on `MJ: Content Items` (`EntityRecordDocumentID` and custom schema columns; framework-owned status, checksum, and audit columns are blocked by `FRAMEWORK_OWNED_COLUMNS`).
  - `DiscoveredContentItem.Request`: Per-item fetch recipe (`Method`, `Headers`, `Body`) persisted into `ContentItem.Configuration` (`__ fetchRequest`) and consumed by `ContentFetcher` during `Extract`.

---

### Stage 2: `Extract`

- **Class**: [`ExtractStage`](../packages/ContentPipeline/engine/src/stages/ExtractStage.ts) (`@RegisterClass(BasePipelineStage, 'Extract')`)
- **Entity**: `MJ: Content Items`
- **Status Column**: `ExtractionStatus` (`Pending` → `Complete` | `Failed` | `Skipped`)

#### Step 1: Session Access & Fetching (`AccessResolver` & `ContentFetcher`)

Before fetching bytes, `AccessResolver` resolves any `AccessCredentials` configured on the `ContentSource` (via `BaseAccessDriver`, defaulting to `CredentialAccessDriver` backed by `MJ: Credentials`).
- Session artifacts (Bearer tokens, Basic auth headers, API key headers/query params, cookies) are cached in memory per `(ContentSourceID, AccessDriverKey, CredentialID)` for the duration of the run and **never written to `MJ: Content Items`**.
- **Origin-Scoped Header Security**: `ContentFetcher` attaches session headers only when the target URL's origin matches the `ContentSource.URL` origin, and strips session headers if an HTTP redirect crosses to a different origin. All outbound HTTP requests pass through `@memberjunction/network-utils` (`SafeFetch` / `HttpGet`) to block SSRF against private/loopback networks.

#### Step 2: File-Type Detection & `ExtractorCascade`

If the driver did not already supply inline text, `ExtractStage` inspects magic byte signatures (`MatchByteSignature`) and MIME/extension rules loaded from the 39 rows in `MJ: Content File Types` (`DetectionCatalog`), then selects an extractor via `ExtractorCascade`:

| Extractor Key | Class | Supported Formats |
|---|---|---|
| `PlainText` | `PlainTextExtractor` | UTF-8 / text formats (`.txt`, `.md`, `.csv`, `.json`, `.yaml`, source code) validated by `IsPlausibleText` |
| `Html` | `HtmlExtractor` | HTML / XHTML pages (strips script/style chrome, extracts title & structural text) |
| `Pdf` / `Word` / `Spreadsheet` | `DocumentExtractor` | PDF, `.docx`, and `.xlsx` via [`@memberjunction/document-parsing`](../packages/DocumentParsing/src/index.ts) |
| `Archive` | `ArchiveExtractor` | `.zip` and `.tar` / `.tar.gz` archives — recursively extracts members as child `WorkingRecord` items under a shared whole-tree `ArchiveBudget` (`MaxArchiveMembers`, `MaxArchiveBytes`, `MaxArchiveDepth`) that fails closed if any limit is exceeded |

Non-text binary media (images, audio, video) that are not archives can be persisted as durable copies in `FileStorageEngine` (`KeepOriginalBytes` + `RenderStorageObjectKey` validated by `IsSafeStorageObjectKey`) and routed down the multimodal path.

#### Step 3: SHA-256 Content Checksum Reconciliation

`WorkingRecordCommitter` computes the SHA-256 hex digest of the extracted text:
- **Unchanged Checksum**: If the item's previous `Checksum` matches the new SHA-256 digest, downstream `TaggingStatus`, `SegmentationStatus`, and `EmbeddingStatus` are **not** reset. If item-level metadata (`Name`, `Description`, or custom columns) changed while `EmbeddingStatus === 'Complete'`, `EmbeddingStatus` transitions to `'MetadataOnly'` so vector metadata is updated in place without re-chunking or re-embedding.
- **Legacy Non-SHA-256 Checksum Upgrade**: Items previously ingested by the legacy autotagger (which stored a base64 length-prefixed hash) have their `Checksum` upgraded in place to SHA-256 when the extracted text matches, without triggering unnecessary re-tagging or re-embedding.
- **Changed Checksum**: Updates `Text` and `Checksum`, resets non-human `FieldConfidence` entries, and sets `TaggingStatus = 'Pending'`, `SegmentationStatus = 'Pending'`, and `EmbeddingStatus = 'Pending'`.

---

### Stage 3: `Tag`

- **Class**: [`TagStage`](../packages/ContentPipeline/engine/src/stages/TagStage.ts) (`@RegisterClass(BasePipelineStage, 'Tag')`)
- **Entity**: `MJ: Content Items`
- **Status Column**: `TaggingStatus` (`Pending` → `Complete` | `Failed` | `Skipped`)

`TagStage` resolves a `BaseContentClassifier` via `ClassifierKey` (defaulting to `ManagedPromptClassifier`, registered under `'ManagedPrompt'`):
1. Runs the managed **"Content Autotagging"** AI prompt via `ContentAutotagPrompt` (using the token-aware tagging chunk budget and optional taxonomy tree context).
2. Proposes `Title` and `Description` onto the `WorkingRecord` at `Tag.LLM` confidence (`3`), so they populate blank fields without overwriting higher-confidence `Discover` or `Extract` metadata.
3. Saves `MJ: Content Item Tags` (dropping blank tags and updating weights on existing tag rows) and bridges tags into the governed `MJ: Tags` taxonomy and `MJ: Tagged Items` via `ContentItemTagBridge` and `TagEngine` (honoring `TagTaxonomyMode`: `'constrained'`, `'auto-grow'`, or `'free-flow'`).
4. If the item's `EmbeddingStatus` is already `'Complete'` and tagging changed its tags or metadata, `WorkingRecordCommitter` sets `EmbeddingStatus = 'MetadataOnly'` so the vector store's metadata filter payload picks up the new tags on the next `Embed` run.

See the **[Content Autotagging Guide](CONTENT_AUTOTAGGING_GUIDE.md)** and **[Taxonomy & Tagging Guide](TAXONOMY_TAGGING_GUIDE.md)** for full details on taxonomy modes and tag resolution.

---

### Stage 4: `Segment`

- **Class**: [`SegmentStage`](../packages/ContentPipeline/engine/src/stages/SegmentStage.ts) (`@RegisterClass(BasePipelineStage, 'Segment')`)
- **Entity**: `MJ: Content Items`
- **Status Column**: `SegmentationStatus` (`Pending` → `Complete` | `Failed` | `Skipped`)

`SegmentStage` splits `ContentItem.Text` into `MJ: Content Item Chunks` using [`@memberjunction/ai-segmentation`](CONTENT_SEGMENTATION_GUIDE.md):
1. Resolves `SegmenterKey` through the 5-level configuration cascade (`StructuralText`, `AdaptiveBoundary`, `SemanticText`, `Transcript`, `FixedWindow`, or `SuggestSegmenterKey` auto-selection).
2. Calls `segmenter.Segment(...)` using the target embedding model's token budget.
3. **Chunk Reconciliation on Commit**:
   - Matching or updated chunk positions upsert `MJ: Content Item Chunks` with `EmbeddingStatus = 'Pending'` (if text changed).
   - **Surplus Chunks**: If a re-segmentation produces fewer chunks than the item previously had (e.g., 5 chunks instead of 8), the surplus old chunks (indices 5..7) are marked `DeleteStatus = 'Pending'` so the `Delete Chunks` process removes their stale vectors from the vector database before purging the rows.

---

### Stage 5: `Embed`

- **Class**: [`EmbedStage`](../packages/ContentPipeline/engine/src/stages/EmbedStage.ts) (`@RegisterClass(BasePipelineStage, 'Embed')`)
- **Entity**: `MJ: Content Item Chunks` (also supports item-level media embeddings)
- **Status Column**: `EmbeddingStatus` (`Pending` | `MetadataOnly` → `Complete` | `Failed` | `Skipped`)

`EmbedStage` uses `Finalize` to batch embedding model calls and vector database upserts across each page of chunks:

#### Five-Step Vector Index Resolution Cascade

`ContentVectorInfrastructure.ResolveVectorTarget` resolves the target `MJ: Vector Indexes` row and embedding `MJ: AI Models` row in strict priority order:

1. **Content Source**: `ContentSource.VectorIndexID` (using `ContentSource.EmbeddingModelID` if set, otherwise falling back to the vector index's own `VectorIndex.EmbeddingModelID`).
2. **Content Type**: `ContentType.VectorIndexID` (using `ContentType.EmbeddingModelID` if set, otherwise `VectorIndex.EmbeddingModelID`).
3. **System-Wide Default AI Configuration**: A `ContentPipeline.DefaultVectorIndexID` parameter on the active default `MJ: AI Configurations` row (`IsDefault = 1`, read through `AIEngine`'s cached configurations). In strict pipeline mode, if more than one active `MJ: AI Configurations` row is marked `IsDefault = 1`, resolution fails closed with a descriptive error naming the conflicting configurations.
4. **Sole Vector Index**: When the database has exactly one `MJ: Vector Indexes` row (`VectorIndexes.length === 1`), that index and its `EmbeddingModelID` are used automatically.
5. **Fail Closed**: Throws a clear configuration error naming steps 1–4.

#### Full Embed vs `MetadataOnly` Refresh

- **`EmbeddingStatus = 'Pending'`**: Calls `AIEmbeddingRunner` once per batch, writes vectors + rich metadata (`ContentVectorMetadata`: `Entity`, `RecordID`, `ContentItemID`, `ContentSourceID`, `ContentTypeID`, `Title`, `Description`, `URL`, `Tags`, plus any custom columns) via `vectorDB.CreateRecords(records, namespace)`, and records `VectorIndexID` and `VectorRecordID` on each `MJ: Content Item Chunks` row.
- **`EmbeddingStatus = 'MetadataOnly'`**: Skips the embedding model call entirely and calls `vectorDB.UpdateRecord({ id, values: [], metadata }, namespace)` to refresh the vector's metadata payload in place (supported across Pinecone, Qdrant, and pgvector).

---

### Stage 6: `Delete` and `DeleteContentItem`

- **Classes**:
  - [`DeleteContentItemStage`](../packages/ContentPipeline/engine/src/stages/DeleteStage.ts) (`@RegisterClass(BasePipelineStage, 'DeleteContentItem')`) — runs over `MJ: Content Items` where `DeleteStatus = 'Pending'`
  - [`DeleteStage`](../packages/ContentPipeline/engine/src/stages/DeleteStage.ts) (`@RegisterClass(BasePipelineStage, 'Delete')`) — runs over `MJ: Content Item Chunks` where `DeleteStatus = 'Pending'`

Deletion is two-phased (`DeleteStatus = 'Pending'` → vector & storage cleanup → row delete or `'Deleted'` tombstone) so external vectors and stored files are never orphaned when a database row is removed:

1. **`Content Pipeline — Delete` (`DeleteContentItemStage`)**:
   - Removes any item-level vector from the vector index (`VectorIndexID` / `VectorRecordID` in the resolved namespace) and deletes any durable copy from `FileStorageEngine`.
   - Marks all child `MJ: Content Item Chunks` and archive-member child `MJ: Content Items` as `DeleteStatus = 'Pending'` via `ContentPipelineDeleteMarker`.
   - Transitions the item's `DeleteStatus` to `'Deleted'` (or hard-deletes unreferenced rows). If external vector removal fails, the item stays `DeleteStatus = 'Pending'` so the next run retries.
2. **`Content Pipeline — Delete Chunks` (`DeleteStage`)**:
   - Calls `vectorDB.DeleteRecords([vectorRecordID], namespace)` for each pending chunk.
   - Attempts to hard-delete the `MJ: Content Item Chunks` row. If a foreign key reference exists (for example, an audit or citation log pointing to the chunk), it falls back to keeping the row as a tombstone with `DeleteStatus = 'Deleted'` and `VectorRecordID = null`.

---

## 7. From Content Training to Retrieval (Search & RAG+)

Once `EmbedStage` and `TagStage` complete, trained content is immediately live across MemberJunction's retrieval stack:

| Artifact Written by Pipeline | How Retrieval Uses It |
|---|---|
| **Vector Records** (in Pinecone / Qdrant / pgvector, keyed by `VectorRecordID` with `ContentVectorMetadata`) | Queried by the `Semantic` (`VectorSearchProvider`) lane in `SearchEngine.Search`. Hits return the chunk text, score, parent `ContentItem` metadata, and tags. |
| **`MJ: Content Items` & `MJ: Content Item Chunks`** | Queried for full chunk context, citation URLs, and origin promotion. When a `ContentItem` originated from an MJ Entity record (via `EntityRecordDocumentID`), `SearchEngine` promotes the hit to the source entity record and enforces that entity's row-level permissions and scope `ExtraFilter`. |
| **`MJ: Content Item Tags` & `MJ: Tagged Items`** | Queried by the `Tag` search provider in `SearchEngine.Search` and used for faceted filtering in Knowledge Hub. |

### Connecting a Content Source to an Agent's Search Scope

To make a trained `ContentSource` searchable by an AI Agent (or a scoped search UI):

1. Ensure the source's target `MJ: Vector Indexes` row is included in the scope's `MJ: Search Scope External Indexes` child table (and the `Semantic` provider is enabled in `MJ: Search Scope Providers`).
2. If using `AutotagEntity` (entity-backed content sources), include the source entity in `MJ: Search Scope Entities` (with an optional `ExtraFilter` boundary).
3. Bind the `MJ: Search Scope` to the agent. During execution, the agent's RAG+ pipeline queries `SearchEngine.Search`, fuses vector + lexical + tag results with RRF, and injects cited chunks into the prompt context.

For full retrieval configuration, see:
- **[Search Overview Guide](SEARCH_OVERVIEW_GUIDE.md)** — Decision tree across `EntityByName`, `SearchEntity`, `FullTextSearch`, `SearchEngine.Search`, and `WebSearchEngine`.
- **[Search Scopes & RAG+ Guide](SEARCH_SCOPES_AND_RAG_GUIDE.md)** — Configuring `MJ: Search Scopes`, lane filters, origin promotion, RRF fusion, and agent RAG+ bindings.

---

## 8. Shipped Record Processes & Testing

### The 9 Shipped Record Processes

Defined in [`metadata/record-processes/.content-pipeline.json`](../metadata/record-processes/.content-pipeline.json) (all shipped `Status = 'Active'`, `OnDemandEnabled = true`, `ScheduleEnabled = false` so operators can schedule them per environment or trigger them on demand from the Bulk Operations / Feature Pipelines studio):

| Record Process Name | Target Entity | Stages | Scope Filter |
|---|---|---|---|
| `Content Pipeline — Discover` | `MJ: Content Sources` | `["Discover"]` | `ForceDiscovery = 1` |
| `Content Pipeline — Sync` | `MJ: Content Sources` | `["Discover"]` (`Mode: "Sync"`) | `LastSyncedAt IS NULL OR LastSyncedAt < DATEADD(day, -30, GETUTCDATE())` |
| `Content Pipeline — Extract` | `MJ: Content Items` | `["Extract"]` | `(ExtractionStatus IS NULL OR ExtractionStatus = 'Pending') AND (DeleteStatus IS NULL)` |
| `Content Pipeline — Tag` | `MJ: Content Items` | `["Tag"]` | `(TaggingStatus IS NULL OR TaggingStatus = 'Pending') AND (DeleteStatus IS NULL)` |
| `Content Pipeline — Segment` | `MJ: Content Items` | `["Segment"]` | `(SegmentationStatus IS NULL OR SegmentationStatus = 'Pending') AND (DeleteStatus IS NULL)` |
| `Content Pipeline — Embed` | `MJ: Content Item Chunks` | `["Embed"]` | `(EmbeddingStatus IS NULL OR EmbeddingStatus IN ('Pending','MetadataOnly')) AND (DeleteStatus IS NULL)` |
| `Content Pipeline — Delete` | `MJ: Content Items` | `["DeleteContentItem"]` | `DeleteStatus = 'Pending'` |
| `Content Pipeline — Delete Chunks` | `MJ: Content Item Chunks` | `["Delete"]` | `DeleteStatus = 'Pending'` |
| `Content Pipeline — Test (Discover then Extract)` | `MJ: Content Sources` | `["Discover", "Extract"]` (`IsTest: true`) | `SingleRecord` (on-demand chained dry run) |

### Test & Dry-Run Mode (`IsTest` / `DryRun`)

Setting `"IsTest": true` in `RecordProcess.Configuration` (or running a Record Process with `DryRun = true`) executes the full stage logic — including multi-stage in-memory chaining such as `["Discover", "Extract"]` — while **withholding every database commit**. Produced child records and extracted fields are reported in `ProcessRunDetails` keyed by their URL so operators can preview discovery and extraction rules safely before running live.

### Automated Test Coverage

- **Unit Tests**:
  - `packages/ContentPipeline/base/src/__tests__/` — `WorkingRecord`, `Confidence`, `ByteSignature`, `FileTypeResolution`, `DurableCopy`, `PlausibleText`, `ArchiveBudget`, `PipelineTuning`, and `StageOutcome`.
  - `packages/ContentPipeline/engine/src/__tests__/` — `PipelineProcessor`, `WorkingRecordHydrator`, `WorkingRecordCommitter`, `AccessResolver`, `ContentFetcher`, `ExtractorCascade`, `ArchiveExtractor`, `DocumentExtractor`, `DiscoverStage`, `ExtractStage`, `TagStage`, `SegmentStage`, `EmbedStage`, and `DeleteStage`.
  - `packages/ContentAutotagging/src/__tests__/` — Driver `Discover` and `Fetch` implementations (`AutotagLocalFileSystem`, `AutotagCloudStorage`, `AutotagRSSFeed`, `AutotagWebsite`, `AutotagEntity`), `ContentVectorInfrastructure`, and `ContentVectorMetadata`.
- **Integration Tests (`@memberjunction/integration-test-suite`)**:
  - [`content-pipeline.checks.ts`](../packages/TestingFramework/integration-test-suite/src/checks/content-pipeline.checks.ts) (`IT132`, checks `CP1`–`CP15`) — Validates schema columns/constraints, the 39 `MJ: Content File Types` rows and baseline IDs, the 9 shipped `MJ: Record Processes`, stage registration, hydrate/commit round-trips, `FieldConfidence` persistence, SHA-256 checksum short-circuiting, `MetadataOnly` promotion, chunk surplus marking, and `DryRun` write withholding against a live SQL Server instance.
  - [`content-vectorization.checks.ts`](../packages/TestingFramework/integration-test-suite/src/checks/content-vectorization.checks.ts) (`IT67`, checks `CV1`–`CV10`) — Validates vector index resolution cascade, `ContentVectorMetadata`, and end-to-end vectorization infrastructure.
