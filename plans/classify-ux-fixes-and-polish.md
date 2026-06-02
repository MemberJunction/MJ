# Classify — UX Bug Fixes & Polish

**Branch:** `knowledge-hub-classify-redesign`
**Status:** Plan (not yet implemented)
**Author:** Jordan Fanapour / Claude
**Created:** 2026-06-02
**Depends on:** [knowledge-hub-classify-redesign.md](./knowledge-hub-classify-redesign.md) (decomposition + new features, merged)

---

## 1. Problem

The Classify sub-app has a number of UX bugs and quality issues that undermine usability and trust in the tool. These range from broken scrolling that makes entire tabs unusable, to missing real-time data updates, to content items that are indistinguishable from each other because they all share the same display name.

These issues were identified during real-world use setting up AGRIP's MEL record classification.

---

## 2. Bug Inventory

### 2.1 Missing Scroll on Tab Containers

**Severity:** High — renders content inaccessible when it overflows the viewport

**Current state:** 7 of 8 tab components have no `overflow` CSS rules on their content containers. The Inbox tab is the only one with `overflow: auto`. The Health tab explicitly sets `overflow: hidden`, which actively prevents scrolling.

| Tab | Overflow CSS | Status |
|---|---|---|
| Pipeline | none | Broken |
| Sources | none | Broken |
| Content Types | none | Broken |
| Tag Library | none | Broken |
| Taxonomy | none | Broken |
| Suggestions Inbox | `overflow: auto` | Working |
| Tag Health | `overflow: hidden` | Broken (actively prevents scroll) |
| Run History | none | Broken |

**Fix:** Add `overflow-y: auto` to the primary content container in each tab's CSS. The container should be the element wrapping the tab's scrollable content below any sticky header/toolbar. Use `<mj-page-body-interior>` as the scroll boundary where applicable — it already handles overflow in other dashboard tabs.

### 2.2 No Real-Time Data Updates (Missing MJGlobal Event Subscriptions)

**Severity:** Medium — data goes stale after mutations without manual refresh

**Current state:** Zero `MJGlobal`, `BaseEntityEvent`, or `MJEventType` subscriptions exist anywhere in the autotagging component tree. When a pipeline run completes, when tags are created/modified, or when suggestions are approved/rejected, the UI does not update unless the user manually triggers a refresh (where refresh buttons even exist).

**What should be reactive:**
- Pipeline Monitor KPIs should update when a pipeline run completes or progresses
- Tag Library word cloud should update when new tags are created
- Suggestions Inbox badge count should update when new suggestions arrive or existing ones are resolved
- Sources tab stats (content item count, tag count) should update after a pipeline run

**Fix options (in order of preference):**

1. **Subscribe to `BaseEntityEvent` for relevant entities**: Listen for save/delete events on `MJ: Content Items`, `MJ: Content Item Tags`, `MJ: Tags`, `MJ: Tag Suggestions`, and `MJ: Content Process Runs`. On event, trigger a targeted reload of the affected data. This is the standard MJ pattern.

2. **Use engine observables where available**: `TagEngineBase` and `KnowledgeHubMetadataEngine` already cache data and emit change events via `ObserveProperty`. Subscribe to these in the tabs that display their data (Tag Library, Sources, Content Types).

3. **Poll on a timer**: Least preferred — use only as a fallback for data not covered by events (e.g., pipeline run progress is already handled by GraphQL subscription, which is correct).

**Implementation notes:**
- Subscribe in each tab component's `ngOnInit` (or `OnInit` lifecycle)
- Unsubscribe in `ngOnDestroy` using a `destroy$` Subject + `takeUntil` pattern
- After receiving an event, debounce reloads (300ms) to batch rapid-fire events during a pipeline run

### 2.3 Missing Refresh Buttons on Multiple Tabs

**Severity:** Medium — users have no manual workaround for stale data on affected tabs

**Current state:** Only the Pipeline, Inbox, Health, and Taxonomy tabs have functioning refresh buttons. The Sources, Tags, History, and Content Types tabs have no refresh button in their templates.

**Fix:** Add a refresh button to every tab's `<mj-page-header-interior>` actions slot. Each button should call the tab's data reload method. Follow the pattern already established in the Inbox tab:

```html
<mj-page-header-interior>
  <!-- ... existing header content ... -->
  <div actions>
    <button mjButton ThemeColor="primary" FillMode="flat" (click)="Refresh()" [disabled]="IsLoading">
      <i class="fa-solid fa-arrows-rotate"></i> Refresh
    </button>
  </div>
</mj-page-header-interior>
```

### 2.4 Indistinguishable Content Item Display Names

**Severity:** High — makes the recent processing feed and any item listing useless for identification

**Current state:** `ContentItem.Name` is populated by the classification pipeline with the entity name (e.g., "Member Engagement Logs") rather than a distinguishing value from the source record. Every item in the feed looks identical.

