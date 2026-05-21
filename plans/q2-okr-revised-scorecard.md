# Q2 2026 UI Standardization — Revised Scorecard

> **Drafted 2026-05-21** for supervisor review ahead of the May 22 KR3 deadline. Reflects what shipped *in Q2* — the IA / page-layout consolidation workstream. Earlier infrastructure (Kendo removal, original `ng-ui-components` primitives, the bulk of the design token migration) shipped in Q1 and is intentionally not claimed here.

## TL;DR

- **The Q2 deliverable I own is the IA / page-layout consolidation workstream.** That covers: the April 15 baseline audit, ~10 new chrome components built in `ng-ui-components`, ~65 dashboard migrations onto the shared chrome trio, four Admin-shell interior-chrome migrations (~15 sub-pages), five inline-tab shell migrations, the Testing Explorer hybrid-rail, an 11-section conventions doc, and this week's detail-surfaces convention.
- **KR3 (Standardize page layouts, May 22) is the actual Q2 win.** The chrome migration delivered Templates A and B implicitly — every migrated dashboard now renders the same shape, sidebar shells use `<mj-left-nav>`, the design vocabulary is consistent.
- **KR2 (Reduce duplicate components, May 8) substantially missed.** The April 15 audit named 7 components to build. Two shipped (page-header, filter-panel — both absorbed by the chrome work). Five did not (empty-state, general badge, confirm-dialog, selector-dialog, toast-relocation). Adoption percentages from the April audit have not been re-measured.
- **KR1 (Audit, April 17) ✅ delivered on April 15** — the comprehensive Phase 2.2 baseline doc.
- **KR4 (CLAUDE.md / Skills / CI, June 5) 🟠 partial.** CLAUDE.md page-chrome guidance shipped alongside the chrome migration. No MJ-specific Claude Skill yet. No CI compliance gate yet. 15 days remain.

---

## What shipped *in Q2* (April–May 2026)

Restricted to the IA workstream — explicitly not claiming Q1 infrastructure.

| Deliverable | Date | Evidence |
|---|---|---|
| Phase 2.2 baseline audit | Apr 15 | `plans/phase-2-kendo-removal.md` — 603 lines, 11-row adoption scorecard, 7-category duplication table, layout pattern inventory, 7-component build list with APIs. |
| Chrome components built in `ng-ui-components` | Apr–May | ~10 new components: `page-layout`, `page-header`, `page-body`, `page-header-interior`, `page-body-interior`, `page-search`, `refresh-button`, `filter-popover`, `filter-panel`, `filter-chip`, `filter-field`, `stat-badge`, `view-toggle`, `tab-nav`, `left-nav`, `left-nav-content`. |
| Dashboard migrations | May | ~65 dashboards on `<mj-page-layout>` + `<mj-page-header>` + `<mj-page-body>`. Per-section bespoke CSS deleted. PR #2616. |
| Admin-shell interior chrome (Section 10) | May 19 | `<mj-page-header-interior>` shipped to all 4 Admin shells — Identity & Access, Data & Schema, Monitoring, Dev Tools — ~15 sub-pages. |
| Inline-tab shell migrations | May | AI Analytics, Knowledge Hub Analytics / Config / Tags / Classify all on `<mj-left-nav>` + `<mj-left-nav-content>`. |
| Tree-rail support + Testing Explorer | May 20 | `<mj-left-nav>` gained optional tree support; Testing Explorer is the first hybrid-rail consumer. |
| Chrome conventions doc | Apr–May | `plans/explorer-chrome-conventions.md` — 993 lines, 11 sections, canonical slot rules, filter UI decision tree, exception list. |
| Detail-surfaces UX convention | May 21 | Section 11 of chrome conventions — drawer-vs-modal-vs-tab decision tree + `<mj-detail-drawer>` component contract. |
| CLAUDE.md page-chrome guidance | Apr–May | Added to `packages/Angular/CLAUDE.md` and `packages/Angular/Explorer/dashboards/CLAUDE.md` alongside the chrome migration. |

---

## KR-by-KR honest read

The four KRs as currently written (per `MEMORY.md`):

> **KR1**: Audit and baseline current state — component count, hardcoded color instances, layout patterns — by April 17
> **KR2**: Reduce all duplicate UI component implementations identified in the KR1 audit to a single shared version per component type — by May 8
> **KR3**: Standardize page layouts (headers, sidebars, filter panels, empty states) across all 11 apps to two consistent templates — by May 22
> **KR4**: Ship CLAUDE.md, Claude Skills, and CI/CD compliance checks for dev team — by June 5

### KR1 — Audit + baseline ✅ Done (Apr 15)
Comprehensive baseline doc landed two days early. Includes adoption scorecard, duplication counts, hardcoded-value inventory, layout pattern inventory, scattered-component list, 15-item priority order, and 7-component build list with APIs. This is the single best-completed KR in the objective.

