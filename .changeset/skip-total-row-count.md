---
"@memberjunction/core": minor
"@memberjunction/generic-database-provider": patch
"@memberjunction/integration-engine": patch
---

`RunViewParams.SkipTotalRowCount` — an explicit caller opt-out of the extra COUNT round trip. When a page comes back exactly full (`Results.length === MaxRows`), the provider runs the count SQL as a second, sequential query to report the true total. For a `MaxRows: 1` existence/lookup read, finding the row IS a full page, so every successful single-row lookup paid double round trips to compute a total it never read — measured at ~11% of all SQL time on a live sync workload, firing exactly at the hit rate of the per-record lookups. The count cannot simply be dropped for `MaxRows: 1` (TotalRowCount on a capped read is load-bearing: the vector dashboard reads it as the real count on a MaxRows:1 query, and the cache gauntlet asserts it exceeds the truncated row count), so the caller opts out instead. The flag skips the full-page fallback and the pagination count; `count_only` ignores it — that result IS the count. Lives in `GenericDatabaseProvider.InternalRunView`, so SQL Server and Postgres are both covered by the one change. The integration engine's two per-record match lookups (`FindByKeyFields` single-row lookup and `FindByExternalId`) adopt it.
