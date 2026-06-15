/**
 * The live-session contract for the Remote Browser channel and the self-contained, strongly-typed
 * action / input / output payloads it carries.
 *
 * These types are defined **self-contained here** (no dependency on `@memberjunction/computer-use` or
 * Playwright) so this Base package stays universal — usable client *and* server. The server package
 * and the backend drivers (which depend on `@memberjunction/computer-use`) *implement*
 * {@link IRemoteBrowserSession} against a real CDP-connected browser; this package only declares the
 * shape both sides agree on.
 *
 * @see `/plans/realtime/realtime-bridges-architecture.md` §4d (the Remote Browser channel) and §4d-i
 * (the one-primitive-CDP build decision).
 */

// ──────────────────────────────────────────────────────────────────────────────────────────────────
// Agent action vocabulary — a discriminated union over `Kind`.
// ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Navigate the browser to a URL.
 */
export interface RemoteBrowserNavigateAction {
    Kind: 'navigate';
    /** The absolute URL to load. */
    Url: string;
}

/**
 * Click an element. Identify the target either by CSS `Selector` or by viewport coordinates
 * (`X` / `Y`); a driver prefers `Selector` when both are present.
 */
export interface RemoteBrowserClickAction {
    Kind: 'click';
    /** Optional CSS selector identifying the element to click. */
    Selector?: string;
    /** Optional viewport X coordinate (used when no `Selector` is given). */
    X?: number;
    /** Optional viewport Y coordinate (used when no `Selector` is given). */
    Y?: number;
}

/**
 * Type text. When `Selector` is provided the driver focuses that element first; otherwise the text is
 * sent to the currently-focused element.
 */
export interface RemoteBrowserTypeAction {
    Kind: 'type';
    /** The text to type. */
    Text: string;
    /** Optional CSS selector to focus before typing. */
    Selector?: string;
}

/**
 * Press a single key or key-combination (e.g. `'Enter'`, `'Escape'`, `'Control+A'`).
 */
export interface RemoteBrowserKeyAction {
    Kind: 'key';
    /** The key (or combination) to press, in Playwright/CDP key syntax. */
    Key: string;
}

/**
 * Scroll the viewport (by `DeltaX` / `DeltaY` pixels) or scroll a specific element into view (by
 * `Selector`). At least one of the three should be supplied; a driver scrolls `Selector` into view
 * when present, otherwise applies the deltas.
 */
export interface RemoteBrowserScrollAction {
    Kind: 'scroll';
    /** Horizontal scroll distance in pixels (positive = right). */
    DeltaX?: number;
    /** Vertical scroll distance in pixels (positive = down). */
    DeltaY?: number;
    /** Optional CSS selector to scroll into view instead of applying deltas. */
    Selector?: string;
}

/**
 * Navigate back in history.
 */
export interface RemoteBrowserBackAction {
    Kind: 'back';
}

/**
 * Navigate forward in history.
 */
export interface RemoteBrowserForwardAction {
    Kind: 'forward';
}

/**
 * Wait — either for a fixed duration (`Ms`) or until an element matching `Selector` appears. At least
 * one should be supplied; a driver waits for `Selector` when present, otherwise sleeps for `Ms`.
 */
export interface RemoteBrowserWaitAction {
    Kind: 'wait';
    /** Fixed wait in milliseconds. */
    Ms?: number;
    /** Optional CSS selector to wait for instead of a fixed duration. */
    Selector?: string;
}

/**
 * The full agent action vocabulary — a discriminated union over the `Kind` field. The realtime agent
 * emits these as tool calls and the channel's session executes them over CDP. Strongly typed with no
 * `any`; narrow on `action.Kind` to access the kind-specific fields.
 */
export type RemoteBrowserAction =
    | RemoteBrowserNavigateAction
    | RemoteBrowserClickAction
    | RemoteBrowserTypeAction
    | RemoteBrowserKeyAction
    | RemoteBrowserScrollAction
    | RemoteBrowserBackAction
    | RemoteBrowserForwardAction
    | RemoteBrowserWaitAction;

/**
 * The outcome of executing a {@link RemoteBrowserAction} (or {@link IRemoteBrowserSession.Navigate}).
 */
export interface RemoteBrowserActionResult {
    /** Whether the action completed successfully. */
    Success: boolean;
    /** The page URL after the action, when known. */
    CurrentUrl?: string;
    /** Optional human-readable detail (an error message on failure, a note on success). */
    Detail?: string;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────────
// Viewport streaming.
// ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A single encoded viewport frame emitted by the live screencast (CDP `Page.startScreencast` for
 * self-host, or a provider live-view stream). Frames feed the channel's ScreenOut media track when
 * screen-sharing the browser into a meeting, or a panel in the MJ console.
 */
