# UI Consistency — Objectives & Key Results

> **Owner**: Matt Chriest | **Start**: May 27, 2026 | **Baselines measured**: May 27, 2026 via `scripts/measure-ui-adoption.sh`
>
> Each objective is a single, focused unit of work — completable in 1–3 days with Claude Code. Pick one up, finish it end-to-end, move to the next. Sequencing and dependencies noted where they matter.
>
> Each KR is Align-ready: Start = 0, Target = positive number.
>
> **Backlog**: The [program catalog](ui-consistency-program.md) has the full inventory of future scope beyond these 18 objectives.

---

## Standard workflows

These apply to every component objective (4–13). Don't re-read per objective — internalize once.

### Build workflow
1. **Survey**: Grep for all instances of the bespoke pattern. Categorize variants.
2. **Design**: Lock inputs/outputs/slots. Paper-prototype against the 2–3 hardest consumers.
3. **Build**: Component + unit tests in `@memberjunction/ng-ui-components`. Light/dark validated.
4. **Migrate**: All consumers. Delete displaced markup/CSS in each file.
5. **Verify**: Run `scripts/measure-ui-adoption.sh` — confirm bespoke count is 0.

### Migration workflow (for adoption objectives 14–15)
1. Run measurement script to get current count
2. Grep all instances — build a file list
3. Migrate mechanically (add directive/class, remove bespoke)
4. Build affected packages to verify compilation
5. Run measurement script again to confirm 100%
6. Commit exception list if any (small, justified)

---

## 1. Establish measurement | ~2 hours

*Prerequisite for everything — you need verified numbers before you can claim progress.*

| KR | Start | Target |
|----|-------|--------|
| Measurement script committed and producing baselines | 0 | 1 |
| Monthly cadence established | 0 | 1 |

**Scope**: Build `scripts/measure-ui-adoption.sh`. Run it. Commit output to `plans/adoption-metrics.md`. Document methodology (denominators, exclusions).

**Done when**: Script runs in <30s, initial baselines committed, monthly process documented.

---

## 2. Ship CI gates | ~1–2 hours

*Depends on: nothing. Lock the door before you clean the house.*

| KR | Start | Target |
|----|-------|--------|
| CI gates deployed on every PR | 0 | 4 |

**Scope**: 4 GitHub Actions workflows, each with allowlist/exception list and actionable error messages.

| Gate | File | What it does |
|------|------|-------------|
| Hex-color | `.github/workflows/ci-ui-tokens.yml` | Fails PRs with hardcoded hex in `.css`/`.scss` outside allowlist (`scripts/ci/hex-allowlist.txt`) |
| Chrome-trio | `.github/workflows/ci-ui-chrome.yml` | Warns on new `BaseResourceComponent` without `<mj-page-layout>` + `<mj-page-header>` + `<mj-page-body>` |
| Button override | (same workflow or standalone) | Fails PRs with `.mj-btn{}` rules in component CSS outside `ng-ui-components/button.scss` |
| Bespoke pattern | (same workflow or standalone) | Warns on new `.detail-panel-*`, `.section-header`, `.empty-state`, `.card-grid` CSS |

**Done when**: All 4 workflows committed, tested on passing + failing PRs.

---

## 3. Ship Claude Skills | ~1 hour

*Depends on: nothing.*

| KR | Start | Target |
|----|-------|--------|
| Claude Skills for MJ scaffolding shipped | 0 | 2 |

**Scope**:

| Skill | File | What it generates |
|-------|------|-------------------|
| Dashboard | `.claude/skills/scaffold-mj-dashboard.md` | Chrome trio, slots, design tokens, `BaseResourceComponent`, `@RegisterClass`, feature module |
| Entity form | `.claude/skills/scaffold-mj-entity-form.md` | `<mj-record-form-container>`, tab structure, extends generated form, `@RegisterClass` |

**Done when**: Both skills committed, tested by generating one dashboard and one form. Generated code passes CI gates.

---

## 4. Empty-state: build + migrate all | ~1½–2 days

*Depends on: O1 (measurement), O2 (CI gates).*

| KR | Start | Target |
|----|-------|--------|
| `<mj-empty-state>` component shipped | 0 | 1 |
| Inline empty-state patterns migrated | 0 | 213 |
| Displaced bespoke markup deleted | 0 | 1 |

