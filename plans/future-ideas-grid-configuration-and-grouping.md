# Future Ideas: Grid Configuration & Grouping Enhancements

> **Status**: Planning / Future Consideration
> **Created**: 2026-01-10
> **Context**: AG Grid integration improvements for `mj-entity-data-grid`

## Overview

This document captures ideas for enhancing the grid configuration system and potentially adding grouping capabilities to the entity-data-grid component. These are deferred because AG Grid's row grouping requires an Enterprise license, which would impose costs on platform users.

---

## 1. AG Grid Grouping Feature

### Current State
- Using AG Grid Community v34.3.1 (free edition)
- Row grouping is **Enterprise-only** ($500-$2,000+ per developer per year)
- Not viable for MemberJunction as an open platform

### Enterprise Features We'd Get (If Licensed)
- Row Grouping with drag-and-drop group panel
- Multi-level grouping hierarchy
- Aggregation functions (sum, avg, count, etc.)
- Pivot tables
- Server-Side Row Model for large datasets
- Master/Detail views
- Tool Panels & Custom Sidebars

### Alternative: Client-Side Manual Grouping (Free)
If grouping becomes a priority without licensing:

```typescript
// Pre-group data before rendering
interface GroupedRowData {
  isGroupRow: boolean;
  groupKey?: string;
  groupField?: string;
  groupValue?: unknown;
  childCount?: number;
  isExpanded?: boolean;
  data?: BaseEntity;
}

// Custom implementation would:
// 1. Sort data by group field(s)
// 2. Insert "group header" pseudo-rows
// 3. Handle expand/collapse state
// 4. Custom cell renderer for group rows
```

**Limitations of manual approach:**
- No built-in performance optimizations
- Custom maintenance burden
- No drag-and-drop group panel
- Would need custom aggregation logic

---

## 2. Current View Configuration Architecture

### Components Involved
```
┌─────────────────────────────────────────────────────────────┐
│              DataExplorerDashboardComponent                  │
│  - Orchestrates state management                            │
│  - Coordinates ViewConfigPanel, EntityViewer, FilterDialog  │
└──────────────┬──────────────────────────────────────────────┘
               │
    ┌──────────┴──────────┐
    ▼                     ▼
┌──────────────────┐   ┌─────────────────────────────┐
│ EntityViewer     │   │ ViewConfigPanel (Right Slide)│
│ - Renders grid   │   │ - Columns tab (order/visibility)│
│ - Emits changes  │   │ - Filters tab (smart/traditional)│
│ - Uses mj-entity-│   │ - Settings tab (name/share)│
│   data-grid      │   └─────────────────────────────┘
└──────────────────┘
```

### Key Files
- `packages/Angular/Explorer/dashboards/src/DataExplorer/view-config-panel/` - Slide-in settings panel
- `packages/Angular/Explorer/dashboards/src/DataExplorer/filter-dialog/` - Full-width filter editor
- `packages/Angular/Explorer/dashboards/src/DataExplorer/data-explorer-dashboard.component.ts` - Orchestrator

### Current Coupling Issue
The `ViewConfigPanel` is tightly coupled to `DataExplorerDashboard`. Other components using `mj-entity-data-grid` (like Lists Dashboard) can't easily reuse the configuration UI.

---

## 3. Proposed Abstraction: Generic Grid Config Panel

### Goal
Create a standalone, reusable configuration panel that any component hosting `mj-entity-data-grid` can use.

### Proposed Component: `GridConfigPanelComponent`

```typescript
@Component({
  selector: 'mj-grid-config-panel',
  templateUrl: './grid-config-panel.component.html'
})
export class GridConfigPanelComponent {
  // Inputs
  @Input() entity: EntityInfo;
  @Input() gridState: ViewGridState;
  @Input() isOpen: boolean = false;
  @Input() enablePinning: boolean = true;
  @Input() enableFiltering: boolean = true;
  @Input() enableGrouping: boolean = false;  // Only if we implement manual grouping

  // Outputs
  @Output() stateChanged = new EventEmitter<ViewGridState>();
  @Output() close = new EventEmitter<void>();
}
```

### Proposed Tabs
1. **Columns** - Visibility, ordering, pinning (left/right), width, flex
2. **Sort** - Multi-column sort configuration
3. **Filter** - Smart filter or traditional filter (extracted from current implementation)
4. **Grouping** (future) - Select fields to group by, nesting order
5. **Advanced** - Row height, grid lines, density settings

