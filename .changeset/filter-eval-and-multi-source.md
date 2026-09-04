---
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
"@memberjunction/ng-filter-builder": patch
---

Filter JSON can name fields as `Source.Field` (always written when the builder is given `sources`). Read path accepts dotted and bare names. `CompositeFilter` (`FromJSON` / `Evaluate` / `SummaryText`) lives in `@memberjunction/core` for in-memory eval and compact/grid copy. Views still compile to SQL and strip the prefix. Multi-entity field picker is a two-pane UI; single-entity views are unchanged.
