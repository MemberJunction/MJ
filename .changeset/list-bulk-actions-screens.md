---
"@memberjunction/ng-list-management": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-core-entity-forms": minor
---

List screens change list members with the server bulk operations, one request per action, instead of one save or delete per record in the browser.

- `ListManagementService.AddRecordsToLists` / `RemoveRecordsFromLists` make one `GraphQLListsClient` call per list.
- The List form (remove selected, add records, add from views) and the list detail screen (bulk status, move/copy, remove, add records, add from views) call `AddRecordsToList`, `RemoveRecordsFromList`, `SetRecordStatus`, `CopyRecordsToList` and `AddViewResultsToList`.
- New helpers `CreateListsClient`, `RunListChange`, `AddViewResultsToList`, `ListChangeApplied`, `ListChangeFailureMessage` and `RecordCountText` in `@memberjunction/ng-list-management`.
- After a partial move the list detail screen shows the server message, which says what was added and what stayed in the source list.
- The add, remove and move/copy dialogs show a busy indicator in place of a per-record progress bar.
