/**
 * @fileoverview Shadow-DOM Coach-Mark & Spotlight Overlay Renderer.
 *
 * Draws animated, brand-themed spotlight rings and floating coaching callout cards
 * directly over the live web page at 60fps inside an isolated Shadow DOM root
 * (`#mj-ext-coach-mark-host`).
 *
 * @module @memberjunction/browser-extension-core
 */

import { BoundingBox, ResolveDomSelector } from '@memberjunction/computer-use/browser-probe';
import type { BrowserCoachMarkRequest } from '../types/extension-types.js';

/** DOM element ID of the Shadow-DOM host injected into `document.body`. */
export const COACH_MARK_HOST_ID = 'mj-ext-coach-mark-host';

/**
 * Active highlight entry tracked by {@link CoachMarkOverlayRenderer}.
 */
export interface ActiveCoachMarkEntry {
    HighlightId: string;
    Request: BrowserCoachMarkRequest;
    BoundingBox: BoundingBox;
    TargetElement: HTMLElement | null;
}

/**
 * Renders and manages Shadow-DOM Coach-Mark Spotlights on the active web page.
 */
export class CoachMarkOverlayRenderer {
    private readonly rootDoc: Document | null;
    private hostElement: HTMLElement | null = null;
    private shadowRoot: ShadowRoot | null = null;
    private readonly activeMarks = new Map<string, ActiveCoachMarkEntry>();
    private nextSeq = 1;

    public constructor(options: { Document?: Document; DefaultAccentColor?: string } = {}) {
        this.rootDoc = options.Document ?? (typeof document !== 'undefined' ? document : null);
    }

    /**
     * Number of active Coach-Mark Spotlight overlays currently rendered.
     */
    public get ActiveCount(): number {
        return this.activeMarks.size;
    }

    /**
     * Renders a Coach-Mark Spotlight ring and floating instruction callout around a target element or bounding box.
     */
    public RenderCoachMark(
        request: BrowserCoachMarkRequest,
        resolvedElement?: HTMLElement | null
    ): { Success: boolean; HighlightId: string; BoundingBox?: BoundingBox; ErrorMessage?: string } {
        const highlightId = request.HighlightId ?? `mj-coach-mark-${this.nextSeq++}`;
        const targetEl =
            resolvedElement ??
            (request.Selector && this.rootDoc ? ResolveDomSelector(request.Selector, this.rootDoc) : null);

        const box = this.resolveBoundingBox(request, targetEl);
        if (!box) {
            return {
                Success: false,
                HighlightId: highlightId,
                ErrorMessage: `Unable to resolve bounding box for coach mark "${request.Label}" (selector: ${request.Selector ?? 'none'}).`,
            };
        }

        const entry: ActiveCoachMarkEntry = {
            HighlightId: highlightId,
            Request: { ...request, HighlightId: highlightId },
            BoundingBox: box,
            TargetElement: targetEl ?? null,
        };
        this.activeMarks.set(highlightId, entry);
        this.renderShadowDom();

        return {
            Success: true,
            HighlightId: highlightId,
            BoundingBox: box,
        };
    }

    /**
     * Removes a specific Coach-Mark Spotlight (or all active spotlights when `highlightId` is omitted).
     */
    public ClearHighlights(highlightId?: string): number {
        if (highlightId) {
            const existed = this.activeMarks.delete(highlightId);
            if (this.activeMarks.size === 0) {
                this.teardownHost();
            } else {
                this.renderShadowDom();
            }
            return existed ? 1 : 0;
        }

        const count = this.activeMarks.size;
        this.activeMarks.clear();
        this.teardownHost();
        return count;
    }

    private teardownHost(): void {
        if (this.hostElement && this.hostElement.parentNode) {
            this.hostElement.parentNode.removeChild(this.hostElement);
        }
        this.hostElement = null;
        this.shadowRoot = null;
    }

