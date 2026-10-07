---
"@memberjunction/ai-vector-dupe": patch
---

Duplicate detection checks every record in scope, and probes at the vector index's width.

- **Every record.** The three record-id loads (list, saved view, entity or filter) now read with
  `IgnoreMaxRows`. They fell back to the entity's `UserViewMaxRows`, so a run checked only the first
  1,000 records, set `TotalItemCount` from them, and reported "1000 of 1000 complete" on a
  61,671-record entity.
- **The index's width.** Probe vectors are embedded at the index's `Dimensions`, the width entity
  vector sync already uses when it fills the index. At the model's default width a 512-wide index
  was queried with 1,536-wide vectors: the vector database rejected every query, and the run
  completed with no matches. An index with no `Dimensions` still uses the model's default.
