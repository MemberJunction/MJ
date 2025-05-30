# @memberjunction/ng-data-context

Angular component package for displaying and editing MemberJunction Data Contexts - collections of data items from different sources that can be used together for analysis, reporting, or other data operations.

## Overview

This package provides Angular components to display Data Contexts and their associated items in a clean, user-friendly interface. Data Contexts in MemberJunction are powerful constructs that allow users to group related data from various sources (SQL queries, views, entities, etc.) into a single logical unit.

## Features

- **Display Data Context Details**: View comprehensive information about a data context including ID, name, and description
- **View Data Context Items**: Display all items within a data context in a sortable, scrollable grid format
- **Dialog Wrapper**: Ready-to-use dialog component for popup displays
- **Metadata Provider Integration**: Seamlessly integrates with MemberJunction's metadata system
- **Loading State Management**: Built-in loading indicators for better user experience
- **Virtual Scrolling**: Efficiently handle large datasets with Kendo Grid's virtual scrolling
- **Responsive Design**: Components adapt to different screen sizes

## Installation

```bash
npm install @memberjunction/ng-data-context
```

## Usage

### Import the Module

```typescript
import { DataContextModule } from '@memberjunction/ng-data-context';

@NgModule({
  imports: [
    DataContextModule,
    // other imports
  ],
  // ...
})
export class YourModule { }
```

### Basic Component Usage

```html
<!-- Display a data context using its ID -->
<mj-data-context
  [dataContextId]="'your-data-context-id'"
  [Provider]="customMetadataProvider">
</mj-data-context>
```

### Dialog Component Usage

```html
<!-- Show data context in a dialog -->
<mj-data-context-dialog
  *ngIf="showDataContextDialog"
  [dataContextId]="selectedDataContextId"
  [Provider]="metadataProvider"
  (dialogClosed)="showDataContextDialog = false">
</mj-data-context-dialog>
```

### Complete TypeScript Example

```typescript
import { Component } from '@angular/core';
import { IMetadataProvider, Metadata } from '@memberjunction/core';

@Component({
  selector: 'app-data-context-viewer',
  template: `
    <div class="data-context-container">
      <h2>Data Context Viewer</h2>
      
      <!-- Inline component usage -->
      <mj-data-context
        [dataContextId]="selectedDataContextId"
        [Provider]="metadataProvider">
      </mj-data-context>
      
      <!-- Dialog trigger button -->
      <button (click)="showDialog()">View in Dialog</button>
      
      <!-- Dialog component -->
      <mj-data-context-dialog
        *ngIf="isDialogVisible"
        [dataContextId]="selectedDataContextId"
        [Provider]="metadataProvider"
        (dialogClosed)="onDialogClose()">
      </mj-data-context-dialog>
    </div>
  `,
  styles: [`
    .data-context-container {
      padding: 20px;
    }
  `]
})
export class DataContextViewerComponent {
  isDialogVisible = false;
  selectedDataContextId = '12345-67890-abcdef';
  metadataProvider: IMetadataProvider;
  
  constructor() {
    // Use the global metadata provider or inject your own
    this.metadataProvider = Metadata.Provider;
  }
  
  showDialog(): void {
    this.isDialogVisible = true;
  }
  
  onDialogClose(): void {
    this.isDialogVisible = false;
    // Additional cleanup or refresh logic here
  }
}
```

## API Reference

### DataContextComponent

The main component for displaying a data context and its items.

**Selector**: `mj-data-context`

#### Inputs

| Input | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `dataContextId` | `string` | Yes | - | The ID of the data context to display |
| `Provider` | `IMetadataProvider \| null` | No | `Metadata.Provider` | Custom metadata provider. If not provided, uses the global MemberJunction metadata provider |

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `dataContextRecord` | `DataContextEntity \| undefined` | The loaded data context entity |
| `dataContextItems` | `any[]` | Array of data context items |
| `showLoader` | `boolean` | Loading state indicator |

### DataContextDialogComponent

Dialog wrapper component that displays the DataContextComponent in a Kendo dialog.

**Selector**: `mj-data-context-dialog`

#### Inputs

| Input | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `dataContextId` | `string` | Yes | - | The ID of the data context to display |
| `Provider` | `IMetadataProvider \| null` | No | `null` | Custom metadata provider |

#### Outputs

| Output | Type | Description |
|--------|------|-------------|
| `dialogClosed` | `EventEmitter<void>` | Emitted when the dialog is closed |

### DataContextModule

The NgModule that exports both components.

**Exports**:
- `DataContextComponent`
- `DataContextDialogComponent`

## Data Context Structure

A data context in MemberJunction consists of:

1. **Context Record** (`DataContextEntity`)
   - `ID`: Unique identifier
   - `Name`: Display name
   - `Description`: Detailed description
   - Additional metadata fields

2. **Context Items** (`Data Context Items` entity)
   - `Type`: The type of data item (SQL, View, Query, Entity, Record)
   - `SQL`: Direct SQL query (if applicable)
   - `ViewID`: Reference to a view
   - `QueryID`: Reference to a saved query
   - `EntityID`: Reference to an entity
   - `RecordID`: Specific record reference

## Grid Features

The component uses Kendo Grid with the following features enabled:
- **Virtual Scrolling**: Efficiently handles large datasets
- **Sorting**: Click column headers to sort
- **Resizable Columns**: Drag column borders to resize
- **Keyboard Navigation**: Navigate cells with keyboard
- **Page Size**: Default 100 items per virtual page

## Styling

The components use Kendo UI for Angular styling. You can override styles by targeting the component selectors:

```css
/* Custom styling example */
mj-data-context {
  /* Your custom styles */
}

.kendo-grid-container {
  height: 500px; /* Adjust grid height */
}
```

## Dependencies

### Runtime Dependencies
- `@memberjunction/core` (v2.43.0): Core MemberJunction functionality
- `@memberjunction/core-entities` (v2.43.0): Entity type definitions
- `@memberjunction/global` (v2.43.0): Global utilities
- `tslib` (^2.3.0): TypeScript runtime helpers

### Peer Dependencies
- `@angular/common` (18.0.2)
- `@angular/core` (18.0.2)
- `@progress/kendo-angular-grid` (16.2.0)
- `@progress/kendo-angular-indicators` (16.2.0)
- `@progress/kendo-angular-dialog` (imported via module)
- `@progress/kendo-angular-buttons` (imported via module)

## Integration with MemberJunction

This package integrates seamlessly with other MemberJunction packages:

- Uses the MemberJunction metadata system for entity loading
- Leverages `RunView` for efficient data retrieval
- Compatible with MemberJunction's security and permission system
- Works with custom metadata providers for multi-tenant scenarios

## Build and Development

To build this package individually:

```bash
cd packages/Angular/Generic/data-context
npm run build
```

The package uses Angular CLI's `ngc` compiler for building the library.

## Error Handling

The component includes built-in error handling:
- Logs errors using MemberJunction's `LogError` function
- Hides the loader on error
- Gracefully handles missing or invalid data context IDs

## Best Practices

1. **Provider Usage**: Only provide a custom `Provider` if you need to override the global metadata provider
2. **Dialog Management**: Always handle the `dialogClosed` event to properly manage dialog state
3. **Performance**: The virtual scrolling is optimized for datasets up to several thousand items
4. **Error Handling**: Monitor console logs for any data loading errors

## License

ISC