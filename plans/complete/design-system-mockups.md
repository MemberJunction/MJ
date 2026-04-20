# Design System Mockups Plan

**Date**: January 27, 2026
**Status**: Draft
**Purpose**: Create HTML/CSS/JS mockups to establish and validate the MJ design system before implementing in Angular

---

## Objective

Build standalone HTML/CSS/JS mockups that:
1. Define the complete design token system (colors, typography, spacing, shadows, etc.)
2. **Align with existing CSS classes** already used across dashboards (see `dashboard-internal-consistency-analysis.md`)
3. Show consistent component styling across all dashboard types
4. Demonstrate light and dark themes
5. Get stakeholder approval before touching Angular code

---

## Key Insight: Build on What Exists

From the dashboard internal consistency analysis, we discovered that **AI dashboards (Agents, Models, Prompts) + Component Studio share ~90% consistent CSS patterns**. Rather than inventing new class names, we should:

1. **Adopt the AI dashboard patterns** as the standard (they're the most consistent)
2. **Consolidate entity-specific classes** into generic patterns with modifiers
3. **Add design tokens** to existing classes (not replace them)
4. **Migrate outliers** (Actions, Communication, Lists) to the standard pattern

### Existing Patterns to Preserve

| Pattern Type | Current Classes | Status |
|--------------|-----------------|--------|
| Headers | `.dashboard-header`, `.header-info`, `.header-controls` | **Keep** |
| Cards | `.card-header`, `.card-body`, `.card-actions` | **Keep** |
| Status | `.status-badge`, `.status-active`, `.status-inactive` | **Keep** |
| Layout | `.main-content`, `.content-area`, `.filter-panel` | **Keep** |
| Grids | `.agents-grid`, `.model-grid`, `.prompts-grid` | **Consolidate** to `.entity-grid` |
| Entity cards | `.agent-card`, `.model-card`, `.prompt-card` | **Consolidate** to `.entity-card` |

---

## Why Mockups First?

| Benefit | Description |
|---------|-------------|
| **Fast iteration** | Change CSS instantly without Angular builds |
| **Easy sharing** | Open HTML file in browser, no dev environment needed |
| **Stakeholder review** | Non-developers can view and give feedback |
| **Lock in design** | Finalize tokens before implementing across 13+ dashboards |
| **Reference spec** | Mockups become the source of truth for implementation |
| **Preserve investment** | Build on existing patterns, don't rewrite |

---

## Mockup Structure

```
plans/design-mockups/
├── index.html              # Main entry with navigation
├── tokens.css              # Design tokens (layered on existing classes)
├── components.css          # Consolidated component styles
├── theme-toggle.js         # Light/dark mode switcher
│
├── pages/
│   ├── buttons.html             # Button styles and variants
│   ├── cards.html               # Card layouts (entity-card pattern)
│   ├── dashboard-header.html    # Standard dashboard header pattern
│   ├── forms.html               # Form inputs, filter groups
│   ├── navigation.html          # Nav items, tabs, breadcrumbs
│   ├── status-badges.html       # status-badge patterns
│   ├── tables.html              # Data tables/grids
│   ├── filter-panels.html       # Filter panel patterns
│   ├── detail-panels.html       # Slide-in detail panels
│   ├── modals.html              # Modal/dialog patterns
│   ├── layouts.html             # content-area, main-content patterns
│   └── full-dashboard.html      # Complete dashboard example
│
└── assets/
    └── mj-logo.svg
```

---

## Phase 1: Token Definition

Create `tokens.css` that adds CSS variables to **enhance existing classes** without renaming them.

### Color Tokens (Based on AI Dashboard Colors)

```css
:root {
  /* ============================================
     PRIMITIVE TOKENS (Raw values from analysis)
     ============================================ */

  /* Indigo (AI Dashboards primary) */
  --color-indigo-400: #818cf8;
  --color-indigo-500: #6366f1;  /* Primary in AI dashboards */
  --color-indigo-600: #4f46e5;
  --color-indigo-700: #4338ca;

  /* Purple (AI Dashboards accent) */
  --color-purple-400: #a78bfa;
  --color-purple-500: #8b5cf6;  /* Accent in AI dashboards */
  --color-purple-600: #7c3aed;

  /* Blue (Dashboard/Query Browser) */
  --color-blue-500: #5c6bc0;
  --color-blue-600: #3949ab;

  /* Status colors */
  --color-success-500: #22c55e;
  --color-warning-500: #f59e0b;
  --color-error-500: #ef4444;
  --color-info-500: #3b82f6;

  /* Neutrals */
  --color-neutral-50: #f8fafc;
  --color-neutral-100: #f1f5f9;
  --color-neutral-200: #e2e8f0;
  --color-neutral-300: #cbd5e1;
  --color-neutral-400: #94a3b8;
  --color-neutral-500: #64748b;
  --color-neutral-600: #475569;
  --color-neutral-700: #334155;
  --color-neutral-800: #1e293b;
  --color-neutral-900: #0f172a;

  /* ============================================
     SEMANTIC TOKENS (What components reference)
     ============================================ */

  /* Backgrounds */
  --bg-page: var(--color-neutral-50);
  --bg-surface: #ffffff;
  --bg-surface-hover: var(--color-neutral-100);
  --bg-surface-active: var(--color-neutral-200);
  --bg-muted: var(--color-neutral-100);

  /* Text */
  --text-primary: var(--color-neutral-800);
  --text-secondary: var(--color-neutral-500);
  --text-muted: var(--color-neutral-400);
  --text-inverse: #ffffff;

  /* Borders */
  --border-default: var(--color-neutral-200);
  --border-strong: var(--color-neutral-300);

  /* Brand (using Indigo from AI dashboards) */
  --brand-primary: var(--color-indigo-500);
  --brand-primary-hover: var(--color-indigo-600);
  --brand-secondary: var(--color-purple-500);

  /* Interactive */
  --interactive-default: var(--color-indigo-500);
  --interactive-hover: var(--color-indigo-600);
  --interactive-active: var(--color-indigo-700);

  /* Status (matching existing .status-* classes) */
  --status-active: var(--color-success-500);
  --status-inactive: var(--color-neutral-400);
  --status-pending: var(--color-warning-500);
  --status-error: var(--color-error-500);
  --status-info: var(--color-info-500);
}

/* Dark theme */
[data-theme="dark"] {
  --bg-page: var(--color-neutral-900);
  --bg-surface: var(--color-neutral-800);
  --bg-surface-hover: var(--color-neutral-700);
  --bg-surface-active: var(--color-neutral-600);
  --bg-muted: var(--color-neutral-700);

  --text-primary: var(--color-neutral-100);
  --text-secondary: var(--color-neutral-400);
  --text-muted: var(--color-neutral-500);

  --border-default: var(--color-neutral-700);
  --border-strong: var(--color-neutral-600);
}
```

### Typography Tokens

```css
:root {
  --font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;

  /* Font sizes (matching existing dashboard patterns) */
  --text-xs: 0.75rem;    /* 12px - meta items */
  --text-sm: 0.875rem;   /* 14px - body text */
  --text-base: 1rem;     /* 16px - standard */
  --text-lg: 1.125rem;   /* 18px - card titles */
  --text-xl: 1.25rem;    /* 20px - section headers */
  --text-2xl: 1.5rem;    /* 24px - dashboard titles */

  /* Font weights */
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;

  /* Line heights */
  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.75;
}
```

### Spacing Tokens (4px base)

```css
:root {
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
}
```

### Effect Tokens

```css
:root {
  /* Shadows (matching card hover effects in AI dashboards) */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.08);
  --shadow-card-hover: 0 8px 25px rgba(0, 0, 0, 0.15);

  /* Border radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 200ms ease;
  --transition-slow: 300ms ease;
}
```

---

## Phase 2: Component Patterns (Using Existing Classes)

### Dashboard Header (Existing Pattern)

The AI dashboards already use this structure consistently:

```html
<!-- EXISTING PATTERN - Keep these class names -->
<header class="dashboard-header">
  <div class="header-info">
    <h1 class="dashboard-title">
      <i class="fa-solid fa-robot"></i>
      AI Agents
    </h1>
    <span class="item-count">24 agents</span>
  </div>
  <div class="header-controls">
    <button class="filter-toggle-btn">
      <i class="fa-solid fa-filter"></i>
      Filters
    </button>
    <button class="control-btn primary">
      <i class="fa-solid fa-plus"></i>
      New Agent
    </button>
  </div>
</header>
```

```css
/* Enhanced with tokens, same class names */
.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-4) var(--space-6);
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-default);
}

.header-info {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.dashboard-title {
  font-size: var(--text-2xl);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.dashboard-title i {
  color: var(--brand-primary);
}

.item-count {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  background: var(--bg-muted);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
}

.header-controls {
  display: flex;
  gap: var(--space-3);
}
```

### Entity Cards (Consolidated Pattern)

**Current:** `.agent-card`, `.model-card`, `.prompt-card`, `.component-card`
**Proposed:** Keep entity-specific classes but add shared `.entity-card` base

```html
<!-- Consolidated pattern -->
<div class="entity-card agent-card">
  <div class="card-header">
    <div class="entity-info">
      <div class="entity-icon">
        <i class="fa-solid fa-robot"></i>
      </div>
      <div class="entity-details">
        <h3 class="entity-name">Customer Support Agent</h3>
        <div class="entity-meta">
          <span class="meta-item">
            <i class="fa-solid fa-clock"></i>
            Updated 2h ago
          </span>
          <span class="meta-item">
            <i class="fa-solid fa-bolt"></i>
            125 runs
          </span>
        </div>
      </div>
    </div>
    <span class="status-badge status-active">Active</span>
  </div>

  <div class="card-body">
    <p class="entity-description">
      Handles customer inquiries and provides support responses.
    </p>
  </div>

  <div class="card-actions">
    <button class="action-btn">
      <i class="fa-solid fa-play"></i>
      Run
    </button>
    <button class="action-btn">
      <i class="fa-solid fa-edit"></i>
      Edit
    </button>
    <button class="view-btn">
      <i class="fa-solid fa-eye"></i>
      View
    </button>
  </div>
</div>
```

```css
/* Base entity card (shared by all entity types) */
.entity-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  transition: box-shadow var(--transition-normal),
              transform var(--transition-normal);
}

.entity-card:hover {
  box-shadow: var(--shadow-card-hover);
  transform: translateY(-2px);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: var(--space-4);
  border-bottom: 1px solid var(--border-default);
}

.entity-info {
  display: flex;
  gap: var(--space-3);
}

.entity-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-secondary));
  border-radius: var(--radius-md);
  color: var(--text-inverse);
  font-size: var(--text-lg);
}

.entity-details {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.entity-name {
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  margin: 0;
}

.entity-meta {
  display: flex;
  gap: var(--space-4);
}

.meta-item {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.card-body {
  padding: var(--space-4);
}

.entity-description {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: var(--leading-relaxed);
  margin: 0;
}

.card-actions {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--border-default);
  background: var(--bg-muted);
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
}

/* Entity-specific color overrides (preserve existing semantics) */
.agent-card .entity-icon {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
}

.model-card .entity-icon {
  background: linear-gradient(135deg, #3b82f6, #6366f1);
}

.prompt-card .entity-icon {
  background: linear-gradient(135deg, #8b5cf6, #a855f7);
}
```

### Status Badges (Existing Pattern)

```html
<!-- EXISTING PATTERN - Keep these class names -->
<span class="status-badge status-active">Active</span>
<span class="status-badge status-inactive">Inactive</span>
<span class="status-badge status-pending">Pending</span>
<span class="status-badge status-error">Error</span>
```

```css
/* Enhanced with tokens */
.status-badge {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  border-radius: var(--radius-full);
  text-transform: capitalize;
}

.status-active {
  background: color-mix(in srgb, var(--status-active) 15%, transparent);
  color: var(--status-active);
}

.status-inactive {
  background: color-mix(in srgb, var(--status-inactive) 15%, transparent);
  color: var(--status-inactive);
}

.status-pending {
  background: color-mix(in srgb, var(--status-pending) 15%, transparent);
  color: var(--status-pending);
}

.status-error {
  background: color-mix(in srgb, var(--status-error) 15%, transparent);
  color: var(--status-error);
}
```

### Buttons (Consolidating Existing Patterns)

**Current Classes:** `.control-btn`, `.action-btn`, `.action-btn-primary`, `.view-btn`, `.filter-toggle-btn`
**Proposal:** Keep all, add shared base styles

```html
<!-- Header/control buttons -->
<button class="control-btn">Default</button>
<button class="control-btn primary">Primary</button>

<!-- Card action buttons -->
<button class="action-btn">Action</button>
<button class="action-btn-primary">Primary Action</button>
<button class="action-btn-small">Small</button>
<button class="view-btn">View</button>

<!-- Filter toggle -->
<button class="filter-toggle-btn">
  <i class="fa-solid fa-filter"></i>
  Filters
</button>
```

```css
/* Shared button base */
.control-btn,
.action-btn,
.action-btn-primary,
.action-btn-small,
.view-btn,
.filter-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  border: none;
}

/* Control buttons (header actions) */
.control-btn {
  padding: var(--space-2) var(--space-4);
  background: var(--bg-surface);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
}

.control-btn:hover {
  background: var(--bg-surface-hover);
  border-color: var(--border-strong);
}

.control-btn.primary {
  background: var(--brand-primary);
  color: var(--text-inverse);
  border-color: var(--brand-primary);
}

.control-btn.primary:hover {
  background: var(--brand-primary-hover);
}

/* Action buttons (card actions) */
.action-btn {
  padding: var(--space-2) var(--space-3);
  background: transparent;
  color: var(--text-secondary);
}

.action-btn:hover {
  background: var(--bg-surface-hover);
  color: var(--brand-primary);
}

.action-btn-primary {
  padding: var(--space-2) var(--space-3);
  background: var(--brand-primary);
  color: var(--text-inverse);
}

.action-btn-small {
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs);
  background: transparent;
  color: var(--text-secondary);
}

.view-btn {
  padding: var(--space-2) var(--space-3);
  background: var(--bg-muted);
  color: var(--text-primary);
}

.view-btn:hover {
  background: var(--bg-surface-active);
}

/* Filter toggle button */
.filter-toggle-btn {
  padding: var(--space-2) var(--space-4);
  background: var(--bg-surface);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
}

.filter-toggle-btn:hover,
.filter-toggle-btn.active {
  background: var(--brand-primary);
  color: var(--text-inverse);
  border-color: var(--brand-primary);
}
```

### Filter Panel (Existing Pattern)

```html
<!-- EXISTING PATTERN -->
<aside class="filter-panel">
  <div class="filter-panel-header">
    <h3>Filters</h3>
    <button class="action-btn-small">Clear All</button>
  </div>

  <div class="filter-group">
    <label class="filter-label">Status</label>
    <select class="filter-input">
      <option>All</option>
      <option>Active</option>
      <option>Inactive</option>
    </select>
  </div>

  <div class="filter-group">
    <label class="filter-label">Type</label>
    <select class="filter-input">
      <option>All Types</option>
      <option>Customer Service</option>
      <option>Sales</option>
    </select>
  </div>
</aside>
```

```css
.filter-panel {
  width: 280px;
  background: var(--bg-surface);
  border-left: 1px solid var(--border-default);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.filter-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border-default);
}

.filter-panel-header h3 {
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  margin: 0;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.filter-label {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--text-primary);
}

.filter-input {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  background: var(--bg-surface);
  color: var(--text-primary);
}

.filter-input:focus {
  outline: none;
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand-primary) 20%, transparent);
}
```

### Layout Classes (Existing Pattern)

```html
<!-- EXISTING LAYOUT PATTERN -->
<div class="main-content">
  <div class="content-area">
    <!-- Main content here -->
    <div class="entity-grid">
      <!-- Cards go here -->
    </div>
  </div>

  <aside class="detail-panel" [class.open]="selectedItem">
    <!-- Detail view content -->
  </aside>
</div>
```

```css
.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.content-area {
  flex: 1;
  padding: var(--space-6);
  overflow-y: auto;
  background: var(--bg-page);
}

/* Consolidated grid class (replaces agents-grid, model-grid, prompts-grid) */
.entity-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: var(--space-6);
}

/* Detail panel (slide-in) */
.detail-panel {
  width: 0;
  overflow: hidden;
  background: var(--bg-surface);
  border-left: 1px solid var(--border-default);
  transition: width var(--transition-slow);
}

.detail-panel.open {
  width: 480px;
}
```

---

## Phase 3: Full Dashboard Mockup

Create a complete dashboard page demonstrating all patterns together:

```html
<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <link rel="stylesheet" href="../tokens.css">
  <link rel="stylesheet" href="../components.css">
</head>
<body>
  <div class="dashboard-container">

    <!-- Dashboard Header -->
    <header class="dashboard-header">
      <div class="header-info">
        <h1 class="dashboard-title">
          <i class="fa-solid fa-robot"></i>
          AI Agents
        </h1>
        <span class="item-count">24 agents</span>
      </div>
      <div class="header-controls">
        <button class="filter-toggle-btn">
          <i class="fa-solid fa-filter"></i>
          Filters
        </button>
        <button class="control-btn primary">
          <i class="fa-solid fa-plus"></i>
          New Agent
        </button>
      </div>
    </header>

    <!-- Main Content -->
    <div class="main-content">
      <div class="content-area">
        <div class="entity-grid">
          <!-- Entity cards here -->
        </div>
      </div>

      <!-- Filter Panel -->
      <aside class="filter-panel">
        <!-- Filters here -->
      </aside>
    </div>

  </div>

  <script src="../theme-toggle.js"></script>
</body>
</html>
```

---

## Phase 4: Migration Guide for Inconsistent Dashboards

### Actions Dashboard

**Current:** Uses Kendo components directly, different class names
**Migration:**
1. Replace `.overview-header` → `.dashboard-header`
2. Replace `.metric-card` → `.entity-card.metric-card` (keep metric-card as modifier)
3. Replace Kendo chips → `.status-badge`
4. Add token-based styling to existing Kendo wrappers

### Lists Dashboard

**Current:** 1600+ lines of inline styles in TypeScript
**Migration:**
1. Extract inline styles to `lists.component.css`
2. Replace custom classes with standard patterns
3. Replace `.browse-header` → `.dashboard-header`
4. Replace `.lists-grid` → `.entity-grid`

### Communication Dashboard

**Current:** Sidebar nav, cyan color scheme, `.stat-card`
**Migration:**
1. Keep sidebar pattern (it's valid for certain dashboards)
2. Replace `.stat-card` → `.entity-card.stat-card`
3. Update cyan colors to use tokens (can keep as dashboard-specific theme)

---

## Class Name Mapping

| Current (Keep) | Current (Consolidate) | Proposed Consolidated |
|----------------|----------------------|----------------------|
| `.dashboard-header` | - | - |
| `.header-info` | - | - |
| `.header-controls` | - | - |
| `.card-header` | - | - |
| `.card-body` | - | - |
| `.card-actions` | - | - |
| `.status-badge` | - | - |
| `.status-active/inactive/pending` | - | - |
| `.filter-panel` | - | - |
| `.filter-group` | - | - |
| `.meta-item` | - | - |
| `.control-btn` | - | - |
| `.action-btn` | - | - |
| `.view-btn` | - | - |
| - | `.agent-card` | `.entity-card.agent-card` |
| - | `.model-card` | `.entity-card.model-card` |
| - | `.prompt-card` | `.entity-card.prompt-card` |
| - | `.agents-grid` | `.entity-grid` |
| - | `.model-grid` | `.entity-grid` |
| - | `.prompts-grid` | `.entity-grid` |
| - | `.agent-icon` | `.entity-icon` |
| - | `.agent-name` | `.entity-name` |
| - | `.agent-description` | `.entity-description` |

---

## Deliverables

| Deliverable | Description |
|-------------|-------------|
| `tokens.css` | Design tokens that enhance existing classes |
| `components.css` | Consolidated component styles with tokens |
| Component HTML/CSS | Reference patterns preserving existing class names |
| Full dashboard mockup | Visual spec using real class names |
| Migration guide | How to update inconsistent dashboards |
| Light/dark screenshots | For stakeholder review |

---

## Success Criteria

1. **Preserves existing investment** - AI dashboard classes unchanged
2. **Stakeholder approval** on visual design
3. **Token system finalized** - no more hardcoded colors
4. **Consistent patterns** - every dashboard follows same layout
5. **Dark mode works** - all components adapt correctly
6. **Migration path clear** - outlier dashboards can be updated incrementally

---

## Next Steps

1. Create `plans/design-mockups/` directory
2. Build `tokens.css` with proposed values (based on existing #6366f1 scheme)
3. Build `components.css` using existing class names + tokens
4. Create component mockups showing existing patterns
5. Create full dashboard mockup
6. Review with team, iterate on design
7. Get final approval
8. Use as reference for migrating outlier dashboards

---

## Implementation Priority

| Priority | Dashboard | Effort | Notes |
|----------|-----------|--------|-------|
| 1 | AI Dashboards | Low | Already consistent, just add tokens |
| 2 | Component Studio | Low | SCSS → CSS + tokens |
| 3 | Testing/Scheduling | Low | Add tokens, keep nav pattern |
| 4 | EntityAdmin | Low | Minimal styles needed |
| 5 | Dashboard/Query Browser | Medium | Align colors with tokens |
| 6 | Credentials/Communication | Medium | Keep sidebar, align colors |
| 7 | Home | Medium | Align card patterns |
| 8 | DataExplorer | Medium | Complex layout, careful migration |
| 9 | Lists | High | Extract inline styles first |
| 10 | Actions | High | Kendo integration requires care |
