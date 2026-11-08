/**
 * @fileoverview Playwright-free browser DOM grounding probe and deterministic target-healing module.
 *
 * Shared between:
 * 1. `PlaywrightBrowserAdapter` (server-side ComputerUse & RemoteBrowser via `page.evaluate(INTERACTIVITYPROBE)`), and
 * 2. `ContentScriptBrowserAdapter` (`@memberjunction/browser-extension-core`, running directly inside a Manifest V3 content script).
 *
 * Contains zero Node.js or Playwright dependencies so it can be bundled directly into browser
 * content scripts, service workers, or side panels.
 *
 * @module @memberjunction/computer-use/browser-probe
 */

import { InteractiveElement, BoundingBox } from '../types/browser.js';

/**
 * Raw per-element record returned by the in-page {@link INTERACTIVITYPROBE} function.
 * Plain JSON-serializable shape so it crosses `page.evaluate()` and `chrome.runtime` message ports unmodified.
 */
export interface RawInteractiveElement {
    /** ARIA or implicit HTML role (e.g., `'button'`, `'link'`, `'textbox'`, `'combobox'`). */
    role: string;
    /** Accessible name derived from `aria-label`, `aria-labelledby`, `<label for>`, `placeholder`, `title`, or visible text. */
    name: string;
    /** Absolute positional XPath from `/html/...` for exact fast-path targeting. */
    xpath: string;
    /** Nearest named landmark ancestor region formatted as `role:name`, or `''` when none exists. */
    scope: string;
    /** Current value of form controls (`input`, `textarea`, `select`), or `null` for non-form elements. */
    value: string | null;
    /** Left viewport coordinate in CSS pixels (`getBoundingClientRect().left`). */
    x: number;
    /** Top viewport coordinate in CSS pixels (`getBoundingClientRect().top`). */
    y: number;
    /** Element width in CSS pixels (`getBoundingClientRect().width`). */
    width: number;
    /** Element height in CSS pixels (`getBoundingClientRect().height`). */
    height: number;
    /** True when the element has vertical scroll overflow (`overflow-y: auto | scroll` and `scrollHeight > clientHeight + 4`). */
    scrollable: boolean;
    /** True when the element has `disabled === true` or `aria-disabled="true"`. */
    disabled: boolean;
}

/**
 * Map a single {@link RawInteractiveElement} record and its 0-based index into a typed {@link InteractiveElement}.
 *
 * @param r - Raw record produced by {@link INTERACTIVITYPROBE}.
 * @param index - Zero-based index in the grounded element list.
 * @returns Populated {@link InteractiveElement} instance.
 */
export function MapRawToInteractiveElement(r: RawInteractiveElement, index: number): InteractiveElement {
    const el = new InteractiveElement();
    el.Index = index;
    el.Role = r.role;
    el.Name = r.name;
    el.Selector = `xpath=${r.xpath}`;
    el.Scope = r.scope || undefined;
    el.Value = r.value ?? undefined;
    el.Scrollable = r.scrollable;
    el.Disabled = r.disabled;
    if (r.width > 0 && r.height > 0) {
        const box = new BoundingBox();
        box.XMin = Math.round(r.x);
        box.YMin = Math.round(r.y);
        box.XMax = Math.round(r.x + r.width);
        box.YMax = Math.round(r.y + r.height);
        el.BoundingBox = box;
    }
    return el;
}

/**
 * The self-contained in-page interactivity probe.
 *
 * Serialized into the browser via `page.evaluate(INTERACTIVITYPROBE)` on Playwright, or invoked
 * directly inside a Manifest V3 Content Script. Returns interactive elements in DOM order with
 * role, accessible name, XPath, landmark scope, bounding box, and scrollable/disabled/value flags.
 *
 * Kept as a single self-contained function with zero external closure references so `Function.prototype.toString()`
 * serialization works in `page.evaluate`.
 */
