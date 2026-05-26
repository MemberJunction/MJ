# UI Consistency — Roadmap (Master)

> **Single source of truth for the UI consistency work — sized in effort, ordered by sequence and dependency.** Not organized by calendar. Items move through `queued → active → done`. When capacity opens up, the next item in sequence gets picked up.
>
> **Effort calibration.** Estimates assume Claude Code-paired work, not solo human grinding. Mechanical work (component migrations, CI workflows, audit scripts, test scaffolding) is *hours*, not days. Design work (slot contracts, taxonomies, architecture decisions) is *days*, not weeks. Items flagged HIGH risk carry implicit 20–30% buffer for the genuinely unknown. **If an item's actual effort runs >25% over its estimate, the at-risk protocol fires** — explicit decision recorded inline.
>
> **Why no calendar dates**: The original Q2 OKR was scoped to a quarter and missed because effort was estimated as solo-human work. This doc separates *what* the work is from *when* it gets done.
>
> **Last updated**: 2026-05-22 (calibrated for Claude Code-paired pace)

---

## Long-term objective

**Drive cross-app UI consistency in MJ Explorer** through shared components, common conventions, and automated enforcement — so any two pages in any two apps feel like they came from the same product.

A quality property, not a destination. Measured continuously by:

1. Count of canonical shared components in use (growing)
2. Count of bespoke / duplicate patterns eliminated (shrinking)
3. Adoption percentages of existing primitives (rising)
4. Automated gates that prevent regression (binary — present or not)

---

## Operating principles

1. **"Done" means consolidation, not invention.** Component shipped without consumers migrated *and* the displaced bespoke code deleted is not done.
2. **Effort is sized in person-days, not calendar dates.** Each item has an estimate. Calendar mapping happens day-by-day, not in this doc.
3. **One item at a time.** Active work is bounded — finish one before pulling the next. Avoids context-switching tax.
4. **Re-measurement is automated.** Every percentage / count metric has a script that produces it on demand. No "we'll measure later."
5. **At-risk protocol.** Any active item that runs >25% over its effort estimate triggers an explicit decision: continue with revised plan, reduce target, or cut. Silent overrun is the failure mode this protocol exists to prevent.
6. **Catalog before commitment.** New work moves to *queued* only after it exists in [`ui-consistency-program.md`](ui-consistency-program.md) with a sized contract.

---

## The work

Ordered by sequence: foundation first (unblocks everything), then the focused card consolidation block, then process gates, then remaining body components, then visual identity, then architectural.

Status markers: `⚪ queued` / `🔵 active` / `✅ done`.

---

### Foundation block

These unblock most other work and are cheap. Do first.

#### F-1: Commit a re-measurement script ⚪ queued

- **Effort**: ¼ day | **Risk**: Low
- **Baseline (Apr 15)**: 7 adoption percentages measured (button 24%, switch 5%, loading 49%, `.mj-input` 36%, `.mj-checkbox` 17%, numeric input 50%, datepicker 58%)
- **Target**: Current numbers measured and committed to `plans/adoption-metrics.md`; delta vs. April 15 reported
- **DoD**: Script at `scripts/measure-ui-adoption.sh` runs in <30s; output with date stamp; methodology documented (denominators / exclusions)

#### F-2: Ship CI hex-color compliance gate ⚪ queued

- **Effort**: ½ day | **Risk**: Low
- **Baseline**: 0 automated gates today
- **Target**: GitHub Actions workflow gating PRs against `next`
- **DoD**: Workflow at `.github/workflows/ci-ui-tokens.yml`; allowlist at `scripts/ci/hex-allowlist.txt`; tested on passing + failing PR; actionable error messages

#### F-3: Ship `<mj-empty-state>` component (10 reference migrations) ⚪ queued

- **Effort**: 1 day | **Risk**: Low
- **Baseline**: 102 inline empty-state patterns across 77 files
- **Target**: Component shipped; 10 reference instances migrated; displaced markup deleted in those 10 files
- **DoD**: Component shipped in `@memberjunction/ng-ui-components` with variants `'empty' | 'no-results' | 'error'`; unit tests; 10 consumers migrated; displaced markup deleted; light/dark theme validated; usage in CLAUDE.md

