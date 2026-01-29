# Plan: CSS Consistency - Comprehensive Implementation Guide

## Summary

Standardize CSS across all MJ Angular components by:
1. Importing design tokens from mockups
2. Creating selector lists for shared base styles
3. Cataloging all semantic class names
4. Removing duplicate styles from component files

Each semantic class keeps its name, but all similar elements share base styling via CSS selector lists backed by design tokens.

---

## PHASE 1: Import Design Tokens

### Step 1.1: Create Token File

**Create file:** `/packages/Angular/Explorer/explorer-app/src/lib/styles/_tokens.scss`

**Action:** Copy the `:root` section from `plans/design-mockups/tokens.css` containing:
- Color primitives (--mj-color-brand-*, --mj-color-neutral-*, etc.)
- Semantic colors (--mj-bg-*, --mj-text-*, --mj-border-*)
- Spacing scale (--mj-space-*)
- Typography (--mj-text-xs through --mj-text-3xl, --mj-font-*)
- Border radius (--mj-radius-*)
- Shadows (--mj-shadow-*)
- Z-index scale (--mj-z-*)
- Transitions (--mj-transition-*)

### Step 1.2: Update main.scss Import Order

**Modify file:** `/packages/Angular/Explorer/explorer-app/src/lib/styles/main.scss`

**Change:** Add `_tokens` import at the top:
```scss
// Design tokens (must be first)
@import '_tokens';

// Existing imports follow...
@import '_variables';
// ...rest of imports
```

### Step 1.3: Verify Token Import

**Run:** `cd packages/Angular/Explorer/explorer-app && npm run build`

**Expected:** Build succeeds, tokens are available.

---

## PHASE 2: Audit All CSS Class Names

### Step 2.1: Find All Card-Like Classes

**Search commands:**
```bash
# Find card class definitions in CSS/SCSS
grep -r "\..*-card\s*{" packages/Angular --include="*.css" --include="*.scss" | grep -v node_modules

# Find card class usage in HTML templates
grep -r "class=.*card" packages/Angular --include="*.html" | grep -v node_modules
```

**Expected classes to find:**
- `.entity-card`
- `.mj-card`
- `.metric-card`
- `.dashboard-card`
- `.action-card`
- `.filter-card`
- Any others with "card" in name

**Document in:** Create audit section in this plan with actual findings.

### Step 2.2: Find All Button Classes

**Search commands:**
```bash
# Find button class definitions
grep -rE "\.(mj-btn|action-btn|control-btn|filter-btn)[^a-zA-Z]" packages/Angular --include="*.css" --include="*.scss" | grep -v node_modules

# Find button usage in templates
grep -rE "class=.*(mj-btn|action-btn|control-btn)" packages/Angular --include="*.html" | grep -v node_modules
```

**Expected classes:**
- `.mj-btn`, `.mj-btn-primary`, `.mj-btn-secondary`, `.mj-btn-ghost`
- `.action-btn`, `.action-btn-primary`, `.action-btn-small`
- `.control-btn`
- Any others

### Step 2.3: Find All Input/Search Classes

**Search commands:**
```bash
grep -rE "\.(mj-input|mj-search|search-input|filter-input)" packages/Angular --include="*.css" --include="*.scss" | grep -v node_modules
```

### Step 2.4: Find All Badge/Tag Classes

**Search commands:**
```bash
grep -rE "\.(mj-badge|status-badge|meta-item|tag)" packages/Angular --include="*.css" --include="*.scss" | grep -v node_modules
```

### Step 2.5: Find All Panel Classes

**Search commands:**
```bash
grep -rE "\.(mj-panel|filter-panel|detail-panel)" packages/Angular --include="*.css" --include="*.scss" | grep -v node_modules
```

### Step 2.6: Find All Header Classes

**Search commands:**
```bash
grep -rE "\.(dashboard-header|panel-header|card-header)" packages/Angular --include="*.css" --include="*.scss" | grep -v node_modules
```

### Step 2.7: Find All Table Classes

**Search commands:**
```bash
grep -rE "\.(mj-table|data-table|entity-table)" packages/Angular --include="*.css" --include="*.scss" | grep -v node_modules
```

---

## PHASE 3: Create Shared Pattern File

### Step 3.1: Create _shared-patterns.scss

**Create file:** `/packages/Angular/Explorer/explorer-app/src/lib/styles/_shared-patterns.scss`

