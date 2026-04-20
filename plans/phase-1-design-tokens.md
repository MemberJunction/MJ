# Phase 1: Token-Based Styling System Implementation Plan

## Overview

Implement dynamic theme switching (light/dark/system) for MemberJunction, build out the Appearance settings UI, apply design tokens to Admin app as reference, and update documentation.

---

## Current State Analysis

### Design Token System ✅ COMPLETE
The token system in `/packages/Angular/Explorer/explorer-app/src/lib/styles/_tokens.scss` is already comprehensive:

| Category | Tokens Available | Examples |
|----------|-----------------|----------|
| Backgrounds | 7 tokens | `--mj-bg-page`, `--mj-bg-surface`, `--mj-bg-surface-elevated` |
| Text | 7 tokens | `--mj-text-primary`, `--mj-text-secondary`, `--mj-text-muted` |
| Borders | 5 tokens | `--mj-border-default`, `--mj-border-subtle`, `--mj-border-focus` |
| Brand | 15+ tokens | `--mj-brand-primary`, `--mj-brand-accent`, `--mj-brand-tertiary` |
| Status | 16 tokens | `--mj-status-success-*`, `--mj-status-error-*`, etc. |
| Typography | 15+ tokens | `--mj-text-sm`, `--mj-font-medium`, `--mj-leading-normal` |
| Spacing | 20 tokens | `--mj-space-1` (4px) through `--mj-space-24` (96px) |
| Effects | 15+ tokens | `--mj-radius-md`, `--mj-shadow-lg`, `--mj-transition-base` |
| Z-Index | 9 tokens | `--mj-z-dropdown` through `--mj-z-toast` |

**Dark mode** is fully defined under `[data-theme="dark"]` selector (lines 299-376).

### What Needs Implementation
1. **ThemeService** - Runtime theme switching
2. **Appearance Settings** - User-facing theme selector
3. **Admin App Tokens** - Convert from MD3 (`--mat-sys-*`) to MJ tokens
4. **Documentation** - Update CLAUDE.md files

---

## Phase 1: Create ThemeService

### File: `/packages/Angular/Explorer/shared/src/lib/theme.service.ts`

