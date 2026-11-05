/**
 * Tests for the angular.json prebundle-exclude management (src/lib/dev-workspace/prebundle.ts, #3875):
 * a join adds the linked repos' scopes once and keeps `@memberjunction/*` first, a clean removes only
 * what the join recorded and leaves the file byte-identical, and a workspace with no other scopes
 * leaves the file untouched.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BuildSentinel } from '../lib/dev-workspace/build.js';
import { ReadSentinel } from '../lib/dev-workspace/clean.js';
import {
  ApplyPrebundleEdits,
  CollectLinkedScopes,
  FindJsonValueSpan,
  FindPrebundleDrift,
  PlanPrebundleExcludes,
  PrebundleRecordsOf,
  RevertPrebundleExcludes,
  RewritePrebundleExclude,
} from '../lib/dev-workspace/prebundle.js';
import type { CandidateRepo, MemberPackageInfo, MemberPackageJson, PrebundleExcludeRecord } from '../lib/dev-workspace/types.js';
import { CreateFixtureParent, RemoveFixture } from './dev-workspace-fixture.js';

let parent: string | null = null;

afterEach(() => {
  if (parent !== null) RemoveFixture(parent);
  parent = null;
});

const EXPLORER_REL = 'packages/MJExplorer';
const ANGULAR_REL = `MJ/${EXPLORER_REL}/angular.json`;

/** An angular.json shaped like MJExplorer's: 2-space indent, multi-line arrays, the committed exclude. */
const EXPLORER_ANGULAR_JSON = `${JSON.stringify(
  {
    version: 1,
    projects: {
      MJExplorer: {
        architect: {
          build: { options: { polyfills: ['zone.js'] } },
          serve: {
            builder: '@angular-devkit/build-angular:dev-server',
            options: { hmr: true, prebundle: { exclude: ['@memberjunction/*'] } },
          },
        },
      },
    },
  },
  null,
  2
)}\n`;

/** The MJExplorer shell package: an Angular app with a builder and an MJ Angular surface. */
const EXPLORER_PACKAGE: MemberPackageJson = {
  name: 'mj_explorer',
  dependencies: { '@angular/core': '21.1.3', '@memberjunction/ng-explorer-app': '6.2.0' },
  devDependencies: { '@angular/cli': '21.1.3' },
};

function pkgInfo(relPath: string, name: string, extra: MemberPackageJson = {}): MemberPackageInfo {
  return { RelPath: relPath, PackageJson: { name, ...extra } };
}

function member(parentDir: string, name: string, packages: MemberPackageInfo[]): CandidateRepo {
  return {
    Name: name,
    Path: path.join(parentDir, name),
    Reasons: [],
    RootPackageJson: {},
    Packages: packages,
    UnsupportedGlobs: [],
    Lockfile: null,
    MjAppJsonError: null,
    MjAppJson: null,
    WorkspaceGlobs: ['packages/*'],
    WorkspaceGlobsSource: 'no-workspace-yaml',
  };
}

/** A parent holding the MJ monorepo (with Explorer's angular.json) and the given app repos' packages. */
function setUp(angularJson: string = EXPLORER_ANGULAR_JSON): { Parent: string; Mj: CandidateRepo } {
  const dir = CreateFixtureParent({ MJ: { Files: { [`${EXPLORER_REL}/angular.json`]: angularJson } } });
  parent = dir;
  const mj = member(dir, 'MJ', [
    pkgInfo(EXPLORER_REL, EXPLORER_PACKAGE.name ?? '', EXPLORER_PACKAGE),
    pkgInfo('packages/MJCore', '@memberjunction/core'),
    pkgInfo('packages/Fixture', '@mj-fixture/thing'),
  ]);
  return { Parent: dir, Mj: mj };
}

const bizapps = (dir: string): CandidateRepo =>
  member(dir, 'bizapps-tasks', [pkgInfo('packages/Tasks', '@mj-biz-apps/tasks'), pkgInfo('packages/TasksNg', '@mj-biz-apps/tasks-ng')]);

function readAngular(dir: string): string {
  return readFileSync(path.join(dir, ...ANGULAR_REL.split('/')), 'utf8');
}

function excludeOf(text: string): string[] {
  return (JSON.parse(text) as { projects: { MJExplorer: { architect: { serve: { options: { prebundle: { exclude: string[] } } } } } } })
    .projects.MJExplorer.architect.serve.options.prebundle.exclude;
}