#### F-4: Ship `<mj-detail-drawer>` component (2 reference migrations) ⚪ queued

- **Effort**: 1½ days | **Risk**: Medium — CDK Overlay + complex agent-configuration migration
- **Baseline**: 12 bespoke right-side detail panels; ~1,000+ lines of bespoke `.detail-panel-*` CSS
- **Target**: Component shipped per `chrome-conventions.md` Section 11; 2 reference migrations (MCP log-detail-panel, AI agent-configuration); ~640+ lines of bespoke CSS deleted
- **DoD**: Component shipped per Section 11; 2 reference migrations; bespoke CSS deleted; focus management + ESC + backdrop dismiss tested; light/dark validated

#### F-5: Ship dashboard-scaffolding Claude Skill ⚪ queued

- **Effort**: ¼ day | **Risk**: Low
- **Baseline**: Zero MJ-specific Claude Skills
- **Target**: Skill at `.claude/skills/scaffold-mj-dashboard.md`
- **DoD**: Skill committed; tested by scaffolding one new dashboard end-to-end; generated scaffold passes hex CI gate; uses chrome trio correctly

**Foundation block total: ~3½ days**

---

### Card consolidation block (one continuous unit of work)

Per direction (2026-05-22): tackle all 3 archetypes at once, not split across phases.

#### C-0: Lock card archetype decisions + theme 4 reframes ⚪ queued

- **Effort**: 1½ days | **Risk**: HIGH — decisions wrong here cost more downstream
- **Activity**: Survey all 23 inline card patterns side-by-side. Lock slot contracts. Decisions to make (theme 4 reframes from 2026-05-22 added here):
  - Single-component-with-conditions vs. three-separate-components (reframe leans toward **single** per the "reusable card with conditions" direction)
  - **List view as default, card as toggle** (reverses original assumption — see view-mode taxonomy below)
  - Info density rule — cards show LESS than today since detail is one click away (drawer)
  - Toggle parity — "where both make sense, support both" (NOT strict every-page-must-have-both); document exceptions where data shape forces one mode
  - Cards-per-row consistency — fixed grid vs. responsive with min/max widths
  - View-mode taxonomy assignment per page (revisit using list-as-default rule)
  - Specialized cards (action, integration, tag) staying outside the consolidation
- **Target**: Slot contracts + view-mode taxonomy + toggle policy documented in `list-page-standardization.md`; component naming locked
- **DoD**: All 3 archetypes have slot contracts that survived paper-prototype against all 23 inline templates; naming locked; view-mode rule per page documented; specialized-cards exception list documented
- **Note**: Effort is mostly human design judgment, not mechanical work. Claude can do the survey in minutes; the decisions are yours.

#### C-1: Build components + pilot one card per archetype ⚪ queued

- **Effort**: 1 day | **Risk**: Medium — first time the slot contracts meet real code
- **Activity**: Build the canonical component(s). Migrate 3 pilot consumers — one per archetype (User card, Schedule card, Audit entry). Validate the slot contracts work in real consumers.
- **Target**: Component(s) shipped + 3 pilot consumers using them
- **DoD**: Component(s) in `@memberjunction/ng-ui-components`; 3 pilot consumers migrated; light/dark validated; if API needs revision, revise before bulk
- **Note**: Fail-fast checkpoint. If a slot contract fails, revise here, not after 20 migrations.

#### C-2: Bulk-migrate all remaining card consumers ⚪ queued

- **Effort**: 1½ days | **Risk**: Low (pattern proven in C-1)
- **Activity**: Migrate the remaining ~20 inline card templates to the canonical components.
- **Per archetype**:
  - Avatar + Identity + Status (~4 remaining): Role, Application, Permission card, Test Review item
  - Icon + Title + Meta + Actions (~11 remaining): Request, Job, Pipeline, Query, MCP server, Model, Activity entry, Vector card, Tag (basic), Test run card, Test case card
  - Compact List Item (~5 remaining): Audit entry (Permissions), Activity entry × 2, Conversation item, Label card, Version card
- **Target**: 0 inline card templates for the 23 in-scope patterns; specialized cards intentionally retained
- **DoD**: All inline templates deleted; light/dark theme validated on representative sample

