# @memberjunction/ng-record-changes

The `@memberjunction/ng-record-changes` package provides an Angular dialog component that displays a chronological history of changes made to a MemberJunction entity record. It features an interactive timeline view with advanced filtering, search capabilities, and visual diff comparison for text changes.

## Features

- **Interactive Timeline View**: Modern timeline interface showing chronological change history
- **Advanced Filtering**: Filter by change type (Create/Update/Delete) and source (Internal/External)
- **Search Functionality**: Full-text search across changes, users, and comments
- **Visual Diff Comparison**: Character-by-character or word-by-word diff highlighting for text changes
- **Expandable Details**: Click to expand/collapse detailed change information
- **Field-Level Changes**: Detailed tracking of individual field modifications
- **Smart Formatting**: Intelligent display of different data types (dates, booleans, numbers)
- **Accessibility**: Full keyboard navigation and ARIA support
- **Responsive Design**: Resizable dialog window with minimum dimensions
- **Status Indicators**: Visual badges for change types, sources, and statuses

## Installation

```bash
npm install @memberjunction/ng-record-changes
```

## Requirements

- Angular 21+
- @memberjunction/core (^2.43.0)
- @memberjunction/global (^2.43.0)
- @memberjunction/core-entities
- @memberjunction/ng-notifications
- @progress/kendo-angular-grid (^16.2.0)
- @progress/kendo-angular-indicators (^16.2.0)
- @progress/kendo-angular-dialog
- @progress/kendo-angular-buttons
- diff (^8.0.2)

## Usage

### Basic Setup

First, import the RecordChangesModule in your module:

```typescript
import { RecordChangesModule } from '@memberjunction/ng-record-changes';

@NgModule({
  imports: [
    // other imports...
    RecordChangesModule
  ],
})
export class YourModule { }
```

### Basic Usage

Use the component in your template to show the change history for a record:

```html
<button (click)="showChanges()">View History</button>

<mj-record-changes
  *ngIf="isHistoryDialogOpen"
  [record]="entityRecord"
  (dialogClosed)="closeChangesDialog()">
</mj-record-changes>
```

In your component:

```typescript
import { Component } from '@angular/core';
import { BaseEntity, Metadata } from '@memberjunction/core';

@Component({
  selector: 'app-record-detail',
  templateUrl: './record-detail.component.html',
})
export class RecordDetailComponent {
  entityRecord!: BaseEntity;
  isHistoryDialogOpen: boolean = false;
  
  constructor(private metadata: Metadata) {}
  
  async ngOnInit() {
    // Load your entity record using MemberJunction pattern
    const md = new Metadata();
    this.entityRecord = await md.GetEntityObject<BaseEntity>('Customer');
    await this.entityRecord.Load(1); // Load by ID
  }
  
  showChanges() {
    this.isHistoryDialogOpen = true;
  }
  
  closeChangesDialog() {
    this.isHistoryDialogOpen = false;
  }
}
```

## API Reference

### RecordChangesComponent

#### Inputs

| Name | Type | Description |
|------|------|-------------|
| `record` | `BaseEntity` | The entity record whose change history to display |

#### Outputs

| Name | Type | Description |
|------|------|-------------|
| `dialogClosed` | `EventEmitter<void>` | Emitted when the dialog is closed |

#### Component Properties

| Property | Type | Description |
|----------|------|-------------|
| `showloader` | `boolean` | Loading state indicator |
| `viewData` | `RecordChangeEntity[]` | All change records |
| `filteredData` | `RecordChangeEntity[]` | Filtered change records |
| `expandedItems` | `Set<string>` | IDs of expanded timeline items |
| `searchTerm` | `string` | Current search filter |
| `selectedType` | `string` | Selected change type filter |
| `selectedSource` | `string` | Selected source filter |

## Features in Detail

### Timeline Interface

The component displays changes in an interactive timeline format:
- **Visual Markers**: Icons indicate change type (Create/Update/Delete)
- **Connecting Lines**: Visual connection between sequential changes
- **Expandable Items**: Click or use keyboard to expand/collapse details
- **Relative Time**: Shows "2 hours ago", "3 days ago", etc.
- **Full Timestamps**: Hover or expand to see complete date/time

### Filtering and Search

The component includes powerful filtering capabilities:

```typescript
// The component automatically filters based on:
// - Search term (across description, user, comments)
// - Change type (Create, Update, Delete)
// - Source (Internal, External)
```

### Visual Diff Display

For text field changes, the component provides visual diff highlighting:
- **Character Diff**: For short text, codes, IDs
- **Word Diff**: For longer text with multiple words
- **Color Coding**: 
  - Green background for additions
  - Red background with strikethrough for deletions
  - No highlighting for unchanged text

