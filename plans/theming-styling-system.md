# MJExplorer Theming & Styling System Plan

**Date**: January 27, 2026
**Status**: Draft - Pending Team Review
**Authors**: Matt, Soham (with Claude assistance)

---

## Executive Summary

This plan creates a **white-label theming system** for MJExplorer that allows external consumers (BC CDP, Izzy, etc.) to fully customize the look and feel without modifying MJExplorer source code. It also standardizes styling across all dashboards and adds dark/light theme support.

---

## Scope

### IN Scope
- CSS design token system (unified across all dashboards)
- Dark/light theme switching with user preference persistence
- External configuration mechanism for branding (logo, colors, fonts)
- Application-specific accent colors from `Application.Color` metadata
- Backward compatibility with existing styles

### OUT of Scope (for now)
- Adding `SecondaryColor` to Application entity (database change)
- Replacing Kendo with PrimeNG (separate initiative)
- Structural changes to components

---

## Design Decisions (Confirmed)

1. **Token naming**: Use `--mj-*` prefix for all new tokens (e.g., `--mj-bg-surface`, `--mj-text-primary`)
2. **Gradient strategy**: **No gradients - solid colors only**. Simplify to flat design with solid backgrounds for consistency and easier theming.
3. **System preference**: **Yes**, use `prefers-color-scheme` media query to auto-detect OS dark mode when user selects 'system' mode
4. **Kendo integration**: Theme via bridge tokens (`--kendo-*` → `--mj-*` mapping)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL CONSUMER APP                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  MJExplorerAppModule.forRoot(environment, themeConfig)    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    MJ_THEME_CONFIG                         │  │
│  │  • Logo URLs (header, login, loading)                      │  │
│  │  • Brand colors (primary, secondary)                       │  │
│  │  • Font configuration                                      │  │
│  │  • Dark mode settings                                      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   MJThemeService                           │  │
│  │  • Injects CSS variables at runtime                        │  │
│  │  • Manages dark/light mode toggle                          │  │
│  │  • Persists preference to UserSetting                      │  │
│  │  • Provides logo/branding to components                    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  CSS Design Tokens                         │  │
│  │  :root { --mj-* semantic tokens }                          │  │
│  │  [data-theme="dark"] { dark overrides }                    │  │
│  │  Kendo bridge: --kendo-* → --mj-*                          │  │
│  │  MD3 bridge: --mat-sys-* → --mj-*                          │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Theme Configuration Interface

### New Files

**`packages/Angular/Bootstrap/src/lib/theme.types.ts`**

```typescript
export interface MJLogoConfig {
  headerLogoUrl?: string;      // URL to header logo SVG
  loginLogoUrl?: string;       // URL to login screen logo
  loadingLogoUrl?: string;     // URL to loading screen logo
  headerLogoSvg?: string;      // Inline SVG (alternative to URL)
  altText?: string;            // Accessibility text
}

export interface MJColorPalette {
  primary: string;             // Primary brand color
  secondary?: string;          // Secondary brand color
  accent?: string;             // Accent/highlight color
  onPrimary?: string;          // Text on primary backgrounds
  onSecondary?: string;        // Text on secondary backgrounds
}

export interface MJFontConfig {
  primary?: string;            // Font family (e.g., 'Inter, sans-serif')
  googleFontsUrl?: string;     // Google Fonts URL to load
  heading?: string;            // Heading font (defaults to primary)
}

export interface MJThemeConfig {
  appName?: string;            // Display name in title/branding
  logos?: MJLogoConfig;
  colors?: MJColorPalette;
  darkColors?: MJColorPalette; // Dark theme colors (optional)
  fonts?: MJFontConfig;
  darkModeEnabled?: boolean;   // Enable dark mode toggle
  defaultThemeMode?: 'light' | 'dark' | 'system';
  disableSeasonalThemes?: boolean;
  loadingMessages?: string[];  // Custom loading screen messages
}

export const MJ_THEME_CONFIG = new InjectionToken<MJThemeConfig>(
  'MJ_THEME_CONFIG',
  { providedIn: 'root', factory: () => ({}) }
);
```

### Module Update

**`packages/Angular/Explorer/explorer-app/src/lib/explorer-app.module.ts`**

