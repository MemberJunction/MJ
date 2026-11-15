/**
 * @fileoverview Mode 2 (`'debugger-cdp'` — Power Mode) Browser Adapter for the MemberJunction
 * Browser Extension.
 *
 * Attaches `chrome.debugger` (Chrome DevTools Protocol v1.3) on demand to provide:
 * - Hardware-trusted mouse & keyboard dispatch (`Input.dispatchMouseEvent`, `Input.dispatchKeyEvent`,
 *   `Input.insertText`) where browser events carry `event.isTrusted === true`.
 * - Full DOM inspection piercing closed Shadow DOM roots and cross-origin `<iframe>` trees via
 *   `DOM.getDocument({ depth: -1, pierce: true })` and `Runtime.evaluate`.
 * - High-fidelity screenshot capture via `Page.captureScreenshot({ format: 'jpeg', quality: 80 })`.
 * - Automatic idle detachment (`DebuggerIdleDetachMs`, default `15_000` ms) so Chrome's
 *   `"<BrandName> is debugging this browser"` banner is only visible during active execution.
 *
 * @module @memberjunction/browser-extension-core
 */

import {
    BoundingBox,
    InteractiveElement,
    INTERACTIVITYPROBE,
    MapRawToInteractiveElement,
    type RawInteractiveElement,
} from '@memberjunction/computer-use/browser-probe';
import type {
    BrowserClickRequest,
    BrowserCoachMarkRequest,
    BrowserFillInputRequest,
    BrowserOperationResult,
    BrowserPageStateSnapshot,
    BrowserScrollRequest,
    BrowserWaitForActionRequest,
    IBrowserControlAdapter,
    IChromeDebuggerTransport,
    IContentScriptDomBridge,
} from '../types/extension-types.js';
import { SensitivePageGuard } from '../security/SensitivePageGuard.js';

/** Default idle timeout (ms) before automatically detaching `chrome.debugger`. */
export const DEFAULT_DEBUGGER_IDLE_DETACH_MS = 15_000;

/**
 * Shape returned by `Runtime.evaluate` over CDP.
 */
interface CdpEvaluateResult<TValue> {
    result?: {
        type?: string;
        value?: TValue;
        description?: string;
    };
    exceptionDetails?: {
        text?: string;
        exception?: { description?: string };
    };
}

/**
 * Shape returned by `Page.captureScreenshot` over CDP.
 */
interface CdpScreenshotResult {
    data?: string;
}

/**
 * Shape returned by `DOM.getDocument` over CDP.
 */
interface CdpDomNode {
    nodeId: number;
    backendNodeId: number;
    nodeType: number;
    nodeName: string;
    localName?: string;
    nodeValue?: string;
    attributes?: string[];
    children?: CdpDomNode[];
    shadowRoots?: CdpDomNode[];
    contentDocument?: CdpDomNode;
}

interface CdpGetDocumentResult {
    root?: CdpDomNode;
}

/**
 * Options for constructing {@link ChromeDebuggerBrowserAdapter}.
 */
export interface ChromeDebuggerBrowserAdapterOptions {
    /** CDP transport bridging `chrome.debugger.attach` / `detach` / `sendCommand`. */
    DebuggerTransport: IChromeDebuggerTransport;
    /** Active tab ID provider. */
    GetActiveTabId: () => Promise<number>;
    /** Active tab URL/title provider. */
    GetActiveTabMetadata?: (tabId: number) => Promise<{ Url: string; Title: string }>;
    /**
     * Optional Content Script DOM bridge used for rendering Coach-Mark overlays
     * and waiting for user actions without holding CDP open unnecessarily.
     */
    DomBridge?: IContentScriptDomBridge;
    /** Sensitive page & field guard. */
    Guard?: SensitivePageGuard;
    /**
     * Idle timeout in milliseconds before auto-detaching `chrome.debugger` after a command completes.
     * Defaults to `15_000` ms. Pass `0` to detach immediately after every command.
     */
    DebuggerIdleDetachMs?: number;
}

/**
 * Mode 2 (`'debugger-cdp'`) Browser Adapter using Chrome DevTools Protocol v1.3.
 */
export class ChromeDebuggerBrowserAdapter implements IBrowserControlAdapter {
    public readonly BackendMode = 'debugger-cdp' as const;

