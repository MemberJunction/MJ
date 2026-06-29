# Alert Migration — Inventory & Reliable-Detection Markers

Source of truth for migrating bespoke inline alerts onto `<mj-alert>`, and the
basis for the `check:alerts` coverage/regression script. Built from a 4-agent
classification sweep of the 92 candidate files (behavior-based, de-noised).

## Totals (genuine inline alerts)
~**69 genuine alert instances** across ~40 files (the other candidates were
field-validation, error-STATE screens, toasts, badges, hints, or decorative).

| Bucket | Genuine alerts |
|---|---|
| settings + explorer-core | 15 |
| forms + Generic | 11 |
| dashboards-B (MCP/Scheduling/SysDiag/…) | 21 |
| dashboards-A (AI/APIKeys/Actions/…) | 22 |

## ✅ Reliable bespoke-alert markers (migration targets / detection)
High-confidence — these are genuine inline alerts wherever they appear:
- **`.alert` (+ `-error` / `-danger` / `-warning` / `-info` / `-success`)** — Bootstrap-style box; most reliable, ~8 components.
- **`*-banner` family** (genuine): `error-banner`, `mj-error-banner`, `info-banner`, `warning-banner`, `status-banner`, `status-warning-banner`, `sync-result-banner`, `recommendation-banner`, `success-banner`, `merge-warning-banner`, `fields-error-banner`, `mj-flow-node-warning-banner`.
- **box/card/panel**: `warning-box`, `info-box`, `success-card`, `error-card`†, `error-panel`, `result-header` (with `.success`/`.error`).
- **`.message` + `.error-message` / `.success-message` pair** (Permissions, ApplicationRoles) — match the PAIR, never bare `.error-message`.
- **named one-offs** (genuine): `suggestion-error`, `no-scopes-warning`, `key-warning`, `security-note`, `security-notice`, `scope-tip`, `pattern-warning`, `beta-warning`, `parent-info`, `alert-item` (+`alert-error`/`alert-warning`).
- **`role="alert"`** attribute is a useful secondary signal (several genuine banners set it).

## 🚫 EXCLUDE from markers (false-positives — would over-count)
- **bare `.error-message`** — the #1 hazard, flagged by all 4 agents. Overloaded: a real banner, a per-field validation msg, an error-tinted field-value box, a `<pre>` error blob, AND a `.data-table` cell. Only count when paired with `.message`, never standalone.
- **error-STATE screens** → these belong to **`mj-empty-state` (error)**, NOT `mj-alert`: `error-container`, `error-content`, `error-icon`, `retry-button` (application-management, entity-permissions, role-management, settings, user-management, EntityAdmin, agent-editor).
- **"alert" in name but NOT an alert**: `alert-header`, `clear-header` (panel-header chrome that recolors), `health-banner` / `health-warning` / `health-critical` / `health-alert` / `health-*-text` (hero score banners).
- **transient/loading**: `saving-overlay`, `sync-progress-banner` (belong to a loading primitive).
- **field validation / hints / previews**: `field-error`, `error-text`, `field-hint`, `help-text`, `hint`, `section-hint`, `*-hint`, `expiration-preview`, `schedule-cron-preview`, `*-subtitle`, `merge-disabled-hint`, `changes-indicator`.
- **empty states**: `no-roles`, `no-permissions`, `no-tools-message`, `no-params`, `empty-row`, `empty-*`, `no-search-results`, etc.
- **badges/pills/chips**: `*-badge`, `*-pill`, `*-chip`, `status-indicator`.
- **content blocks**: bare `.message` (paragraph), `error-info`, `error-analysis`, `insight-card`, `slow-queries-section`, `no-index-warning-dialog` (modal).
- **mockup**: `artifacts/design/query-save-ux-mockup.html` (not a live component).

†**`error-card` collision**: a real state-card in `entity-pipeline-panel` (→ mj-alert) vs. a `<pre>`-wrapping content block in `mcp-log-detail-panel` (keep inline). Disambiguate by sibling (`error-title`/`error-icon` ⇒ alert).

## ⚠️ Markerless inline-style alerts (separate heuristic required)
`mcp-dashboard.html` has genuine error/result banners written as
`style="background: var(--mj-status-error-bg)…"` with **no class**. Class markers
miss these. The script needs a second pass: inline `style=` containing
`--mj-status-(error|success|warning|info)-bg`.

## Scan scope note
SystemDiagnostics alerts live in the **inline template of
`system-diagnostics.component.ts`**, not an `.html` file → the script must scan
`.ts` as well as `.html`.

## Reliable testing (three pillars)
1. **Component DOM tests** — `alert.component.dom.test.ts` (8 tests: variants, ARIA
   role logic + override, icon default/suppress, dismiss emits+hides, projection).
2. **Coverage + regression** — `npm run check:alerts` (`.github/scripts/check-alerts.sh`).
   Reports canonical `<mj-alert>` vs bespoke (verified markers minus the false-positives
   above, plus the inline-style heuristic; scans `.ts`). Baseline at start: **0% — 0 / 72**.
   CI ratchet: `check-alerts.sh --max <N>` fails if bespoke exceeds N; lower N as we migrate.
   `--list` prints every site.

### ⚠️ Marker widening (2026-06-29) — the gate was UNDER-counting
The first marker set keyed on `.alert`/`*-banner` and missed a whole class of genuine
alerts — most visibly the **confirm-delete modal warning boxes** (`<p class="text-warning">`
in role-management + application-management) that used the **primitive** `--mj-color-warning-50`
background → cream-on-dark. A 4-agent warning sweep then surfaced ~14 more genuine alerts the
gate never saw. Markers widened accordingly:
- **classes added**: `validation-banner`, `no-schemas-warning`, `calibration-warning`,
  `ddl-warning`, `auto-map-partial`, `provider-picker-(warning|error)`.
