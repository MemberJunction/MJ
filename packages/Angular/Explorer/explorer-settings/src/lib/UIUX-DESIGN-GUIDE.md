# Explorer Settings - UI/UX Design Guide

## Overview

This document defines the UI/UX design standards for the MemberJunction Explorer Settings module, based on **Google's Material Design 3 (MD3)** design system. All components in this module must adhere to these guidelines to ensure consistency, accessibility, and a modern user experience.

---

## Table of Contents

1. [Design System Foundation](#design-system-foundation)
2. [Theming with Angular Material](#theming-with-angular-material)
3. [Color System](#color-system)
4. [Typography](#typography)
5. [Spacing & Layout](#spacing--layout)
6. [Component Patterns](#component-patterns)
7. [Accessibility](#accessibility)
8. [Responsive Design](#responsive-design)
9. [Animation & Motion](#animation--motion)
10. [Implementation Checklist](#implementation-checklist)

---

## Design System Foundation

### Material Design 3 Principles

The Explorer Settings module follows MD3's core principles:

- **Personalization**: Customizable color schemes and density options
- **Accessibility**: WCAG 2.1 AA compliance minimum, with support for AAA where feasible
- **Expression**: Thoughtful use of color, shape, and motion to communicate brand and hierarchy
- **Consistency**: Unified light theme experience across all components

### Design Tokens

All design decisions are based on **Design Tokens** - semantic variables that define colors, typography, spacing, and other visual properties. Tokens ensure consistency and enable easy theme switching.

---

## Theming with Angular Material

### Theme Configuration

The Explorer Settings module uses Angular Material's `mat.theme` mixin to define a comprehensive theme based on MD3 tokens.

#### Base Theme Setup

Create or update the theme file at `packages/Angular/Explorer/explorer-settings/src/lib/theme.scss`:

```scss
@use '@angular/material' as mat;

html {
  @include mat.theme((
    color: (
      primary: mat.$violet-palette,
      theme-type: light,           // Light theme only
    ),
    typography: Roboto,            // Base font family
    density: 0                     // Standard density (0 to -5)
  ));

  // Apply system-level utility classes
  @include mat.system-classes();

  // Apply strong focus indicators for accessibility
  @include mat.strong-focus-indicators((
    border-color: var(--mat-sys-primary),
    border-style: solid,
    border-width: 2px,
    border-radius: 4px,
  ));
}

body {
  background: var(--mat-sys-surface);
  color: var(--mat-sys-on-surface);
  font-family: Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
```

#### Custom Color Palette (Optional)

If you need to customize the primary color beyond prebuilt palettes, generate a custom palette:

```bash
ng generate @angular/material:theme-color
```

Then use it in your theme:

```scss
@use './custom-palette' as custom;

html {
  @include mat.theme((
    color: (
      primary: custom.$primary-palette,
      theme-type: light,
    ),
    typography: Roboto,
    density: 0
  ));
}
```

#### Multiple Themes for Different Contexts

Use multiple theme calls to apply different color schemes in specific contexts:

```scss
html {
  @include mat.theme((
    color: (
      primary: mat.$violet-palette,
      theme-type: light,
    ),
    typography: Roboto,
    density: 0,
  ));
}

// Danger/destructive actions context with error color emphasis
.danger-context {
  @include mat.theme((
    color: (
      primary: mat.$red-palette,
      theme-type: light,
    ),
  ));
}

// SQL Logging code editor with custom syntax highlighting
.sql-logging-editor {
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  // Code editor uses its own dark theme for readability
  // This is an exception for syntax highlighting purposes
}
```

### Light Theme Configuration

The module uses a consistent light theme across all components. The `theme-type: light` setting ensures that only light color values are applied:

```scss
html {
  @include mat.theme((
    color: (
      primary: mat.$violet-palette,
      theme-type: light,  // Explicit light theme
    ),
    typography: Roboto,
    density: 0
  ));
}
```

This approach provides a unified, professional appearance optimized for daytime use and ensures consistent color behavior across all browsers without relying on the CSS `light-dark()` function.

### Loading Fonts

Include font loading in your application's `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
```

---

## Color System

### MD3 Color Tokens

**ALWAYS use MD3 color tokens instead of hardcoded colors.** This ensures consistency, maintainability, and accessibility across the application.

#### Surface Colors

Use for backgrounds and containers:

```scss
// Component background
.card {
  background: var(--mat-sys-surface);
  color: var(--mat-sys-on-surface);
}

// Elevated surface (cards, dialogs)
.elevated-card {
  background: var(--mat-sys-surface-container);
  color: var(--mat-sys-on-surface);
}

// Highest elevation (modals, popovers)
.dialog {
  background: var(--mat-sys-surface-container-highest);
}
```

#### Primary Colors

Use for primary actions, key UI elements, and brand expression:

```scss
.primary-button {
  background: var(--mat-sys-primary);
  color: var(--mat-sys-on-primary);

  &:hover {
    background: var(--mat-sys-primary-container);
    color: var(--mat-sys-on-primary-container);
  }
}
```

#### Secondary & Tertiary Colors

Use for supporting actions and accents:

```scss
.secondary-action {
  background: var(--mat-sys-secondary-container);
  color: var(--mat-sys-on-secondary-container);
}

.tertiary-badge {
  background: var(--mat-sys-tertiary-container);
  color: var(--mat-sys-on-tertiary-container);
}
```

#### Semantic Colors

Use semantic tokens for states and feedback:

```scss
.error-message {
  background: var(--mat-sys-error-container);
  color: var(--mat-sys-on-error-container);
}

.success-banner {
  background: var(--mat-sys-tertiary-container);  // Often mapped to success
  color: var(--mat-sys-on-tertiary-container);
}

.warning-indicator {
  background: var(--mat-sys-secondary-container);  // Often mapped to warning
  color: var(--mat-sys-on-secondary-container);
}
```

#### Border & Outline Colors

```scss
.card {
  border: 1px solid var(--mat-sys-outline-variant);
}

.focused-input {
  outline: 2px solid var(--mat-sys-outline);
}
```

### Utility Classes

Use Angular Material's utility classes for quick theming in templates:

```html
<!-- Background and text -->
<div class="mat-bg-surface mat-text-on-surface">
  <h2 class="mat-text-primary">Primary Text</h2>
  <p class="mat-text-on-surface-variant">Secondary text</p>
</div>

<!-- Elevation -->
<div class="mat-elevation-2 mat-bg-surface-container">
  Elevated card
</div>

<!-- Borders -->
<div class="mat-border-outline-variant">
  Card with border
</div>
```

### Color Anti-Patterns

**❌ DON'T DO THIS:**

```scss
// Hard-coded colors
.button {
  background-color: #2196f3;
  color: #ffffff;
}

// Hex values in styles
.card {
  border: 1px solid #e5e7eb;
}
```

**✅ DO THIS:**

```scss
// Use MD3 tokens
.button {
  background-color: var(--mat-sys-primary);
  color: var(--mat-sys-on-primary);
}

.card {
  border: 1px solid var(--mat-sys-outline-variant);
}
```

---

## Typography

### MD3 Typography Tokens

Use Material Design's typography scale tokens for all text:

```scss
.display-large {
  font: var(--mat-sys-display-large);
}

.headline-medium {
  font: var(--mat-sys-headline-medium);
}

.title-large {
  font: var(--mat-sys-title-large);
}

.body-large {
  font: var(--mat-sys-body-large);
}

.label-medium {
  font: var(--mat-sys-label-medium);
}
```

### Typography Scale

| Token | Use Case | Default Size |
|-------|----------|--------------|
| `display-large` | Hero headings | 57px |
| `display-medium` | Page titles | 45px |
| `display-small` | Section titles | 36px |
| `headline-large` | Card titles | 32px |
| `headline-medium` | Subsection headings | 28px |
| `headline-small` | Component titles | 24px |
| `title-large` | Dialog titles | 22px |
| `title-medium` | List item titles | 16px |
| `title-small` | Dense list items | 14px |
| `body-large` | Primary body text | 16px |
| `body-medium` | Secondary body text | 14px |
| `body-small` | Captions, hints | 12px |
| `label-large` | Buttons, tabs | 14px |
| `label-medium` | Form labels | 12px |
| `label-small` | Chips, badges | 11px |

### Custom Font Configuration

If you need distinct fonts for headings vs body text:

```scss
html {
  @include mat.theme((
    color: mat.$violet-palette,
    typography: (
      plain-family: Roboto,        // Body text
      brand-family: 'Roboto Slab', // Headings
      bold-weight: 700,
      medium-weight: 500,
      regular-weight: 400,
    ),
    density: 0,
  ));
}
```

### Typography Utility Classes

```html
<h1 class="mat-font-display-lg">Display Large</h1>
<h2 class="mat-font-headline-md">Headline Medium</h2>
<h3 class="mat-font-title-lg">Title Large</h3>
<p class="mat-font-body-lg">Body text large</p>
<span class="mat-font-label-md">Label medium</span>
```

### Typography Anti-Patterns

**❌ DON'T DO THIS:**

```scss
h1 {
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.2;
}
```

**✅ DO THIS:**

```scss
h1 {
  font: var(--mat-sys-headline-large);
}
```

---

## Spacing & Layout

### Spacing System

Use the MD3 spacing scale based on 4px increments:

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 4px | Tight spacing within components |
| `sm` | 8px | Component padding, small gaps |
| `md` | 12px | Default spacing between elements |
| `lg` | 16px | Card padding, section gaps |
| `xl` | 24px | Large section spacing |
| `2xl` | 32px | Page margins |
| `3xl` | 48px | Major section breaks |

### Layout Grid

Use CSS Grid or Flexbox with consistent gap values:

```scss
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;  // lg spacing
}

.form-layout {
  display: flex;
  flex-direction: column;
  gap: 24px;  // xl spacing
}
```

### Container Widths

```scss
.content-container {
  max-width: 1280px;  // Desktop
  margin: 0 auto;
  padding: 0 24px;
}

.narrow-container {
  max-width: 800px;
  margin: 0 auto;
}
```

### Elevation System

Use MD3 elevation levels for layering:

```scss
// Level 0: Base surface (no shadow)
.base-surface {
  box-shadow: none;
}

// Level 1: Resting cards
.card {
  box-shadow: var(--mat-sys-elevation-1);
}

// Level 2: Hovering cards
.card:hover {
  box-shadow: var(--mat-sys-elevation-2);
}

// Level 3: Dialogs, popovers
.dialog {
  box-shadow: var(--mat-sys-elevation-3);
}

// Level 4: Modal overlays
.modal {
  box-shadow: var(--mat-sys-elevation-4);
}

// Level 5: Top-level navigation
.app-bar {
  box-shadow: var(--mat-sys-elevation-5);
}
```

Or use utility classes:

```html
<div class="mat-elevation-1">Resting card</div>
<div class="mat-elevation-3">Dialog</div>
```

---

## Component Patterns

### Settings Card Pattern

Reusable collapsible card for settings sections:

```html
<app-settings-card
  [icon]="'fa-database'"
  [title]="'SQL Logging'"
  [defaultExpanded]="true">

  <div class="mat-bg-surface mat-text-on-surface">
    <!-- Card content here -->
  </div>
</app-settings-card>
```

**Component Styling:**

```scss
.settings-card {
  background: var(--mat-sys-surface-container);
  border: 1px solid var(--mat-sys-outline-variant);
  border-radius: 12px;
  box-shadow: var(--mat-sys-elevation-1);
  margin-bottom: 16px;

  &:hover {
    box-shadow: var(--mat-sys-elevation-2);
  }
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--mat-sys-surface);
  border-bottom: 1px solid var(--mat-sys-outline-variant);
  cursor: pointer;
}

.card-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--mat-sys-primary-container);
  color: var(--mat-sys-on-primary-container);
  border-radius: 8px;
  font-size: 1.25rem;
}

.card-title {
  flex: 1;
  font: var(--mat-sys-title-large);
  color: var(--mat-sys-on-surface);
}

.card-content {
  padding: 16px;
}
```

### Statistics Card Pattern

For displaying key metrics:

```html
<div class="stat-card mat-elevation-1 mat-bg-surface-container">
  <div class="stat-icon mat-bg-primary-container mat-text-on-primary-container">
    <i class="fa fa-database"></i>
  </div>
  <div class="stat-content">
    <div class="stat-value mat-text-on-surface">1,234</div>
    <div class="stat-label mat-text-on-surface-variant">Total Queries</div>
  </div>
</div>
```

**Styling:**

```scss
.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border-radius: 12px;
  transition: all 0.2s;

  &:hover {
    box-shadow: var(--mat-sys-elevation-2);
    transform: translateY(-2px);
  }
}

.stat-icon {
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  font-size: 1.5rem;
}

.stat-value {
  font: var(--mat-sys-headline-medium);
  font-weight: 700;
}

.stat-label {
  font: var(--mat-sys-body-small);
}
```

### Button Patterns

Use MD3 button styles consistently:

```html
<!-- Filled button (primary action) -->
<button class="mat-filled-button mat-bg-primary mat-text-on-primary">
  <i class="fa fa-play"></i>
  Start Session
</button>

<!-- Filled tonal button (secondary action) -->
<button class="mat-filled-tonal-button mat-bg-secondary-container mat-text-on-secondary-container">
  <i class="fa fa-refresh"></i>
  Refresh
</button>

<!-- Outlined button (tertiary action) -->
<button class="mat-outlined-button mat-border-outline mat-text-primary">
  <i class="fa fa-times"></i>
  Cancel
</button>

<!-- Text button (low emphasis) -->
<button class="mat-text-button mat-text-primary">
  Learn More
</button>
```

**Button Styling:**

```scss
// Base button styles
button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  font: var(--mat-sys-label-large);
  border: none;
  border-radius: 20px;  // MD3 full corner rounding
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;

  &:disabled {
    opacity: 0.38;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--mat-sys-primary);
    outline-offset: 2px;
  }
}

// Filled button
.mat-filled-button {
  box-shadow: var(--mat-sys-elevation-1);

  &:hover:not(:disabled) {
    box-shadow: var(--mat-sys-elevation-2);
  }

  &:active:not(:disabled) {
    box-shadow: var(--mat-sys-elevation-0);
  }
}

// Filled tonal button
.mat-filled-tonal-button {
  &:hover:not(:disabled) {
    box-shadow: var(--mat-sys-elevation-1);
  }
}

// Outlined button
.mat-outlined-button {
  background: transparent;
  border: 1px solid var(--mat-sys-outline);

  &:hover:not(:disabled) {
    background: var(--mat-sys-surface-container-highest);
  }
}

// Text button
.mat-text-button {
  background: transparent;
  padding: 10px 12px;

  &:hover:not(:disabled) {
    background: var(--mat-sys-surface-container-highest);
  }
}
```

### Form Input Patterns

Use consistent form field styling:

```html
<div class="form-field">
  <label class="mat-font-label-md mat-text-on-surface">
    Username
  </label>
  <input
    type="text"
    class="mat-input mat-bg-surface mat-text-on-surface"
    placeholder="Enter username">
  <span class="form-hint mat-font-body-sm mat-text-on-surface-variant">
    Must be at least 3 characters
  </span>
</div>
```

**Styling:**

```scss
.form-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.mat-input {
  padding: 12px 16px;
  border: 1px solid var(--mat-sys-outline);
  border-radius: 4px;  // Small corner rounding for inputs
  font: var(--mat-sys-body-large);
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: var(--mat-sys-primary);
    box-shadow: 0 0 0 3px var(--mat-sys-primary-container);
  }

  &:disabled {
    opacity: 0.38;
    cursor: not-allowed;
  }

  &::placeholder {
    color: var(--mat-sys-on-surface-variant);
    opacity: 0.6;
  }
}

.form-hint {
  margin-top: 4px;
}
```

### Empty State Pattern

Communicate absence of data clearly:

```html
<div class="empty-state mat-text-center">
  <i class="fa fa-inbox empty-state-icon mat-text-on-surface-variant"></i>
  <h3 class="mat-font-title-lg mat-text-on-surface">No Sessions Found</h3>
  <p class="mat-font-body-md mat-text-on-surface-variant">
    Start a new SQL logging session to begin tracking queries.
  </p>
  <button class="mat-filled-button mat-bg-primary mat-text-on-primary">
    <i class="fa fa-play"></i>
    Start Session
  </button>
</div>
```

**Styling:**

```scss
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 48px 24px;
  text-align: center;
}

.empty-state-icon {
  font-size: 4rem;
  opacity: 0.5;
}
```

### Modal Dialog Pattern

Consistent modal structure:

```html
<div class="modal-overlay" (click)="closeModal()">
  <div class="modal-dialog mat-elevation-5 mat-bg-surface-container-highest"
       (click)="$event.stopPropagation()">

    <div class="modal-header">
      <h2 class="mat-font-title-lg mat-text-on-surface">Dialog Title</h2>
      <button class="mat-text-button" (click)="closeModal()">
        <i class="fa fa-times"></i>
      </button>
    </div>

    <div class="modal-body mat-text-on-surface">
      <!-- Content -->
    </div>

    <div class="modal-footer">
      <button class="mat-outlined-button" (click)="closeModal()">
        Cancel
      </button>
      <button class="mat-filled-button mat-bg-primary mat-text-on-primary">
        Confirm
      </button>
    </div>
  </div>
</div>
```

**Styling:**

```scss
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease-out;
}

