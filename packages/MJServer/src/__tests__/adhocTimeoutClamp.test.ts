/**
 * An ad-hoc query's timeout never exceeds the server's requestTimeout, so a caller cannot hold a
 * read-only connection longer than any other request may.
 */
import { describe, it, expect } from 'vitest';
import { ClampAdhocTimeoutSeconds } from '../resolvers/adhocTimeout';

describe('ClampAdhocTimeoutSeconds', () => {
    it('caps a longer request at requestTimeout', () => {
        expect(ClampAdhocTimeoutSeconds(600, 30000)).toBe(30);
    });

    it('keeps a shorter request', () => {
        expect(ClampAdhocTimeoutSeconds(5, 30000)).toBe(5);
    });

    it('uses 30 seconds when the caller names none, within the cap', () => {
        expect(ClampAdhocTimeoutSeconds(undefined, 30000)).toBe(30);
        expect(ClampAdhocTimeoutSeconds(undefined, 10000)).toBe(10);
        expect(ClampAdhocTimeoutSeconds(0, 30000)).toBe(30);
    });

    it('leaves the request alone when the server sets no limit', () => {
        expect(ClampAdhocTimeoutSeconds(600, 0)).toBe(600);
    });
});
