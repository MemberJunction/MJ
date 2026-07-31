/**
 * Shared interactive-element extraction + index-resolved actions (CU-A4).
 *
 * Element-grounded perception replaces the controller's coordinate guessing:
 * the adapter walks the live DOM for interactive elements, hands the engine a
 * stable indexed list, and resolves a chosen index back to a locator-based
 * click/type with Playwright's actionability auto-wait. Because the page can
 * re-render between perception and action, a chosen element's stored selector is
 * tried briefly and then healed by accessible role + name (CU-C3). Extracted here
 * so both `PlaywrightBrowserAdapter` and `SharedContextBrowserAdapter` share ONE
 * implementation (mirroring `page-perception.ts`).
 *
 * App-agnostic: the probe keys off standard interactive tags + ARIA roles +
 * click affordances only — no app-specific selectors or markers. Widget-toolkit
 * quirks (virtualized grids) are handled generically or via AppProfile hints,
 * never by naming a specific app here.
 */

import type { Locator, Page } from 'playwright';
import { InteractiveElement, BoundingBox } from '../types/browser.js';
import { TraceTarget } from '../types/trace.js';
import { reresolveTarget, shouldAcceptHeal } from '../engine/heal-decision.js';

/** Raw per-element record the in-page probe returns (plain JSON, browser context). */
interface RawInteractiveElement {
    role: string;
    name: string;
    xpath: string;
    value: string | null;
    x: number;
    y: number;
    width: number;
    height: number;
    scrollable: boolean;
    disabled: boolean;
}

/**
 * Walk the current page for interactive elements and return them as an indexed
 * {@link InteractiveElement}[] in DOM order. Viewport-and-near-viewport only,
 * hidden/zero-size elements skipped. Never throws — a probe failure or absent
 * page yields an empty list (element grounding then degrades to coordinates).
 */
export async function extractInteractiveElements(page: Page | null): Promise<InteractiveElement[]> {
    if (!page) {
        return [];
    }
    try {
        const raws = await page.evaluate(INTERACTIVITY_PROBE);
        return raws.map((r, i) => toInteractiveElement(r, i));
    } catch {
        return [];
    }
}

