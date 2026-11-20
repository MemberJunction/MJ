---
"@memberjunction/ng-list-management": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-dashboards": patch
---

The list update confirmation (refresh preview, move, compose) shows each previewed record's name, with its ID beside it, instead of the bare ID. Names are looked up for the previewed records only; a record with no name, or a failed lookup, keeps showing its ID.
