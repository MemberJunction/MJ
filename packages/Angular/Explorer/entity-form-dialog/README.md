# @memberjunction/ng-entity-form-dialog

Angular component for displaying MemberJunction entity forms in a dialog, with support for both complete forms and individual form sections.

## Features

- Display entity forms in a modal dialog
- Support for displaying the complete form or specific sections
- Configurable save and cancel behavior
- Automatic form component loading based on entity type
- Customizable dialog dimensions and appearance
- Integration with MemberJunction entity management

## Installation

```bash
npm install @memberjunction/ng-entity-form-dialog
```

## Usage

Import the module in your application:

```typescript
import { EntityFormDialogModule } from '@memberjunction/ng-entity-form-dialog';

@NgModule({
  imports: [
    // ...
    EntityFormDialogModule
  ]
})
export class YourModule { }
```

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

## Input Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| Title | string | '' | Dialog title |
| ShowSaveButton | boolean | true | Whether to show the Save button |
| ShowCancelButton | boolean | true | Whether to show the Cancel button |
| Width | number | 800 | Dialog width in pixels |
| Height | number | 600 | Dialog height in pixels |
| Mode | 'complete' \| 'section' | 'complete' | Whether to show the entire form or a specific section |
| SectionName | string | '' | The section name to display (when Mode is 'section') |
| Record | BaseEntity | null | The entity record to edit (required) |
| HandleSave | boolean | true | Whether to automatically save the record on Save click |
| AutoRevertOnCancel | boolean | true | Whether to automatically revert changes on Cancel click |
| Visible | boolean | false | Controls dialog visibility |

## Output Events

| Event | Type | Description |
|-------|------|-------------|
| DialogClosed | EventEmitter<'Save' \| 'Cancel'> | Emitted when the dialog is closed |

## Handling Dialog Close

```typescript
onDialogClosed(result: 'Save' | 'Cancel') {
  if (result === 'Save') {
    // Handle successful save
    console.log('Record saved');
  } else {
    // Handle cancel
    console.log('Edit cancelled');
  }
  
  // Hide the dialog
  this.showDialog = false;
}
```

## Dynamic Form Loading

The component automatically loads the appropriate form component based on the entity type:

- In 'complete' mode, it loads a subclass of `BaseFormComponent` for the entity
- In 'section' mode, it loads a subclass of `BaseFormSectionComponent` for the entity and section

These components must be registered with the MemberJunction class factory system.