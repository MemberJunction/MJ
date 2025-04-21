# @memberjunction/ng-base-forms

Base classes for creating entity forms in MemberJunction Angular applications, providing core functionality for form management, validation, and data handling.

## Features

- Abstract base classes for forms, form sections, and record components
- Support for edit mode and validation
- Transaction management for saving related records
- Integration with MemberJunction metadata and entity framework
- Tab management and responsive design
- Permission checking and user authorization
- Support for favorites and record dependencies
- Form event handling and coordination

## Installation

```bash
npm install @memberjunction/ng-base-forms
```

## Usage

This package provides several base classes that form the foundation for MemberJunction entity forms:

### BaseRecordComponent

The most basic component for working with entity records:

```typescript
import { BaseRecordComponent } from '@memberjunction/ng-base-forms';

@Component({
  // ...
})
export class YourComponent extends BaseRecordComponent {
  // Your record component implementation
}
```

### BaseFormSectionComponent

For creating form sections that can be used with entity forms:

```typescript
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';

@Component({
  // ...
})
@RegisterClass(BaseFormSectionComponent, 'YourEntity.SectionName')
export class YourFormSectionComponent extends BaseFormSectionComponent {
  // Your form section implementation
}
```

### BaseFormComponent

For creating complete entity forms:

```typescript
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';

@Component({
  // ...
})
@RegisterClass(BaseFormComponent, 'YourEntity')
export class YourFormComponent extends BaseFormComponent {
  // Your form implementation
}
```

## Core Features

### Edit Mode

Manage form edit states:

```typescript
// Start editing
this.StartEditMode();

// Save changes
await this.SaveRecord(true); // true to stop edit mode after save

// Cancel editing
this.CancelEdit();
```

### Validation

Validate forms and handle validation errors:

```typescript
const validationResult = this.Validate();
if (!validationResult.Success) {
  // Handle validation errors
  console.log(validationResult.Errors);
}
```

### Permission Checking

Check user permissions for operations:

```typescript
if (this.UserCanEdit) {
  // Show edit controls
}

if (this.UserCanDelete) {
  // Show delete controls
}
```

### Related Records

Work with related entities:

```typescript
// Get view parameters for a related entity
const viewParams = this.BuildRelationshipViewParamsByEntityName('RelatedEntity');

// Create new related records with pre-filled values
const newValues = this.NewRecordValues('RelatedEntity');
```

### Tabbed Interface

Manage tabs in forms:

```typescript
// Check if a tab is active
if (this.IsCurrentTab('details')) {
  // Perform tab-specific actions
}

// Respond to tab selection
public onTabSelect(e: TabEvent) {
  // Handle tab selection
}
```

## Advanced Features

### Pending Records

Manage related records in a transaction:

```typescript
// Access pending records
const pendingRecords = this.PendingRecords;

// Process records before save
this.PopulatePendingRecords();

// Validate all pending records
const validationResults = this.ValidatePendingRecords();
```

### Favorites

Manage record favorites:

```typescript
// Check if record is a favorite
if (this.IsFavorite) {
  // Show "Remove from favorites" option
}

// Add/remove from favorites
await this.MakeFavorite();
await this.RemoveFavorite();
```

### Record Dependencies

View record dependencies:

```typescript
// Show dependencies
const dependencies = await this.GetRecordDependencies();
```

## Integration

This package integrates with other MemberJunction components:
- Uses `@memberjunction/ng-base-types` for event handling
- Uses `@memberjunction/ng-shared` for shared services
- Uses `@memberjunction/ng-tabstrip` for tab management
- Works with `@memberjunction/core` entities and metadata