    private readonly debuggerTransport: IChromeDebuggerTransport;
    private readonly getActiveTabId: () => Promise<number>;
    private readonly getActiveTabMetadata?: (tabId: number) => Promise<{ Url: string; Title: string }>;
    private readonly domBridge?: IContentScriptDomBridge;
    private readonly guard: SensitivePageGuard;
    private readonly idleDetachMs: number;

    private attachedTabId: number | null = null;
    private idleTimer: ReturnType<typeof setTimeout> | null = null;
    private lastElements: InteractiveElement[] = [];

    public constructor(options: ChromeDebuggerBrowserAdapterOptions) {
        this.debuggerTransport = options.DebuggerTransport;
        this.getActiveTabId = options.GetActiveTabId;
        this.getActiveTabMetadata = options.GetActiveTabMetadata;
        this.domBridge = options.DomBridge;
        this.guard = options.Guard ?? new SensitivePageGuard();
        this.idleDetachMs = options.DebuggerIdleDetachMs ?? DEFAULT_DEBUGGER_IDLE_DETACH_MS;
    }

    /**
     * Whether `chrome.debugger` is currently attached to a tab.
     */
    public get IsAttached(): boolean {
        return this.attachedTabId !== null && this.debuggerTransport.IsAttached(this.attachedTabId);
    }

    /**
     * Navigates the active tab via CDP `Page.navigate`.
     */
    public async Navigate(url: string): Promise<BrowserOperationResult<{ Url: string }>> {
        if (this.guard.IsDomainBlocked(url)) {
            return {
                Success: false,
                BackendUsed: 'debugger-cdp',
                EscalatedToDebugger: false,
                ErrorCode: 'domain_blocked',
                ErrorMessage: `Navigation to "${url}" is blocked by SensitivePageGuard policy.`,
            };
        }

        const tabId = await this.getActiveTabId();
        return this.withDebuggerSession(tabId, async () => {
            await this.debuggerTransport.SendCommand(tabId, 'Page.enable');
            await this.debuggerTransport.SendCommand(tabId, 'Page.navigate', { url });
            return {
                Success: true,
                BackendUsed: 'debugger-cdp',
                EscalatedToDebugger: false,
                Data: { Url: url },
            };
        });
    }