/** Runs a join: plan, record in a sentinel, write. Returns the records. */
function join(dir: string, members: CandidateRepo[]): PrebundleExcludeRecord[] {
  const plan = PlanPrebundleExcludes(dir, members, PrebundleRecordsOf(ReadSentinel(dir)));
  writeFileSync(path.join(dir, '.mj-dev-workspace.json'), BuildSentinel(['package.json'], members.map((m) => m.Name), plan.Records), 'utf8');
  ApplyPrebundleEdits(dir, plan.Edits);
  return plan.Records;
}

describe('CollectLinkedScopes', () => {
  it('returns the other members\' scopes, skipping the shell repo, @memberjunction and unscoped names', () => {
    const { Parent, Mj } = setUp();
    const other = member(Parent, 'other', [pkgInfo('packages/A', '@acme/a'), pkgInfo('packages/B', 'plain-name'), pkgInfo('packages/C', '@memberjunction/x')]);
    expect(CollectLinkedScopes([Mj, bizapps(Parent), other], 'MJ')).toEqual(['@acme/*', '@mj-biz-apps/*']);
  });
});

describe('FindJsonValueSpan / RewritePrebundleExclude', () => {
  it('finds the exclude array and rewrites only it, single-line style kept', () => {
    const text = '{"projects": {"App": {"architect": {"serve": {"options": {"prebundle": {"exclude": ["@memberjunction/*"]}}}}}}}';
    const span = FindJsonValueSpan(text, ['projects', 'App', 'architect', 'serve', 'options', 'prebundle', 'exclude']);
    expect(span).not.toBeNull();
    expect(text.slice(span?.Start, span?.End)).toBe('["@memberjunction/*"]');
    expect(RewritePrebundleExclude(text, 'App', ['@memberjunction/*', '@x/*'])).toBe(
      '{"projects": {"App": {"architect": {"serve": {"options": {"prebundle": {"exclude": ["@memberjunction/*", "@x/*"]}}}}}}}'
    );
  });

  it('returns null for a path that does not exist', () => {
    expect(FindJsonValueSpan('{"a": {"b": [1, "x", {"c": null}]}}', ['a', 'c'])).toBeNull();
  });
});

