# @memberjunction/ng-form-toolbar

The `@memberjunction/ng-form-toolbar` package provides a consistent, feature-rich toolbar component for forms in MemberJunction Explorer applications. It handles standard form operations like editing, saving, and deleting records, while providing advanced functionality such as favorites management, record history viewing, AI-powered chat integration, and list management.

## Features

- **Context-aware button display** - Dynamically shows/hides buttons based on form state (view/edit mode)
- **Save with real-time feedback** - Visual status updates during save operations with elapsed time tracking
- **Smart delete functionality** - Dependency checking before deletion with confirmation dialog
- **Record history tracking** - View change history for entities with tracking enabled
- **Skip AI chat integration** - Discuss records with AI assistant directly from the toolbar
- **Favorites management** - Mark frequently accessed records as favorites for quick access
- **List management** - Add records to existing lists for organization
- **Permission-based visibility** - Buttons respect user permissions (edit, delete, etc.)
- **Server update notifications** - Real-time status updates from server during long operations
- **Consistent UX** - Unified toolbar experience across all MemberJunction forms

## Installation

```bash
npm install @memberjunction/ng-form-toolbar
```

## Requirements

- Angular 21+
- @memberjunction/global ^2.43.0
- @memberjunction/core ^2.43.0
- @memberjunction/ng-shared ^2.43.0
- @memberjunction/ng-base-forms ^2.43.0
- @memberjunction/ng-ask-skip ^2.43.0
- @memberjunction/ng-record-changes ^2.43.0
- @memberjunction/ng-container-directives ^2.43.0
- @progress/kendo-angular-buttons ^16.2.0
- @progress/kendo-angular-dialog ^16.2.0
- @memberjunction/ng-markdown ^2.125.0

## Usage

### Basic Setup

First, import the `FormToolbarModule` in your Angular module:

```typescript
import { FormToolbarModule } from '@memberjunction/ng-form-toolbar';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    // ... other imports
    FormToolbarModule
  ],
  // ... rest of module configuration
})
export class YourModule { }
```

### Adding the Toolbar to a Form

The toolbar is designed to work seamlessly with forms that extend `BaseFormComponent`. Add it to your form template:

```html
<!-- Basic usage -->
<mj-form-toolbar [form]="this"></mj-form-toolbar>

<!-- Your form content -->
<form>
  <!-- Form fields and controls -->
</form>
```

Example component implementation:

```typescript
import { Component } from '@angular/core';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserEntity } from '@memberjunction/core-entities';

@Component({
  selector: 'app-user-form',
  templateUrl: './user-form.component.html',
  styleUrls: ['./user-form.component.css']
})
export class UserFormComponent extends BaseFormComponent {
  public record!: UserEntity;
  
  public async ngOnInit() {
    await super.ngOnInit();
    // Additional initialization logic
  }
  
  // Override BaseFormComponent methods as needed
}
```

### Customizing the Toolbar

Control which features are displayed:

```html
<!-- Hide Skip chat button -->
<mj-form-toolbar 
  [form]="this"
  [ShowSkipChatButton]="false">
</mj-form-toolbar>

<!-- Disable toolbar programmatically -->
<mj-form-toolbar 
  [form]="this"
  [Disabled]="isProcessing">
</mj-form-toolbar>
```

## API Reference

### FormToolbarComponent

#### Inputs

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `form` | `BaseFormComponent` | Required | The form component instance that this toolbar controls |
| `ShowSkipChatButton` | `boolean` | `true` | Controls visibility of the Skip AI chat button |

#### Properties

| Name | Type | Description |
|------|------|-------------|
| `Disabled` | `boolean` | Global setting to enable/disable the entire toolbar |
| `CurrentlyDisabled` | `boolean` | Read-only property indicating if toolbar is currently disabled |
| `listDialogVisible` | `boolean` | Controls visibility of the add-to-list dialog |
| `showListDialogLoader` | `boolean` | Shows loading indicator in list dialog |
| `availableLists` | `ListEntity[]` | Lists available for adding the current record |
| `selectedLists` | `ListEntity[]` | Currently selected lists in the dialog |

#### Methods