```typescript
static forRoot(
  environment: MJEnvironmentConfig,
  themeConfig?: MJThemeConfig  // NEW optional parameter
): ModuleWithProviders<MJExplorerAppModule> {
  return {
    ngModule: MJExplorerAppModule,
    providers: [
      { provide: MJ_ENVIRONMENT, useValue: environment },
      { provide: MJ_THEME_CONFIG, useValue: themeConfig || {} },
      // ... existing providers
    ]
  };
}
```

---

## Phase 2: Theme Service

**`packages/Angular/Bootstrap/src/lib/services/theme.service.ts`**

Core responsibilities:
1. Merge consumer config with MJ defaults
2. Inject CSS variables into `:root` at runtime
3. Manage dark/light mode state
4. Persist theme preference via `UserInfoEngine.SetSetting('Theme.ActiveTheme', mode)`
5. Provide logo/branding getters for components

Key methods:
- `initializeTheme()` - Called on app bootstrap
- `applyCssVariables(config)` - Sets CSS custom properties
- `toggleTheme()` - Switches dark/light mode
- `getLogoConfig()` - Returns merged logo configuration
- `getAppName()` - Returns app display name

---

## Phase 3: CSS Design Token System

### Token Structure

```
styles/
├── _tokens.scss                 # Primitive + Semantic tokens
├── _tokens-dark.scss            # Dark theme overrides
├── _tokens-kendo-bridge.scss    # Kendo variable mapping
├── _tokens-md3-bridge.scss      # MD3 variable mapping
├── _tokens-legacy.scss          # Backward compatibility aliases
└── main.scss                    # Updated import order
```

### Semantic Token Categories

| Category | Examples | Purpose |
|----------|----------|---------|
| **Background** | `--mj-bg-page`, `--mj-bg-surface`, `--mj-bg-elevated` | Surface colors |
| **Text** | `--mj-text-primary`, `--mj-text-secondary`, `--mj-text-muted` | Text colors |
| **Border** | `--mj-border-default`, `--mj-border-subtle`, `--mj-border-focus` | Border colors |
| **Brand** | `--mj-brand-primary`, `--mj-brand-secondary`, `--mj-brand-on-primary` | Brand colors |
| **Status** | `--mj-status-success`, `--mj-status-error`, `--mj-status-warning` | Semantic states |
| **Shadow** | `--mj-shadow-sm`, `--mj-shadow-md`, `--mj-shadow-lg` | Elevation |
| **Radius** | `--mj-radius-sm`, `--mj-radius-md`, `--mj-radius-lg` | Border radius |
| **Spacing** | `--mj-space-1` through `--mj-space-16` | 4px base scale |
| **Typography** | `--mj-text-sm`, `--mj-font-medium`, `--mj-leading-normal` | Type system |
| **App Accent** | `--mj-app-accent`, `--mj-app-accent-subtle` | Per-application colors |

### Light Theme (Default)

```scss
:root {
  --mj-bg-page: #f8fafc;
  --mj-bg-surface: #ffffff;
  --mj-text-primary: #1e293b;
  --mj-text-secondary: #64748b;
  --mj-border-default: #e2e8f0;
  --mj-brand-primary: #0076b6;  // MJ Blue
  --mj-brand-secondary: #092340; // Navy
  --mj-shadow-md: 0 4px 6px rgba(0,0,0,0.1);
  // ... 40+ tokens
}
```

### Dark Theme

```scss
[data-theme="dark"] {
  --mj-bg-page: #0f172a;
  --mj-bg-surface: #1e293b;
  --mj-text-primary: #f1f5f9;
  --mj-text-secondary: #94a3b8;
  --mj-border-default: #334155;
  --mj-shadow-md: 0 4px 6px rgba(0,0,0,0.4);
  // ... overrides
}
```

### Bridge Mappings

```scss
// Kendo Bridge
--kendo-color-primary: var(--mj-brand-primary);
--kendo-color-surface: var(--mj-bg-surface);
--kendo-color-border: var(--mj-border-default);

// MD3 Bridge
--mat-sys-primary: var(--mj-brand-primary);
--mat-sys-surface: var(--mj-bg-surface);
--mat-sys-on-surface: var(--mj-text-primary);
```

---

## Phase 4: Component Updates (Minimal Code)

### Shell Component
- Inject `MJThemeService`
- Use `themeService.getLogoConfig()` for header logo
- Add `[attr.data-theme]` binding for dark mode

### Loading Component
- Accept optional `customLogoUrl` input
- Fall back to default MJ logo if not provided

