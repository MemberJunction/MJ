/**
 * Tests for member-repo detection (src/lib/dev-workspace/detect.ts) against
 * real temp-directory fixtures. A candidate is a sibling dir with a root
 * package.json that carries mj-app.json, mentions the @mj-biz-apps scope in a
 * library package, or is the MJ monorepo.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_WORKSPACE_GLOBS,
  DetectCandidates,
  LoadRepo,
  MJ_MONOREPO_PACKAGE_NAME,
  ParseWorkspacePackagesGlobs,
  SelectPackagesGlobs,
} from '../lib/dev-workspace/detect.js';
import { CreateFixtureParent, RemoveFixture } from './dev-workspace-fixture.js';

let parent: string | null = null;

afterEach(() => {
  if (parent !== null) RemoveFixture(parent);
  parent = null;
});

describe('DetectCandidates', () => {
  it('detects an Open App repo by its mj-app.json', () => {
    parent = CreateFixtureParent({
      'bizapps-tasks': { RootPackageJson: { name: 'tasks-root' }, MjAppJson: true },
    });
    const candidates = DetectCandidates(parent);
    expect(candidates.map((c) => c.Name)).toEqual(['bizapps-tasks']);
    expect(candidates[0].Reasons).toContain('mj-app-json');
  });

  it('detects a repo whose library packages mention the @mj-biz-apps scope (name or deps)', () => {
    parent = CreateFixtureParent({
      producer: {
        RootPackageJson: { name: 'producer-root' },
        Packages: { Entities: { name: '@mj-biz-apps/common-entities' } },
      },
      consumer: {
        RootPackageJson: { name: 'consumer-root' },
        Packages: { Server: { name: 'plain-name', dependencies: { '@mj-biz-apps/common-entities': '^1.0.0' } } },
      },
    });
    const candidates = DetectCandidates(parent);
    expect(candidates.map((c) => c.Name)).toEqual(['consumer', 'producer']);
    expect(candidates[0].Reasons).toEqual(['bizapps-packages']);
    expect(candidates[1].Reasons).toEqual(['bizapps-packages']);
  });

  it('detects the MJ monorepo by its root package name', () => {
    parent = CreateFixtureParent({
      'MJ-repo': { RootPackageJson: { name: MJ_MONOREPO_PACKAGE_NAME, packageManager: 'pnpm@10.33.0' } },
    });
    const candidates = DetectCandidates(parent);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].Reasons).toEqual(['mj-monorepo']);
  });

  it('skips dirs without package.json, unmarked repos, dot-dirs, and node_modules', () => {
    parent = CreateFixtureParent({
      'no-manifest': {},
      'plain-repo': { RootPackageJson: { name: 'unrelated' } },
      'bizapps-real': { RootPackageJson: { name: 'real' }, MjAppJson: true },
    });
    mkdirSync(path.join(parent, '.hidden-dir'));
    mkdirSync(path.join(parent, 'node_modules'));
    const candidates = DetectCandidates(parent);
    expect(candidates.map((c) => c.Name)).toEqual(['bizapps-real']);
  });

  it('loads member metadata the builders need (root manifest, packages, turbo.json)', () => {
    parent = CreateFixtureParent({
      'bizapps-x': {
        RootPackageJson: { name: 'x', devDependencies: { turbo: '^2.5.0' } },
        MjAppJson: true,
        Packages: { Entities: { name: '@mj-biz-apps/x-entities' } },
        TurboJson: '{"tasks":{}}',
      },
    });
    const [candidate] = DetectCandidates(parent);
    expect(candidate.RootPackageJson.devDependencies).toEqual({ turbo: '^2.5.0' });
    expect(candidate.Packages).toHaveLength(1);
    expect(candidate.Packages[0].RelPath).toBe('packages/Entities');
    expect(candidate.TurboJson).toBe('{"tasks":{}}');
    expect(candidate.Path).toBe(path.join(parent, 'bizapps-x'));
  });

  it('rejects a relative path and a nonexistent parent', () => {
    expect(() => DetectCandidates('relative/path')).toThrow(/absolute/);
    expect(() => DetectCandidates(path.join('/nonexistent', 'mj-devws'))).toThrow(/does not exist/);
  });

  it('enforces the sibling-directory cap instead of truncating', () => {
    parent = CreateFixtureParent({ a: {}, b: {}, c: {} });
    expect(() => DetectCandidates(parent!, { MaxSiblingDirs: 2 })).toThrow(/over the 2 cap/);
  });

  it('throws (does not swallow) on unparseable JSON, naming the file', () => {
    parent = CreateFixtureParent({});
    const repoDir = path.join(parent, 'broken');
    mkdirSync(repoDir);
    writeFileSync(path.join(repoDir, 'package.json'), '{not json', 'utf8');
    expect(() => DetectCandidates(parent!)).toThrow(/Unparseable JSON.*broken/);
  });
});

describe('LoadRepo', () => {
  it('returns null for a directory without a package.json', () => {
    parent = CreateFixtureParent({ empty: {} });
    expect(LoadRepo(parent, 'empty')).toBeNull();
  });

  it('loads a repo with empty reasons when no marker matches (for --include)', () => {
    parent = CreateFixtureParent({ plain: { RootPackageJson: { name: 'plain' } } });
    const repo = LoadRepo(parent, 'plain');
    expect(repo).not.toBeNull();
    expect(repo!.Reasons).toEqual([]);
  });

  it('defaults WorkspaceGlobs to packages/* for a repo with no pnpm-workspace.yaml', () => {
    parent = CreateFixtureParent({ plain: { RootPackageJson: { name: 'plain' } } });
    const loaded = LoadRepo(parent, 'plain')!;
    expect(loaded.WorkspaceGlobs).toEqual(['packages/*']);
    expect(loaded.WorkspaceGlobsSource).toBe('no-workspace-yaml');
  });

  // The #3795 regression at the detection seam: a nested-layout member (the MJ
  // monorepo declares 42 globs) must contribute ITS OWN globs, not an assumed layout.
  it('loads a nested-layout member\'s own packages globs, dropping app-shell globs', () => {
    parent = CreateFixtureParent({
      MJ: {
        RootPackageJson: { name: MJ_MONOREPO_PACKAGE_NAME },
        Packages: { MJCore: { name: '@memberjunction/core' }, 'AI/Engine': { name: '@memberjunction/aiengine' } },
        PnpmWorkspaceYaml: [
          'linkWorkspacePackages: true',
          '',
          'packages:',
          "  - 'packages/*'",
          '# --- AI ---', // full-line comment mid-list must not truncate the parse (#3795 review)
          "  - 'packages/AI/*'",
          "  - 'packages/Angular/Explorer/*'",
          "  - 'packages/AI/AICLI'",
          "  - 'apps/*'",
          '',
        ].join('\n'),
      },
    });
    const loaded = LoadRepo(parent, 'MJ')!;
    expect(loaded.WorkspaceGlobs).toEqual(['packages/*', 'packages/AI/*', 'packages/Angular/Explorer/*', 'packages/AI/AICLI']);
    expect(loaded.WorkspaceGlobsSource).toBe('member-workspace-yaml');
    // enumeration follows the member's OWN globs — the nested package is seen (it feeds workspace:* overrides)
    expect(loaded.Packages.map((p) => p.RelPath)).toEqual(['packages/AI/Engine', 'packages/MJCore']);
  });

  it('expands a recursive packages/** glob, honoring a !**/dist/** negation', () => {
    parent = CreateFixtureParent({
      mjc: {
        RootPackageJson: { name: 'mjc' },
        PnpmWorkspaceYaml: "packages:\n  - 'packages/**'\n  - '!**/dist/**'\n",
        Files: {
          'packages/a/package.json': '{ "name": "a-pkg" }',
          'packages/a/dist/package.json': '{ "name": "a-pkg" }', // build-output copy — the guard excludes it
          'packages/group/deep/b/package.json': '{ "name": "b-pkg" }',
        },
      },
    });
    const loaded = LoadRepo(parent, 'mjc')!;
    expect(loaded.Packages.map((p) => p.RelPath)).toEqual(['packages/a', 'packages/group/deep/b']);
    expect(loaded.UnsupportedGlobs).toEqual([]);
  });

  it('refuses an unsupported glob shape LOUDLY via UnsupportedGlobs — never a silent miss', () => {
    parent = CreateFixtureParent({
      odd: {
        RootPackageJson: { name: 'odd' },
        PnpmWorkspaceYaml: "packages:\n  - 'packages/*/nested'\n  - 'packages/*'\n",
        Packages: { Entities: { name: 'e' } },
      },
    });
    const loaded = LoadRepo(parent, 'odd')!;
    expect(loaded.UnsupportedGlobs).toEqual(['packages/*/nested']);
    expect(loaded.Packages.map((p) => p.RelPath)).toEqual(['packages/Entities']); // supported globs still expand
  });

  it('loads the committed lockfile when one exists, null otherwise', () => {
    parent = CreateFixtureParent({
      locked: {
        RootPackageJson: { name: 'locked' },
        PnpmLock: "lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    dependencies:\n      chalk:\n        specifier: ^5.3.0\n        version: 5.6.2\n",
      },
      bare: { RootPackageJson: { name: 'bare' } },
    });
    const locked = LoadRepo(parent, 'locked')!;
    const lockfile = locked.Lockfile;
    if (lockfile?.Kind !== 'pnpm') throw new Error(`expected a pnpm lockfile, got ${lockfile?.Kind}`);
    expect(lockfile.Direct).toEqual([{ Name: 'chalk', Version: '5.6.2' }]);
    expect(LoadRepo(parent, 'bare')!.Lockfile).toBeNull();
  });

  it('loads an mjcentral-shaped member: dist-guard negations kept, later top-level keys ignored', () => {
    parent = CreateFixtureParent({
      mjcentral: {
        RootPackageJson: { name: 'mjcentral-root' },
        MjAppJson: true,
        PnpmWorkspaceYaml: [
          'packages:',
          '  - apps/**',
          '  - packages/**',
          '  - tests',
          "  - '!**/.next/**'",
          "  - '!**/dist/**'",
          '',
          '# pnpm >= 11 reads patchedDependencies from here',
          'patchedDependencies:',
          "  'some-pkg@1.0.0': patches/some-pkg.patch",
          '',
          'catalog:',
          "  'typescript': 5.4.5",
          '',
        ].join('\n'),
      },
    });
    const loaded = LoadRepo(parent, 'mjcentral')!;
    expect(loaded.WorkspaceGlobs).toEqual(['packages/**', '!**/.next/**', '!**/dist/**']);
    expect(loaded.WorkspaceGlobsSource).toBe('member-workspace-yaml');
  });

  it('falls back to the default when the workspace file declares nothing packages-rooted, and says so', () => {
    parent = CreateFixtureParent({
      shelly: { RootPackageJson: { name: 'shelly' }, PnpmWorkspaceYaml: "packages:\n  - 'apps/*'\n" },
    });
    const loaded = LoadRepo(parent, 'shelly')!;
    expect(loaded.WorkspaceGlobs).toEqual(['packages/*']);
    expect(loaded.WorkspaceGlobsSource).toBe('workspace-yaml-without-packages-globs');
  });
});

