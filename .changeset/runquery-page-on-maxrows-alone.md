---
'@memberjunction/generic-database-provider': patch
---

fix(generic-database-provider): page on MaxRows alone, without requiring StartRow

`QueryPagingEngine.ShouldPage` required both `MaxRows` and `StartRow`, so a caller asking only to *cap* a result — rather than to walk pages — fell through to the "execute full query, apply in-memory pagination" fallback. The database returned every row, the whole set crossed the network, and it was trimmed in memory afterwards. A ceiling the database never sees is not a ceiling, and callers could not detect the difference: in that branch `TotalRowCount` is simply the length of the fully-materialized array, so it looks identical to a genuinely paged result. Observed against a live database, a `MaxRows=10` call returned `TotalRowCount: 479` with no `OFFSET`/`FETCH` issued at all.

The requirement was a scoping decision rather than a rule — the original server-side-paging work framed the feature as pagination and kept the old path "for backward compatibility" for everything else. `RunView` has since settled the same question the other way: `BuildTotalRowCountSQL` treats rows as limited when `usingPagination || maxRowsForQuery > 0`, a fix made because the narrower condition missed every case where `MaxRows` was set without an explicit `StartRow`. This brings `RunQuery` in line with its sibling.

`MaxRows` alone is now sufficient. An absent `StartRow` means page zero, resolved through the new `QueryPagingEngine.ResolveStartRow` so the sites acting on a true `ShouldPage` cannot read `params.StartRow!` and get `undefined`. A negative `StartRow` is still rejected, and `MaxRows` remains the deciding factor so a `StartRow` alone cannot turn an unbounded query into a truncated one.

Behavioural consequences for callers that pass `MaxRows` without `StartRow`: they now receive SQL-level paging instead of a full fetch, so far less data moves, but an unordered query's "first N" remains arbitrary (`DefaultPagingOrderBy` is injected when none exists, so the SQL stays valid); those calls populate the paged cache rather than the full-result cache, shifting hit rates; and they now incur `CountSQL`, which re-runs the query's logic to count — paging saves transfer and memory, not database work.
