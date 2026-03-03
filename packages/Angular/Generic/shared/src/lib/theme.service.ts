import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { UserInfoEngine } from '@memberjunction/core-entities';

/**
 * Defines a theme available in the application.
 * Built-in themes (light/dark) have no CssUrl.
 * Custom themes specify a BaseTheme to inherit from and a CssUrl with overrides.
 */
export interface ThemeDefinition {
    /** Unique identifier (e.g. 'light', 'dark', 'izzy-dark') */
    Id: string;
    /** Human-readable display name (e.g. 'Light', 'Dark', 'Izzy Dark') */
    Name: string;
    /** Which built-in theme this inherits from */
    BaseTheme: 'light' | 'dark';
    /** URL to the CSS file with token overrides (omit for built-in themes) */
    CssUrl?: string;
    /** Whether this is a built-in theme (light/dark) */
    IsBuiltIn: boolean;
    /** Optional description shown in theme picker */
    Description?: string;
    /** Optional preview swatch colors for a future theme picker UI */
    PreviewColors?: string[];
}

/**
 * Setting key for theme preference in MJ: User Settings entity
 */
const THEME_SETTING_KEY = 'Explorer.Theme';

/**
 * Built-in light theme definition
 */
const LIGHT_THEME: ThemeDefinition = {
    Id: 'light',
    Name: 'Light',
    BaseTheme: 'light',
    IsBuiltIn: true,
    Description: 'Default light theme'
};

/**
 * Built-in dark theme definition
 */
const DARK_THEME: ThemeDefinition = {
    Id: 'dark',
    Name: 'Dark',
    BaseTheme: 'dark',
    IsBuiltIn: true,
    Description: 'Default dark theme'
};

