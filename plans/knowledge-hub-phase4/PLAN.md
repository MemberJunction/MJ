# Knowledge Hub Phase 4 — Plan

## What Was Completed in Phase 3

### Core Infrastructure
- Plugin architecture for content source types (ClassFactory-based provider resolution)
- TagEngineBase (client+server) + TagEngine (server-only semantic matching)
- Tag taxonomy bridge: ContentItemTag -> formal Tag -> TaggedItem on source entity records
- Three taxonomy modes: constrained, auto-grow, free-flow
- Prompt restructuring for prefix caching + taxonomy injection

### Content Sources
- Entity Records source type with EntityDocument template rendering + ERD snapshots
- Cloud Storage abstraction via MJ FileStorageBase (Azure, S3, GCS, SharePoint, etc.)
- RSS full-text extraction (follows article links via Cheerio)
- RSS item naming fix (uses article title/description)

### UI & Visualization
- Word cloud component (SVG, standalone, 3 color modes)
- Record tags panel with list/cloud toggle on entity forms
- Cluster label inline editing in scatter legend
- Pipeline stage visualization with animated transitions
- Custom Content Source form with conditional Entity fields

### Reconnect & Recovery
- Clustering auto-saves/restores session via localStorage
- Duplicate detection reconnects to in-progress runs on navigation return

### Vector Providers
- pgvector + Qdrant registered in server bootstrap manifests

---

## Phase 4 Vision

Phase 4 transforms the Knowledge Hub from a collection of tools into an intelligent, self-governing knowledge platform with proactive insights, scheduled automation, and deep taxonomy management.

---

## Phase 4 Tasks

### 1. Cross-Entity Intelligence [HIGH]

Surface hidden relationships between records across entities using shared tag overlap.

- **Related Records Widget**: Given a record, find other records (any entity) that share the most tags, weighted by tag relevance
- **Tag co-occurrence analysis**: Identify which tags frequently appear together, revealing topic clusters
- **Smart Lists**: Auto-populated lists based on tag taxonomy membership (e.g., "All records tagged under AI & Machine Learning subtree")
- **Integration point**: BaseFormComponent tag panel gets a "Related Records" section

### 2. Taxonomy Governance [HIGH]

Full curation workflow for the tag taxonomy — essential as it grows organically.

- **Tags Tab in Autotagging Dashboard**: New left-nav tab dedicated to taxonomy management
- **Tree Editor**: Drag-drop reorganization of the tag hierarchy
- **Tag Merge/Split**: Merge semantically duplicate tags (with TaggedItem consolidation), split broad tags into children
- **Health Dashboard**: Orphaned tags, duplicate candidates (via semantic similarity), sparse branches, depth distribution
- **Suggested Actions**: TagEngine identifies consolidation candidates automatically
- **See mockups**: `mockups/taxonomy-option-{a,b,c}.html`

### 3. Unified Search Enhancement [MEDIUM]

Wire tag-based filtering into the existing Knowledge Hub search experience.

- **Tag faceted filtering**: Search results can be narrowed by tag taxonomy
- **"More Like This"**: Combine vector proximity + shared tags for similarity
- **Tag chips in search results**: Show applied tags on each result for context
- **Current State (~80% wired)**: The infrastructure for tag-based filtering is surprisingly complete:
  - `SearchFilters.Tags` already defined in types across the full stack (TS types, GraphQL input, resolver)
  - Vector search already supports `Tags: { $in: [...] }` metadata filtering in Pinecone
  - `SearchFusion` already extracts Tags from vector metadata into `UnifiedSearchResult.Tags`
  - Angular `SearchService.buildTagFilter()` already generates tag filter facets from results
  - `mj-search-filter` component already displays generated facets
- **What's Missing (the 20%)**:
  1. **FTS returns empty Tags**: `SearchKnowledgeResolver.ts:373` hardcodes `Tags: []` — needs to load from TaggedItems via `TagEngineBase.GetTaggedItemsForRecord()`
  2. **FTS doesn't filter by tags**: `FullTextSearchProvider` SQL generation needs JOIN to TaggedItems when tag filters are active
  3. **Vector metadata enrichment**: Verify vector indexing pipeline includes Tags in metadata at index time
  4. **Tag chips in result details**: Search results template doesn't display tag pills on results
- **Implementation**: Primarily server-side changes in the SearchKnowledgeResolver + FullTextSearchProvider, plus minor UI polish

### 4. Scheduled Pipelines [HIGH]

Automate content ingestion and processing on recurring schedules.