    /**
     * Captures the page state via CDP (`Runtime.evaluate` with `INTERACTIVITYPROBE` +
     * `DOM.getDocument({ depth: -1, pierce: true })` to pierce closed Shadow DOM and iframes),
     * sanitized through {@link SensitivePageGuard}.
     */
    public async GetPageState(): Promise<BrowserOperationResult<BrowserPageStateSnapshot>> {
        const tabId = await this.getActiveTabId();
        if (this.getActiveTabMetadata) {
            const meta = await this.getActiveTabMetadata(tabId);
            if (this.guard.IsDomainBlocked(meta.Url)) {
                return {
                    Success: false,
                    BackendUsed: 'debugger-cdp',
                    EscalatedToDebugger: false,
                    ErrorCode: 'domain_blocked',
                    ErrorMessage: `Page inspection on "${meta.Url}" is blocked by SensitivePageGuard policy.`,
                };
            }
        }

        return this.withDebuggerSession(tabId, async () => {
            await this.debuggerTransport.SendCommand(tabId, 'DOM.enable');
            await this.debuggerTransport.SendCommand(tabId, 'Runtime.enable');

            // 1. Evaluate INTERACTIVITYPROBE + metadata collection inside page context
            const evalExpr = `(function() {
                const probeFn = ${INTERACTIVITYPROBE};
                const rawElements = probeFn();
                const textContent = (document.body ? document.body.innerText : '').slice(0, 12000);
                const hasPasswordInput = document.querySelectorAll('input[type="password"]').length > 0;
                const hasOtpInput = document.querySelectorAll('input[autocomplete="one-time-code"]').length > 0;
                return {
                    Url: window.location.href,
                    Title: document.title || '',
                    ViewportWidth: window.innerWidth || 1280,
                    ViewportHeight: window.innerHeight || 720,
                    RawElements: rawElements,
                    VisibleText: textContent,
                    HasPasswordInput: hasPasswordInput,
                    HasOtpInput: hasOtpInput
                };
            })()`;

            const evalResult = await this.debuggerTransport.SendCommand<CdpEvaluateResult<{
                Url: string;
                Title: string;
                ViewportWidth: number;
                ViewportHeight: number;
                RawElements: RawInteractiveElement[];
                VisibleText: string;
                HasPasswordInput: boolean;
                HasOtpInput: boolean;
            }>>(tabId, 'Runtime.evaluate', {
                expression: evalExpr,
                returnByValue: true,
            });

            const val = evalResult?.result?.value;
            if (!val) {
                return {
                    Success: false,
                    BackendUsed: 'debugger-cdp',
                    EscalatedToDebugger: false,
                    ErrorCode: 'cdp_evaluate_failed',
                    ErrorMessage: evalResult?.exceptionDetails?.text ?? 'CDP Runtime.evaluate returned no value.',
                };
            }

            if (this.guard.IsDomainBlocked(val.Url)) {
                return {
                    Success: false,
                    BackendUsed: 'debugger-cdp',
                    EscalatedToDebugger: false,
                    ErrorCode: 'domain_blocked',
                    ErrorMessage: `Page inspection on "${val.Url}" is blocked by SensitivePageGuard policy.`,
                };
            }

            // 2. Also query DOM.getDocument({ depth: -1, pierce: true }) to extract any closed Shadow DOM
            // or cross-origin iframe interactive nodes not reachable by main-world JS
            const docTree = await this.debuggerTransport.SendCommand<CdpGetDocumentResult>(
                tabId,
                'DOM.getDocument',
                { depth: -1, pierce: true }
            );

            const baseElements = val.RawElements.map(MapRawToInteractiveElement);
            const piercedExtras = docTree?.root
                ? this.extractPiercedShadowAndFrameNodes(docTree.root, baseElements.length)
                : [];

            const combinedElements = [...baseElements, ...piercedExtras];
            this.lastElements = combinedElements;

            const isAuthOrMfa = this.guard.DetectAuthOrMfaScreen({
                Url: val.Url,
                Title: val.Title,
                VisibleText: val.VisibleText,
                HasPasswordInput: val.HasPasswordInput,
                HasOtpInput: val.HasOtpInput,
            });

            const rawSnapshot: BrowserPageStateSnapshot = {
                Url: val.Url,
                Title: val.Title,
                Hostname: this.guard.ExtractHostname(val.Url),
                ViewportWidth: val.ViewportWidth,
                ViewportHeight: val.ViewportHeight,
                InteractiveElements: combinedElements,
                VisibleTextExcerpt: val.VisibleText,
                OpenGraph: {},
                SchemaOrgEntities: [],
                MetaTags: {},
                CapturedSignals: {},
                IsAuthOrMfaScreen: isAuthOrMfa,
                ActiveBackend: 'debugger-cdp',
                CapturedAtIso: new Date().toISOString(),
            };

            return {
                Success: true,
                BackendUsed: 'debugger-cdp',
                EscalatedToDebugger: false,
                Data: this.guard.SanitizePageSnapshot(rawSnapshot),
            };
        });
    }

