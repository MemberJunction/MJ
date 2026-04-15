# Phase 2: Kendo Removal, Component Consolidation & IA Standardization

> **Status:** Phase 2.1 COMPLETE -- All Kendo dependencies removed. Merged April 2026.

**Date:** March 18, 2026 (updated April 1, 2026)
**Branch:** `feature/kendo-removal-phase2`
**Merge target:** `next`

---

## Overview

Three sequential phases, each independently mergeable:

| Phase | Focus | Goal |
|-------|-------|------|
| **2.1** | **Kendo Removal** | Zero `@progress/*` dependencies. Replace every Kendo component with MJ equivalents + AG Grid. |
| **2.2** | **Component Consolidation** | Eliminate duplication: merge 63 dialog variants into shared bases, consolidate card/badge CSS, create `SelectorDialog<T>`. |
| **2.3** | **IA/Layout Standardization** | Consistent page structure across all apps: shared `mj-page-header`, `mj-empty-state`, standardized sidebars/filters/headers. |

### Strategy
Custom MJ components + AG Grid + angular-split. No PrimeNG, no Angular Material. New components live in `@memberjunction/ng-ui-components`.

### Implementation Rules (All Phases)
1. **Standalone components** with `standalone: true` and explicit `imports`
2. **`inject()` for DI** — not constructor injection
3. **PascalCase public members** — `@Input()`, `@Output()`, public methods
4. **`@if`/`@for`/`@switch`** block syntax
5. **`--mj-*` semantic tokens only** — zero hardcoded hex
6. **No `any` types**
7. **Functional decomposition** — max 30-40 lines per method

---

# Phase 2.1: Complete Kendo Removal

**Goal:** Remove ALL `@progress/*` dependencies from MemberJunction Angular packages.

## Components Built in `@memberjunction/ng-ui-components`

| Component | Selector | Replaces | Status |
|-----------|----------|----------|--------|
| Button | `mjButton` | `kendoButton` | DONE |
| Dialog | `mj-dialog`, `mj-dialog-titlebar`, `mj-dialog-actions` | `kendo-dialog` | DONE |
| Window | `mj-window`, `mj-window-titlebar` | `kendo-window` | DONE (drag, resize, minimize, maximize) |
| Dropdown | `mj-dropdown` | `kendo-dropdownlist` | DONE |
| Combobox | `mj-combobox` | `kendo-combobox` | DONE (filter, AllowCustom, clear button) |
| Switch | `mj-switch` | `kendo-switch` | DONE |
| Numeric Input | `mj-numeric-input` | `kendo-numerictextbox` | DONE |
| Progress Bar | `mj-progress-bar` | `kendo-progressbar` | DONE |
| Datepicker | `mj-datepicker` | `kendo-datepicker` | DONE |
| Accordion | `mj-accordion-panel` | `kendo-panelbar-item`, `kendo-expansionpanel` | DONE (two-way `[(Expanded)]`) |
| Splitter | `angular-split` (`as-split` + `as-split-area`) | `kendo-splitter` | DONE |
| CSS: `.mj-input` | class on `<input>` | `kendo-textbox` / `kendoTextBox` | DONE |
| CSS: `.mj-textarea` | class on `<textarea>` | `kendo-textarea` / `kendoTextArea` | DONE |
| CSS: `.mj-checkbox` | class on `<input checkbox>` | `kendoCheckBox` | DONE |
| CSS: `.status-chip` | `<span>` with `data-color` | `kendo-chip` | DONE |
| CSS: `.search-input-wrapper` | wraps icon + input | `kendo-textbox` prefix template | DONE |

## Components Still Needed (Phase 2.1)

