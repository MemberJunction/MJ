import { describe, it, expect } from 'vitest';
import { OAuthCallbackHandler, OAuthCallbackHandlerOptions } from '../rest/OAuthCallbackHandler.js';

/**
 * The OAuth callback redirects to a caller-supplied `frontendReturnUrl`. Without an origin check
 * that is an open redirect issued *from the trusted MJAPI origin* — a phishing primitive that
 * inherits MJAPI's reputation and any origin-scoped trust a user or downstream system places in it.
 *
 * The guard is reached through a narrowly-typed view of the instance, following the same pattern as
 * OAuthCallbackHandler.xss.test.ts (the method is private by design).
 */
interface RedirectGuard {
    isFrontendReturnUrlAllowed(url: URL): boolean;
    parseAllowedFrontendReturnUrl(frontendReturnUrl: string): URL | null;
    isFrontendReturnUrlAcceptable(frontendReturnUrl: unknown): boolean;
}

const BASE_OPTIONS: OAuthCallbackHandlerOptions = {
    publicUrl: 'https://api.example.test',
    successRedirectUrl: 'https://api.example.test/oauth/success',
    errorRedirectUrl: 'https://api.example.test/oauth/error',
};

function makeGuard(allowedFrontendOrigins?: string[]): RedirectGuard {
    const handler = new OAuthCallbackHandler({ ...BASE_OPTIONS, allowedFrontendOrigins });
    return handler as unknown as RedirectGuard;
}

describe('OAuthCallbackHandler open-redirect protection', () => {
    describe('with an explicit origin allowlist', () => {
        const allowed = ['https://app.example.test', 'https://admin.example.test'];

        it.each([
            'https://evil.test/steal',
            'https://app.example.test.evil.test/steal',
            'http://app.example.test',            // scheme mismatch — origin includes the scheme
            'https://app.example.test:8443',      // port mismatch — origin includes the port
        ])('rejects %s', (url) => {
            expect(makeGuard(allowed).parseAllowedFrontendReturnUrl(url)).toBeNull();
        });

        it.each([
            'https://app.example.test/done',
            'https://admin.example.test/oauth/landing?keep=1',
        ])('allows %s', (url) => {
            expect(makeGuard(allowed).parseAllowedFrontendReturnUrl(url)).not.toBeNull();
        });

        it('allows the built-in redirect origin even when it is not in the allowlist', () => {
            // The success/error pages MJAPI itself serves must always remain reachable.
            expect(
                makeGuard(allowed).parseAllowedFrontendReturnUrl('https://api.example.test/oauth/success')
            ).not.toBeNull();
        });

        it('rejects an unparseable URL', () => {
            expect(makeGuard(allowed).parseAllowedFrontendReturnUrl('not-a-url')).toBeNull();
        });

        it('rejects a javascript: pseudo-URL', () => {
            // Parses fine as a URL, but its origin is "null" and must not match an allowlist entry.
            expect(makeGuard(allowed).parseAllowedFrontendReturnUrl('javascript:alert(1)')).toBeNull();
        });
    });

    describe('backward-compatible default', () => {
        it("allows any origin when the allowlist is ['*']", () => {
            expect(makeGuard(['*']).parseAllowedFrontendReturnUrl('https://evil.test/steal')).not.toBeNull();
        });

        it('allows any origin when no allowlist is configured at all', () => {
            expect(makeGuard(undefined).parseAllowedFrontendReturnUrl('https://evil.test/steal')).not.toBeNull();
        });
    });

    describe('request-boundary check used by /oauth/initiate', () => {
        const guard = () => makeGuard(['https://app.example.test']);

        it('accepts an allowed origin', () => {
            expect(guard().isFrontendReturnUrlAcceptable('https://app.example.test/done')).toBe(true);
        });

        it('rejects a disallowed origin', () => {
            expect(guard().isFrontendReturnUrlAcceptable('https://evil.test/steal')).toBe(false);
        });

        it.each([
            ['an array', ['https://app.example.test/done']],
            ['an object', { url: 'https://app.example.test/done' }],
            ['a number', 42],
            ['null', null],
        ])('rejects %s rather than coercing it', (_label, value) => {
            expect(guard().isFrontendReturnUrlAcceptable(value)).toBe(false);
        });
    });
});
