---
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-base-forms": patch
---

fix(ng-entity-viewer): the entity grid's Merge button does something.

`MergeRecordsRequested` had no subscriber anywhere and the record-merge panel never called `MergeRecords`, so merging was reachable only from Knowledge Hub's duplicate review. The grid view renderer now hosts the panel, previews how many linked records would move to the survivor, and merges two selected rows — offered only where the entity allows merge and the user can both update and delete. Records that another app extends through a shared-key subtype are refused with an explanation, because `MergeRecords` has no subtype handling yet and the merge would collide on the shared key.

`mj-explorer-entity-data-grid` re-emits the same event rather than leaving a button that does nothing.