.modal-dialog {
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  border-radius: 28px;  // Extra-large corner rounding for modals
  overflow: hidden;
  animation: slideUp 0.3s ease-out;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px;
  border-bottom: 1px solid var(--mat-sys-outline-variant);
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--mat-sys-outline-variant);
  background: var(--mat-sys-surface-container);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
```

### Loading Indicator Pattern

Use the MJ Loading component:

```html
<!-- Always use MJ Loading component -->
<mj-loading
  [text]="'Loading sessions...'"
  [size]="'medium'">
</mj-loading>
```

**DO NOT create custom spinners** - use the standard `<mj-loading>` component from `@memberjunction/ng-shared-generic`.

### Tab Navigation Pattern

```html
<nav class="tab-nav mat-bg-surface">
  <a
    class="tab-item"
    [class.active]="activeTab === 'sessions'"
    (click)="setActiveTab('sessions')">
    <i class="fa fa-list"></i>
    <span>Sessions</span>
  </a>
  <a
    class="tab-item"
    [class.active]="activeTab === 'logs'"
    (click)="setActiveTab('logs')">
    <i class="fa fa-database"></i>
    <span>Logs</span>
  </a>
</nav>
```

**Styling:**

```scss
.tab-nav {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--mat-sys-outline-variant);
  padding: 0 8px;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  font: var(--mat-sys-label-large);
  color: var(--mat-sys-on-surface-variant);
  text-decoration: none;
  border-radius: 8px 8px 0 0;
  transition: all 0.2s;
  cursor: pointer;
  position: relative;

  &:hover {
    background: var(--mat-sys-surface-container);
    color: var(--mat-sys-on-surface);
  }

  &.active {
    color: var(--mat-sys-primary);
    background: var(--mat-sys-primary-container);

    &::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--mat-sys-primary);
    }
  }
}
```

---

## Accessibility

### WCAG 2.1 Compliance

All components MUST meet **WCAG 2.1 AA** standards minimum:

#### Color Contrast

- **Normal text (< 18px)**: 4.5:1 contrast ratio
- **Large text (≥ 18px or ≥ 14px bold)**: 3:1 contrast ratio
- **UI components and graphics**: 3:1 contrast ratio

MD3 tokens automatically provide sufficient contrast when used correctly.

#### Focus Indicators

Always provide visible focus indicators:

```scss
button:focus-visible,
input:focus-visible,
a:focus-visible {
  outline: 2px solid var(--mat-sys-primary);
  outline-offset: 2px;
}
```

Enable strong focus indicators globally:

```scss
@include mat.strong-focus-indicators((
  border-color: var(--mat-sys-primary),
  border-style: solid,
  border-width: 2px,
  border-radius: 4px,
));
```

#### Keyboard Navigation

- All interactive elements MUST be keyboard accessible
- Tab order MUST be logical
- Use `tabindex="0"` for custom interactive elements
- Use `tabindex="-1"` for programmatically focusable elements
- Provide skip links for repetitive navigation

```html
<a href="#main-content" class="skip-link">Skip to main content</a>
```

#### ARIA Attributes

Use ARIA attributes to enhance screen reader support:

```html
<!-- Buttons -->
<button aria-label="Close dialog">
  <i class="fa fa-times"></i>
