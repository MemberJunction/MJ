---
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/graphql-dataprovider": minor
---

feat(explorer): Identity Card profile dialog + Admin app reorganization + Developer Tools suite

**Profile dialog (replaces legacy Settings)** — A focused single-pane Identity Card with slide-in panels for photo and theme editing, functional notification channel toggles (saved via UserInfoEngine), role chips, account info, and sign-out. Drops the redundant Apps tab and the dead Appearance placeholder.

**About MemberJunction dialog** — Added to the avatar menu's System group. Shows the framework version, three quick stats (entities/applications/queries), the connected user, a "Connected to <host>" line, and an expandable diagnostics section with a copy-to-clipboard helper. A small "MemberJunction · v<version>" line is also shown on the loading screen.

**User-menu cleanup** — Removed the Toggle Developer Mode / Log Layout (Debug) / Inspect App State items. The two debug items had richer replacements as full dashboards in Admin → Developer Tools. `DeveloperModeService` itself remains for future per-record dev affordances.

**Admin app reorganization (10 → 4 top-nav)** — Each top-nav item is now a container resource that owns its own left-nav of sub-sections via dynamic component instantiation, with URL deep-linking through NavigationService (`?section=<id>`). Containers detach + reattach sub-component views instead of destroying them, so Event Monitor's capture, GraphQL Console history, scroll positions, and search inputs persist across switches.

  - **Identity & Access**: Users · Roles · Apps · App Roles · Permissions · API Keys
  - **Data & Schema**: ERD · Query Browser · Database Designer
  - **Monitoring**: Diagnostics · SQL Logging
  - **Developer Tools**: GraphQL Console · Event Monitor · Class Registry · Lazy Loading · Settings Explorer · App State · Layout

**Developer Tools suite (7 inspectors)**:

  - **GraphQL Console** with `mj-code-editor` (graphql + json syntax highlighting), three-tab sidebar (History · Entities · Schema), introspection-driven Schema explorer that detects introspection-disabled and renders a clean lock-icon panel instead of a stack trace, Entities tab listing every `Metadata.Provider.Entities` with metadata-driven CRUD/RunView template generation (uses `getGraphQLTypeNameBase` + `FieldMapper.MapFieldName` so `__mj_*` columns are correctly emitted as `_mj__*` with inline comments), query history with favorites and copy-as-cURL, resizable vertical + horizontal splitters, default replace / shift-click append insertion behavior, Cmd/Ctrl+Enter to run.
  - **Event Monitor** with replay-enabled live tail (`GetEventListener(true)`), sortable column headers, distinct-attribute dropdown filters (Type / Component / Code), pulse indicator, pause/resume/clear, empty-payload-aware expansion.
  - **Class Registry** browser grouped by base class with priority + winner/shadowed badges to surface override conflicts at a glance.
  - **Lazy Loading** chunk inspector with progress bar, filter chips, expandable cards listing the registrations a chunk brings in, and a Force Load button to preload a chunk on demand.
  - **Settings Explorer** for `MJ: User Settings` + `MJ: Instance Configurations` with type detection, JSON-aware previews, and a split detail pane.
  - **App State Inspector** + **Layout Inspector** — read-only JSON viewers using `mj-code-editor` with refresh / copy / download actions.

All Developer Tools preferences persist per-user via `UserInfoEngine` under the `MJ.DevTools.<scope>` key prefix — search inputs, dropdown selections, sort order, expanded groups, splitter sizes, GraphQL query history, and active sub-sections.

**Other**:
  - Re-exported `PACKAGE_VERSION` from `@memberjunction/graphql-dataprovider`'s public API for use in About + loading screen.
  - Extended `LazyModuleRegistry` with public `GetSnapshot()` + `ForceLoad()` methods + globalThis publish so diagnostic tools in `ng-dashboards` can introspect lazy state without creating a hard package dependency on `ng-explorer-core`.
  - Added Dialog Button Placement convention to `packages/Angular/CLAUDE.md` (Save / Submit on the LEFT, Cancel on the RIGHT — opposite of the Windows convention).
  - Admin app metadata (`.admin-application.json`) updated to the new 4-item top-nav structure.
