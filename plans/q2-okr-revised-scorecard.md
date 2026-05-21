# Q2 2026 UI Standardization — Revised Scorecard + Lessons Learned

> **Drafted 2026-05-21** for supervisor review ahead of the May 22 KR3 deadline. Two parts: (1) honest accounting of what shipped in Q2; (2) a learning artifact — root-cause diagnosis of the scoping miss + a proposed OKR format change for Q3 onward.

---

## Part 1 — The Q2 scorecard

### TL;DR

- **The Q2 deliverable I own is one workstream**: the IA / page-layout consolidation across MJ Explorer. April 15 audit → ~10 chrome components built → ~65 dashboard migrations → 4 Admin-shell interior-chrome migrations → 5 inline-tab shell migrations → Testing Explorer tree-rail → 993-line conventions doc → detail-surfaces convention (May 21).
- **KR3 (Standardize page layouts, May 22) is the win.** The chrome migration *is* the layout standardization.
- **KR2 (Reduce duplicate components, May 8) substantially missed.** The April audit named 7 components to build. Two shipped (page-header, filter-panel — both absorbed by chrome). Five did not. Adoption percentages from the April audit were never re-measured.
- **KR1 (Audit, April 17) ✅ delivered April 15.** The audit itself is excellent and was on time.
- **KR4 (CLAUDE.md / Skills / CI, June 5) 🟠 partial.** Page-chrome CLAUDE.md guidance shipped; no MJ-specific Claude Skill yet; no CI gate yet. 15 days remain.

### What shipped *in Q2* (April–May 2026)

Restricted to the IA workstream. Q1 infrastructure (Kendo Phase 2.1 removal, the original `ng-ui-components` primitives library — button, dialog, dropdown, etc., the bulk of the design-token migration from 1,659 → 115) is not claimed here.

| Deliverable | Date | Evidence |
|---|---|---|
| Phase 2.2 baseline audit | Apr 15 | `plans/phase-2-kendo-removal.md` — 603 lines. 11-row adoption scorecard, 7-category duplication table, layout pattern inventory, 7-component build list with APIs, Phase 2.3 layout templates. |
| Q2 chrome components | Apr–May | ~10 new components in `ng-ui-components`: `page-layout`, `page-header`, `page-body`, `page-header-interior`, `page-body-interior`, `page-search`, `refresh-button`, `filter-popover`, `filter-panel`, `filter-chip`, `filter-field`, `stat-badge`, `view-toggle`, `tab-nav`, `left-nav`, `left-nav-content`. |
| Dashboard migrations | May | ~65 dashboards on the shared chrome trio. Per-section bespoke CSS deleted. PR #2616. |
| Admin-shell interior chrome | May 19 | `<mj-page-header-interior>` shipped to all 4 Admin shells — Identity & Access, Data & Schema, Monitoring, Dev Tools — ~15 sub-pages. |
| Inline-tab shell migrations | May | AI Analytics + Knowledge Hub Analytics / Config / Tags / Classify all on `<mj-left-nav>` + `<mj-left-nav-content>`. |
| Tree-rail + Testing Explorer | May 20 | Optional tree support added to `<mj-left-nav>`. |
| Chrome conventions doc | Apr–May | `plans/explorer-chrome-conventions.md` — 993 lines, 11 sections. |
| Detail-surfaces convention | May 21 | Section 11 of chrome conventions: drawer-vs-modal-vs-tab + `<mj-detail-drawer>` contract. |
| CLAUDE.md guidance | Apr–May | Page-chrome sections in `packages/Angular/CLAUDE.md` and `packages/Angular/Explorer/dashboards/CLAUDE.md`. |

### KR-by-KR scoring

> **KR1**: Audit and baseline — by April 17
> **KR2**: Reduce duplicate components — by May 8
> **KR3**: Standardize page layouts — by May 22
> **KR4**: CLAUDE.md / Skills / CI compliance — by June 5

#### KR1 ✅ Delivered Apr 15

