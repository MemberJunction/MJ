---
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-base-forms": patch
---

fix(ng-entity-viewer): the entity grid's Merge button does something.

`MergeRecordsRequested` had no subscriber anywhere and the record-merge panel never called `MergeRecords`, so merging was reachable only from Knowledge Hub's duplicate review. The grid view renderer now hosts the panel in `mj-dialog`, lets the user choose which record survives, previews how many linked records would move to it, and merges two selected rows — offered only where the entity allows merge and the user can both update and delete. Fields the ORM will not write (keys, `AllowUpdateAPI = 0`, timestamps) are read-only in the comparison. IS-A records are refused with an explanation, on the client and in `MergeRecords` itself: the merge re-points only the keys that target the merged entity, and the loser's delete would follow the shared key into subtype or parent rows whose references never moved.

`mj-explorer-entity-data-grid` re-emits the same event rather than leaving a button that does nothing.
