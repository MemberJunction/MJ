import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { derive, DerivedTheme, emitLogoOverlayCss, emitOverlayCss, ThemeLogos, ThemeSeeds } from '@memberjunction/theme-engine';

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
    /**
     * Derived --mj-* token overrides. Populated for brand themes emitted
     * from seeds; an alternative/companion to CssUrl for token-based application and
     * for feeding the Theme Builder preview without a round-trip through CSS.
     */
    Tokens?: Record<string, string>;
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
 * localStorage key the inline theme-preload script reads on first paint
 * (before Angular boots) to apply the correct theme without flashing.
 *
 * The value is the **base theme** ('dark' or 'light'), NOT the full theme
 * preference (which can be 'system' or a custom theme ID like 'izzy-dark').
 * The preload script needs an unambiguous answer: should I set
 * data-theme="dark" or not? Storing the base theme is the simplest
 * contract: the script does `if (value === 'dark') setAttribute(...)`.
 *
 * Mirrored by ThemeService whenever the applied base theme changes,
 * cleared on logout via Reset().
 */
const PRELOAD_BASE_THEME_KEY = 'mj-theme';

/**
 * localStorage key holding the active org **brand overlay** id, mirrored so the
 * inline pre-paint script can restore `data-theme-overlay` on first paint (the org
 * brand persists across the user's light/dark choice AND across logout). The overlay
 * CSS itself is a session-scoped Blob re-emitted at login bootstrap, so this key only
 * restores the attribute — brand colors repaint once bootstrap re-injects the CSS.
 */
const PRELOAD_OVERLAY_KEY = 'mj-theme-overlay';

/** User-settings key: JSON array of the user's starred (favorited) brand theme ids. */
const STARRED_THEMES_KEY = 'Explorer.StarredThemes';

