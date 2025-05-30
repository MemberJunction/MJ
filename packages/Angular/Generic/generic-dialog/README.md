# @memberjunction/ng-generic-dialog

A flexible and customizable dialog component for Angular applications in the MemberJunction framework. This component provides a consistent way to create modal dialogs with standard features like OK/Cancel buttons and custom action slots.

## Overview

The `@memberjunction/ng-generic-dialog` package provides a reusable Angular dialog component built on top of Kendo UI's dialog and button components. It offers a standardized way to create modals with configurable content, actions, and behavior while maintaining consistency across your MemberJunction application.

## Features

- **Customizable Content**: Easily insert any content inside the dialog body using content projection
- **Flexible Button Options**: Show/hide standard OK and Cancel buttons with customizable text
- **Custom Actions**: Add custom buttons and actions through the `custom-actions` content projection slot
- **Responsive Design**: Configure width and height in pixels or percentages
- **Event Handling**: Built-in events for dialog closure and data refresh lifecycle
- **Auto-refresh**: Automatically triggers data refresh when dialog becomes visible
- **Kendo UI Integration**: Seamlessly integrates with Kendo UI theming system
- **TypeScript Support**: Full TypeScript support with proper typing

## Installation

```bash
npm install @memberjunction/ng-generic-dialog
```

### Peer Dependencies

This package requires the following peer dependencies:

- `@angular/common`: ^18.0.2
- `@angular/core`: ^18.0.2
- `@progress/kendo-angular-buttons`: ^16.2.0
- `@progress/kendo-angular-dialog`: ^16.2.0

## Usage

### Import the Module

```typescript
import { GenericDialogModule } from '@memberjunction/ng-generic-dialog';

@NgModule({
  imports: [
    GenericDialogModule,
    // other imports
  ],
  // ...
})
export class YourModule { }
```

### Basic Component Usage

```html
<!-- Simple dialog with default buttons -->
<mj-generic-dialog
  DialogTitle="Confirmation"
  [DialogVisible]="showDialog"
  (DialogClosed)="onDialogClosed($event)">
  
  <div>
    Are you sure you want to proceed with this action?
  </div>
</mj-generic-dialog>
```

### With Custom Actions

```html
<!-- Dialog with custom action buttons -->
<mj-generic-dialog
  DialogTitle="Advanced Options"
  DialogWidth="800px"
  DialogHeight="500px"
  [DialogVisible]="showDialog"
  [ShowOKButton]="false"
  [ShowCancelButton]="true"
  CancelButtonText="Close"
  (DialogClosed)="onDialogClosed($event)">
  
  <div>
    <p>Configure the advanced settings below:</p>
    <!-- Your form or content here -->
    <form>
      <!-- Form fields -->
    </form>
  </div>
  
  <div custom-actions>
    <button kendoButton (click)="saveSettings()" themeColor="primary">Save Settings</button>
    <button kendoButton (click)="applySettings()" themeColor="info">Apply</button>
    <button kendoButton (click)="resetSettings()">Reset</button>
  </div>
</mj-generic-dialog>
```

### TypeScript Component Example