| Component | Replaces | Instances | Notes |
|-----------|----------|-----------|-------|
| `MJDialogService` | `DialogService.open()` | ~15 | Programmatic dialog opening |
| `mj-context-menu` | `kendo-contextmenu` | 4 | CDK Overlay |
| `mj-listbox` | `kendo-listbox` | 4 | Dual-list transfer |
| `mj-file-select` | `kendo-fileselect` | 2 | Native `<input type="file">` + drag zone |
| `mj-slider` | `kendo-slider` | 4 | Native `<input type="range">` + styling |
| `mj-tilelayout` | `kendo-tilelayout` | 4 | CSS Grid layout (Component Studio) |
| `mj-dropdown-button` | `kendo-dropdownbutton` | 4 | Button + dropdown menu |
| `mj-datetime-picker` | `kendo-datetimepicker` | 2 | Date + time picker |
| `mj-date-range` | `kendo-daterange` | 2 | Date range selector |
| `mj-date-input` | `kendo-dateinput` | 4 | Date input without calendar popup |
| `mj-button-group` | `kendo-buttongroup` | 6 | CSS wrapper for grouped buttons |
| AG Grid migration | `kendo-grid` | 8 | Grid replacement |
| Native `<label>` | `kendo-label` | 8 | No component needed |
| Treeview solution | `kendo-treeview` | 2 | Keep existing or replace |
| Dropdown tree | `kendo-dropdowntree` | 2 | Dropdown with tree data |

## Sections DONE (Kendo-free)

| # | Section | Components Migrated |
|---|---------|---------------------|
| 1 | MCP (`/app/ai/mcp`) | dialog, dropdown, textbox, textarea, numeric-input, checkbox, buttons |
| 2 | Actions dashboards (`/app/actions`) | textbox, dropdown, chip, textarea, buttons |
| 3 | Home (`/app/home`) | button |
| 4 | Lists dashboards (`/app/lists`) | buttons |
| 5 | Scheduling (`/app/scheduling`) | buttons |
| 6 | Credentials (`/app/credentials`) | buttons |
| 7 | Admin/Settings | buttons + CSS class buttons |
| 8 | Chat (`/app/chat`) | buttons |
| 9 | Generic: generic-dialog | dialog |
| 10 | Generic: entity-form-dialog | dialog |
| 11 | Generic: find-record | dialog + textbox (kendo-grid stays) |
| 12 | Generic: record-selector | dialog (kendo-listbox stays) |
| 13 | Generic: list-management | dialog, dropdown, textbox, buttons |
| 14 | Generic: file-storage | buttons |
| 15 | Generic: Testing | buttons |
| 16 | Shell header | search dropdown + textbox |
| 17 | Data Explorer | already clean |
| 18 | Communication | already clean |
| 19 | Action entity form | textbox, dropdowns, textarea, switch, accordion, buttons |
| 20 | Action Execution Log form | panelbar → accordion |
| 21 | ERD (`/app/admin/ERD`) | splitter → angular-split |
| 22 | AI dashboards splitters | all splitters → angular-split |
| 23 | AI test harness | splitter, textboxes, dropdowns, numeric inputs, switch, expansion panel, dialogs, buttons, window |
| 24 | Test harness window | kendo-window → mj-window |
| 25 | API Keys (`/app/api-keys/*`) | windows, dropdowns, datepicker, textboxes, textareas, checkboxes, buttons |
| 26 | Template forms | combobox, textbox, textarea, switch, accordion panels |
| 27 | Template editor | dropdown, numeric-input |

## Sections Remaining

### Core Entity Forms (25 files)

