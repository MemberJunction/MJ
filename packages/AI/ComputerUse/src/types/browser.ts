/**
 * Browser-related types for the Computer Use engine.
 *
 * BrowserAction is a discriminated union — each variant has a `Type` field
 * that enables exhaustive switch handling in BaseBrowserAdapter implementations.
 */

// ─── Browser Actions (Discriminated Union) ─────────────────
/**
 * All possible browser actions the controller LLM can request.
 * Uses discriminated union on the `Type` field for type-safe switching.
 */
export type BrowserAction =
    | ClickAction
    | TypeAction
    | KeypressAction
    | KeyDownAction
    | KeyUpAction
    | ScrollAction
    | WaitAction
    | NavigateAction
    | GoBackAction
    | GoForwardAction
    | RefreshAction;

export class ClickAction {
    public readonly Type = 'Click' as const;
    /** X coordinate in viewport pixels */
    public X: number = 0;
    /** Y coordinate in viewport pixels */
    public Y: number = 0;
    /** Optional bounding box for more precise targeting */
    public BoundingBox?: BoundingBox;
    /** Mouse button to use */
    public Button: 'left' | 'right' | 'middle' = 'left';
    /** Number of clicks (1 = single, 2 = double) */
    public ClickCount: number = 1;
}

export class TypeAction {
    public readonly Type = 'Type' as const;
    /** Text to type into the currently focused element */
    public Text: string = '';
}

export class KeypressAction {
    public readonly Type = 'Keypress' as const;
    /** Key or key combination (e.g., "Enter", "Shift+A", "ControlOrMeta+C") */
    public Key: string = '';
}

export class KeyDownAction {
    public readonly Type = 'KeyDown' as const;
    /** Key to hold down */
    public Key: string = '';
}

export class KeyUpAction {
    public readonly Type = 'KeyUp' as const;
    /** Key to release */
    public Key: string = '';
}

export class ScrollAction {
    public readonly Type = 'Scroll' as const;
    /** Vertical scroll delta (positive = down, negative = up) */
    public DeltaY: number = 0;
    /** Horizontal scroll delta (positive = right, negative = left) */
    public DeltaX: number = 0;
}

export class WaitAction {
    public readonly Type = 'Wait' as const;
    /** Duration in milliseconds */
    public DurationMs: number = 1000;
}

export class NavigateAction {
    public readonly Type = 'Navigate' as const;
    /** URL to navigate to */
    public Url: string = '';
}

export class GoBackAction {
    public readonly Type = 'GoBack' as const;
}

export class GoForwardAction {
    public readonly Type = 'GoForward' as const;
}

export class RefreshAction {
    public readonly Type = 'Refresh' as const;
}

// ─── Bounding Box ──────────────────────────────────────────
export class BoundingBox {
    /** Minimum X coordinate (left edge) */
    public XMin: number = 0;
    /** Minimum Y coordinate (top edge) */
    public YMin: number = 0;
    /** Maximum X coordinate (right edge) */
    public XMax: number = 0;
    /** Maximum Y coordinate (bottom edge) */
    public YMax: number = 0;
}

// ─── Action Execution Result ───────────────────────────────
export class ActionExecutionResult {
    public Success: boolean = false;
    public Action: BrowserAction;
    public Error?: string;
    public DurationMs: number = 0;

    constructor(action: BrowserAction) {
        this.Action = action;
    }
}

// ─── Browser Configuration ─────────────────────────────────
/**
 * Configuration for the browser instance.
 * Passed to BaseBrowserAdapter.Launch().
 */
export class BrowserConfig {
    /** Run browser without a visible window */
    public Headless: boolean = true;
    /** Viewport width in pixels */
    public ViewportWidth: number = 1280;
    /** Viewport height in pixels */
    public ViewportHeight: number = 720;
    /** Custom user agent string */
    public UserAgent?: string;
    /** Navigation timeout in milliseconds */
    public NavigationTimeoutMs: number = 30000;
    /** Action execution timeout in milliseconds */
    public ActionTimeoutMs: number = 10000;
    /** Slow down actions by this many milliseconds (useful for debugging) */
    public SlowMo?: number;

    /**
     * Pre-populate localStorage for specific origins before any page loads.
     * Uses Playwright's storageState to inject entries at context creation,
     * avoiding race conditions with SPA auth SDKs that check localStorage on init.
     *
     * Each entry maps an origin (e.g. "http://localhost:4201") to key-value pairs.
     * Set by the engine when LocalStorage auth bindings are configured.
     */
    public InitialLocalStorage?: LocalStorageOriginState[];
}

/**
 * localStorage entries scoped to a specific origin.
 * Used by BrowserConfig.InitialLocalStorage for pre-population via storageState.
 */
export class LocalStorageOriginState {
    /** Full origin (protocol + host + port), e.g. "http://localhost:4201" */
    public Origin: string = '';
    /** Key-value pairs to inject into localStorage for this origin */
    public Entries: { name: string; value: string }[] = [];
}

// ─── Navigation Decision ───────────────────────────────────
/**
 * Result of NavigationGuard.CheckNavigation().
 * Includes the decision and the reason for logging/debugging.
 */
export class NavigationDecision {
    public Allowed: boolean = true;
    public Reason: string = '';
    public Domain: string = '';

    constructor(allowed: boolean, reason: string, domain: string) {
        this.Allowed = allowed;
        this.Reason = reason;
        this.Domain = domain;
    }
}

// ─── Cookie Entry ──────────────────────────────────────────
/**
 * Cookie entry for injection via CookieInjectionAuthMethod.
 * Mirrors Playwright's cookie format for direct pass-through.
 */
export class CookieEntry {
    public Name: string = '';
    public Value: string = '';
    public Domain: string = '';
    public Path: string = '/';
    public Secure: boolean = false;
    public HttpOnly: boolean = false;
    public SameSite?: 'Strict' | 'Lax' | 'None';
    public Expires?: number;
}