---

## 4. ViewGridState Extensions (Already Partially Done)

### Completed (2026-01-10)
```typescript
export interface ViewGridColumnSetting {
  ID?: string;
  Name: string;
  DisplayName?: string;
  hidden?: boolean;
  width?: number;
  orderIndex?: number;
  pinned?: ViewColumnPinned;  // NEW
  flex?: number;              // NEW
  minWidth?: number;          // NEW
  maxWidth?: number;          // NEW
}

export class ViewGridState {
  sortSettings?: ViewGridSortSetting[];
  columnSettings?: ViewGridColumnSetting[];
  filter?: ViewFilterInfo;
}
```

### Future: Grouping State
```typescript
export interface ViewGridGroupSetting {
  field: string;
  groupIndex: number;
  showAggregation?: boolean;
}

// Add to ViewGridState
export class ViewGridState {
  // ... existing
  groupSettings?: ViewGridGroupSetting[];
  groupDisplayType?: 'singleColumn' | 'multipleColumns';
  groupDefaultExpanded?: number;
  showGroupPanel?: boolean;
}
```

---

## 5. Integration Options

### Option A: Fully Integrated (Grid owns its config)
```html
<mj-entity-data-grid
  [entityName]="'Products'"
  [showConfigButton]="true"
  [gridState]="savedGridState"
  (gridStateChanged)="onStateChanged($event)">
</mj-entity-data-grid>
```

### Option B: Externally Managed (Current approach)
```html
<mj-entity-data-grid
  [entityName]="'Products'"
  [gridState]="gridState"
  (gridStateChanged)="onStateChanged($event)">
</mj-entity-data-grid>

<mj-grid-config-panel
  [entity]="entity"
  [gridState]="gridState"
  [isOpen]="configPanelOpen"
  (stateChanged)="applyGridState($event)"
  (close)="configPanelOpen = false">
</mj-grid-config-panel>
```

---

## 6. Implementation Phases (When Ready)

### Phase 1: ✅ Consolidate Types (DONE)
- Strongly typed `ViewGridState`, `ViewGridColumnSetting`, `ViewGridSortSetting`
- Re-exported from Angular package with backward-compatible aliases

### Phase 2: Create Generic Config Panel
1. Extract column configuration UI from `view-config-panel`
2. Make it entity-agnostic
3. Add pinning controls (left/right/none)
4. Add column flex/width controls
5. Package in `@memberjunction/ng-entity-viewer`

### Phase 3: Smart Features
1. "Auto-fit columns" button
2. Save/load named presets
3. Reset to defaults
4. Column width memory per entity

### Phase 4: Manual Grouping (If Needed)
1. Implement client-side grouping logic
2. Add grouping tab to config panel
3. Custom group row renderer
4. Persist group state in `ViewGridState`

---

## 7. Questions for Future Decision

1. **Grouping Priority**: Is manual grouping worth the implementation effort, or can users work without it?

2. **Config Panel Location**: Should the generic panel live in `ng-entity-viewer` or a new `ng-grid-config` package?

3. **Server-Side Grouping**: For large datasets, would server-side grouping (API changes) be more valuable than client-side?

4. **Preset System**: Should view presets be shareable across users/organizations?

---

## 8. Related Files

| File | Description |
|------|-------------|
| `packages/MJCoreEntities/src/custom/UserViewEntity.ts` | Core type definitions for view state |
| `packages/Angular/Generic/entity-viewer/src/lib/types.ts` | Angular type re-exports |
| `packages/Angular/Generic/entity-viewer/src/lib/entity-data-grid/` | Grid component implementation |
| `packages/Angular/Explorer/dashboards/src/DataExplorer/view-config-panel/` | Current config panel (DataExplorer-specific) |
| `packages/Angular/Explorer/dashboards/src/DataExplorer/filter-dialog/` | Filter dialog component |

---

## 9. References

- [AG Grid Row Grouping Docs](https://www.ag-grid.com/javascript-data-grid/grouping/)
- [AG Grid Pricing](https://www.ag-grid.com/license-pricing/)
- Current grid component: `entity-data-grid.component.ts` (~2700 lines)
