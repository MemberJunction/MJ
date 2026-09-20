import { describe, it, expect, vi } from 'vitest';
import type { Locator, Page } from 'playwright';

import { clickInteractiveElement, typeIntoInteractiveElement } from '../browser/element-extraction.js';
import { InteractiveElement } from '../types/browser.js';

const STALE_XPATH = 'xpath=/html/body[1]/div[1]/button[1]';
const FRESH_XPATH = 'xpath=/html/body[1]/div[2]/button[1]';
const TIMEOUT = 10_000;

/** The element the controller chose, as perceived one step ago. */
function chosen(overrides: Partial<InteractiveElement> = {}): InteractiveElement {
    const el = new InteractiveElement();
    el.Index = 0;
    el.Role = 'button';
    el.Name = 'Save';
    el.Selector = STALE_XPATH;
    return Object.assign(el, overrides);
}

/** One record as the in-page probe returns it (drives a re-extraction). */
function probed(role: string, name: string, xpath: string) {
    return { role, name, xpath: xpath.replace(/^xpath=/, ''), value: null, x: 0, y: 0, width: 100, height: 20, scrollable: false, disabled: false };
}

/**
 * Minimal Playwright surface. `failSelectors` marks selectors whose action
 * rejects the way a stale XPath does; `fresh` is what re-extraction perceives.
 */
function makePage(opts: {
    failSelectors?: string[];
    fresh?: ReturnType<typeof probed>[];
    /** Rejects with an overlay-interception message instead of a plain timeout. */
    overlayBlocked?: string[];
    /** When set, an overlay-blocked selector starts succeeding after Escape. */
    overlayClearsOnEscape?: boolean;
} = {}) {
    const clicks: Array<{ selector: string; timeout: number }> = [];
    const fills: Array<{ selector: string; timeout: number; text: string }> = [];
    const presses: string[] = [];
    const keys: string[] = [];
    const fail = new Set(opts.failSelectors ?? []);
    const overlay = new Set(opts.overlayBlocked ?? []);
    let overlayDismissed = false;
    const overlayError = (sel: string) => new Error(
        `locator.click: Timeout 8000ms exceeded.\n` +
        `Call log:\n  - waiting for ${sel}\n` +
        `  - <div class="cdk-overlay-backdrop cdk-overlay-transparent-backdrop"></div> intercepts pointer events`
    );

    const locator = vi.fn((selector: string) => {
        const self = {
            first: () => self,
            click: async (o: { timeout: number }) => {
                clicks.push({ selector, timeout: o.timeout });
                if (overlay.has(selector) && !(opts.overlayClearsOnEscape && overlayDismissed)) {
                    throw overlayError(selector);
                }
                if (fail.has(selector)) throw new Error(`locator.click: Timeout ${o.timeout}ms exceeded.`);
            },
            fill: async (text: string, o: { timeout: number }) => {
                fills.push({ selector, timeout: o.timeout, text });
                if (fail.has(selector)) throw new Error(`locator.fill: Timeout ${o.timeout}ms exceeded.`);
            },
            press: async (key: string) => {
                presses.push(key);
            },
        };
        return self as unknown as Locator;
    });

    const evaluate = vi.fn().mockResolvedValue(opts.fresh ?? []);
    const keyboard = {
        press: async (key: string) => {
            keys.push(key);
            if (key === 'Escape') overlayDismissed = true;
        },
    };
    return { page: { locator, evaluate, keyboard } as unknown as Page, clicks, fills, presses, keys, evaluate };
}

