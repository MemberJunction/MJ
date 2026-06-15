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
    ScreencastFrame,
    ScreencastOptions,
    AccessibilityNode,
    ElementInfo,
} from '../types/browser.js';

/**
 * Diagnostic event captured from the browser (console messages, network
 * failures, page errors). Adapters that capture diagnostics push
 * events into an internal buffer and expose them via GetDiagnostics().
 */
export interface BrowserDiagnosticEvent {
    timestamp: string;
    type: 'console' | 'pageerror' | 'requestfailed' | 'crash';
    level?: string;
    message: string;
    url?: string;
}

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

    // ─── Perception ────────────────────────────────────────

    /**
     * Read the visible text of the current page for agent perception.
     *
     * Returns the rendered (visible) text content of the page body — useful
     * for an LLM controller that needs the page's textual state without a
     * screenshot. Adapters backed by a live page (e.g. Playwright) override
     * this to return the real page text.
     *
     * Default implementation returns an empty string so adapters that cannot
     * read page text don't break — it's a non-throwing, additive default.
     *
     * @returns The page's visible text, or '' if unavailable.
     */
    public async GetVisibleText(): Promise<string> {
        // No-op default — adapters with a live page override this.
        return '';
    }

    /**
     * Capture the current page's title for cheap perception / sync.
     *
     * Default implementation returns an empty string so adapters without a live
     * page don't break — it's a non-throwing, additive default. Adapters backed
     * by a real page (e.g. Playwright) override this to return the page title.
     *
     * @returns The page title, or '' when unavailable.
     */
    public async GetTitle(): Promise<string> {
        // No-op default — adapters with a live page override this.
        return '';
    }

    /**
     * Wait until the page reaches a given load state.
     *
     * Useful after a navigation/action to let the page settle before the next
     * perception step. Default implementation is a no-op resolve so adapters
     * that cannot observe load state don't break — additive and non-throwing.
     * Adapters backed by a real page (e.g. Playwright) override this.
     *
     * @param state - 'load', 'domcontentloaded', or 'networkidle'.
     */
    public async WaitForLoadState(
        _state: 'load' | 'domcontentloaded' | 'networkidle'
    ): Promise<void> {
        // No-op default — adapters with a live page override this.
    }

    /**
     * Capture the page's accessibility tree for token-efficient, structured
     * perception (a lighter-weight alternative to a screenshot).
     *
     * Default implementation returns `null` so adapters that cannot produce an
     * accessibility tree don't break — additive and non-throwing. Adapters
     * backed by a real page (e.g. Playwright) override this.
     *
     * @returns The root {@link AccessibilityNode}, or `null` when unavailable.
     */
    public async GetAccessibilitySnapshot(): Promise<AccessibilityNode | null> {
        // No-op default — adapters with a live page override this.
        return null;
    }

    /**
     * Introspect a single element matched by a CSS selector — its existence,
     * visibility, text, and bounding box — without ever throwing on a miss.
     *
     * Default implementation reports the element as absent so adapters that
     * cannot query the DOM don't break — additive and non-throwing. Adapters
     * backed by a real page (e.g. Playwright) override this.
     *
     * @param selector - CSS selector identifying the target element.
     * @returns An {@link ElementInfo}; `{ Exists:false, Visible:false, Text:'' }` when missing.
     */
    public async QueryElement(_selector: string): Promise<ElementInfo> {
        // No-op default — adapters with a live page override this.
        return new ElementInfo();
    }

    // ─── Screencast (CDP live viewport feed) ───────────────

    /**
     * Start a live screencast of the browser viewport, invoking `onFrame` for
     * each captured frame until {@link StopScreencast} is called.
     *
     * Default implementation is a no-op resolve: it starts no feed and emits no
     * frames. This is the safer additive default — a consumer that
     * opportunistically requests a live feed on an adapter that can't provide
     * one (e.g. a non-CDP backend) simply receives nothing rather than an
     * exception that would break an otherwise-working automation loop. Adapters
     * that can drive CDP (e.g. PlaywrightBrowserAdapter) override this to emit
     * real {@link ScreencastFrame}s.
     *
     * @param onFrame - Callback invoked with each captured frame.
     * @param opts - Optional {@link ScreencastOptions} (size, quality, format, frame skipping).
     */
    public async StartScreencast(
        _onFrame: (frame: ScreencastFrame) => void,
        _opts?: ScreencastOptions
    ): Promise<void> {
        // No-op default — screencast is not supported by this adapter.
        // Resolves rather than throws so requesting a live feed is always safe.
    }

    /**
     * Stop a screencast previously started via {@link StartScreencast} and
     * release any associated resources (e.g. the CDP session).
     *
     * Default implementation is a no-op — safe to call even when no screencast
     * is active or the adapter never supported one.
     */
    public async StopScreencast(): Promise<void> {
        // No-op default — nothing to stop on adapters without screencast support.
    }

    /**
     * Capture one frame on demand and push it through the active screencast's callback.
     *
     * Lets callers force an immediate live-view refresh (e.g. the first paint, or right after a
     * navigation settles) on adapters whose screencast only emits frames on a viewport repaint.
     *
     * Default implementation is a no-op resolve — safe to call when no screencast is running or the
     * adapter has no screencast support. Adapters with a live screencast (e.g. PlaywrightBrowserAdapter)
     * override this to emit a real frame.
     */
    public async CaptureScreencastFrame(): Promise<void> {
        // No-op default — adapters with an active screencast override this.
    }

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

    // ─── State Reset (Optional) ────────────────────────────

    /**
     * Reset per-session state for the given origin while preserving auth tokens.
     *
     * Intended for shared-context adapters: between tests in the same browser
     * context, cached state from the previous test (IndexedDB metadata cache,
     * sessionStorage, service workers, non-auth localStorage entries) can
     * deadlock the next test's app initialization. This method clears that
     * state so the next test starts clean — but preserves Auth0 / OAuth
     * tokens in localStorage so the user stays logged in.
     *
     * Default implementation is a no-op. Adapters that own a context across
     * test boundaries (e.g., SharedContextBrowserAdapter) override this.
     *
     * Best-effort: never throws — all errors are swallowed.
     *
     * @param origin - Origin (protocol + host + port) whose storage to clean
     */
    public async ResetStatePreservingAuth(_origin: string): Promise<void> {
        // No-op by default — adapters that share context across tests override this.
    }

    // ─── Diagnostics ──────────────────────────────────────

    /**
     * Retrieve and flush all buffered diagnostic events captured since
     * the last call. Returns an empty array if the adapter doesn't
     * capture diagnostics or if there are no new events.
     */
    public GetDiagnostics(): BrowserDiagnosticEvent[] {
        return [];
    }

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