**API (proposed)**: Inputs: `Icon`, `Title`, `Message`, `ActionText`, `Variant` (`'empty' | 'no-results' | 'error'`). Output: `Action`. Slot: `[actions]` for multi-CTA.

**Deep-dive findings** (May 27):
- 4 visual patterns: text-only (rare), icon+title+message (70%), icon+title+message+CTA (25%), complex multi-action (5%)
- 95%+ of markup is near-identical — purely presentational, highly repetitive
- ~101 files to touch (some have 2-3 empty-states), ~45 need CTA button slots
- 10-45 lines CSS per implementation, all using design tokens already — no hardcoded colors
- Zero shared base today — every empty-state is inline `<div>` in parent templates
- **Risk**: Icon class inconsistency (~15-20% use non-standard FA patterns). Budget 30 min for normalization.

**Done when**: Measurement script confirms 0 inline empty-state patterns. Component has unit tests. Light/dark validated.

---

## 5. Detail-drawer: build + migrate all | ~5 days

*Depends on: O2 (CI gates). Heaviest single migration.*

| KR | Start | Target |
|----|-------|--------|
| `<mj-detail-drawer>` component shipped | 0 | 1 |
| Bespoke detail panels migrated | 0 | 12 |

**API**: Per `explorer-chrome-conventions.md` Section 11. Built on CDK Overlay with focus-trap, scroll-lock, `aria-modal`. ESC + backdrop dismiss. Slots: header, content, footer.

**Deep-dive findings** (May 27):
- 12 actual panel implementations (not 17 — script counted shared patterns/dist files)
- **Zero** use CDK Overlay — all are pure CSS `position: fixed` with class toggle
- All share ~80% structure (header + scrollable content + sticky footer) but no shared code
- Two layout types: overlay panels (10, right-slide with backdrop) and inline flex panels (2, Data Explorer)
- Entity Form is the heaviest at 2,651 lines; Agent Configuration is 1,004 lines
- Content is mostly read-only detail grids + badges + action buttons — no edit forms inside panels

**Effort breakdown**: ~2 days build (CDK Overlay component + shared section templates) + ~2 days migrate 12 panels + ~1 day integration testing/animation polish.

**Migration order**: Start with Data Explorer (simplest, inline flex) → Agent Configuration (mid-complexity, validates nested hover states) → Entity Form last (most complex).

**Done when**: 0 bespoke `.detail-panel-*` implementations. ESC/backdrop/focus tested. Light/dark validated.

---

## 6. Confirm-dialog: build + migrate all | ~1–1½ days

*Depends on: O2.*

| KR | Start | Target |
|----|-------|--------|
| `<mj-confirm-dialog>` component shipped | 0 | 1 |
| Confirm patterns migrated | 0 | 29 |

**API (proposed)**: Inputs: `Visible` (two-way), `Title`, `Message`, `Type` (`'default' | 'danger'`), `ConfirmText`, `CancelText`. Outputs: `Confirmed`, `Cancelled`. Built on `<mj-dialog>`. Primary button LEFT per MJ convention.

