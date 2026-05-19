# @memberjunction/ng-entity-viewer

Angular components for viewing MemberJunction entity data in multiple formats -- grid, card, and timeline views -- with filtering, selection, toolbar actions, and a comprehensive Before/After cancelable event system.

## Overview

The `@memberjunction/ng-entity-viewer` package provides a suite of data presentation components built on AG Grid. The primary component, `EntityDataGridComponent`, offers infinite scroll, configurable toolbars with custom buttons, server-side sorting, grid state persistence, and a rich event system where "before" events can be canceled. The `EntityViewerComponent` wraps the grid alongside card and timeline views with a view-mode toggle.

```mermaid
flowchart TD
    subgraph Composite["EntityViewerComponent"]
        TOGGLE[View Mode Toggle] --> GRID[Grid View]
        TOGGLE --> CARDS[Card View]
        TOGGLE --> TIMELINE[Timeline View]
    end

    subgraph Grid["EntityDataGridComponent"]
        TB[Configurable Toolbar] --> AG[AG Grid]
        AG --> INF[Infinite Scroll]
        AG --> SEL[Selection Modes]
        AG --> STATE[State Persistence]
        AG --> EVENTS[Before/After Events]
    end

    subgraph Data["Data Sources"]
        RV[RunView Params] --> Grid
        PRE[Pre-loaded Data] --> Grid
        ENT[Entity Name + Filter] --> Grid
    end

    GRID --> Grid

    style Composite fill:#2d6a9f,stroke:#1a4971,color:#fff
    style Grid fill:#7c5295,stroke:#563a6b,color:#fff
    style Data fill:#2d8659,stroke:#1a5c3a,color:#fff
```

## Installation

```bash
npm install @memberjunction/ng-entity-viewer ag-grid-angular ag-grid-community
```

## Usage

### Import the Module

```typescript
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';

@NgModule({
  imports: [EntityViewerModule]
})
export class MyModule { }
```

### Composite Viewer

```html
<mj-entity-viewer
  [entity]="selectedEntity"
  [viewEntity]="myUserView"
  [showGridToolbar]="true"
  [gridToolbarConfig]="toolbarConfig"
  [gridSelectionMode]="'multiple'"
  (recordSelected)="onRecordSelected($event)"
  (recordOpened)="onRecordOpened($event)"
  (addRequested)="onAddNew()"
  (exportRequested)="onExport($event)">
</mj-entity-viewer>
```

### Standalone Data Grid

```html
<mj-entity-data-grid
  [entityName]="'Contacts'"
  [extraFilter]="'Status = \'Active\''"
  [showToolbar]="true"
  [toolbarConfig]="myToolbarConfig"
  [selectionMode]="'multiple'"
  [PaginationMode]="'infinite'"
  [PageSize]="100"
  (afterRowClick)="onRowClick($event)"
  (afterRowDoubleClick)="onRowDoubleClick($event)"
  (newButtonClick)="onAddNew()"
  (exportButtonClick)="onExport()">
</mj-entity-data-grid>
```

### Cancelable Events

```typescript
onBeforeRowSelect(event: BeforeRowSelectEventArgs) {
  // Prevent selecting locked records
  if (event.row.Get('Status') === 'Locked') {
    event.cancel = true;
    event.cancelReason = 'Cannot select locked records';
  }
}
```

## API Reference

### EntityDataGridComponent (`mj-entity-data-grid`)

AG Grid-based data grid with rich event system and configurable toolbar.

#### Data Source Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `Params` | `RunViewParams` | - | Primary data source (stored views + dynamic views) |
| `entityName` | `string` | - | Entity name for dynamic views |
| `extraFilter` | `string` | - | Additional WHERE clause filter |
| `searchString` | `string` | - | User search string |
| `orderBy` | `string` | - | ORDER BY clause |
| `maxRows` | `number` | `0` | Max rows to fetch (0 = no limit) |
| `data` | `BaseEntity[]` | - | Pre-loaded data (bypasses RunView) |
| `AllowLoad` | `boolean` | `true` | Enable/disable data loading |
| `AutoRefreshOnParamsChange` | `boolean` | `true` | Auto-refresh when Params changes |

#### Pagination Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `PaginationMode` | `'client' \| 'infinite'` | `'client'` | Pagination strategy |
| `PageSize` | `number` | `100` | Rows per page (infinite mode) |
| `CacheBlockSize` | `number` | `100` | Cache block size (infinite mode) |
| `MaxBlocksInCache` | `number` | `10` | Max cached blocks |

