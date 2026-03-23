# Phase 2: Kendo Removal, Component Consolidation, IA Standardization & Visual Consistency

**Date:** March 18, 2026
**Status:** In progress
**Depends on:** Phase 1 (design token migration) - COMPLETE
**Timeline:** 3 weeks (one phase per week), each phase independently mergeable

---

## Overview

Phase 2 has four interleaved workstreams:

| # | Workstream | Problem | Goal |
|---|-----------|---------|------|
| 1 | **Kendo Removal** | ~1,100 Kendo instances, $$ license, 2MB bundle, 1,348-line override file | Zero `@progress/*` dependencies |
| 2 | **Component Consolidation** | 63 dialog components, 7 selector dialogs, 3 button systems, 61 card class names | Reusable base components, eliminate duplication |
| 3 | **IA/Layout Standardization** | Every app has different header, search, sidebar, and navigation patterns | Shared page structure templates across all apps |
| 4 | **Color/Token Consistency** | Apps use different tokens for the same semantic purpose (e.g., dashboard headers: some `--mj-brand-primary`, others `--mj-bg-surface`) | Same UI element = same token everywhere |

### Strategy
Custom MJ components + AG Grid. No PrimeNG, no Angular Material. New components live in `@memberjunction/ng-ui-components`.

### Reference Documents
- `plans/kendo-removal-plan.md` — 11-phase Kendo replacement plan with component APIs
- `packages/Angular/Generic/shared/src/lib/_tokens.scss` — Design token definitions
- `guides/DASHBOARD_BEST_PRACTICES.md` — Dashboard architecture patterns

### Implementation Rules (All New Components)

These rules apply to every component and service built in `ng-ui-components`:

1. **Standalone components** — All new components use `standalone: true` with explicit `imports` arrays. The `UIComponentsModule` re-exports them for convenience but does not declare them.
2. **`inject()` for DI** — Use `inject()` function, not constructor injection.
3. **PascalCase for public members** — All `@Input()`, `@Output()`, and public methods use PascalCase (e.g., `Title`, `Variant`, `Size`). Private/protected use camelCase.
   - **Exception:** `mjButton` directive uses lowercase `variant`/`size` for migration convenience (matches HTML attribute convention for directives).
4. **Setter-based `@Input()` change detection** — Use getter/setter pattern for inputs that trigger reactions, not `ngOnChanges`.
5. **`@Injectable({ providedIn: 'root' })` for services** — `MJDialogService` and `MJFloatingPanelService` use Angular DI, not `BaseSingleton`. These are UI-scoped services that need Angular's `ViewContainerRef` and injection context. `BaseSingleton` is for cross-process infrastructure singletons only.
6. **No re-exports** — `public-api.ts` exports only code defined in `ng-ui-components`. Consumers import `@memberjunction/ng-shared-generic`, `@angular/cdk`, etc. directly.
7. **`--mj-*` semantic tokens only** — Zero hardcoded hex colors, zero primitive tokens (`--mj-color-*`). All styling through semantic design tokens.
8. **Modern template syntax** — `@if`/`@for`/`@switch`, not `*ngIf`/`*ngFor`.
9. **No `any` types** — Use proper generics (`SelectorDialog<T>`, `MJDialogRef<R>`).
10. **`SelectorDialog<T>` state pattern** — Receives state via `@Input()`, emits via `@Output()`. Services for data loading only, not UI state. Local UI state (search text, filter, view mode) managed internally with getter/setters.

### Accessibility (A11y) Requirements

All new components must meet **WCAG 2.1 AA** standards. The current codebase has moderate aria coverage but gaps in keyboard nav, focus management, and semantic HTML. New components raise the bar:

**Keyboard Navigation:**
- All interactive components fully operable via keyboard (no mouse required)
- `mj-dropdown` / `mj-combobox`: Arrow keys to navigate options, Enter to select, Escape to close, Home/End for first/last
- `mj-datepicker`: Arrow keys to navigate calendar grid, Enter to select date, Escape to close popup
- `mj-dialog`: Tab cycles through focusable elements (trapped), Escape to close
- `mj-accordion`: Enter/Space to toggle panels, arrow keys to move between panel headers
- `mj-splitter`: Arrow keys to resize panes when divider is focused
- `mj-context-menu`: Arrow keys to navigate items, Enter to select, Escape to close
- `mjButton` with `[Toggleable]`: Space/Enter to toggle state

**ARIA Attributes:**
- `mj-dropdown`: `role="listbox"`, `aria-expanded`, `aria-activedescendant`, `aria-haspopup="listbox"`, options have `role="option"` + `aria-selected`
- `mj-combobox`: `role="combobox"`, `aria-autocomplete="list"`, `aria-controls` pointing to listbox
- `mj-dialog`: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to title
- `mj-confirm-dialog`: `role="alertdialog"`, `aria-describedby` pointing to message
- `mj-accordion`: Panel headers have `role="button"` or use `<button>`, `aria-expanded`, `aria-controls` pointing to panel content; content has `role="region"` + `aria-labelledby`
- `mj-switch`: `role="switch"`, `aria-checked`
- `mj-datepicker`: Calendar grid uses `role="grid"`, cells have `role="gridcell"`, `aria-selected` for chosen date
- `mj-page-header`: Uses semantic `<header>` element
- `mj-empty-state`: Uses `role="status"` for screen reader announcement

