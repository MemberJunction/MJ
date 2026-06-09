---
"@memberjunction/ai-vector-dupe": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/ng-dashboards": patch
---

Fix duplicate detection defects: drop stale "ghost" vector matches to deleted/re-seeded records (the apparent record-matching-itself), guard against recursive re-triggering that exploded detail rows, skip auto-merge for merge-disallowed entities instead of failing the run, and sort the Record Duplicates UI groups and per-card matches by match probability descending.
