import { describe, it, expect } from 'vitest';
import { IsStandaloneRoute } from '../lib/standalone-routes';

describe('IsStandaloneRoute', () => {
    it('matches the OAuth callback and the Excel connect page', () => {
        expect(IsStandaloneRoute('/oauth/callback')).toBe(true);
        expect(IsStandaloneRoute('/office/connect')).toBe(true);
    });

    it('ignores the query string and fragment', () => {
        expect(IsStandaloneRoute('/office/connect?pk=abc&state=def')).toBe(true);
        expect(IsStandaloneRoute('/oauth/callback?code=1#x')).toBe(true);
    });

    it('matches a path below a standalone route', () => {
        expect(IsStandaloneRoute('/oauth/callback/extra')).toBe(true);
    });

    it('does not match other routes, or a route that only shares a prefix', () => {
        expect(IsStandaloneRoute('/')).toBe(false);
        expect(IsStandaloneRoute('/app/home')).toBe(false);
        expect(IsStandaloneRoute('/office')).toBe(false);
        expect(IsStandaloneRoute('/office/connected')).toBe(false);
        expect(IsStandaloneRoute('/oauth/callbacks')).toBe(false);
    });

    it('strips the base href from a browser path', () => {
        expect(IsStandaloneRoute('/explorer/office/connect', '/explorer/')).toBe(true);
        expect(IsStandaloneRoute('/explorer/app/home', '/explorer')).toBe(false);
    });

    it('leaves a path alone when the base href is the root or does not prefix it', () => {
        expect(IsStandaloneRoute('/office/connect', '/')).toBe(true);
        expect(IsStandaloneRoute('/office/connect', '/explorer')).toBe(true);
    });
});
