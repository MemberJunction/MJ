---
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-base-forms": patch
---

`mj-entity-data-grid` now honors the host's column options: `formatter`, `cellClass`, `cellStyle`, `headerClass`, `align`, `headerAlign`, `cellTemplate`, `headerTemplate` and `type` + `format`, and keeps them when a saved grid state rebuilds the columns. A declared column type replaces the field-name currency guess. `mj-explorer-entity-data-grid` gains `Columns` and `GridState` inputs.