### Login Screen
- Use `themeService.getLogoConfig().loginLogoUrl`
- Use `themeService.getAppName()` for title

### User Menu
- Add theme toggle button (if `darkModeEnabled: true`)
- Call `themeService.toggleTheme()` on click

---

## Phase 5: Dashboard Style Migration

### Migration Priority

1. **Entity Admin** - Already uses MD3, easy mapping
2. **Actions** - Uses Kendo vars, map via bridge
3. **Credentials** - Replace hardcoded hex colors
4. **AI Dashboard** - Largest, most hardcoded colors
5. **Testing** - Similar to AI dashboard
6. **Home** - Replace hardcoded colors
7. **Lists** - Minimal styling to update

### Migration Pattern

```scss
// BEFORE (hardcoded with gradients)
.dashboard-header {
  background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%);
  color: #ffffff;
  border-radius: 16px;
}

// AFTER (tokens with flat design)
.dashboard-header {
  background: var(--mj-bg-surface);
  color: var(--mj-text-primary);
  border-left: 4px solid var(--mj-app-accent);  // App color as accent
  border-radius: var(--mj-radius-lg);
  box-shadow: var(--mj-shadow-sm);
}
```

**Note**: Gradients are being removed in favor of flat, solid color design. This simplifies theming, improves dark mode compatibility, and creates visual consistency across dashboards.

---

## Consumer Usage Example

```typescript
// BC CDP app.module.ts
const bcCdpTheme: MJThemeConfig = {
  appName: 'BC CDP',
  logos: {
    headerLogoUrl: '/assets/bc-cdp-logo.svg',
    loginLogoUrl: '/assets/bc-cdp-logo-full.svg',
    altText: 'BC CDP'
  },
  colors: {
    primary: '#1B4F72',
    secondary: '#2C3E50',
    accent: '#3498DB'
  },
  fonts: {
    primary: 'Inter, sans-serif',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
  },
  darkModeEnabled: true,
  loadingMessages: ['Loading BC CDP...', 'Preparing your data...']
};

@NgModule({
  imports: [
    MJExplorerAppModule.forRoot(environment, bcCdpTheme)
  ]
})
export class AppModule {}
```

**Result**: Zero code changes inside MJExplorer - consumer just passes config.

---

## Files to Modify/Create

### New Files
| File | Purpose |
|------|---------|
| `packages/Angular/Bootstrap/src/lib/theme.types.ts` | Theme configuration interfaces |
| `packages/Angular/Bootstrap/src/lib/services/theme.service.ts` | Runtime theme management |
| `packages/Angular/Explorer/explorer-app/src/lib/styles/_tokens.scss` | Design token definitions |
| `packages/Angular/Explorer/explorer-app/src/lib/styles/_tokens-dark.scss` | Dark theme tokens |
| `packages/Angular/Explorer/explorer-app/src/lib/styles/_tokens-kendo-bridge.scss` | Kendo mapping |
| `packages/Angular/Explorer/explorer-app/src/lib/styles/_tokens-md3-bridge.scss` | MD3 mapping |

### Modified Files
| File | Changes |
|------|---------|
| `packages/Angular/Explorer/explorer-app/src/lib/explorer-app.module.ts` | Add `themeConfig` param to `forRoot()` |
| `packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts` | Use theme service for logo |
| `packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.html` | Dynamic logo binding |
| `packages/Angular/Explorer/explorer-app/src/lib/styles/_variables.scss` | Refactor to use token aliases |
| `packages/Angular/Explorer/explorer-app/src/lib/styles/main.scss` | Update import order |
| Dashboard CSS files (6+) | Replace hardcoded colors with tokens |

---

## Verification Plan

1. **Build Test**: `npm run build` in affected packages
2. **Visual Regression**: Compare dashboards before/after in light mode
3. **Dark Mode Test**: Toggle theme, verify all components adapt
4. **Consumer Test**: Create test app with custom `MJThemeConfig`, verify branding applies
5. **Kendo Components**: Verify buttons, grids, dropdowns use correct colors
6. **Application Accent**: Switch between apps, verify accent colors change
7. **Persistence**: Toggle theme, refresh page, verify preference persists

---

## Next Steps

1. **Team Review**: Matt & Soham review and discuss with boss and Robert
2. **Finalize Token List**: Complete list of 40+ semantic tokens
3. **Create Sample Mockups**: Show one dashboard in light/dark with flat design
4. **Get Approval**: Before any implementation begins
