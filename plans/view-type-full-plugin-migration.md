# View-Type Full Plugin Migration (Grid / Cards / Timeline / Map → true plugins)

**Goal (user-directed):** Finish the half-done view-type migration. Today only **Cluster** is a true dynamic-mounted `IViewRenderer` plugin. Grid/Cards/Timeline/Map are **built-in**: they render via hardcoded `[hidden]` blocks in `entity-viewer.component.html`, bridged by `driverClassToViewMode()` to the legacy `EntityViewMode` string, with their view-specific chrome (timeline date/orientation/sort, map render-mode/display-state) **hoisted into the host** (entity-viewer header AND a duplicate in the Data Explorer dashboard). That hoisting is the encapsulation violation: timeline controls leak into Cluster view because `InternalViewMode` stays `'timeline'` under a plugin.

**User decisions:**
- **Scope:** ALL FOUR become dynamic-mounted plugins. Delete `driverClassToViewMode` + all `[hidden]` blocks + legacy `EntityViewMode` rendering path.
- **Persistence:** **ViewTypeID-only.** No legacy `?view=timeline` / `state.viewMode` translation. Selection + per-view-type config persist via `ViewTypeID` + the `viewTypeConfigById` map (the mechanism Cluster already uses).

## 🔒 LOCKED INTERACTION MODEL (supersedes any "relay/hostAction" idea below)
Per Amith: **functionality is encapsulated inside each plugin wrapper; nothing bubbles up to *drive* the outer app except navigation.**
- **Self-contained in the wrapper (NO upward flow):** each wrapper owns its own features end-to-end using **Generic** dialogs. Export = the grid wrapper hosts `<mj-export-dialog>` itself (confirmed Generic: `@memberjunction/ng-export-service`, `packages/Angular/Generic/export-service`), with a `[Visible]`/`[(Visible)]` property + `Before/After` export events, building its own export data/columns from the records + grid state it holds. Same for add-to-list / delete-confirm. The parent never invokes or listens for these.
- **Bubbles up — ONLY navigation:** "open entity record" + "open related record (FK)" reach the app because routing lives in Explorer. This is the one legitimate upward signal.
- **Plugin ↔ generic container coordination (inside the Generic layer, NOT the outer app):** opaque `config` persistence + `dataRequest({sort,page,pageSize,loadAll})` to the container's generic data loader. The container persists the opaque blob + loads data generically; it never interprets feature semantics.
- **DELETE the `hostAction` relay** from the contract. **Supersede the earlier export fix** (workspace `ExportRequested` → dashboard dialog): export becomes grid-wrapper-owned; remove the dashboard's `<mj-export-dialog>` + `onExport`/`showExportDialog`/`exportDialogConfig` + the workspace `ExportRequested` output/binding.
- Container outputs shrink to: navigation (`recordOpened` / open-related-record) + generic `dataLoaded`/`filteredCount`. No feature events.

## Target architecture
- Each view type = a dynamic-mounted component implementing the extended `IViewRenderer`, owning its own chrome + data-prep + config. The generic entity-viewer has **zero** knowledge of grid columns, date fields, orientation, geocoding, render modes.
- entity-viewer becomes a pure host: resolve active ViewTypeID → mount that descriptor's `RendererComponent` into `#dynamicViewHost` → feed inputs / relay outputs generically.

## Phase 1 — Extend the contract (FOUNDATION, do first) — `view-type.contracts.ts`
Keep the required core (`entity`, `records`, `selectedRecordId`, `filterText`, `config`, `recordSelected`, `recordOpened`, `configChanged`). Add **OPTIONAL capability members** so grid/map can carry their richer surface while cards/timeline/3rd-party plugins ignore them:

Optional inputs (host sets via guarded `setInput` — wrap in try/catch since `setInput` throws on undeclared inputs for lean plugins):
- `provider`, `gridState`, `gridParams`, `gridToolbarConfig`, `showGridToolbar`, `gridSelectionMode`, `showAddToListButton`, `showPagination`, `pageSize`, `totalRowCount`, `pageNumber`, `totalRecordCount`, `isLoading`

