# Kendo UI Removal Project

## Executive Summary

Kendo UI (version 16.2.0) is deeply embedded across MemberJunction's Angular packages with **89 HTML templates** containing Kendo components and **404 instances of `kendoButton`** alone. However, the codebase already has significant infrastructure for migration with **AG Grid** replacing Kendo Grid in the new `entity-viewer` package and several custom components that can replace Kendo equivalents.

---

## 1. Component Usage Breakdown

### High Priority (Core Application - MUST Replace)

| Kendo Component | Usage Count | Files | Primary Use Cases |
|----------------|-------------|-------|-------------------|
| `kendoButton` | 404 instances | 79 files | Form toolbars, dialogs, actions everywhere |
| `kendo-dialog` | 43 files | Widespread | Confirmation, forms, modals |
| `kendo-textbox` | ~150+ | 48 files | All form text inputs |
| `kendo-dropdownlist` | ~100+ | 48 files | Entity forms, filters, selections |
| `kendo-splitter` | 12 files | Layout panels | Split-panel layouts |
| `kendo-tabstrip` | 12 files | Dashboard/forms | Tab navigation |

### Medium Priority (Forms & Entity CRUD)

| Kendo Component | Location | Use Case |
|----------------|----------|----------|
| `kendo-textarea` | base-forms | Multi-line text editing |
| `kendo-numerictextbox` | base-forms | Numeric field editing |
| `kendo-datepicker` | base-forms | Date field editing |
| `kendo-combobox` | base-forms | FK lookups with search |
| `kendo-multicolumncombobox` | link-field.component | FK field selection with multiple columns |
| `kendo-checkbox` (directive) | base-forms | Boolean fields |

### Lower Priority (Specialized Features)

| Kendo Component | Location | Use Case |
|----------------|----------|----------|
| `kendo-treeview` | file-storage | File category navigation |
| `kendo-upload/fileselect` | file-storage, conversations | File uploads |
| `kendo-progressbar` | Various | Loading/progress states |
| `kendo-contextmenu` | Various | Right-click menus |
| `kendo-listbox` | record-selector | Dual-list selection |
| `kendo-excelexport` | query-grid, user-view-grid | Excel export |

---

## 2. Deprecated Components (Safe to Ignore)

### `@memberjunction/ng-user-view-grid` - DEPRECATED
**Location:** `packages/Angular/Explorer/user-view-grid/`
- Contains 24 `kendoButton` instances, `kendo-grid`
- **Status:** Officially deprecated at line 50 of component
- **Replacement:** `@memberjunction/ng-entity-viewer` (uses AG Grid)
- **Action:** No need to migrate - will be removed

### `@memberjunction/ng-ask-skip` - DEPRECATED
**Location:** `packages/Angular/Explorer/ask-skip/`
- **Status:** Marked deprecated in package.json
- **Replacement:** `@memberjunction/ng-conversations`
- **Action:** No need to migrate - will be removed

---

## 3. Existing Custom Replacements Available

### Ready to Use Now

| Custom Component | Package | Replaces Kendo | Status |
|-----------------|---------|----------------|--------|
| `mj-tabstrip` | `@memberjunction/ng-tab-strip` | `kendo-tabstrip` | **FULL REPLACEMENT** |
| `mj-loading` | `@memberjunction/ng-shared` | Kendo loaders/spinners | **FULL REPLACEMENT** |
| `mj-code-editor` | `@memberjunction/ng-code-editor` | `kendo-textarea` for code | **FULL REPLACEMENT** |
| `mj-filter-builder` | `@memberjunction/ng-filter-builder` | `kendo-filter` | **FULL REPLACEMENT** |
| `mj-pagination` | `@memberjunction/ng-entity-viewer` | Kendo pager | **FULL REPLACEMENT** |
| `mj-pill` | `@memberjunction/ng-entity-viewer` | Status badges | **FULL REPLACEMENT** |
| `mj-deep-diff` | `@memberjunction/ng-deep-diff` | N/A | Custom component |
| `mj-markdown` | `@memberjunction/ng-markdown` | N/A | Custom component |
| `mj-chat` | `@memberjunction/ng-chat` | N/A | Custom component |