```typescript
import { Component } from '@angular/core';

@Component({
  selector: 'app-settings-dialog',
  template: `
    <button kendoButton (click)="openDialog()">Open Settings</button>
    
    <mj-generic-dialog
      DialogTitle="User Settings"
      DialogWidth="600px"
      DialogHeight="400px"
      [DialogVisible]="dialogVisible"
      [ShowOKButton]="true"
      [ShowCancelButton]="true"
      OKButtonText="Save Changes"
      CancelButtonText="Discard"
      (DialogClosed)="onDialogClosed($event)"
      (RefreshData)="refreshSettings()">
      
      <div class="settings-form">
        <h3>Edit Your Settings</h3>
        
        <div class="form-group">
          <label>Display Name:</label>
          <input kendoTextBox [(ngModel)]="settings.displayName" />
        </div>
        
        <div class="form-group">
          <label>Email Notifications:</label>
          <input kendoCheckBox [(ngModel)]="settings.emailNotifications" />
        </div>
        
        <div class="form-group">
          <label>Theme:</label>
          <kendo-dropdownlist
            [data]="themeOptions"
            [(ngModel)]="settings.theme">
          </kendo-dropdownlist>
        </div>
      </div>
    </mj-generic-dialog>
  `
})
export class SettingsDialogComponent {
  dialogVisible = false;
  
  settings = {
    displayName: 'User',
    emailNotifications: true,
    theme: 'light'
  };
  
  themeOptions = ['light', 'dark', 'blue', 'high-contrast'];
  
  openDialog() {
    this.dialogVisible = true;
  }
  
  onDialogClosed(confirmed: boolean) {
    this.dialogVisible = false;
    
    if (confirmed) {
      console.log('Saving settings:', this.settings);
      // Save the settings
    } else {
      console.log('Discarding changes');
      // Reset settings to original values
    }
  }
  
  refreshSettings() {
    console.log('Refreshing settings data');
    // Load the latest settings
  }
}
```

## Component API

### Selector
`mj-generic-dialog`

### Inputs

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `DialogTitle` | `string` | `'Default Title'` | Title displayed in the dialog header |
| `DialogWidth` | `string` | `'700px'` | Width of the dialog in pixels or percentage |
| `DialogHeight` | `string` | `'450px'` | Height of the dialog in pixels or percentage |
| `DialogVisible` | `boolean` | `false` | Controls the visibility of the dialog. When set to `true`, triggers `RefreshData` event |
| `ShowOKButton` | `boolean` | `true` | Whether to show the OK button |
| `OKButtonText` | `string` | `'OK'` | Text displayed on the OK button |
| `ShowCancelButton` | `boolean` | `true` | Whether to show the Cancel button |
| `CancelButtonText` | `string` | `'Cancel'` | Text displayed on the Cancel button |

### Outputs

| Event | Type | Description |
|-------|------|-------------|
| `DialogClosed` | `EventEmitter<boolean>` | Emitted when the dialog is closed. Returns `true` if closed via OK button, `false` if closed via Cancel button or X |
| `RefreshData` | `EventEmitter<void>` | Emitted when the dialog becomes visible, allowing parent components to refresh data |

### Public Methods

| Method | Description |
|--------|-------------|
| `HandleOKClick()` | Programmatically trigger the OK button click. Closes dialog and emits `DialogClosed` with `true` |
| `HandleCancelClick()` | Programmatically trigger the Cancel button click. Closes dialog and emits `DialogClosed` with `false` |

### Content Projection Slots

- **Default slot**: Content displayed in the dialog body
- **`custom-actions` slot**: Content projected into the dialog action area for custom buttons. Use the `custom-actions` attribute on any element to project it into this slot

## Advanced Usage

### Programmatic Control

You can control the dialog programmatically from the parent component:

```typescript
import { Component, ViewChild } from '@angular/core';
import { GenericDialogComponent } from '@memberjunction/ng-generic-dialog';

@Component({
  selector: 'app-advanced-dialog',
  template: `
    <mj-generic-dialog #myDialog
      DialogTitle="Programmatic Control"
      [DialogVisible]="isDialogVisible"
      (DialogClosed)="onDialogClosed($event)">
      <div>Dialog content here</div>
    </mj-generic-dialog>
    
    <button (click)="openDialog()">Open Dialog</button>
    <button (click)="closeDialogProgrammatically(true)">Close with OK</button>
    <button (click)="closeDialogProgrammatically(false)">Close with Cancel</button>
  `
})
export class AdvancedDialogComponent {
  @ViewChild('myDialog') dialog!: GenericDialogComponent;
  isDialogVisible = false;
  
  openDialog() {
    this.isDialogVisible = true;
  }
  
  closeDialogProgrammatically(withOK: boolean) {
    if (withOK) {
      this.dialog.HandleOKClick();
    } else {
      this.dialog.HandleCancelClick();
    }
  }
  
  onDialogClosed(confirmed: boolean) {
    console.log('Dialog closed with:', confirmed ? 'OK' : 'Cancel');
  }
}
```