describe('ParseWorkspacePackagesGlobs', () => {
  it('reads quoted, double-quoted, and bare entries under packages:, with comments', () => {
    const yaml = [
      'packages:',
      "  - 'packages/*'  # producer packages",
      '  - "packages/AI/*"',
      '  - packages/Angular/*',
      '',
    ].join('\n');
    expect(ParseWorkspacePackagesGlobs(yaml)).toEqual(['packages/*', 'packages/AI/*', 'packages/Angular/*']);
  });

  it('reads only the packages: list — other keys\' lists are ignored, and the list ends at the next top-level key', () => {
    const yaml = [
      'onlyBuiltDependencies:',
      '  - esbuild',
      'packages:',
      "  - 'packages/*'",
      'catalog:',
      "  - 'not-a-glob'",
      '',
    ].join('\n');
    expect(ParseWorkspacePackagesGlobs(yaml)).toEqual(['packages/*']);
  });

  // Review finding on #3795: a column-0 section comment inside the list used to
  // TERMINATE the parse — on MJ's real 42-glob file one `# --- AI ---` line
  // silently dropped 39 globs, reintroducing the exact disease this fix cures.
  it('is not terminated by full-line comments or blank lines inside the list (MJ-shaped)', () => {
    const yaml = [
      'linkWorkspacePackages: true',
      '',
      'packages:',
      "  - 'packages/*'",
      "  - 'packages/Actions/*'",
      '# --- AI ---',
      "  - 'packages/AI/*'",
      '',
      '  # indented comment',
      "  - 'packages/Angular/Explorer/*'",
      'catalog:',
      "  - 'not-a-glob'",
    ].join('\n');
    expect(ParseWorkspacePackagesGlobs(yaml)).toEqual([
      'packages/*',
      'packages/Actions/*',
      'packages/AI/*',
      'packages/Angular/Explorer/*',
    ]);
  });

  it('reads a zero-indent block list (legal YAML)', () => {
    expect(ParseWorkspacePackagesGlobs("packages:\n- 'packages/*'\n- 'packages/AI/*'\n")).toEqual([
      'packages/*',
      'packages/AI/*',
    ]);
  });

  it('reads flow style, single-line and multi-line', () => {
    expect(ParseWorkspacePackagesGlobs("packages: ['packages/*', 'packages/AI/*']\n")).toEqual([
      'packages/*',
      'packages/AI/*',
    ]);
    expect(ParseWorkspacePackagesGlobs("packages: [\n  'packages/*',\n  \"packages/AI/*\"\n]\n")).toEqual([
      'packages/*',
      'packages/AI/*',
    ]);
    expect(ParseWorkspacePackagesGlobs('packages: []\n')).toEqual([]);
  });

  it('keeps negated entries verbatim and returns [] when there is no parseable packages: list', () => {
    expect(ParseWorkspacePackagesGlobs("packages:\n  - 'packages/*'\n  - '!packages/Internal/*'\n")).toEqual([
      'packages/*',
      '!packages/Internal/*',
    ]);
    expect(ParseWorkspacePackagesGlobs('')).toEqual([]);
    expect(ParseWorkspacePackagesGlobs('linkWorkspacePackages: true\n')).toEqual([]);
    expect(ParseWorkspacePackagesGlobs('packages: *anchor\n')).toEqual([]); // exotica -> [] -> loud fallback
  });
});

