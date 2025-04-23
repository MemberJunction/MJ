# @memberjunction/ng-user-view-properties

A comprehensive Angular dialog component for viewing and editing User View properties within the MemberJunction framework. This component enables users to configure how entity data is displayed in grids, including field visibility, sorting, filtering, and sharing options.

## Features

- **Complete View Configuration**: Modify all aspects of a user view through a tabbed interface
- **Field Management**: Drag-and-drop reordering of fields with visibility toggles
- **Advanced Filtering**: Supports both standard filters and AI-powered "Smart Filters"
- **Custom Sorting**: Multi-field sorting with direction controls
- **Sharing Controls**: Permission management for user views
- **Smart Filter Integration**: Reference other views and lists in Smart Filter prompts
- **Advanced Options**: Direct SQL WHERE clause editing for complex queries

## Installation

```bash
npm install @memberjunction/ng-user-view-properties
```

## Requirements

This library has the following peer dependencies:
- Angular 18.x
- @memberjunction/core
- @memberjunction/global
- @memberjunction/core-entities
- Multiple Kendo UI Angular components (Dialog, Layout, Inputs, etc.)

## Usage

### Module Import

```typescript
import { UserViewPropertiesDialogModule } from '@memberjunction/ng-user-view-properties';

@NgModule({
  imports: [
    // ... other imports
    UserViewPropertiesDialogModule
  ]
})
export class YourModule { }
```

### Basic Usage

```html
<mj-user-view-properties-dialog
  [ViewID]="currentViewId"
  (dialogClosed)="onViewPropertiesClosed($event)">
</mj-user-view-properties-dialog>
```

### Creating a New View

```typescript
@ViewChild('viewProperties') viewPropertiesDialog: UserViewPropertiesDialogComponent;

createNewView() {
  this.viewPropertiesDialog.CreateView('YourEntityName');
}
```

### Creating a View in a Specific Category

```typescript
createCategorizedView() {
  this.viewPropertiesDialog.CreateViewInCategory('YourEntityName', 'categoryId');
}
```

## API Reference

### Inputs

| Input                 | Type               | Description                                            |
|-----------------------|--------------------|--------------------------------------------------------|
| ViewID                | string \| undefined | ID of the view to edit or undefined for a new view     |
| EntityName            | string \| undefined | Entity name when creating a new view                   |
| CategoryID            | string \| null     | Optional category ID for the view                      |
| ShowPropertiesButton  | boolean            | Whether to show the properties button (default: true)  |

### Outputs

| Output        | Type           | Description                                               |
|---------------|----------------|-----------------------------------------------------------|
| dialogClosed  | EventEmitter   | Emits when dialog is closed with save status and view data |

### Methods

| Method                 | Parameters                       | Returns   | Description                                     |
|------------------------|----------------------------------|-----------|------------------------------------------------|
| CreateView             | entityName: string               | void      | Opens dialog to create a new view               |
| CreateViewInCategory   | entityName: string, viewCategoryID: string | void | Creates a view in a specific category     |
| Open                   | ViewID?: string                  | void      | Opens the dialog for editing an existing view   |
| saveProperties         | -                                | Promise<void> | Saves the current view properties           |

## Component Structure

The dialog consists of six tabbed sections:

1. **General**: Basic view properties (name and description)
2. **Fields**: Configure visible fields and their order
3. **Filters**: Set up filtering using either Smart Filters or standard filters
4. **Sorting**: Define multi-field sorting with direction control
5. **Sharing**: Manage view permissions using ResourcePermissions
6. **Advanced**: Access to SQL WHERE clauses and Smart Filter explanations

## Examples

### Complete Integration Example

```typescript
import { Component, ViewChild } from '@angular/core';
import { UserViewPropertiesDialogComponent } from '@memberjunction/ng-user-view-properties';
import { Metadata } from '@memberjunction/core';

@Component({
  selector: 'app-my-component',
  template: `
    <button kendoButton (click)="editViewProperties()">Edit View</button>
    <button kendoButton (click)="createNewView()">New View</button>
    
    <mj-user-view-properties-dialog
      #viewProperties
      [ViewID]="selectedViewId"
      (dialogClosed)="onViewPropertiesClosed($event)">
    </mj-user-view-properties-dialog>
  `
})
export class MyComponent {
  @ViewChild('viewProperties') viewPropertiesDialog: UserViewPropertiesDialogComponent;
  selectedViewId: string = 'some-view-id';
  
  editViewProperties() {
    this.viewPropertiesDialog.Open(this.selectedViewId);
  }
  
  createNewView() {
    this.viewPropertiesDialog.CreateView('Contacts');
  }
  
  onViewPropertiesClosed(event: any) {
    if (event.Saved) {
      console.log('View saved:', event.ViewEntity);
      // Refresh your view or data
    }
  }
}
```

### Handling Smart Filters

Smart Filters allow users to describe filtering requirements in natural language:

```html
<textarea 
  placeholder="Show me all contacts who have been inactive for more than 30 days and have a status of 'Lead'"
  [(ngModel)]="smartFilterPrompt">
</textarea>
```

## Notes

- The component integrates with the MemberJunction metadata system for field information
- Permissions are automatically enforced via the `UserCanEdit` property
- The dialog automatically adjusts for window resizing
- Changes are not applied until the user clicks Save