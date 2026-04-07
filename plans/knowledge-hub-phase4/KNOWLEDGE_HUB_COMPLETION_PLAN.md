# Knowledge Hub — Completion Plan

> **Goal**: 100% feature-complete Knowledge Hub. Every gap from the vision docs, every minor polish item.
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

### B9. Bulk Delete UX
- Replace browser `confirm()` dialog with a styled MJ dialog (`MJDialogService`) for bulk delete in Orphans tab
- Show count of tags to be deleted, with a warning about permanence
- Same treatment for any other confirm() usage in KH dashboards

### B10. Orphan Cleanup After Failed Runs
- When a pipeline run fails or content items are deleted, clean up orphaned tags that have zero usage
- Option in Orphans tab: "Delete All Orphaned Tags" with the styled confirmation dialog
- Consider auto-flagging tags as Deprecated (not Deleted) if they become orphaned, so they can be reviewed

### B11. Treemap Drill-In
- Click a treemap cell → open slide-in showing tag details: child tags, content items using that tag, usage stats
- Same slide-in pattern as the Tree View tag detail panel
- Cell hover should show tooltip with tag name + item count

### B12. Duplicate Detection Without Merge
- Currently blocks dupe detection entirely if AllowRecordMerge is off — wrong behavior
- Instead: show a styled confirmation dialog explaining detection will run but merging won't be available until a sys admin enables AllowRecordMerge
- User can proceed with detection-only (useful for visibility/reporting)
- In the dupe results UI: disable/hide the "Merge" button per-entity when AllowRecordMerge is off, show tooltip explaining why
- Replace browser confirm() with MJDialogService styled dialog

### B13. Unit Tests
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

### D9. In-App Tag Navigation from Analytics
- Analytics drill-down tables that show tags should navigate within the Knowledge Hub app instead of opening the Tag entity form
- Use NavigationService to navigate to Classify → Tag Library tab with a query string parameter selecting the specific tag (e.g., `?tag=Cheese`)
- Tag Library tab reads the query param on init and auto-selects/filters to that tag, triggering the drill-down
- Applies to: all analytics drill-downs showing tag names (kpi-totalTags, tagGrowth, taxonomyHealth)
- Keeps the user inside the Knowledge Hub experience instead of jumping to a generic entity form

### D10. Drill-Downs on All Analytics Tabs
- Currently only the Overview tab has clickable KPI cards and widget cards with drill-down panels
- Add the same drill-down pattern to all 4 remaining tabs:
  - **Tags tab**: click Top 20 tag rows → drill-down showing content items with that tag
  - **Sources tab**: click source rows → drill-down showing recent runs, items processed, error details
  - **Pipeline tab**: click throughput chart bars / error rows → drill-down showing individual run details
  - **Quality tab**: click confidence histogram bins / low-confidence tag rows → drill-down showing matching items
- Reuse the existing drill-down panel component pattern (DrillDownColumns, DrillDownData, DrillDownHasActions)

### D11. Unit Tests
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

### F5. Search Filter Panel UX
- Remove the "Filters" toggle button from the right-side results header
- When filter panel is hidden: show a small "Show Filters" button on the left side of the results area (where the panel would appear)
- When filter panel is visible: add a close (X) button to the filter panel header to dismiss it
- Filter button should have visual indicator when active filters are applied (badge count or highlight)
- Smoother panel animation (slide in/out from left)

### F6. Unit Tests
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

---

## Phase H: Record Form Enhancements

### H1. Tag Count Badge on Toolbar
- Show a small count badge on the Tags toolbar button indicating how many tags are associated with the current record
- Load asynchronously after form renders (query TaggedItem where EntityID + RecordID) so it doesn't block form loading
- Update the badge when tags are added/removed from the slide-in panel

### H2. Record Changes Version Badge on Toolbar
- Show the current version number and total version count on the Record Changes toolbar button (e.g., "v12 of 12")
- Load asynchronously from Record Changes entity (count where EntityID + RecordID)
- Gives user instant visibility into how many times the record has been modified without clicking

