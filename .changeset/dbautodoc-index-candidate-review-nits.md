---
"@memberjunction/db-auto-doc": patch
---

Follow-ups from the review of #5791. No behavior change.
- Reworded the `indexBackedCandidates` doc: composite unique indexes are only considered when no single column qualifies.
- The `useExistingIndexes` handling at the start of a run moved into a tested `PrepareIndexesForRun` helper. When it's off, indexes left in a resumed state are dropped.
- New tests for that helper and for `PKDetector` replacing a lower-confidence composite with an index-backed one on the same columns.