Optional outputs (host subscribes with `?.`):
- `gridStateChanged`, `selectionChanged`, `sortChanged`, `addRequested`, `refreshRequested`, `deleteRequested`, `exportRequested`, `addToListRequested`, `foreignKeyClick`, `pageChange`, `mapRenderModeChange`, `mapDisplayStateChange`, `dataInteraction` (open/double-click already covered by `recordOpened`)

Document each as optional. Third-party plugins implement only the core.

## Phase 2 — Build 4 wrapper renderers (PARALLELIZABLE; depend only on Phase 1 + existing components)
Each is a standalone component implementing the extended `IViewRenderer`, registered as the descriptor's `RendererComponent`. Wrap the EXISTING underlying component (do NOT rewrite the heavy ones).

1. **GridViewRendererComponent** — wraps `<mj-entity-data-grid>`. Translate contract(camelCase) ↔ grid(PascalCase). Carry all 14 inputs + relay all 12 outputs (map to the optional capability outputs). This is the heavy one.
2. **CardsViewRendererComponent** — wraps `<mj-entity-cards>` (already camelCase: entity/records/selectedRecordId/filterText/recordSelected/recordOpened). Thin. No chrome. `config`/`configChanged` no-op.
3. **TimelineViewRendererComponent** — wraps `<mj-timeline>`. **Absorbs from entity-viewer:** `detectDateFields`, `AvailableDateFields`, `HasDateFields`, group building (`updateTimelineGroups`/`configureTimeline`/`TimelineGroups`), orientation/sort/segmentGrouping/selected-date-field state, the chrome (date-field selector + orientation + sort toggles), `OnTimelineEventClick`. Config shape: `{ dateFieldName, orientation, sortOrder, segmentGrouping }`. Emits `configChanged`.
4. **MapViewRendererComponent** — wraps `<mj-map-view>`. Absorbs render-mode + display-state chrome from the dashboard. Config shape: `{ renderMode, displayState }`. Emits `configChanged` (+ optional `mapRenderModeChange`/`mapDisplayStateChange` if any consumer still needs them — prefer folding into `config`).

## Phase 3 — Rewire entity-viewer host (me)
- Set each descriptor's `RendererComponent` to its new wrapper (grid/cards/timeline/map descriptors).
- Delete `driverClassToViewMode`, the four `[hidden]` blocks, `<mj-timeline>`/`<mj-map-view>`/`<mj-entity-cards>`/`<mj-entity-data-grid>` host markup, the timeline controls in the header, and all timeline/map/grid-specific state + methods now living in the wrappers.
- Make EVERY available view type `isDynamic` (no built-in branch). `mountDynamicRenderer`/`syncDynamicInputs`: extend to set all optional inputs (guarded) + subscribe all optional outputs, re-emitting to the entity-viewer's existing `@Output`s (GridStateChange, SelectionChanged, ExportRequested, AddToListRequested, etc.) so the workspace/dashboard contract is unchanged.
- Keep the entity-viewer's existing public `@Output`s/inputs (workspace depends on them) — just source them from the mounted plugin instead of the inline grid.
- Persistence: ViewTypeID-only (already implemented for the dynamic path).

## Phase 4 — Update consumers (me)
- **Dashboard** (`data-explorer-dashboard.component.html`/`.ts`): remove the duplicate timeline controls block (115-169) + any map render-mode chrome now owned by the plugin; remove `state.viewMode`-driven branches that assumed built-in modes (per ViewTypeID-only). Keep export dialog wiring (already done).
- **dashboard-viewer** `view-part.component.ts`: verify bindings still valid.
- **workspace**: `innerViewerConfig` already forces `showViewModeToggle:false`; confirm switcher in toolbar still drives `SelectViewTypeById`.

## Phase 5 — Build + test + live-verify (me)
- Build: ng-entity-viewer, ng-clustering, dashboards, dashboard-viewer, MJExplorer supplemental manifest.
- Run unit tests (entity-viewer view-types test, clustering test).
- Live (Playwright): switch AI Models across Grid/Cards/Timeline/Map/Cluster; confirm (a) no control leakage between types, (b) timeline date/orientation/sort work, (c) map render mode works, (d) grid export opens dialog, (e) cluster shows real labels first try (race fix), (f) selection/open/add-to-list still work.

