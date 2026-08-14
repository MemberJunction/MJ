/**
 * Tests for member-repo detection (src/lib/dev-workspace/detect.ts) against
 * real temp-directory fixtures. A candidate is a sibling dir with a root
 * package.json that carries mj-app.json, mentions the @mj-biz-apps scope in a
 * library package, or is the MJ monorepo.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DetectCandidates, LoadRepo, MJ_MONOREPO_PACKAGE_NAME } from '../lib/dev-workspace/detect.js';
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
    expect(candidate.Packages[0].DirName).toBe('Entities');
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
});
