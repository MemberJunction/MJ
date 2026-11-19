---
"@memberjunction/archiving-engine": patch
"@memberjunction/integration-test-suite": patch
---

Archive runs process every eligible record in one run, one batch in memory at a time.

- `ArchiveProcessor` loads records a page of `BatchSize` at a time, ordered by primary key, until a page comes back short. A run used to read one query capped at the entity's `UserViewMaxRows` (1,000 by default) and stop. Single-key entities page with `AfterKey`; composite-key entities page with `StartRow`, advancing only past records that still match.
- `BaseArchiveDriver.BuildEligibilityFilter` (new, default null) lets a driver add a SQL filter matching the records its `ShouldArchiveRecord` accepts. `DefaultArchiveDriver` returns an OR of `<field> IS NOT NULL` (nullable) / `<field> <> ''` (NOT NULL string) over `SkipIfAllNullFields` or the active fields, so records a StripFields run already cleared are no longer loaded or counted as skipped on every later run. `FilterExpression` still applies.
- `DefaultArchiveDriver.ShouldArchiveRecord` treats an empty string in a NOT NULL column as no value, since that is what StripFields writes there; such records (for example stripped Record Changes) were archived again on every run.
- New deterministic integration test IT180 (`archive-paging`).