| File(s) | Kendo Components |
|---------|-----------------|
| `AIAgents/ai-agent-form.component.html` | dropdowns, panelbar (11), textbox, textarea, buttons, switch, splitter |
| `AIAgents/new-agent-dialog.component.html` | dialog, textbox, textarea, dropdown, buttons |
| `AIAgents/add-action-dialog.component.html` | dialog, textbox, buttons |
| `AIAgents/prompt-selector-dialog.component.html` | dialog, textbox, buttons |
| `AIAgents/sub-agent-selector-dialog.component.html` | dialog, textbox, buttons |
| `AIAgents/create-prompt-dialog.component.html` | dialog, textbox, textarea, buttons |
| `AIAgents/create-sub-agent-dialog.component.html` | dialog, textbox, buttons |
| `AIAgents/agent-prompt-advanced-settings-dialog.component.html` | dialog, dropdowns, numeric, buttons |
| `AIAgents/sub-agent-advanced-settings-dialog.component.html` | dialog, dropdowns, numeric, buttons |
| `AIAgents/agent-advanced-settings-dialog.component.html` | dialog, dropdowns, buttons |
| `AIPrompts/ai-prompt-form.component.html` | dropdowns, panelbar, textbox, textarea, buttons, switch, window |
| `AIPrompts/template-selector-dialog.component.html` | dialog, textbox, buttons |
| `AIPromptRuns/ai-prompt-run-form.component.html` | panelbar (9), buttons, window |
| `AIPromptRuns/chat-message-viewer.component.html` | dialog, buttons |
| `Queries/query-form.component.html` | dropdowns, textbox, buttons, expansion panels, grid |
| `Queries/query-category-dialog.component.html` | dialog, dropdown, textbox, buttons |
| `Queries/query-run-dialog.component.html` | dialog, buttons |
| `Tests/test-form.component.html` | buttons, textbox |
| `Tests/test-run-form.component.html` | buttons |
| `Tests/test-suite-form.component.html` | buttons |
| `Tests/test-suite-run-form.component.html` | buttons |
| `Lists/list-form.component.html` | buttons |
| `ai-agent-run/ai-agent-run.component.html` | panelbar (10), buttons |
| `ai-agent-run/ai-agent-run-analytics.component.html` | buttons |
| `ai-agent-run/ai-agent-run-visualization.component.html` | buttons |
| `Templates/template-params-grid.component.html` | **kendo-grid** (inline editing) |

### Component Studio (5 files)

| File | Kendo Components |
|------|-----------------|
| `component-studio-dashboard.component.html` | buttons, tilelayout |
| `artifact-load-dialog.component.html` | dialog, buttons |
| `artifact-selection-dialog.component.html` | dialog, buttons |
| `component-browser.component.html` | textbox, buttons |
| `new-component-dialog.component.html` | dialog, textbox, textarea, buttons |

### Explorer Core (7 files)

| File | Kendo Components |
|------|-----------------|
| `dashboard-share-dialog.component.html` | window, buttons |
| `dashboard-preferences-dialog.component.html` | dialog, buttons |
| `add-item/add-item.component.html` | dropdowns, buttons |
| `delete-item/delete-item.component.html` | dialog, buttons |
| `edit-dashboard/edit-dashboard.component.html` | window, textbox, buttons |
| `single-dashboard.component.html` | buttons, buttongroup |
| `single-list-detail.component.html` | dialog, buttons, grid |
| `view-resource.component.html` | buttons |

### Generic Packages (13 files)

| Package | File | Kendo Components |
|---------|------|-----------------|
| forms | `dynamic-form-field.component.html` | dropdowns, textbox, textarea, datepicker, switch, checkbox, numeric |
| forms | `dynamic-form.component.html` | buttons |
| data-context | `ng-data-context-dialog.component.html` | dialog, textbox, buttons |
| data-context | `ng-data-context.component.html` | buttons |
| chat | `chat.component.html` | buttons, textarea |
| conversations | `search-panel.component.html` | textbox |
| entity-communication | `preview.component.html` | buttons |
| entity-communication | `window.component.html` | window |
| file-storage | `category-tree.html` | **treeview, contextmenu**, dialog, textbox |
| file-storage | `file-upload.html` | **fileselect**, dialog |
| file-storage | `files-grid.html` | **kendo-grid**, dialog, textbox |
| find-record | `find-record.component.html` | **kendo-grid** |
| join-grid | `join-grid.component.html` | **kendo-grid**, dropdowns, textbox |
| record-selector | `record-selector.component.html` | **kendo-listbox**, dialog |
| resource-permissions | 3 files | dropdowns, buttons, **kendo-grid** |
| entity-permissions | 2 files | dropdowns, **kendo-grid** |
| action-gallery | `action-gallery.component.html` | buttons |
| simple-record-list | `simple-record-list.component.html` | buttons |

