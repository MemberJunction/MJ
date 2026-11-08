/**
 * @fileoverview Unified Dual-Mode + Adaptive Escalation (`'auto'`) Browser Adapter for the
 * MemberJunction Browser Extension.
 *
 * Orchestrates:
 * - **Mode 1 (`'content-script'`, Recommended Default):** Banner-free, zero-debugger DOM execution.
 * - **Mode 2 (`'debugger-cdp'`, Power Mode):** Hardware-trusted CDP v1.3 input dispatch & closed
 *   Shadow DOM / cross-origin iframe inspection.
 * - **Mode 3 (`'auto'`, Adaptive Escalation):** Starts in `'content-script'`; escalates to
 *   `'debugger-cdp'` for the single step when `RequireTrustedInput` is set or when synthetic DOM
 *   dispatch fails/requires trusted input, then detaches `chrome.debugger` immediately after the step.
 *
 * Uses {@link ControlModeCascade} to evaluate the 4-Layer Configuration Cascade on every call.
 *
 * @module @memberjunction/browser-extension-core
 */

import type {
    BrowserClickRequest,
    BrowserCoachMarkRequest,
    BrowserControlBackendMode,
    BrowserControlCascadeInput,
    BrowserControlCascadeResolution,
    BrowserFillInputRequest,
    BrowserOperationResult,
    BrowserPageStateSnapshot,
    BrowserScrollRequest,
    BrowserWaitForActionRequest,
    ConcreteBrowserControlBackend,
    IBrowserControlAdapter,
} from '../types/extension-types.js';
import { ControlModeCascade } from '../security/ControlModeCascade.js';
import { ContentScriptBrowserAdapter } from './ContentScriptBrowserAdapter.js';
import { ChromeDebuggerBrowserAdapter } from './ChromeDebuggerBrowserAdapter.js';

/**
 * Options for constructing {@link ExtensionBrowserAdapter}.
 */
export interface ExtensionBrowserAdapterOptions {
    /** Mode 1 Content Script adapter (always required). */
    ContentScriptAdapter: ContentScriptBrowserAdapter;
    /** Mode 2 Chrome Debugger CDP adapter (optional; required for `'debugger-cdp'` or `'auto'` escalation). */
    DebuggerAdapter?: ChromeDebuggerBrowserAdapter;
    /** 4-Layer Configuration Cascade resolver. */
    Cascade?: ControlModeCascade;
    /** Dynamic provider supplying the current cascade input (brand, agent, playbook, user overrides). */
    GetCascadeInput?: () => BrowserControlCascadeInput;
}

/**
 * Unified Browser Control Adapter routing between `'content-script'`, `'debugger-cdp'`, and `'auto'`.
 */
export class ExtensionBrowserAdapter implements IBrowserControlAdapter {
    private readonly contentScriptAdapter: ContentScriptBrowserAdapter;
    private readonly debuggerAdapter?: ChromeDebuggerBrowserAdapter;
    private readonly cascade: ControlModeCascade;
    private getCascadeInput: () => BrowserControlCascadeInput;
    private lastActionFailedInContentScript = false;

    public constructor(options: ExtensionBrowserAdapterOptions) {
        this.contentScriptAdapter = options.ContentScriptAdapter;
        this.debuggerAdapter = options.DebuggerAdapter;
        this.cascade = options.Cascade ?? new ControlModeCascade();
        this.getCascadeInput = options.GetCascadeInput ?? ((): BrowserControlCascadeInput => ({}));
    }

    /**
     * Current configured backend mode (`'content-script'`, `'debugger-cdp'`, or `'auto'`).
     */
    public get BackendMode(): BrowserControlBackendMode {
        return this.ResolveCurrentCascade().ConfiguredMode;
    }

    /**
     * Updates the cascade input provider dynamically (e.g., when the active agent, playbook, or user toggle changes).
     */
    public SetCascadeInputProvider(provider: () => BrowserControlCascadeInput): void {
        this.getCascadeInput = provider;
    }

    /**
     * Resolves the current 4-Layer Configuration Cascade state.
     */
    public ResolveCurrentCascade(extraOverrides?: Partial<BrowserControlCascadeInput>): BrowserControlCascadeResolution {
        const baseInput = this.getCascadeInput();
        return this.cascade.Resolve({
            ...baseInput,
            ...extraOverrides,
            LastActionRequiresTrustedInput:
                extraOverrides?.LastActionRequiresTrustedInput ??
                baseInput.LastActionRequiresTrustedInput ??
                this.lastActionFailedInContentScript,
        });
    }

    /**
     * Navigates the active tab using the active concrete backend.
     */
    public async Navigate(url: string): Promise<BrowserOperationResult<{ Url: string }>> {
        const adapter = this.selectPrimaryAdapter();
        return adapter.Navigate(url);
    }

    /**
     * Captures the active tab's DOM state & interactive elements using the active concrete backend.
     */
    public async GetPageState(): Promise<BrowserOperationResult<BrowserPageStateSnapshot>> {
        const adapter = this.selectPrimaryAdapter();
        return adapter.GetPageState();
    }

