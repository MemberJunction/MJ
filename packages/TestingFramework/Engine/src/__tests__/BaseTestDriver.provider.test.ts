/**
 * `BaseTestDriver.Provider` must hand back a real provider.
 *
 * The fallback returned `new Metadata() as unknown as IMetadataProvider`. But
 * `Metadata` is a FACADE — a convenience class that proxies a hand-maintained
 * subset of members to the global provider — not a provider itself. The cast is
 * what stopped the compiler from saying so.
 *
 * The cost was a security check that never ran. The integration suite's
 * `discoverTokenFilter` reads `provider.RowLevelSecurityFilters` looking for a
 * `{{UserID}}`-scoped filter. The facade does not proxy that member, so it read
 * `undefined`, the caller's `?? []` turned that into "no filters exist", and the
 * `rls-isolation` RLS1/RLS2 token-substitution checks skipped-as-pass on EVERY
 * database while the bundle reported green. Verified against a live database:
 * 13 filters present, 5 of them containing `{{UserID}}`.
 *
 * The getter's own doc comment already promised the global `Metadata.Provider`;
 * the code returned something else.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { Metadata } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import { BaseTestDriver } from '../drivers/BaseTestDriver';

class ProbeDriver extends BaseTestDriver {
    public async Execute(): Promise<never> {
        throw new Error('not used');
    }
}

describe('BaseTestDriver.Provider', () => {
    const original = Metadata.Provider;
    afterEach(() => {
        Metadata.Provider = original;
    });

    /** A member the Metadata facade does NOT proxy — the one that broke. */
    const stub = {
        Entities: [{ Name: 'Users' }],
        RowLevelSecurityFilters: [{ Name: 'Own Runs', FilterText: "UserID = '{{UserID}}'" }],
    } as unknown as IMetadataProvider;

    it('falls back to the global provider, not a Metadata facade', () => {
        Metadata.Provider = stub;
        expect(new ProbeDriver().Provider).toBe(stub);
    });

    it('exposes RowLevelSecurityFilters through the fallback', () => {
        Metadata.Provider = stub;
        expect(new ProbeDriver().Provider.RowLevelSecurityFilters).toHaveLength(1);
    });

    it('lets a {{UserID}} filter be discovered — the exact rls-isolation lookup', () => {
        Metadata.Provider = stub;
        const filters = new ProbeDriver().Provider.RowLevelSecurityFilters ?? [];
        expect(filters.find((f) => f.FilterText?.includes('{{UserID}}'))).toBeDefined();
    });

    it('still prefers an explicitly injected provider', () => {
        Metadata.Provider = stub;
        const injected = { Entities: [] } as unknown as IMetadataProvider;
        const d = new ProbeDriver();
        d.Provider = injected;
        expect(d.Provider).toBe(injected);
    });
});
