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
    | MouseMoveAction
    | MouseDownAction
    | MouseUpAction
    | ScrollAction
    | WaitAction
    | NavigateAction
    | GoBackAction
    | GoForwardAction
    | RefreshAction
    | DragAction;

/**
 * A keyboard modifier key held during a mouse or keyboard action.
 *
 * `'ControlOrMeta'` resolves to Command on macOS and Control elsewhere — the right choice for
 * platform-correct select-all / copy / paste chords. The concrete adapter maps these to its own
 * modifier vocabulary (Playwright accepts these names directly on `mouse.click` / keyboard chords).
 */
export type KeyModifier = 'Shift' | 'Control' | 'Alt' | 'Meta' | 'ControlOrMeta';

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
    /**
     * Optional keyboard modifiers held during the click (e.g. `['Shift']` for shift-click text
     * selection, `['ControlOrMeta']` for open-in-new-tab). Empty / omitted means no modifiers — the
     * existing plain-click behavior. Honored on BOTH the selector and coordinate click paths.
     */
    public Modifiers?: KeyModifier[];
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
    /**
     * Optional keyboard modifiers to hold while pressing {@link Key}. When set, the adapter composes
     * a single chord (e.g. `Modifiers: ['ControlOrMeta']` + `Key: 'a'` → press `ControlOrMeta+a`).
     * Empty / omitted presses `Key` on its own. Provided as a structured alternative to embedding the
     * combination directly in `Key` — both are supported.
     */
    public Modifiers?: KeyModifier[];
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

/**
 * Move the mouse cursor to an absolute viewport coordinate without clicking.
 *
 * Completes the input vocabulary for hover-driven UIs (tooltips, fly-out menus)
 * and human-takeover scenarios where the cursor position itself is meaningful.
 * Unlike {@link ClickAction}, no button press is issued — only a pointer move.
 */
export class MouseMoveAction {
    public readonly Type = 'MouseMove' as const;
    /** X coordinate in viewport pixels to move the cursor to */
    public X: number = 0;
    /** Y coordinate in viewport pixels to move the cursor to */
    public Y: number = 0;
}

/**
 * Press (and HOLD) a mouse button at an absolute viewport coordinate WITHOUT releasing it.
 *
 * The "down" half of a manual drag: pairs with {@link MouseUpAction} (and any intervening
 * {@link MouseMoveAction}s) to compose a click-drag — e.g. click-drag text selection in an input —
 * when the drag's endpoint isn't known up front (the streaming-human case). Use {@link DragAction}
 * instead when start and end are both known atomically.
 */
export class MouseDownAction {
    public readonly Type = 'MouseDown' as const;
    /** X coordinate in viewport pixels to press at */
    public X: number = 0;
    /** Y coordinate in viewport pixels to press at */
    public Y: number = 0;
    /** Mouse button to press */
    public Button: 'left' | 'right' | 'middle' = 'left';
}

/**
 * Release a mouse button at an absolute viewport coordinate — the "up" half of a manual drag started
 * by {@link MouseDownAction}. Moves the cursor to `X`/`Y` first so the release lands at the intended
 * point, then releases the button.
 */
