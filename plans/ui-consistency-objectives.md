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

## 2. Ship CI gates | ~½ day

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

## 3. Ship Claude Skills | ~½ day

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

## 4. Empty-state: build + migrate all | ~1½ days

*Depends on: O1 (measurement), O2 (CI gates).*

| KR | Start | Target |
|----|-------|--------|
| `<mj-empty-state>` component shipped | 0 | 1 |
| Inline empty-state patterns migrated | 0 | 213 |
| Displaced bespoke markup deleted | 0 | 1 |

**API (proposed)**: Inputs: `Icon`, `Title`, `Message`, `ActionText`, `Variant` (`'empty' | 'no-results' | 'error'`). Output: `Action`. Slot: `[actions]` for multi-CTA.

**Scope**: Survey all 213 patterns. Build component. Migrate every one. Delete displaced markup.

**Done when**: Measurement script confirms 0 inline empty-state patterns. Component has unit tests. Light/dark validated.

---

## 5. Detail-drawer: build + migrate all | ~3 days

*Depends on: O2 (CI gates). Heaviest single migration — 11,500 lines of CSS to delete.*

| KR | Start | Target |
|----|-------|--------|
| `<mj-detail-drawer>` component shipped | 0 | 1 |
| Bespoke detail-panel files migrated | 0 | 17 |

**API**: Per `explorer-chrome-conventions.md` Section 11. Built on CDK Overlay with focus-trap, scroll-lock, `aria-modal`. ESC + backdrop dismiss.

**Scope**: Survey all 17 files. Build component. Migrate all. Delete all bespoke `.detail-panel-*` CSS.

**Risk**: Agent-configuration panel has tabs + sticky footer + nested scroll — prototype first. Entity-form panel is 2,650 lines — largest single file.

**Done when**: 0 bespoke `.detail-panel-*` implementations remain. ESC/backdrop/focus tested. Light/dark validated.

---

## 6. Confirm-dialog: build + migrate all | ~½ day

*Depends on: O2.*

| KR | Start | Target |
|----|-------|--------|
| `<mj-confirm-dialog>` component shipped | 0 | 1 |
| Confirm patterns migrated | 0 | 31 |

**API (proposed)**: Inputs: `Visible` (two-way), `Title`, `Message`, `Type` (`'default' | 'danger'`), `ConfirmText`, `CancelText`. Outputs: `Confirmed`, `Cancelled`. Built on `<mj-dialog>`. Primary button LEFT per MJ convention.

**Scope**: Migrate all 31 confirm patterns (bespoke components + `window.confirm()` calls + inline modals).

**Done when**: 0 bespoke confirm patterns. 0 `window.confirm()` calls.

---

## 7. Status-indicator: build + migrate all | ~1½ days

*Depends on: O2.*

| KR | Start | Target |
|----|-------|--------|
| `<mj-status-indicator>` component shipped | 0 | 1 |
| Normalized status vocabulary documented | 0 | 1 |
| Bespoke status implementations migrated | 0 | 68 |

**API (proposed)**: Inputs: `Status` (normalized vocabulary), `Label`, `Variant` (`'dot' | 'pill'`). Tokens drive color mapping.

**Scope**: Survey all 68 files. Define normalized vocabulary (mapping "running"/"active"/"live" to canonical statuses). Build component. Migrate all. Retire dedicated status components.

**Bottleneck**: Vocabulary mapping is design judgment, not code.

**Done when**: 0 bespoke status patterns. Vocabulary doc committed. Light/dark validated.

---

## 8. Collapsible-section: build + migrate all | ~1½ days

*Depends on: O2.*

| KR | Start | Target |
|----|-------|--------|
| `<mj-collapsible-section>` component shipped | 0 | 1 |
| Bespoke section-header + chevron patterns migrated | 0 | 51 |

**API (proposed)**: Inputs: `Title`, `Subtitle`, `Icon`, `Expanded` (two-way), `Disabled`. Slots: `[meta]` (right side of header), default (content). `aria-expanded` + keyboard toggle.

**Scope**: Survey all 51 files. Build component. Migrate all. Document exceptions (if any).

**Done when**: 0 bespoke `.section-header` patterns. Accessibility verified. Light/dark validated.

---

## 9. Badge: build + migrate all | ~2 days

*Depends on: O2.*

| KR | Start | Target |
|----|-------|--------|
| `<mj-badge>` component shipped | 0 | 1 |
| Badge/pill CSS references migrated | 0 | 177 |
| `mj-pill` and `mj-notification-badge` retired | 0 | 2 |

**API (proposed)**: Inputs: `Text`, `Type` (`'default' | 'success' | 'warning' | 'danger' | 'info'`), `Size` (`'sm' | 'md'`), `Variant` (`'solid' | 'subtle'`).

**Scope**: Survey all 177 references. Build component. Migrate all. Retire `mj-pill` and `mj-notification-badge`.

**Done when**: Old badge components deprecated/deleted. Measurement script confirms 0 bespoke badge/pill references.

