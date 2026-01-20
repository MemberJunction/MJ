# @memberjunction/ng-entity-viewer

Angular components for viewing MemberJunction entity data in multiple formats - grid, card, and timeline views with filtering, selection, toolbar actions, and comprehensive event handling.

## Features

- **Multiple View Modes**: Switch between grid (AG Grid), card, and timeline views
- **Modern Data Grid**: `mj-entity-data-grid` with Before/After cancelable events, infinite scroll, state persistence
- **Configurable Toolbar**: Show/hide individual buttons, add custom buttons, overflow menu
- **Auto-Generated Layout**: Automatically structures columns/cards based on entity metadata
- **Server-Side Operations**: Filtering, sorting, and pagination with RunView integration
- **Client-Side Filtering**: SQL-style wildcard support (`%`) for consistent behavior
- **Selection Handling**: Single, multiple, and checkbox selection modes
- **Grid State Persistence**: Save/restore column widths, order, visibility, and sort state
- **Semantic Pills**: Auto-colored pills for status/type/category fields

## Installation

```bash
npm install @memberjunction/ng-entity-viewer ag-grid-angular ag-grid-community
```

## Quick Start

### Import the Module

```typescript
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';

@NgModule({
  imports: [EntityViewerModule]
})
export class MyModule { }
```

### Basic Usage

```html
<!-- Composite viewer with grid/cards/timeline toggle -->
<mj-entity-viewer
  [entity]="selectedEntity"
  (recordSelected)="onRecordSelected($event)"
  (recordOpened)="onRecordOpened($event)">
</mj-entity-viewer>

<!-- Standalone data grid with toolbar -->
<mj-entity-data-grid
  [entityName]="'Contacts'"
  [showToolbar]="true"
  [selectionMode]="'multiple'"
  (afterRowDoubleClick)="onRowDoubleClick($event)">
</mj-entity-data-grid>
```

---

## Components

### EntityDataGridComponent (`mj-entity-data-grid`)

Modern AG Grid-based data grid with rich event system and configurable toolbar.

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

#### Data Source Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `Params` | RunViewParams | - | Primary data source (supports stored views + dynamic views) |
| `entityName` | string | - | Entity name for dynamic views |
| `extraFilter` | string | - | Additional WHERE clause filter |
| `searchString` | string | - | User search string |
| `orderBy` | string | - | ORDER BY clause |
| `maxRows` | number | 0 | Max rows to fetch (0 = no limit) |
| `data` | BaseEntity[] | - | Pre-loaded data (bypasses RunView) |
| `AllowLoad` | boolean | true | Enable/disable data loading |
| `AutoRefreshOnParamsChange` | boolean | true | Auto-refresh when Params changes |

#### Pagination Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `PaginationMode` | 'client' \| 'infinite' | 'client' | Pagination strategy |
| `PageSize` | number | 100 | Rows per page (infinite mode) |
| `CacheBlockSize` | number | 100 | Cache block size (infinite mode) |
| `MaxBlocksInCache` | number | 10 | Max cached blocks |

#### Display Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `showToolbar` | boolean | true | Show the toolbar |
| `toolbarConfig` | GridToolbarConfig | - | Toolbar configuration |
| `selectionMode` | 'none' \| 'single' \| 'multiple' \| 'checkbox' | 'single' | Row selection mode |
| `height` | number \| 'auto' \| 'fit-content' | 'auto' | Grid height |
| `gridState` | ViewGridStateConfig | - | Column/sort state from User View |
| `allowSorting` | boolean | true | Enable column sorting |
| `allowColumnReorder` | boolean | true | Enable column reordering |
| `allowColumnResize` | boolean | true | Enable column resizing |
| `serverSideSorting` | boolean | true | Sort triggers server reload |

#### Before/After Events

The grid uses a cancelable event pattern. Before events can be canceled by setting `event.cancel = true`.

**Row Selection Events:**
| Event | Args Type | Description |
|-------|-----------|-------------|
| `beforeRowSelect` | BeforeRowSelectEventArgs | Before row is selected |
| `afterRowSelect` | AfterRowSelectEventArgs | After row is selected |
| `beforeRowDeselect` | BeforeRowDeselectEventArgs | Before row is deselected |
| `afterRowDeselect` | AfterRowDeselectEventArgs | After row is deselected |

**Row Click Events:**
| Event | Args Type | Description |
|-------|-----------|-------------|
| `beforeRowClick` | BeforeRowClickEventArgs | Before row click processes |
| `afterRowClick` | AfterRowClickEventArgs | After row click |
| `beforeRowDoubleClick` | BeforeRowDoubleClickEventArgs | Before double-click |
| `afterRowDoubleClick` | AfterRowDoubleClickEventArgs | After double-click |

**Data Events:**
| Event | Args Type | Description |
|-------|-----------|-------------|
| `beforeDataLoad` | BeforeDataLoadEventArgs | Before data loads |
| `afterDataLoad` | AfterDataLoadEventArgs | After data loads |
| `beforeDataRefresh` | BeforeDataRefreshEventArgs | Before refresh |
| `afterDataRefresh` | AfterDataRefreshEventArgs | After refresh |

**Sorting/Column Events:**
| Event | Args Type | Description |
|-------|-----------|-------------|
| `beforeSort` | BeforeSortEventArgs | Before sort changes |
| `afterSort` | AfterSortEventArgs | After sort changes |
| `beforeColumnReorder` | BeforeColumnReorderEventArgs | Before column move |
| `afterColumnReorder` | AfterColumnReorderEventArgs | After column move |
| `gridStateChanged` | GridStateChangedEvent | Column state changed |