describe('SelectPackagesGlobs', () => {
  it('filters POSITIVE globs to packages-rooted ones but keeps ALL negations (guards only subtract)', () => {
    // mjcentral's real shape: packages/** guarded by non-packages-rooted negations.
    // Dropping !**/dist/** would invert the guard and admit dist/ package.json copies.
    const { Globs, UsedFallback } = SelectPackagesGlobs([
      'apps/**',
      'packages/**',
      'tests',
      '!**/.next/**',
      '!**/.terraform/**',
      '!**/.opentofu/**',
      '!**/dist/**',
    ]);
    expect(Globs).toEqual(['packages/**', '!**/.next/**', '!**/.terraform/**', '!**/.opentofu/**', '!**/dist/**']);
    expect(UsedFallback).toBe(false);
  });

  it('strips a leading ./ and collapses duplicates (no doubled glob for packages/*)', () => {
    expect(SelectPackagesGlobs(['./packages/*', 'packages/*', 'packages/AI/*']).Globs).toEqual([
      'packages/*',
      'packages/AI/*',
    ]);
  });

  it('substitutes the default when no packages-rooted positive remains — and reports the fallback', () => {
    expect(DEFAULT_WORKSPACE_GLOBS).toEqual(['packages/*']);
    expect(SelectPackagesGlobs([])).toEqual({ Globs: ['packages/*'], UsedFallback: true });
    expect(SelectPackagesGlobs(['apps/*'])).toEqual({ Globs: ['packages/*'], UsedFallback: true });
    // Negations survive even alongside the substituted default.
    expect(SelectPackagesGlobs(['!**/dist/**'])).toEqual({ Globs: ['packages/*', '!**/dist/**'], UsedFallback: true });
  });
});