/** User-settings key: the brand theme id the user last applied (restored over org default). */
const SELECTED_BRAND_KEY = 'Explorer.SelectedBrandTheme';

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
    /**
     * The active org brand overlay id, applied independently of the user's light/dark
     * choice and preserved across Reset()/logout.
     */
    private _brandOverlayId: string | null = null;
    /** The user's starred (favorited) brand theme ids, reactive for menus/badges. */
    private _starred$ = new BehaviorSubject<string[]>([]);
    /** Emits when the set of saved themes changes (create/rename/delete/duplicate/default)
     *  so open dashboards (Theme Studio, Manage Themes) refresh without a page reload. */
    private _themesChanged$ = new Subject<void>();
    private _initialized = false;
    private systemMediaQuery: MediaQueryList | null = null;
    private boundSystemThemeHandler: (() => void) | null = null;

    /** Registry of USER-SELECTABLE themes (shown in the theme picker), seeded with light + dark. */
    private themeRegistry = new Map<string, ThemeDefinition>([
        ['light', LIGHT_THEME],
        ['dark', DARK_THEME]
    ]);

    /**
     * Registry of ORG BRAND overlays (from RegisterBrandTheme). Kept separate from
     * themeRegistry so brand overlays do NOT appear in the user's light/dark theme
     * picker — the org brand is applied independently of the user's mode (decision #1).
     */
    private brandRegistry = new Map<string, ThemeDefinition>();

    /** Cache of loaded <link> elements by theme ID to avoid re-downloading */
    private loadedCssLinks = new Map<string, HTMLLinkElement>();

    /** Session-scoped Blob object URLs for brand overlays, keyed by theme ID (for revocation on re-register). */
    private brandBlobUrls = new Map<string, string>();

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

    /**
     * Register a brand theme from its seeds.
     *
     * Derives the full --mj-* token contract with @memberjunction/theme-engine, emits
     * the `[data-theme-overlay="<id>"]` CSS, and publishes it as a session-scoped Blob
     * URL that plugs into the existing CssUrl overlay path — so brand themes apply
     * through the same machinery as file-based custom themes. Returns the derived
     * theme so callers can surface the a11y contrast report / previews.
     *
     * The emitted overlay overrides only the primitive ramps (plus viz/shadow/font/
     * radius); every semantic token and the `[data-theme="dark"]` block reference those
     * primitives, so both light and dark re-point automatically off one block.
     *
     * @param params.seeds ThemeSeeds object or the entity's Seeds JSON string.
     */
    public RegisterBrandTheme(params: {
        id: string;
        name: string;
        seeds: ThemeSeeds | string;
        description?: string;
        baseTheme?: 'light' | 'dark';
        /** Optional logo variant URLs + geometry, emitted as --mj-logo-*. */
        logos?: ThemeLogos;
        /** Advanced: per-token overrides (JSON map or object) merged over the derived vars. */
        overrides?: Record<string, string> | string | null;
        /** Advanced: raw CSS appended to the overlay, auto-scoped to this theme. */
        customCss?: string | null;
    }): DerivedTheme {
        const seeds = typeof params.seeds === 'string' ? (JSON.parse(params.seeds) as ThemeSeeds) : params.seeds;
        const derived = derive(seeds);
        const overrides = this.parseOverrides(params.overrides);
        // One Blob carries the whole brand: color/shape/font overlay (+ advanced layer) + logo tokens.
        const css = emitOverlayCss(params.id, derived, { overrides, customCss: params.customCss })
            + (params.logos ? emitLogoOverlayCss(params.id, params.logos) : '');

        // Replace any prior Blob URL + cached <link> for this id so a re-registration
        // (e.g. live preview) loads the new CSS instead of re-enabling stale bytes.
        const priorUrl = this.brandBlobUrls.get(params.id);
        if (priorUrl) {
            URL.revokeObjectURL(priorUrl);
        }
        const cachedLink = this.loadedCssLinks.get(params.id);
        if (cachedLink) {
            cachedLink.remove();
            this.loadedCssLinks.delete(params.id);
        }

        const url = URL.createObjectURL(new Blob([css], { type: 'text/css' }));
        this.brandBlobUrls.set(params.id, url);

        // Register into the brand registry only — NOT themeRegistry — so the org brand
        // does not surface as a user-selectable option in the theme picker.
        this.brandRegistry.set(params.id, {
            Id: params.id,
            Name: params.name,
            BaseTheme: params.baseTheme ?? 'light',
            CssUrl: url,
            Tokens: derived.overlayVars,
            IsBuiltIn: false,
            Description: params.description,
            PreviewColors: [
                derived.tokens.light['--mj-brand-primary'],
                derived.tokens.light['--mj-brand-accent'],
                derived.tokens.light['--mj-brand-tertiary'],
            ],
        });

        return derived;
    }

    /** Normalize the advanced overrides input (JSON string, object, or null) to a token map. */
    private parseOverrides(input?: Record<string, string> | string | null): Record<string, string> | undefined {
        if (!input) return undefined;
        if (typeof input === 'string') {
            try {
                const parsed = JSON.parse(input);
                return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : undefined;
            } catch {
                return undefined;
            }
        }
        return input;
    }

    /**
     * The active org brand overlay id, or null if none is applied.
     */
    public get BrandOverlayId(): string | null {
        return this._brandOverlayId;
    }

    /**
     * Apply an org brand overlay **independently of the user's light/dark mode.
     * The overlay layers under whatever base theme is
     * active and is re-asserted whenever the user toggles light/dark. Persists the id
     * to localStorage so the pre-paint script restores the attribute on next load.
     *
     * @param id id of a brand theme registered via {@link RegisterBrandTheme}.
     * @param options.persist pass `false` for session-only overlays backed by Blob URLs
     * (e.g. Theme Studio's draft workspace preview) — a Blob URL doesn't survive a
     * reload, so persisting its id would leave the pre-paint script pointing at a
     * dangling overlay and clobber the user's real persisted selection. Defaults true.
     */
    public async ApplyBrandOverlay(id: string, options?: { persist?: boolean }): Promise<void> {
        const def = this.brandRegistry.get(id);
        if (!def || !def.CssUrl) {
            console.warn(`ApplyBrandOverlay: no registered brand theme "${id}" with CSS.`);
            return;
        }
        this._brandOverlayId = id;
        await this.loadThemeCss(def);
        document.documentElement.setAttribute('data-theme-overlay', id);
        if (options?.persist === false) {
            return;
        }
        try {
            window.localStorage.setItem(PRELOAD_OVERLAY_KEY, id);
        } catch (e) {
            // non-fatal: a brief brand flash on next reload at worst
        }
    }

    /**
     * Remove the active org brand overlay (revert to the base MJ tokens).
     */
    public ClearBrandOverlay(): void {
        this._brandOverlayId = null;
        document.documentElement.removeAttribute('data-theme-overlay');
        this.disableAllCustomCss();
        try {
            window.localStorage.removeItem(PRELOAD_OVERLAY_KEY);
        } catch (e) {
            // non-fatal
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

        this._starred$.next(this.loadStarredIds());

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

        // Remove the base-theme attribute only. We deliberately KEEP the org brand
        // overlay (data-theme-overlay + its CSS + _brandOverlayId) so the brand
        // survives logout and stays on the login screen.
        // The overlay is re-emitted at the next login bootstrap.
        document.documentElement.removeAttribute('data-theme');

        // NOTE: we deliberately do NOT clear PRELOAD_BASE_THEME_KEY here.
        // The unified theme key ('mj-theme') is the single source of truth
        // shared with the login-screen toggle and the inline pre-paint script.
        // Clearing it on logout would force the login screen back to OS
        // default and cause a theme flash for the post-logout/pre-login
        // window. The auth provider's clearClientCaches() preserves it for
        // exactly this reason (see preservedLocalStorageKeys).

        // Disable custom CSS links EXCEPT the active org brand overlay, which must
        // survive logout so the brand persists on the login screen.
        this.disableAllCustomCss(this._brandOverlayId);
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
            // Built-in (light/dark): the user's mode changes, but the org brand overlay
            // stays layered under it. Re-assert the brand overlay if one is active;
            // otherwise clear any overlay.
            if (this._brandOverlayId) {
                const brandDef = this.brandRegistry.get(this._brandOverlayId);
                if (brandDef?.CssUrl) {
                    await this.loadThemeCss(brandDef);
                    document.documentElement.setAttribute('data-theme-overlay', this._brandOverlayId);
                } else {
                    document.documentElement.removeAttribute('data-theme-overlay');
                    this.disableAllCustomCss();
                }
            } else {
                document.documentElement.removeAttribute('data-theme-overlay');
                this.disableAllCustomCss();
            }
        } else if (themeDef.CssUrl) {
            // Explicit custom theme selected — its overlay overrides any brand overlay.
            await this.loadThemeCss(themeDef);
            document.documentElement.setAttribute('data-theme-overlay', themeDef.Id);
        }

        this._appliedTheme$.next(themeId);
    }

    /**
     * Apply the base theme attribute to <html>.
     * 'dark' sets data-theme="dark"; 'light' removes it (matching existing convention).
     *
     * Also mirrors the base theme to localStorage under PRELOAD_BASE_THEME_KEY
     * so the inline pre-bootstrap theme-preload script in index.html can apply
     * the correct theme on first paint of the next page load — eliminating
     * the brief light-mode flash dark-mode users would otherwise see.
     */
    private applyBaseThemeAttribute(baseTheme: 'light' | 'dark'): void {
        if (baseTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        try {
            window.localStorage.setItem(PRELOAD_BASE_THEME_KEY, baseTheme);
        } catch (e) {
            // localStorage exceptions (private mode, quota) are non-fatal here —
            // the app still works, the user just may see a brief theme flash on
            // their next reload.
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
     * Disable (not remove) custom theme CSS <link> elements.
     * Disabling rather than removing avoids re-downloading when switching back.
     * @param keepId optional theme id to leave enabled (e.g. the active brand overlay).
     */
    private disableAllCustomCss(keepId?: string | null): void {
        for (const [id, link] of this.loadedCssLinks.entries()) {
            if (keepId && id === keepId) {
                continue;
            }
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
    // STARRED (FAVORITE) BRAND THEMES
    // ========================================

    /** Reactive list of the user's starred brand theme ids. */
    public get Starred$(): Observable<string[]> {
        return this._starred$.asObservable();
    }

    /** Emits after any saved-theme mutation so open dashboards can refresh their lists. */
    public get ThemesChanged$(): Observable<void> {
        return this._themesChanged$.asObservable();
    }

    /** Broadcast that the set of saved themes changed (create/rename/delete/duplicate/default). */
    public NotifyThemesChanged(): void {
        this._themesChanged$.next();
    }

    /** The user's starred brand theme ids (synchronous). */
    public GetStarredThemeIds(): string[] {
        return this._starred$.value;
    }

    /** Whether a theme id is starred by the user. */
    public IsStarred(id: string): boolean {
        return this._starred$.value.includes(id);
    }

    /**
     * Toggle a theme's starred state and persist to User Settings.
     * @returns the new starred state (true = now starred).
     */
    public async ToggleStar(id: string): Promise<boolean> {
        const set = new Set(this._starred$.value);
        const nowStarred = !set.has(id);
        if (nowStarred) {
            set.add(id);
        } else {
            set.delete(id);
        }
        const ids = Array.from(set);
        this._starred$.next(ids);
        try {
            await UserInfoEngine.Instance.SetSetting(STARRED_THEMES_KEY, JSON.stringify(ids));
        } catch (error) {
            console.warn('Failed to save starred themes:', error);
        }
        return nowStarred;
    }

    private loadStarredIds(): string[] {
        try {
            const raw = UserInfoEngine.Instance.GetSetting(STARRED_THEMES_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
        } catch {
            return [];
        }
    }

    /** The brand theme the user last applied (or null to follow the org default). */
    public GetSelectedBrandThemeId(): string | null {
        try {
            return UserInfoEngine.Instance.GetSetting(SELECTED_BRAND_KEY) || null;
        } catch {
            return null;
        }
    }

    /** Persist (or clear, with null) the user's chosen brand theme so login restores it. */
    public async SetSelectedBrandTheme(id: string | null): Promise<void> {
        try {
            await UserInfoEngine.Instance.SetSetting(SELECTED_BRAND_KEY, id ?? '');
        } catch (error) {
            console.warn('Failed to save selected brand theme:', error);
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
