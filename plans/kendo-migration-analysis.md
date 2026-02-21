# Kendo Migration Analysis: Level of Effort & Trade-offs

## Current State Summary

### Kendo Usage

| Category | Kendo Usage | Files Affected |
|----------|-------------|----------------|
| Grids | 11 Kendo grids (many deprecated) | ~15 components |
| Dialogs/Windows | 99 DialogsModule imports | ~50 components |
| Buttons | 28 kendoButton usages | ~28 files |
| Dropdowns | 25 dropdown components | ~25 files |
| Tabs/Layout | 25 tabstrip/layout usages | ~25 files |
| Tree Views | 7 treeview instances | ~7 files |
| Date Pickers | 7 datepicker instances | ~7 files |
| Inputs | Widespread | ~50+ files |
| **Total** | **352 files with Kendo refs** | **180+ custom components** |

**Key Finding:** AG Grid migration is already underway. `EntityDataGridComponent` and `QueryDataGridComponent` use AG Grid. Old Kendo grids are marked deprecated.

---

## Existing MJ Custom Components (NOT Kendo-Dependent)

MemberJunction already has substantial custom component infrastructure that could be expanded:

### UI Primitives (Ready to Use)

| Component | Location | Purpose | Kendo-Free |
|-----------|----------|---------|------------|
| mj-loading | ng-shared | Animated loading indicator with MJ logo | ✅ Yes |
| mj-pill | ng-entity-viewer | Status pills with semantic colors | ✅ Yes |
| mj-notification-badge | ng-conversations | Badges (count, dot, pulse, priority levels) | ✅ Yes |
| mj-pagination | ng-entity-viewer | Pagination controls | ✅ Yes |
| mj-entity-cards | ng-entity-viewer | Card-based entity display | ✅ Yes |

### Layout Components (Ready to Use)

| Component | Location | Purpose | Kendo-Free |
|-----------|----------|---------|------------|
| mj-tabstrip | ng-tab-strip | Custom tab navigation (NOT Kendo) | ✅ Yes |
| mj-collapsible-panel | ng-base-forms | Collapsible sections with search/filtering | ✅ Yes |
| mj-timeline | ng-timeline | Vertical timeline display | ✅ Yes |

### Form Components (Partial Abstraction)

| Component | Location | Purpose | Kendo-Free |
|-----------|----------|---------|------------|
| mj-form-field | ng-base-forms | Universal field wrapper - delegates to Kendo | ❌ No |
| mj-link-field | ng-base-forms | Foreign key relationship fields | ✅ Yes |
| mj-form-section-controls | ng-base-forms | Expand/collapse/search toolbar | ❌ Uses kendoButton |

### Specialized Components (Ready to Use)

| Component | Location | Purpose | Kendo-Free |
|-----------|----------|---------|------------|
| mj-tree / mj-tree-dropdown | ng-trees | Tree navigation and selection | ✅ Yes |
| mj-filter-builder | ng-filter-builder | Complex filter UI | ✅ Yes |
| mj-markdown | ng-markdown | Markdown renderer | ✅ Yes |
| mj-code-editor | ng-code-editor | Syntax-highlighted code editing | ✅ Yes |
| GenericDialogComponent | ng-generic-dialog | Base dialog with content projection | ✅ Yes |

### Services (Mixed Dependencies)

| Service | Location | Purpose | Kendo-Free |
|---------|----------|---------|------------|
| ToastService | ng-conversations | Toast notifications | ✅ Yes |
| DialogService | ng-conversations | Dialog wrapper | ❌ Wraps Kendo |
| MJNotificationService | ng-notifications | System notifications | ❌ Uses Kendo |
| SearchService | ng-conversations | Unified search | ✅ Yes |
| RecentAccessService | ng-shared | Recent items tracking | ✅ Yes |
| GoldenLayoutWrapperService | ng-dashboard-viewer | Dashboard panel management | ✅ Yes |

### Critical Finding: Form System Architecture

`mj-form-field` is a **SINGLE ABSTRACTION POINT** that could enable efficient migration:

```
mj-form-field (wrapper)
    └── Delegates to Kendo components:
        ├── kendo-textbox
        ├── kendo-textarea
        ├── kendo-numerictextbox
        ├── kendo-datepicker
        ├── kendo-dropdownlist
        ├── kendo-combobox
        └── kendoCheckBox
```

**Impact:** Modifying ONE component (`mj-form-field`) would migrate ~296 form field instances across the codebase.