## Also-in-flight (already fixed this pass, independent)
- Cluster race: availability engine in-flight guard (flag-after-await) + renderer initial-run-after-subscribe. DONE (ng-clustering builds).
- Export: workspace `ExportRequested` output + dashboard `(ExportRequested)="onExport()"`. DONE.

## STATUS (live)
**Done + building (`ng-entity-viewer` builds clean):**
- Generic contract rewritten — NO per-type members. Container-generic surface only:
  inputs `entity/provider/records/selectedRecordId/filterText/config` + generic data-context
  `totalRecordCount/page/pageSize/isLoading`; outputs `recordSelected/recordOpened/configChanged`
  + generic `dataRequest(ViewDataRequest{sort,page,pageSize,loadAll})` + generic
  `hostAction(ViewHostAction{type,payload})`. Container relays these without interpreting them.
- 4 wrapper plugins created under `lib/view-types/renderers/`, each implements `IViewRenderer`,
  owns its chrome, uses ONLY generic channels:
  - `cards-view-renderer.component.ts` (`mj-cards-view-renderer`)
  - `timeline-view-renderer.component.ts` (`mj-timeline-view-renderer`) — owns date/orientation/sort chrome + group building
  - `grid-view-renderer.component.ts` (`mj-grid-view-renderer`) — gridState/sort/page via config+dataRequest; export/addToList/selection/new/refresh/delete/fkClick via hostAction
  - `map-view-renderer.component.ts` (`mj-map-view-renderer`) — renderMode/displayState via config; emits dataRequest{loadAll:true} on init
- Cluster race fix + Excel export fix (independent) — done, building.

**REMAINING (host strip + consumer rework — keep it generic, ViewTypeID-only):**
1. Descriptors (`view-types/descriptors/*.ts`): point each `RendererComponent` at its new wrapper (grid→GridViewRenderer, cards→CardsViewRenderer, timeline→TimelineViewRenderer, map→MapViewRenderer).
2. `entity-viewer.component.ts`: delete `driverClassToViewMode` + the EntityViewMode rendering path; make EVERY available view type `isDynamic`. `mountDynamicRenderer`: subscribe `dataRequest`+`hostAction` (in addition to recordSelected/opened/configChanged). `syncDynamicInputs`: guarded `setInput` of all generic inputs (incl. totalRecordCount/page/pageSize/isLoading). Add `onDynamicDataRequest()` → apply sort/page/loadAll to the host's existing RunView/pagination. Add a single generic `@Output() HostAction` and relay. DELETE all timeline/map/grid-specific state+methods+inputs+outputs (TimelineConfig, MapRenderMode, GridState passthroughs, OnDataGrid*, OnTimeline*, OnMap*, detectDateFields, updateTimelineGroups, SetViewMode legacy, InternalViewMode rendering, etc.). Keep generic data loading + RecordSelected/RecordOpened/DataLoaded/FilteredCountChanged outputs.
3. `entity-viewer.component.html`: delete the 4 `[hidden]` blocks + the timeline header controls; keep filter/count/switcher header + loading/empty states + the `#dynamicViewHost` (now the only render path; un-gate from IsDynamicViewActive since all are dynamic).
4. `module.ts` + `public-api.ts`: declare/export the 4 wrappers + call their `Load*` guards.
5. **workspace** (`view-workspace.component.*`): drop the now-removed per-type outputs; add `HostAction` passthrough output; keep ExportRequested (now fed from hostAction 'export').
6. **dashboard** (`data-explorer-dashboard.component.*`): handle `HostAction` (switch type: export→onExport, addToList→onAddToListRequested, selectionChanged→track selection, new→onCreateNewRecord, refresh→reload, delete→delete, foreignKeyClick→navigate). Remove the duplicate timeline controls (115-169) + map render-mode chrome + `state.viewMode` branches (ViewTypeID-only). Keep export dialog.
7. **dashboard-viewer** `view-part.component.ts`: update bindings to the trimmed entity-viewer API.
8. Build all + tests + Playwright verify every view type + no chrome leakage + 3 bug fixes.

## Risks
- Grid is the most-used + richest surface — the wrapper must relay every input/output faithfully or grid regresses.
- `setInput` throws on undeclared inputs → host must guard optional setInputs.
- ViewTypeID-only means old saved views with only legacy `DisplayState.defaultMode` (no ViewTypeID) fall back to first-available type until re-selected — acceptable per user.
