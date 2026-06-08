# Viewing System — Full Regression Test Catalog

Scope: the entity-viewer plug-in viewing system (Data Explorer + `mj-view-workspace` + `mj-entity-viewer` + the 5 view-type plug-ins) after the true-pluggable migration. Test methodically, step by step, on a stable dev server (localhost:4201, da-robot-tester). Catalog every bug with: surface, steps, expected, actual.

Entities to exercise: **AI Agents** (date fields, no geo), **AI Models** (vectors → Cluster, many fields), **MJ: Actions** (FK fields), and a **geo-capable** entity if available (for Map). 

## A. View-type rendering (each on AI Agents + AI Models)
- A1. Grid renders columns + values for the entity (not "—").
- A2. Cards render with values; cards are clickable.
- A3. Timeline renders events on FIRST switch (no field-change needed); segments present.
- A4. Map renders for a geo entity; "not available" / hidden for non-geo (availability gating).
- A5. Cluster renders scatter with real point labels (not "Unknown") + LLM cluster names (not generic) for a vectorized entity; hidden for non-vectorized.
- A6. Empty/loading states render correctly (entity with 0 records; during load).

## B. View-type switcher
- B1. Dropdown lists only AVAILABLE types (Cluster only when vectors exist; Timeline only with a date field; Map only with geocoding).
- B2. Switching updates the rendered view + the active label/icon.
- B3. Icons come from ViewType.Icon metadata (no blanks, no duplicate empty item).

## C. Grid features
- C1. Sort a column → data reorders (server-side reload if applicable).
- C2. Pagination: page through; page size; total count correct.
- C3. Filter box → filters records (and is shared across view types).
- C4. Row single-click → selection (checkbox); selection count.
- C5. Row double-click / open → navigates to the record (detail).
- C6. Foreign-key cell click → navigates to the related record.
- C7. "New" button → opens create flow (navigation).
- C8. "Refresh" → reloads data.
- C9. "Delete" (with selection) → confirm dialog → deletes → list updates.
- C10. "Export" → opens the SELF-CONTAINED export dialog (in the grid plug-in); choose format; downloads.
- C11. "Add to List" (with selection) → opens the SELF-CONTAINED list-management dialog.
- C12. Column resize/reorder/hide → persists to config (per entity).

## D. Timeline features
- D1. Date-field selector lists the entity's date fields; switching rebuilds events.
- D2. Orientation toggle (vertical/horizontal).
- D3. Sort order toggle (newest/oldest).
- D4. Event click → navigates to the record.
- D5. Controls render INSIDE the timeline area (not leaking into other view types' toolbars).

## E. Map features (geo entity)
- E1. Markers render; render-mode control works (point/heat/etc.).
- E2. Marker click → navigates to the record.
- E3. Render-mode/display-state persists via config; controls owned by the map plug-in.
- E4. Map loads ALL records (loadAll), not just the page.

## F. Cluster features
- F1. Point click → opens/selects record WITHOUT recomputing the scatter (runToken stable).
- F2. Config prop sheet: algorithm / K / dimensions (2D↔3D) / maxRecords / nameClusters → re-cluster on real change only.
- F3. 3D interactive (orbit) if applicable.
- F4. Cluster labels are LLM-generated semantic names.
- F5. First open after fresh load shows data (no race / "no vectors" flip-flop).

## G. Saved views + config
- G1. View selector dropdown lists saved views for the entity; selecting one loads it.
- G2. Save / Save-as-new / Duplicate / Delete / Revert / Quick-save flows.
- G3. View config panel (columns/sort/filter) opens, edits apply, save persists.
- G4. Loading a saved view applies its ViewTypeID + per-view-type config.

## H. Persistence
- H1. Active view type persists per entity (default-view setting) across reloads (ViewTypeID-only).
- H2. Per-view-type config (grid columns, timeline field, map mode, cluster config) persists and is PER ENTITY (no leak across entities).
- H3. Saved-view config persists on the UserView record's DisplayState.

## I. Entity switching (nav panel)
- I1. Switch entity → correct columns/data for the NEW entity (no leftover columns from prior entity).
- I2. View-type availability re-evaluated for the new entity.
- I3. Active view type for the new entity = its persisted default (or first available).
- I4. Nav panel collapse/expand persists (UserInfoEngine), default collapsed.

## J. Plugin instance caching / lifecycle
- J1. Switch view types within SAME entity+view → instances cached (state preserved: cluster not recomputed, grid scroll/sort kept).
- J2. Entity change → cache thrown out + rebuilt fresh.
- J3. View (UserView) change → cache thrown out + rebuilt.
- J4. No console errors (NG0919/NG0303/etc.) on any switch/mount.

## K. Navigation (routing) — only legitimate upward signals
- K1. Open record / FK / create → routes via Explorer (no Router in Generic).
- K2. Nothing else bubbles up to drive the dashboard (export/add-to-list are self-contained).

## L. Other entity-viewer consumers (the viewer is reused outside Data Explorer)
- L1. **UserView resource** (`view-resource`): opening a saved view as a resource renders + navigates.
- L2. **Single search result** (`single-search-result`): renders entity records.
- L3. **Entity form** (custom Entities form): the embedded viewer renders.
- L4. **Dashboard-viewer** view-part: renders an entity view inside a dashboard.

## M. Console hygiene
- M1. No NG errors, no unhandled promise rejections, no red console across all flows.

---
## Bug log (filled during the run)
(rounds appended below; each round: bug list → fixes → re-run result)
