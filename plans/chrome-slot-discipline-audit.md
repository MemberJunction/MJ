# Chrome Slot Discipline Audit

> **Branch:** `explorer-shell-subpage-chrome` (active) · **Status:** Tasks A + B complete; Task C pending · **Last update:** 2026-05-20

> Companion to [`plans/explorer-chrome-conventions.md`](explorer-chrome-conventions.md) (the rules) and [`plans/explorer-ia-progress.md`](explorer-ia-progress.md) (the migration log).

## TL;DR

The three projection slots on `<mj-page-header>` and `<mj-page-header-interior>` — `[meta]` / `[actions]` / `[toolbar]` — are correct in concept but applied unevenly across the app. Rather than restructuring the chrome contracts, this audit tightens **discipline** on the three existing slots with three concrete passes.

## Background — what's drifted

After the page-header / interior-chrome standardization, we have ~65 dashboards consuming the three slots. Three problems emerged:

1. **`<mj-tab-nav>` lives in two different slots.** API Keys, SystemDiagnostics, Dev Tools inspectors, KH Tags, KH Classify put it in `[toolbar]` (the newer convention per `feedback_subtabs_in_chrome_toolbar.md`). Testing, Scheduling, MCP still have it in `[actions]` from before that decision was made.
2. **`[meta]` mixes "data summaries" with "real status."** Same pill chrome, very different meaning. A row-count badge that mirrors `result.length` adds noise; a `Variant="warning"` "Unsaved changes" pill is genuine signal. The pattern doesn't distinguish.
3. **`[actions]` has no internal hierarchy.** Refresh + filter-popover + view-toggle + sort + "+ New X" all sit at the same visual weight and ordering varies by page. The primary CTA should be visually distinguishable from the secondary controls.

## The three audits

### Task A — Settle tab-nav slot drift ✅ COMPLETE (2026-05-20)

**Rule:** `<mj-tab-nav>` always projects into `[toolbar]`. Never `[actions]`.

**Pages migrated:**

| Page | Source | Migration shape |
|---|---|---|
| Testing (parent dashboard) | `dashboards/src/Testing/testing-dashboard.component.html` | Tab-nav moved to `[toolbar]`. `<app-evaluation-mode-toggle>` stays in `[actions]` (mode switch is a control, not a tab selector). |
| Scheduling (parent dashboard) | `dashboards/src/Scheduling/scheduling-dashboard.component.html` | Tab-nav moved to `[toolbar]` and merged with the existing per-tab `<mj-page-search>` + `<mj-filter-chip>` row. The per-tab `[actions]` cluster (filter-popover + Refresh + per-tab primary CTA like "New Job") stays in `[actions]`. |
| MCP (parent dashboard) | `dashboards/src/MCP/mcp-dashboard.component.html` | Tab-nav moved to `[toolbar]` (above the search input). `[actions]` retains filter-popover + per-tab primary CTAs (Add Server / Add Connection / view-toggle + Test Tool / Refresh). |

**Already correct (no migration needed):**

- API Keys (`[toolbar]`)
- SystemDiagnostics (`[toolbar]`)
- Dev Tools — App State Inspector, Layout Inspector (`[toolbar]`)
- AI Tags, AI Autotagging Pipeline / KH Classify (`[toolbar]` in per-section interior chrome)

### Task B — `[meta]` audit ✅ COMPLETE (2026-05-20)