#### C-3: Add list views to currently-card-only pages ⚪ queued

- **Effort**: 4 days | **Risk**: Medium — net-new view construction across ~12 pages
- **Activity**: Per theme 4's list-as-default reframe — ~12 list pages currently render card-only (User Mgmt, Roles, Apps, Models, MCP, Agent Requests, etc.). They need list views ADDED to support the toggle. Build a canonical list-row treatment (likely paired with the Compact List Item card archetype) and apply to each card-only page.
- **Target**: Every list page that should support both views per C-0's taxonomy has both
- **DoD**: Identified card-only pages have list view available; toggle works in both directions; light/dark validated
- **Depends on**: C-0 (taxonomy decided), C-1 (archetypes built)
- **Note**: Net-new view work, not just consolidation. Surfaced 2026-05-22 from theme 4 reframe.

**Card consolidation block total: ~7½ days**

---

### Process / CI gates

#### P-1: Re-measurement cadence established ⚪ queued

- **Effort**: ¼ day | **Risk**: Low | **Depends on**: F-1
- **Target**: Monthly automated re-measurement, output committed to `plans/adoption-metrics.md`
- **DoD**: Monthly workflow committed; first run verified to produce date-stamped output

#### P-2: Ship CI chrome-trio enforcement gate ⚪ queued

- **Effort**: ½ day | **Risk**: Low | **Depends on**: F-2 (CI scaffolding)
- **Target**: Workflow flags PRs introducing new resource components without `<mj-page-layout>` + `<mj-page-header>` + `<mj-page-body>` (with exception list)
- **DoD**: Workflow at `.github/workflows/ci-ui-chrome.yml`; exception list referenced from chrome-conventions Section 9; tested

#### P-3: Ship CI `.mj-btn` override prevention gate ⚪ queued

- **Effort**: ¼ day | **Risk**: Low | **Depends on**: F-2
- **Target**: Fail PRs introducing `.mj-btn{}` rules in component-scoped CSS outside `ng-ui-components/button.scss`
- **DoD**: Workflow committed; tested; error message points to directive's `[variant]` + `[size]` inputs

#### P-4: Ship CI bespoke-pattern detection ⚪ queued

- **Effort**: ½ day | **Risk**: Low | **Depends on**: F-2, F-3, F-4, C-2
- **Target**: Workflow flags PRs introducing `.detail-panel-*`, `.section-header`, `.empty-state`, `.card-grid` CSS patterns
- **DoD**: Workflow committed; tested

**Process block total: ~1½ days**

---

### Adoption push (depends on Foundation F-1 shipping)

#### A-1: Push button, switch, loading adoption to ≥80% ⚪ queued

- **Effort**: 1 day | **Risk**: Medium — some legitimate exceptions (third-party widgets)
- **Baseline (Apr 15)**: button 24%, switch 5%, loading 49%
- **Target**: All 3 metrics ≥80% per re-measurement
- **DoD**: Migration PRs landed; re-measurement script confirms ≥80%; exceptions documented

#### A-2: Push `.mj-input`, `.mj-checkbox`, numeric, datepicker to ≥80% ⚪ queued

- **Effort**: 1 day | **Risk**: Low
- **Baseline (Apr 15)**: `.mj-input` 36%, `.mj-checkbox` 17%, numeric input 50%, datepicker 58%
- **Target**: All 4 metrics ≥80%
- **DoD**: Migration PRs landed; re-measurement confirms; exceptions documented

#### A-3: Migrate remaining ~92 empty-state inline patterns ⚪ queued

- **Effort**: ½ day | **Risk**: Low | **Depends on**: F-3
- **Baseline**: 92 inline patterns remaining after F-3's 10 reference migrations
- **Target**: 0 inline empty-state patterns
- **DoD**: Re-measurement confirms 0; displaced markup deleted

#### A-4: Complete `<mj-detail-drawer>` migration (10 remaining panels) ⚪ queued

- **Effort**: 1½ days | **Risk**: Medium — some panels (agent-editor, integration mapping-workspace) have complex content | **Depends on**: F-4
- **Baseline**: 10 bespoke detail panels remaining after F-4's 2 reference migrations
- **Target**: 0 bespoke detail-panel implementations
- **DoD**: All 10 migrated; total `.detail-panel-*` CSS line count: 0

