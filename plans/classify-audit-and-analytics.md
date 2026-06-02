# Classify — Audit & Analytics

**Branch:** `knowledge-hub-classify-redesign`
**Status:** Plan (not yet implemented)
**Author:** Jordan Fanapour / Claude
**Created:** 2026-06-02
**Depends on:** [knowledge-hub-classify-redesign.md](./knowledge-hub-classify-redesign.md) (decomposition + new features, merged)

---

## 1. Problem

The Classify sub-app has no meaningful way to inspect, audit, or analyze classification results. The Pipeline Monitor tab shows a "recent processing" feed with items that are indistinguishable from each other (e.g., every row says "Member Engagement Logs"), and the Run History tab only drills down to per-source aggregate stats — never to individual content items. There is no cross-run analytics view, no way to trace a tag back to the AI prompt run that produced it, and no way to see how a content item's tags changed across multiple pipeline runs.

### What users need

1. **Per-run item inspection**: After a pipeline run completes, page through all classified items, filter/sort them, and drill into each one to see exactly what happened — rendered content, extracted tags with reasoning and confidence, provenance links back to the content source, entity document, source entity record, and the AI prompt run.

2. **Cross-run analytics**: An overview dashboard with aggregate KPIs (tag distribution, items over time, confidence histograms, coverage gaps) and a searchable all-items grid that spans all runs.

3. **Per-item audit trail**: For any content item, see every pipeline run that processed it, what tags were applied/removed/changed, and the prompt runs used for each extraction.

---

## 2. Data Model (Ground Truth)

All entities already exist — no schema changes are required for this plan.

### Key entities and relationships

```
MJ: Content Process Runs (pipeline run)
  └─ MJ: Content Process Run Details (per-source breakdown)
       ├─ ItemsProcessed, ItemsTagged, ItemsVectorized, TotalTokensUsed, TotalCost
       └─ MJ: Content Process Run Prompt Runs (junction)
            └─ MJ: AI Prompt Runs (Messages, Result, TokensUsed, TotalCost, Success)
                 ↑ RunType: 'Tag' | 'Embed'

MJ: Content Items
  ├─ ContentSourceID → MJ: Content Sources → VectorIndexID, Configuration JSON
  ├─ ContentTypeID → MJ: Content Types
  └─ MJ: Content Item Tags
       ├─ Tag (free text), TagID (FK → MJ: Tags, nullable), Weight (0.0–1.0)
       └─ (no direct AIPromptRunID — lineage is via Content Process Run Prompt Runs)

MJ: Entity Documents
  ├─ EntityID → Entities (the source table, e.g., "Member Engagement Logs")
  └─ linked to Content Sources via ContentSourceTypeID
```

### Important constraints

- **`ContentItemTag` has no reasoning or prompt run ID.** Per-tag reasoning is embedded in the AI Prompt Run's `Result` JSON (the LLM response that produced the tag batch). To show reasoning per tag, we must parse the prompt run result.
- **`ContentItemTag.Weight`** is the only confidence signal per tag (0.0–1.0, LLM-assigned).
- **Lineage chain** for "which prompt run produced this item's tags": `ContentItem` → (by ProcessRunID or time correlation) → `ContentProcessRunDetail` → `ContentProcessRunPromptRun` → `AIPromptRun`. This is an indirect join — there is no direct FK from `ContentItemTag` to `AIPromptRun`.
- **Content item display name**: `ContentItem.Name` is currently set to the entity name (e.g., "Member Engagement Logs") rather than a distinguishing value from the source record. Fixing this is a backend/pipeline concern addressed in Plan 3 (UX Bug Fixes).

---

## 3. Architecture

### 3.1 Where things live

| Feature | Location | Rationale |
|---|---|---|
| Per-run item grid + drilldown | **Run History tab** (enhanced) | Natural home — user selects a run, then drills into its items. No new tab needed. |
| Cross-run analytics + all-items grid | **Pipeline Monitor tab** (enhanced, renamed "Overview") | Already has KPIs and serves as the landing page. Adding charts and a searchable grid below the existing stats keeps the overview role. |
| Content item drilldown panel | **Shared dialog component** (new) | Reused from both the History tab's per-run grid and the Overview's all-items grid. Slide-in panel, same pattern as existing `item-detail.dialog`. |