```typescript
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { UserInfoEngine } from '@memberjunction/core-entities';

/**
 * Theme preference: what the user selected
 */
export type ThemePreference = 'light' | 'dark' | 'system';

/**
 * Applied theme: what's actually rendered
 */
export type AppliedTheme = 'light' | 'dark';

/**
 * Setting key for theme preference in MJ: User Settings entity
 */
const THEME_SETTING_KEY = 'Explorer.Theme';

/**
 * Service to manage application theme (light/dark/system).
 *
 * Follows the DeveloperModeService pattern:
 * - Settings persisted via UserInfoEngine
 * - BehaviorSubject for reactive state
 * - Initialize after login, Reset on logout
 *
 * Usage:
 * ```typescript
 * constructor(private themeService: ThemeService) {}
 *
 * async ngOnInit() {
 *   await this.themeService.Initialize();
 *
 *   this.themeService.AppliedTheme$.subscribe(theme => {
 *     console.log('Current theme:', theme);
 *   });
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
    private _preference$ = new BehaviorSubject<ThemePreference>('system');
    private _appliedTheme$ = new BehaviorSubject<AppliedTheme>('light');
    private _initialized = false;
    private systemMediaQuery: MediaQueryList | null = null;
    private boundSystemThemeHandler: (() => void) | null = null;

    /**
     * Observable for user's theme preference (light/dark/system)
     */
    public get Preference$(): Observable<ThemePreference> {
        return this._preference$.asObservable();
    }

    /**
     * Observable for the actually applied theme (light/dark)
     */
    public get AppliedTheme$(): Observable<AppliedTheme> {
        return this._appliedTheme$.asObservable();
    }

    /**
     * Current theme preference (synchronous access)
     */
    public get Preference(): ThemePreference {
        return this._preference$.value;
    }

    /**
     * Currently applied theme (synchronous access)
     */
    public get AppliedTheme(): AppliedTheme {
        return this._appliedTheme$.value;
    }

    /**
     * Whether the service has been initialized
     */
    public get IsInitialized(): boolean {
        return this._initialized;
    }

    /**
     * Initialize the theme service.
     * Call after login when UserInfoEngine is available.
     */
    public async Initialize(): Promise<void> {
        if (this._initialized) {
            return;
        }

        // Setup system theme listener
        this.SetupSystemThemeListener();

        // Load saved preference
        const savedPreference = await this.LoadSetting();
        this._preference$.next(savedPreference);

        // Apply the theme
        const resolvedTheme = this.ResolveTheme(savedPreference);
        this.ApplyTheme(resolvedTheme);

        this._initialized = true;
    }

    /**
     * Set the theme preference and apply it.
     * @param preference - The theme preference to set
     */
    public async SetTheme(preference: ThemePreference): Promise<void> {
        if (preference === this._preference$.value) {
            return;
        }

        this._preference$.next(preference);

        const resolvedTheme = this.ResolveTheme(preference);
        this.ApplyTheme(resolvedTheme);

        await this.SaveSetting(preference);
    }

    /**
     * Reset the service (call on logout)
     */
    public Reset(): void {
        // Remove system theme listener
        if (this.systemMediaQuery && this.boundSystemThemeHandler) {
            this.systemMediaQuery.removeEventListener('change', this.boundSystemThemeHandler);
        }
        this.systemMediaQuery = null;
        this.boundSystemThemeHandler = null;

        // Reset to defaults
        this._preference$.next('system');
        this._appliedTheme$.next('light');
        this._initialized = false;

        // Remove data-theme attribute
        document.documentElement.removeAttribute('data-theme');
    }

    /**
     * Apply theme to DOM by setting data-theme attribute on <html>
     */
    private ApplyTheme(theme: AppliedTheme): void {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        this._appliedTheme$.next(theme);
    }

    /**
     * Resolve preference to actual theme (handles 'system' mode)
     */
    private ResolveTheme(preference: ThemePreference): AppliedTheme {
        if (preference === 'system') {
            return this.GetSystemTheme();
        }
        return preference;
    }

    /**
     * Get system theme preference from OS
     */
    private GetSystemTheme(): AppliedTheme {
        if (typeof window === 'undefined') {
            return 'light';
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    /**
     * Setup listener for system theme changes
     */
    private SetupSystemThemeListener(): void {
        if (typeof window === 'undefined') {
            return;
        }

        this.systemMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        this.boundSystemThemeHandler = () => this.OnSystemThemeChange();
        this.systemMediaQuery.addEventListener('change', this.boundSystemThemeHandler);
    }

    /**
     * Handle system theme change (only applies if in 'system' mode)
     */
    private OnSystemThemeChange(): void {
        if (this._preference$.value === 'system') {
            const newTheme = this.GetSystemTheme();
            this.ApplyTheme(newTheme);
        }
    }

    /**
     * Load theme preference from User Settings
     */
    private async LoadSetting(): Promise<ThemePreference> {
        try {
            const engine = UserInfoEngine.Instance;
            const settingValue = engine.GetSetting(THEME_SETTING_KEY);
            if (settingValue && ['light', 'dark', 'system'].includes(settingValue)) {
                return settingValue as ThemePreference;
            }
            return 'system';
        } catch (error) {
            console.warn('Failed to load theme setting:', error);
            return 'system';
        }
    }

    /**
     * Save theme preference to User Settings
     */
    private async SaveSetting(preference: ThemePreference): Promise<void> {
        try {
            const engine = UserInfoEngine.Instance;
            await engine.SetSetting(THEME_SETTING_KEY, preference);
        } catch (error) {
            console.warn('Failed to save theme setting:', error);
        }
    }
}
```

### Update: `/packages/Angular/Explorer/shared/src/public-api.ts`

Add export after line 14:
```typescript
export * from './lib/theme.service';
```

---

## Phase 2: Initialize ThemeService

### File: `/packages/Angular/Explorer/workspace-initializer/src/lib/services/workspace-initializer.service.ts`

Add import at top:
```typescript
import { ThemeService } from '@memberjunction/ng-explorer-shared';
```

Update constructor:
```typescript
constructor(
    private authBase: MJAuthBase,
    private startupValidationService: StartupValidationService,
    private themeService: ThemeService  // Add this
) {}
```

Add theme initialization after `SharedService.RefreshData(true)` (around line 69):
```typescript
// 2. Load metadata and validate user
await SharedService.RefreshData(true);

// 2.5. Initialize theme service (after UserInfoEngine is available)
await this.themeService.Initialize();

const md = new Metadata();
```

---

## Phase 3: Implement Appearance Settings

### File: `/packages/Angular/Explorer/explorer-settings/src/lib/appearance-settings/appearance-settings.component.ts`

```typescript
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ThemeService, ThemePreference, AppliedTheme } from '@memberjunction/ng-explorer-shared';

/**
 * Theme option for the UI selector
 */
interface ThemeOption {
    value: ThemePreference;
    label: string;
    icon: string;
    description: string;
}

/**
 * Appearance settings component - allows users to customize theme.
 */
@Component({
    selector: 'mj-appearance-settings',
    templateUrl: './appearance-settings.component.html',
    styleUrls: ['./appearance-settings.component.css']
})
export class AppearanceSettingsComponent implements OnInit, OnDestroy {
    /**
     * Available theme options
     */
    public ThemeOptions: ThemeOption[] = [
        {
            value: 'light',
            label: 'Light',
            icon: 'fa-solid fa-sun',
            description: 'Light background with dark text'
        },
        {
            value: 'dark',
            label: 'Dark',
            icon: 'fa-solid fa-moon',
            description: 'Dark background with light text'
        },
        {
            value: 'system',
            label: 'System',
            icon: 'fa-solid fa-desktop',
            description: 'Follow your device settings'
        }
    ];

    /**
     * Features coming in future releases
     */
    public PlannedFeatures = [
        {
            icon: 'fa-solid fa-text-height',
            title: 'Font Size',
            description: 'Adjust text size for better readability'
        },
        {
            icon: 'fa-solid fa-expand',
            title: 'Display Density',
            description: 'Choose between comfortable and compact layouts'
        }
    ];

    /**
     * Currently applied theme (for display purposes)
     */
    public CurrentAppliedTheme: AppliedTheme = 'light';

    private _selectedTheme: ThemePreference = 'system';
    private destroy$ = new Subject<void>();

    constructor(
        public themeService: ThemeService,
        private cdr: ChangeDetectorRef
    ) {}

    /**
     * Selected theme preference (getter/setter pattern)
     */
    get SelectedTheme(): ThemePreference {
        return this._selectedTheme;
    }

    set SelectedTheme(value: ThemePreference) {
        if (value !== this._selectedTheme) {
            this._selectedTheme = value;
            this.themeService.SetTheme(value);
        }
    }

    ngOnInit(): void {
        // Subscribe to theme preference changes
        this.themeService.Preference$
            .pipe(takeUntil(this.destroy$))
            .subscribe(preference => {
                this._selectedTheme = preference;
                this.cdr.detectChanges();
            });

        // Subscribe to applied theme for the hint text
        this.themeService.AppliedTheme$
            .pipe(takeUntil(this.destroy$))
            .subscribe(applied => {
                this.CurrentAppliedTheme = applied;
                this.cdr.detectChanges();
            });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    /**
     * Check if option is currently selected
     */
    public IsSelected(option: ThemeOption): boolean {
        return this._selectedTheme === option.value;
    }

    /**
     * Select a theme option
     */
    public SelectTheme(option: ThemeOption): void {
        this.SelectedTheme = option.value;
    }
}
```

### File: `/packages/Angular/Explorer/explorer-settings/src/lib/appearance-settings/appearance-settings.component.html`

```html
<div class="appearance-settings">
  <h2 class="section-title">Appearance</h2>
  <p class="section-description">Customize how MemberJunction looks</p>

  <!-- Theme Selection -->
  <div class="setting-section">
    <div class="setting-header">
      <div class="setting-icon">
        <i class="fa-solid fa-palette"></i>
      </div>
      <div class="setting-info">
        <h3 class="setting-title">Theme</h3>
        <p class="setting-help">Choose your preferred color scheme</p>
      </div>
    </div>

    <div class="theme-options" role="radiogroup" aria-label="Theme selection">
      @for (option of ThemeOptions; track option.value) {
        <button
          type="button"
          class="theme-option"
          [class.selected]="IsSelected(option)"
          (click)="SelectTheme(option)"
          [attr.aria-pressed]="IsSelected(option)"
          [attr.aria-label]="option.label + ' theme: ' + option.description"
        >
          <div class="option-icon">
            <i [class]="option.icon" aria-hidden="true"></i>
          </div>
          <span class="option-label">{{ option.label }}</span>
          <span class="option-desc">{{ option.description }}</span>
        </button>
      }
    </div>

    @if (SelectedTheme === 'system') {
      <div class="theme-hint">
        <i class="fa-solid fa-info-circle" aria-hidden="true"></i>
        <span>Currently using <strong>{{ CurrentAppliedTheme }}</strong> theme based on your device settings</span>
      </div>
    }
  </div>

  <!-- Coming Soon Features -->
  <div class="planned-features">
    <h4 class="features-title">Coming Soon</h4>
    <div class="features-grid">
      @for (feature of PlannedFeatures; track feature.title) {
        <div class="feature-card">
          <div class="feature-icon">
            <i [class]="feature.icon"></i>
          </div>
          <div class="feature-info">
            <span class="feature-title">{{ feature.title }}</span>
            <span class="feature-desc">{{ feature.description }}</span>
          </div>
        </div>
      }
    </div>
  </div>
</div>
```

### File: `/packages/Angular/Explorer/explorer-settings/src/lib/appearance-settings/appearance-settings.component.css`

```css
.appearance-settings {
  padding: 0;
}

.section-title {
  font-size: var(--mj-text-2xl);
  font-weight: var(--mj-font-semibold);
  margin: 0 0 var(--mj-space-2) 0;
  color: var(--mj-text-primary);
}

.section-description {
  font-size: var(--mj-text-sm);
  color: var(--mj-text-secondary);
  margin: 0 0 var(--mj-space-6) 0;
}

/* Setting Section */
.setting-section {
  margin-bottom: var(--mj-space-8);
}

.setting-header {
  display: flex;
  align-items: flex-start;
  gap: var(--mj-space-4);
  margin-bottom: var(--mj-space-4);
}

.setting-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  background: var(--mj-brand-accent-subtle);
  border-radius: var(--mj-radius-lg);
  flex-shrink: 0;
}

.setting-icon i {
  font-size: var(--mj-text-lg);
  color: var(--mj-brand-primary);
}

.setting-info {
  flex: 1;
}

.setting-title {
  font-size: var(--mj-text-base);
  font-weight: var(--mj-font-semibold);
  color: var(--mj-text-primary);
  margin: 0 0 var(--mj-space-1) 0;
}

.setting-help {
  font-size: var(--mj-text-sm);
  color: var(--mj-text-secondary);
  margin: 0;
}

/* Theme Options */
.theme-options {
  display: flex;
  gap: var(--mj-space-3);
  flex-wrap: wrap;
}

.theme-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mj-space-2);
  padding: var(--mj-space-4) var(--mj-space-5);
  min-width: 120px;
  background: var(--mj-bg-surface);
  border: 2px solid var(--mj-border-default);
  border-radius: var(--mj-radius-xl);
  cursor: pointer;
  transition: var(--mj-transition-base);
  text-align: center;
}

