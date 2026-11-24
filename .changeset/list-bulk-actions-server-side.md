---
"@memberjunction/lists-base": minor
"@memberjunction/lists": minor
"@memberjunction/server": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/integration-test-suite": minor
---

Server-side bulk list member operations, so a list screen sends one small request instead of one save or delete per record.

- `ListOperations` adds `AddRecordsToList`, `RemoveRecordsFromList`, `DuplicateList`, `CopyRecordsToList` and `SetRecordStatus`. Existing members are found with set-based lookups of at most 500 record IDs each; writes still go through `BaseEntity.Save()` / `Delete()` as the acting user.
- New GraphQL mutations `AddRecordsToList`, `RemoveRecordsFromList`, `DuplicateList`, `CopyRecordsToList`, `SetListRecordStatus` and `CreateListFromRecords`, with matching `GraphQLListsClient` methods.
- `ApplyResult.Counts` has an optional `Updated` (GraphQL `UpdatedCount`), set by `SetRecordStatus`.
- The removals of a list refresh or delta apply are looked up in chunks, and `Counts.Removed` counts the rows actually deleted.
- Explorer list screens (Lists browse, My Lists, Operations, Predictive Studio "Send to a list") duplicate lists and add list members with one bulk call, and delete a list without first deleting its members in the browser.
- `AddRecordsToList` takes an optional status for the new members and can save each new member's input position as its `Sequence`.
- `FK_ListDetail_List` has `ON DELETE CASCADE`: deleting a list removes its members in the database.
- After a list delete the server clears the cached `MJ: List Details` results, because the database removes the members without entity events.
- A move (`CopyRecordsToList` with `RemoveFromSource`) that cannot remove some records from the source says so in `Message`; a move stopped by a failed add says that nothing was removed.
- New integration check `lists-members-client.LC1` (IT187) runs add, move and remove over the API.
