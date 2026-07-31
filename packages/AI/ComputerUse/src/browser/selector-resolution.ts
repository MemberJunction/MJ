/**
 * Ambiguous-selector disambiguation for controller-supplied selectors (CU-A7).
 *
 * The controller (an LLM) writes free-form selectors, and the ones it favors are
 * inherently ambiguous: `:has-text()` matches every ANCESTOR containing the text,
 * and a bare `text=Foo` matches every node containing it. Playwright's action
 * APIs (`page.click`, `locator.focus`, `locator.scrollIntoViewIfNeeded`) are
 * strict, so a multi-match selector throws instead of acting:
 *
 *     strict mode violation: locator('div:has-text("VISIBLE COLUMNS")') resolved to 14 elements
 *
 * That failure is worse than a lost action — the page state doesn't change, so
 * the loop detector counts a repeat state and the run terminates as
 * Failed/LoopDetected even though the agent was on the right track.
 *
 * The fix: resolve the selector to ONE locator before acting. A multi-match is
 * currently a guaranteed hard failure, so disambiguating cannot regress any
 * action that works today.
 *
 * The choice policy is pure (no Playwright types) so it is unit-testable without
 * a browser; {@link resolveActionLocator} is the thin async shell around it.
 */

import type { Locator, Page } from 'playwright';

/** One match of an ambiguous selector, as measured in the page. */
export interface SelectorCandidate {
    /** Position within the locator's match list — the `nth()` index. */
    Index: number;
    /** Rendered (non-zero-area) elements are preferred over hidden ones. */
    Visible: boolean;
    /** Rendered area in CSS pixels; the innermost element of an ancestor chain is the smallest. */
    Area: number;
}

/**
 * Pick the single best match among an ambiguous selector's candidates.
 *
 * Policy, in order:
 *  1. Prefer visible matches; fall back to all matches when none are visible
 *     (better to attempt the action and let Playwright's actionability check
 *     report a real reason than to refuse outright).
 *  2. Among those, take the SMALLEST by area. For the dominant failure mode —
 *     a `:has-text()` ancestor chain — the smallest match is the innermost
 *     element, which is the element the controller actually meant.
 *  3. Ties break on document order (lowest index), matching what Playwright's
 *     own non-strict APIs do.
 *
 * @returns the chosen `Index`, or `undefined` when there are no candidates.
 */
export function chooseSelectorMatch(candidates: SelectorCandidate[]): number | undefined {
    if (candidates.length === 0) {
        return undefined;
    }
    if (candidates.length === 1) {
        return candidates[0].Index;
    }
    const visible = candidates.filter(c => c.Visible);
    const pool = visible.length > 0 ? visible : candidates;
    let best = pool[0];
    for (const candidate of pool) {
        if (candidate.Area < best.Area || (candidate.Area === best.Area && candidate.Index < best.Index)) {
            best = candidate;
        }
    }
    return best.Index;
}

/**
 * Above this many matches a selector is junk rather than merely ambiguous — a
 * bare tag or a wildcard class over a data grid. Measuring it would force a
 * synchronous layout per match and serialize one object per match, on every
 * action, so past the cap we skip measurement entirely and take the first match
 * (what Playwright's own non-strict APIs do).
 */
const MAX_MEASURED_MATCHES = 50;

/**
 * Measure the current matches of a locator in one round trip.
 *
 * Bounded by {@link MAX_MEASURED_MATCHES}: `getBoundingClientRect()` forces
 * layout, so an unbounded map over thousands of nodes is real work on the hot
 * path. Callers handle the over-cap case before getting here.
 */
async function measureMatches(locator: Locator): Promise<SelectorCandidate[]> {
    const sizes = await locator.evaluateAll((elements, cap) =>
        elements.slice(0, cap).map(element => {
            const rect = (element as HTMLElement).getBoundingClientRect();
            return { width: rect.width, height: rect.height };
        }),
    MAX_MEASURED_MATCHES);
    return sizes.map((size, index) => ({
        Index: index,
        Visible: size.width > 0 && size.height > 0,
        Area: size.width * size.height,
    }));
}

/**
 * Resolve a controller-supplied selector to a single actionable locator.
 *
 * Zero or one match returns the locator unchanged, so the common path keeps
 * Playwright's auto-wait semantics byte-for-byte (an element that appears a
 * moment later is still waited for). Only a genuine multi-match — today a
 * guaranteed strict-mode throw — is narrowed via {@link chooseSelectorMatch}.
 *
 * Never throws: if measurement fails for any reason, the caller gets the
 * unnarrowed locator and the pre-existing behavior.
 */
export async function resolveActionLocator(page: Page, selector: string): Promise<Locator> {
    const locator = page.locator(selector);
    try {
        // count() is a plain query — no layout, no serialization — so the
        // single-match common path costs almost nothing and a runaway selector
        // never reaches the measuring pass.
        const count = await locator.count();
        if (count <= 1) {
            return locator;
        }
        if (count > MAX_MEASURED_MATCHES) {
            return locator.first();
        }
        const index = chooseSelectorMatch(await measureMatches(locator));
        return index === undefined ? locator : locator.nth(index);
    } catch {
        return locator;
    }
}