**Structure:**
```scss
/* ===========================================
   MemberJunction Shared UI Patterns

   This file contains selector lists that apply
   shared base styles to all semantic class names
   of the same pattern type.
   =========================================== */

/* -------------------------------------------
   CARDS
   All card-like containers share these base styles
   ------------------------------------------- */
.entity-card,
.mj-card,
.metric-card,
.dashboard-card,
.action-card
/* ADD OTHER CARD CLASSES FROM AUDIT */ {
  background: var(--mj-bg-surface);
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mj-radius-lg);
  box-shadow: var(--mj-shadow-sm);
  overflow: hidden;
}

/* Card hover effect (for clickable cards only) */
a.entity-card:hover,
a.mj-card:hover,
.entity-card.clickable:hover,
.mj-card.clickable:hover {
  box-shadow: var(--mj-shadow-md);
  transform: translateY(-2px);
  transition: var(--mj-transition-base);
}

/* Card headers */
.entity-card > .card-header,
.mj-card > .mj-card-header,
.mj-card-header,
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--mj-space-4) var(--mj-space-5);
  border-bottom: 1px solid var(--mj-border-subtle);
}

/* Card bodies */
.entity-card > .card-body,
.mj-card > .mj-card-body,
.mj-card-body,
.card-body {
  padding: var(--mj-space-5);
}

/* Card footers */
.entity-card > .card-actions,
.mj-card > .mj-card-footer,
.mj-card-footer,
.card-footer {
  padding: var(--mj-space-3) var(--mj-space-5);
  border-top: 1px solid var(--mj-border-subtle);
  background: var(--mj-bg-surface-sunken);
}

/* -------------------------------------------
   BUTTONS
   ------------------------------------------- */
.mj-btn,
.action-btn,
.control-btn
/* ADD OTHER BUTTON CLASSES FROM AUDIT */ {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--mj-space-2);
  padding: var(--mj-space-2) var(--mj-space-4);
  font-family: var(--mj-font-family);
  font-size: var(--mj-text-sm);
  font-weight: var(--mj-font-medium);
  line-height: var(--mj-leading-tight);
  border: 1px solid transparent;
  border-radius: var(--mj-radius-md);
  cursor: pointer;
  transition: var(--mj-transition-colors);
  text-decoration: none;
}

.mj-btn:focus-visible,
.action-btn:focus-visible,
.control-btn:focus-visible {
  outline: none;
  box-shadow: var(--mj-focus-ring);
}

.mj-btn:disabled,
.action-btn:disabled,
.control-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Primary buttons */
.mj-btn-primary,
.action-btn-primary,
.control-btn.primary {
  background: var(--mj-brand-primary);
  color: var(--mj-brand-on-primary);
  border-color: var(--mj-brand-primary);
}

.mj-btn-primary:hover:not(:disabled),
.action-btn-primary:hover:not(:disabled),
.control-btn.primary:hover:not(:disabled) {
  background: var(--mj-brand-primary-hover);
  border-color: var(--mj-brand-primary-hover);
}

/* Secondary buttons */
.mj-btn-secondary,
.action-btn,
.control-btn {
  background: var(--mj-bg-surface);
  color: var(--mj-text-primary);
  border-color: var(--mj-border-default);
}

.mj-btn-secondary:hover:not(:disabled),
.action-btn:hover:not(:disabled),
.control-btn:hover:not(:disabled) {
  background: var(--mj-bg-surface-hover);
  border-color: var(--mj-border-strong);
}

/* Ghost buttons */
.mj-btn-ghost {
  background: transparent;
  color: var(--mj-text-primary);
  border-color: transparent;
}

.mj-btn-ghost:hover:not(:disabled) {
  background: var(--mj-bg-surface-hover);
}

/* Small buttons */
.mj-btn-sm,
.action-btn-small {
  padding: var(--mj-space-1-5) var(--mj-space-3);
  font-size: var(--mj-text-xs);
}

/* -------------------------------------------
   INPUTS
   ------------------------------------------- */
.mj-input,
.mj-search-input,
.filter-input
/* ADD OTHER INPUT CLASSES FROM AUDIT */ {
  width: 100%;
  padding: var(--mj-space-2-5) var(--mj-space-3);
  font-family: var(--mj-font-family);
  font-size: var(--mj-text-sm);
  color: var(--mj-text-primary);
  background: var(--mj-bg-surface);
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mj-radius-md);
  transition: border-color var(--mj-transition-fast), box-shadow var(--mj-transition-fast);
}

.mj-input::placeholder,
.mj-search-input::placeholder {
  color: var(--mj-text-muted);
}

.mj-input:hover,
.mj-search-input:hover {
  border-color: var(--mj-border-strong);
}

.mj-input:focus,
.mj-search-input:focus {
  outline: none;
  border-color: var(--mj-border-focus);
  box-shadow: var(--mj-focus-ring);
}

.mj-input:disabled,
.mj-search-input:disabled {
  background: var(--mj-bg-surface-sunken);
  color: var(--mj-text-disabled);
  cursor: not-allowed;
}

/* -------------------------------------------
   BADGES
   ------------------------------------------- */
.mj-badge,
.status-badge,
.meta-item
/* ADD OTHER BADGE CLASSES FROM AUDIT */ {
  display: inline-flex;
  align-items: center;
  gap: var(--mj-space-1);
  padding: var(--mj-space-1) var(--mj-space-2-5);
  font-size: var(--mj-text-xs);
  font-weight: var(--mj-font-medium);
  line-height: var(--mj-leading-tight);
  border-radius: var(--mj-radius-full);
  white-space: nowrap;
}

/* Badge variants */
.mj-badge-success,
.status-badge.status-active {
  background: var(--mj-status-success-bg);
  color: var(--mj-status-success-text);
  border: 1px solid var(--mj-status-success-border);
}

.mj-badge-warning,
.status-badge.status-pending {
  background: var(--mj-status-warning-bg);
  color: var(--mj-status-warning-text);
  border: 1px solid var(--mj-status-warning-border);
}

.mj-badge-error,
.status-badge.status-error {
  background: var(--mj-status-error-bg);
  color: var(--mj-status-error-text);
  border: 1px solid var(--mj-status-error-border);
}

.mj-badge-neutral,
.status-badge.status-inactive {
  background: var(--mj-bg-surface-sunken);
  color: var(--mj-text-secondary);
  border: 1px solid var(--mj-border-default);
}

/* -------------------------------------------
   PANELS
   ------------------------------------------- */
.mj-panel,
.filter-panel,
.detail-panel
/* ADD OTHER PANEL CLASSES FROM AUDIT */ {
  background: var(--mj-bg-surface);
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mj-radius-lg);
  box-shadow: var(--mj-shadow-sm);
}

/* Panel headers */
.mj-panel-header,
.filter-panel-header,
.detail-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--mj-space-3) var(--mj-space-4);
  border-bottom: 1px solid var(--mj-border-subtle);
}

/* Panel bodies */
.mj-panel-body,
.filter-panel-content,
.detail-panel-content {
  padding: var(--mj-space-4);
}

/* -------------------------------------------
   HEADERS
   ------------------------------------------- */
.dashboard-header,
.mj-dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--mj-space-4) var(--mj-space-6);
  background: var(--mj-bg-surface);
  border-bottom: 1px solid var(--mj-border-default);
  box-shadow: var(--mj-shadow-sm);
}

/* -------------------------------------------
   TABLES
   ------------------------------------------- */
.mj-table,
.data-table,
.entity-table
/* ADD OTHER TABLE CLASSES FROM AUDIT */ {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--mj-text-sm);
}

.mj-table th,
.data-table th,
.entity-table th {
  font-weight: var(--mj-font-semibold);
  color: var(--mj-text-secondary);
  background: var(--mj-bg-surface-sunken);
  padding: var(--mj-space-3) var(--mj-space-4);
  text-align: left;
  border-bottom: 1px solid var(--mj-border-default);
}

.mj-table td,
.data-table td,
.entity-table td {
  padding: var(--mj-space-3) var(--mj-space-4);
  border-bottom: 1px solid var(--mj-border-subtle);
}

.mj-table tbody tr:hover,
.data-table tbody tr:hover,
.entity-table tbody tr:hover {
  background: var(--mj-bg-surface-hover);
}

/* -------------------------------------------
   SEARCH BOXES
   ------------------------------------------- */
.mj-search-box,
.search-container
/* ADD OTHER SEARCH CLASSES FROM AUDIT */ {
  position: relative;
  display: flex;
  align-items: center;
}

.mj-search-icon,
.search-icon {
  position: absolute;
  left: var(--mj-space-3);
  color: var(--mj-text-muted);
  font-size: var(--mj-text-sm);
  pointer-events: none;
}

.mj-search-box .mj-search-input,
.search-container input {
  padding-left: var(--mj-space-10);
}
```