**Deep-dive findings** (May 27):
- 3 bespoke components: `mj-confirm-dialog` (dashboard-viewer, 67 lines), `mj-ev-confirm-dialog` (entity-viewer, 103 lines), `mj-list-delta-confirm` (list-management, 118 lines — domain-specific, won't consolidate)
- 5 `window.confirm()` calls: 2 are in **synchronous CanClose guards** (DatabaseDesigner) — **cannot migrate** without rearchitecting guards. 3 others can migrate.
- 10 inline confirm modal patterns: 9 are simple single-target deletions, 1 has bulk-action complexity (user-management)
- All inline patterns share same structure: `@if (showDeleteConfirm)` → backdrop + centered dialog

**Scope**: Migrate 29 of 31 patterns (2 CanClose guards stay as `window.confirm()` — documented exception).

**Done when**: 0 bespoke inline confirm patterns. 2 documented CanClose exceptions.

---

## 7. Status-indicator: build + migrate all | ~3–4 days

*Depends on: O2.*

| KR | Start | Target |
|----|-------|--------|
| `<mj-status-indicator>` component shipped | 0 | 1 |
| Normalized status vocabulary documented | 0 | 1 |
| Bespoke status implementations migrated | 0 | 55 |
| Dedicated status components retired | 0 | 3 |

**API (proposed)**: Inputs: `Status` (normalized vocabulary), `Label`, `Variant` (`'badge' | 'dot' | 'pill'`), `Icon`, `Animated`. Tokens drive color mapping.

**Deep-dive findings** (May 27):
- 151 CSS class definitions across 55 components (not 68 files — script double-counted)
- **8 visual pattern types**: pill badges, dots, inline text, domain-specific (autotagging, GraphQL, scheduling), agent-specific, config-specific, animated dots, one-offs
- **14 distinct status vocabularies** — no two domains use exactly the same set. Key ones: active/inactive (15 files), running/success/error/warning (12), pending/complete/processing/failed (8), approved/pending (5)
- 3 shared stylesheets exist (`_admin-patterns.css`, `_md3-shared.css`, `shared-settings.css`) but they **conflict** with each other
- 3 dedicated TS components to retire: `ArchiveStatusBadgeComponent`, `TestStatusBadgeComponent`, `ReviewStatusIndicatorComponent`
- ~15 "status" classes are just text-color modifiers — a directive may be better than a component for those

**Vocabulary mapping** (proposed canonical set): `active`, `inactive`, `success`, `error`, `warning`, `pending`, `running` — each domain maps its terms to these 7 states.

**Effort breakdown**: ~½ day vocabulary design + ~½ day build component + ~2 days migrate 55 components (~12 min avg each) + ~½ day testing/regression.

**Done when**: 0 bespoke status patterns. Vocabulary mapping doc committed. 3 dedicated components retired. Light/dark validated.

---

## 8. Collapsible-section: build + migrate all | ~1–1½ days

*Depends on: O2.*

| KR | Start | Target |
|----|-------|--------|
| `<mj-collapsible-section>` component shipped | 0 | 1 |
| Bespoke collapsible patterns migrated | 0 | 11 |

**API (proposed)**: Inputs: `Title`, `Subtitle`, `Icon`, `Expanded` (two-way), `Disabled`. Slots: `[meta]` (right side of header), default (content). `aria-expanded` + keyboard toggle.

**Deep-dive findings** (May 27):
- Of 51 files with `.section-header` CSS, only **11 are actually collapsible** (click-to-expand). The other **40 are static styled headers** — no migration needed.
- **12 files already use `<mj-accordion-panel>`** — existing component works well, no action needed
- Toggle patterns are simple: boolean map + `@if` block + chevron icon class swap
- No nested collapsible patterns found — all are sibling-level, independent sections
- ~30-40 lines CSS per collapsible implementation

**Scope**: Build component. Migrate 11 actual collapsible files. 40 static headers stay as-is.

**Done when**: 0 bespoke collapsible patterns. 40 static headers documented as non-scope. Accessibility verified. Light/dark validated.

---

## 9. Badge: build + migrate all | ~2½–3 days

*Depends on: O2.*

| KR | Start | Target |
|----|-------|--------|
| `<mj-badge>` component shipped | 0 | 1 |
| Badge/pill CSS references migrated | 0 | 177 |
| Existing badge components retired | 0 | 7 |

**API (proposed)**: Inputs: `Text`, `Type` (`'default' | 'success' | 'warning' | 'danger' | 'info'`), `Size` (`'sm' | 'md'`), `Variant` (`'solid' | 'subtle'`).

**Deep-dive findings** (May 27):
- 5 distinct visual patterns: solid background, outline, pill, notification/counter, indicator dot
- **7 component families to retire**: `mj-stat-badge` (65 refs), `mj-pill` (15-20), `mj-notification-badge` (10, complex — 4 display modes + animations), `archive-status-badge` (5), `test-status-badge` (8), `evaluation-badge` (8), `entity-link-pill` (3)
- 177 references split ~60% CSS styling / ~40% HTML template usage
- `mj-notification-badge` is surprisingly complex (count/dot/pulse/new modes with priority levels)
- Overlap with O7 (status-indicator): shared color tokens but different purpose (labeling vs state). Keep separate.
- Global `_badges.scss` (366 lines) in Explorer defines the base badge class system

**Scope**: Survey all 177 references. Build component. Migrate all. Retire 7 existing component families.

**Done when**: All 7 badge components deprecated/deleted. Measurement script confirms 0 bespoke badge/pill references.

---

## 10. Alert + toast: build + migrate + relocate | ~1 day

*Depends on: O2.*

| KR | Start | Target |
|----|-------|--------|
| `<mj-alert>` component shipped | 0 | 1 |
| `<mj-toast>` relocated to ng-ui-components | 0 | 1 |
| Bespoke alert patterns migrated | 0 | 5 |

**API (proposed)**: `<mj-alert>`: Inputs: `Type` (`'info' | 'success' | 'warning' | 'error'`), `Title`, `Message`, `Dismissable`. Output: `Dismissed`.

**Deep-dive findings** (May 27):
- 5 patterns confirmed: edit-mode-banner (20 lines CSS), health-banner (60 lines CSS, complex SVG progress ring — 3 files), validation-banner (10 lines), system-validation-banner (130 lines, standalone component), generic alerts (5-20 lines)
- `health-banner` is the most complex (SVG progress rings, color-coded circles, severity variants)
- Toast currently in `ng-conversations`, 13 files import it — most are within the same package
- Toast relocation is straightforward: self-contained component + RxJS service, ~2-3 hours including re-export deprecation

**Scope**: Build `<mj-alert>` for persistent inline banners. Relocate `<mj-toast>` from `ng-conversations` to `ng-ui-components`. Migrate 5 bespoke alert patterns.

**Done when**: 0 bespoke alert patterns. Toast lives in ng-ui-components. Both packages build clean.

---

## 11. Stat-tile: build + migrate all | ~3–4 days

*Depends on: O2.*

| KR | Start | Target |
|----|-------|--------|
| `<mj-stat-tile>` component shipped | 0 | 1 |
| Bespoke stat/KPI/metric patterns migrated | 0 | 243 |

**API (proposed)**: Inputs: `Label`, `Value`, `Unit`, `Icon`, `Trend` (`'up' | 'down' | 'flat'`), `TrendValue`, `ColorVariant`, `Layout` (`'inline' | 'card' | 'kpi'`). Slot: `[content]` for non-standard tiles.

**Deep-dive findings** (May 27):
- 243 grep matches map to **5 distinct layout patterns**, not one:
  - `stat-item` (111 refs): horizontal inline — icon + label + value, ~10 lines CSS each, no padding/border
  - `metric-card` (56 refs): horizontal flex card — icon-left + value-right, 6-10 color variants copy-pasted per file (~50-80 lines CSS each)
  - `stat-card` (41 refs): medium vertical card — icon wrapper + content, ~30-40 lines CSS each
  - `kpi-card` (30 refs): **already componentized** as `app-kpi-card` — vertical flex, 70+ lines CSS
  - `list-stats` (15 refs): compound widgets — stats grid + activity feed, ~100 lines CSS each
- **Massive color variant duplication**: same `.metric-card.total/.success/.error` rules appear in 6+ files independently
- No shared SCSS mixins anywhere — every component inlines its own rules
- One component won't fit all — `stat-item` (inline, no border) is fundamentally different from `metric-card` (card with icon square)

**Effort breakdown**: ~½ day design (lock 2-3 layout modes) + ~½ day build component + ~2 days migrate 50+ files (~10-15 min each) + ~½ day testing.

**Phased approach**: Start with `metric-card` (highest duplication ROI, 56 refs across 6+ files), then `stat-card`, then assess whether `stat-item` inlines are worth migrating or better left as a CSS utility class.

**Done when**: Measurement script confirms 0 bespoke stat-tile references.

---

## 12. Form-section: build + migrate all | ~1–1½ days

*Depends on: O2.*

| KR | Start | Target |
|----|-------|--------|
| `<mj-form-section>` component shipped | 0 | 1 |
| Bespoke form-section patterns migrated | 0 | 22 |

**API (proposed)**: Inputs: `Title`, `Description`, `Layout` (`'single' | 'two-column'`). Slot: default (form fields).

**Deep-dive findings** (May 27):
- 22 files confirmed across AIAgent dialogs (5), admin settings dialogs (5), dashboard dialogs (4), generic packages (8)
- DOM structure is 85% consistent: `.form-section > .section-header > h3 + description` then `.form-grid` or `.form-group`
- Two section header variants: Type A with wrapper div (permission/role), Type B direct h3 (AIAgent/credentials)
- Two field layouts: `.form-grid` 2-column responsive (AIAgent), `.form-group` single-column rows (permissions)
- CSS ranges from 30-60 lines (most files) to 200 lines (credential-edit-panel — densest)
- No nested or conditional form-sections — all sibling-level within dialogs
- Content inside sections is dynamic (`@for` loops for schema fields) but the section wrapper itself is static

**Scope**: Survey all 22 files. Build component. Migrate all.

**Done when**: Measurement script confirms 0 bespoke `.form-section` patterns.

---

## 13. Selector-dialog: build + migrate Tier 1 | ~3–4 days

*Depends on: O2. Heaviest design surface — survey before building.*

| KR | Start | Target |
|----|-------|--------|
| `<mj-entity-selector>` component shipped | 0 | 1 |
| Tier 1 pickers migrated (prompt, template, entity) | 0 | 3 |

**Deep-dive findings** (May 27):
- 9 pickers are **fundamentally different** — one component cannot replace all without becoming 5,000+ lines of conditional logic:
  - **Tier 1 (unifiable, 3-4 days)**: prompt-selector, template-selector, entity-selector — flat list, search, status badges, multi-select toggle. ~400-470 lines each.
  - **Tier 2 (domain-specific, keep separate)**: sub-agent-selector (faceted filtering), artifact-collection-picker (tree view, 1,179 lines, inline save flow with per-item retry), view-selector (metadata parsing, caching engine)
  - **Tier 3 (lightweight, keep as-is)**: project-selector (decorated dropdown), user-picker (async search), entity-selector-with-grid (scaffolding)
- `record-selector` is under-adopted because: no search, no pre-filtering, dual-listbox UX is outdated, not dialog-based
- Full "unify all 9" = 12-15 days. Not worth it — Tier 2/3 pickers are appropriately specialized.

**Scope**: Build `<mj-entity-selector>` for Tier 1 (flat list + search + status + multi-select + pre-filter + optional create). Migrate prompt, template, entity selectors. Deprecate `record-selector`. Tier 2/3 stay as-is.

**Done when**: 3 Tier 1 pickers migrated. Component documented. `record-selector` deprecated.

---

## 14. Buttons to 100% | ~2–2½ days

*Depends on: O1 (measurement), O2 (CI gates hold the line).*

| KR | Start | Target |
|----|-------|--------|
| Buttons migrated to `mjButton` | 0 | 2362 |

**Deep-dive findings** (May 27):
- 249 files contain `<button>` without `mjButton` (~2,362 instances)
- Most are straightforward: add directive + set `[variant]` and `[size]`
- **Exceptions that can't use mjButton**: ~17 AG Grid cell renderer buttons (require custom cell templates), ~50-100 table-embedded button instances
- 200+ instances in `.ts` inline templates (slower to migrate than .html)
- Legacy `.btn .btn-primary .btn-sm` classes (318 instances) need stripping

**Scope**: Migrate ~2,362 remaining buttons. Strip legacy `.btn-*` classes. Document AG Grid exception list.

**Done when**: Measurement script confirms 100% of in-scope buttons. Exception list committed (AG Grid cells, table-embedded buttons).

---

## 15. Switches + loading + inputs to 100% | ~2½–3 days

*Depends on: O1, O2.*

| KR | Start | Target |
|----|-------|--------|
| Switches migrated to `<mj-switch>` | 0 | 190 |
| Loading indicators migrated to `<mj-loading>` | 0 | 328 |
| Text inputs migrated to `.mj-input` | 0 | 486 |
| Checkboxes migrated to `.mj-checkbox` | 0 | 204 |

**Deep-dive findings** (May 27):
- **Switches**: 190 actual checkboxes (not 234 — script overcounted). All are effectively toggles (none are multi-select form checkboxes). ~60-80 live in table/grid cells where switch width may cause layout shifts.
- **Loading**: 329 instances confirmed. 78% in `.html` (fast bulk replace), 22% in `.ts` inline templates (slower, per-file edits).
- **Inputs**: **486 actual** (not 315 — 55% higher than estimated). ~90% just need `class="mj-input"` added. ~10% have wrappers or inline styles that need attention.
- **Checkboxes**: Included in switches analysis above.

**Scope**: Migrate all remaining existing primitives to their canonical implementations. Includes numeric input and datepicker stragglers.

**Done when**: Measurement script confirms 100% for all 6 primitives (switch, loading, input, checkbox, numeric, datepicker).

---

## 16. Brand color + icon vocabulary | ~1 day

*Depends on: O4–O13 substantially complete (don't polish what's about to be replaced).*

| KR | Start | Target |
|----|-------|--------|
| Unified brand color verified across all apps | 0 | 1 |
| Icon vocabulary audit complete | 0 | 1 |

**Scope**: Verify all apps use `--mj-brand-primary`. Remove unauthorized per-app accents. Audit icon inconsistencies (same concept = same icon). Commit canonical icon vocabulary table.

**Stakeholder risk**: Brand color unification needs buy-in. Have the conversation before flipping.

**Done when**: No per-app rainbow. Icon vocabulary table committed. All deviations fixed.

---

## 17. Typography + spacing tokens | ~1½ days

*Depends on: O4–O13 substantially complete.*

| KR | Start | Target |
|----|-------|--------|
| ui-components using typography tokens (no hardcoded px) | 0 | 1 |
| SCSS files with hardcoded spacing px | 71% | 0% |

**Scope**: Audit `ui-components` for hardcoded `font-size`/`font-weight`. Replace with `--mj-text-*` / `--mj-font-*` tokens. Replace hardcoded `margin`/`padding`/`gap` px with `--mj-space-*` tokens across all SCSS files.

**Done when**: 0 hardcoded typography in ui-components. 0% hardcoded spacing across SCSS files.

---

## 18. Dark-mode parity audit | ~1 day

*Depends on: O16–O17 complete (this validates everything).*

| KR | Start | Target |
|----|-------|--------|
| Dark-mode parity audit complete | 0 | 1 |

**Scope**: Systematic screenshot-based audit of every app in dark mode. Fix hardcoded colors missed by token migration. Fix contrast issues. Flag theme-unaware third-party components.

**Done when**: Every app verified in dark mode. Issues fixed or tracked.

---

## Effort summary

| # | Objective | Effort | Depends on | Validated |
|---|-----------|--------|------------|-----------|
| 1 | Measurement | 2 hours | — | ✅ Done |
| 2 | CI gates | 1–2 hours | — | ✅ Patterns exist to clone |
| 3 | Claude Skills | 1 hour | — | ✅ Just markdown docs |
| 4 | Empty-state | 1½–2 days | 1, 2 | ✅ 95% identical markup |
| 5 | Detail-drawer | 5 days | 2 | ✅ 12 panels, no CDK Overlay |
| 6 | Confirm-dialog | 1–1½ days | 2 | ✅ 29 of 31 migratable |
| 7 | Status-indicator | 3–4 days | 2 | ✅ 151 CSS classes, 14 vocabularies |
| 8 | Collapsible-section | 1–1½ days | 2 | ✅ Only 11 of 51 actually collapsible |
| 9 | Badge | 2½–3 days | 2 | ✅ 7 component families |
| 10 | Alert + toast | 1 day | 2 | ✅ 5 patterns + toast relocation |
| 11 | Stat-tile | 3–4 days | 2 | ✅ 5 layout patterns, needs 2-3 modes |
| 12 | Form-section | 1–1½ days | 2 | ✅ 22 files, 85% consistent |
| 13 | Selector-dialog (Tier 1) | 3–4 days | 2 | ✅ Scoped to 3 of 9 pickers |
| 14 | Buttons to 100% | 2–2½ days | 1, 2 | ✅ 249 files, AG Grid exceptions |
| 15 | Switches + loading + inputs | 2½–3 days | 1, 2 | ✅ Input count 55% higher |
| 16 | Brand + icons | 1 day | 4–13 | — |
| 17 | Typography + spacing tokens | 1½ days | 4–13 | — |
| 18 | Dark-mode audit | 1 day | 16, 17 | — |
| | **Total** | **~35–40 days** | | |

---

## Sequencing

```
Week 1 (May 27):  1 → 2 → 3 (foundation — all done in 1 day)
                       ↓
June:             4, 5, 6, 7, 8, 9, 10, 11, 12, 13 (components — largely parallel)
                  14, 15 (adoption push — can run alongside component work)
                       ↓
July–August:      16 → 17 → 18 (polish — sequential, each validates the prior)
```

Objectives 4–15 are independent of each other (they all just depend on 1+2). Pick them in any order based on what feels highest leverage that day.
