import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ListLockstepPackages } from '../../scripts/write-lockstep-packages.mjs';

describe('ListLockstepPackages (build script)', () => {
  let root: string;

  /** Writes `packages/<dir>/package.json` with the given content (a string is written as-is). */
  function manifest(dir: string, content: Record<string, unknown> | string): void {
    const full = path.join(root, dir);
    mkdirSync(full, { recursive: true });
    writeFileSync(path.join(full, 'package.json'), typeof content === 'string' ? content : JSON.stringify(content));
  }

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'lockstep-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('lists every published @memberjunction package at the release version, nested or not, sorted', () => {
    manifest('MJCore', { name: '@memberjunction/core', version: '6.2.0' });
    manifest('Angular/Generic/gantt', { name: '@memberjunction/ng-gantt', version: '6.2.0' });
    manifest('MJInstaller', { name: '@memberjunction/installer', version: '6.2.0' });

    expect(ListLockstepPackages(root, '6.2.0')).toEqual([
      '@memberjunction/core',
      '@memberjunction/installer',
      '@memberjunction/ng-gantt',
    ]);
  });

  it('leaves out private packages, other versions, other scopes, build output and invalid manifests', () => {
    manifest('MJCore', { name: '@memberjunction/core', version: '6.2.0' });
    manifest('MobileApp', { name: '@memberjunction/mobile-app', version: '6.2.0', private: true });
    manifest('Skyway', { name: '@memberjunction/skyway-core', version: '0.6.2' });
    manifest('Other', { name: 'left-pad', version: '6.2.0' });
    manifest('MJCore/node_modules/dep', { name: '@memberjunction/global', version: '6.2.0' });
    manifest('MJCore/dist', { name: '@memberjunction/dist-copy', version: '6.2.0' });
    manifest('Broken', '{ not json');

    expect(ListLockstepPackages(root, '6.2.0')).toEqual(['@memberjunction/core']);
  });

  it('returns an empty list for a directory that does not exist', () => {
    expect(ListLockstepPackages(path.join(root, 'missing'), '6.2.0')).toEqual([]);
  });
});
