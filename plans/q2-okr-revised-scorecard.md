# Q2 2026 UI Standardization — Revised Scorecard

> **Drafted 2026-05-21** for supervisor review ahead of the May 22 KR3 deadline. Reflects current state of the codebase plus this week's audit, which surfaced gaps not visible from headline KR status.

## TL;DR

- **Substantial work shipped**, much of it under-reported: shared chrome on ~65 dashboards, full Kendo removal (339 files / 32 packages), design token migration (1,659 → 115 hex, 93%), and 12 canonical chrome components.
- **KR2 is partially complete**, not green. Of 7 components named in the April 15 audit, **2 shipped** (page-header, filter-panel — absorbed by chrome work, also the two highest-instance items). **4 did not ship** (empty-state, confirm-dialog, selector-dialog, toast-relocation). 1 partial (stat-badge shipped for chrome use; general badge replacing pills/notification-badge did not).
- **Adoption percentages from April 15 have not been re-measured.** Button at 24%, switch at 5%, loading at 49%, etc. — those KRs are blind right now.
- **The detail-panel-vs-modal UX inconsistency** (12 bespoke right-side panels coexisting with the modal-only entity-forms default) was identified this week and a canonical convention shipped (Section 11 of `plans/explorer-chrome-conventions.md`, May 21).
- **Proposed move**: refine KR2 / KR3 to reflect what actually shipped, keep KR4 on track, and absorb the unbuilt body-level components into a Q3 objective.

---

## What shipped (Q2 to date)

