# Entity Data Grid Enhancement Plan

**Date**: January 2026
**Component**: `@memberjunction/ng-entity-viewer` - `EntityDataGridComponent`
**Objective**: Enhance the new AG Grid-based `mj-entity-data-grid` component with UserViewGrid features while maintaining world-class UX.

---

## Overview

The `mj-entity-data-grid` component is a modern AG Grid-based data grid with Before/After cancelable events. This plan enhances it with features from `mj-user-view-grid` (Kendo-based) to create a complete, production-ready replacement.

### Key Design Decisions

1. **Data Source**: Use `RunViewParams` for maximum flexibility (stored views + dynamic views)
2. **Pagination**: AG Grid Infinite Row Model for server-side pagination (critical for large datasets)
3. **Dialogs**: Event-based approach for Explorer-specific dialogs (Compare, Merge, Entity Form) - emit events for parent to handle
4. **List Management**: Hard dependency on `@memberjunction/ng-list-management` (Generic branch)
5. **UX**: Progressive disclosure toolbar with contextual actions and overflow menu

---

## Phase 1: RunViewParams Integration + Deferred Loading

### Changes

1. **New Input**: `Params: RunViewParams` - replaces `entityName`, `extraFilter`, `orderBy`, `maxRows`, `fields`
2. **New Input**: `AllowLoad: boolean` - deferred loading for complex forms
3. **New Input**: `AutoRefreshOnParamsChange: boolean` - auto-refresh when params change
4. **Keep**: `data: BaseEntity[]` input for external data mode (mutually exclusive with Params)
5. **New Properties**:
   - `ViewEntity: UserViewEntityExtended | null` - the loaded view entity (if stored view)
   - `EntityInfo: EntityInfo | null` - entity metadata
   - `IsDynamicView: boolean` - true if not using stored view

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Data Source Selection                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Params provided?                                              │
│        │                                                        │
│        ├── YES ──> AllowLoad = true? ──> YES ──> Load via RV   │
│        │                    │                                   │
│        │                    └── NO ──> Defer until AllowLoad    │
│        │                                                        │
│        └── NO ──> data[] provided? ──> YES ──> Use external     │
│                          │                                      │
│                          └── NO ──> Empty state                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 2: Server-Side Pagination (Infinite Scroll)

### AG Grid Infinite Row Model

Replace client-side row model with Infinite Row Model for server-side pagination.

### Implementation

1. **Configure AG Grid for Infinite Row Model**:
   - `rowModelType: 'infinite'`
   - `cacheBlockSize: 40` (page size)
   - `maxBlocksInCache: 10`
   - `infiniteInitialRowCount: 1`

2. **Implement `IDatasource` interface**:
   - `getRows(params: IGetRowsParams)`: Called when grid needs more data
   - Internally calls `RunView` with appropriate `skip`/`take` parameters