### What MJ Already Has vs. What's Needed

| Category | Already Have | Still Need |
|----------|--------------|------------|
| Loading | ✅ mj-loading | - |
| Badges/Pills | ✅ mj-pill, mj-notification-badge | Unified badge system |
| Tabs | ✅ mj-tabstrip (custom) | - |
| Trees | ✅ mj-tree, mj-tree-dropdown | - |
| Panels | ✅ mj-collapsible-panel | - |
| Timeline | ✅ mj-timeline | - |
| Code Editor | ✅ mj-code-editor | - |
| Markdown | ✅ mj-markdown | - |
| Filters | ✅ mj-filter-builder | - |
| Buttons | ❌ Uses kendoButton | MJ button component |
| Form Inputs | ❌ Kendo via mj-form-field | Replace in mj-form-field |
| Dialogs | ⚠️ GenericDialogComponent exists | Full dialog service |
| Dropdowns | ❌ Kendo | Dropdown component |
| Date Pickers | ❌ Kendo | Date picker component |

---

## 1. GRID MIGRATION OPTIONS

### Option A: Complete AG Grid Migration (Recommended)

**Status:** Already 60% complete - infrastructure exists

| Metric | Value |
|--------|-------|
| Effort | 3-4 weeks |
| Risk | Low |
| Complexity | Medium |

#### Remaining Work

| Grid | Effort | Notes |
|------|--------|-------|
| UserViewGridComponent | 1-2 weeks | Most complex, but replacement exists |
| query-grid | 2-3 days | Convert to QueryDataGridComponent |
| template-params-grid | 2-3 days | Simple inline editing |
| compare-records | 3-5 days | Specialized comparison view |
| file-grid | 2-3 days | File browser integration |
| entity-permissions-grid | 1-2 days | Basic checkbox grid |
| Others (4 simple grids) | 3-4 days | Low complexity |

**Pros:**
- Migration path already established and documented
- AG Grid has feature parity+ (infinite scroll, better events)
- MIT license (free) vs Kendo commercial
- Smaller bundle size (~400KB vs ~2MB)
- Modern architecture, better TypeScript support
- EntityDataGridComponent already handles most use cases

**Cons:**
- UserViewGridComponent has complex inline editing that needs careful migration
- Some learning curve for team unfamiliar with AG Grid API
- Two grid libraries during transition period

---

### Option B: Keep Kendo Grid (Status Quo)

| Metric | Value |
|--------|-------|
| Effort | 0 |
| Risk | None (short-term) |
| Complexity | None |

**Pros:**
- No work required
- Team already knows Kendo
- All features working

**Cons:**
- Ongoing license cost
- Inconsistency with new AG Grid components
- Technical debt grows as new features use AG Grid
- Eventually need to migrate anyway

---

## 2. DIALOG/WINDOW MIGRATION OPTIONS

### Current Dialog Patterns Found

| Pattern | Count | Complexity |
|---------|-------|------------|
| Simple confirmations (DialogService) | ~20 | Low |
| Inline `<kendo-dialog>` with forms | ~15 | Medium |
| Service-based with dynamic components | ~10 | Medium |
| WindowService (drag/resize) | ~5 | Medium-High |
| Custom window manager (minimize/dock) | 1 | High |

---

### Option A: Angular Material Dialog

| Metric | Value |
|--------|-------|
| Effort | 4-6 weeks |
| Risk | Low-Medium |

#### Effort Breakdown

| Task | Effort |
|------|--------|
| Create MJ dialog service wrapper | 3-5 days |
| Migrate simple confirmations | 3-5 days |
| Migrate complex form dialogs | 1-2 weeks |
| Migrate draggable windows | 1-2 weeks |
| Rebuild custom window manager | 1-2 weeks |

**Pros:**
- Free (MIT license)
- Excellent accessibility (WCAG compliant)
- Google-backed, large community
- Good documentation
- Integrates well with Angular

**Cons:**
- No built-in drag/resize for windows (need CDK drag-drop)
- Material Design aesthetic may not match MJ branding
- No minimize/maximize (need custom implementation)
- Opinionated styling harder to override

---

### Option B: PrimeNG Dialog

| Metric | Value |
|--------|-------|
| Effort | 3-5 weeks |
| Risk | Low |

**Pros:**
- Similar API to Kendo (easier migration)
- Built-in draggable, resizable, maximizable
- MIT license (free)
- Comprehensive component set

