---
'@memberjunction/core': patch
'@memberjunction/ng-entity-viewer': patch
'@memberjunction/ng-entity-card': patch
'@memberjunction/ng-base-forms': patch
---

fix: a date-only column renders as its stored calendar day in grids, cards, the record detail panel, aggregates and the view-config preview, not the previous day

A SQL `date` column arrives as UTC midnight, and every display path except the form field (fixed in #4177) formatted it in the reader's local zone, so a stored 2026-11-20 read as Nov 19 for everyone west of Greenwich and 2026-01-01 read as the previous year. The form and the list disagreed on the same row. `@memberjunction/core` now exports `IsDateOnlySQLType` and `FormatDateOnly`, its own `FormatValue` uses them for `date` types, and the grid, cards, detail panel, entity card and view-config preview branch on the field's declared SQL type. A `datetime` or `datetimeoffset` column is an instant and keeps local rendering with its time. Closes MJ#4210.
