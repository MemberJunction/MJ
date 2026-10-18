import { describe, it, expect, afterEach } from 'vitest';
import { SetReadinessBeacon } from './readiness-beacon';

/**
 * The readiness beacon is a contract with `@memberjunction/computer-use`: its settle
 * loop polls the CSS selector `[data-mj-ready="true"]` and treats a match as
 * "the active route has finished loading". These specs assert the published
 * attribute against that exact selector, so a rename on either side fails here
 * rather than silently degrading every replayed test to hash-guessing.
 */
const BEACON_SELECTOR = '[data-mj-ready="true"]';

describe('setReadinessBeacon', () => {
    afterEach(() => {
        delete document.documentElement.dataset.mjReady;
    });

    it('publishes the beacon the settle loop polls for once the route is ready', () => {
        SetReadinessBeacon(true);

        expect(document.querySelector(BEACON_SELECTOR)).toBe(document.documentElement);
    });

    it('clears the beacon while the shell is loading, so a stale ready is never observed', () => {
        SetReadinessBeacon(true);
        SetReadinessBeacon(false);

        expect(document.querySelector(BEACON_SELECTOR)).toBeNull();
        // Removed outright rather than set to "false" — the selector matches on the
        // value, so a lingering attribute would be a silent trap for any future
        // profile that polls `[data-mj-ready]` instead.
        expect(document.documentElement.hasAttribute('data-mj-ready')).toBe(false);
    });

    it('targets an explicitly supplied root, so it is not bound to the live document', () => {
        const root = document.createElement('div');

        SetReadinessBeacon(true, root);

        expect(root.getAttribute('data-mj-ready')).toBe('true');
        expect(document.documentElement.hasAttribute('data-mj-ready')).toBe(false);
    });
});