export class MouseUpAction {
    public readonly Type = 'MouseUp' as const;
    /** X coordinate in viewport pixels to release at */
    public X: number = 0;
    /** Y coordinate in viewport pixels to release at */
    public Y: number = 0;
    /** Mouse button to release */
    public Button: 'left' | 'right' | 'middle' = 'left';
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

// ─── Screencast (CDP live viewport feed) ───────────────────
/**
 * A single frame from a live screencast of the browser viewport.
 *
 * Emitted by {@link BaseBrowserAdapter.StartScreencast}'s callback. Backed by
 * Chrome DevTools Protocol's `Page.screencastFrame` event on adapters that
 * support it (e.g. PlaywrightBrowserAdapter); other adapters never emit frames.
 */
export class ScreencastFrame {
    /** Base64-encoded image data for this frame (no data URI prefix). */
    public DataBase64: string = '';
    /** Frame width in pixels. */
    public Width: number = 0;
    /** Frame height in pixels. */
    public Height: number = 0;
    /**
     * Monotonically increasing frame index, starting at 0 for the first frame
     * of a screencast session. Lets consumers detect ordering / dropped frames.
     */
    public SequenceNumber: number = 0;
}

/**
 * Options controlling a screencast session started via
 * {@link BaseBrowserAdapter.StartScreencast}. All fields are optional — adapters
 * apply sensible defaults (and ignore options they cannot honor).
 */
export class ScreencastOptions {
    /** Maximum frame width in pixels (frames are scaled down to fit). */
    public MaxWidth?: number;
    /** Maximum frame height in pixels (frames are scaled down to fit). */
    public MaxHeight?: number;
    /**
     * Emit only every Nth frame to reduce throughput (e.g. 2 emits half the
     * frames). Defaults to every frame when omitted.
     */
    public EveryNthFrame?: number;
    /** Compression quality 0–100 (applies to the 'jpeg' format only). */
    public Quality?: number;
    /** Image encoding for emitted frames. Defaults to 'jpeg' (smaller frames). */
    public Format?: 'jpeg' | 'png';
}

// ─── Audio capture (in-page tab-audio feed) ────────────────
/**
 * A single chunk of audio captured FROM the browser tab (the media playing inside
 * the page — e.g. a YouTube video's soundtrack), emitted by
 * {@link BaseBrowserAdapter.StartAudioCapture}'s callback.
 *
 * The default capture path (see PlaywrightBrowserAdapter) taps a playing
 * `<video>` / `<audio>` element with `element.captureStream()` and encodes the
 * tracks with an in-page `MediaRecorder`, so each chunk is a self-describing,
 * webm-Opus-encoded slice of the audio. Adapters without in-page capture never
 * emit chunks.
 */
export class AudioCaptureChunk {
    /** Base64-encoded encoded audio data for this chunk (no data URI prefix). */
    public DataBase64: string = '';
    /**
     * The codec / container of {@link DataBase64}. `'webm-opus'` is the default
     * in-page `MediaRecorder` output; `'opus'` / `'pcm16'` are reserved for
     * future backend capture paths (e.g. a server-side virtual audio sink).
     */
    public Codec: 'webm-opus' | 'opus' | 'pcm16' = 'webm-opus';
    /** Sample rate in Hz (typically 48000 for the `MediaRecorder` Opus path). */
    public SampleRate: number = 48000;
    /** Channel count (1 = mono, 2 = stereo). */
    public Channels: number = 2;
    /**
     * Monotonically increasing chunk index, starting at 0 for the first chunk of
     * a capture session. Lets consumers detect ordering / dropped chunks and
     * resync the decode pipeline after a gap.
     */
    public SequenceNumber: number = 0;
    /** Approximate duration of this chunk in milliseconds, when known. */
    public DurationMs?: number;
}

// ─── Accessibility Snapshot (structured perception) ────────
/**
 * A node in the page's accessibility tree — a token-efficient, structured
 * alternative to a screenshot for LLM perception.
 *
 * Mirrors the subset of fields exposed by Playwright's `page.accessibility.snapshot()`
 * that are useful to a controller: the ARIA role, the accessible name, an
 * optional value (for inputs/sliders), and child nodes (recursive).
 */
export class AccessibilityNode {
    /** ARIA role of the node (e.g. "button", "textbox", "heading"). */
    public Role: string = '';
    /** Accessible name (computed label / text) of the node. */
    public Name: string = '';
    /** Value of the node, when applicable (e.g. an input's current value). */
    public Value?: string;
    /** Child accessibility nodes, when the node has descendants. */
    public Children?: AccessibilityNode[];
}

// ─── Element Introspection ─────────────────────────────────
/**
 * Result of {@link BaseBrowserAdapter.QueryElement} — a non-throwing snapshot of
 * a single element's existence, visibility, text, and geometry.
 *
 * Designed so callers never have to handle a "not found" exception: a missing
 * element simply yields `{ Exists: false, Visible: false, Text: '' }`.
 */
export class ElementInfo {
    /** True when at least one element matches the queried selector. */
    public Exists: boolean = false;
    /** True when the matched element is currently visible. */
    public Visible: boolean = false;
    /** The matched element's inner text (empty when missing/unreadable). */
    public Text: string = '';
    /** The matched element's bounding box, when one is available. */
    public BoundingBox?: BoundingBox;
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