### H3. Record Changes — Restore Previous Version
- In the Record Changes form/viewer, add a "Restore" button on each historical version row (only if user has edit rights)
- Clicking Restore opens a styled slide-in panel showing:
  - The version date and who made that version
  - A field-by-field diff: current value vs. the selected version's value, with changed fields highlighted
  - Only fields that differ are shown
- User confirms → the record is updated to match the old version's field values
- This creates a new Record Change entry (standard MJ behavior on save), so the restore itself is versioned
- Cancel closes the slide-in with no changes

### H4. Unit Tests
- Tag count badge async loading
- Version count badge async loading
- Restore diff computation (compare two version snapshots)

---

---

## Phase I: Agent Context & Client Tools

### Architecture

Each resource component reports its agent-visible state and tools to `NavigationService`, which manages caching and propagation.

**NavigationService new methods:**
- `SetAgentContext(caller: BaseResourceComponent, context: Record<string, unknown>)` — component passes `this` + its current agent-relevant state
- `SetAgentClientTools(caller: BaseResourceComponent, tools: ClientToolDefinition[])` — component passes `this` + its available tools
- NavigationService matches the `caller` reference against `ComponentCacheManager` entries to find the cache key
- Updates `CachedComponentInfo.AgentContext` and `CachedComponentInfo.AgentClientTools`

**CachedComponentInfo extensions:**
- `AgentContext?: Record<string, unknown>` — last reported agent context for this component
- `AgentClientTools?: ClientToolDefinition[]` — last reported tools for this component

**AppContextSnapshot extension:**
- `DashboardContext?: Record<string, unknown>` — merged into the snapshot from the active component's cached AgentContext

**Flow:**
1. Component calls `NavigationService.SetAgentContext(this, {...})` whenever internal state changes
2. NavigationService identifies the component in the cache, stores the context
3. If the component is currently active: immediately updates `AppContextSnapshot.DashboardContext` and pushes to chat overlay
4. On tab/nav switch: the newly active component's cached AgentContext is restored and pushed; the old component's tools are unregistered, new component's tools are registered via `AgentClientService`
5. Component never knows it was hidden/shown — cache handles restoration transparently
6. Works identically in Golden Layout (multi-tab) and single-resource mode (same cache key pattern)

### I1. Infrastructure — NavigationService + Cache Extensions
- Add `SetAgentContext(caller, context)` and `SetAgentClientTools(caller, tools)` to NavigationService
- Extend `CachedComponentInfo` with `AgentContext` and `AgentClientTools` fields
- Extend `AppContextSnapshot` with `DashboardContext` field
- On `markAsAttached`: restore cached context/tools → push to chat overlay
- On `markAsDetached`: unregister the component's tools from AgentClientService
- On active component calling Set*: update cache + push immediately

### I2. Search — Agent Context & Tools
**Context (reported on every search/filter/threshold change):**
- CurrentQuery, ResultCount, ElapsedMs
- ActiveFilters (entity names, tags selected), MinScoreThreshold
- ShowFilters (panel visible or not)
- Top 5 result summaries (title, entity, score)

**Tools:**
- `RunKnowledgeSearch(query, filters?, minScore?)` — execute a search
- `RefineSearch(addFilters?, removeFilters?, newMinScore?)` — modify active search
- `ClearSearch()` — reset everything
- `ToggleSearchFilters()` — show/hide filter panel
- `OpenSearchResult(index)` — expand a specific result card
- `SaveCurrentSearch(name)` — save the current search as a named preset

### I3. Classify — Agent Context & Tools
**Context (reported on tab switch, pipeline state change, source selection):**
- ActiveSubTab (pipeline/sources/types/tags/taxonomy/history)
- SourceCount, ContentItemCount, TagCount
- PipelineStatus (idle/running/paused), PipelineProgress %
- For taxonomy sub-tab: SelectedTagName, OrphanCount, DuplicateCandidateCount
- LastPipelineRunTime, LastPipelineRunResult