### 3.2 Component inventory

#### New components

| Component | Selector | Type | Purpose |
|---|---|---|---|
| `ClassifyItemGridComponent` | `classify-item-grid` | Standalone, reusable | AG Grid of content items with pagination, filtering, sorting. Accepts a `RunID` input (scoped to one run) or no RunID (all items). Emits `ItemSelected` with the item ID. |
| `ClassifyItemDrilldownComponent` | `classify-item-drilldown` | Standalone, dialog | Full inspection panel: rendered content, tags with weight + reasoning, provenance links, audit trail. Replaces the current `ClassifyItemDetailDialogComponent`. |
| `ClassifyAnalyticsComponent` | `classify-analytics` | Standalone, embedded in Overview tab | Charts and KPI cards for cross-run analytics. |

#### Modified components

| Component | Changes |
|---|---|
| `ClassifyHistoryTabComponent` | Add `classify-item-grid` below the run-detail expansion. When a run is selected and expanded, show a second section with the paginated item grid for that run. |
| `ClassifyPipelineTabComponent` | Rename to "Overview". Add `classify-analytics` section below existing KPIs. Add `classify-item-grid` (all-items mode) below analytics. Keep existing pipeline stage progress and feed for active runs. |
| `AutotaggingPipelineResourceComponent` (host) | Wire the new drilldown panel. Update tab label from "Pipeline" to "Overview". |

---

## 4. Detailed Design

### 4.1 Content Item Grid (`classify-item-grid`)

A paginated AG Grid component used in two modes:

**Inputs:**
- `RunID?: string` — if provided, filters to items from this run only; if omitted, shows all items across all runs
- `ContentSourceID?: string` — optional additional filter
- `ProviderToUse: IMetadataProvider` — passed from host

**Data loading:**
- Uses `RunView` with `ResultType: 'simple'` and explicit `Fields` for performance (no entity objects needed for the grid)
- Fields: `ID`, `Name`, `ContentSourceID`, `ContentTypeID`, `__mj_CreatedAt`, `__mj_UpdatedAt`, plus view fields for `ContentSource` (name) and `ContentType` (name)
- Server-side pagination via `MaxRows` + `StartRow` (UI grid pagination, not deep iteration)
- Client-side filtering on the loaded page via AG Grid's built-in filter

**Columns:**
| Column | Source | Notes |
|---|---|---|
| Display Name | `ContentItem.Name` + fallback logic | See Section 4.4 for display name strategy |
| Source | View field `ContentSource` | Clickable — navigates to Sources tab filtered to this source |
| Content Type | View field `ContentType` | |
| Tags | Loaded via a batched secondary query | Rendered as colored pills with weight tooltip |
| Processed | `__mj_UpdatedAt` | Relative time (e.g., "2 hours ago") |
| Weight (avg) | Computed client-side from tags | Sortable, gives a quick confidence signal |

**Tag loading strategy:**
- After the grid page loads, fire a single `RunView` for `MJ: Content Item Tags` filtered by `ItemID IN (...)` for the visible page's item IDs
- Group tags by ItemID client-side and inject into the grid rows
- This avoids N+1 queries — one grid query + one tag query per page

**Outputs:**
- `ItemSelected: EventEmitter<string>` — emits the content item ID when a row is clicked

### 4.2 Content Item Drilldown (`classify-item-drilldown`)

A slide-in panel (same visual pattern as the existing source/type form slide-in) that replaces the current `ClassifyItemDetailDialogComponent`.

**Input:** `ItemID: string`

**Data loading (on open):**
- Load the `ContentItem` entity object (`ResultType: 'entity_object'`, single record by ID)
- Load `ContentItemTags` for this item (`RunView`, `ResultType: 'simple'`)
- Load `ContentSource` for provenance (from `KnowledgeHubMetadataEngine` cache — already loaded)
- Load AI prompt run lineage (see Section 4.3)

**Layout — four sections:**