#### Display Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `showToolbar` | `boolean` | `true` | Show the toolbar |
| `toolbarConfig` | `GridToolbarConfig` | - | Toolbar configuration |
| `selectionMode` | `'none' \| 'single' \| 'multiple' \| 'checkbox'` | `'single'` | Row selection mode |
| `height` | `number \| 'auto' \| 'fit-content'` | `'auto'` | Grid height |
| `gridState` | `ViewGridStateConfig` | - | Column/sort state from User View |
| `allowSorting` | `boolean` | `true` | Enable column sorting |
| `allowColumnReorder` | `boolean` | `true` | Enable column reordering |
| `allowColumnResize` | `boolean` | `true` | Enable column resizing |
| `serverSideSorting` | `boolean` | `true` | Sort triggers server reload |

#### Before/After Events

The grid uses a cancelable event pattern. Before events can be canceled by setting `event.cancel = true`.

**Row Selection Events:**

| Event | Args Type | Description |
|-------|-----------|-------------|
| `beforeRowSelect` | `BeforeRowSelectEventArgs` | Before row is selected |
| `afterRowSelect` | `AfterRowSelectEventArgs` | After row is selected |
| `beforeRowDeselect` | `BeforeRowDeselectEventArgs` | Before row is deselected |
| `afterRowDeselect` | `AfterRowDeselectEventArgs` | After row is deselected |

**Row Click Events:**

| Event | Args Type | Description |
|-------|-----------|-------------|
| `beforeRowClick` | `BeforeRowClickEventArgs` | Before row click processes |
| `afterRowClick` | `AfterRowClickEventArgs` | After row click |
| `beforeRowDoubleClick` | `BeforeRowDoubleClickEventArgs` | Before double-click |
| `afterRowDoubleClick` | `AfterRowDoubleClickEventArgs` | After double-click |

**Data Events:**

| Event | Args Type | Description |
|-------|-----------|-------------|
| `beforeDataLoad` | `BeforeDataLoadEventArgs` | Before data loads |
| `afterDataLoad` | `AfterDataLoadEventArgs` | After data loads |
| `beforeDataRefresh` | `BeforeDataRefreshEventArgs` | Before refresh |
| `afterDataRefresh` | `AfterDataRefreshEventArgs` | After refresh |

**Sorting/Column Events:**

| Event | Args Type | Description |
|-------|-----------|-------------|
| `beforeSort` | `BeforeSortEventArgs` | Before sort changes |
| `afterSort` | `AfterSortEventArgs` | After sort changes |
| `beforeColumnReorder` | `BeforeColumnReorderEventArgs` | Before column move |
| `afterColumnReorder` | `AfterColumnReorderEventArgs` | After column move |
| `gridStateChanged` | `GridStateChangedEvent` | Column state changed |

**Toolbar Button Events:**

| Event | Args Type | Description |
|-------|-----------|-------------|
| `newButtonClick` | `void` | Add/New button clicked |
| `refreshButtonClick` | `void` | Refresh button clicked |
| `deleteButtonClick` | `BaseEntity[]` | Delete button clicked |
| `exportButtonClick` | `void` | Export button clicked |
| `compareButtonClick` | `BaseEntity[]` | Compare button clicked |
| `mergeButtonClick` | `BaseEntity[]` | Merge button clicked |
| `addToListButtonClick` | `BaseEntity[]` | Add to List clicked |

### GridToolbarConfig

Configure toolbar buttons and behavior:

```typescript
const toolbarConfig: GridToolbarConfig = {
  showSearch: true,
  searchPlaceholder: 'Search records...',
  searchDebounce: 300,
  showRefresh: true,
  showAdd: true,
  showDelete: true,
  showExport: true,
  showColumnChooser: true,
  showFilterToggle: false,
  exportFormats: ['excel', 'csv', 'json'],
  showRowCount: true,
  showSelectionCount: true,
  position: 'top',
  customButtons: [
    {
      id: 'myButton',
      text: 'My Action',
      icon: 'fa-solid fa-star',
      tooltip: 'Do something custom',
      position: 'right',
      onClick: () => console.log('Clicked!')
    }
  ]
};
```

### EntityViewerComponent (`mj-entity-viewer`)

Composite component combining grid, cards, and timeline views.

#### Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `entity` | `EntityInfo` | - | Entity metadata |
| `records` | `BaseEntity[]` | - | Pre-loaded records |
| `viewEntity` | `UserViewEntityExtended` | - | User View for filtering/sorting |
| `viewMode` | `'grid' \| 'cards' \| 'timeline'` | `'grid'` | Current view mode |
| `filterText` | `string` | - | Filter text |
| `sortState` | `SortState` | - | Sort state |
| `gridState` | `ViewGridStateConfig` | - | Grid column state |
| `showGridToolbar` | `boolean` | `true` | Show grid toolbar |
| `gridToolbarConfig` | `GridToolbarConfig` | - | Toolbar configuration |
| `gridSelectionMode` | `GridSelectionMode` | `'single'` | Selection mode |

