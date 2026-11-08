# MemberJunction Docs, Slides, and Sheets Architecture Guide

This guide documents the shared real-time collaboration core, viewer-scoped live MJ blocks, "MS OLE" inline artifact embedding, server-side agent tool libraries (`BaseArtifactToolLibrary`), and the collaborative **MJ Docs** editor implemented in Wave 1 of [plans/docs-slides-sheets.md](../plans/docs-slides-sheets.md).

---

## 1. Architectural Overview

```mermaid
flowchart TD
    subgraph Browser["Angular Browser Client (@memberjunction/ng-artifacts & @memberjunction/ng-conversations)"]
        Docs["MarkdownArtifactViewerComponent (MJ Docs)"]
        CollabSvc["DocumentCollaborationService (Yjs + Awareness)"]
        ImpExp["DocumentImportExportService (.md / .docx / .pdf)"]
        PluginHost["ArtifactTypePluginViewerComponent (OLE Host)"]
        WbPlugin["WhiteboardArtifactViewerComponent (SupportsInlineEdit = true)"]
    end

    subgraph Server["MJServer (@memberjunction/server)"]
        CollabSrv["ArtifactCollaborationServer (/collaboration/yjs)"]
        Relay["IYjsRoomRelay (InMemoryYjsRoomRelay / RedisYjsRoomRelay)"]
        GqlRes["DocumentCollaborationResolver (GraphQL)"]
    end

    subgraph Core["Shared Core (@memberjunction/core-entities & @memberjunction/ai-agents)"]
        PermEng["ArtifactPermissionEngine + IArtifactPermissionDelegate"]
        LiveEng["DocumentLiveBlockEngine (Viewer RLS/FLS + Freeze/Live)"]
        DocTools["DocumentToolLibrary (@RegisterClass BaseArtifactToolLibrary)"]
        WbTools["WhiteboardToolLibrary (@RegisterClass BaseArtifactToolLibrary)"]
    end

    subgraph Database["SQL Server"]
        Art["MJ: Artifacts (DelegateEntityID, DelegateRecordID)"]
        Ver["MJ: Artifact Versions (Immutable Checkpoints)"]
        Work["MJ: Artifact Working States (YjsState VARBINARY(MAX))"]
        Conv["MJ: Conversations (AnchorType = 'DocBlock')"]
    end

    Docs --> CollabSvc
    Docs --> ImpExp
    Docs --> PluginHost
    PluginHost --> WbPlugin
    CollabSvc <-->|"y-protocols/sync + awareness"| CollabSrv
    CollabSrv <--> Relay
    CollabSrv --> PermEng
    CollabSrv --> Work
    CollabSrv --> Ver
    GqlRes --> LiveEng
    GqlRes --> PermEng
    DocTools --> LiveEng
    PermEng --> Art
    Docs --> Conv
```

---

## 2. Schema & Metadata Foundation (§ 3.1, `O1`, `O2`, `O4`)

1. **`MJ: Artifact Working States` (`__mj.ArtifactWorkingState`)**:
   - Stores transient binary Yjs CRDT state vectors (`YjsState VARBINARY(MAX)`) between immutable `MJ: Artifact Versions` checkpoints.
   - Indexed with a unique constraint `UQ_ArtifactWorkingState_ArtifactID` on `ArtifactID`.
2. **Delegated Host Entity Permissions (`MJ: Artifacts.DelegateEntityID` + `DelegateRecordID`, `O4`)**:
   - Polymorphic foreign key pair decorated with `EntityField.EntityIDFieldName = "DelegateEntityID"` in `metadata/entities/.polymorphic-fk-entity-fields.json`.
   - Evaluated via `ArtifactPermissionEngine.Instance.ResolvePermissions(provider, artifactId, user)` and `IArtifactPermissionDelegate` (`@RegisterClass(BaseArtifactPermissionDelegate, '<EntityName>')`).
   - Built-in `ParentArtifactPermissionDelegate` (`@RegisterClass(BaseArtifactPermissionDelegate, 'MJ: Artifacts')`) allows inline OLE child artifacts (such as an embedded Whiteboard created via `/whiteboard`) to inherit permissions directly from their host Document artifact.
3. **Artifact Type Metadata (`metadata/artifact-types/.artifact-types.json`, `O1`)**:
   - `"Markdown Document"` -> `DriverClass: "MarkdownArtifactViewerPlugin"`, `ToolLibraryClass: "DocumentToolLibrary"`.
   - `"Whiteboard"` -> `DriverClass: "WhiteboardArtifactViewerPlugin"`, `ToolLibraryClass: "WhiteboardToolLibrary"`.
   - `"Presentation"` -> `DriverClass: "SlideDeckArtifactViewerPlugin"`, `ToolLibraryClass: "SlideDeckToolLibrary"`.
   - `"Excel Spreadsheet"` -> `DriverClass: "SpreadsheetArtifactViewerPlugin"`, `ToolLibraryClass: "SpreadsheetToolLibrary"`.

