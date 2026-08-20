/**
 * Tests for loadDynamicServerPackages (#3415): dynamicPackages.server entries from
 * mj.config.cjs must be imported (registering non-MJ-namespace entity subclasses)
 * before sync operations instantiate entity objects. The fixture stands in for a
 * real Open App server package; its file URL plays the PackageName role since
 * import() accepts both bare specifiers and URLs.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { loadDynamicServerPackages } from '../lib/provider-utils';

const FIXTURE = new URL('./fixtures/fake-server-pkg.mjs', import.meta.url).href;

type GlobalWithCounters = typeof globalThis & {
  __fakeServerPkgImports?: number;
  __fakeServerPkgKickerRuns?: number;
};
const g = globalThis as GlobalWithCounters;

describe('loadDynamicServerPackages', () => {
  beforeEach(() => {
    g.__fakeServerPkgKickerRuns = 0;
  });

  it('is a no-op when the section is absent or empty', async () => {
    await expect(loadDynamicServerPackages(undefined)).resolves.toBeUndefined();
    await expect(loadDynamicServerPackages([])).resolves.toBeUndefined();
  });

  it('imports the package and invokes its StartupExport', async () => {
    await loadDynamicServerPackages([{ PackageName: FIXTURE, StartupExport: 'LoadFakeServer' }]);
    expect(g.__fakeServerPkgImports).toBeGreaterThanOrEqual(1);
    expect(g.__fakeServerPkgKickerRuns).toBe(1);
  });

  it('imports without invoking anything when no StartupExport is declared', async () => {
    await loadDynamicServerPackages([{ PackageName: FIXTURE }]);
    expect(g.__fakeServerPkgKickerRuns).toBe(0);
  });

  it('skips entries with Enabled: false', async () => {
    await loadDynamicServerPackages([{ PackageName: FIXTURE, StartupExport: 'LoadFakeServer', Enabled: false }]);
    expect(g.__fakeServerPkgKickerRuns).toBe(0);
  });

  it('tolerates a package that is not installed (ERR_MODULE_NOT_FOUND)', async () => {
    await expect(
      loadDynamicServerPackages([{ PackageName: '@mj-test/definitely-not-installed' }])
    ).resolves.toBeUndefined();
  });

  it('warns but does not throw when a StartupExport throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await expect(
        loadDynamicServerPackages([{ PackageName: FIXTURE, StartupExport: 'ExplodingStartup' }])
      ).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('continues past a failing entry to load later ones', async () => {
    await loadDynamicServerPackages([
      { PackageName: '@mj-test/definitely-not-installed' },
      { PackageName: FIXTURE, StartupExport: 'LoadFakeServer' },
    ]);
    expect(g.__fakeServerPkgKickerRuns).toBe(1);
  });
});
