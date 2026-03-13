# Design Token Adoption & App Color Strategy

## Context

Dashboard components across MemberJunction Explorer hardcode hex colors — over 60 files with 100+ unique hex values. This creates visual inconsistency (different blues, different grays across apps) and breaks theming (hardcoded colors don't respond to light/dark mode).

Per the Feb 3, 2025 UX design meeting, the team decided:

- **App colors are nav wayfinding only** — top nav buttons, tab indicators. They do NOT extend into dashboard content.
- **All dashboard content uses the unified MJ token system** — same colors everywhere, regardless of which app you're in.
- **No per-app content theming** — avoids the "rainbow effect" and keeps the product feeling unified.

This guide serves as the team reference for the Kendo removal / token migration work.

---

## Table of Contents

1. [App Color Scope — Nav Wayfinding Only](#1-app-color-scope--nav-wayfinding-only)
2. [Token Adoption Decision Guide](#2-token-adoption-decision-guide)
3. [Chart & Data Visualization Colors](#3-chart--data-visualization-colors)
4. [Category/Type Colors](#4-categorytype-colors)
5. [Migration Inventory](#5-migration-inventory)
6. [Partially Migrated Files](#6-partially-migrated-files)
7. [Shared Patterns File Reference](#7-shared-patterns-file-reference)
8. [Legacy Variable Cleanup](#8-legacy-variable-cleanup)
9. [What NOT to Do](#9-what-not-to-do)

---

## 1. App Color Scope — Nav Wayfinding Only

The `Application.Color` field drives `--app-color`, which is set per-element via `[style.--app-color]` bindings in the shell template. Its scope is strictly limited to **navigation chrome**:

| Where app color IS used | Where app color is NOT used |
|---|---|
| Top nav bar app buttons (hover/active state) | Dashboard cards, panels, backgrounds |
| Active tab left-edge indicator | Primary action buttons |
| Active nav item background/text/icon | Chart colors or data visualizations |
| Tab active glow | Status badges (success/error/warning) |
| | KPI card borders or accents |
| | Any content inside a dashboard |

**Files that consume `--app-color` (exhaustive list):**

| File | Usage |
|---|---|
| `explorer-core/.../shell/shell.component.css` | Nav bar app button hover/active/indicator |
| `explorer-core/.../shell/components/header/app-nav.component.css` | Active nav item background/text/icon |
| `explorer-core/.../shell/components/tabs/tab-container.component.css` | Tab left-edge indicator and active glow |

**Why app colors don't flow into content:**

- **Brand color collisions** — A red-themed app would make danger buttons and error states visually ambiguous. Is that red button a delete action or just the app's brand?
- **Visual unity** — Users switch between apps frequently. If every app had its own content palette, the product would feel like a collection of disconnected tools rather than one unified platform.
- **Theming compatibility** — The token system supports light/dark mode and custom themes. Per-app content colors would need N x M variants (apps x themes), creating an unsustainable maintenance burden.
- **Accessibility** — Contrast ratios are validated against the token system's known palette. Random app colors could break WCAG compliance in content areas.

---

## 2. Token Adoption Decision Guide

Every hardcoded color in dashboard CSS or TypeScript should be replaced with a semantic MJ token. Use this table to find the right one:

### Primary Actions & Brand

| Pattern | Token | Notes |
|---|---|---|
| Primary action buttons | `var(--mj-brand-primary)` | The standard MJ blue |
| Button text on primary bg | `var(--mj-brand-on-primary)` | White on dark, dark on light |
| Button hover | `var(--mj-brand-primary-hover)` | |
| Button active/pressed | `var(--mj-brand-primary-active)` | |
| Secondary actions | `var(--mj-brand-tertiary)` | Cyan/teal family |
| Accent highlights | `var(--mj-brand-accent)` | Light blue family |
| Links | `var(--mj-text-link)` | |
| Link hover | `var(--mj-text-link-hover)` | |

### Status & Semantic Colors

Each status has four tokens for different contexts:

| Pattern | Base Token | Background | Text | Border |
|---|---|---|---|---|
| Success states | `--mj-status-success` | `--mj-status-success-bg` | `--mj-status-success-text` | `--mj-status-success-border` |
| Error/danger states | `--mj-status-error` | `--mj-status-error-bg` | `--mj-status-error-text` | `--mj-status-error-border` |
| Warning states | `--mj-status-warning` | `--mj-status-warning-bg` | `--mj-status-warning-text` | `--mj-status-warning-border` |
| Info states | `--mj-status-info` | `--mj-status-info-bg` | `--mj-status-info-text` | `--mj-status-info-border` |

### Surfaces & Backgrounds

| Pattern | Token |
|---|---|
| Page background | `var(--mj-bg-page)` |
| Card backgrounds | `var(--mj-bg-surface-card)` |
| Panel/dialog backgrounds | `var(--mj-bg-surface)` |
| Elevated surfaces (dropdowns, popovers) | `var(--mj-bg-surface-elevated)` |
| Sunken/inset areas | `var(--mj-bg-surface-sunken)` |
| Hover backgrounds | `var(--mj-bg-surface-hover)` |
| Active/pressed backgrounds | `var(--mj-bg-surface-active)` |
| Modal overlay backdrop | `var(--mj-bg-overlay)` |

### Text

| Pattern | Token |
|---|---|
| Primary body text (`#1e293b`, `#333`) | `var(--mj-text-primary)` |
| Secondary/supporting text (`#666`, `#475569`) | `var(--mj-text-secondary)` |
| Muted/de-emphasized text (`#999`, `#64748b`) | `var(--mj-text-muted)` |
| Disabled text | `var(--mj-text-disabled)` |
| Text on dark backgrounds (`#fff`) | `var(--mj-text-inverse)` |

### Borders & Dividers

| Pattern | Token |
|---|---|
| Standard borders (`#e0e0e0`, `#e0e6ed`) | `var(--mj-border-default)` |
| Subtle/light borders (`#f0f0f0`, `#e5e7eb`) | `var(--mj-border-subtle)` |
| Emphasized borders | `var(--mj-border-strong)` |
| Focus ring | `var(--mj-border-focus)` |
| Error borders | `var(--mj-border-error)` |

### Shadows

| Pattern | Token |
|---|---|
| Small shadow | `var(--mj-shadow-sm)` |
| Medium shadow | `var(--mj-shadow-md)` |
| Large shadow | `var(--mj-shadow-lg)` |
| Extra-large shadow | `var(--mj-shadow-xl)` |
| Brand-colored shadow | `var(--mj-shadow-brand-sm)`, `var(--mj-shadow-brand-md)` |

### Common Hex-to-Token Mapping

These are the most frequently hardcoded hex values found in the codebase and their token replacements:

| Hardcoded Hex | Approx. Name | Replace With |
|---|---|---|
| `#6366f1` | Indigo | `var(--mj-brand-primary)` for actions, or primitive `var(--mj-color-indigo-500)` for decorative |
| `#8b5cf6` | Purple | `var(--mj-brand-accent)` for accents, or `var(--mj-color-violet-500)` for decorative |
| `#2196f3`, `#3b82f6` | Blue | `var(--mj-brand-primary)` for actions, `var(--mj-status-info)` for info states |
| `#10b981`, `#4caf50` | Green | `var(--mj-status-success)` |
| `#f59e0b`, `#ff9800` | Amber | `var(--mj-status-warning)` |
| `#ef4444`, `#f44336`, `#d32f2f` | Red | `var(--mj-status-error)` |
| `#06b6d4`, `#00bcd4` | Cyan | `var(--mj-brand-tertiary)` |
| `#ec4899` | Pink | `var(--mj-highlight)` |
| `#1e293b`, `#333` | Dark slate | `var(--mj-text-primary)` |
| `#475569`, `#666` | Medium gray | `var(--mj-text-secondary)` |
| `#64748b`, `#999` | Muted gray | `var(--mj-text-muted)` |
| `#e0e0e0`, `#ddd` | Light gray border | `var(--mj-border-default)` |
| `#f5f7fa`, `#f8f9fa` | Light background | `var(--mj-bg-surface-card)` |
| `#fff`, `#ffffff` | White | `var(--mj-bg-surface)` or `var(--mj-text-inverse)` depending on context |

---

## 3. Chart & Data Visualization Colors

Charts need multiple distinct colors for series. These should **never** be derived from app colors. Use the following approach:

### Semantic Series (Preferred When Applicable)

When chart series have inherent meaning, use status tokens:

```typescript
// Success rate chart, error rate chart, etc.
const semanticColors = {
    success: getComputedStyle(root).getPropertyValue('--mj-status-success').trim(),
    warning: getComputedStyle(root).getPropertyValue('--mj-status-warning').trim(),
    error:   getComputedStyle(root).getPropertyValue('--mj-status-error').trim(),
    info:    getComputedStyle(root).getPropertyValue('--mj-status-info').trim(),
};
```

### Non-Semantic Series (Arbitrary Data Categories)

When chart series are arbitrary (model comparison, time-based breakdown, etc.), use the brand token family:

```typescript
const seriesColors = [
    getComputedStyle(root).getPropertyValue('--mj-brand-primary').trim(),
    getComputedStyle(root).getPropertyValue('--mj-brand-accent').trim(),
    getComputedStyle(root).getPropertyValue('--mj-brand-tertiary').trim(),
    getComputedStyle(root).getPropertyValue('--mj-color-indigo-500').trim(),
    getComputedStyle(root).getPropertyValue('--mj-color-violet-500').trim(),
];
```

### Helper for Reading Tokens in TypeScript

For components that need multiple token values (common in chart libraries), use a helper method:

```typescript
private getTokenValue(token: string): string {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(token).trim();
}

// Usage
const colors = [
    this.getTokenValue('--mj-brand-primary'),
    this.getTokenValue('--mj-brand-accent'),
    this.getTokenValue('--mj-brand-tertiary'),
];
```

### Future Consideration: Chart Palette Tokens

If the existing tokens prove insufficient for complex multi-series charts (8+ series), a dedicated `--mj-chart-*` palette could be defined in `_tokens.scss`. For now, combining brand + status + primitive tokens covers all current use cases.

---

## 4. Category/Type Colors

Several dashboards assign colors to categories — API scope types, credential categories, component types, operation types. These are **decorative, not semantic** — the color doesn't convey meaning, it just helps distinguish items visually.

### Use Fixed Primitive Token Palette

Instead of hardcoding hex values, use a fixed rotation of MJ primitive color tokens:

```typescript
const CATEGORY_PALETTE: string[] = [
    'var(--mj-color-brand-500)',      // Blue
    'var(--mj-color-accent-500)',     // Light blue
    'var(--mj-color-tertiary-500)',   // Cyan
    'var(--mj-color-indigo-500)',     // Indigo
    'var(--mj-color-violet-500)',     // Purple
    'var(--mj-color-success-500)',    // Green
    'var(--mj-color-warning-500)',    // Amber
    'var(--mj-color-error-500)',      // Red
];

// Assign colors by index, cycling if more categories than colors
function getCategoryColor(index: number): string {
    return CATEGORY_PALETTE[index % CATEGORY_PALETTE.length];
}
```

### For TypeScript (Chart Libraries, Inline Styles)

When you need resolved hex values (e.g., for D3, Chart.js, or `[style.color]` bindings), read the computed values:

```typescript
private readonly categoryPaletteTokens = [
    '--mj-color-brand-500',
    '--mj-color-accent-500',
    '--mj-color-tertiary-500',
    '--mj-color-indigo-500',
    '--mj-color-violet-500',
    '--mj-color-success-500',
    '--mj-color-warning-500',
    '--mj-color-error-500',
];

private resolveCategoryPalette(): string[] {
    const root = document.documentElement;
    return this.categoryPaletteTokens.map(token =>
        getComputedStyle(root).getPropertyValue(token).trim()
    );
}
```

This ensures category colors automatically adapt to the active theme.

---

## 5. Migration Inventory

The following files contain hardcoded hex colors that need migration. They are organized by dashboard/feature area, heaviest first.

### AI Dashboard

| File | Hex Count | What the Colors Are Used For | Token Replacement Strategy |
|---|---|---|---|
| `dashboards/src/AI/components/execution-monitoring.component.ts` | ~97 | Background gradients, chart cost bar segments, button hover states, status badges, tab navigation, token visualization segments | Status tokens for semantic states; brand/primitive tokens for chart segments; surface tokens for backgrounds |
| `dashboards/src/AI/components/widgets/kpi-card.component.ts` | ~10 | Left border indicators (primary/success/warning/danger/info), icon gradient backgrounds, hover border transitions | Status tokens for semantic borders; brand token for primary |
| `dashboards/src/AI/components/widgets/live-execution-widget.component.ts` | ~2 | SVG progress ring colors | Brand primary for ring stroke |

### Credentials Dashboard

| File | Hex Count | What the Colors Are Used For | Token Replacement Strategy |
|---|---|---|---|
| `dashboards/src/Credentials/components/credentials-categories-resource.component.ts` | ~7 | Category color array for chart segments | Category palette tokens (see Section 4) |
| `dashboards/src/Credentials/components/credentials-types-resource.component.ts` | ~7 | Type color assignments | Category palette tokens |
| `dashboards/src/Credentials/components/credentials-audit-resource.component.ts` | ~7 | Operation type indicators (Create/Update/Delete/Validate/Access) | Status tokens for CRUD operations; category palette for non-semantic |
| `dashboards/src/Credentials/components/credentials-overview-resource.component.ts` | ~7 | Overview chart color map | Category palette tokens |

### Scheduling Dashboard

| File | Hex Count | What the Colors Are Used For | Token Replacement Strategy |
|---|---|---|---|
| `dashboards/src/Scheduling/components/scheduling-activity.component.ts` | ~3 | Success rate conditional coloring (green/amber/red) | `--mj-status-success` / `--mj-status-warning` / `--mj-status-error` |
| `dashboards/src/Scheduling/components/scheduling-jobs.component.ts` | ~3 | Job health indicators | Same status token pattern |
| `dashboards/src/Scheduling/components/scheduling-overview.component.ts` | ~6 | Overview health score coloring | Same status token pattern |

### Testing Dashboard

| File | Hex Count | What the Colors Are Used For | Token Replacement Strategy |
|---|---|---|---|
| `dashboards/src/Testing/components/widgets/test-run-detail-panel.component.ts` | ~20 | Gradient header, metric card borders, form styling, section dividers | Brand gradient for header; status tokens for metric colors; surface/border tokens for layout |

### Communication Dashboard

| File | Hex Count | What the Colors Are Used For | Token Replacement Strategy |
|---|---|---|---|
| `dashboards/src/Communication/communication-runs-resource.component.ts` | ~12 | Stat card backgrounds/text, timeline progress dots (in-progress/completed/failed/pending) | Status tokens for timeline states; surface tokens for card backgrounds |

### API Keys Dashboard

| File | Hex Count | What the Colors Are Used For | Token Replacement Strategy |
|---|---|---|---|
| `dashboards/src/APIKeys/api-scopes-panel.component.ts` | ~8 | Scope category color map (Entities/Agents/Admin/Actions/Queries/Reports/Communication) | Category palette tokens |
| `dashboards/src/APIKeys/api-usage-panel.component.ts` | ~4 | HTTP status chart colors (2xx green, 3xx blue, 4xx amber, 5xx red) | Status tokens (success/info/warning/error) |
| `dashboards/src/APIKeys/api-key-*.component.ts` | ~4 | Individual accent colors | Brand primary token |

### Lists Dashboard

| File | Hex Count | What the Colors Are Used For | Token Replacement Strategy |
|---|---|---|---|
| `dashboards/src/Lists/services/list-set-operations.service.ts` | ~8 | Venn diagram set colors | Category palette tokens |
| `dashboards/src/Lists/components/lists-my-lists-resource.component.ts` | ~6 | Search box styling, header icons, item badges | Surface/text/border tokens |
| `dashboards/src/Lists/components/lists-operations-resource.component.ts` | ~4 | UI accent colors | Brand tokens |

### System Diagnostics

| File | Hex Count | What the Colors Are Used For | Token Replacement Strategy |
|---|---|---|---|
| `dashboards/src/SystemDiagnostics/system-diagnostics.component.ts` | ~16 | D3 performance chart category colors, SVG axis labels, tooltips | Category palette tokens for series; text tokens for labels |

### Home Dashboard

| File | Hex Count | What the Colors Are Used For | Token Replacement Strategy |
|---|---|---|---|
| `dashboards/src/Home/home-dashboard.component.ts` | ~1 | `#1976d2` fallback for app color | Remove — use `var(--mj-brand-primary)` |

### Actions Dashboard (Already Migrated)

The Actions dashboard components (`categories-list-view`, `code-management`, `security-permissions`) are already using Kendo theme variables (`--kendo-color-primary`, etc.). These will be updated to MJ tokens when Kendo is removed, but are not an urgent migration target.

---

## 6. Partially Migrated Files

Several files use CSS custom variables with hardcoded hex fallbacks:

```css
/* Example of partial migration pattern */
color: var(--some-custom-var, #6366f1);
background: var(--card-bg, #f8fafc);
```

These files defined their own CSS variables but used hardcoded fallbacks instead of MJ tokens. The fix for these files is:

1. **Replace the custom variable** with the appropriate MJ token
2. **Remove the hex fallback** — MJ tokens are always defined in `_tokens.scss`

```css
/* BEFORE — custom var with hex fallback */
color: var(--some-custom-var, #6366f1);

/* AFTER — standard MJ token, no fallback needed */
color: var(--mj-brand-primary);
```

**Known partially migrated files:**
- Communication dashboard components (using `var(--mat-sys-*)` Material variables)
- Credentials category component CSS (using custom variables with hex fallbacks)

---

## 7. Shared Patterns File Reference

Before writing custom CSS for cards, buttons, badges, inputs, panels, or tables, check:

> **`packages/Angular/Explorer/explorer-app/src/lib/styles/_shared-patterns.scss`**

This file already defines token-based styling for **60+ class name variants** across these pattern families:

| Pattern | Class Names | What It Provides |
|---|---|---|
| **Cards** | `.mj-card`, `.dashboard-card`, `.stat-card`, `.kpi-card`, `.metric-card`, `.action-card`, `.prompt-card`, `.agent-card`, `.model-card`, + 30 more | Background, border, shadow, padding, hover transitions |
| **Card Sub-elements** | `.mj-card-header`, `.card-header`, `.mj-card-body`, `.card-body`, `.mj-card-footer`, `.card-footer` | Consistent padding, borders, typography |
| **Stat Elements** | `.stat-icon`, `.stat-value`, `.stat-label`, `.stat-content` | Icon sizing, value typography, label muting |
| **Buttons** | `.mj-btn`, `.mj-btn-primary`, `.mj-btn-secondary`, `.mj-btn-ghost`, `.mj-btn-danger`, `.mj-btn-sm` | All states (hover/active/focus/disabled) using tokens |
| **Badges** | `.mj-badge`, `.status-badge`, `.mj-badge-success`, `.mj-badge-warning`, `.mj-badge-error`, `.mj-badge-info`, `.mj-badge-neutral` | Status-colored badges using token families |
| **Inputs** | `.mj-input`, `.mj-search-input`, `.search-input`, `.filter-input` | Border, focus ring, placeholder styling |
| **Panels** | `.mj-panel`, `.filter-panel`, `.detail-panel` | Surface background, header/body structure |
| **Tables** | `.mj-table`, `.data-table`, `.entity-table` | Header/row styling, hover, borders |
| **Headers** | `.dashboard-header`, `.mj-dashboard-header` | Layout with `.header-info` and `.header-controls` regions |
| **Empty/Loading** | `.mj-empty-state`, `.empty-state`, `.mj-loading`, `.loading-state` | Centered content with muted styling |
| **Overlays** | `.mj-loading-overlay`, `.loading-overlay`, `.mj-modal-overlay` | Semi-transparent overlay backgrounds |
| **Utilities** | `.text-muted`, `.text-secondary`, `.text-primary`, `.text-link`, `.bg-surface`, `.border-default`, `.shadow-md` | Quick token-backed utility classes |

**How to use:** Apply these class names to your component HTML. The shared patterns file is globally included, so no additional imports are needed. Components keep their semantic class names (like `.kpi-card` or `.action-card`) and get consistent token-based styling automatically.

---

## 8. Legacy Variable Cleanup

### Bridge File

> **`packages/Angular/Explorer/explorer-app/src/lib/styles/_variables.scss`**

This file maps legacy variable names to MJ tokens for backward compatibility:

| Legacy Variable | Maps To | Used By |
|---|---|---|
| `--navy` | `--mj-color-brand-900` | Kendo overrides, older components |
| `--light-blue` | `--mj-color-accent-300` | Kendo overrides |
| `--mj-blue` | `--mj-color-brand-500` | Kendo overrides |
| `--white-color` | `--mj-color-neutral-0` | Kendo overrides |
| `--gray-600` | `--mj-color-neutral-100` | Kendo overrides |
| `--gray-700` | `--mj-color-neutral-200` | Kendo overrides |
| `--gray-800` | `--mj-color-neutral-400` | Kendo overrides |
| `--gray-900` | `--mj-color-neutral-700` | Kendo overrides |
| `--med-gray` | `--mj-color-neutral-200` | Kendo overrides |
| `--shadow` | `--mj-shadow-md` | Various |
| `--border-radius` | `--mj-radius-lg` | Various |
| `--transition-time` | `--mj-transition-base` | Various |

Additionally, five Kendo-specific variables are mapped:

| Kendo Variable | Maps To |
|---|---|
| `--kendo-color-primary` | `--mj-color-brand-500` |
| `--kendo-color-secondary` | `--mj-color-brand-900` |
| `--kendo-color-primary-hover` | `--mj-color-brand-600` |
| `--kendo-color-secondary-hover` | `--mj-color-brand-800` |
| `--kendo-color-primary-on-surface` | `--mj-color-brand-500` |

### Migration Path

The primary consumer of these legacy variables is:

> **`packages/Angular/Explorer/explorer-app/src/lib/styles/_kendo-theme-override.scss`**

This file has 300+ references to legacy and Kendo variables. As Kendo components are replaced, these references should be updated directly to use MJ semantic tokens (not the primitive colors the bridge maps to). For example:

```css
/* BEFORE — legacy variable */
color: var(--navy);

/* WRONG — using the primitive the bridge maps to */
color: var(--mj-color-brand-900);

/* CORRECT — using the semantic token for the purpose */
color: var(--mj-brand-secondary);  /* Navy is our secondary brand */
```

The bridge file (`_variables.scss`) can be removed entirely once all legacy references are migrated.

---

## 9. What NOT to Do

### Don't use app `Color` for anything beyond nav chrome
```css
/* BAD — app color bleeding into content */
.dashboard-card { border-left-color: var(--app-color); }
.kpi-value { color: var(--mj-app-accent); }

/* GOOD — nav-only usage */
.nav-button:hover { background: var(--app-color); }
```

### Don't create per-component CSS variables that duplicate existing tokens
```css
/* BAD — reinventing the wheel */
.my-component {
    --my-card-bg: #f8fafc;
    --my-border: #e2e8f0;
    --my-text: #1e293b;
}

/* GOOD — use existing tokens */
.my-component {
    background: var(--mj-bg-surface-card);
    border-color: var(--mj-border-default);
    color: var(--mj-text-primary);
}
```

### Don't use hex fallbacks in `var()`
```css
/* BAD — hex fallback defeats theming */
color: var(--mj-brand-primary, #0076b6);

/* GOOD — no fallback needed, tokens are always defined */
color: var(--mj-brand-primary);

/* ALSO GOOD — fallback to another token if genuinely needed */
color: var(--mj-brand-primary-light, var(--mj-brand-primary));
```

### Don't hardcode light/dark values
```css
/* BAD — only works in light mode */
background: #ffffff;
color: #1e293b;

/* GOOD — auto-switches with theme */
background: var(--mj-bg-surface);
color: var(--mj-text-primary);
```

### Don't use rgba() with hardcoded colors for transparency
```css
/* BAD */
background: rgba(99, 102, 241, 0.1);

/* GOOD — use the subtle variant token */
background: var(--mj-brand-accent-subtle);

/* ALSO GOOD — use color-mix for custom opacity */
background: color-mix(in srgb, var(--mj-brand-primary) 10%, transparent);
```

### Don't skip the shared patterns file
Before writing custom card/button/badge/panel CSS, check `_shared-patterns.scss` (see [Section 7](#7-shared-patterns-file-reference)). If a pattern already exists, use the class name. If your use case isn't covered, consider adding to the shared file rather than creating one-off styles.

---

## Key File Paths

| File | Purpose |
|---|---|
| `packages/Angular/Explorer/explorer-app/src/lib/styles/_tokens.scss` | All MJ design tokens (primitives + semantic, light + dark) |
| `packages/Angular/Explorer/explorer-app/src/lib/styles/_shared-patterns.scss` | 60+ reusable token-based class patterns |
| `packages/Angular/Explorer/explorer-app/src/lib/styles/_variables.scss` | Legacy variable bridge (deprecated) |
| `packages/Angular/Explorer/explorer-app/src/lib/styles/_kendo-theme-override.scss` | Kendo component overrides (being removed) |
| `guides/THEMING.md` | Full theming system documentation |
