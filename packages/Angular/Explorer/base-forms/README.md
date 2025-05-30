# @memberjunction/ng-base-forms

Base classes and components for creating entity forms in MemberJunction Angular applications, providing core functionality for form management, validation, and data handling.

## Features

- Abstract base classes for forms, form sections, and record components
- Automatic field rendering components with type detection
- Support for edit mode and validation
- Transaction management for saving related records
- Integration with MemberJunction metadata and entity framework
- Tab management and responsive design
- Permission checking and user authorization
- Support for favorites and record dependencies
- Form event handling and coordination
- Dynamic form section loading
- Linked record field components with search and dropdown capabilities

## Installation

```bash
npm install @memberjunction/ng-base-forms
```

## Core Components

### MJFormField

A powerful component that automatically generates UI for any field in a BaseEntity object:

```typescript
import { Component } from '@angular/core';
import { BaseEntity } from '@memberjunction/core';

@Component({
  template: `
    <mj-form-field
      [record]="myRecord"
      [EditMode]="isEditing"
      FieldName="FirstName"
      Type="textbox"
      [ShowLabel]="true"
      (ValueChange)="onValueChange($event)"
    ></mj-form-field>
  `
})
export class MyComponent {
  myRecord: BaseEntity;
  isEditing: boolean = false;
  
  onValueChange(newValue: any) {
    console.log('Field value changed:', newValue);
  }
}
```

#### MJFormField Input Properties

- `record` (BaseEntity, required): The entity record containing the field
- `EditMode` (boolean): Whether the field is editable
- `FieldName` (string, required): Name of the field to render
- `Type` (string): Control type - 'textbox' | 'textarea' | 'numerictextbox' | 'datepicker' | 'checkbox' | 'dropdownlist' | 'combobox' | 'code'
- `LinkType` (string): For linked fields - 'Email' | 'URL' | 'Record' | 'None'
- `LinkComponentType` (string): For record links - 'Search' | 'Dropdown'
- `ShowLabel` (boolean): Whether to show the field label (default: true)
- `DisplayName` (string): Override the default display name
- `PossibleValues` (string[]): Custom values for dropdown/combobox fields

### MJLinkField

Specialized component for fields that link to other entity records:

```typescript
<mj-link-field
  [record]="myRecord"
  FieldName="CustomerID"
  [RecordName]="customerName"
  LinkComponentType="Search"
></mj-link-field>
```

#### MJLinkField Input Properties

- `record` (BaseEntity, required): The entity record
- `FieldName` (string, required): The foreign key field name
- `RecordName` (string): Pre-populate with the linked record's name
- `LinkComponentType` ('Search' | 'Dropdown'): UI type for selecting records

### SectionLoaderComponent

Dynamically loads form sections registered with the MemberJunction class factory:

```typescript
<mj-form-section
  Entity="Customer"
  Section="Details"
  [record]="customerRecord"
  [EditMode]="isEditing"
  (LoadComplete)="onSectionLoaded()"
></mj-form-section>
```

## Base Classes

### BaseRecordComponent

The foundational class for all components that work with entity records:

```typescript
import { BaseRecordComponent } from '@memberjunction/ng-base-forms';

@Component({
  // ...
})
export class YourComponent extends BaseRecordComponent {
  // Inherited properties:
  // - record: BaseEntity
  // - EditMode: boolean
  // - UserCanEdit: boolean
  // - UserCanDelete: boolean
  // - IsFavorite: boolean
}
```

### BaseFormSectionComponent

For creating reusable form sections that can be dynamically loaded:

```typescript
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';

@Component({
  template: `
    <div class="form-section">
      <!-- Your section UI here -->
    </div>
  `
})
@RegisterClass(BaseFormSectionComponent, 'Customer.Details')
export class CustomerDetailsSection extends BaseFormSectionComponent {
  // Custom section logic
}
```

### BaseFormComponent

For creating complete entity forms with full lifecycle management:

```typescript
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';

@Component({
  template: `
    <form>
      <mj-tab-strip>
        <mj-tab title="Details">
          <mj-form-section Entity="Customer" Section="Details" 
                          [record]="record" [EditMode]="EditMode">
          </mj-form-section>
        </mj-tab>
      </mj-tab-strip>
    </form>
  `
})
@RegisterClass(BaseFormComponent, 'Customer')
export class CustomerFormComponent extends BaseFormComponent {
  // Form-specific logic
}
```

## Core Features

### Edit Mode Management

```typescript
// Start editing
this.StartEditMode();

// Save changes (true = stop edit mode after save)
await this.SaveRecord(true);

// Cancel editing and revert changes
this.CancelEdit();

// Check if in edit mode
if (this.EditMode) {
  // Show save/cancel buttons
}
```

### Validation

```typescript
// Validate the entire form
const validationResult = this.Validate();
if (!validationResult.Success) {
  console.log('Validation errors:', validationResult.Errors);
}

// Validate pending records
const pendingResults = this.ValidatePendingRecords();
```

