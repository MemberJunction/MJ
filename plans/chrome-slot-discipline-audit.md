# Chrome Slot Discipline Audit

> **Branch:** `explorer-shell-subpage-chrome` (active) · **Status:** Task A complete; Tasks B + C pending · **Last update:** 2026-05-20

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

### Task B — `[meta]` audit ⏸ NOT STARTED

**Rule:** `[meta]` only takes badges that are:
- **Non-trivially derived** (avg score, total spend, "X of Y healthy", percentage) — data the user can't compute by glancing at the list below
- **Non-default variant** (`Variant="warning"`, `Variant="error"`, `Variant="success"`) — genuine status callouts that need attention
- **A single hero metric** when the page IS that metric

Plain row-counts that equal `.length` of the list below don't belong here. Drop them — the page-search's "of N" sub-count or a `<mj-stat-badge>` at the top of the body carries that information when needed.

**Scope:** every dashboard with `<mj-stat-badge>` in `[meta]`. ~30 pages estimated. Will be done as a sweep after Task A; specific list TBD.

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
