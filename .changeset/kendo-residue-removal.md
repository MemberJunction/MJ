---
"@memberjunction/codegen-lib": patch
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
"@memberjunction/installer": patch
"@memberjunction/ng-action-gallery": patch
"@memberjunction/ng-actions": patch
"@memberjunction/ng-ai-test-harness": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-chat": patch
"@memberjunction/ng-container-directives": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-credentials": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-data-context": patch
"@memberjunction/ng-entity-communications": patch
"@memberjunction/ng-entity-form-dialog": patch
"@memberjunction/ng-entity-permissions": patch
"@memberjunction/ng-entity-relationship-diagram": patch
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-explorer-app": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-explorer-modules": patch
"@memberjunction/ng-explorer-settings": patch
"@memberjunction/ng-feedback": patch
"@memberjunction/ng-file-storage": patch
"@memberjunction/ng-filter-builder": patch
"@memberjunction/ng-find-record": patch
"@memberjunction/ng-flow-editor": patch
"@memberjunction/ng-generic-dialog": patch
"@memberjunction/ng-join-grid": patch
"@memberjunction/ng-list-detail-grid": patch
"@memberjunction/ng-notifications": patch
"@memberjunction/ng-query-viewer": patch
"@memberjunction/ng-record-selector": patch
"@memberjunction/ng-resource-permissions": patch
"@memberjunction/ng-shared": patch
"@memberjunction/ng-simple-record-list": patch
"@memberjunction/ng-tabstrip": patch
"@memberjunction/ng-testing": patch
"@memberjunction/ng-timeline": patch
"@memberjunction/ng-ui-components": patch
---

Finish the Kendo removal: no Kendo references remain in shipped code, styles, templates, package metadata, or live docs.

Kendo was already gone from the dependency graph — zero `@progress/kendo*` entries in any `package.json`, zero TypeScript imports. What was left was residue, and some of it was not inert:

**Dead code and styles removed**
- 82 `.k-*` CSS rules across 21 files. Nothing has defined those classes since the removal, so every one of them was a no-op.
- `li.k-drawer-item.k-level-0` was still being queried in `MJExplorerAppComponent` and `InitializationService` to auto-select the first nav item when landing on `/`. The Kendo Drawer is long gone, so `querySelector` returned null and the branch did nothing — removing it is a runtime no-op. **If landing on `/` should select the first nav item, that behaviour needs reimplementing against the current shell nav; it has been silently absent since the removal.**
- `dialog.service.ts.bak` (dead backup importing `@progress/kendo-angular-dialog`) deleted.
- `kendo-ui-license.txt` dropped from `DistributionAssembler`'s Angular ignore list, and its now-meaningless assertion retargeted in the test.

**Broken templates fixed** — three components still applied Kendo utility classes that no longer resolve:
- `add-item.component` — `k-actions k-actions-end` was supplying the footer's flex row, so `.customBtn button { flex: 1 }` had no flex container. `.popup-actions` now provides it.
- `delete-item.component` — `k-m-7.5 k-text-center` never applied at all (`k-m-7.5` is not a valid single class token), leaving the confirmation copy unstyled. Replaced with a real `.confirm-message` class.
- `add-item` and `ng-data-context-dialog` each carried a `<div class="k-overlay">` backdrop. `mj-window` deliberately has no backdrop, so these are now unstyled empty divs — **deleted, which means both dialogs currently render with no backdrop.** Restoring one is a UX call, not a cleanup.

**Filter payload is MJ's own type**
`FilterOperator` / `FilterLogic` / `FilterDescriptor` / `CompositeFilterDescriptor` and their guards were already defined in `@memberjunction/core` (`generic/filters/filter.types.ts`) — `ng-filter-builder` carried a byte-equivalent duplicate set and re-exported it. The duplicate is gone; the builder and `ng-entity-viewer` import the shapes from core, and the builder exports only its own UI types.

**API surface change (`@memberjunction/ng-filter-builder`)**: `FilterOperator`, `FilterLogic`, `FilterDescriptor`, `CompositeFilterDescriptor`, `IsCompositeFilter` and `IsSimpleFilter` are no longer re-exported. Import them from `@memberjunction/core` instead. This aligns with the repo's no-cross-package-re-exports rule.

**Docs and comments** — 33 package READMEs listed `@progress/kendo-angular-*` packages as live dependencies (they aren't) and drew Kendo components in their mermaid diagrams; `packages/Angular/CLAUDE.md`, four guides, and ~55 source comments referenced Kendo as though it were still present. All rewritten to describe what the code actually uses.

Historical records are deliberately untouched: `plans/`, CHANGELOGs, and dated retrospectives (`FINAL_REPORT.md`, `PIXEL_PERFECT_COMPLETE.md`, `USER_MENU_PROPOSAL.md`, timeline `PRD.md` version history) still mention Kendo, because they are records of when it was there.
