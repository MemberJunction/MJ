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
        this.setupSystemThemeListener();

        // Load saved preference
        const savedPreference = await this.loadSetting();
        this._preference$.next(savedPreference);

        // Apply the theme
        const resolvedTheme = this.resolveTheme(savedPreference);
        this.applyTheme(resolvedTheme);

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

        const resolvedTheme = this.resolveTheme(preference);
        this.applyTheme(resolvedTheme);

        await this.saveSetting(preference);
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
    private applyTheme(theme: AppliedTheme): void {
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
    private resolveTheme(preference: ThemePreference): AppliedTheme {
        if (preference === 'system') {
            return this.getSystemTheme();
        }
        return preference;
    }

    /**
     * Get system theme preference from OS
     */
    private getSystemTheme(): AppliedTheme {
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
    private onSystemThemeChange(): void {
        if (this._preference$.value === 'system') {
            const newTheme = this.getSystemTheme();
            this.applyTheme(newTheme);
        }
    }

    /**
     * Load theme preference from User Settings
     */
    private async loadSetting(): Promise<ThemePreference> {
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
    private async saveSetting(preference: ThemePreference): Promise<void> {
        try {
            const engine = UserInfoEngine.Instance;
            await engine.SetSetting(THEME_SETTING_KEY, preference);
        } catch (error) {
            console.warn('Failed to save theme setting:', error);
        }
    }
}
