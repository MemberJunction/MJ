---
"@memberjunction/ng-artifacts": patch
---

Emit `DraftContentChanged` from `MarkdownArtifactViewerComponent` on local markdown and `contenteditable` DOM edits, flush pending viewer edits before working-state autosave and explicit version saves in `MJEmbeddedDocPanelComponent`, disable `Save Version` when no changes are pending, and surface server autosave failures cleanly instead of reporting a synced draft.
