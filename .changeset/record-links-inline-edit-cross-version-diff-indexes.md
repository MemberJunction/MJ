---
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-ui-components": patch
"@memberjunction/ng-record-changes": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-explorer-app": patch
---

- `@memberjunction/ng-base-forms`:
  - Extract declarative `[mjRecordLink]` directive (`MjRecordLinkDirective`), `<mj-record-link>` component (`MjRecordLinkComponent`), and body-mounted singleton `MjRecordPreviewPopoverService` so any custom form header, `BaseFormPanel`, or dashboard widget can attach hover-intent record previews, inline Quick Edit with live propagation to virtual display fields, standard/polymorphic FK resolution, and `FormNavigationEvent` navigation. Refactor `<mj-form-field>` and `<mj-record-links>` to share the same DRY infrastructure.
  - Upgrade `<mj-record-preview-popover>` (`MjRecordPreviewPopoverComponent`) with an Option A header micro-cluster (Copy ID pill, `[✎]` Quick Edit, `[↗]` New Tab), clickable record title (`Record →`), auto-spanning wide fields (`grid-column: 1 / -1`), contextual `Cancel`/`Save` footer only in edit mode, cancellable `BeforeQuickEditSave` / `AfterQuickEditSaved` events, and 3-tier `@RegisterClass(MjRecordPreviewPopoverComponent, ...)` / `ClassFactory` runtime specialization (`ResolveRecordPreviewPopoverType`).
  - Add one-click Quick Unlink for nullable outgoing foreign keys inside `<mj-record-links>`.
- `@memberjunction/ng-ui-components`:
  - Add general-purpose, zero-domain-knowledge `<mj-burst-cluster-strip>` (`MJBurstClusterStripComponent`) for irregular time-series event streams with generic `[Items]` or raw `[Data]` + `[FieldMap]` binding, configurable grouping & resolution (`Resolution`: `'auto' | 'session' | 'day' | 'week' | 'month' | 'quarter' | 'year'`, `CoalesceStrategy`: `'adaptive-era' | 'merge-closest'`, `SessionGapHours`, `GroupSameCalendarDay`, `MaxClusters`, `EraZoomThreshold`), semantic Click-to-Zoom on multi-year era cards, rich imperative methods, and cancellable `Before*` / `After*` events.
- `@memberjunction/ng-record-changes`:
  - Consume `<mj-burst-cluster-strip>` from `@memberjunction/ng-ui-components` to replace the linear 12-bucket spark-bar chart with a **Burst-Aware Cluster Strip (Time-Gap Compression)** with multi-year adaptive era zoom and click-to-filter session cards.
  - Add a Cross-Version Diff Comparison workbench (`vA ↔ vB`) to `<mj-record-changes>`, allowing users to compare any two historical snapshots or compare a historical snapshot against the live record state.
- `@memberjunction/codegen-lib`: Prevent foreign keys, polymorphic `RecordID` columns (`EntityIDFieldName` set or `*RecordID`/`*RecordPrimaryKey` naming), and columns on tables with an `MJ: Entities` FK from being auto-selected as `IsNameField`.
- `@memberjunction/ng-explorer-core` & `@memberjunction/ng-explorer-app`: Fix infinite loading screen hang when navigating to an invalid or unmatched URL by handling `NavigationError` / `NavigationCancel` in `ShellComponent.ngOnInit` and falling back to the active workspace tab or landing app when a deep link fails to resolve.
