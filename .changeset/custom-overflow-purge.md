---
"@memberjunction/server": patch
---

Custom-column promotion now clears the staging JSON, and stops re-offering columns it already created.

Two defects made an already-promoted source field come back to the operator as a brand-new "column to add", indefinitely:

- **The staged value was never removed.** `__mj_integration_CustomOverflow` was left untouched on promotion, on the assumption that the next sync would evict the key once a field map existed. It does not: a sync rewrites a row only when its content hash changes, and the hash basis deliberately excludes the overflow column — so any row unchanged since before the promotion keeps the promoted key forever. Promotion now strips each key from the JSON in the same write that spreads it, and a new purge pass sweeps the whole table for keys that are already mapped but still staged. That pass runs *before* any new column is created, and runs even when there is nothing new to promote, so pre-existing residue is cleaned rather than re-detected. Backfilled columns re-baseline the content hash exactly as the spread does, so purging never provokes a rewrite on the next sync.
- **The "already promoted?" check ignored the field map's destination.** It re-sanitized the source key and looked that up in the in-process `EntityField` list. That list can predate the `ADD COLUMN` in a given process, and the real column may carry a collision suffix (`_2`) the re-sanitized guess cannot reproduce; either miss read as "no column yet". The active field map's `DestinationFieldName` — the authoritative record of what was created — is now consulted first, and the query that reads it serves the hash re-baseline too instead of running twice.

Also fixes offset paging over the overflow rows: the walk is ordered by primary key and advances by rows-seen-minus-rows-removed, so cleaning a row no longer causes the scan to skip a later one.

The purge is bounded to 1000 written rows per pass. Each purged row costs one `BaseEntity.Save()` — around nine serialized round trips, the only write shape available today — so an unbounded sweep of a large table would hold the post-sync promotion callback open for a long time. The budget bounds writes, not the scan, so a later pass still reaches residue further down the table; residue is inert while it waits, because the field-map-first terminate check already stops a mapped key being re-offered as a new column.