- **Scheduled Autotagging Action**: Create an MJ Action wrapping the autotag pipeline with configurable params (source filter, batch size)
- **Scheduled Vector Sync Action**: Create an MJ Action for EntityDocument vector sync
- **Knowledge Hub Schedule Tab**: Embed scheduling UI within the Knowledge Hub app (reuse MJ Scheduling components)
- **Quick Schedule**: One-click schedule setup from the autotagging and vector dashboards
- **Existing Infrastructure**:
  - **Autotagging Action**: `__AutotagAndVectorizeContent` — params: Autotag (0/1), Vectorize (0/1), __progressCallback
  - **Vector Sync Action**: `__VectorizeEntity` — params: EntityNames (comma-separated)
  - **Scheduling Entities**: `MJ: Scheduled Jobs` (cron, timezone, status, concurrency mode, config JSON), `MJ: Scheduled Job Types` (DriverClass for ClassFactory), `MJ: Scheduled Job Runs` (history)
  - **Reusable Angular Components** (from `@memberjunction/ng-scheduling`):
    - `ScheduledJobEditorComponent` — full CRUD form with `@Input() ScheduledJobID`, `JobTypeID`, `DefaultConfiguration`, `HideJobType`
    - `ScheduledJobSummaryComponent` — compact status widget
    - `ScheduledJobSlidePanelComponent` — side panel wrapper
    - `ScheduledJobService` — data ops (LoadJobTypes, LoadJob, LoadJobRuns)
  - **Scheduling App** exists with Dashboard, Jobs, Activity tabs — but we want to embed within Knowledge Hub
- **Implementation approach**: Add `SchedulingModule` import to Knowledge Hub, create a Schedule resource tab, embed `ScheduledJobEditorComponent` pre-configured for autotag and vector sync job types
- **See mockups**: `mockups/scheduling-option-{a,b,c}.html`

### 5. Analytics & Insights Dashboard [MEDIUM]

High-level view of Knowledge Hub health and activity.

- **Tag Growth Over Time**: Monthly creation trend chart
- **Content Coverage**: Entity-level tagged-vs-total breakdown with progress bars
- **Autotagging Quality**: LLM confidence distribution histogram
- **Source Comparison**: Tags-per-item across content source types
- **Taxonomy Health Metrics**: Orphaned tags, duplicates, depth distribution
- **Pipeline Throughput**: Items processed per day, success/failure rates
- **Top Tags & Recent Activity**: Most-used tags and latest pipeline runs
- **See mockups**: `mockups/analytics-option-{a,b,c}.html`

---

## Execution Order

```
Phase 4A: Taxonomy Governance (enables everything else — clean taxonomy needed first)
    ├── Tags tab in autotagging dashboard
    ├── Tree editor + merge/split/move
    └── Health indicators + suggested actions

Phase 4B: Scheduled Pipelines (enables automation)
    ├── Autotag Action + Vector Sync Action
    ├── Knowledge Hub Schedule tab
    └── Quick-schedule from dashboards

Phase 4C: Analytics Dashboard (shows value of 4A + 4B)
    ├── Tag growth, coverage, quality metrics
    └── Pipeline throughput + activity feed

Phase 4D: Cross-Entity Intelligence (builds on clean taxonomy from 4A)
    ├── Related Records widget
    ├── Tag co-occurrence analysis
    └── Smart Lists

Phase 4E: Search Enhancement (benefits from all above)
    ├── Tag faceted filtering
    ├── "More Like This"
    └── Tag chips on results
```

**Parallelizable**: 4A and 4B can proceed in parallel. 4C depends on both. 4D and 4E depend on 4A.

---

## Design Decisions

### Taxonomy Governance
**Chosen**: Tree + Details split view (Option A) as the primary interface, with additional tabs for Duplicates, Orphans, Treemap (from Option C), and Audit Log. The treemap provides a complementary visual exploration view alongside the tree's structural editing.

### Scheduled Pipelines  
**Chosen**: Job Cards Grid (Option B) with compact cards (~130px height, not full-height). Edit dialog uses `mj-dialog` modal pattern (not slide panel). Visual cron builder with frequency chips (Every Hour / Daily / Weekly / Custom) instead of raw cron text input. Reuses `ScheduledJobSummaryComponent` card pattern and `ScheduledJobEditorComponent` form within `mj-dialog`.

### Analytics & Insights
**Chosen**: Multi-Tab Deep Dive (Option B) with left sidebar navigation for sections (Overview, Tags, Sources, Pipeline, Quality). The Overview tab uses the Interactive Cards Grid approach (from Option C) with SVG gauges, progress rings, and sparklines for a rich, data-dense default view.

## Mockups

Final mockups in `/plans/knowledge-hub-phase4/mockups/` — each file renders ALL tabs/sub-views fully:

| Feature | Mockup | Tabs |
|---------|--------|------|
| Taxonomy Governance | `taxonomy-governance.html` | Tree View, Duplicates, Orphans, Treemap, Audit Log |
| Scheduled Pipelines | `scheduled-pipelines.html` | Card grid + Edit dialog overlay + Recent Activity |
| Analytics & Insights | `analytics-insights.html` | Overview, Tags, Sources, Pipeline, Quality |

## Reusable Components (from research)

### From `@memberjunction/ng-scheduling`
- `ScheduledJobSummaryComponent` — compact card widget for job status display
- `ScheduledJobEditorComponent` — full form editor (embeddable in any container)
- `ScheduledJobDialogComponent` — wraps editor in `mj-dialog` modal
- `ScheduledJobService` — data loading with job type caching
- **Gap**: No visual cron picker — editor uses raw text input. Phase 4 should add a `CronBuilderComponent` with frequency chips + time pickers.

### From existing Knowledge Hub
- `MJWordCloudComponent` — reusable for tag clouds in analytics sidebar
- `TagEngineBase` — tag hierarchy data for treemap and tree views
- `ClusterScatterComponent` — pattern reference for interactive SVG visualizations