.theme-option:hover {
  border-color: var(--mj-border-strong);
  background: var(--mj-bg-surface-hover);
}

.theme-option:focus-visible {
  outline: none;
  box-shadow: var(--mj-focus-ring);
}

.theme-option.selected {
  border-color: var(--mj-brand-primary);
  background: var(--mj-brand-accent-subtle);
}

.option-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--mj-radius-full);
  background: var(--mj-bg-surface-sunken);
  transition: var(--mj-transition-base);
}

.theme-option.selected .option-icon {
  background: var(--mj-brand-primary);
  color: var(--mj-brand-on-primary);
}

.option-icon i {
  font-size: var(--mj-text-lg);
  color: var(--mj-text-secondary);
}

.theme-option.selected .option-icon i {
  color: var(--mj-brand-on-primary);
}

.option-label {
  font-size: var(--mj-text-sm);
  font-weight: var(--mj-font-semibold);
  color: var(--mj-text-primary);
}

.option-desc {
  font-size: var(--mj-text-xs);
  color: var(--mj-text-muted);
  line-height: var(--mj-leading-snug);
}

/* Theme Hint */
.theme-hint {
  display: flex;
  align-items: center;
  gap: var(--mj-space-2);
  margin-top: var(--mj-space-4);
  padding: var(--mj-space-3) var(--mj-space-4);
  background: var(--mj-status-info-bg);
  border-radius: var(--mj-radius-md);
  font-size: var(--mj-text-sm);
  color: var(--mj-status-info-text);
}