**Focus Management:**
- `mj-dialog`: Focus moves to dialog on open, restores to trigger element on close. Uses CDK `FocusTrapModule`
- `mj-dropdown` / `mj-combobox`: Focus returns to input when popup closes
- `mj-datepicker`: Focus returns to input when calendar closes
- `mj-context-menu`: Focus returns to trigger on close
- Visible focus indicators on all interactive elements via `--mj-focus-ring` token (`0 0 0 var(--mj-ring-offset) var(--mj-bg-surface), 0 0 0 calc(var(--mj-ring-offset) + var(--mj-ring-width)) var(--mj-ring-color)`)

**Screen Reader Support:**
- All icon-only buttons have `aria-label` (not just `title`)
- Decorative icons use `aria-hidden="true"` (already standard in MJ)
- Loading states announced via `aria-live="polite"` regions
- Error/validation messages associated via `aria-describedby`

**Reduced Motion:**
- All animations respect `@media (prefers-reduced-motion: reduce)` — already supported in `_utilities.scss`
- New component animations use CSS transitions (not JS-driven) so the existing media query applies automatically

### Mobile Responsiveness Requirements

The shell already handles mobile basics (hamburger menu, drawer nav, 768px breakpoint). New components must work within this framework:

**Touch Targets:**
- All interactive elements (buttons, dropdown triggers, accordion headers, splitter handles) have a minimum touch target of **44x44px** (WCAG 2.5.5 AAA / 2.5.8 AA in 2.2)
- `mjButton` size `sm` must still meet 44px minimum height on touch devices (use `@media (pointer: coarse)` to increase if needed)

**Responsive Behavior:**
- `mj-dropdown` / `mj-combobox` popup: Full-width on screens < 768px, positioned popup on desktop
- `mj-datepicker` calendar: Full-width overlay on mobile, positioned popup on desktop
- `mj-dialog`: Full-screen on mobile (< 768px), centered with `max-width` on desktop. Size presets (sm/md/lg/xl) only apply on desktop
- `mj-splitter`: Collapse to stacked layout on mobile (vertical panes stack, remove resize handles)
- `mj-page-header`: Title + subtitle stack vertically on mobile, controls wrap to second row if needed
- `mj-accordion`: Full-width by default, works naturally on all screen sizes
- `mj-context-menu`: Uses CDK Overlay `flexibleConnectedTo` with fallback positions

**Breakpoints (consistent with existing shell):**
- Mobile: < 768px
- Tablet: 768px - 1024px (new — add where beneficial)
- Desktop: > 1024px

**Existing Patterns to Preserve:**
- `.desktop-only` / `.mobile-only` CSS utility classes
- `@media (prefers-reduced-motion: reduce)` in `_utilities.scss`
- `@media (prefers-contrast: high)` in `_utilities.scss`
- Shell hamburger menu and drawer nav at 768px

---

## Weekly Phase Summary

| Phase | Week | Focus | Kendo Removed | Deliverables |
|-------|------|-------|---------------|-------------|
| **2.1** | 1 | Foundation, buttons, form controls, dropdowns, date picker, token consistency | `ButtonsModule`, `InputsModule`, `IndicatorsModule`, `DropDownsModule`, `DateInputsModule` | `ng-ui-components` package, `mjButton`, form controls, `mj-dropdown`, `mj-combobox`, `mj-datepicker`, all token inconsistencies fixed |
| **2.2** | 2 | Dialogs, component consolidation, accordion, splitter, floating panel | `DialogModule`, `LayoutModule` | `mj-dialog`, `MJDialogService`, unified confirm dialog, `SelectorDialog<T>`, `mj-accordion`, `mj-splitter`, card/badge consolidation |
| **2.3** | 3 | Layout components, IA standardization, small components, grid migration, final cleanup | Everything remaining | `mj-page-header`, `mj-empty-state`, layout templates applied, zero Kendo deps, visual QA complete |

---

# Phase 2.1: Foundation + All Form-Level Components + Token Consistency

**Branch:** `feature/phase-2.1-foundation`
**Merge target:** `next`

## Goals
- Scaffold `@memberjunction/ng-ui-components` package
- Replace all `kendoButton` instances (~399 across 80 files)
- Replace Kendo form controls: `textbox`, `numerictextbox`, `switch`, `checkbox`, `progressbar` (~80 instances)
- Replace Kendo dropdowns and comboboxes (~82 instances across 33 files)
- Replace Kendo date pickers (~5 instances across 3 files)
- Consolidate 3 button CSS systems into 1
- Fix all color/token inconsistencies across dashboards (Workstream 4)

## Work Items

### 1. Scaffold `ng-ui-components` package
- Create `packages/Angular/Generic/ui-components/` with:
  - `package.json` — name: `@memberjunction/ng-ui-components`, deps on `ng-shared-generic` + `@angular/cdk` (already at v21.1.3 in the repo)
  - `tsconfig.json` — extends `tsconfig.angular.json`
  - `src/public-api.ts` — entry point (exports only code defined in this package)
  - `src/lib/ui-components.module.ts` — NgModule that re-exports standalone components for convenience
