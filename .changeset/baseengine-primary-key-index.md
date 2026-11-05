---
"@memberjunction/core": patch
---

BaseEngine now finds a cached row by primary key through a per-array index when it applies a saved or remotely changed row, instead of scanning the whole cached array, so saves on large cached entities no longer cost one full scan per row.
