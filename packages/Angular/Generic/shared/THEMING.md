# MemberJunction Theming & Design Tokens

This is the canonical reference for MemberJunction's theming system — architecture, the full design token catalog, the `ThemeService` API, and how to create custom themes.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Design Token Reference](#design-token-reference)
4. [Dark Mode](#dark-mode)
5. [Using Tokens in Components](#using-tokens-in-components)
6. [ThemeService API Reference](#themeservice-api-reference)
7. [Creating a Custom Theme](#creating-a-custom-theme)
8. [Theme Families](#theme-families)
9. [User Menu Integration](#user-menu-integration)
10. [Backward Compatibility](#backward-compatibility)
11. [Best Practices](#best-practices)

---

## Overview

MemberJunction uses a **two-level CSS custom property system** for theming:

1. **Built-in themes** — Light and Dark modes defined in `_tokens.scss`. Light tokens live on `:root`, dark overrides on `[data-theme="dark"]`.
2. **Custom overlay themes** — Additional themes that inherit from either built-in base and override specific tokens via a dynamically loaded CSS file, scoped under `[data-theme-overlay="<id>"]`.

The `ThemeService` manages theme registration, switching, persistence, and CSS loading. User preference is saved per-user and themes automatically appear in the user avatar menu.

---

## Architecture

The theming system has three layers:

```
┌─────────────────────────────────────────────────────┐
│  Integration Layer                                  │
│  Shell component, user menu, workspace initializer  │
├─────────────────────────────────────────────────────┤
│  Service Layer                                      │
│  ThemeService — runtime management & persistence    │
├─────────────────────────────────────────────────────┤
│  Token Layer                                        │
│  _tokens.scss — CSS custom properties               │
└─────────────────────────────────────────────────────┘
```

### Token Layer

All design tokens are defined in:
> `packages/Angular/Generic/shared/src/lib/_tokens.scss`

The file is organized in two blocks:

| CSS selector | Purpose |
|---|---|
| `:root { ... }` | **Light theme defaults** — primitives and semantic tokens |
| `[data-theme="dark"] { ... }` | **Dark theme** — overrides semantic tokens for dark backgrounds |

### Service Layer

The `ThemeService` is an Angular `providedIn: 'root'` singleton defined in:
> `packages/Angular/Generic/shared/src/lib/theme.service.ts`

It is exported from `@memberjunction/ng-shared-generic` and re-exported from `@memberjunction/ng-shared`.

**Responsibilities:**
- Maintains a registry of `ThemeDefinition` objects (seeded with built-in light/dark)
- Resolves `'system'` preference to `'light'` or `'dark'` using `prefers-color-scheme`
- Dynamically injects/enables/disables `<link>` elements for custom theme CSS
- Persists user preference via `UserInfoEngine` under the key `Explorer.Theme`
- Exposes `BehaviorSubject` observables for reactive UI updates

### Integration Layer

The shell component (`packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts`) injects `ThemeService` and:
- Passes `themePreference`, `availableThemes`, and `appliedTheme` into the `UserMenuContext`
- Subscribes to `Preference$` to keep the user menu in sync
- Delegates `select-theme-*` menu actions to `themeService.SetTheme()`
- Exposes an `IsDarkMode` getter based on the applied theme's `BaseTheme`

The service is initialized during the workspace startup sequence:
> `packages/Angular/Explorer/workspace-initializer/src/lib/services/workspace-initializer.service.ts`

```typescript
// Called after metadata is loaded and the user is authenticated
await this.themeService.Initialize();
```

### How Custom Themes Layer On

When a custom theme (e.g. "Izzy Dark") is active, the `<html>` element ends up with **two** data attributes:

```html
<!-- Built-in dark active -->
<html data-theme="dark">

<!-- Custom "izzy-dark" active (inherits from dark) -->
<html data-theme="dark" data-theme-overlay="izzy-dark">
```

CSS specificity resolves in this order:

1. `:root` — light defaults
2. `[data-theme="dark"]` — dark overrides (if `BaseTheme` is `'dark'`)
3. `[data-theme-overlay="izzy-dark"]` — custom overrides (loaded dynamically)

The custom overlay CSS only needs to redefine the tokens it wants to change. Everything else falls through to the base theme.

---

## Design Token Reference

Tokens are organized into **primitives** (raw color values) and **semantic tokens** (what components should actually use). Theme authors should override **semantic tokens only** — primitives are building blocks and should not be targeted directly.

### Primitive Color Palettes

Primitives are defined on `:root` and provide raw color values. **Do not use these directly in components** — use the semantic tokens below.

| Palette | Range | Key Values |
|---|---|---|
| **Brand** (blue) | `--mj-color-brand-50` … `--mj-color-brand-900` | `500: #0076b6` (MJ Primary Blue), `900: #092340` (MJ Navy) |
| **Accent** (light blue) | `--mj-color-accent-50` … `--mj-color-accent-900` | `300: #aae7fd` (MJ Light Blue), `400: #5cc0ed` (Skip Agent Blue) |
| **Tertiary** (cyan/teal) | `--mj-color-tertiary-50` … `--mj-color-tertiary-900` | `500: #06b6d4` (MJ Tertiary Cyan) |
| **Neutral** (slate) | `--mj-color-neutral-0` … `--mj-color-neutral-950` | `0: #ffffff`, `900: #0f172a`, `950: #020617` |
| **Success** (green) | `--mj-color-success-50` … `--mj-color-success-800` | `500: #22c55e` |
| **Warning** (amber) | `--mj-color-warning-50` … `--mj-color-warning-900` | `500: #f59e0b` |
| **Error** (red) | `--mj-color-error-50` … `--mj-color-error-700` | `500: #ef4444` |
| **Info** (blue) | `--mj-color-info-50` … `--mj-color-info-700` | `500: #3b82f6` |
| **Violet** | `--mj-color-violet-50` … `--mj-color-violet-700` | `500: #8b5cf6` |
| **Indigo** | `--mj-color-indigo-50` … `--mj-color-indigo-600` | `500: #6366f1` |

### Background Tokens

| Token | Light Default | Dark Default | Purpose |
|---|---|---|---|
| `--mj-bg-page` | neutral-50 `#f8fafc` | neutral-900 `#0f172a` | Main page background |
| `--mj-bg-surface` | neutral-0 `#ffffff` | neutral-800 `#1e293b` | Card/panel background |
| `--mj-bg-surface-elevated` | neutral-0 `#ffffff` | neutral-700 `#334155` | Elevated surface (dropdowns, popovers) |
| `--mj-bg-surface-card` | neutral-50 `#f8fafc` | neutral-800 `#1e293b` | Card backgrounds |
| `--mj-bg-surface-sunken` | neutral-100 `#f1f5f9` | neutral-950 `#020617` | Inset/sunken areas |
| `--mj-bg-surface-hover` | neutral-100 `#f1f5f9` | neutral-700 `#334155` | Hover state backgrounds |
| `--mj-bg-surface-active` | neutral-200 `#e2e8f0` | neutral-600 `#475569` | Active/pressed backgrounds |
| `--mj-bg-overlay` | `rgba(15,23,42,0.5)` | `rgba(0,0,0,0.7)` | Modal overlay backdrop |

### Text Tokens

| Token | Light Default | Dark Default | Purpose |
|---|---|---|---|
| `--mj-text-primary` | neutral-800 `#1e293b` | neutral-100 `#f1f5f9` | Primary body text |
| `--mj-text-secondary` | neutral-600 `#475569` | neutral-300 `#cbd5e1` | Secondary/supporting text |
| `--mj-text-muted` | neutral-500 `#64748b` | neutral-400 `#94a3b8` | De-emphasized text |
| `--mj-text-disabled` | neutral-400 `#94a3b8` | neutral-600 `#475569` | Disabled text |
| `--mj-text-inverse` | neutral-0 `#ffffff` | neutral-900 `#0f172a` | Text on inverted backgrounds |
| `--mj-text-link` | brand-500 `#0076b6` | brand-300 `#4dabd5` | Link text |
| `--mj-text-link-hover` | brand-600 `#006aa3` | brand-200 `#80c3e1` | Link hover |

### Border Tokens

| Token | Light Default | Dark Default | Purpose |
|---|---|---|---|
| `--mj-border-default` | neutral-200 | neutral-700 | Standard borders |
| `--mj-border-subtle` | neutral-100 | neutral-800 | Subtle/light borders |
| `--mj-border-strong` | neutral-300 | neutral-600 | Emphasized borders |
| `--mj-border-focus` | brand-500 | brand-400 | Focus ring borders |
| `--mj-border-error` | error-500 | error-400 | Error state borders |

### Brand Tokens

| Token | Light Default | Dark Default | Purpose |
|---|---|---|---|
| `--mj-brand-primary` | brand-500 `#0076b6` | brand-400 `#2699cc` | Primary brand color |
| `--mj-brand-primary-hover` | brand-600 | brand-300 | Primary hover |
| `--mj-brand-primary-active` | brand-700 | brand-200 | Primary active/pressed |
| `--mj-brand-primary-light` | brand-350 | — | Lighter brand variant |
| `--mj-brand-secondary` | brand-900 `#092340` | — | Secondary brand (navy) |
| `--mj-brand-on-primary` | neutral-0 | — | Text on primary brand bg |
| `--mj-brand-on-secondary` | neutral-0 | — | Text on secondary brand bg |

### Accent Tokens

| Token | Light Default | Dark Default | Purpose |
|---|---|---|---|
| `--mj-brand-accent` | accent-400 `#5cc0ed` | accent-300 `#aae7fd` | Accent highlight |
| `--mj-brand-accent-hover` | accent-500 | accent-200 | Accent hover |
| `--mj-brand-accent-active` | accent-600 | accent-100 | Accent active |
| `--mj-brand-accent-subtle` | accent-50 | 15% accent-400 | Subtle accent bg |

### Tertiary Tokens

| Token | Light Default | Dark Default | Purpose |
|---|---|---|---|
| `--mj-brand-tertiary` | tertiary-500 `#06b6d4` | tertiary-400 | Secondary actions |
| `--mj-brand-tertiary-hover` | tertiary-600 | tertiary-300 | Tertiary hover |
| `--mj-brand-tertiary-active` | tertiary-700 | tertiary-200 | Tertiary active |
| `--mj-brand-tertiary-subtle` | tertiary-50 | 15% tertiary-500 | Subtle tertiary bg |

### Status Tokens

Each status color (success, warning, error, info) has four tokens:

| Pattern | Purpose |
|---|---|
| `--mj-status-{status}` | Icon / badge color |
| `--mj-status-{status}-bg` | Background fill |
| `--mj-status-{status}-text` | Text on status background |
| `--mj-status-{status}-border` | Border color |

In dark mode, `-bg` tokens use `rgba()` at 15% opacity for translucent status backgrounds.

### Highlight & Application Accent

| Token | Purpose |
|---|---|
| `--mj-highlight` | Important callouts, notifications, badges |
| `--mj-highlight-hover` | Highlight hover |
| `--mj-highlight-subtle` | Subtle highlight background |
| `--mj-on-highlight` | Text on highlight background |
| `--mj-app-accent` | Per-application accent (overridable from metadata) |
| `--mj-app-accent-hover` | App accent hover |
| `--mj-app-accent-subtle` | Subtle app accent background |

### Typography Tokens

| Token | Value | Purpose |
|---|---|---|
| `--mj-font-family` | Inter, system stack | Primary font |
| `--mj-font-family-mono` | JetBrains Mono, system mono | Monospace font |
| `--mj-text-xs` … `--mj-text-6xl` | 0.75rem – 3.75rem | Font size scale |
| `--mj-text-display` | 5rem (80px) | Hero/display headings |
| `--mj-font-normal` … `--mj-font-bold` | 400 – 700 | Font weight scale |
| `--mj-leading-none` … `--mj-leading-loose` | 1 – 2 | Line height scale |
| `--mj-tracking-tighter` … `--mj-tracking-wider` | -0.05em – 0.05em | Letter spacing scale |

### Spacing Tokens

A 4px-based scale from `--mj-space-0` (0) to `--mj-space-24` (6rem / 96px). Key values:

| Token | Value |
|---|---|
| `--mj-space-1` | 0.25rem (4px) |
| `--mj-space-2` | 0.5rem (8px) |
| `--mj-space-4` | 1rem (16px) |
| `--mj-space-6` | 1.5rem (24px) |
| `--mj-space-8` | 2rem (32px) |
| `--mj-space-12` | 3rem (48px) |
| `--mj-space-16` | 4rem (64px) |
| `--mj-space-24` | 6rem (96px) |

Half-steps are available: `--mj-space-0-5` (2px), `--mj-space-1-5` (6px), `--mj-space-2-5` (10px), `--mj-space-3-5` (14px).

### Effects

| Token | Purpose |
|---|---|
| `--mj-radius-none` … `--mj-radius-full` | Border radius scale (0 – 9999px) |
| `--mj-shadow-none` … `--mj-shadow-2xl` | Box shadow scale |
| `--mj-shadow-inner` | Inset shadow |
| `--mj-shadow-brand-sm`, `--mj-shadow-brand-md` | Brand-colored shadows |
| `--mj-focus-ring` | Standard focus ring style |
| `--mj-transition-fast` | 150ms ease |
| `--mj-transition-base` | 200ms ease |
| `--mj-transition-slow` | 300ms ease |
| `--mj-transition-colors` | Color/bg/border transition |

### Z-Index Scale

| Token | Value | Purpose |
|---|---|---|
| `--mj-z-base` | 0 | Default |
| `--mj-z-dropdown` | 100 | Dropdown menus |
| `--mj-z-sticky` | 200 | Sticky headers |
| `--mj-z-fixed` | 300 | Fixed position elements |
| `--mj-z-modal-backdrop` | 400 | Modal backdrop |
| `--mj-z-modal` | 500 | Modal content |
| `--mj-z-popover` | 600 | Popovers |
| `--mj-z-tooltip` | 700 | Tooltips |
| `--mj-z-toast` | 800 | Toast notifications |

---

## Dark Mode

The built-in dark theme overrides **semantic tokens only** — primitives remain identical. Dark mode is activated by setting `data-theme="dark"` on the `<html>` element.

Key differences in dark mode:
- **Backgrounds** flip from light neutrals to dark neutrals (e.g. `--mj-bg-page` goes from neutral-50 to neutral-900)
- **Text** flips from dark neutrals to light neutrals
- **Brand/accent colors** shift to lighter shades for sufficient contrast
- **Status backgrounds** use translucent `rgba()` at 15% opacity instead of solid pastels
- **Shadows** increase opacity for visibility against dark surfaces

The dark theme does **not** override:
- Primitive tokens (color palettes stay the same)
- Typography tokens (fonts, sizes, weights, line heights)
- Spacing tokens
- Z-index scale
- Border radius scale

---

## Using Tokens in Components

Always reference semantic tokens via `var(--mj-*)` in component SCSS. Never hardcode colors.

### Basic Usage

```scss
.my-card {
  background: var(--mj-bg-surface);
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mj-radius-md);
  padding: var(--mj-space-4);
  box-shadow: var(--mj-shadow-md);
  color: var(--mj-text-primary);
  transition: var(--mj-transition-colors);

  &:hover {
    background: var(--mj-bg-surface-hover);
    border-color: var(--mj-border-strong);
  }
}

.my-card-title {
  font-size: var(--mj-text-lg);
  font-weight: var(--mj-font-semibold);
  color: var(--mj-text-primary);
  margin-bottom: var(--mj-space-2);
}

.my-card-subtitle {
  font-size: var(--mj-text-sm);
  color: var(--mj-text-secondary);
}
```

### Status Indicators

```scss
.status-badge {
  padding: var(--mj-space-1) var(--mj-space-2);
  border-radius: var(--mj-radius-full);
  font-size: var(--mj-text-xs);
  font-weight: var(--mj-font-medium);

  &.success {
    background: var(--mj-status-success-bg);
    color: var(--mj-status-success-text);
    border: 1px solid var(--mj-status-success-border);
  }

  &.error {
    background: var(--mj-status-error-bg);
    color: var(--mj-status-error-text);
    border: 1px solid var(--mj-status-error-border);
  }
}
```

### Focus Styles

```scss
.my-input:focus-visible {
  outline: none;
  box-shadow: var(--mj-focus-ring);
  border-color: var(--mj-border-focus);
}
```

### Importing the Tokens File

Components that need token variables in their SCSS can import the token file:

```scss
@import '@memberjunction/ng-shared-generic/src/lib/_tokens';
```

However, since the tokens are CSS custom properties defined on `:root`, they're globally available — most components can just use `var(--mj-*)` without any import.

---

## ThemeService API Reference

**Package:** `@memberjunction/ng-shared-generic` (re-exported from `@memberjunction/ng-shared`)

**Source:** `packages/Angular/Generic/shared/src/lib/theme.service.ts`

### ThemeDefinition Interface

```typescript
interface ThemeDefinition {
  /** Unique identifier (e.g. 'light', 'dark', 'izzy-dark') */
  Id: string;
  /** Human-readable display name */
  Name: string;
  /** Which built-in theme this inherits from */
  BaseTheme: 'light' | 'dark';
  /** URL to the CSS file with token overrides (omit for built-in themes) */
  CssUrl?: string;
  /** Whether this is a built-in theme */
  IsBuiltIn: boolean;
  /** Optional description shown in theme picker */
  Description?: string;
  /** Optional preview swatch colors for a future theme picker UI */
  PreviewColors?: string[];
}
```

### Properties

| Property | Type | Description |
|---|---|---|
| `Preference$` | `Observable<string>` | Reactive stream of the user's preference (`'system'`, or a theme ID) |
| `AppliedTheme$` | `Observable<string>` | Reactive stream of the resolved theme ID (never `'system'`) |
| `Preference` | `string` | Current preference (synchronous) |
| `AppliedTheme` | `string` | Currently applied theme ID (synchronous) |
| `IsInitialized` | `boolean` | Whether `Initialize()` has been called |
| `AvailableThemes` | `ThemeDefinition[]` | All registered themes |

### Methods

| Method | Signature | Description |
|---|---|---|
| `RegisterTheme` | `(theme: ThemeDefinition): void` | Register a custom theme. Replaces existing theme with the same ID. |
| `RegisterThemes` | `(themes: ThemeDefinition[]): void` | Register multiple themes. |
| `GetThemeDefinition` | `(id: string): ThemeDefinition \| undefined` | Look up a theme by ID. |
| `Initialize` | `(): Promise<void>` | Load saved preference and apply theme. Call after login. |
| `SetTheme` | `(preference: string): Promise<void>` | Switch to a theme (or `'system'`). Persists the preference. |
| `Reset` | `(): void` | Reset to defaults. Call on logout. |

### Lifecycle

1. **Registration** — Call `RegisterTheme()` / `RegisterThemes()` before `Initialize()` so saved preferences for custom themes are recognized.
2. **Initialization** — The workspace initializer calls `Initialize()` after login. It loads the saved preference, resolves it, and applies the theme.
3. **Switching** — User selects a theme from the menu, which calls `SetTheme()`. The service applies the theme and persists the preference.
4. **Reset** — On logout, the shell calls `Reset()` to remove theme attributes and clean up.

---

## Creating a Custom Theme

There are two approaches for creating and distributing custom themes. Choose the one that fits your situation:

| Approach | Best For |
|---|---|
| **A. App-Level Themes** | Quick prototyping, deployment-specific branding, customer themes that won't be shared across apps |
| **B. Package-Based Themes** | Reusable theme libraries shared across multiple Angular apps in a monorepo or published to npm |

Both approaches share the same first step: authoring the CSS file.

### Step 1: Create the CSS File

Create a CSS file that targets the `[data-theme-overlay="your-theme-id"]` selector and overrides whichever semantic tokens you want to change.

**Example: `izzy-dark.css`**

```css
/*
 * Izzy Dark Theme
 * A warm, purple-accented dark theme.
 * Inherits from the built-in dark theme (data-theme="dark").
 */
[data-theme-overlay="izzy-dark"] {
  /* Override brand colors with a purple palette */
  --mj-brand-primary: #a78bfa;
  --mj-brand-primary-hover: #c4b5fd;
  --mj-brand-primary-active: #ddd6fe;

  /* Warm dark backgrounds instead of the default slate */
  --mj-bg-page: #1a1225;
  --mj-bg-surface: #231a30;
  --mj-bg-surface-elevated: #2d2240;
  --mj-bg-surface-hover: #352a48;

  /* Purple-tinted borders */
  --mj-border-default: #3d2e55;
  --mj-border-subtle: #2d2240;
  --mj-border-focus: #a78bfa;

  /* Adjusted shadows for the dark purple background */
  --mj-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -2px rgba(0, 0, 0, 0.4);
}
```

### Approach A: App-Level Themes (Simple / Deployment-Specific)

Best for quick prototyping or deployment-specific branding (e.g. a customer-specific theme that won't be shared across apps).

#### A-1: Place the CSS in your app's assets

Put the CSS file where the Angular app can serve it as a static asset:

```
packages/MJExplorer/src/assets/themes/izzy-dark.css
```

Make sure the `assets` directory is configured in `angular.json` (it is by default for MJExplorer).

#### A-2: Register the theme

In your application's bootstrap or initialization code, register the theme with `ThemeService` **before** `ThemeService.Initialize()` is called. A good place is in `AppModule` or an `APP_INITIALIZER`:

```typescript
import { ThemeService, ThemeDefinition } from '@memberjunction/ng-shared';

// Register before the workspace initializer calls ThemeService.Initialize()
const themeService = inject(ThemeService);

themeService.RegisterTheme({
  Id: 'izzy-dark',
  Name: 'Izzy Dark',
  BaseTheme: 'dark',
  CssUrl: 'assets/themes/izzy-dark.css',
  IsBuiltIn: false,
  Description: 'A warm, purple-accented dark theme'
});
```

Or register multiple themes at once:

```typescript
themeService.RegisterThemes([
  {
    Id: 'izzy-dark',
    Name: 'Izzy Dark',
    BaseTheme: 'dark',
    CssUrl: 'assets/themes/izzy-dark.css',
    IsBuiltIn: false,
    Description: 'A warm, purple-accented dark theme'
  },
  {
    Id: 'ocean-light',
    Name: 'Ocean Light',
    BaseTheme: 'light',
    CssUrl: 'assets/themes/ocean-light.css',
    IsBuiltIn: false,
    Description: 'A blue-green light theme'
  }
]);
```

That's it. The theme will automatically appear in the user avatar menu and will persist per-user once selected.

### Approach B: Package-Based Themes (Recommended for Reusable Themes)

When themes need to be shared across multiple Angular apps — or published to npm for external consumers — ship them from a dedicated library package. This follows the same pattern MJ already uses for `_tokens.scss` in `@memberjunction/ng-shared-generic`.

> **Note:** MJ does not ship a dedicated themes package today. The built-in light/dark themes live in `_tokens.scss` inside `ng-shared-generic`. The pattern below is the recommended approach when you need to create reusable themes for distribution.

#### B-1: Create a theme package

Create a package (e.g. `@memberjunction/ng-themes` or `@yourorg/mj-themes`) with this structure:

```
packages/Angular/Generic/themes/
├── package.json
├── src/
│   ├── themes/
│   │   ├── izzy-dark.css
│   │   ├── izzy-light.css
│   │   └── ocean-light.css
│   └── index.ts              <- Optional: exports ThemeDefinition objects
└── dist/                      <- Built output (gitignored)
    └── themes/
        ├── izzy-dark.css
        ├── izzy-light.css
        └── ocean-light.css
```

#### B-2: Add a `copy-assets` build script

In the package's `package.json`, add a `copy-assets` script that copies the CSS files into `dist/themes/` alongside the compiled TypeScript output. This is the same pattern `ng-shared-generic` uses to ship `_tokens.scss`:

```json
{
  "name": "@yourorg/mj-themes",
  "scripts": {
    "build": "tsc && npm run copy-assets",
    "copy-assets": "cpy 'src/themes/**/*.css' dist/themes --flat"
  },
  "devDependencies": {
    "cpy-cli": "^5.0.0"
  }
}
```

> **Why `copy-assets`?** Angular's `ngc` compiler only emits JavaScript and type definitions. Static assets like CSS files must be explicitly copied into `dist/` so they're available when the package is installed from npm or linked in a workspace.

#### B-3: (Optional) Export ThemeDefinition objects from TypeScript

For a better developer experience, export pre-built `ThemeDefinition` arrays from the package so consumers don't have to manually assemble definitions:

```typescript
// src/index.ts
import { ThemeDefinition } from '@memberjunction/ng-shared-generic';

export const IZZY_THEMES: ThemeDefinition[] = [
  {
    Id: 'izzy-dark',
    Name: 'Izzy Dark',
    BaseTheme: 'dark',
    CssUrl: 'assets/themes/izzy-dark.css',   // Path after angular.json copies it
    IsBuiltIn: false,
    Description: 'A warm, purple-accented dark theme'
  },
  {
    Id: 'izzy-light',
    Name: 'Izzy Light',
    BaseTheme: 'light',
    CssUrl: 'assets/themes/izzy-light.css',
    IsBuiltIn: false,
    Description: 'Light theme with Izzy brand colors and fonts'
  }
];

export const OCEAN_THEMES: ThemeDefinition[] = [
  {
    Id: 'ocean-light',
    Name: 'Ocean Light',
    BaseTheme: 'light',
    CssUrl: 'assets/themes/ocean-light.css',
    IsBuiltIn: false,
    Description: 'A blue-green light theme'
  }
];

/** All themes in this package. */
export const ALL_THEMES: ThemeDefinition[] = [...IZZY_THEMES, ...OCEAN_THEMES];
```

Note that the `CssUrl` values use the `assets/themes/` path — this is where the CSS will be served from at runtime after the consuming app copies the files (next step).

#### B-4: Wire the consuming app's `angular.json`

In the consuming Angular app (e.g. MJExplorer), add an entry to the `assets` array in `angular.json` that copies the CSS files from the theme package's `dist/` into the app's `assets/themes/` directory at build time:

```json
{
  "glob": "**/*.css",
  "input": "node_modules/@yourorg/mj-themes/dist/themes",
  "output": "/assets/themes"
}
```

This is the same mechanism MJExplorer uses to pull assets from `@memberjunction/ng-explorer-app/dist/assets`.

#### B-5: Register themes from the package

In your app's bootstrap code, import the definitions and register them:

```typescript
import { ThemeService } from '@memberjunction/ng-shared';
import { ALL_THEMES } from '@yourorg/mj-themes';

const themeService = inject(ThemeService);
themeService.RegisterThemes(ALL_THEMES);
```

Because the `ThemeDefinition` objects are exported from the package, adding themes to a new app is a one-liner.

---

## Theme Families

### Creating Light + Dark Variants

The most common use case is a brand that needs both light and dark variants sharing fonts, logo, brand colors, and other identity tokens. Extract shared tokens into a base CSS file and `@import` it from each variant.

**File structure:**

```
assets/themes/
├── izzy/
│   ├── _izzy-base.css      <- shared brand: fonts, logo, brand colors
│   ├── izzy-dark.css        <- @imports base + dark surface overrides
│   └── izzy-light.css       <- @imports base + light surface overrides
```

**Shared base: `_izzy-base.css`**

The leading underscore is a convention indicating this file is not a standalone theme — it's imported by variants.

```css
/*
 * Izzy Brand Base
 * Shared tokens for all Izzy theme variants.
 * This file is @imported by izzy-light.css and izzy-dark.css.
 * It should NOT be registered as a theme itself.
 */
[data-theme-overlay="izzy-light"],
[data-theme-overlay="izzy-dark"] {
  /* Brand identity -- shared across both variants */
  --mj-brand-primary: #7c3aed;
  --mj-brand-primary-hover: #6d28d9;
  --mj-brand-primary-active: #5b21b6;
  --mj-brand-accent: #f472b6;
  --mj-brand-accent-hover: #ec4899;

  /* Typography -- Izzy uses a different font */
  --mj-font-family: 'Poppins', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;

  /* Border radius -- rounder feel */
  --mj-radius-md: 12px;
  --mj-radius-lg: 16px;
}
```

Note the multi-selector: `[data-theme-overlay="izzy-light"], [data-theme-overlay="izzy-dark"]`. This ensures the shared tokens apply regardless of which variant is active.

**Light variant: `izzy-light.css`**

```css
@import url('./_izzy-base.css');

/* Izzy Light -- only overrides what differs from built-in light + Izzy base */
[data-theme-overlay="izzy-light"] {
  --mj-bg-page: #faf5ff;
  --mj-bg-surface: #ffffff;
  --mj-bg-surface-card: #f5f0ff;
  --mj-border-default: #e9d5ff;
}
```

**Dark variant: `izzy-dark.css`**

```css
@import url('./_izzy-base.css');

/* Izzy Dark -- only overrides what differs from built-in dark + Izzy base */
[data-theme-overlay="izzy-dark"] {
  --mj-bg-page: #1a1025;
  --mj-bg-surface: #231a30;
  --mj-bg-surface-elevated: #2d2240;
  --mj-border-default: #3d2e55;
}
```

**Registration:**

```typescript
themeService.RegisterThemes([
  {
    Id: 'izzy-light',
    Name: 'Izzy Light',
    BaseTheme: 'light',
    CssUrl: 'assets/themes/izzy/izzy-light.css',
    IsBuiltIn: false,
    Description: 'Light theme with Izzy brand colors and fonts'
  },
  {
    Id: 'izzy-dark',
    Name: 'Izzy Dark',
    BaseTheme: 'dark',
    CssUrl: 'assets/themes/izzy/izzy-dark.css',
    IsBuiltIn: false,
    Description: 'Dark theme with Izzy brand colors and fonts'
  }
]);
```

### What Each Layer Is Responsible For

| Layer | Defines | Example |
|---|---|---|
| `:root` (built-in light) | All primitives + all semantic defaults | Full token catalog |
| `[data-theme="dark"]` (built-in dark) | Only semantic tokens that differ in dark mode | `--mj-bg-page`, `--mj-text-primary`, etc. |
| `_izzy-base.css` (shared brand) | Brand identity: colors, fonts, logo, radius | `--mj-brand-primary`, `--mj-font-family` |
| `izzy-dark.css` (variant) | Only surface/text tokens specific to this variant | `--mj-bg-page`, `--mj-bg-surface` |

The key insight: **no layer forks or duplicates the layer above it.** Each layer is a sparse overlay that only redefines what it needs to change. If you later update the built-in dark theme's shadow tokens, all dark-based custom themes automatically inherit the change.

### Fully Custom Themes

For a completely bespoke theme that doesn't share anything with a brand family, create a single CSS file with all the overrides you want, skip the `@import`, and register it with `BaseTheme: 'light'` or `BaseTheme: 'dark'` depending on which built-in base is closer to your intent. Tokens you don't override still fall through to the base.

### Current Limitation: Single-Level Overlay

Today, `ThemeDefinition.BaseTheme` is limited to `'light' | 'dark'`. There is no built-in support for multi-level theme chaining at the service level. However, **CSS `@import` provides the composition mechanism** for sharing tokens between related themes without duplication (as shown above).

---

## User Menu Integration

Registered themes automatically appear in the **user avatar menu** under the "System" group. The `BaseUserMenu` class builds theme menu items by iterating over `ThemeService.AvailableThemes`:

- Each registered theme gets a `select-theme-<id>` menu item
- A `select-theme-system` item is always appended (auto-detect from OS)
- The currently active preference shows a green checkmark icon
- Non-active themes show a sun icon (light base) or moon icon (dark base)

**No extra configuration is needed.** Registering a theme via `ThemeService.RegisterTheme()` is sufficient for it to appear in the menu.

The shell component handles the `select-theme-*` action by calling `themeService.SetTheme()` and updating the menu context.

> **Source:** `packages/Angular/Explorer/explorer-core/src/lib/user-menu/base-user-menu.ts` — see `BuildThemeMenuItems()` method

---

## Backward Compatibility

The theming system is fully backward-compatible:

| Concern | Status |
|---|---|
| Existing `[data-theme="dark"]` CSS selectors | Still work — `data-theme` is always set for dark-based themes |
| Components using `--mj-*` tokens | Still work — custom themes only override specific tokens; others fall through |
| Saved `'dark'` / `'light'` / `'system'` preferences | Still recognized and applied identically |
| `@import '_tokens.scss'` in component styles | Still works — the token file hasn't changed |
| Third-party components reading `data-theme` | Still work — the attribute is always present for dark mode |

If a saved preference references a theme ID that is no longer registered (e.g. a custom theme was removed), the service falls back to `'system'`.

---

## Best Practices

### DO

- **Override semantic tokens, not primitives.** Semantic tokens (`--mj-bg-surface`, `--mj-text-primary`, etc.) are what components consume. Primitives (`--mj-color-neutral-800`) are building blocks.
- **Use the `[data-theme-overlay="your-id"]` selector** in your custom CSS. This ensures your overrides only apply when your theme is active.
- **Inherit as much as possible.** Only override the tokens you need to change. The base light/dark theme handles the rest.
- **Name theme IDs with kebab-case** (e.g. `izzy-dark`, `ocean-light`). This keeps CSS attribute selectors clean.
- **Provide a `Description`** in your `ThemeDefinition` — it shows as a tooltip in the user menu.
- **Register themes early** — before `ThemeService.Initialize()` — so a user's saved preference is recognized on first load.
- **Test both base themes.** If you override a token for a dark-based theme, check that the corresponding light-based theme (if applicable) also looks correct.

### DON'T

- **Don't modify `_tokens.scss` for custom themes.** That file is the shared foundation. Use overlay CSS files instead.
- **Don't target `:root` or `[data-theme="dark"]` in custom theme CSS.** Those selectors would affect all themes. Always scope to `[data-theme-overlay="your-id"]`.
- **Don't override z-index, spacing, or typography tokens** unless you have a strong reason. These are structural and changing them can break layout.
- **Don't hardcode colors in components.** Always use `var(--mj-*)` tokens so themes apply universally.
- **Don't set `IsBuiltIn: true` on custom themes.** Built-in themes skip CSS loading. Your overrides won't be applied.

### Token Override Priority Guide

| Priority | Tokens to Override | Impact |
|---|---|---|
| High (brand identity) | `--mj-brand-primary`, `--mj-brand-accent`, `--mj-brand-tertiary` and their hover/active variants | Changes the brand feel throughout |
| Medium (surface & text) | `--mj-bg-*`, `--mj-text-*`, `--mj-border-*` | Changes the overall color palette |
| Low (status colors) | `--mj-status-*` | Only change if your brand colors conflict with status meanings |
| Avoid | `--mj-space-*`, `--mj-radius-*`, `--mj-z-*`, `--mj-font-*` | Structural tokens — changing breaks layout consistency |

---

## Related Resources

| Resource | Location |
|---|---|
| Token definitions (SCSS) | [`src/lib/_tokens.scss`](./src/lib/_tokens.scss) |
| ThemeService (TypeScript) | [`src/lib/theme.service.ts`](./src/lib/theme.service.ts) |
| Shell integration | [`packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts`](../../../Explorer/explorer-core/src/lib/shell/shell.component.ts) |
| User menu theme items | [`packages/Angular/Explorer/explorer-core/src/lib/user-menu/base-user-menu.ts`](../../../Explorer/explorer-core/src/lib/user-menu/base-user-menu.ts) |
| Workspace initializer | [`packages/Angular/Explorer/workspace-initializer/`](../../../Explorer/workspace-initializer/) |
