import { describe, it, expect, beforeEach } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import { ExternalDataSourceRouter } from '../ExternalDataSourceRouter';

describe('ExternalDataSourceRouter', () => {
  beforeEach(() => {
    ExternalDataSourceRouter.Instance.ClearCache();
  });

  it('is a process-wide singleton', () => {
    expect(ExternalDataSourceRouter.Instance).toBe(ExternalDataSourceRouter.Instance);
  });

  it('throws when no metadata provider is available and none is passed', async () => {
    // In the unit-test environment no global provider is configured, so
    // Metadata.Provider is undefined and resolve() should fail fast.
    await expect(
      ExternalDataSourceRouter.Instance.Resolve('00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(/No metadata provider available/);
  });

  it('clearCache is a no-op on an empty cache (with and without an id)', () => {
    expect(() => ExternalDataSourceRouter.Instance.ClearCache()).not.toThrow();
    expect(() => ExternalDataSourceRouter.Instance.ClearCache('00000000-0000-0000-0000-000000000000')).not.toThrow();
  });

  it('memoizes the in-flight resolution — concurrent first-requests for one source share ONE resolution, and a failure is evicted', async () => {
    // The cold-start race: two requests for the same source arriving before the first driver is
    // cached. With the in-flight promise memoized, both share one resolution (one driver — the loser
    // would otherwise orphan its pools); without it, resolution runs twice. We count how many times
    // the resolution actually starts by counting provider lookups. The mock fails fast (after the
    // count) so we don't need the full entity/ClassFactory success chain — memoization and eviction
    // are both observable purely from the count.
    let lookups = 0;
    const countingProvider = {
      GetEntityObject: async () => {
        lookups++;
        throw new Error('boom');
      },
    } as unknown as IMetadataProvider; // minimal test double; Resolve only touches GetEntityObject before failing

    const router = ExternalDataSourceRouter.Instance;
    const id = '11111111-1111-1111-1111-111111111111';

    const settled = await Promise.allSettled([
      router.Resolve(id, undefined, countingProvider),
      router.Resolve(id, undefined, countingProvider),
    ]);
    expect(settled.map((s) => s.status)).toEqual(['rejected', 'rejected']);
    expect(lookups).toBe(1); // shared ONE resolution, not two

    // The failed resolution was evicted (not cached), so a later call retries rather than replaying it.
    await expect(router.Resolve(id, undefined, countingProvider)).rejects.toThrow('boom');
    expect(lookups).toBe(2);
  });

  describe('entity-change cache invalidation (no restart needed)', () => {
    // Reach the private cache + handler the same way the existing tests reach internals.
    type RouterInternals = {
      driverCache: Map<string, Promise<{ driver: { CloseConnection: (id: string) => Promise<void> } }>>;
      handleEntityChange: (event: unknown) => Promise<void>;
    };
    const internals = () => ExternalDataSourceRouter.Instance as unknown as RouterInternals;
    const seed = (id: string) =>
      internals().driverCache.set(id, Promise.resolve({ driver: { CloseConnection: async () => {} } }));
    const has = (id: string) => internals().driverCache.has(id);

    const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    it('evicts ONLY the changed source on a local save/delete', async () => {
      seed(A); seed(B);
      await internals().handleEntityChange({
        type: 'save',
        baseEntity: { EntityInfo: { Name: 'MJ: External Data Sources' }, ID: A },
      });
      expect(has(A)).toBe(false); // the edited source is re-resolved next use
      expect(has(B)).toBe(true);  // unrelated source untouched
    });

    it('evicts ALL sources when the Type changes (DriverClass etc. can affect every source of that type)', async () => {
      seed(A); seed(B);
      await internals().handleEntityChange({
        type: 'save',
        baseEntity: { EntityInfo: { Name: 'MJ: External Data Source Types' } },
      });
      expect(has(A)).toBe(false);
      expect(has(B)).toBe(false);
    });

    it('evicts ALL on a cross-server remote-invalidate (no baseEntity to target a single source)', async () => {
      seed(A); seed(B);
      await internals().handleEntityChange({ type: 'remote-invalidate', entityName: 'MJ: External Data Sources' });
      expect(has(A)).toBe(false);
      expect(has(B)).toBe(false);
    });

    it('ignores changes to unrelated entities', async () => {
      seed(A);
      await internals().handleEntityChange({
        type: 'save',
        baseEntity: { EntityInfo: { Name: 'Users' }, ID: 'x' },
      });
      expect(has(A)).toBe(true);
    });
  });
});
