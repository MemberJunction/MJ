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

# Phase 2.2: Component Consolidation

**Depends on:** Phase 2.1 merged

## Goals
- Merge duplicate dialog implementations into shared bases
- Create `SelectorDialog<T>` base class for the 7 near-identical selector dialogs
- Consolidate card CSS (61 class names → `.mj-card` base with BEM modifiers)
- Consolidate badge systems (2 → 1)
- Merge 2 confirm dialog implementations into 1 `<mj-confirm-dialog>`

## Work Items

### 1. Unified `<mj-confirm-dialog>`
Merge two incompatible implementations:
- `dashboard-viewer/confirm-dialog` (camelCase API)
- `entity-viewer/confirm-dialog` (PascalCase API)

Target: Single `<mj-confirm-dialog>` in `ng-ui-components` with PascalCase API, `role="alertdialog"`, `aria-describedby`.

### 2. `SelectorDialog<T>` Base Class
Seven selector dialogs all implement: search with debounce, optional category filter, grid/list toggle, selection state, result emission.

| Dialog | Entity |
|--------|--------|
| `template-selector-dialog` | Templates |
| `prompt-selector-dialog` | AI Prompts |
| `sub-agent-selector-dialog` | AI Agents |
| `entity-selector-dialog` | Entities |
| `record-selector-dialog` | Any record |
| `mj-find-record-dialog` | Any record |
| `view-selector` | Views |

Target: Generic base with configurable `EntityName`, `SearchFields`, `DisplayColumns`, `MultiSelect`, `FilterFields`. Refactor at least 3 selectors to extend the base.

### 3. Card CSS Consolidation
- 61 card class names → `.mj-card` base with BEM modifiers (`.mj-card--stat`, `.mj-card--action`)
- Remove duplicated card styles from individual component CSS

### 4. Badge System Consolidation
- Merge `_badges.scss` and `_shared-patterns.scss` badge rules into single system

## Phase 2.2 Verification
- [ ] Single `<mj-confirm-dialog>` implementation; old two deleted
- [ ] `SelectorDialog<T>` base exists; 3+ selectors refactored
- [ ] Card classes consolidated to `.mj-card` base
- [ ] Badge system in single file
- [ ] All downstream packages build

---

# Phase 2.3: IA/Layout Standardization & Visual Consistency

**Depends on:** Phase 2.2 merged

## Goals
- Build shared layout components (`mj-page-header`, `mj-empty-state`)
- Apply consistent page structure templates across all apps
- Standardize sidebar widths, filter panel behavior, header patterns
- Fix remaining token inconsistencies
- Full visual QA

## Work Items

### 1. Build `<mj-page-header>`
```html
<mj-page-header
  Icon="fa-solid fa-robot"
  Title="Agent Configuration"
  [Subtitle]="agentCount + ' agents'"
  [FilterToggle]="true"
  (FilterToggled)="toggleFilter()">
  <button mjButton variant="primary" (click)="newAgent()">New Agent</button>
</mj-page-header>
```

### 2. Build `<mj-empty-state>`
```html
<mj-empty-state
  Icon="fa-solid fa-folder-open"
  Title="No Items Found"
  Description="Create your first item to get started."
  ActionLabel="Create Item"
  (Action)="createItem()">
</mj-empty-state>
```

### 3. Apply Layout Templates

**Template A: Sidebar + Content** — Settings, Credentials, Communication, Testing
**Template B: Filter + Content** — AI Configuration, AI Agents, MCP, Data Explorer

Standards:
| Element | Standard |
|---------|----------|
| Header | `<mj-page-header>` with icon + title + optional subtitle |
| Sidebar width | 240px fixed |
| Filter panel width | 320px, toggleable |
| View mode toggle | Always in header right |
| Empty states | `<mj-empty-state>` (replace 30+ ad-hoc implementations) |

### 4. Token Consistency Pass

| UI Element | Background | Text | Border |
|-----------|-----------|------|--------|
| Page | `--mj-bg-page` | — | — |
| Sidebar | `--mj-bg-surface` | `--mj-text-primary` | `--mj-border-default` |
| Content area | `--mj-bg-surface-card` | `--mj-text-primary` | — |
| Cards | `--mj-bg-surface` | `--mj-text-primary` | `--mj-border-default` |
| Page header | `--mj-bg-surface` | `--mj-text-primary` | `--mj-border-default` |
| Dialogs | `--mj-bg-surface` | `--mj-text-primary` | — |

### 5. Visual QA
- Verify every major page in light mode
- Verify every major page in dark mode
- Check: consistent headers, spacing, colors across all apps

## Phase 2.3 Verification
- [ ] `<mj-page-header>` applied to all dashboard apps
- [ ] `<mj-empty-state>` replaces all ad-hoc empty states
- [ ] Sidebar widths standardized (240px)
- [ ] Filter panels standardized (320px, toggleable)
- [ ] Zero token inconsistencies across dashboards
- [ ] Visual QA complete in both themes
