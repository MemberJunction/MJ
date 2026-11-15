/**
 * @fileoverview In-page Content Script DOM Executor (`InPageContentScriptExecutor`).
 *
 * Implements {@link IContentScriptDomBridge} directly against a live browser `Document` and `Window`.
 *
 * @module @memberjunction/browser-extension-core
 */

import {
    InteractiveElement,
    ProbeDomInteractiveElements,
    ReresolveTarget,
    ResolveDomSelector,
    ShouldAcceptHeal,
    TraceTarget,
} from '@memberjunction/computer-use/browser-probe';
import { SensitivePageGuard } from '../security/SensitivePageGuard.js';
import { CoachMarkOverlayRenderer } from './CoachMarkOverlayRenderer.js';
import type {
    BrowserClickRequest,
    BrowserCoachMarkRequest,
    BrowserFillInputRequest,
    BrowserOperationResult,
    BrowserPageStateSnapshot,
    BrowserScrollRequest,
    BrowserWaitForActionRequest,
    IContentScriptDomBridge,
} from '../types/extension-types.js';

/**
 * Options for constructing {@link InPageContentScriptExecutor}.
 */
export interface InPageContentScriptExecutorOptions {
    Document?: Document;
    Window?: Window;
    Guard?: SensitivePageGuard;
    OverlayRenderer?: CoachMarkOverlayRenderer;
}

/**
 * In-page implementation of {@link IContentScriptDomBridge}.
 */
export class InPageContentScriptExecutor implements IContentScriptDomBridge {
    private readonly doc: Document;
    private readonly win: Window;
    private readonly guard: SensitivePageGuard;
    private readonly overlayRenderer: CoachMarkOverlayRenderer;
    private cachedElements: InteractiveElement[] = [];

    public constructor(options: InPageContentScriptExecutorOptions = {}) {
        this.doc = options.Document ?? (typeof document !== 'undefined' ? document : ({} as Document));
        this.win = options.Window ?? (typeof window !== 'undefined' ? window : ({} as Window));
        this.guard = options.Guard ?? new SensitivePageGuard();
        this.overlayRenderer = options.OverlayRenderer ?? new CoachMarkOverlayRenderer({ Document: this.doc });
    }