**Adoption block total: ~4 days**

---

### Remaining body components

These come after the card consolidation block since some depend on settled card patterns.

#### B-1: Ship `<mj-toast>` relocation ⚪ queued

- **Effort**: ¼ day | **Risk**: Low — mechanical
- **Activity**: Move from `@memberjunction/ng-conversations` to `@memberjunction/ng-ui-components`. Consumers update imports. Re-export with deprecation notice from old location.
- **DoD**: Component moved; all consumers updated; both packages build clean

#### B-2: Ship `<mj-confirm-dialog>` + migrate 3 bespoke impls ⚪ queued

- **Effort**: ½ day | **Risk**: Low
- **Baseline**: 3 bespoke confirm-dialog impls + ~8 inline confirm patterns
- **Target**: Single canonical component; bespoke impls retired
- **DoD**: Component shipped using `<mj-dialog>` primitives; MJ button placement enforced (primary LEFT, Cancel RIGHT); 3 bespoke impls deleted; inline confirms replaced

#### B-3: Ship `<mj-status-indicator>` + migrate 6 bespoke patterns ⚪ queued

- **Effort**: 1 day | **Risk**: Low-Medium — status taxonomy needs human design judgment
- **Baseline**: 6+ bespoke status patterns (AI agent-config, conversations message-status, archive-status, scheduling activity, action-execution, integration overview)
- **Target**: Single canonical component
- **DoD**: Component shipped; all 6 patterns replaced; displaced CSS deleted; normalized status vocabulary documented

#### B-4: Ship `<mj-badge>` (general) + migrate consumers ⚪ queued

- **Effort**: 1½ days | **Risk**: Medium — must clarify distinction from `<mj-stat-badge>`
- **Baseline**: ~79 badge/pill instances across `mj-pill`, `mj-notification-badge`, inline `.status-badge` (370 CSS declarations across 71 files)
- **Target**: Single canonical badge; bespoke pills retired
- **DoD**: Component shipped + tests; `mj-pill` and `mj-notification-badge` consumers migrated; inline `.status-badge` CSS replaced; CSS declarations down from 370 → ≤30

#### B-5: Ship `<mj-alert>` + migrate 5 bespoke patterns ⚪ queued

- **Effort**: 1 day | **Risk**: Low-Medium
- **Baseline**: 5+ distinct error/alert patterns (query-error with hardcoded Bootstrap red, edit-mode banner, health banner, validation errors, generic alerts)
- **Target**: Two canonical surfaces — `<mj-toast>` for transient, `<mj-alert>` for persistent. 5 patterns retired.
- **DoD**: `<mj-alert>` shipped; 5 bespoke patterns migrated; hardcoded Bootstrap-red deleted; light/dark validated

#### B-6: Ship `<mj-collapsible-section>` + migrate 29-file pattern ⚪ queued

- **Effort**: 2 days | **Risk**: Medium — variants will emerge during the survey
- **Baseline**: 29+ files copy bespoke `.section-header` + chevron + content pattern
- **Target**: All 29 files using canonical component
- **DoD**: Component shipped + tests; 29 files migrated (or documented exceptions); bespoke CSS deleted; accessibility validated

#### B-7: Ship `<mj-stat-tile>` + migrate Overview-page metric tiles ⚪ queued

- **Effort**: 1½ days | **Risk**: Low-Medium
- **Baseline**: ~10 dashboards reinvent `.stat-item` / `.stat-label` / `.stat-value` markup
- **Target**: Canonical stat-tile shipped; Overview-page metric tiles migrated
- **DoD**: Component shipped; ≥5 Overview pages migrated; displaced markup deleted; design slot for non-standard content

#### B-8: Ship `<mj-form-section>` + migrate 29-file pattern ⚪ queued

- **Effort**: 1½ days | **Risk**: Medium
- **Baseline**: 29+ files manually constructing `.form-section > .form-field > label + input` markup
- **Target**: All 29 files using canonical component
- **DoD**: Component shipped; 29 files migrated; bespoke markup deleted

