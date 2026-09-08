/**
 * Tests for the workspace health check (src/lib/dev-workspace/doctor.ts).
 * Collection runs against temp fixtures; store-name parsing and rendering are
 * pure. The pnpm version is injected — no spawns, and doctor writes nothing.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BuildSentinel, BuildWorkspaceYaml } from '../lib/dev-workspace/build.js';
import {
  CollectDoctorReport,
  CollectSingletonCensus,
  DoctorHasFailures,
  ParseStoreEntry,
  RenderDoctor,
  SINGLETON_PACKAGES,
} from '../lib/dev-workspace/doctor.js';
import type { DoctorCheck, DoctorReport } from '../lib/dev-workspace/doctor.js';
import { CreateFixtureParent, RemoveFixture } from './dev-workspace-fixture.js';

let parent: string | null = null;

afterEach(() => {
  if (parent !== null) RemoveFixture(parent);
  parent = null;
});

/** Creates `<parent>/node_modules/.pnpm/<entry>` for each virtual-store entry name. */
function writeStore(parentDir: string, entryNames: readonly string[]): void {
  const storeDir = path.join(parentDir, 'node_modules', '.pnpm');
  mkdirSync(storeDir, { recursive: true });
  for (const entryName of entryNames) {
    mkdirSync(path.join(storeDir, entryName), { recursive: true });
  }
}

