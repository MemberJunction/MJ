import { describe, it, expect } from 'vitest';
import { IsDeadBrowserHandleError } from '../dead-handle';

// ──────────────────────────────────────────────────────────────────────────────
// #3598 — the predicate that decides whether an error costs a browser its life.
//
// Both directions are load-bearing and they fail differently. A false negative leaves the original
// bug (a surface stuck on "Browser not launched" for the rest of the session). A false POSITIVE
// relaunches a healthy browser over a bad selector, discarding cookies, login state and scroll
// position — the user watches their page reset because a click missed. The false-positive tests
// below are the ones that matter most.
// ──────────────────────────────────────────────────────────────────────────────

describe('IsDeadBrowserHandleError — the browser is gone', () => {
    it('recognises the exact error the live incident produced 232 times', () => {
        expect(IsDeadBrowserHandleError(new Error('Browser not launched. Call Launch() before using the adapter.'))).toBe(true);
    });

    it('recognises the other ways a browser or its transport disappears', () => {
        for (const message of [
            'Target closed',
            'Protocol error (Runtime.evaluate): Target crashed',
            'Browser has been closed',
            'Browser has disconnected',
            'Page has been closed',
            'Session closed',
            'WebSocket is not open: readyState 3 (CLOSED)',
            'connect ECONNREFUSED 127.0.0.1:9222',
            'read ECONNRESET',
        ]) {
            expect(IsDeadBrowserHandleError(new Error(message)), message).toBe(true);
        }
    });

    it('matches regardless of casing', () => {
        expect(IsDeadBrowserHandleError(new Error('BROWSER NOT LAUNCHED'))).toBe(true);
        expect(IsDeadBrowserHandleError(new Error('target CLOSED'))).toBe(true);
    });
});

describe('IsDeadBrowserHandleError — a live browser giving a real answer', () => {
    it('never relaunches over a page-level navigation failure', () => {
        // A live browser reporting that a SITE would not load. Tearing down the user's logged-in
        // browser because they typed a URL that is down would be the worst possible reading.
        for (const message of [
            'page.goto: net::ERR_CONNECTION_CLOSED at https://example.com',
            'page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:9999',
            'page.goto: net::ERR_NAME_NOT_RESOLVED at https://nope.invalid',
            'net::ERR_ABORTED',
        ]) {
            expect(IsDeadBrowserHandleError(new Error(message)), message).toBe(false);
        }
    });

    it('keeps refusing page-level failures even for a message that DOES carry a dead phrase', () => {
        // This message is synthetic, and pinning it is the point. Today no `net::` error matches any
        // phrase in the list — Chrome spells them with underscores and the phrases use spaces. The
        // guard exists for the edit that closes that gap: the next phrase someone adds is plausibly
        // `connection refused`, and the bug it would introduce is silent and destructive. This test
        // fails the moment the `net::` check stops running first, which is the only way to notice.
        expect(IsDeadBrowserHandleError(new Error('page.goto: net::ERR_FAILED — target closed'))).toBe(false);
    });

    it('never relaunches over a bad selector, a timeout, or a missing element', () => {
        for (const message of [
            'Timeout 30000ms exceeded',
            'waiting for selector "#submit" failed',
            'No element matching selector ".cta"',
            'Element is not visible',
            'Execution context was destroyed, most likely because of a navigation',
        ]) {
            expect(IsDeadBrowserHandleError(new Error(message)), message).toBe(false);
        }
    });

    it('treats anything unrecognisable as a live browser', () => {
        // The closed list degrades to TODAY's behaviour, never to a surprise relaunch.
        expect(IsDeadBrowserHandleError(new Error('something nobody has seen before'))).toBe(false);
        expect(IsDeadBrowserHandleError(new Error(''))).toBe(false);
        expect(IsDeadBrowserHandleError(undefined)).toBe(false);
        expect(IsDeadBrowserHandleError(null)).toBe(false);
        expect(IsDeadBrowserHandleError({})).toBe(false);
        expect(IsDeadBrowserHandleError(42)).toBe(false);
    });
});

describe('IsDeadBrowserHandleError — non-Error throwables', () => {
    it('reads a plain string throw', () => {
        expect(IsDeadBrowserHandleError('Browser not launched')).toBe(true);
        expect(IsDeadBrowserHandleError('nothing to see')).toBe(false);
    });

    it('reads an object carrying a message, which is what a rejected driver promise often is', () => {
        expect(IsDeadBrowserHandleError({ message: 'Target closed' })).toBe(true);
        expect(IsDeadBrowserHandleError({ message: 42 })).toBe(false);
    });
});