export interface RemoteBrowserScreencastFrame {
    /** The frame image, Base64-encoded (typically JPEG/PNG per the backend). */
    DataBase64: string;
    /** Frame width in pixels. */
    Width: number;
    /** Frame height in pixels. */
    Height: number;
    /** Monotonically increasing sequence number for ordering / drop detection. */
    SequenceNumber: number;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────────
// Human takeover input — a discriminated union over `Kind`.
// ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A keyboard modifier key that can be held while a human input occurs. These ride on pointer clicks
 * (so Shift-click text selection / Ctrl-click new-tab semantics relay faithfully) AND on key presses
 * (so combos like Ctrl/Cmd+A select-all, Cmd+C / Cmd+V relay faithfully). `'Meta'` is the Command key
 * on macOS / the Windows key elsewhere. Platform-agnostic at this layer — the CDP mapper translates to
 * Playwright/CDP modifier syntax.
 */
export type RemoteBrowserModifierKey = 'Shift' | 'Control' | 'Alt' | 'Meta';

/**
 * A human pointer move into the browser viewport.
 */
export interface RemoteBrowserPointerMoveInput {
    Kind: 'pointer-move';
    /** Viewport X coordinate. */
    X: number;
    /** Viewport Y coordinate. */
    Y: number;
}

/**
 * A human pointer click into the browser viewport.
 */
export interface RemoteBrowserPointerClickInput {
    Kind: 'pointer-click';
    /** Viewport X coordinate. */
    X: number;
    /** Viewport Y coordinate. */
    Y: number;
    /** Which mouse button was used (defaults to `'left'` when omitted). */
    Button?: 'left' | 'middle' | 'right';
    /**
     * Modifier keys held during the click (e.g. `['Shift']` for shift-click text selection). Omitted /
     * empty means no modifiers.
     */
    Modifiers?: RemoteBrowserModifierKey[];
}

/**
 * A human pointer-button press (mouse-down) at a viewport point WITHOUT a release — the start of a
 * click-drag. Pairs with {@link RemoteBrowserPointerUpInput} (and any intervening
 * {@link RemoteBrowserPointerMoveInput}s) to relay a drag, e.g. click-drag text selection in a field.
 */
export interface RemoteBrowserPointerDownInput {
    Kind: 'pointer-down';
    /** Viewport X coordinate. */
    X: number;
    /** Viewport Y coordinate. */
    Y: number;
    /** Which mouse button was pressed (defaults to `'left'` when omitted). */
    Button?: 'left' | 'middle' | 'right';
    /** Modifier keys held during the press. Omitted / empty means no modifiers. */
    Modifiers?: RemoteBrowserModifierKey[];
}

/**
 * A human pointer-button release (mouse-up) at a viewport point — the end of a click-drag started by a
 * {@link RemoteBrowserPointerDownInput}.
 */
export interface RemoteBrowserPointerUpInput {
    Kind: 'pointer-up';
    /** Viewport X coordinate. */
    X: number;
    /** Viewport Y coordinate. */
    Y: number;
    /** Which mouse button was released (defaults to `'left'` when omitted). */
    Button?: 'left' | 'middle' | 'right';
    /** Modifier keys held during the release. Omitted / empty means no modifiers. */
    Modifiers?: RemoteBrowserModifierKey[];
}

/**
 * A human key press routed into the browser during takeover.
 */
export interface RemoteBrowserKeyInput {
    Kind: 'key';
    /** The key (or combination) pressed, in Playwright/CDP key syntax. */
    Key: string;
    /**
     * Modifier keys held during the press (e.g. `['Control']` with `Key: 'a'` for select-all). The
     * mapper composes these with `Key` into a single Playwright/CDP chord. Omitted / empty means the
     * `Key` is pressed on its own.
     */
    Modifiers?: RemoteBrowserModifierKey[];
}

/**
 * A human mouse-wheel / trackpad scroll into the browser viewport (Magic Mouse scroll, trackpad
 * two-finger scroll, wheel). `X` / `Y` are the viewport pixel position the scroll occurred over (so a
 * scroll targets the element under the pointer); `DeltaX` / `DeltaY` are the scroll deltas in pixels
 * (positive `DeltaY` = down, positive `DeltaX` = right — matching the DOM `WheelEvent` convention).
 */
export interface RemoteBrowserScrollInput {
    Kind: 'scroll';
    /** Viewport X coordinate the scroll occurred over. */
    X: number;
    /** Viewport Y coordinate the scroll occurred over. */
    Y: number;
    /** Horizontal scroll delta in pixels (positive = right). */
    DeltaX: number;
    /** Vertical scroll delta in pixels (positive = down). */
    DeltaY: number;
}

/**
 * The full human-takeover input vocabulary — a discriminated union over `Kind`. When a human "grabs
 * the wheel" in `Collaborative` (or watches in `ViewOnly`) their pointer/keyboard/scroll events arrive
 * as these and route into the backend browser via {@link IRemoteBrowserSession.RouteHumanInput}.
 * Strongly typed with no `any`; narrow on `input.Kind`.
 */
export type RemoteBrowserHumanInput =
    | RemoteBrowserPointerMoveInput
    | RemoteBrowserPointerClickInput
    | RemoteBrowserPointerDownInput
    | RemoteBrowserPointerUpInput
    | RemoteBrowserKeyInput
    | RemoteBrowserScrollInput;

// ──────────────────────────────────────────────────────────────────────────────────────────────────
// The live-session handle.
// ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A live handle to a single remote-browser session, returned by
 * {@link import('./base-remote-browser-provider').BaseRemoteBrowserProvider.Connect}.
 *
 * The **core** methods (`GetCdpEndpoint`, `Navigate`, `ExecuteAction`, `CaptureScreenshot`,
 * `GetCurrentUrl`, `Close`) rest on the universal CDP substrate every backend provides and are always
 * available. The remaining methods are **capability-gated** (feature-gated, documented per-method):
 * the engine checks the provider's `SupportedFeatures` flag before calling them, and a backend that
 * cannot satisfy a feature should reject/throw {@link
 * import('./capability-errors').RemoteBrowserCapabilityNotSupportedError}.
 *
 * This is a pure interface — the concrete implementation lives in the server package / drivers (which
 * own the Playwright + CDP machinery).
 */
export interface IRemoteBrowserSession {
    // ── Core (universal CDP substrate) ──────────────────────────────────────────

