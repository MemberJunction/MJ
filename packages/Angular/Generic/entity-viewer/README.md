# @memberjunction/ng-entity-viewer

Angular components for viewing MemberJunction entity data in multiple formats - grid and card views with filtering, selection, and shared data management.

## Features

- **Multiple View Modes**: Switch between grid (AG Grid) and card views
- **Auto-Generated Layout**: Automatically structures columns/cards based on entity metadata
- **Client-Side Filtering**: SQL-style wildcard support (`%`) for consistent behavior
- **Selection Handling**: Configurable selection behavior with events
- **Shared Data Layer**: Load data once, display in multiple ways
- **Semantic Pills**: Auto-colored pills for status/type/category fields

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

### EntityViewerComponent (Composite)

The main component that combines grid/cards with built-in filtering and view switching.

```html
<!-- Basic usage - auto-loads data -->
<mj-entity-viewer
  [entity]="selectedEntity"
  (recordSelected)="onRecordSelected($event)"
  (recordOpened)="onRecordOpened($event)">
</mj-entity-viewer>

<!-- With pre-loaded data and configuration -->
<mj-entity-viewer
  [entity]="selectedEntity"
  [records]="myRecords"
  [config]="{
    showFilter: true,
    showViewModeToggle: true,
    defaultViewMode: 'cards',
    pageSize: 500
  }">
</mj-entity-viewer>
```

#### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `showFilter` | boolean | true | Show the filter input |
| `showViewModeToggle` | boolean | true | Show grid/cards toggle |
| `showRecordCount` | boolean | true | Show record count |
| `defaultViewMode` | 'grid' \| 'cards' | 'grid' | Initial view mode |
| `pageSize` | number | 1000 | Max records to load |
| `filterPlaceholder` | string | 'Filter records...' | Filter input placeholder |
| `filterDebounceMs` | number | 250 | Filter debounce time |
| `selectionBehavior` | string | 'emit-only' | Selection behavior |

### EntityGridComponent

Standalone AG Grid-based table view.

```html
<mj-entity-grid
  [entity]="selectedEntity"
  [records]="filteredRecords"
  [selectedRecordId]="selectedId"
  [columns]="customColumns"
  (recordSelected)="onRecordSelected($event)"
  (recordOpened)="onRecordOpened($event)">
</mj-entity-grid>
```

#### Inputs

| Input | Type | Description |
|-------|------|-------------|
| `entity` | EntityInfo | Entity metadata |
| `records` | BaseEntity[] | Records to display |
| `selectedRecordId` | string | Selected record's PK |
| `columns` | GridColumnDef[] | Custom column definitions |
| `height` | string | Grid height (CSS) |
| `enableSelection` | boolean | Enable row selection |

#### Outputs

| Output | Type | Description |
|--------|------|-------------|
| `recordSelected` | RecordSelectedEvent | Single click on row |
| `recordOpened` | RecordOpenedEvent | Double click on row |

### EntityCardsComponent

Standalone card-based view with auto-generated layout.

```html
<mj-entity-cards
  [entity]="selectedEntity"
  [records]="records"
  [filterText]="searchFilter"
  [selectedRecordId]="selectedId"
  (recordSelected)="onRecordSelected($event)"
  (recordOpened)="onRecordOpened($event)"
  (filteredCountChanged)="onFilteredCountChanged($event)">
</mj-entity-cards>
```

#### Inputs

| Input | Type | Description |
|-------|------|-------------|
| `entity` | EntityInfo | Entity metadata |
| `records` | BaseEntity[] | Records to display |
| `selectedRecordId` | string | Selected record's PK |
| `filterText` | string | Filter text (supports `%` wildcards) |
| `cardTemplate` | CardTemplate | Custom card template |

#### Outputs

| Output | Type | Description |
|--------|------|-------------|
| `recordSelected` | RecordSelectedEvent | Click on card |
| `recordOpened` | RecordOpenedEvent | Open button click |
| `filteredCountChanged` | number | Filtered count changed |

### PillComponent

Semantic color pill for categorical values.

```html
<!-- Auto-color based on value -->
<mj-pill [value]="record.Status"></mj-pill>

<!-- Force specific color -->
<mj-pill [value]="record.Type" color="info"></mj-pill>
```

Colors are auto-detected based on semantic meaning:
- **success** (green): active, approved, complete, etc.
- **warning** (yellow): pending, in progress, draft, etc.
- **danger** (red): failed, error, rejected, etc.
- **info** (blue): new, info, created, etc.
- **neutral** (gray): default

## Events

### RecordSelectedEvent

```typescript
interface RecordSelectedEvent {
  record: BaseEntity;      // The selected record
  entity: EntityInfo;      // Entity metadata
  compositeKey: CompositeKey; // Record's composite key
}
```

### RecordOpenedEvent

```typescript
interface RecordOpenedEvent {
  record: BaseEntity;
  entity: EntityInfo;
  compositeKey: CompositeKey;
}
```

## Filtering

The filter supports SQL-style `%` wildcards for consistency with server-side behavior:

- `test` - matches "this is a test string"
- `hub%updat%comp` - matches "hubspot update company"
- `%comp` - matches "my company"

## Custom Templates

### Grid Columns

```typescript
const columns: GridColumnDef[] = [
  { field: 'Name', headerName: 'Name', width: 200 },
  { field: 'Status', headerName: 'Status', width: 120 },
  { field: 'Amount', headerName: 'Amount', width: 100 }
];
```

### Card Template

```typescript
const template: CardTemplate = {
  titleField: 'Name',
  subtitleField: 'Status',
  descriptionField: 'Notes',
  displayFields: [
    { name: 'Amount', type: 'number', label: 'Amount' },
    { name: 'IsActive', type: 'boolean', label: 'Active' }
  ],
  thumbnailField: 'ImageUrl',
  badgeField: 'Priority'
};
```

## Dependencies

- `@angular/core` ^18.0.0
- `@angular/common` ^18.0.0
- `@angular/forms` ^18.0.0
- `ag-grid-angular` ^34.0.0
- `ag-grid-community` ^34.0.0
- `@memberjunction/core` ^2.0.0

## License

ISC
