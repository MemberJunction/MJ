import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PackageMap } from '../analyzer/PackageMap';

function fakeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'jit-pm-'));
  writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n  - 'packages/AI/*'\n");
  const mk = (dir: string, pkg: object, withTest: boolean, withVitest: boolean) => {
    mkdirSync(join(root, dir, 'src/__tests__'), { recursive: true });
    writeFileSync(join(root, dir, 'package.json'), JSON.stringify(pkg));
    if (withVitest) writeFileSync(join(root, dir, 'vitest.config.ts'), '');
    if (withTest) writeFileSync(join(root, dir, 'src/__tests__/a.test.ts'), '');
  };
  mk('packages/MJCore', { name: '@memberjunction/core', devDependencies: {} }, true, true);
  mk('packages/AI/Core', { name: '@memberjunction/ai' }, false, true);
  mk('packages/NoTests', { name: '@memberjunction/notests' }, false, false);
  return root;
}

describe('PackageMap', () => {
  const map = PackageMap.Load(fakeRepo());
  it('maps a file to its package', () => {
    expect(map.PackageForPath('packages/MJCore/src/generic/x.ts')?.Name).toBe('@memberjunction/core');
    expect(map.PackageForPath('packages/AI/Core/src/y.ts')?.Name).toBe('@memberjunction/ai');
    expect(map.PackageForPath('README.md')).toBeNull();
  });
  it('knows whether a package has vitest and tests', () => {
    expect(map.Get('@memberjunction/core')).toMatchObject({ HasVitest: true, HasTests: true });
    expect(map.Get('@memberjunction/ai')).toMatchObject({ HasVitest: true, HasTests: false });
    expect(map.Get('@memberjunction/notests')).toMatchObject({ HasVitest: false, HasTests: false });
  });
});
