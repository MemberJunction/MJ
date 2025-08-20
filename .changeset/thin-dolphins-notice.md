---
"@memberjunction/ng-core-entity-forms": patch
---

Summary:
feat: Add Action Result Codes management to Action form

Detailed Description:
Added complete CRUD functionality for managing Action Result Codes directly within the Action form component. Users can now add, edit, and
delete result codes that define possible execution outcomes for Actions.

Key Changes:

- Created ActionResultCodeDialogComponent for adding/editing result codes with fields for code, description, and success status
- Added interactive UI with hover effects, edit/delete buttons, and visual indicators for success/failure codes
- Implemented proper transaction support using InternalSaveRecord pattern to save Action, Params, and Result Codes atomically
- Fixed critical issue where loadResultCodes() was missing ResultType: 'entity_object', causing entity operations to fail
- Updated PopulatePendingRecords to track Result Codes alongside Action Params for proper save/delete operations
- Added Result Code management methods (addResultCode, editResultCode, deleteResultCode) following the same pattern as Action Params

Impact:
This enhancement allows developers to define and manage all possible result codes for their Actions directly in the UI, improving the Action
development workflow and ensuring proper error handling patterns are documented.
