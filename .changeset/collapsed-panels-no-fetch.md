---
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-entity-viewer": patch
---

Prevent collapsed related-entity panels in generated forms from fetching data on form open. `IsSectionExpanded()` now honors the collapsed default seeded by `initSections()` instead of falling back to the global expanded default, and the entity data grid defers its auto-load decision one microtask so a later `[AllowLoad]="false"` binding is applied before the load check runs.
