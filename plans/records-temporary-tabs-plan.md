# Records Region: Single Temporary Tab (VS Code preview-tab behavior)

**Branch:** `records-temporary-tabs` (rebased onto `origin/next` 2026-09-09, tracks `origin/records-temporary-tabs`)
**Ask:** Amith, 2026-09-01. The Records tabset must behave like the main Golden Layout tabset: at most one temporary (italic) tab, plain opens replace it, shift-click opens a separate tab, double-click and right-click promote. Target: edge.6.
**Status:** IMPLEMENTED 2026-09-09. Steps 1-6 done; verified live in MJExplorer. Every §5 decision is resolved below — the plan text in §1-§4 is kept as written for the record, with implementation notes where reality differed.

---

## 1. The behavioral contract (what "done" looks like)

| Gesture | Result |
|---|---|
| Click a record (no modifier) | Reuses the region's single temporary tab: same tab id, new record content. If none exists, creates one (unpinned, italic). |
| Click a record already open in ANY records tab | Focuses that tab (existing dedup, unchanged). |
| Shift-click a record | Keeps the existing tabs and adds a tab, so two tabs remain. Mirror the main tabset's exact mechanics (see Decision D2 for the polarity question). |
| Double-click a records tab header | Toggles pinned/temporary (already works today). |
| Right-click a records tab header | Pin Tab / Unpin Tab menu item (already works today). |
| Browser back after a replacement | Returns to the previously shown record (history entry per open; consumed records re-materialize via `handleMissingTabForUrl`). |
| Pinned (permanent) tabs | Never replaced, never auto-closed. Not italic. |

Invariant: **at most one consumable temporary tab per region**, enforced by construction (replacement), exactly like the main tabset.

---

## 2. How the main tabset does it (the reference implementation)

All paths relative to `packages/Angular/Explorer/`.

- **Model:** `isPinned: boolean` on `WorkspaceTab` (`base-application/src/lib/interfaces/workspace-configuration.interface.ts:86`). Temporary means `isPinned === false`. There is no separate isTemporary flag. Persisted with the workspace config (`workspace-state-manager.ts:242-255`); pin state is NOT carried in the GL layout blob (`layout-transforms.ts:53-55`), `config.tabs[]` is the single source of truth.
- **Replacement ("temp consumption"):** `WorkspaceStateManager.OpenTab` (`base-application/src/lib/workspace-state-manager.ts:380-509`). Order: focus exact match, else consume the temp tab (`:463`), else create new unpinned (`:490-500`). Consumption overwrites applicationId/title/resourceTypeId/resourceRecordId/configuration in place and **reuses the tab id** (`:465-487`). The shell then swap-reloads the pane content when the resource signature changed (`explorer-core/src/lib/shell/components/tabs/tab-container.component.ts:2275-2298`, `needsReload`).
- **Single-temp invariant:** by construction. New temp creation via `OpenTabForced` first pins every existing unpinned tab (`workspace-state-manager.ts:360-366`) unless `PreservePinState` is set.
- **Gestures:** dblclick and contextmenu handlers live in the shared `GoldenLayoutManager` (`base-application/src/lib/golden-layout-manager.ts:693-703`), wired to `TogglePin`/`showContextMenu` per GL instance. Italic is applied in `applyTabStyles` (`golden-layout-manager.ts:657-661`); pinned tabs get the thumbtack and lose the close X (`tab-container.component.css:550`).
- **Shift detection:** global capture-phase mousedown listener stores `shiftKey` (`shared/src/lib/navigation.service.ts:315-327`), consumed by `shouldForceNewTab` (`:339-347`). No MouseEvent threading through call sites needed.
- **History:** workspace changes push URL entries (`shell.component.ts:907-942`, plain `navigateByUrl`, no `replaceUrl`); back into a consumed tab re-creates the resource from the URL (`handleMissingTabForUrl`, `shell.component.ts:1013-1110`).

