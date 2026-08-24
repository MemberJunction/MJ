---
"@memberjunction/core-entities": minor
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

Operators upgrading from a deployment that predates v5.37 should know that the migration which
introduced the bad constraint (`V202605221002__v5.37.x__Add_Unique_Constraints_To_MJ_Junction_Tables`)
DELETED pre-existing duplicates before adding each constraint, keeping only the earliest
`__mj_CreatedAt` row per `(EntityID, FileID)` group. Any deployment that legitimately had one file
linked to several records of the same entity lost those link rows at that upgrade, and they are not
recoverable from the migration. It logged per-table duplicate and deletion counts, so affected
deployments can check their v5.37 upgrade logs. This change stops the loss recurring; it cannot undo it.

The change is a widening — every row satisfying the old key satisfies the new one — so it needs no
de-duplication pass and cannot fail on existing data. The genuine duplicate (same file linked twice
to the same record) is still rejected. No CodeGen or generated-ORM change is involved.