**Cons:**
- Less polished than Kendo/Material
- Smaller community than Material
- Some edge case bugs reported
- Still no minimize button (custom needed)

---

### Option C: Custom Dialog System

| Metric | Value |
|--------|-------|
| Effort | 6-8 weeks |
| Risk | Medium |

**Pros:**
- Full design control
- Exact feature parity possible
- No external dependencies
- Can build minimize/dock natively

**Cons:**
- Significant development time
- Must handle accessibility ourselves
- Must handle edge cases (focus trap, scroll lock, stacking)
- Ongoing maintenance burden

---

### Option D: Headless UI (Angular CDK + Custom)

| Metric | Value |
|--------|-------|
| Effort | 5-7 weeks |
| Risk | Medium |

**Pros:**
- Angular CDK provides accessible primitives
- Full styling control
- No design system lock-in
- Can match MJ branding exactly

**Cons:**
- More work than pre-built components
- Need to build all visual chrome
- CDK overlay system has learning curve

---

## 3. FORM CONTROLS MIGRATION OPTIONS

### Components to Migrate

- Buttons (28 usages)
- Dropdowns/ComboBoxes (25 usages)
- TextInputs/TextAreas (50+ usages)
- Date Pickers (7 usages)
- Checkboxes/Switches
- Numeric inputs

---

### Option A: Angular Material

| Metric | Value |
|--------|-------|
| Effort | 2-3 weeks |
| Risk | Low |

**Pros:**
- Consistent with Material dialogs
- Excellent form integration (reactive forms)
- Built-in validation styling
- Good date picker

**Cons:**
- Material Design aesthetic
- DatePicker less feature-rich than Kendo
- No advanced ComboBox (need autocomplete workaround)

---

### Option B: PrimeNG

| Metric | Value |
|--------|-------|
| Effort | 2-3 weeks |
| Risk | Low |

**Pros:**
- Similar API to Kendo
- Feature-rich dropdowns and date pickers
- Easier migration path

**Cons:**
- Styling inconsistency with Material (if mixing)
- Bundle size if using full PrimeNG

---

### Option C: Native HTML + Custom Styling

| Metric | Value |
|--------|-------|
| Effort | 1-2 weeks (buttons, inputs) |
| Risk | Low |

**Pros:**
- Smallest bundle size
- Full control
- Native browser features

**Cons:**
- Date picker needs library or custom build
- ComboBox/autocomplete needs custom implementation
- Must handle all states (focus, error, disabled)

---

## 4. LAYOUT COMPONENTS MIGRATION OPTIONS

### Components to Migrate

- TabStrip (25 usages)
- Splitter (few usages)
- Card layouts
- Panels/Expanders

---

### Option A: Angular Material Tabs + CDK

| Metric | Value |
|--------|-------|
| Effort | 1-2 weeks |
| Risk | Low |

**Pros:**
- Material tabs work well
- CDK provides primitives for custom layouts

**Cons:**
- No built-in splitter (need library like angular-split)

---

### Option B: PrimeNG

| Metric | Value |
|--------|-------|
| Effort | 1-2 weeks |
| Risk | Low |

**Pros:**
- Has splitter component
- TabView similar to Kendo TabStrip

**Cons:**
- Adding another library if not using PrimeNG elsewhere

---

### Option C: Custom Components

| Metric | Value |
|--------|-------|
| Effort | 2-3 weeks |
| Risk | Low |

**Pros:**
- Tabs are relatively simple to build
- Full control over behavior

**Cons:**
- Time spent on solved problems

---

## 5. TREE VIEW MIGRATION OPTIONS

| Library | Effort | Pros | Cons |
|---------|--------|------|------|
| Angular Material Tree | 1 week | Free, accessible | Flat data model different from Kendo |
| PrimeNG Tree | 1 week | Similar API to Kendo | Additional dependency |
| AG Grid Tree Data | 1 week | Already have AG Grid | Overkill for simple trees |
| Custom | 2-3 weeks | Full control | Significant effort |

---

## 6. OVERALL STRATEGY RECOMMENDATIONS

### Strategy 1: AG Grid + Angular Material (Recommended)

| Component Type | Library | Effort |
|----------------|---------|--------|
| Grids | AG Grid | 3-4 weeks |
| Dialogs | Angular Material | 4-6 weeks |
| Form Controls | Angular Material | 2-3 weeks |
| Layout | Angular Material + angular-split | 1-2 weeks |
| Tree | Angular Material | 1 week |
| **Total** | | **11-16 weeks** |

