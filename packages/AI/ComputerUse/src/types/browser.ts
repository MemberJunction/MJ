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
    | RefreshAction
    | DragAction;

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
    /**
     * Optional CSS selector identifying the target. When set, the adapter
     * clicks the matched element (robust DOM targeting) and X/Y/BoundingBox
     * are ignored; when omitted, the existing coordinate click is used.
     */
    public Selector?: string;
}

export class TypeAction {
    public readonly Type = 'Type' as const;
    /** Text to type into the currently focused element */
    public Text: string = '';
    /**
     * Optional CSS selector to focus before typing. When set, the adapter
     * focuses/fills that element; when omitted, text goes to the currently
     * focused element (existing behavior).
     */
    public Selector?: string;
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
    /**
     * Optional CSS selector to scroll into view. When set, the adapter scrolls
     * that element into view and DeltaX/DeltaY are ignored; when omitted, the
     * existing delta scroll is used.
     */
    public Selector?: string;
}

export class WaitAction {
    public readonly Type = 'Wait' as const;
    /** Duration in milliseconds */
    public DurationMs: number = 1000;
    /**
     * Optional CSS selector to wait for. When set, the adapter waits until the
     * element appears (bounded by the action timeout); when omitted, it waits
     * DurationMs (existing behavior).
     */
    public Selector?: string;
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

export class DragAction {
    public readonly Type = 'Drag' as const;
    /** Start X coordinate in viewport pixels */
    public StartX: number = 0;
    /** Start Y coordinate in viewport pixels */
    public StartY: number = 0;
    /** End X coordinate in viewport pixels */
    public EndX: number = 0;
    /** End Y coordinate in viewport pixels */
    public EndY: number = 0;
    /** Optional bounding box for the drag start (centroid is used) */
    public StartBoundingBox?: BoundingBox;
    /** Optional bounding box for the drag end (centroid is used) */
    public EndBoundingBox?: BoundingBox;
    /**
     * Number of intermediate mouse-move steps between start and end.
     * Higher values produce smoother drags that some HTML5 drag-and-drop
     * handlers require to register the drag (>= 5 recommended).
     */
    public Steps: number = 10;
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
    /** Additional Chromium launch arguments (e.g., --unsafely-treat-insecure-origin-as-secure) */
    public Args?: string[];

    /**
     * Pre-populate localStorage for specific origins before any page loads.
     * Uses Playwright's storageState to inject entries at context creation,
     * avoiding race conditions with SPA auth SDKs that check localStorage on init.
     *
     * Each entry maps an origin (e.g. "http://localhost:4201") to key-value pairs.
     * Set by the engine when LocalStorage auth bindings are configured.
     */
    public InitialLocalStorage?: LocalStorageOriginState[];

    /**
     * Attach to an already-running browser instead of launching one.
     * Auto-detects the connect method from the URL scheme:
     *   - `http(s)://…`  → Chrome DevTools Protocol (`chromium.connectOverCDP`),
     *      e.g. a real Chrome started with `--remote-debugging-port=9222`.
     *   - `ws(s)://…`    → Playwright browser server (`chromium.connect`),
     *      e.g. one started via `chromium.launchServer()` (pool / Docker / remote).
     *
     * When set, the adapter does NOT close the browser on shutdown — the
     * caller owns its lifecycle. `Headless` is ignored (the external browser
     * already decided). Existing launch+close behavior is preserved when this
     * is unset.
     */
    public Connect?: string;

    /**
     * Force the connect method. A raw CDP websocket also uses `ws://`, which
     * auto-detect would treat as a Playwright server; set `'cdp'` to override.
     * Defaults to `'auto'` (scheme-based detection). Ignored when `Connect` is unset.
     */
    public ConnectType?: 'cdp' | 'server' | 'auto';

    /**
     * When attached, reuse the running browser's first existing context so its
     * cookies / auth / session are shared (the point of attaching to a user's
     * browser), instead of creating a fresh isolated context. Defaults to false.
     *
     * Note: this breaks per-test isolation. Viewport/UserAgent/InitialLocalStorage
     * are ignored when reusing a context (they only apply to contexts we create).
     * Ignored when `Connect` is unset.
     */
    public ReuseExistingContext?: boolean;
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
