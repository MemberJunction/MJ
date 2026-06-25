# Empty-State Wave-2 Tail — Visual QA Backlog

Inventory of every empty-state migrated in the wave-2 tail (commits `790c74c8e6`,
`daa8f80e97`, `36f030c7cf`) plus the reset-CTA fixes, split by whether it was
**visually verified** (live Playwright force-state screenshot, light+dark this
session) or **build-verified only** (compiles + unit tests pass, but never seen
rendered).

Why this list exists: ~40 of these are build-verified only because we couldn't
locate where they render in the running app (the "where things live" gap). This
is the worklist for a future visual pass — ideally once a component→surface map
or a fixture/Storybook harness exists so each is reachable in isolation.

Legend: ✅ visually tested · 🔲 build-verified only · 🔎 reachability hint

---

## 🖼️ Variant gallery — covers the shared rendering of ALL empties at once

**`empty-state-gallery.html`** (+ `-light.png` / `-dark.png`) renders `<mj-empty-state>` in
**every** Variant × Size × icon × CTA combination, built from the component's *real* template,
styles, design tokens, and icon-resolution logic (1:1 copies from
`empty-state.component.ts` + `_tokens.scss` + `button.scss`). Open the HTML and toggle
`data-theme` on `<html>` for dark.

Why this matters for the backlog below: **every** migrated empty — reachable or build-verified —
is this same component with different inputs. The gallery visually validates the rendering all of
them share (icon tones per variant, size scaling, no-icon suppression, all 4 CTA button variants,
light/dark token adaptation). So the residual risk on the 🔲 items below is **only the per-instance
bespoke-class CSS interaction** (centering/width in its specific host) — the component itself is
now visually proven across the full matrix.

## ✅ Visually tested (light + dark) — `plans/empty-state-screenshots/wave2-dashtail/`

| Instance | Component | Surface |
|---|---|---|
| ✅ realtime room-list (`No meeting transcripts yet`) | `AI/.../realtime-transcripts` | AI → Analytics → Voice Transcripts |
| ✅ realtime no-selection (`Select a meeting`) | same | same (transcript pane) |
| ✅ `tag-cloud-empty` (no-results + Clear-filters CTA) | `KnowledgeHub/.../tag-cloud` | Knowledge Hub → Visualize → Tag Cloud |
| ✅ `empty-chart` (`No usage data available`) | `APIKeys/api-usage-panel` | Admin → Identity & Access → API Keys → Usage Analytics |
| ✅ `empty-chart` (`No execution trends available`) | `Actions/execution-monitoring` | Actions → Monitor (force `executionTrends=[]`) |
| ✅ `scope-manager-empty` **+** `scope-manager-empty-detail` (2-in-1) | `KnowledgeHub/config` | Knowledge Hub → Configuration → Search Scopes (real-click nav, then force `SearchScopes=[]`) |
| ✅ `search-permissions-empty` | `KnowledgeHub/config` | KH → Configuration → Permissions (force `PermissionsRows=[]`) |
| ✅ `sidebar-empty` (forced — see note) | `Home/home-dashboard` | Home Quick-Access sidebar — **effectively unreachable in normal use** (see Findings) |
| ✅ canvas flex-fill pattern (spot-check, dark) | FormBuilder `mj-form-builder-canvas` | Component Studio → Form Studio (validates ComponentStudio `canvas-empty`/`fbt-empty` by shared pattern, not the literal instances) |

### Reachability findings from the capture pass (real intel for the future harness)
- **`Home/sidebar-empty` is dead code**: `hasSidebarContent` is a getter that's true only when a list is non-empty or loading, but the empty renders only when all lists are empty & not loading — the sidebar collapses before the empty can show. Captured only by overriding the getter via `defineProperty`. Pre-existing (the old inline markup had the same gating); flag for a separate cleanup decision.
- **`DataExplorer/navigation-panel` (`mj-explorer-navigation-panel`) is not mounted in the default Data Explorer view** — interaction-gated; couldn't surface via routing + force-state.
- **`KnowledgeHub/record-drilldown`**: host mounts in Visualize but the empty only renders after a real drill-in (tag/cluster click) — `Records=[]` alone doesn't trigger it.
- **`KH config ActiveSection` reverts on change-detection** — must switch sections via a real nav click, then force the data arrays (not by setting `ActiveSection` directly).

---

## §1 Dashboards tail + explorer-core (`790c74c8e6`)

