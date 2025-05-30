# @memberjunction/ng-compare-records

The `@memberjunction/ng-compare-records` package provides a powerful Angular component for comparing multiple records of the same entity type. It displays records side-by-side in a grid format, highlighting differences between them, and optionally allows selecting values from different records to create a composite record.

## Features

- Side-by-side comparison of multiple entity records
- Option to show only differences between records
- Option to suppress fields with blank values
- Highlighting of selected record and field values
- "Selection mode" that allows picking values from different records
- Automatic record dependency detection
- Support for composite primary keys
- Responsive grid with virtual scrolling
- Field formatting according to entity metadata
- Automatic data loading for incomplete records
- Read-only field indication with italic styling
- Header click to select base record in selection mode

## Installation

```bash
npm install @memberjunction/ng-compare-records
```

## Requirements

- Angular 18+
- @memberjunction/core
- @memberjunction/core-entities
- @progress/kendo-angular-grid
- @progress/kendo-angular-inputs
- @progress/kendo-angular-label

## Usage

### Basic Setup

First, import the CompareRecordsModule in your module:

```typescript
import { CompareRecordsModule } from '@memberjunction/ng-compare-records';

@NgModule({
  imports: [
    // other imports...
    CompareRecordsModule
  ],
})
export class YourModule { }
```

### Basic Usage

Use the component in your template for simple record comparison:

```html
<mj-compare-records
  [recordsToCompare]="recordsToCompare"
  [entityName]="entityName">
</mj-compare-records>
```

In your component:

```typescript
import { Component, OnInit } from '@angular/core';
import { BaseEntity, Metadata } from '@memberjunction/core';

@Component({
  selector: 'app-compare-example',
  templateUrl: './compare-example.component.html',
})
export class CompareExampleComponent implements OnInit {
  recordsToCompare: BaseEntity[] = [];
  entityName: string = 'Customer';

  constructor(private metadata: Metadata) {}

  async ngOnInit() {
    // Load records to compare
    const customer1 = await this.metadata.GetEntityObject('Customer', 1);
    const customer2 = await this.metadata.GetEntityObject('Customer', 2);
    const customer3 = await this.metadata.GetEntityObject('Customer', 3);
    
    await Promise.all([
      customer1.Load(),
      customer2.Load(),
      customer3.Load()
    ]);
    
    this.recordsToCompare = [customer1, customer2, customer3];
  }
}
```

### Advanced Usage with Selection Mode

When you need to allow users to select values from different records to create a composite record:

```html
<mj-compare-records
  [recordsToCompare]="recordsToCompare"
  [entityName]="entityName"
  [selectionMode]="true">
</mj-compare-records>
```

In your component:

```typescript
import { Component, OnInit, ViewChild } from '@angular/core';
import { BaseEntity, Metadata } from '@memberjunction/core';
import { CompareRecordsComponent } from '@memberjunction/ng-compare-records';

@Component({
  selector: 'app-advanced-compare',
  templateUrl: './advanced-compare.component.html',
})
export class AdvancedCompareComponent implements OnInit {
  @ViewChild(CompareRecordsComponent) compareComponent!: CompareRecordsComponent;
  
  recordsToCompare: BaseEntity[] = [];
  entityName: string = 'Product';

  constructor(private metadata: Metadata) {}

  async ngOnInit() {
    // Load records to compare
    // ... Load your records
  }

  async createCompositeRecord() {
    // Get the base record (selected record)
    const baseRecord = this.recordsToCompare.find(r => 
      r.PrimaryKey.Equals(this.compareComponent.selectedRecordCompositeKey)
    );
    
    if (baseRecord) {
      // Create a new entity object
      const newRecord = await this.metadata.GetEntityObject(this.entityName);
      
      // Copy all values from the base record
      for (const field of baseRecord.Fields) {
        newRecord.Set(field.Name, baseRecord.Get(field.Name));
      }
      
      // Apply all overrides from the field map
      for (const field of this.compareComponent.fieldMap) {
        // Find the source record
        const sourceRecord = this.recordsToCompare.find(r => 
          r.PrimaryKey.Equals(field.CompositeKey)
        );
        
        if (sourceRecord) {
          // Set the value from the source record
          newRecord.Set(field.fieldName, sourceRecord.Get(field.fieldName));
        }
      }
      
      // Use the new record
      console.log('Composite record created:', newRecord);
      // Save the record if needed
      // await newRecord.Save();
    }
  }
}
```