### Integration (1 file)

| File | Kendo Components |
|------|-----------------|
| `mapping-workspace.component.html` | dropdowns (4), textbox (3), switch (1) |

### AG Grid Migrations (8 grids)

| File | Complexity |
|------|-----------|
| `find-record.component.html` | Low |
| `files-grid.html` | Medium |
| `join-grid.component.html` | Medium |
| `template-params-grid.component.html` | High (inline editing) |
| `entity-permissions-grid.component.html` | Medium |
| `entity-selector-with-grid.component.html` | Low |
| `simple-record-list.component.html` | Low |
| `single-list-detail.component.html` | Medium |

## Final Cleanup (end of Phase 2.1)

1. Delete `packages/Angular/Explorer/kendo-modules/` package
2. Delete `_kendo-theme-override.scss` (1,348 lines)
3. Remove `@import '@progress/kendo-theme-default/scss/all'` from `styles.scss`
4. Remove ALL `@progress/*` from every `package.json`
5. Remove stale `primeng` peer dep from `base-forms`
6. Remove all `.k-*` CSS class references
7. `npm install` at repo root
8. Full build + visual QA

## Phase 2.1 Verification
- [ ] Zero `@progress/*` in any `package.json`
- [ ] Zero `kendo-` in any `.html` template
- [ ] Zero `.k-` in any `.css`/`.scss` file
- [ ] Zero Kendo imports in any `.ts` file
- [ ] `npm run build` passes from root
- [ ] All pages render correctly in light and dark mode
- [ ] `kendo-modules` package deleted
- [ ] `_kendo-theme-override.scss` deleted
- [ ] Bundle size reduced

---

# Phase 2.2: Component Consolidation & Standardization

**Depends on:** Phase 2.1 merged (done April 2026)

## Q2 2026 OKR — UI Platform Standardization

**Objective:** Deliver a cohesive, consistent user experience across all MemberJunction Explorer applications

| Key Result | Target |
|---|---|
| **KR1:** Eliminate duplicate UI components (dialogs, selectors, dropdowns, cards, badges) | Single shared implementation for each |
| **KR2:** Standardize page layouts — headers, sidebars, filter panels, empty states | All apps follow consistent patterns |
| **KR3:** Achieve full visual consistency — enforce design token usage (zero hardcoded colors), standardize all form inputs, unify accordion/panel styling, consistent spacing and typography | Cohesive look and feel across every page in both light and dark mode |

---

## Baseline Audit (April 15, 2026)

*Counts exclude 3 mockup/prototype files: `slack-style-agent-chat-v22.html`, `mockup-mapping-workspace.html`, `FILTER_BUILDER_MOCKUP.html`*

### Component Adoption Scorecard

#### Existing Components (built in Phase 2.1)

| Component | Selector | Adopted | Not Adopted | Total | Adoption % |
|-----------|----------|---------|-------------|-------|------------|
| Button | `mjButton` | 512 | ~1,640 | ~2,152 | **24%** |
| Dialog | `mj-dialog` | 62 | 0 | 62 | **100%** |
| Dropdown | `mj-dropdown` | 81 | ~150 native `<select>` | ~231 | **35%** |
| Combobox | `mj-combobox` | 3 | — | 3 | **100%** |
| Switch | `mj-switch` | 5 | ~92 checkbox-as-toggle | ~97 | **5%** |
| Numeric Input | `mj-numeric-input` | 25 | ~25 `<input type=number>` | ~50 | **50%** |
| Datepicker | `mj-datepicker` | 7 | ~5 `<input type=date>` | ~12 | **58%** |
| Progress Bar | `mj-progress-bar` | 3 | 15 custom divs | 18 | **17%** |
| Accordion | `mj-accordion-panel` | 75 | — | 75 | **n/a** |
| Window | `mj-window` | 13 | 0 | 13 | **100%** |
| Loading | `mj-loading` | 198 | 205 `fa-spinner` | 403 | **49%** |

