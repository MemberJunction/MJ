import { describe, it, expect, vi } from 'vitest';
import type { Locator, Page } from 'playwright';

import { chooseSelectorMatch, resolveActionLocator, SelectorCandidate } from '../browser/selector-resolution.js';

function candidate(Index: number, Area: number, Visible = true): SelectorCandidate {
    return { Index, Area, Visible };
}

describe('chooseSelectorMatch', () => {
    it('returns undefined when nothing matched', () => {
        expect(chooseSelectorMatch([])).toBeUndefined();
    });

    it('returns the only match without applying any policy', () => {
        // Even a zero-area/hidden lone match is returned — narrowing is not our
        // job when there is nothing to narrow between.
        expect(chooseSelectorMatch([candidate(0, 0, false)])).toBe(0);
    });

    it('picks the innermost element of an ancestor chain (smallest area)', () => {
        // The div:has-text() failure mode: html > body > div > span all match,
        // areas shrinking as we descend. The span is what the controller meant.
        const chain = [candidate(0, 1_000_000), candidate(1, 500_000), candidate(2, 40_000), candidate(3, 900)];
        expect(chooseSelectorMatch(chain)).toBe(3);
    });

    it('prefers a visible match over a smaller hidden one', () => {
        const candidates = [candidate(0, 5_000, true), candidate(1, 10, false)];
        expect(chooseSelectorMatch(candidates)).toBe(0);
    });

    it('falls back to all matches when none are visible', () => {
        // Better to attempt the action and let Playwright's actionability check
        // report a real reason than to refuse outright.
        const candidates = [candidate(0, 5_000, false), candidate(1, 10, false)];
        expect(chooseSelectorMatch(candidates)).toBe(1);
    });

    it('breaks area ties on document order, like Playwright non-strict APIs', () => {
        const candidates = [candidate(0, 100), candidate(1, 100), candidate(2, 100)];
        expect(chooseSelectorMatch(candidates)).toBe(0);
    });

    it('ignores index ordering when areas differ', () => {
        // Smallest wins even when it is not last in the match list.
        const candidates = [candidate(0, 900), candidate(1, 50), candidate(2, 400)];
        expect(chooseSelectorMatch(candidates)).toBe(1);
    });
});

/** Minimal Playwright surface: count()/evaluateAll() drive the policy, nth()/first() record narrowing. */
function makePage(sizes: Array<{ width: number; height: number }>, countImpl?: () => Promise<never>) {
    const nthLocator = { __nth: true } as unknown as Locator;
    const firstLocator = { __first: true } as unknown as Locator;
    const nth = vi.fn().mockReturnValue(nthLocator);
    const first = vi.fn().mockReturnValue(firstLocator);
    const count = countImpl ?? vi.fn().mockResolvedValue(sizes.length);
    // Mirror the real evaluateAll contract: the page function receives the arg.
    const evaluateAll = vi.fn().mockImplementation(async (fn: unknown, cap: number) => sizes.slice(0, cap));
    const locator = { count, evaluateAll, nth, first } as unknown as Locator;
    const page = { locator: vi.fn().mockReturnValue(locator) } as unknown as Page;
    return { page, locator, nth, nthLocator, first, firstLocator, evaluateAll };
}

describe('resolveActionLocator', () => {
    it('returns the locator unchanged for a single match (auto-wait preserved)', async () => {
        const { page, locator, nth } = makePage([{ width: 100, height: 20 }]);

        const resolved = await resolveActionLocator(page, '#submit');

        expect(resolved).toBe(locator);
        expect(nth).not.toHaveBeenCalled();
    });

    it('returns the locator unchanged when nothing matches yet', async () => {
        // Critical: an element that has not rendered must still be waited for by
        // the caller's action, so we must NOT narrow (or fail) on zero matches.
        const { page, locator, nth } = makePage([]);

        const resolved = await resolveActionLocator(page, '#not-yet');

        expect(resolved).toBe(locator);
        expect(nth).not.toHaveBeenCalled();
    });

    it('narrows a multi-match to the smallest visible element', async () => {
        const { page, nth, nthLocator } = makePage([
            { width: 1280, height: 720 }, // body
            { width: 600, height: 400 }, // container
            { width: 120, height: 18 }, // the label the model meant
        ]);

        const resolved = await resolveActionLocator(page, 'div:has-text("VISIBLE COLUMNS")');

        expect(nth).toHaveBeenCalledWith(2);
        expect(resolved).toBe(nthLocator);
    });

    it('skips zero-area matches when a visible one exists', async () => {
        const { page, nth } = makePage([
            { width: 0, height: 0 }, // display:none duplicate in a closed menu
            { width: 200, height: 30 },
        ]);

        await resolveActionLocator(page, 'text=Integrations');

        expect(nth).toHaveBeenCalledWith(1);
    });

    it('falls back to the unnarrowed locator when the query throws', async () => {
        const boom = vi.fn().mockRejectedValue(new Error('detached frame'));
        const { page, locator, nth } = makePage([], boom as unknown as () => Promise<never>);

        const resolved = await resolveActionLocator(page, '.gone');

        expect(resolved).toBe(locator);
        expect(nth).not.toHaveBeenCalled();
    });

    it('does not measure a single match — no layout on the common path', async () => {
        const { page, evaluateAll } = makePage([{ width: 10, height: 10 }]);

        await resolveActionLocator(page, '#one');

        expect(evaluateAll).not.toHaveBeenCalled();
    });

    it('skips measurement entirely for a runaway selector and takes the first match', async () => {
        // A bare tag over a data grid: measuring would force one layout per
        // match, per action. Past the cap the selector is junk, not ambiguous.
        const many = Array.from({ length: 4000 }, () => ({ width: 80, height: 20 }));
        const { page, evaluateAll, first, firstLocator } = makePage(many);

        const resolved = await resolveActionLocator(page, 'div');

        expect(evaluateAll).not.toHaveBeenCalled();
        expect(first).toHaveBeenCalledTimes(1);
        expect(resolved).toBe(firstLocator);
    });

    it('still measures a match set at the cap boundary', async () => {
        const fifty = Array.from({ length: 50 }, (_, i) => ({ width: 100, height: i === 37 ? 1 : 50 }));
        const { page, evaluateAll, nth } = makePage(fifty);

        await resolveActionLocator(page, '.rows');

        expect(evaluateAll).toHaveBeenCalledTimes(1);
        expect(nth).toHaveBeenCalledWith(37);
    });
});