**Pros:**
- Two well-maintained libraries
- Consistent design language
- Strong community support
- Free (MIT licenses)

**Cons:**
- Material Design aesthetic may need customization
- Some features need custom implementation (window minimize)

---

### Strategy 2: AG Grid + PrimeNG

| Component Type | Library | Effort |
|----------------|---------|--------|
| Grids | AG Grid | 3-4 weeks |
| Dialogs | PrimeNG | 3-5 weeks |
| Form Controls | PrimeNG | 2-3 weeks |
| Layout | PrimeNG | 1-2 weeks |
| Tree | PrimeNG | 1 week |
| **Total** | | **10-15 weeks** |

**Pros:**
- Closer API to Kendo (easier migration)
- More features out of the box
- Consistent within PrimeNG ecosystem

**Cons:**
- Less polished than Material
- Mixing AG Grid + PrimeNG = two design systems

---

### Strategy 3: AG Grid + PrimeNG (Selective)

Use PrimeNG only for complex components where MJ doesn't have alternatives:

| Component Type | Library | Effort |
|----------------|---------|--------|
| Grids | AG Grid | 3-4 weeks |
| Dialogs | PrimeNG Dialog | 2-3 weeks |
| Form Controls | PrimeNG (dropdown, datepicker) | 2-3 weeks |
| Simple UI | Existing MJ components | 1 week |
| Layout | Existing mj-tabstrip + PrimeNG splitter | 1 week |
| Tree | Existing mj-tree | 0 (already done) |
| **Total** | | **9-14 weeks** |

**Pros:**
- Leverages existing MJ infrastructure
- PrimeNG has similar API to Kendo (easier migration)
- Only adds PrimeNG where needed
- Keeps MJ branding for simple components

**Cons:**
- Two external libraries (AG Grid + PrimeNG)
- PrimeNG styling needs customization

---

### Strategy 4: AG Grid + Expand MJ Components (Recommended)

Leverage existing MJ components and expand with Angular CDK for complex controls:

| Component Type | Approach | Effort |
|----------------|----------|--------|
| Grids | AG Grid (already in progress) | 3-4 weeks |
| Buttons | New mj-button component | 3-5 days |
| Badges | Expand existing mj-pill, mj-notification-badge | 2-3 days |
| Tabs | Already have mj-tabstrip | 0 |
| Trees | Already have mj-tree | 0 |
| Panels | Already have mj-collapsible-panel | 0 |
| Loading | Already have mj-loading | 0 |
| Dialogs | Expand GenericDialogComponent + CDK overlay | 2-3 weeks |
| Form Inputs | Modify mj-form-field to use native/CDK | 2-3 weeks |
| Dropdowns | New mj-dropdown with CDK | 1-2 weeks |
| Date Picker | Use @angular/material/datepicker (standalone) | 3-5 days |
| **Total** | | **8-12 weeks** |

**Why This Works:**
- `mj-form-field` is a single abstraction point - modify once, migrate ~296 usages
- `mj-tabstrip` already exists and is NOT Kendo
- `mj-tree` already exists and is NOT Kendo
- Many UI primitives already exist (pills, badges, loading, timeline)
- Only need to build: buttons, dialog service, form inputs, dropdowns

**Pros:**
- Lowest effort due to existing infrastructure
- Full design control - MJ branding maintained
- Single abstraction point for forms enables efficient migration
- No new design system to learn
- Consistent with existing MJ patterns
- Only Material dependency is date picker (small, standalone)

**Cons:**
- Some components need to be built (buttons, dropdowns, dialogs)
- Must handle accessibility for new components
- Ongoing maintenance for custom components
- CDK learning curve for complex components

---

## 7. RISK COMPARISON

| Strategy | Technical Risk | Schedule Risk | Maintenance Risk |
|----------|----------------|---------------|------------------|
| AG Grid + Material | Low | Low | Low |
| AG Grid + PrimeNG | Low | Low | Low-Medium |
| AG Grid + PrimeNG (Selective) | Low | Low | Low |
| AG Grid + Expand MJ | Low-Medium | Low | Medium |

---

## 8. COST-BENEFIT SUMMARY

