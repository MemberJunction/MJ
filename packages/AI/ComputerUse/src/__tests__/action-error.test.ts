import { describe, it, expect } from 'vitest';

import { distillActionError } from '../engine/action-error.js';

/** Verbatim from run-20260728T201832Z — T124, the filter popover's own backdrop. */
const BACKDROP_INTERCEPTION = `locator.click: Timeout 8000ms exceeded.
Call log:
  - waiting for locator('xpath=/html/body[1]/app-root[1]/div[1]/mj-refresh-button[1]/button[1]').first()
    - locator resolved to <button mjbutton="" type="button" title="Refresh" aria-label="Refresh">…</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <div class="cdk-overlay-backdrop mj-filter-popover-backdrop cdk-overlay-backdrop-showing"></div> from <div class="cdk-overlay-container">…</div> subtree intercepts pointer events
  - retrying click action`;

/** Verbatim from T069 — successive retries name different ancestors. */
const SHIFTING_ANCESTORS = `locator.click: Timeout 8000ms exceeded.
Call log:
  - waiting for locator('xpath=/html/body[1]/ps-catalog[1]/button[1]').first()
    - locator resolved to <button class="chip ng-star-inserted" data-testid="ps-catalog-scenario-chip">…</button>
  - attempting click action
    - <div class="ps-panel ps-catalog" data-testid="ps-catalog-panel">…</div> intercepts pointer events
  - retrying click action
    - <mj-ps-studio-resource _nghost-ng-c3215765789="">…</mj-ps-studio-resource> intercepts pointer events
  - retrying click action
    - <div class="ps-panel ps-catalog" data-testid="ps-catalog-panel">…</div> intercepts pointer events`;

/** A genuine "never appeared" timeout — the call log carries no decision signal. */
const NEVER_RESOLVED = `locator.click: Timeout 2000ms exceeded.
Call log:
  - waiting for locator('xpath=/html/body[1]/div[9]/button[1]').first()
  - waiting for locator('xpath=/html/body[1]/div[9]/button[1]').first()`;

describe('distillActionError', () => {
    it('reports unknown for a missing error', () => {
        expect(distillActionError(undefined)).toBe('unknown');
        expect(distillActionError('')).toBe('unknown');
    });

    it('passes a single-line error through unchanged', () => {
        expect(distillActionError('No interactive element at index 12')).toBe('No interactive element at index 12');
    });

    it('keeps only the headline when nothing intercepted', () => {
        // The element genuinely never appeared; the call log is pure noise.
        expect(distillActionError(NEVER_RESOLVED)).toBe('locator.click: Timeout 2000ms exceeded.');
    });

    it('names the blocker and corrects the "element not found" misreading', () => {
        const distilled = distillActionError(BACKDROP_INTERCEPTION);

        expect(distilled).toContain('locator.click: Timeout 8000ms exceeded.');
        expect(distilled).toContain('The element WAS found');
        expect(distilled).toContain('cdk-overlay-backdrop mj-filter-popover-backdrop');
    });

    it('tells the controller not to repeat the identical click', () => {
        // Without this the model retries the same coordinates until the budget dies.
        expect(distillActionError(BACKDROP_INTERCEPTION)).toContain('Repeating this exact click will fail');
    });

    it('offers the recovery that actually dismisses an overlay', () => {
        const distilled = distillActionError(BACKDROP_INTERCEPTION);

        expect(distilled).toContain('Escape');
        expect(distilled).toContain('click the covering element');
    });

    it('lists every distinct blocker once, in the order seen', () => {
        const distilled = distillActionError(SHIFTING_ANCESTORS);

        expect(distilled).toContain('ps-catalog-panel');
        expect(distilled).toContain('mj-ps-studio-resource');
        expect(distilled).toContain('were covering it');
        // The repeated first ancestor must not appear twice.
        expect(distilled.match(/ps-catalog-panel/g)).toHaveLength(1);
    });

    it('uses singular phrasing for a lone blocker', () => {
        expect(distillActionError(BACKDROP_INTERCEPTION)).toContain('was covering it');
    });

    it('strips Angular per-component attributes from blocker tags', () => {
        const distilled = distillActionError(SHIFTING_ANCESTORS);

        expect(distilled).toContain('<mj-ps-studio-resource>');
        expect(distilled).not.toContain('_nghost-');
    });

    it('drops the call log even when it is very long', () => {
        const noisy = `locator.click: Timeout 8000ms exceeded.\nCall log:\n${'  - waiting 20ms\n'.repeat(80)}`;

        expect(distillActionError(noisy)).toBe('locator.click: Timeout 8000ms exceeded.');
    });

    it('truncates a blocker tag that carries a huge attribute list', () => {
        const wide = `locator.click: Timeout 8000ms exceeded.\nCall log:\n  - <div class="${'x'.repeat(300)}">…</div> intercepts pointer events`;

        const distilled = distillActionError(wide);
        expect(distilled).toContain('…>');
        expect(distilled.length).toBeLessThan(500);
    });
});