### Partial Replacements (Still Use Kendo Internally)

| Component | Package | Notes |
|-----------|---------|-------|
| `mj-generic-dialog` | `@memberjunction/ng-generic-dialog` | Uses Kendo Window internally - needs refactor |
| `mj-query-grid` | `@memberjunction/ng-query-grid` | Uses Kendo Grid - could migrate to AG Grid |
| `MJNotificationService` | `@memberjunction/ng-notifications` | Uses Kendo NotificationService |

---

## 4. Migration Strategy by Component

### 4.1 Buttons (`kendoButton`)
**Current Usage:** 404 instances across 79 files

**Recommendation:** Create `mj-button` component
```typescript
// Replace with simple CSS-styled button component
<button mjButton [variant]="'primary'" [icon]="'fa-save'">Save</button>
```

**Alternative:** Just use plain HTML buttons with MJ CSS classes
```html
<!-- Current Kendo -->
<button kendoButton (click)="save()">Save</button>

<!-- Replacement - plain button with FontAwesome -->
<button class="mj-btn mj-btn-primary" (click)="save()">
    <span class="fa-solid fa-floppy-disk"></span> Save
</button>
```

**Effort:** Low - create CSS classes and optionally a thin directive

---

### 4.2 Dialogs (`kendo-dialog`, `kendo-window`)
**Current Usage:** 43 files

**Options:**
1. **Angular CDK Dialog** - Already a dependency (`@angular/cdk: 18.2.14`)
2. **Refactor `mj-generic-dialog`** to use CDK instead of Kendo Window

**Recommendation:** Use Angular CDK Dialog/Overlay
```typescript
// Already have @angular/cdk in:
// - explorer-core, skip-chat, artifacts, conversations, ask-skip
```

**Effort:** Medium - need to create wrapper component using CDK

---

### 4.3 Form Inputs (textbox, textarea, numeric, date, dropdown)
**Current Usage:** 346 occurrences across 48 files (the most critical area)

**Location:** Primarily in `base-field-component.html` which handles ALL entity form fields

**Options:**
1. **Native HTML5 inputs** with custom styling
2. **ng-select** for dropdowns (very popular, accessible)
3. **Angular Material** (heavy, but complete)
4. **Custom MJ form components** (most control, best long-term)

**Recommendation:** Create MJ Form Components Library
```typescript
// New package: @memberjunction/ng-form-components
<mj-textbox [(ngModel)]="value" />
<mj-textarea [(ngModel)]="value" />
<mj-number-input [(ngModel)]="value" [min]="0" [max]="100" />
<mj-datepicker [(ngModel)]="value" />
<mj-dropdown [data]="options" [(ngModel)]="value" />
<mj-combobox [data]="options" [(ngModel)]="value" [allowCustom]="true" />
```

**Critical File to Modify:**
- `packages/Angular/Explorer/base-forms/src/lib/base-field-component.html` (lines 87-152)

**Effort:** High - this is the core of entity editing

---

### 4.4 Grids (`kendo-grid`)
**Current Usage:**
- **Explorer:** 3 files (user-view-grid [DEPRECATED], template-params-grid, compare-records)
- **Generic:** 4 files (resource-permissions, query-grid, find-record, files-grid)

**Existing Solution:** AG Grid via `@memberjunction/ng-entity-viewer`
```json
// Already using AG Grid 34.3.1
"ag-grid-angular": "^34.3.1",
"ag-grid-community": "^34.3.1"
```

**Recommendation:** Migrate all grids to AG Grid
- `mj-query-grid` → Convert to use AG Grid
- `compare-records` → Convert to use AG Grid
- `template-params-grid` → Convert to use AG Grid
- `find-record` → Convert to use AG Grid

**Effort:** Medium per grid

---

### 4.5 Splitters (`kendo-splitter`)
**Current Usage:** 12 files for split-panel layouts

**Options:**
1. **Angular CDK** - no built-in splitter
2. **angular-split** - Popular lightweight library (MIT)
3. **Custom CSS Grid/Flexbox** with resize handles

