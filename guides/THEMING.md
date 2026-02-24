# MemberJunction Theming System

This guide covers MemberJunction's pluggable theme system — how it works, how to create custom themes, and the full design token catalog.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Design Token Reference](#design-token-reference)
4. [Creating a Custom Theme](#creating-a-custom-theme)
5. [Theme Inheritance and Composition](#theme-inheritance-and-composition)
6. [ThemeService API Reference](#themeservice-api-reference)
7. [User Menu Integration](#user-menu-integration)
8. [Backward Compatibility](#backward-compatibility)
9. [Best Practices](#best-practices)

---

## Overview

MemberJunction uses a **two-level CSS custom property system** for theming:

1. **Built-in themes** — Light and Dark modes defined in `_tokens.scss`. Light tokens live on `:root`, dark overrides on `[data-theme="dark"]`.
2. **Custom overlay themes** — Additional themes that inherit from either built-in base and override specific tokens via a dynamically loaded CSS file, scoped under `[data-theme-overlay="<id>"]`.

The `ThemeService` manages theme registration, switching, persistence, and CSS loading. User preference is saved per-user and themes automatically appear in the user avatar menu.

---

## Architecture

### Token Layers

All design tokens are defined in:
> `packages/Angular/Explorer/explorer-app/src/lib/styles/_tokens.scss`

The file is organized in two blocks:

| CSS selector | Purpose |
|---|---|
| `:root { ... }` | **Light theme defaults** — primitives and semantic tokens |
| `[data-theme="dark"] { ... }` | **Dark theme** — overrides semantic tokens for dark backgrounds |

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

### ThemeService

The `ThemeService` is an Angular `providedIn: 'root'` singleton defined in:
> `packages/Angular/Generic/shared/src/lib/theme.service.ts`

It is exported from `@memberjunction/ng-shared-generic` and re-exported from `@memberjunction/ng-shared`.

**Responsibilities:**
- Maintains a registry of `ThemeDefinition` objects (seeded with built-in light/dark)
- Resolves `'system'` preference to `'light'` or `'dark'` using `prefers-color-scheme`
- Dynamically injects/enables/disables `<link>` elements for custom theme CSS
- Persists user preference via `UserInfoEngine` under the key `Explorer.Theme`
- Exposes `BehaviorSubject` observables for reactive UI updates

### Shell Integration

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

---

## Design Token Reference

Tokens are organized into **primitives** (raw color values) and **semantic tokens** (what components should actually use). Theme authors should override **semantic tokens only** — primitives are building blocks and should not be targeted directly.

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
| `--mj-text-xs` through `--mj-text-4xl` | 0.75rem – 2.25rem | Font size scale |
| `--mj-font-normal` through `--mj-font-bold` | 400 – 700 | Font weight scale |
| `--mj-leading-none` through `--mj-leading-loose` | 1 – 2 | Line height scale |
| `--mj-tracking-tighter` through `--mj-tracking-wider` | -0.05em – 0.05em | Letter spacing scale |

### Spacing Tokens

A 4px-based scale from `--mj-space-0` (0) to `--mj-space-24` (6rem / 96px).

### Effects

| Token | Purpose |
|---|---|
| `--mj-radius-none` through `--mj-radius-full` | Border radius scale (0 – 9999px) |
| `--mj-shadow-none` through `--mj-shadow-2xl` | Box shadow scale |
| `--mj-shadow-brand-sm`, `--mj-shadow-brand-md` | Brand-colored shadows |
| `--mj-focus-ring` | Standard focus ring style |
| `--mj-transition-fast`, `--mj-transition-base`, `--mj-transition-slow` | Transition timing |

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

## Creating a Custom Theme

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

### Step 2: Serve the CSS as a Static Asset

Place the CSS file where the Angular app can serve it. The simplest location is in your app's `assets/themes/` directory:

```
packages/MJExplorer/src/assets/themes/izzy-dark.css
```

Make sure the `assets` directory is configured in `angular.json` (it is by default for MJExplorer).

### Step 3: Register the Theme

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

---

## Theme Inheritance and Composition

### How Inheritance Works Today

The theme system is designed around **composition, not forking**. You never copy the full token file to create a variant — you only override the tokens you care about. Everything else falls through to the base theme via CSS custom property resolution:

```
:root (light defaults)
  └── [data-theme="dark"] (dark overrides — only redefines what differs from light)
        └── [data-theme-overlay="your-theme"] (your overrides — only redefines what differs from base)
```

This means a custom theme CSS file can be as small as 3-4 token overrides or as large as a complete re-skin — it's entirely up to the theme author.

### Current Limitation: Single-Level Overlay

Today, `ThemeDefinition.BaseTheme` is limited to `'light' | 'dark'`. The ThemeService sets one `data-theme` attribute (for the built-in base) and one `data-theme-overlay` attribute (for the custom theme). There is no built-in support for multi-level theme chaining at the service level — you cannot formally declare that "Izzy Dark High Contrast" extends "Izzy Dark" which extends "Dark."

However, **CSS `@import` provides the composition mechanism** for sharing tokens between related themes without duplication. This is the recommended approach today for theme families.

### Future Consideration: Formal Theme Chaining

A future enhancement could add an `ExtendsTheme` property to `ThemeDefinition`, allowing the service to load a chain of CSS files automatically. For now, CSS `@import` achieves the same result at the file level.

### Creating Light + Dark Variants (Theme Families)

The most common use case is a brand that needs both light and dark variants sharing fonts, logo, brand colors, and other identity tokens. The pattern is to extract shared tokens into a base CSS file and `@import` it from each variant.

**File structure:**

```
assets/themes/
├── izzy/
│   ├── _izzy-base.css      ← shared brand: fonts, logo, brand colors
│   ├── izzy-dark.css        ← @imports base + dark surface overrides
│   └── izzy-light.css       ← @imports base + light surface overrides
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
  /* Brand identity — shared across both variants */
  --mj-brand-primary: #7c3aed;
  --mj-brand-primary-hover: #6d28d9;
  --mj-brand-primary-active: #5b21b6;
  --mj-brand-accent: #f472b6;
  --mj-brand-accent-hover: #ec4899;

  /* Typography — Izzy uses a different font */
  --mj-font-family: 'Poppins', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;

  /* Border radius — rounder feel */
  --mj-radius-md: 12px;
  --mj-radius-lg: 16px;
}
```

Note the multi-selector: `[data-theme-overlay="izzy-light"], [data-theme-overlay="izzy-dark"]`. This ensures the shared tokens apply regardless of which variant is active.

**Light variant: `izzy-light.css`**

```css
@import url('./_izzy-base.css');

/* Izzy Light — only overrides what differs from built-in light + Izzy base */
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

/* Izzy Dark — only overrides what differs from built-in dark + Izzy base */
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

The key insight: **no layer forks or duplicates the layer above it.** Each layer is a sparse overlay that only redefines what it needs to change. If you later update the built-in dark theme's shadow tokens, all dark-based custom themes automatically inherit the change — no maintenance needed.

### Fully Custom Themes

If someone wants a completely bespoke theme that doesn't share anything with a brand family, that's fine too. They simply create a single CSS file with all the overrides they want, skip the `@import`, and register it with `BaseTheme: 'light'` or `BaseTheme: 'dark'` depending on which built-in base is closer to their intent. Tokens they don't override still fall through to the base.

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
