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
    <div meta    class="…-header-meta">…</div>
    <div actions class="…-header-actions">…</div>
    <div toolbar class="…-header-toolbar">…</div>
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

Slot wrappers should use `class="…-header-X"` with `display: contents` so children
become direct flex children of the page-header slot (gap applies correctly).

---

## 2. Slot rules

### `[meta]` — "What am I looking at?"

Read-only context that sits next to the title. **Never anything actionable.**

✅ Permitted:
- `<mj-result-count [Count] [Total] Label="…">`
- Status pills (Healthy / Alert / Running / Unsaved / Pending review)
- Stat badges (small counts: `3 active`, `12 errors`)

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
   renders content only — no chrome.
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
- `[Padding]="false"` — pages whose inner content owns the gutter (File Browser).
- `[Scroll]="false"` — pages managing their own scroll regions (split panes).
- `[Flex]="true"` — pages whose main content area uses `flex: 1` to fill remaining
  height (e.g., banner-above-content layouts like Testing Dashboard parent, Test
  Explorer's sidebar+main layout).

**Never** inline the `flex: 1; min-height: 0; padding: 0 24px 24px; overflow-y: auto`
recipe in a per-page CSS file. Use `<mj-page-body>`.

---

## 7. Naming & wiring conventions

### Inner component `HideToolbar` gate

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
  MJResultCountComponent,        // if [meta] has a count
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

---

## 9. Migration progress

See [`plans/explorer-ia-progress.md`](explorer-ia-progress.md) for the per-page
migration status.