**Recommendation:** Use `angular-split` library
```bash
npm install angular-split
```
```html
<as-split direction="horizontal">
  <as-split-area [size]="30">Left</as-split-area>
  <as-split-area [size]="70">Right</as-split-area>
</as-split>
```

**Effort:** Low-Medium

---

### 4.6 Tab Strips (`kendo-tabstrip`)
**Current Usage:** 12 files

**Existing Solution:** `mj-tabstrip` in `@memberjunction/ng-tab-strip`

**Action Required:** Replace all `kendo-tabstrip` with `mj-tabstrip`
```html
<!-- Current -->
<kendo-tabstrip>
  <kendo-tabstrip-tab [title]="'Tab 1'">Content 1</kendo-tabstrip-tab>
</kendo-tabstrip>

<!-- Replacement -->
<mj-tabstrip>
  <mj-tab [TabTitle]="'Tab 1'">
    <mj-tab-body>Content 1</mj-tab-body>
  </mj-tab>
</mj-tabstrip>
```

**Effort:** Low - just syntax changes

---

### 4.7 TreeView (`kendo-treeview`)
**Current Usage:** 2 files (file-storage category tree)

**Options:**
1. **Angular Material Tree** - `@angular/material` (if adopting Material)
2. **Custom component** - recursive tree with expand/collapse
3. **PrimeNG Tree** - feature-rich tree component

**Recommendation:** Build custom `mj-treeview` component
- File storage is the only user
- Simple recursive template with expand/collapse

**Effort:** Medium

---

### 4.8 File Upload (`kendo-upload`, `kendo-fileselect`)
**Current Usage:** 2 files (file-storage, conversations)

**Options:**
1. **ngx-file-drop** - drag & drop file upload
2. **ng2-file-upload** - popular, simple
3. **Native HTML5** `<input type="file">` with custom styling

**Recommendation:** Create `mj-file-upload` component using native HTML5
```html
<mj-file-upload
  [multiple]="true"
  [accept]="'.jpg,.png,.pdf'"
  (filesSelected)="onFiles($event)">
</mj-file-upload>
```

**Effort:** Medium

---

### 4.9 Notifications
**Current Usage:** `MJNotificationService` uses Kendo NotificationService

**Options:**
1. **Angular CDK Snackbar/Overlay**
2. **ngx-toastr** - very popular, lightweight
3. **Custom toast component** - conversations already has `mj-toast`

**Existing:** `mj-toast` in `@memberjunction/ng-conversations`

**Recommendation:** Extract and enhance `mj-toast` to standalone package
```typescript
// Already exists in conversations:
// packages/Angular/Generic/conversations/src/lib/components/toast/toast.component.ts
```

**Effort:** Low - just refactor existing code

---

### 4.10 Multi-Column ComboBox (`kendo-multicolumncombobox`)
**Current Usage:** `link-field.component.html` for FK field selection

**This is a complex component unique to Kendo**

**Options:**
1. **ng-select** with custom templates - closest alternative
2. **Custom dropdown** with grid-like display
3. **Typeahead search** mode (already exists as alternative in link-field)

**Recommendation:** The component already has a "Search" mode alternative:
```html
@if (LinkComponentType === 'Search') {
    <!-- Uses simple text input with search results -->
}
@else {
    <!-- Uses kendo-multicolumncombobox -->
}
```

Consider making "Search" mode the default and enhancing it.

**Effort:** High - this is complex UI

---

## 5. Files Requiring Most Work

### Critical Path (Most Kendo-Dense)

1. **`base-field-component.html`** (base-forms)
   - All entity form field rendering
   - Uses: textbox, textarea, numeric, datepicker, dropdown, combobox, checkbox
   - **Priority: HIGHEST**

2. **`link-field.component.html`** (base-forms)
   - FK field selection with multi-column combo
   - **Priority: HIGH**

3. **`form-toolbar.html`** (form-toolbar)
   - 14 kendoButton instances, 2 kendo-dialog
   - **Priority: HIGH**

4. **`shell.component.html`** (explorer-core)
   - Main application shell
   - **Priority: HIGH**

5. **Skip Chat Components** (Generic/skip-chat)
   - 5 HTML files, heavy dialog/button usage
   - **Priority: MEDIUM**