### Step 3.2: Add Import to main.scss

**Modify:** `/packages/Angular/Explorer/explorer-app/src/lib/styles/main.scss`

**Add after variables import:**
```scss
@import '_tokens';
@import '_variables';
@import '_shared-patterns';  // ADD THIS LINE
```

### Step 3.3: Verify Shared Patterns

**Run:** `cd packages/Angular/Explorer/explorer-app && npm run build`

**Expected:** Build succeeds.

---

## PHASE 4: Update Component CSS Files

### Step 4.1: Identify Components with Duplicate Styles

For each pattern type (cards, buttons, etc.), find component CSS files that define the same styles locally.

**Example search for card styles:**
```bash
grep -l "border-radius.*12px\|border-radius.*var(--radius" packages/Angular --include="*.css" -r | grep -v node_modules
```

### Step 4.2: Remove Duplicate Styles

For each component CSS file:
1. Compare local styles against shared patterns
2. Remove properties that match shared pattern (background, border, border-radius, box-shadow for cards)
3. Keep only type-specific properties (min-height, specific colors, layout adjustments)

**Example transformation:**

**Before** (`some-card.component.css`):
```css
.some-card {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  min-height: 200px;
  display: flex;
  flex-direction: column;
}
```

**After** (`some-card.component.css`):
```css
.some-card {
  /* Base card styles from _shared-patterns.scss */
  /* Only type-specific styles below */
  min-height: 200px;
  display: flex;
  flex-direction: column;
}
```

