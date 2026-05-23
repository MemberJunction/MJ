# MJ Explorer Chrome Conventions

The canonical rules for laying out page chrome on MJ Explorer dashboards and resource
pages. Apply these when migrating a page to the shared chrome system, when reviewing a
migration, or when designing a new page from scratch.

If a page seems to need an exception, **stop and consult this document** before
inventing a new pattern. Exceptions get added here, not improvised in code.

> **Future work:** see [`plans/list-page-standardization.md`](list-page-standardization.md)
> for the proposal to standardize the **control set** every list-of-records page
> should have (search, sort, filter, refresh, primary CTA). The slot rules in this
> document say *where* a control goes — that proposal addresses *which* controls
> a list page should have at all. Out of scope for the current chrome migration;
> queued as the next phase.

---

## 1. The container

Every migrated page wraps its content in three shared components from
`@memberjunction/ng-ui-components`:

```html
<mj-page-layout>
  <mj-page-header Title="…" Icon="fa-solid fa-…" Subtitle="…">
    <div meta>…</div>
    <div actions>…</div>
    <div toolbar>…</div>
  </mj-page-header>

  <mj-page-body>
    <!-- page content — NEVER another control row -->
  </mj-page-body>
</mj-page-layout>
```

- `<mj-page-layout>` provides the flex-column / full-height / page-background shell.
- `<mj-page-header>` provides the three slots: `[meta]`, `[actions]`, `[toolbar]`.
- `<mj-page-body>` provides the standard padded scroll region (escape hatches:
  `[Padding]="false"`, `[Scroll]="false"`, `[Flex]="true"`).

**Slot wrappers need NO bespoke class.** `<mj-page-header>` has built-in
slot-passthrough — any element projected with the `meta` / `actions` / `toolbar`
attribute automatically gets `display: contents` via an attribute selector in
`page-header.scss`, so its children become direct flex children of the slot row
and inherit the row's gap. Earlier migrations used per-page wrapper classes
(`.X-header-meta { display: contents }`); those are now redundant and were
deleted across all migrated pages.

---

## 2. Slot rules

### `[meta]` — "What am I looking at?"

Read-only context that sits below the subtitle in the identity column.
**Never anything actionable.**

**Decision rule — a badge earns its meta spot when ALL three are true:**

1. **You can't get the info by glancing at the page below.** If the list already
   shows 12 visible rows, a `12 total` badge is noise.