#### CSS Class Adoption

| Class | Applied | Missing | Total | Adoption % |
|-------|---------|---------|-------|------------|
| `.mj-input` | 86 | ~152 text inputs | ~238 | **36%** |
| `.mj-textarea` | 32 | ~53 | ~85 | **38%** |
| `.mj-checkbox` | 27 | ~129 | ~156 | **17%** |

### Component Duplication (shared component does not yet exist)

| Pattern | Implementations | Instances | CSS Definitions |
|---------|-----------------|-----------|-----------------|
| Confirm dialogs | 3 components | 8 | — |
| Status badges/pills | 5+ components | 79 | 370 across 71 files |
| Empty states | 0 shared component | 102 across 77 files | — |
| Selector/picker dialogs | 4 components | 5 | — |
| Page headers | 0 shared component | 105 across 65 files | — |
| Filter panels | 0 shared component | 76 across 18 files | — |
| Card patterns | 7+ variants | 97 across 30 files | ~350+ |

### Hardcoded Values (should use `--mj-*` design tokens)

| Category | Files | Instances |
|----------|-------|-----------|
| Hex colors | 20 | 186 |
| Hardcoded spacing (px) | 15 of 21 SCSS files | 71% of SCSS |
| Hardcoded border-radius | 5 of 21 SCSS files | 24% of SCSS |

### Scattered Components (should be in `ng-ui-components`)

16 reusable components exist in separate packages: `mj-loading`, `mj-tab-strip`, `mj-entity-card`, `mj-pagination`, `mj-tree`, `mj-tree-dropdown`, `mj-timeline`, `mj-filter-builder`, `mj-record-selector-dialog`, `mj-record-changes`, `mj-toast`, `mj-notification-badge`, `mj-pill`, `mj-code-editor`, `mj-kanban-board`, `mj-gantt-chart`

Plus 6 directives and 4 pipes scattered across packages.

### CSS Duplication (patterns defined in multiple files)

| Pattern | Defined in |
|---------|-----------|
| `.mj-btn` | `ui-components/button.scss` + `_common.scss` + `_shared-patterns.scss` (3 places) |
| `.mj-badge` / `.badge` | `_badges.scss` + `_shared-patterns.scss` (2 places) |
| `.mj-card` | `_common.scss` + `_shared-patterns.scss` (2 places) |
| `.mj-input` | `ui-components/input.scss` + `_shared-patterns.scss` (2 places) |
| `.mj-kendo-icon-card` | `_common.scss` — still references `.k-card-body`, `.k-chip` |

### Layout Pattern Inconsistencies

#### Page Headers — 5-7 distinct structural patterns

No shared component. Each dashboard builds its own header differently:

| Page | Pattern | Element |
|------|---------|---------|
| Home Dashboard | `<h1>{{ greeting }}</h1>` + custom greeting section | `h1` |
| Data Explorer | `<h2>` + icon + record count | `h2` |
| AI Dashboards | Custom `.dashboard-header` div | `div` |
| Settings | Inline `<h3>` with action buttons | `h3` |
| Query Dialog | `<mj-dialog-titlebar>` + icon | titlebar |
| Entity Forms | `<h3>` inside collapsible panels | `h3` |

Action button placement varies: right-aligned, inline, or in separate toolbar.

#### Sidebars — 3 different patterns

| Page | Sidebar Type | Features |
|------|-------------|----------|
| Home Dashboard | Right collapsible | Pin toggle, notification badge, sections |
| Data Explorer | Left navigation panel | Collapsible, resizable, animated slide-in |
| Conversations | Left sidebar + float toggle | Resizable, collapsible, mobile backdrop |

