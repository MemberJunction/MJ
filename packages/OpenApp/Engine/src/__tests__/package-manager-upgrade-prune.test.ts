/**
 * AddAppPackages with PreviousPackages: an upgrade removes the pins of the previous version's
 * packages that the new manifest no longer places in a workspace (#6789).
 *
 * The fixtures are the real bizapps-forms manifests: 0.14.0 lists forms-actions under `shared`,
 * 1.0.0 moves it to `server`. Before the fix the client workspace kept `forms-actions@0.14.0`,
 * so the install put a second copy of forms-actions and forms-entities next to 1.0.0.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AddAppPackages, type PackageManagerOptions } from '../install/package-manager.js';
import type { ManifestPackageEntry } from '../manifest/manifest-schema.js';

const lib = (name: string): ManifestPackageEntry => ({ name, role: 'library' });
const boot = (name: string, startupExport: string): ManifestPackageEntry => ({ name, role: 'bootstrap', startupExport });

const FORMS_0_14 = {
  Server: [boot('@mj-biz-apps/forms-server', 'LoadBizAppsFormsServer')],
  Client: [boot('@mj-biz-apps/forms-ng', 'LoadBizAppsFormsClient')],
  Shared: [lib('@mj-biz-apps/forms-entities'), lib('@mj-biz-apps/forms-actions')],
};
const FORMS_1_0 = {
  Server: [boot('@mj-biz-apps/forms-server', 'LoadBizAppsFormsServer'), lib('@mj-biz-apps/forms-core-entities-server'), lib('@mj-biz-apps/forms-actions')],
  Client: [boot('@mj-biz-apps/forms-ng', 'LoadBizAppsFormsClient')],
  Shared: [lib('@mj-biz-apps/forms-entities')],
};

describe('AddAppPackages — removes pins the new version no longer places in a workspace (#6789)', () => {
  let repo: string;
  const serverPkg = (): string => join(repo, 'packages', 'MJAPI', 'package.json');
  const clientPkg = (): string => join(repo, 'packages', 'MJExplorer', 'package.json');
  const deps = (path: string): Record<string, string> => JSON.parse(readFileSync(path, 'utf-8')).dependencies;

  function options(version: string, next: typeof FORMS_1_0, overrides: Partial<PackageManagerOptions> = {}): PackageManagerOptions {
    return {
      RepoRoot: repo,
      ServerPackages: next.Server,
      ClientPackages: next.Client,
      SharedPackages: next.Shared,
      Version: version,
      VersionStrategy: 'exact',
      ServerPackagePath: 'packages/MJAPI',
      ClientPackagePath: 'packages/MJExplorer',
      ...overrides,
    };
  }

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'oa-upgrade-prune-'));
    mkdirSync(join(repo, 'packages', 'MJAPI'), { recursive: true });
    mkdirSync(join(repo, 'packages', 'MJExplorer'), { recursive: true });
    writeFileSync(serverPkg(), JSON.stringify({ name: 'mj_api', dependencies: { express: '^4.0.0' } }));
    writeFileSync(clientPkg(), JSON.stringify({ name: 'mj_explorer', dependencies: { '@angular/core': '^18.0.0' } }));
    // `mj app install --version 0.14.0`
    expect(AddAppPackages(options('0.14.0', FORMS_0_14)).Success).toBe(true);
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('drops the client pin of a package that moved from shared to server', () => {
    const result = AddAppPackages(options('1.0.0', FORMS_1_0, { PreviousPackages: FORMS_0_14 }));

    expect(result.Success).toBe(true);
    expect(deps(clientPkg())).toEqual({
      '@angular/core': '^18.0.0',
      '@mj-biz-apps/forms-ng': '1.0.0',
      '@mj-biz-apps/forms-entities': '1.0.0',
    });
    expect(deps(serverPkg())).toEqual({
      express: '^4.0.0',
      '@mj-biz-apps/forms-server': '1.0.0',
      '@mj-biz-apps/forms-entities': '1.0.0',
      '@mj-biz-apps/forms-actions': '1.0.0',
      '@mj-biz-apps/forms-core-entities-server': '1.0.0',
    });
    expect(result.Removed).toEqual(['@mj-biz-apps/forms-actions']);
  });

  it('drops a package the new version no longer lists from every workspace', () => {
    const next = { ...FORMS_1_0, Shared: [] };

    const result = AddAppPackages(options('1.0.0', next, { PreviousPackages: FORMS_0_14 }));

    expect(result.Success).toBe(true);
    expect(deps(clientPkg())).not.toHaveProperty('@mj-biz-apps/forms-entities');
    expect(deps(serverPkg())).not.toHaveProperty('@mj-biz-apps/forms-entities');
    expect(result.Removed.sort()).toEqual(['@mj-biz-apps/forms-actions', '@mj-biz-apps/forms-entities']);
  });

  it('keeps a stale pin that another installed app still declares', () => {
    const result = AddAppPackages(options('1.0.0', FORMS_1_0, { PreviousPackages: FORMS_0_14, RetainPackages: ['@mj-biz-apps/forms-actions'] }));

    expect(result.Success).toBe(true);
    expect(deps(clientPkg())['@mj-biz-apps/forms-actions']).toBe('0.14.0');
    expect(result.Removed).toEqual([]);
  });

  it('leaves dependencies the previous version did not declare alone', () => {
    AddAppPackages(options('1.0.0', FORMS_1_0, { PreviousPackages: FORMS_0_14 }));

    expect(deps(serverPkg()).express).toBe('^4.0.0');
    expect(deps(clientPkg())['@angular/core']).toBe('^18.0.0');
  });

  it('removes nothing without PreviousPackages (the install path)', () => {
    const result = AddAppPackages(options('1.0.0', FORMS_1_0));

    expect(deps(clientPkg())['@mj-biz-apps/forms-actions']).toBe('0.14.0');
    expect(result.Removed).toEqual([]);
  });

  it('puts the earlier workspace back, stale pin included, when a later one fails', () => {
    const before = readFileSync(clientPkg(), 'utf-8');
    const serverBefore = readFileSync(serverPkg(), 'utf-8');
    // a client target with no package.json: its read throws after both primary targets were written
    const result = AddAppPackages(
      options('1.0.0', FORMS_1_0, {
        PreviousPackages: FORMS_0_14,
        AdditionalTargets: [{ Path: 'packages/Missing', Role: 'client' }],
      }),
    );

    expect(result.Success).toBe(false);
    expect(readFileSync(clientPkg(), 'utf-8')).toBe(before);
    expect(readFileSync(serverPkg(), 'utf-8')).toBe(serverBefore);
  });
});