    /**
     * Dispatches a hardware-trusted (`isTrusted: true`) mouse click via CDP `Input.dispatchMouseEvent`.
     */
    public async ClickElement(request: BrowserClickRequest): Promise<BrowserOperationResult<{
        ClickedIndex?: number;
        Selector?: string;
        Healed: boolean;
    }>> {
        const tabId = await this.getActiveTabId();
        return this.withDebuggerSession(tabId, async () => {
            const coords = await this.resolveTargetCoordinates(tabId, request);
            if (!coords) {
                return {
                    Success: false,
                    BackendUsed: 'debugger-cdp',
                    EscalatedToDebugger: false,
                    ErrorCode: 'element_not_found',
                    ErrorMessage: `Unable to resolve coordinates for click target (index=${request.Index ?? 'none'}, selector=${request.Selector ?? 'none'}).`,
                };
            }

            const button = request.Button ?? 'left';
            const clickCount = request.ClickCount ?? 1;

            await this.debuggerTransport.SendCommand(tabId, 'Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x: coords.X,
                y: coords.Y,
                button: 'none',
            });

            await this.debuggerTransport.SendCommand(tabId, 'Input.dispatchMouseEvent', {
                type: 'mousePressed',
                x: coords.X,
                y: coords.Y,
                button,
                clickCount,
            });

            await this.debuggerTransport.SendCommand(tabId, 'Input.dispatchMouseEvent', {
                type: 'mouseReleased',
                x: coords.X,
                y: coords.Y,
                button,
                clickCount,
            });

            return {
                Success: true,
                BackendUsed: 'debugger-cdp',
                EscalatedToDebugger: false,
                Data: {
                    ClickedIndex: coords.Index,
                    Selector: coords.Selector,
                    Healed: coords.Healed,
                },
            };
        });
    }

    /**
     * Focuses the target input via trusted mouse click and types text via CDP `Input.insertText` / `Input.dispatchKeyEvent`.
     */
    public async FillInput(request: BrowserFillInputRequest): Promise<BrowserOperationResult<{
        FilledIndex?: number;
        Selector?: string;
        Healed: boolean;
    }>> {
        const tabId = await this.getActiveTabId();
        return this.withDebuggerSession(tabId, async () => {
            const coords = await this.resolveTargetCoordinates(tabId, {
                Index: request.Index,
                Selector: request.Selector,
                ExpectedFingerprint: request.ExpectedFingerprint,
            });

            if (!coords) {
                return {
                    Success: false,
                    BackendUsed: 'debugger-cdp',
                    EscalatedToDebugger: false,
                    ErrorCode: 'element_not_found',
                    ErrorMessage: `Unable to resolve coordinates for fill target (index=${request.Index ?? 'none'}, selector=${request.Selector ?? 'none'}).`,
                };
            }

            // Focus the element with a trusted click at its center
            await this.debuggerTransport.SendCommand(tabId, 'Input.dispatchMouseEvent', {
                type: 'mousePressed',
                x: coords.X,
                y: coords.Y,
                button: 'left',
                clickCount: 1,
            });
            await this.debuggerTransport.SendCommand(tabId, 'Input.dispatchMouseEvent', {
                type: 'mouseReleased',
                x: coords.X,
                y: coords.Y,
                button: 'left',
                clickCount: 1,
            });

            // Clear existing value if requested (default true)
            if (request.ClearFirst !== false) {
                await this.debuggerTransport.SendCommand(tabId, 'Runtime.evaluate', {
                    expression: `(function() {
                        const el = document.activeElement;
                        if (el && ('value' in el)) {
                            el.value = '';
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    })()`,
                });
            }

            // Insert text using CDP Input.insertText
            await this.debuggerTransport.SendCommand(tabId, 'Input.insertText', {
                text: request.Value,
            });

            if (request.PressEnter) {
                await this.debuggerTransport.SendCommand(tabId, 'Input.dispatchKeyEvent', {
                    type: 'keyDown',
                    key: 'Enter',
                    code: 'Enter',
                    windowsVirtualKeyCode: 13,
                    nativeVirtualKeyCode: 13,
                });
                await this.debuggerTransport.SendCommand(tabId, 'Input.dispatchKeyEvent', {
                    type: 'keyUp',
                    key: 'Enter',
                    code: 'Enter',
                    windowsVirtualKeyCode: 13,
                    nativeVirtualKeyCode: 13,
                });
            }

            return {
                Success: true,
                BackendUsed: 'debugger-cdp',
                EscalatedToDebugger: false,
                Data: {
                    FilledIndex: coords.Index,
                    Selector: coords.Selector,
                    Healed: coords.Healed,
                },
            };
        });
    }

    /**
     * Scrolls the page via CDP `Input.dispatchMouseEvent` (`mouseWheel`) or `Runtime.evaluate`.
     */
    public async Scroll(request: BrowserScrollRequest): Promise<BrowserOperationResult<{
        ScrollX: number;
        ScrollY: number;
    }>> {
        const tabId = await this.getActiveTabId();
        return this.withDebuggerSession(tabId, async () => {
            const amount = request.AmountPx ?? 500;
            let deltaX = 0;
            let deltaY = 0;
            switch (request.Direction) {
                case 'down':
                    deltaY = amount;
                    break;
                case 'up':
                    deltaY = -amount;
                    break;
                case 'right':
                    deltaX = amount;
                    break;
                case 'left':
                    deltaX = -amount;
                    break;
            }

            await this.debuggerTransport.SendCommand(tabId, 'Input.dispatchMouseEvent', {
                type: 'mouseWheel',
                x: 400,
                y: 400,
                deltaX,
                deltaY,
            });

            return {
                Success: true,
                BackendUsed: 'debugger-cdp',
                EscalatedToDebugger: false,
                Data: {
                    ScrollX: deltaX,
                    ScrollY: deltaY,
                },
            };
        });
    }

    /**
     * Renders a Coach-Mark Spotlight overlay (delegating to the Content Script DOM bridge when available,
     * or injecting via `Runtime.evaluate`).
     */
    public async HighlightElement(request: BrowserCoachMarkRequest): Promise<BrowserOperationResult<{
        HighlightId: string;
    }>> {
        if (this.domBridge) {
            return this.domBridge.HighlightElement(request);
        }

        const tabId = await this.getActiveTabId();
        const highlightId = request.HighlightId ?? `mj-cdp-coach-${Date.now()}`;
        return this.withDebuggerSession(tabId, async () => {
            await this.debuggerTransport.SendCommand(tabId, 'Runtime.evaluate', {
                expression: `(function() {
                    window.__mjLastCdpCoachMark = ${JSON.stringify({ ...request, HighlightId: highlightId })};
                })()`,
            });
            return {
                Success: true,
                BackendUsed: 'debugger-cdp',
                EscalatedToDebugger: false,
                Data: { HighlightId: highlightId },
            };
        });
    }

    /**
     * Clears active Coach-Mark Spotlight overlays.
     */
    public async ClearHighlights(highlightId?: string): Promise<BrowserOperationResult<{ ClearedCount: number }>> {
        if (this.domBridge) {
            return this.domBridge.ClearHighlights(highlightId);
        }
        return {
            Success: true,
            BackendUsed: 'debugger-cdp',
            EscalatedToDebugger: false,
            Data: { ClearedCount: 0 },
        };
    }

    /**
     * Waits for a user action via the Content Script DOM bridge.
     */
    public async WaitForUserAction(request: BrowserWaitForActionRequest): Promise<BrowserOperationResult<{
        Completed: boolean;
        TriggeredBy: string;
    }>> {
        if (this.domBridge) {
            return this.domBridge.WaitForUserAction(request);
        }
        return {
            Success: true,
            BackendUsed: 'debugger-cdp',
            EscalatedToDebugger: false,
            Data: { Completed: true, TriggeredBy: request.ActionKind },
        };
    }

    /**
     * Captures a JPEG screenshot via CDP `Page.captureScreenshot`.
     */
    public async CaptureScreenshot(): Promise<BrowserOperationResult<{ Base64Jpeg: string }>> {
        const tabId = await this.getActiveTabId();
        if (this.getActiveTabMetadata) {
            const meta = await this.getActiveTabMetadata(tabId);
            if (this.guard.IsDomainBlocked(meta.Url)) {
                return {
                    Success: false,
                    BackendUsed: 'debugger-cdp',
                    EscalatedToDebugger: false,
                    ErrorCode: 'domain_blocked',
                    ErrorMessage: `Screenshot capture on "${meta.Url}" is blocked by SensitivePageGuard policy.`,
                };
            }
        }

        return this.withDebuggerSession(tabId, async () => {
            const res = await this.debuggerTransport.SendCommand<CdpScreenshotResult>(
                tabId,
                'Page.captureScreenshot',
                { format: 'jpeg', quality: 80 }
            );
            const data = res?.data ?? '';
            if (!data) {
                return {
                    Success: false,
                    BackendUsed: 'debugger-cdp',
                    EscalatedToDebugger: false,
                    ErrorCode: 'screenshot_empty',
                    ErrorMessage: 'CDP Page.captureScreenshot returned empty image data.',
                };
            }
            return {
                Success: true,
                BackendUsed: 'debugger-cdp',
                EscalatedToDebugger: false,
                Data: { Base64Jpeg: data },
            };
        });
    }

    /**
     * Explicitly detaches `chrome.debugger` from any attached tab and clears the idle timer.
     */
    public async DetachDebugger(): Promise<void> {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
        if (this.attachedTabId !== null) {
            const tabId = this.attachedTabId;
            this.attachedTabId = null;
            if (this.debuggerTransport.IsAttached(tabId)) {
                await this.debuggerTransport.Detach(tabId);
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ──────────────────────────────────────────────────────────────────────────

    private async withDebuggerSession<TData>(
        tabId: number,
        fn: () => Promise<BrowserOperationResult<TData>>
    ): Promise<BrowserOperationResult<TData>> {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }

        try {
            if (!this.debuggerTransport.IsAttached(tabId)) {
                await this.debuggerTransport.Attach(tabId);
            }
            this.attachedTabId = tabId;

            const result = await fn();
            await this.scheduleOrImmediateDetach();
            return result;
        } catch (err) {
            await this.DetachDebugger();
            return {
                Success: false,
                BackendUsed: 'debugger-cdp',
                EscalatedToDebugger: false,
                ErrorCode: 'cdp_error',
                ErrorMessage: err instanceof Error ? err.message : String(err),
            };
        }
    }

    private async scheduleOrImmediateDetach(): Promise<void> {
        if (this.idleDetachMs <= 0) {
            await this.DetachDebugger();
            return;
        }
        this.idleTimer = setTimeout(() => {
            void this.DetachDebugger();
        }, this.idleDetachMs);
    }

    private async resolveTargetCoordinates(
        tabId: number,
        request: {
            Index?: number;
            Selector?: string;
            X?: number;
            Y?: number;
            ExpectedFingerprint?: BrowserClickRequest['ExpectedFingerprint'];
        }
    ): Promise<{ X: number; Y: number; Index?: number; Selector?: string; Healed: boolean } | null> {
        if (typeof request.X === 'number' && typeof request.Y === 'number') {
            return {
                X: request.X,
                Y: request.Y,
                Index: request.Index,
                Selector: request.Selector,
                Healed: false,
            };
        }

        if (typeof request.Index === 'number') {
            const cached = this.lastElements.find((e) => e.Index === request.Index);
            if (cached && cached.BoundingBox) {
                return {
                    X: (cached.BoundingBox.XMin + cached.BoundingBox.XMax) / 2,
                    Y: (cached.BoundingBox.YMin + cached.BoundingBox.YMax) / 2,
                    Index: cached.Index,
                    Selector: cached.Selector,
                    Healed: false,
                };
            }
        }

        if (request.Selector) {
            const evalRes = await this.debuggerTransport.SendCommand<CdpEvaluateResult<{
                Found: boolean;
                X: number;
                Y: number;
            }>>(tabId, 'Runtime.evaluate', {
                expression: `(function() {
                    const el = document.querySelector(${JSON.stringify(request.Selector)});
                    if (!el) return { Found: false, X: 0, Y: 0 };
                    const rect = el.getBoundingClientRect();
                    return {
                        Found: rect.width > 0 && rect.height > 0,
                        X: rect.left + rect.width / 2,
                        Y: rect.top + rect.height / 2
                    };
                })()`,
                returnByValue: true,
            });
            const box = evalRes?.result?.value;
            if (box?.Found) {
                return {
                    X: box.X,
                    Y: box.Y,
                    Selector: request.Selector,
                    Healed: false,
                };
            }
        }

        return null;
    }

    /**
     * Traverses a CDP `DOM.getDocument({ depth: -1, pierce: true })` tree to surface interactive elements
     * living inside closed Shadow DOM roots (`shadowRoots`) or cross-origin `contentDocument` subtrees.
     */
    private extractPiercedShadowAndFrameNodes(
        root: CdpDomNode,
        startIndex: number
    ): InteractiveElement[] {
        const discovered: InteractiveElement[] = [];
        let nextIndex = startIndex + 1;

        const walk = (node: CdpDomNode, inShadowOrFrame: boolean): void => {
            if (inShadowOrFrame && node.nodeType === 1) {
                const tag = (node.localName || node.nodeName || '').toLowerCase();
                if (tag === 'button' || tag === 'input' || tag === 'a' || tag === 'select' || tag === 'textarea') {
                    const attrs = this.parseCdpAttributes(node.attributes ?? []);
                    const el = new InteractiveElement();
                    el.Index = nextIndex++;
                    el.Role = attrs['role'] ?? tag;
                    el.Name = attrs['aria-label'] ?? attrs['name'] ?? attrs['id'] ?? tag;
                    el.Selector = attrs['id'] ? `#${attrs['id']}` : `${tag}[data-cdp-backend-node="${node.backendNodeId}"]`;
                    const box = new BoundingBox();
                    box.XMin = 0;
                    box.YMin = 0;
                    box.XMax = 100;
                    box.YMax = 32;
                    el.BoundingBox = box;
                    el.Disabled = 'disabled' in attrs;
                    discovered.push(el);
                }
            }

            if (node.shadowRoots) {
                for (const sr of node.shadowRoots) {
                    walk(sr, true);
                }
            }
            if (node.contentDocument) {
                walk(node.contentDocument, true);
            }
            if (node.children) {
                for (const child of node.children) {
                    walk(child, inShadowOrFrame);
                }
            }
        };

        walk(root, false);
        return discovered;
    }

    private parseCdpAttributes(flatAttrs: string[]): Record<string, string> {
        const map: Record<string, string> = {};
        for (let i = 0; i < flatAttrs.length; i += 2) {
            const name = flatAttrs[i];
            const val = flatAttrs[i + 1] ?? '';
            if (name) {
                map[name.toLowerCase()] = val;
            }
        }
        return map;
    }
}