    /**
     * Clicks an interactive element. In `'auto'` mode, starts in `'content-script'` and escalates
     * to `'debugger-cdp'` if `RequireTrustedInput` is true or if the content-script click fails,
     * detaching `chrome.debugger` immediately after the escalated step.
     */
    public async ClickElement(request: BrowserClickRequest): Promise<BrowserOperationResult<{
        ClickedIndex?: number;
        Selector?: string;
        Healed: boolean;
    }>> {
        const resolution = this.ResolveCurrentCascade({
            PlaybookRequireTrustedInput: request.RequireTrustedInput,
        });

        if (resolution.ActiveBackend === 'debugger-cdp' && this.debuggerAdapter) {
            const cdpRes = await this.debuggerAdapter.ClickElement(request);
            if (resolution.ConfiguredMode === 'auto') {
                await this.debuggerAdapter.DetachDebugger();
            }
            this.lastActionFailedInContentScript = false;
            return {
                ...cdpRes,
                EscalatedToDebugger: resolution.EscalatedFromAuto,
            };
        }

        // Run in Mode 1 (content-script)
        const csRes = await this.contentScriptAdapter.ClickElement(request);
        if (csRes.Success) {
            this.lastActionFailedInContentScript = false;
            return csRes;
        }

        // In 'auto' mode, if Mode 1 failed and CDP is permitted + available, escalate for this step
        if (
            resolution.ConfiguredMode === 'auto' &&
            resolution.DebuggerPermitted &&
            this.debuggerAdapter
        ) {
            this.lastActionFailedInContentScript = true;
            const escalatedRes = await this.debuggerAdapter.ClickElement(request);
            await this.debuggerAdapter.DetachDebugger();
            this.lastActionFailedInContentScript = false;
            return {
                ...escalatedRes,
                EscalatedToDebugger: true,
            };
        }

        return csRes;
    }

    /**
     * Fills an input element. Supports `'auto'` escalation to `'debugger-cdp'` when trusted key events
     * are required (`RequireTrustedInput`) or when content-script fill fails.
     */
    public async FillInput(request: BrowserFillInputRequest): Promise<BrowserOperationResult<{
        FilledIndex?: number;
        Selector?: string;
        Healed: boolean;
    }>> {
        const resolution = this.ResolveCurrentCascade({
            PlaybookRequireTrustedInput: request.RequireTrustedInput,
        });

        if (resolution.ActiveBackend === 'debugger-cdp' && this.debuggerAdapter) {
            const cdpRes = await this.debuggerAdapter.FillInput(request);
            if (resolution.ConfiguredMode === 'auto') {
                await this.debuggerAdapter.DetachDebugger();
            }
            this.lastActionFailedInContentScript = false;
            return {
                ...cdpRes,
                EscalatedToDebugger: resolution.EscalatedFromAuto,
            };
        }

        const csRes = await this.contentScriptAdapter.FillInput(request);
        if (csRes.Success) {
            this.lastActionFailedInContentScript = false;
            return csRes;
        }

        if (
            resolution.ConfiguredMode === 'auto' &&
            resolution.DebuggerPermitted &&
            this.debuggerAdapter
        ) {
            this.lastActionFailedInContentScript = true;
            const escalatedRes = await this.debuggerAdapter.FillInput(request);
            await this.debuggerAdapter.DetachDebugger();
            this.lastActionFailedInContentScript = false;
            return {
                ...escalatedRes,
                EscalatedToDebugger: true,
            };
        }

        return csRes;
    }

    /**
     * Scrolls the page using the active concrete backend.
     */
    public async Scroll(request: BrowserScrollRequest): Promise<BrowserOperationResult<{
        ScrollX: number;
        ScrollY: number;
    }>> {
        return this.selectPrimaryAdapter().Scroll(request);
    }

    /**
     * Renders a Shadow-DOM Coach-Mark Spotlight ring on the page.
     */
    public async HighlightElement(request: BrowserCoachMarkRequest): Promise<BrowserOperationResult<{
        HighlightId: string;
    }>> {
        return this.contentScriptAdapter.HighlightElement(request);
    }

    /**
     * Clears active Coach-Mark Spotlight overlays.
     */
    public async ClearHighlights(highlightId?: string): Promise<BrowserOperationResult<{ ClearedCount: number }>> {
        return this.contentScriptAdapter.ClearHighlights(highlightId);
    }

    /**
     * Pauses execution until the user completes the requested action on the page.
     */
    public async WaitForUserAction(request: BrowserWaitForActionRequest): Promise<BrowserOperationResult<{
        Completed: boolean;
        TriggeredBy: string;
    }>> {
        return this.contentScriptAdapter.WaitForUserAction(request);
    }

    /**
     * Captures a JPEG screenshot of the visible tab.
     */
    public async CaptureScreenshot(): Promise<BrowserOperationResult<{ Base64Jpeg: string }>> {
        return this.selectPrimaryAdapter().CaptureScreenshot();
    }

    /**
     * Detaches `chrome.debugger` if attached.
     */
    public async DetachDebugger(): Promise<void> {
        if (this.debuggerAdapter) {
            await this.debuggerAdapter.DetachDebugger();
        }
    }

    /**
     * Returns the concrete backend that will execute standard operations right now.
     */
    public GetActiveConcreteBackend(): ConcreteBrowserControlBackend {
        const res = this.ResolveCurrentCascade();
        if (res.ActiveBackend === 'debugger-cdp' && this.debuggerAdapter) {
            return 'debugger-cdp';
        }
        return 'content-script';
    }

    private selectPrimaryAdapter(): IBrowserControlAdapter {
        const res = this.ResolveCurrentCascade();
        if (res.ActiveBackend === 'debugger-cdp' && this.debuggerAdapter) {
            return this.debuggerAdapter;
        }
        return this.contentScriptAdapter;
    }
}