export const INTERACTIVITYPROBE = (): RawInteractiveElement[] => {
    const INTERACTIVE_SELECTOR = [
        'a[href]', 'button', 'input', 'select', 'textarea', 'summary',
        '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]',
        '[role="tab"]', '[role="menuitem"]', '[role="switch"]', '[role="combobox"]',
        '[role="option"]', '[role="textbox"]', '[contenteditable=""]', '[contenteditable="true"]',
        // Splitters/resize handles. Draggable but not clickable, so they carry no
        // role="button" and no tabindex — without this they were invisible to
        // grounding, and a goal like "drag the handle to resize the panel" left the
        // agent estimating coordinates against a ~6px target it could not see.
        '[role="separator"]',
        '[onclick]', '[tabindex]',
    ].join(',');

    // The same list minus the two catch-alls, so the probe can ask "did this match
    // because it IS interactive, or only because it carries a tabindex?".
    const INTERACTIVE_WITHOUT_TABINDEX = INTERACTIVE_SELECTOR
        .split(',')
        .filter(sel => sel !== '[tabindex]' && sel !== '[onclick]')
        .join(',');

    const xpathOf = (node: Element): string => {
        const segments: string[] = [];
        let el: Element | null = node;
        while (el && el.nodeType === 1 && el !== document.documentElement) {
            let index = 1;
            let sib = el.previousElementSibling;
            while (sib) {
                if (sib.tagName === el.tagName) index++;
                sib = sib.previousElementSibling;
            }
            segments.unshift(`${el.tagName.toLowerCase()}[${index}]`);
            el = el.parentElement;
        }
        return `/html/${segments.join('/')}`;
    };

    const roleOf = (el: Element): string => {
        const explicit = el.getAttribute('role');
        if (explicit) return explicit;
        const tag = el.tagName.toLowerCase();
        if (tag === 'a') return 'link';
        if (tag === 'button' || tag === 'summary') return 'button';
        if (tag === 'select') return 'combobox';
        if (tag === 'textarea') return 'textbox';
        if (tag === 'input') {
            const t = (el.getAttribute('type') || 'text').toLowerCase();
            if (t === 'checkbox') return 'checkbox';
            if (t === 'radio') return 'radio';
            if (t === 'button' || t === 'submit' || t === 'reset') return 'button';
            return 'textbox';
        }
        return el.getAttribute('role') || tag;
    };

    const nameOf = (el: Element): string => {
        const aria = el.getAttribute('aria-label');
        if (aria) return aria.trim();
        const labelledby = el.getAttribute('aria-labelledby');
        if (labelledby) {
            const ref = document.getElementById(labelledby);
            if (ref?.textContent) return ref.textContent.trim();
        }
        if (el.id) {
            const escapedId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
                ? CSS.escape(el.id)
                : el.id.replace(/["\\]/g, '\\$&');
            const label = document.querySelector(`label[for="${escapedId}"]`);
            if (label?.textContent) return label.textContent.trim();
        }
        const placeholder = el.getAttribute('placeholder');
        if (placeholder) return placeholder.trim();
        const title = el.getAttribute('title');
        if (title) return title.trim();
        const text = (el as HTMLElement).innerText || el.textContent || '';
        return text.trim().slice(0, 120);
    };

    /**
     * Landmark roles that bound a meaningful region of the page. An element's
     * nearest NAMED such ancestor is the semantic answer to "where does this
     * live" — stable across the reordering and relayout that break a positional
     * path, and the only thing that separates same-named twins in different
     * parts of one screen.
     */
    const SCOPE_ROLES = new Set([
        'group', 'region', 'dialog', 'alertdialog', 'navigation', 'main', 'form',
        'table', 'grid', 'list', 'listbox', 'tabpanel', 'menu', 'toolbar',
        'banner', 'complementary', 'contentinfo', 'search', 'article',
    ]);
    const IMPLICIT_SCOPE_ROLE: Record<string, string> = {
        NAV: 'navigation', MAIN: 'main', FORM: 'form', DIALOG: 'dialog',
        TABLE: 'table', SECTION: 'region', ASIDE: 'complementary',
        HEADER: 'banner', FOOTER: 'contentinfo', UL: 'list', OL: 'list',
        ARTICLE: 'article', SEARCH: 'search',
    };

    /** A region's accessible name — aria-label, else aria-labelledby's text. */
    const regionName = (node: Element): string => {
        const label = node.getAttribute('aria-label');
        if (label && label.trim()) {
            return label.trim();
        }
        const labelledBy = node.getAttribute('aria-labelledby');
        if (!labelledBy) {
            return '';
        }
        return labelledBy
            .split(/\s+/)
            .map(id => document.getElementById(id))
            .map(n => (n?.textContent ?? '').trim())
            .filter(Boolean)
            .join(' ')
            .trim();
    };

    /** `role:name` of the nearest NAMED landmark ancestor, or '' when there is none. */
    const scopeOf = (el: Element): string => {
        let node: Element | null = el.parentElement;
        while (node && node !== document.body) {
            const role = (node.getAttribute('role') || IMPLICIT_SCOPE_ROLE[node.tagName] || '').trim().toLowerCase();
            if (role && SCOPE_ROLES.has(role)) {
                const name = regionName(node);
                // An unnamed landmark cannot be told apart from its siblings, so
                // it is no better a discriminator than the path already is — keep
                // climbing for one that carries a name.
                if (name) {
                    return `${role}:${name}`;
                }
            }
            node = node.parentElement;
        }
        return '';
    };

    const results: RawInteractiveElement[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const seen = new Set<Element>();

    document.querySelectorAll(INTERACTIVE_SELECTOR).forEach(node => {
        const el = node as HTMLElement;
        if (seen.has(el)) return;
        seen.add(el);

        // tabindex="-1" is programmatic-focus-only — but ONLY when that is the sole
        // reason the element matched. A roving-tabindex composite (Kendo/Material
        // tabs, toolbars, listboxes, menus) puts -1 on every inactive item, so
        // dropping them removed every unselected tab and option from the list and
        // the model fell back to coordinates — which isRecordableRun then refuses,
        // making the whole test unrecordable.
        if (el.getAttribute('tabindex') === '-1'
            && !el.hasAttribute('onclick')
            && !el.matches(INTERACTIVE_WITHOUT_TABINDEX)) return;

        const style = window.getComputedStyle(el);

        // Visibility must account for ANCESTOR-driven invisibility. getComputedStyle
        // does not inherit opacity, so a descendant of an `opacity: 0` overlay reports
        // its own opacity as 1 — which let every closed-but-mounted popover in the app
        // leak into the list as a phantom target at real on-screen coordinates.
        // checkVisibility() resolves the whole ancestor chain; the own-style test is
        // kept only as a fallback for engines that lack it.
        if (typeof el.checkVisibility === 'function') {
            if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) return;
        } else if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
            return;
        }

        // An element that cannot receive a pointer event is not interactive, however it
        // looks. Checked per-element, so a `pointer-events: none` wrapper is dropped
        // while a child that re-enables `auto` is still offered.
        if (style.pointerEvents === 'none') return;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        // Viewport + near-viewport (one screen of slack each way) so off-screen bloat is filtered.
        if (rect.bottom < -vh || rect.top > vh * 2 || rect.right < -vw || rect.left > vw * 2) return;

        const disabled = (el as HTMLInputElement).disabled === true || el.getAttribute('aria-disabled') === 'true';
        const isFormValue = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
        const scrollable = (el.scrollHeight > el.clientHeight + 4) &&
            (style.overflowY === 'auto' || style.overflowY === 'scroll');

        try {
            el.setAttribute('data-mj-cu-index', String(results.length));
        } catch {
            // Ignore in synthetic or read-only DOM mocks
        }

        results.push({
            role: roleOf(el),
            name: nameOf(el),
            xpath: xpathOf(el),
            scope: scopeOf(el),
            value: isFormValue ? String((el as HTMLInputElement).value ?? '') : null,
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
            scrollable,
            disabled,
        });
    });

    return results;
};

/** @deprecated Use {@link INTERACTIVITYPROBE}. */
export const INTERACTIVITY_PROBE = INTERACTIVITYPROBE;

/**
 * Execute {@link INTERACTIVITYPROBE} directly against the current browser `document`
 * and return the grounded, indexed {@link InteractiveElement} list.
 *
 * Used by `ContentScriptBrowserAdapter` in the MJ Browser Extension to share 100% of
 * `PlaywrightBrowserAdapter`'s element-grounding semantics without Playwright.
 */
export function ProbeDomInteractiveElements(): InteractiveElement[] {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
        return [];
    }
    try {
        const raws = INTERACTIVITYPROBE();
        return raws.map((r, i) => MapRawToInteractiveElement(r, i));
    } catch {
        return [];
    }
}