/**
 * Service to manage application themes with pluggable custom theme support.
 *
 * Built-in themes (light/dark) work identically to before. Custom themes
 * inherit from a base theme and overlay additional CSS token overrides via
 * a dynamically loaded stylesheet.
 *
 * CSS resolution for custom themes (e.g. "Izzy Dark" extending dark):
 * 1. `:root` light defaults (from _tokens.scss in this package)
 * 2. `[data-theme="dark"]` dark overrides (from _tokens.scss in this package)
 * 3. `[data-theme-overlay="izzy-dark"]` custom overrides (loaded dynamically)
 *
 * Follows the DeveloperModeService pattern:
 * - Settings persisted via UserInfoEngine
 * - BehaviorSubject for reactive state
 * - Initialize after login, Reset on logout
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
    private _preference$ = new BehaviorSubject<string>('system');
    private _appliedTheme$ = new BehaviorSubject<string>('light');
    private _initialized = false;
    private systemMediaQuery: MediaQueryList | null = null;
    private boundSystemThemeHandler: (() => void) | null = null;

    /** Registry of available themes, seeded with built-in light and dark */
    private themeRegistry = new Map<string, ThemeDefinition>([
        ['light', LIGHT_THEME],
        ['dark', DARK_THEME]
    ]);

    /** Cache of loaded <link> elements by theme ID to avoid re-downloading */
    private loadedCssLinks = new Map<string, HTMLLinkElement>();

    /**
     * Observable for user's theme preference (theme ID or 'system')
     */
    public get Preference$(): Observable<string> {
        return this._preference$.asObservable();
    }

    /**
     * Observable for the actually applied theme (resolved theme ID)
     */
    public get AppliedTheme$(): Observable<string> {
        return this._appliedTheme$.asObservable();
    }

    /**
     * Current theme preference (synchronous access)
     */
    public get Preference(): string {
        return this._preference$.value;
    }

    /**
     * Currently applied theme ID (synchronous access)
     */
    public get AppliedTheme(): string {
        return this._appliedTheme$.value;
    }

    /**
     * Whether the service has been initialized
     */
    public get IsInitialized(): boolean {
        return this._initialized;
    }

    /**
     * All registered themes, for UI consumption (e.g. theme picker menus)
     */
    public get AvailableThemes(): ThemeDefinition[] {
        return Array.from(this.themeRegistry.values());
    }

    /**
     * Look up a theme definition by ID.
     * Returns undefined if the theme ID is not registered.
     */
    public GetThemeDefinition(id: string): ThemeDefinition | undefined {
        return this.themeRegistry.get(id);
    }

    // ========================================
    // THEME REGISTRATION
    // ========================================

    /**
     * Register a custom theme. If a theme with the same ID already exists,
     * it is replaced (allowing override of built-in themes if desired).
     */
    public RegisterTheme(theme: ThemeDefinition): void {
        this.themeRegistry.set(theme.Id, theme);
    }

    /**
     * Register multiple custom themes at once.
     */
    public RegisterThemes(themes: ThemeDefinition[]): void {
        for (const theme of themes) {
            this.RegisterTheme(theme);
        }
    }

    // ========================================
    // LIFECYCLE
    // ========================================

    /**
     * Initialize the theme service.
     * Call after login when UserInfoEngine is available.
     */
    public async Initialize(): Promise<void> {
        if (this._initialized) {
            return;
        }

        this.setupSystemThemeListener();

        const savedPreference = await this.loadSetting();
        this._preference$.next(savedPreference);

        const resolvedThemeId = this.resolveTheme(savedPreference);
        await this.applyTheme(resolvedThemeId);

        this._initialized = true;
    }

    /**
     * Set the theme preference and apply it.
     * @param preference - A registered theme ID or 'system'
     */
    public async SetTheme(preference: string): Promise<void> {
        if (preference === this._preference$.value) {
            return;
        }

        this._preference$.next(preference);

        const resolvedThemeId = this.resolveTheme(preference);
        await this.applyTheme(resolvedThemeId);

        await this.saveSetting(preference);
    }

    /**
     * Reset the service (call on logout)
     */
    public Reset(): void {
        if (this.systemMediaQuery && this.boundSystemThemeHandler) {
            this.systemMediaQuery.removeEventListener('change', this.boundSystemThemeHandler);
        }
        this.systemMediaQuery = null;
        this.boundSystemThemeHandler = null;

        this._preference$.next('system');
        this._appliedTheme$.next('light');
        this._initialized = false;

        // Remove theme attributes
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.removeAttribute('data-theme-overlay');

        // Disable all custom CSS links
        this.disableAllCustomCss();
    }

    // ========================================
    // THEME APPLICATION
    // ========================================

    /**
     * Apply a resolved theme ID to the DOM.
     * Sets `data-theme` based on BaseTheme and `data-theme-overlay` for custom themes.
     * Loads custom CSS if needed, disables previous custom CSS.
     */
    private async applyTheme(themeId: string): Promise<void> {
        const themeDef = this.themeRegistry.get(themeId);

        // Fall back to 'light' if the theme ID isn't recognized
        if (!themeDef) {
            this.applyBuiltInTheme('light');
            this._appliedTheme$.next('light');
            return;
        }

        // Set the base theme attribute (drives existing [data-theme="dark"] selectors)
        this.applyBaseThemeAttribute(themeDef.BaseTheme);

        if (themeDef.IsBuiltIn) {
            // Built-in theme: remove overlay, disable custom CSS
            document.documentElement.removeAttribute('data-theme-overlay');
            this.disableAllCustomCss();
        } else if (themeDef.CssUrl) {
            // Custom theme: load/enable CSS and set overlay attribute
            await this.loadThemeCss(themeDef);
            document.documentElement.setAttribute('data-theme-overlay', themeDef.Id);
        }

        this._appliedTheme$.next(themeId);
    }

    /**
     * Apply the base theme attribute to <html>.
     * 'dark' sets data-theme="dark"; 'light' removes it (matching existing convention).
     */
    private applyBaseThemeAttribute(baseTheme: 'light' | 'dark'): void {
        if (baseTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    }

    /**
     * Shorthand for built-in theme application (no custom CSS)
     */
    private applyBuiltInTheme(baseTheme: 'light' | 'dark'): void {
        this.applyBaseThemeAttribute(baseTheme);
        document.documentElement.removeAttribute('data-theme-overlay');
        this.disableAllCustomCss();
    }

    // ========================================
    // DYNAMIC CSS LOADING
    // ========================================

    /**
     * Load (or re-enable) a custom theme's CSS file.
     * Injects a <link> element into <head> with a data-mj-theme attribute.
     * Caches the link element to avoid re-downloading on theme switches.
     * Returns a Promise that resolves once the stylesheet is loaded.
     */
    private loadThemeCss(theme: ThemeDefinition): Promise<void> {
        if (!theme.CssUrl) {
            return Promise.resolve();
        }

        // Disable all other custom CSS first
        this.disableAllCustomCss();

        // Check cache — if already loaded, just re-enable
        const existingLink = this.loadedCssLinks.get(theme.Id);
        if (existingLink) {
            existingLink.disabled = false;
            return Promise.resolve();
        }

        // Create and inject new <link> element
        return new Promise<void>((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = theme.CssUrl!;
            link.setAttribute('data-mj-theme', theme.Id);

            link.onload = () => resolve();
            link.onerror = () => {
                console.warn(`Failed to load theme CSS: ${theme.CssUrl}`);
                // Still resolve so the theme switch isn't blocked
                resolve();
            };

            document.head.appendChild(link);
            this.loadedCssLinks.set(theme.Id, link);
        });
    }

    /**
     * Disable (not remove) all custom theme CSS <link> elements.
     * Disabling rather than removing avoids re-downloading when switching back.
     */
    private disableAllCustomCss(): void {
        for (const link of this.loadedCssLinks.values()) {
            link.disabled = true;
        }
    }

    // ========================================
    // THEME RESOLUTION
    // ========================================

    /**
     * Resolve a preference string to an actual theme ID.
     * 'system' resolves to 'light' or 'dark' based on OS preference.
     * Unrecognized IDs fall back to 'light'.
     */
    private resolveTheme(preference: string): string {
        if (preference === 'system') {
            return this.getSystemTheme();
        }

        // If the preference is a registered theme, use it directly
        if (this.themeRegistry.has(preference)) {
            return preference;
        }

        // Unrecognized theme ID — fall back to light
        return 'light';
    }

    /**
     * Get system theme preference from OS
     */
    private getSystemTheme(): 'light' | 'dark' {
        if (typeof window === 'undefined') {
            return 'light';
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    /**
     * Setup listener for system theme changes
     */
    private setupSystemThemeListener(): void {
        if (typeof window === 'undefined') {
            return;
        }

        this.systemMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        this.boundSystemThemeHandler = () => this.onSystemThemeChange();
        this.systemMediaQuery.addEventListener('change', this.boundSystemThemeHandler);
    }

    /**
     * Handle system theme change (only applies if in 'system' mode)
     */
    private async onSystemThemeChange(): Promise<void> {
        if (this._preference$.value === 'system') {
            const newThemeId = this.getSystemTheme();
            await this.applyTheme(newThemeId);
        }
    }

    // ========================================
    // PERSISTENCE
    // ========================================

    /**
     * Load theme preference from User Settings.
     * Accepts any registered theme ID or 'system'.
     * Falls back to 'system' if saved value is not recognized.
     */
    private async loadSetting(): Promise<string> {
        try {
            const engine = UserInfoEngine.Instance;
            const settingValue = engine.GetSetting(THEME_SETTING_KEY);

            if (!settingValue) {
                return 'system';
            }

            // Accept 'system' or any registered theme ID
            if (settingValue === 'system' || this.themeRegistry.has(settingValue)) {
                return settingValue;
            }

            // Saved theme no longer registered — fall back
            return 'system';
        } catch (error) {
            console.warn('Failed to load theme setting:', error);
            return 'system';
        }
    }

    /**
     * Save theme preference to User Settings
     */
    private async saveSetting(preference: string): Promise<void> {
        try {
            const engine = UserInfoEngine.Instance;
            await engine.SetSetting(THEME_SETTING_KEY, preference);
        } catch (error) {
            console.warn('Failed to save theme setting:', error);
        }
    }
}
