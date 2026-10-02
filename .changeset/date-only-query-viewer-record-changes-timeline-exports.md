---
'@memberjunction/export-engine': patch
'@memberjunction/ng-entity-viewer': patch
'@memberjunction/ng-query-viewer': patch
'@memberjunction/ng-record-changes': patch
'@memberjunction/ng-timeline': patch
---

fix: a date-only (SQL `date`) column reads as its stored day in the query viewer, the record change history and restore preview, and the timeline, and exports as `YYYY-MM-DD`

These paths still formatted a calendar day, which arrives as UTC midnight, in the reader's local zone, so a stored 2026-10-01 read as Sep 30 west of Greenwich: as "Sep 30, 2026" in a query viewer cell and row detail, as "Sep 30, 2026, 7:00 PM" in the change history, and in a "September 30" timeline segment. The query viewer now branches on `IsDateOnlySQLType` and formats with `FormatDateOnly`, and the row detail no longer adds an "hours ago" suffix to a day. The change history and the restore preview share one formatter, so a date-only field shows its day with no time, and the restore preview's live value for a date field is no longer blank. The timeline carries a date-only event as local midnight of its stored day, so its segments and labels land on that day. The export engine gains a `dateonly` column type: CSV and JSON write ISO 8601 `YYYY-MM-DD`, and Excel writes a date cell on the stored day. The entity grid and the query viewer mark SQL `date` columns with it, and the query viewer's export columns now set `dataType` (they set an ignored `type` key before). Closes MJ#4966.