No consistent toggle buttons, mobile handling, or width standards.

#### List + Detail Layouts — no shared wrapper

| Page | Pattern |
|------|---------|
| Data Explorer | Left sidebar + main content (no right panel) |
| Conversations | Left sidebar + main + resizable right panel |
| List Detail Grid | Dedicated component (`ng-list-detail-grid`) |

#### Loading States — mixed approaches

| Pattern | Count | Standard? |
|---------|-------|-----------|
| `<mj-loading>` component | 198 instances | Yes |
| `fa-spinner fa-spin` inline | 205 instances | No |
| Custom `.sidebar-loading` divs | scattered | No |

No consistent positioning rules (centered vs. inline) or size guidance.

#### Error/Alert States — no shared component

| Pattern | Location | Implementation |
|---------|----------|---------------|
| Query errors | Query Run Dialog | Styled div with hardcoded `#f8d7da` (Bootstrap red) |
| Toast notifications | Conversations | `<mj-toast>` component |
| Edit mode banner | Home Dashboard | Custom `.edit-mode-banner` |
| Health banner | Scheduling | Custom `.health-banner` |
| Validation errors | Query Dialog | Icon + inline text |

Mix of hardcoded colors, custom divs, and the `mj-toast` component. No standardized error/alert banner.

#### Navigation — inconsistent tab and breadcrumb patterns

| Pattern | Implementation | Pages Using |
|---------|---------------|-------------|
| Breadcrumbs | Custom HTML spans | Data Explorer only |
| `mj-tab-strip` | Shared component | Some dashboards |
| Custom tabs | `activeTab` property + styled divs | Conversations, Tests |
| No back navigation | Rely on browser back | Most pages |

---

## Overall Baseline Summary

| Metric | Current | Target |
|--------|---------|--------|
| Button adoption | 24% | 100% |
| Dropdown adoption (mj-dropdown vs native select) | 35% | 100% |
| Switch adoption | 5% | 100% |
| Loading component adoption (mj-loading vs fa-spinner) | 49% | 100% |
| Progress bar adoption | 17% | 100% |
| Text input styling (.mj-input) | 36% | 100% |
| Textarea styling (.mj-textarea) | 38% | 100% |
| Checkbox styling (.mj-checkbox) | 17% | 100% |
| Numeric input adoption | 50% | 100% |
| Datepicker adoption | 58% | 100% |
| Duplicate component implementations | 24+ | 0 |
| Hardcoded colors | 186 | 0 |
| SCSS files with hardcoded spacing | 71% | 0% |
| CSS patterns defined in multiple files | 5 patterns | 0 |
| Scattered packages (should be in ng-ui-components) | 16 | 0 |
| Page header structural variants | 5-7 | 1 (`mj-page-header`) |
| Sidebar patterns | 3 | 1-2 standardized |
| Loading approaches | 2 (50/50 split) | 1 (`mj-loading`) |
| Error/alert display patterns | 5+ | 1-2 (`mj-toast` + `mj-alert-banner`) |
| Tab/navigation implementations | 3+ | 1 (`mj-tab-strip`) |

---

## Approach

**Iterative, component-by-component.** For each component:
1. Build the shared component (if new) or move it (if scattered)
2. Migrate consumers one package group at a time
3. Remove old implementation / duplicate CSS
4. Verify build + visual correctness

### Priority Order (highest impact first)

