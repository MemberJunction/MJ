---
"@memberjunction/ai-agents": minor
"@memberjunction/core": minor
"@memberjunction/core-actions": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/ng-artifacts": minor
"@memberjunction/ng-auth-services": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-explorer-app": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-shared": minor
"@memberjunction/server": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Harden governed artifacts, live collaboration, public guest sharing, and agent artifact tools (`NW-1` through `NW-6` plus adversarial security & correctness fixes):

- **Server & Database Read/Write Security**: Register `PostRunView`-protected artifact, collection, and anchored conversation entities at module load (`MJCoreEntitiesServer`, `MJServer`) and in `agent-data-policy-guard`; fail closed on non-system SQL `Aggregates` and differential/cache fast paths in `GenericDatabaseProvider`; harden `MJCollectionEntityServer` reparenting (`CanDelete` + `oldParentId`/`newParentId` `CanEdit`), collection ancestry cascading, grantee self-delete ("Leave shared item"), `ResolverBase` `TokenHash` redaction, owner-scoped `ListArtifactGuestShareLinks` query, and `RealtimeClientSessionResolver` `AuthorizeSessionAccess` magic-link IDOR enforcement.
- **Public Guest Sharing & Viewer Sandboxing (`NW-1`)**: Add `MJArtifactGuestShareLink` migration (`V202611151200`), pre-auth `POST /guest-share/resolve` + `@Public() ResolvePublicArtifactGuestShare`, fail-closed HMAC frozen snapshot verification (`SnapshotVerified === true` required for `.pptx` export), nonce-scoped `PrintHtmlInSandboxedIframe` (`allow-modals allow-scripts` without `allow-same-origin`), raster image/whiteboard sandboxed print, URL scheme validation in `LibraryRemoteDrivePane`, and `[GuestSnapshotMode]` offline viewer isolation across Docs, Slides, and Sheets.
- **Agent Artifact Tools (`create_artifact` `InitialOperations` & `NW-3`–`NW-6`)**: Forward and atomically execute `initialOperations` / `InitialOperations` in `ArtifactToolManager.handleCreateArtifactTool` (both persisted and in-memory modes); enforce `ValidateEmbeddedArtifactAccess` when accepting document suggestions; wire production `RegisterServerArtifactFileBytesLoader` / `RegisterClientArtifactFileBytesLoader` and preserve `File`-mode `.xlsx` configuration metadata across suggestion/comment edits; enforce most-restrictive `ProtectedRanges` evaluation; and fix `NW-3` suggestion anchors/tabs and `NW-6` viewer initialization races (`ViewMode`, `NavigationAnchor`, Whiteboard selection/navigation).
- **CI, Standards, Documentation & Test Coverage**: Resolve all `check:guards`, `check:standards`, `check:dynamic-replace`, `check:codegen-tail`, `check:esm`, and `mj sync validate` checks; sync Docs/Slides/Sheets tool counts (`26 / 29 / 47`); and expand unit, HappyDOM, and live integration (`IT170`, `IT171`) coverage.