#### B-9: Ship `<mj-skeleton>` + reference migrations ⚪ queued

- **Effort**: 1 day | **Risk**: Low
- **Activity**: New component for list-page initial-load skeletons (distinct from `<mj-loading>` spinner)
- **Target**: Component shipped; ≥3 list pages use it
- **DoD**: Component shipped + tests; 3 reference consumers; light/dark validated

#### B-10: Ship `<mj-selector-dialog>` + migrate 9 bespoke selectors ⚪ queued

- **Effort**: 3 days | **Risk**: HIGH — heaviest design surface in the program; selectors have very different needs
- **Baseline**: 9 bespoke selector dialogs + under-adopted `record-selector`
- **Target**: Canonical selector(s); 9 bespoke implementations retired
- **Mitigation**: Survey + categorize before design; possibly need 2 components, not 1
- **Note**: Design judgment is the bottleneck here, not mechanical work. Estimate carries 30% buffer.

**Body components block total: ~13 days**

---

### Visual identity

#### V-1: Verify unified brand color across all apps ⚪ queued

- **Effort**: ½ day | **Risk**: Low
- **Target**: Every app renders with brand-blue; per-app accent overrides documented as intentional or removed

#### V-2: Icon vocabulary audit pass ⚪ queued

- **Effort**: 1 day | **Risk**: Low
- **Target**: Same concept renders with same icon across apps (refresh, settings, edit, etc.)

#### V-3: Typography scale audit ⚪ queued

- **Effort**: 1 day | **Risk**: Low
- **Target**: Every component under `ui-components` uses `--mj-text-*` tokens — no hardcoded font-size/font-weight px

#### V-4: Spacing rhythm audit ⚪ queued

- **Effort**: 2 days | **Risk**: Low (high volume but mechanical)
- **Baseline (Apr 15)**: 71% of SCSS files have hardcoded spacing (px)
- **Target**: 0%

#### V-5: Loading screen / splash unification ⚪ queued

- **Effort**: TBD pending survey
- **Status**: Needs survey before sizing

#### V-6: 404 / error page unification ⚪ queued

- **Effort**: TBD pending survey

#### V-7: Welcome / first-run states ⚪ queued

- **Effort**: TBD pending survey

#### V-8: Dark-mode parity audit per app ⚪ queued

- **Effort**: 2 days | **Risk**: Medium — requires human visual judgment
- **Target**: Every app verified to render correctly in dark mode; bugs flagged

**Visual identity block total: ~6½ days sized + 3 items TBD**

---

### Discovery (audit work, surfaces new items)

#### D-1: Workspace pages audit ⚪ queued

- **Effort**: 1 day
- **Activity**: Audit Component Studio, Flow Editor, AI Test Harness, Database Designer, Query Browser, Integration mapping, Conversations, Data Explorer, ERD viewer, ai-agent-run viz, Kanban, Gantt. Identify canvas / palette / inspector / properties-panel / save-state / undo-redo patterns.
- **Output**: New section in catalog with ~10–20 sized items

#### D-2: Record-detail pages audit ⚪ queued

- **Effort**: 1 day
- **Activity**: Audit generated entity forms + 7 custom forms. Identify toolbar / tab-set / related-records / dirty-state / validation / lookup-picker patterns.
- **Output**: New catalog section with ~10–15 sized items

#### D-3: Modal / wizard flows audit ⚪ queued

- **Effort**: ½ day

#### D-4: Long-tail primitives audit ⚪ queued

- **Effort**: ongoing — no fixed budget
- **Activity**: Tooltips, popovers, context menus, split buttons, tag inputs, sliders, color pickers, time pickers, etc. Triage incrementally.

#### D-5: Main shell audit ⚪ queued

- **Effort**: 1 day
- **Activity**: Audit the MJ Explorer main shell — `shell.component`, `app-nav`, `app-switcher`, `command-palette` (global search), `user-notifications`, `about-dialog`, `profile-dialog` + `user-profile` (possible duplicate). Identify bespoke CSS, chrome non-compliance, component overlap, opportunities for shared treatment.
- **Output**: New "Main shell" items (S-1 through S-3) get sized; S-4/S-5/S-6 sizing confirmed.
- **Note**: Identified 2026-05-22 as theme 1 of the free-thinking session. Outer chrome wasn't part of prior audits.