## 3. Why the records region doesn't do it today (three deliberate exemptions)

Records tabs are born unpinned (`navigation.service.ts:509`, nobody passes `pinTab`), so they render italic via the shared styling. But the temp-tab machinery was switched off for them when the region shipped (#3444), to protect open records from nav clicks:

1. `navigation.service.ts:497` (and `:996`): `forceNew = tabsMode || shouldForceNewTab(options)` — records style always forces a NEW tab; shift is never even consulted.
2. `navigation.service.ts:513`: `PreservePinState: tabsMode` — skips the pin-all-other-temps cascade in `OpenTabForced` (`workspace-state-manager.ts:364-366`), so nothing ever promotes them.
3. `shell.component.ts:229-231`: `TempTabConsumptionFilter = (tab) => !IsRecordsTabConfiguration(...)` — no record tab may ever be consumed as the replaceable temp.

Net effect: every record open mints an unpinned italic tab that nothing can replace or promote. Italic (the visual vocabulary for "temporary") is inherited; the behavior never was. That is the tab explosion.

The protection itself is still correct and must survive: **a nav click must never consume a record tab.** The fix adds a second, records-scoped pool with its own consumption rule; it does not weaken the nav-side rule.

---

## 4. Implementation plan

### Step 1 — Region-scoped temp consumption in `WorkspaceStateManager` (ng-base-application)

Generalize consumption from "the main-layout pool" to "the request's pool":

- Add `TempScope?: 'main' | 'records'` to `TabRequest` (`base-application/src/lib/interfaces/tab-request.interface.ts`), default `'main'`.
- Add a settable `RecordsRegionTabFilter: ((tab) => boolean) | null` predicate on WSM, installed by the shell next to the existing two (`shell.component.ts:213-232`) as `(tab) => IsRecordsRegionTab(tab.configuration)`. Layering requires injection, not import: base-application sits below ng-shared, which owns `IsRecordsRegionTab` (`shared/src/lib/record-open-style.ts:61`). Same pattern as `MainLayoutTabFilter`.
- In `OpenTab` (`workspace-state-manager.ts:463`), pick the pool by scope:
  - `'main'` (today's behavior, unchanged): `!isPinned && isMainLayoutTab(tab) && isTempTabConsumable(tab)`.
  - `'records'`: `!isPinned && RecordsRegionTabFilter(tab)`. Region members only, so docked-to-workspace records (`recordDockedToWorkspace`) are never consumed. `TempTabConsumptionFilter` continues to apply to the main pool only.
- In `OpenTabForced` (`:360-366`), scope the pin cascade the same way: a records-scoped forced open pins unpinned records-REGION tabs and leaves nav temps alone. This replaces the blunt `PreservePinState: tabsMode` opt-out for record opens (`PreservePinState` stays for callers that genuinely need no cascade; the existing contract comment at `tab-request.interface.ts:26-34` gets updated).

### Step 2 — Route record opens through consumption (ng-shared)

In `OpenEntityRecord` (`navigation.service.ts:464-531`) and `OpenNewEntityRecord` (`:981-1030`), records style:

- Keep dedup-first exactly as is (`:479-495`; second layer `workspace-state-manager.ts:315-322`).
- Change `forceNew = tabsMode || shouldForceNewTab(options)` to `forceNew = this.shouldForceNewTab(options)`; set `TempScope: 'records'` on the request. No-shift now consumes the region temp tab; shift (or `options.forceNewTab`, which un-breaks `single-record.component.ts:66`'s currently-inert `OpenInNewTab`) goes through `OpenTabForced` with the scoped cascade.
- Deep-link/URL opens (`MJExplorer/src/app/app-routing.module.ts:267-282`, `:517-529` → `shell.component.ts:834`) get `TempScope: 'records'` too, closing today's asymmetry where a URL open can consume a NAV temp tab and convert it into a records tab.

### Step 3 — Content swap on the records GL when a tab id is reused (explorer-core)

The main sync path reloads pane content when a reused tab's resource signature changes (`tab-container.component.ts:2275-2298`). The records sync path (`syncRecordsTabs`, `:358-391`) currently updates title/pin style only; it needs the same `needsReload` treatment: detect Entity/recordId change on an existing records tab id, `cleanupTabComponent` + reload, re-capture the origin crumb (crumb refs are per tab component; see the `RebindTabId` cleanup precedent), and respect the region guards (`recordsCreatingTabs`, `recordsRebuilding`, `mobileRecordsActive`).

Note: id-reuse replacement is what keeps `layoutCoversExactTabSet` (`:2125-2142`) satisfied, so desktop split layouts survive. Do not implement replacement as close+create.

### Step 4 — History verification

Replacement must push a history entry so browser back returns to the replaced record. The machinery exists (`syncUrlWithWorkspace` pushes; `handleMissingTabForUrl` re-materializes consumed records with `RecordSourceContext 'none'`). Verify live that records-region activations and replacements actually drive the URL, and that back/forward walks the record trail. If records tabs turn out not to sync the URL today, that becomes a small Step 4b.

### Step 5 — Tests (Definition of Done)

- **base-application unit tests** (extend `__tests__/base-application.test.ts:472-571`): records-scoped consumption replaces only region temps; nav temps untouched by record opens and vice versa; docked records never consumed; scoped cascade on forced open; pinned records never replaced; dedup beats consumption; `TogglePin` round-trip.
- **ng-shared:** first tests for `OpenEntityRecord` (currently zero): dedup path, shift branch, scope on request, deep-link parity.
- **explorer-core DOM tests:** records sync reload-on-replacement (currently zero coverage of `syncRecordsRegion`/`syncRecordsTabs`); pill count stays correct through replacement (it derives purely from `config.tabs` — `records-hub-pill.component.ts:57-94` — so id reuse keeps it right by construction, pin the behavior anyway).
- Run each touched package's suite plus `pnpm run test:integration`.

### Step 6 — Changeset + PR

Patch changeset (no migration/metadata). Packages: `@memberjunction/ng-shared`, `@memberjunction/ng-base-application`, `@memberjunction/ng-explorer-core`. All below MJExplorer (never-modify-apps rule holds). Open Apps get the behavior for free: they run inside the MJ Explorer shell (`packages/OpenApp/README.md:482-486`), so bizapps-orders inherits it with no changes there. Reviewer: rkihm-BC unless Amith wants eyes on the WSM change.

---

## 5. Design decisions — RESOLVED

- **D1 — Unsaved edits in the temp tab. RESOLVED: refuse to consume an editing tab.** The plan offered (a) auto-promote on dirty or (b) "run the existing unsaved-changes guard". **(b) was based on machinery that does not exist** — there is no unsaved-changes guard anywhere in the shell or base-application; the only unsaved handling in Explorer lives inside individual forms. And (a) had no signal to hang off: `BaseFormComponent` has `StartEditMode`/`EndEditMode` but no output, and `FormStateService.setEditMode` stores a `Set<string>` keyed by **entity name**, so it cannot tell two open tabs of the same entity apart — exactly the case that matters.
  Shipped instead: a record whose form is in edit mode simply **leaves the consumption pool**, so the next plain open lands in its own tab. Same user-visible outcome as VS Code's promote-on-modify, with no dirty-tracking pipeline. `MjEntityFormHostComponent` already exposes the live form, so the chain is a synchronous read (`mj-single-record.IsEditing()` → `BaseResourceComponent.IsEditing()`, default `false` → `TabContainerComponent.IsRecordTabEditing()` → the pool predicate) and `ng-base-forms` needed no change. MJ forms are read-only until the user explicitly clicks Edit, so edit mode is a deliberate gesture and a sound proxy for "work worth protecting".
- **D1b — New (unsaved) records. NOT IN THE ORIGINAL PLAN; decided during build.** An unsaved new record is the sharpest form of the D1 problem: it is unsaved from the moment it opens. `OpenNewEntityRecord` keeps forcing its own tab AND now opens it **pinned** under the records style, which takes it out of the pool entirely. Visible consequence: a brand new record shows a thumbtack and loses its close X. Flagged for Matt as a UX call that can be revisited.
- **D2 — Shift-click polarity. RESOLVED: mirror the main tabset.** The new tab is temporary and the scoped cascade promotes the previous one — the inverse of the original ask's wording, which described VS Code. Rationale: the ask is literally "behave like the main Golden Layout tabset", so the description was a recollection of that tabset rather than a separate requirement, and consistency serves the stated goal. Pinned by a test in `base-application.test.ts`; flipping it is one line plus one assertion.
- **D3 — Pin on "Move to Workspace"? RESOLVED: no change.** Docked records fail `RecordsRegionTabFilter` and so sit in neither pool — they were already immune to replacement, which was the only thing pinning would have bought. Left alone.
- **D4 — Keyboard-initiated opens. RESOLVED: accepted for v1.** Shift detection is a global mousedown listener, so shift+Enter on a grid row registers no modifier and replaces. Unchanged from the plan; called out in the PR.

### Implementation notes where reality differed from §4

- **Step 3 was smaller than feared.** The component cache keys on driver + record + app, **not** on tab id, so `cleanupTabComponent` parks the outgoing record as a future cache hit and the incoming record is a miss by construction. `loadTabContent` already calls `ensureRecordOriginCrumb`, so crumb re-capture came free rather than needing bespoke handling.
- **Step 4 needed no work.** `buildResourceUrl` already has a `case 'records':` branch and `syncUrlWithWorkspace` has no records exemption, so records tabs were already driving the URL. No Step 4b.
- **Deep-link scoping moved.** §4 put it at the route resolvers in `MJExplorer/src/app/app-routing.module.ts`; that package must not be modified, so the scope is assigned in `ShellComponent.processTabRequest`, which every URL-driven open funnels through anyway.
- **`OpenTab`'s dedup became live for records for the first time** (record opens previously always went to `OpenTabForced`). It has an explicit `Records` branch matching Entity + record id, so there is no cross-entity collision; pinned by a test.
- **The §7 rider was not optional.** `updateTabTitleFromResource` targeting the main layout manager stopped being cosmetic the moment replacement began retitling records tabs on every plain click, so it shipped in the same change.

## 6. Edge cases and guards checklist

- Temp tab living in a split pane: replacement reuses the id, so the new record lands in that pane's position (matches main-tabset behavior).
- Mobile (`mobileRecordsActive`, flattened stack): counts derive from `config.tabs` so record bar and switcher sheet stay correct; persistence is suppressed there by design; keep new sync logic behind the existing `recordsRebuilding`/`recordsCreatingTabs` guards.
- Closing the last records tab: region empties, pill hides; no keep-alive rule for the records pool (`workspace-state-manager.ts:530-531` already scopes keep-alive to main).
- Pinning hides the close X (`tab-container.component.css:550`): with the new pattern users will pin more; closing pinned tabs is context-menu only. Watch for feedback.
- Ephemeral (regression-test) workspaces bypass persistence (`workspace-state-manager.ts:178-193`): behavior must not depend on Save.

## 7. Riders spotted during research (small, adjacent)

- `updateTabTitleFromResource` (`tab-container.component.ts:1932`) targets the MAIN layout manager unconditionally; its siblings fork on `isRecordTab` (`:1819`, `:1904`). Masked today by the next config emission re-applying the title. Fix while in the file, since replacement makes title updates on records tabs more frequent.

## 8. Out of scope

- Any change to nav-tab temp behavior in the main tabset (reference only), except if D2 resolves toward changing it.
- Record bar / switcher sheet redesign; origin-crumb changes beyond re-capture on replacement.
- lm_tab visual redesign items queued from the main-nav branch.