### KR2 — Reduce duplicates 🔴 Substantially missed
The audit named 7 components to build. Status today:

| Planned component | Status | Notes |
|---|---|---|
| `MJPageHeaderComponent` | ✅ Shipped | Built as part of chrome work. Replaced 105 ad-hoc header patterns. |
| `MJFilterPanelComponent` | ✅ Shipped | Built as part of chrome work. Replaced 76 custom filter panels. |
| `MJBadgeComponent` (general) | 🟡 Partial | `stat-badge` shipped for chrome counts/state pills. General-purpose badge replacing `.mj-pill` / `mj-notification-badge` / `.status-badge` did NOT ship. |
| `MJEmptyStateComponent` | ❌ Not built | 102 inline empty-state patterns across 77 files still present (per Apr 15 count). |
| `MJConfirmDialogComponent` | ❌ Not built | 3 bespoke confirm implementations remain. |
| `MJSelectorDialogComponent` | ❌ Not built | 9 bespoke selector dialogs across `core-entity-forms/custom/` and dashboards. |
| `MJToastComponent` (move into `ng-ui-components`) | ❌ Not moved | Still in `conversations` package. |

**Separately identified May 21**: ~12 bespoke right-side detail panels (worst offender: `AI/agents/agent-configuration` with 470+ lines of `.detail-panel-*` CSS). Convention shipped this week (Section 11); component not yet built.

**Adoption percentages from April 15 — un-re-measured:**

| Metric | Apr 15 | Target | Current |
|---|---|---|---|
| Button adoption | 24% | 100% | unknown |
| Switch adoption | 5% | 100% | unknown |
| Loading (`mj-loading` vs `fa-spinner`) | 49% | 100% | unknown |
| `.mj-input` styling | 36% | 100% | unknown |
| `.mj-checkbox` styling | 17% | 100% | unknown |
| Numeric input adoption | 50% | 100% | unknown |
| Datepicker adoption | 58% | 100% | unknown |

Honest scoring: KR2 missed. Two components shipped, both absorbed by the chrome workstream. The shipped pair covered the two highest-instance items in the audit (181 instances combined), so the prioritization made sense — but it does mean five spec'd components and seven adoption metrics did not move.