3. **Lazy Formatting**:
   - Format data only when displayed (like UVG's `virtualLoadData`)
   - Cache formatted rows to avoid re-formatting

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                  Infinite Scroll Data Flow                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User scrolls ──> AG Grid requests block ──> getRows() called   │
│                                                 │                │
│                                                 v                │
│                        ┌──────────────────────────────────┐     │
│                        │    RunView({                     │     │
│                        │      ...Params,                  │     │
│                        │      MaxRows: cacheBlockSize,    │     │
│                        │      StartRow: startRow          │     │
│                        │    })                            │     │
│                        └──────────────────────────────────┘     │
│                                                 │                │
│                                                 v                │
│                        Format visible rows ──> Display          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 3: State Persistence

### State Structure (ViewGridState compatible)

```typescript
interface ViewGridState {
  columnSettings?: Array<{
    Name: string;
    DisplayName?: string;
    width?: number;
    orderIndex?: number;
    hidden?: boolean;
  }>;
  sortSettings?: Array<{
    field: string;
    dir: 'asc' | 'desc';
  }>;
}
```

### Persistence Strategy

| View Type | Persistence | Trigger |
|-----------|-------------|---------|
| Stored View (ViewID/ViewName) | Auto-save to UserView entity | 5-second debounce after change |
| Dynamic View | Emit `gridStateChanged` event | On change |
| External Data | Emit `gridStateChanged` event | On change |

### Permissions Check

Before auto-saving to stored view:
1. Check `UserCanEdit` on ViewEntity
2. If not editable, emit event only (don't save)

---

## Phase 4: Auto-Navigation

### New Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `AutoNavigate` | `boolean` | `true` | Navigate on row click/double-click |
| `NavigateOnDoubleClick` | `boolean` | `true` | If true, navigate on double-click only |
| `CreateRecordMode` | `'Dialog' \| 'Tab'` | `'Tab'` | How to open new records |
| `NewRecordValues` | `Record<string, unknown>` | `{}` | Default values for new records |

### Navigation Service Integration

```typescript
// On row click/double-click (based on NavigateOnDoubleClick setting)
if (this.AutoNavigate && !this.editMode) {
  this.navigationService.OpenEntityRecord(
    this.EntityInfo.Name,
    compositeKey
  );
}

// On new button click
if (this.CreateRecordMode === 'Tab') {
  this.navigationService.OpenNewEntityRecord(
    this.EntityInfo.Name,
    { newRecordValues: this.NewRecordValues }
  );
} else {
  this.newRecordDialogRequested.emit({ defaultValues: this.NewRecordValues });
}
```

---

## Phase 5: Built-in Dialog Implementations

### Dialog Strategy

| Dialog | Location | Strategy |
|--------|----------|----------|
| List Management | `@memberjunction/ng-list-management` (Generic) | Hard dependency, built-in |
| Compare Records | `@memberjunction/ng-compare-records` (Explorer) | Event emission for parent |
| Merge Records | Explorer | Event emission for parent |
| Entity Form Dialog | `@memberjunction/ng-entity-form-dialog` (Explorer) | Event emission for parent |
| Communication | Explorer | Event emission for parent |

### Built-in: List Management Dialog

```typescript
// Import ListManagementModule in EntityViewerModule
// Show dialog directly in component
public showListManagementDialog(): void {
  this.listManagementConfig = {
    mode: 'manage',
    entityId: this.EntityInfo.ID,
    entityName: this.EntityInfo.Name,
    recordIds: this.GetSelectedRows().map(r => r.PrimaryKey.ToString()),
    allowCreate: true,
    allowRemove: true,
    showMembership: true
  };
  this.showEnhancedListDialog = true;
}
```

### Event-based: Compare, Merge, Communication, New Record

```typescript
// Emit events with all necessary data
@Output() compareRecordsRequested = new EventEmitter<{
  entityInfo: EntityInfo;
  records: BaseEntity[];
}>();

@Output() mergeRecordsRequested = new EventEmitter<{
  entityInfo: EntityInfo;
  records: BaseEntity[];
}>();

@Output() newRecordDialogRequested = new EventEmitter<{
  entityInfo: EntityInfo;
  defaultValues: Record<string, unknown>;
}>();

@Output() communicationRequested = new EventEmitter<{
  entityInfo: EntityInfo;
  records: BaseEntity[];
  viewParams: RunViewParams;
}>();
```

---

## Phase 6: Entity Actions Integration

### New Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `ShowEntityActionButtons` | `boolean` | `false` | Show entity action dropdown |

### Implementation

1. Load entity actions via `EntityActionEngineBase.Instance.GetActionsByEntityNameAndInvocationType()`
2. Display in toolbar dropdown (overflow menu)
3. Execute via `GraphQLActionClient`

### Future: AI Agents

Entity Actions infrastructure will support AI Agent invocation in the future.

---

## Phase 7: Progressive UX Toolbar

### Design Principles

1. **Progressive Disclosure**: Show actions contextually
2. **Minimal Clutter**: Primary actions visible, secondary in overflow
3. **Responsive**: Collapse more items on smaller screens
4. **Consistent Iconography**: Font Awesome icons

### Toolbar Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [Search...🔍]  [Custom Left Buttons]          N rows (M selected)       │
│                                                                         │
│                                    [New➕] [Refresh🔄] [...Context...] [⋮]│
└─────────────────────────────────────────────────────────────────────────┘
```

### Button Visibility Rules

| Button | Visibility Condition |
|--------|---------------------|
| New | `showNewButton && UserCanCreate` |
| Refresh | Always (if `showRefreshButton`) |
| Delete | Selection exists + `showDeleteButton` |
| Add to List | Selection exists + `showAddToListButton` |
| Compare | 2+ selected + `showCompareButton` |
| Merge | 2+ selected + `showMergeButton` |
| Find Duplicates | 2+ selected + `showDuplicateSearchButton` |
| Communication | Selection exists + `showCommunicationButton` |
| Export | In overflow menu + `showExportButton` |
| Entity Actions | In overflow menu + `ShowEntityActionButtons` |
| Column Chooser | In overflow menu + `allowColumnToggle` |

### Overflow Menu Design

Custom dropdown (no Kendo dependency):

```html
<div class="toolbar-overflow">
  <button class="overflow-trigger" (click)="toggleOverflowMenu()">
    <i class="fa-solid fa-ellipsis-vertical"></i>
  </button>
  <div class="overflow-menu" *ngIf="showOverflowMenu" [@fadeIn]>
    <button *ngIf="showExportButton" (click)="onExportClick()">
      <i class="fa-solid fa-file-excel"></i> Export to Excel
    </button>
    <button *ngIf="ShowEntityActionButtons" [disabled]="!entityActions.length">
      <i class="fa-solid fa-bolt"></i> Actions
      <i class="fa-solid fa-chevron-right"></i>
    </button>
    <button *ngIf="allowColumnToggle" (click)="onColumnChooserClick()">
      <i class="fa-solid fa-columns"></i> Columns
    </button>
    <hr *ngIf="hasSecondaryActions" />
    <button *ngIf="showCommunicationButton && HasSelection" (click)="onCommunicationClick()">
      <i class="fa-solid fa-envelope"></i> Send Message
    </button>
  </div>
</div>
```

### Animations

```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.overflow-menu {
  animation: fadeIn 0.15s ease-out;
}
```

---

## Implementation Order

| Phase | Description | Dependencies | Est. LOC |
|-------|-------------|--------------|----------|
| 1 | RunViewParams + Deferred Loading | None | ~200 |
| 2 | Server-Side Pagination | Phase 1 | ~300 |
| 3 | State Persistence | Phase 1, 2 | ~150 |
| 4 | Auto-Navigation | Phase 1 | ~100 |
| 5 | Built-in Dialogs | Phase 1 | ~200 |
| 6 | Entity Actions | Phase 1 | ~100 |
| 7 | Progressive UX Toolbar | All | ~300 |

---

## Dialog Dependency Discussion

**Compare Records** and **Entity Form Dialog** are in Explorer branch. Options:

1. **Move to Generic** (Best long-term, but scope creep)
2. **Event-based** (Current plan) - Emit events, let parent handle dialogs
3. **Optional peer dependency** (Complex)

**Recommendation**: Event-based approach. The grid emits detailed events with all necessary data. Parent components (like a UserViewGrid wrapper in Explorer) can subscribe and show appropriate dialogs. This keeps the Generic branch clean and allows Explorer-specific features to remain in Explorer.

---

## Success Criteria

- [ ] Phase 1: RunViewParams works with stored views, dynamic views, and external data
- [ ] Phase 2: Grid loads data in pages as user scrolls (no full load)
- [ ] Phase 3: Column/sort state persists to stored views (with permission check)
- [ ] Phase 4: Row click navigates to record (configurable)
- [ ] Phase 5: List management dialog works; other dialogs emit events
- [ ] Phase 6: Entity actions load and can be invoked
- [ ] Phase 7: Toolbar is clean, contextual, with working overflow menu
- [ ] All phases: Build succeeds with no errors
