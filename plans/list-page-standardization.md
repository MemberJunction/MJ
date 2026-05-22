# List Page Standardization

> **Status:** Proposal · drafted 2026-05-20 · **Not started — out of scope for the current `explorer-shell-subpage-chrome` branch.**

> Companion to [`plans/explorer-chrome-conventions.md`](explorer-chrome-conventions.md) and [`plans/chrome-slot-discipline-audit.md`](chrome-slot-discipline-audit.md). This is the natural next phase after the slot-discipline audit settles slot order + content.

## The problem

The chrome slot audit (Task A · tab-nav drift, Task B · `[meta]` discipline, Task C · `[actions]` ordering) standardized **where** controls live and **what order** they appear in. It didn't address **which controls a list page should have at all**.

Each list-of-records page picks à-la-carte:

| Page | Search | Status chips | Filter popover | Sort | View toggle | Refresh | Export | Primary CTA |
|---|---|---|---|---|---|---|---|---|
| Users | ✅ | ✅ | ✅ | — | — | ✅ | ✅ | ✅ |
| Roles | ✅ | ✅ (type) | — | — | — | ✅ | — | ✅ |
| Apps | ✅ | ✅ | — | — | — | ✅ | — | ✅ |
| Entity Permissions | ✅ | ✅ | ✅ | — | ✅ | ✅ | — | — |
| Lists Browse | ✅ | — | ✅ | sort dropdown (in body) | ✅ | — | — | ✅ |
| AI Agents | — | — | ✅ | — | ✅ | — | — | ✅ |
| AI Prompts | — | — | ✅ | — | ✅ | — | — | ✅ |
| Credentials List | ✅ | — | ✅ | — | ✅ | ✅ | — | ✅ |
| Testing Explorer | ✅ | ✅ | — | sort toggle (chrome) | ✅ | — | — | ✅ |
| Action Explorer | ✅ | — | ✅ | sort dropdown (chrome) | ✅ | — | — | ✅ |
| Communication Logs | ✅ | — | ✅ | — | — | ✅ | — | — |

…etc.

This is mostly accidental — different authors, different eras, no contract. Users learn "Users has export but Roles doesn't" and have to remember per page. Search is present on most list pages but missing on a few where it would be useful. Sort patterns vary (sometimes in chrome `[actions]`, sometimes inside filter-popover, sometimes inline in the body, sometimes absent).

## Three levels of intervention

### Level 1 — Documented contract (lightest)

Write down: "A list page has these controls, in this order. Absences must fall into one of these documented exceptions."

* **No new code.** Same shape as the chrome migration sweep.
* **Pro:** Cheap to land. Audit against contract surfaces gaps; per-page judgment fixes them.
* **Con:** No enforcement — new pages can drift again unless reviewers catch it.

### Level 2 — Slot recipe inside existing chrome (moderate)

Keep `<mj-page-header>` / `<mj-page-header-interior>` API. Define a **recipe** — the exact slot contents a list page should project, in order. Provide a snippet / boilerplate template. Pages opt in by following the recipe.

* **Light scaffolding.** Maybe a snippet file or a `<mj-page-header-list-template>` example.
* **Pro:** Discoverable via convention; no API churn.
* **Con:** Still no enforcement; pages can still drift.

### Level 3 — `<mj-list-page>` primitive (most thorough)

New higher-level component that wraps chrome + body for list-of-records pages. Pages declare data + intent, not slot mechanics:

```html
<mj-list-page
  Title="Users"
  Subtitle="Manage user accounts, roles, and access"
  Icon="fa-solid fa-users"
  [SearchValue]="searchTerm"
  (SearchChange)="onSearch($event)"
  SearchPlaceholder="Search users by name or email…"
  [StatusChips]="statusChipOptions"
  [ActiveStatus]="status"
  (StatusChange)="onStatusChange($event)"
  [FilterFields]="filterFields"
  [FilterValues]="filterValues"
  (FilterChange)="onFilterChange($event)"
  [SortOptions]="sortOptions"
  [SortKey]="sortBy"
  (SortChange)="onSortChange($event)"
  [ViewModes]="['card', 'list']"
  [ActiveView]="viewMode"
  (ViewChange)="setViewMode($event)"
  [CanRefresh]="true"
  (Refresh)="refresh()"
  [CanExport]="canExport"
  (Export)="export()"
  [CanCreate]="canCreate"
  CreateLabel="+ Add User"
  (CreateClick)="addUser()">

  <!-- Body: the actual list. Receives [FilteredItems] via template-ref. -->
  @for (user of filteredUsers; track user.ID) { ... }
</mj-list-page>
```