/** Map one raw probe record + its assigned index to the typed element. */
function toInteractiveElement(r: RawInteractiveElement, index: number): InteractiveElement {
    const el = new InteractiveElement();
    el.Index = index;
    el.Role = r.role;
    el.Name = r.name;
    el.Selector = `xpath=${r.xpath}`;
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

/** Resolve an element's locator (its stored `xpath=` selector). */
function locatorFor(page: Page, element: InteractiveElement) {
    return page.locator(element.Selector).first();
}

/**
 * Budget for the exact-selector attempt. The stored selector is an absolute
 * XPath, so when the SPA has re-rendered since perception it matches nothing and
 * the wait is pure waste — it must fail fast enough to leave room for the heal.
 * The two attempts together never exceed the caller's `actionTimeoutMs`.
 */
const PRECISE_ATTEMPT_TIMEOUT_MS = 2000;

/**
 * Re-resolve an element whose recorded selector no longer works, by its
 * accessible role + name against a freshly extracted list (CU-C3's heal ladder).
 * Confidence-gated: an ambiguous match yields nothing, so we fail the step rather
 * than click the wrong element. Returns a fresh selector, or undefined.
 */
async function healElementSelector(page: Page, element: InteractiveElement): Promise<string | undefined> {
    const target = new TraceTarget();
    target.Role = element.Role;
    target.Name = element.Name;

    const resolution = reresolveTarget(target, await extractInteractiveElements(page));
    return shouldAcceptHeal(resolution.confidence) ? resolution.selector : undefined;
}

/**
 * Run an index-resolved action against an extracted element, healing past a stale
 * selector (CU-A4 + CU-C3).
 *
 * The element list is perceived, then the controller deliberates, then we act —
 * and an SPA can re-render in that gap. The recorded absolute XPath is exact when
 * the DOM held still and worthless when it did not, so: try it briefly, and on
 * any failure re-resolve semantically and retry once with the remaining budget.
 * The original error is rethrown when no confident match exists, keeping the
 * failure message about the element the controller actually chose.
 */
/**
 * A dismissable overlay is covering the target. Playwright reports the blocking
 * element in its actionability log; the CDK/Kendo/Material backdrops that sit over
 * an open popover, menu, or dialog all name themselves in it.
 */
const DISMISSABLE_OVERLAY_PATTERN = /(cdk-overlay-backdrop|k-overlay|k-animation-container|mat-mdc-dialog|modal-backdrop|mj-overlay-backdrop)/i;

function isBlockedByDismissableOverlay(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('intercepts pointer events') && DISMISSABLE_OVERLAY_PATTERN.test(message);
}

async function actOnElement(
    page: Page,
    element: InteractiveElement,
    actionTimeoutMs: number,
    act: (locator: Locator, timeoutMs: number) => Promise<void>
): Promise<void> {
    const preciseMs = Math.min(PRECISE_ATTEMPT_TIMEOUT_MS, actionTimeoutMs);
    try {
        await act(locatorFor(page, element), preciseMs);
        return;
    } catch (error) {
        // An open popover's backdrop deadlocks the click: Playwright keeps retrying
        // until the target becomes hit-testable, but the thing covering it only goes
        // away if something dismisses it — so the action can never succeed and burns
        // its whole budget. A person just presses Escape and clicks again; do that.
        // (Seen on T124: an open Filters popover blocked every attempt to clear the
        // search box, and the run died on loop detection with budget to spare.)
        if (isBlockedByDismissableOverlay(error)) {
            try {
                await page.keyboard.press('Escape');
                await act(locatorFor(page, element), preciseMs);
                return;
            } catch { /* fall through to the selector heal below */ }
        }
        const healedSelector = await healElementSelector(page, element);
        if (!healedSelector) {
            throw error;
        }
        await act(page.locator(healedSelector).first(), Math.max(actionTimeoutMs - preciseMs, preciseMs));
    }
}

/** Click an extracted element via its locator, honoring click-count/button/modifiers (CU-A4). */
export async function clickInteractiveElement(
    page: Page,
    element: InteractiveElement,
    opts: { clickCount?: number; button?: 'left' | 'right' | 'middle'; modifiers?: Array<'Shift' | 'Control' | 'Alt' | 'Meta' | 'ControlOrMeta'> },
    actionTimeoutMs: number
): Promise<void> {
    await actOnElement(page, element, actionTimeoutMs, (locator, timeout) =>
        locator.click({
            timeout,
            clickCount: opts.clickCount ?? 1,
            button: opts.button ?? 'left',
            ...(opts.modifiers?.length ? { modifiers: opts.modifiers } : {}),
        })
    );
}

/** Fill text into an extracted element via its locator; optionally press Enter (CU-A4). */
export async function typeIntoInteractiveElement(
    page: Page,
    element: InteractiveElement,
    text: string,
    pressEnter: boolean,
    actionTimeoutMs: number
): Promise<void> {
    await actOnElement(page, element, actionTimeoutMs, async (locator, timeout) => {
        await locator.fill(text, { timeout });
        if (pressEnter) {
            await locator.press('Enter', { timeout });
        }
    });
}

/**
 * The in-page interactivity probe (serialized into the browser via
 * `page.evaluate`). Returns interactive elements with role/name/xpath/bbox +
 * scrollable/disabled/value flags. Kept as a single self-contained function so
 * it captures no Node closure state.
 */
const INTERACTIVITY_PROBE = (): RawInteractiveElement[] => {
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
            const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
            if (label?.textContent) return label.textContent.trim();
        }
        const placeholder = el.getAttribute('placeholder');
        if (placeholder) return placeholder.trim();
        const title = el.getAttribute('title');
        if (title) return title.trim();
        const text = (el as HTMLElement).innerText || el.textContent || '';
        return text.trim().slice(0, 120);
    };

    const results: RawInteractiveElement[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const seen = new Set<Element>();

    document.querySelectorAll(INTERACTIVE_SELECTOR).forEach(node => {
        const el = node as HTMLElement;
        if (seen.has(el)) return;
        seen.add(el);

        // tabindex="-1" is programmatic-focus-only, not user-interactive.
        if (el.getAttribute('tabindex') === '-1' && !el.hasAttribute('onclick')) return;

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

        results.push({
            role: roleOf(el),
            name: nameOf(el),
            xpath: xpathOf(el),
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
