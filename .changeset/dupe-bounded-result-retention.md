---
"@memberjunction/ai-vector-dupe": patch
"@memberjunction/core": patch
"@memberjunction/ai-agents": patch
---

Duplicate detection no longer accumulates the whole run in memory, so whole-entity runs can finish.

`GetDuplicateRecords` batches its work 500 records at a time, but accumulated its **results** for
the entire run — O(records), not O(batch). On a 61,671-record entity that alone exhausted an 8 GB
heap and the process died mid-run, so whole-entity detection could not complete at all. Three
consecutive attempts on one tenant each ended in `FATAL ERROR: Reached heap limit`, while a full
re-embed over the same records succeeded every time — the cost was in the detection path, not the
vectorization.

Retaining every result was never load-bearing: `ProcessBatch` already persists each one as
`Duplicate Run Detail` / `Duplicate Run Detail Match` rows as it goes, so the array was a second
copy of durable data, kept only to feed the post-pass auto-merge and a single `.length` read.

Retention is now capped at 1,000 results. Auto-merge carries only candidates that can actually
merge — a small fraction by definition, since they must clear the absolute threshold — and still
runs **once, after the full pass**, so detection continues to see the pre-merge dataset exactly as
before.

`PotentialDuplicateResponse` gains two optional fields: `TotalRecordsWithDuplicates` (never capped,
correct at any scale) and `ResultsTruncated`. Small runs are unaffected — under the cap the
response is identical to before.
