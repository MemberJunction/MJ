# @memberjunction/ng-form-toolbar

The `@memberjunction/ng-form-toolbar` package provides a consistent toolbar component for forms in MemberJunction Explorer applications. It handles standard form operations like editing, saving, deleting records, and provides additional functionality such as favoriting, viewing history, and adding records to lists.

## Features

- Context-aware button display based on form state (view/edit mode)
- Save functionality with visual feedback during save operations
- Delete confirmation with dependency checking
- Record history viewing (for trackable entities)
- Ability to add records to lists
- Skip AI chat integration for record-based conversations
- Favorite toggling for quick access to frequently used records
- Consistent UI across all MemberJunction forms
- Permission-based button visibility

## Installation

```bash
npm install @memberjunction/ng-form-toolbar
```

## Requirements

- Angular 18+
- @memberjunction/core
- @memberjunction/ng-base-forms
- @memberjunction/ng-shared
- @memberjunction/ng-ask-skip
- @memberjunction/ng-record-changes
- @progress/kendo-angular-buttons
- @progress/kendo-angular-dialog

## Usage

### Basic Setup

First, import the FormToolbarModule in your module:

```typescript
import { FormToolbarModule } from '@memberjunction/ng-form-toolbar';

@NgModule({
  imports: [
    // other imports...
    FormToolbarModule
  ],
})
export class YourModule { }
```

### Adding the Toolbar to a Form

The toolbar is designed to work with forms that extend `BaseFormComponent`. Simply add it to your form template:

```html
<mj-form-toolbar [form]="this"></mj-form-toolbar>
```

In your component class:

```typescript
import { Component } from '@angular/core';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { MyEntityEntity } from '@memberjunction/core-entities';

@Component({
  selector: 'app-my-entity-form',
  templateUrl: './my-entity-form.component.html',
})
export class MyEntityFormComponent extends BaseFormComponent {
  public record!: MyEntityEntity;
  
  // Your form implementation...
}
```

### Customizing the Toolbar

You can control whether certain features are displayed:

```html
<mj-form-toolbar 
  [form]="this"
  [ShowSkipChatButton]="false">
</mj-form-toolbar>
```

## API Reference

### FormToolbarComponent

#### Inputs

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `form` | `BaseFormComponent` | (required) | The form component that this toolbar controls |
| `ShowSkipChatButton` | `boolean` | `true` | Whether to show the Skip chat button |

#### Properties

| Name | Type | Description |
|------|------|-------------|
| `Disabled` | `boolean` | Global setting to disable the toolbar |
| `CurrentlyDisabled` | `boolean` | Whether the toolbar is currently disabled |

#### Methods

| Name | Parameters | Return Type | Description |
|------|------------|-------------|-------------|
| `saveExistingRecord` | `event: MouseEvent` | `Promise<void>` | Saves the current record with visual feedback |
| `ShowSkipChat` | None | `void` | Opens the Skip chat dialog for the current record |
| `toggleDeleteDialog` | `show: boolean` | `void` | Shows or hides the delete confirmation dialog |
| `toggleListDialog` | `show: boolean` | `Promise<void>` | Shows or hides the add to list dialog |
| `addRecordToList` | `list: ListEntity` | `Promise<void>` | Adds the current record to the specified list |
| `deleteRecord` | None | `Promise<void>` | Deletes the current record after confirmation |

## Toolbar States

The toolbar adapts to different form states:

### View Mode
When the form is in view mode, the toolbar displays:
- Edit button (if user has edit permission)
- Delete button (if user has delete permission)
- Favorite/Unfavorite toggle
- Record history button (if entity tracks changes)
- Skip chat button (if enabled)
- Add to list button

### Edit Mode
When the form is in edit mode, the toolbar displays:
- Save button
- Cancel button (for existing records)
- Changes button (when there are unsaved changes)

## Styling

The toolbar uses the following CSS classes that can be customized:

- `.toolbar-container`: Main container for the toolbar
- `.disabled`: Applied when the toolbar is disabled
- `.button-text`: Text labels in buttons
- `.btn-no-border`: Button style without border
- `.list-item`, `.list-text`: Styles for list dialog items
- `.form-toolbar-status-message`: Style for the save status message

## Dependencies

- @angular/common
- @angular/core
- @angular/forms
- @angular/router
- @memberjunction/global
- @memberjunction/core
- @memberjunction/ng-shared
- @memberjunction/ng-base-forms
- @memberjunction/ng-ask-skip
- @memberjunction/ng-record-changes
- @progress/kendo-angular-buttons
- @progress/kendo-angular-dialog
- ngx-markdown