- All components are `standalone: true` with explicit `imports` arrays
- The module simply imports and re-exports them so consumers can use either pattern

### 2. Build `mjButton` directive
- **File:** `src/lib/button/button.directive.ts`
- Inputs: `[variant]` (`primary`|`secondary`|`outline`|`flat`|`danger`|`icon`), `[size]` (`sm`|`md`|`lg`), `[toggleable]`, `[selected]`
- SCSS with `--mj-*` tokens for all states (hover, active, focus, disabled)
- Consolidate `.mj-btn-*`, `.action-btn*`, `.control-btn*` into single `.mj-btn` base

### 3. Bulk button migration
- Replace `kendoButton` -> `mjButton` across ~80 HTML files
- Attribute mapping:
  - `themeColor="primary"` -> `variant="primary"`
  - `themeColor="base"` -> `variant="secondary"`
  - `themeColor="error"` -> `variant="danger"`
  - `themeColor="info"` -> `variant="primary"`
  - `fillMode="outline"` -> `variant="outline"`
  - `fillMode="flat"` -> `variant="flat"`
  - `size="small"` -> `size="sm"`
  - `size="large"` -> `size="lg"`
- Remove `ButtonsModule` imports from all Angular modules (~15 modules)
- Remove `.action-btn*` and `.control-btn*` CSS classes from `_shared-patterns.scss`

### 4. Build form controls
- `mj-numeric-input` — `ControlValueAccessor`, `[min]`, `[max]`, `[step]`, `[format]`, `[decimals]`
- `mj-switch` — `ControlValueAccessor`, `[onLabel]`, `[offLabel]`
- `mj-checkbox` — `ControlValueAccessor`
- `mj-progress-bar` — native `<progress>` + MJ styling
- Replace across ~50 files
- Remove `InputsModule`, `IndicatorsModule` imports

### 5. Build `<mj-dropdown>` + `<mj-combobox>`
- CDK Overlay for popup positioning
- `[data]`, `[textField]`, `[valueField]`, `[filterable]`, `(filterChange)`, `[(ngModel)]`
- `[valuePrimitive]` — emit value vs. whole object
- Item templates via `<ng-template mjDropdownItem>`
- Keyboard navigation (arrow keys, Enter, Escape)
- `<mj-combobox>` extends dropdown with `[allowCustom]` + free-text entry
- Replace ~80 `<kendo-dropdownlist>` + ~2 `<kendo-combobox>` instances across ~33 files
- Update `mj-form-field` template in `base-forms` to use new components
- Remove `DropDownsModule` imports

### 6. Build `<mj-datepicker>`
- Calendar popup via CDK Overlay
- `[(ngModel)]`, `[min]`, `[max]`, `[format]`, `[placeholder]`
- Month/year navigation, keyboard nav
- Replace ~5 instances across ~3 files
- Remove `DateInputsModule` imports

### 7. Token consistency pass

Fix all dashboard token inconsistencies identified in Workstream 4:

| File | Issue | Fix |
|------|-------|-----|
| `scheduling-dashboard.component.css` | Header: `--mj-brand-primary` bg | -> `--mj-bg-surface` |
| `query-browser-resource.component.css` | Header: `--mj-brand-primary` bg | -> `--mj-bg-surface` |
| `scheduling-dashboard.component.css` | Content: `--mj-bg-surface-sunken` | -> `--mj-bg-surface-card` |
| `scheduling-dashboard.component.css` | Sidebar: `--mj-bg-surface-card` | -> `--mj-bg-surface` |
| `home-dashboard.component.css` | Primitive tokens (3 instances) | -> semantic equivalents |
| `data-explorer-dashboard.component.html` | Inline hex colors | -> CSS custom properties |
| `agent-configuration.component.css` | Mixed primary/accent | -> follow brand token rules |

Token standards applied everywhere:

| UI Element | Background | Text | Border |
|-----------|-----------|------|--------|
| **Page** | `--mj-bg-page` | — | — |
| **Sidebar** | `--mj-bg-surface` | `--mj-text-primary` | `--mj-border-default` (right edge) |
| **Content area** | `--mj-bg-surface-card` | `--mj-text-primary` | — |
| **Cards** | `--mj-bg-surface` | `--mj-text-primary` | `--mj-border-default` |
| **Page header** | `--mj-bg-surface` | `--mj-text-primary` | `--mj-border-default` (bottom) |
| **Primary button** | `--mj-brand-primary` | `--mj-brand-on-primary` | `--mj-brand-primary` |
| **Dialogs** | `--mj-bg-surface` | `--mj-text-primary` | — |
| **Filter panel** | `--mj-bg-surface` | `--mj-text-primary` | `--mj-border-default` (right edge) |
| **Detail overlay** | `--mj-bg-surface-elevated` | `--mj-text-primary` | `--mj-border-default` (left edge) |
| **Status: success** | `--mj-status-success-bg` | `--mj-status-success-text` | `--mj-status-success-border` |
| **Status: warning** | `--mj-status-warning-bg` | `--mj-status-warning-text` | `--mj-status-warning-border` |
| **Status: error** | `--mj-status-error-bg` | `--mj-status-error-text` | `--mj-status-error-border` |

