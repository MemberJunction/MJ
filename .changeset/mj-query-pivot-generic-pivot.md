---
"@memberjunction/ng-query-viewer": patch
---

Add generic `mj-query-pivot` component (`QueryPivotComponent`) in `@memberjunction/ng-query-viewer` for grouping and aggregating data over saved Queries.

Features:
- Pure `computePivot()` function supporting arbitrary dimension columns and time grains (`hour` | `day`).
- Aggregation support for measures (`sum`, `avg`, `min`, `max`, `count`) with formatting styles (`currency`, `number`, `percent`, `duration`).
- Strict null policy: a measure whose value is null renders as an em dash (`—`), never as zero.
- Comparison window calculations with previous period metrics and delta percentages.
- Integrated rendering with `<mj-query-data-grid>` emitting `rowActivated` on selection without coupling to Explorer or NavigationService.