**Root cause:** This is a pipeline-level issue — the `Name` field is set when content items are created/updated during processing. The UI faithfully displays what's stored.

**Two-part fix:**

#### Part A — UI fallback (immediate, this plan)
In any component that displays content item names (feed items, grids, drilldown), apply a display-name derivation:

```typescript
function deriveDisplayName(item: { Name?: string; Description?: string; Text?: string; __mj_CreatedAt?: Date }): string {
    // 1. If Description is non-empty and different from Name, use it (truncated)
    if (item.Description && item.Description !== item.Name) {
        return truncate(item.Description, 80);
    }
    // 2. If Text is non-empty, use the first meaningful line (truncated)
    if (item.Text) {
        const firstLine = item.Text.split('\n').find(l => l.trim().length > 10) || item.Text;
        return truncate(firstLine.trim(), 80);
    }
    // 3. Fall back to Name + creation date for disambiguation
    const date = item.__mj_CreatedAt ? formatDate(item.__mj_CreatedAt) : '';
    return `${item.Name || 'Untitled'}${date ? ` (${date})` : ''}`;
}
```

Place this utility in `shared/classify.format.ts` alongside existing formatters.

#### Part B — Pipeline fix (backend, separate work)
The classification pipeline should populate `ContentItem.Name` with a meaningful derived value at ingestion time. For Entity Document sources, this means using a configurable "title field" from the entity's metadata (e.g., the first string field, or a user-specified field in the Entity Document configuration). This is a backend change to `TagEngine` / the content ingestion pipeline and is out of scope for this UI-focused plan — but it should be tracked as a follow-up.

### 2.5 Hard-Capped RunView Results (No Pagination)

**Severity:** Medium — data is silently truncated, leading to inaccurate counts and missing items

**Current state:**
- Content items are capped at `MaxRows: 200` in the host component
- Process runs are capped at `MaxRows: 100`
- The code acknowledges this with comments like "undercounts when capped"
- No pagination UI exists — users see at most 200 items with no indication that more exist

**Fix:**

1. **Add pagination to all item-listing views**: Use AG Grid's built-in pagination (already available since AG Grid is a dependency). Set `paginationPageSize: 50` and use server-side pagination via `MaxRows` + `StartRow` on RunView.

2. **Show total counts accurately**: Use a separate count query (or the `RunView` result's `TotalRowCount` if available) to show "Showing 1–50 of 285 items" rather than silently capping.

3. **Remove hardcoded MaxRows from aggregate queries**: For KPIs that need total counts (e.g., "285 Content Items"), use `RunView` with `AggregateMode` or `RunQuery` to get accurate counts without loading all rows.

4. **For the feed (Pipeline tab)**: The feed is a "most recent N" view — keep `MaxRows` but show a clear "Showing most recent 50 items" label and a "Load more" button or "View all in History" link.

### 2.6 Inconsistent Loading States

**Severity:** Low — cosmetic but affects perceived quality

**Current state:** Some tabs show loading indicators during data fetch, others don't. The standard MJ loading component (`<mj-loading>`) is not consistently used.

**Fix:** Ensure every tab that loads data shows `<mj-loading>` during its initial load and during refreshes. Use an `IsLoading` boolean flag (already present in some tabs) and wrap the content in:

```html
@if (IsLoading) {
    <mj-loading text="Loading..." size="medium"></mj-loading>
} @else {
    <!-- tab content -->
}
```

---

## 3. Implementation Phases

### Phase 1 — Critical Usability (scroll + display names)
1. Add `overflow-y: auto` to all 7 broken tab containers
2. Implement `deriveDisplayName()` utility and apply it to the feed and any item listings
3. Fix Health tab's `overflow: hidden` → `overflow-y: auto`

### Phase 2 — Data Freshness (refresh + subscriptions)
1. Add refresh buttons to Sources, Tags, History, and Content Types tabs
2. Add `BaseEntityEvent` subscriptions to tabs that display mutable data
3. Wire engine observables (`TagEngineBase`, `KnowledgeHubMetadataEngine`) where available

### Phase 3 — Pagination & Counts
1. Replace hardcoded `MaxRows` caps with paginated grids
2. Add accurate total count queries for KPIs
3. Add "Showing X of Y" labels to all item listings

### Phase 4 — Polish
1. Standardize `<mj-loading>` usage across all tabs
2. Verify all tabs handle empty states gracefully (no blank screens)
3. Test all tabs at various viewport sizes for responsive behavior

---

## 4. Testing Checklist

- [ ] Every tab scrolls when content exceeds the viewport height
- [ ] Feed items are distinguishable (no duplicate display names for different records)
- [ ] Every tab has a working Refresh button
- [ ] After a pipeline run completes, affected tabs update without manual refresh
- [ ] Content item counts are accurate (not capped at 200)
- [ ] Pagination works on item grids (next/prev page loads correctly)
- [ ] Loading indicators appear during data fetches on all tabs
- [ ] No console errors related to missing subscriptions or unhandled events