Brand token rules documented:
- `--mj-brand-primary` = Primary actions, main CTAs, active nav, focus rings, links
- `--mj-brand-accent` = Highlights, expanded card borders, selected indicators, accent decorations
- `--mj-brand-tertiary` = Secondary actions needing visual distinction from primary

## Verification
- [ ] `npm run build` in `ui-components/` passes
- [ ] All downstream packages build
- [ ] Zero `kendoButton` / `<kendo-dropdownlist>` / `<kendo-combobox>` / `<kendo-datepicker>` references remain
- [ ] Zero `ButtonsModule` / `InputsModule` / `IndicatorsModule` / `DropDownsModule` / `DateInputsModule` imports remain
- [ ] All dashboard headers use `--mj-bg-surface` (no dark blue bars)
- [ ] All content areas use `--mj-bg-surface-card`
- [ ] All sidebars use `--mj-bg-surface`
- [ ] Zero primitive tokens (`--mj-color-*`) in component CSS
- [ ] Zero inline hex colors in templates
- [ ] Buttons and dropdowns render correctly in light and dark mode
- [ ] Dropdowns position correctly in scrollable containers and near viewport edges
- [ ] `mj-dropdown`: fully keyboard navigable (arrow keys, Enter, Escape, Home/End)
- [ ] `mj-dropdown`: has `role="listbox"`, `aria-expanded`, `aria-activedescendant`
- [ ] `mj-switch`: has `role="switch"` and `aria-checked`
- [ ] `mj-numeric-input`: has associated label or `aria-label`
- [ ] All icon-only buttons have `aria-label`
- [ ] All interactive elements have visible focus indicator (`--mj-focus-ring`)
- [ ] All touch targets >= 44px on touch devices
- [ ] Dropdowns render full-width on mobile (< 768px)

## Kendo Packages Removable
- `@progress/kendo-angular-buttons`
- `@progress/kendo-angular-inputs`
- `@progress/kendo-angular-indicators`
- `@progress/kendo-angular-progressbar`
- `@progress/kendo-angular-dropdowns`
- `@progress/kendo-angular-dateinputs`

---

# Phase 2.2: Dialogs + Consolidation + Accordion + Splitter

**Branch:** `feature/phase-2.2-dialogs-layout`
**Depends on:** Phase 2.1 merged

## Goals
- Build MJ dialog system (replaces `<kendo-dialog>` + `DialogService`)
- Merge 2 confirm dialog implementations into 1
- Create `SelectorDialog<T>` base (replaces 7 near-identical selector dialogs)
- Consolidate card CSS classes (61 -> `.mj-card` base) and badge systems (2 -> 1)
- Replace Kendo accordion/panelbar (~43 instances)
- Replace Kendo splitter (~25 instances)
- Replace Kendo window (~12 instances) — most become dialogs, 2-3 become floating panels

## Work Items

