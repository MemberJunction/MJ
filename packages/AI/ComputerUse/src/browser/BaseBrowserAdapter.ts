/**
 * Abstract base class for browser adapters.
 *
 * Defines the contract that all browser implementations must satisfy.
 * The ComputerUseEngine operates exclusively through this interface,
 * never touching Playwright (or any other browser library) directly.
 *
 * This is the Strategy pattern: inject your preferred browser
 * implementation at construction time. The default is
 * PlaywrightBrowserAdapter, but consumers can provide their own
 * (Selenium, Puppeteer, remote browser services, etc.).
 *
 * No browser-specific imports here — only our own types.
 */

import {
    BrowserAction,
    BrowserConfig,
    ActionExecutionResult,
    CookieEntry,
} from '../types/browser.js';

export abstract class BaseBrowserAdapter {
    // ─── Lifecycle ─────────────────────────────────────────

    /**
     * Launch the browser with the given configuration.
     * Must be called before any other method.
     */
    public abstract Launch(config: BrowserConfig): Promise<void>;

    /**
     * Close the browser and release all resources.
     * Safe to call multiple times — subsequent calls are no-ops.
     */
    public abstract Close(): Promise<void>;

    // ─── Navigation ────────────────────────────────────────

    /**
     * Navigate to the given URL and wait for the page to load.
     * Respects the NavigationTimeoutMs from BrowserConfig.
     */
    public abstract Navigate(url: string): Promise<void>;

    // ─── Screenshot ────────────────────────────────────────

    /**
     * Capture a screenshot of the current viewport.
     * @returns Base64-encoded PNG string (no data URI prefix)
     */
    public abstract CaptureScreenshot(): Promise<string>;

    // ─── Action Execution ──────────────────────────────────

    /**
     * Execute a single browser action.
     * The action is a discriminated union — implementations should
     * switch on `action.Type` for exhaustive handling.
     */
    public abstract ExecuteAction(action: BrowserAction): Promise<ActionExecutionResult>;

    // ─── Auth Support ──────────────────────────────────────

    /**
     * Set extra HTTP headers for all requests to a specific domain.
     * Used by AuthHandler for Bearer, APIKey, and Basic auth.
     *
     * Headers are additive — calling this multiple times for the same
     * domain merges headers. Calling with a different domain adds
     * a new set of domain-scoped headers.
     *
     * Implementation note: Playwright uses page.route() interception;
     * other adapters may use their own request interception mechanism.
     */
    public abstract SetExtraHeaders(
        domain: string,
        headers: Record<string, string>
    ): Promise<void>;

    /**
     * Add cookies to the browser context.
     * Used by AuthHandler for CookieInjection auth.
     */
    public abstract SetCookies(cookies: CookieEntry[]): Promise<void>;

    /**
     * Set localStorage entries for a specific domain.
     * The browser must have already navigated to the domain
     * (or a page on that domain) for this to work.
     *
     * Used by AuthHandler for LocalStorage auth.
     */
    public abstract SetLocalStorage(
        domain: string,
        entries: Record<string, string>
    ): Promise<void>;

    // ─── State ─────────────────────────────────────────────

    /** Current URL of the browser page */
    public abstract get CurrentUrl(): string;

    /** Whether the browser is launched and connected */
    public abstract get IsOpen(): boolean;

    /** Current viewport dimensions */
    public abstract get ViewportWidth(): number;
    public abstract get ViewportHeight(): number;

    // ─── Utilities ─────────────────────────────────────────

    /**
     * Extract the domain (hostname) from a URL string.
     * Shared utility available to all adapter implementations.
     */
    protected ExtractDomain(url: string): string {
        try {
            return new URL(url).hostname;
        } catch {
            return url;
        }
    }
}
