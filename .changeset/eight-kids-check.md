---
"@memberjunction/ng-explorer-settings": patch
---

Enhanced settings dashboard dialogs with functionality fixes and
template organization

**Dialog Functionality Improvements:**

- Fixed role persistence bug in user dialog where roles from first
  record persisted when editing second record
- Enhanced ApplicationEntity management with full CRUD operations and
  sequence management
- Improved entity permissions dialog reliability through better event
  handling and data loading timing
- Added standalone ngModel options to resolve FormGroup conflicts in
  dialog checkboxes
- Enhanced DefaultForNewUser checkbox configuration with proper data
  binding

**Code Organization:**

- Extracted all inline HTML templates to dedicated .html files for
  better separation of concerns
- Separated TypeScript logic from HTML markup across all dialog
  components (permission-dialog, application-dialog, user-dialog,
  role-dialog)
- Improved code maintainability and readability through template
  extraction

**Technical Details:**

- Fixed ngModel cannot be used with FormGroup directive errors by adding
  `[ngModelOptions]="{standalone: true}"`
- Enhanced entity-based dirty checking using MemberJunction's built-in
  dirty tracking
- Improved sequence management for application entities with proper
  add/remove functionality
- Added comprehensive entity management interface for applications
  including assigned entities list and available entities grid

**Components Updated:**

- Permission Dialog: Enhanced with better role permission management and
  entity change tracking
- Application Dialog: Added comprehensive ApplicationEntity management
  with sequence controls
- User Dialog: Fixed role assignment persistence issues between
  different user records
- Role Dialog: Improved form handling and validation