describe('clickInteractiveElement', () => {
    it('clicks the exact selector and never re-extracts when the DOM held still', async () => {
        const { page, clicks, evaluate } = makePage();

        await clickInteractiveElement(page, chosen(), {}, TIMEOUT);

        expect(clicks).toEqual([{ selector: STALE_XPATH, timeout: 2000 }]);
        expect(evaluate).not.toHaveBeenCalled();
    });

    it('caps the exact-selector attempt well below the action budget', async () => {
        // The regression this fixes: a stale absolute XPath used to burn the full
        // 10s ActionTimeoutMs producing nothing. It must fail fast instead.
        const { page, clicks } = makePage({ failSelectors: [STALE_XPATH] });

        await expect(clickInteractiveElement(page, chosen(), {}, TIMEOUT)).rejects.toThrow(/Timeout 2000ms/);
        expect(clicks).toHaveLength(1);
    });

    it('re-resolves by role+name and retries when the recorded selector is stale', async () => {
        const { page, clicks, evaluate } = makePage({
            failSelectors: [STALE_XPATH],
            fresh: [probed('link', 'Cancel', 'xpath=/html/body[1]/a[1]'), probed('button', 'Save', FRESH_XPATH)],
        });

        await clickInteractiveElement(page, chosen(), {}, TIMEOUT);

        expect(evaluate).toHaveBeenCalledTimes(1);
        expect(clicks).toEqual([
            { selector: STALE_XPATH, timeout: 2000 },
            { selector: FRESH_XPATH, timeout: 8000 },
        ]);
    });

    it('spends no more than the caller-supplied budget across both attempts', async () => {
        const { page, clicks } = makePage({
            failSelectors: [STALE_XPATH],
            fresh: [probed('button', 'Save', FRESH_XPATH)],
        });

        await clickInteractiveElement(page, chosen(), {}, TIMEOUT);

        expect(clicks.reduce((sum, c) => sum + c.timeout, 0)).toBeLessThanOrEqual(TIMEOUT);
    });

    it('rethrows the original failure when nothing matches the recorded role+name', async () => {
        const { page, clicks } = makePage({
            failSelectors: [STALE_XPATH],
            fresh: [probed('button', 'Delete', 'xpath=/html/body[1]/button[9]')],
        });

        // The message must stay about the element the controller actually chose.
        await expect(clickInteractiveElement(page, chosen(), {}, TIMEOUT)).rejects.toThrow(/locator\.click: Timeout/);
        expect(clicks).toHaveLength(1);
    });

    it('refuses an ambiguous heal rather than clicking the wrong element', async () => {
        // Two "Save" buttons: a wrong cached click is worse than a failed step.
        const { page, clicks } = makePage({
            failSelectors: [STALE_XPATH],
            fresh: [probed('button', 'Save', FRESH_XPATH), probed('button', 'Save', 'xpath=/html/body[1]/div[3]/button[1]')],
        });

        await expect(clickInteractiveElement(page, chosen(), {}, TIMEOUT)).rejects.toThrow();
        expect(clicks).toHaveLength(1);
    });

    it('accepts a unique name-substring match when the label was reworded', async () => {
        const { page, clicks } = makePage({
            failSelectors: [STALE_XPATH],
            fresh: [probed('button', 'Save changes', FRESH_XPATH)],
        });

        await clickInteractiveElement(page, chosen(), {}, TIMEOUT);

        expect(clicks[1].selector).toBe(FRESH_XPATH);
    });

    it('heals pseudo-roles that are not valid ARIA roles', async () => {
        // roleOf() falls back to the tag name for [onclick]/[tabindex] elements,
        // so the ladder must match on the recorded string, not an ARIA whitelist.
        const { page, clicks } = makePage({
            failSelectors: [STALE_XPATH],
            fresh: [probed('div', 'Row 7', FRESH_XPATH)],
        });

        await clickInteractiveElement(page, chosen({ Role: 'div', Name: 'Row 7' }), {}, TIMEOUT);

        expect(clicks[1].selector).toBe(FRESH_XPATH);
    });

    it('carries click options through to the healed retry', async () => {
        const seen: Array<Record<string, unknown>> = [];
        const locator = vi.fn((selector: string) => {
            const self = {
                first: () => self,
                click: async (o: Record<string, unknown>) => {
                    seen.push({ selector, ...o });
                    if (selector === STALE_XPATH) throw new Error('stale');
                },
            };
            return self as unknown as Locator;
        });
        const page = { locator, evaluate: vi.fn().mockResolvedValue([probed('button', 'Save', FRESH_XPATH)]) } as unknown as Page;

        await clickInteractiveElement(page, chosen(), { clickCount: 2, button: 'right', modifiers: ['Shift'] }, TIMEOUT);

        expect(seen[1]).toMatchObject({ selector: FRESH_XPATH, clickCount: 2, button: 'right', modifiers: ['Shift'] });
    });

    it('keeps a usable retry budget when the supplied timeout is already short', async () => {
        const { page, clicks } = makePage({
            failSelectors: [STALE_XPATH],
            fresh: [probed('button', 'Save', FRESH_XPATH)],
        });

        await clickInteractiveElement(page, chosen(), {}, 1500);

        expect(clicks.map(c => c.timeout)).toEqual([1500, 1500]);
    });
});