**Discovery block total: ~3½ days sized + ongoing**

---

### Architectural (deferred until other work matures)

#### X-1: Entity-forms launch-path retrofit ⚪ queued

- **Effort**: 4 days | **Risk**: HIGH — touches entity-forms launch path; behavior change across all forms
- **Activity**: Add `mode: 'drawer' | 'modal' | 'tab'` to `MJDialogService.open(form, ...)` so existing custom forms can be hosted in `<mj-detail-drawer>` without rewriting them
- **Depends on**: F-4 + A-4 (detail-drawer battle-tested first)
- **Note**: Design + careful regression testing is the bottleneck. Estimate carries 30% buffer.

#### X-2: `<mj-record-form-container>` adoption push ⚪ queued

- **Effort**: 1 day | **Risk**: Medium
- **Activity**: Audit existing custom forms; migrate non-compliant to use `<mj-record-form-container>` (per CLAUDE.md)

#### X-3: `<mj-breadcrumb>` consolidation ⚪ queued

- **Effort**: ½ day | **Risk**: Low
- **Activity**: 2 bespoke impls → 1 canonical

#### X-4: Form field wrapper unification ⚪ queued

- **Effort**: TBD — architectural change touching `base-forms` and `dynamic-forms`

**Architectural block total: ~5½ days sized + 1 TBD**

---

### Main shell block (theme 1 — outer chrome of MJ Explorer)

NEW scope identified 2026-05-22 during the free-thinking session. The outer chrome (header, navigation, search, notifications, profile/About modals) was never part of prior audits. Most items here need D-5 (main shell audit) to complete before they can be concretely sized.

#### S-1: Main header refactor ⚪ queued

- **Effort**: TBD pending D-5 | **Risk**: Medium — chrome of every app; high-visibility
- **Activity**: Rearrange the header treatment. User flagged the main nav treatment and the "floating" search bar specifically. Needs discovery to specify changes.
- **Depends on**: D-5

#### S-2: Main navigation refactor ⚪ queued

- **Effort**: TBD pending D-5
- **Activity**: How users move between apps. Currently in the header.
- **Depends on**: D-5

#### S-3: Global search bar treatment ⚪ queued

- **Effort**: TBD pending D-5
- **Activity**: Currently `command-palette` (Cmd-K style); user described it as "floating" and wants a different treatment.
- **Depends on**: D-5

#### S-4: Notifications panel chrome compliance ⚪ queued

- **Effort**: ~1 day | **Risk**: Low
- **Activity**: User flag: `user-notifications` has bespoke CSS, doesn't adhere to chrome trio. Migrate to canonical chrome + tokens.

#### S-5: About MJ + profile modals chrome compliance ⚪ queued

- **Effort**: ~1 day | **Risk**: Low
- **Activity**: User flag: `about-dialog`, `profile-dialog`, and `user-profile` likely don't use canonical `<mj-dialog>` primitives + tokens. Also possible dedup opportunity between `profile-dialog` and `user-profile` (two components, possibly overlapping responsibility — confirm in D-5).

#### S-6: Per-app rainbow removal ⚪ queued

- **Effort**: ½ day | **Risk**: HIGH organizationally (stakeholder pushback expected)
- **Activity**: Default `--mj-app-accent` to `--mj-brand-primary` regardless of `metadata.Color`. Keep `metadata.Color` as opt-in theming hook. Documented direction exists (per memory `feedback_unified_brand_color.md`).
- **Note**: Technical change is trivial; the work is the stakeholder conversation. Pushback flagged by Matt 2026-05-22 — needs buy-in before flipping.

**Main shell block total: ~2½ days sized + S-1/S-2/S-3 TBD pending D-5**

---

## Total effort summary