### KR3 — Standardize page layouts ✅ Done (the actual Q2 win)
The chrome migration **is** the layout standardization. Every migrated dashboard renders header + body in the same shape. Left-nav shells (Admin's 4 + KH Config + KH Analytics + Classify / Tags + AI Analytics) all use `<mj-left-nav>` + `<mj-left-nav-content>`. Templates A (Sidebar+Content) and B (Filter+Content) from the April audit are both delivered.

Caveats:
- "Empty states" was in the KR3 wording and did not ship — same gap as KR2.
- 6 documented page exceptions (Home, Component Studio, Data Explorer, Query Browser, AI Overview, Model Performance) deliberately don't follow the templates. These are intentional and documented in `chrome-conventions.md` Section 9.
- The right-side detail-panel pattern (12 bespoke implementations) is a layout inconsistency surfaced this week and not yet addressed.

### KR4 — CLAUDE.md / Skills / CI compliance 🟠 Partial, on track
- **CLAUDE.md**: ✅ Page-chrome guidance shipped in `packages/Angular/CLAUDE.md` and `packages/Angular/Explorer/dashboards/CLAUDE.md` alongside the migration. Slot rules, exception list, chrome trio template all documented.
- **Claude Skills**: 🟡 None specific to MJ Explorer dashboard scaffolding or token/chrome enforcement.
- **CI/CD compliance checks**: ❌ Not started. No automated gate fails the build on hardcoded hex outside the documented allowlist, missing chrome trio, or bespoke `.mj-btn` overrides. Rules are enforced by review only.

15 days remain (today → June 5). Achievable for one CI gate + one scaffolding skill.

---

## Why this happened

Honest, not defensive:

1. **The April 15 audit was thorough and well-scoped, but its 7-component build list was effectively serialized behind chrome.** Page-header and filter-panel each required redesigning the visual shape of every dashboard — that's not a small refactor, it's a design-and-migrate program that ran most of May. The other 5 components (empty-state, badge, confirm-dialog, selector-dialog, toast-move) didn't have a dedicated workstream.
2. **The adoption-percentage KRs needed a separate re-measurement cadence and didn't get one.** They appear in the April baseline but were never re-run during the quarter, so we don't actually know if button adoption moved off 24%.
3. **The drawer-vs-modal UX inconsistency wasn't on the April audit at all.** Discovered May 21 and spec'd the same day. It's a new line item, not a slipped one — but it's real and it's part of the Q3 picture.

---

## Proposed Q2 close (next 15 days, by June 5)

Specific, sized, deliverable:

1. **Ship `<mj-empty-state>`** + migrate 5–10 of the 102 inline patterns as reference implementations. ~1–2 days. (Highest-instance unbuilt component from the April list.)
2. **Ship `<mj-detail-drawer>`** + migrate 2 reference dashboards (`MCP/mcp-log-detail-panel`, `AI/agents/agent-configuration`). ~2–3 days. (Closes the component gap AND the UX inconsistency, per Section 11 of chrome conventions.)
3. **Re-measure the April 15 adoption percentages.** Button / switch / loading / inputs. ~½ day. Gives KR2 a measurable status instead of "unknown."
4. **Build the first CI compliance check.** Minimum: a workflow that fails the build on hardcoded hex outside the documented allowlist. ~1–2 days. Stretch: also gates `.mj-btn` overrides in component-scoped CSS.
5. **Ship one Claude Skill** for MJ Explorer dashboard scaffolding (chrome trio template, slot conventions, token usage). ~1 day.

End-of-Q2 narrative if these land:

> "I shipped the IA / page-layout consolidation across MJ Explorer — ~65 dashboards onto a shared chrome system with 10 new components, 4 Admin shells with interior chrome, 5 inline-tab shells, the Testing Explorer tree-rail, an 11-section conventions doc, and the drawer-vs-modal UX rule. KR3 fully landed. KR1 landed on April 15. KR2 partially landed — 2 of 7 spec'd components, plus empty-state and detail-drawer added in the close. KR4 partially landed — CLAUDE.md guidance, one CI gate, one scaffolding skill. The remaining 4 components from the April list (general badge, confirm-dialog, selector-dialog, toast-move) and the adoption-percentage targets become Q3 scope."

---

## Proposed Q3 carry-over

What honestly belongs in Q3:

**Q3 Objective: Body-level component consolidation + measurable adoption**

- **KR1**: Ship the remaining 4 components from the April build list — `MJBadgeComponent` (general), `MJConfirmDialogComponent`, `MJSelectorDialogComponent`, and relocate `MJToastComponent` into `ng-ui-components`. By end of July.
- **KR2**: Migrate consumers — 79 status badge instances, 8 confirm dialogs, 9 selector dialogs, and any empty-state instances not absorbed in Q2 close. By end of August.
- **KR3**: Adoption % targets re-measured monthly — button to ≥80%, switch to ≥80%, loading to ≥80%, `.mj-input` to ≥80%. By end of August.
- **KR4**: Complete the 12-panel migration to `<mj-detail-drawer>`. Extend CI compliance gates (chrome trio enforcement, drawer-vs-modal, button overrides). By end of August.
- **KR5**: Begin entity-forms launch-path retrofit — add `mode: 'drawer' | 'modal' | 'tab'` to `MJDialogService.open(...)` so the default for record detail shifts to drawer. By end of September.

---

## What I'm asking for

1. **Alignment on the revised Q2 KR scoring** above — KR1 ✅, KR2 🔴, KR3 ✅, KR4 🟠.
2. **Approval for the 5-item Q2 close list** — empty-state, detail-drawer, re-measurement, CI gate, scaffolding skill.
3. **Discussion on the Q3 objective shape** — whether to make it its own objective or fold it into a broader Q3 platform objective.
4. **A 15-minute check-in around June 1** to look at the re-measured adoption percentages before locking the Q2 narrative.

---

## Appendix: source artifacts

- **Apr 15 baseline audit**: `plans/phase-2-kendo-removal.md` (on branch `component-standardization-buttons`) — 603 lines, the canonical baseline.
- **Chrome consolidation merge**: PR #2616 (May 2026) on `next`.
- **Chrome conventions doc**: `plans/explorer-chrome-conventions.md` — 993 lines + Section 11 detail-surfaces (May 21).
- **IA progress tracker**: `plans/explorer-ia-progress.md` — per-page chrome migration status.
- **Q2 chrome components**: `packages/Angular/Generic/ui-components/src/lib/` — directories for the ~10 components built this quarter (listed above).
- **This-week's wide-net audit findings** (the ~900 instances / 14 categories framing) — captured in conversation, not yet a standalone artifact. Can be promoted to a doc if useful.

---

## What is *not* claimed in this scorecard

Explicitly excluded — these shipped in Q1 or are not my workstream:

- **Kendo Phase 2.1 removal** (339 files / 32 packages). Q1.
- **The original `ng-ui-components` primitives** — button, dialog, dropdown, combobox, switch, numeric-input, datepicker, progress-bar, accordion, window. Built before the Q2 chrome work began; the April 15 audit lists them as "Phase 2.1" output.
- **The design token migration** (1,659 → 115 hex, 93%). Bulk of the migration ran on `design-tokens-phase-1` before Q2; closure work is not part of the IA workstream.
- **`mj-loading`, `mj-tab-strip`, `mj-entity-card`, `mj-pagination`, `mj-record-selector`, etc.** — existing components in separate packages; included in the April audit's "scattered components" list but not yet relocated into `ng-ui-components`.

These would be reasonable wins to mention if asked "what's the broader Q1+Q2 platform story," but they aren't what I'm claiming as my Q2 OKR output.