6. **Dashboard Components** (Explorer/dashboards)
   - 12 HTML files with various Kendo components
   - **Priority: MEDIUM**

---

## 6. Recommended New Packages to Create

### Package 1: `@memberjunction/ng-form-components`
Replace all Kendo form inputs:
- `mj-textbox`
- `mj-textarea`
- `mj-number-input`
- `mj-datepicker`
- `mj-dropdown`
- `mj-combobox`
- `mj-checkbox`

### Package 2: `@memberjunction/ng-button`
Simple button component/directive:
- `mjButton` directive or `<mj-button>` component
- Variants: primary, secondary, outline, icon-only
- Integrates with FontAwesome icons

### Package 3: `@memberjunction/ng-dialog`
Replace kendo-dialog and kendo-window:
- Built on Angular CDK
- Modal dialogs with configurable actions
- Floating windows support

### Package 4: `@memberjunction/ng-splitter`
Wrap `angular-split` or build custom:
- Horizontal/vertical split panels
- Resizable panes
- Collapse/expand support

### Package 5: `@memberjunction/ng-toast`
Extract from conversations:
- Success/error/warning/info toasts
- Configurable position and duration
- Animated entry/exit

---

## 7. External Libraries to Consider

| Library | Use Case | License | Bundle Size |
|---------|----------|---------|-------------|
| `@angular/cdk` | Dialogs, overlays, accessibility | MIT | Already included |
| `ng-select` | Dropdowns, multi-select, typeahead | MIT | ~50KB |
| `angular-split` | Splitter panels | MIT | ~15KB |
| `ngx-toastr` | Toast notifications | MIT | ~10KB |
| `ag-grid-community` | Data grids | MIT | Already included |
| `@ngx-formly/*` | Dynamic forms (alternative approach) | MIT | ~100KB |

---

## 8. Migration Priority Order

### Phase 1: Quick Wins (Low Effort, High Impact)
1. Replace `kendo-tabstrip` with existing `mj-tabstrip`
2. Replace all loading indicators with `mj-loading`
3. Extract `mj-toast` to standalone package

### Phase 2: Form Components (High Effort, Critical)
1. Create `@memberjunction/ng-form-components` package
2. Migrate `base-field-component.html` to new components
3. Update `link-field.component.html`

### Phase 3: Buttons & Dialogs
1. Create button directive/component
2. Migrate to Angular CDK dialogs
3. Update `mj-generic-dialog` to remove Kendo dependency

### Phase 4: Grids & Layout
1. Migrate remaining Kendo grids to AG Grid
2. Implement splitter replacement
3. Create custom treeview if needed

### Phase 5: Specialized Components
1. File upload component
2. Multi-column combobox alternative
3. Any remaining edge cases

---

## 9. Summary Statistics

| Category | Count |
|----------|-------|
| Total files with Kendo | 89 HTML templates |
| `kendoButton` instances | 404 |
| Kendo form input instances | 346+ |
| Dialog/Window files | 43 |
| Files deprecated (ignore) | 4+ (user-view-grid, ask-skip) |
| Custom replacements ready | 9 components |
| New packages needed | 5 |
| External libs to add | 2-3 (ng-select, angular-split, ngx-toastr) |

---

## 10. Kendo Packages Currently Installed

From `@memberjunction/ng-kendo-modules`:
- `@progress/kendo-angular-grid` (migrate to AG Grid)
- `@progress/kendo-angular-layout` (tabstrip → mj-tabstrip, splitter → angular-split)
- `@progress/kendo-angular-icons` (use FontAwesome)
- `@progress/kendo-angular-navigation` (minimal usage)
- `@progress/kendo-angular-inputs` (create mj-form-components)
- `@progress/kendo-angular-dropdowns` (use ng-select or custom)
- `@progress/kendo-angular-label` (use HTML label)
- `@progress/kendo-angular-buttons` (create mj-button)
- `@progress/kendo-angular-dialog` (use Angular CDK)
- `@progress/kendo-angular-dateinputs` (create mj-datepicker)
- `@progress/kendo-angular-notification` (extract mj-toast)

---