    private resolveBoundingBox(
        request: BrowserCoachMarkRequest,
        targetEl: HTMLElement | null
    ): BoundingBox | null {
        if (targetEl && typeof targetEl.getBoundingClientRect === 'function') {
            const rect = targetEl.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                const box = new BoundingBox();
                box.XMin = Math.round(rect.left);
                box.YMin = Math.round(rect.top);
                box.XMax = Math.round(rect.left + rect.width);
                box.YMax = Math.round(rect.top + rect.height);
                return box;
            }
        }
        if (request.BoundingBox) {
            const box = new BoundingBox();
            box.XMin = request.BoundingBox.XMin;
            box.YMin = request.BoundingBox.YMin;
            box.XMax = request.BoundingBox.XMax;
            box.YMax = request.BoundingBox.YMax;
            return box;
        }
        return null;
    }

    private ensureShadowRoot(): ShadowRoot | null {
        if (!this.rootDoc || !this.rootDoc.body) {
            return null;
        }
        if (this.shadowRoot && this.hostElement && this.rootDoc.body.contains(this.hostElement)) {
            return this.shadowRoot;
        }

        const existing = this.rootDoc.getElementById(COACH_MARK_HOST_ID);
        if (existing && existing.parentNode) {
            existing.parentNode.removeChild(existing);
        }

        const host = this.rootDoc.createElement('div');
        host.id = COACH_MARK_HOST_ID;
        host.setAttribute('data-mj-extension-overlay', 'true');
        host.style.cssText =
            'position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; overflow: visible;';
        this.rootDoc.body.appendChild(host);
        this.hostElement = host;

        if (typeof host.attachShadow === 'function') {
            this.shadowRoot = host.attachShadow({ mode: 'open' });
        }
        return this.shadowRoot;
    }

    private renderShadowDom(): void {
        const shadow = this.ensureShadowRoot();
        if (!shadow || !this.rootDoc) {
            return;
        }

        while (shadow.firstChild) {
            shadow.removeChild(shadow.firstChild);
        }

        const styleEl = this.rootDoc.createElement('style');
        styleEl.textContent = `
            :host {
                all: initial;
                font-family: var(--mj-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
            }
            @keyframes mj-spotlight-pulse {
                0% { transform: scale(1); opacity: 0.85; }
                50% { transform: scale(1.04); opacity: 0.4; }
                100% { transform: scale(1); opacity: 0.85; }
            }
            .mj-spotlight-ring {
                position: fixed;
                pointer-events: none;
                border-radius: var(--mj-radius-md, 8px);
                border: 3px solid var(--mj-coach-accent, var(--mj-brand-primary));
                box-shadow: 0 0 0 4px color-mix(in srgb, var(--mj-coach-accent, var(--mj-brand-primary)) 25%, transparent);
                box-sizing: border-box;
            }
            .mj-spotlight-ring::after {
                content: '';
                position: absolute;
                inset: -6px;
                border-radius: calc(var(--mj-radius-md, 8px) + 4px);
                border: 2px solid var(--mj-coach-accent, var(--mj-brand-primary));
                animation: mj-spotlight-pulse 1.8s infinite ease-in-out;
            }
            .mj-callout-card {
                position: fixed;
                pointer-events: auto;
                max-width: 300px;
                padding: 10px 14px;
                border-radius: var(--mj-radius-lg, 10px);
                background: var(--mj-bg-surface-elevated);
                color: var(--mj-text-primary);
                border: 1px solid var(--mj-coach-accent, var(--mj-brand-primary));
                box-shadow: var(--mj-shadow-brand-md);
                font-size: 13px;
                line-height: 1.45;
            }
            .mj-step-badge {
                display: inline-block;
                padding: 2px 8px;
                margin-bottom: 6px;
                border-radius: 999px;
                background: var(--mj-coach-accent, var(--mj-brand-primary));
                color: var(--mj-brand-on-primary);
                font-size: 11px;
                font-weight: 600;
            }
            .mj-headline {
                font-weight: 600;
                margin: 0;
            }
        `;
        shadow.appendChild(styleEl);

        const pad = 4;
        for (const entry of this.activeMarks.values()) {
            const { Request: req, BoundingBox: box } = entry;
            const accent = req.AccentColor ?? 'var(--mj-brand-primary)';
            const left = Math.max(0, box.XMin - pad);
            const top = Math.max(0, box.YMin - pad);
            const width = Math.max(12, box.XMax - box.XMin + pad * 2);
            const height = Math.max(12, box.YMax - box.YMin + pad * 2);

            const ring = this.rootDoc.createElement('div');
            ring.className = 'mj-spotlight-ring';
            ring.setAttribute('data-coach-mark-id', entry.HighlightId);
            ring.style.setProperty('--mj-coach-accent', accent);
            ring.style.left = `${left}px`;
            ring.style.top = `${top}px`;
            ring.style.width = `${width}px`;
            ring.style.height = `${height}px`;
            shadow.appendChild(ring);

            const card = this.rootDoc.createElement('div');
            card.className = 'mj-callout-card';
            card.setAttribute('data-coach-callout-id', entry.HighlightId);
            card.style.setProperty('--mj-coach-accent', accent);
            card.style.left = `${left}px`;
            card.style.top = `${top + height + 10}px`;

            if (req.StepBadge) {
                const badge = this.rootDoc.createElement('span');
                badge.className = 'mj-step-badge';
                badge.textContent = req.StepBadge;
                card.appendChild(badge);
            }

            const headline = this.rootDoc.createElement('p');
            headline.className = 'mj-headline';
            headline.textContent = req.Label;
            card.appendChild(headline);

            shadow.appendChild(card);
        }
    }
}
