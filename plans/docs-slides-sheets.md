# Docs, slides and sheets

**What this is.** One plan to give every MemberJunction host documents, slide decks and spreadsheets that people and agents edit together, live, built in three phases on one shared core. A separate track adds an Excel add-in and a Google Sheets add-on that pull MJ queries and views into those tools, under the same sign-in people use for MJ Explorer.

| Phase | Delivers | For |
|---|---|---|
| 1 | The shared core, and **Docs** | Minutes, policies, briefs and proposals written by people and agents in the same document |
| 2 | **Slides** | Board decks and member presentations, with live MJ data on the slides |
| 3 | **Sheets** | Budgets, rosters and trackers, with ranges filled from MJ queries and views |
| A | **Excel add-in, Google Sheets add-on**, and generated files that carry them. The Excel add-in ships **first, as its own pull request** (§ 7.1) | MJ queries and views inside the spreadsheets people already use |

**Why.** Associations on MemberJunction, starting with [BizApps Collaboration](https://github.com/MemberJunction/bizapps-collaboration)'s spaces, need somewhere to write and share documents without renting a separate tool for each relationship. Word and Google Docs stay: MJ imports from them, exports to them and links to them. What MJ adds that they can't:

- **Blocks.** A document, slide or sheet holds live MJ things: a query, a view, a record, a chart, an interactive component, another artifact. Each renders for the reader, under the reader's permissions.
- **Agents as co-editors.** An agent edits the same live document as the people in it, a paragraph or a cell at a time, and anyone can undo what it did.
- **One permission model.** The same row- and field-level rules that govern MJ Explorer govern every document, block and add-in.

Collaboration keeps documents out of its own scope: its notes stay light, and becoming a document-management system is one of its non-goals ([its plan](https://github.com/MemberJunction/bizapps-collaboration/blob/next/plans/plan.md), D33 and the non-goals list). So this is core work that Collaboration, Committees, Contracts, Marketing and every other app consume, the way they consume the whiteboard.

**Checked against:** MJ `next` at `a47488eb0` (2026-10-29). Paths are under `packages/` unless they start with `plans/`, `guides/`, `metadata/` or `.claude/`.

**Status:** draft for review. D1 to D11 are Amith's decisions from 2026-10-30.

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
12. [Side finding](#12-side-finding)

## 1. What MJ already has, and what it lacks

### 1.1 Already there

| Piece | Where | What it gives this plan |
|---|---|---|
| Artifacts and their versions | `MJ: Artifacts`; `MJ: Artifact Versions` (`Content`, `Configuration`, `ContentHash`, `ContentMode` `Text` or `File`, `FileID`) | The document record and its saved versions |
| Sharing | `MJ: Artifact Permissions` (`CanRead`, `CanEdit`, `CanDelete`, `CanShare`, per user) | A starting point; see § 3.3 |
| Folders | `MJ: Collections` (a tree, with permissions); browser and share dialog in `Angular/Generic/conversations/src/lib/components/collection/` | Where documents live in Explorer |
| Artifact types | `metadata/artifact-types`: Markdown Document, Word Document, PDF, Excel Spreadsheet, CSV, Data Snapshot, Whiteboard | The types this plan upgrades (D4) |
| Type inheritance | `AI/Agents/src/ArtifactToolManager.ts` walks a type's `ParentID` chain for its tools; `artifact-viewer-panel.component.ts` does the same for viewers | A child type inherits until it overrides |
| Agent tools per type | `AI/CorePlus/src/artifact-tool-library.ts` (`BaseArtifactToolLibrary`); `AI/Agents/src/artifact-tools/` | The seam the write tools plug into (§ 3.6) |
| Whiteboard | `Angular/Generic/whiteboard`: stable item ids, a change journal, `BuildSceneDelta` (what changed since a token), `ApplyWhiteboardAgentTool` | The pattern for granular agent edits. Single-user and client-side today |
| Conversations | `MJ: Conversations` (`LinkedEntityID`, `LinkedRecordID`, `AdditionalData`) | Comment threads (D6) |
| Block renderers | `Angular/Generic/` `query-viewer`, `entity-viewer`, `entity-card`, `dashboard-viewer`, `charts`, `react` (interactive components), `artifacts` | Most blocks are wiring, not new UI |
| Text | `MarkdownCore` (marked, custom extensions, a token AST); `Angular/Generic/markdown`; `Angular/Generic/composer` (@mentions) | Saved form, rendering, mentions |
| Files, import, export | `MJStorage` drivers (Google Drive, SharePoint, Box, Dropbox, AWS, Azure, Google Cloud); `DocumentParsing` (PDF, Word, spreadsheets to text); `mammoth`, `turndown` and `docx` (in `Actions/CoreActions`); `exceljs` 4.4; `papaparse`; `pdfkit` | Import, export, linked documents |
| History | `VersionHistory` (labels, restore); Record Changes; `@codemirror/merge` | Restore and diff |
| Theme | `ThemeEngine`: the full `--mj-*` token set from a few brand seeds | Slide themes (§ 5) |
| Transport | MJServer's `ws` and `graphql-ws`; routes through `ApiRoute()`; REST in `MJServer/src/rest/RESTEndpointHandler.ts` (`POST /views/:entityName`, `POST /views/batch`, `POST /queries/run`, `GET /metadata/entities`) | The sync endpoint (§ 3.1) and the data API (§ 3.7) |
| Sign-in for outside clients | `AI/MCPServer/src/auth/OAuthProxyRouter.ts`: authorization-server metadata, dynamic client registration, PKCE, sign-in through the host's identity provider, a consent page with API scopes, MJ-issued tokens; providers in `AuthProviders/src/providers` (MSAL, Auth0, Okta, Google, WorkOS, Cognito, magic link, host identity) | A later option for the Google add-on (§ 7.2) |
| Per-user API keys | `APIKeys/Engine` (`CreateAPIKey`, `RevokeAPIKey`, expiry, hashed storage); MJAPI resolves an `X-API-Key` to its user, with its scopes and row filters (`MJServer/src/context.ts`); a key with scopes is denied everything outside them (`defaultBehaviorNoScopes: 'deny'`); GraphQL `RunViewByID` checks `view:run` and `GetQueryData` checks `query:run` | The Excel add-in's credential (D11) |
| Explorer pages outside the app shell | `claims/redeem` and `oauth/callback` in `Angular/Explorer/explorer-core/src/app-routing.module.ts`: no route guard; the page waits for the session, then calls the server | The add-in's connect page (§ 7.1) |
| Server Extensions | `ServerExtensionsCore`: a package mounts its own routes under `MJAPI_BASE_PATH`, configured in `mj.config.cjs` `serverExtensions` (`guides/SERVER_EXTENSIONS_GUIDE.md`) | Hosting the add-in on each MJ host |
| Remote Operations | `BaseRemotableOperation`: one typed call site on browser and server, routed over GraphQL; a code-only operation needs no metadata row (`guides/REMOTE_OPERATIONS_GUIDE.md`) | Every new browser-to-server call in this plan |
| Server-set query parameters | `MJ: Query Parameters.IsServerSet` | A block or add-in never sets these (§ 8) |

### 1.2 Missing

1. **A rich-text editor.** None in MJ or any BizApps repo; CodeMirror is there for code.
2. **Live multi-user editing.** No shared real-time model anywhere. The whiteboard is single-user.
3. **Agent write tools.** Every artifact tool library is read-only: `TextToolLibrary` has `get_lines` and `grep`; `DocxToolLibrary` has `get_text`, `get_sections`, `get_lines`, `get_html` and `search_text`; `ExcelToolLibrary` has `get_sheets`, `get_sheet_data`, `get_formulas`, `aggregate_column` and `search_cells`. An agent can only write a whole new version.
4. **Comments anchored to a passage, a slide or a cell.**
5. **Drafts.** Every save is a new version, so autosave would bury the history.
6. **Sharing beyond named people,** and letting another record decide (a Collaboration space).
7. **Slides:** no type, no layout model, no PPTX writer.
8. **Sheets:** no formula engine. AG Grid Community is a data grid of records, not a spreadsheet; range selection and the fill handle are Enterprise features.
9. **Fan-out across MJAPI instances.** `RedisProvider` is a cache, not pub/sub.
10. **A way for an add-in to sign in.** The MCP server's OAuth tokens are minted for the MCP server, and its client registry is an in-memory `Map` (`AI/MCPServer/src/auth/ClientRegistry.ts`), lost on restart and wrong with more than one instance. MJAPI's REST routes (`MJServer/src/rest/RESTEndpointHandler.ts`) don't check API-key scopes, so a scoped key used there reaches everything its user can; GraphQL does check them.

## 2. Decisions

**D1. Core, not an Open App.** Every app needs these, as every app can use the whiteboard. An Open App would either duplicate the artifact model or wrap it thinly.

**D2. Live co-editing ships in Phase 1.** Building a single-user editor first would mean replacing its storage later. People and agents edit at the same time from the first release.

**D3. Every document has two forms.**
- **The live form** is a [Yjs](https://github.com/yjs/yjs) document: a structured model that gives every character an identity and merges concurrent edits.
- **The saved form,** written to `MJ: Artifact Versions` at checkpoints, is the format other tools exchange: Markdown with block markers for docs, the deck JSON for slides (§ 5.1), `.xlsx` for sheets.

Search, vector sync, export, diff and every existing reader of an artifact use the saved form; only the editors and the agent tools touch the live one. Claude's own Docs works the same way: its edits address blocks and characters by id, each tab has a revision, and Markdown is how content goes in and out.

**D4. Upgrade existing artifact types in place.** "Markdown Document" becomes the doc type and "Excel Spreadsheet" the sheet type: plain Markdown is already a doc with no blocks, and a plain `.xlsx` is already a sheet. Every Markdown artifact an agent writes in a conversation becomes a live doc with no conversion step. Slides get a new type, "Presentation". The fallback, if review prefers to keep chat output light, is child types under the existing ones, which inherit viewers and tools through `ParentID` (O1).

**D5. Agents edit the live document on the server, as participants.** People see an agent's edits arrive under its name. Tools address stable ids, each call carries the revision it read, and a version is saved before and after every agent run, so "undo what the agent did" is one restore (§ 3.6).

**D6. A comment thread is a conversation.** A thread is a `MJ: Conversations` row linked to the artifact through `LinkedEntityID` and `LinkedRecordID`, with an anchor. @-mentioning an agent in a thread runs it with the anchored content as context.

**D7. Blocks reference; they never copy.** A block names its source and how to show it, renders live for each reader under that reader's permissions, and can be frozen as of a moment on purpose. Blocks register through ClassFactory, so any Open App adds its own. The same blocks work in docs, slides and sheets.

**D8. Word and Google Docs: import, export and link. No two-way sync.**

**D9. Sheets' formula engine is not ours to write.** Phase 3 starts with a spike between Univer's open-source core and IronCalc (§ 6.1). HyperFormula only with a commercial license: MJ is BUSL-1.1, so its GPLv3 option is out.

**D10. One data API for every consumer.** Blocks, sheet ranges, the add-ins and generated files all fetch rows the same way: a query (with parameters) or a view, run as the caller, through the field-level output projection, with server-set parameters taken only from the server. Phase 1 builds it, because blocks need it.

**D11. The Excel add-in signs in through MJ Explorer and holds a scoped API key.** *(Revised 2026-10-30: replaces moving the MCP server's OAuth server into MJAPI.)* The add-in's sign-in window opens a page in Explorer, so the person signs in exactly as they always do, with whatever identity provider the host uses. Approving there mints an MJ API key for that person that can only run views and queries (`view:run`, `query:run`) and expires (90 days by default). That is everything the add-in needs, with no new table, no new OAuth server and no identity-provider redirect to register. The key is revocable on the API Keys page, is refused once its user is deactivated, and can't change data. It is handed back encrypted to a key pair the add-in made for that sign-in, so it never sits in a URL in plain text. The add-in calls GraphQL, where API-key scopes are enforced, not REST, where they aren't.

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
- **A delegate:** an artifact can name an owning record whose driver decides who reads and edits, so a document in a Collaboration space follows the space's roster and bands. Collaboration's plan already expects to propose the shape of a linked document before its migration, so the two are designed together (O4).

### 3.4 Blocks

- **Shape:** a kind, a source reference, display settings, and an optional freeze (when, and the captured result).
- **Kinds in Phase 1:** Artifact (the latest version, or a pinned one), Query (with parameters), View, Record (entity and key), Chart (a query or view plus chart settings), Interactive Component, Dashboard. Sheet ranges join in Phase 3.
- **Registry:** `@RegisterClass(BaseDocumentBlock, '<Kind>')`. The server half fetches data through D10, summarizes the block for agents and renders the frozen form for export. The browser half renders with the existing viewers.
- **Live for the reader:** a reader without access to the source sees a placeholder that names nothing about it. Interactive components run in their existing sandbox.
- **Frozen:** minutes keep the numbers as they were at the meeting. Freezing is an explicit, recorded act, because it publishes the author's view of the data to the document's readers (O5).
- **Agents** see each block as its source plus a short text summary, and insert or configure blocks with a tool (§ 3.6).

### 3.5 Comments as conversations

- **A thread** is a `MJ: Conversations` row with `LinkedEntityID` = `MJ: Artifacts` and `LinkedRecordID` = the artifact. Its anchor (Yjs relative positions, the block id and the quoted text) and its resolved state live beside it.
- **Mentions:** @-mentioning a person notifies them. @-mentioning an agent runs it with the document and the anchored range; it answers in the thread, or edits the range when asked (§ 3.6).
- **Who sees a thread:** whoever can read the document. In a shared document, an agent answers only from what every reader of the thread can read; in Collaboration, that is its audience rule.

### 3.6 Agent edits

- **Where:** a server-side engine loads the document's live form, applies the agent's operations as the agent run's user, and broadcasts them like any other participant's. An agent running on another instance sends its operations through the sync service.
- **Tools,** one `BaseArtifactToolLibrary` per type:

| Kind | Docs | Slides | Sheets |
|---|---|---|---|
| Read | outline, blocks in a range, search, changes since a revision | deck outline, one slide, notes | sheet list, a range (values and formulas), search |
| Write | insert after, replace a range of blocks, replace characters in a block, delete, move | add, remove or move a slide; set its layout; edit a region; set notes | set a range, write a formula, insert or delete rows and columns, add a chart |
| Blocks | insert or configure a block | the same, in a region | bind a range to a query or view |
| Talk | comment, reply, resolve | the same | the same |
| Suggest | any write as a proposal a person accepts | the same | the same |

- **Addressing:** stable block, slide, region, row and column ids, and character ids for ranges inside a block. New text is written as Markdown fragments.
- **Revision check:** each write names the revision the agent read. If its target changed since, the write is refused and returns the current content.
- **Undo:** the checkpoints around an agent run make "undo everything the agent did" one restore.
- **Provenance:** every edit records the agent and the run, the way `MJ: AI Agent Notes` record `SourceAIAgentRunID`.
- **Later:** the same write tools for other artifact types (JSON, CSV), which are read-only today.

### 3.7 The data API (D10)

- **One engine function** runs a source as a given user over the existing `RunView` and `RunQuery`, with paging, a row cap, the field-level output projection, and `IsServerSet` parameters filled only from server context.
- **For the browser and agents:** a Remote Operation (`guides/REMOTE_OPERATIONS_GUIDE.md`).
- **For the add-ins:** the existing GraphQL operations (`RunViewByID`, `GetQueryData`), which enforce API-key scopes; the REST routes don't (§ 1.2, item 10). Browsing from the pane later adds a discovery operation listing the queries and views the caller may run, with each query's parameters.

### 3.8 Import, export and links

- **Docs:** import `.docx` (`mammoth` to HTML, `turndown` to Markdown) and Markdown; export `.docx` (`docx`), PDF and Markdown.
- **Slides:** export PPTX (`pptxgenjs`, a new MIT dependency) and PDF. PPTX import is later.
- **Sheets:** import and export `.xlsx` (`exceljs`) and CSV (`papaparse`).
- **Linked documents:** a pointer to a file in Google Drive, SharePoint, Box or Dropbox through MJStorage. Its text is pulled in for search and agents, and it opens in its own tool.
- **Blocks export frozen,** as a table or an image.

## 4. Phase 1: Docs

- **Editor:** ProseMirror through TipTap's MIT core, with `y-prosemirror` for co-editing. No TipTap Pro extensions; every extension's license is checked before it is added.
- **In v1:**
  - headings, paragraphs, bold, italic, underline, strike, links
  - bulleted, numbered and checklist lists; tables; images (stored in MJStorage); code blocks; quotes; dividers
  - @mentions of people and records
  - blocks (§ 3.4)
  - comments (§ 3.5), presence and cursors
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
4. In a comment thread, @-mentioning an agent gets an answer in the thread, and "edit this" changes only the anchored range.
5. Restoring a version brings back its text and its comment anchors.
6. A `.docx` imports with headings, lists, tables and images, and an export opens in Word.
7. A Markdown artifact an agent wrote in a conversation opens as a live doc with no conversion step.
8. A host with more than one MJAPI instance co-edits correctly (O3).

## 5. Phase 2: Slides

### 5.1 Model

- **A deck** is an ordered list of slides plus a theme.
- **A slide** is a layout whose regions hold the docs editor's content, blocks included, plus speaker notes. The canvas is fixed at 16:9.
- **Layouts, not a free canvas:** title, title and body, two columns, chart and text, full-bleed image, section break, quote, big number. Free-form boards are the whiteboard's job.
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

### 6.1 The engine spike

Before anything else in Phase 3, and able to run during Phase 1 because it depends on nothing here:

| Candidate | License | Gives | Catch |
|---|---|---|---|
| [Univer](https://github.com/dream-num/univer) open-source core | Apache-2.0 | Engine and canvas grid | Co-editing and `.xlsx` import and export are its paid Pro tier; we'd use Yjs and `exceljs` instead |
| [IronCalc](https://github.com/ironcalc/IronCalc) | MIT or Apache-2.0 | Engine in Rust, with WASM and Node bindings | Young (0.7 to 0.8); no grid, so we build one |
| [HyperFormula](https://hyperformula.handsontable.com/docs/guide/licensing.md) | GPLv3 or commercial | The most mature JavaScript engine | GPLv3 is out under BUSL-1.1; a commercial license only |

**The test:** each candidate must run headless on the server (agents recalculate there), map cleanly onto Yjs, cover the functions associations use, and stay responsive at roughly 100,000 cells. The result settles O7.

### 6.2 Model

- **A workbook** is a set of tabs; each tab's cells are a Yjs map.
- **Rows and columns have stable ids.** Formulas are stored against those ids and shown as A1 references, so one person inserting a row while another writes `=SUM(B2:B9)` leaves the formula right.
- **Artifact type (D4):** "Excel Spreadsheet" is upgraded in place. Saved versions stay `.xlsx`, written by `exceljs`, so `ExcelToolLibrary`, `DocumentParsing` and downloads keep working. MJ-only features (bound ranges, MJ functions) go in the version's `Configuration`.

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

**Depends on** no editor. The Excel add-in uses GraphQL operations MJAPI already has (`RunViewByID`, `GetQueryData`) and the sign-in in D11, so it ships first, ahead of Phase 1, as its own pull request.

### 7.1 Excel add-in, first pull request: Open in Excel

**Where it starts.** An **Open in Excel** button beside Export in the two shared grids: the views grid (`Angular/Generic/entity-viewer`, `entity-data-grid`) and the query results grid (`Angular/Generic/query-viewer`, `query-data-grid`). Every screen that uses them gets it: view pages, Data Explorer, the query browser and dashboards. The button only shows when the host has the add-in turned on.

**Export and Open in Excel differ.** Export is a copy of the rows as they are now. Open in Excel is a connected workbook that holds no rows until someone opens it, then fills from MJ as that person.

**What the button does.**
1. The `ExcelAddin.BuildWorkbook` Remote Operation reads the saved view or query as the user and writes an `.xlsx`: one sheet per source with its column headings, a hidden sheet recording each source (the view, or the query and the parameter values chosen), and the Office web-extension parts that open the add-in with the file. No rows, no token, no server secret.
2. The browser downloads it.
3. Opening it in Excel opens the MemberJunction pane. The person signs in once (D11), and the pane fills each sheet. **Refresh** and **Refresh all** bring current data.

**Saved views and saved queries only.** The file names a view or a query by ID, never filter SQL. A view with unsaved changes opens as last saved, and the button says so. A query's server-set parameters (`IsServerSet`) stay server-set.

**Hosting.** Each MJ host serves the add-in itself, from a Server Extension in `@memberjunction/excel-addin-server`, configured in `mj.config.cjs` `serverExtensions` and off unless listed. It serves the pane, the sign-in pages, a small `config.json`, and a manifest that already points at that host, so nobody types a server address and no central MemberJunction service sits in the path. An administrator deploys the manifest once from the Microsoft 365 admin center.

**Sign-in.**
1. The pane makes a one-time key pair and opens the Office sign-in window on the host's own page.
2. That page sends the person to Explorer's `office/connect` page. They sign in as they always do, see what Excel will be able to do, and approve.
3. `ExcelAddin.CreateConnection` mints their scoped API key (D11). The connect page encrypts it to the pane's public key and returns to the host's page, which hands it to the pane.
4. The pane keeps the key in its own storage and sends it as `X-API-Key` to GraphQL.

**Packages.**
- `@memberjunction/excel-addin` (browser-safe): the workbook contract, the typed Remote Operation bases Explorer calls, and the pane, bundled with esbuild.
- `@memberjunction/excel-addin-server`: the Server Extension, the manifest and workbook builders, and the operations' server bodies.

**Not in the first pull request:** browsing and inserting from the pane, `=MJ.QUERY(...)` and `=MJ.VIEW(...)` custom functions, and an AppSource listing. Each is a follow-up on the same packages. The pane runs in Excel for Windows, Mac and the web.

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

**Accept (the first pull request):**
1. From a saved view and from a saved query, Open in Excel downloads a workbook that holds headings and no rows.
2. Opening it opens the pane; the user signs in through Explorer with the same account, and every sheet fills.
3. A colleague with narrower access opens the same file, signs in, refreshes, and sees only their own rows.
4. A query's server-set parameters can't be set from the file or the pane.
5. The add-in's key can't save, delete or run anything but views and queries.
6. Revoking the key on the API Keys page, or deactivating the user, stops the next refresh.
7. With the extension not configured, the button doesn't show and the operations refuse.

## 8. Security

- **Every read runs as the reader,** or as the agent run's user, through the field-level output projection. Follow `.claude/skills/mj-field-security`, and test each new transport with a restricted user, failing first.
- **Server-set parameters** (`IsServerSet`) are never accepted from a browser, a block, an add-in or a file.
- **Sync connections** are re-checked when access changes.
- **A block never shows its author's data** to a reader without access. Freezing is explicit and recorded (O5).
- **Generated files** carry no credentials, and refresh as the person who opened them.
- **Interactive components** in blocks run in their existing sandbox.
- **Agents are bounded by their audience.** An agent in a shared thread or document answers from what everyone reading it can read, and every edit records the agent and the run.

## 9. Order and delivery

1. **Track A, first pull request:** the Excel add-in's Open in Excel (§ 7.1). It needs nothing else in this plan.
2. **Phase 1:** the shared core (§ 3) and the docs editor, built together because the editor is what proves the core. Then the Collaboration integration.
3. **Phase 2:** slides.
4. **Phase 3:** sheets. The engine spike (§ 6.1) runs during Phase 1.
5. **Track A, the rest:** the Excel pane's browse and insert, custom functions, then the Google add-on (§ 7.2, § 7.3).

Each phase lands as pull requests into `next`. Migrations ship T-SQL with a `minor` changeset, and each phase adds its checks to the deterministic integration tier.

## 10. Open questions

- **O1.** Upgrade "Markdown Document" and "Excel Spreadsheet" in place (recommended), or add child types?
- **O2.** Hocuspocus inside MJAPI, or our own server on `y-protocols`?
- **O3.** Several MJAPI instances: route each document to one instance, or relay through Redis pub/sub?
- **O4.** The delegate design: how an owning record (a Collaboration space item) decides read and edit, and how that reaches the sync service.
- **O5.** Who sees a frozen block whose source they can't read? Proposed: everyone who can read the document, because freezing is a recorded act of publishing, and the dialog says so.
- **O6.** Slides: do live blocks refresh during a presentation, or freeze when it starts?
- **O7.** The sheets engine, from the spike.
- **O8.** Verify on real Excel: the add-in pane opening with a generated file on Windows, Mac and the web, for each deployment type (the web-extension part names a store type; Microsoft 365 centralized deployment is the default); single sign-on for Entra hosts; the Power Query path. For Google: whether an Apps Script sidebar can take the key back from Explorer's connect page (§ 7.3).
- **O9.** Product names in Explorer: Docs, Slides, Sheets, or names of our own.
- **O10.** The add-in's key is created as the signed-in user, so a role that may not create `MJ: API Keys` can't connect Excel, and the connect page says so. Is that the default we want, or should a host be able to let every user mint this one read-only key?

## 11. Not doing

- Two-way sync with Word or Google Docs.
- Offline editing.
- Free-form slides; that's the whiteboard.
- Pivot tables, macros or conditional formatting in v1.
- A formula engine of our own.
- Replacing Word, PowerPoint, Excel or Google's tools. MJ links to them and exports to them.

## 12. Side finding

MJExplorer, `@memberjunction/ng-artifacts` and the mobile app depend on `xlsx` 0.18.5, the copy of SheetJS on npm, which SheetJS no longer updates. That version has a prototype-pollution bug when reading crafted files (CVE-2023-30533) and a regular-expression denial of service (CVE-2024-22363). Sheets import uses `exceljs`. Replacing `xlsx` is tracked separately.
