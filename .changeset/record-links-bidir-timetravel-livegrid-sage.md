---
"@memberjunction/ng-record-changes": minor
"@memberjunction/ng-base-forms": minor
"@memberjunction/ng-entity-viewer": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-shared": minor
---

Add 5 record form, grid, version history, and AI overlay capabilities plus human-friendly record tab/browser titles:

1. **Bidirectional `<mj-record-links>` & Universal `<mj-record-preview-popover>` (`@memberjunction/ng-base-forms`)**:
   - Extend `<mj-record-links>` to surface both **Outgoing ("On This Record")** links from populated hard FK and polymorphic FK fields (`EntityField.EntityIDFieldName`) on the open record and **Incoming ("Linked To This")** dependent records from `GetRecordDependencies`, with direction filter tabs (`All` / `On This Record` / `Linked To This`), search, and expandable entity cards.
   - Add `<mj-record-preview-popover>` hover preview card for FK and polymorphic FK links in `<mj-form-field>` and link items in `<mj-record-links>`, displaying the target record's entity badge, display name, copyable abbreviated primary key pill, top summary fields, last-updated timestamp, and quick navigation.
2. **Pluggable Form Toolbar Button Registry & Pre-Warmed Link Count Badge (`@memberjunction/ng-base-forms`)**:
   - Introduce `BaseFormToolbarButton` and `FormToolbarButtonRegistry` (`@RegisterClass(BaseFormToolbarButton, buttonKey)`) supporting entity-scoped, pattern-scoped, and global custom toolbar buttons with `Prewarm` / `RefreshState` / `Execute` lifecycles and priority-aware subclass overrides.
   - Pre-warm `LinkCount` and `LinksSummary` when the Links button is pinned for the current user, backed by a 30s TTL dependency cache shared with `<mj-record-links>`.
3. **World-Class `<mj-record-changes>` Drawer & In-Form "Time Travel" Historical Version Preview (`@memberjunction/ng-record-changes` & `@memberjunction/ng-base-forms`)**:
   - Redesign `<mj-record-changes>` header to show `EntityInfo.DisplayNameOrName`, a compact copyable ID pill, a collapsible Version Labels accordion, and an interactive SVG **Activity Over Time** sparkline bar chart.
   - Add `"Preview in Form"` toggle on version cards in `<mj-record-changes>`, closing the drawer so the form is unobstructed, rehydrating all stored snapshot fields from `FullRecordJSON` onto the entity record (so calculated and dependent fields update live), and rendering a floating glassmorphic **Time-Travel Dock** in `<mj-record-form-container>`.
4. **Live `<mj-entity-data-grid>` Row Patching & Non-Disruptive Update Pill (`@memberjunction/ng-entity-viewer`)**:
   - Subscribe `<mj-entity-data-grid>` to `MJGlobal` `BaseEntity.BaseEventCode` (`save`, `delete`, `remote-invalidate`) events matching the grid's entity.
   - Patch updated visible rows in place via `gridApi.applyTransaction({ update })` without resetting scroll, sort, or selection, and surface a non-disruptive floating pill when records are created or deleted.
5. **Active-Record + Links Context in `<mj-chat-agents-overlay>` (`@memberjunction/ng-conversations`, `@memberjunction/ng-base-forms`, `@memberjunction/ng-explorer-core`)**:
   - Enrich `FormCompositionSnapshot` / `FormAgentContext` with `RecordState` (edit mode, dirty fields, conflict state, active time-travel preview) and `Links` (total, outgoing, incoming, top entity groups).
   - Add an `"Ask AI"` button in `<mj-form-toolbar>` that expands the `<mj-chat-agents-overlay>` workspace via `ConversationsRuntime.Instance.Bridge.RequestExpandOverlay()` and displays an **Active Record Context** pill bar in the chat overlay.
6. **Entity Display Name + Abbreviated UUID for Record Tab Headers & Browser Titles (`@memberjunction/ng-shared`, `@memberjunction/ng-explorer-core`, `@memberjunction/ng-base-forms`)**:
   - Add `FormatEntityRecordDisplayTitle` and `ResolveRecordTabDisplayTitle` so records without a human-readable `NameField` (or whose `NameField` resolves to a raw UUID, such as `MJ: Process Run Details`) display `<Entity Display Name> · <Abbreviated UUID>` (e.g., `Process Run Details · 9FAF60…C577`) across workspace tabs, browser window titles, origin breadcrumbs, and record link/preview cards.