.theme-hint i {
  color: var(--mj-status-info);
}

/* Planned Features */
.planned-features {
  padding-top: var(--mj-space-6);
  border-top: 1px solid var(--mj-border-subtle);
}

.features-title {
  font-size: var(--mj-text-xs);
  font-weight: var(--mj-font-semibold);
  text-transform: uppercase;
  letter-spacing: var(--mj-tracking-wide);
  color: var(--mj-text-muted);
  margin: 0 0 var(--mj-space-4) 0;
}

.features-grid {
  display: flex;
  flex-direction: column;
  gap: var(--mj-space-3);
}

.feature-card {
  display: flex;
  align-items: center;
  gap: var(--mj-space-4);
  padding: var(--mj-space-4);
  background: var(--mj-bg-surface);
  border: 1px solid var(--mj-border-subtle);
  border-radius: var(--mj-radius-lg);
  opacity: 0.6;
}

.feature-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  background: var(--mj-bg-surface-sunken);
  border-radius: var(--mj-radius-md);
  flex-shrink: 0;
}

.feature-icon i {
  font-size: var(--mj-text-base);
  color: var(--mj-text-muted);
}

.feature-info {
  display: flex;
  flex-direction: column;
}

.feature-title {
  font-weight: var(--mj-font-medium);
  color: var(--mj-text-primary);
}