</button>

<!-- Form inputs -->
<input
  type="text"
  id="username"
  aria-label="Username"
  aria-describedby="username-hint"
  aria-required="true">
<span id="username-hint">Must be at least 3 characters</span>

<!-- Tabs -->
<div role="tablist">
  <button role="tab" aria-selected="true" aria-controls="panel-1">
    Tab 1
  </button>
  <button role="tab" aria-selected="false" aria-controls="panel-2">
    Tab 2
  </button>
</div>

<!-- Dialogs -->
<div role="dialog" aria-labelledby="dialog-title" aria-modal="true">
  <h2 id="dialog-title">Confirm Action</h2>
  <!-- Content -->
</div>

<!-- Loading states -->
<div role="status" aria-live="polite" aria-busy="true">
  Loading...
</div>
```

#### Screen Reader Text

Provide descriptive text for screen readers:

```html
<button>
  <i class="fa fa-trash" aria-hidden="true"></i>
  <span class="sr-only">Delete item</span>
</button>
```

```scss
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

#### Touch Targets

Ensure adequate touch target sizes:

- **Minimum**: 44x44px for all interactive elements
- **Recommended**: 48x48px or larger

```scss
button,
a,
.clickable {
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

---

## Responsive Design

### Design Philosophy

**CRITICAL**: All components MUST be fully responsive and functional across all device sizes. The module follows a mobile-first approach with progressive enhancement for larger screens. Every UI element must be accessible, readable, and functional on any device.

### Breakpoint System

Use a comprehensive 4-tier breakpoint system to cover all device categories:

```scss
// Mobile phones (portrait, < 640px)
@media (max-width: 639px) {
  .mobile-only { display: block; }
}

// Tablets (portrait, 640px - 767px)
@media (min-width: 640px) and (max-width: 767px) {
  .tablet-portrait-only { display: block; }
}

// Tablets (landscape) and small laptops (768px - 1023px)
@media (min-width: 768px) and (max-width: 1023px) {
  .tablet-landscape-only { display: block; }
}

// Laptops and desktops (1024px - 1439px)
@media (min-width: 1024px) and (max-width: 1439px) {
  .laptop-only { display: block; }
}

// Large desktops (≥ 1440px)
@media (min-width: 1440px) {
  .desktop-only { display: block; }
}
```

### Screen Size Categories

| Category | Range | Common Devices | Layout Strategy |
|----------|-------|----------------|-----------------|
| **Mobile** | < 640px | iPhone, Android phones | Single column, bottom nav, stacked cards |
| **Tablet (Portrait)** | 640px - 767px | iPad mini, small tablets | 2 columns, hybrid nav, condensed spacing |
| **Tablet (Landscape)** | 768px - 1023px | iPad, Android tablets | 2-3 columns, side nav appears, more spacing |
| **Laptop** | 1024px - 1439px | MacBook, standard laptops | 3-4 columns, full side nav, optimal spacing |
| **Desktop** | ≥ 1440px | Large monitors, 4K displays | 4+ columns, expanded layouts, generous spacing |

### Mobile-First Approach

Write CSS mobile-first, then progressively enhance for larger screens:

```scss
// Mobile base styles (< 640px)
.card-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  padding: 12px;
}

// Tablet portrait (640px+)
@media (min-width: 640px) {
  .card-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    padding: 16px;
  }
}

// Tablet landscape (768px+)
@media (min-width: 768px) {
  .card-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
    padding: 20px;
  }
}

// Laptop (1024px+)
@media (min-width: 1024px) {
  .card-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    padding: 24px;
  }
}