### Field Change Display

Different field types are handled intelligently:

```typescript
// Boolean fields - show only new value
{ field: 'IsActive', newValue: true } // Displays as "true"

// Text fields - show diff view with highlighting
{ field: 'Description', oldValue: 'Old text', newValue: 'New text' }

// Date fields - formatted display
{ field: 'CreatedAt', newValue: '2024-01-15T10:30:00Z' } 
// Displays as "January 15, 2024, 10:30 AM EST"

// Empty values
{ field: 'Notes', oldValue: null, newValue: 'New note' }
// Displays as "(empty) → New note"
```

## Styling and Customization

### CSS Classes

The component uses these main CSS classes for customization:

```css
/* Main container classes */
.kendo-window-custom     /* Dialog window wrapper */
.record-changes-container /* Main content container */
.timeline-container      /* Timeline wrapper */

/* Timeline item classes */
.timeline-item          /* Individual change item */
.timeline-item.expanded /* Expanded state */
.timeline-marker        /* Visual marker/icon */
.timeline-content       /* Content area */

/* Change type classes */
.change-create    /* Create changes (green) */
.change-update    /* Update changes (blue) */
.change-delete    /* Delete changes (red) */

/* Status and badge classes */
.badge-create     /* Create type badge */
.badge-update     /* Update type badge */
.badge-delete     /* Delete type badge */
.status-complete  /* Completed status */
.status-pending   /* Pending status */
.status-error     /* Error status */

/* Diff view classes */
.diff-container   /* Diff display wrapper */
.diff-added       /* Added text (green) */
.diff-removed     /* Removed text (red) */
.diff-unchanged   /* Unchanged text */
```

### Dialog Configuration

The dialog window is configured with:
- **Width**: 800px (resizable)
- **Height**: 650px (resizable)
- **Min Width**: 600px
- **Min Height**: 400px
- **Position**: Top: 50px, Left: 50px

## Advanced Usage

### Conditional Display Based on Entity Configuration

Show the history button only for entities with change tracking enabled:

```html
<button *ngIf="entityRecord?.EntityInfo?.TrackRecordChanges" 
        (click)="showChanges()"
        class="btn btn-secondary">
  <i class="fa-solid fa-history"></i> View History
</button>
```

### Integration with Form Components

Integrate with MemberJunction form components for a complete solution:

```typescript
import { Component } from '@angular/core';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@Component({
  selector: 'app-customer-form',
  templateUrl: './customer-form.component.html',
})
export class CustomerFormComponent extends BaseFormComponent {
  isHistoryDialogOpen: boolean = false;
  
  showHistory() {
    if (this.record?.EntityInfo?.TrackRecordChanges) {
      this.isHistoryDialogOpen = true;
    }
  }
  
  onHistoryDialogClosed() {
    this.isHistoryDialogOpen = false;
  }
}
```

### Handling Different Change Types

The component automatically handles different change scenarios:

```typescript
// Record Creation - shows all initial field values
{
  Type: 'Create',
  FullRecordJSON: '{"Name": "John Doe", "Email": "john@example.com"}'
}

// Record Update - shows field-by-field changes
{
  Type: 'Update',
  ChangesJSON: '{"Name": {"field": "Name", "oldValue": "John", "newValue": "John Doe"}}'
}

// Record Deletion - shows deletion message
{
  Type: 'Delete',
  ChangesDescription: 'Record deleted'
}
```

## Integration with MemberJunction

The component integrates seamlessly with MemberJunction's audit system:

1. **Automatic Loading**: Uses `Metadata.GetRecordChanges()` to fetch history
2. **Entity Awareness**: Respects entity field metadata for display names
3. **Type Safety**: Full TypeScript support with `RecordChangeEntity` type
4. **Performance**: Efficient loading with built-in pagination support

## Accessibility

The component includes comprehensive accessibility features:
- **ARIA Labels**: Descriptive labels for all interactive elements
- **Keyboard Navigation**: Full keyboard support (Enter/Space to expand)
- **Screen Reader Support**: Meaningful announcements for all changes
- **Focus Management**: Proper focus handling in the dialog

## Performance Considerations

- **Lazy Loading**: Details are only rendered when expanded
- **Virtual Scrolling**: Ready for integration with Kendo's virtual scrolling
- **Efficient Diff**: Smart algorithm selection based on content type
- **Minimal Re-renders**: Optimized change detection strategy

## Error Handling

The component includes built-in error handling:
- Displays notification toast on load failure
- Gracefully handles missing or invalid data
- Shows error logs when available in change records

## Build and Development

To build the package locally:

```bash
cd packages/Angular/Explorer/record-changes
npm run build
```

The package uses Angular's ng-packagr for building the library.