### 1. Build `<mj-dialog>` + `MJDialogService`
- `<mj-dialog>` is a **standalone component** using native `<dialog>` element + CDK `FocusTrapModule`
- Inputs (PascalCase): `[Visible]`, `[Title]`, `[Width]`, `[Height]`, `[Closeable]`, `(Close)`
- `<mj-dialog-actions>` standalone component for button area (content projection)
- Focus trapping, ESC to close, click-outside-to-close
- `::backdrop` pseudo-element for overlay
- Size presets: `sm` (400px) | `md` (600px) | `lg` (800px) | `xl` (1000px)
- `MJDialogService` is `@Injectable({ providedIn: 'root' })` — NOT `BaseSingleton` (needs Angular DI context for `ViewContainerRef`)
- `MJDialogService.open({ content, title, width, height })` -> `MJDialogRef<R>`
- `MJDialogRef<R>.result` observable (API-compatible with Kendo's `DialogRef.result`)
- `MJDialogRef<R>.close(result)` method
- All components use `inject()` for DI, `@if`/`@for` template syntax, `--mj-*` tokens only

### 2. Unified `<mj-confirm-dialog>`
Merge two incompatible implementations:

| Current | Selector | API Style |
|---------|----------|-----------|
| `dashboard-viewer/confirm-dialog` | `mj-confirm-dialog` | camelCase: `visible`, `type`, `title`, `message` |
| `entity-viewer/confirm-dialog` | `mj-ev-confirm-dialog` | PascalCase: `IsOpen`, `Title`, `Message`, `ConfirmStyle` |

Target: Single standalone `<mj-confirm-dialog>` in `ng-ui-components` with PascalCase API (MJ convention). Takes the entity-viewer version's features (`DetailMessage`, `ConfirmStyle`) as the superset. Uses `inject()`, setter-based inputs, `--mj-*` tokens.

### 3. Bulk dialog migration
- Replace ~58 `<kendo-dialog>` template usages across 23 files
- Replace ~117 `DialogService`/`DialogRef` TypeScript references across 43 files
- Refactor `GenericDialogComponent` to use new dialog system
- Apply size presets to all 50+ feature-specific dialogs
- Ensure consistent button placement (primary LEFT, cancel RIGHT)

### 4. `SelectorDialog<T>` base class
Seven selector dialogs all implement: search with debounce, optional category filter, grid/list toggle, selection state tracking, result emission.

| Dialog | Entity |
|--------|--------|
| `template-selector-dialog` | Templates |
| `prompt-selector-dialog` | AI Prompts |
| `sub-agent-selector-dialog` | AI Agents |
| `entity-selector-dialog` | Entities |
| `record-selector-dialog` | Any record |
| `mj-find-record-dialog` | Any record |
| `view-selector` | Views |

Target: Generic base with configurable `EntityName`, `SearchFields`, `DisplayColumns`, `MultiSelect`, `FilterFields` (all PascalCase `@Input()`). Selection state communicated via `@Output() SelectionChanged`. Internal UI state (search text, filter value, view mode) managed locally with getter/setters. Data loading uses `RunView` directly, not shared Angular services. Refactor at least 3 selectors to extend the base.

### 5. Card and badge consolidation
- Consolidate 61 card class names in `_shared-patterns.scss` to `.mj-card` base. Semantic names become BEM modifiers (`.mj-card--stat`) or are removed if they add no styling
- Merge `_badges.scss` badge system and `_shared-patterns.scss` badge rules into single system

### 6. Build `<mj-accordion>`
- `[expanded]`, `[title]`, content projection
- CSS animation for smooth expand/collapse
- Replace ~43 `<kendo-panelbar>` instances across 5 heavy files:
  - `ai-agent-form.component.html` (11 items)
  - `ai-agent-run.component.html` (10 items)
  - `ai-prompt-run-form.component.html` (9 items)

### 7. Build `<mj-splitter>`
- CSS resize handles + pointer events
- `[orientation]` (horizontal/vertical), `[size]` (%, px), `[min]`/`[max]`, `[collapsible]`
- Nested splitter support
- Replace ~25 instances across 8 files

### 8. Floating panel / window replacement
- Convert most `<kendo-window>` usages to `MJDialogService`
- Build `MJFloatingPanelService` — `@Injectable({ providedIn: 'root' })`, NOT `BaseSingleton` (needs Angular DI context)
- Uses CDK Overlay + CDK DragDrop, only for 2-3 cases needing drag/resize:
  - AI test harness
  - Communication window
  - Dashboard share dialog
- Replace all `WindowService`/`WindowRef` usages

## Verification
- [ ] All downstream packages build
- [ ] Zero `<kendo-dialog>` / `DialogService` / `DialogRef` / `<kendo-panelbar>` / `<kendo-splitter>` / `<kendo-window>` references remain
- [ ] Zero `DialogModule` / `LayoutModule` / `WindowService` imports remain
- [ ] Single `<mj-confirm-dialog>` implementation; old two deleted
- [ ] `SelectorDialog<T>` base exists; 3+ selectors refactored
- [ ] Card classes consolidated to `.mj-card` base
- [ ] Badge system in single file
- [ ] Dialogs open/close correctly, focus trap works, ESC dismisses
- [ ] All dialogs use size presets (sm/md/lg/xl)
- [ ] Accordion expand/collapse animates smoothly
- [ ] Splitter resize works, including nested splitters
- [ ] `mj-dialog`: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` present
- [ ] `mj-confirm-dialog`: `role="alertdialog"`, `aria-describedby` present
- [ ] `mj-dialog`: Focus trapped inside, restores to trigger on close
- [ ] `mj-accordion`: Panels toggleable via Enter/Space, arrow keys between headers, `aria-expanded` + `aria-controls`
- [ ] `mj-splitter`: Divider focusable and resizable via arrow keys
- [ ] `mj-dialog`: Full-screen on mobile (< 768px), centered on desktop
- [ ] `mj-splitter`: Stacks vertically on mobile
- [ ] Animations respect `prefers-reduced-motion`

## Kendo Packages Removable
- `@progress/kendo-angular-dialog`
- `@progress/kendo-angular-layout`

---

# Phase 2.3: Layout Components + IA Standardization + Final Cleanup

**Branch:** `feature/phase-2.3-ia-cleanup`
**Depends on:** Phase 2.2 merged

## Goals
- Build shared layout components (`mj-page-header`, `mj-empty-state`)
- Apply IA standardization templates across all dashboard apps
- Replace all remaining Kendo components (context menu, listbox, file select, label, tooltip, notification, listview)
- Migrate 5 remaining Kendo grids to AG Grid
- Delete `kendo-modules` package, `_kendo-theme-override.scss`, and ALL `@progress/*` dependencies
- Full visual QA in both themes

## Work Items

### 1. Build `<mj-page-header>` + `<mj-empty-state>`

**`<mj-page-header>`:**
```html
<mj-page-header
  Icon="fa-solid fa-robot"
  Title="Agent Configuration"
  [Subtitle]="agentCount + ' agents'"
  [FilterToggle]="true"
  (FilterToggled)="toggleFilter()">
  <!-- Right-side controls projected here -->
  <button mjButton variant="primary" (click)="newAgent()">New Agent</button>
</mj-page-header>
```

**`<mj-empty-state>`:**
```html
<mj-empty-state
  Icon="fa-solid fa-folder-open"
  Title="No Items Found"
  Description="Create your first item to get started."
  ActionLabel="Create Item"
  (Action)="createItem()">
</mj-empty-state>
```

### 2. IA standardization — apply layout templates

Apply `<mj-page-header>` to all dashboards. Standardize sidebar widths. Ensure consistent filter panel behavior.

**Template A: Sidebar + Content** — apply to:

| App | Change |
|-----|--------|
| Settings | Add `<mj-page-header>`, standardize sidebar to 240px |
| Credentials | Add `<mj-page-header>`, standardize sidebar to 240px |
| Communication | Remove custom branded toolbar, use standard `<mj-page-header>` |
| Testing | Add `<mj-page-header>`, standardize nav layout |

**Template B: Filter + Content** — apply to:

| App | Change |
|-----|--------|
| AI Configuration | Standardize header to `<mj-page-header>` |
| AI Agents | Standardize header to `<mj-page-header>` |
| MCP | Standardize header to `<mj-page-header>` |
| Data Explorer | Already close — minor header alignment |

**Standards applied:**

| Element | Standard |
|---------|----------|
| Header | `<mj-page-header>` with icon + title + optional subtitle |
| Sidebar width | Fixed: 240px |
| Filter panel width | 320px, toggleable via header button |
| View mode toggle | Always in header right, consistent icon set |
| Empty states | `<mj-empty-state>` component (replace 30+ ad-hoc implementations) |
| Mobile | Sidebar layouts collapse to hamburger + drawer |

Home page and Component Studio keep their unique layouts (intentionally different).

### 3. Remaining small Kendo components

| Component | Instances | Approach |
|-----------|-----------|----------|
| `<kendo-contextmenu>` | 4 in 1 file | `<mj-context-menu>` using CDK Overlay |
| `<kendo-listbox>` | 4 in 1 file | `<mj-listbox>` with dual-list transfer |
| `<kendo-fileselect>` | Few | `<mj-file-select>` — native `<input type="file">` + drag zone |
| `<kendo-label>` | 8 | Replace with native `<label>` |
| `kendoTooltip` | 4 | `mjTooltip` directive or CSS `title` attribute |
| `NotificationService` | 1 wrapper | Extract toast from conversations package |
| `<kendo-listview>` | 2 in 1 file | `@for` loop + custom styling |

### 4. Kendo Grid -> AG Grid

| File | Complexity | Notes |
|------|-----------|-------|
| `ng-query-grid.component.html` | Low | Already deprecated |
| `find-record.component.html` | Low | Simple search results |
| `files-grid.html` | Medium | Custom cell templates for file icons/sizes |
| `join-grid.component.html` | Medium | Join relationship grid |
| `template-params-grid.component.html` | High | Inline editing with add/remove rows |

### 5. Final cleanup
1. Delete `packages/Angular/Explorer/kendo-modules/` package entirely
2. Delete `_kendo-theme-override.scss` (1,348 lines)
3. Remove `@import '@progress/kendo-theme-default/scss/all'` from `styles.scss`
4. Remove ALL `@progress/*` from every `package.json` (26 packages):
   - 20 `@progress/kendo-angular-*` modules
   - `@progress/kendo-theme-default`, `kendo-data-query`, `kendo-drawing`, `kendo-svg-icons`, `kendo-licensing`
5. Remove stale `primeng` peer dep from `base-forms`
6. Remove all `.k-*` CSS class references from component stylesheets
7. Update CodeGen templates to emit `UIComponentsModule` instead of `LayoutModule`
8. `npm install` at repo root
9. Full build

### 6. Visual QA
- Verify every major page in light mode
- Verify every major page in dark mode
- Check: consistent headers, spacing, colors across all apps
- Check: AG Grid theme toggle works
- Check: Loading screen matches chosen theme
- Fix any remaining visual inconsistencies

## Verification

### Kendo Removal
- [ ] Zero `@progress/kendo-*` imports remain in any file
- [ ] Zero `.k-*` CSS class references remain
- [ ] `_kendo-theme-override.scss` deleted
- [ ] `kendo-modules` package deleted
- [ ] No stale `primeng` peer dep remains
- [ ] CodeGen emits `UIComponentsModule` instead of `LayoutModule`

### IA Standardization
- [ ] All dashboard pages have `<mj-page-header>` with consistent structure
- [ ] Sidebar-based apps use 240px width
- [ ] Filter panels use 320px, toggle from header
- [ ] View mode toggles in consistent location (header right)
- [ ] Empty states use `<mj-empty-state>` component

### Accessibility
- [ ] All new components keyboard-navigable (no mouse required)
- [ ] All ARIA attributes present per Implementation Rules
- [ ] Focus management correct (trap in dialogs, restore on close)
- [ ] All icon-only buttons have `aria-label`
- [ ] Visible focus indicators on all interactive elements
- [ ] `mj-page-header` uses semantic `<header>` element
- [ ] `mj-empty-state` uses `role="status"`
- [ ] Animations respect `prefers-reduced-motion`

### Mobile Responsiveness
- [ ] All pages usable on 375px viewport (iPhone SE)
- [ ] Dialogs full-screen on mobile
- [ ] Dropdowns/datepicker full-width on mobile
- [ ] Splitters stack vertically on mobile
- [ ] Touch targets >= 44px on touch devices
- [ ] Page headers wrap gracefully on narrow screens

### Overall
- [ ] `npm run build` from repo root passes
- [ ] All pages render correctly in light mode
- [ ] All pages render correctly in dark mode
- [ ] AG Grid responds to theme toggle
- [ ] Loading screen matches chosen theme

---

## Appendix A: Kendo Replacement Component APIs

### Button Directive Mapping

| Kendo | MJ | Notes |
|-------|-----|-------|
| `kendoButton` | `mjButton` | Directive selector |
| `themeColor="primary"` | `variant="primary"` | |
| `themeColor="base"` | `variant="secondary"` | Renamed |
| `themeColor="error"` | `variant="danger"` | Common convention |
| `themeColor="info"` | `variant="primary"` | Collapsed |
| `themeColor="success"` | `variant="success"` | |
| `themeColor="warning"` | `variant="warning"` | |
| `fillMode="outline"` | `variant="outline"` | |
| `fillMode="flat"` | `variant="flat"` | |
| `size="small"` | `size="sm"` | Shortened |
| `size="large"` | `size="lg"` | Shortened |
| (no size) | `size="md"` | Default, implicit |
| `[toggleable]="true"` | `[toggleable]="true"` | Same |
| `[selected]="cond"` | `[selected]="cond"` | Same |
| `[primary]="true"` | `variant="primary"` | Legacy removed |
| `[look]="'flat'"` | `variant="flat"` | Legacy removed |
| `[icon]="'close'"` | Use `<i class="fa-solid fa-xmark">` inside button | Kendo icons gone |

### Dialog Mapping

| Kendo | MJ |
|-------|-----|
| `<kendo-dialog>` | `<mj-dialog>` |
| `[title]` | `[title]` |
| `[width]` / `[height]` | `[width]` / `[height]` |
| `(close)` | `(close)` |
| `<kendo-dialog-titlebar>` | `[title]` input or `<ng-template mjDialogTitle>` |
| `<kendo-dialog-actions>` | `<mj-dialog-actions>` |
| `DialogService.open()` | `MJDialogService.open()` -> `MJDialogRef` |
| `DialogRef.result` | `MJDialogRef.result` (observable) |
| `DialogRef.close()` | `MJDialogRef.close()` |

### Dropdown Mapping

| Kendo | MJ |
|-------|-----|
| `<kendo-dropdownlist>` | `<mj-dropdown>` |
| `[data]` | `[data]` |
| `[textField]` | `[textField]` |
| `[valueField]` | `[valueField]` |
| `[filterable]` | `[filterable]` |
| `(filterChange)` | `(filterChange)` |
| `[(ngModel)]` / `[(value)]` | `[(ngModel)]` |
| `[valuePrimitive]` | `[valuePrimitive]` |
| `<ng-template kendoDropDownListItemTemplate>` | `<ng-template mjDropdownItem>` |

### Accordion Mapping

| Kendo | MJ |
|-------|-----|
| `<kendo-panelbar>` | `<mj-accordion>` |
| `<kendo-panelbar-item>` | `<mj-accordion-panel>` |
| `[title]` | `[title]` |
| `[expanded]` | `[expanded]` |

### Splitter Mapping

| Kendo | MJ |
|-------|-----|
| `<kendo-splitter>` | `<mj-splitter>` |
| `<kendo-splitter-pane>` | `<mj-splitter-pane>` |
| `[orientation]` | `[orientation]` |
| `[size]` | `[size]` |
| `[min]` / `[max]` | `[min]` / `[max]` |
| `[collapsible]` | `[collapsible]` |

---

## Appendix B: Current IA Patterns (Audit Results)

Every major app uses a different combination of headers, search, navigation, and content layout:

| App | Header Style | Search Location | Navigation | Content Layout |
|-----|-------------|----------------|------------|----------------|
| **Home** | Greeting (no toolbar) | None (global only) | None (card grid) | Cards + collapsible right sidebar |
| **AI Configuration** | Icon + title + filter toggle + view toggle | Left filter panel | Left filter panel (splitter) | Splitter: filter \| cards/list \| detail overlay |
| **AI Agents** | Icon + title + filter + 3 view modes + "New" btn | Left filter panel | Left filter panel (splitter) | Splitter: filter \| cards/list/tree |
| **Settings** | Mobile hamburger only | Top of sidebar | Left sidebar with sections | Sidebar + tab content |
| **Credentials** | Icon + title + badge | None | Left sidebar with sections | Sidebar + tab content |
| **Communication** | Brand logo + title + refresh | None | Left sidebar with sections | Sidebar + tab content |
| **MCP** | Icon + title + filter + inline tabs | Left filter panel | Header inline tabs | Filter panel + tab content |
| **Data Explorer** | Entity icon + smart filter + view toggle | Header center (inline) | Left collapsible panel | Collapsible nav + breadcrumb + content |
| **Component Studio** | Breadcrumb + status + save/export | None | Left toggleable panel | Toolbar + toggleable panel + editor |
| **Testing** | None visible | None | Left vertical nav | Vertical nav + tab content |
| **Dashboard Viewer** | Breadcrumb + share/edit buttons | None | None | Breadcrumb + tile grid |

### Target Layout Templates

**Template A: Sidebar + Content** (Settings, Credentials, Communication, Testing):
```
+--------------------------------------------------+
| [mj-page-header: Icon + Title + Badge]           |
+--------------------------------------------------+
| Sidebar (240px)  |  Content Area                  |
| ┌──────────────┐ | ┌────────────────────────────┐ |
| │ [Search]     │ | │                            │ |
| │ Section 1    │ | │  Tab Content               │ |
| │  - Item      │ | │                            │ |
| │ Section 2    │ | │                            │ |
| │  - Item      │ | │                            │ |
| └──────────────┘ | └────────────────────────────┘ |
+--------------------------------------------------+
```

**Template B: Filter + Content** (AI Config, AI Agents, MCP, Data Explorer):
```
+--------------------------------------------------+
| [mj-page-header: Icon + Title + Filter Toggle    |
|                   + Count + View Toggle + Action] |
+--------------------------------------------------+
| Filter (320px, toggleable) | Content (cards/list) |
| ┌────────────────────────┐ | ┌──────────────────┐ |
| │ Filter controls        │ | │ Grid/List/Tree   │ |
| │ Category dropdown      │ | │ view of items    │ |
| │ Status checkboxes      │ | │                  │ |
| │ [Reset Filters]        │ | │                  │ |
| └────────────────────────┘ | └──────────────────┘ |
+--------------------------------------------------+
```

Home page and Component Studio keep their unique layouts.

---

## Appendix C: Component Consolidation Detail

### Confirm Dialogs (2 -> 1)

| Implementation | Selector | API Style | Inputs |
|---------------|----------|-----------|--------|
| `dashboard-viewer/confirm-dialog` | `mj-confirm-dialog` | camelCase | `visible`, `type`, `title`, `message`, `confirmText` |
| `entity-viewer/confirm-dialog` | `mj-ev-confirm-dialog` | PascalCase | `IsOpen`, `Title`, `Message`, `ConfirmText`, `ConfirmStyle` |

### Selector Dialogs (7 -> 1 base)

| Dialog | Entity | Extra Features |
|--------|--------|----------------|
| `template-selector-dialog` | Templates | Category filter, multi/single select |
| `prompt-selector-dialog` | AI Prompts | Linked items, debounce search |
| `sub-agent-selector-dialog` | AI Agents | Agent-specific validation |
| `entity-selector-dialog` | Entities | Generic entity picker |
| `record-selector-dialog` | Any record | ListBox, move up/down |
| `mj-find-record-dialog` | Any record | Simple search |
| `view-selector` | Views | View search |

### Button Systems (3 -> 1)

| System | Classes | Where Defined |
|--------|---------|--------------|
| `.mj-btn-*` | `primary`, `secondary`, `ghost`, `danger`, `sm` | `_common.scss`, `_shared-patterns.scss` |
| `.action-btn*` | `action-btn`, `action-btn-small`, `.primary`, `.danger` | `_shared-patterns.scss` |
| `.control-btn*` | `control-btn`, `.primary`, `.danger`, `.small` | `_shared-patterns.scss` |

### Card Classes (61 -> `.mj-card` base)

All 61 semantic names apply identical base styling. Keep `.mj-card` as the single base; semantic names become BEM modifiers or are removed.

---

## Appendix D: Dependencies Removed

25+ `@progress/*` packages removed across 26 Angular package.json files:
- `@progress/kendo-angular-buttons`
- `@progress/kendo-angular-dialog`
- `@progress/kendo-angular-dropdowns`
- `@progress/kendo-angular-inputs`
- `@progress/kendo-angular-dateinputs`
- `@progress/kendo-angular-grid`
- `@progress/kendo-angular-layout`
- `@progress/kendo-angular-icons`
- `@progress/kendo-angular-label`
- `@progress/kendo-angular-navigation`
- `@progress/kendo-angular-notification`
- `@progress/kendo-angular-indicators`
- `@progress/kendo-angular-progressbar`
- `@progress/kendo-angular-popup`
- `@progress/kendo-angular-tooltip`
- `@progress/kendo-angular-upload`
- `@progress/kendo-angular-listbox`
- `@progress/kendo-angular-listview`
- `@progress/kendo-angular-menu`
- `@progress/kendo-angular-excel-export`
- `@progress/kendo-theme-default`
- `@progress/kendo-data-query`
- `@progress/kendo-drawing`
- `@progress/kendo-svg-icons`
- `@progress/kendo-licensing`
- `primeng` (stale peer dep in base-forms)

Files deleted:
- `packages/Angular/Explorer/kendo-modules/` — entire package
- `packages/Angular/Explorer/explorer-app/src/lib/styles/_kendo-theme-override.scss` — 1,348 lines

---

## Appendix E: Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Kendo controls inside native `<dialog>` | N/A | N/A | **Mitigated by phasing**: Phase 2.1 replaces all Kendo form controls *before* Phase 2.2 builds `<mj-dialog>`, so no Kendo-inside-dialog interop issues |
| CDK Overlay positioning edge cases | Medium | Medium | Test in scrollable containers, modals, near viewport edges |
| Dialog migration breaks programmatic usage | Medium | High | Keep `MJDialogRef.result` API identical to Kendo's `DialogRef.result` |
| IA changes confuse existing users | Low | Medium | Changes are standardization, not redesign |
| Splitter resize perf with nested splitters | Medium | Medium | `requestAnimationFrame` + throttled pointer events |
| Dark mode regressions | Medium | Medium | Test every major page in both themes |
| Token standardization changes look of existing pages | Medium | Low | Changes are intentional — making pages match each other |
