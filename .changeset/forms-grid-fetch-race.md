---
"@memberjunction/ng-base-forms": patch
---

Fix related-entity grids fetching data on form open when a record is opened already-loaded (e.g. double-clicking a row in Data Explorer). `IsSectionExpanded()` fell through to the global expanded default when a section wasn't yet in `sectionMap`; because `initSections()` runs after `await super.ngOnInit()`, the grids could render in the first change-detection pass before the seeded collapsed defaults existed, so `[AllowLoad]="IsSectionExpanded(key)"` read `true` and fired a `RunView` on open. A not-yet-seeded section now resolves to collapsed, so a missing section can never report as expanded.
