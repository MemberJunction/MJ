# Docs, slides and sheets

**What this is.** One plan to give every MemberJunction host documents, slide decks and spreadsheets that people and agents edit together, live, built in three phases on one shared core. A separate track adds an Excel add-in and a Google Sheets add-on that pull MJ queries and views into those tools, under the same sign-in people use for MJ Explorer.

| Phase | Delivers | For |
|---|---|---|
| 1 | The shared core, and **Docs** | Minutes, policies, briefs and proposals written by people and agents in the same document |
| 2 | **Slides** | Board decks and member presentations, with live MJ data on the slides |
| 3 | **Sheets** | Budgets, rosters and trackers, with ranges filled from MJ queries and views |
| A | **Excel add-in, Google Sheets add-on**, and generated files that carry them. The Excel add-in's first release (**Open in Excel** plus in-pane browse & insert) **shipped in [#6214](https://github.com/MemberJunction/MJ/pull/6214)** (§ 7.1); Excel custom functions and the Google Sheets add-on remain | MJ entities, views and queries inside the spreadsheets people already use |

**Why.** Associations on MemberJunction, starting with [BizApps Collaboration](https://github.com/MemberJunction/bizapps-collaboration)'s spaces, need somewhere to write and share documents without renting a separate tool for each relationship. Word and Google Docs stay: MJ imports from them, exports to them and links to them. What MJ adds that they can't:

- **Blocks (live MJ data + "OLE" Artifact plugins).** A document, slide or sheet embeds two kinds of live blocks through one `@RegisterClass(BaseDocumentBlock, '<Kind>')` registry:
  1. **Live MJ data blocks** (`Query`, `View`, `Record`, `Chart`, `Dashboard`, `SheetRange`) that query MJ directly under the reader's permissions.
  2. **Artifact blocks (`MJ: Artifacts` as "MS OLE" objects — e.g., an inline Whiteboard or Interactive Component)** that bring their own persistence and version history (`MJ: Artifact Versions`), permissions, pluggable viewer/editor UI (`BaseArtifactViewerPluginComponent`), and agent read/write tools (`BaseArtifactToolLibrary`) into the middle of a doc, slide, or sheet.
- **Agents as co-editors.** An agent edits the same live document as the people in it, a paragraph, slide region, cell, or embedded artifact (such as a Whiteboard) at a time, and anyone can undo what it did.
- **One permission model.** The same row- and field-level rules that govern MJ Explorer govern every document, block and add-in.

Collaboration keeps documents out of its own scope: its notes stay light, and becoming a document-management system is one of its non-goals ([its plan](https://github.com/MemberJunction/bizapps-collaboration/blob/next/plans/plan.md), D33 and the non-goals list; reinforced when [bizapps-collaboration#32](https://github.com/MemberJunction/bizapps-collaboration/pull/32) removed the interim `SpacePage` table). So this is core work that Collaboration, Committees, Contracts, Marketing and every other app consume, the way they consume the whiteboard.

**Checked against:** MJ `next` on 2026-11-08 (after [#6214](https://github.com/MemberJunction/MJ/pull/6214), [#6281](https://github.com/MemberJunction/MJ/pull/6281), [#6301](https://github.com/MemberJunction/MJ/pull/6301), and [#6388](https://github.com/MemberJunction/MJ/pull/6388) merged). Paths are under `packages/` unless they start with `plans/`, `guides/`, `metadata/` or `.claude/`.

**Status:** draft for review. D1 to D12 are Amith's decisions from 2026-10-30 and 2026-11-08.

## Contents

1. [What MJ already has, and what it lacks](#1-what-mj-already-has-and-what-it-lacks)
2. [Decisions](#2-decisions)
3. [The shared core](#3-the-shared-core)
4. [Phase 1: Docs](#4-phase-1-docs)
5. [Phase 2: Slides](#5-phase-2-slides)
6. [Phase 3: Sheets](#6-phase-3-sheets)
7. [Track A: Excel add-in, Google Sheets add-on, generated files](#7-track-a-excel-add-in-google-sheets-add-on-generated-files)
8. [Security](#8-security)
9. [Order and delivery](#9-order-and-delivery)
10. [Open questions](#10-open-questions)
11. [Not doing](#11-not-doing)
12. [Side finding (resolved)](#12-side-finding-resolved)

## 1. What MJ already has, and what it lacks

### 1.1 Already there

| Piece | Where | What it gives this plan |
|---|---|---|
| Artifacts and their versions | `MJ: Artifacts`; `MJ: Artifact Versions` (`Content`, `Configuration`, `ContentHash`, `ContentMode` `Text` or `File`, `FileID`) | The document record, its saved versions, and the persistence layer for embedded "OLE" Artifact blocks (§ 3.4) |
| Sharing | `MJ: Artifact Permissions` (`CanRead`, `CanEdit`, `CanDelete`, `CanShare`, per user) | A starting point; see § 3.3 |
| Folders | `MJ: Collections` (a tree, with permissions); browser and share dialog in `Angular/Generic/conversations/src/lib/components/collection/` | Where documents live in Explorer |
| Artifact types & viewer plugins | `metadata/artifact-types`: Markdown Document, Word Document, PDF, Excel Spreadsheet, CSV, Data Snapshot, Whiteboard, Component, SVG, Media; `Angular/Generic/artifacts` (`BaseArtifactViewerPluginComponent`, `ArtifactTypePluginViewerComponent`, `GetCurrentStateSnapshot()`) | Both the top-level document types this plan upgrades (D4) and the pluggable "OLE" object types that embed inside Docs, Slides, and Sheets (D12, § 3.4) |
| Type inheritance | `AI/Agents/src/ArtifactToolManager.ts` walks a type's `ParentID` chain for its tools; `artifact-viewer-panel.component.ts` does the same for viewers | A child type inherits until it overrides |
| Agent tools per type | `AI/CorePlus/src/artifact-tool-library.ts` (`BaseArtifactToolLibrary`); `AI/Agents/src/artifact-tools/` | The seam the write tools plug into (§ 3.6) |
| Whiteboard | `Angular/Generic/whiteboard` (`WhiteboardState`, `<mj-realtime-whiteboard-host [ShowFocusToggle]="false">`, `<mj-whiteboard-snapshot>`, focus-scoped keyboard shortcuts, `BuildSceneDelta`, `BuildSceneSummary`, `ApplyWhiteboardAgentTool`, `BuildWhiteboardExportSvg`/`Html`) + `WhiteboardArtifactViewerPlugin` in `Angular/Generic/conversations` | Both the pattern for granular agent edits and the flagship embeddable "OLE" Artifact block inside Docs and Slides (§ 3.4.1) |
| Anchored Conversations & Record Comments | `MJ: Conversations` (`LinkedEntityID`, `LinkedRecordID`, `AnchorType` `CHECK` already including `'DocBlock'`, `'SlideRegion'`, and `'SheetRange'`, `AnchorKey`, `AnchorMetadata` typed as `IConversationAnchorMetadata`, `IsResolved`, `ResolvedByUserID`, `ResolvedAt`); RLS/FLS read & write hooks (`AnchoredConversationSecurity`, `RestrictedFieldCommentClassifier`) and `@mention` notification dispatch (`DispatchConversationMentionNotifications`) — **shipped in [#6281](https://github.com/MemberJunction/MJ/pull/6281)** | Comment threads schema, RLS/FLS security, and `@mention` notifications already on `next` (D6, § 3.5) |
| Block renderers | `Angular/Generic/` `query-viewer`, `entity-viewer`, `entity-card`, `dashboard-viewer`, `charts`, `react` (interactive components), `artifacts` (`<mj-artifact-type-plugin-viewer>`) | Most blocks are wiring, not new UI |
| Text | `MarkdownCore` (marked, custom extensions, a token AST); `Angular/Generic/markdown`; `Angular/Generic/composer` (@mentions) | Saved form, rendering, mentions |
| Files, import, export | `MJStorage` drivers (Google Drive, SharePoint, Box, Dropbox, AWS, Azure, Google Cloud); `DocumentParsing` (PDF, Word, spreadsheets to text); `mammoth`, `turndown` and `docx` (in `Actions/CoreActions`, with ordered-list decimal numbering fixed in [#6388](https://github.com/MemberJunction/MJ/pull/6388)); `exceljs` 4.4; `papaparse`; `pdfkit` | Import, export, linked documents |
| History | `VersionHistory` (labels, restore); Record Changes; `@codemirror/merge` | Restore and diff |
| Theme | `ThemeEngine`: the full `--mj-*` token set from a few brand seeds | Slide themes (§ 5) |
| Transport | MJServer's `ws` and `graphql-ws`; routes through `ApiRoute()`; REST in `MJServer/src/rest/RESTEndpointHandler.ts` (`POST /views/:entityName`, `POST /views/batch`, `POST /queries/run`, `GET /metadata/entities`) | The sync endpoint (§ 3.1) and the data API (§ 3.7) |
| Sign-in for outside clients | `AI/MCPServer/src/auth/OAuthProxyRouter.ts`: authorization-server metadata, dynamic client registration, PKCE, sign-in through the host's identity provider, a consent page with API scopes, MJ-issued tokens; providers in `AuthProviders/src/providers` (MSAL, Auth0, Okta, Google, WorkOS, Cognito, magic link, host identity) | A later option for the Google add-on (§ 7.2) |
| Per-user API keys | `APIKeys/Engine` (`CreateAPIKey`, `RevokeAPIKey`, expiry, hashed storage); MJAPI resolves an `X-API-Key` to its user, with its scopes and row filters (`MJServer/src/context.ts`); a key with scopes is denied everything outside them (`defaultBehaviorNoScopes: 'deny'`); GraphQL `RunViewByID`, `RunDynamicView` and `GetQueryData` check `view:run` and `query:run` | The Excel add-in's credential (D11) |
| Explorer pages outside the app shell & Generic Office sign-in panel | `claims/redeem`, `oauth/callback` and `office/connect` in `Angular/Explorer/explorer-core` + `standalone-routes.ts` in `Angular/Explorer/explorer-app`; router-free `<mj-office-connect-panel>` in `Angular/Generic/export-service` | Any MJ Angular host can mount the add-in consent page (§ 7.1, shipped in #6214) |
| Excel add-in & server extension | `OfficeAddins/Excel` (`@memberjunction/excel-addin`) and `OfficeAddins/ExcelServer` (`@memberjunction/excel-addin-server`): workbook contract, `ExcelAddin.*` Remote Operations, ECDH/AES-GCM sign-in handoff, Office.js task pane, unified **Export ▾** menu (`Open in Excel` + snapshot export) in `entity-data-grid` and `query-data-grid` | Track A's Excel foundation, already on `next` (§ 7.1, #6214) |
| Server Extensions | `ServerExtensionsCore`: a package mounts its own routes under `MJAPI_BASE_PATH`, configured in `mj.config.cjs` `serverExtensions` (`guides/SERVER_EXTENSIONS_GUIDE.md`) | Hosting the add-in on each MJ host |
| Remote Operations | `BaseRemotableOperation`: one typed call site on browser and server, routed over GraphQL; a code-only operation needs no metadata row (`guides/REMOTE_OPERATIONS_GUIDE.md`) | Every new browser-to-server call in this plan |
| Server-set query parameters | `MJ: Query Parameters.IsServerSet` | A block or add-in never sets these (§ 8) |

### 1.2 Missing

1. **A rich-text editor.** None in MJ or any BizApps repo; CodeMirror is there for code.
2. **Live multi-user editing.** No shared real-time model anywhere. The whiteboard is single-user.
3. **Agent write tools for artifacts.** Every `BaseArtifactToolLibrary` is read-only today: `TextToolLibrary` has `get_lines` and `grep`; `DocxToolLibrary` has `get_text`, `get_sections`, `get_lines`, `get_html` and `search_text`; `ExcelToolLibrary` has `get_sheets`, `get_sheet_data`, `get_formulas`, `aggregate_column` and `search_cells`. (Whiteboard already has `ApplyWhiteboardAgentTool` in `@memberjunction/ng-whiteboard`, which needs a `WhiteboardToolLibrary` server wrapper so document agents can invoke it on embedded whiteboards.)
4. **Editor-side comment anchor binding.** The database schema (`AnchorType` in `'DocBlock' | 'SlideRegion' | 'SheetRange'`, `AnchorKey`, `AnchorMetadata`), RLS/FLS security, and `@mention` notifications shipped in [#6281](https://github.com/MemberJunction/MJ/pull/6281); what remains is binding Yjs relative positions, slide regions, and sheet cell ranges to those columns in the editors and comment rail.
5. **Drafts.** Every save is a new version, so autosave would bury the history.
6. **Sharing beyond named people,** and letting another record decide (a Collaboration space).
7. **Slides:** no type, no layout model, no PPTX writer.
8. **Sheets:** no formula engine. AG Grid Community is a data grid of records, not a spreadsheet; range selection and the fill handle are Enterprise features.
9. **Fan-out across MJAPI instances.** `RedisProvider` is a cache, not pub/sub.
10. **A way for non-Explorer add-ons (such as Google Apps Script) to sign in if D11 doesn't fit, and REST API-key scope enforcement.** Excel's sign-in is now solved on `next` via D11 (#6214). For a fallback OAuth flow (§ 7.3), the MCP server's OAuth tokens are minted for the MCP server, and its client registry is an in-memory `Map` (`AI/MCPServer/src/auth/ClientRegistry.ts`), lost on restart and wrong with more than one instance. MJAPI's REST routes (`MJServer/src/rest/RESTEndpointHandler.ts`) still don't check API-key scopes, so a scoped key used there reaches everything its user can; GraphQL does check them.

## 2. Decisions

**D1. Core, not an Open App.** Every app needs these, as every app can use the whiteboard. An Open App would either duplicate the artifact model or wrap it thinly.

**D2. Live co-editing ships in Phase 1.** Building a single-user editor first would mean replacing its storage later. People and agents edit at the same time from the first release.

**D3. Every document has two forms.**
- **The live form** is a [Yjs](https://github.com/yjs/yjs) document: a structured model that gives every character an identity and merges concurrent edits.
- **The saved form,** written to `MJ: Artifact Versions` at checkpoints, is the format other tools exchange: Markdown with block markers for docs, the deck JSON for slides (§ 5.1), `.xlsx` for sheets.

Search, vector sync, export, diff and every existing reader of an artifact use the saved form; only the editors and the agent tools touch the live one. Claude's own Docs works the same way: its edits address blocks and characters by id, each tab has a revision, and Markdown is how content goes in and out.

**D4. Upgrade existing artifact types in place.** "Markdown Document" becomes the doc type and "Excel Spreadsheet" the sheet type: plain Markdown is already a doc with no blocks, and a plain `.xlsx` is already a sheet. Every Markdown artifact an agent writes in a conversation becomes a live doc with no conversion step. Slides get a new type, "Presentation". The fallback, if review prefers to keep chat output light, is child types under the existing ones, which inherit viewers and tools through `ParentID` (O1).

**D5. Agents edit the live document on the server, as participants.** People see an agent's edits arrive under its name. Tools address stable ids, each call carries the revision it read, and a version is saved before and after every agent run, so "undo what the agent did" is one restore (§ 3.6).

**D6. A comment thread is a conversation.** *(Schema & RLS/FLS foundation shipped in [#6281](https://github.com/MemberJunction/MJ/pull/6281).)* A thread is an `MJ: Conversations` row linked to the artifact through `LinkedEntityID` and `LinkedRecordID`, using `AnchorType` (`'DocBlock'`, `'SlideRegion'`, or `'SheetRange'`), `AnchorKey`, `AnchorMetadata` (`IConversationAnchorMetadata`), and `IsResolved`. @-mentioning an agent in a thread runs it with the anchored content as context.

**D7. Blocks reference; they never copy.** A block names its source and how to show it, renders live for each reader under that reader's permissions, and can be frozen as of a moment on purpose. Blocks register through ClassFactory (`@RegisterClass(BaseDocumentBlock, '<Kind>')`), so any Open App adds its own. The same blocks work in docs, slides and sheets.

**D8. Word and Google Docs: import, export and link. No two-way sync.**

**D9. Sheets' formula engine is a BUSL-compatible isomorphic TypeScript engine (`SpreadsheetEngine`).** Evaluating HyperFormula (GPLv3 incompatible with MJ's BUSL-1.1 / MIT packages without a commercial license), Univer OSS (heavy DOM/DI bundle footprint on headless Node server and agent tool paths, with collaborative editing and `.xlsx` gated behind its commercial Pro tier), and IronCalc (early-stage WASM binary distribution friction across browser + Node) led to a focused, zero-dependency isomorphic TypeScript lexical tokenizer + cached AST compiler + iterative topological DAG evaluator in `@memberjunction/core-entities` (`SpreadsheetEngine`, § 6.1). It runs identically in browser editors, headless `MJServer` collaboration rooms, and `SpreadsheetToolLibrary` agent runs, with incremental dirty-subgraph recalculation and explicit Excel parity for the core association spreadsheet function set.

**D10. One data API for every consumer.** Blocks, sheet ranges, the add-ins and generated files all fetch rows the same way: a query (with parameters) or a view, run as the caller, through the field-level output projection, with server-set parameters taken only from the server. Phase 1 builds it, because blocks need it.

**D11. The Excel add-in signs in through a Generic Office connect panel (served by MJ Explorer at `office/connect`) and holds a scoped API key.** *(Revised 2026-10-30; shipped in [#6214](https://github.com/MemberJunction/MJ/pull/6214).)* The add-in's sign-in window opens a standalone `office/connect` page in Explorer (a thin route wrapper around router-free `<mj-office-connect-panel>` in `@memberjunction/ng-export-service`, so any non-Explorer MJ Angular app can mount the same connect page alongside the Generic grids), where the person signs in exactly as they always do with whatever identity provider the host uses. Approving there mints an MJ API key for that person that can only run views and queries (`view:run`, `query:run`) and expires (90 days by default). That is everything the add-in needs, with no new table, no new OAuth server and no identity-provider redirect to register. The key is revocable on the API Keys page, is refused once its user is deactivated, and can't change data. It is handed back encrypted to a key pair the add-in made for that sign-in (either relayed through the Office Dialog window or copied as an encrypted connection code when connecting to a different MJ server in an external browser), so it never sits in a URL or clipboard in plain text. The add-in calls GraphQL, where API-key scopes are enforced, not REST, where they aren't.

**D12. Artifacts are the "OLE" plugin model for stateful blocks; `BaseDocumentBlock` handles live MJ data.** *(Added 2026-11-08.)* Rather than inventing a second persistence and plugin architecture for rich embedded objects (whiteboards, interactive components, diagrams, media, or custom Open App canvases), **any `MJ: Artifact` is already a full-stack embeddable plugin**: it has its own persistence and version history (`MJ: Artifacts` + `MJ: Artifact Versions`), permissions (`MJ: Artifact Permissions` + § 3.3 delegate), pluggable UI (`MJ: Artifact Types.DriverClass` → `@RegisterClass(BaseArtifactViewerPluginComponent, '<DriverClass>')`), state summary (`GetCurrentStateSnapshot()`), and agent tools (`BaseArtifactToolLibrary`). The `Artifact` block kind bridges any `MJ: Artifact Types` plugin into Docs, Slides, and Sheets with both **OLE Linking** (referencing an existing `ArtifactID`) and **OLE Embedding** (creating a child `MJ: Artifacts` row inline, e.g. `/whiteboard`, whose access delegates to the host document), plus **in-place activation** (`[readonly]="false"` on the viewer plugin when the user clicks to edit the embedded canvas). `BaseDocumentBlock` subclasses (`Query`, `View`, `Record`, `Chart`, `Dashboard`, `SheetRange`) stay focused on live, stateless references into MJ data.

## 3. The shared core

Built in Phase 1 with the docs editor; slides and sheets reuse all of it.

### 3.1 Sync

- **Endpoint:** a WebSocket on MJAPI, mounted through `ApiRoute()`, speaking the Yjs sync and awareness protocols (presence, cursors, selections). Candidates: [Hocuspocus](https://github.com/ueberdosis/hocuspocus) (MIT) hosted in MJAPI, or our own server on `y-protocols` (O2).
- **Authorization:** the connection carries the user's MJ token. Reading needs read access; the server drops updates from a connection without edit access. Revoking access closes the user's connections to that artifact.
- **Persistence:** a new table holds each artifact's live state (compacted Yjs state plus recent updates), compacted when the document goes quiet.
- **More than one MJAPI:** each document is served by one instance, or instances relay updates through Redis pub/sub (O3). A multi-instance host can't turn co-editing on until this exists.
- **Limits:** document size, connections per document, update rate.

### 3.2 Saved versions

- **Checkpoints:** after a quiet period, when the last editor leaves, on a named save, before and after an agent run, and before a restore.
- **What a checkpoint writes:** an artifact version with the saved form in `Content` (or a file, for `.xlsx`), plus the Yjs snapshot, so a restore brings back comment anchors exactly. `ContentHash` skips a checkpoint that changed nothing.
- **Restore** writes a new version; history is never rewritten. Diffs compare saved forms with `@codemirror/merge`.

### 3.3 Permissions

`MJ: Artifact Permissions` grants named users. This plan adds:
- **Role grants,** for "the finance team can edit".
- **A delegate:** an artifact can name an owning record whose driver decides who reads and edits, so a document in a Collaboration space follows the space's roster and bands — and an inline-created Artifact block (e.g. a Whiteboard created inside a doc or slide) automatically delegates its read/edit permissions to its host document artifact. Collaboration's plan already expects to propose the shape of a linked document before its migration, so the two are designed together (O4).

### 3.4 Blocks (Live MJ Data + "OLE" Artifact Plugins)

- **Shape:** a `kind`, a `source` reference, `display` settings (height, aspect ratio, caption, view mode), and an optional `freeze` (timestamp, actor, and the captured snapshot).
- **Registry (`@RegisterClass(BaseDocumentBlock, '<Kind>')`):**
  - **Live MJ Data Blocks:** `Query` (with parameters), `View`, `Record` (entity and key), `Chart` (a query or view plus chart settings), `Dashboard`, and (in Phase 3) `SheetRange`. The server half fetches data through D10, summarizes the block for agents, and renders the frozen form for export. The browser half renders with the existing Generic viewers (`query-viewer`, `entity-viewer`, `entity-card`, `charts`, `dashboard-viewer`).
  - **The `Artifact` Block (the "OLE" plugin bridge):** `Artifact` (referencing an `ArtifactID` at its latest version, or pinned to an `ArtifactVersionID`). Renders through `<mj-artifact-type-plugin-viewer>` (`BaseArtifactViewerPluginComponent`), so **every existing and future `MJ: Artifact Types` plugin is automatically a block plugin** in Docs, Slides, and Sheets without registering a separate `BaseDocumentBlock` subclass. First-class slash-menu shortcuts (`/whiteboard`, `/component`, `/diagram`, `/artifact`) create or link the corresponding artifact type directly.
  - **Open App extensibility:** an Open App can extend blocks in two ways:
    1. *Stateful canvas / object (recommended when the block owns persisted content):* register an `MJ: Artifact Types` row + `@RegisterClass(BaseArtifactViewerPluginComponent, ...)` + `BaseArtifactToolLibrary`. It works standalone in Collections/Chat *and* embeds in Docs, Slides, and Sheets via the `Artifact` block.
    2. *Stateless live-data view:* register `@RegisterClass(BaseDocumentBlock, '<AppPrefix>.<Kind>')` when the block is a custom live projection over the Open App's entities.
- **Live for the reader:** a reader without access to the source (or referenced artifact) sees a placeholder that names nothing about it. Interactive components run in their existing sandbox.
- **Frozen:** minutes keep the numbers or diagram as they were at the meeting. Freezing is an explicit, recorded act, because it publishes the author's view of the data to the document's readers (O5).
- **Agents** see each block as its source plus a structured summary (for `Artifact` blocks, via `GetCurrentStateSnapshot()` / `BaseArtifactToolLibrary`), and can insert, configure, or edit embedded artifacts with a tool (§ 3.6).

#### 3.4.1 How "OLE" Artifact Blocks Work (Example: Whiteboard in a Doc or Slide)

`Whiteboard` is **already** a first-class artifact type in `metadata/artifact-types/.artifact-types.json` (`ID: D37C0785-C5FD-42B4-9442-D48B076E2BA4`, `Name: "Whiteboard"`, `ContentType: "application/json"`, `DriverClass: "WhiteboardArtifactViewerPlugin"`, `Icon: "fa-solid fa-chalkboard"`). Embedding a **Whiteboard** (or Interactive Component, SVG diagram, etc.) inside a document or slide uses the `Artifact` block kind end-to-end with two targeted additions to the existing `Whiteboard` artifact plumbing:

1. **Create inline ("OLE Embed") or link existing ("OLE Link"):**
   - Typing `/whiteboard` (or **Insert → New Whiteboard**) creates a new `MJ: Artifacts` row (`Type = 'Whiteboard'`, `ArtifactTypeID = 'D37C0785-C5FD-42B4-9442-D48B076E2BA4'`) whose permissions delegate (§ 3.3) to the host document, writes an initial empty `MJ: Artifact Versions` row, and inserts an `Artifact` block pointing to that `ArtifactID`.
   - Choosing **Insert → Existing Whiteboard / Artifact** inserts an `Artifact` block pointing to an existing `ArtifactID` (either tracking latest or pinned to a version), so multiple docs and slide decks can share one live architecture diagram.
2. **Addition 1 — Upgrade `WhiteboardArtifactViewerComponent` for `[readonly]="false"` ("OLE Activate"):**
   - `BaseArtifactViewerPluginComponent` (`packages/Angular/Generic/artifacts/src/lib/components/base-artifact-viewer.component.ts`) already has `@Input() readonly: boolean = true` and abstract `GetCurrentStateSnapshot(): DataSnapshot | null`. We add `public get SupportsInlineEdit(): boolean` (default `false`) and `@Output() ContentCommitted = new EventEmitter<string>()` on `BaseArtifactViewerPluginComponent`.
   - **Default (inactive / reading, `[readonly]="true"`):** `WhiteboardArtifactViewerComponent` (`packages/Angular/Generic/conversations/src/lib/components/realtime/whiteboard/whiteboard-artifact-viewer.component.ts`) renders `<mj-whiteboard-snapshot>`, with no floating toolbars or stray keyboard capture.
   - **In-place edit (activated, `[readonly]="false"`):** when a user with `CanEdit` on the artifact double-clicks the block or clicks **Edit on canvas** in the block header (or edits a saved Whiteboard in the standalone Artifact Viewer Panel), `WhiteboardArtifactViewerComponent` (with `override get SupportsInlineEdit(): boolean { return true; }`) mounts `<mj-realtime-whiteboard-host [State]="BoardState" [ShowFocusToggle]="false">` instead of `<mj-whiteboard-snapshot>`. Its single-key tool shortcuts (`v`, `h`, `p`, `r`, `s`, `t`, `m`, `w`, `i`, `c`, `e`) and `Cmd/Ctrl+Z` are already focus-scoped to the host element in `@memberjunction/ng-whiteboard`, so typing in the surrounding document never collides with board shortcuts.
   - **Persistence:** committing or leaving edit mode emits `this.ContentCommitted.emit(state.ToJSON())`, saving a new `MJ: Artifact Versions` checkpoint on the Whiteboard artifact and updating the block's rendered snapshot.
3. **Addition 2 — Register `"ToolLibraryClass": "WhiteboardToolLibrary"` on the `Whiteboard` Artifact Type:**
   - The `Whiteboard` row in `metadata/artifact-types/.artifact-types.json` currently has no `ToolLibraryClass` (because `Whiteboard_*` tools only ran client-side over `RealtimeWhiteboardChannel` during voice sessions).
   - Set `"ToolLibraryClass": "WhiteboardToolLibrary"` on the `Whiteboard` row (`ID: D37C0785-C5FD-42B4-9442-D48B076E2BA4`) in `metadata/artifact-types/.artifact-types.json` and register `WhiteboardToolLibrary` (`@RegisterClass(BaseArtifactToolLibrary, 'WhiteboardToolLibrary')` in `packages/AI/Agents/src/artifact-tools/`), backed by the framework-free `WhiteboardState` + `ApplyWhiteboardAgentTool` engine.
   - This lets any chat or document agent read `WhiteboardState.BuildSceneSummary()` (via `get_full` / `GetCurrentStateSnapshot()`) and invoke `Whiteboard_*` tools server-side to add or update notes, shapes, connectors, and HTML/SVG widgets on an embedded or standalone Whiteboard artifact — with the same before/after version checkpointing as doc edits (§ 3.6).
4. **Export on embedded Whiteboards:**
   - When the Doc or Slide exports to `.docx`, `.pptx`, or PDF (§ 3.8), the Whiteboard block exports via `BuildWhiteboardExportSvg(state)` (rasterized to PNG where `.docx`/`.pptx` require it).

### 3.5 Comments as conversations

- **Schema & security foundation (shipped in [#6281](https://github.com/MemberJunction/MJ/pull/6281)):**
  - `MJ: Conversations` already carries `LinkedEntityID`, `LinkedRecordID`, `AnchorType` (`CHECK` includes `'DocBlock'`, `'SlideRegion'`, and `'SheetRange'`), `AnchorKey`, `AnchorMetadata` (typed via `IConversationAnchorMetadata`), `IsResolved`, `ResolvedByUserID`, and `ResolvedAt`, indexed by `IDX_Conversation_LinkedRecord_Anchor`.
  - Server-side RLS/FLS read and write hooks (`AnchoredConversationSecurity`, `ConversationWriteAccess`, `RestrictedFieldCommentClassifier`) and `@mention` notifications (`DispatchConversationMentionNotifications`) are live on `next`.
- **Editor binding (Phase 1–3):**
  - A thread on a Doc, Slide, or Sheet sets `LinkedEntityID` = `MJ: Artifacts`, `LinkedRecordID` = the artifact ID, `AnchorType` = `'DocBlock'` / `'SlideRegion'` / `'SheetRange'`, `AnchorKey` = the block, slide-region, or sheet-range ID, and stores the serialized Yjs relative positions and quoted text in `AnchorMetadata`.
- **Mentions:** @-mentioning a person notifies them (suppressing notifications if the user lacks read access). @-mentioning an agent runs it with the document and the anchored range; it answers in the thread, or edits the range when asked (§ 3.6).
- **Who sees a thread:** whoever can read the document. In a shared document, an agent answers only from what every reader of the thread can read; in Collaboration, that is its audience rule.

### 3.6 Agent edits

- **Where:** a server-side engine loads the document's live form, applies the agent's operations as the agent run's user, and broadcasts them like any other participant's. An agent running on another instance sends its operations through the sync service.
- **Tools,** one `BaseArtifactToolLibrary` per type:

| Kind | Docs | Slides | Sheets |
|---|---|---|---|
| Read | outline, blocks in a range, search, changes since a revision | deck outline, one slide, notes | sheet list, a range (values and formulas), search |
| Write | insert after, replace a range of blocks, replace characters in a block, delete, move | add, remove or move a slide; set its layout; edit a region; set notes | set a range, write a formula, insert or delete rows and columns, add a chart |
| Blocks & Embedded Artifacts | insert or configure a block; create or link an `Artifact` block (e.g. Whiteboard) and delegate to that artifact's own `BaseArtifactToolLibrary` (e.g. `WhiteboardToolLibrary` wrapping `ApplyWhiteboardAgentTool`) | the same, in a region | bind a range to a query or view; embed a chart or artifact block on the sheet canvas |
| Talk | comment, reply, resolve | the same | the same |
| Suggest | any write as a proposal a person accepts | the same | the same |

- **Addressing:** stable block, slide, region, row and column ids, and character ids for ranges inside a block. New text is written as Markdown fragments.
- **Revision check:** each write names the revision the agent read. If its target changed since, the write is refused and returns the current content.
- **Undo:** the checkpoints around an agent run make "undo everything the agent did" one restore (including when an agent run edits an embedded Artifact block such as a Whiteboard).
- **Provenance:** every edit records the agent and the run, the way `MJ: AI Agent Notes` record `SourceAIAgentRunID`.
- **Later:** the same write tools for other artifact types (JSON, CSV), which are read-only today.

### 3.7 The data API (D10)

- **One engine function** runs a source as a given user over the existing `RunView` and `RunQuery`, with paging, a row cap, the field-level output projection, and `IsServerSet` parameters filled only from server context.
- **For the browser and agents:** a Remote Operation (`guides/REMOTE_OPERATIONS_GUIDE.md`).
- **For the add-ins:** the existing GraphQL operations (`RunViewByID`, `RunDynamicView` for `(Default)` entity views, and `GetQueryData`), which enforce API-key scopes; the REST routes don't (§ 1.2, item 10). In-pane discovery and source resolution shipped in [#6214](https://github.com/MemberJunction/MJ/pull/6214) via `ExcelAddin.GetCatalog`, `ExcelAddin.GetEntityViews` and `ExcelAddin.ResolveSource` over GraphQL `ExecuteRemoteOperation`.

### 3.8 Import, export and links

- **Docs:** import `.docx` (`mammoth` to HTML, `turndown` to Markdown) and Markdown; export `.docx` (`docx`, with decimal ordered-list numbering shipped in [#6388](https://github.com/MemberJunction/MJ/pull/6388)), PDF and Markdown.
- **Slides:** export PPTX (`pptxgenjs`, a new MIT dependency) and PDF. PPTX import is later.
- **Sheets:** import and export `.xlsx` (`exceljs`) and CSV (`papaparse`).
- **Linked documents:** a pointer to a file in Google Drive, SharePoint, Box or Dropbox through MJStorage. Its text is pulled in for search and agents, and it opens in its own tool.
- **Blocks export frozen,** as a table or an image (e.g. `BuildWhiteboardExportSvg` rasterized for `.docx`/`.pptx` when exporting a Whiteboard block).

## 4. Phase 1: Docs

- **Editor:** ProseMirror through TipTap's MIT core, with `y-prosemirror` for co-editing. No TipTap Pro extensions; every extension's license is checked before it is added.
- **In v1:**
  - headings, paragraphs, bold, italic, underline, strike, links
  - bulleted, numbered and checklist lists; tables; images (stored in MJStorage); code blocks; quotes; dividers
  - @mentions of people and records
  - blocks (§ 3.4), including live MJ data blocks (`Query`, `View`, `Record`, `Chart`, `Dashboard`) and "OLE" `Artifact` blocks (with first-class `/whiteboard` and `/component` slash commands for creating or linking a Whiteboard or Interactive Component and editing it in place, § 3.4.1)
  - comments (§ 3.5, wired to `MJ: Conversations.AnchorType = 'DocBlock'` from [#6281](https://github.com/MemberJunction/MJ/pull/6281)), presence and cursors
  - version history, with diff and restore
  - templates: start from a document marked as a template
  - a share dialog
  - import and export (§ 3.8)
  - "Ask an agent" on a selection or at an empty line
- **Later:** suggestion mode for people (agents get it in v1), several tabs per document, page layout for print, footnotes, offline editing.
- **Artifact type (D4):** "Markdown Document" gets the editor, and a new `DocumentToolLibrary` with read and write tools replaces `TextToolLibrary` for it; "Generic Text" keeps `TextToolLibrary`.
- **Layers** (`guides/UI_LAYERING_GUIDE.md`):
  - L1 `@memberjunction/ng-doc-editor`: the editor alone, no router.
  - L2 the document page: editor, comments rail, history, share, presence.
  - L3 a Docs surface in Explorer, over Collections.
  - Collaboration embeds the L2 page in a space.
- **Collaboration:** a space's library can hold a doc, the space decides who reads it (§ 3.3), and *Turn into document* on a note creates one.

**Accept:**
1. Two people and an agent edit one document at the same time, everyone sees each edit within about a second, and nothing is lost.
2. An agent replaces one paragraph by id: nothing else changes, a person typing elsewhere is unaffected, and a write against a stale revision is refused.
3. A query block shows each reader only the rows that reader may read; a reader without access sees a placeholder.
4. Typing `/whiteboard` embeds a new Whiteboard `Artifact` block (delegating access to the doc); clicking **Edit** activates `<mj-realtime-whiteboard-host>` in place without hijacking document keyboard shortcuts when unfocused, saves a new `MJ: Artifact Versions` checkpoint on commit, and lets a document agent read `BuildSceneSummary()` or apply `Whiteboard_*` tools to it.
5. In a comment thread, @-mentioning an agent gets an answer in the thread, and "edit this" changes only the anchored range.
6. Restoring a version brings back its text and its comment anchors.
7. A `.docx` imports with headings, lists, tables and images, and an export opens in Word (with embedded Whiteboard blocks exported as images).
8. A Markdown artifact an agent wrote in a conversation opens as a live doc with no conversion step.
9. A host with more than one MJAPI instance co-edits correctly (O3).

## 5. Phase 2: Slides

### 5.1 Model

- **A deck** is an ordered list of slides plus a theme.
- **A slide** is a layout whose regions hold the docs editor's content, blocks included, plus speaker notes. The canvas is fixed at 16:9.
- **Layouts, not a free canvas:** title, title and body, two columns, chart and text, full-bleed image, section break, quote, big number. When a slide needs a free-form diagram or sketch, a region embeds a Whiteboard `Artifact` block (§ 3.4.1).
- **Theme:** `ThemeEngine` derives the deck's tokens from an organization's brand colors, with a default per host.
- **Live form:** one Yjs document per deck (slide order plus each slide's regions). **Saved form:** the deck JSON (slides, layouts, each region as Markdown with block markers, a theme reference).
- **Artifact type:** a new "Presentation".

### 5.2 v1

- editing with co-editing, presence, comments pinned to a slide or a region, versions
- present mode: full screen, a presenter view with notes, keyboard navigation
- live blocks on slides; whether they refresh during a presentation or freeze when it starts is O6
- export to PPTX and PDF
- agent tools (§ 3.6), including "make a deck from this doc"

**Accept:**
1. Two people edit different slides and a third reorders the deck, all at once, and nothing is lost.
2. A chart block on a slide shows each viewer's own data, and the PPTX export shows the frozen chart.
3. An agent rewrites one slide's body by id without touching any other slide.
4. Changing the organization's brand seeds re-themes the deck.
5. The PPTX opens in PowerPoint and Keynote with its text editable.

## 6. Phase 3: Sheets

### 6.1 The engine decision (`SpreadsheetEngine`)

Evaluating the external engine candidates settled the architecture for `@memberjunction/core-entities`:

| Candidate | License | Evaluation finding | Outcome |
|---|---|---|---|
| [HyperFormula](https://hyperformula.handsontable.com/docs/guide/licensing.md) | GPLv3 or commercial | Mature JS engine, but GPLv3 is incompatible with MJ's BUSL-1.1 / MIT packages without a paid OEM license | Rejected (license incompatibility) |
| [Univer](https://github.com/dream-num/univer) open-source core | Apache-2.0 | Heavy RxJS/DI/DOM-oriented bundle bloat on headless Node server and agent paths (`@memberjunction/ai-agents`), while collaborative editing and `.xlsx` import/export sit in its commercial Pro tier | Rejected (bundle bloat & split tier) |
| [IronCalc](https://github.com/ironcalc/IronCalc) | MIT / Apache-2.0 | Rust + WASM engine; requires shipping and initializing `.wasm` binaries across browser bundlers, Node ESM/CJS hosts, and Vitest workers, and still provides no grid or Yjs/stable-ID binding | Rejected (WASM packaging friction) |
| **`SpreadsheetEngine` (`@memberjunction/core-entities`)** | **MJ Core (MIT)** | **Zero-dependency isomorphic TypeScript lexical tokenizer + cached AST compiler + iterative topological DAG evaluator with incremental dirty-subgraph recalculation** | **Selected** |

**Supported architecture & Excel function scope:**
- **Isomorphic & bounded:** Runs identically in the browser, in `MJServer`, and inside `SpreadsheetToolLibrary` with zero DOM or Node native dependencies, bounded `.xlsx` ZIP/DEFLATE limits (15 MB compressed, 32 MB total uncompressed, 16 MB per entry), and iterative topological DAG evaluation (zero call-stack recursion even on multi-thousand-row running-total chains, `#CYCLE!` cycle detection, and O(dirty-subgraph) recalculation averaging `~10ms` for a 10k-formula dirty subgraph).
- **Excel function scope:**
  - *Math & aggregation:* `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `COUNTA`, `COUNTBLANK`, `PRODUCT`, `SUMPRODUCT`, `ROUND` (decimal-scaled half-away-from-zero), `ROUNDUP`, `ROUNDDOWN`, `INT`, `FLOOR`, `CEILING`, `ABS`, `MOD` (floored divisor sign), `POWER`, `SQRT`, scientific notation (`1e-11`), and postfix `%`.
  - *Conditional aggregates (with `*` / `?` wildcards and Excel blank-cell semantics):* `SUMIF`, `SUMIFS`, `COUNTIF`, `COUNTIFS`, `AVERAGEIF`, `AVERAGEIFS`.
  - *Lookup & reference:* `VLOOKUP` (exact & sorted approximate), `HLOOKUP`, `XLOOKUP` (with `if_not_found` and `match_mode`), `INDEX` (2D & 1D horizontal/vertical), `MATCH` (`1`, `0`, `-1`), `ROW`, `COLUMN`, `ROWS`, `COLUMNS`, cross-sheet quoted references (`'FY24 Q1'!$B$2`), and named ranges.
  - *Logical, information & text:* `IF`, `IFS`, `AND`, `OR`, `NOT`, `IFERROR`, `IFNA` (catches `#N/A` distinctly), `ISBLANK`, `ISNUMBER`, `ISTEXT`, `ISERROR`, `ISNA`, `CONCAT`, `CONCATENATE`, `LEFT`, `RIGHT`, `MID`, `LEN`, `LOWER`, `UPPER`, `PROPER`, `TRIM`, `SUBSTITUTE`, `FIND`, `SEARCH`, `VALUE`, `TEXT`.
  - *1900 serial dates:* `TODAY`, `NOW`, `DATE`, `YEAR`, `MONTH`, `DAY`, `DAYS`, `EDATE`, `EOMONTH` (native numeric serial arithmetic such as `=TODAY()+7` and OOXML date `numFmtId` formatting).
  - *Viewer-scoped MJ functions:* `=MJ.QUERY(queryName, ...)` and `=MJ.VIEW(entityName, viewName?, filter?)`, stripped of viewer-scoped values on serialization so persisted versions never leak another user's rows.

### 6.2 Model

- **A workbook** is a set of tabs; each tab's cells synchronize over Yjs and serialize cleanly to JSON and `.xlsx`.
- **Rows and columns have monotonic stable ids.** Formulas compile to `@CELL` / `@RANGE` / `@SHEET_CELL` / `@SHEET_RANGE` stable references and decompile back to A1 references (shrinking surviving endpoints on row/column deletion and shifting named ranges, charts, live tables, validations, conditional formats, sort specs, and filters), so one person inserting or deleting rows while another writes `=SUM(B2:B9)` leaves every reference intact.
- **Artifact type (D4):** "Excel Spreadsheet" is upgraded in place (`SpreadsheetArtifactViewerPlugin` + `SpreadsheetToolLibrary`). `.xlsx` import/export supports shared formulas (`<f t="shared"/>`), date serial `numFmtId`s, and a hidden `_mj_sheets_meta` round-trip sheet stripped of live/spilled viewer-scoped cells.

### 6.3 v1

- tabs, values, formulas covering the common functions
- number and date formats, basic styles, frozen panes, sort and filter
- charts from ranges (`Angular/Generic/charts`)
- `.xlsx` and CSV import and export
- comments on cells, co-editing, agent edits
- **MJ data:**
  - a range bound to a query or view (D10) refreshes under the reader's permissions
  - MJ functions such as `=MJ.QUERY("Renewals by Month", 2026)` run on the server, with permission checks
  - a range or a chart becomes a block in a doc or a slide
- **Later:** pivot tables, conditional formatting, data validation. Macros never.

**Accept:**
1. Two people insert rows and edit formulas at the same time, and every formula still points where it did.
2. A range bound to a view shows each reader only rows that reader may read.
3. An agent writes a formula into one cell, and its value is correct when the agent reads it back, with no browser open.
4. A budget imported from `.xlsx` keeps its formulas and formats, and the export opens in Excel.
5. A chart from a sheet range, placed in a slide, updates when the sheet changes.

## 7. Track A: Excel add-in, Google Sheets add-on, generated files

**Depends on** no editor. The Excel add-in uses GraphQL operations MJAPI already has (`RunViewByID`, `RunDynamicView`, `GetQueryData`, `ExecuteRemoteOperation`) and the sign-in in D11, so its first release shipped ahead of Phase 1 in [#6214](https://github.com/MemberJunction/MJ/pull/6214).

### 7.1 Excel add-in, first release: Open in Excel and in-pane browse & insert (shipped)

**Pull request:** [MemberJunction/MJ#6214](https://github.com/MemberJunction/MJ/pull/6214) *(merged into `next` at `bf01635ce`)*.

**Where it starts.** A unified **Export ▾** toolbar dropdown in the two shared grids — the entity grid (`Angular/Generic/entity-viewer`, `entity-data-grid`, covering both `(Default)` dynamic entity views and saved `MJ: User Views`) and the query results grid (`Angular/Generic/query-viewer`, `query-data-grid`) — offers **Open in Excel** alongside **Export Snapshot...**. Every screen that uses them gets it: view pages, Data Explorer, the query browser and dashboards. When the host doesn't have the add-in turned on, the button stays a single-click snapshot export.

**Export and Open in Excel differ.** Export is a copy of the rows as they are now. Open in Excel is a connected workbook that holds no rows until someone opens it, then fills from MJ as that person.

**What the button and pane do.**
1. **From MJ (`Open in Excel`):** The `ExcelAddin.BuildWorkbook` Remote Operation resolves the saved view (`Kind: 'View'`), `(Default)` entity view (`Kind: 'Entity'`), or saved query (`Kind: 'Query'`) as the user and writes an `.xlsx`: one sheet per source with its column headings, a hidden `_mj_excel` sheet recording each source (entity/view ID, or query ID and parameter values chosen), and the Office web-extension parts (`webextension.xml` + `taskpanes.xml`) that open the add-in with the file. No rows, no token, no server secret.
2. Opening it in Excel opens the MemberJunction pane. The person signs in once (D11), and the pane fills each sheet. **Refresh** and **Refresh all** bring current data.
3. **Directly inside Excel (`Browse Data` & `Workbook` tabs):** Any blank or existing workbook can also browse Applications → Entities → `(Default)` or Saved Views, or Query Categories → Saved Queries (filling query parameters in the pane), insert new connected sheets or replace the active sheet, switch MJ servers via the **Server** picker, and refresh or manage every connected worksheet.

**No raw filter SQL.** The file and pane name a saved view by ID, an entity by ID (`(Default)` dynamic view, using the entity's default columns and no user-supplied SQL `WhereClause`), or a saved query by ID — never filter SQL. A saved view with unsaved changes opens as last saved, and the menu item says so. A query's server-set parameters (`IsServerSet`) stay server-set.

**Hosting.** Each MJ host serves the add-in itself, from `ExcelAddinServerExtension` in `@memberjunction/excel-addin-server`, configured in `mj.config.cjs` `serverExtensions` and off unless listed. It serves the pane, the sign-in pages, a small `config.json` (including `storeType` for the generated workbook's web-extension binding), and a manifest that already points at that host (`guides/EXCEL_ADDIN_GUIDE.md`). An administrator deploys the manifest once from the Microsoft 365 admin center.

**Sign-in.**
1. For the host serving the add-in, the pane makes a one-time ECDH P-256 key pair and opens the Office Dialog window (waiting on `Office.onReady()` so Mac desktop Excel's WebKit host bridges cleanly) on the host's own sign-in page, which forwards to `office/connect`. When connecting to a different MJ server URL, the pane opens that server's `office/connect` in the system browser and accepts the encrypted connection code back.
2. `office/connect` renders the router-free Generic `<mj-office-connect-panel>` (`@memberjunction/ng-export-service`), wrapped as a standalone route by Explorer (`@memberjunction/ng-explorer-core`), so non-Explorer MJ Angular apps can serve the exact same connect endpoint. The person signs in as they always do, sees what Excel will be able to do, and approves.
3. `ExcelAddin.CreateConnection` mints their scoped API key (D11). The connect panel encrypts it with AES-256-GCM to the pane's public key and either relays it through the Office Dialog return page or gives the user the encrypted code to paste.
4. The pane keeps the per-server key in its own storage and sends it as `X-API-Key` to GraphQL.

**Packages.**
- `@memberjunction/excel-addin` (browser-safe): the workbook contract, pure `/office/connect` helpers, typed `ExcelAddin.*` Remote Operation descriptors, encrypted handoff, and the Office.js pane bundled with esbuild.
- `@memberjunction/excel-addin-server`: `ExcelAddinServerExtension`, manifest and workbook builders, and the operations' server bodies (`GetSettings`, `GetCatalog`, `GetEntityViews`, `ResolveSource`, `CreateConnection`, `BuildWorkbook`).
- `@memberjunction/ng-export-service`: Generic `<mj-office-connect-panel>`, wrapped by Explorer's `office/connect` route in `@memberjunction/ng-explorer-core`.

**Remaining follow-ups on the Excel packages:** `=MJ.QUERY(...)` and `=MJ.VIEW(...)` Excel custom functions, and an AppSource listing. The pane runs in Excel for Windows, Mac (verified end-to-end on desktop Excel for Mac) and the web.

### 7.2 Google Sheets add-on

- **An Apps Script editor add-on.** The sidebar is the main path: it inserts and refreshes ranges, and keeps each range's source in the sheet's developer metadata.
- **Custom functions** only for small results, because Apps Script stops them at 30 seconds.
- **Sign-in** through Google's OAuth2 library for Apps Script, with the script's callback registered with MJ.
- **Distribution:** the Workspace Marketplace, private to one domain or public after Google's review.

### 7.3 Sign-in for the Google add-on

The Excel design (D11) carries over if an Apps Script sidebar can receive the key back from Explorer's connect page. If it can't, the fallback is the MCP server's OAuth server, moved into MJAPI with its client registrations stored in the database (§ 1.2, item 10). Settle this before building the Google add-on (O8).

### 7.4 Generated files

**Excel:** § 7.1. Office supports opening a task pane with a document through a web-extension part; `exceljs` can't write that part, so it is added to the zip afterwards.

**Google:** MJ creates a sheet through the Sheets API, with each source in developer metadata, and the domain's add-on refreshes it.

**Data in the file:** a generated file carries no data by default. Its author may include a snapshot of what they can see, as an explicit choice the file records. A refresh always runs as the person who opened the file.

**Without an add-in, for Entra hosts:** a Power Query against MJ's REST routes may refresh with the person's organizational account. Excel's Power Query only signs in to organizational accounts on Entra, so this can't serve Auth0, Okta or Google hosts (O8).

**Accept (shipped in [#6214](https://github.com/MemberJunction/MJ/pull/6214)):**
1. From a `(Default)` entity view, a saved view, and a saved query, **Export ▾ → Open in Excel** downloads a workbook that holds headings and no rows.
2. Opening it and opening the pane lets the user sign in through `office/connect` (`<mj-office-connect-panel>`) with the same account, and every sheet fills; from any workbook, the pane can also browse entities, views and queries (with parameters) and insert new connected sheets.
3. A colleague with narrower access opens the same file, signs in, refreshes, and sees only their own rows.
4. A query's server-set parameters can't be set from the file or the pane.
5. The add-in's key can't save, delete or run anything but views and queries.
6. Revoking the key on the API Keys page, or deactivating the user, stops the next refresh.
7. With the extension not configured, the menu stays a plain snapshot export button and the operations refuse.

## 8. Security

- **Every read runs as the reader,** or as the agent run's user, through the field-level output projection. Follow `.claude/skills/mj-field-security`, and test each new transport with a restricted user, failing first.
- **Server-set parameters** (`IsServerSet`) are never accepted from a browser, a block, an add-in or a file.
- **Sync connections** are re-checked when access changes.
- **A block never shows its author's data** to a reader without access. Freezing is explicit and recorded (O5).
- **Generated files** carry no credentials, and refresh as the person who opened them.
- **Interactive components** in blocks run in their existing sandbox.
- **Agents are bounded by their audience.** An agent in a shared thread or document answers from what everyone reading it can read, and every edit records the agent and the run.

## 9. Order and delivery (3-Wave Autonomous Build & Adversarial Review Protocol)

Prior foundations already merged to `next`:
- ~~**Track A, first pull request:**~~ **Done ([#6214](https://github.com/MemberJunction/MJ/pull/6214))** — the Excel add-in's Open in Excel, in-pane browse & insert, multi-server switcher, and Generic `<mj-office-connect-panel>` sign-in (§ 7.1).
- ~~**Anchored conversation schema & security foundation (§ 3.5 / D6):**~~ **Done ([#6281](https://github.com/MemberJunction/MJ/pull/6281))** — `MJ: Conversations` columns (`AnchorType` including `'DocBlock'`, `'SlideRegion'`, `'SheetRange'`, `AnchorKey`, `AnchorMetadata`, `IsResolved`, `ResolvedByUserID`, `ResolvedAt`), RLS/FLS read/write hooks, and `@mention` notifications.

Remaining work proceeds in **three sequential waves**, where each wave must reach full completion (unit tests, deterministic integration tests, Playwright E2E verification with screenshots, package READMEs, `guides/` documentation, and full JSDoc) and receive adversarial sign-off before the next wave begins:

1. **Wave 1 — Shared Core (§ 3) + Docs (§ 4) + OLE `Artifact` / Whiteboard Blocks (§ 3.4.1):**
   - Schema migration + CodeGen for `MJ: Artifact Working States` (`YjsState VARBINARY(MAX)`), delegate permission fields (`DelegateEntityID`, `DelegateRecordID` on `MJ: Artifacts`), `Whiteboard` `ToolLibraryClass` metadata (`"WhiteboardToolLibrary"`), and `Presentation` artifact type metadata.
   - `y-protocols` real-time collaboration service in `@memberjunction/server` (`packages/MJServer`) with JWT auth, per-artifact room lifecycle, periodic checkpointing, version-save compaction, and live permission revocation.
   - Shared live block host (`EntityView`, `SavedQuery`, `DashboardPart`, `InteractiveComponent`, and `Artifact`) with viewer-scoped RLS/FLS execution, `IsServerSet` parameter stripping, explicit recorded freeze (`Frozen` / `Live`), and inline editing (`WhiteboardArtifactViewerComponent` `[readonly]="false"` mode mounting `<mj-realtime-whiteboard-host [ShowFocusToggle]="false">` + `WhiteboardToolLibrary` server tool library).
   - Rich TipTap/ProseMirror Docs editor (`MarkdownDocumentViewerComponent` upgrade), slash menu (`/`), block handles, anchored `DocBlock` comment margins + `@mention` agent invocation, version diffing, and `.md` / `.docx` / `.pdf` import & export.
2. **Wave 2 — Slides (§ 5):**
   - Structured JSON deck schema (`Presentation` artifact type), theme token inheritance, 7 canonical slide layouts, master fields, speaker notes, presenter view (current/next slide, notes, timer), keyboard-driven presentation mode, live MJ blocks + embedded OLE `Artifact` / Whiteboard regions in slide regions, anchored `SlideRegion` comments, `SlideDeckToolLibrary` (`BaseArtifactToolLibrary`), and `.pptx` (`pptxgenjs` + live block rendering) / `.pdf` export.
3. **Wave 3 — Sheets (§ 6) + Track A Custom Functions (§ 7.2):**
   - BUSL-compatible isomorphic TypeScript `SpreadsheetEngine` (lexical tokenizer + cached AST compiler + iterative topological DAG evaluator with incremental dirty-subgraph recalculation), multi-sheet tabs, sorting/filtering, number & 1900 serial date formatting, cell validation, conditional formatting, named ranges, charts, `=MJ.QUERY(name, params...)` and `=MJ.VIEW(entity, view, filter)` custom functions (viewer-scoped, stripped on serialization), Range Sources bound to Entities/Views/Queries with refresh & cryptographic freeze verification, anchored `SheetRange` comments, `SpreadsheetToolLibrary` (`BaseArtifactToolLibrary`) with headless server-side recalculation, `.xlsx` / `.csv` import & export, and Excel `=MJ.QUERY(...)` / `=MJ.VIEW(...)` custom functions in `packages/OfficeAddins/Excel` & `packages/OfficeAddins/ExcelServer`.

## 10. Settled defaults for O1–O10

- **O1 (Artifact Types):** **Settled — Upgrade in place + add `Presentation`.** Upgrade `"Markdown Document"` (`DriverClass: "MarkdownArtifactViewerPlugin"`, `ToolLibraryClass: "DocumentToolLibrary"`) and `"Excel Spreadsheet"` (`DriverClass: "SpreadsheetArtifactViewerPlugin"`, `ToolLibraryClass: "SpreadsheetToolLibrary"`) in place so existing artifacts gain rich collaborative editing seamlessly, and add `"Presentation"` (`ContentType: "application/vnd.mj.presentation+json"`, `DriverClass: "SlideDeckArtifactViewerPlugin"`, `ToolLibraryClass: "SlideDeckToolLibrary"`) for Slides. Set `"ToolLibraryClass": "WhiteboardToolLibrary"` on the existing `"Whiteboard"` artifact type (`ID: D37C0785-C5FD-42B4-9442-D48B076E2BA4`).
- **O2 (Yjs Sync Transport):** **Settled — Lightweight `y-protocols` sync handler inside `@memberjunction/server`.** Implement directly on `yjs` + `y-protocols/sync` + `y-protocols/awareness` over a dedicated WebSocket upgrade path in `MJServer` rather than pulling in the heavyweight Hocuspocus framework, keeping auth, RLS/FLS, and `UserCache` verification directly wired to MJ's auth pipeline.
- **O3 (Multi-instance MJAPI):** **Settled — Pluggable room relay (in-memory single-node default + Redis pub/sub when `RedisProvider` is configured).** Abstract room broadcast behind a thin `YjsRoomRelay` interface so single-instance dev/prod works zero-config and multi-instance deployments relay `y-protocols` sync/awareness frames over MJ's existing Redis connection.
- **O4 (Delegate permissions):** **Settled — Nullable `DelegateEntityID` + `DelegateRecordID` on `MJ: Artifacts` (or server permission hook registry).** When an artifact is owned by a domain record (e.g., a Collaboration Space Item), the server permission check resolves read/edit through a registered `IArtifactPermissionDelegate` for that entity (`BaseSingleton` registry) and falls back to `MJ: Artifact Permissions` when `DelegateEntityID` is null.
- **O5 (Frozen block visibility):** **Settled — Visible to everyone who can read the document, with an explicit confirmation & audit banner.** Freezing is a deliberate act of publishing; the freeze confirmation modal explicitly warns the author that current rendered values will be saved into the document version for all document readers, and the block records `FrozenAt`, `FrozenByUserID`, and `FrozenByUserName`.
- **O6 (Live blocks in Slides):** **Settled — Refresh on deck open, freeze when presentation mode starts, with a one-click refresh button in presenter toolbar.** Prevents mid-presentation layout shifts or loading spinners while keeping numbers current when opening or starting a talk.
- **O7 (Sheets engine):** **Settled — Isomorphic TypeScript `SpreadsheetEngine` in `@memberjunction/core-entities` (lexical AST + iterative topological DAG evaluator with incremental dirty-subgraph recalculation).** Avoids HyperFormula's GPLv3 license conflict with MJ's BUSL-1.1 / MIT packages, Univer OSS's heavy DOM/DI bundle bloat on headless Node server and agent paths, and IronCalc's WASM packaging friction while delivering Excel-parity semantics across core math, text, logical, lookup (`VLOOKUP`/`XLOOKUP`/`INDEX`/`MATCH`), conditional aggregate (`SUMIFS`/`COUNTIFS`/`AVERAGEIFS`), 1900 serial date, and viewer-scoped `=MJ.QUERY`/`=MJ.VIEW` functions (§ 6.1).
- **O8 (Real Excel / Google verification matrix):** Mac `WEF` sideloading and `_mj_excel` hydration verified in [#6214](https://github.com/MemberJunction/MJ/pull/6214); Automated Playwright tests cover `<mj-office-connect-panel>`, workbook generation (`ExcelAddin.GenerateWorkbook`), and custom function evaluation endpoints.
- **O9 (Product names in Explorer):** **Settled — Docs, Slides, Sheets.**
- **O10 (Office connection key minting):** **Settled — `ExcelAddin.CreateConnection` mints the narrowly scoped (`view:run`, `query:run`) connection key on behalf of any authenticated user who has permission to run views/queries,** while enforcing user-level ownership (`UserID = contextUser.ID`) so users can always view and revoke their own connected Office keys without requiring broad table-level `Create` permission on `MJ: API Keys`.

## 11. Not doing

- Two-way sync with Word or Google Docs.
- Offline editing.
- Free-form slide layouts as the slide deck's own canvas model (slide layouts stay structured; when a slide needs a free-form board or diagram, embed a Whiteboard `Artifact` block in a slide region per § 3.4.1).
- Pivot tables or VBA/macros.
- Exotic statistical, financial, or engineering Excel function libraries beyond the documented association spreadsheet scope in § 6.1 (workbooks using specialized desktop-only Excel functions round-trip cleanly via `.xlsx` import/export).
- Replacing Word, PowerPoint, Excel or Google's tools. MJ links to them and exports to them.

## 12. Side finding (resolved)

~~MJExplorer, `@memberjunction/ng-artifacts` and the mobile app depend on `xlsx` 0.18.5, the copy of SheetJS on npm, which SheetJS no longer updates. That version has a prototype-pollution bug when reading crafted files (CVE-2023-30533) and a regular-expression denial of service (CVE-2024-22363). Sheets import uses `exceljs`. Replacing `xlsx` is tracked separately.~~ **Resolved in [#6301](https://github.com/MemberJunction/MJ/pull/6301):** `@memberjunction/ng-artifacts` and `MobileApp` now pin `xlsx` `0.20.3`, and `MJExplorer` dropped its unused direct `xlsx` dependency. Sheets import/export still uses `exceljs`.
