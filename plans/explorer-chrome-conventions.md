# MJ Explorer Chrome Conventions

The canonical rules for laying out page chrome on MJ Explorer dashboards and resource
pages. Apply these when migrating a page to the shared chrome system, when reviewing a
migration, or when designing a new page from scratch.

If a page seems to need an exception, **stop and consult this document** before
inventing a new pattern. Exceptions get added here, not improvised in code.

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

Read-only context that sits next to the title. **Never anything actionable.**

✅ Permitted:
- `<mj-stat-badge [Count] [Total]? Label="…" [Variant]?>` (covers both result-count "X of Y label" and status pills via Variant)
- Status pills (Healthy / Alert / Running / Unsaved / Pending review) via `Variant="success|warning|error|running|info"`
- Stat counts (`3 active`, `12 errors`, `8 of 50 prompts`)

❌ Not permitted:
- Buttons, dropdowns, popovers, search, view-toggles
- Anything the user clicks to *change* state

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
  the sibling component to `<mj-page-header>`. Same slot conventions
  (`[meta]` / `[actions]` / `[toolbar]`); different visual shape.
- **The sub-page renders exactly one root element below the chrome.**
  `<mj-left-nav-content>`'s CSS sizes its first projected child via
  `:host ::ng-deep > *:not(error):not(loading)`. Sub-pages that project
  multiple top-level siblings will get unexpected sizing on each one. Wrap
  body content in a single container element (a `<div>` works) if you have
  more than the chrome card + content list as siblings.
- **No on-page section title.** The rail's active-item highlight IS the
  section indicator. Repeating it as an H1 is redundant.
- **Same shared components everywhere.** The interior chrome uses the same
  `<mj-page-search>` / `<mj-filter-popover>` / `<mj-filter-panel>` /
  `<mj-refresh-button>` / `mjButton` primitives the exterior chrome uses.
  One chrome contract, two surfaces (header band for top-level pages,
  `<mj-page-header-interior>` for shell sub-pages).

### Interior chrome layout

```
[ 🔍 search …… ] [chip:All|Active|Inactive] [—— spacer ——] [Filters ▼] [↻ Refresh] [Export] [+ New X]
```

- **Left side** — `[toolbar]` slot: `<mj-page-search>` then visible quick-toggle
  `<mj-filter-chip>` group (if any).
- **Right side** — `[actions]` slot: `<mj-filter-popover>` for advanced filters,
  `<mj-refresh-button>`, secondary `mjButton`s (Export, etc.), then the
  primary CTA (`+ New X`) rightmost.
- **`[meta]` slot** — between the spacer and `[actions]` — stat badges /
  result counts. Often empty for sub-pages whose stats live in a separate
  body grid.

### Standard template

```html
<mj-page-header-interior AriaLabel="Filter users">
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

<!-- Below the chrome card: bulk-action toolbar (contextual), stats grid,
     scrollable list. The sub-page renders these as additional top-level
     children — but see the "exactly one root element" guidance above if
     <mj-left-nav-content> sizing looks off. -->
```

The chrome card's surface, padding, margin, radius, and shadow are owned by
`<mj-page-header-interior>` itself — sub-pages don't need a `.filter-card`
or any bespoke wrapper styles. Pass `[AriaLabel]` to make the card a labeled
landmark for assistive tech; `Role` defaults to `'search'` (override or pass
`null` for non-filter chrome).

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
| **Interior filter card (CURRENT)** | Adopted. Shell chrome stays fixed = stable page identity. Sub-page's controls live in a single clean white card inside the body. Same shared components as exterior chrome — one mental model, no special projection wiring. |

### Reference implementations

- **`UserManagementComponent`** (`packages/Angular/Explorer/explorer-settings/src/lib/user-management/`) — first sub-page migrated to this pattern, 2026-05-19. Copy this when migrating other sub-pages.
- Subsequent migrations expected: Roles, Apps, App Roles, Permissions, API Keys, then Monitoring + Data & Schema + Dev Tools sub-pages. See Section 11 for status.

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