#### Section A: Rendered Content
- **Entity Document source**: Render key fields from the source entity record. Load the source record via the Entity Document's `EntityID` — use `RunView` with `ExtraFilter` matching the content item's source record ID. Display fields in a read-only form layout. Include a "Open Record" link that navigates to the entity record in Explorer.
- **Other source types (PDF, file, etc.)**: Render `ContentItem.Text` using the `mjSafeRichHtml` pipe (if HTML/Markdown) or as plain text with a monospace code block. Show a download/open link if `ContentItem.URL` is available.
- **Default fallback**: Plain text rendering of `ContentItem.Text` with basic metadata (name, URL, checksum).

The renderer selection is based on `ContentSourceTypeID` — Entity Document sources get the entity renderer, file-based sources get the file renderer, everything else gets the default.

#### Section B: Tags & Extraction Results
- Display each tag as a card (not just a pill):
  - **Tag name** (linked to the tag in the Tag Library tab if `TagID` is set; shown as "unmatched" if `TagID` is null)
  - **Weight** as a horizontal bar or percentage (0–100%)
  - **Reasoning** (extracted from the AI prompt run result — see Section 4.3)
  - **Matched vs. suggested**: Visual indicator if the tag was auto-matched to an existing taxonomy tag vs. created as a new suggestion

#### Section C: Provenance Links
A metadata card with clickable links:
- **Content Source**: Name + link to Sources tab, filtered to this source
- **Entity Document**: Name + link to the Entity Document record (if source type is Entity Document)
- **Source Entity Record**: Link to the entity record in Explorer (if applicable)
- **AI Prompt Run**: Link to the prompt run record, showing model used, tokens, cost, and timing
- **Pipeline Run**: Link to the Run History tab, filtered to the run that processed this item

#### Section D: Audit Trail
A timeline/accordion showing every pipeline run that processed this content item, ordered newest-first:
- **Run date** + **Run ID** (linked to History tab)
- **Tags applied** in that run (with weight)
- **Tags removed** since previous run (diff-style, shown in red/strikethrough)
- **Tags unchanged** (shown muted)
- **Prompt run** used for extraction (model, tokens, cost)

**How to build the audit trail:**
- Load all `ContentItemTag` records for this item (current state)
- Load all `ContentProcessRun` records that include this item's source, ordered by `StartTime DESC`
- For each run, load the `ContentProcessRunPromptRun` junction to find the `AIPromptRun` records with `RunType = 'Tag'`
- Parse each prompt run's `Result` field to extract per-tag reasoning (the LLM response is structured JSON — see Section 4.3)
- Compare tags across runs to show diffs

**Note on historical tag state:** `ContentItemTag` only stores the current state — there is no historical tag table. MJ's Record Changes (entity version control) tracks all changes to `ContentItemTag` records, so historical state can be reconstructed from the `Record Changes` entity. If Record Changes is enabled for `MJ: Content Item Tags`, we can load the change history to build the diff view. If not enabled, the audit trail shows only the current tags + the prompt run history without diffs.

### 4.3 AI Prompt Run Lineage & Reasoning Extraction

The lineage from a content item to its extraction prompt run is indirect:

```
ContentItem.ContentSourceID
  → ContentProcessRunDetail.ContentSourceID (+ filter by time overlap with item's UpdatedAt)
    → ContentProcessRunPromptRun (RunType = 'Tag')
      → AIPromptRun.Result (JSON containing tags + reasoning)
```

**Reasoning extraction:**
- The tag extraction prompt returns structured JSON in `AIPromptRun.Result`
- The result typically contains an array of `{ tag: string, weight: number, reasoning: string }` objects
- Parse this JSON and match each entry to the corresponding `ContentItemTag` by tag name
- If the result format varies (older runs, different prompts), fall back to showing the raw result text

**Caching:** Prompt run results can be large. Load them lazily — only when the user expands the audit trail section or clicks "Show reasoning" on a specific tag.

### 4.4 Content Item Display Name Strategy

The current problem: `ContentItem.Name` is set to the entity name (e.g., "Member Engagement Logs") making every row in the grid identical.