.feature-desc {
  font-size: var(--mj-text-sm);
  color: var(--mj-text-secondary);
}

/* Mobile Responsive */
@media (max-width: 480px) {
  .theme-options {
    flex-direction: column;
  }

  .theme-option {
    flex-direction: row;
    text-align: left;
    min-width: unset;
    width: 100%;
  }

  .option-desc {
    display: none;
  }
}
```

### Enable Appearance Tab

**File:** `/packages/Angular/Explorer/explorer-settings/src/lib/settings/settings.component.ts`

Change line 80:
```typescript
// FROM:
disabled: true
// TO:
disabled: false
```

---

## Phase 4: Apply Tokens to Admin App

### File: `/packages/Angular/Explorer/dashboards/src/EntityAdmin/entity-admin-dashboard.component.css`

Replace the entire file with MJ token-based version:

```css
/**
 * Entity Admin Dashboard Component - MJ Design Token Styled
 * Reference implementation for MJ design token usage
 */

.entity-admin-dashboard-container {
  overflow: hidden;
  padding: var(--mj-space-2);
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--mj-bg-page);
}

/* Dashboard Header */
.dashboard-header {
  margin-bottom: var(--mj-space-4);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dashboard-header .header-info {
  flex: 1;
  display: flex;
  align-items: center;
}

/* Badge for Visible Entities Count */
.dashboard-header .visible-entities-count {
  display: inline-flex;
  align-items: center;
  padding: var(--mj-space-1-5) var(--mj-space-3);
  font-size: var(--mj-text-sm);
  font-weight: var(--mj-font-semibold);
  color: var(--mj-brand-on-accent);
  background: var(--mj-brand-accent-subtle);
  border-radius: var(--mj-radius-md);
  border: 1px solid var(--mj-border-default);
}

.dashboard-header .header-controls {
  display: flex;
  gap: var(--mj-space-2);
}

/* Control Buttons */
.dashboard-header .header-controls .control-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--mj-space-2);
  padding: var(--mj-space-2) var(--mj-space-4);
  font-size: var(--mj-text-sm);
  font-weight: var(--mj-font-medium);
  background: var(--mj-bg-surface);
  color: var(--mj-text-secondary);
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mj-radius-full);
  cursor: pointer;
  transition: var(--mj-transition-colors);
}

