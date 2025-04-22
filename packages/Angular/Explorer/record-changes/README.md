# @memberjunction/ng-record-changes

The `@memberjunction/ng-record-changes` package provides an Angular dialog component that displays a chronological history of changes made to a MemberJunction entity record. It shows field-by-field changes with before and after values in an easy-to-read format.

## Features

- Modal dialog interface for viewing record change history
- Chronological display of changes with timestamps
- Field-by-field change tracking with before and after values
- Color-coded presentation for easy comparison
- Sortable grid interface
- Formatted display of different field types
- Integration with MemberJunction's audit trail system
- Support for any entity type with change tracking enabled

## Installation

```bash
npm install @memberjunction/ng-record-changes
```

## Requirements

- Angular 18+
- @memberjunction/core
- @memberjunction/global
- @progress/kendo-angular-grid
- @progress/kendo-angular-indicators

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
    // Load your entity record
    this.entityRecord = await this.metadata.GetEntityObject('Customer', 1);
    await this.entityRecord.Load();
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

## How It Works

1. When the component is initialized, it makes a query to the `Record Changes` entity in MemberJunction, filtering by the entity name and record ID provided.

2. The changes are displayed in reverse chronological order (newest first) with timestamps.

3. For each change, the component shows:
   - The field name that was changed
   - The old value (in gray)
   - The new value (in blue)

4. For boolean fields, only the new value is shown as the old value is implied.

5. The component handles formatting of different field types appropriately:
   - Dates are formatted in a user-friendly way
   - Booleans show clear true/false values
   - Numbers are formatted with appropriate separators

## Styling

The component uses the following CSS classes that can be customized:

- `.kendo-window-custom`: Applied to the main dialog window
- `.kendo-grid-container`: Container for the changes grid

## Advanced Usage

### Conditional Display Based on Entity Type

You can conditionally show the history button based on whether the entity tracks changes:

```html
<button *ngIf="entityRecord?.EntityInfo?.TrackRecordChanges" 
        (click)="showChanges()">
  View History
</button>
```

### Integration with Form Components

The record changes component can be integrated with form components to provide a complete editing and auditing solution:

```typescript
import { Component } from '@angular/core';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@Component({
  selector: 'app-customer-form',
  templateUrl: './customer-form.component.html',
})
export class CustomerFormComponent extends BaseFormComponent {
  isHistoryDialogOpen: boolean = false;
  
  handleHistoryDialog() {
    this.isHistoryDialogOpen = !this.isHistoryDialogOpen;
  }
}
```

```html
<div class="form-actions">
  <button (click)="handleHistoryDialog()">View History</button>
</div>

<mj-record-changes 
  *ngIf="isHistoryDialogOpen" 
  [record]="record" 
  (dialogClosed)="handleHistoryDialog()">
</mj-record-changes>
```

## Dependencies

- @angular/common
- @angular/core
- @angular/forms
- @angular/router
- @memberjunction/core
- @memberjunction/global
- @memberjunction/ng-compare-records
- @memberjunction/ng-container-directives
- @progress/kendo-angular-grid
- @progress/kendo-angular-indicators
- @progress/kendo-angular-dialog
- @progress/kendo-angular-buttons