    /**
     * Returns the Chrome DevTools Protocol endpoint for this session — the one primitive every
     * backend exposes and the engine's computer-use loop connects to.
     *
     * @returns The CDP websocket/connect endpoint URL.
     */
    GetCdpEndpoint(): string;

    /**
     * Navigates the browser to a URL. Convenience over {@link IRemoteBrowserSession.ExecuteAction}
     * with a `navigate` action.
     *
     * @param url The absolute URL to load.
     * @returns The action result (success + resulting URL).
     */
    Navigate(url: string): Promise<RemoteBrowserActionResult>;

    /**
     * Executes a single agent {@link RemoteBrowserAction} over CDP.
     *
     * @param action The action to perform; narrow on `action.Kind`.
     * @returns The action result.
     */
    ExecuteAction(action: RemoteBrowserAction): Promise<RemoteBrowserActionResult>;

    /**
     * Captures a one-off screenshot of the current viewport.
     *
     * @returns The screenshot image, Base64-encoded.
     */
    CaptureScreenshot(): Promise<string>;

    /**
     * Returns the browser's current URL synchronously (last known to the session).
     *
     * @returns The current page URL.
     */
    GetCurrentUrl(): string;

    /**
     * Closes the session and releases the backend browser/container. Idempotent — safe to call once
     * teardown has already begun.
     *
     * @returns A promise that resolves once the session is fully torn down.
     */
    Close(): Promise<void>;

    // ── Capability-gated (feature-gated; engine checks SupportedFeatures first) ──

    /**
     * Returns an embeddable live-view URL so humans can watch the browser without MJ encoding frames.
     *
     * **Capability-gated** by `LiveView`. Backends without it reject with {@link
     * import('./capability-errors').RemoteBrowserCapabilityNotSupportedError}.
     *
     * @returns The live-view URL.
     */
    GetLiveViewUrl(): Promise<string>;

    /**
     * Begins streaming encoded viewport frames to `onFrame` (the source for the channel's ScreenOut
     * track).
     *
     * **Capability-gated** by `ScreenStreaming`. Backends without it reject.
     *
     * @param onFrame Invoked with each encoded {@link RemoteBrowserScreencastFrame}.
     * @returns A promise that resolves once the screencast has started.
     */
    StartScreencast(onFrame: (frame: RemoteBrowserScreencastFrame) => void): Promise<void>;

    /**
     * Stops a screencast previously started with {@link IRemoteBrowserSession.StartScreencast}.
     *
     * **Capability-gated** by `ScreenStreaming`. Backends without it reject.
     *
     * @returns A promise that resolves once streaming has stopped.
     */
    StopScreencast(): Promise<void>;

    /**
     * Routes a human takeover input (pointer move/click, key, scroll) into the backend browser.
     *
     * **Capability-gated** by `HumanTakeover` — only valid in `Collaborative` (and pointer-only
     * observation in `ViewOnly`). Backends without it throw.
     *
     * @param input The human input event; narrow on `input.Kind`.
     */
    RouteHumanInput(input: RemoteBrowserHumanInput): void;

    /**
     * Delegates a high-level natural-language intent to the backend's own AI-control harness (e.g.
     * Browserbase Stagehand) instead of MJ's computer-use loop.
     *
     * **Capability-gated** by `NativeAIControl`. Backends without it reject.
     *
     * @param intent The natural-language intent (e.g. `'log in with the test account'`).
     * @returns The action result.
     */
    InvokeNativeAIControl(intent: string): Promise<RemoteBrowserActionResult>;
}
