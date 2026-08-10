import { describe, it, expect } from 'vitest';
import { isAuthDetourUrl, evaluateAuthDetour } from '../engine/auth-detour.js';

const PATTERNS = ['auth0.com', 'login.microsoftonline.com', '/u/consent'];

describe('isAuthDetourUrl', () => {
    it('matches a host pattern anywhere in the URL, case-insensitively', () => {
        expect(isAuthDetourUrl('https://dev-abc.us.AUTH0.com/authorize?x=1', PATTERNS)).toBe(true);
        expect(isAuthDetourUrl('https://login.microsoftonline.com/common/oauth2', PATTERNS)).toBe(true);
    });

    it('matches a path-scoped pattern', () => {
        expect(isAuthDetourUrl('https://dev-abc.auth0.com/u/consent?state=xyz', PATTERNS)).toBe(true);
    });

    it('does not match the app itself', () => {
        expect(isAuthDetourUrl('http://localhost:4201/app/home', PATTERNS)).toBe(false);
    });

    it('is disabled (never matches) when patterns are empty', () => {
        expect(isAuthDetourUrl('https://anything.auth0.com/', [])).toBe(false);
    });

    it('ignores empty/whitespace patterns and empty URLs', () => {
        expect(isAuthDetourUrl('https://x.auth0.com', ['   ', ''])).toBe(false);
        expect(isAuthDetourUrl('', PATTERNS)).toBe(false);
    });
});

describe('evaluateAuthDetour', () => {
    it('reports no detour for an app URL', () => {
        const d = evaluateAuthDetour('http://localhost:4201/app', PATTERNS, 0, 2);
        expect(d.isDetour).toBe(false);
        expect(d.shouldTerminate).toBe(false);
    });

    it('recovers the first detour (count 0 → 1) when max is 2', () => {
        const d = evaluateAuthDetour('https://x.auth0.com', PATTERNS, 0, 2);
        expect(d.isDetour).toBe(true);
        expect(d.shouldTerminate).toBe(false);
    });

    it('terminates on the detour that reaches max (count 1 → 2)', () => {
        const d = evaluateAuthDetour('https://x.auth0.com', PATTERNS, 1, 2);
        expect(d.isDetour).toBe(true);
        expect(d.shouldTerminate).toBe(true);
    });

    it('terminates on the first detour when max is 1', () => {
        const d = evaluateAuthDetour('https://x.auth0.com', PATTERNS, 0, 1);
        expect(d.isDetour).toBe(true);
        expect(d.shouldTerminate).toBe(true);
    });
});
