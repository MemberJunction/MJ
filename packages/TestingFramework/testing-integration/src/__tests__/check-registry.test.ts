import { describe, it, expect } from 'vitest';
import { IntegrationCheckRegistry } from '../check-registry';
import type { NamedCheck } from '../check';
import { ServerCacheChecks } from '../checks/server-cache.checks';
import { ClientCacheChecks } from '../checks/client-cache.checks';
import { RunQueryCacheChecks } from '../checks/runquery-cache.checks';

const makeCheck = (id: string): NamedCheck => ({ Id: id, Name: id, Fn: async () => { /* pass */ } });

describe('IntegrationCheckRegistry', () => {
    it('registers and retrieves a check by Id', () => {
        const reg = IntegrationCheckRegistry.Instance;
        reg.Register(makeCheck('regtest.A'));
        expect(reg.Get('regtest.A')?.Id).toBe('regtest.A');
    });

    it('GetBundle returns only checks whose Id starts with "<prefix>."', () => {
        const reg = IntegrationCheckRegistry.Instance;
        reg.Register(makeCheck('bundleX.one'));
        reg.Register(makeCheck('bundleX.two'));
        reg.Register(makeCheck('bundleY.one'));
        const ids = reg.GetBundle('bundleX').map(c => c.Id).sort();
        expect(ids).toEqual(['bundleX.one', 'bundleX.two']);
    });

    it('returns undefined for an unknown Id (tolerant by design)', () => {
        expect(IntegrationCheckRegistry.Instance.Get('definitely.unknown.xyz')).toBeUndefined();
    });

    it('Instance is a stable singleton', () => {
        expect(IntegrationCheckRegistry.Instance).toBe(IntegrationCheckRegistry.Instance);
    });
});

describe('migrated bundles (coverage-loss guard)', () => {
    const bundles: Array<[string, NamedCheck[], number]> = [
        ['server-cache', ServerCacheChecks, 26],
        ['client-cache', ClientCacheChecks, 12],
        ['runquery-cache', RunQueryCacheChecks, 9]
    ];

    for (const [prefix, checks, expectedCount] of bundles) {
        describe(prefix, () => {
            it(`has exactly ${expectedCount} checks`, () => {
                expect(checks).toHaveLength(expectedCount);
            });

            it('has unique, prefix-namespaced Ids and non-empty Names', () => {
                const ids = checks.map(c => c.Id);
                expect(new Set(ids).size).toBe(ids.length); // no dupes → no silently dropped check
                for (const c of checks) {
                    expect(c.Id.startsWith(prefix + '.')).toBe(true);
                    expect(c.Name.trim().length).toBeGreaterThan(0);
                }
            });

            it('registered itself on the singleton in array order (ordering is load-bearing)', () => {
                const registered = IntegrationCheckRegistry.Instance.GetBundle(prefix).map(c => c.Id);
                expect(registered).toEqual(checks.map(c => c.Id));
            });
        });
    }

    it('server-cache marks exactly S17/S23/S24 as RequiresMutation', () => {
        const mutating = ServerCacheChecks.filter(c => c.RequiresMutation).map(c => c.Id);
        expect(mutating.sort()).toEqual(['server-cache.S17', 'server-cache.S23', 'server-cache.S24']);
    });

    it('client-cache marks exactly C10 as RequiresMutation', () => {
        const mutating = ClientCacheChecks.filter(c => c.RequiresMutation).map(c => c.Id);
        expect(mutating).toEqual(['client-cache.C10']);
    });

    it('runquery-cache marks nothing RequiresMutation (the whole bundle mutates by design)', () => {
        expect(RunQueryCacheChecks.some(c => c.RequiresMutation)).toBe(false);
    });
});