describe('typeIntoInteractiveElement', () => {
    it('fills the exact selector when it still resolves', async () => {
        const { page, fills, presses } = makePage();

        await typeIntoInteractiveElement(page, chosen({ Role: 'textbox', Name: 'Email' }), 'a@b.com', false, TIMEOUT);

        expect(fills).toEqual([{ selector: STALE_XPATH, timeout: 2000, text: 'a@b.com' }]);
        expect(presses).toEqual([]);
    });

    it('re-fills the healed element and still presses Enter', async () => {
        const { page, fills, presses } = makePage({
            failSelectors: [STALE_XPATH],
            fresh: [probed('textbox', 'Email', FRESH_XPATH)],
        });

        await typeIntoInteractiveElement(page, chosen({ Role: 'textbox', Name: 'Email' }), 'a@b.com', true, TIMEOUT);

        expect(fills.map(f => f.selector)).toEqual([STALE_XPATH, FRESH_XPATH]);
        expect(presses).toEqual(['Enter']);
    });
});

describe('dismissable-overlay recovery', () => {
    it('presses Escape and retries when a backdrop intercepts the click', async () => {
        const { page, clicks, keys } = makePage({
            overlayBlocked: [STALE_XPATH],
            overlayClearsOnEscape: true,
        });

        await clickInteractiveElement(page, chosen(), {}, TIMEOUT);

        expect(keys).toContain('Escape');
        // Same target, tried twice: blocked, then again after the backdrop went away.
        expect(clicks.map(c => c.selector)).toEqual([STALE_XPATH, STALE_XPATH]);
    });

    it('does not re-extract when Escape alone resolves it (no heal needed)', async () => {
        const { page, evaluate } = makePage({
            overlayBlocked: [STALE_XPATH],
            overlayClearsOnEscape: true,
        });

        await clickInteractiveElement(page, chosen(), {}, TIMEOUT);

        expect(evaluate).not.toHaveBeenCalled();
    });

    it('falls through to the selector heal when Escape does not clear the overlay', async () => {
        const { page, clicks, keys } = makePage({
            overlayBlocked: [STALE_XPATH],
            overlayClearsOnEscape: false,
            fresh: [probed('button', 'Save', FRESH_XPATH)],
        });

        await clickInteractiveElement(page, chosen(), {}, TIMEOUT);

        expect(keys).toContain('Escape');
        // Ends up on the re-resolved selector rather than giving up.
        expect(clicks[clicks.length - 1].selector).toBe(FRESH_XPATH);
    });

    it('does NOT press Escape for an ordinary timeout (no overlay named)', async () => {
        const { page, keys } = makePage({
            failSelectors: [STALE_XPATH],
            fresh: [probed('button', 'Save', FRESH_XPATH)],
        });

        await clickInteractiveElement(page, chosen(), {}, TIMEOUT);

        expect(keys).not.toContain('Escape');
    });
});