| Factor | Stay with Kendo | AG Grid + Material | AG Grid + PrimeNG | AG Grid + Expand MJ |
|--------|-----------------|--------------------|--------------------|---------------------|
| License Cost | ~$1000/dev/yr | $0 | $0 | $0 |
| Migration Effort | 0 | 11-16 weeks | 10-15 weeks | 8-12 weeks |
| Bundle Size | Large (~2MB) | Medium | Medium | Small |
| Design Control | Limited | Medium | Medium | Full |
| Team Learning | None | Moderate | Low | Low |
| Long-term Maintenance | Kendo handles | Community handles | Community handles | MJ team handles |
| Leverages Existing Code | N/A | No | No | Yes |

---

## 9. RECOMMENDED APPROACH

### Option A: Expand MJ Components (Best Value)

**Why This is Recommended:**
- MJ already has 60%+ of needed components
- Single abstraction point (`mj-form-field`) enables efficient form migration
- Lowest total effort due to existing infrastructure
- Full design control maintained

#### Phased Migration

| Phase | Work | Effort | Impact |
|-------|------|--------|--------|
| 1. Grids | Complete AG Grid migration | 3-4 weeks | Removes largest Kendo dependency |
| 2. Buttons | Create mj-button component | 3-5 days | Replace 28 kendoButton usages |
| 3. Form Fields | Modify mj-form-field template | 2-3 weeks | Migrates ~296 form inputs at once |
| 4. Dialogs | Expand GenericDialogComponent + CDK | 2-3 weeks | Replace DialogService |
| 5. Dropdowns | Create mj-dropdown with CDK | 1-2 weeks | Replace kendo-dropdownlist |
| 6. Date Picker | Add Material datepicker (standalone) | 3-5 days | Single dependency for dates |
| 7. Cleanup | Remove Kendo modules, test | 1 week | Final removal |

**Total: 8-12 weeks**

---

### Option B: AG Grid + PrimeNG (Faster, Less Control)

If speed is priority over design control:

| Phase | Work | Effort |
|-------|------|--------|
| 1. Grids | Complete AG Grid migration | 3-4 weeks |
| 2. Form Fields | Replace Kendo with PrimeNG in mj-form-field | 1-2 weeks |
| 3. Dialogs | Replace DialogService with PrimeNG | 1-2 weeks |
| 4. Cleanup | Remove Kendo, keep existing MJ components | 1 week |

**Total: 6-9 weeks**

**Trade-off:** Less design control, PrimeNG styling needs customization.

---

### Option C: AG Grid + Angular Material (Most Polished)

If polish and accessibility are priorities:

| Phase | Work | Effort |
|-------|------|--------|
| 1. Grids | Complete AG Grid migration | 3-4 weeks |
| 2. Form Fields | Replace Kendo with Material in mj-form-field | 2-3 weeks |
| 3. Dialogs | Replace DialogService with Material Dialog | 2-3 weeks |
| 4. Buttons | Replace kendoButton with Material buttons | 1 week |
| 5. Cleanup | Remove Kendo, test | 1-2 weeks |

**Total: 9-13 weeks**

**Trade-off:** Material Design aesthetic may need customization to match MJ branding.

---

## 10. SUMMARY: WHICH STRATEGY TO CHOOSE?

| If You Want... | Choose | Effort | Trade-off |
|----------------|--------|--------|-----------|
| Fastest migration | PrimeNG | 6-9 weeks | Less design control |
| Best value / leverage existing code | Expand MJ | 8-12 weeks | Some custom maintenance |
| Most polished UX | Material | 9-13 weeks | Material Design aesthetic |
| Maximum design control | Full Custom | 18-25 weeks | Highest effort |

### Key Insight: The mj-form-field Abstraction

Regardless of which library you choose, the migration is simplified because:
1. `mj-form-field` wraps ALL form inputs
2. Modify ONE component template to migrate ~296 form field instances
3. This single abstraction point makes ANY migration approach feasible

### Components That Need NO Migration (Already Custom)

- ✅ **mj-tabstrip** - Tabs
- ✅ **mj-tree / mj-tree-dropdown** - Trees
- ✅ **mj-loading** - Loading indicators
- ✅ **mj-pill** - Status pills
- ✅ **mj-notification-badge** - Badges
- ✅ **mj-collapsible-panel** - Collapsible sections
- ✅ **mj-timeline** - Timeline display
- ✅ **mj-filter-builder** - Filter UI
- ✅ **mj-markdown** - Markdown rendering
- ✅ **mj-code-editor** - Code editing
- ✅ **mj-link-field** - Foreign key fields
- ✅ **GenericDialogComponent** - Base dialog (needs expansion)
