---
"@memberjunction/db-auto-doc": patch
---

Fix: relationship discovery now uses each column's real row count. `GetColumnStatisticsForDiscovery` ignored the full-table count the drivers return and estimated it instead:
- **No nulls:** the estimate was `nullCount + distinctCount`, which equals the distinct count. Every non-null column looked 100% unique, however many duplicates it had.
- **With nulls:** the estimate was `nullCount / nullPercentage`, but `nullPercentage` is a 0–100 percentage, so the row count came out near 0.

PK uniqueness checks and FK null-percentage and orphan estimates now see the true counts. This can change discovered keys.