2. **It carries signal, not just inventory.** A user looks at the badge and
   either *acts on it* (Unsaved → Save, Alerts → investigate) or *adjusts their
   mental model* (Hit rate dropped to 65% → something's wrong).
3. **It's worth always-on real estate.** If the user could happily click a
   button to see it, it's not a meta badge — it's a detail panel.

**Four patterns that pass the test:**

| Pattern | Examples | Why it works |
|---|---|---|
| **Status callout with variant** | "Unsaved changes" `warning`, "3 alerts" `error`, "Healthy" `success`, "X running" `running` | Genuine condition the user needs to know about; non-default variant draws the eye |
| **X-of-Y filtered count** | `<mj-stat-badge [Count]="filtered.length" [Total]="all.length" Label="users">` → "8 of 75 users" | Tells the user *how much the filter is narrowing the data* — that's signal at any scale. Earns its spot on every list page that has search or filter UI, regardless of how many rows the page typically holds. Plain `[Count]` without `[Total]` does NOT pass — that's just the visible row count (anti-pattern below). |
| **Non-trivially derived metric** | "Hit rate 92%", "P95 320ms", "Avg score 87%", "Total spend $1,234" | The user couldn't get this by counting rows — it's aggregation across the dataset |
| **Hero metric (single, dominant)** | "Total Users: 2,431" *when there's nothing else and the page IS that count* | A solo headline. Only when the count itself is the point. |

> **Note on rule #1 ("info not visible by glancing"):** that test is for *plain* count badges and other derived metrics, where the threshold depends on how many rows fit on screen. X-of-Y filtered counts are **scale-independent** — they earn their spot whether the list has 2 rows or 2,000.

**Three anti-patterns (drop them):**

| Anti-pattern | What it looks like | Fix |
|---|---|---|
| **Row count = `.length`** (no `[Total]`) | `total: 12` (just `[Count]="filtered.length"`) | Convert to X-of-Y form by adding `[Total]="all.length"` if there's a filter on the page — that *does* pass. If there's no filter to narrow the data, drop. |
| **Partition mirror** | `active: 8 · inactive: 4` next to Active / Inactive filter chips in the toolbar | Drop. The chips already show the split. |
| **Zero clutter** | `inactive: 0` / `owners: 0` perpetually rendering | Drop, or wrap in `@if (count > 0)` so it appears only when relevant. |

**Conditional rendering is encouraged.** Knowledge Hub Configuration's
"Unsaved changes" pill only renders when `HasUnsavedChanges` is true. That's
the gold standard — zero noise when there's nothing to say. Apply `@if`
liberally around badges that aren't always relevant.

**Cap at 3 visible badges.** Past three, the title row reads as a metrics bar
instead of identity. If you genuinely have more derived metrics to surface,
they belong in a body-level KPI strip, not in the chrome.

**Quick test before adding a badge:**
> *If I removed this badge, would a user complain?*
> "They probably wouldn't notice" → drop.
> "They'd lose situational awareness of X" → keep.

✅ Permitted (when the decision rule passes):
- `<mj-stat-badge [Count] [Total]? Label="…" [Variant]?>` (covers both result-count "X of Y label" and status pills via Variant)
- Status pills (Healthy / Alert / Running / Unsaved / Pending review) via `Variant="success|warning|error|running|info"`
- Derived metrics (`avg score 87%`, `hit rate 92%`, `total $1,234`)

❌ Not permitted:
- Buttons, dropdowns, popovers, search, view-toggles
- Anything the user clicks to *change* state
- Trivial counts that mirror visible row count or filter-chip partitions

If you reach for a click target, it belongs in `[actions]` or `[toolbar]`.

### `[actions]` — "What can I change / what do I do?"

Page-level controls and buttons. **Cap: 4 items.** If you need more, consolidate
into a `<mj-filter-popover>` or move secondary state into `[toolbar]`.

**Ordering, left → right:**

1. **State controls** (modify the view): `<mj-filter-popover>`, `<mj-view-toggle>`,
   auto-refresh toggle
2. **Secondary action buttons**: `Refresh`, `Export`
3. **Primary action button** (rightmost): `New X`, `Save`, `Create`

```
[ filter-popover ] [ view-toggle ] | [ Refresh ] | [ New Item ]
   └── state/modifiers ──────────┘ └─ buttons ─┘  └─ primary ─┘
```

Notes:
- Primary-rightmost in page chrome is **intentional** and inverse to dialog footer
  convention (primary-leftmost). Page chrome is exploratory; dialogs are imperative.
- `Refresh` is a button, so it goes **after** view-toggle / filter-popover, not
  before. State-then-action reading flow.
- Only ONE primary action per page. If you have two equally important actions,
  reconsider the design.

### `[toolbar]` — "How do I find what I'm looking at?"

Second row, full width. Filtering and search. **Optional** — pages with no filtering
omit this slot entirely.

**Ordering, left → right:**

1. `<mj-page-search>` — always first if present
2. Quick-filter chips: `<mj-filter-chip>` for time-range, multi-select status, or
   small toggle sets (cap: ~5 chips)
3. Active-filter chips (when filter-popover applies filters → shown here for
   one-click clear)

❌ Not permitted in `[toolbar]`:
- Buttons (Refresh, primary actions) — those go in `[actions]`
- Inline `<select>` dropdowns — use a `<mj-filter-popover>` in `[actions]` instead
- View-toggles — those go in `[actions]`

---

## 3. Filter UI decision tree

When you have a filter that doesn't fit in `[toolbar]` as a chip group, **pick one
control style and stick with it.** Mixed inline `<select>` dropdowns are not
permitted — every page has eventually been retrofitted away from them, so don't
ship new ones.

| Filter cardinality | Filter UI | Slot |
|---|---|---|
| 2–5 multi-select options (e.g., Status: Active/Pending/Disabled) | `<mj-filter-chip>` group | `[toolbar]` |
| Time-range (24h / 7d / 30d / 90d) | `<mj-filter-chip>` group | `[toolbar]` |
| 1 single-select dropdown with ≤10 options | `<mj-filter-popover>` containing `<mj-filter-panel>` with `type: 'dropdown'` | `[actions]` |
| 2+ filters of any kind | `<mj-filter-popover>` containing `<mj-filter-panel>` | `[actions]` |
| Filterable / searchable long list (e.g., Job names) | `<mj-filter-popover>` with `filterable: true` dropdown | `[actions]` |

**Why the popover for multi-filter pages:** keeps `[actions]` from getting crowded.
The popover surfaces an active-count badge, and a `[ShowClearAll]` mechanism for
resetting state.

---

## 4. No second control row inside the body

The page-header IS the chrome. **Do not add a second toolbar / control row inside
`<mj-page-body>`.** This includes:

- Sub-view selectors (e.g., "All / Suites / Tests")
- Sort buttons
- Bespoke search bars
- Secondary filter rows

If you have a sub-view selector, hoist it into `[toolbar]` (as filter-chips) or
`[actions]` (as a second `<mj-view-toggle>`). If you have a sort, put it in
`[actions]` as a small button or dropdown.

**Exception** — Per-row / per-card controls inside body content are fine: status
badges on cards, action buttons inside a card footer, expand/collapse arrows in a
table row. The rule applies to *page-level* control bars, not item-level affordances.

---

## 5. Tabbed-parent vs. standalone

Many sections (Scheduling, Testing, AI, Knowledge Hub) have both:

- A **parent dashboard** with `<mj-tab-nav>` in `[actions]` switching between tab
  contents.
- **Per-tab resource pages** for direct URL navigation to each sub-page.

The pattern:

1. Each inner component (`<app-scheduling-jobs>`, etc.) **owns its own chrome** —
   it renders `<mj-page-layout>` + `<mj-page-header>` + `<mj-page-body>` when used
   standalone.
2. The inner component accepts `@Input() HideToolbar = false`. When `true`, it
   renders content only — no chrome. **Use this exact name** (`HideToolbar`) — do
   **not** invent alternatives like `EmbeddedMode`, `Embedded`, or `HideChrome`.
   The name is narrower than the actual behavior (it suppresses the entire
   `mj-page-layout` + `mj-page-header`, not just a toolbar) but it is the
   cross-section convention and must be consistent so parent shells can pass
   `[HideToolbar]="true"` uniformly regardless of which inner they host.
3. The parent dashboard renders its own shared chrome (tab-nav in `[actions]`, plus
   tab-specific filter chrome from `@switch (ActiveTab)`), and passes
   `[HideToolbar]="true"` to whichever inner is the active tab.
4. The resource wrapper for each inner is a thin shim:
   `template: '<app-scheduling-jobs></app-scheduling-jobs>'` — no chrome of its own.

This way:
- Standalone URLs see clean, self-contained pages.
- The parent tabbed view sees one set of shared chrome plus the inner's body content.
- No duplicated chrome between resource wrapper and inner.

**Known imperfection:** The parent dashboard still uses `@ViewChild` to reach into
the active inner for state needed by its chrome (e.g., `jobsCmp?.SearchTerm`,
`activityCmp?.ActiveFilterCount`). This is acceptable given the tab pattern —
the alternative (event-driven push from inner up) is more code for marginal gain.
Do **not** duplicate the filter-helper getters in both parent and inner; have the
inner own them and have the parent delegate via `@ViewChild`.

---

## 6. Body component

`<mj-page-body>` is the third leg of the chrome stool. It carries the canonical
padded / scrollable recipe so individual pages don't reinvent it.

Defaults:
- `display: block`
- `flex: 1` (grows in `<mj-page-layout>`'s flex column)
- `min-height: 0` (so scroll works)
- `padding: 0 24px 24px`
- `overflow-y: auto`

Escape hatches:
- `[Padding]="false"` — pages whose inner content owns the gutter (File Browser,
  AI Analytics shell sitting flush against the header).
- `[Flex]="true"` — pages whose main content area uses `flex: 1` to fill remaining
  height (e.g., banner-above-content layouts like Testing Dashboard parent, Test
  Explorer's sidebar+main layout).

**Note on overflow:** `mj-page-body` always has `overflow-y: auto` and this is
not configurable. `mj-page-layout` already has `overflow: hidden`, so if the
body didn't scroll, any overflow would be silently clipped. Pages with
split-pane layouts whose children manage their own scroll regions should use
`min-height: 0` + `flex: 1` on the inner panes — nothing overflows the body and
the body's `auto` stays harmlessly inactive.

**Never** inline the `flex: 1; min-height: 0; padding: 0 24px 24px; overflow-y: auto`
recipe in a per-page CSS file. Use `<mj-page-body>`.

---

## 7. Naming & wiring conventions

### Inner component `HideToolbar` gate

Inner components of tab-parent shells expose `@Input() HideToolbar = false`. When
the parent embeds them (passing `[HideToolbar]="true"`), the inner renders only
its body content — the parent owns the chrome. When accessed standalone (default
`HideToolbar=false`), the inner renders its full chrome.

The standard pattern:

```html
@if (HideToolbar) {
  <ng-container *ngTemplateOutlet="content"></ng-container>
} @else {
  <mj-page-layout>
    <mj-page-header …>…</mj-page-header>
    <mj-page-body>
      <ng-container *ngTemplateOutlet="content"></ng-container>
    </mj-page-body>
  </mj-page-layout>
}

<ng-template #content>
  <!-- actual page content (unchanged regardless of HideToolbar) -->
</ng-template>
```

The `<ng-template #content>` + `*ngTemplateOutlet` avoids duplicating the body
markup. Verbose, but direct — no abstraction layer hiding the chrome elements.

### Filter helpers (where filters exist on a page)

On the inner component (single source of truth — parent delegates via @ViewChild):

```typescript
public get XYZFilterFields(): FilterFieldConfig[] { … }
public get XYZFilterValues(): Record<string, unknown> { … }
public get ActiveFilterCount(): number { … }
public OnFilterValuesChange(values: Record<string, unknown>): void { … }
public ResetFilters(): void { … }
```

These get bound to `<mj-filter-popover>` + `<mj-filter-panel>` like so:

```html
<mj-filter-popover
  [ActiveCount]="ActiveFilterCount"
  [ShowClearAll]="ActiveFilterCount > 0"
  (ClearAllRequested)="ResetFilters()">
  <mj-filter-panel
    [Fields]="XYZFilterFields"
    [Values]="XYZFilterValues"
    (ValuesChange)="OnFilterValuesChange($event)"
    (Reset)="ResetFilters()">
  </mj-filter-panel>
</mj-filter-popover>
```

### Required module imports

For any page using the chrome:

```typescript
import {
  MJButtonDirective,
  MJPageHeaderComponent,
  MJPageLayoutComponent,
  MJPageBodyComponent,
  MJPageSearchComponent,        // if [toolbar] has search
  MJStatBadgeComponent,          // for [meta] counts/badges — supports Count, Total, Label, Icon, Variant (absorbed mj-result-count)
  MJRefreshButtonComponent,      // if [actions] has a Refresh button
  MJFilterChipComponent,         // if filter chips used
  MJFilterPopoverComponent,      // if filter popover used
  MJFilterPanelComponent,        // if filter popover used
  MJViewToggleComponent,         // if view-toggle used
  MJTabNavComponent              // if parent dashboard with tabs
} from '@memberjunction/ng-ui-components';
```

---

## 8. Open / TBD

Things this document does NOT yet take a position on — flag here when you hit them:

- **`<mj-view-toggle>` in `[actions]` vs. `[toolbar]`**: Currently `[actions]`. If a
  pattern emerges where `[actions]` overflows, we may need to relocate.
- **Multi-select dropdowns in filter-popover**: `<mj-filter-panel>` currently
  supports single-select dropdowns. If we hit a case where the filter is genuinely
  multi-select and won't fit as chips (>5 options), add a new field type to
  filter-field rather than improvising.
- **Sort UI**: No canonical control yet. Most pages either don't sort, or sort via
  table headers. If a card-grid page needs explicit sort UI, the choice between
  small button + cycling label vs. dropdown vs. chip group is undecided.

- **Row-direction bodies** (sidebar + content layouts): `<mj-page-body>` is
  flex-column by default. Pages like AI Analytics that use a left-nav-plus-content
  layout need flex-row instead. Today those keep a bespoke wrapper (`.analytics-shell`
  in the analytics resource). If this pattern repeats (Knowledge Hub Analytics,
  Vectors, etc. may have it), add a `[Direction]="row"` input to `mj-page-body`.

## 9. Documented exceptions

The following pages do NOT use the standard `<mj-page-layout>` chrome — either
because their layout is intentionally different (single-page exceptions) or
because they're deferred pending the Section 10 decision (shell-with-left-nav
sub-pages). Add to this list rather than improvising new exceptions in code.

### 9a. Single-page exceptions (intentionally different chrome)

| Page | Driver class | Reason |
|---|---|---|
| **AI Overview hub** | `AIMonitorResource` | Hero-landing layout: large brand icon + hero typography + stats strip + card grid. No `<mj-page-header>` — the title IS the hero. |
| **AI Analytics body** | `AIAnalyticsResource` | Uses standard chrome correctly, but its body is a sidebar+content (flex-row) layout kept in a bespoke `.analytics-shell` wrapper until `mj-page-body` gains a row-direction mode. The shared `FilterBarConfig` drives per-section filter UI for every section including Model Performance (which contributes SortBy + Vendor filters to the popover). |
| **Home** | `HomeDashboard` | Right-sidebar dashboard with Quick Access / Notifications / Favorites / Recents — purpose-built landing layout. |
| **Component Studio** | (no nav items) | Toolbar-driven authoring shell — top toolbar + togglable left browser + right AI pane. |
| **Data Explorer** | `DataExplorerResource` | Workspace with animated auto-hiding nav + dual right panels. |
| **Query Browser** | `QueryBrowserResource` | Resizable left tree panel + content. Workspace pattern shared with Data Explorer. |

### 9b. Shell-with-left-nav sub-pages — see Section 10 for the pattern

**The rule:** if a page is dynamically loaded into another resource's left-nav
shell (i.e. a parent shell renders it into its content area via
`ViewContainerRef` or equivalent), do **NOT** wrap it in `<mj-page-layout>` /
`<mj-page-header>` / `<mj-page-body>`. The parent shell already owns the page
chrome; adding it again produces a doubled-header that has been twice rejected
in user testing.

**Use the interior filter card pattern instead** — see Section 10 for the full
contract, template, and styles. Reference implementation:
`UserManagementComponent` (migrated 2026-05-19). Sub-pages that haven't been
migrated yet still use the local `.sticky-header` pattern; they'll be moved to
the filter card pattern in subsequent passes (see Section 11 progress).

The rule does **NOT** apply to pages that merely have an internal left-rail of
their own (Knowledge Hub Tags / Classify / Clusters, AI Analytics' outer
shell, etc.) — those get the standard outer chrome wrapped around a
`[Flex]="true" [Padding]="false"` body. The distinguishing factor is "loaded
into someone else's shell" vs. "has its own rail."

| Sub-page group | Where it lives | Status |
|---|---|---|
| The 5 **explorer-settings** components — `UserManagementComponent`, `RoleManagementComponent`, `ApplicationManagementComponent`, `EntityPermissionsComponent`, `SqlLoggingComponent` (in `@memberjunction/ng-explorer-settings`) | Loaded into Admin's `admin-container` via `ViewContainerRef` based on left-nav selection | **Do NOT migrate piecemeal.** Two attempts have been reverted (the second on 2026-05-15). They will be migrated together once Section 10 picks a pattern. |
| `ApplicationRolesResource`, `SystemDiagnosticsResource` (in `@memberjunction/ng-dashboards`) | Loaded into Admin shells (`admin-identity-access`, `admin-monitoring`) via `kind: 'resource'` | Use the bespoke `.sticky-header` / `.scrollable-content` pattern (matches the 5 explorer-settings components above). `<mj-stat-badge>` and `<mj-refresh-button>` are still used inside the sticky header — they're chrome *primitives*, not the chrome *frame*. |
| **APIKeys app** — internal Keys / Applications / Scopes / Usage Analytics tabs | One resource component with its own internal left-nav | Same deferral. Note: APIKeys is *structurally different* — its own nested left-nav means it doesn't fit the "embed me in a shell" pattern even with a Section 10 fix. May need promotion to Section 9a (workspace exception) when Section 10 lands. |
| **Knowledge Hub Configuration** internal sections | Inline `@if`-switched templates inside the parent component | Only one header total today, so no migration debt. |
| **AI Analytics** sub-sections (Executive Summary / Prompt Runs / Agent Runs / Model Performance / Cost & Budget / Error Analysis / Usage Patterns) | Inline components inside `<app-ai-analytics-resource>`, no own `<mj-page-header>` | The shell projects per-section filter chrome via `FilterBarConfig`. Pattern used as a candidate solution for the broader Section 10 question. |

**Adjacent pages that are NOT exceptions:**
- `DatabaseDesignerDashboard` — loaded inside `admin-data-schema` but already renders no `<mj-page-header>` (its body is a slide-panel workspace), so the doubled-header problem doesn't apply.
- `EntityAdmin` — registered as a top-level dashboard in the Admin app's metadata, NOT loaded inside any left-nav shell. Standard chrome is correct here.

---

## 10. Interior filter card for left-nav sub-pages

**Status: ACTIVE — resolved 2026-05-19.** Reference implementation:
`packages/Angular/Explorer/explorer-settings/src/lib/user-management/`.

When a sub-page is dynamically loaded into a parent left-nav shell (e.g. Admin's
`admin-container` rendering `UserManagementComponent`), it follows the
**interior filter card** pattern. The parent shell owns the page-level chrome;
the sub-page renders a single white "filter card" at the top of its body
containing its own search / filters / action buttons.

### The contract

- **Parent shell `<mj-page-header>` stays fixed.** Title / Icon / Subtitle come
  from the Admin container (e.g. "Identity & Access"). It's the page identity
  and does NOT change when the user clicks rail items.
- **Sub-page does NOT render its own `<mj-page-header>`.** No nested chrome
  trio. The doubled-header problem is eliminated structurally.
- **Sub-page does NOT wrap itself in a bespoke container `<div>`.** The host
  element already has `display: flex; flex-direction: column; height: 100%;
  overflow: hidden` from `_admin-patterns.css`'s `:host` rule (or equivalent).
  Children of the sub-page render directly on the host — no `<div class="{name}-container">` wrapper.
- **Sub-page renders `<mj-page-header-interior>` at the top of its body** —
  the shared body-level chrome card from `@memberjunction/ng-ui-components`,
  the sibling component to `<mj-page-header>`. Two-row layout (primary row +
  optional toolbar row). Same slot conventions (`[meta]` / `[actions]` / `[toolbar]`);
  different visual shape — a self-contained card with surface background,
  radius, and shadow.
- **Sub-page sets `[Title]` and `[Subtitle]` on the chrome card** to anchor the
  page identity on the left of the primary row. The Admin shell's left rail
  shows which sub-page is active, but a small in-chrome identity block (e.g.
  "App State Inspector" / "Read-only snapshot of Explorer runtime state") gives
  the user an explicit "what am I looking at?" cue and explains the page's
  purpose. Subtitle is especially valuable for technical pages whose role
  isn't obvious from the rail label alone (Dev Tools inspectors are the
  canonical case).
- **The sub-page renders exactly one root element below the chrome.**
  `<mj-left-nav-content>`'s CSS sizes its first projected child via
  `:host ::ng-deep > *:not(error):not(loading)`. Sub-pages that project
  multiple top-level siblings will get unexpected sizing on each one. Wrap
  body content in a single container element (a `<div>` works) if you have
  more than the chrome card + content list as siblings.
- **Same shared components everywhere.** The interior chrome uses the same
  `<mj-page-search>` / `<mj-filter-popover>` / `<mj-filter-panel>` /
  `<mj-refresh-button>` / `mjButton` primitives the exterior chrome uses.
  One chrome contract, two surfaces (header band for top-level pages,
  `<mj-page-header-interior>` for shell sub-pages).

### Interior chrome layout

Two-row card. The primary row holds identity + state + actions; the toolbar
row holds dense controls that would compete with the title for horizontal
space if they shared a row. The toolbar row collapses entirely (`:empty`) on
pages with no toolbar content (e.g. Dev Tools inspectors, SQL Logging).

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Title              [—— spacer ——]                  [meta]    [actions]   │
│  subtitle                                                                 │
├──────────────────────────────────────────────────────────────────────────┤
│ [ 🔍 search …… ] [chip:All|Active|Inactive] / [mj-tab-nav]                │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Primary row** — `[Title]` + `[Subtitle]` on the left, then spacer, then
  `[meta]` slot (stat badges / counts), then `[actions]` slot on the right
  edge.
- **Toolbar row** — `[toolbar]` slot, full-width second row separated by a
  subtle border-top. Hosts `<mj-page-search>` + visible `<mj-filter-chip>`
  group, OR `<mj-tab-nav>` for L2 section navigation (e.g. SystemDiagnostics'
  4 sections, API Keys' 4 tabs), OR view toggles.
- **`[meta]` slot** — between the spacer and `[actions]` — stat badges /
  result counts. Often empty for sub-pages whose stats live in a separate
  body grid.
- **`[actions]` slot** — right edge of the primary row: `<mj-filter-popover>`
  for advanced filters, `<mj-refresh-button>`, secondary `mjButton`s (Export,
  Copy, etc.), then the primary CTA (`+ New X`) rightmost.

The two-row layout matches the top-level `<mj-page-header>` shape so the
design vocabulary is consistent across both chrome surfaces.

### Standard template

```html
<mj-page-header-interior
  AriaLabel="Filter users"
  Title="Users"
  Subtitle="Manage user accounts, roles, and access">
  <div meta>
    <!-- Compact stat badges next to the title — counts/state. Replace any
         body-level .mj-grid-4 KPI card grid with these. Plain counts use
         the default variant; variants are reserved for genuine state
         (success/warning/error/running/info). -->
    <mj-stat-badge [Count]="stats.totalUsers" Label="total" />
    <mj-stat-badge [Count]="stats.activeUsers" Label="active" />
    <mj-stat-badge [Count]="stats.adminUsers" Label="owners" />
  </div>
  <div toolbar>
    <mj-page-search
      Placeholder="Search users by name or email..."
      [Value]="filters$.value.search"
      (ValueChange)="updateFilter({ search: $event })">
    </mj-page-search>
    <div class="status-chips" role="group" aria-label="Filter by status">
      <mj-filter-chip Label="All"      [Active]="filters$.value.status === 'all'"      (Clicked)="onStatusFilterChange('all')" />
      <mj-filter-chip Label="Active"   [Active]="filters$.value.status === 'active'"   (Clicked)="onStatusFilterChange('active')" />
      <mj-filter-chip Label="Inactive" [Active]="filters$.value.status === 'inactive'" (Clicked)="onStatusFilterChange('inactive')" />
    </div>
  </div>
  <div actions>
    <mj-filter-popover
      [ActiveCount]="popoverActiveFilterCount"
      [ShowClearAll]="popoverActiveFilterCount > 0"
      (ClearAllRequested)="onFilterPanelChange({ role: '' })">
      <mj-filter-panel
        [Fields]="filterFields"
        [Values]="filterValues"
        (ValuesChange)="onFilterPanelChange($event)"
        (Reset)="onFilterPanelChange({ role: '' })">
      </mj-filter-panel>
    </mj-filter-popover>
    <mj-refresh-button [Loading]="isLoading" (Clicked)="refreshData()" />
    <button mjButton variant="secondary" size="sm" (click)="exportUsers()">
      <i class="fa-solid fa-download"></i> Export
    </button>
    <button mjButton variant="primary" size="sm" (click)="createNew()">
      <i class="fa-solid fa-plus"></i> Add User
    </button>
  </div>
</mj-page-header-interior>

<mj-page-body-interior>
  <!-- Below the chrome card: bulk-action toolbar (contextual), scrollable list.
       The body-interior primitive owns flex/scroll/padding/background — no
       bespoke wrapper CSS needed. -->
</mj-page-body-interior>
```

The chrome card's surface, padding, margin, radius, and shadow are owned by
`<mj-page-header-interior>` itself — sub-pages don't need a `.filter-card`
or any bespoke wrapper styles. Pass `[AriaLabel]` to make the card a labeled
landmark for assistive tech; `Role` defaults to `'search'` (override or pass
`null` for non-filter chrome). Identity typography matches `<mj-page-header>`
exactly — title `--mj-text-xl` / `--mj-font-semibold`, subtitle `--mj-text-sm` /
`--mj-text-secondary`. Stat-badges in `[meta]` render at default size, identical
to the exterior chrome.

### `<mj-page-body-interior>` — the paired body primitive

Sub-pages that need a scrollable body region below the chrome card use
`<mj-page-body-interior>` rather than rolling a bespoke `<div class="scrollable-content">`
or similar. It owns:

- `flex: 1` so it fills the space below the chrome
- `overflow-y: auto` (the host typically has `overflow: hidden`)
- Responsive padding — 16px / 24px / 32px at the 768px and 1024px breakpoints
- `--mj-bg-page` background — matches `<mj-left-nav-content>`'s background so
  the body blends with its parent shell context

Inputs (all optional, sensible defaults):

| Input | Type | Default | When to override |
|---|---|---|---|
| `[Padding]` | boolean | `true` | Pass `false` if your inner content owns its own gutters (e.g. an entity list whose rows have their own margins) |
| `[Flex]` | boolean | `false` | Pass `true` to switch the body to a flex container so children with `flex: 1` can fill remaining space |
| `[Direction]` | `'row' \| 'column'` | `'column'` | When `Flex=true`, controls flex direction. Use `'row'` for sidebar + content sub-page layouts |

Background is fixed to `--mj-bg-page` (no `Tone` input). The interior chrome's
own surface + shadow provides the visual delineation between chrome and body —
no second background tone needed.

### `[Title]` and `[Subtitle]` — what to set

| Page type | Title | Subtitle | Why |
|---|---|---|---|
| Sub-page with self-evident purpose (Users, Roles, Apps) | Match the rail label ("Users") | Short prose explaining the page ("Manage user accounts, roles, and access") | Subtitle adds the value; title gives the chrome a visual anchor. |
| Sub-page with technical purpose (Dev Tools inspectors) | Full descriptive name ("App State Inspector") | The original inspector's `header-sub` text ("Read-only snapshot of Explorer runtime state") | Subtitle is essential — the rail's short label doesn't explain what the tool does. |
| Sub-page that's a Pattern X shell with internal tab nav (SystemDiagnostics, API Keys) | Page-level identity or per-tab dynamic title (e.g. `[Title]="currentTabTitle"`) | Per-tab subtitle that changes with the active tab | Title can stay fixed or swap per tab — both are valid; consistency within the page matters more than across pages. |
| Sub-page used as a chrome-less action band (rare) | omit | omit | The card collapses to a single row of actions. Reserved for cases where the rail context is sufficient AND there's no toolbar content. |

The Title is rarely truly redundant with the rail — even when the same word
appears in both, the in-chrome Title gives the body a visual anchor that the
narrow rail label doesn't provide. Default to setting both.

### Migration recipe — bespoke sub-page → interior chrome

For each sub-page being migrated to the interior chrome pattern, this is the
mechanical recipe. Most pages take under 15 minutes once you've done one or
two.

**1. Replace the page-level chrome (if present).**
- If the sub-page wraps itself in `<mj-page-layout>` + `<mj-page-header>` —
  REMOVE that. It produces the doubled-header inside the parent shell.
- Replace with `<mj-page-header-interior Title="..." Subtitle="...">` as the
  first child below the host. Forward existing `[meta]` / `[actions]` /
  `[toolbar]` slot content verbatim — the slot names are identical.
- If the sub-page had a bespoke `.sticky-header` or `.{page}-header` action
  row, lift the actions into `<div actions>` and drop the bespoke wrapper.

**2. Collapse KPI card grids into `[meta]` stat-badges.**
- Sub-pages that have a `<div class="mj-grid-4">` (or similar) showing 3–4
  big KPI cards above the body: replace the entire grid with compact
  `<mj-stat-badge>` instances inside the chrome's `[meta]` slot.
- Drop redundant stats. If `inactive = total - active` or `active = total`
  (hardcoded), drop the redundant one. Keep stats that convey distinct
  information.
- **Variants signal state, not category.** Plain record counts ("12 users",
  "8 roles", "3 entities") have NO state and should use the default variant.
  Reserve `'success'` / `'warning'` / `'error'` / `'running'` / `'info'` for
  badges that genuinely convey a status:
  - `'success'` — "3 healthy nodes", "All clear", a green-light indicator
  - `'warning'` — "5 expiring soon", "Unsaved changes", needs attention
  - `'error'` — "2 failed jobs", broken state
  - `'running'` — "3 active runs", in-progress state
  - `'info'` — informational accent for a truly distinctive piece of info
  - default — every other count
  Coloring counts arbitrarily for visual variety dilutes the semantic
  signal everywhere else. If you find yourself reaching for a variant just
  to add color, use default instead.

```html
<!-- BEFORE: 4 large KPI cards between chrome and scrollable body -->
<div class="mj-grid-4" role="region" aria-label="Role statistics">
  <div class="mj-card">… {{ stats.totalRoles }} Total Roles …</div>
  <div class="mj-card">… {{ stats.systemRoles }} System …</div>
  <div class="mj-card">… {{ stats.customRoles }} Custom …</div>
  <div class="mj-card">… {{ stats.activeRoles }} Active …</div>  <!-- redundant — equals totalRoles -->
</div>

<!-- AFTER: 3 compact badges next to the title -->
<mj-page-header-interior Title="Roles" …>
  <div meta>
    <mj-stat-badge [Count]="stats.totalRoles" Label="total" />
    <mj-stat-badge [Count]="stats.systemRoles" Label="system" Variant="info" />
    <mj-stat-badge [Count]="stats.customRoles" Label="custom" />
  </div>
  …
</mj-page-header-interior>
```

**3. Replace the body wrapper with `<mj-page-body-interior>`.**
- Find the sub-page's body wrapper — most commonly `<div class="scrollable-content">`
  (from `_admin-patterns.css` or a per-page rule). Sometimes it's a custom
  class like `.dashboard-content`.
- Replace the opening tag with `<mj-page-body-interior>`. Replace the closing
  `</div>` with `</mj-page-body-interior>`.
- If the body's inner content owns its own padding (e.g. an entity list whose
  rows have margins, or content with `padding: 24px` baked into a child),
  pass `[Padding]="false"` to disable the body's responsive gutter.
- If the body needs to be a flex container (sidebar + content sub-page
  layouts), pass `[Flex]="true"` + `[Direction]="'row'"`.

**Exception** — pages whose body is a **purpose-built flex container** hosting
a non-scrolling primary widget (code editor, full-canvas visualization,
split-pane workspace) do NOT need `<mj-page-body-interior>`. Examples: the 7
Dev Tools inspectors share an `.mj-inspector__content` flex shell from
`inspector-shared.css` that hosts a section header + `<mj-code-editor>` filling
the remaining height. The editor manages its own scrolling, so a body primitive
that adds `overflow-y: auto` would be redundant. Pattern indicator: the body's
purpose is "fill the available space with one widget that owns its own
overflow," not "render a list/grid that scrolls vertically."

**4. Drop the bespoke body CSS.**
- Delete the per-page `:host { display: flex; flex-direction: column; ... }`
  rule if it exists. The host-level layout is still owned by the consumer (a
  shared `_admin-patterns.css` provides it for explorer-settings; other
  packages declare it inline).
- Delete the per-page `.scrollable-content { flex: 1; overflow-y: auto; ... }`
  rule — `<mj-page-body-interior>` owns this.
- Delete the per-page `.mj-grid-4` / stat-card CSS if the stats moved to
  `[meta]` and no other element on the page uses those classes.

**5. Register the new primitives in your feature module.**
- Add `MJPageHeaderInteriorComponent`, `MJPageBodyInteriorComponent`, and
  `MJStatBadgeComponent` (if not already there) to your module's `imports`
  array — all three are standalone components.

**6. Build + verify.**
- `cd packages/Angular/Explorer/{your-package} && npm run build` to verify the
  templates compile.
- Refresh the browser and inspect: chrome card should have title + subtitle +
  badges next to title, actions on the right, toolbar (if used) on a second
  row. Body should scroll independently, background matches
  `<mj-left-nav-content>` (page tone), no doubled-header anywhere.

### Sub-tabs / nested navigation — always project into the chrome `[toolbar]` slot

When a section inside a multi-section workspace has its own **horizontal
sub-tab strip** (e.g. Tags' Taxonomy section: Tree View / Duplicates / Orphans /
Treemap / Audit Log; SystemDiagnostics' L2 sections; API Keys' tab strip), that
sub-tab nav is **chrome**, not content. It goes in the parent chrome's
`[toolbar]` slot, gated on the active section so it only renders when that
section is rendered.

```html
<mj-page-header-interior [Title]="currentTabTitle" [Subtitle]="currentTabSubtitle">
  @if (ActiveTab === 'taxonomy') {
    <div toolbar>
      <mj-tab-nav
          [Tabs]="taxSubTabsConfig"
          [ActiveKey]="TaxSubTab"
          (TabChange)="onTaxSubTabChange($event)">
      </mj-tab-nav>
    </div>
  }
  <div actions>
    @switch (ActiveTab) {
      @case ('taxonomy') {
        <button mjButton variant="secondary" size="sm" (click)="RefreshTaxonomyData()">
          <i class="fa-solid fa-arrows-rotate"></i> Refresh
        </button>
      }
      ...
    }
  </div>
</mj-page-header-interior>

<mj-page-body-interior [Padding]="false" [Flex]="true">
  @if (ActiveTab === 'taxonomy') {
    <!-- section body content only — NO inline <mj-tab-nav>, NO inline title -->
    @if (TaxSubTab === 'tree') { ... }
    @if (TaxSubTab === 'duplicates') { ... }
    ...
  }
</mj-page-body-interior>
```

This produces the canonical two-row interior chrome card:

```
┌───────────────────────────────────────────────────────────────┐
│ Taxonomy Governance  [meta]            [Refresh]              │  ← primary row
│  Manage tag hierarchy, resolve duplicates ...                  │
├───────────────────────────────────────────────────────────────┤
│ [Tree View] [Duplicates (3)] [Orphans (1)] [Treemap] [Audit]  │  ← toolbar row
└───────────────────────────────────────────────────────────────┘
[ body content for the active sub-tab ]
```

**Reference implementations:** SystemDiagnostics (4 L2 sections in `[toolbar]`),
API Keys (4 tabs in `[toolbar]`), Tags + Classify (Taxonomy sub-tabs in
`[toolbar]`, gated on `ActiveTab === 'taxonomy'`).

**Anti-pattern:** rendering `<mj-tab-nav>` as a free-floating element above the
body content, outside the chrome. That breaks the canonical card shape and
inconsistently positions nav chrome between the two surfaces (chrome card vs
body region). Heuristic check before placing any `<mj-tab-nav>`: *is this nav
chrome (selecting between siblings) or content (the thing being navigated
to)?* If chrome → `[toolbar]` slot. If content → body. The horizontal tab
strip is **almost always** chrome.

**TabConfig + state badges:** `<mj-tab-nav>` supports per-tab badges via the
`TabConfig.badge` field (number or string) with optional `badgeVariant`
(`'default' | 'error' | 'warning' | 'success'`). Use this for the same kind of
contextual count the bespoke strips often carry (e.g. Duplicates count in
warning, Orphans count in error). Drive badges off a getter so they update
reactively when the underlying counts change.

### Per-section slot population — gate the slot wrapper with `@if`, not just `@switch` inside it

A common mistake when wiring per-section `[toolbar]` content is:

```html
<!-- ❌ ANTI-PATTERN: empty toolbar wrapper still renders, producing a phantom row -->
<mj-page-header-interior ...>
  <div toolbar>
    @switch (ActiveTab) {
      @case ('tags')     { <input class="at-search-input" ... /> }
      @case ('taxonomy') { <mj-tab-nav ... /> }
    }
  </div>
  ...
</mj-page-header-interior>
```

For tabs where `@switch` has no matching case, the `<div toolbar>` wrapper is
STILL projected into the chrome (it has the `[toolbar]` attribute). The chrome
sees a non-empty `[toolbar]` slot and renders the toolbar row + its
border-top divider, producing a dangling empty band.

**The correct pattern is to gate the entire `<div toolbar>` projection with
`@if`** so the wrapper isn't projected at all when nothing inside it would
render:

```html
<!-- ✅ CORRECT: <div toolbar> only projected when one of its @switch cases matches -->
<mj-page-header-interior ...>
  @if (ActiveTab === 'tags' || ActiveTab === 'taxonomy') {
    <div toolbar>
      @switch (ActiveTab) {
        @case ('tags')     { <input class="at-search-input" ... /> }
        @case ('taxonomy') { <mj-tab-nav ... /> }
      }
    </div>
  }
  ...
</mj-page-header-interior>
```

Both layers protect against the phantom row:

- **Consumer level** (preferred for readability) — the `@if` makes the gating
  explicit at the call site. A reader sees exactly which sections render
  toolbar content.
- **Primitive level** — `<mj-page-header-interior>` collapses the toolbar
  row via `:host ::ng-deep .row:not(:has(> [toolbar]:has(*)))` — the row is
  hidden unless a `[toolbar]` direct child exists AND has its own descendant
  elements. `::ng-deep` is required because the projected `[toolbar]`
  wrapper carries the consumer's view-encapsulation scope, not ours — a
  scoped `[toolbar]` selector would never match the projected wrapper. The
  selector covers (a) no projection at all (more robust than `:empty`
  because `:has(*)` ignores stray template whitespace), and (b) the
  projected-but-empty case where the consumer's `@switch` had no matching
  case. Safety net for consumers who forget the `@if`.

The same rule applies to `[meta]` / `[actions]` slots if you ever wire them
with a `@switch`: gate the projection wrapper itself with `@if`, don't just
put the `@switch` inside an always-projected wrapper.

### Filter controls — follow Section 3's decision tree

When a section needs to filter its content, place the controls per Section 3
rules, applied to the chrome card:

| Filter shape | Where it goes |
|---|---|
| Free text — search | `<mj-page-search>` in `[toolbar]` slot |
| Quick toggle, 2–4 single-select values (Status, Time Range) | `<mj-filter-chip>` group in `[toolbar]` slot |
| Many values, single-select (Role, Model, Source) | `<mj-filter-popover>` + `<mj-filter-panel>` with `type: 'dropdown'` field, in `[actions]` slot |
| Many values, multi-select (Tags, Categories) | `<mj-filter-popover>` + `<mj-filter-panel>` with `type: 'chips'` field, in `[actions]` slot |
| Two-or-more independent filters on the same section | Put ALL of them into ONE `<mj-filter-popover>` panel with multiple `FilterFieldConfig` entries. Do NOT scatter bare `<select>` elements across the chrome. |

**Reference for multi-filter popover:** Classify's Run History section bundles
its Source + Status filters into a single `<mj-filter-popover>` driven by a
`historyFilterFields: FilterFieldConfig[]` getter, a `historyFilterValues`
getter, and `onHistoryFilterChange` / `onHistoryFilterReset` handlers. The
popover's `[ActiveCount]` badge surfaces the count of currently-applied
filters. Copy this when migrating any other multi-filter section.

**Anti-pattern:** bare `<select class="some-filter-select">` elements lined up
in `[actions]` or `[toolbar]`. They lose the active-count badge, the clear-all
affordance, and the consistent popover surface used everywhere else in the app.

### Filter UI decisions inside the chrome card

Same decision tree as Section 3, applied to `<mj-page-header-interior>`:

| Filter shape | Where it goes |
|---|---|
| Quick toggle, 2–4 values, single-select (Status, Time Range) | Visible `<mj-filter-chip>` group on the LEFT, after search |
| Many values, single-select (Role, Model) | Inside `<mj-filter-popover>` → `<mj-filter-panel>` with `type: 'dropdown'` |
| Many values, multi-select (Tags, Categories) | Inside `<mj-filter-popover>` → `<mj-filter-panel>` with `type: 'chips'` |
| Free text | Always `<mj-page-search>`, left side. Never in popover. |

The popover's `ActiveCount` badge counts **only** popover-resident filters —
visible chips track their own state and don't ghost the badge.

### TypeScript: filter panel binding

```typescript
public get filterFields(): FilterFieldConfig[] {
  return [{
    key: 'role',
    type: 'dropdown',
    label: 'Role',
    placeholder: 'All Roles',
    filterable: this.roles.length > 10,
    options: [
      { text: 'All Roles', value: '' },
      ...this.roles.map(r => ({ text: r.Name ?? '', value: r.ID }))
    ]
  }];
}

public get filterValues(): Record<string, unknown> {
  return { role: this.filters$.value.role };
}

public get popoverActiveFilterCount(): number {
  return this.filters$.value.role !== '' ? 1 : 0;
}

public onFilterPanelChange(values: Record<string, unknown>): void {
  const role = (values['role'] as string) ?? '';
  this.filters$.next({ ...this.filters$.value, role });
}
```

### Button styling

Buttons inside `<mj-page-header-interior>` follow the same rule as buttons everywhere else in MJ Explorer — they're styled by the `mjButton` directive's global `button.scss`, not by any component-scoped CSS. The chrome doesn't need an internal `.mj-btn` reset, and sub-pages don't need any targeted overrides.

See **[Button Styling: Don't Override `.mj-btn` in Component CSS](../packages/Angular/CLAUDE.md#-button-styling-dont-override-mj-btn-in-component-css-)** in the Angular guide for the principle and the anti-patterns.

When migrating a sub-page that has bespoke `.mj-btn` overrides or legacy single-dash classes (`mj-btn-primary`, `mj-btn-icon-mobile`, etc.), strip them. Buttons render correctly from the directive's inputs alone.

### Patterns explored and rejected

| Pattern | Verdict |
|---|---|
| **Header projection** — sub-page exposes `MetaTemplate` / `ActionsTemplate` / `ToolbarTemplate` via an `ISubpageChrome` interface, shell `*ngTemplateOutlet`s them into its own header slots | Tried 2026-05-19; abandoned. Couples each sub-page to a shell-specific contract; can't render the same component standalone; complex `@ViewChild`/CD lifecycle. |
| **Collapsing shell header** — when a section is active, the shell's `<mj-page-header>` hides; the sub-page's chrome becomes primary | Not pursued — loses page-level identity, defeats the "page identity stays fixed" principle. |
| **Compact breadcrumb shell** — replace the shell's full header with a thin breadcrumb row | Same problem as collapsing — parent identity gets buried. |
| **Workspace exception** — each sub-page keeps its own full chrome trio | Produces the doubled-header pattern; twice rejected in user testing (2026-05-15, earlier). |
| **Single-row interior card** (initial 2026-05-19 shape) | First-pass shape — `[toolbar]` content (search, tab-nav) shared a row with title/subtitle. Worked for action-only chromes but cramped when toolbar carried search or tab-nav. Replaced with two-row layout (current). |
| **Interior filter card, two-row (CURRENT)** | Adopted. Shell chrome stays fixed = stable page identity. Sub-page's controls live in a single clean two-row card inside the body — identity + actions on top, search/tabs/filters on a clean second row. Mirrors `<mj-page-header>`'s shape so the design vocabulary is consistent across both surfaces. |

### Reference implementations

The interior chrome pattern is proven across all four Admin shells (~15
sub-pages). Copy any of these when migrating a new sub-page; they all follow
the same template shape:

| Reference | Pattern variant |
|---|---|
| **`UserManagementComponent`** (`packages/Angular/Explorer/explorer-settings/src/lib/user-management/`) | Filter-and-search chrome with status chips in `[toolbar]` and Export + Add User in `[actions]`. The canonical "filter card" example. |
| **`SystemDiagnosticsComponent`** (`packages/Angular/Explorer/dashboards/src/SystemDiagnostics/`) | Pattern X mini-shell — 4 L2 sections via `<mj-tab-nav>` in `[toolbar]`; refresh + auto-refresh in `[actions]`. |
| **`APIKeysResourceComponent`** (`packages/Angular/Explorer/dashboards/src/APIKeys/`) | Pattern X mini-shell with per-tab dynamic `[Title]` / `[Subtitle]` getters that change as the user switches between Keys / Applications / Scopes / Usage. |
| **Dev Tools inspectors** (`packages/Angular/Explorer/dashboards/src/DevTools/`) | Action-only chrome — no `[toolbar]` content, so the bottom row collapses entirely. All 7 inspectors (AppState, Layout, ClassRegistry, LazyModuleStatus, SettingsExplorer, EventMonitor, GraphQLConsole) share this shape. |
| **`EntityListComponent`** (`packages/Angular/Explorer/dashboards/src/DatabaseDesigner/components/entity-list.component.html`) | Chrome card on a Pattern X dashboard whose parent wraps the entity list with slide-over panels. Demonstrates that "thin parent wrapper + child owns interior chrome" is fine. |

See Section 11 for the full migration status table.

### Adjacent global changes (2026-05-19)

- **`.mj-btn--secondary` background** tinted from `--mj-bg-surface` (white) to `--mj-bg-surface-sunken` (light gray) globally in `button.scss`. Secondary buttons sitting on white surfaces (cards, headers, dialogs) were near-invisible; the tint gives just enough contrast to read as a button on both white and sunken backgrounds. Affects every secondary button in MJ Explorer.
- **`.mj-filter-popover-trigger`** dimensions and typography aligned with `mjButton size="sm"` (32px min-height, 6px 12px padding, 0.8125rem semibold, `--mj-bg-surface-sunken` background) in `filter-popover.component.ts` so the popover trigger sits cleanly inline with adjacent action buttons. Affects every popover trigger in MJ Explorer.
- **`<mj-page-body>` gained a `Direction` input** (`'row' | 'column'`, defaults `'column'`). When `[Flex]="true" Direction="row"`, the body becomes a flex row — replacing the bespoke per-shell `.{shell}-container__body` flex wrapper that every left-rail shell used to declare. The Admin shells use this now; KH Config / AI Analytics shells can adopt it in subsequent passes.
- **`<mj-left-nav>` + `<mj-left-nav-content>` shared components** (`@memberjunction/ng-ui-components`). Canonical pair for shells with internal section nav — `<mj-left-nav>` is the rail, `<mj-left-nav-content>` is the content pane that sits to its right.

  **`<mj-left-nav>`** — supports plain items, items with description, items with badge, sections with uppercase headers, optional `[header]` / `[footer]` content slots, responsive collapse-to-row at narrow viewports. Driven by `[Sections]` (array of `MJLeftNavSection`) + `[ActiveId]`, emits `(ItemClicked)`.

  **`<mj-left-nav-content>`** — flex-column content box with built-in `[Loading]` and `[Error]` states. Projected content auto-hides via CSS when loading/errored (cached components stay attached). Replaces the bespoke `.{shell}-container__content` + `.{shell}-container__host` + `.{shell}-container__loading` + `.{shell}-container__error` rules.

  Admin shells migrated 2026-05-19 — `admin-container.component.css` reduced to a single `:host` rule + a 4-line responsive `@media` override.

  ```html
  <mj-page-body [Flex]="true" [Padding]="false" Direction="row">
    <mj-left-nav
      [Sections]="NavSections"
      [ActiveId]="ActiveSection"
      (ItemClicked)="OnNavItemClicked($event)">
    </mj-left-nav>
    <mj-left-nav-content [Loading]="IsLoading" [Error]="LoadError">
      <ng-container #contentHost></ng-container>
    </mj-left-nav-content>
  </mj-page-body>
  ```

  ```typescript
  // Items shape — id / label required; icon / description / badge / disabled optional
  public NavSections: MJLeftNavSection[] = [{
    items: [
      { id: 'users', icon: 'fa-solid fa-users', label: 'Users', description: 'Manage user accounts' },
      { id: 'roles', icon: 'fa-solid fa-user-shield', label: 'Roles', description: 'Define roles and assignments' }
    ]
  }];
  ```

  Other shells (KH Config, KH Analytics, AI Analytics, Communication, Credentials, APIKeys, MCP) follow in subsequent passes — each is currently a separate component file with its own bespoke nav + content area.

---

## 11. Migration progress

See [`plans/explorer-ia-progress.md`](explorer-ia-progress.md) for the per-page
migration status.