## 11. Detailed File Inventory

### Explorer Package Files with Kendo

| File | Kendo Components Used |
|------|----------------------|
| `explorer-core/src/lib/shell/shell.component.html` | textbox, button |
| `explorer-core/src/lib/single-dashboard/*.html` | dialog, button |
| `explorer-core/src/lib/single-list-detail/*.html` | dialog, button, textbox |
| `explorer-core/src/lib/user-notifications/*.html` | textbox, button |
| `base-forms/src/lib/base-field-component.html` | textbox, textarea, numeric, datepicker, dropdown, combobox, checkbox |
| `base-forms/src/lib/link-field.component.html` | textbox, button, multicolumncombobox |
| `form-toolbar/src/lib/form-toolbar.html` | button (14x), dialog (2x) |
| `core-entity-forms/src/lib/custom/**/*.html` | Various - forms for AI, Actions, Templates, etc. |
| `dashboards/src/**/*.html` | splitter, tabstrip, button, dialog, textbox |
| `user-view-properties/*.html` | tabstrip, splitter, textbox, dropdown, button |
| `record-changes/*.html` | grid, button, dialog |
| `entity-permissions/*.html` | grid, button, dropdown |
| `explorer-settings/**/*.html` | dialog, button, dropdown |
| `compare-records/*.html` | grid, checkbox, label |

### Generic Package Files with Kendo

| File | Kendo Components Used |
|------|----------------------|
| `skip-chat/src/lib/**/*.html` | dialog, window, button, splitter, textbox |
| `conversations/src/lib/**/*.html` | button, dialog, dropdown, upload, textbox |
| `file-storage/src/lib/**/*.html` | treeview, grid, upload, button, contextmenu |
| `ai-test-harness/*.html` | splitter, button, dialog, textbox, dropdown |
| `action-gallery/*.html` | button, treeview, textbox, dropdown |
| `resource-permissions/*.html` | grid, listview, button, dropdown |
| `data-context/*.html` | textbox, button, dialog |
| `query-grid/*.html` | grid, button |
| `find-record/*.html` | grid, textbox, button, dialog |
| `record-selector/*.html` | listbox, button, dialog |
| `join-grid/*.html` | grid, button, dropdown |
| `generic-dialog/*.html` | window, button |
| `chat/*.html` | button, dialog |
| `entity-relationship-diagram/*.html` | splitter |

---

## 12. Appendix: mj-tabstrip Component Details

The existing `mj-tabstrip` component is a full-featured replacement for `kendo-tabstrip`:

**Location:** `packages/Angular/Generic/tab-strip/src/lib/tab-strip/tab-strip.component.ts`

**Features:**
- Dynamic tabs with closeable option
- Scroll left/right buttons for overflow
- Tab selection events (before/after)
- Context menu support
- Keyboard navigation
- Programmatic tab selection by name or index
- `RefreshTabs()` method for dynamic tab changes

**Usage:**
```html
<mj-tabstrip [SelectedTabIndex]="0" (TabSelected)="onTabSelect($event)">
  <mj-tab [TabTitle]="'Tab 1'" [TabCloseable]="true">
    <mj-tab-body>Content 1</mj-tab-body>
  </mj-tab>
  <mj-tab [TabTitle]="'Tab 2'">
    <mj-tab-body>Content 2</mj-tab-body>
  </mj-tab>
</mj-tabstrip>
```

---

## 13. Appendix: mj-loading Component Details

The existing `mj-loading` component replaces Kendo loading indicators:

**Location:** `packages/Angular/Generic/shared/src/lib/loading/loading.component.ts`

**Features:**
- Animated MJ logo
- Multiple animation types: pulse, spin, bounce, pulse-spin
- Size presets: small (40x22px), medium (80x45px), large (120x67px), auto
- Customizable colors and gradients
- Optional loading text

**Usage:**
```html
<mj-loading text="Loading..." size="medium"></mj-loading>
<mj-loading [logoGradient]="{startColor: '#228B22', endColor: '#C41E3A'}"></mj-loading>
<mj-loading [showText]="false"></mj-loading>
```

---

*Document created: January 2026*
*Last updated: January 17, 2026*