**7 captured ✅** (Home sidebar, KH config scope-manager + detail + permissions, Actions exec-monitoring,
realtime ×2, tag-cloud, api-usage). The rest below stayed 🔲 — not for lack of trying: each is
**interaction-gated** (the host only mounts after a deep drill-in this env can't script) or needs
**data this environment lacks** (0 meetings, 0 connector runs, no empty dashboard). These need either
hands-on navigation or the fixture harness. Per-item blocker noted inline.

- ✅ `Home/home-dashboard` — `sidebar-empty` (captured, but **dead code** — see Findings)
- 🔲 `DataExplorer/navigation-panel` — `empty-section` ×2 (favorites / recent) 🔎 Data Explorer left nav, empty favorites/recents
- 🔲 `DatabaseDesigner/entity-review-panel` — `review-empty` 🔎 Database Designer wizard, before schema defined
- 🔲 `ComponentStudio/requirements-editor` — `empty-preview` (dynamic title + "Start writing") 🔎 Component Studio → component → requirements tab, empty
- 🔲 `ComponentStudio/form-builder-canvas` — `canvas-empty` 🔎 pattern spot-checked ✅; literal instance in Component Studio workspace
- 🔲 `ComponentStudio/form-builder-tab` — `fbt-empty` 🔎 Component Studio workspace → Form Builder tab, no entity
- 🔲 `APIKeys/api-applications-panel` — `empty-scopes` (warning), `empty-scopes-message` 🔎 API Keys → Applications (expanded app w/ no scopes; create-panel w/ no scopes)
- ✅ `Actions/execution-monitoring` — `empty-chart` (captured light+dark)
- 🔲 `VersionHistory/diff-resource` — `diff-fields-empty` 🔎 a diff item with no field-level changes
- ✅ `KnowledgeHub/config` — `scope-manager-empty`, `scope-manager-empty-detail`, `search-permissions-empty` (all 3 captured light+dark)
- 🔲 `KnowledgeHub/record-drilldown` — `drilldown-empty` 🔎 KH → Visualize → drilldown with no records
- 🔲 `AI/realtime-transcripts` — `no recorded utterances` (3rd of 3; other 2 ✅) 🔎 selected meeting w/ 0 utterances
- 🔲 `Integration/run-history-panel` — `history-empty` 🔎 Integration → a connector widget with no runs
- 🔲 `explorer-core/single-dashboard` — `empty-dashboard` (onboarding + Add Item) 🔎 an empty dashboard resource

---

## 🔲 §2 Generic already-wired (`daa8f80e97`) — build-verified only

Deeply embedded — mount only inside specific workflows. Need a fixture harness or guided nav.

- 🔲 `conversations/pinned-messages-panel` — `pins-empty` 🔎 conversation → pinned-messages panel, none pinned
- 🔲 `flow-editor/agent-properties-panel` — `mj-agent-props-empty` 🔎 agent flow editor, nothing selected
- 🔲 `flow-editor/agent-step-list` — `no steps` / `no paths` (2) 🔎 agent flow editor → list view, empty
- 🔲 `record-changes/ng-record-changes` — `rc-labels-empty` 🔎 record History panel, no version labels
- 🔲 `record-changes/restore-preview-panel` — `rpp-empty` 🔎 restore preview of an unparseable snapshot
- 🔲 `record-tags/record-tags` — `mj-related-empty` 🔎 record Tags panel → related records, none
- 🔲 `resource-permissions/user-sharing-center` — shared-with-me / shared-by-me (2) 🔎 Sharing Center, both tabs empty
- 🔲 `search/search-filter` — `filter-empty` 🔎 search filter panel with no filters
- 🔲 `versions/label-create` — entities-no-match / records-no-match (2) 🔎 label-create wizard, search to nothing
- 🔲 `versions/record-micro-view` — `micro-empty` 🔎 micro-view of a record with no field data

---

## 🔲 §3 Generic needing wiring/deps (`36f030c7cf`) — build-verified only

- 🔲 `archive-manager/archive-config-admin` — `config-empty`, `config-detail-placeholder`, `entity-empty` (3) 🔎 Archive config admin (no configs / no selection / no entities)
- 🔲 `archive-manager/archive-restore-dialog` — `restore-empty`, `preview-placeholder` (2) 🔎 restore dialog (no versions / no selection)
- 🔲 `archive-manager/archive-run-viewer` — `run-empty`, `drawer-details-empty` (2) 🔎 run viewer (no runs / no detail records)
- 🔲 `base-forms/record-form-container` — `mj-forms-empty-search-state` (no-results + Clear-search) 🔎 any record form → section search → no match
- 🔲 `entity-action-ux/field-rules-builder` — `frb-empty` 🔎 FieldRules builder, no rules
- 🔲 `entity-action-ux/record-process-runner-ux` — `rp-empty` (success variant) 🔎 bulk-op dry-run with nothing to change
- 🔲 `record-process-studio` — `rps-empty` (onboarding + Create) 🔎 Bulk Operations studio, none defined
- 🔲 `scheduling/scheduled-job-summary` — `summary-empty` 🔎 a scheduled-job summary panel, no schedule
- 🔲 `trees/tree` — `tree-empty` (dynamic icon/title) 🔎 any `mj-tree` consumer with no nodes
- 🔲 `whiteboard/whiteboard-snapshot` — `wb-snapshot-empty` 🔎 a saved-whiteboard artifact viewer with empty payload
- 🔲 `livekit-room/livekit-room` — no-screen / waiting-for-participants (2) 🔎 a live room (no screenshare / no participants)
- 🔲 `livekit-room/livekit-chat-panel` — `lk-chat-empty` 🔎 room chat panel, no messages

---

## 🔲 Reset-CTA fixes (uncommitted) — build-verified only

- 🔲 `sub-agent-selector-dialog` `clearFilters()` 🔎 AI Agent form → Add Sub-Agent → filter by type to 0 → "Clear Filters"
- 🔲 `add-action-dialog` `clearSearch()` (now clears category) 🔎 AI Agent form → Add Action → filter by category to 0 → "Clear Filters"
- 🔲 `action-gallery` `clearSearch()` (now clears category) 🔎 currently a dead stub from Actions Overview (`onActionGalleryClick` is empty) — needs a live mount point

---

## Notes

- "Build-verified" = the package compiles all `<mj-empty-state>` instances (a template
  error fails the build) and unit tests pass; it does NOT confirm visual layout/centering
  or that dynamic-text/CTA wiring renders as intended.
- Functional regression risk is low regardless (edits confined to empty branches, CTA
  handlers/bindings AOT-typechecked, `Icon=""` no-icon contract verified). The residual
  risk these items carry is **cosmetic** (centering/padding/icon) + dynamic-copy wording.
- The canonical `<mj-empty-state>` itself is proven across the ✅ captures + the broader
  screenshot library (`plans/empty-state-screenshots/`), so the per-instance risk is the
  bespoke-class CSS interaction, not the component.
