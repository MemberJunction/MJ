import { describe, it, expect } from 'vitest';
import { dynamicPackagesSchema } from '../config.js';

/**
 * The CLI's config schema must accept every `dynamicPackages` shape the loader accepts. The
 * schema gates getValidatedConfig(), which `mj migrate`, `mj clean`, `mj app check-updates`
 * and others call — a stricter schema than @memberjunction/dynamic-packages turns a README
 * example into "Database credentials are missing or empty … dynamicPackages.server.N.AppName".
 */
describe('dynamicPackages config schema', () => {
  it('accepts the entries `mj app install` writes', () => {
    const parsed = dynamicPackagesSchema.safeParse({
      server: [{ PackageName: '@mj-biz-apps/orders-server', StartupExport: 'LoadBizAppsOrdersServer', AppName: 'mj-bizapps-orders', Enabled: true }],
      client: [{ PackageName: '@mj-biz-apps/orders-ng', AppName: 'mj-bizapps-orders', Enabled: true }],
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts hand-authored entries without AppName, with process scoping (the README examples)', () => {
    const parsed = dynamicPackagesSchema.safeParse({
      server: [
        { PackageName: '@acme/demo-seed-server', StartupExport: 'LoadDemoSeed', Processes: ['cli:sync'] },
        { PackageName: '@acme/audit-server', StartupExport: 'LoadAudit', ExcludeProcesses: ['cli:codegen'] },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data?.server?.[0].AppName).toBeUndefined();
      expect(parsed.data?.server?.[0].Enabled).toBe(true);
      expect(parsed.data?.server?.[1].ExcludeProcesses).toEqual(['cli:codegen']);
    }
  });

  it('accepts every policy value the loader accepts, not only load/none', () => {
    for (const value of ['load', 'none', 'off', 'skip', 'false', '0', 'on', 'true', '1', 'full']) {
      const parsed = dynamicPackagesSchema.safeParse({ policy: { 'cli:codegen': value } });
      expect(parsed.success, `policy value '${value}'`).toBe(true);
    }
  });

  it('still rejects an entry with no PackageName', () => {
    expect(dynamicPackagesSchema.safeParse({ server: [{ StartupExport: 'X' }] }).success).toBe(false);
  });
});
