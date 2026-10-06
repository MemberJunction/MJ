# @memberjunction/export-engine

## 6.1.5

### Patch Changes

- 7baaf30: fix: a date-only (SQL `date`) column reads as its stored day in the query viewer, the record change history and restore preview, and the timeline, and exports as `YYYY-MM-DD`

  These paths still formatted a calendar day, which arrives as UTC midnight, in the reader's local zone, so a stored 2026-10-01 read as Sep 30 west of Greenwich: as "Sep 30, 2026" in a query viewer cell and row detail, as "Sep 30, 2026, 7:00 PM" in the change history, and in a "September 30" timeline segment. The query viewer now branches on `IsDateOnlySQLType` and formats with `FormatDateOnly`, and the row detail no longer adds an "hours ago" suffix to a day. The change history and the restore preview share one formatter, so a date-only field shows its day with no time, and the restore preview's live value for a date field is no longer blank. The timeline carries a date-only event as local midnight of its stored day, so its segments and labels land on that day. The export engine gains a `dateonly` column type: CSV and JSON write ISO 8601 `YYYY-MM-DD`, and Excel writes a date cell on the stored day. The entity grid and the query viewer mark SQL `date` columns with it, and the query viewer's export columns now set `dataType` (they set an ignored `type` key before).

  The entity viewer's Timeline view now reads its date field the same way: its rows are plain objects with no entity metadata, so the renderer hands the timeline group the entity (`TimelineGroup.EntityInfo`, used when a record carries none) and drops the time from the card date for a date-only field. The restore preview decides whether a field changed by value, not by its display string, so a timestamp that moved by under a minute is no longer reported unchanged and a snapshot day matches the same live day. The fallback export for Cards, Map and Timeline (the view workspace and Explorer's view resource) types its columns as the grid does, through a shared `ExportColumnTypeForSQLType`, so a date-only field exports as its day there too. The export engine writes a `dateonly` value whose leading `YYYY-MM-DD` is not a real day (`2026-13-45`, `2026-02-30`) as its original text instead of "Invalid Date" or a rolled-over day. The mobile app's entity explorer shows a date-only field in card subtitles and the record detail as its stored day. Closes MJ#4966.

## 6.1.4

## 6.1.3

## 6.1.2

## 6.1.1

## 6.1.0

## 6.1.0-edge.7

## 6.1.0-edge.6

## 6.1.0-edge.5

## 6.1.0-edge.4

## 6.1.0-edge.3

## 6.1.0-edge.2

## 6.1.0-edge.1

## 6.1.0-edge.0

## 6.0.0

## 5.51.0

## 5.50.0

## 5.49.0

## 5.48.0

## 5.47.0

## 5.46.0

## 5.45.1

## 5.45.0

## 5.44.0

## 5.43.0

## 5.42.0

## 5.41.0

## 5.40.2

## 5.40.1

## 5.40.0

## 5.39.0

## 5.38.0

## 5.37.0

## 5.36.0

## 5.35.0

## 5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.

## 5.33.0

## 5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes

## 5.30.1

## 5.30.0

## 5.29.0

## 5.28.0

## 5.27.1

## 5.27.0

## 5.26.0

## 5.25.0

## 5.24.0

## 5.23.0

## 5.22.0

## 5.21.0

## 5.20.0

## 5.19.0

## 5.18.0

## 5.17.0

## 5.16.0

## 5.15.0

## 5.14.0

## 5.13.0

## 5.12.0

## 5.11.0

## 5.10.1

## 5.10.0

## 5.9.0

## 5.8.0

## 5.7.0

## 5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes

## 5.4.1

## 5.4.0

## 5.3.1

## 5.3.0

## 5.2.0

## 5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

## 4.4.0

## 4.3.1

## 4.3.0

## 4.2.0

## 4.1.0

### Patch Changes

- 9fab8ca: ESM Compatibility

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

## 3.4.0

## 3.3.0

## 3.2.0

## 3.1.1

## 3.0.0

## 2.133.0
