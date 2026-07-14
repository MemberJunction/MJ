# Lists Functionality & Performance Review — Findings and Remediation Plan

**Date:** 2026-07-13 (implemented 2026-07-14)
**Status:** IMPLEMENTED on branch `feature/lists-performance-and-fixes` (PR #3145) — see Implementation Log at the bottom. Deferred items: F2 real Activity section, F5 favorites-filter persistence / My Lists edit-delete, P8 Venn MaxRows caps, F7 name-field-less search UX.
**Scope reviewed:** Lists Application dashboards (Browse / My Lists / Categories / Operations-Venn / Shared With Me), the custom `MJ: Lists` entity form, every add-to-list entry point in the UI, the `@memberjunction/ng-list-management` service/dialog, the `@memberjunction/lists` server engine + `ListOperationsResolver`, the `Add Records to List` action, `ListSource` in RecordSetProcessor, and the ListDetail schema/indexes.

---

## 1. Functionality Status

### Implemented and wired (verified in code)

| Surface | Status |
|---|---|
| Lists app: Browse (table/card/hierarchy, search, filters, favorites, create/edit/delete/duplicate/share) | ✅ Complete |
| Lists app: My Lists, Categories (full CRUD + hierarchy), Shared With Me | ✅ Complete |
| Lists app: Operations (Venn set ops, compose-into-list, export, delta-confirm) | ✅ Complete |
| Custom `MJ: Lists` form: Overview, Items grid, Sharing, **Add Records dialog**, **Add From View dialog** | ✅ Complete (both add dialogs fully implemented with TransactionGroup batching, dedup, progress) |
| Record form toolbar → Add-to-List panel (`mj-record-form-container` → `mj-list-management-dialog`) | ✅ Wired end-to-end |
| Grid add-to-list: `grid-view-renderer` handles `AddToListRequested` internally ([grid-view-renderer.component.ts:456](../packages/Angular/Generic/entity-viewer/src/lib/view-types/renderers/grid-view-renderer.component.ts#L456)) | ✅ Wired for all view-renderer consumers |
| Server: `ListOperationsResolver` (PreviewListDelta/ApplyListDelta with drop-guard + delta tokens, MaterializeListFromView, RefreshListFromSource, ComposeLists, full sharing/invitation suite) | ✅ Complete |
| `Add Records to List` action, `ListSource` for Record Set Processing | ✅ Present |

### Broken / stubbed / gaps

| # | Item | Location | Severity |
|---|---|---|---|
| F1 | **`openRecord()` on the custom List form does nothing** — clicking a list item is supposed to open the record but the body only calls `InvokeManualResize()` | [list-form.component.ts:395-400](../packages/Angular/Explorer/core-entity-forms/src/lib/custom/Lists/list-form.component.ts#L395-L400) | **High** — visible broken UX |
| F2 | Activity section is a placeholder — renders a static "Detailed activity tracking coming soon" panel with only created/updated timestamps | [list-form.component.html:384-411](../packages/Angular/Explorer/core-entity-forms/src/lib/custom/Lists/list-form.component.html#L384) | Medium (advertised in nav but not real) |
| F3 | Duplicate skipping is silent — `ListManagementService.addRecordsToLists` returns a `skipped` count but the dialog never surfaces it, so users think all records were added | [list-management-dialog.component.ts:504-564](../packages/Angular/Generic/list-management/src/lib/components/list-management-dialog/list-management-dialog.component.ts#L504) | Medium (UX trust) |
| F4 | Raw `entity-data-grid` consumers that enable `ShowAddToListButton` must wire `AddToListRequested` themselves; the renderer wrapper does it, but a direct grid consumer that forgets gets a dead button | [entity-data-grid.component.ts:1293](../packages/Angular/Generic/entity-viewer/src/lib/entity-data-grid/entity-data-grid.component.ts#L1293) | Low (documented pattern) |
| F5 | Browse favorites filter not persisted to query params (resets on tab reload); Edit/Delete/Duplicate only offered in Browse, not My Lists | lists-browse / lists-my-lists resource components | Low |
| F6 | No pagination anywhere lists or list members are displayed — all rows load at once (see perf section; also a functional scale ceiling) | multiple | High at scale |
| F7 | Entities without a NameField get degraded add-by-search UX (search returns nothing; PK shown as name) | [list-form.component.ts:585-599](../packages/Angular/Explorer/core-entity-forms/src/lib/custom/Lists/list-form.component.ts#L585) | Low |
| F8 | No DB unique constraint on `ListDetail(ListID, RecordID)` — dedup is app-level only, so two concurrent adders can create duplicates | baseline migration, `ListDetail` DDL | Medium |
| F9 | **Add Records dialog spinner never clears** (confirmed at runtime 2026-07-13): `openAddRecordsDialog()` flips `addDialogLoading = false` after the await and calls `cdr.markForCheck()`, but the component is OnPush and the GraphQL promise resolution produces no Angular tick — the view only re-renders on the next user event (clicking into search clears it). Fix: `cdr.detectChanges()` after the await; sweep the same `markForCheck()`-after-await pattern across the file (`loadExplorerData`, `loadItems`, `searchRecords`, `loadEntityViews`, `confirmAddFromView`, …) which is latent everywhere and only masked by ongoing user events | [list-form.component.ts:523-534](../packages/Angular/Explorer/core-entity-forms/src/lib/custom/Lists/list-form.component.ts#L523-L534), spinner binding at [list-form.component.html:535](../packages/Angular/Explorer/core-entity-forms/src/lib/custom/Lists/list-form.component.html#L535) | **High** — visible on every dialog open |

> Note: runtime UI verification (clicking through the flows against a live DB) was not performed in this pass — servers weren't running. Section 4 includes it as an explicit verification step. All statuses above are from code-path analysis. Schema-level claims (indexes, constraints, duplicates) **were** verified live against the local dev DB `MJ_v5_43_Clean` (v5.45 schema) — see P7 / Phase 3. That DB's Lists tables are empty, so before/after timing must happen on a production-like dataset (or seeded fixtures).

---

## 2. Performance Findings (ranked by likely contribution to "feels slow")

### P1 — N+1 record-name resolution when opening a List record ⚠️ biggest offender
[list-form.component.ts:226-255](../packages/Angular/Explorer/core-entity-forms/src/lib/custom/Lists/list-form.component.ts#L226-L255) — `loadRecordNames()` issues **one sequential `RunView` per list item**. Opening a list with 500 members = 500 serial GraphQL round trips. A 2,000-member list is minutes of loading.
**Fix:** single chunked query per ~500 IDs — `${pk} IN (...)` with `Fields: [pk, nameField]`, `ResultType: 'simple'` (this is exactly the pattern `single-list-detail.component.ts` already uses at lines 87-102). Combined with P2 pagination, only resolve names for the visible page.

### P2 — Unbounded member loads on the List form
[list-form.component.ts:193-224](../packages/Angular/Explorer/core-entity-forms/src/lib/custom/Lists/list-form.component.ts#L193-L224) — `loadItems()` loads **every** List Detail row as full `entity_object` (no `MaxRows`). Same issue in `single-list-detail.component.ts` (loads all member RecordIDs, then one giant `IN (...)` row query — which will also blow up SQL parameter/IN-clause limits on large lists).
**Fix:** paginate the Items section (keyset via `AfterKey` for deep lists, `StartRow` acceptable for UI pages); load details as `simple` + `Fields` and hydrate an entity object only on delete.

### P3 — Lists Browse dashboard loads every List Detail row in the system
[lists-browse-resource.component.ts:2117-2140](../packages/Angular/Explorer/dashboards/src/Lists/components/lists-browse-resource.component.ts#L2117-L2140) — to show per-list item counts, it loads **ALL `MJ: List Details` rows** (`Fields: ['ListID']`, `BypassCache: true`) plus all Lists (BypassCache) and all Users. On a real system with hundreds of thousands of memberships, every visit to the Lists tab transfers the whole membership table. `BypassCache` doubles the pain by skipping the server cache.
**Fix:** replace with server-side counts — either (a) a stored Query `SELECT ListID, COUNT(*) AS ItemCount FROM ListDetail GROUP BY ListID` run via `RunQuery`, or (b) a batched `RunViews` of `count_only` requests. Drop the Users query entirely — `MJListEntity.User` is already a denormalized view field. (RunView `Aggregates` exist but have no GROUP BY, so per-list counts need the query or count_only batch.)

### P4 — Add-to-List panel loads full membership of every list to count it
[list-management.service.ts:246-259](../packages/Angular/Generic/list-management/src/lib/services/list-management.service.ts#L246-L259) — `buildListViewModels()` loads **all ListDetail rows for all lists of the entity** as `entity_object` just to count them. This runs when the record-form Add-to-List panel opens — likely why that panel feels slow. Also `getRecordMembership` (line 154) and the dedup query (line 308) use `entity_object` where `simple` + `Fields: ['ListID','RecordID']` suffices.
**Fix:** same count strategy as P3 (count_only batch / stored query); switch membership queries to `simple`.

### P5 — Removal paths delete one row at a time with no TransactionGroup
- [list-management.service.ts:412-426](../packages/Angular/Generic/list-management/src/lib/services/list-management.service.ts#L412-L426) — `removeRecordsFromLists`: sequential `Delete()` per row.
- [list-form.component.ts:368-373](../packages/Angular/Explorer/core-entity-forms/src/lib/custom/Lists/list-form.component.ts#L368-L373) — `removeSelectedItems`: same.
**Fix:** queue deletes in a TransactionGroup (mirror the add paths, which already do this correctly).

### P6 — Server-side bulk operations save sequentially, one record per round trip
- [ListOperations.ts:723-733](../packages/Lists/server/src/ListOperations.ts#L723) (`ApplyDelta` ToAdd loop) and [984-994](../packages/Lists/server/src/ListOperations.ts#L984) — per-record `GetEntityObject` + `Save()`, sequential, no TransactionGroup. Materializing a 10K-row view = 10K sequential sproc calls; this is the latency behind MaterializeListFromView / AddViewResultsToList / RefreshListFromSource / compose-apply.
- [add-records-to-list.action.ts:93-124](../packages/Actions/CoreActions/src/custom/lists/add-records-to-list.action.ts#L93-L124) — same pattern in the action.
- Delta drop path (~line 775-790) deletes per-row.
**Fix:** server-side TransactionGroup in chunks (e.g. 500/txn) or a bounded-concurrency pool; longer term consider a set-based bulk insert path for ListDetail.

### P7 — Missing composite index, redundant duplicate index, `ListSource` offset pagination
- No index on `ListDetail(ListID, RecordID)` — the duplicate-check query (`ListID = X AND RecordID IN (...)`) run by every add path only has single-column indexes to work with. Add `IX_ListDetail_ListID_RecordID` (also the prerequisite for a future unique constraint, F8). **Verified live** against `MJ_v5_43_Clean` (v5.45 schema): `sys.indexes` shows only `PK_ListDetail_ID`, `IDX_AUTO_MJ_FKEY_ListDetail_ListID`, `IX_ListDetail_ListID`, `IX_ListDetail_RecordID` — no composite, no unique constraint.
- **Redundant duplicate index (verified live):** `IX_ListDetail_ListID` and `IDX_AUTO_MJ_FKEY_ListDetail_ListID` are identical single-column `ListID` indexes — every ListDetail insert/delete maintains both. Drop `IX_ListDetail_ListID` (keep the CodeGen-managed `IDX_AUTO_MJ_FKEY_*` one — CodeGen would recreate it if dropped). Once the composite `(ListID, RecordID)` index exists, its leading column also covers ListID-only seeks.
- [listSource.ts:45-69](../packages/RecordSetProcessor/base/src/sources/listSource.ts#L45) uses `StartRow` offset pagination; per the repo's keyset guide this degrades on 100K+ lists — switch to `AfterKey`.

### P8 — Secondary caps (defensive)
`list-set-operations.service.ts:184-193` (Venn operand membership) and the Operations component operand loaders have no `MaxRows`; fine at moderate scale, worth explicit caps + a "list too large" affordance.

---

## 3. Proposed Remediation Plan

Work on a fresh branch off `next` (e.g. `feature/lists-performance-and-fixes`). Phases are independently shippable; Phase 1 alone should eliminate most of the perceived slowness.

### Phase 1 — Read-path performance (the "feels slow" fixes)
1. **List form**: replace `loadRecordNames()` N+1 with one chunked `IN (...)` batch query; paginate the Items section (page size ~100) and resolve names per page; add `MaxRows` guard to `loadItems()`.
2. **Browse dashboard**: per-list counts via a new stored Query (`List Record Counts`, GROUP BY ListID) or batched `count_only` RunViews; remove the full ListDetails and Users loads (use the `User` view field). Re-evaluate whether `BypassCache: true` is still needed once counts don't depend on the details cache.
3. **ListManagementService**: counts via the same mechanism; membership + dedup queries → `ResultType: 'simple'` with narrow `Fields`.
4. **single-list-detail**: chunk the `IN (...)` row fetch and page the grid.

### Phase 2 — Write-path batching
5. TransactionGroup the two client-side removal loops (P5).
6. Server: chunked TransactionGroup (or bounded concurrency) in `ListOperations` add/drop loops and `AddRecordsToListAction` (P6). Keep per-record error collection semantics.

### Phase 3 — Database migration (one v5 migration)
7. Add `IX_ListDetail_ListID_RecordID` nonclustered composite index and drop the redundant `IX_ListDetail_ListID` (its FK twin `IDX_AUTO_MJ_FKEY_ListDetail_ListID` stays — CodeGen manages/recreates that one). Additive/perf-only — compliant with publish-no-break policy.
8. ✅ IMPLEMENTED (2026-07-14): the migration now dedupes in-place (deletes newer rows per `(ListID, RecordID)` pair, keeping the oldest by `__mj_CreatedAt` then `ID`) and creates `UQ_ListDetail_ListID_RecordID` — a UNIQUE composite index that both closes the concurrent-add race (F8) and covers the duplicate-check predicate. Verified live: duplicate insert rejected with Msg 2601; app layers already surface per-record insert failures, so a race loser reports a failed row instead of silently duplicating.
9. Switch `ListSource` to keyset (`AfterKey`) pagination.

### Phase 4 — Functionality fixes
10. **Fix the Add Records dialog stuck spinner** (F9): `detectChanges()` after the awaited load in `openAddRecordsDialog()`, plus a sweep of the file's other `markForCheck()`-after-await sites. Smallest, most user-visible fix in the plan — can ship first/standalone.
11. **Fix `openRecord()`** in the custom List form to actually navigate to the record (F1).
12. Surface skipped-duplicate counts in the list-management dialog result toast (F3).
13. Persist Browse favorites filter via `UpdateQueryParams` / `OnQueryParamsChanged` (F5a); optionally add Edit/Delete to My Lists context menu (F5b).
14. (Optional / later) Real Activity section backed by Record Changes for the List + List Details (F2); `MaxRows` caps on Venn operand loads (P8).

### Verification (every phase)
- `npm run build` + `npm run test` in each touched package; update unit tests (ListManagementService has tests that will need the new count/query shapes).
- `npm run test:integration` — extend `packages/MJServer/integration-test-scripts/` with a deterministic lists suite covering bulk add/remove batching and dedup if one doesn't exist.
- Live UI pass (MJAPI + MJExplorer + Playwright): open a large list (1K+ members) and time it before/after; open the Lists tab; add-to-list from a record form and from a grid selection; verify skipped-duplicate toast.

### Expected impact
- Opening a list record: **N+2 queries → ~3 queries** (list, one page of details, one name batch). A 500-member list goes from ~500 round trips to 3.
- Lists tab load: data transfer drops from O(total memberships in system) to O(number of lists).
- Add-to-List panel open: no longer downloads full membership of every candidate list.
- Bulk add/remove of K records: K round trips → K/500 transactions (client already batched on add; server and delete paths gain the same).

---

## Implementation Log (2026-07-14, branch `feature/lists-performance-and-fixes`)

**Phase 1 — read path (all done):**
- `list-form.component.ts` — Items section now paginated (100/page, pager in footer); display names resolved with one chunked `PK IN (...)` batch per page instead of one query per item; `markForCheck()` swept to `detectChanges()` file-wide (fixes F9 stuck spinner); `openRecord()` actually opens the record via `SharedService.Instance.OpenEntityRecord` (fixes F1, composite-PK guarded); selected-item removal uses a TransactionGroup.
- `lists-browse-resource.component.ts` + `lists-my-lists-resource.component.ts` — no longer download List Details (or Users); per-list counts come from one batched `RunViews` of `count_only` queries; owner names from the denormalized `List.User` view field.
- `list-management.service.ts` — `buildListViewModels` counts via `count_only` batch; membership/dedup queries switched to `simple` + narrow `Fields`; `removeRecordsFromLists` queues deletes in a TransactionGroup.
- `single-list-detail.component.ts` — export no longer round-trips every member ID into a client-built `IN(...)`; membership is filtered server-side via the same `vwListDetails` subquery the member grid uses, after a cheap `count_only` emptiness check.

**Phase 2 — write path (done, with one deliberate deviation):** server-side `ListOperations` (`insertListMembers`, now also reused by `applyDeltaMutations`; `removeDeltaRecords`) and `AddRecordsToListAction` use a **bounded-concurrency pool (10 in-flight)** instead of the plan's TransactionGroup option — on the server, TG buys atomicity not throughput (it's already next to the DB), and it would break the documented per-record `PARTIAL_SUCCESS` isolation. Concurrency preserves semantics and cuts wall clock ~10×.

**Phase 3 — database (fully done):** migration `V202607141000__v5.48.x__ListDetail_Index_Optimization.sql` dedupes `ListDetail` in-place (keeps the oldest row per pair), creates the **UNIQUE** composite index `UQ_ListDetail_ListID_RecordID` (covers the dup-check predicate AND closes the concurrent-add race), and drops the redundant `IX_ListDetail_ListID` (idempotent; applied to the dev DB `MJ_v5_43_Clean`, uniqueness enforcement verified via rejected duplicate insert). `ListSource` converted to keyset (`AfterKey`) pagination with legacy-Offset-cursor resume support + 3 new unit tests.

**Phase 4 — functionality:** F9 ✅ (fixed in BOTH surfaces — the custom `MJ: Lists` form AND `single-list-detail`, the viewer the Lists app actually opens; the latter was confirmed at runtime 2026-07-14 after the form-only fix didn't cover it), F1 ✅, F3 ✅ (`ListManagementResult.summary` added; record-form-container shows an added/removed/skipped/failed toast). **Deferred:** F2 (real Activity section), F5 (favorites-filter persistence, My Lists edit/delete), P8 (Venn MaxRows caps).

**Test/build status:** RecordSetProcessor/base 22 ✅, Lists/server 76 ✅, list-management 63 ✅, base-forms 120 ✅; CoreActions/list-management/base-forms/MJCoreEntities compile clean. (Explorer packages required a local `MJCoreEntities` rebuild first — its dist was stale relative to `next`, unrelated to this work.)
