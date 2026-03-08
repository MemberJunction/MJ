import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DynamicPackageLoader, DynamicPackageLoad } from '../DynamicPackageLoader';

describe('DynamicPackageLoader', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('LoadSinglePackage — startup function return values', () => {
    it('should capture a DynamicPackageResult returned by the startup function', async () => {
      const mockResult = {
        ExpressMiddlewarePostAuth: [vi.fn()],
        PreRunViewHooks: [vi.fn()],
      };

      vi.doMock('fake-saas-package', () => ({
        LoadSaaSServer: () => mockResult,
      }));

      const pkg: DynamicPackageLoad = {
        PackageName: 'fake-saas-package',
        StartupExport: 'LoadSaaSServer',
        AppName: 'TestSaaS',
        Enabled: true,
      };

      const results = await DynamicPackageLoader.LoadPackages([pkg]);

      expect(results).toHaveLength(1);
      expect(results[0].Success).toBe(true);
      expect(results[0].Result).toBeDefined();
      expect(results[0].Result).toEqual(mockResult);
    });

    it('should capture async DynamicPackageResult from startup function', async () => {
      const mockResult = {
        PreSaveHooks: [vi.fn()],
      };

      vi.doMock('fake-async-package', () => ({
        LoadAsyncServer: async () => mockResult,
      }));

      const pkg: DynamicPackageLoad = {
        PackageName: 'fake-async-package',
        StartupExport: 'LoadAsyncServer',
        AppName: 'TestAsync',
        Enabled: true,
      };

      const results = await DynamicPackageLoader.LoadPackages([pkg]);

      expect(results).toHaveLength(1);
      expect(results[0].Success).toBe(true);
      expect(results[0].Result).toEqual(mockResult);
    });

    it('should set Result to undefined when startup function returns void', async () => {
      vi.doMock('fake-void-package', () => ({
        LoadVoidServer: () => { /* returns void */ },
      }));

      const pkg: DynamicPackageLoad = {
        PackageName: 'fake-void-package',
        StartupExport: 'LoadVoidServer',
        AppName: 'TestVoid',
        Enabled: true,
      };

      const results = await DynamicPackageLoader.LoadPackages([pkg]);

      expect(results).toHaveLength(1);
      expect(results[0].Success).toBe(true);
      expect(results[0].Result).toBeUndefined();
    });

    it('should set Result to undefined when no StartupExport is specified', async () => {
      vi.doMock('fake-no-export-package', () => ({
        SomeExport: 'not a function',
      }));

      const pkg: DynamicPackageLoad = {
        PackageName: 'fake-no-export-package',
        StartupExport: '',
        AppName: 'TestNoExport',
        Enabled: true,
      };

      const results = await DynamicPackageLoader.LoadPackages([pkg]);

      expect(results).toHaveLength(1);
      expect(results[0].Success).toBe(true);
      expect(results[0].Result).toBeUndefined();
    });

    it('should skip disabled packages', async () => {
      const pkg: DynamicPackageLoad = {
        PackageName: 'fake-disabled-package',
        StartupExport: 'LoadServer',
        AppName: 'TestDisabled',
        Enabled: false,
      };

      const results = await DynamicPackageLoader.LoadPackages([pkg]);

      expect(results).toHaveLength(0);
    });

    it('should handle import failure gracefully and return error', async () => {
      const pkg: DynamicPackageLoad = {
        PackageName: 'non-existent-package-xyz',
        StartupExport: 'LoadServer',
        AppName: 'TestFailure',
        Enabled: true,
      };

      // Suppress the console.error from the loader
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const results = await DynamicPackageLoader.LoadPackages([pkg]);

      expect(results).toHaveLength(1);
      expect(results[0].Success).toBe(false);
      expect(results[0].Error).toBeDefined();
      expect(results[0].Result).toBeUndefined();

      consoleSpy.mockRestore();
    });

    it('should load multiple packages concurrently and collect all results', async () => {
      const resultA = { PreRunViewHooks: [vi.fn()] };
      const resultB = { PreSaveHooks: [vi.fn()] };

      vi.doMock('fake-package-a', () => ({
        LoadA: () => resultA,
      }));
      vi.doMock('fake-package-b', () => ({
        LoadB: () => resultB,
      }));

      const packages: DynamicPackageLoad[] = [
        { PackageName: 'fake-package-a', StartupExport: 'LoadA', AppName: 'A', Enabled: true },
        { PackageName: 'fake-package-b', StartupExport: 'LoadB', AppName: 'B', Enabled: true },
      ];

      const results = await DynamicPackageLoader.LoadPackages(packages);

      expect(results).toHaveLength(2);
      expect(results[0].Result).toEqual(resultA);
      expect(results[1].Result).toEqual(resultB);
    });
  });
});
