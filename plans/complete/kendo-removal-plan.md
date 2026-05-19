# Kendo UI Removal Plan

**Date:** March 13, 2026
**Status:** Approved for implementation
**Strategy:** Custom MJ components + AG Grid (no PrimeNG, no Angular Material)

---

## Executive Summary

MemberJunction will fully remove all Kendo UI dependencies by building custom replacement components in a new `@memberjunction/ng-ui-components` package under `packages/Angular/Generic/ui-components/`. This leverages MJ's mature design token system (`_tokens.scss`) to style all replacements natively — no third-party theming bridges needed.

**Why custom over PrimeNG/Material:**
- MJ's design token system (`--mj-*` CSS variables) already provides the full design vocabulary (colors, spacing, shadows, radii, transitions, z-index, typography, dark mode)
- Adopting PrimeNG or Material would require *another* 1,000+ line theme override file to bridge their CSS variables to `--mj-*` tokens — trading one maintenance burden for another
- Custom components use `--mj-*` tokens directly with zero bridge layer
- The `base-forms` package and `ng-trees` package already prove this pattern works at scale
- PrimeNG is currently a peer dep in `base-forms` but **not used anywhere** in any template or TypeScript import — it should be removed

**What's already done:**
- Grid: AG Grid (`ag-grid-angular@35`) — fully replaced
- TreeView: `@memberjunction/ng-trees` (`<mj-tree>`, `<mj-tree-dropdown>`) — fully replaced
- TabStrip: `@memberjunction/ng-tab-strip` (`<mj-tabstrip>`) — fully replaced
- Loading: `@memberjunction/ng-shared` (`<mj-loading>`) — fully replaced
- Form inputs in base-forms: Native HTML with custom styling — already Kendo-free
- Code editor: `@memberjunction/ng-code-editor` — fully replaced
- Filter builder: `@memberjunction/ng-filter-builder` — fully replaced
- Collapsible panels: `@memberjunction/ng-base-forms` (`<mj-collapsible-panel>`) — fully replaced

**What remains:** ~1,100 Kendo component instances across ~87 HTML files and ~112 TypeScript files, from 20 `@progress/kendo-angular-*` packages (all v22.0.1). Plus a 1,348-line Kendo theme override file.

---

## Architecture: `@memberjunction/ng-ui-components`

**Location:** `packages/Angular/Generic/ui-components/`

This new package provides low-level, reusable UI primitives that other MJ packages depend on. All components use `--mj-*` design tokens directly — no theme bridge files.

### Components to Build

| Component | Selector | Replaces | API Surface |
|-----------|----------|----------|-------------|
| **Button** | `<button mjButton>` (directive) | `kendoButton` | `[variant]`: `'primary'`\|`'secondary'`\|`'outline'`\|`'flat'`\|`'icon'`; `[size]`: `'sm'`\|`'md'`\|`'lg'` |
| **Dialog** | `<mj-dialog>` + `MJDialogService` | `<kendo-dialog>` + `DialogService` | `[visible]`, `[title]`, `[width]`, `[height]`, `(close)`; service: `.open()` returning `MJDialogRef` with `.result` observable |
| **Dropdown** | `<mj-dropdown>` | `<kendo-dropdownlist>` | `[data]`, `[textField]`, `[valueField]`, `[filterable]`, `[(ngModel)]`, `[valuePrimitive]`, item templates |
| **Combobox** | `<mj-combobox>` | `<kendo-combobox>` | Same as dropdown + `[allowCustom]`, `(filterChange)` |
| **Numeric Input** | `<mj-numeric-input>` | `<kendo-numerictextbox>` | `[min]`, `[max]`, `[step]`, `[format]`, `[decimals]`, `[(ngModel)]` |
| **Date Picker** | `<mj-datepicker>` | `<kendo-datepicker>` | `[(ngModel)]`, `[min]`, `[max]`, `[format]`, `[placeholder]` |
| **Switch** | `<mj-switch>` | `<kendo-switch>` | `[(ngModel)]`, `[onLabel]`, `[offLabel]` |
| **Accordion** | `<mj-accordion>` + `<mj-accordion-panel>` | `<kendo-panelbar>` + `<kendo-panelbar-item>` | `[expanded]`, `[title]`, content projection |
| **Splitter** | `<mj-splitter>` + `<mj-splitter-pane>` | `<kendo-splitter>` + `<kendo-splitter-pane>` | `[orientation]`, `[size]`, `[min]`, `[max]`, `[collapsible]` |
| **Floating Panel** | `MJFloatingPanelService` | `WindowService` / `<kendo-window>` | `.open()` returning ref with drag, resize, minimize, close |
| **Context Menu** | `<mj-context-menu>` | `<kendo-contextmenu>` | `[items]`, `(select)`, `[target]` |
| **Listbox** | `<mj-listbox>` | `<kendo-listbox>` | `[data]`, `[textField]`, `[valueField]`, dual-list transfer mode |
| **File Select** | `<mj-file-select>` | `<kendo-fileselect>` | `[multiple]`, `[accept]`, `(select)`, drag-and-drop zone |

