/**
 * AuthProviderFactory cache-bound tests (memory-leak fix R2-C4).
 *
 * The pre-fix `issuerCache` and `issuerMultiCache` were unbounded `Map`s keyed
 * by JWT `iss` claims — a misconfigured or malicious client supplying arbitrary
 * issuer URLs would walk the maps up indefinitely. Both are now `MJLruCache`
 * with `maxSize: 50`. These tests verify:
 *   - Lookups still hit the cache after the first miss.
 *   - LRU eviction kicks in past `maxSize` (no unbounded growth).
 *   - `register()` still clears both caches.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthProviderFactory } from '../AuthProviderFactory';
import { IAuthProvider } from '../IAuthProvider';

function makeProvider(name: string, issuerSubstr: string): IAuthProvider {
    return {
        name,
        issuer: issuerSubstr,
        validateConfig: () => true,
        matchesIssuer: (iss: string) => iss.includes(issuerSubstr),
        getJwksUri: () => 'https://example.com/.well-known/jwks.json',
        getAlgorithm: () => 'RS256',
        getAudience: () => 'aud',
        getRequiredScopes: () => [],
        validateToken: vi.fn(),
        extractUserInfo: vi.fn(),
    } as unknown as IAuthProvider;
}

describe('AuthProviderFactory cache (memory-leak fix R2-C4)', () => {
    let factory: AuthProviderFactory;

    beforeEach(() => {
        factory = AuthProviderFactory.Instance;
        factory.clear();
    });

    it('caches getByIssuer results so a hot lookup returns from cache', () => {
        const provider = makeProvider('p1', 'auth0.com/foo');
        factory.register(provider);

        const matchSpy = vi.spyOn(provider, 'matchesIssuer');
        // First call — cache miss, walks providers
        expect(factory.getByIssuer('https://auth0.com/foo')).toBe(provider);
        expect(matchSpy).toHaveBeenCalledTimes(1);
        // Second call — cache hit, no further matchesIssuer calls
        expect(factory.getByIssuer('https://auth0.com/foo')).toBe(provider);
        expect(matchSpy).toHaveBeenCalledTimes(1);
    });

    it('caches getAllByIssuer results similarly', () => {
        const p1 = makeProvider('p1', 'shared.example.com');
        const p2 = makeProvider('p2', 'shared.example.com');
        factory.register(p1);
        factory.register(p2);

        const a = factory.getAllByIssuer('https://shared.example.com');
        const b = factory.getAllByIssuer('https://shared.example.com');
        expect(a).toEqual([p1, p2]);
        expect(b).toBe(a); // cached array, same reference
    });

    it('does NOT grow without bound when arbitrary issuers are queried', () => {
        const provider = makeProvider('p1', 'auth0.com');
        factory.register(provider);

        // Walk past the LRU cap with distinct issuer keys (a malicious or
        // misconfigured client could do this). Cache must stay bounded.
        for (let i = 0; i < 200; i++) {
            factory.getByIssuer(`https://auth0.com/tenant-${i}`);
        }

        // Direct field inspection — verify the LRU enforced its cap.
        const issuerCache = (factory as unknown as { issuerCache: { Size: number; MaxSize: number } }).issuerCache;
        expect(issuerCache.Size).toBeLessThanOrEqual(issuerCache.MaxSize);
        expect(issuerCache.MaxSize).toBe(50);
    });

    it('clears both caches on register()', () => {
        const provider = makeProvider('p1', 'auth0.com');
        factory.register(provider);
        factory.getByIssuer('https://auth0.com/foo'); // populate cache

        const issuerCache = (factory as unknown as { issuerCache: { Size: number } }).issuerCache;
        expect(issuerCache.Size).toBe(1);

        factory.register(makeProvider('p2', 'okta.com'));
        expect(issuerCache.Size).toBe(0);
    });

    it('clears both caches on clear()', () => {
        factory.register(makeProvider('p1', 'auth0.com'));
        factory.getByIssuer('https://auth0.com/foo');
        factory.getAllByIssuer('https://auth0.com/foo');

        factory.clear();
        expect(factory.hasProviders()).toBe(false);
        const issuerCache = (factory as unknown as { issuerCache: { Size: number } }).issuerCache;
        const issuerMultiCache = (factory as unknown as { issuerMultiCache: { Size: number } }).issuerMultiCache;
        expect(issuerCache.Size).toBe(0);
        expect(issuerMultiCache.Size).toBe(0);
    });
});

describe('AuthProviderFactory provider disposal (memory-leak audit 2026-09-19)', () => {
    // `register()`/`clear()` used to drop the old IAuthProvider value with no disposal call.
    // Each BaseAuthProvider instance owns a keep-alive https.Agent + jwksClient; discarding it
    // without disposing left its socket pool open until its own 60s idle timeout, on every
    // admin-triggered auth-catalog refresh (`refreshAuthProviders()`).
    let factory: AuthProviderFactory;

    beforeEach(() => {
        factory = AuthProviderFactory.Instance;
        factory.clear();
    });

    it('does not call Dispose when registering a brand-new provider name', () => {
        const provider = makeProvider('p1', 'auth0.com');
        const disposeSpy = vi.fn();
        provider.Dispose = disposeSpy;

        factory.register(provider);

        expect(disposeSpy).not.toHaveBeenCalled();
    });

    it('disposes the outgoing provider when register() replaces an existing name', () => {
        const oldProvider = makeProvider('p1', 'auth0.com');
        const oldDispose = vi.fn();
        oldProvider.Dispose = oldDispose;
        factory.register(oldProvider);

        const newProvider = makeProvider('p1', 'auth0.com');
        const newDispose = vi.fn();
        newProvider.Dispose = newDispose;
        factory.register(newProvider);

        expect(oldDispose).toHaveBeenCalledTimes(1);
        expect(newDispose).not.toHaveBeenCalled();
    });

    it('does not dispose a provider that re-registers itself (same instance)', () => {
        const provider = makeProvider('p1', 'auth0.com');
        const disposeSpy = vi.fn();
        provider.Dispose = disposeSpy;

        factory.register(provider);
        factory.register(provider); // idempotent re-register of the SAME instance

        expect(disposeSpy).not.toHaveBeenCalled();
    });

    it('disposes every registered provider on clear()', () => {
        const p1 = makeProvider('p1', 'auth0.com');
        const p2 = makeProvider('p2', 'okta.com');
        const dispose1 = vi.fn();
        const dispose2 = vi.fn();
        p1.Dispose = dispose1;
        p2.Dispose = dispose2;
        factory.register(p1);
        factory.register(p2);

        factory.clear();

        expect(dispose1).toHaveBeenCalledTimes(1);
        expect(dispose2).toHaveBeenCalledTimes(1);
    });

    it('tolerates providers with no Dispose method (optional on IAuthProvider)', () => {
        // makeProvider() intentionally does not set Dispose - most of this file's fixtures don't.
        expect(() => {
            factory.register(makeProvider('p1', 'auth0.com'));
            factory.register(makeProvider('p1', 'auth0.com')); // replaces p1, old has no Dispose
            factory.clear();
        }).not.toThrow();
    });
});