The primitive renders:
* Chrome trio (`<mj-page-header>` + `<mj-page-body>`)
* Search input in `[toolbar]` when `SearchValue` is bound
* Status chips in `[toolbar]` when `StatusChips` provided
* Filter popover in `[actions]` when `FilterFields` provided (auto-merges Sort/Vendor/etc. as additional fields)
* View toggle in `[actions]` when `ViewModes` provided
* Refresh button in `[actions]` when `CanRefresh`
* Export button in `[actions]` when `CanExport`
* Primary CTA in `[actions]` when `CanCreate` (rightmost)
* Standard empty / loading states

Pages get the entire shell from one tag. Standardization is enforced by the API surface — you can't put search in `[actions]` or render it twice.

* **Pro:** Forced consistency; one component to maintain; new pages get standardization for free; ~50% less template boilerplate per page.
* **Con:** Less flexibility; some pages genuinely need custom; migration cost; the API surface gets big.

## Recommended approach

**Level 2 first, with intent to graduate to Level 3 once the contract proves stable.**

Sequence:
1. **Inventory list pages.** Catalog every "list of records" dashboard. Likely 25-35 pages.
2. **Define the contract.** What controls every list page has, what order, what conditional rules apply. Land in `plans/explorer-chrome-conventions.md` as a new section "§11: List-page contract" (or similar).
3. **Audit.** Score every list page against the contract. Produce a fix list.
4. **Migrate à-la-carte.** Fix the gaps page by page. Same shape as Task B.
5. **Decide on Level 3.** Once the contract has held up across the migration sweep, build `<mj-list-page>` and migrate pages onto it. Or decide the recipe alone is enough.

## Pages that should NOT use the list-page contract

Same shape as the existing Section 9 chrome exceptions. Documented opt-outs include:

* **Configuration / form pages** — show one record or a small fixed set; no search/sort needed
* **Workspaces** — Data Explorer, Query Browser, Mapping Workspace, Component Studio — have purpose-built controls that conflict with standard list chrome
* **Hero / landing pages** — Home, AI Overview, KH Search — designed for browsing/launching, not list operations
* **Multi-section parent dashboards with rail-driven content** — AI Analytics, Testing dashboard, Scheduling dashboard, MCP dashboard — the parent is a shell; the per-section views (if they're lists) would use the list-page contract individually
* **Selection-of-context** — KH Clusters' saved-clusters list, Action Explorer's category tree, Credentials Categories' tree-panel — these are selectors, not record lists

## Why this is out of scope for the current branch

* The current branch (`explorer-shell-subpage-chrome`) is closing on Section 10 + slot discipline. Adding list-page standardization mid-flight would balloon the PR.
* The work is large enough to warrant its own branch, plan, and review cycle.
* Some prerequisite work IS landing on this branch (slot conventions, `[meta]` discipline, `[actions]` ordering) — those need to be stable before the list-page contract builds on top of them.

## Open questions to settle when starting

1. **Sort UI canonical pattern.** In filter-popover (AI Analytics Model Performance pattern) vs chrome toggle (Testing Explorer pattern) vs inline column-click in tables. The contract has to pick.
2. **Search debounce default.** What's the standard? 300ms? Configurable?
3. **Empty state.** Should `<mj-list-page>` render a standard empty state when `Items.length === 0`? Or does each page own its empty state?
4. **Loading state.** Standard `<mj-loading>` overlay or per-page custom?
5. **Pagination.** Out of scope for the chrome — or should it be inside the primitive?
6. **Multi-select / batch actions.** Do list pages need a standard selection-state slot? (Currently no page has this; would be a forward-looking addition.)
7. **AG-Grid pages.** Some lists use `<ag-grid-angular>` which has its own toolbar / sort / filter. How does `<mj-list-page>` interact with that?

## Related

* [`plans/explorer-chrome-conventions.md`](explorer-chrome-conventions.md) — current chrome rulebook (§2 slot rules, §9 exceptions)
* [`plans/chrome-slot-discipline-audit.md`](chrome-slot-discipline-audit.md) — Tasks A / B / C — settles slot order + content discipline; prerequisite for this work
* [`plans/explorer-ia-progress.md`](explorer-ia-progress.md) — the migration log this slots into as the next phase