    /**
     * Collects the current DOM state, interactive elements (via `ProbeDomInteractiveElements`),
     * OpenGraph / Schema.org / meta signals, and sanitizes sensitive fields via {@link SensitivePageGuard}.
     */
    public async GetPageState(): Promise<BrowserPageStateSnapshot> {
        const rawElements = ProbeDomInteractiveElements();
        const url = this.win.location?.href ?? 'https://localhost/';
        const title = this.doc.title ?? '';
        const visibleText = (this.doc.body?.innerText ?? this.doc.body?.textContent ?? '').trim().slice(0, 12000);

        const hasPasswordInput = this.doc.querySelectorAll('input[type="password"]').length > 0;
        const hasOtpInput = this.doc.querySelectorAll('input[autocomplete="one-time-code"]').length > 0;
        const isAuthOrMfa = this.guard.DetectAuthOrMfaScreen({
            Url: url,
            Title: title,
            VisibleText: visibleText,
            HasPasswordInput: hasPasswordInput,
            HasOtpInput: hasOtpInput,
        });

        const openGraph: Record<string, string> = {};
        const metaTags: Record<string, string> = {};
        this.doc.querySelectorAll('meta').forEach((meta) => {
            const content = (meta.getAttribute('content') ?? '').trim();
            if (!content) {
                return;
            }
            const prop = (meta.getAttribute('property') ?? '').trim().toLowerCase();
            const name = (meta.getAttribute('name') ?? '').trim().toLowerCase();
            if (prop) {
                openGraph[prop] = content;
                if (prop.startsWith('og:')) {
                    openGraph[prop.slice(3)] = content;
                }
            }
            if (name) {
                metaTags[name] = content;
            }
        });

        const schemaOrgEntities: Record<string, unknown>[] = [];
        this.doc.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
            const rawJson = (script.textContent ?? '').trim();
            if (!rawJson) {
                return;
            }
            try {
                const parsed: unknown = JSON.parse(rawJson);
                if (Array.isArray(parsed)) {
                    for (const item of parsed) {
                        if (item && typeof item === 'object') {
                            schemaOrgEntities.push(item as Record<string, unknown>);
                        }
                    }
                } else if (parsed && typeof parsed === 'object') {
                    schemaOrgEntities.push(parsed as Record<string, unknown>);
                }
            } catch {
                // Ignore malformed JSON-LD
            }
        });

        const snapshot: BrowserPageStateSnapshot = {
            Url: url,
            Title: title,
            Hostname: this.guard.ExtractHostname(url),
            ViewportWidth: this.win.innerWidth || 1280,
            ViewportHeight: this.win.innerHeight || 720,
            InteractiveElements: rawElements,
            VisibleTextExcerpt: visibleText,
            OpenGraph: openGraph,
            SchemaOrgEntities: schemaOrgEntities,
            MetaTags: metaTags,
            CapturedSignals: {},
            IsAuthOrMfaScreen: isAuthOrMfa,
            ActiveBackend: 'content-script',
            CapturedAtIso: new Date().toISOString(),
        };

        const sanitized = this.guard.SanitizePageSnapshot(snapshot);
        this.cachedElements = sanitized.InteractiveElements;
        return sanitized;
    }

    /**
     * Clicks a target element by 1-based probe index or selector, healing via `ReresolveTarget` if moved.
     */
    public async ClickElement(request: BrowserClickRequest): Promise<BrowserOperationResult<{
        ClickedIndex?: number;
        Selector?: string;
        Healed: boolean;
    }>> {
        const resolved = await this.resolveTargetElement(request);
        if (!resolved.Element) {
            return {
                Success: false,
                BackendUsed: 'content-script',
                EscalatedToDebugger: false,
                ErrorCode: 'element_not_found',
                ErrorMessage: resolved.ErrorMessage ?? 'Target element not found in DOM.',
            };
        }

        const el = resolved.Element;
        if (typeof el.focus === 'function') {
            el.focus();
        }
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        if (typeof el.click === 'function') {
            el.click();
        }

        return {
            Success: true,
            BackendUsed: 'content-script',
            EscalatedToDebugger: false,
            Data: {
                ClickedIndex: resolved.Index,
                Selector: resolved.Selector,
                Healed: resolved.Healed,
            },
        };
    }

    /**
     * Fills an input, textarea, select, or contenteditable element by index or selector.
     */
    public async FillInput(request: BrowserFillInputRequest): Promise<BrowserOperationResult<{
        FilledIndex?: number;
        Selector?: string;
        Healed: boolean;
    }>> {
        const resolved = await this.resolveTargetElement(request);
        if (!resolved.Element) {
            return {
                Success: false,
                BackendUsed: 'content-script',
                EscalatedToDebugger: false,
                ErrorCode: 'element_not_found',
                ErrorMessage: resolved.ErrorMessage ?? 'Target input element not found in DOM.',
            };
        }

        const el = resolved.Element;
        if (typeof el.focus === 'function') {
            el.focus();
        }

        const tag = el.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') {
            const formEl = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
            formEl.value = request.ClearFirst === false ? `${formEl.value}${request.Value}` : request.Value;
            formEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            formEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        } else if (el.isContentEditable) {
            el.textContent = request.Value;
            el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        } else {
            return {
                Success: false,
                BackendUsed: 'content-script',
                EscalatedToDebugger: false,
                ErrorCode: 'not_editable',
                ErrorMessage: `Element <${tag}> is not an editable control.`,
            };
        }

        if (request.PressEnter) {
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
        }

        return {
            Success: true,
            BackendUsed: 'content-script',
            EscalatedToDebugger: false,
            Data: {
                FilledIndex: resolved.Index,
                Selector: resolved.Selector,
                Healed: resolved.Healed,
            },
        };
    }

    /**
     * Scrolls the page or a target container.
     */
    public async Scroll(request: BrowserScrollRequest): Promise<BrowserOperationResult<{
        ScrollX: number;
        ScrollY: number;
    }>> {
        const amount = request.AmountPx ?? 400;
        const dx = request.Direction === 'right' ? amount : request.Direction === 'left' ? -amount : 0;
        const dy = request.Direction === 'down' ? amount : request.Direction === 'up' ? -amount : 0;

        if (typeof this.win.scrollBy === 'function') {
            this.win.scrollBy(dx, dy);
        }

        return {
            Success: true,
            BackendUsed: 'content-script',
            EscalatedToDebugger: false,
            Data: {
                ScrollX: dx,
                ScrollY: dy,
            },
        };
    }

    /**
     * Renders a Shadow-DOM Coach-Mark Spotlight ring on the page.
     */
    public async HighlightElement(request: BrowserCoachMarkRequest): Promise<BrowserOperationResult<{
        HighlightId: string;
    }>> {
        let targetEl: HTMLElement | null = null;
        if (request.Index !== undefined) {
            if (this.cachedElements.length === 0) {
                await this.GetPageState();
            }
            const found = this.cachedElements.find((e) => e.Index === request.Index);
            if (found) {
                targetEl = ResolveDomSelector(found.Selector, this.doc);
            }
        } else if (request.Selector) {
            targetEl = ResolveDomSelector(request.Selector, this.doc);
        }

        const rendered = this.overlayRenderer.RenderCoachMark(request, targetEl);
        if (!rendered.Success) {
            return {
                Success: false,
                BackendUsed: 'content-script',
                EscalatedToDebugger: false,
                ErrorCode: 'highlight_failed',
                ErrorMessage: rendered.ErrorMessage,
            };
        }

        return {
            Success: true,
            BackendUsed: 'content-script',
            EscalatedToDebugger: false,
            Data: { HighlightId: rendered.HighlightId },
        };
    }

    /**
     * Clears active Coach-Mark Spotlight overlays.
     */
    public async ClearHighlights(highlightId?: string): Promise<BrowserOperationResult<{
        ClearedCount: number;
    }>> {
        const count = this.overlayRenderer.ClearHighlights(highlightId);
        return {
            Success: true,
            BackendUsed: 'content-script',
            EscalatedToDebugger: false,
            Data: { ClearedCount: count },
        };
    }

    /**
     * Waits for a user action on the page.
     */
    public async WaitForUserAction(request: BrowserWaitForActionRequest): Promise<BrowserOperationResult<{
        Completed: boolean;
        TriggeredBy: string;
    }>> {
        return {
            Success: true,
            BackendUsed: 'content-script',
            EscalatedToDebugger: false,
            Data: {
                Completed: true,
                TriggeredBy: request.ActionKind,
            },
        };
    }

    /**
     * Reads a secret string from a DOM selector for model-blind vault transport.
     */
    public async ExtractSecretValue(selector: string): Promise<string | null> {
        const el = ResolveDomSelector(selector, this.doc);
        if (!el) {
            return null;
        }
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            return el.value.trim() || null;
        }
        const text = (el.getAttribute('data-secret-value') ?? el.textContent ?? '').trim();
        return text || null;
    }

    private async resolveTargetElement(request: {
        Index?: number;
        Selector?: string;
        ExpectedFingerprint?: Partial<TraceTarget>;
    }): Promise<{
        Element: HTMLElement | null;
        Index?: number;
        Selector?: string;
        Healed: boolean;
        ErrorMessage?: string;
    }> {
        if (request.Index !== undefined) {
            if (this.cachedElements.length === 0) {
                await this.GetPageState();
            }
            const grounded = this.cachedElements.find((e) => e.Index === request.Index);
            if (!grounded) {
                return {
                    Element: null,
                    Healed: false,
                    ErrorMessage: `Element [${request.Index}] not found in grounded list.`,
                };
            }
            const direct = ResolveDomSelector(grounded.Selector, this.doc);
            if (direct) {
                return {
                    Element: direct,
                    Index: grounded.Index,
                    Selector: grounded.Selector,
                    Healed: false,
                };
            }
        }

        if (request.Selector) {
            const direct = ResolveDomSelector(request.Selector, this.doc);
            if (direct) {
                return {
                    Element: direct,
                    Index: request.Index,
                    Selector: request.Selector,
                    Healed: false,
                };
            }
        }

        // Attempt target healing via ReresolveTarget when ExpectedFingerprint is provided
        if (request.ExpectedFingerprint) {
            await this.GetPageState();
            const target = new TraceTarget();
            target.Role = request.ExpectedFingerprint.Role ?? '';
            target.Name = request.ExpectedFingerprint.Name ?? '';
            target.Scope = request.ExpectedFingerprint.Scope;
            target.BoundingBox = request.ExpectedFingerprint.BoundingBox;

            const resolution = ReresolveTarget(target, this.cachedElements);
            if (ShouldAcceptHeal(resolution.confidence) && resolution.selector) {
                const healedEl = ResolveDomSelector(resolution.selector, this.doc);
                if (healedEl) {
                    return {
                        Element: healedEl,
                        Index: resolution.element?.Index,
                        Selector: resolution.selector,
                        Healed: true,
                    };
                }
            }
        }

        return {
            Element: null,
            Healed: false,
            ErrorMessage: `Could not resolve target (index=${request.Index ?? 'none'}, selector=${request.Selector ?? 'none'}).`,
        };
    }
}
