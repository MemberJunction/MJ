import { describe, it, expect, vi } from 'vitest';
import type { Page } from 'playwright';
import { extractInteractiveElements } from '../browser/element-extraction.js';

/**
 * Bounding the in-page interactivity probe.
 *
 * `extractInteractiveElements` drives perception on EVERY step of every
 * element-grounded run, and it reaches the page through `page.evaluate()`.
 * Playwright's `evaluate()` is the one call that ignores `setDefaultTimeout()`
 * — it waits forever for the in-page function to return — and the `try/catch`
 * around it only catches throws, which a silent renderer never produces.
 *
 * That combination stranded a real suite run: T038 parked inside this await,
 * so the engine never returned to its step loop (where the agent-time budget is
 * checked) and `Stop()` — whose abort signal reaches only the two LLM calls —
 * could not unwind it. The worker awaited a promise that never settled and its
 * entire remaining queue went undispatched.
 *
 * The documented contract already says a probe failure degrades to an empty
 * list; these tests hold a hung probe to that same contract instead of letting
 * it hang the caller.
 */
describe('extractInteractiveElements — probe is bounded', () => {
    it('returns an empty list when the in-page probe never resolves', async () => {
        const page = {
            // A renderer that accepts the call and never answers — a frozen or
            // detached execution context. Never rejects, so `catch` cannot fire.
            evaluate: vi.fn(() => new Promise<never>(() => {})),
        } as unknown as Page;

        await expect(extractInteractiveElements(page, 50)).resolves.toEqual([]);
    }, 2000);

    it('returns extracted elements when the probe answers within the bound', async () => {
        const page = {
            evaluate: vi.fn(async () => [
                {
                    role: 'button',
                    name: 'Save',
                    xpath: '/html/body[1]/button[1]',
                    scope: 'main:Products',
                    value: null,
                    x: 10,
                    y: 20,
                    width: 80,
                    height: 30,
                    scrollable: false,
                    disabled: false,
                },
            ]),
        } as unknown as Page;

        const elements = await extractInteractiveElements(page, 5000);

        expect(elements).toHaveLength(1);
        expect(elements[0].Role).toBe('button');
        expect(elements[0].Name).toBe('Save');
    });

    it('resolves as soon as the probe answers, without waiting out the bound', async () => {
        const page = {
            evaluate: vi.fn(async () => []),
        } as unknown as Page;

        const started = Date.now();
        await extractInteractiveElements(page, 30_000);

        // A Promise.race that leaves its timer pending would still resolve here,
        // so this asserts the fast path is not gated on the bound elapsing.
        expect(Date.now() - started).toBeLessThan(1000);
    });

    it('still degrades to an empty list when the probe throws', async () => {
        const page = {
            evaluate: vi.fn(async () => {
                throw new Error('Execution context was destroyed');
            }),
        } as unknown as Page;

        await expect(extractInteractiveElements(page, 50)).resolves.toEqual([]);
    });
});