.dashboard-header .header-controls .control-btn:hover:not(:disabled) {
  background: var(--mj-bg-surface-hover);
  border-color: var(--mj-border-strong);
  color: var(--mj-text-primary);
}

.dashboard-header .header-controls .control-btn.active {
  background: var(--mj-brand-primary);
  border-color: var(--mj-brand-primary);
  color: var(--mj-brand-on-primary);
}

.dashboard-header .header-controls .control-btn:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.dashboard-header .header-controls .control-btn:disabled:hover {
  background: var(--mj-bg-surface);
  border-color: var(--mj-border-default);
}

.dashboard-header .header-controls .control-btn:focus-visible {
  outline: none;
  box-shadow: var(--mj-focus-ring);
}

.dashboard-header .header-controls .control-btn .fa-solid {
  font-size: var(--mj-text-sm);
}

/* Loading and Error Containers */
.loading-container,
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--mj-bg-surface-sunken);
  flex: 1;
  border-radius: var(--mj-radius-lg);
}

.loading-container p,
.error-container p {
  font-size: var(--mj-text-sm);
  color: var(--mj-text-secondary);
}

/* Error Message */
.error-message {
  color: var(--mj-status-error-text);
  font-weight: var(--mj-font-medium);
}

/* Dashboard Content */
.dashboard-content {
  overflow: hidden;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* Loading Spinner */
.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mj-space-4);
}

.loading-spinner {
  position: relative;
  width: 60px;
  height: 60px;
}

.spinner-ring {
  position: absolute;
  width: 100%;
  height: 100%;
  border: 3px solid transparent;
  border-radius: var(--mj-radius-full);
  animation: spin 1.5s linear infinite;
}

.spinner-ring:nth-child(1) {
  border-top-color: var(--mj-brand-primary);
  animation-delay: 0s;
}

.spinner-ring:nth-child(2) {
  border-top-color: var(--mj-brand-secondary);
  animation-delay: 0.3s;
  transform: scale(0.8);
}

.spinner-ring:nth-child(3) {
  border-top-color: var(--mj-brand-tertiary);
  animation-delay: 0.6s;
  transform: scale(0.6);
}