### Design Principles

1. **Token-native**: Every color, border, shadow, radius, spacing uses `--mj-*` semantic tokens. No hardcoded hex values.
2. **Dark mode free**: Because semantic tokens auto-switch via `[data-theme="dark"]`, components get dark mode without any extra CSS.
3. **Accessible**: Focus rings via `--mj-focus-ring`, ARIA attributes, keyboard navigation, focus trapping for dialogs.
4. **Standalone-first**: New components should be Angular standalone components with explicit `imports` arrays.
5. **Modern syntax**: `@if`/`@for`/`@switch` blocks, `inject()` for DI, PascalCase for public members.
6. **ngModel compatible**: All form components implement `ControlValueAccessor` for ngModel and reactive forms support.

### Existing Packages to Modify

| Package | Change |
|---------|--------|
| `@memberjunction/ng-base-forms` | Remove stale `primeng` peer dep. Update `mj-form-field` template to use `ng-ui-components` instead of Kendo. |
| `@memberjunction/ng-notifications` | Replace Kendo `NotificationService` internals with custom toast (already exists in conversations package — extract). |
| `@memberjunction/ng-generic-dialog` | Refactor to use `MJDialogService` from `ng-ui-components` instead of Kendo Window. |
| `@memberjunction/ng-kendo-modules` | Delete entirely once migration is complete. |

---

## Phase Plan

### Phase 1: Foundation — Create `ng-ui-components` Package + Button Directive

**Scope:** Package scaffold + `mjButton` directive (replaces `kendoButton` — 415 instances, 87 files)

**Why buttons first:** Highest instance count, simplest replacement, proves the pattern.

**Work:**
1. Scaffold `packages/Angular/Generic/ui-components/` with package.json, tsconfig, public-api.ts
2. Add `@memberjunction/ng-shared-generic` as dependency (for token access)
3. Build `mjButton` directive with `variant`, `size`, `disabled` support
4. Create SCSS using `--mj-*` tokens for all button states (hover, active, focus, disabled)
5. Bulk find-and-replace `kendoButton` → `mjButton` across all templates
6. Update `themeColor="primary"` → `variant="primary"` etc.
7. Remove `ButtonsModule` imports from all Angular modules

**Files to create:**
- `ui-components/src/lib/button/button.directive.ts`
- `ui-components/src/lib/button/button.directive.scss`

**Kendo packages removable after Phase 1:** `@progress/kendo-angular-buttons`

---

### Phase 2: Form Controls — Textbox, Textarea, Numeric Input, Switch, Checkbox

**Scope:** Simple form inputs (replaces ~200 instances across ~50 files)

**Why:** These are already native HTML in `base-forms` — extract the pattern into shared components.

**Work:**
1. Extract proven native HTML patterns from `base-forms` into `ng-ui-components`
2. Implement `ControlValueAccessor` for each
3. Add validation state styling (error borders, focus rings)
4. Replace `<kendo-textbox>`, `<kendo-textarea>`, `<kendo-numerictextbox>`, `<kendo-switch>`, `<kendo-checkbox>` across all templates
5. Replace `<kendo-progressbar>` with native `<progress>` element + MJ styling