| Name | Parameters | Return Type | Description |
|------|------------|-------------|-------------|
| `saveExistingRecord` | `event: MouseEvent` | `Promise<void>` | Saves the current record with visual feedback and progress tracking |
| `ShowSkipChat` | None | `void` | Toggles the Skip AI chat dialog for the current record |
| `toggleDeleteDialog` | `show: boolean` | `void` | Shows or hides the delete confirmation dialog |
| `toggleListDialog` | `show: boolean` | `Promise<void>` | Shows or hides the add-to-list dialog and loads available lists |
| `addRecordToList` | `list: ListEntity` | `Promise<void>` | Adds the current record to the specified list |
| `deleteRecord` | None | `Promise<void>` | Deletes the current record after dependency check and confirmation |

## Toolbar States and Behavior

### View Mode
When the form is in view mode (`form.EditMode === false`), the toolbar displays:

- **Edit button** 🖊️ - Visible if user has edit permission (`form.UserCanEdit`)
- **Delete button** 🗑️ - Visible if user has delete permission (`form.UserCanDelete`)
- **Favorite/Unfavorite toggle** ⭐ - Toggle between filled/outlined star based on favorite status
- **History button** 🕐 - Visible only if entity tracks changes (`EntityInfo.TrackRecordChanges`)
- **Skip chat button** 💬 - Visible if `ShowSkipChatButton` is true
- **Add to list button** ➕ - Always visible in view mode

### Edit Mode
When the form is in edit mode (`form.EditMode === true`), the toolbar displays:

- **Save button** 💾 - Always visible with "Save" label
- **Cancel button** ↩️ - Only visible for existing records (not new records)
- **Changes button** 📋 - Only visible when record has unsaved changes (`record.Dirty`)

### Save Operation Features

During save operations, the toolbar provides enhanced user feedback:

1. **Visual Feedback**: Form opacity reduced to 75% and interactions disabled
2. **Progress Tracking**: Real-time elapsed time counter (updates every 100ms)
3. **Server Updates**: Displays server status messages via MJGlobal event system
4. **Automatic Cleanup**: Restores form state after save completion

Example save feedback display:
```
Saving... (3 secs)
Processing entity relationships...
```

## Styling and Customization

### CSS Classes

The component provides several CSS classes for customization:

```css
/* Main container */
.toolbar-container {
  border-bottom: solid 1px lightgray;
  padding-bottom: 10px;
  margin-bottom: 5px;
}

/* Button spacing */
.toolbar-container button {
  margin-right: 7px;
}

/* Text spacing in buttons */
.toolbar-container .button-text {
  margin-left: 7px;
}

/* Disabled state */
.toolbar-container.disabled {
  pointer-events: none;
  opacity: 0.8;
}

/* Save status message */
.form-toolbar-status-message {
  background: #f0f0f0;
  padding: 15px;
  border-radius: 5px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
  color: #1d7032;
  font-weight: bold;
  text-align: center;
}

/* List dialog items */
.list-item {
  display: flex;
  justify-content: space-between;
  padding-bottom: 5px;
  align-items: center;
}
```

### Icons

The toolbar uses Font Awesome icons for consistent visual language:

- Edit: `fa-pen-to-square`
- Delete: `fa-trash-can`
- Favorite (filled): `fa-solid fa-star`
- Favorite (outline): `fa-regular fa-star`
- Save: `fa-floppy-disk`
- Cancel: `fa-rotate-left`
- Changes: `fa-clipboard-list`
- History: `fa-business-time`
- Chat: `fa-comment-dots`
- Add: `fa-plus`

## Integration with MemberJunction Services

### Event System Integration

The toolbar integrates with MJGlobal event system for:

- **Server status updates**: Listens for `EventCodes.PushStatusUpdates` during save operations
- **Tab management**: Raises `EventCodes.CloseCurrentTab` after successful deletion

### Skip Chat Integration

When Skip chat is enabled, the toolbar embeds the `mj-skip-chat-with-record-window` component:

```html
<mj-skip-chat-with-record-window
  [LinkedEntityID]="form.EntityInfo.ID"
  [LinkedEntityPrimaryKey]="LinkedEntityPrimaryKey"
  [WindowOpened]="_skipChatDialogVisible"
  (WindowClosed)="ShowSkipChat()">
</mj-skip-chat-with-record-window>
```

### Record Changes Integration

For entities with change tracking enabled:

```html
<mj-record-changes 
  [record]="form.record" 
  (dialogClosed)="form.handleHistoryDialog()">
</mj-record-changes>
```

## Advanced Usage Examples

### Custom Toolbar with Conditional Features

```typescript
@Component({
  template: `
    <mj-form-toolbar 
      [form]="this"
      [ShowSkipChatButton]="shouldShowChat">
    </mj-form-toolbar>
  `
})
export class CustomFormComponent extends BaseFormComponent {
  get shouldShowChat(): boolean {
    // Show chat only for certain record types or user roles
    return this.record?.Status === 'Active' && 
           this.currentUser.hasRole('Manager');
  }
}
```

### Handling Toolbar Events

```typescript
export class FormWithToolbarComponent extends BaseFormComponent {
  async ngOnInit() {
    await super.ngOnInit();
    
    // Listen for toolbar-related events
    MJGlobal.Instance.GetEventListener(false).subscribe((event: MJEvent) => {
      if (event.eventCode === EventCodes.CloseCurrentTab) {
        // Handle tab closure after deletion
        this.handleTabClosure();
      }
    });
  }
}
```

### Programmatic Toolbar Control

```typescript
export class AdvancedFormComponent extends BaseFormComponent {
  @ViewChild(FormToolbarComponent) toolbar!: FormToolbarComponent;
  
  async performBulkOperation() {
    // Disable toolbar during bulk operations
    this.toolbar.Disabled = true;
    
    try {
      await this.processBulkData();
    } finally {
      this.toolbar.Disabled = false;
    }
  }
  
  // Programmatically show Skip chat
  openAIAssistant() {
    this.toolbar.ShowSkipChat();
  }
}
```

## Error Handling

The toolbar implements comprehensive error handling:

- **Save errors**: Displays error notifications with server messages when available
- **Delete errors**: Shows appropriate messages for dependency conflicts
- **List operations**: Notifies users of success/failure when adding to lists
- **Network errors**: Gracefully handles connection issues with user-friendly messages

## Best Practices

1. **Always pass the form reference**: The toolbar requires a valid `BaseFormComponent` instance
2. **Handle permissions properly**: Ensure your form correctly implements permission checks
3. **Test save operations**: Verify your entity's save logic works with the toolbar's feedback system
4. **Consider mobile responsiveness**: The toolbar works on mobile but may need custom styling
5. **Use consistent icons**: Follow MemberJunction's icon conventions when extending

## Troubleshooting

### Common Issues

1. **Buttons not appearing**: Check that your form properly extends `BaseFormComponent` and implements required properties
2. **Save feedback not showing**: Ensure your form's parent element is properly structured
3. **Skip chat not working**: Verify `@memberjunction/ng-ask-skip` is properly installed and configured
4. **History not available**: Confirm the entity has `TrackRecordChanges` enabled in metadata

### Debug Mode

Enable debug logging by adding to your component:

```typescript
ngOnInit() {
  // Log toolbar state changes
  console.log('Toolbar disabled:', this.toolbar.CurrentlyDisabled);
  console.log('Form edit mode:', this.form.EditMode);
  console.log('User permissions:', {
    canEdit: this.form.UserCanEdit,
    canDelete: this.form.UserCanDelete
  });
}
```

## Version History

- **2.43.0** - Current version with full feature set
- **2.42.0** - Added server status update integration
- **2.41.0** - Introduced real-time save progress tracking
- **2.40.0** - Added list management functionality

## Contributing

When contributing to this package:

1. Follow the MemberJunction coding standards
2. Ensure all buttons use appropriate Font Awesome icons
3. Test with various entity types and permissions
4. Update this README with any new features
5. Add unit tests for new functionality

## License

ISC

## Support

For issues or questions:
- Check the [MemberJunction documentation](https://docs.memberjunction.com)
- Submit issues on the GitHub repository
- Contact the MemberJunction support team