### Permission Checking

```typescript
// Check user permissions
if (this.UserCanEdit) {
  this.StartEditMode();
}

if (this.UserCanDelete) {
  // Show delete button
}

// Check field-level permissions
const canEditField = this.UserCanEditField('FieldName');
```

### Working with Related Records

```typescript
// Get view parameters for related entity
const viewParams = this.BuildRelationshipViewParamsByEntityName('Orders');

// Create new related record with pre-filled values
const newOrderValues = this.NewRecordValues('Orders');
newOrderValues.CustomerID = this.record.ID;

// Access pending records for transaction
const pendingOrders = this.PendingRecords.filter(r => r.Entity === 'Orders');
```

### Tab Management

```typescript
// Check active tab
if (this.IsCurrentTab('details')) {
  // Load tab-specific data
}

// Handle tab selection
public onTabSelect(e: TabEvent) {
  this.LoadTabData(e.title);
}

// Tab configuration
tabs = [
  { title: 'Details', selected: true },
  { title: 'Orders', selected: false },
  { title: 'History', selected: false }
];
```

### Favorites Management

```typescript
// Check if record is favorited
if (this.IsFavorite) {
  // Show filled star icon
}

// Toggle favorite status
if (this.IsFavorite) {
  await this.RemoveFavorite();
} else {
  await this.MakeFavorite();
}
```

### Record Dependencies

```typescript
// Check for dependencies before delete
const dependencies = await this.GetRecordDependencies();
if (dependencies.length > 0) {
  // Show warning about dependent records
  console.log(`Cannot delete: ${dependencies.length} dependent records found`);
}
```

## Advanced Usage

### Custom Field Rendering

Override default field rendering by creating custom components:

```typescript
@Component({
  selector: 'custom-field',
  template: `
    <div class="custom-field">
      <label>{{ field.DisplayName }}</label>
      <custom-control [value]="value" (change)="onChange($event)">
      </custom-control>
    </div>
  `
})
export class CustomFieldComponent {
  @Input() field: EntityFieldInfo;
  @Input() value: any;
  @Output() valueChange = new EventEmitter<any>();
}
```

### Dynamic Form Section Registration

Register form sections to be dynamically loaded:

```typescript
// In your module or component
import { RegisterClass } from '@memberjunction/global';

@RegisterClass(BaseFormSectionComponent, 'Product.Inventory')
export class ProductInventorySection extends BaseFormSectionComponent {
  // Section implementation
}

// Usage in template
<mj-form-section Entity="Product" Section="Inventory" 
                [record]="productRecord" [EditMode]="EditMode">
</mj-form-section>
```

### Transaction Management

Handle multiple related records in a single transaction:

```typescript
// Add records to pending transaction
this.AddPendingRecord(newOrderRecord, 'Orders');
this.AddPendingRecord(newOrderItemRecord, 'Order Items');

// Validate all pending records
const validationResults = this.ValidatePendingRecords();
if (validationResults.every(r => r.Success)) {
  // Save all records in transaction
  await this.SaveRecord(true);
}
```

## Module Configuration

The BaseFormsModule includes all necessary imports:

```typescript
import { BaseFormsModule } from '@memberjunction/ng-base-forms';

@NgModule({
  imports: [
    BaseFormsModule,
    // Other imports...
  ]
})
export class YourModule { }
```

## Dependencies

- **Angular Core**: v18.0.2+
- **@memberjunction/core**: Core MJ functionality
- **@memberjunction/global**: Global utilities and class factory
- **@memberjunction/ng-shared**: Shared Angular services
- **@memberjunction/ng-tabstrip**: Tab management
- **@memberjunction/ng-link-directives**: Link handling
- **@memberjunction/ng-container-directives**: Container utilities
- **@memberjunction/ng-record-changes**: Change tracking
- **@memberjunction/ng-code-editor**: Code editing support
- **@progress/kendo-angular-\***: UI components
- **ngx-markdown**: Markdown rendering
- **rxjs**: Reactive programming

## Integration with MemberJunction

This package is designed to work seamlessly with the MemberJunction ecosystem:

- **Entity Metadata**: Automatically reads field definitions, relationships, and permissions
- **Class Factory**: Uses MJ's class factory for dynamic component loading
- **Validation**: Integrates with entity-level validation rules
- **Permissions**: Respects entity and field-level permissions
- **Transactions**: Supports MJ's transaction management for related records

## Best Practices

1. **Always use the class factory** for registering custom form components
2. **Leverage MJFormField** for automatic field rendering when possible
3. **Handle validation** at both field and form levels
4. **Check permissions** before allowing user actions
5. **Use transactions** when saving multiple related records
6. **Implement proper error handling** for save operations
7. **Follow Angular lifecycle** hooks for initialization and cleanup

## Building

This package uses Angular CLI for building:

```bash
# Build the package
npm run build

# The built package will be in the dist/ directory
```

## License

ISC