1. **Buttons** — 1,640 unadopted (biggest raw count)
2. **Badges** — 449 total instances across 5+ implementations
3. **Loading spinners** — 205 custom `fa-spinner` → `mj-loading`
4. **Empty states** — 102 inline instances across 77 files, no shared component
5. **Dropdowns** — 150 native `<select>` → `mj-dropdown`
6. **Text inputs** — 152 missing `.mj-input` class
7. **Checkboxes** — 129 missing `.mj-checkbox` class
8. **Page headers** — 105 instances, no shared component
9. **Switches** — 92 unadopted
10. **Filter panels** — 76 instances across 18 files
11. **Confirm dialogs** — 3 implementations → 1
12. **Card CSS** — deduplicate + rename `.mj-kendo-icon-card`
13. **Hardcoded colors** — 186 instances in 20 files
14. **Hardcoded spacing** — 15 SCSS files
15. **Move scattered packages** into `ng-ui-components`

---

## Components to Build

| Component | Purpose | Replaces |
|-----------|---------|----------|
| `MJConfirmDialogComponent` | Confirmation modal | 3 confirm dialog implementations |
| `MJBadgeComponent` | Status indicator | `mj-pill`, `mj-notification-badge`, inline `.status-badge` |
| `MJEmptyStateComponent` | "No data" display | 102 inline empty state divs |
| `MJPageHeaderComponent` | Consistent page headers | 105 ad-hoc header patterns |
| `MJSelectorDialogComponent` | Pick from list | 4 selector dialog variants |
| `MJFilterPanelComponent` | Search + filter layout | 18 custom filter panels |
| `MJToastComponent` (move) | Notifications | Toast component in conversations pkg |

### Component APIs

#### `<mj-confirm-dialog>`
```html
<mj-confirm-dialog
  [Visible]="showConfirm"
  Title="Delete Item"
  Message="Are you sure you want to delete this?"
  [Type]="'danger'"
  ConfirmText="Delete"
  (Confirmed)="onDelete()"
  (Close)="showConfirm = false">
</mj-confirm-dialog>
```

#### `<mj-badge>`
```html
<mj-badge Text="Active" Type="success" Size="sm"></mj-badge>
<mj-badge Text="3" Variant="dot" Type="danger"></mj-badge>
```

#### `<mj-empty-state>`
```html
<mj-empty-state
  Icon="fa-solid fa-folder-open"
  Title="No Items Found"
  Message="Create your first item to get started."
  ActionText="Create Item"
  (Action)="createItem()">
</mj-empty-state>
```

#### `<mj-page-header>`
```html
<mj-page-header
  Icon="fa-solid fa-robot"
  Title="Agent Configuration"
  [Subtitle]="agentCount + ' agents'">
  <button mjButton variant="primary" (click)="newAgent()">New Agent</button>
</mj-page-header>
```

---

## Components to Move into `ng-ui-components`

| Component | Current Package |
|-----------|----------------|
| `mj-loading` | `ng-shared-generic` |
| `mj-tab-strip` | `ng-tab-strip` |
| `mj-entity-card` | `ng-entity-card` |
| `mj-pagination` | `ng-pagination` |
| `mj-tree` + `mj-tree-dropdown` | `ng-trees` |
| `mj-timeline` | `ng-timeline` |
| `mj-record-selector-dialog` | `ng-record-selector` |
| `mj-record-changes` | `ng-record-changes` |
| `HighlightSearchPipe` | `ng-dashboards` |
| `GroupByPipe` | `ng-dashboards` |

---

## CSS Consolidation

| Task | Current State | Target |
|------|--------------|--------|
| Rename `.mj-kendo-icon-card` → `.mj-icon-card` | Still has Kendo selectors (`.k-card-body`, `.k-chip`) | Clean MJ selectors |
| Deduplicate `.mj-btn` CSS | Defined in 3 places | 1 (ui-components/button.scss) |
| Deduplicate `.mj-badge` CSS | Defined in 2+ places | 1 (badge component SCSS) |
| Deduplicate `.mj-card` CSS | `_common.scss` + `_shared-patterns.scss` | 1 |
| Deduplicate `.mj-input` CSS | `ui-components/input.scss` + `_shared-patterns.scss` | 1 |
| Migrate hardcoded colors | 186 instances in 20 files | 0 |
| Migrate hardcoded spacing | 71% of SCSS files | 0% |
| Migrate hardcoded border-radius | 24% of SCSS files | 0% |
| Standardize loading spinners | 205 custom `fa-spinner` instances | 0 (all use `mj-loading`) |