- **inline heuristic** now also matches the hardcoded Bootstrap alert palette
  (`#fff3cd`/`#f8d7da`/`#d4edda`/`#f0fff4`/`#d1ecf1`/`#fff5f5`/`#fef3c7`) AND counts
  per-occurrence (was per-file) — but stays PRECISE: it does NOT match raw
  `background: color-mix(... var(--mj-status-X) ...)` because badges/pills/kpi-icons/legends
  use that too. The few inline alerts written that way (action-form wildcard/approval) are
  tracked here and migrated regardless, just not auto-counted.
- **excluded**: `initial-prototype-now-old/` (dead mockup), `no-index-warning` (greedy — matched
  a modal's 5 child elements; the modal is a borderline review case anyway), the `<pre>` error blob.
- **honest baseline after widening: ~12% — 11 / 88** (was a misleading 0/72; +14 alerts were invisible).
- **Lesson (again):** narrow class markers under-count; the only reliable catch for the
  `text-warning`-style boxes was browsing a real page in dark mode. Classify broad hits, don't trust the grep.

### Warning-alert migration targets (from the 2026-06-29 sweep)
Goal is STANDARDIZATION (one shared `<mj-alert>`), not just fixing dark-mode breakage —
dark breakage was only the symptom that exposed the gap. Genuine warning alerts to migrate
(2 already done: role-management + application-management confirm boxes):
- **SystemDiagnostics**: `.recommendation-banner`, `.warning-banner` (×2 uses), `.pattern-warning`, `.insight-card.severity-warning`*
- **Integration**: `.validation-banner` (mapping-workspace), `.auto-map-partial` (connections), `.ddl-warning` (connections), `pending-entity-panel`*
- **core-entity-forms**: ai-prompt-form output-example warning (inline `#fff3cd`), action-form wildcard + approval warnings (inline color-mix), query-form `.status-warning-banner`, searchscopeprovider `.provider-picker-warning`/`.provider-picker-error`, query-run-dialog error (inline `#f8d7da`)
- **dashboards (AI/Testing/DBDesigner)**: duplicate-detection `.merge-warning-banner`, testing-review `.calibration-warning`, step-basics `.no-schemas-warning`, vector-management `.no-index-warning-dialog`*
- **explorer-settings**: notification-preferences info-message warning

`*` = flag-for-review (not a clean one-line banner — expandable card list / big centered card / whole modal; needs layout judgment, not a swap).
### 🔴 STANDARD: every visual capture is DUAL-MODE (light + dark)
A migration that looks right in light can still be wrong in dark (and vice-versa) —
so **every** visual check covers **both** themes. No single-mode screenshots.
- **Component baseline** — `scripts/alert-states-gallery.sh` already renders light **and**
  dark side-by-side.
- **Per-site** — `scripts/visual-shot-dual.sh <name> [force-js]` screenshots the current
  live page in light then dark (forces `data-theme="dark"` on `<html>`, reverts after).
  For conditional alerts (error/success that only show on a flag), pass a `force-js`
  snippet using the Angular dev API that RE-APPLIES the state in each theme (toggling
  re-renders and can clear it), e.g.
  `const c=ng.getComponent(document.querySelector('mj-role-dialog')); c.error='…'; ng.applyChanges(c)`.
  Output: `plans/alert-screenshots/migrated/<name>-light.png` + `-dark.png`.
- Prereq: dev server up + browser navigated to the dialog/state first.

3. **Force-state visual harness** — `scripts/alert-states-gallery.sh` renders `<mj-alert>`
   in every real-world shape (variant × message/title/dismiss/actions/sm), light+dark, using
   the component's styles **extracted live from source** (no drift) → `plans/alert-screenshots/
   alert-states.html` + `alert-states-baseline.png`. Server-independent; regenerate after any
   mj-alert change and diff the screenshot. This solves "conditional UI is invisible" for the
   component's appearance.
   - **Per-site context check (manual, needs dev server):** to verify a migrated alert in its
     real surroundings, temporarily force its `@if` gate true (or set the flag via the dev-mode
     `ng` debug API), screenshot, revert — the established force-state technique. Used during
     migration for layout/context spot-checks the static harness can't cover.

## Migration conventions (decided)
- **Icons: standardize to the variant default** — do NOT preserve per-instance semantic
  icons (e.g. role-dialog's `fa-user-tag`/`fa-shield-halved` were dropped for the standard
  info/warning icons). Maximum consistency; `Icon=` override reserved for genuinely special cases.
- **Bare boolean attrs**: `<mj-alert Dismissible>` works (the input uses `booleanAttribute`).
- **Drop** the bespoke icon, `role` attribute, and close button on migration — the component
  renders its own.

## Migration notes
- **+actions** (need the `[actions]` slot): `entity-pipeline-panel` error-card (Retry), `scheduling-overview` alert-item (Release), `test-run-form` error-banner (Retry), the two `alert alert-danger` matrices (Retry). ~5.
- **Dismissible** (need `Dismissible`): `conversation-feedback`, `user-profile-settings`, `mcp-dashboard`, SystemDiagnostics telemetry banner.
- **Token remap on migrate**: `user-app-config` uses Material `--mat-sys-*` tokens.
- **Visual-review-before-migrate**: `key-warning` (dark key box), `mj-flow-node-warning-banner` (~10px inside a graph node — mj-alert chrome may be too heavy), borderline info/empty hybrids (`no-roles-message`).
- **Boundary**: don't migrate the `error-container` error-STATE screens here — they're the empty-state effort's.