/** Writes the four generated files, the sentinel and a lockfile for the given members. */
function writeGeneratedWorkspace(parentDir: string, members: readonly string[]): void {
  const yaml = BuildWorkspaceYaml(members.map((Name) => ({ Name, WorkspaceGlobs: ['packages/*'] })));
  writeFileSync(path.join(parentDir, 'pnpm-workspace.yaml'), yaml, 'utf8');
  writeFileSync(path.join(parentDir, '.npmrc'), 'node-linker=isolated\n', 'utf8');
  writeFileSync(path.join(parentDir, 'package.json'), JSON.stringify({ packageManager: 'pnpm@10.33.0' }), 'utf8');
  writeFileSync(path.join(parentDir, 'turbo.json'), '{}', 'utf8');
  writeFileSync(path.join(parentDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n', 'utf8');
  writeFileSync(path.join(parentDir, '.mj-dev-workspace.json'), BuildSentinel(['package.json'], [...members]), 'utf8');
}

/** The named check, or a failure that names what was actually collected. */
function checkNamed(report: DoctorReport, name: string): DoctorCheck {
  const found = report.Checks.find((check) => check.Name === name);
  if (found === undefined) {
    throw new Error(`no check named '${name}'; got: ${report.Checks.map((c) => c.Name).join(', ')}`);
  }
  return found;
}

describe('ParseStoreEntry', () => {
  it('reads an unscoped entry', () => {
    expect(ParseStoreEntry('rxjs@7.8.1')).toEqual({ Name: 'rxjs', Version: '7.8.1' });
  });

  it('decodes the + scope separator', () => {
    expect(ParseStoreEntry('@angular+core@21.1.3')).toEqual({ Name: '@angular/core', Version: '21.1.3' });
  });

  it('strips a peer suffix that itself contains @ — the last-@ parse would be wrong here', () => {
    const entry = '@angular+common@21.1.3(@angular+core@21.1.3)(rxjs@7.8.1)';
    expect(ParseStoreEntry(entry)).toEqual({ Name: '@angular/common', Version: '21.1.3' });

    // proof the naive rule the parser deliberately avoids really does break:
    const naiveVersion = entry.slice(entry.lastIndexOf('@') + 1);
    expect(naiveVersion).not.toBe('21.1.3');
  });

  it('strips an underscore peer suffix (semver forbids _, so a real version survives)', () => {
    expect(ParseStoreEntry('rxjs@7.8.1_typescript@5.9.2')).toEqual({ Name: 'rxjs', Version: '7.8.1' });
  });

  it('reads the shape pnpm 10.33 actually writes — copied verbatim from a real store', () => {
    // `ls node_modules/.pnpm | grep @angular+core` in this repo's own install:
    const entry = '@angular+core@21.1.3_@angular+compiler@21.1.3_rxjs@7.8.2_zone.js@0.16.0';
    expect(ParseStoreEntry(entry)).toEqual({ Name: '@angular/core', Version: '21.1.3' });

    // the last-@ rule would report a DIFFERENT package's version as @angular/core's:
    expect(entry.slice(entry.lastIndexOf('@') + 1)).toBe('0.16.0');
  });

  it('keeps an underscore that belongs to the package name', () => {
    expect(ParseStoreEntry('some_pkg@1.0.0')).toEqual({ Name: 'some_pkg', Version: '1.0.0' });
  });

  it('keeps a prerelease version intact', () => {
    expect(ParseStoreEntry('zone.js@0.15.1-next.0')).toEqual({ Name: 'zone.js', Version: '0.15.1-next.0' });
  });

  it('returns null for the store\'s own node_modules directory', () => {
    expect(ParseStoreEntry('node_modules')).toBeNull();
  });

  it('returns null for file:/link: entries, whose version segment is not a version', () => {
    expect(ParseStoreEntry('file+..+bizapps-common@file+..+bizapps-common')).toBeNull();
  });

  it('returns null for a scoped name with no version', () => {
    expect(ParseStoreEntry('@memberjunction+global')).toBeNull();
  });
});

describe('CollectSingletonCensus', () => {
  it('reports no store when the parent has never been installed', () => {
    parent = CreateFixtureParent({ 'bizapps-x': { RootPackageJson: { name: 'x' }, MjAppJson: true } });
    const census = CollectSingletonCensus(parent);
    expect(census.StorePresent).toBe(false);
    expect(census.Packages).toEqual([]);
  });

  it('finds exactly one version of each singleton in a healthy store', () => {
    parent = CreateFixtureParent({ 'bizapps-x': { RootPackageJson: { name: 'x' }, MjAppJson: true } });
    writeStore(parent, [
      '@angular+core@21.1.3_@angular+compiler@21.1.3_rxjs@7.8.1_zone.js@0.15.1', // pnpm 10 underscore form
      '@angular+common@21.1.3(@angular+core@21.1.3)(rxjs@7.8.1)', // parenthesised form
      'rxjs@7.8.1',
      'zone.js@0.15.1',
      '@memberjunction+global@6.1.0',
      'lodash@4.17.21',
      'node_modules',
    ]);
    const census = CollectSingletonCensus(parent);
    expect(census.StorePresent).toBe(true);
    expect(census.Packages).toEqual([
      { Package: '@angular/core', Versions: ['21.1.3'] },
      { Package: '@angular/common', Versions: ['21.1.3'] },
      { Package: 'rxjs', Versions: ['7.8.1'] },
      { Package: 'zone.js', Versions: ['0.15.1'] },
      { Package: '@memberjunction/global', Versions: ['6.1.0'] },
    ]);
    expect(census.UnparsedEntryCount).toBe(1); // node_modules
  });

  it('counts distinct versions of a duplicated singleton, sorted', () => {
    parent = CreateFixtureParent({ 'bizapps-x': { RootPackageJson: { name: 'x' }, MjAppJson: true } });
    writeStore(parent, ['rxjs@7.8.1', 'rxjs@6.6.7', 'rxjs@7.8.1(typescript@5.9.2)']);
    const census = CollectSingletonCensus(parent);
    expect(census.Packages).toEqual([{ Package: 'rxjs', Versions: ['6.6.7', '7.8.1'] }]);
  });

  it('ignores files in the store directory — only directory names are package resolutions', () => {
    parent = CreateFixtureParent({ 'bizapps-x': { RootPackageJson: { name: 'x' }, MjAppJson: true } });
    writeStore(parent, ['rxjs@7.8.1']);
    writeFileSync(path.join(parent, 'node_modules', '.pnpm', 'rxjs@9.9.9'), 'not a package', 'utf8');
    expect(CollectSingletonCensus(parent).Packages).toEqual([{ Package: 'rxjs', Versions: ['7.8.1'] }]);
  });

  it('rejects a relative parent path', () => {
    expect(() => CollectSingletonCensus('relative/dir')).toThrow(/absolute/);
  });
});

describe('CollectDoctorReport', () => {
  it('passes every check on a generated, installed, single-copy workspace', () => {
    parent = CreateFixtureParent({ 'bizapps-x': { RootPackageJson: { name: 'x' }, MjAppJson: true } });
    writeGeneratedWorkspace(parent, ['bizapps-x']);
    writeStore(parent, ['@angular+core@21.1.3', 'rxjs@7.8.1']);

    const report = CollectDoctorReport(parent, '10.33.0', 'flag');
    expect(DoctorHasFailures(report)).toBe(false);
    expect(checkNamed(report, 'one-copy census').Severity).toBe('pass');
    expect(checkNamed(report, 'workspace files').Severity).toBe('pass');
    expect(checkNamed(report, 'sentinel').Severity).toBe('pass');
    expect(checkNamed(report, 'pnpm version').Severity).toBe('pass');
    expect(checkNamed(report, 'member dirs').Severity).toBe('pass');
    expect(checkNamed(report, 'candidates').Severity).toBe('pass');
    expect(checkNamed(report, 'standalone installs').Severity).toBe('pass');
  });

  it('FAILS the census and names both versions when two rxjs copies are installed', () => {
    parent = CreateFixtureParent({ 'bizapps-x': { RootPackageJson: { name: 'x' }, MjAppJson: true } });
    writeGeneratedWorkspace(parent, ['bizapps-x']);
    writeStore(parent, ['rxjs@7.8.1', 'rxjs@6.6.7']);

    const report = CollectDoctorReport(parent, '10.33.0', 'flag');
    const census = checkNamed(report, 'one-copy census');
    expect(census.Severity).toBe('fail');
    expect(census.Detail).toContain('rxjs (6.6.7, 7.8.1)');
    expect(census.Detail).toContain('mj dev workspace --force');
    expect(DoctorHasFailures(report)).toBe(true);
  });

  it('FAILS on a member carrying a standalone install, and names the fix', () => {
    parent = CreateFixtureParent({
      'bizapps-forked': { RootPackageJson: { name: 'forked' }, MjAppJson: true },
      'bizapps-npm': { RootPackageJson: { name: 'npmish' }, MjAppJson: true },
    });
    writeGeneratedWorkspace(parent, ['bizapps-forked', 'bizapps-npm']);
    writeStore(parent, ['rxjs@7.8.1']);
    mkdirSync(path.join(parent, 'bizapps-forked', 'node_modules', '.pnpm'), { recursive: true });
    mkdirSync(path.join(parent, 'bizapps-npm', 'node_modules'), { recursive: true });
    writeFileSync(path.join(parent, 'bizapps-npm', 'node_modules', '.package-lock.json'), '{}', 'utf8');

    const report = CollectDoctorReport(parent, '10.33.0', 'flag');
    const standalone = checkNamed(report, 'standalone installs');
    expect(standalone.Severity).toBe('fail');
    expect(standalone.Detail).toContain('bizapps-forked');
    expect(standalone.Detail).toContain('bizapps-npm');
    expect(standalone.Detail).toContain('--clean-members');
    expect(DoctorHasFailures(report)).toBe(true);
  });

  it('does NOT call a plain member node_modules a standalone install (the parent install creates those)', () => {
    parent = CreateFixtureParent({ 'bizapps-linked': { RootPackageJson: { name: 'linked' }, MjAppJson: true } });
    writeGeneratedWorkspace(parent, ['bizapps-linked']);
    writeStore(parent, ['rxjs@7.8.1']);
    mkdirSync(path.join(parent, 'bizapps-linked', 'node_modules', '@memberjunction'), { recursive: true });

    const report = CollectDoctorReport(parent, '10.33.0', 'flag');
    expect(checkNamed(report, 'standalone installs').Severity).toBe('pass');
    expect(DoctorHasFailures(report)).toBe(false);
  });

  it('FAILS when a workspace member has no directory on disk', () => {
    parent = CreateFixtureParent({ 'bizapps-x': { RootPackageJson: { name: 'x' }, MjAppJson: true } });
    writeGeneratedWorkspace(parent, ['bizapps-x', 'ghost-repo']);
    writeStore(parent, ['rxjs@7.8.1']);

    const report = CollectDoctorReport(parent, '10.33.0', 'flag');
    const members = checkNamed(report, 'member dirs');
    expect(members.Severity).toBe('fail');
    expect(members.Detail).toContain('ghost-repo');
    expect(DoctorHasFailures(report)).toBe(true);
  });

  it('WARNS about a detected repo that is not a workspace member', () => {
    parent = CreateFixtureParent({
      'bizapps-x': { RootPackageJson: { name: 'x' }, MjAppJson: true },
      'bizapps-y': { RootPackageJson: { name: 'y' }, MjAppJson: true },
    });
    writeGeneratedWorkspace(parent, ['bizapps-x']);
    writeStore(parent, ['rxjs@7.8.1']);

    const report = CollectDoctorReport(parent, '10.33.0', 'flag');
    const candidates = checkNamed(report, 'candidates');
    expect(candidates.Severity).toBe('warn');
    expect(candidates.Detail).toContain('bizapps-y');
    expect(DoctorHasFailures(report)).toBe(false); // a narrower workspace is not a broken one
  });

  it('on a bare parent: files FAIL, install WARNs, and the census SKIPs rather than passing', () => {
    parent = CreateFixtureParent({ 'bizapps-x': { RootPackageJson: { name: 'x' }, MjAppJson: true } });

    const report = CollectDoctorReport(parent, '10.33.0', 'default');
    expect(checkNamed(report, 'workspace files').Severity).toBe('fail');
    expect(checkNamed(report, 'workspace files').Detail).toContain('mj dev workspace --dir');
    expect(checkNamed(report, 'install').Severity).toBe('warn');
    expect(checkNamed(report, 'sentinel').Severity).toBe('warn');
    expect(checkNamed(report, 'pnpm version').Severity).toBe('skip');
    expect(checkNamed(report, 'member dirs').Severity).toBe('skip');
    expect(checkNamed(report, 'one-copy census').Severity).toBe('skip');
    expect(DoctorHasFailures(report)).toBe(true);
  });

  it('SKIPs the census when the store holds none of the single-copy packages', () => {
    parent = CreateFixtureParent({ 'bizapps-x': { RootPackageJson: { name: 'x' }, MjAppJson: true } });
    writeGeneratedWorkspace(parent, ['bizapps-x']);
    writeStore(parent, ['lodash@4.17.21', 'chalk@5.6.2']);

    const census = checkNamed(CollectDoctorReport(parent, '10.33.0', 'flag'), 'one-copy census');
    expect(census.Severity).toBe('skip');
  });

  it('FAILS when the parent directory is itself a git repo root', () => {
    parent = CreateFixtureParent({ 'bizapps-x': { RootPackageJson: { name: 'x' }, MjAppJson: true } });
    mkdirSync(path.join(parent, '.git'), { recursive: true });

    const report = CollectDoctorReport(parent, '10.33.0', 'flag');
    expect(checkNamed(report, 'parent directory').Severity).toBe('fail');
    expect(DoctorHasFailures(report)).toBe(true);
  });

  it('WARNS on a pnpm pin/active mismatch without failing the run', () => {
    parent = CreateFixtureParent({ 'bizapps-x': { RootPackageJson: { name: 'x' }, MjAppJson: true } });
    writeGeneratedWorkspace(parent, ['bizapps-x']);
    writeStore(parent, ['rxjs@7.8.1']);

    const report = CollectDoctorReport(parent, '9.15.0', 'flag');
    const pnpmCheck = checkNamed(report, 'pnpm version');
    expect(pnpmCheck.Severity).toBe('warn');
    expect(pnpmCheck.Detail).toContain('MISMATCH');
    expect(DoctorHasFailures(report)).toBe(false);
  });

  it('rejects a relative parent path', () => {
    expect(() => CollectDoctorReport('relative/dir', null, 'default')).toThrow(/absolute/);
  });
});

/** A report literal the render tests mutate per-case. */
function baseReport(): DoctorReport {
  return {
    ParentDir: '/the/parent',
    DirSource: 'flag',
    Census: { StorePresent: true, Packages: [{ Package: 'rxjs', Versions: ['7.8.1'] }], UnparsedEntryCount: 0 },
    Checks: [
      { Name: 'workspace files', Severity: 'pass', Detail: 'all 4 generated files present' },
      { Name: 'install', Severity: 'warn', Detail: 'missing pnpm-lock.yaml — run `pnpm install`' },
      { Name: 'pnpm version', Severity: 'skip', Detail: 'no pnpm pin at the parent' },
    ],
  };
}

describe('RenderDoctor', () => {
  it('prints one tagged line per check, with the check name and detail', () => {
    const out = RenderDoctor(baseReport());
    expect(out).toContain('[PASS] workspace files: all 4 generated files present');
    expect(out).toContain('[WARN] install:');
    expect(out).toContain('[SKIP] pnpm version:');
  });

  it('heads the report with the parent and how --dir was resolved', () => {
    const out = RenderDoctor(baseReport());
    expect(out).toContain('Workspace doctor: /the/parent');
    expect(out).toContain('resolved from: --dir flag');
  });

  it('summarises the counts and says there were no failures', () => {
    const out = RenderDoctor(baseReport());
    expect(out).toContain('1 passed, 1 warned, 0 failed, 1 skipped');
    expect(out).toContain('no failures');
  });

  it('tags a failure and states that doctor exits non-zero', () => {
    const report = baseReport();
    report.Checks.push({ Name: 'one-copy census', Severity: 'fail', Detail: 'rxjs (6.6.7, 7.8.1)' });
    const out = RenderDoctor(report);
    expect(out).toContain('[FAIL] one-copy census: rxjs (6.6.7, 7.8.1)');
    expect(out).toContain('1 failed');
    expect(out).toContain('doctor exits non-zero');
  });
});

describe('SINGLETON_PACKAGES', () => {
  it('covers the packages whose second copy is a second runtime', () => {
    expect(SINGLETON_PACKAGES).toEqual([
      '@angular/core',
      '@angular/common',
      '@angular/compiler',
      'rxjs',
      'zone.js',
      '@memberjunction/core',
      '@memberjunction/global',
    ]);
  });
});