| Block | Sized effort | Notes |
|---|---|---|
| Foundation | ~3½ days | Unblocks most other work |
| Card consolidation | ~7½ days | Includes C-3 (adding list views to card-only pages, per theme 4 reframe) |
| Process / CI gates | ~1½ days | Some depend on Foundation |
| Adoption push | ~4 days | Depends on F-1 + F-3 + F-4 |
| Body components | ~13 days | B-6 + B-10 are the heaviest (design) |
| Visual identity | ~6½ days sized + 3 TBD |  |
| Discovery audits | ~3½ days sized + ongoing | Includes D-5 (main shell audit) |
| Architectural | ~5½ days sized + 1 TBD | X-1 risky, deferred |
| **Main shell** | **~2½ days sized + 3 TBD** | NEW scope (theme 1) — S-1/S-2/S-3 sized after D-5 |
| **Total sized** | **~47½ days** | Excludes TBDs |
| **TBDs to size** | 8 items | Increased from 5 — added S-1, S-2, S-3 pending D-5 |
| **Discovery downstream** | Estimated +10–20 days | Workspace + record-detail + main shell audits will add items |

**Honest read**: ~40 sized person-days plus ~10–20 days of expected downstream scope. At an hour-paced Claude Code workflow that lands meaningful work most days, the bulk of this is achievable within a focused execution window — roughly 1–2 months of focused effort, longer with interruptions.

That's a wildly different scope than the original solo-grind sizing said. The pattern: design decisions stay human-bound (Phase 0, taxonomy decisions, slot contracts), but build + migrate + test are largely mechanical with Claude.

---

## Cadence

Triggered by events, not calendar dates.

- **Weekly status**: When an item is `🔵 active`, a brief update — % complete, effort burned vs. estimate, blocker (if any), next milestone.
- **Monthly re-measurement**: Last working day of each month, F-1's script runs; output committed to `plans/adoption-metrics.md`. Deltas reported.
- **Milestone review**: When a block ships (Foundation complete, Card block complete, etc.), pause and review: effort actual vs. estimate, what surprised us, recalibrate next item's estimates if patterns emerged.
- **At-risk trigger**: Any active item >25% over its effort estimate fires the at-risk protocol — explicit decision recorded inline (continue / reduce target / cut).

---

## Supporting artifacts

| Doc | What it is | When to read |
|---|---|---|
| **[`ui-consistency-program.md`](ui-consistency-program.md)** | The full multi-quarter catalog — every component, layout pattern, CI gate, visual-identity item, sized in person-days | When pulling new work into this roadmap; when adding new scope |
| **[`list-page-consistency-gameplan.md`](list-page-consistency-gameplan.md)** | Execution playbook for the list-page priority — Phases 0–6, decisions, sequencing | When working any list-page item — the gameplan is the playbook |
| **[`list-page-inventory.md`](list-page-inventory.md)** | Empirical baseline — 44 list pages catalogued, 25 card patterns → 3 archetypes | When making decisions; when sizing migrations |
| **[`list-page-standardization.md`](list-page-standardization.md)** | Existing proposal (May 20) — gets updated when C-0 decisions lock | Will become the active spec post-C-0 |
| **[`explorer-chrome-conventions.md`](explorer-chrome-conventions.md)** | 11-section chrome rulebook; Section 11 = detail-surfaces UX rule | Reference when working any chrome item |
| **[`explorer-ia-progress.md`](explorer-ia-progress.md)** | Per-page chrome migration status tracker | Reference when verifying chrome state |
| **[`phase-2-kendo-removal.md`](phase-2-kendo-removal.md)** | April 15 baseline audit (on `component-standardization-buttons` branch) | Reference for the baselines |

---

## How this doc gets updated

- **When an item starts**: status changes to `🔵 active`, weekly status begins
- **When an item ships**: status changes to `✅ done`, weekly status ends, effort actual vs. estimate noted
- **Monthly**: re-measurement output reviewed, adoption block items get current numbers
- **When discovery audits run**: outputs added to the catalog; high-priority items may be promoted here
- **When at-risk protocol fires**: decision recorded inline on the item

No quarterly cycle. Items move when they're done. Velocity is observed, not forced.

---

## Background

The original Q2 OKR (April–June 2026) was framed around quarterly deadlines with vague KRs like "reduce all duplicate components" — and missed because effort was sized as solo human work and the scope was treated as quarterly-achievable. The format change captured in this doc — effort instead of dates, sequence instead of quarters, contracts instead of wishes, and calibrated for Claude Code-paired pace — is the direct outcome of that retrospective.