// Desktop (1440px+)
@media (min-width: 1440px) {
  .card-grid {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 32px;
    padding: 32px;
    max-width: 1920px;
    margin: 0 auto;
  }
}
```

### Comprehensive Responsive Example

Here's a complete example showing how to handle all screen sizes:

```scss
.dashboard-container {
  // Mobile (< 640px): Single column, minimal padding
  display: flex;
  flex-direction: column;
  padding: 12px;
  gap: 12px;
  width: 100%;
  overflow-x: hidden;

  .stat-cards {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .data-table {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  // Tablet portrait (640px+): 2 columns, more spacing
  @media (min-width: 640px) {
    padding: 16px;
    gap: 16px;

    .stat-cards {
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
  }

  // Tablet landscape (768px+): 3 columns, side-by-side layouts
  @media (min-width: 768px) {
    flex-direction: row;
    padding: 20px;
    gap: 20px;

    .stat-cards {
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
    }

    .sidebar {
      width: 240px;
      flex-shrink: 0;
    }

    .main-content {
      flex: 1;
      min-width: 0; // Prevents flex item from overflowing
    }
  }

  // Laptop (1024px+): Full layout, optimal spacing
  @media (min-width: 1024px) {
    padding: 24px;
    gap: 24px;

    .stat-cards {
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
    }

    .sidebar {
      width: 280px;
    }
  }

  // Desktop (1440px+): Maximum width, generous spacing
  @media (min-width: 1440px) {
    max-width: 1920px;
    margin: 0 auto;
    padding: 32px;
    gap: 32px;

    .stat-cards {
      grid-template-columns: repeat(4, 1fr);
      gap: 32px;
    }

    .sidebar {
      width: 320px;
    }
  }
}
```

### Adaptive Navigation Patterns

Navigation MUST adapt to screen size for optimal usability:

#### Responsive Navigation Layout

```html
<div class="app-layout">
  <!-- Mobile: Hamburger menu + bottom nav -->
  <header class="mobile-header" *ngIf="isMobile">
    <button class="menu-toggle" (click)="toggleMenu()">
      <i class="fa fa-bars"></i>
    </button>
    <h1>Explorer Settings</h1>
  </header>

  <!-- Tablet/Desktop: Side navigation -->
  <aside class="side-nav mat-bg-surface-container" [class.mobile-open]="mobileMenuOpen">
    <nav class="nav-items">
      <a class="nav-item" [class.active]="activeTab === 'settings'">
        <i class="fa fa-cog"></i>
        <span>Settings</span>
      </a>
      <!-- More items -->
    </nav>
  </aside>

  <!-- Main content area with scroll -->
  <main class="main-content mat-bg-surface">
    <div class="content-scroll">
      <!-- Page content -->
    </div>
  </main>

  <!-- Mobile: Bottom navigation -->
  <nav class="bottom-nav mat-bg-surface-container" *ngIf="isMobile">
    <a class="nav-item" [class.active]="activeTab === 'settings'">
      <i class="fa fa-cog"></i>
      <span>Settings</span>
    </a>
    <!-- More items (max 5 for mobile) -->
  </nav>
</div>
```

```scss
.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: hidden;

  // Mobile (< 640px): Top header + bottom nav
  .mobile-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 16px;
    background: var(--mat-sys-surface-container);
    border-bottom: 1px solid var(--mat-sys-outline-variant);
    position: sticky;
    top: 0;
    z-index: 10;

    .menu-toggle {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: 1.25rem;
      color: var(--mat-sys-on-surface);
    }

    h1 {
      font: var(--mat-sys-title-large);
      color: var(--mat-sys-on-surface);
      margin: 0;
    }
  }

  .side-nav {
    // Mobile: Hidden by default, slides in from left
    position: fixed;
    left: -100%;
    top: 0;
    bottom: 0;
    width: 280px;
    max-width: 80vw;
    background: var(--mat-sys-surface-container);
    z-index: 100;
    padding: 16px;
    overflow-y: auto;
    transition: left 0.3s ease;
    box-shadow: var(--mat-sys-elevation-3);

    &.mobile-open {
      left: 0;
    }
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 0;

    .content-scroll {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 12px;
      -webkit-overflow-scrolling: touch;
      // Add padding for bottom nav on mobile
      padding-bottom: 80px;
    }
  }

  .bottom-nav {
    display: flex;
    justify-content: space-around;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 8px 4px;
    background: var(--mat-sys-surface-container);
    border-top: 1px solid var(--mat-sys-outline-variant);
    z-index: 100;
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);

    .nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 8px 12px;
      min-width: 60px;
      font: var(--mat-sys-label-small);
      color: var(--mat-sys-on-surface-variant);
      text-decoration: none;
      border-radius: 12px;
      transition: all 0.2s;

      i {
        font-size: 1.25rem;
      }

      &:active {
        background: var(--mat-sys-surface-container-highest);
      }

      &.active {
        color: var(--mat-sys-primary);
        background: var(--mat-sys-primary-container);
      }
    }
  }

  // Tablet portrait (640px+): Top nav or collapsed side nav
  @media (min-width: 640px) {
    .mobile-header {
      padding: 16px 24px;
    }

    .side-nav {
      left: -100%;
      width: 320px;
    }

    .main-content .content-scroll {
      padding: 16px 24px;
      padding-bottom: 80px;
    }

    .bottom-nav {
      padding: 12px 8px;

      .nav-item {
        min-width: 80px;
        font: var(--mat-sys-label-medium);
      }
    }
  }

  // Tablet landscape (768px+): Permanent side nav appears
  @media (min-width: 768px) {
    flex-direction: row;

    .mobile-header {
      display: none;
    }

    .side-nav {
      position: static;
      left: auto;
      width: 240px;
      border-right: 1px solid var(--mat-sys-outline-variant);
      box-shadow: none;
      transition: none;
    }

    .main-content .content-scroll {
      padding: 20px;
      padding-bottom: 20px; // No bottom nav
    }

    .bottom-nav {
      display: none; // Hide bottom nav
    }
  }

  // Laptop (1024px+): Full side nav
  @media (min-width: 1024px) {
    .side-nav {
      width: 280px;
      padding: 24px 16px;
    }

    .main-content .content-scroll {
      padding: 24px 32px;
    }
  }

  // Desktop (1440px+): Wide side nav
  @media (min-width: 1440px) {
    .side-nav {
      width: 320px;
      padding: 32px 24px;
    }

    .main-content .content-scroll {
      padding: 32px 48px;
      max-width: 1600px;
      margin: 0 auto;
    }
  }
}

// Nav items styling (consistent across all sizes)
.nav-items {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    font: var(--mat-sys-label-large);
    color: var(--mat-sys-on-surface-variant);
    text-decoration: none;
    border-radius: 12px;
    transition: all 0.2s;

    i {
      font-size: 1.25rem;
      width: 24px;
      text-align: center;
    }

    &:hover {
      background: var(--mat-sys-surface-container-highest);
      color: var(--mat-sys-on-surface);
    }

    &.active {
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
      font-weight: 500;
    }
  }
}

// Overlay for mobile menu
.nav-overlay {
  display: none;

  @media (max-width: 767px) {
    &.active {
      display: block;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 99;
    }
  }
}
```

### Responsive Data Tables

Tables MUST be usable on all screen sizes. Use these patterns:

#### Pattern 1: Horizontal Scroll (Simple Tables)

```html
<div class="table-container">
  <table class="responsive-table">
    <thead>
      <tr>
        <th>Name</th>
        <th>Email</th>
        <th>Role</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>John Doe</td>
        <td>john@example.com</td>
        <td>Admin</td>
        <td>Active</td>
        <td><button>Edit</button></td>
      </tr>
    </tbody>
  </table>
</div>
```

```scss
.table-container {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;

  // Mobile: Extend to edges for better scroll feel
  @media (max-width: 639px) {
    margin: 0 -12px;
    width: calc(100% + 24px);

    .responsive-table {
      min-width: 600px; // Minimum width to maintain readability
    }
  }

  // Tablet and up: No horizontal scroll needed
  @media (min-width: 768px) {
    overflow-x: visible;
  }
}

.responsive-table {
  width: 100%;
  border-collapse: collapse;
  font: var(--mat-sys-body-medium);

  th, td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid var(--mat-sys-outline-variant);
  }

  th {
    font: var(--mat-sys-label-large);
    color: var(--mat-sys-on-surface-variant);
    font-weight: 500;
    position: sticky;
    top: 0;
    background: var(--mat-sys-surface);
    z-index: 1;
  }

  // Mobile: Reduce padding
  @media (max-width: 639px) {
    th, td {
      padding: 8px 12px;
      font: var(--mat-sys-body-small);
    }
  }
}
```

#### Pattern 2: Card Layout (Complex Tables on Mobile)

```html
<div class="data-list">
  <!-- Desktop: Table -->
  <table class="desktop-table">
    <!-- Standard table markup -->
  </table>

  <!-- Mobile: Cards -->
  <div class="mobile-cards">
    <div class="data-card mat-bg-surface-container">
      <div class="card-row">
        <span class="label">Name:</span>
        <span class="value">John Doe</span>
      </div>
      <div class="card-row">
        <span class="label">Email:</span>
        <span class="value">john@example.com</span>
      </div>
      <div class="card-row">
        <span class="label">Role:</span>
        <span class="value">Admin</span>
      </div>
      <div class="card-actions">
        <button>Edit</button>
        <button>Delete</button>
      </div>
    </div>
  </div>