---

## Open Decisions

1. **Old packages after move:** When moving components into `ng-ui-components`, should old packages (`ng-tab-strip`, `ng-pagination`, etc.) become re-export shims or be removed entirely?
2. **Visualization components** (code editor, kanban, gantt, ERD): Move into `ng-ui-components` or keep separate (they have heavy third-party deps)?
3. **`<select>` elements:** Migrate all 150 → `mj-dropdown`, or create `.mj-select` CSS class for simple cases?
4. **`<button>` without mjButton:** Many are icon-only or special-purpose — determine which truly need the directive vs. which are styled by their parent component.

---

## Phase 2.2 Verification
- [ ] All baseline metrics improved from audit numbers
- [ ] Single `<mj-confirm-dialog>` implementation; old duplicates deleted
- [ ] `<mj-badge>` replaces all pill/badge variants
- [ ] `<mj-empty-state>` replaces inline empty state divs
- [ ] `<mj-page-header>` applied to dashboard apps
- [ ] Card CSS consolidated to single source
- [ ] Badge CSS consolidated to single source
- [ ] `.mj-kendo-icon-card` renamed to `.mj-icon-card`
- [ ] Loading: zero `fa-spinner fa-spin` instances remaining
- [ ] All downstream packages build
- [ ] Visual QA in light and dark mode

---

# Phase 2.3: Layout Standardization & Visual Consistency

**Depends on:** Phase 2.2 substantially complete

## Goals
- Apply consistent page structure templates across all apps
- Standardize sidebar widths, filter panel behavior, header patterns
- Drive all remaining design token adoption to 100%
- Full visual QA across both themes

## Layout Templates

**Template A: Sidebar + Content** — Settings, Credentials, Communication, Testing
**Template B: Filter + Content** — AI Configuration, AI Agents, MCP, Data Explorer

| Element | Standard |
|---------|----------|
| Header | `<mj-page-header>` with icon + title + optional subtitle |
| Sidebar width | 240px fixed |
| Filter panel width | 320px, toggleable |
| View mode toggle | Always in header right |
| Empty states | `<mj-empty-state>` everywhere |

## Token Consistency Pass

| UI Element | Background | Text | Border |
|-----------|-----------|------|--------|
| Page | `--mj-bg-page` | — | — |
| Sidebar | `--mj-bg-surface` | `--mj-text-primary` | `--mj-border-default` |
| Content area | `--mj-bg-surface-card` | `--mj-text-primary` | — |
| Cards | `--mj-bg-surface` | `--mj-text-primary` | `--mj-border-default` |
| Page header | `--mj-bg-surface` | `--mj-text-primary` | `--mj-border-default` |
| Dialogs | `--mj-bg-surface` | `--mj-text-primary` | — |

## Remaining Adoption Targets

| Metric | Phase 2.2 Target | Phase 2.3 Target |
|--------|-----------------|-----------------|
| Button adoption | Improve from 24% | 100% |
| Input/textarea/checkbox styling | Improve from ~30% | 100% |
| Switch adoption | Improve from 5% | 100% |
| Hardcoded colors | Reduce from 186 | 0 |
| Hardcoded spacing | Reduce from 71% | 0% |

## Phase 2.3 Verification
- [ ] All dashboard apps follow Template A or B layout
- [ ] Sidebar widths standardized (240px)
- [ ] Filter panels standardized (320px, toggleable)
- [ ] Zero hardcoded colors in component CSS
- [ ] Zero hardcoded spacing — all use `--mj-space-*` tokens
- [ ] Component adoption at 100% for all categories
- [ ] Visual QA complete in both light and dark mode