**Canonical rule:** see [`plans/explorer-chrome-conventions.md` §2 → `[meta]`](explorer-chrome-conventions.md#meta--what-am-i-looking-at) for the full decision framework. The short version: a badge earns its spot when (1) the info isn't visible by glancing at the page below, AND (2) it carries signal not just inventory, AND (3) it's worth always-on real estate.

**Pages where badges were dropped (~14 pages):**

| Page | What was dropped |
|---|---|
| Identity & Access → Users | total / active / owners (mirrored the list + Active/Inactive chips) |
| Identity & Access → Roles | total / system / custom (mirrored the System/Custom chips) |
| Identity & Access → Apps | apps / entities / public (mirrored the Active/Inactive chips + list) |
| Identity & Access → Permissions | entities / public / restricted / permissions (mirrored the Public/Restricted/Custom chips) |
| Credentials → Types | cross-entity reference counts (categories, credentials) — kept the X-of-Y types filter count |
| Credentials → Categories | both badges (row count + cross-entity types reference) |
| Integration → Connections | row-count badge |
| Integration → Pipelines | both badges (row count + cross-aggregate entity-maps) |
| Integration → Schedules | integrations / scheduled (row counts) — kept the conditional `running` status pill |
| Integration → Activity | `total` row count — kept `succeeded` / `failed` (variant-bearing) + `records` (aggregate) |
| AI → Agents | filteredAgents row count |
| AI → Models | filteredModels row count |
| AI → Prompts | filteredPrompts row count |
| Actions → Overview | totalActions inventory count (body has KPI cards) |
| Actions → Monitor | totalExecutions inventory count |
| Database Designer → Entity List | FilteredEntities row count |
| Entity Admin | filteredEntities row count |
| Lists → Browse | filteredLists row count |
| Testing → Explorer | FilteredResultCount row count |

**Pages kept unchanged (already correct):**

| Page | Why it passes |
|---|---|
| Identity & Access → App Roles | "Unsaved changes" `Variant="warning"` pill, conditional on dirty state. **Gold standard.** |
| Credentials → List | "X of Y credentials" filtered count + conditional `expiring` warning + conditional `expired` error |
| Credentials → Types | "X of Y types" filtered count |
| Credentials → Audit | "X of Y events" filtered count |
| Knowledge Hub → Analytics | PipelineStatusText with success/error variant |
| Knowledge Hub → Configuration | "Unsaved changes" warning, conditional on dirty |
| Knowledge Hub → Scheduling | Conditional `active` success + `paused` warning |
| Integration → Overview | TotalIntegrations single hero metric (page IS the overview) |
| Integration → Activity | succeeded/failed status variants + records aggregate |
| AI → System Configuration | "X of Y configurations" filtered count |
| Actions → Explorer | "X of Y actions" filtered count |
| Version History → Labels | "X of Y labels" filtered count |
| Version History → Restore | "X of Y restores" filtered count |
| Version History → Graph | entities / with-dependents / relationships (aggregated graph stats, non-trivially derived) |
| MCP Dashboard | "X of Y items" filtered count |
| Scheduling Dashboard | AlertCount error / Healthy success (conditional) + X of Y jobs |
| Scheduling → Jobs | "X of Y jobs" filtered count |
| SystemDiagnostics | engines / memory (non-trivially derived runtime stats) + redundant with conditional warning variant |
| Testing Dashboard | Conditional `running` variant pill |
| Testing → Review | Conditional `pending` warning |
| Lists → My Lists | "X of Y lists" filtered count |

**Pages with no [meta] (no audit needed):**
Credentials → Overview, AI → Agent Requests, AI → Overview Hub, KH sub-pages without inline counts.

### Task C — `[actions]` ordering convention ⏸ NOT STARTED

**Rule (left → right):**
1. **Secondary controls first** — filter-popover, view-toggle, sort indicator, view-mode selector
2. **Refresh** — always present, always next-to-last when there's a primary CTA
3. **Primary CTA last** — the "+ New X" or "Save" button, filled/brand-color, single per page

Cap at 3 visible controls. If more are needed, overflow into a `⋯` menu.

**Examples (correct):**
- AI Agents: `filter-popover · view-toggle · Refresh · + New Agent`
- KH Configuration: `Reset · Save` (when dirty)
- Lists Browse: `view-toggle · + New List`

**Scope:** any dashboard with 3+ items in `[actions]`. Sweep pass after Task B. Specific list TBD.

## Reference: slot contract recap

These are the rules the audit enforces — not new rules.

| Slot | What goes there | What does NOT |
|---|---|---|
| `[meta]` (under subtitle, identity column) | **State** — non-trivial derived numbers, status badges that demand attention, single hero metrics | Trivial row-counts, page identity, verbs |
| `[actions]` (top row, right edge) | **Verbs** — Refresh, primary CTAs, filter-popover trigger, view-toggle | Tab-nav (use `[toolbar]`), result counts (use `[meta]`) |
| `[toolbar]` (secondary row below identity) | **Controls operating on the data** — search input, filter chips adjacent to search, tab-nav for sub-sections | Dense dropdown filters (use `<mj-filter-popover>` in `[actions]`) |

## Tracking

- Branch: `explorer-shell-subpage-chrome`
- Related: [`plans/explorer-chrome-conventions.md`](explorer-chrome-conventions.md), [`plans/explorer-ia-progress.md`](explorer-ia-progress.md)
- Memory: `feedback_subtabs_in_chrome_toolbar.md` established the Task A rule

## Natural next phase

This audit settles **slot order and content** (where things go, which trivial badges to drop, button ordering). The natural follow-on — **which controls a list page should have at all** — is captured in [`plans/list-page-standardization.md`](list-page-standardization.md). That work is out of scope for the current branch; queued as the next chrome push.
