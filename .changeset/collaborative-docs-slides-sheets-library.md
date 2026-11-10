---
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
---

Add collaborative MJ Documents, MJ Presentations (16:9 structured Slide Decks), MJ Spreadsheets (formulas, `=MJ.QUERY()` live governed tables, range charts, and round-trip `.xlsx` / `.csv` import & export), inline OLE Whiteboard editing, the Excel Office Add-in (`@memberjunction/excel-addin` + `@memberjunction/excel-addin-server`), and the unified **Library** application (`LibraryResource` + `<mj-library-workspace>`):

- **Real-time Collaboration & Governance (`@memberjunction/core-entities`, `@memberjunction/server`, `@memberjunction/ai-agents`)**: Yjs CRDT collaboration rooms over WebSocket (`ArtifactCollaborationServer`), viewer-scoped permission delegation (`ArtifactPermissionEngine` across ownership, host-entity delegates, direct grants, and cascaded collection grants), governed document blocks (`EntityView`, `SavedQuery`, `DashboardPart`, `Artifact`, `InteractiveComponent`), `SlideDeckEngine`, and `SpreadsheetEngine`.
- **Collaborative Artifact Viewers (`@memberjunction/ng-artifacts`, `@memberjunction/ng-conversations`)**: Rich Markdown document editor with Suggesting mode and word-level tracked changes, `.docx` / `.pptx` / `.xlsx` import and export services, interactive 16:9 Slide Deck studio and presenter view, collaborative Spreadsheet studio, and explicit Save/Commit inline Whiteboard canvas editing.
- **Dedicated `Library` Application & Explorer Routing (`@memberjunction/ng-conversations`, `@memberjunction/ng-base-application`, `@memberjunction/ng-shared`, `@memberjunction/ng-explorer-core`)**: Ships a dedicated header-pinned `Library` application alongside an untouched `File Browser`, auto-provisions newly shipped header-pinned default applications for existing users, preserves `Collections` and `Agent Activity` (with `Tasks` -> `Agent Activity` nav migration) in `Chat`, scopes Library workspace queries server-side, bounds remote Connected Drive text previews to 100 KB, and adds version-aware + overwrite-safe Connected Drive exports.

Application metadata (`metadata/applications`) and artifact type metadata (`metadata/artifact-types`) change, so the release requires a consolidated metadata sync migration.
