/**
 * Shared interactive-element extraction + index-resolved actions.
 *
 * Element-grounded perception replaces the controller's coordinate guessing:
 * the adapter walks the live DOM for interactive elements, hands the engine a
 * stable indexed list, and resolves a chosen index back to a locator-based
 * click/type with Playwright's actionability auto-wait. Because the page can
 * re-render between perception and action, a chosen element's stored selector is
 * tried briefly and then healed by accessible role + name. Extracted here
 * so both `PlaywrightBrowserAdapter` and `SharedContextBrowserAdapter` share ONE
 * implementation (mirroring `page-perception.ts`).
 *
 * The pure in-page probe (`INTERACTIVITYPROBE`) and raw-to-entity mapper
 * (`MapRawToInteractiveElement`) live in `../browser-probe/index.js` so the
 * MemberJunction Browser Extension (`ContentScriptBrowserAdapter`) shares the
 * exact same DOM grounding logic without importing Playwright.
 */

import type { Locator, Page } from 'playwright';
import { InteractiveElement } from '../types/browser.js';
import { TraceTarget } from '../types/trace.js';
import { ReresolveTarget, ShouldAcceptHeal } from '../engine/replay.js';
import { IsBlockedByDismissableOverlay, DismissOverlay } from './overlay-dismiss.js';
import {
    INTERACTIVITYPROBE,
    INTERACTIVITY_PROBE,
    MapRawToInteractiveElement,
    ProbeDomInteractiveElements,
    ResolveDomSelector,
    type RawInteractiveElement,
} from '../browser-probe/index.js';

export {
    INTERACTIVITYPROBE,
    INTERACTIVITY_PROBE,
    MapRawToInteractiveElement,
    ProbeDomInteractiveElements,
    ResolveDomSelector,
    type RawInteractiveElement,
};

/**
 * Fallback bound for the in-page probe when a caller does not supply one.
 * Matches `BrowserConfig.ActionTimeoutMs`'s default so an un-wired caller waits
 * no longer than any other page operation.
 */
const DEFAULT_PROBE_TIMEOUT_MS = 10000;

/**
 * Walk the current page for interactive elements and return them as an indexed
 * {@link InteractiveElement}[] in DOM order. Viewport-and-near-viewport only,
 * hidden/zero-size elements skipped. Never throws — a probe failure or absent
 * page yields an empty list (element grounding then degrades to coordinates).
 *
 * Bounded by `timeoutMs`, because `page.evaluate()` is the one page call that
 * ignores `setDefaultTimeout()`: it waits forever for the in-page function to
 * return, and a renderer that goes silent (frozen, throttled, or detached
 * context) never rejects, so the `catch` below cannot fire. Perception runs on
 * every step, and the engine only checks its time budget between steps — so an
 * unbounded await here parks the run somewhere no budget, watchdog, or `Stop()`
 * can reach it, and the caller's worker waits on a promise that never settles.
 * Timing out degrades to the same empty list as any other probe failure.
 */
export async function ExtractInteractiveElements(
    page: Page | null,
    timeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS
): Promise<InteractiveElement[]> {
    if (!page) {
        return [];
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        // `null` is the timeout's sentinel — distinguishable from the probe's
        // own empty-list result, which is a legitimate "nothing interactive".
        const expiry = new Promise<null>(resolve => {
            timer = setTimeout(() => resolve(null), timeoutMs);
        });
        const raws = await Promise.race([page.evaluate(INTERACTIVITYPROBE), expiry]);
        if (raws === null) {
            return [];
        }
        return raws.map((r, i) => MapRawToInteractiveElement(r, i));
    } catch {
        return [];
    } finally {
        // Without this a fast probe still leaves the timer pending, holding the
        // event loop open for the rest of the bound on every single step.
        clearTimeout(timer);
    }
}

/** @deprecated Use {@link ExtractInteractiveElements}. */
export async function extractInteractiveElements(
    page: Page | null,
    timeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS
): Promise<InteractiveElement[]> {
    return ExtractInteractiveElements(page, timeoutMs);
}

/** Resolve an element's locator (its stored `xpath=` selector). */
function locatorFor(page: Page, element: InteractiveElement) {
    return page.locator(element.Selector).first();
}

/**
 * Budget for the exact-selector attempt. The stored selector is an absolute
 * XPath, so when the SPA has re-rendered since perception it matches nothing and
 * the wait is pure waste — it must fail fast enough to leave room for the heal.
 *
 * The two attempts do NOT sum to the caller's `actionTimeoutMs`: this bounds the
 * precise attempt, and the heal attempt that follows gets the caller's full
 * budget, so the worst case is this plus that. Stated plainly because the comment
 * here used to claim the opposite.
 */
const PRECISE_ATTEMPT_TIMEOUT_MS = 2000;

/**
 * Re-resolve an element whose recorded selector no longer works, by its
 * accessible role + name against a freshly extracted list (heal ladder).
 * Confidence-gated: an ambiguous match yields nothing, so we fail the step rather
 * than click the wrong element. Returns a fresh selector, or undefined.
 */
async function healElementSelector(
    page: Page,
    element: InteractiveElement,
    probeTimeoutMs: number
): Promise<string | undefined> {
    const target = new TraceTarget();
    target.Role = element.Role;
    target.Name = element.Name;

    const resolution = ReresolveTarget(target, await ExtractInteractiveElements(page, probeTimeoutMs));
    return ShouldAcceptHeal(resolution.confidence) ? resolution.selector : undefined;
}

/**
 * Run an index-resolved action against an extracted element, healing past a stale
 * selector.
 *
 * The element list is perceived, then the controller deliberates, then we act —
 * and an SPA can re-render in that gap. The recorded absolute XPath is exact when
 * the DOM held still and worthless when it did not, so: try it briefly, and on
 * any failure re-resolve semantically and retry once with the remaining budget.
 * The original error is rethrown when no confident match exists, keeping the
 * failure message about the element the controller actually chose.
 */
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
        if (IsBlockedByDismissableOverlay(error)) {
            try {
                await DismissOverlay(page);
                await act(locatorFor(page, element), preciseMs);
                return;
            } catch { /* fall through to the selector heal below */ }
        }
        const healedSelector = await healElementSelector(page, element, actionTimeoutMs);
        if (!healedSelector) {
            throw error;
        }
        await act(page.locator(healedSelector).first(), Math.max(actionTimeoutMs - preciseMs, preciseMs));
    }
}

/** Click an extracted element via its locator, honoring click-count/button/modifiers. */
export async function ClickInteractiveElement(
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

/** @deprecated Use {@link ClickInteractiveElement}. */
export async function clickInteractiveElement(
    page: Page,
    element: InteractiveElement,
    opts: { clickCount?: number; button?: 'left' | 'right' | 'middle'; modifiers?: Array<'Shift' | 'Control' | 'Alt' | 'Meta' | 'ControlOrMeta'> },
    actionTimeoutMs: number
): Promise<void> {
    return ClickInteractiveElement(page, element, opts, actionTimeoutMs);
}

/** Fill text into an extracted element via its locator; optionally press Enter. */
export async function TypeIntoInteractiveElement(
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

/** @deprecated Use {@link TypeIntoInteractiveElement}. */
export async function typeIntoInteractiveElement(
    page: Page,
    element: InteractiveElement,
    text: string,
    pressEnter: boolean,
    actionTimeoutMs: number
): Promise<void> {
    return TypeIntoInteractiveElement(page, element, text, pressEnter, actionTimeoutMs);
}
