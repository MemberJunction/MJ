---
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-agents": minor
"@memberjunction/core-actions": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/realtime-runtime": minor
"@memberjunction/ng-artifacts": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
"@memberjunction/codegen-lib": patch
---

Unify governed artifact tools and real-time collaborative workspaces across agents and Explorer viewers:
- Add governed artifact CoreActions and realtime channel / client-tool integrations (`ArtifactWorkspaceChannel`, live Explorer workspace actions, and realtime delegation routing) alongside updated Sage, Query Builder, and Loop agent prompts.
- Add multi-agent live collaboration presence indicators and cursor/region overlays across Markdown, Slide Deck, Whiteboard, and Spreadsheet viewers plus server Yjs relay awareness (`ArtifactCollaborationServer`).
- Resolve session-scoped alpha short IDs (e.g. `"D"`) to canonical `MJ: Artifacts` UUIDs in `ResolveEmbeddedArtifactId` and across `ArtifactToolManager`, `DocumentToolLibrary`, `SlideDeckToolLibrary`, and `SpreadsheetToolLibrary`, with frontend UUID guards before SQL `RunView` lookups.
- Add on-sheet floating charts (`Placement: 'sheet' | 'dock'`), drag/resize handles, comma-separated non-contiguous chart ranges and row/column orientation controls, a full Chart & Range Properties editor modal, and persisted horizontal chart-pane splitter height (`WorkbookSpec.PreferredObjectsPaneHeightPx`) synced across Yjs CRDT, XLSX metadata, and server room checkpoints.
- Add shared `<mj-context-menu>` overlay component and Docs/Slides/Sheets context-menu helpers with full keyboard navigation, viewport clamping, and mobile long-press support.
- Fix Explorer conversation chat change-detection (`NG0100`), suppress redundant `"Open Document"` action chips when an artifact is already opened inline, and prevent duplicate prompt emissions.