---

## 10. Alert + toast: build + migrate + relocate | ~1 day

*Depends on: O2.*

| KR | Start | Target |
|----|-------|--------|
| `<mj-alert>` component shipped | 0 | 1 |
| `<mj-toast>` relocated to ng-ui-components | 0 | 1 |
| Bespoke alert patterns migrated | 0 | 5 |

**API (proposed)**: `<mj-alert>`: Inputs: `Type` (`'info' | 'success' | 'warning' | 'error'`), `Title`, `Message`, `Dismissable`. Output: `Dismissed`.

**Scope**: Build `<mj-alert>` for persistent inline banners. Relocate `<mj-toast>` from `ng-conversations` to `ng-ui-components` (re-export with deprecation). Migrate 5 bespoke alert patterns (query-error, edit-mode banner, health banner, validation, generic).

**Done when**: 0 bespoke alert patterns. Toast lives in ng-ui-components. Both packages build clean.

---

## 11. Stat-tile: build + migrate all | ~1½ days

*Depends on: O2.*

| KR | Start | Target |
|----|-------|--------|
| `<mj-stat-tile>` component shipped | 0 | 1 |
| Bespoke stat/KPI/metric patterns migrated | 0 | 243 |

**API (proposed)**: Inputs: `Label`, `Value`, `Unit`, `Icon`, `Trend` (`'up' | 'down' | 'flat'`), `TrendValue`, `Variant`. Slot: `[content]` for non-standard tiles.

**Scope**: Survey all 243 references. Build component. Migrate all.

**Done when**: Measurement script confirms 0 bespoke stat-tile references.

---

## 12. Form-section: build + migrate all | ~1 day

*Depends on: O2.*

| KR | Start | Target |
|----|-------|--------|
| `<mj-form-section>` component shipped | 0 | 1 |
| Bespoke form-section patterns migrated | 0 | 22 |

**API (proposed)**: Inputs: `Title`, `Description`, `Layout` (`'single' | 'two-column'`). Slot: default (form fields).

**Scope**: Survey all 22 files. Build component. Migrate all.

**Done when**: Measurement script confirms 0 bespoke `.form-section` patterns.

---

## 13. Selector-dialog: build + migrate all | ~3 days

*Depends on: O2. Heaviest design surface — survey before building.*

| KR | Start | Target |
|----|-------|--------|
| `<mj-selector-dialog>` component(s) shipped | 0 | 1 |
| Bespoke selector/picker implementations migrated | 0 | 9 |

**Scope**: Survey all 9 bespoke pickers. Categorize by need (tree view, filters, multi-select, pre-filtering). May need 2 components, not 1. Build. Migrate all 9. Retire under-adopted `record-selector`.

**Risk**: HIGH — pickers have very different needs. 30% buffer in estimate.

**Done when**: 0 bespoke selector implementations. Design documented.

---

## 14. Buttons to 100% | ~2 days

*Depends on: O1 (measurement), O2 (CI gates hold the line).*

| KR | Start | Target |
|----|-------|--------|
| Buttons migrated to `mjButton` | 0 | 2362 |

**Scope**: Migrate ~2,362 remaining buttons across .html templates AND .ts inline templates. Add `mjButton` directive, set `[variant]` and `[size]`, remove bespoke CSS classes.

**Done when**: Measurement script confirms 100% of in-scope buttons. Exception list committed.

---

## 15. Switches + loading + inputs to 100% | ~2 days

*Depends on: O1, O2.*

| KR | Start | Target |
|----|-------|--------|
| Switches migrated to `<mj-switch>` | 0 | 234 |
| Loading indicators migrated to `<mj-loading>` | 0 | 328 |
| Text inputs migrated to `.mj-input` | 0 | 315 |
| Checkboxes migrated to `.mj-checkbox` | 0 | 204 |

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

| # | Objective | Effort | Depends on |
|---|-----------|--------|------------|
| 1 | Measurement | 2 hours | — |
| 2 | CI gates | ½ day | — |
| 3 | Claude Skills | ½ day | — |
| 4 | Empty-state | 1½ days | 1, 2 |
| 5 | Detail-drawer | 3 days | 2 |
| 6 | Confirm-dialog | ½ day | 2 |
| 7 | Status-indicator | 1½ days | 2 |
| 8 | Collapsible-section | 1½ days | 2 |
| 9 | Badge | 2 days | 2 |
| 10 | Alert + toast | 1 day | 2 |
| 11 | Stat-tile | 1½ days | 2 |
| 12 | Form-section | 1 day | 2 |
| 13 | Selector-dialog | 3 days | 2 |
| 14 | Buttons to 100% | 2 days | 1, 2 |
| 15 | Switches + loading + inputs | 2 days | 1, 2 |
| 16 | Brand + icons | 1 day | 4–13 |
| 17 | Typography + spacing tokens | 1½ days | 4–13 |
| 18 | Dark-mode audit | 1 day | 16, 17 |
| | **Total** | **~25 days** | |

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