</div>
```

```scss
.data-list {
  .desktop-table {
    display: table;
  }

  .mobile-cards {
    display: none;
  }

  // Mobile: Show cards, hide table
  @media (max-width: 767px) {
    .desktop-table {
      display: none;
    }

    .mobile-cards {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .data-card {
      padding: 16px;
      border-radius: 12px;
      border: 1px solid var(--mat-sys-outline-variant);

      .card-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid var(--mat-sys-outline-variant);

        &:last-of-type {
          border-bottom: none;
        }

        .label {
          font: var(--mat-sys-label-medium);
          color: var(--mat-sys-on-surface-variant);
          font-weight: 500;
        }

        .value {
          font: var(--mat-sys-body-medium);
          color: var(--mat-sys-on-surface);
          text-align: right;
        }
      }

      .card-actions {
        display: flex;
        gap: 8px;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--mat-sys-outline-variant);
      }
    }
  }
}
```

### Responsive Forms

Forms must adapt to available space:

```scss
.responsive-form {
  display: grid;
  gap: 16px;
  width: 100%;

  // Mobile: Single column
  grid-template-columns: 1fr;

  // Tablet portrait: Still single column for better UX
  @media (min-width: 640px) {
    gap: 20px;
  }

  // Tablet landscape: Two columns for shorter fields
  @media (min-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;

    // Full-width fields
    .full-width {
      grid-column: 1 / -1;
    }
  }

  // Laptop: Maintain two columns with better spacing
  @media (min-width: 1024px) {
    max-width: 800px;
  }

  // Desktop: Optional three columns for compact forms
  @media (min-width: 1440px) {
    max-width: 1000px;

    &.compact {
      grid-template-columns: repeat(3, 1fr);
    }
  }
}
```

### Responsive Typography

Use fluid typography for better readability across devices:

```scss
html {
  // Mobile base
  font-size: 14px;

  // Tablet portrait
  @media (min-width: 640px) {
    font-size: 14.5px;
  }

  // Tablet landscape
  @media (min-width: 768px) {
    font-size: 15px;
  }

  // Laptop
  @media (min-width: 1024px) {
    font-size: 16px;
  }

  // Desktop (maintain 16px, don't go larger)
  @media (min-width: 1440px) {
    font-size: 16px;
  }
}

// Fluid typography for headings
h1, .heading-1 {
  // Mobile: 24px
  font-size: clamp(1.5rem, 4vw, 2.5rem);
}

h2, .heading-2 {
  // Mobile: 20px to Desktop: 32px
  font-size: clamp(1.25rem, 3vw, 2rem);
}

h3, .heading-3 {
  // Mobile: 18px to Desktop: 24px
  font-size: clamp(1.125rem, 2.5vw, 1.5rem);
}
```

### Responsive Spacing

Adjust spacing progressively for different screen sizes:

```scss
.section {
  // Mobile
  padding: 12px;
  margin-bottom: 12px;

  // Tablet portrait
  @media (min-width: 640px) {
    padding: 16px;
    margin-bottom: 16px;
  }

  // Tablet landscape
  @media (min-width: 768px) {
    padding: 20px;
    margin-bottom: 20px;
  }

  // Laptop
  @media (min-width: 1024px) {
    padding: 24px;
    margin-bottom: 24px;
  }

  // Desktop
  @media (min-width: 1440px) {
    padding: 32px;
    margin-bottom: 32px;
  }
}
```

### Scrollability and Overflow Management

**CRITICAL**: All content must be scrollable and accessible on every screen size. Never let content overflow or become inaccessible.

#### Container Scrolling Patterns

```scss
// Vertical scrolling container with fixed height
.scrollable-container {
  overflow-y: auto;
  overflow-x: hidden;
  max-height: 100vh;
  -webkit-overflow-scrolling: touch; // Smooth scrolling on iOS
  overscroll-behavior: contain; // Prevent scroll chaining

  // Add padding for bottom navigation on mobile
  @media (max-width: 639px) {
    padding-bottom: 80px; // Space for bottom nav
  }
}

// Horizontal scrolling for tables on small screens
.table-container {
  overflow-x: auto;
  overflow-y: visible;
  -webkit-overflow-scrolling: touch;
  margin: 0 -12px; // Extend to screen edges on mobile

  @media (min-width: 768px) {
    margin: 0;
    overflow-x: visible; // No horizontal scroll on larger screens
  }
}

// Fixed header with scrollable body
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;

  .panel-header {
    flex-shrink: 0;
    padding: 16px;
    border-bottom: 1px solid var(--mat-sys-outline-variant);
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 16px;
    -webkit-overflow-scrolling: touch;
  }

  .panel-footer {
    flex-shrink: 0;
    padding: 16px;
    border-top: 1px solid var(--mat-sys-outline-variant);
  }
}
```

#### Scroll Indicators

Provide visual cues for scrollable content:

```scss
.scrollable-content {
  position: relative;

  // Fade indicator at bottom
  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 40px;
    background: linear-gradient(
      to bottom,
      transparent,
      var(--mat-sys-surface)
    );
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s;
  }

  // Show indicator when scrollable
  &.has-scroll::after {
    opacity: 1;
  }
}
```

#### Modal Dialog Scrolling

```scss
.modal-dialog {
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  overflow: hidden;

  .modal-header {
    flex-shrink: 0;
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    padding: 24px;

    // Mobile: Less padding, more content space
    @media (max-width: 639px) {
      padding: 16px;
    }
  }

  .modal-footer {
    flex-shrink: 0;
  }
}
```

#### Horizontal Scrolling (Use Sparingly)

For content that benefits from horizontal scrolling (image galleries, chip lists):

```scss
.horizontal-scroll {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  scroll-snap-type: x mandatory;
  scroll-padding: 12px;

  // Hide scrollbar but keep functionality
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }

  .scroll-item {
    flex-shrink: 0;
    scroll-snap-align: start;
  }
}
```

#### Grid/List Scrolling Best Practices

```scss
// Cards that adjust columns AND scroll properly
.responsive-card-grid {
  display: grid;
  gap: 16px;
  padding: 16px;
  overflow-y: auto;
  max-height: calc(100vh - 200px); // Adjust based on header/footer

  // Mobile: 1 column
  grid-template-columns: 1fr;

  // Tablet portrait: 2 columns
  @media (min-width: 640px) {
    grid-template-columns: repeat(2, 1fr);
  }

  // Tablet landscape: 2-3 columns
  @media (min-width: 768px) {
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  }

  // Laptop: 3-4 columns
  @media (min-width: 1024px) {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  }

  // Desktop: 4+ columns
  @media (min-width: 1440px) {
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 24px;
  }
}
```

#### Preventing Horizontal Overflow

**ALWAYS prevent horizontal scroll** except where intentional:

```scss
// Global reset to prevent horizontal overflow
html, body {
  overflow-x: hidden;
  max-width: 100%;
}

// Container that prevents children from overflowing
.safe-container {
  max-width: 100%;
  overflow-x: hidden;
  word-wrap: break-word;
  overflow-wrap: break-word;

  // Ensure images don't overflow
  img {
    max-width: 100%;
    height: auto;
  }

  // Ensure tables are scrollable
  table {
    display: block;
    overflow-x: auto;
    white-space: nowrap;
  }

  // Break long words/URLs
  .text-content {
    word-break: break-word;
    hyphens: auto;
  }
}
```

### Viewport Height Considerations

Handle different viewport heights properly:

```scss
.full-height-layout {
  // Use dvh (dynamic viewport height) for mobile browsers
  // Falls back to vh for older browsers
  min-height: 100vh;
  min-height: 100dvh;

  // Account for mobile browser chrome
  @supports (-webkit-touch-callout: none) {
    min-height: -webkit-fill-available;
  }
}

// Content area that adapts to available height
.content-area {
  // Mobile: Allow natural height
  min-height: auto;

  // Tablet and up: Use available viewport
  @media (min-width: 768px) {
    height: calc(100vh - 64px); // Subtract header height
    overflow-y: auto;
  }
}
```

### Complete Responsive Component Example

Here's a production-ready example showing a dashboard component that works perfectly on all screen sizes:

```html
<div class="responsive-dashboard">
  <!-- Stats overview -->
  <section class="stats-section">
    <h2 class="section-title">Overview</h2>
    <div class="stat-grid">
      <div class="stat-card mat-elevation-1 mat-bg-surface-container">
        <div class="stat-icon mat-bg-primary-container">
          <i class="fa fa-users"></i>
        </div>
        <div class="stat-content">
          <div class="stat-value">1,234</div>
          <div class="stat-label">Total Users</div>
        </div>
      </div>
      <!-- More stat cards -->
    </div>
  </section>

  <!-- Data table/list -->
  <section class="data-section">
    <h2 class="section-title">Recent Activity</h2>
    <div class="data-container">
      <!-- Desktop: Table -->
      <div class="desktop-view">
        <div class="table-scroll">
          <table class="data-table">
            <!-- Table content -->
          </table>
        </div>
      </div>

      <!-- Mobile: Cards -->
      <div class="mobile-view">
        <div class="card-list">
          <div class="activity-card mat-bg-surface-container">
            <!-- Card content -->
          </div>
        </div>
      </div>
    </div>
  </section>
