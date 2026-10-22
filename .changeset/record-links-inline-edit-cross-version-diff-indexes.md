---
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-record-changes": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-explorer-app": patch
---

- `@memberjunction/ng-base-forms`:
  - Extract declarative `[mjRecordLink]` directive (`MjRecordLinkDirective`), `<mj-record-link>` component (`MjRecordLinkComponent`), and body-mounted singleton `MjRecordPreviewPopoverService` so any custom form header, `BaseFormPanel`, or dashboard widget can attach hover-intent record previews, inline Quick Edit with live propagation to virtual display fields, standard/polymorphic FK resolution, and `FormNavigationEvent` navigation. Refactor `<mj-form-field>` and `<mj-record-links>` to share the same DRY infrastructure.
  - Add inline Quick Edit for scalar/value-list/boolean fields inside `<mj-record-preview-popover>` and one-click Quick Unlink for nullable outgoing foreign keys inside `<mj-record-links>`.
- `@memberjunction/ng-record-changes`:
  - Replace the linear 12-bucket spark-bar chart with a **Burst-Aware Cluster Strip (Time-Gap Compression)** that groups irregular changes into active editing sessions separated by compressed quiet-gap indicators (`11 mos quiet`) with per-change color-coded pips and click-to-filter session cards.
  - Add a Cross-Version Diff Comparison workbench (`vA ↔ vB`) to `<mj-record-changes>`, allowing users to compare any two historical snapshots or compare a historical snapshot against the live record state.
- `@memberjunction/codegen-lib`: Prevent foreign keys, polymorphic `RecordID` columns (`EntityIDFieldName` set or `*RecordID`/`*RecordPrimaryKey` naming), and columns on tables with an `MJ: Entities` FK from being auto-selected as `IsNameField`.
- `@memberjunction/ng-explorer-core` & `@memberjunction/ng-explorer-app`: Fix infinite loading screen hang when navigating to an invalid or unmatched URL by handling `NavigationError` / `NavigationCancel` in `ShellComponent.ngOnInit` and falling back to the active workspace tab or landing app when a deep link fails to resolve.