**Toolbar Button Events:**
| Event | Args Type | Description |
|-------|-----------|-------------|
| `newButtonClick` | void | Add/New button clicked |
| `refreshButtonClick` | void | Refresh button clicked |
| `deleteButtonClick` | BaseEntity[] | Delete button clicked |
| `exportButtonClick` | void | Export button clicked |
| `compareButtonClick` | BaseEntity[] | Compare button clicked |
| `mergeButtonClick` | BaseEntity[] | Merge button clicked |
| `addToListButtonClick` | BaseEntity[] | Add to List clicked |

---

### GridToolbarConfig

Configure which toolbar buttons are shown and their behavior.

```typescript
const toolbarConfig: GridToolbarConfig = {
  // Search
  showSearch: true,
  searchPlaceholder: 'Search records...',
  searchDebounce: 300,

  // Buttons
  showRefresh: true,
  showAdd: true,
  showDelete: true,
  showExport: true,
  showColumnChooser: true,
  showFilterToggle: false,

  // Export options
  exportFormats: ['excel', 'csv', 'json'],

  // Display
  showRowCount: true,
  showSelectionCount: true,
  position: 'top',

  // Custom buttons
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

#### GridToolbarConfig Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `showSearch` | boolean | true | Show search input |
| `searchPlaceholder` | string | 'Search...' | Search placeholder text |
| `searchDebounce` | number | 300 | Search debounce (ms) |
| `showRefresh` | boolean | true | Show refresh button |
| `showAdd` | boolean | true | Show add/new button |
| `showDelete` | boolean | true | Show delete button |
| `showExport` | boolean | true | Show export button |
| `exportFormats` | Array | ['excel'] | Available export formats |
| `showColumnChooser` | boolean | true | Show column chooser |
| `showFilterToggle` | boolean | false | Show filter toggle |
| `showRowCount` | boolean | true | Show total row count |
| `showSelectionCount` | boolean | true | Show selected count |
| `position` | string | 'top' | Toolbar position |
| `customButtons` | GridToolbarButton[] | [] | Custom buttons |

#### GridToolbarButton

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique button identifier |
| `text` | string | Button text |
| `icon` | string | Font Awesome icon class |
| `tooltip` | string | Hover tooltip |
| `disabled` | boolean \| () => boolean | Disabled state |
| `visible` | boolean \| () => boolean | Visibility |
| `cssClass` | string | Custom CSS class |
| `position` | 'left' \| 'right' | Button position |
| `onClick` | () => void | Click handler |

---

### EntityViewerComponent (`mj-entity-viewer`)

Composite component combining grid, cards, and timeline views with view switching.

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

#### Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `entity` | EntityInfo | - | Entity metadata |
| `records` | BaseEntity[] | - | Pre-loaded records |
| `viewEntity` | UserViewEntityExtended | - | User View for filtering/sorting |
| `viewMode` | 'grid' \| 'cards' \| 'timeline' | 'grid' | Current view mode |
| `filterText` | string | - | Filter text |
| `sortState` | SortState | - | Sort state |
| `gridState` | ViewGridStateConfig | - | Grid column state |
| `showGridToolbar` | boolean | true | Show grid toolbar |
| `gridToolbarConfig` | GridToolbarConfig | - | Toolbar configuration |
| `gridSelectionMode` | GridSelectionMode | 'single' | Selection mode |
| `config` | EntityViewerConfig | - | Viewer configuration |

#### Outputs

| Output | Event Type | Description |
|--------|------------|-------------|
| `recordSelected` | RecordSelectedEvent | Record clicked |
| `recordOpened` | RecordOpenedEvent | Record double-clicked |
| `dataLoaded` | DataLoadedEvent | Data finished loading |
| `viewModeChange` | EntityViewMode | View mode changed |
| `filterTextChange` | string | Filter text changed |
| `sortChanged` | SortChangedEvent | Sort changed |
| `gridStateChanged` | GridStateChangedEvent | Grid state changed |
| `addRequested` | void | Add button clicked |
| `deleteRequested` | { records } | Delete button clicked |
| `refreshRequested` | void | Refresh button clicked |
| `exportRequested` | { format } | Export button clicked |

---

### EntityCardsComponent (`mj-entity-cards`)

Card-based view with auto-generated layout.

```html
<mj-entity-cards
  [entity]="selectedEntity"
  [records]="records"
  [filterText]="searchFilter"
  [cardTemplate]="customTemplate"
  (recordSelected)="onSelected($event)"
  (recordOpened)="onOpened($event)">
</mj-entity-cards>
```

---

### PillComponent (`mj-pill`)

Semantic color pill for categorical values.

```html
<mj-pill [value]="record.Status"></mj-pill>
<mj-pill [value]="record.Type" color="info"></mj-pill>
```

Auto-detected colors:
- **success** (green): active, approved, complete, success
- **warning** (yellow): pending, in progress, draft, waiting
- **danger** (red): failed, error, rejected, cancelled
- **info** (blue): new, info, created, open
- **neutral** (gray): default

---

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

### Cancelable Events

```typescript
onBeforeRowSelect(event: BeforeRowSelectEventArgs) {
  // Prevent selecting certain rows
  if (event.row.Get('Status') === 'Locked') {
    event.cancel = true;
    event.cancelReason = 'Cannot select locked records';
  }
}
```

### Custom Export Handler

```typescript
onExportRequested(event: { format: 'excel' | 'csv' | 'json' }) {
  // Custom export logic
  if (event.format === 'excel') {
    this.exportService.exportToExcel(this.records);
  }
}
```

---

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
```

---

## Dependencies

- `@angular/core` ^18.0.0
- `@angular/common` ^18.0.0
- `@angular/forms` ^18.0.0
- `ag-grid-angular` ^34.0.0
- `ag-grid-community` ^34.0.0
- `@memberjunction/core` ^2.0.0
- `@memberjunction/core-entities` ^2.0.0

## License

ISC
