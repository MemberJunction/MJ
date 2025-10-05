# Kendo Dialog Container Fix

## Issue
When attempting to delete a conversation from the conversation list, the following error occurred:

```
Error: Cannot attach dialog to the page.
Add an element that uses the kendoDialogContainer directive, or set the 'appendTo' property.
See https://www.telerik.com/kendo-angular-ui/components/dialogs/dialog/service/.
```

**Location**: `conversation-list.component.ts:168`

## Root Cause
The Kendo `DialogService` requires a container element with the `kendoDialogContainer` directive to be present in the Angular component tree. Without this directive, Kendo doesn't know where to render the dialog in the DOM.

## Solution
Added the `kendoDialogContainer` directive to the root workspace component.

### File Changed
**File**: [conversation-workspace.component.html](src/lib/components/workspace/conversation-workspace.component.html)

**Before**:
```html
<div class="conversation-workspace" [attr.data-layout]="layout" mjSearchShortcut (searchTriggered)="openSearch()">
```

**After**:
```html
<div class="conversation-workspace" [attr.data-layout]="layout" mjSearchShortcut (searchTriggered)="openSearch()" kendoDialogContainer>
```

## How It Works
- The `kendoDialogContainer` directive marks the element as a container for Kendo dialogs
- All `DialogService` calls in child components (like `conversation-list.component.ts`) will now properly render within this container
- The directive is provided by `@progress/kendo-angular-dialog` which is already imported in `conversations.module.ts`

## Affected Components
This fix enables dialogs to work properly in all child components that use `DialogService`:

1. **ConversationListComponent** - Delete confirmation, rename input, error alerts
2. **MessageInputComponent** - Any dialog interactions
3. **CollectionFormModalComponent** - Collection management dialogs
4. **TaskFormModalComponent** - Task management dialogs
5. **ShareModalComponent** - Sharing dialogs
6. **ExportModalComponent** - Export dialogs

## Alternative Solution (Not Used)
An alternative would be to set the `appendTo` property on each individual dialog call:

```typescript
this.dialogService.open({
  // ... other options
  appendTo: document.body // or specific ViewContainerRef
});
```

However, using `kendoDialogContainer` at the root level is the recommended approach as it:
- Works for all dialogs automatically
- Follows Kendo's best practices
- Requires only one line of code
- Maintains proper z-index stacking within the component tree

## Build Status
✅ **BUILD SUCCESSFUL** - No compilation errors

## References
- [Kendo Dialog Service Documentation](https://www.telerik.com/kendo-angular-ui/components/dialogs/dialog/service/)
- [Kendo Dialog Container Directive](https://www.telerik.com/kendo-angular-ui/components/dialogs/api/DialogContainerDirective/)

---

*Fix implemented: 2025-10-03*