/**
 * Resolve a grounded selector (`xpath=/html/...`, raw `/html/...` XPath, or CSS selector)
 * to a live `HTMLElement` in the provided `Document` (defaults to `globalThis.document`).
 *
 * @param selector - Grounded selector from {@link InteractiveElement.Selector} or a CSS/XPath string.
 * @param rootDocument - Document to query against.
 * @returns The matched `HTMLElement`, or `null` if not found.
 */
export function ResolveDomSelector(selector: string, rootDocument?: Document): HTMLElement | null {
    const doc = rootDocument ?? (typeof document !== 'undefined' ? document : undefined);
    if (!doc || !selector) {
        return null;
    }
    const trimmed = selector.trim();
    if (!trimmed) {
        return null;
    }

    const isXPath = trimmed.startsWith('xpath=') || trimmed.startsWith('/') || trimmed.startsWith('(/');
    if (isXPath) {
        const xpathExpr = trimmed.startsWith('xpath=') ? trimmed.slice('xpath='.length) : trimmed;
        try {
            if (typeof doc.evaluate === 'function' && typeof XPathResult !== 'undefined') {
                const res = doc.evaluate(
                    xpathExpr,
                    doc,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null
                );
                return (res.singleNodeValue as HTMLElement | null) ?? null;
            }
            // Fallback simple positional XPath walker (/html/body[1]/div[2]/...) for lightweight DOM environments (e.g. JSDOM without XPathResult)
            return walkSimplePositionalXPath(xpathExpr, doc);
        } catch {
            return walkSimplePositionalXPath(xpathExpr, doc);
        }
    }

    try {
        return doc.querySelector<HTMLElement>(trimmed);
    } catch {
        return null;
    }
}

