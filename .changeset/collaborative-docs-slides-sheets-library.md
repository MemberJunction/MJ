---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/server": minor
"@memberjunction/ai-agents": minor
"@memberjunction/excel-addin": minor
"@memberjunction/excel-addin-server": minor
"@memberjunction/ng-artifacts": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-shared": minor
"@memberjunction/ng-base-application": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
"@memberjunction/cli": patch
---

Add collaborative MJ Documents, MJ Presentations (16:9 structured Slide Decks), MJ Spreadsheets (formulas, `=MJ.QUERY()` live governed tables, range charts, and round-trip `.xlsx` / `.csv` import & export), inline OLE Whiteboard editing, the Excel Office Add-in (`@memberjunction/excel-addin` + `@memberjunction/excel-addin-server`), and the unified **Library** application (`LibraryResource` + `<mj-library-workspace>`):

- **Real-time Collaboration & Governance (`@memberjunction/core-entities`, `@memberjunction/server`, `@memberjunction/ai-agents`)**: Yjs CRDT collaboration rooms over WebSocket (`ArtifactCollaborationServer`), viewer-scoped permission delegation (`ArtifactPermissionEngine` across ownership, host-entity delegates, direct grants, and cascaded collection grants), governed document blocks (`EntityView`, `SavedQuery`, `DashboardPart`, `Artifact`, `InteractiveComponent`), `SlideDeckEngine`, and `SpreadsheetEngine`.
- **Collaborative Artifact Viewers (`@memberjunction/ng-artifacts`, `@memberjunction/ng-conversations`)**: Rich Markdown document editor with Suggesting mode and word-level tracked changes, `.docx` / `.pptx` / `.xlsx` import and export services, interactive 16:9 Slide Deck studio and presenter view, collaborative Spreadsheet studio, and explicit Save/Commit inline Whiteboard canvas editing.
- **Dedicated `Library` Application & Explorer Routing (`@memberjunction/ng-conversations`, `@memberjunction/ng-base-application`, `@memberjunction/ng-shared`, `@memberjunction/ng-explorer-core`)**: Ships a dedicated header-pinned `Library` application (`DefaultForNewUser: true`) alongside an untouched `File Browser`, preserves `Collections` and user-scoped `Agent Activity` (with an authorized `All Users` scope toggle and `Tasks` -> `Agent Activity` nav migration via `MOVED_NAV_ITEMS`) in `Chat`, removes arbitrary row caps on shared items, queries exact per-artifact latest versions, bounds remote Connected Drive text previews to 100 KB, and adds version-aware + overwrite-safe Connected Drive exports.

**Upgrade & Environment Notes:**
- **Required Server HMAC Secrets**: Configure dedicated `>= 32`-character secrets on `MJAPI` for collaboration WebSocket tickets (`MJ_ARTIFACT_COLLAB_HMAC_SECRET`, e.g. `openssl rand -hex 32`) and frozen live-block snapshots (`MJ_FROZEN_BLOCK_HMAC_SECRET`, e.g. `openssl rand -hex 32`). Both endpoints fail closed if their secret is unset or shorter than 32 characters; `MJServer` logs a startup warning when either secret is missing, and collaborative viewers display a live-sync unavailable notice while remaining safely read-only.
- **Reverse-Proxy WebSocket URLs & Multi-Node Routing (`MJAPI_PUBLIC_URL`)**: `DocumentCollaborationService` derives the Yjs WebSocket endpoint directly from the browser's configured GraphQL URL unless `MJAPI_PUBLIC_URL` (`publicUrl`) is explicitly set on `MJAPI`, preventing `ws://localhost:4000` fallbacks behind reverse proxies. Multi-node `MJAPI` clusters should configure sticky WebSocket routing unless a distributed `ITicketReplayStore` is registered via `SetTicketReplayStore`.
- **Existing Users & `Library` App Visibility**: New users receive the `Library` application automatically via `DefaultForNewUser: true`. Existing users who already customized their `MJ: User Applications` rows retain their existing app selections; they can enable `Library` in the Explorer App Switcher / Settings, or administrators can provision `UserApplication` rows (`ApplicationID = 'DB6B9D62-CB8E-417D-8A04-4CBC5F65CD9A'`) for pre-existing active users as a one-time post-upgrade step.

Application metadata (`metadata/applications`), authorization metadata (`metadata/authorizations`, `metadata/authorization-roles`), entity metadata (`metadata/entities`), and artifact type metadata (`metadata/artifact-types`) change, so the release requires a consolidated metadata sync migration.
