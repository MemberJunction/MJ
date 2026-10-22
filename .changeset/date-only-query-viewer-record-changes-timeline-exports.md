---
'@memberjunction/export-engine': patch
'@memberjunction/mobile-app': patch
'@memberjunction/ng-entity-viewer': patch
'@memberjunction/ng-explorer-core': patch
'@memberjunction/ng-query-viewer': patch
'@memberjunction/ng-record-changes': patch
'@memberjunction/ng-timeline': patch
---

fix: a date-only (SQL `date`) column reads as its stored day in the query viewer, the record change history and restore preview, and the timeline, and exports as `YYYY-MM-DD`

These paths still formatted a calendar day, which arrives as UTC midnight, in the reader's local zone, so a stored 2026-10-01 read as Sep 30 west of Greenwich: as "Sep 30, 2026" in a query viewer cell and row detail, as "Sep 30, 2026, 7:00 PM" in the change history, and in a "September 30" timeline segment. The query viewer now branches on `IsDateOnlySQLType` and formats with `FormatDateOnly`, and the row detail no longer adds an "hours ago" suffix to a day. The change history and the restore preview share one formatter, so a date-only field shows its day with no time, and the restore preview's live value for a date field is no longer blank. The timeline carries a date-only event as local midnight of its stored day, so its segments and labels land on that day. The export engine gains a `dateonly` column type: CSV and JSON write ISO 8601 `YYYY-MM-DD`, and Excel writes a date cell on the stored day. The entity grid and the query viewer mark SQL `date` columns with it, and the query viewer's export columns now set `dataType` (they set an ignored `type` key before).

The entity viewer's Timeline view now reads its date field the same way: its rows are plain objects with no entity metadata, so the renderer hands the timeline group the entity (`TimelineGroup.EntityInfo`, used when a record carries none) and drops the time from the card date for a date-only field. The restore preview decides whether a field changed by value, not by its display string, so a timestamp that moved by under a minute is no longer reported unchanged and a snapshot day matches the same live day. The fallback export for Cards, Map and Timeline (the view workspace and Explorer's view resource) types its columns as the grid does, through a shared `ExportColumnTypeForSQLType`, so a date-only field exports as its day there too. The export engine writes a `dateonly` value whose leading `YYYY-MM-DD` is not a real day (`2026-13-45`, `2026-02-30`) as its original text instead of "Invalid Date" or a rolled-over day. The mobile app's entity explorer shows a date-only field in card subtitles and the record detail as its stored day. Closes MJ#4966.
