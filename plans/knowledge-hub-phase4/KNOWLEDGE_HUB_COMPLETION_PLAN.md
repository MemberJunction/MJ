# Knowledge Hub — Completion Plan

> **Goal**: 100% feature-complete Knowledge Hub. Every gap from the vision docs, every minor polish item.
> **Excludes**: Client Tools / Agent Integration (Phase 4F) — deferred for separate review after 100% completion.
> **Prerequisites**: Migrations V202604051600 + V202604051700 applied + CodeGen run.

---

## Phase A: Large-Scale Processing Infrastructure

The pipeline and vectorization engines currently work for small datasets but lack the durability, observability, and throttling needed for production-scale (100K+ items). This phase makes the engines production-grade.

### A0. Pipeline Logging Verbosity
- Reduce noisy per-item logging during pipeline runs — only post periodic summaries
- Log every 10th item or every 5 seconds instead of every item
- Keep detailed logging available at a configurable log level (debug vs info)
- Source type "no sources configured, skipping" messages: suppress when filtering to specific source IDs

### A1. AIModelRunner → Embedding Pipeline Wiring
- AIModelRunner class exists but isn't called during embedding operations
- Wire `AIModelRunner.TrackEmbeddingCall()` into `EntityVectorSyncer.vectorizeRecords()`
- Each embedding API call should create an AIPromptRun record with:
  - PromptID (link to "Content Embedding" prompt)
  - ModelID, VendorID from the resolved embedding model
  - InputTokens, OutputTokens, CostCredits from the embedding response
  - StartedAt, EndedAt, Status
- Wire `AIModelRunner` into tag embedding calls in `TagEngine.generateTagEmbeddings()` using the "Tag Semantic Matching" prompt

### A2. ContentProcessRunDetail Population
- AutotagBaseEngine: when processing starts for each ContentSource, create a ContentProcessRunDetail record
- Update ItemsProcessed, ItemsTagged, ItemsVectorized, TagsCreated, ErrorCount as processing proceeds
- Set StartTime/EndTime, Status on completion
- Create ContentProcessRunPromptRun junction records linking each AIPromptRun to its ContentProcessRunDetail

### A3. Batched Content Processing with Cursor Resume
- AutotagBaseEngine: process items in configurable batch sizes (from ContentProcessRun.BatchSize)
- After each batch: update ContentProcessRun.LastProcessedOffset
- On resume (Status='Paused'): query items starting from LastProcessedOffset
- Skip items whose Checksum hasn't changed since last successful processing

### A4. Pause / Cancel / Resume — Engine Integration
- AutotagBaseEngine: check ContentProcessRun.CancellationRequested between batches
- If CancellationRequested=1 and Status='Running': set Status='Paused', stop processing
- Wire existing AutotagPipelineResolver mutations:
  - `PausePipeline(runID)` → sets CancellationRequested=1
  - `CancelPipeline(runID)` → sets CancellationRequested=1, Status='Cancelled'
  - `ResumePipeline(runID)` → sets CancellationRequested=0, Status='Running', re-triggers from cursor
- Pause/Cancel/Resume buttons in Classify → Pipeline Monitor UI (already has button placeholders)

### A5. RateLimiter Integration
- RateLimiter class exists in AutotagBaseEngine but isn't applied everywhere
- Apply to LLM calls in autotagging (tag extraction): respect RPM and TPM limits
- Apply to embedding API calls in vectorization: respect embedding RPM limits
- Apply to vector DB upsert calls: respect Pinecone write throughput
- Read rate limit config from PipelineConfig widget values (UI sliders already exist)

### A6. Circuit Breaker
- Track ErrorCount / ProcessedItems ratio during a run
- If ratio exceeds ErrorThresholdPercent (configurable, default 20%): auto-pause
- Set ContentProcessRun.Status='Paused', ContentProcessRun.ErrorMessage with reason
- Notify user via MJNotificationService: "Pipeline auto-paused: error rate exceeded threshold"

### A7. Batched Duplicate Detection
- DuplicateRecordDetector: process vector similarity queries in batches of 100 records
- Update DuplicateRun.ProcessedItemCount and LastProcessedOffset after each batch
- Check DuplicateRun.CancellationRequested between batches (partially done — verify complete)