### Step 4.3: Update Selector List with New Classes

If audit finds card classes not in the selector list, add them:

**Edit:** `_shared-patterns.scss`

**Add to card selector list:**
```scss
.entity-card,
.mj-card,
.metric-card,
.some-card,  /* ADD NEWLY FOUND CLASS */
...
```

---

## PHASE 5: Component-by-Component Migration

### Priority Order

1. **Global/Common files** (highest impact):
   - `_common.scss`
   - `_utilities.scss`
   - `_kendo-theme-override.scss`

2. **High-visibility dashboards**:
   - AI Dashboard components
   - Entity Viewer components
   - Skip Chat components

3. **Generic library components**:
   - `/packages/Angular/Generic/entity-viewer/`
   - `/packages/Angular/Generic/conversations/`
   - `/packages/Angular/Generic/timeline/`
   - All other Generic packages

4. **Explorer app components**:
   - `/packages/Angular/Explorer/core-entity-forms/`
   - `/packages/Angular/Explorer/explorer-app/`

### Migration Checklist Per Component

For each component CSS file:
- [ ] Check if classes match a pattern type (card, button, input, etc.)
- [ ] Verify class is in selector list, add if missing
- [ ] Remove duplicate base styles
- [ ] Keep only type-specific styles
- [ ] Replace hardcoded colors with tokens
- [ ] Replace hardcoded spacing with tokens
- [ ] Test component renders correctly

---

## PHASE 6: Verification

### Step 6.1: Build Test

```bash
npm run build
```

**Expected:** No compilation errors.

### Step 6.2: Visual Regression Check

1. Start Explorer app: `npm run start:explorer`
2. Navigate to each major view:
   - AI Dashboard
   - Entity Explorer
   - Actions list
   - Any entity form
3. Verify cards, buttons, inputs look consistent
4. Verify no visual regressions

### Step 6.3: Audit Completeness

```bash
# Check for remaining hardcoded colors (should be minimal)
grep -rE "#[0-9a-fA-F]{3,6}" packages/Angular --include="*.css" --include="*.scss" | grep -v node_modules | grep -v "_tokens" | grep -v "tokens.css" | wc -l

# Check for remaining hardcoded z-index (should use tokens)
grep -rE "z-index:\s*[0-9]+" packages/Angular --include="*.css" --include="*.scss" | grep -v node_modules | wc -l
```

### Step 6.4: Dark Mode Test (if applicable)

If dark theme tokens are included:
1. Toggle dark mode
2. Verify all components adapt correctly
3. Check contrast and readability

---

## Files to Create

| File | Purpose |
|------|---------|
| `explorer-app/src/lib/styles/_tokens.scss` | Design token definitions |
| `explorer-app/src/lib/styles/_shared-patterns.scss` | Selector lists for shared styles |

## Files to Modify

| File | Changes |
|------|---------|
| `explorer-app/src/lib/styles/main.scss` | Add imports for tokens and shared patterns |
| `_common.scss` | Remove duplicate styles, use tokens |
| `_utilities.scss` | Update to use tokens |
| `_kendo-theme-override.scss` | Update colors to use tokens |
| ~80 component CSS files | Remove duplicate base styles |

---

## Estimated Time

| Phase | Time |
|-------|------|
| Phase 1: Import tokens | 30 min |
| Phase 2: Audit class names | 1-2 hours |
| Phase 3: Create shared patterns | 2 hours |
| Phase 4-5: Update components | 4-6 hours |
| Phase 6: Verification | 1 hour |
| **Total** | **8-12 hours** |

---

## Success Criteria

- [ ] All design tokens imported and available
- [ ] Selector lists created for: cards, buttons, inputs, badges, panels, headers, tables, search boxes
- [ ] No component CSS duplicates base styles that are in selector lists
- [ ] All shared styles use design tokens (no hardcoded colors)
- [ ] Build succeeds
- [ ] Visual consistency: same pattern type looks identical everywhere
- [ ] No visual regressions from current appearance