#### Outputs

| Output | Event Type | Description |
|--------|------------|-------------|
| `recordSelected` | `RecordSelectedEvent` | Record clicked |
| `recordOpened` | `RecordOpenedEvent` | Record double-clicked |
| `dataLoaded` | `DataLoadedEvent` | Data finished loading |
| `viewModeChange` | `EntityViewMode` | View mode changed |
| `filterTextChange` | `string` | Filter text changed |
| `sortChanged` | `SortChangedEvent` | Sort changed |
| `gridStateChanged` | `GridStateChangedEvent` | Grid state changed |
| `addRequested` | `void` | Add button clicked |
| `deleteRequested` | `{ records }` | Delete button clicked |
| `refreshRequested` | `void` | Refresh button clicked |
| `exportRequested` | `{ format }` | Export button clicked |

### RecycleBinComponent (`mj-recycle-bin`) and RecycleBinChipComponent (`mj-recycle-bin-chip`)

Slide-in panel that lists hard-deleted records for a single entity and lets a user with `Delete` permission re-create any of them from its historical RecordChange snapshot. The accompanying chip component is a tiny composite that renders a count-badge button and hosts the panel — drop it into any toolbar in three lines.

#### When to use

The chip is **already embedded** in `EntityViewerComponent` and `EntityDataGridComponent` — both expose a `[ShowRecycleBin]` input (default `true`) that you can flip off if you don't want the chip. Use the standalone components only when building a custom entity viewer.

#### Permission model

The chip and panel are gated on `entity.UserPermissions.CanDelete`. Rationale: there is no native "undelete" permission in MemberJunction, but if a user has the higher-trust permission to *delete* records of an entity, restoring deleted ones is well within scope. The actual re-create action additionally requires `CanCreate`; without it the Restore button on each card disables with a tooltip.

The chip auto-hides when:
- `EntityName` is null/empty
- The entity has `TrackRecordChanges = false`
- The user lacks `CanDelete` permission
- The deleted-record count is zero

#### Soft vs hard deletes

This component only surfaces *hard*-deleted records. Soft-deletes (`IsDeleted` flags, `Status='Inactive'`, etc.) leave the record visible in normal entity views, so the standard Record Changes panel + restore preview already handles them — no Recycle Bin needed.

#### Cancelable Before/After events

Every meaningful action emits a paired `before*` / `after*` event. The `before*` event carries `cancel: boolean` so consumers can intercept — useful for custom approval workflows, audit logging, or to take over the actual restore execution.

```typescript
onBeforeRecordRestore(e: BeforeRecordRestoreEventArgs) {
  if (!hasComplianceApproval(e.entry)) {
    e.cancel = true;
    e.cancelReason = 'Awaiting compliance approval';
  }
}
```

#### `RecycleBinChipComponent` Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `EntityName` | `string \| null` | `null` | Entity whose deleted records will be listed. Chip hides when null. |
| `ContextUser` | `UserInfo \| null` | `null` | Optional context user. Falls back to `Metadata.Provider.CurrentUser`. |

#### `RecycleBinChipComponent` / `RecycleBinComponent` Outputs

| Output | Args Type | Cancelable | Description |
|--------|-----------|------------|-------------|
| `BeforeRecycleBinOpen` | `BeforeRecycleBinOpenEventArgs` | ✓ | Fires before the deleted-record query runs. |
| `AfterRecycleBinOpen` | `AfterRecycleBinOpenEventArgs` | | Fires after the query completes; carries `deletedRecordCount`. |
| `BeforeRecordRestore` | `BeforeRecordRestoreEventArgs` | ✓ | Fires when the user clicks Restore on a card, before the preview opens. |
| `AfterRecordRestore` | `AfterRecordRestoreEventArgs` | | Fires after the user closes the preview; carries `success`. |
| `BeforeRestoreCommit` | `BeforeRestoreCommitEventArgs` | ✓ | Fires after the user confirms in the preview but before the insert runs. |
| `AfterRestoreCommit` | `AfterRestoreCommitEventArgs` | | Fires after the insert; carries `success`, `newRecordID`, `errorMessage`. |