---

## 3. Real-Time Collaboration Service (`ArtifactCollaborationServer`, § 3.2, `O2`, `O3`)

Located in `packages/MJServer/src/collaboration/`:
- **`ArtifactCollaborationServer.ts`**:
  - Handles WebSocket upgrades on `/collaboration/yjs?artifactId=<uuid>`.
  - Authenticates the connecting user via `getUserPayload` and verifies `CanRead` / `CanEdit` via `ArtifactPermissionEngine`.
  - Hydrates room state from `MJ: Artifact Working States.YjsState` (or initializes `Y.Text('content')` from the latest `MJ: Artifact Versions.Content`).
  - Enforces read-only access at the binary frame layer: any `syncStep2` or `update` write frame sent by a client with `CanEdit === false` is dropped before mutating `room.Doc`, returning a `YJS_MESSAGE_CONTROL` (`readonly-rejected`) frame.
  - Subscribes to `ArtifactPermissionEngine.Instance.OnPermissionsChanged` to immediately downgrade active editors to read-only (`YJS_MESSAGE_PERMISSION_STATUS` with `canEdit: false`) or close sockets (`4403`) when `CanRead` is revoked mid-session.
  - Periodically checkpoints binary updates to `MJ: Artifact Working States` and compacts into a new `MJ: Artifact Versions` record on explicit save, last-client disconnect, or server-side agent tool execution.
- **`YjsRoomRelay.ts` (`O3`)**:
  - `IYjsRoomRelay` interface with `InMemoryYjsRoomRelay` (default) and `RedisYjsRoomRelay` (using `RedisLocalStorageProvider.SubscribeToChannel` / `PublishMessageAndWait` on `yjs:room:<artifactId>`).

---

## 4. Viewer-Scoped Live MJ Blocks & Freeze Semantics (`DocumentLiveBlockEngine`, § 3.4, `O5`)

Located in `packages/MJCoreEntities/src/custom/DocumentLiveBlockEngine.ts`:
- Parses and serializes fenced `:::mj-block` directives inside Markdown documents.
- Supports `EntityView`, `SavedQuery`, `DashboardPart`, `InteractiveComponent`, and `Artifact` block kinds.
- **Viewer-Scoped Security**:
  - Executes `RunView` and `RunQuery` using the viewing user's `UserInfo`.
  - Strips any parameter whose metadata declares `IsServerSet === true` (or matches server-only parameter prefixes) before execution so untrusted block JSON can never override server-bound security parameters.
  - Projects output columns through Field-Level Security (`CanUserViewField`) so restricted fields are never leaked.
- **Explicit `Live` vs. `Frozen` Mode (`O5`)**:
  - Blocks default to `Mode: "Live"`.
  - Freezing a block requires `acknowledgeSecurityWarning === true` (enforced both in `MarkdownArtifactViewerComponent`'s confirmation modal and in `DocumentLiveBlockEngine.FreezeBlock`), recording `FrozenAt`, `FrozenByUserID`, and `FrozenByUserName` provenance metadata.

---

## 5. "MS OLE" Inline Artifact Blocks & Whiteboard Inline Editing (§ 3.4.1 / D12)

- `BaseArtifactViewerPluginComponent` (`@memberjunction/ng-artifacts`) exposes:
  - `SupportsInlineEdit: boolean` (default `false`)
  - `@Output() ContentCommitted = new EventEmitter<string>()`
- `WhiteboardArtifactViewerComponent` (`@memberjunction/ng-conversations`) sets `SupportsInlineEdit = true`.
  - When `[readonly]="true"`, it renders `<mj-whiteboard-snapshot>`.
  - When `[readonly]="false"` (toggled via **Edit Inline (OLE Canvas)** inside a Document or in the Artifact Viewer Panel), it mounts `<mj-realtime-whiteboard-host [State]="EditableBoardState" [ShowFocusToggle]="false">` and emits `ContentCommitted` with `state.ToJSON()`.

---

## 6. Server-Side Agent Tool Libraries (`BaseArtifactToolLibrary`, § 3.6)

Located in `packages/AI/Agents/src/artifact-tools/`:
- **`DocumentToolLibrary`** (`@RegisterClass(BaseArtifactToolLibrary, 'DocumentToolLibrary')`):
  - Inspection tools: `get_outline`, `get_section`, `get_blocks`, `search_blocks`, `grep`, `get_lines`.
  - Mutation tools (with optional `expectedRevisionHash` SHA-256 optimistic concurrency check): `insert_block_after`, `replace_block`, `delete_block`, `upsert_table`, `insert_live_block`, `embed_artifact_block`, `propose_suggestion`.
- **`WhiteboardToolLibrary`** (`@RegisterClass(BaseArtifactToolLibrary, 'WhiteboardToolLibrary')`):
  - Inspection & layout tools: `get_board_summary`, `list_elements`, `upsert_nodes`, `connect_nodes`, `add_sticky_notes`, `delete_elements`, `auto_layout`.