The audit is comprehensive. If anything, it was *over*-delivered relative to what the downstream KRs could realistically consume.

#### KR2 🔴 Substantially missed

The audit named 7 components to build. Today:

| Component | Status |
|---|---|
| `MJPageHeaderComponent` | ✅ Shipped (via chrome) |
| `MJFilterPanelComponent` | ✅ Shipped (via chrome) |
| `MJBadgeComponent` (general) | 🟡 Partial — `stat-badge` shipped for chrome counts only |
| `MJEmptyStateComponent` | ❌ Not built (102 inline instances per Apr 15 still present) |
| `MJConfirmDialogComponent` | ❌ Not built (3 bespoke impls remain) |
| `MJSelectorDialogComponent` | ❌ Not built (9 bespoke selectors remain) |
| `MJToastComponent` relocation | ❌ Not moved |

Plus a gap not on the April list: ~12 bespoke right-side detail panels (identified May 21; convention shipped, component not built).

Adoption-percentage targets from April 15 — **un-re-measured**:

| Metric | Apr 15 | Target | Current |
|---|---|---|---|
| Button adoption | 24% | 100% | unknown |
| Switch adoption | 5% | 100% | unknown |
| Loading (`mj-loading` vs `fa-spinner`) | 49% | 100% | unknown |
| `.mj-input` styling | 36% | 100% | unknown |
| `.mj-checkbox` styling | 17% | 100% | unknown |
| Numeric input adoption | 50% | 100% | unknown |
| Datepicker adoption | 58% | 100% | unknown |

#### KR3 ✅ Delivered (the actual Q2 win)

Chrome migration delivered Templates A and B implicitly. ~65 dashboards on the shared chrome. Left-nav shells unified. Caveat: "empty states" was in the KR3 wording and did not ship.

#### KR4 🟠 Partial, on track

CLAUDE.md page-chrome guidance: ✅ shipped.
Claude Skill (MJ-specific): ❌ not built.
CI compliance gate: ❌ not built.
15 days remain.

---

## Part 2 — Lessons learned

This section is the candid root-cause diagnosis. The goal is to avoid recurrence.

### What actually went wrong (not what felt like it went wrong)

**1. The KRs were written as wishes, not contracts.**

"Reduce all duplicate UI component implementations identified in the KR1 audit to a single shared version per component type — by May 8" is unfalsifiable as written. There's no count, no specific list, no definition of "done." The same sentence could describe the work for two weeks or two years. When a KR can mean anything, it ends up meaning whatever was convenient — in this case, "we shipped chrome consolidation, which sort of counts."

A contract version would have said: "Ship `MJEmptyStateComponent`, `MJBadgeComponent`, `MJConfirmDialogComponent`, `MJSelectorDialogComponent` and migrate consumers such that: 102 inline empty-state instances → 0; 79 status badge instances → 0; 8 confirm dialog instances → 0; 9 selector dialogs → 0. By May 8."

That's testable. The wish version isn't.

**2. Effort was meaningfully under-estimated.**

