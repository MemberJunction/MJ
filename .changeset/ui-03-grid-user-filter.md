---
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-ui-components": patch
---

`mj-entity-data-grid` gains an opt-in Filter button (`ShowFilterButton`, off by default) with a filter builder over the entity's fields, a `UserFilter` input and `UserFilterChange` output, and removable chips for the active filter. The user's filter is combined with the host's `ExtraFilter` as `(host) AND (user)` for rows, totals and the Excel source, never replacing it. `mj-explorer-entity-data-grid` forwards the three. The view config panel and the grid share `BuildFilterFields`. `ng-ui-components` now exports `MJAppliedFiltersComponent`.
