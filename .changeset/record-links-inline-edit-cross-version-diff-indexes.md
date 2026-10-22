---
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-record-changes": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-explorer-app": patch
---

- `@memberjunction/ng-base-forms`: Add inline Quick Edit for scalar/value-list/boolean fields inside `<mj-record-preview-popover>` and one-click Quick Unlink for nullable outgoing foreign keys inside `<mj-record-links>`.
- `@memberjunction/ng-record-changes`: Add a Cross-Version Diff Comparison workbench (`vA ↔ vB`) to `<mj-record-changes>`, allowing users to compare any two historical snapshots or compare a historical snapshot against the live record state.
- `@memberjunction/codegen-lib`: Prevent foreign keys, polymorphic `RecordID` columns (`EntityIDFieldName` set or `*RecordID`/`*RecordPrimaryKey` naming), and columns on tables with an `MJ: Entities` FK from being auto-selected as `IsNameField`.
- `@memberjunction/ng-explorer-core` & `@memberjunction/ng-explorer-app`: Fix infinite loading screen hang when navigating to an invalid or unmatched URL by handling `NavigationError` / `NavigationCancel` in `ShellComponent.ngOnInit`, falling back to the active workspace tab or landing app when a deep link fails to resolve, and supporting `/resource/record/:recordId?Entity=:entityName` query-param record URLs.