### A8. Content Item Status Tracking
- AutotagBaseEngine: set ContentItem.TaggingStatus='Processing' before LLM call, 'Complete' after, 'Failed' on error
- Set ContentItem.LastTaggedAt timestamp on success
- Vectorization code: set ContentItem.EmbeddingStatus='Processing' before embed, 'Complete' after, 'Failed' on error
- Set ContentItem.LastEmbeddedAt and ContentItem.EmbeddingModelID on success

### A9. Unit Tests
- AIModelRunner: prompt run creation, token/cost tracking, model selection
- Batched processing: cursor persistence, resume from offset
- RateLimiter: token bucket algorithm, exponential backoff on 429
- Circuit breaker: threshold detection, auto-pause trigger
- ContentItem status transitions

---

## Phase B: Taxonomy Governance (Foundation — blocks D and E)

### B1. Tag Status Lifecycle
- Wire `Tag.Status` (Active/Merged/Deprecated/Deleted) into TagEngine
- TagEngine.ResolveTag() should skip non-Active tags
- TagEngineBase.GetTagByName() should filter by Status='Active'
- Display status badges on tag rows in Classify → Taxonomy tab

### B2. Tag Merge Operation
- New `TagGovernanceEngine` class (server-side, singleton via BaseSingleton)
- `MergeTags(sourceTagIDs: string[], survivingTagID: string, contextUser)`:
  - Re-point all ContentItemTag.TagID from source → surviving
  - Re-point all TaggedItem records from source → surviving
  - Set source tags Status='Merged', MergedIntoTagID=surviving
  - Update TagCoOccurrence table
  - Create TagAuditLog entry (Action='Merged', Details={ItemsMoved: N})
- Wire into Taxonomy → Duplicates sub-tab UI (merge button on each pair)

### B3. Tag Split Operation
- `SplitTag(tagID: string, newChildNames: string[], contextUser)`:
  - Create new child tags under the original tag's parent
  - Does NOT auto-reassign items (user reviews manually)
  - Create TagAuditLog entry (Action='Split')
- Wire into Taxonomy → Tree sub-tab (right-click context menu)

### B4. Tag Move (Reparent)
- `MoveTag(tagID: string, newParentID: string | null, contextUser)`:
  - Update Tag.ParentID
  - Create TagAuditLog entry (Action='Moved', Details={OldParentID, NewParentID})
- Wire into Taxonomy → Tree sub-tab (drag-drop)

### B5. Tag Rename
- `RenameTag(tagID: string, newName: string, contextUser)`:
  - Update Tag.Name, Tag.DisplayName
  - Re-embed tag in TagEngine (update SimpleVectorService)
  - Create TagAuditLog entry (Action='Renamed', Details={OldName, NewName})

### B6. Tag Deprecate / Reactivate / Delete
- `DeprecateTag(tagID)` — Status='Deprecated', stops matching but preserves history
- `ReactivateTag(tagID)` — Status='Active'
- `DeleteTag(tagID)` — Status='Deleted', soft-delete
- All create TagAuditLog entries

### B7. Taxonomy Health Dashboard (data loading)
- Load real data into Taxonomy sub-tabs (currently stubbed):
  - **Tree**: Build from actual Tag hierarchy (ParentID), drag-drop for Move
  - **Duplicates**: Query TagEngine embeddings for similar tag names (cosine > 0.85), display as pair cards with merge button
  - **Orphans**: Tags with Status='Active', no ParentID, no ContentItemTag/TaggedItem usage
  - **Treemap**: CSS grid cells sized by usage count per tag
  - **Audit**: Load from TagAuditLog entity, grouped by day
- **Suggested Actions**: TagEngine identifies potential duplicate tag names and surfaces "these 3 tags look like duplicates" cards

### B8. Audit Trail Component
- TagAuditLog entity reads (simple RunView with date filtering)
- Timeline UI: icon per action type, grouped by day, user avatars

### B9. Unit Tests
- TagGovernanceEngine: merge, split, move, rename, deprecate
- Audit log creation for each operation
- TagEngine filtering by Status
- Duplicate suggestion algorithm

---

