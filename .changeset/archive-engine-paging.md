---
"@memberjunction/archiving-engine": patch
"@memberjunction/integration-test-suite": patch
---

Archive runs process every eligible record in one run, one batch in memory at a time.

- `ArchiveProcessor` loads records a page of `BatchSize` at a time, ordered by primary key, until a page comes back empty. A run used to read one query capped at the entity's `UserViewMaxRows` (1,000 by default) and stop. Each page starts after the last key of the previous page, copied when the page loads: single-key entities use `AfterKey`; composite-key entities seek with `(k1 > v1) OR (k1 = v1 AND k2 > v2) ...` and must have only string or number key columns (otherwise the entity is refused before any record is read). Paging never depends on what the driver did to a record, so deleted, stripped, skipped and failed records are each loaded once.
- `BaseArchiveDriver.BuildEligibilityFilter(context)` (new, default null) lets a driver add a SQL filter matching the records its `ShouldArchiveRecord` accepts. `DefaultArchiveDriver` returns an OR of `[field] IS NOT NULL` (nullable) and, in StripFields mode, `[field] LIKE '_%'` (NOT NULL string) over `SkipIfAllNullFields` or the active fields, so records a StripFields run already cleared are no longer loaded or counted as skipped on every later run. `FilterExpression` still applies.
- In StripFields mode `DefaultArchiveDriver.ShouldArchiveRecord` treats an empty string in a NOT NULL column as no value, since that is what StripFields writes there; such records (for example stripped Record Changes) were archived again on every run. Other modes are unchanged.
- The configured `DateField` must be a field of the entity and is written in square brackets.
- New deterministic integration test IT182 (`archive-paging`).