#### `RecycleBinComponent` Inputs (when used directly)

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `Visible` | `boolean` | `false` | Controls panel visibility. Setting true triggers a load. |
| `EntityName` | `string \| null` | `null` | **Required.** The entity whose deleted records to list. |
| `ContextUser` | `UserInfo \| null` | `null` | Optional context user. |
| `MaxRecords` | `number` | `200` | Max number of cards to load. |

#### Embedded chip control

`EntityViewerComponent` and `EntityDataGridComponent` both expose:

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `ShowRecycleBin` | `boolean` | `true` | Renders the Recycle Bin chip in the toolbar/header. Auto-hides when entity isn't a candidate (no tracking / no permission / no deleted records). |

```html
<!-- Composite viewer with the chip turned off -->
<mj-entity-viewer
  [entity]="selectedEntity"
  [ShowRecycleBin]="false">
</mj-entity-viewer>

<!-- Standalone data grid with explicit chip event handling -->
<mj-entity-data-grid
  [entityName]="'Customers'"
  [ShowRecycleBin]="true">
</mj-entity-data-grid>
```

---

### EntityCardsComponent (`mj-entity-cards`)

Card-based view with auto-generated layout.

```html
<mj-entity-cards
  [entity]="selectedEntity"
  [records]="records"
  [filterText]="searchFilter"
  (recordSelected)="onSelected($event)"
  (recordOpened)="onOpened($event)">
</mj-entity-cards>
```

### PillComponent (`mj-pill`)

Semantic color pill for categorical values. Colors are auto-detected based on value:

| Color | Values |
|-------|--------|
| success (green) | active, approved, complete, success |
| warning (yellow) | pending, in progress, draft, waiting |
| danger (red) | failed, error, rejected, cancelled |
| info (blue) | new, info, created, open |
| neutral (gray) | default |

```html
<mj-pill [value]="record.Status"></mj-pill>
```

## Advanced Usage

### Infinite Scroll Pagination

```html
<mj-entity-data-grid
  [entityName]="'Contacts'"
  [PaginationMode]="'infinite'"
  [PageSize]="100"
  [CacheBlockSize]="100"
  [MaxBlocksInCache]="10">
</mj-entity-data-grid>
```

### State Persistence with User Views

```html
<mj-entity-data-grid
  [Params]="{ ViewID: myUserView.ID }"
  [AutoPersistState]="true"
  [StatePersistDebounce]="5000">
</mj-entity-data-grid>
```

## Type Exports

```typescript
// Types
import {
  GridToolbarConfig,
  GridToolbarButton,
  GridSelectionMode,
  GridColumnConfig,
  ViewGridStateConfig,
  DataGridSortState,
  RecordSelectedEvent,
  RecordOpenedEvent
} from '@memberjunction/ng-entity-viewer';

// Event Args
import {
  BeforeRowSelectEventArgs,
  AfterRowSelectEventArgs,
  BeforeRowClickEventArgs,
  AfterRowClickEventArgs,
  BeforeDataLoadEventArgs,
  AfterDataLoadEventArgs,
  AfterSortEventArgs
} from '@memberjunction/ng-entity-viewer';

// Recycle Bin
import {
  RecycleBinComponent,
  RecycleBinChipComponent,
  RecycleBinEntry,
  BeforeRecycleBinOpenEventArgs,
  AfterRecycleBinOpenEventArgs,
  BeforeRecordRestoreEventArgs,
  AfterRecordRestoreEventArgs,
  BeforeRestoreCommitEventArgs,
  AfterRestoreCommitEventArgs
} from '@memberjunction/ng-entity-viewer';
```

## Dependencies

### Runtime Dependencies

| Package | Description |
|---------|-------------|
| `@memberjunction/core` | Core framework |
| `@memberjunction/core-entities` | Entity type definitions |
| `@memberjunction/global` | Global utilities |
| `@memberjunction/export-engine` | Data export engine |
| `@memberjunction/ng-shared-generic` | Shared generic components |
| `@memberjunction/ng-timeline` | Timeline view component |
| `@memberjunction/ng-filter-builder` | Filter builder component |
| `@memberjunction/ng-export-service` | Export service and dialog |
| `@memberjunction/ng-record-changes` | Reusable restore preview panel for the Recycle Bin |
| `@memberjunction/ng-versions` | Provides `mj-slide-panel` for the Recycle Bin slide-in |

### Peer Dependencies

- `@angular/common` ^21.x
- `@angular/core` ^21.x
- `@angular/forms` ^21.x
- `@angular/animations` ^21.x
- `ag-grid-angular` ^35.x
- `ag-grid-community` ^35.x

## Build

```bash
cd packages/Angular/Generic/entity-viewer
npm run build
```

## License

ISC