.loading-text {
  font-size: var(--mj-text-sm);
  color: var(--mj-text-secondary);
  font-weight: var(--mj-font-medium);
  text-align: center;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
```

---

## Phase 5: Update CLAUDE.md Files

### Add to `/CLAUDE.md` (after "## Angular Development Best Practices" section):

```markdown
## Design System & Theming

### Design Token System
MemberJunction uses a CSS variable-based design token system. **Always use semantic tokens instead of hardcoded values.**

**Token File:** `/packages/Angular/Explorer/explorer-app/src/lib/styles/_tokens.scss`

#### Token Categories

| Category | Examples | When to Use |
|----------|----------|-------------|
| Backgrounds | `--mj-bg-page`, `--mj-bg-surface`, `--mj-bg-surface-elevated` | All background colors |
| Text | `--mj-text-primary`, `--mj-text-secondary`, `--mj-text-muted` | All text colors |
| Borders | `--mj-border-default`, `--mj-border-subtle`, `--mj-border-focus` | All border colors |
| Brand | `--mj-brand-primary`, `--mj-brand-accent` | Primary actions, highlights |
| Status | `--mj-status-success-*`, `--mj-status-error-*` | Success, error, warning, info states |
| Spacing | `--mj-space-1` (4px) through `--mj-space-24` (96px) | Margins, padding, gaps |
| Typography | `--mj-text-sm`, `--mj-font-medium` | Font sizes, weights |
| Effects | `--mj-radius-md`, `--mj-shadow-lg`, `--mj-transition-base` | Border radius, shadows, animations |

#### Dark Mode
Dark mode is automatic when using semantic tokens. The system uses `[data-theme="dark"]` selector.

#### Example Usage
```css
/* ❌ BAD - Hardcoded values */
.card {
  background: #ffffff;
  color: #333333;
  border: 1px solid #e5e7eb;
  padding: 16px;
}

/* ✅ GOOD - Semantic tokens */
.card {
  background: var(--mj-bg-surface);
  color: var(--mj-text-primary);
  border: 1px solid var(--mj-border-default);
  padding: var(--mj-space-4);
}
```

**Reference Implementation:** `/packages/Angular/Explorer/dashboards/src/EntityAdmin/`
```

### Add to `/packages/Angular/CLAUDE.md` (new section after "## Icon Libraries"):

```markdown
## Design Token Usage

### Required: Use MJ Semantic Tokens
All components MUST use MJ design tokens. Never hardcode colors, spacing, or effects.

### Quick Reference

```css
/* Backgrounds */
--mj-bg-page              /* Page background */
--mj-bg-surface           /* Card/panel backgrounds */
--mj-bg-surface-hover     /* Hover states */
--mj-bg-surface-elevated  /* Floating panels, dropdowns */
--mj-bg-surface-sunken    /* Inset areas */

/* Text */
--mj-text-primary         /* Main content */
--mj-text-secondary       /* Supporting text */
--mj-text-muted           /* De-emphasized text */
--mj-text-link            /* Links */

/* Borders */
--mj-border-default       /* Standard borders */
--mj-border-subtle        /* Light borders */
--mj-border-strong        /* Emphasized borders */
--mj-border-focus         /* Focus rings */

/* Brand */
--mj-brand-primary        /* Primary actions */
--mj-brand-accent         /* Highlights, badges */
--mj-brand-on-primary     /* Text on primary background */

/* Status */
--mj-status-success-*     /* -bg, -text, -border */
--mj-status-error-*
--mj-status-warning-*
--mj-status-info-*

/* Spacing (4px base) */
--mj-space-1 (4px) through --mj-space-24 (96px)

/* Typography */
--mj-text-xs through --mj-text-4xl
--mj-font-normal, --mj-font-medium, --mj-font-semibold, --mj-font-bold

/* Effects */
--mj-radius-sm (4px) through --mj-radius-full
--mj-shadow-sm through --mj-shadow-2xl
--mj-transition-fast (150ms), --mj-transition-base (200ms), --mj-transition-slow (300ms)
```

### Theme Service
The `ThemeService` manages light/dark/system theme preferences:

```typescript
import { ThemeService } from '@memberjunction/ng-explorer-shared';

constructor(private themeService: ThemeService) {}

// Get current theme
const theme = this.themeService.AppliedTheme; // 'light' | 'dark'

// Subscribe to changes
this.themeService.AppliedTheme$.subscribe(theme => {
  console.log('Theme changed:', theme);
});

// Set theme (persists to user settings)
await this.themeService.SetTheme('dark'); // 'light' | 'dark' | 'system'
```
```

---

## Phase 6: Testing

### Build Verification
```bash
# Build in order (dependencies first)
cd /Users/matt/repos/MJ/packages/Angular/Explorer/shared && npm run build
cd /Users/matt/repos/MJ/packages/Angular/Explorer/workspace-initializer && npm run build
cd /Users/matt/repos/MJ/packages/Angular/Explorer/explorer-settings && npm run build
cd /Users/matt/repos/MJ/packages/Angular/Explorer/dashboards && npm run build
cd /Users/matt/repos/MJ/packages/Angular/Explorer/explorer-app && npm run build
```

### Manual Testing Checklist

#### Theme Switching
- [ ] Default theme is 'system' for new users
- [ ] Light mode: white backgrounds, dark text
- [ ] Dark mode: dark backgrounds, light text
- [ ] System mode follows OS preference
- [ ] Changing OS preference updates theme in real-time (when in system mode)
- [ ] Theme persists after browser refresh
- [ ] No flash of wrong theme on page load

#### Appearance Settings
- [ ] Tab is enabled and accessible
- [ ] Three theme options visible: Light, Dark, System
- [ ] Selected option is visually highlighted
- [ ] Clicking option changes theme immediately
- [ ] System mode shows hint about current applied theme

#### Admin App (Entity Admin Dashboard)
- [ ] All backgrounds use correct tokens (no white flash in dark mode)
- [ ] Text is readable in both themes
- [ ] Control buttons have proper hover/active states
- [ ] Loading spinner uses brand colors
- [ ] Error states use error tokens

---

## Files Summary

### Create (1 file)
| File | Purpose |
|------|---------|
| `/packages/Angular/Explorer/shared/src/lib/theme.service.ts` | Theme management service |

### Modify (9 files)
| File | Changes |
|------|---------|
| `/packages/Angular/Explorer/shared/src/public-api.ts` | Add ThemeService export |
| `/packages/Angular/Explorer/workspace-initializer/src/lib/services/workspace-initializer.service.ts` | Initialize ThemeService |
| `/packages/Angular/Explorer/explorer-settings/src/lib/appearance-settings/appearance-settings.component.ts` | Full implementation |
| `/packages/Angular/Explorer/explorer-settings/src/lib/appearance-settings/appearance-settings.component.html` | Theme selector UI |
| `/packages/Angular/Explorer/explorer-settings/src/lib/appearance-settings/appearance-settings.component.css` | Token-based styles |
| `/packages/Angular/Explorer/explorer-settings/src/lib/settings/settings.component.ts` | Enable appearance tab |
| `/packages/Angular/Explorer/dashboards/src/EntityAdmin/entity-admin-dashboard.component.css` | Convert to MJ tokens |
| `/CLAUDE.md` | Add design system section |
| `/packages/Angular/CLAUDE.md` | Add token usage section |

---

## Implementation Order

1. **ThemeService** - Create the core service
2. **Export ThemeService** - Add to public-api.ts
3. **Initialize ThemeService** - Wire into workspace initializer
4. **Appearance Settings** - Build the UI (TS, HTML, CSS)
5. **Enable Tab** - Change disabled: true to false
6. **Admin App Tokens** - Convert CSS to MJ tokens
7. **Documentation** - Update both CLAUDE.md files
8. **Testing** - Build and manual verification
