# Entity-Viewer Toolbar UX Improvements

**Status:** Proposed
**Created:** January 25, 2025
**Related:** [view-system-enhancements-2nd-pass.md](view-system-enhancements-2nd-pass.md)

## Executive Summary

The entity-viewer toolbar system consists of two layers:
1. **Entity-Viewer Header** - View mode toggles, filter, record count
2. **Entity-Data-Grid Toolbar** - CRUD actions, export, selection-based operations

While functional, there are several opportunities to improve usability, visual hierarchy, and information density.

---

## Current State Analysis

### 1. Entity-Viewer Header

**Location:** [entity-viewer.component.html:3-104](../packages/Angular/Generic/entity-viewer/src/lib/entity-viewer/entity-viewer.component.html#L3-L104)

**Current Layout:**
```
┌──────────────────────────────────────────────────────────────────────┐
│ [🔍 Filter input...     ×]   "X of Y records"   [Grid][Cards][Time] │
│                                                 [📅 Date][↕][↑↓]     │
└──────────────────────────────────────────────────────────────────────┘
```

**Issues Identified:**

| Issue | Severity | Impact |
|-------|----------|--------|
| **Timeline controls only appear when timeline active** | Medium | Users don't know timeline options exist until they switch |
| **No visual grouping** of related controls | Low | Cognitive load when scanning toolbar |
| **Record count awkward placement** | Low | Competes with filter for attention |
| **Filter lacks keyboard shortcut indicator** | Low | Power users can't discover Cmd+F |

### 2. Entity-Data-Grid Toolbar

**Location:** [entity-data-grid.component.html:8-260](../packages/Angular/Generic/entity-viewer/src/lib/entity-data-grid/entity-data-grid.component.html#L8-L260)

**Current Layout:**
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [🔍 Search...]  [Custom]     "X rows (Y selected)"     [+New][↻][⬇][🗑][⋮] │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Issues Identified:**

| Issue | Severity | Impact |
|-------|----------|--------|
| **Duplicate search/filter** between viewer header and grid toolbar | High | Confusing - which to use? |
| **Too many buttons visible** at once (up to 9+) | High | Visual clutter, choice paralysis |
| **Legacy + new button systems coexist** | Medium | Code complexity, inconsistent behavior |
| **No button grouping** | Medium | Related actions not visually connected |
| **Text labels on all buttons** waste horizontal space | Medium | Cramped on narrow screens |
| **Selection-dependent buttons** appear/disappear unpredictably | Medium | UI "jumps" when selecting rows |
| **Overflow menu lacks organization** | Low | Flat list hard to scan |

---

## Proposed Improvements

### Proposal 1: Unified Toolbar with Contextual Regions

**Mockup:**
```
┌────────────────────────────────────────────────────────────────────────────────┐
│ FILTER REGION          │ INFO REGION       │ VIEW REGION   │ ACTIONS REGION   │
│ [🔍 Filter... (⌘F) ×]  │ 142 of 500 rows   │ [≡][⊞][📅]    │ [+][↻][⬇]  [⋮]  │
│                        │ 3 selected        │               │                   │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Key Changes:**
- **Single filter** - Remove grid toolbar search, keep viewer-level filter only
- **Clear visual regions** with subtle separators
- **Keyboard shortcut hints** (⌘F) for discoverability
- **Icon-only primary actions** with tooltip on hover
- **Unified overflow menu** for less-used actions

### Proposal 2: Progressive Disclosure with Action Groups

**Mockup (collapsed state - most common):**
```
┌──────────────────────────────────────────────────────────────────────┐
│ [🔍 Filter...        ×]    142 records    [≡ Grid ▾]    [+ New ▾]   │
└──────────────────────────────────────────────────────────────────────┘
```

**Mockup (with selection - actions expand):**
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [🔍 Filter...        ×]  142 records (3 selected)  [≡ Grid ▾]  [Actions ▾]  │
│                                                                              │
│ Selection Actions:  [📧 Email]  [📋 Add to List]  [🔀 Compare]  [🗑 Delete] │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Key Changes:**
- **Dropdowns for related actions** (View modes, CRUD operations)
- **Selection actions appear in dedicated row** when items selected
- **Reduced default button count** (2-3 visible vs 8+)

### Proposal 3: Material Design 3 Inspired Compact Toolbar

**Mockup:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────┐                                        │
│ │ 🔍  Filter records...    ×  │  142 / 500        [≡][⊞][📅]  [+ ↻ ⬇] │
│ └─────────────────────────────┘                                        │
└─────────────────────────────────────────────────────────────────────────┘
                                                          ↑
                                                     Segmented button group
```

**Key Changes:**
- **Pill-shaped search** (Material 3 style)
- **Segmented button groups** for view modes and actions
- **Fraction notation** for record count (more compact)
- **No text labels** on action buttons (icons with tooltips)

---

## Detailed Recommendations

### A. Eliminate Toolbar Duplication (HIGH PRIORITY)

**Problem:** Both entity-viewer (line 7-21) and entity-data-grid (line 11-25) have search/filter inputs.

**Solution:**
1. Remove `showSearch` from `GridToolbarConfig`
2. Entity-viewer filter becomes the single source of truth
3. Filter text passed down to grid via `FilterText` input (already working)

**Before:**
```html
<!-- entity-viewer header -->
<input class="filter-input" ... />

<!-- ALSO in entity-data-grid toolbar -->
<input class="search-input" ... />  <!-- REDUNDANT -->
```

**After:**
```html
<!-- entity-viewer header ONLY -->
<input class="filter-input" ... />
```

### B. Button Grouping with Visual Hierarchy

**Current (flat, overwhelming):**
```
[New][Refresh][Export][Delete][Compare][Merge][Add to List][Find Dupes][Send Message]
```

**Proposed (grouped by function):**
```
CREATE GROUP     │  DATA GROUP    │  SELECTION GROUP (conditional)
[+ New]          │  [↻][⬇]        │  [📧][📋][🔀][🗑]
```

**CSS Implementation:**
```css
.toolbar-group {
  display: flex;
  gap: 4px;
  padding: 0 8px;
  border-right: 1px solid var(--grid-border-color);
}

.toolbar-group:last-child {
  border-right: none;
}
```

### C. Contextual View Mode Settings

**Problem:** Timeline settings only visible when timeline active (line 65-102). Users don't discover these options.

**Solution:** Move view-specific settings to a settings popover accessible from all view modes.

**Mockup:**
```
       View Modes          Settings Popover (on click)
          │                      │
    ┌─────┴─────┐          ┌─────┴─────────────────────┐
    │ [≡][⊞][📅]│──[⚙]───▶│  Grid Settings            │
    └───────────┘          │  ☑ Striped rows           │
                           │  ☐ Text wrapping          │
                           │  Row height: [Normal ▾]    │
                           │                           │
                           │  Timeline Settings        │
                           │  Date field: [Created ▾]  │
                           │  Sort: [Newest first ▾]   │
                           │  Orientation: [Vertical ▾]│
                           └───────────────────────────┘
```

### D. Selection Feedback Enhancement

**Problem:** Selection count appears in center of toolbar, separate from actions that require selection.

**Solution:** Move selection indicator next to selection-dependent actions.

**Before:**
```
[Search]     "5 rows (3 selected)"     [New][Refresh][Delete]
```

**After:**
```
[Search]     "5 rows"     [New][↻]  │  [3 selected ▾]─[📧][📋][🗑]
                                          └─ Dropdown shows selection actions
```

### E. Responsive Overflow Strategy

**Problem:** Current overflow menu (line 212-258) is flat and disorganized.

**Solution:** Categorized overflow menu with clear sections.

**Mockup:**
```
┌───────────────────────────┐
│  📤 Export                │
│  📊 Export to Excel       │
│  📋 Export to CSV         │
├───────────────────────────┤
│  🔧 Tools                 │
│  📐 Manage Columns        │
│  🔍 Find Duplicates       │
├───────────────────────────┤
│  ⚡ Entity Actions        │
│  → Run Report             │
│  → Send Notification      │
└───────────────────────────┘
```

---

## Implementation Priority

| Change | Effort | Impact | Priority |
|--------|--------|--------|----------|
| Remove duplicate search input | Low | High | **P0** |
| Button grouping with separators | Low | Medium | **P1** |
| View settings popover | Medium | Medium | **P1** |
| Categorized overflow menu | Medium | Medium | **P2** |
| Selection actions row | High | Medium | **P2** |
| Keyboard shortcut indicators | Low | Low | **P3** |

---

## CSS Variables for Consistency

Add to entity-data-grid CSS to support theming:

```css
:host {
  /* Toolbar spacing */
  --toolbar-height: 48px;
  --toolbar-group-gap: 16px;
  --toolbar-button-gap: 4px;

  /* Button variants */
  --toolbar-btn-primary-bg: var(--mj-primary);
  --toolbar-btn-danger-bg: #dc2626;
  --toolbar-btn-icon-only-size: 32px;

  /* Responsive breakpoints */
  --toolbar-collapse-width: 768px;
}
```

---

## Summary

The current toolbar implementation is **functionally complete** but suffers from:
1. **Redundant UI elements** (duplicate search)
2. **Visual clutter** (too many buttons)
3. **Poor discoverability** (hidden view settings)
4. **Inconsistent grouping** (flat button list)

The proposed changes focus on **progressive disclosure**, **visual hierarchy**, and **contextual relevance** to create a cleaner, more intuitive interface without removing any functionality.

---

## Files to Modify

- `packages/Angular/Generic/entity-viewer/src/lib/entity-viewer/entity-viewer.component.html`
- `packages/Angular/Generic/entity-viewer/src/lib/entity-viewer/entity-viewer.component.css`
- `packages/Angular/Generic/entity-viewer/src/lib/entity-data-grid/entity-data-grid.component.html`
- `packages/Angular/Generic/entity-viewer/src/lib/entity-data-grid/entity-data-grid.component.css`
- `packages/Angular/Generic/entity-viewer/src/lib/entity-data-grid/models/grid-types.ts` (GridToolbarConfig)

---

## RunView Usage Analysis & Optimization

### Summary Table

| Location | Purpose | Frequency | Cacheable? | Optimization |
|----------|---------|-----------|------------|--------------|
| **entity-viewer.component.ts:973** | Load main entity data | Per page load | No* | Main data - keep as-is |
| **entity-data-grid.component.ts:2776** | Load grid data (client mode) | Per page load | No* | Main data - keep as-is |
| **entity-data-grid.component.ts:2905** | Infinite scroll fetch | Per scroll | No* | Main data - keep as-is |
| **entity-data-grid.component.ts:1805** | Refresh aggregates only | On GridState change | Yes | Use cached params |
| **entity-record-detail-panel.ts:151** | Related entity counts | Per record select | Partial | Batch with main load |
| **entity-record-detail-panel.ts:437** | Related entity records | On expand | No | User-initiated, OK |
| **entity-cards.component.ts:178** | Standalone card data | Per entity change | No* | Main data - keep as-is |
| **view-selector.component.ts:148** | **Load views dropdown** | **Per entity change** | **YES** | **Use UserViewEngine** |

*Main data queries are inherently dynamic and can't be cached

---

### Detailed Analysis by Category

#### 1. Main Data Loading (Necessary - Keep As-Is)

These are the primary data fetches for displaying user data:

**entity-viewer.component.ts:973-1004**
```typescript
const result = await rv.RunView({
  EntityName: entity.Name,
  ResultType: 'entity_object',
  MaxRows: config.pageSize,
  StartRow: startRow,
  OrderBy: orderBy,
  ExtraFilter: extraFilter,
  UserSearchString: ...
});
```
**Verdict:** Required. User data must be fetched fresh.

---

#### 2. Aggregate Refresh (Optimizable)

**entity-data-grid.component.ts:1805-1820**
```typescript
const result = await rv.RunView({
  EntityName: this._entityInfo.Name,
  MaxRows: 0, // Only get aggregates, no row data
  ExtraFilter: extraFilter,
  Aggregates: aggregateExpressions
});
```
**Current Issue:** Called separately from main data load when GridState changes.

**Optimization:** When data is loaded with aggregates, cache the aggregate results. Only re-fetch aggregates when:
- Filter changes (ExtraFilter different)
- Aggregate expressions change
- User explicitly requests refresh

---

#### 3. Related Entity Counts (Potentially Optimizable)

**entity-record-detail-panel.ts:144-152**
```typescript
const viewParams: RunViewParams[] = relationships.map(rel => ({
  EntityName: rel.RelatedEntity,
  ExtraFilter: `${rel.RelatedEntityJoinField}='${pkValue}'`,
  ResultType: 'count_only'
}));
const results = await rv.RunViews(viewParams); // Batch call
```

**Current Pattern:** Good - uses `RunViews` (batch) instead of multiple `RunView` calls.

**Potential Optimization:**
- Cache counts per record PK for session duration
- Pre-fetch counts for visible records in grid
- Consider adding count columns to main entity view (denormalized)

---

#### 4. View Selector Dropdown (HIGH PRIORITY OPTIMIZATION)

**view-selector.component.ts:148-156**
```typescript
const rv = new RunView();
const result = await rv.RunView<UserViewEntityExtended>({
  EntityName: 'User Views',
  ExtraFilter: `EntityID = '${this.entity.ID}' AND (UserID = '${userId}' OR IsShared = 1)`,
  OrderBy: 'Name',
  ResultType: 'entity_object'
});
```

**Current Issues:**
1. Every view-selector instance loads views independently
2. Views are relatively static (rarely change during session)
3. Same query runs multiple times when switching entities back and forth

**Optimization:** Use `UserViewEngine.GetAccessibleViewsForEntity(entityId)`:

```typescript
// BEFORE (current)
const rv = new RunView();
const result = await rv.RunView<UserViewEntityExtended>({
  EntityName: 'User Views',
  ExtraFilter: `EntityID = '${this.entity.ID}' AND ...`,
  ...
});

// AFTER (optimized)
await UserViewEngine.Instance.Config(); // Once at app startup
const views = UserViewEngine.Instance.GetAccessibleViewsForEntity(this.entity.ID);
// Returns cached results, single query shared across all components
```

**Benefits:**
- Single cache for all view-selector instances
- Automatic cache invalidation on view save/delete
- ~80% reduction in view queries during typical session

---

### Optimization Priority Matrix

| Optimization | Effort | Impact | Priority |
|-------------|--------|--------|----------|
| View-selector → UserViewEngine | Low | High | **P0** |
| Cache aggregate results | Medium | Medium | **P1** |
| Pre-fetch related counts | High | Low | **P3** |

---

### Recommended Implementation for P0 (View-Selector)

**File:** `/packages/Angular/Explorer/dashboards/src/DataExplorer/components/view-selector/view-selector.component.ts`

**Changes Required:**

1. Import UserViewEngine:
```typescript
import { UserViewEngine } from '@memberjunction/core-entities';
```

2. Replace loadViews() method:
```typescript
public async loadViews(): Promise<void> {
  if (!this.entity) return;

  this.isLoading = true;
  this.cdr.detectChanges();

  try {
    const userId = this.metadata.CurrentUser?.ID;

    // Use cached UserViewEngine instead of direct RunView
    const accessibleViews = UserViewEngine.Instance.GetAccessibleViewsForEntity(this.entity.ID);

    // Separate into owned and shared
    this.myViews = accessibleViews
      .filter(v => v.UserID === userId)
      .map(v => this.mapViewToListItem(v, true));

    this.sharedViews = accessibleViews
      .filter(v => v.UserID !== userId)
      .map(v => this.mapViewToListItem(v, false));

    this.updateSelectedViewFromId();
  } finally {
    this.isLoading = false;
    this.cdr.detectChanges();
  }
}
```

3. Ensure UserViewEngine is initialized at app startup (in MJ Explorer bootstrap).

---

### Query Reduction Estimate

| Scenario | Before | After | Reduction |
|----------|--------|-------|-----------|
| Open data explorer, switch between 5 entities | 5 RunView calls | 0 (cached) | 100% |
| Open view selector dropdown 10 times | 10 RunView calls | 1 (initial) | 90% |
| Session with 20 entity switches | 20 RunView calls | 1-3 (cache misses) | 85-95% |
