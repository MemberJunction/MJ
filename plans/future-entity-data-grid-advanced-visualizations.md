# Advanced Visualizations Proposal: Master/Detail & Tree Data

> **Status**: Future consideration - tabled for now pending strategic decision on grid library

## Executive Summary

This proposal outlines the implementation of two advanced visualization features for the entity-viewer component:

1. **Master/Detail Views**: Multiple configurable sub-grids showing related entity data when a row is expanded
2. **Tree Data Display**: Hierarchical visualization for entities with recursive (self-referential) foreign keys

Both features will be opt-in, user-configurable, and integrated into the existing view configuration panel under a new "Advanced" tab.

---

## CRITICAL: AG Grid Licensing Reality

### Both Tree Data AND Master/Detail are Enterprise-Only Features

After thorough research of AG Grid's official documentation, **both Tree Data and Master/Detail are Enterprise features** requiring a $999/license commercial license:

| Feature | Community (Free) | Enterprise ($999) |
|---------|-----------------|-------------------|
| Tree Data | ❌ | ✅ |
| Master/Detail | ❌ | ✅ |
| Row Grouping | ❌ | ✅ |
| Server-Side Row Model | ❌ | ✅ |

**Sources:**
- [AG Grid Community vs Enterprise](https://www.ag-grid.com/angular-data-grid/community-vs-enterprise/)
- [AG Grid Tree Data Docs](https://www.ag-grid.com/javascript-data-grid/tree-data/) - Shows Enterprise badge
- [AG Grid License Pricing](https://www.ag-grid.com/license-pricing/)

### Decision Point: Grid Library Options

We have three strategic options:

---

## Option A: Build Custom Tree/Detail on AG Grid Community

**Approach**: Keep AG Grid Community for the core grid, but implement tree data and master/detail ourselves using AG Grid's extensibility APIs.

**For Master/Detail:**
- Use AG Grid's `fullWidthCellRenderer` to render a custom row that spans all columns
- When user clicks expand icon, insert a "full width" row containing our detail component
- This is exactly how AG Grid Enterprise implements it internally

**For Tree Data:**
- Load all data with parent/child relationships
- Flatten into rows with a `depth` property
- Use custom cell renderer for the first column with indent + expand/collapse icons
- Filter visible rows based on expanded state
- This is a common pattern and works well

**Pros:**
- No new dependencies
- Keeps existing AG Grid investment
- Full control over UX
- No licensing concerns

**Cons:**
- More development work
- Must maintain tree/detail logic ourselves
- Still tied to AG Grid's rendering paradigm

---

## Option B: Migrate to TanStack Table (Headless) ⭐ PREFERRED

**Approach**: Replace AG Grid with TanStack Table, which provides core table logic as a headless library with full Angular support via `@tanstack/angular-table`.

**TanStack Table Features:**
- 100% open source (MIT license)
- Built-in sub-row/tree data support via `getSubRows` and `getExpandedRowModel`
- Full control over rendering (we build our own UI)
- Excellent TypeScript support
- Active development (v9 coming in 2025)

**For Tree Data:**
```typescript
const table = createAngularTable({
  data: entities,
  getSubRows: (row) => row.children, // Built-in tree support
  getCoreRowModel: getCoreRowModel(),
  getExpandedRowModel: getExpandedRowModel(),
});
```

**For Master/Detail:**
```typescript
// TanStack supports custom expanded content
getRowCanExpand: (row) => row.original.hasDetails,
// Then render whatever we want in the expanded area
```

**Pros:**
- No licensing concerns ever
- Built-in tree/expanding support
- **Complete control over every pixel** - we own the entire rendering layer
- Smaller bundle size
- Modern signals-based Angular adapter
- Future-proof: we're not dependent on any vendor's feature roadmap
- Can implement any UX pattern we want without workarounds

**Cons:**
- Major migration effort (rewrite entity-data-grid)
- Must build all UI ourselves (no pre-built themes)
- Learning curve for team

**Sources:**
- [TanStack Table Expanding Guide](https://tanstack.com/table/v8/docs/guide/expanding)
- [TanStack Angular Table](https://tanstack.com/table/v8/docs/framework/angular/angular-table)

---

## Option C: Migrate to Angular-Slickgrid

**Approach**: Replace AG Grid with Angular-Slickgrid, which is open source and has built-in tree data and row detail support.

**Features:**
- MIT licensed, fully open source
- Native tree data support with filtering integration
- Row Detail View plugin for master/detail
- Handles 50k+ rows smoothly
- Active maintenance

**For Tree Data:**
```typescript
// Built-in tree data with parent/child support
this.gridOptions = {
  enableTreeData: true,
  treeDataOptions: {
    columnId: 'name',
    parentPropName: 'parentId'
  }
};
```

**For Master/Detail:**
- Built-in Row Detail View extension
- Supports custom Angular components in expanded area

**Pros:**
- Drop-in features we need
- Battle-tested (millions of rows)
- Good documentation
- Familiar grid paradigm

**Cons:**
- Still a migration effort
- Different API than AG Grid
- Smaller community than AG Grid

**Sources:**
- [Angular-Slickgrid Tree Data](https://ghiscoding.gitbook.io/angular-slickgrid/grid-functionalities/tree-data-grid)
- [Angular-Slickgrid GitHub](https://github.com/ghiscoding/Angular-Slickgrid)

---

## Recommendation: Option B (TanStack Table Migration)

**Primary Rationale: Absolute Control**

The preference is to migrate to TanStack Table for the following reasons:

1. **Complete control over every detail** - As a headless library, we own the entire rendering layer. No more working around vendor limitations or waiting for feature requests.

2. **No licensing concerns ever** - 100% MIT licensed with all features free. No enterprise tier to worry about.

3. **Built-in tree/expanding support** - Native support for the exact features we need, without workarounds.

4. **Future-proof** - We're not dependent on AG Grid's roadmap. If we need a feature, we build it.

5. **Modern architecture** - Signals-based Angular adapter aligns with Angular's direction.

**Trade-offs acknowledged:**
- Significant migration effort (rewrite entity-data-grid component)
- Must build our own UI/styling (no pre-built themes)
- Team learning curve

**However**, these trade-offs are acceptable because:
- The migration is a one-time cost
- Building our own UI means it matches MJ's design system perfectly
- The team learns a more modern, flexible approach

### Short-term Option: Custom Implementation on AG Grid

If we need these features before a TanStack migration is feasible, we can implement custom tree/detail on AG Grid Community as a bridge solution. The patterns and concepts will transfer to TanStack when we migrate.

---

## Custom AG Grid Implementation (Bridge Solution)

If we proceed with a short-term AG Grid implementation:

### Master/Detail Implementation (Custom)

We implement our own expanding rows using AG Grid's `fullWidthCellRenderer`:

```typescript
// entity-data-grid configuration
gridOptions: GridOptions = {
  // Enable full-width rows for our detail panels
  isFullWidthRow: (params) => params.rowNode.data?.__isDetailRow,

  // Custom renderer for detail rows
  fullWidthCellRenderer: DetailRowRenderer,

  // Dynamic row height for detail panels
  getRowHeight: (params) => {
    if (params.data?.__isDetailRow) {
      return params.data.__detailHeight || 300;
    }
    return this.rowHeight;
  }
};
```

When a row is expanded:
1. Insert a "virtual" detail row after the parent
2. Render our `mj-detail-panel` component inside it
3. Track expanded state in component

### Tree Data Implementation (Custom)

Flatten hierarchical data with depth tracking:

```typescript
interface TreeRow {
  __depth: number;
  __isExpanded: boolean;
  __hasChildren: boolean;
  __parentKey: string | null;
  // ... original entity fields
}

// Custom cell renderer for tree column
@Component({
  template: `
    <div [style.padding-left.px]="params.data.__depth * 20">
      <button *ngIf="params.data.__hasChildren"
              (click)="toggleExpand()">
        <i [class]="params.data.__isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
      </button>
      {{ params.value }}
    </div>
  `
})
export class TreeCellRenderer implements ICellRendererAngularComp { ... }
```

Filter rows based on parent expansion state:
```typescript
getVisibleRows(allRows: TreeRow[]): TreeRow[] {
  const expandedKeys = new Set(allRows.filter(r => r.__isExpanded).map(r => r.ID));

  return allRows.filter(row => {
    if (row.__parentKey === null) return true; // Root nodes always visible

    // Walk up parent chain - all ancestors must be expanded
    let current = row;
    while (current.__parentKey) {
      if (!expandedKeys.has(current.__parentKey)) return false;
      current = this.rowMap.get(current.__parentKey);
    }
    return true;
  });
}
```

---

## Part 1: Master/Detail Sub-Views

### Overview

When a user expands a row in the main grid, they can see one or more sub-views showing related entity data. For example, expanding a "Member" record could show both "Orders" and "Certifications" grids filtered to that member.

### Visual Mockup

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Members                                                           [⚙️ 🔍]  │
├────────────────────────────────────────────────────────────────────────────┤
│ ▶ John Smith     john@email.com     Active     2024-01-15                  │
│ ▼ Jane Doe       jane@email.com     Active     2024-02-20                  │
│   ┌──────────────────────────────────────────────────────────────────────┐ │
│   │ [📋 Orders]  [🎓 Certifications]     ← Tabs (only if 2+ sub-views)   │ │
│   ├──────────────────────────────────────────────────────────────────────┤ │
│   │ Orders (3 records)                                         [Grid ▾] │ │
│   │ ┌────────────────────────────────────────────────────────────────┐   │ │
│   │ │ Order #    Date         Amount      Status                     │   │ │
│   │ │ ORD-001    2024-03-01   $1,250.00   Completed                  │   │ │
│   │ │ ORD-002    2024-03-15   $850.00     Pending                    │   │ │
│   │ │ ORD-003    2024-04-01   $2,100.00   Processing                 │   │ │
│   │ └────────────────────────────────────────────────────────────────┘   │ │
│   └──────────────────────────────────────────────────────────────────────┘ │
│ ▶ Bob Wilson     bob@email.com      Inactive   2023-11-30                  │
└────────────────────────────────────────────────────────────────────────────┘
```

**UX Notes:**
- **Tabs only when 2+ sub-views** - if only one detail view configured, no tabs needed
- **Contemporary tab design** - pill-style or underline tabs, not old-school boxed tabs
- **Each sub-view is a full entity-viewer** - supports its own grid/cards/timeline mode

### Configuration UI Mockup (View Config Panel - Advanced Tab)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Configure View                                   │
├──────────────────────────────────────────────────────────────────────────┤
│ [Columns] [Filters] [Settings] [Advanced]                                 │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│ ┌─ Detail Views ────────────────────────────────────────────────────────┐ │
│ │                                                                        │ │
│ │ Show related data when expanding rows:                                 │ │
│ │                                                                        │ │
│ │ ☑ Orders                                                               │ │
│ │    ├─ Link via: MemberID → Members.ID                                  │ │
│ │    ├─ View: [Default ▾] [My Orders View ▾] [Shared: Admin View ▾]      │ │
│ │    └─ Display: [Grid ▾]  [Cards]  [Timeline]                           │ │
│ │                                                                        │ │
│ │ ☑ Certifications                                                       │ │
│ │    ├─ Link via: MemberID → Members.ID                                  │ │
│ │    ├─ View: [Active Certs ▾]                                           │ │
│ │    └─ Display: [Grid ▾]  [Cards]  [Timeline]                           │ │
│ │                                                                        │ │
│ │ ☐ Payments                                                             │ │
│ │    └─ Link via: [ShipToMemberID ▾] or [BillToMemberID]  ← Multiple FKs │ │
│ │                                                                        │ │
│ │ [+ Add Related Entity]                                                 │ │
│ │                                                                        │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│ ┌─ Tree Data ───────────────────────────────────────────────────────────┐ │
│ │                                                                        │ │
│ │ ☐ Enable hierarchical display                                          │ │
│ │   (detected: ParentCategoryID → Categories.ID)                         │ │
│ │                                                                        │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

### Saved View Selection

For the "View" dropdown in detail configuration:
- Show user's own saved views for that entity
- Show views shared with them (IsShared = true)
- "Default" option uses the entity's default column configuration
- Views are filtered by entity (only show Orders views for Orders detail)

### Nested Detail Views

**Yes, nested details are supported** - since each detail view embeds a full `mj-entity-data-grid` which itself can have detail view configuration. The recursion naturally handles this:

```
Members Grid
└─ Jane Doe (expanded)
   └─ Orders Detail Grid
      └─ Order ORD-001 (expanded)
         └─ Order Line Items Detail Grid
```

Each level loads its own `DetailViewConfig` from its view settings.

### Data Model Extension

#### New Interface: `DetailViewConfig`

Add to `/packages/Angular/Generic/entity-viewer/src/lib/types.ts`:

```typescript
/**
 * Configuration for a single detail sub-view
 */
export interface DetailViewConfig {
  /** Unique identifier for this detail view */
  id: string;

  /** Related entity name to display */
  relatedEntityName: string;

  /** Foreign key field in the related entity that links to parent */
  linkFieldName: string;

  /** Optional: Saved view ID to use for this detail (null = default view) */
  savedViewId?: string | null;

  /** Display mode for this detail view */
  displayMode: EntityViewMode; // 'grid' | 'cards' | 'timeline'

  /** Custom label (defaults to entity plural name) */
  label?: string;

  /** Display order in the detail panel */
  displayOrder: number;

  /** Whether this detail is enabled */
  enabled: boolean;

  /** Height of the detail view (CSS value) */
  height?: string;
}

/**
 * Extended ViewDisplayState with detail views and tree configuration
 */
export interface ViewDisplayState {
  // ... existing properties ...

  /** Detail sub-views to show when expanding a row */
  detailViews?: DetailViewConfig[];
}
```

### Detecting Related Entities

Use `Metadata.Provider.GetEntityDependencies()` to find all entities with FKs pointing to the current entity:

```typescript
async getAvailableDetailEntities(parentEntity: EntityInfo): Promise<RelatedEntityOption[]> {
  const dependencies = await metadata.GetEntityDependencies(parentEntity.Name);

  // Group by related entity to detect multiple FKs
  const grouped = new Map<string, EntityDependency[]>();
  for (const dep of dependencies) {
    const existing = grouped.get(dep.RelatedEntityName) || [];
    existing.push(dep);
    grouped.set(dep.RelatedEntityName, existing);
  }

  return Array.from(grouped.entries()).map(([entityName, deps]) => ({
    entityName,
    fkFields: deps.map(d => d.FieldName),
    hasMultipleFks: deps.length > 1
  }));
}
```

---

## Part 2: Tree Data Display

### Overview

For entities with recursive (self-referential) foreign keys, enable hierarchical tree visualization. Examples:
- Categories with `ParentCategoryID`
- Tasks with `ParentTaskID`
- Organizational units with `ParentID`

### Visual Mockup

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Categories                                      [🌳 Tree Mode ON] [⚙️ 🔍]  │
├────────────────────────────────────────────────────────────────────────────┤
│ ▼ Electronics                                   150 products    Active     │
│   ├─ ▼ Computers                                85 products     Active     │
│   │   ├─ Laptops                                42 products     Active     │
│   │   ├─ Desktops                               30 products     Active     │
│   │   └─ Tablets                                13 products     Active     │
│   ├─ ▶ Phones                                   45 products     Active     │
│   └─ ▶ Accessories                              20 products     Active     │
│ ▼ Clothing                                      200 products    Active     │
│   ├─ ▶ Men's                                    80 products     Active     │
│   ├─ ▶ Women's                                  90 products     Active     │
│   └─ ▶ Kids                                     30 products     Active     │
│ ▶ Home & Garden                                 120 products    Active     │
└────────────────────────────────────────────────────────────────────────────┘
```

### Auto-Detection Logic

Detect recursive FKs automatically and show tree option:

```typescript
detectRecursiveForeignKeys(entity: EntityInfo): EntityFieldInfo[] {
  return entity.Fields.filter(field =>
    field.RelatedEntityID != null &&
    field.RelatedEntityID === entity.ID
  );
}
```

**Progressive UX:**
- If 0 recursive FKs: Don't show tree data section at all
- If 1 recursive FK: Show toggle, auto-select the field
- If 2+ recursive FKs: Show toggle + dropdown to select which field

### Configuration UI (Advanced Tab)

```
┌─ Tree Data ───────────────────────────────────────────────────────────────┐
│                                                                            │
│ ☑ Enable hierarchical display                                              │
│                                                                            │
│   Parent field: [ParentCategoryID ▾]  ← Auto-detected, dropdown if 2+      │
│                                                                            │
│   Initial expansion:                                                        │
│     ○ Collapsed (expand on click)                                          │
│     ● Expand first level                                                   │
│     ○ Expand to level: [2 ▾]                                               │
│     ○ Fully expanded                                                       │
│                                                                            │
│   ☐ Show child count badges                                                │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### Data Model Extension

Add to `/packages/Angular/Generic/entity-viewer/src/lib/types.ts`:

```typescript
/**
 * Tree data configuration for hierarchical display
 */
export interface TreeDataConfig {
  /** Enable tree data display */
  enabled: boolean;

  /** The field that contains the parent ID (e.g., 'ParentCategoryID') */
  parentIdField: string;

  /** Initial expansion level (0 = collapsed, 1 = first level, -1 = fully expanded) */
  initialExpansionLevel: number;

  /** Show descendant count badges */
  showCountBadges?: boolean;

  /** Auto-expand when filtering (show matching children with ancestors) */
  expandOnFilter?: boolean;
}

/**
 * Extended grid display state with tree configuration
 */
export interface GridDisplayState {
  rowHeight?: 'compact' | 'normal' | 'comfortable';

  /** Tree data configuration */
  tree?: TreeDataConfig;
}
```

---

## Part 3: Implementation Plan

### Phase 1: Foundation

1. **Types & Interfaces**
   - Add `DetailViewConfig` and `TreeDataConfig` to types.ts
   - Extend `ViewDisplayState` interface
   - Update UserViewEntity to parse new DisplayState properties

2. **Metadata Helpers**
   - Create `getRelatedEntitiesWithFks(entity)` utility
   - Create `detectRecursiveForeignKeys(entity)` utility

3. **View Config Panel - Advanced Tab**
   - Add new "Advanced" tab to view-config-panel
   - Build UI for selecting related entities (with FK dropdown when 2+)
   - Build UI for tree data configuration (only show when recursive FK detected)
   - Wire up to DisplayState persistence

### Phase 2: Detail Views

1. **Detail Panel Component**
   - Create `mj-detail-panel` component
   - Pill-style tabs when 2+ detail views, no tabs when single
   - Support grid/cards/timeline display modes
   - Pass through to full entity-data-grid (supports nested details)

2. **Grid Integration** (AG Grid or TanStack)
   - Implement expandable rows
   - Create detail row renderer component
   - Track expanded rows in component state
   - Handle dynamic row heights

3. **Data Loading**
   - Lazy load detail records on expand
   - Cache loaded records per parent
   - Support saved view loading

### Phase 3: Tree Data

1. **Tree Node Model**
   - Build `TreeNode<T>` wrapper for entities
   - Compute depth, children, expanded state
   - Efficient parent-chain traversal

2. **Custom Tree Column Renderer**
   - Indent based on depth
   - Expand/collapse toggle
   - Optional child count badges

3. **Grid Integration**
   - Row filtering based on expanded state
   - Preserve tree state across refreshes
   - Handle sorting within tree context

### Phase 4: Polish & Testing

1. **UX Refinements**
   - Smooth animations for expand/collapse
   - Loading skeletons for detail views
   - Empty state handling

2. **State Persistence**
   - Save expanded rows to grid state
   - Persist detail view configurations
   - Support default view settings

---

## File Changes Summary

| File | Changes |
|------|---------|
| `types.ts` | Add `DetailViewConfig`, `TreeDataConfig`, extend `ViewDisplayState`, `GridDisplayState` |
| `view-config-panel.component.*` | Add "Advanced" tab with detail views and tree configuration UI |
| `entity-data-grid.component.ts` | Add custom tree rendering, expandable row handling, detail panel integration |
| `detail-panel.component.*` | NEW: Container for rendering multiple detail sub-views with tabs |
| `tree-cell-renderer.component.*` | NEW: Custom tree column renderer with indent/toggle |
| `UserViewEntity.ts` | Add getters/setters for new DisplayState properties |
| `entity-viewer.module.ts` | Export new components |

---

## Success Criteria

1. Users can configure detail views showing related entity data
2. Detail views support grid, cards, or timeline display (full recursive support)
3. Multiple FKs to same entity are handled with dropdown selection
4. Tree data auto-detected for entities with recursive FKs
5. Tree data option only shown when recursive FK exists
6. All configuration persists in UserView.DisplayState
7. Performance acceptable for 1000+ parent rows with lazy detail loading
8. Works without requiring AG Grid Enterprise license

---

## TanStack Table Migration Scope (When Ready)

When we decide to proceed with TanStack migration, here's the scope:

### What Gets Replaced
- `entity-data-grid.component.ts` - Core grid component rewritten for TanStack
- All AG Grid-specific code (column definitions, cell renderers, grid options)
- AG Grid dependencies in package.json

### What Stays the Same
- All business logic (data loading, filtering, view management)
- `ViewDisplayState` and other interfaces
- `view-config-panel` component (just different grid configuration output)
- All parent components (dashboards, entity-viewer, etc.)

### Migration Strategy
1. Create new `mj-tanstack-grid` component alongside existing
2. Feature flag to switch between grids during testing
3. Gradual migration of features
4. Remove AG Grid once parity achieved

This is a significant investment but positions MJ for complete control over the grid experience going forward.