**Tools:**
- `SwitchClassifyTab(tab)` — navigate to a sub-tab
- `RunPipeline(sourceIDs?, forceReprocess?)` — trigger classification pipeline
- `PausePipeline()` / `ResumePipeline()` / `CancelPipeline()`
- `CreateContentSource(name, sourceType, config)` — create a new source
- `DeleteContentSource(sourceID)` — remove a source
- `MergeTags(sourceTagIDs, survivingTagID)` — taxonomy merge operation
- `RenameTag(tagID, newName)` — rename a tag
- `DeleteTag(tagID)` — soft-delete a tag
- `SearchTags(query)` — filter the tag library

### I4. Clusters — Agent Context & Tools
**Context (reported on clustering, label changes, viewport changes):**
- SelectedEntityName, SelectedEntityDocName
- ClusterCount, TotalPoints
- ClusterLabels (array of {id, label})
- IsVisualizationLoaded, VisualizationTitle

**Tools:**
- `RunClustering(entityName, entityDocName, numClusters?)` — start clustering
- `SetClusterLabel(clusterId, label)` — rename a cluster
- `SaveVisualization(name)` — save current view
- `LoadVisualization(name)` — restore a saved visualization
- `ResetView()` — reset zoom/pan to default

### I5. Duplicates — Agent Context & Tools
**Context (reported on detection status change, match actions):**
- SelectedEntityDocName
- DetectionStatus (idle/running), DetectionProgress %
- PendingCount, ApprovedCount, RejectedCount
- DuplicateGroupCount

**Tools:**
- `RunDuplicateDetection(entityDocName)` — start detection
- `ApproveMatch(groupID)` — approve a duplicate pair
- `RejectMatch(groupID)` — reject a false positive
- `MergeRecords(survivingID, duplicateID)` — execute a merge

### I6. Analytics — Agent Context & Tools
**Context (reported on tab switch, date range change, drill-down):**
- ActiveAnalyticsTab (overview/tags/sources/pipeline/quality)
- DateRange (7D/30D/90D/YTD/All), EntityFilter
- KPIs: TotalTags, ItemsProcessed, AvgConfidence, Coverage
- ActiveDrillDown (key or null)

**Tools:**
- `SwitchAnalyticsTab(tab)` — change active tab
- `SetDateRange(range)` — change date range filter
- `SetEntityFilter(entity)` — filter by entity
- `DrillDown(key)` — open a specific drill-down panel
- `ExportCSV(dataKey)` — export data as CSV

### I7. Vectors — Agent Context & Tools
**Context (reported on stats refresh, sync operations):**
- TotalVectors, IndexCount
- EntitySyncStatuses (array of {entity, status, lastSynced, vectorCount})

**Tools:**
- `SyncEntity(entityDocName)` — trigger vector sync for an entity
- `RefreshVectorStats()` — reload stats

### I8. Configuration — Agent Context & Tools
**Context (reported on config changes):**
- ActiveConfigSection
- PipelineSettings (batchSize, throttle, errorThreshold)
- EmbeddingModelCount, VectorDBCount

**Tools:**
- `UpdatePipelineSetting(key, value)` — change a pipeline config value

### I9. Unit Tests
- NavigationService: SetAgentContext/SetAgentClientTools with component reference matching
- Cache restoration on tab switch (context + tools)
- Tool registration/unregistration lifecycle
- AppContextSnapshot.DashboardContext propagation to chat overlay

---

---

## Final: Full Repo Validation

- Run `npm test` from repo root (Turborepo runs all package tests)
- Fix any failures caused by changes across all phases
- Run `npm run build` from repo root to verify full compilation
- Stage all changes for review (do NOT commit/push)

---

**Total**: ~70 implementation tasks + ~11 test suites across 9 phases + final validation
