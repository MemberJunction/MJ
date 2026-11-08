/**
 * @fileoverview Mode 1 (`'content-script'` — Recommended Default) Browser Adapter
 * for the MemberJunction Browser Extension.
 *
 * Implements {@link IBrowserControlAdapter} using:
 * - Manifest V3 Content Scripts (`IContentScriptDomBridge` / `InPageContentScriptExecutor`)
 * - Shared `@memberjunction/computer-use/browser-probe` DOM grounding (`INTERACTIVITYPROBE`)
 * - `chrome.tabs.captureVisibleTab` for viewport screenshot capture
 * - Shadow-DOM Coach-Mark Spotlight overlays (`HighlightElement`, `ClearHighlights`)
 * - Zero Chrome `"<BrandName> is debugging this browser"` banner!
 *
 * @module @memberjunction/browser-extension-core
 */

import type {
    BrowserClickRequest,
    BrowserCoachMarkRequest,
    BrowserFillInputRequest,
    BrowserOperationResult,
    BrowserPageStateSnapshot,
    BrowserScrollRequest,
    BrowserWaitForActionRequest,
    IBrowserControlAdapter,
    IContentScriptDomBridge,
} from '../types/extension-types.js';
import { SensitivePageGuard } from '../security/SensitivePageGuard.js';

/**
 * Options for constructing {@link ContentScriptBrowserAdapter}.
 */
export interface ContentScriptBrowserAdapterOptions {
    /** Content Script DOM execution bridge (`InPageContentScriptExecutor` or MV3 message port). */
    DomBridge: IContentScriptDomBridge;
    /** Sensitive page & field guard. */
    Guard?: SensitivePageGuard;
    /** Optional tab navigation handler (`chrome.tabs.update`). */
    NavigateTab?: (url: string) => Promise<void>;
    /** Optional visible tab screenshot capture (`chrome.tabs.captureVisibleTab`). */
    CaptureVisibleTab?: () => Promise<string>;
}

/**
 * Mode 1 (`'content-script'`, Recommended Default) Browser Adapter.
 */
export class ContentScriptBrowserAdapter implements IBrowserControlAdapter {
    public readonly BackendMode = 'content-script' as const;

    private readonly domBridge: IContentScriptDomBridge;
    private readonly guard: SensitivePageGuard;
    private readonly navigateTab?: (url: string) => Promise<void>;
    private readonly captureVisibleTab?: () => Promise<string>;

    public constructor(options: ContentScriptBrowserAdapterOptions) {
        this.domBridge = options.DomBridge;
        this.guard = options.Guard ?? new SensitivePageGuard();
        this.navigateTab = options.NavigateTab;
        this.captureVisibleTab = options.CaptureVisibleTab;
    }

    /**
     * Navigates the active tab after checking {@link SensitivePageGuard}.
     */
    public async Navigate(url: string): Promise<BrowserOperationResult<{ Url: string }>> {
        if (this.guard.IsDomainBlocked(url)) {
            return {
                Success: false,
                BackendUsed: 'content-script',
                EscalatedToDebugger: false,
                ErrorCode: 'domain_blocked',
                ErrorMessage: `Navigation to "${url}" is blocked by SensitivePageGuard policy.`,
            };
        }

        if (this.navigateTab) {
            await this.navigateTab(url);
        }

        return {
            Success: true,
            BackendUsed: 'content-script',
            EscalatedToDebugger: false,
            Data: { Url: url },
        };
    }

    /**
     * Captures the active tab's DOM state, interactive elements, and metadata signals.
     */
    public async GetPageState(): Promise<BrowserOperationResult<BrowserPageStateSnapshot>> {
        const snapshot = await this.domBridge.GetPageState();
        if (this.guard.IsDomainBlocked(snapshot.Url)) {
            return {
                Success: false,
                BackendUsed: 'content-script',
                EscalatedToDebugger: false,
                ErrorCode: 'domain_blocked',
                ErrorMessage: `Page inspection on "${snapshot.Url}" is blocked by SensitivePageGuard policy.`,
            };
        }

        return {
            Success: true,
            BackendUsed: 'content-script',
            EscalatedToDebugger: false,
            Data: this.guard.SanitizePageSnapshot(snapshot),
        };
    }

    /**
     * Clicks an interactive element in Mode 1 (`'content-script'`).
     */
    public async ClickElement(request: BrowserClickRequest): Promise<BrowserOperationResult<{
        ClickedIndex?: number;
        Selector?: string;
        Healed: boolean;
    }>> {
        return this.domBridge.ClickElement(request);
    }

    /**
     * Fills an input element in Mode 1 (`'content-script'`).
     */
    public async FillInput(request: BrowserFillInputRequest): Promise<BrowserOperationResult<{
        FilledIndex?: number;
        Selector?: string;
        Healed: boolean;
    }>> {
        return this.domBridge.FillInput(request);
    }

    /**
     * Scrolls the page in Mode 1 (`'content-script'`).
     */
    public async Scroll(request: BrowserScrollRequest): Promise<BrowserOperationResult<{
        ScrollX: number;
        ScrollY: number;
    }>> {
        return this.domBridge.Scroll(request);
    }

    /**
     * Renders a Shadow-DOM Coach-Mark Spotlight ring on the page.
     */
    public async HighlightElement(request: BrowserCoachMarkRequest): Promise<BrowserOperationResult<{
        HighlightId: string;
    }>> {
        return this.domBridge.HighlightElement(request);
    }

    /**
     * Clears active Coach-Mark Spotlight overlays.
     */
    public async ClearHighlights(highlightId?: string): Promise<BrowserOperationResult<{
        ClearedCount: number;
    }>> {
        return this.domBridge.ClearHighlights(highlightId);
    }

    /**
     * Waits for a user action on the page.
     */
    public async WaitForUserAction(request: BrowserWaitForActionRequest): Promise<BrowserOperationResult<{
        Completed: boolean;
        TriggeredBy: string;
    }>> {
        return this.domBridge.WaitForUserAction(request);
    }

    /**
     * Captures a viewport screenshot via `chrome.tabs.captureVisibleTab`.
     */
    public async CaptureScreenshot(): Promise<BrowserOperationResult<{ Base64Jpeg: string }>> {
        if (!this.captureVisibleTab) {
            return {
                Success: false,
                BackendUsed: 'content-script',
                EscalatedToDebugger: false,
                ErrorCode: 'screenshot_unavailable',
                ErrorMessage: 'CaptureVisibleTab callback is not configured.',
            };
        }
        const raw = await this.captureVisibleTab();
        const cleaned = raw.startsWith('data:') && raw.includes(',')
            ? raw.slice(raw.indexOf(',') + 1)
            : raw;

        return {
            Success: true,
            BackendUsed: 'content-script',
            EscalatedToDebugger: false,
            Data: { Base64Jpeg: cleaned },
        };
    }

    /**
     * No-op in Mode 1 (`'content-script'` never attaches `chrome.debugger`).
     */
    public async DetachDebugger(): Promise<void> {
        // Mode 1 never attaches chrome.debugger
    }
}