/**
 * Fallback positional XPath walker for `/html/body[1]/div[2]/button[1]` paths produced by {@link INTERACTIVITYPROBE}.
 */
function walkSimplePositionalXPath(xpath: string, doc: Document): HTMLElement | null {
    const clean = xpath.trim();
    if (!clean.startsWith('/html')) {
        return null;
    }
    const rest = clean.slice('/html'.length);
    if (!rest || rest === '/') {
        return doc.documentElement;
    }
    const segments = rest.split('/').filter(Boolean);
    let current: Element | null = doc.documentElement;
    for (const seg of segments) {
        if (!current) return null;
        const match = /^([a-zA-Z0-9_-]+)(?:\[(\d+)\])?$/.exec(seg);
        if (!match) return null;
        const tag = match[1].toLowerCase();
        const targetIdx = match[2] ? parseInt(match[2], 10) : 1;
        let count = 0;
        let found: Element | null = null;
        const children: HTMLCollection = current.children;
        for (let i = 0; i < children.length; i++) {
            const child: Element = children[i];
            if (child.tagName.toLowerCase() === tag) {
                count++;
                if (count === targetIdx) {
                    found = child;
                    break;
                }
            }
        }
        current = found;
    }
    return (current as HTMLElement | null) ?? null;
}

// Re-export pure browser-safe types, adapters, guards, and target-healing functions from within @memberjunction/computer-use
export * from '../types/browser.js';
export * from '../types/trace.js';
export * from '../browser/BaseBrowserAdapter.js';
export * from '../browser/NavigationGuard.js';
export * from '../engine/replay.js';
export * from '../engine/trace.js';