**Files to create:**
- `ui-components/src/lib/textbox/textbox.component.ts`
- `ui-components/src/lib/textarea/textarea.component.ts`
- `ui-components/src/lib/numeric-input/numeric-input.component.ts`
- `ui-components/src/lib/switch/switch.component.ts`
- `ui-components/src/lib/checkbox/checkbox.component.ts`
- `ui-components/src/lib/progress-bar/progress-bar.component.ts`

**Kendo packages removable after Phase 2:** `@progress/kendo-angular-inputs`, `@progress/kendo-angular-progressbar`, `@progress/kendo-angular-indicators`

---

### Phase 3: Dropdown & Combobox

**Scope:** `<mj-dropdown>` and `<mj-combobox>` (replaces ~170 instances across ~34 files)

**Why separate phase:** Dropdowns are more complex than basic inputs — need popup positioning, filtering, keyboard navigation, item templates.

**Work:**
1. Build `<mj-dropdown>` with CDK Overlay for popup positioning
2. Support `textField`/`valueField` binding pattern (matching Kendo's API to ease migration)
3. Implement `[filterable]` with `(filterChange)` event
4. Support item templates via `<ng-template mjDropdownItem>`
5. Build `<mj-combobox>` extending dropdown with free-text entry
6. Replace all `<kendo-dropdownlist>` and `<kendo-combobox>` instances
7. Update `mj-form-field` template in `base-forms` to use new components

**Kendo packages removable after Phase 3:** `@progress/kendo-angular-dropdowns`

---

### Phase 4: Date Picker

**Scope:** `<mj-datepicker>` and `<mj-timepicker>` (replaces ~20 instances across ~8 files)

**Work:**
1. Build date picker with calendar popup (CDK Overlay)
2. Support date formats, min/max constraints, placeholder
3. Replace `<kendo-datepicker>` and `<kendo-timepicker>` instances
4. Update `mj-form-field` template

**Kendo packages removable after Phase 4:** `@progress/kendo-angular-dateinputs`

---

### Phase 5: Dialog System

**Scope:** `<mj-dialog>` + `MJDialogService` (replaces ~144 template instances in 27 files + 132 service refs in 52 files)

**This is the largest surface area migration item.**

**Work:**
1. Build `<mj-dialog>` component using native `<dialog>` element + CDK Overlay for backdrop
   - Support `[visible]`, `[title]`, `[width]`, `[height]`, `[closeable]`
   - `<mj-dialog-actions>` for button area
   - Focus trapping, ESC to close, click-outside-to-close
2. Build `MJDialogService` for programmatic dialog opening
   - `.open({ content: ComponentType, title, width, height })` → returns `MJDialogRef`
   - `MJDialogRef.result` observable (matching Kendo's pattern for easy migration)
   - `MJDialogRef.close(result)` method
3. Replace all `<kendo-dialog>` template usages
4. Replace all `DialogService`/`DialogRef` programmatic usages
5. Refactor `GenericDialogComponent` to use new dialog system

**Kendo packages removable after Phase 5:** `@progress/kendo-angular-dialog` (partially — Window still needed until Phase 7)

---

### Phase 6: Accordion (PanelBar Replacement)

**Scope:** `<mj-accordion>` (replaces ~86 instances in 5 files)

**Work:**
1. Build `<mj-accordion>` + `<mj-accordion-panel>` with expand/collapse animation
2. Support `[expanded]` binding, `[title]`, content projection via `<ng-template>`
3. Replace all `<kendo-panelbar>` and `<kendo-panelbar-item>` instances
4. Heaviest files: `ai-agent-form.component.html` (22), `ai-agent-run.component.html` (20), `ai-prompt-run-form.component.html` (18)

**Kendo packages removable after Phase 6:** `@progress/kendo-angular-layout` (partially — Splitter still needed until Phase 8)

---

### Phase 7: Floating Panel Service (Window Replacement)

**Scope:** `MJFloatingPanelService` (replaces WindowService — ~25 template + 50 TS instances, 8+13 files)

**This is the highest complexity single item.**

**Work:**
1. Build `MJFloatingPanelService` using CDK Overlay + CDK DragDrop
   - `.open()` returning `MJFloatingPanelRef`
   - Draggable title bar, resizable edges
   - Minimize-to-dock (for AI test harness / communication window)
   - Custom positioning, z-index stacking
2. For simple window usage (most cases): convert to use `MJDialogService` from Phase 5 instead
3. Only build full floating panel for the 2-3 places that truly need drag/resize/minimize:
   - AI test harness
   - Communication window
   - Dashboard share dialog
4. Replace all `WindowService`/`WindowRef` usages

**Kendo packages removable after Phase 7:** `@progress/kendo-angular-dialog` (fully)

---

### Phase 8: Splitter

**Scope:** `<mj-splitter>` (replaces ~56 instances in 9 files)

**Work:**
1. Build `<mj-splitter>` + `<mj-splitter-pane>` — two approaches to evaluate:
   - **Option A:** Wrap `angular-split` (MIT, lightweight ~15KB, well-maintained)
   - **Option B:** Custom CSS resize handles with pointer events
2. Support `[orientation]` (horizontal/vertical), `[size]` (%, px), `[min]`/`[max]`, `[collapsible]`
3. Support nested splitters (horizontal inside vertical)
4. Replace all `<kendo-splitter>` instances

**Kendo packages removable after Phase 8:** `@progress/kendo-angular-layout` (fully)

---

### Phase 9: Remaining Small Components

**Scope:** Context menu, listbox, file select, Excel export, label, tooltip, notification wrapper

| Component | Instances | Approach |
|-----------|-----------|----------|
| `<kendo-contextmenu>` | 4 in 1 file | Build `<mj-context-menu>` using CDK Overlay |
| `<kendo-listbox>` | 4 in 1 file | Build `<mj-listbox>` with dual-list transfer |
| `<kendo-fileselect>` | Few | Build `<mj-file-select>` with native `<input type="file">` + drag zone |
| `<kendo-excelexport>` | Few | Already handled by AG Grid export; remove remaining references |
| `<kendo-label>` | 8 | Replace with native `<label>` |
| `kendoTooltip` | 4 | Replace with CSS `title` attribute or build `mjTooltip` directive |
| `NotificationService` | 1 wrapper file | Replace wrapper internals with custom toast component (extract from conversations package) |
| `<kendo-listview>` | 2 in 1 file | Replace with `@for` loop + custom styling |

**Kendo packages removable after Phase 9:** All remaining (`kendo-angular-listbox`, `kendo-angular-menu`, `kendo-angular-upload`, `kendo-angular-tooltip`, `kendo-angular-notification`, `kendo-angular-listview`, `kendo-angular-excel-export`, `kendo-angular-label`, `kendo-angular-icons`, `kendo-angular-navigation`, `kendo-angular-popup`)

---

### Phase 10: Remaining Kendo Grids → AG Grid

**Scope:** 5 legacy files still using `<kendo-grid>`

| File | Complexity | Notes |
|------|-----------|-------|
| `ng-query-grid.component.html` | Low | Already deprecated — migrate to `mj-query-viewer` |
| `find-record.component.html` | Low | Simple search results grid |
| `files-grid.html` | Medium | Custom cell templates for file icons/sizes |
| `join-grid.component.html` | Medium | Join relationship grid |
| `template-params-grid.component.html` | High | Inline editing with add/remove rows |

**Kendo packages removable after Phase 10:** `@progress/kendo-angular-grid`

---

### Phase 11: Final Cleanup

**Work:**
1. Delete `packages/Angular/Explorer/kendo-modules/` package entirely
2. Delete `_kendo-theme-override.scss` (1,348 lines)
3. Remove `@import '@progress/kendo-theme-default/scss/all'` from `styles.scss`
4. Remove ALL `@progress/*` packages from every `package.json` across 26 Angular packages:
   - `@progress/kendo-angular-*` (20 packages)
   - `@progress/kendo-theme-default`
   - `@progress/kendo-data-query`
   - `@progress/kendo-drawing`
   - `@progress/kendo-svg-icons`
   - `@progress/kendo-licensing`
5. Remove stale `primeng` peer dep from `@memberjunction/ng-base-forms`
6. Remove all `.k-*` CSS class references from any component stylesheets
7. Update CodeGen templates in `packages/CodeGenLib/src/Angular/angular-codegen.ts` to emit `UIComponentsModule` instead of `LayoutModule` from Kendo
8. Run `npm install` at repo root to clean up `node_modules`
9. Full build + smoke test of MJExplorer

---

## Cross-Cutting Concerns

### Design Token Usage in New Components

All new components MUST follow the token system defined in `packages/Angular/Generic/shared/src/lib/_tokens.scss`:

```scss
// Example: mj-button styles
:host button {
  font-family: var(--mj-font-family);
  font-size: var(--mj-text-sm);
  font-weight: var(--mj-font-semibold);
  border-radius: var(--mj-radius-sm);
  transition: var(--mj-transition-colors);
  cursor: pointer;

  &.variant-primary {
    background: var(--mj-brand-primary);
    color: var(--mj-brand-on-primary);
    border: 1px solid var(--mj-brand-primary);

    &:hover { background: var(--mj-brand-primary-hover); }
    &:active { background: var(--mj-brand-primary-active); }
    &:focus-visible { box-shadow: var(--mj-focus-ring); }
    &:disabled {
      background: var(--mj-bg-surface-active);
      color: var(--mj-text-disabled);
      cursor: not-allowed;
    }
  }
}
```

**No hardcoded colors. No primitives (`--mj-color-neutral-*`). Only semantic tokens.**

### Kendo Theme Override File as Migration Checklist

The `_kendo-theme-override.scss` file (1,348 lines) maps every Kendo CSS variable and `.k-*` class to `--mj-*` tokens. As each phase completes, the corresponding override blocks become dead code and should be deleted. When the file is empty, Kendo is fully removed.

### CodeGen Impact

`packages/CodeGenLib/src/Angular/angular-codegen.ts` currently injects `LayoutModule` from `@progress/kendo-angular-layout` into every generated form module. This must be updated in Phase 11 to import from `@memberjunction/ng-ui-components` instead.

### Bundle Size Impact

Removing Kendo is expected to significantly reduce bundle size:
- Kendo theme CSS: ~500KB
- Kendo JS modules: ~1.5MB+
- Custom replacements: estimated ~100-200KB total (native HTML + minimal JS)

---

## Dependency Summary

### External Libraries Needed

| Library | Purpose | Already Installed? |
|---------|---------|-------------------|
| `@angular/cdk` | Overlay, DragDrop, FocusTrap, A11y | Yes (v18.2.14) |
| `angular-split` (optional) | Splitter component (Phase 8, if chosen over custom) | No — evaluate during Phase 8 |

### No New UI Framework Dependencies

PrimeNG, Angular Material, and similar frameworks are explicitly **not adopted**. The MJ design token system provides complete theming capability without needing a third-party design system bridge.

---

## Files and Packages Summary

### New Package
- `packages/Angular/Generic/ui-components/` — `@memberjunction/ng-ui-components`

### Packages to Modify
- `@memberjunction/ng-base-forms` — Update `mj-form-field` template, remove `primeng` peer dep
- `@memberjunction/ng-notifications` — Replace Kendo wrapper internals
- `@memberjunction/ng-generic-dialog` — Refactor to use `MJDialogService`
- `CodeGenLib` — Update Angular codegen templates

### Packages to Delete
- `@memberjunction/ng-kendo-modules` — Delete entirely

### Files to Delete
- `packages/Angular/Explorer/explorer-app/src/lib/styles/_kendo-theme-override.scss` (1,348 lines)

### Dependencies to Remove (from 26+ package.json files)
- 20 `@progress/kendo-angular-*` packages
- `@progress/kendo-theme-default`
- `@progress/kendo-data-query`
- `@progress/kendo-drawing`
- `@progress/kendo-svg-icons`
- `@progress/kendo-licensing`
- `primeng` (stale peer dep in base-forms)