**Short-term fix (this plan):**
- In the item grid, show `ContentItem.Name` as a subtitle and derive a **display title** from available data:
  - If the item has `ContentItem.Description` (non-empty), use it (truncated to ~80 chars)
  - If the item has `ContentItem.Text` (non-empty), use the first line or first 80 chars
  - Otherwise, fall back to `ContentItem.Name` + a disambiguator (e.g., the item's `__mj_CreatedAt` date)

**Long-term fix (backend, separate work):**
- The classification pipeline should populate `ContentItem.Name` with a meaningful value derived from the source record (e.g., for Entity Documents, use a configurable "title field" from the entity's fields — subject line, title, first name + last name, etc.)
- This is a pipeline-level change, not a UI change, and belongs in a separate plan

### 4.5 Cross-Run Analytics (`classify-analytics`)

Embedded in the Overview (formerly Pipeline Monitor) tab below the existing KPIs.

**KPI cards (row 1):**
- Total Content Items (all-time)
- Total Tags Applied (all-time)
- Avg Tags per Item
- Avg Confidence (mean weight across all ContentItemTags)
- Items Processed (last 30 days)

**Charts (row 2):**
- **Tag Distribution** (horizontal bar chart): Top 20 tags by usage count. Clickable — filters the all-items grid below to items with that tag.
- **Items Processed Over Time** (line chart): Items processed per day/week over the last 90 days, grouped by content source. Shows processing cadence and volume trends.
- **Confidence Histogram** (vertical bar chart): Distribution of `ContentItemTag.Weight` values across buckets (0–0.2, 0.2–0.4, etc.). Helps identify low-confidence tagging that may need review.

**All-items grid (row 3):**
- Same `classify-item-grid` component used in the History tab, but in "all items" mode (no `RunID` filter)
- Persistent filters: by Content Source, by Content Type, by Tag, by date range, by confidence threshold
- Clicking a row opens the same `classify-item-drilldown` panel

**Data loading:**
- KPIs: Aggregation queries via `RunView` with `AggregateMode` or `RunQuery` for custom SQL
- Charts: Load raw data via `RunView` with targeted fields, aggregate client-side
- All-items grid: Same `classify-item-grid` component, no `RunID` input

---

## 5. Implementation Phases

### Phase 1 — Content Item Grid Component
1. Create `ClassifyItemGridComponent` with AG Grid, pagination, and tag loading
2. Integrate into `ClassifyHistoryTabComponent` — show item grid when a run is expanded
3. Wire `ItemSelected` output to open the drilldown

### Phase 2 — Content Item Drilldown Component
1. Create `ClassifyItemDrilldownComponent` replacing the existing item detail dialog
2. Implement Section A (rendered content) with source-type-aware rendering
3. Implement Section B (tags with weight + reasoning extraction from prompt run results)
4. Implement Section C (provenance links)
5. Implement Section D (audit trail with run history and tag diffs)

### Phase 3 — Cross-Run Analytics
1. Create `ClassifyAnalyticsComponent` with KPI cards
2. Add tag distribution chart
3. Add items-over-time chart
4. Add confidence histogram
5. Integrate into the Overview tab below existing KPIs
6. Add the all-items grid (reuse `classify-item-grid` in unfiltered mode)

### Phase 4 — Overview Tab Rename & Integration
1. Rename "Pipeline" tab to "Overview" in the host component and left nav
2. Rearrange the Overview tab layout: existing pipeline progress + feed (top, shown during active runs) → analytics section → all-items grid
3. Update user preferences key if tab name is stored

---

## 6. Open Questions

1. **Chart library**: The MJ Angular ecosystem doesn't currently use a charting library. Options: lightweight standalone (Chart.js via ng2-charts), Kendo Charts (already in the workspace), or AG Charts (pairs with AG Grid). Recommendation: use Kendo Charts since Kendo is already a dependency.

2. **Aggregation queries**: Some KPIs (total items, avg confidence) may benefit from SQL aggregation via `RunQuery` rather than loading all rows client-side. Need to verify what `RunQuery` capabilities are available in the current GraphQL schema.

3. **Record Changes availability**: The audit trail's tag-diff feature depends on Record Changes being enabled for `MJ: Content Item Tags`. If it's not enabled, the diff view degrades gracefully to showing only current tags + prompt run history. Should we require it to be enabled?

4. **Content Item Name improvement**: The long-term fix (populating meaningful names in the pipeline) is a backend change. Should this be a prerequisite for this plan, or is the short-term display-name fallback sufficient?

5. **Prompt run result format**: Need to verify the exact JSON structure of the tag extraction prompt's output to ensure reasoning can be reliably parsed. If the format isn't consistent, we may need to standardize it in the pipeline first.
