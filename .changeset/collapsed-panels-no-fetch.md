---
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/codegen-lib": patch
---

Stop related-entity grid panels in generated forms from fetching data on form open, and decouple panel-height persistence from expansion state.

- `IsSectionExpanded()` now honors the collapsed default seeded by `initSections()` instead of falling back to the global expanded default, and the entity data grid defers its auto-load decision one microtask so a later `[AllowLoad]="false"` binding is applied before the load check runs.
- Fixed the underlying bug where persisting a panel's height silently marked the section expanded: a `ResizeObserver` fired on initial measurement and `updateSectionState` merged `DEFAULT_SECTION_STATE` (`isExpanded: true`) into a height-only write, so on the next form open that persisted value won over the seeded collapsed default. `FormSectionState.isExpanded` is now optional (`undefined` = no explicit user choice), `updateSectionState` no longer seeds the default, and the `ResizeObserver` skips its initial fire and only persists while expanded.
- Related-entity grids now lazy-load via an `IntersectionObserver` in `ExplorerEntityDataGridComponent`: a grid fetches only once its host scrolls into view, so off-screen and collapsed panels never fire a `RunView` on form open.
- CodeGen now seeds all field panels expanded by default (except System Metadata), with related-entity grids collapsed. **Visible UX change:** generated forms that previously opened with related-entity sections expanded will now show those sections collapsed. Regenerate forms to pick up the new defaults.
