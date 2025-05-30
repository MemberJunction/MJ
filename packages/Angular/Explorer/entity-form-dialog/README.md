# @memberjunction/ng-entity-form-dialog

Angular component for displaying MemberJunction entity forms in a modal dialog, with support for both complete forms and individual form sections. This component provides a reusable dialog wrapper that dynamically loads the appropriate form component based on the entity type and configuration.

## Features

- Display entity forms in a modal dialog powered by Kendo UI
- Support for displaying complete forms or specific form sections
- Automatic save functionality with error handling
- Configurable cancel behavior with automatic change reversion
- Dynamic form component loading using MemberJunction's class factory system
- Customizable dialog dimensions and appearance
- TypeScript support with full type safety
- Integration with MemberJunction entity management system

## Installation

```bash
npm install @memberjunction/ng-entity-form-dialog
```

## Dependencies

This package requires the following peer dependencies:
- `@angular/common`: ^18.0.2
- `@angular/core`: ^18.0.2
- `@angular/forms`: ^18.0.2
- `@angular/router`: ^18.0.2

The package also depends on:
- `@memberjunction/core`: For BaseEntity support
- `@memberjunction/ng-base-forms`: For form components
- `@memberjunction/ng-shared`: For shared services
- `@progress/kendo-angular-dialog`: For dialog UI
- `@progress/kendo-angular-buttons`: For button UI

## Module Setup

Import the module in your Angular application:

```typescript
import { EntityFormDialogModule } from '@memberjunction/ng-entity-form-dialog';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    EntityFormDialogModule
  ]
})
export class YourModule { }
```

## Usage Examples

### Basic Usage

```html
<mj-entity-form-dialog
  [Record]="myEntityRecord"
  [Visible]="showDialog"
  (DialogClosed)="onDialogClosed($event)">
</mj-entity-form-dialog>
```

### Complete Form Mode

Display the entire form for an entity:

```html
<mj-entity-form-dialog
  Title="Edit User"
  [Record]="userRecord"
  Mode="complete"
  [Visible]="showDialog"
  [Width]="800"
  [Height]="600"
  [HandleSave]="true"
  [AutoRevertOnCancel]="true"
  (DialogClosed)="onDialogClosed($event)">
</mj-entity-form-dialog>
```

### Section Mode

Display only a specific section of a form:

```html
<mj-entity-form-dialog
  Title="Edit User Details"
  [Record]="userRecord"
  Mode="section"
  SectionName="details"
  [Visible]="showDialog"
  [Width]="500"
  [Height]="350"
  [HandleSave]="true"
  [AutoRevertOnCancel]="true"
  (DialogClosed)="onDialogClosed($event)">
</mj-entity-form-dialog>
```

### Component Implementation

```typescript
import { Component } from '@angular/core';
import { BaseEntity, Metadata } from '@memberjunction/core';

@Component({
  selector: 'app-user-management',
  template: `
    <button (click)="editUser()">Edit User</button>
    
    <mj-entity-form-dialog
      Title="Edit User"
      [Record]="userRecord"
      [Visible]="showDialog"
      [HandleSave]="true"
      [AutoRevertOnCancel]="true"
      (DialogClosed)="onDialogClosed($event)">
    </mj-entity-form-dialog>
  `
})
export class UserManagementComponent {
  userRecord: BaseEntity | null = null;
  showDialog = false;

  async editUser() {
    // Load user record using MemberJunction metadata system
    const md = new Metadata();
    this.userRecord = await md.GetEntityObject('Users');
    await this.userRecord.Load(userId);
    
    // Show the dialog
    this.showDialog = true;
  }

  onDialogClosed(result: 'Save' | 'Cancel') {
    if (result === 'Save') {
      // Handle successful save
      console.log('User saved successfully');
      // Refresh your UI or perform other actions
    } else {
      // Handle cancel - changes are automatically reverted if AutoRevertOnCancel is true
      console.log('Edit cancelled');
    }
    
    // Hide the dialog
    this.showDialog = false;
  }
}
```

## API Reference

### Input Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `Title` | `string` | `''` | The title displayed in the dialog header |
| `ShowSaveButton` | `boolean` | `true` | Whether to display the Save button |
| `ShowCancelButton` | `boolean` | `true` | Whether to display the Cancel button |
| `Width` | `number` | `800` | Initial dialog width in pixels |
| `Height` | `number` | `600` | Initial dialog height in pixels |
| `Mode` | `'complete' \| 'section'` | `'complete'` | Display mode - entire form or specific section |
| `SectionName` | `string` | `''` | The section name to display (required when Mode is 'section') |
| `Record` | `BaseEntity \| null` | `null` | The entity record to edit (required) |
| `HandleSave` | `boolean` | `true` | Automatically save the record when Save is clicked |
| `AutoRevertOnCancel` | `boolean` | `true` | Automatically revert changes when Cancel is clicked |
| `Visible` | `boolean` | `false` | Controls dialog visibility |

### Output Events

| Event | Type | Description |
|-------|------|-------------|
| `DialogClosed` | `EventEmitter<'Save' \| 'Cancel'>` | Emitted when the dialog is closed with the action taken |

### Public Methods

#### `ShowForm()`
Programmatically shows the form. This is automatically called when the `Visible` property is set to `true`.

```typescript
@ViewChild(EntityFormDialogComponent) formDialog!: EntityFormDialogComponent;

showFormProgrammatically() {
  this.formDialog.ShowForm();
}
```

#### `CloseWindow(status: 'Save' | 'Cancel')`
Programmatically closes the dialog with the specified status.

```typescript
closeDialogProgrammatically() {
  this.formDialog.CloseWindow('Cancel');
}
```

## Form Component Registration

The dialog dynamically loads form components based on the entity type and mode. These components must be registered with MemberJunction's class factory system:

### For Complete Mode
Register a subclass of `BaseFormComponent` with the entity name:
```typescript
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Users')
export class UserFormComponent extends BaseFormComponent {
  // Your form implementation
}
```

### For Section Mode
Register a subclass of `BaseFormSectionComponent` with the pattern `EntityName.SectionName`:
```typescript
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormSectionComponent, 'Users.details')
export class UserDetailsSectionComponent extends BaseFormSectionComponent {
  // Your section implementation
}
```

## Error Handling

The component includes built-in error handling for save operations:

- If `HandleSave` is `true` and the save operation fails, the component will:
  1. Display an error notification using `SharedService`
  2. Automatically revert the changes to prevent data corruption
  3. Still emit the `DialogClosed` event with 'Save' status

## Best Practices

1. **Always provide a Record**: The `Record` property is required and must be a valid BaseEntity instance
2. **Handle the DialogClosed event**: Always implement a handler to manage dialog visibility
3. **Use proper entity loading**: Load entities using MemberJunction's Metadata system
4. **Register form components**: Ensure your custom form components are properly registered
5. **Consider dialog dimensions**: Adjust `Width` and `Height` based on your form complexity

## Integration with Other MemberJunction Packages

This package integrates seamlessly with:
- `@memberjunction/core`: For entity management
- `@memberjunction/ng-base-forms`: For form component base classes
- `@memberjunction/ng-shared`: For notification services
- `@memberjunction/global`: For class factory registration

## Building

To build the package:
```bash
npm run build
```

The package uses Angular's `ngc` compiler and outputs to the `dist` directory.