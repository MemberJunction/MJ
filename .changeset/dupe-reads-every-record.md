---
"@memberjunction/ai-vector-dupe": patch
---

Duplicate detection checks every record in scope.

The three record-id loads (list, saved view, entity or filter) now read with
`IgnoreMaxRows`. They fell back to the entity's `UserViewMaxRows`, so a run checked only the first
1,000 records, set `TotalItemCount` from them, and reported "1000 of 1000 complete" on a
61,671-record entity.