I treated "build a component" as one unit of work. The real unit is four:
  - Design the component (contract, API, slot rules, visual)
  - Build it (TypeScript + SCSS + tests + accessibility)
  - Migrate every consumer (102 inline instances → component, including visual QA per consumer)
  - Delete the displaced bespoke code (or it doesn't actually consolidate — it just adds a new thing alongside the old)

For `<mj-empty-state>` alone: ~5–7 person-days end-to-end. Multiply by 5 unbuilt components and the April-15-to-May-8 window (3 weeks ≈ 15 working days) was already short by a factor of ~2 even before the chrome work absorbed effort.

**3. The chrome migration was outside the KR2 plan but consumed its capacity.**

KR2 was a list of 7 body-level components. The work that happened was the chrome migration on ~65 dashboards. Those are different shapes of work. The chrome migration was the right pragmatic call — it delivered visible value and KR3 — but it wasn't named in KR2's scope. The OKR scored as if "we did *some* component work" but the components it expected weren't the components that got built.

This is a category error: doing important work that wasn't the planned work and counting it against the plan.

**4. No re-measurement cadence existed for the adoption %s.**

The April 15 audit baselined 7+ adoption percentages with precise numbers (button 24%, switch 5%, etc.). None were re-measured during the quarter. So today, six weeks after the deadline, we don't actually know whether button adoption moved at all. It probably moved slightly (the chrome components use `mjButton` throughout), but there's no number.

The audit had a measurement methodology; what was missing was *committing the measurement script to the repo* and running it weekly. A KR you can't measure is a KR you can't manage.

**5. No midpoint scope-cut conversation.**

By early May — three weeks into KR2's window — only chrome migration was running. The other 5 components didn't have anyone assigned. That should have triggered a scope-cut conversation: "We can't ship 7 components by May 8; which 3 do we commit to, and which 4 slip to Q3?" That conversation didn't happen. By the time the deadline arrived, the work was simply un-done, without any active decision to defer.

**6. Discovery from the audit wasn't budgeted against.**

The April 15 audit revealed scope nobody had estimated when the OKRs were drafted. There's no reserve in OKR planning for "the audit will probably reveal more work than we thought." So the audit's recommendations had to either fit into existing capacity or get dropped — and they got dropped.

### The honest summary

This wasn't an execution problem. It was a **scoping and process** problem:
- KRs written as aspirations instead of contracts
- Effort under-estimated by ~2×
- Scope-cut conversation missed in early May
- No re-measurement cadence for the adoption %s
- Discovered scope (the audit's recommendations) had no reserve to absorb it

Each of these is fixable structurally.

---

## Part 3 — Proposed OKR format for Q3 onward

The goal: prevent the same scoping miss from happening again. Below is the format change I'm proposing for my own OKRs going forward, and would like to standardize with you.

### Per-KR contract template

Every KR uses this shape:

```markdown
### KR-N: [single-sentence outcome with a number in it]

- **Owner**: [me / collaborator]
- **Due**: [specific date]
- **Type**: Committed | Stretch
- **Effort estimate**: [N person-days]
- **Risk**: Low | Medium | High
- **Dependencies**: [people / external blockers]

**Baseline (measured [date], method [link])**:
- Metric A: [number]
- Metric B: [number]

**Target**:
- Metric A: [number]
- Metric B: [number]

**Re-measurement cadence**: Weekly | Monthly | Milestone-driven
**Re-measurement method**: [link to script or runbook in the repo]

**Definition of done** (all required):
- [ ] [Concrete deliverable 1]
- [ ] [Concrete deliverable 2]
- [ ] Displaced bespoke code deleted (not just superseded)
- [ ] Visual QA in light + dark themes
- [ ] Documentation updated

**At-risk protocol**:
If, at the midpoint review, this KR is < 50% complete or > 25% over effort estimate, propose either (a) reducing the target, (b) moving sub-items to next quarter, or (c) cutting the KR entirely. Do not silently slip.
```

### Quarterly cadence

| Week | What happens |
|---|---|
| 1–2 | Audit + sizing. Effort estimates produced for each KR. Total estimated effort ≤ 80% of available capacity (the 20% reserve absorbs discovery + interruptions). |
| 3 | KRs *locked* — type (committed/stretch), effort, baseline, target, re-measurement cadence all committed. Before this, KRs are drafts; after this, changes require an explicit re-scope conversation. |
| 6 | **Midpoint review** — actual numbers re-measured against baseline. Any KR < 50% on track gets an explicit go/no-go decision: continue, cut target, or defer. The midpoint review *is* the scope-cut moment. |
| 10 | Pre-end review — what's landing vs. slipping is locked. No more committed deliverables added after this point. |
| 13 | End — scorecard. |

### Rules

1. **Wishes become contracts.** No KR ships in final form without a number, a date, a baseline, a target, and a definition of done. "Reduce duplicate components" alone is not a KR; "ship `<mj-empty-state>` + migrate 102 inline instances to 0 by May 8" is.
2. **Measurement is committed code.** Any percentage / count metric in a KR requires a re-measurement script committed to the repo and runnable on demand. No "we'll figure out how to measure later."
3. **Consolidation isn't done until the old code is deleted.** Shipping `<mj-empty-state>` doesn't close the KR — migrating 102 instances + deleting the displaced markup does.
4. **Midpoint scope-cuts are normal.** A KR that's deferred at the midpoint with a clear reason is *not a failure*; it's process working as designed. A KR that silently slips past its deadline *is* a failure.
5. **Discovery has a reserve.** 20% of estimated capacity is reserved for "the audit will probably reveal more work" and "something will break." If a quarter ends with the reserve untouched, capacity was under-utilized. If the reserve is consumed entirely by week 6, that's a signal to cut scope.
6. **Effort estimates are calibrated.** End-of-quarter: compare estimated vs. actual person-days per KR. Use the delta to recalibrate the next quarter's estimates. Over time the estimates get more accurate.

### Applied retrospectively: what Q2 *should* have looked like

If the format above had been used in April:

**KR2 (as it should have been written)**:

> **KR2.1**: Ship `<mj-empty-state>` and migrate 102 inline empty-state instances to 0. Due May 8. Committed. Effort: 7 days. Baseline: 102 instances across 77 files. Target: 0. Re-measure: weekly via grep script. Definition of done: component in `ng-ui-components`, all 102 instances replaced, displaced markup deleted, dark mode validated.
>
> **KR2.2**: Ship `<mj-page-header>` and migrate 105 ad-hoc header patterns to 1. Due May 8. Committed. Effort: 12 days (the consolidation involves layout redesign). Baseline: 105 across 65 files, 5–7 structural variants. Target: 0 bespoke headers in non-exception pages. Re-measure: weekly.
>
> **KR2.3**: Ship `<mj-filter-panel>` family and migrate 76 custom filter panels. Due May 22 (longer window — design complexity higher). Committed. Effort: 10 days.
>
> **KR2.4** [Stretch]: `<mj-badge>`, `<mj-confirm-dialog>`, `<mj-selector-dialog>`, `<mj-toast>` relocation. Total effort: 18 days. Committed only if KR2.1–2.3 are tracking green at week 6 midpoint.

Total committed effort: ~29 person-days for KR2.1–2.3. Stretch: +18. Available capacity in April–May for me + collaborators: estimable; if 29 is over the line, KR2.3 (filter panel) gets deferred or shortened to "filter-popover only."

This format would have forced the conversation in mid-April: "We have 29 days of committed work plus 18 days of stretch. Available capacity is X. Some of this has to slip *now*, not at the deadline."

**KR3 (as it should have been written)**:

> Standardize page layouts across all 11 apps. Due May 22. Committed. Effort: 35 days. Baseline: 5–7 structural header variants, 3 sidebar patterns, no shared empty-state, mixed loading approaches. Target: 1 header pattern (mj-page-header), 1 sidebar pattern (mj-left-nav), shared empty-state component, single loading approach. Re-measure: weekly count of dashboards on chrome trio.

35 days for KR3 alone explains why KR2 didn't ship — the chrome migration consumed nearly all available capacity, and that would have been visible in week 3 sizing. The conversation in week 3 would have been: "KR3 is 35 days; KR2 committed is 29 days. We have ~50 days of capacity. KR2.3 stretches the window; KR2.4 stretch items are out."

That's the conversation that didn't happen and that this format forces.

---

## Part 4 — Q2 close (next 15 days, by June 5)

Same as the previous draft, but each item is now in the new contract format.

**Q2-Close-1**: Ship `<mj-empty-state>` + migrate 10 highest-impact inline instances as reference. Effort: 3 days. Committed. DoD: component shipped, 10 instances migrated, displaced markup deleted, dark-mode validated.

**Q2-Close-2**: Ship `<mj-detail-drawer>` (per Section 11 of chrome conventions) + migrate `MCP/mcp-log-detail-panel` and `AI/agents/agent-configuration` as references. Effort: 3 days. Committed. DoD: component shipped, 2 references migrated, ~640 lines of bespoke `.detail-panel-*` CSS deleted, dark-mode validated.

**Q2-Close-3**: Commit a re-measurement script for the April 15 adoption percentages. Re-measure all 7 metrics. Effort: 1 day. Committed. DoD: script in `scripts/measure-adoption.sh`, current numbers written into `plans/adoption-metrics.md`, diff vs. April 15 reported.

**Q2-Close-4**: Ship one CI compliance check — fail builds on hardcoded hex outside the documented allowlist. Effort: 2 days. Committed. DoD: GitHub Actions workflow committed and gating PRs against `next`.

**Q2-Close-5**: Ship one Claude Skill for MJ Explorer dashboard scaffolding (chrome trio, slot conventions, token usage). Effort: 1 day. Committed. DoD: skill committed in `.claude/skills/`, used to scaffold one new test dashboard end-to-end.

**Total**: 10 person-days over 15 calendar days. Realistic with the remaining capacity.

---

## Part 5 — Q3 proposed objective (sketch, in the new format)

**Q3 Objective**: Body-level component consolidation + measurable adoption.

- **KR1**: Ship 4 remaining components from April audit. Owner: me. Due Jul 31. Committed. Effort: ~20 days. Components: `MJBadgeComponent` (general), `MJConfirmDialogComponent`, `MJSelectorDialogComponent`, `MJToastComponent` relocation. Definition of done per component: shipped, consumers migrated, displaced code deleted.
- **KR2**: Complete the 12-panel migration to `<mj-detail-drawer>`. Due Aug 31. Committed. Effort: ~6 days. Baseline: 12 bespoke detail panels (May 21 audit). Target: 0.
- **KR3**: Adoption % targets — button ≥80%, switch ≥80%, loading ≥80%, `.mj-input` ≥80%. Due Aug 31. Committed. Re-measure weekly via the script committed in Q2-Close-3.
- **KR4**: Extend CI compliance gates: chrome trio enforcement, button overrides, drawer-vs-modal where detectable. Due Aug 31. Committed. Effort: ~5 days.
- **KR5** [Stretch]: Begin entity-forms launch-path retrofit (`mode: 'drawer' | 'modal' | 'tab'` on `MJDialogService.open`). Due Sep 30. Stretch — only if KR1–4 tracking green at midpoint.

---

## What I'm asking for

1. **Alignment on the revised Q2 KR scoring** — KR1 ✅, KR2 🔴, KR3 ✅, KR4 🟠. No varnish.
2. **Approval for the 5-item Q2 close list** in Part 4.
3. **Endorsement of the new OKR format** in Part 3 — or pushback so we converge on something we both think prevents recurrence.
4. **Midpoint review for Q3** scheduled at quarter start (week 6 = mid-August). Putting it on the calendar before Q3 begins so it's not optional.

---

## Appendix: source artifacts

- **Apr 15 baseline audit**: `plans/phase-2-kendo-removal.md` (branch `component-standardization-buttons`)
- **Chrome consolidation merge**: PR #2616 on `next`
- **Chrome conventions doc**: `plans/explorer-chrome-conventions.md`
- **IA progress tracker**: `plans/explorer-ia-progress.md`
- **Q2 chrome components**: `packages/Angular/Generic/ui-components/src/lib/`

## What is *not* claimed as Q2 output

- Kendo Phase 2.1 removal (Q1)
- Original `ng-ui-components` primitives — button, dialog, dropdown, combobox, switch, numeric-input, datepicker, progress-bar, accordion, window (Q1)
- Bulk of the design token migration 1,659 → 115 (Q1)
- `mj-loading`, `mj-tab-strip`, `mj-entity-card`, `mj-pagination`, `mj-record-selector` and other scattered packages (pre-existing; relocation deferred)
