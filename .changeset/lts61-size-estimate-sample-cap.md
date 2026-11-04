---
"@memberjunction/core": patch
---

The local cache's size estimate now serializes at most 10 sample rows, so saving or deleting one row of a large cached entity no longer serializes a tenth of the cached rows.