</div>
```

```scss
.responsive-dashboard {
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 24px;

  // Tablet portrait
  @media (min-width: 640px) {
    padding: 16px;
    gap: 28px;
  }

  // Tablet landscape
  @media (min-width: 768px) {
    padding: 20px;
    gap: 32px;
  }

  // Laptop
  @media (min-width: 1024px) {
    padding: 24px 32px;
    gap: 40px;
  }

  // Desktop
  @media (min-width: 1440px) {
    padding: 32px 48px;
    max-width: 1920px;
    margin: 0 auto;
    gap: 48px;
  }

  .section-title {
    font: var(--mat-sys-headline-medium);
    color: var(--mat-sys-on-surface);
    margin-bottom: 16px;

    @media (min-width: 768px) {
      margin-bottom: 20px;
    }

    @media (min-width: 1024px) {
      margin-bottom: 24px;
    }
  }

  .stats-section {
    .stat-grid {
      display: grid;
      gap: 12px;

      // Mobile: 1 column
      grid-template-columns: 1fr;

      // Tablet portrait: 2 columns
      @media (min-width: 640px) {
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
      }

      // Tablet landscape: 3 columns
      @media (min-width: 768px) {
        grid-template-columns: repeat(2, 1fr);
        gap: 20px;
      }

      // Laptop: 3-4 columns
      @media (min-width: 1024px) {
        grid-template-columns: repeat(3, 1fr);
        gap: 24px;
      }

      // Desktop: 4 columns
      @media (min-width: 1440px) {
        grid-template-columns: repeat(4, 1fr);
        gap: 24px;
      }

      .stat-card {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 16px;
        border-radius: 12px;
        transition: all 0.2s;

        &:hover {
          box-shadow: var(--mat-sys-elevation-2);
          transform: translateY(-2px);
        }

        .stat-icon {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          font-size: 1.25rem;
          color: var(--mat-sys-on-primary-container);
          flex-shrink: 0;

          @media (min-width: 768px) {
            width: 56px;
            height: 56px;
            font-size: 1.5rem;
          }
        }

        .stat-content {
          flex: 1;
          min-width: 0;

          .stat-value {
            font: var(--mat-sys-headline-small);
            font-weight: 700;
            color: var(--mat-sys-on-surface);

            @media (min-width: 768px) {
              font: var(--mat-sys-headline-medium);
            }
          }

          .stat-label {
            font: var(--mat-sys-body-small);
            color: var(--mat-sys-on-surface-variant);
            margin-top: 4px;

            @media (min-width: 768px) {
              font: var(--mat-sys-body-medium);
            }
          }
        }
      }
    }
  }

  .data-section {
    .data-container {
      background: var(--mat-sys-surface-container);
      border-radius: 12px;
      border: 1px solid var(--mat-sys-outline-variant);
      overflow: hidden;

      .desktop-view {
        display: none;

        @media (min-width: 768px) {
          display: block;
        }

        .table-scroll {
          overflow-x: auto;
          overflow-y: auto;
          max-height: 600px;
          -webkit-overflow-scrolling: touch;

          .data-table {
            width: 100%;
            border-collapse: collapse;

            thead {
              position: sticky;
              top: 0;
              background: var(--mat-sys-surface);
              z-index: 1;
              box-shadow: 0 1px 0 var(--mat-sys-outline-variant);

              th {
                padding: 12px 16px;
                text-align: left;
                font: var(--mat-sys-label-large);
                color: var(--mat-sys-on-surface-variant);
                font-weight: 500;
              }
            }

            tbody {
              tr {
                border-bottom: 1px solid var(--mat-sys-outline-variant);

                &:hover {
                  background: var(--mat-sys-surface-container-highest);
                }

                td {
                  padding: 12px 16px;
                  font: var(--mat-sys-body-medium);
                  color: var(--mat-sys-on-surface);
                }
              }
            }
          }
        }
      }

      .mobile-view {
        display: block;

        @media (min-width: 768px) {
          display: none;
        }

        .card-list {
          display: flex;
          flex-direction: column;
          max-height: 600px;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;

          .activity-card {
            padding: 16px;
            border-bottom: 1px solid var(--mat-sys-outline-variant);

            &:last-child {
              border-bottom: none;
            }

            &:active {
              background: var(--mat-sys-surface-container-highest);
            }
          }
        }
      }
    }
  }
}
```

### Key Responsive Principles Summary

**1. Always Mobile-First**
- Start with mobile styles
- Add complexity as screen size increases
- Never assume desktop users

**2. Test Real Devices**
- Emulators aren't enough
- Test on actual phones, tablets, laptops
- Test landscape AND portrait orientations

**3. Scrollability First**
- Vertical scroll is natural and expected
- Horizontal scroll is acceptable for tables and galleries only
- Always prevent accidental horizontal overflow
- Use `overflow-x: hidden` liberally

**4. Adaptive Layouts**
- Mobile: 1 column, bottom nav, stacked
- Tablet: 2-3 columns, hybrid nav
- Laptop/Desktop: 3-4+ columns, side nav, optimal spacing

**5. Performance Matters**
- Use CSS Grid and Flexbox (not floats)
- Avoid unnecessary media query duplication
- Use `clamp()` for fluid typography
- Leverage CSS custom properties

**6. Touch-Friendly**
- Minimum 44x44px touch targets
- Add `:active` states for mobile feedback
- Use `-webkit-overflow-scrolling: touch`
- Test with actual fingers, not mouse

**7. Content Accessibility**
- No content should ever be cut off
- All features must work on all sizes
- Degrade gracefully when needed
- Provide alternative layouts for complex components

---

## Animation & Motion

### Motion Principles

- **Purposeful**: Animations should guide attention and clarify relationships
- **Brief**: Duration typically 200-400ms for UI interactions
- **Consistent**: Use the same easing and duration for similar actions

### Duration Guidelines

```scss
// Instant feedback (toggle states)
$duration-instant: 100ms;

// Standard interactions (button press, hover)
$duration-standard: 200ms;

// Emphasized motions (dialog open, page transitions)
$duration-emphasized: 300ms;

// Complex animations (multi-step, coordinated)
$duration-complex: 400ms;
```

### Easing Functions

Use MD3-recommended easing curves:

```scss
// Standard easing for most interactions
$easing-standard: cubic-bezier(0.4, 0.0, 0.2, 1);

// Emphasized easing for entering elements
$easing-emphasized: cubic-bezier(0.0, 0.0, 0.2, 1);

// Deceleration for exiting elements
$easing-decelerate: cubic-bezier(0.0, 0.0, 0.2, 1);