## Phase C: Scheduled Pipeline Automation

### C1. Wire Scheduling UI to MJ ScheduledAction
- SchedulingResource component: bind to ScheduledAction entity via RunView
- Create/Edit form: select Action (`__AutotagAndVectorizeContent` or `__VectorizeEntity`), cron expression, enabled/disabled
- Link ScheduledAction to ContentSource via ContentSource.ScheduledActionID

### C2. Quick Schedule from Classify Dashboard
- "Schedule" button on each source card → opens pre-filled schedule form
- Default cron: daily at 2:00 AM
- Shows current schedule status if one exists

### C3. Quick Schedule from Vector Dashboard
- "Schedule Sync" button on entity documents → pre-filled `__VectorizeEntity` schedule

### C4. Schedule Status Display
- Show next run time, last run result, enabled/disabled status on source cards
- Cron expression human-readable display (e.g., "Every day at 2:00 AM")

### C5. Unit Tests
- Schedule creation with ScheduledAction entity
- Cron expression parsing/display

---

## Phase D: Analytics, Monitoring & Export Enhancements

### D1. Cost/Token Analytics
- Query ContentProcessRunPromptRun → AIPromptRun to aggregate:
  - Total tokens used (input + output) per run
  - Total cost per run
  - Cost by source, by model, over time
- New sub-tab or section in Analytics: "Cost & Usage"
- Charts: cost over time (line), cost by source (bar), cost by model (pie)

### D2. Pipeline Monitor — Live Run View
- Wire ContentProcessRunDetail into the Classify → Pipeline Monitor tab
- Show per-source progress during active runs (source name, items processed, status)
- Live update via PipelineProgress GraphQL subscription

### D3. Run History Detail View
- Click a run in Run History → slide-in panel showing:
  - ContentProcessRunDetail rows (one per source processed)
  - Token/cost breakdown per source
  - Error details if any
  - Link to AIPromptRun records

### D4. Content Item Status in Source Detail
- Source detail panel: show per-item EmbeddingStatus and TaggingStatus
- Color badges: green=Complete, yellow=Processing, red=Failed, gray=Pending
- Filter content items by status
- "Retry Failed" button: re-runs pipeline only for items with Failed status

### D5. Export Enhancements
- PDF export for analytics charts (html2canvas + jsPDF)
- Excel export for data tables (xlsx library)
- Image export (PNG) for individual chart panels

### D6. Word Cloud Real Data
- Classify → Pipeline Monitor: TrendingTags should pull from actual ContentItemTag data
- Weight by frequency within time window, color by recency

### D7. Source Detail Pagination
- Source detail panel: paginate content items list (10 per page for large sources)

### D8. Run History → Detail Navigation
- Click a run in Run History tab → navigate to ContentProcessRunDetail records
- Show source-by-source breakdown, duration, token usage

### D9. Unit Tests
- Cost aggregation queries
- Status display logic

---

## Phase E: Cross-Entity Intelligence

### E1. Related Records Widget (polish)
- ng-record-tags → Related Records section:
  - Show records sharing the most tags (tag overlap score)
  - Show records with highest vector similarity
  - Cross-entity: a Contact record can show related Companies, Deals
- Sort by combined tag-overlap + vector-similarity score
- Polished card layout with entity icon, record name, overlap indicator

### E2. Tag Co-occurrence Engine
- New `TagCoOccurrenceEngine` (server-side, singleton)
- `RecomputeCoOccurrence(contextUser)`:
  - Scan ContentItemTag + TaggedItem, count all tag pairs that appear on the same item/record
  - Canonical pair ordering (TagAID < TagBID) prevents duplicate rows
  - Upsert into TagCoOccurrence table, update CoOccurrenceCount and LastComputedAt
  - Delete stale pairs that no longer co-occur
- **Trigger points**:
  - Automatically after each pipeline run completes (post-processing hook in AutotagBaseEngine)
  - Also available as a standalone MJ Action (`__RecomputeTagCoOccurrence`) for scheduled execution
- **Scheduled recomputation**:
  - Create a ScheduledAction for `__RecomputeTagCoOccurrence` (default: daily at 3 AM)
  - This catches any manual tag edits or imports that bypass the pipeline
