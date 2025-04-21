# Generic Dialog Component

A flexible and customizable dialog component for Angular applications in the MemberJunction framework. This component provides a consistent way to create modal dialogs with standard features like OK/Cancel buttons and custom action slots.

## Features

- **Customizable Content**: Easily insert any content inside the dialog body
- **Flexible Button Options**: Show/hide standard OK and Cancel buttons
- **Custom Actions**: Add custom buttons and actions through content projection
- **Responsive Design**: Configure width and height in pixels or percentages
- **Event Handling**: Events for dialog closure and data refreshing
- **Simple Integration**: Easy to use in any Angular component

## Installation

```bash
npm install @memberjunction/ng-generic-dialog
```

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

## API Reference

### Inputs

- `DialogTitle`: string - Title displayed in the dialog header (default: 'Default Title')
- `DialogWidth`: string - Width of the dialog (default: '700px')
- `DialogHeight`: string - Height of the dialog (default: '450px')
- `ShowOKButton`: boolean - Whether to show the OK button (default: true)
- `OKButtonText`: string - Text for the OK button (default: 'OK')
- `ShowCancelButton`: boolean - Whether to show the Cancel button (default: true)
- `CancelButtonText`: string - Text for the Cancel button (default: 'Cancel')
- `DialogVisible`: boolean - Controls the visibility of the dialog

### Outputs

- `DialogClosed`: EventEmitter<boolean> - Emitted when the dialog is closed (true if OK, false if Cancel)
- `RefreshData`: EventEmitter<void> - Emitted when the dialog needs to refresh its content data

### Methods

- `HandleOKClick()`: Programmatically trigger the OK button click
- `HandleCancelClick()`: Programmatically trigger the Cancel button click

### Content Projection

- Default content slot: Content displayed in the dialog body
- `custom-actions` slot: Projected into the dialog action area for custom buttons

## Styling

The component uses Kendo UI dialog and button components, which follow the Kendo UI theming system. You can apply your own styles to the content within the dialog.

## Dependencies

- `@progress/kendo-angular-dialog`: For the dialog component
- `@progress/kendo-angular-buttons`: For the buttons