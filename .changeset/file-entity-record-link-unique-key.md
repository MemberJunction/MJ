---
"@memberjunction/core-entities": patch
---

Fix `__mj.FileEntityRecordLink`'s unique key, which omitted `RecordID` and therefore allowed a
given file to be linked to at most ONE record per entity — attaching the same document to two
Contracts, two Accounts, or two of anything else failed on a unique-key violation, contradicting
the table's purpose. `UQ_FileEntityRecordLink_EntityID_FileID` is replaced by
`UQ_FileEntityRecordLink_EntityID_RecordID_FileID`.

The constraint came from the v5.37 junction-table batch, whose stated scope was pure two-FK-column
link tables; `RecordID` is an `nvarchar(750)` soft key, so that heuristic mechanically selected
`(EntityID, FileID)` and dropped the column that makes a row unique. This is the second constraint
from that batch corrected on the same grounds, after `Drop_EntityAction_Uniqueness`.

The change is a widening — every row satisfying the old key satisfies the new one — so it needs no
de-duplication pass and cannot fail on existing data. The genuine duplicate (same file linked twice
to the same record) is still rejected. No CodeGen or generated-ORM change is involved.