- **Staleness indicator in UI**:
  - Analytics → Tags tab: show "Last computed: X hours ago" using `MAX(__mj_UpdatedAt)` from TagCoOccurrence
  - If stale (> 24h), show amber warning with "Recompute Now" button
- Surface in Analytics → Tags tab: "Frequently paired tags" section (top 20 pairs by count)

### E3. Smart Lists
- Auto-populated entity views filtered by tag taxonomy
- "Show me all Contacts tagged with 'Machine Learning'"
- Reusable component: TagFilteredEntityList
- Wire into Knowledge Hub as a sub-feature of search or a filter preset

### E4. Unit Tests
- Co-occurrence computation correctness
- Related Records scoring algorithm
- Smart list filtering

---

## Phase F: Search Enhancement

### F1. FTS Tag Enrichment
- SearchKnowledgeResolver: after FTS results come back, load their tags
- Query ContentItemTag for matching RecordIDs and attach Tags array
- For entity-type FTS results: also check TaggedItem
- Currently enrichResultsWithTags() exists but may not be loading correctly for FTS-only results

### F2. "More Like This"
- Button on each search result card: "Find Similar"
- Takes the result's vector (or re-embeds its text) and queries the vector index
- Opens a new search with pre-populated similar results
- SearchResultsComponent: new output event `MoreLikeThisRequested`
- KnowledgeSearchResource: handles the event, runs vector-only search

### F3. Tag-Faceted Filtering (Server-Side)
- SearchKnowledgeResolver: accept Tags filter in SearchFiltersInput (already has the type)
- Vector search: add tag metadata filter to Pinecone query
- FTS search: JOIN to ContentItemTag/TaggedItem where Tag IN (...)
- Currently client-side filtering works, but server-side needed for large result sets

### F4. Saved Searches
- KnowledgeHubSavedSearch entity CRUD (table created in migration)
- UI: "Save Search" button in search results header
- "Saved Searches" panel in the search sidebar (below Recent Searches)
- Load saved search: populate query, filters, threshold, execute

### F5. Unit Tests
- FTS tag enrichment
- Saved search CRUD
- Server-side tag filtering

---

## Phase G: Content Deduplication

### G1. Checksum-Based Dedup
- During content ingestion (AutotagBaseEngine): check if ContentItem.Checksum already exists across sources
- If exact match: create ContentItemDuplicate record (Method='Checksum', Score=1.0, Status='Pending')

### G2. Vector-Based Near-Dedup
- After vectorization: query vector index for each new content item
- If cosine similarity > 0.95 with another content item from a different source: create ContentItemDuplicate record (Method='Vector')
- Run as optional post-processing step (configurable)

### G3. Dedup Review UI
- New section in Classify dashboard (sub-tab or within Sources tab)
- Show pending ContentItemDuplicate pairs with side-by-side comparison
- Display: source names, similarity score, detection method, content preview
- Actions: Confirm (merge), Dismiss (not a dupe), Keep Both

### G4. Dedup Resolution
- KeepA: soft-delete item B, re-point ContentItemTag records to A
- KeepB: soft-delete item A, re-point ContentItemTag records to B
- MergeBoth: combine tags/metadata into one item, remove the other
- Update ContentItemDuplicate.Status, Resolution, ResolvedByUserID, ResolvedAt

### G5. Unit Tests
- Checksum duplicate detection
- Vector near-duplicate detection threshold
- Duplicate resolution logic (tag re-pointing)

---

## Execution Order

```
Phase A (Large-Scale Processing) ← Foundation: makes everything durable
    ↓
Phase B (Taxonomy Governance) ← Foundation: blocks E and parts of D
Phase C (Scheduling) ← Independent, can parallel with B
    ↓
Phase D (Analytics/Monitoring) ← Needs A for cost data, B for taxonomy health
    ↓
Phase E (Cross-Entity Intel) ← Needs B for tag co-occurrence
Phase F (Search Enhancement) ← Needs B for tag faceting
    ↓  (E and F can run in parallel)
Phase G (Content Dedup) ← Independent, can run anytime after A
```

**Total**: ~50 implementation tasks + ~9 test suites across 7 phases