| Workstream | Status | Evidence |
|---|---|---|
| **Page chrome consolidation** | ✅ Shipped | ~65 dashboards on `<mj-page-layout>` + `<mj-page-header>` + `<mj-page-body>`. PR #2616, May 2026. Per-section bespoke CSS deleted. |
| **Chrome primitives** | ✅ 12 components | `stat-badge`, `page-search`, `filter-popover/panel/chip/field`, `tab-nav`, `view-toggle`, `refresh-button`, `left-nav`, `left-nav-content`, `page-header-interior` |
| **Kendo Phase 2.1** | ✅ Code complete | 339 files / 32 packages. Zero `@progress/*` references remain. 16 MJ UI replacement components built. |
| **Design token migration** | ✅ 93% complete | 1,659 → 115 hex values. Remaining 115 are intentional (CSS-var fallbacks, dark-only themes, SVG paint). |
| **Phase 2.2 baseline audit** | ✅ Apr 15 | `plans/phase-2-kendo-removal.md`. 11-row adoption scorecard, 7-category duplication table, layout pattern inventory, 7-component build list with APIs, Phase 2.3 layout templates. |
| **Interior chrome (Section 10)** | ✅ May 19 | `<mj-page-header-interior>` for sub-pages dynamically loaded into left-nav shells (Admin's 4 shells, ~15 sub-pages). |
| **Tree-rail support** | ✅ May 20 | `<mj-left-nav>` gained optional tree support; Testing Explorer is the first hybrid-rail consumer. |
| **Detail-surface UX convention** | ✅ May 21 | Section 11 of chrome conventions: drawer-vs-modal-vs-tab decision tree + `<mj-detail-drawer>` component contract. |
| **CLAUDE.md guidance** | ✅ Substantial | Root + `packages/Angular/` + `packages/Angular/Explorer/dashboards/` cover design tokens, chrome trio, slot rules, dialog button placement, custom-form patterns. |

---

## KR-by-KR honest read

The four KRs as currently written (per `MEMORY.md`):

> **KR1**: Audit and baseline current state — component count, hardcoded color instances, layout patterns — by April 17
> **KR2**: Reduce all duplicate UI component implementations identified in the KR1 audit to a single shared version per component type — by May 8
> **KR3**: Standardize page layouts (headers, sidebars, filter panels, empty states) across all 11 apps to two consistent templates — by May 22
> **KR4**: Ship CLAUDE.md, Claude Skills, and CI/CD compliance checks for dev team — by June 5

### KR1 — Audit + baseline ✅ Done
Completed Apr 15, two days early. The audit is comprehensive: adoption scorecard, duplication counts, hardcoded-value inventory, layout pattern inventory, scattered-component list, 15-item priority order, 7-component build list with APIs.

### KR2 — Reduce duplicates 🟡 Partial (~30–40%)
The audit named 7 components to build. Status today:

| Planned component | Status | Notes |
|---|---|---|
| `MJPageHeaderComponent` | ✅ Shipped | Via chrome work. Replaced 105 ad-hoc header patterns. |
| `MJFilterPanelComponent` | ✅ Shipped | Via chrome work. Replaced 76 custom filter panels. |
| `MJBadgeComponent` (general) | 🟡 Partial | `stat-badge` shipped for chrome counts/status. General-purpose badge replacing `.mj-pill` / `mj-notification-badge` / `.status-badge` did NOT ship. |
| `MJEmptyStateComponent` | ❌ Not built | 102 inline empty state patterns across 77 files still present (per Apr 15 count). |
| `MJConfirmDialogComponent` | ❌ Not built | 3 bespoke confirm implementations remain. |
| `MJSelectorDialogComponent` | ❌ Not built | 9 bespoke selector dialogs across `core-entity-forms/custom/` and dashboards. `record-selector` exists in its own package but consumers haven't migrated. |
| `MJToastComponent` (move into `ng-ui-components`) | ❌ Not moved | Still in `conversations` package. |

**Plus a separately-identified gap (May 21):** ~12 bespoke right-side detail panels (worst offender: `AI/agents/agent-configuration` with 470 lines of `.detail-panel-*` CSS) — none using a shared component because no shared component existed. **`<mj-detail-drawer>` was spec'd this week** but not yet built.

**Adoption percentages from April 15 (un-re-measured):**

| Metric | Apr 15 | Target | Current |
|---|---|---|---|
| Button adoption | 24% | 100% | unknown |
| Switch adoption | 5% | 100% | unknown |
| Loading (`mj-loading` vs `fa-spinner`) | 49% | 100% | unknown |
| `.mj-input` styling | 36% | 100% | unknown |
| `.mj-checkbox` styling | 17% | 100% | unknown |
| Numeric input adoption | 50% | 100% | unknown |
| Datepicker adoption | 58% | 100% | unknown |
| Hardcoded colors | 186 | 0 | ~115 (93% reduction) |

**Honest scoring**: KR2 is roughly **30–40% complete** by spec'd-components-built count. The two that shipped were the highest-instance items (page header + filter panel together cover 181 instances). The shipped chrome work absorbed engineering effort the body-level components needed. That's a defensible prioritization but it does mean the KR as written did not land.

### KR3 — Standardize page layouts ✅ Mostly done (with caveats)
Layout templates A (Sidebar+Content) and B (Filter+Content) were defined in the April audit. The chrome migration **effectively delivered both templates** — every migrated dashboard renders header + body in the same shape, and left-nav shells (Admin's 4 + KH Config + AI Analytics + Knowledge Hub Classify/Analytics/Tags) all use `<mj-left-nav>` + `<mj-left-nav-content>`.

Caveats:
- "Empty states" was in the KR3 line item and **was not delivered** — same gap as KR2.
- 6 documented page exceptions (Home, Component Studio, Data Explorer, Query Browser, AI Overview, Model Performance) deliberately don't follow the templates.
- The right-side detail-panel pattern (12 bespoke implementations) is a layout inconsistency we didn't realize was in scope until this week.

### KR4 — CLAUDE.md / Skills / CI compliance 🟠 Partial, on track
- **CLAUDE.md**: ✅ Strong. Three files (root, `Angular/`, `Angular/Explorer/dashboards/`) cover design tokens, chrome conventions, dialog placement, component patterns.
- **Claude Skills**: 🟡 Lots of skills exist (`commit`, `create-pr`, `pr-ready`, `code-review`, etc.) but **no skill specific to "generate a compliant MJ Explorer dashboard"** or enforcing token/chrome rules. `frontend-design` is generic.
- **CI/CD compliance checks**: ❌ Not started. No automated gate fails the build on hardcoded hex, missing chrome trio, or bespoke `.mj-btn` overrides. Rules are enforced by review, not by the gate.

15 days remain (today → June 5). Achievable.

---

## Why this happened

Honest assessment, not defensive:

1. **The Kendo removal absorbed enormous effort** — 339 files across 32 packages. Phase 2.1 was scoped as a prerequisite to Phase 2.2; in practice it ran long enough to compress 2.2's window.
2. **Chrome consolidation was the right next pick** — the two highest-instance line items (page headers at 105, filter panels at 76) were both on the build list, and consolidating them required redesigning the visual shape of every dashboard. That's not a small refactor; it's a design-and-migrate program.
3. **The remaining 5 body-level components (empty state, badge, confirm-dialog, selector-dialog, toast move) didn't get queued behind chrome** — they were on the list but didn't have a dedicated workstream. They're each small (1–2 days for the component + migration), but they need to be picked up explicitly.
4. **The drawer-vs-modal UX inconsistency wasn't on the April audit at all.** Discovered this week, spec'd this week. It's a new line item, not a slipped one.

---

## Proposed Q2 close (next 15 days, by June 5)

Realistic and concrete:

1. **Ship `<mj-empty-state>`** + migrate 5–10 of the 102 inline patterns as reference implementations. ~1–2 days. (Highest-instance unbuilt component.)
2. **Ship `<mj-detail-drawer>`** + migrate 2 reference dashboards (`MCP/mcp-log-detail-panel` and `AI/agents/agent-configuration`). ~2–3 days. (Closes both the component gap AND the UX inconsistency.)
3. **Re-measure the April 15 adoption percentages.** Button / switch / loading / inputs. ~½ day. Gives KR2 a measurable status instead of "unknown."
4. **Build the first CI compliance check.** Minimum: a workflow that fails the build on hardcoded hex outside the documented allowlist. ~1–2 days. Stretch: also gates `.mj-btn` overrides in component-scoped CSS. (This is the multiplier that protects the work going forward.)
5. **Ship one Claude Skill** specific to MJ Explorer dashboard scaffolding (template, slot conventions, token usage). ~1 day.

End-of-Q2 story if these land: "We shipped chrome consolidation (~65 dashboards), Kendo removal (339 files), design tokens (93%), 4 of 7 planned components, the drawer convention + component (new this quarter), the first CI compliance gate, and a dashboard-scaffolding skill."

---

## Proposed Q3 carry-over (separate OKR objective)

What honestly belongs in Q3:

**Q3 Objective: Body-level component consolidation + measurable adoption**

- **KR1**: Ship the remaining 3 components from the April build list — `MJBadgeComponent` (general), `MJConfirmDialogComponent`, `MJSelectorDialogComponent` — and relocate `MJToastComponent` into `ng-ui-components`. By end of July.
- **KR2**: Migrate consumers to these components — 79 status badge instances, 8 confirm dialog instances, 9 selector dialogs, 102 empty-state instances (any not absorbed in Q2 close). By end of August.
- **KR3**: Adoption % targets: button to ≥80%, switch to ≥80%, loading to ≥80%, `.mj-input` to ≥80%. Re-measured monthly. By end of August.
- **KR4**: Complete the 12-panel migration to `<mj-detail-drawer>` and extend CI compliance gates (chrome trio, drawer-vs-modal, hex colors, button overrides). By end of August.
- **KR5**: Begin entity-forms launch-path retrofit — add `mode: 'drawer' | 'modal' | 'tab'` to `MJDialogService.open(...)` so the default for record detail shifts to drawer. By end of September.

---

## What I'm asking for

1. **Alignment on the revised Q2 KR2 / KR3 scoring** — partial, not green, with the framing above.
2. **Approval for the 5-item Q2 close list** — empty-state, detail-drawer, re-measurement, CI gate, scaffolding skill. These are the things that will land by June 5.
3. **Discussion on the Q3 objective shape** — whether to make it its own objective ("Body-level component consolidation") or fold it into a broader Q3 platform objective.
4. **A 15-minute check-in around June 1** to look at the re-measured adoption %s before locking the Q2 close narrative.

---

## Appendix: source artifacts

- **Apr 15 audit**: `plans/phase-2-kendo-removal.md` (on branch `component-standardization-buttons`) — 603 lines, the canonical baseline. Includes 11-row adoption scorecard, 7-category duplication table, 7-component build list with APIs, Phase 2.3 layout templates.
- **Chrome consolidation merge**: PR #2616 (May 2026) on `next`.
- **Chrome conventions doc**: `plans/explorer-chrome-conventions.md` (993 lines + Section 11 detail-surfaces, May 21).
- **IA progress tracker**: `plans/explorer-ia-progress.md` — per-page chrome migration status.
- **Component inventory** (today): `packages/Angular/Generic/ui-components/src/lib/` — 27 component directories.
- **Design token plan**: `plans/DESIGN_TOKEN_MIGRATION_PLAN.md` — 93% migration log.
- **This-week's wide-net audit findings** (the ~900 instances / 14 categories framing) — captured in conversation, not yet a standalone artifact. Can be promoted to a doc if useful.
