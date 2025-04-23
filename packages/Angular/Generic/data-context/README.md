# Data Context Component

This Angular component package provides a way to display and interact with MemberJunction Data Contexts, which are collections of data items from different sources that can be used together.

## Features

- **Display Data Context Details**: View information about a data context including ID, name, and description
- **View Data Context Items**: See all items within a data context in a grid format
- **Dialog Wrapper**: Includes a dialog component for easy integration into existing UIs
- **Metadata Provider Integration**: Works with MemberJunction metadata providers
- **Loading State Management**: Provides visual feedback during data loading

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
  (dialogClosed)="showDataContextDialog = false">
</mj-data-context-dialog>
```

### TypeScript Component Example

```typescript
import { Component } from '@angular/core';
import { IMetadataProvider } from '@memberjunction/core';

@Component({
  selector: 'app-data-context-viewer',
  template: `
    <button (click)="showDialog()">View Data Context</button>
    
    <mj-data-context-dialog
      *ngIf="isDialogVisible"
      [dataContextId]="currentDataContextId"
      [Provider]="metadataProvider"
      (dialogClosed)="isDialogVisible = false">
    </mj-data-context-dialog>
  `
})
export class DataContextViewerComponent {
  isDialogVisible = false;
  currentDataContextId = '12345';
  metadataProvider: IMetadataProvider;
  
  constructor(metadataService: YourMetadataService) {
    this.metadataProvider = metadataService.getProvider();
  }
  
  showDialog() {
    this.isDialogVisible = true;
  }
}
```

## API Reference

### DataContextComponent

This is the main component for displaying a data context and its items.

#### Inputs

- `dataContextId`: string - The ID of the data context to display (required)
- `Provider`: IMetadataProvider - Custom metadata provider (optional, will use global provider if not specified)

### DataContextDialogComponent

This component wraps the DataContextComponent in a Kendo dialog window.

#### Inputs

- `dataContextId`: string - The ID of the data context to display (required)
- `Provider`: IMetadataProvider - Custom metadata provider (optional)

#### Outputs

- `dialogClosed`: EventEmitter<void> - Emitted when the dialog is closed

## Data Context Structure

A data context in MemberJunction typically consists of:

1. **Context Record** - Contains metadata about the context (name, description, etc.)
2. **Context Items** - The actual data items that make up the context, which can be:
   - SQL queries
   - Views
   - Entity records
   - Query results
   - Other data items

The component displays both the context metadata and a grid of the items contained within it.

## Styling

The component uses Kendo UI components for consistent styling and includes basic CSS that can be overridden in your application.

## Dependencies

- `@memberjunction/core`: For metadata and entity access
- `@memberjunction/core-entities`: For DataContextEntity type
- `@memberjunction/global`: For global utilities
- `@progress/kendo-angular-grid`: For displaying data context items
- `@progress/kendo-angular-indicators`: For loading indicators