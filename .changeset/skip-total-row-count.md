---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/integration-engine": patch
---

`RunViewParams.SkipTotalRowCount` — an explicit caller opt-out of the extra COUNT round trip. A row-limited read that comes back exactly full runs the count SQL as a second, sequential query, and a paginated read counts up front; a caller that only consumes `Results` can now skip both. (`next` already skips the full-page count for a `MaxRows: 1` probe; this covers every other read that never reads `TotalRowCount`.) With the flag, `TotalRowCount` is the number of rows returned; `count_only` ignores it. Calls with the flag get their own RunView cache slot (`strc:1`), so a counted and an uncounted result are never served for each other. The integration engine's per-record match lookups set it explicitly.