### Data Refresh Pattern

The dialog automatically emits a `RefreshData` event when it becomes visible. Use this to load fresh data:

```typescript
@Component({
  selector: 'app-data-dialog',
  template: `
    <mj-generic-dialog
      DialogTitle="User Details"
      [DialogVisible]="showUserDialog"
      (DialogClosed)="onDialogClosed($event)"
      (RefreshData)="loadUserData()">
      
      <div *ngIf="userData">
        <p>Name: {{ userData.name }}</p>
        <p>Email: {{ userData.email }}</p>
        <p>Last Updated: {{ userData.lastUpdated }}</p>
      </div>
      
      <div *ngIf="loading">Loading...</div>
    </mj-generic-dialog>
  `
})
export class DataDialogComponent {
  showUserDialog = false;
  userData: any = null;
  loading = false;
  
  loadUserData() {
    this.loading = true;
    // Simulate API call
    setTimeout(() => {
      this.userData = {
        name: 'John Doe',
        email: 'john@example.com',
        lastUpdated: new Date().toLocaleString()
      };
      this.loading = false;
    }, 1000);
  }
  
  onDialogClosed(confirmed: boolean) {
    this.showUserDialog = false;
    if (confirmed) {
      console.log('Saving user data...');
    }
  }
}
```

## Styling

The component uses Kendo UI dialog and button components, which inherit the active Kendo theme. You can apply custom styles to the content within the dialog using standard CSS or Angular styling approaches.

### Custom Styling Example

```css
/* In your component styles */
:host ::ng-deep .k-dialog-title {
  background-color: #3f51b5;
  color: white;
}

:host ::ng-deep .k-dialog-content {
  padding: 20px;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.form-group {
  display: flex;
  align-items: center;
  gap: 10px;
}
```

## Integration with MemberJunction

This dialog component is designed to work seamlessly within the MemberJunction framework:

- **Consistent UI**: Follows MemberJunction's UI patterns and Kendo theme
- **TypeScript Support**: Full type safety for all properties and events
- **Angular Best Practices**: Uses OnPush change detection strategy compatible patterns
- **Accessibility**: Inherits Kendo UI's accessibility features

## Common Patterns

### Confirmation Dialog
```typescript
<mj-generic-dialog
  DialogTitle="Confirm Delete"
  DialogWidth="400px"
  DialogHeight="200px"
  [DialogVisible]="showDeleteConfirm"
  OKButtonText="Delete"
  CancelButtonText="Keep"
  (DialogClosed)="handleDeleteConfirmation($event)">
  <div>
    <p>Are you sure you want to delete this item?</p>
    <p><strong>This action cannot be undone.</strong></p>
  </div>
</mj-generic-dialog>
```

### Form Dialog
```typescript
<mj-generic-dialog
  DialogTitle="Edit User"
  DialogWidth="600px"
  [DialogVisible]="showEditDialog"
  [ShowOKButton]="false"
  [ShowCancelButton]="false"
  (RefreshData)="loadUserForEdit()">
  
  <form [formGroup]="userForm">
    <!-- Form fields -->
  </form>
  
  <div custom-actions>
    <button kendoButton 
            [disabled]="!userForm.valid" 
            (click)="saveUser()" 
            themeColor="primary">
      Save Changes
    </button>
    <button kendoButton (click)="cancelEdit()">Cancel</button>
  </div>
</mj-generic-dialog>
```

## Troubleshooting

### Dialog Not Showing
- Ensure `DialogVisible` is properly bound to a boolean property
- Check that the module is imported correctly
- Verify Kendo UI dependencies are installed

### Custom Actions Not Appearing
- Use the `custom-actions` attribute on the container element
- Ensure the element is a direct child of `mj-generic-dialog`

### Dialog Closes Immediately
- Check for any code that might be setting `DialogVisible` to false
- Ensure event handlers aren't causing unintended state changes

## Version History

See [CHANGELOG.md](./CHANGELOG.md) for detailed version history.

## License

This package is part of the MemberJunction framework and follows the same license terms.