// Acceleration for exiting elements quickly
$easing-accelerate: cubic-bezier(0.4, 0.0, 1, 1);
```

### Common Animations

#### Fade In/Out

```scss
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.fade-in {
  animation: fadeIn 200ms cubic-bezier(0.4, 0.0, 0.2, 1);
}
```

#### Slide Up (Modal Entry)

```scss
@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.modal-dialog {
  animation: slideUp 300ms cubic-bezier(0.0, 0.0, 0.2, 1);
}
```

#### Scale In (Emphasis)

```scss
@keyframes scaleIn {
  from {
    transform: scale(0.9);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.stat-card {
  animation: scaleIn 200ms cubic-bezier(0.4, 0.0, 0.2, 1);
}
```

#### Hover/Focus States

```scss
button {
  transition: all 200ms cubic-bezier(0.4, 0.0, 0.2, 1);

  &:hover {
    transform: translateY(-1px);
    box-shadow: var(--mat-sys-elevation-2);
  }

  &:active {
    transform: translateY(0);
    box-shadow: var(--mat-sys-elevation-0);
  }
}
```

### Reduced Motion Support

Respect user's motion preferences:

```scss
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Implementation Checklist

Use this checklist when building or refactoring components:

### Theme Setup

- [ ] Include Angular Material theme file with `mat.theme` mixin
- [ ] Set `theme-type: light` for consistent light theme
- [ ] Load required fonts (Roboto or custom fonts)
- [ ] Apply `mat.system-classes()` for utility classes
- [ ] Enable `mat.strong-focus-indicators()` for accessibility

### Color Usage

- [ ] Use MD3 color tokens (`var(--mat-sys-*)`) instead of hardcoded colors
- [ ] Apply surface/on-surface color pairs correctly
- [ ] Use semantic colors for states (error, success, warning)
- [ ] Test color contrast ratios (4.5:1 for text, 3:1 for UI elements)
- [ ] Verify colors are consistent across all components

### Typography

- [ ] Use MD3 typography tokens (`var(--mat-sys-*)`) for all text
- [ ] Apply appropriate scale (display, headline, title, body, label)
- [ ] Use utility classes (`mat-font-*`) in templates where appropriate
- [ ] Ensure font weights are correct (bold: 700, medium: 500, regular: 400)

### Spacing & Layout

- [ ] Use consistent spacing scale (4px increments)
- [ ] Apply appropriate elevation levels for layering
- [ ] Use CSS Grid or Flexbox with consistent gaps
- [ ] Ensure adequate touch target sizes (44x44px minimum)

### Components

- [ ] Follow established component patterns (cards, buttons, forms, etc.)
- [ ] Use `<mj-loading>` for all loading states (no custom spinners)
- [ ] Apply consistent border radius (4px inputs, 8px cards, 20px buttons, 28px modals)
- [ ] Implement proper empty states with icons and CTAs
- [ ] Ensure all components are scrollable when content overflows
- [ ] Add scroll indicators where appropriate (fade effects, shadows)
- [ ] Prevent horizontal overflow in all components

### Accessibility

- [ ] Provide visible focus indicators for all interactive elements
- [ ] Add ARIA attributes (labels, roles, live regions, etc.)
- [ ] Ensure keyboard navigation works correctly
- [ ] Include screen reader text where needed (`sr-only` class)
- [ ] Test with screen readers (NVDA, JAWS, VoiceOver)
- [ ] Verify color contrast meets WCAG AA standards

### Responsive Design

- [ ] Write mobile-first CSS with progressive enhancement
- [ ] Test on all screen sizes:
  - [ ] Mobile portrait (< 640px)
  - [ ] Tablet portrait (640px - 767px)
  - [ ] Tablet landscape (768px - 1023px)
  - [ ] Laptop (1024px - 1439px)
  - [ ] Desktop (≥ 1440px)
- [ ] Implement adaptive navigation:
  - [ ] Bottom navigation for mobile (< 768px)
  - [ ] Side navigation for tablet landscape and up (≥ 768px)
  - [ ] Hamburger menu for mobile with slide-in drawer
- [ ] Use fluid typography with clamp() for headings
- [ ] Ensure grids adapt: 1 col → 2 col → 3 col → 4 col
- [ ] Test tables on mobile (horizontal scroll or card layout)
- [ ] Verify forms work on all screen sizes
- [ ] Check that no horizontal overflow occurs
- [ ] Ensure all interactive elements are at least 44x44px on touch devices

### Animation & Motion

- [ ] Use MD3 easing curves and duration guidelines
- [ ] Apply consistent transitions (200-300ms for most interactions)
- [ ] Respect `prefers-reduced-motion` media query
- [ ] Ensure animations are purposeful, not decorative

### Scrollability & Overflow

- [ ] Implement vertical scrolling for all content containers
- [ ] Use `-webkit-overflow-scrolling: touch` for smooth iOS scrolling
- [ ] Prevent horizontal scroll except where intentional (tables, galleries)
- [ ] Add `overflow-x: hidden` to prevent unwanted horizontal scrolling
- [ ] Ensure fixed headers/footers with scrollable body patterns
- [ ] Test modal dialogs scroll properly on small screens
- [ ] Verify viewport height calculations (use dvh where supported)
- [ ] Account for mobile bottom navigation spacing (padding-bottom)
- [ ] Add scroll indicators for long content
- [ ] Test that all content is reachable on every screen size

### Testing

- [ ] Verify light theme appearance is consistent
- [ ] Test keyboard navigation and focus order
- [ ] Test with screen readers (NVDA, JAWS, VoiceOver)
- [ ] Test on real devices:
  - [ ] iPhone (multiple sizes)
  - [ ] Android phones (multiple sizes)
  - [ ] iPad (portrait and landscape)
  - [ ] Android tablets
  - [ ] Laptop (13", 15", 17")
  - [ ] Desktop monitors (1080p, 1440p, 4K)
- [ ] Test browser DevTools responsive modes
- [ ] Validate color contrast with tools (WebAIM, Chrome DevTools)
- [ ] Test scrolling behavior on all devices
- [ ] Verify no content is cut off or inaccessible
- [ ] Test touch interactions on mobile/tablet
- [ ] Verify navigation transitions smoothly between breakpoints
- [ ] Test with slow network connections (loading states)
- [ ] Ensure components degrade gracefully without JavaScript

---

## Resources

### Angular Material Documentation

- [Theming Guide](https://material.angular.io/guide/theming)
- [Component API Docs](https://material.angular.io/components/categories)

### Material Design 3

- [Material Design 3](https://m3.material.io/)
- [Color System](https://m3.material.io/styles/color/system/overview)
- [Typography](https://m3.material.io/styles/typography/overview)
- [Elevation](https://m3.material.io/styles/elevation/overview)

### Accessibility

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [MDN ARIA Guide](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA)

### Tools

- [Figma Material Design Kit](https://www.figma.com/community/file/1035203688168086460)
- [Chrome DevTools Accessibility](https://developer.chrome.com/docs/devtools/accessibility/)
- [axe DevTools Extension](https://www.deque.com/axe/devtools/)

---

## Quick Reference

### Responsive Breakpoints

```scss
// Mobile (portrait)
@media (max-width: 639px) { }

// Tablet (portrait)
@media (min-width: 640px) and (max-width: 767px) { }

// Tablet (landscape)
@media (min-width: 768px) and (max-width: 1023px) { }

// Laptop
@media (min-width: 1024px) and (max-width: 1439px) { }

// Desktop
@media (min-width: 1440px) { }

// Mobile-first progressive
@media (min-width: 640px) { } // Tablet portrait and up
@media (min-width: 768px) { } // Tablet landscape and up
@media (min-width: 1024px) { } // Laptop and up
@media (min-width: 1440px) { } // Desktop and up
```

### Common Grid Patterns

```scss
// Stat cards: 1 → 2 → 2 → 3 → 4 columns
.stat-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;

  @media (min-width: 640px) { grid-template-columns: repeat(2, 1fr); gap: 16px; }
  @media (min-width: 768px) { gap: 20px; }
  @media (min-width: 1024px) { grid-template-columns: repeat(3, 1fr); gap: 24px; }
  @media (min-width: 1440px) { grid-template-columns: repeat(4, 1fr); }
}

// Content cards: 1 → 2 → auto-fill
.card-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;

  @media (min-width: 640px) { grid-template-columns: repeat(2, 1fr); }
  @media (min-width: 1024px) { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 24px; }
}
```

### Common Spacing Values

| Size | Mobile | Tablet | Laptop | Desktop |
|------|--------|--------|--------|---------|
| Padding | 12px | 16-20px | 24px | 32px |
| Gap | 12px | 16-20px | 24px | 24-32px |
| Margin | 12px | 16px | 24px | 32px |

### Navigation Patterns

| Screen Size | Navigation Type | Width | Position |
|-------------|----------------|-------|----------|
| < 768px | Bottom Nav + Hamburger | Full width | Fixed bottom |
| ≥ 768px | Side Nav | 240-280px | Fixed left |
| ≥ 1024px | Side Nav | 280-320px | Fixed left |

### Font Sizes

| Element | Mobile | Tablet | Laptop+ |
|---------|--------|--------|---------|
| Body | 14px | 15px | 16px |
| H1 | 24-28px | 28-32px | 32-40px |
| H2 | 20-24px | 24-28px | 28-32px |
| H3 | 18-20px | 20-22px | 22-24px |
| Small | 12px | 12px | 12px |

### Scrolling Checklist

- [ ] Use `overflow-y: auto` for vertical scroll
- [ ] Use `overflow-x: hidden` to prevent horizontal scroll
- [ ] Add `-webkit-overflow-scrolling: touch` for iOS
- [ ] Add `overscroll-behavior: contain` to prevent scroll chaining
- [ ] Account for bottom nav spacing on mobile (`padding-bottom: 80px`)
- [ ] Use sticky headers with `position: sticky; top: 0`
- [ ] Test scrolling in modals and panels
- [ ] Add scroll indicators for long content

### Touch Target Checklist

- [ ] Minimum 44x44px for all interactive elements
- [ ] Add `:active` states for visual feedback
- [ ] Adequate spacing between clickable items (8-12px)
- [ ] Test with actual touch devices (not just mouse)

---

## Implementation Lessons & Common Pitfalls

This section documents critical lessons learned during the redesign of components in this module. These insights will help avoid common issues when implementing MD3 designs.

### CSS Variable Setup is Critical

**Issue:** Components using MD3 tokens (like `var(--mat-sys-primary)`) will not display colors if the CSS variables aren't defined globally.

**Solution:**
1. Create `_md3-theme.scss` in the application's global styles directory
2. Define all MD3 CSS custom properties mapped to your brand colors
3. Import the MD3 theme **early** in your main.scss (before other component styles)

**Example structure:**
```scss
// In packages/MJExplorer/src/styles/main.scss
@import './variables';
@import './typography';
@import './md3-theme';  // ← Critical: Must come early

// Then import other styles...
```

**Location:** The theme file must be in the **application's source styles directory**, not in the component library's dist folder. For MemberJunction, this is `packages/MJExplorer/src/styles/`.

### Mobile Scrolling Must Be Carefully Designed

**Issue:** Nested containers with `overflow: hidden` and fixed heights prevent mobile scrolling, making content inaccessible.

**Common mistakes:**
- Setting `height: 100%; max-height: 100%; overflow: hidden` on main containers
- Using `max-height: calc(100vh - Xpx)` which can result in negative or too-small heights
- Multiple nested containers each with `overflow: auto`

**Best practices for mobile scrolling:**

```css
/* ✅ GOOD: Main container allows natural scrolling */
.main-container {
  display: flex;
  flex-direction: column;
  min-height: 100%;          /* Allow expansion */
  overflow-y: auto;           /* Enable vertical scroll */
  overflow-x: hidden;         /* Prevent horizontal */
  -webkit-overflow-scrolling: touch;  /* iOS momentum */
}

/* ✅ GOOD: Content areas use overflow: visible */
.content-area {
  flex: 1 1 auto;
  overflow: visible;          /* Let content flow naturally */
}

/* ❌ BAD: This prevents scrolling */
.bad-container {
  height: 100%;
  max-height: 100%;
  overflow: hidden;           /* Content can't scroll! */
}

/* ❌ BAD: Calc can result in negative height */
.bad-list {
  max-height: calc(100vh - 450px);  /* Too restrictive */
}
```

**Mobile-first approach:**
1. Start with natural content flow (`overflow: visible`)
2. Only add `overflow: auto` where specifically needed (e.g., data tables)
3. Use `min-height` instead of `height` to allow expansion
4. Test on actual mobile devices, not just browser DevTools

### Height and Flexbox Interactions

**Issue:** Components may load data but not be visible due to height constraints.

**Debugging checklist:**
1. Check browser console for data loading (add console.logs to verify data exists)
2. Inspect elements in DevTools to check computed heights
3. Look for `min-height: 0` (can collapse flex items)
4. Look for `max-height` with restrictive calc values
5. Check parent containers - a child with `height: 100%` needs parent with explicit height

**Good patterns:**
```css
/* Flexible container that adapts to content */
.flex-container {
  display: flex;
  flex-direction: column;
  min-height: 100%;    /* Minimum viewport height */
  /* No max-height */
}

/* Content grows as needed */
.flex-content {
  flex: 1 1 auto;      /* Grow, shrink, auto basis */
  overflow: visible;   /* Natural flow */
}
```

### Component Encapsulation and ViewEncapsulation

**Issue:** Using `ViewEncapsulation.None` to "fix" styling issues breaks component isolation and causes global style conflicts.

**Solution:**
- **Never use `ViewEncapsulation.None`** in production components
- **Never use `::ng-deep`** - it's deprecated and breaks encapsulation
- If you need to style child components, use proper component APIs (inputs, CSS custom properties)
- Keep styles scoped to the component

**Why this matters:**
- Multiple components can have conflicting global styles
- Styles leak between components unpredictably
- Makes debugging CSS issues extremely difficult
- Breaks Angular's style encapsulation guarantees

### Loading States and Change Detection

**Issue:** Data loads successfully but UI doesn't update, or updates don't reflect immediately.

**Solution:**
1. Inject `ChangeDetectorRef` in the constructor
2. Call `cdr.detectChanges()` after async operations that update UI state
3. Use `Promise.resolve().then(() => this.cdr.detectChanges())` for microtask timing

```typescript
constructor(private cdr: ChangeDetectorRef) {}

async loadData() {
  this.isLoading = true;
  this.cdr.detectChanges();  // Show loading state immediately

  const data = await this.fetchData();
  this.items = data;

  this.isLoading = false;
  this.cdr.detectChanges();  // Show data immediately
}
```

### Input Properties - Use Getter/Setters

**Issue:** Component doesn't react when input values change.

**Best practice:** Always use getter/setter pattern for `@Input()` properties that need reactive behavior:

```typescript
private _visible = false;

@Input()
set visible(value: boolean) {
  const previousValue = this._visible;
  this._visible = value;
  if (value && !previousValue) {
    this.onDialogOpened();
  }
}
get visible(): boolean {
  return this._visible;
}
```

**Why:** This gives precise control over change detection and allows immediate reactions to input changes.

### Debugging Data Loading Issues

When data isn't displaying, add comprehensive logging:

```typescript
async loadData() {
  console.log('[Component] Starting to load data...');

  const data = await this.fetchData();
  console.log('[Component] Data loaded:', {
    count: data.length,
    sample: data[0]
  });

  this.processData(data);
  console.log('[Component] Data processed:', {
    processedCount: this.items.length
  });

  this.applyFilters();
  console.log('[Component] After filtering:', {
    filteredCount: this.filteredItems.length,
    filters: this.currentFilters
  });
}
```

This helps identify:
- Whether data is loading at all
- Whether data is being processed correctly
- Whether filters are hiding the data
- Where in the pipeline the issue occurs

### Module Setup for Shared Components

**Issue:** Using `<mj-loading>` or other shared components results in "not a known element" errors.

**Solution:**
1. Import `SharedGenericModule` in your NgModule's `imports` array
2. Ensure components are declared in `declarations`, not as standalone
3. Remove `standalone: true` from component decorators
4. Remove `imports: [...]` from component decorators

```typescript
@NgModule({
  declarations: [
    MyComponent,           // Declare here
    MyDialogComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    SharedGenericModule,   // For mj-loading and other shared components
  ],
  exports: [
    MyComponent
  ]
})
export class MyModule {}
```

### Key Takeaways

1. **MD3 Variables Must Be Global** - Define them in the application's main styles, not in component libraries
2. **Mobile Scrolling First** - Use `overflow: visible` and `min-height`, avoid `overflow: hidden` and fixed heights
3. **Never Break Encapsulation** - No `ViewEncapsulation.None`, no `::ng-deep`
4. **Always Trigger Change Detection** - Use `ChangeDetectorRef` after async operations
5. **Use Getter/Setters for Inputs** - Gives precise control over change reactions
6. **Debug with Console Logs** - Add logging at each step to identify where issues occur
7. **Test on Real Devices** - Mobile browsers behave differently than DevTools responsive mode

---

## Conclusion

By following this guide, all components in the Explorer Settings module will maintain a consistent, accessible, and modern user experience aligned with Material Design 3 principles.

**Critical Requirements:**
- ✅ Fully responsive across all screen sizes (mobile, tablet, laptop, desktop)
- ✅ All content scrollable and accessible on every device
- ✅ Light theme only with MD3 tokens
- ✅ WCAG 2.1 AA accessibility compliance
- ✅ Mobile-first development approach
- ✅ Touch-friendly interactions (44x44px minimum)
- ✅ No horizontal overflow (except intentional tables/galleries)
- ✅ Adaptive navigation (bottom nav mobile, side nav desktop)

Always prioritize user needs, accessibility, and performance when implementing new features or refactoring existing ones. Test on real devices, not just emulators.

For questions or clarifications, refer to the Angular Material documentation or Material Design 3 guidelines linked in the Resources section.