### Working with Raw Data

The component can also work with raw data objects (not BaseEntity instances). It will automatically:
- Detect if records need additional fields from the database
- Load missing data efficiently using RunView
- Convert raw objects to BaseEntity instances

```typescript
// You can pass raw objects with primary key values
const rawRecords = [
  { CustomerID: 1 },
  { CustomerID: 2 },
  { CustomerID: 3 }
];

// The component will automatically load full records
this.recordsToCompare = rawRecords;
```

## API Reference

### CompareRecordsComponent

#### Inputs

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `recordsToCompare` | `BaseEntity[]` | `[]` | Array of records to compare |
| `entityName` | `string` | `''` | Name of the entity type being compared |
| `visibleColumns` | `ViewColumnInfo[]` | `[]` | Optional columns to display (defaults to all entity fields) |
| `selectionMode` | `boolean` | `false` | Whether to enable selecting values from different records |

#### Properties

| Name | Type | Description |
|------|------|-------------|
| `selectedRecordCompositeKey` | `CompositeKey` | The primary key of the currently selected record (in selection mode) |
| `fieldMap` | `{fieldName: string, CompositeKey: CompositeKey, value: any}[]` | Maps fields to records other than the selected record (in selection mode) |
| `showDifferences` | `boolean` | Whether to show only fields with different values |
| `suppressBlankFields` | `boolean` | Whether to hide fields with blank values |

#### Methods

| Name | Return Type | Description |
|------|-------------|-------------|
| `prepareViewData()` | `Promise<void>` | Refreshes the view with the current records |
| `ResizeGrid()` | `void` | Manually resize the grid |

## Styling

The component uses the following CSS classes that can be customized:

- `.dialog-container`: Main container for the component
- `.dialog-toolbar`: Contains the checkboxes for options
- `.compare-grid-rows`: Applied to grid rows
- `.cell`: Basic cell styling
- `.cell-not-selected`: Applied to cells not selected in selection mode
- `.cell-selected`: Applied to cells from the selected record in selection mode
- `.cell-selected-override`: Applied to cells selected from non-selected records
- `.cell-readonly`: Applied to read-only fields

## Building the Package

This package uses the Angular compiler (ngc) for building:

```bash
# From the package directory
npm run build

# From the repository root using turbo
turbo build --filter="@memberjunction/ng-compare-records"
```

## Dependencies

### Peer Dependencies
- @angular/common: 18.0.2
- @angular/core: 18.0.2
- @angular/forms: 18.0.2

### Runtime Dependencies
- @memberjunction/core: 2.43.0
- @memberjunction/core-entities: 2.43.0
- @progress/kendo-angular-grid: 16.2.0
- tslib: ^2.3.0

### Dev Dependencies
- @angular/compiler: 18.0.2
- @angular/compiler-cli: 18.0.2

## Integration with MemberJunction

This component is designed to work seamlessly with the MemberJunction framework:

- **Entity Metadata**: Uses MJ's metadata system to understand entity structure, field types, and relationships
- **Field Formatting**: Leverages EntityField.FormatValue() for consistent display of values
- **Primary Key Support**: Works with both single and composite primary keys using CompositeKey class
- **Dependency Detection**: Uses MJ's GetRecordDependencies() to determine the default selected record
- **Data Access**: Utilizes RunView for efficient batch loading of incomplete records

## Advanced Features

### Selection Mode Behavior

In selection mode:
- The record with the most dependencies is automatically selected as the base record
- Click on any cell to select that field's value from that record
- Click on column headers to change the base record
- Selected record header shows "✓✓✓" prefix
- Field values from the base record have a yellowgreen background
- Override values (from other records) have a lightpink background
- Read-only fields cannot be selected and appear in italic

### Performance Optimizations

- **Virtual Scrolling**: Handles large datasets efficiently
- **Batch Loading**: Loads multiple incomplete records in a single database query
- **Debounced Resizing**: Window resize events are debounced to prevent excessive recalculation

## Troubleshooting

### Common Issues

1. **Records not displaying**: Ensure entity name matches exactly (case-insensitive)
2. **Missing fields**: Check that visibleColumns includes all desired fields
3. **Selection not working**: Verify selectionMode is set to true
4. **Styling issues**: Ensure Kendo UI theme is properly loaded in your application