describe('join and clean', () => {
  it('adds the linked scope after @memberjunction/*, touches nothing else, and records it', () => {
    const { Parent, Mj } = setUp();
    const records = join(Parent, [Mj, bizapps(Parent)]);
    expect(records).toEqual([{ file: ANGULAR_REL, project: 'MJExplorer', entries: ['@mj-biz-apps/*'] }]);
    const after = readAngular(Parent);
    expect(excludeOf(after)).toEqual(['@memberjunction/*', '@mj-biz-apps/*']);
    // only the exclude array changed: the rest of the file is the original text
    expect(after.replace(/"exclude": \[[^\]]*\]/, '')).toBe(EXPLORER_ANGULAR_JSON.replace(/"exclude": \[[^\]]*\]/, ''));
    expect(PrebundleRecordsOf(ReadSentinel(Parent))).toEqual(records);
  });

  it('is idempotent: a second join adds nothing twice and keeps the record', () => {
    const { Parent, Mj } = setUp();
    join(Parent, [Mj, bizapps(Parent)]);
    const once = readAngular(Parent);
    const records = join(Parent, [Mj, bizapps(Parent)]);
    expect(readAngular(Parent)).toBe(once);
    expect(records).toEqual([{ file: ANGULAR_REL, project: 'MJExplorer', entries: ['@mj-biz-apps/*'] }]);
  });

  it('clean removes only the recorded entries and leaves the file byte-identical to before the join', () => {
    const { Parent, Mj } = setUp();
    join(Parent, [Mj, bizapps(Parent)]);
    const result = RevertPrebundleExcludes(Parent, PrebundleRecordsOf(ReadSentinel(Parent)), false);
    expect(result.Reverted).toEqual([{ File: ANGULAR_REL, Project: 'MJExplorer', Removed: ['@mj-biz-apps/*'] }]);
    expect(readAngular(Parent)).toBe(EXPLORER_ANGULAR_JSON);
  });

  it('clean keeps an entry the developer added by hand', () => {
    const { Parent, Mj } = setUp();
    join(Parent, [Mj, bizapps(Parent)]);
    const withHandEdit = RewritePrebundleExclude(readAngular(Parent), 'MJExplorer', ['@memberjunction/*', '@mj-biz-apps/*', '@mine/*']);
    writeFileSync(path.join(Parent, ...ANGULAR_REL.split('/')), withHandEdit, 'utf8');
    RevertPrebundleExcludes(Parent, PrebundleRecordsOf(ReadSentinel(Parent)), false);
    expect(excludeOf(readAngular(Parent))).toEqual(['@memberjunction/*', '@mine/*']);
  });

  it('does not record a scope that was already in the file, so clean leaves it', () => {
    const { Parent, Mj } = setUp(EXPLORER_ANGULAR_JSON.replace('"@memberjunction/*"', '"@memberjunction/*",\n                "@mj-biz-apps/*"'));
    expect(join(Parent, [Mj, bizapps(Parent)])).toEqual([]);
    expect(excludeOf(readAngular(Parent))).toEqual(['@memberjunction/*', '@mj-biz-apps/*']);
  });

  it('dry-run clean reports the entries and writes nothing', () => {
    const { Parent, Mj } = setUp();
    join(Parent, [Mj, bizapps(Parent)]);
    const joined = readAngular(Parent);
    const result = RevertPrebundleExcludes(Parent, PrebundleRecordsOf(ReadSentinel(Parent)), true);
    expect(result.Reverted).toHaveLength(1);
    expect(readAngular(Parent)).toBe(joined);
  });

  it('a re-join without the app repo takes its scope back out', () => {
    const { Parent, Mj } = setUp();
    join(Parent, [Mj, bizapps(Parent)]);
    expect(join(Parent, [Mj])).toEqual([]);
    expect(readAngular(Parent)).toBe(EXPLORER_ANGULAR_JSON);
  });

  it('leaves the file untouched when no member links another scope', () => {
    const { Parent, Mj } = setUp();
    const plan = PlanPrebundleExcludes(Parent, [Mj], []);
    expect(plan).toEqual({ Edits: [], Records: [], Skipped: [] });
  });

  it('skips an angular.json that is not plain JSON and says why', () => {
    const { Parent, Mj } = setUp(`// comment\n${EXPLORER_ANGULAR_JSON}`);
    const plan = PlanPrebundleExcludes(Parent, [Mj, bizapps(Parent)], []);
    expect(plan.Edits).toEqual([]);
    expect(plan.Skipped).toHaveLength(1);
    expect(plan.Skipped[0].Reason).toContain('not plain JSON');
  });

  it('refuses a sentinel record that points outside the parent or at another file', () => {
    const { Parent } = setUp();
    const result = RevertPrebundleExcludes(
      Parent,
      [
        { file: '../elsewhere/angular.json', project: 'MJExplorer', entries: ['@x/*'] },
        { file: 'MJ/package.json', project: 'MJExplorer', entries: ['@x/*'] },
      ],
      false
    );
    expect(result.Reverted).toEqual([]);
    expect(result.Skipped.map((s) => s.File)).toEqual(['../elsewhere/angular.json', 'MJ/package.json']);
  });

  it('FindPrebundleDrift names recorded entries a git reset removed', () => {
    const { Parent, Mj } = setUp();
    const records = join(Parent, [Mj, bizapps(Parent)]);
    expect(FindPrebundleDrift(Parent, records)).toEqual([]);
    writeFileSync(path.join(Parent, ...ANGULAR_REL.split('/')), EXPLORER_ANGULAR_JSON, 'utf8');
    expect(FindPrebundleDrift(Parent, records)).toEqual([{ File: ANGULAR_REL, Project: 'MJExplorer', Missing: ['@mj-biz-apps/*'] }]);
  });
});

describe('sentinel', () => {
  it('omits prebundleExcludes when there are none, so older sentinels stay byte-identical', () => {
    expect(BuildSentinel(['package.json'], ['MJ'])).not.toContain('prebundleExcludes');
  });

  it('treats a malformed prebundleExcludes list as not ours', () => {
    const { Parent } = setUp();
    writeFileSync(
      path.join(Parent, '.mj-dev-workspace.json'),
      JSON.stringify({ generatedBy: 'mj dev workspace', files: [], members: [], prebundleExcludes: [{ file: 1 }] }),
      'utf8'
    );
    expect(ReadSentinel(Parent).Kind).toBe('invalid');
  });
});
