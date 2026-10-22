---
"@memberjunction/ng-record-changes": minor
"@memberjunction/ng-base-forms": minor
"@memberjunction/ng-entity-viewer": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-explorer-core": minor
---

Add 5 record form, grid, version history, and AI overlay capabilities:

1. **Bidirectional `<mj-record-links>` & Universal `<mj-record-preview-popover>` (`@memberjunction/ng-base-forms`)**:
   - Extend `<mj-record-links>` to surface both **Outgoing ("On This Record")** links from populated hard FK and polymorphic FK fields (`EntityField.EntityIDFieldName`) on the open record and **Incoming ("Linked To This")** dependent records from `GetRecordDependencies`, with direction filter tabs (`All` / `On This Record` / `Linked To This`), search, and expandable entity cards.
   - Add `<mj-record-preview-popover>` hover preview card for FK and polymorphic FK links in `<mj-form-field>` and link items in `<mj-record-links>`, displaying the target record's entity badge, display name, primary key, top summary fields, last-updated timestamp, and quick navigation.
2. **Pre-Warmed Toolbar Link Count Badge & Shared Dependency Cache (`@memberjunction/ng-base-forms`)**:
   - Pre-warm `LinkCount` and `LinksSummary` in `MjRecordFormContainerComponent.loadBadgeCounts()` via `MjRecordLinksComponent.PrewarmRecordLinkCount()` backed by a 30s TTL dependency cache shared with `<mj-record-links>`.
3. **In-Form "Time Travel" Historical Version Preview Before Restore (`@memberjunction/ng-record-changes` & `@memberjunction/ng-base-forms`)**:
   - Add `"Preview in Form"` toggle buttons on version cards in `<mj-record-changes>`, broadcasting `FormVersionPreviewState` via `FormRecordRefreshCoordinator`.
   - Render historical version values directly inside `<mj-form-field>` with inline `"Current live: ..."` indicators and 1-click `"Restore this field"` buttons on changed fields, paired with a top **Time-Travel Preview Banner** in `<mj-record-form-container>` featuring `◀ Older` / `Newer ▶` version steppers, `"Restore This Version..."`, and `"Exit Preview"`.
4. **Live `<mj-entity-data-grid>` Row Patching & Non-Disruptive Update Pill (`@memberjunction/ng-entity-viewer`)**:
   - Subscribe `<mj-entity-data-grid>` to `MJGlobal` `BaseEntity.BaseEventCode` (`save`, `delete`, `remote-invalidate`) events matching the grid's entity.
   - Patch updated visible rows in place via `gridApi.applyTransaction({ update })` without resetting scroll, sort, or selection, and surface a non-disruptive floating pill when records are created or deleted.
5. **Active-Record + Links Context in `<mj-chat-agents-overlay>` (`@memberjunction/ng-conversations`, `@memberjunction/ng-base-forms`, `@memberjunction/ng-explorer-core`)**:
   - Enrich `FormCompositionSnapshot` / `FormAgentContext` with `RecordState` (edit mode, dirty fields, conflict state, active time-travel preview) and `Links` (total, outgoing, incoming, top entity groups).
   - Add an `"Ask AI"` button in `<mj-form-toolbar>` that expands the `<mj-chat-agents-overlay>` workspace via `ConversationsRuntime.Instance.Bridge.RequestExpandOverlay()` and displays an **Active Record Context** pill bar in the chat overlay.
