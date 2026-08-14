/**
 * Tests for committed-lockfile reading and override-pin derivation
 * (src/lib/dev-workspace/lockfile.ts). Joining N repos discards N committed
 * lockfiles — 945 packages re-floated in the field (#3795) — so the generator
 * pins the parent to what the members' lockfiles already resolved: pure file
 * derivation, no network, every skip carried to output.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  CompareResolvedVersions,
  DeriveLockfilePins,
  IsResolvedVersion,
  MajorOf,
  ParseNpmLockfile,
  ParsePnpmLockfile,
  ReadMemberLockfile,
} from '../lib/dev-workspace/lockfile.js';
import type { MemberLockfile } from '../lib/dev-workspace/types.js';
import { CreateFixtureParent, RemoveFixture } from './dev-workspace-fixture.js';

let parent: string | null = null;

afterEach(() => {
  if (parent !== null) RemoveFixture(parent);
  parent = null;
});

/** A minimal pnpm-lock.yaml v9 with one root and one nested importer. */
const PNPM_LOCK = [
  "lockfileVersion: '9.0'",
  '',
  'importers:',
  '',
  '  .:',
  '    dependencies:',
  '      chalk:',
  '        specifier: ^5.3.0',
  '        version: 5.6.2',
  '    devDependencies:',
  "      '@types/node':",
  '        specifier: 24.10.11',
  '        version: 24.10.11',
  '  packages/CLI:',
  '    dependencies:',
  "      '@oclif/core':",
  '        specifier: ^4.0.0',
  '        version: 4.5.4(zod@3.24.1)',
  "      '@memberjunction/core':",
  '        specifier: workspace:*',
  '        version: link:../MJCore',
  '      fstream:',
  '        specifier: npm:tar-fs@^3.0.4',
  '        version: tar-fs@3.1.1',
  '',
  'packages:',
  '',
  "  '@types/node@24.10.11':",
  '    resolution: {integrity: sha512-aaa}',
  '',
  "  '@types/express@4.17.25':",
  '    resolution: {integrity: sha512-bbb}',
  '',
  '  chalk@5.6.2:',
  '    resolution: {integrity: sha512-ccc}',
  '',
] .join('\n');

describe('ParsePnpmLockfile', () => {
  it('reads the resolved version of every direct importer dependency, peer-suffix stripped', () => {
    const lock = ParsePnpmLockfile(PNPM_LOCK) as MemberLockfile;
    expect(lock.Kind).toBe('pnpm');
    expect(lock.Direct).toEqual([
      { Name: 'chalk', Version: '5.6.2' },
      { Name: '@types/node', Version: '24.10.11' },
      { Name: '@oclif/core', Version: '4.5.4' },
    ]);
  });

  it('skips workspace links and npm-alias resolutions WITH reasons — never silently', () => {
    const lock = ParsePnpmLockfile(PNPM_LOCK) as MemberLockfile;
    expect(lock.Skipped).toHaveLength(2);
    expect(lock.Skipped[0]).toMatchObject({ Name: '@memberjunction/core', Reason: 'workspace-internal link' });
    expect(lock.Skipped[1].Name).toBe('fstream');
    expect(lock.Skipped[1].Reason).toContain('non-semver');
  });

  it('collects every @types/* at ANY depth, with snapshot-derived dependents for parentage', () => {
    const lock = ParsePnpmLockfile(PNPM_LOCK) as MemberLockfile;
    expect(lock.Types).toEqual([
      { Name: '@types/node', Version: '24.10.11', Dependents: [] },
      { Name: '@types/express', Version: '4.17.25', Dependents: [] },
    ]);
  });

  it('derives @types parentage from the snapshots section (family shadow-copy detection)', () => {
    const withSnapshots = [
      "lockfileVersion: '9.0'",
      '',
      'packages:',
      '',
      "  '@types/express@5.1.1':",
      '    resolution: {integrity: sha512-x}',
      '',
      'snapshots:',
      '',
      "  '@memberjunction/server@6.1.0(graphql@16.14.2)':",
      '    dependencies:',
      "      '@types/express': 5.1.1",
      '',
      '  chalk@5.6.2: {}',
      '',
    ].join('\n');
    const lock = ParsePnpmLockfile(withSnapshots) as MemberLockfile;
    expect(lock.Types).toEqual([{ Name: '@types/express', Version: '5.1.1', Dependents: ['@memberjunction/server'] }]);
  });

  it('collects EVERY resolved name@version at any depth (per-major pinning reads these)', () => {
    const lock = ParsePnpmLockfile(PNPM_LOCK) as MemberLockfile;
    expect(lock.Resolutions).toEqual([
      { Name: '@types/node', Version: '24.10.11' },
      { Name: '@types/express', Version: '4.17.25' },
      { Name: 'chalk', Version: '5.6.2' },
    ]);
  });

  it('returns an UNSUPPORTED marker for pnpm lockfileVersion < 9 — never a silent zero', () => {
    const legacy = ParsePnpmLockfile("lockfileVersion: 5.4\n\nimporters:\n\n  .:\n    dependencies:\n      axios: 1.6.8\n");
    expect(legacy).toEqual({ Kind: 'unsupported', File: 'pnpm-lock.yaml', Version: '5.4' });
    expect(ParsePnpmLockfile('importers:\n')).toEqual({ Kind: 'unsupported', File: 'pnpm-lock.yaml', Version: 'unknown' });
  });
});

/** A minimal npm package-lock.json v3 with a root and one workspace importer. */
const NPM_LOCK = JSON.stringify({
  name: 'app',
  lockfileVersion: 3,
  packages: {
    '': { dependencies: { express: '^4.18.0', linked: '^1.0.0' }, devDependencies: { typescript: '5.4.5' } },
    'packages/core': { dependencies: { lodash: '^4.17.21' } },
    'node_modules/express': { version: '4.19.2' },
    'node_modules/typescript': { version: '5.4.5' },
    'node_modules/lodash': { version: '4.17.21' },
    'packages/core/node_modules/lodash': { version: '4.17.20' },
    'node_modules/@types/express': { version: '4.17.25' },
    'node_modules/foo/node_modules/@types/qs': { version: '6.9.15' },
    'node_modules/linked': { link: true, resolved: 'packages/core' },
  },
});

describe('ParseNpmLockfile', () => {
  it('resolves each importer direct dep via the nearest-node_modules walk', () => {
    const lock = ParseNpmLockfile(NPM_LOCK) as MemberLockfile;
    expect(lock.Kind).toBe('npm');
    expect(lock.Direct).toContainEqual({ Name: 'express', Version: '4.19.2' });
    expect(lock.Direct).toContainEqual({ Name: 'typescript', Version: '5.4.5' });
    // packages/core sees ITS nested lodash, not the hoisted one
    expect(lock.Direct).toContainEqual({ Name: 'lodash', Version: '4.17.20' });
  });

  it('skips linked workspace entries with a reason, and collects @types (with nesting parentage) + all resolutions', () => {
    const lock = ParseNpmLockfile(NPM_LOCK) as MemberLockfile;
    expect(lock.Skipped).toContainEqual({ Name: 'linked', Version: 'link', Reason: 'workspace-internal link' });
    // hoisted top-level @types: parentage unknown -> []; nested under foo: parent derived from the key path
    expect(lock.Types).toContainEqual({ Name: '@types/express', Version: '4.17.25', Dependents: [] });
    expect(lock.Types).toContainEqual({ Name: '@types/qs', Version: '6.9.15', Dependents: ['foo'] });
    // BOTH committed lodash versions are visible to the key-scoping pass
    expect(lock.Resolutions).toContainEqual({ Name: 'lodash', Version: '4.17.21' });
    expect(lock.Resolutions).toContainEqual({ Name: 'lodash', Version: '4.17.20' });
  });

  it('returns an UNSUPPORTED marker for lockfileVersion 1 — never a silent zero', () => {
    const v1 = JSON.stringify({ name: 'app', lockfileVersion: 1, dependencies: { express: { version: '4.19.2' } } });
    expect(ParseNpmLockfile(v1)).toEqual({ Kind: 'unsupported', File: 'package-lock.json', Version: '1' });
  });

  it('skips git/url specifiers and git resolutions from pinning, with reasons', () => {
    const gitLock = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { dependencies: { 'git-dep': 'github:user/repo#abc', 'url-dep': 'https://example.com/x.tgz', plain: '^1.0.0' } },
        'node_modules/git-dep': { version: '1.2.3', resolved: 'git+https://github.com/user/repo.git#abc' },
        'node_modules/url-dep': { version: '2.0.0', resolved: 'https://example.com/x.tgz' },
        'node_modules/plain': { version: '1.0.5', resolved: 'https://registry.npmjs.org/plain/-/plain-1.0.5.tgz' },
      },
    });
    const lock = ParseNpmLockfile(gitLock) as MemberLockfile;
    expect(lock.Direct).toEqual([{ Name: 'plain', Version: '1.0.5' }]);
    expect(lock.Skipped).toContainEqual({ Name: 'git-dep', Version: 'github:user/repo#abc', Reason: 'git/url specifier' });
    expect(lock.Skipped).toContainEqual({ Name: 'url-dep', Version: 'https://example.com/x.tgz', Reason: 'git/url specifier' });
    // the git-resolved entry is also excluded from the at-depth resolutions
    expect(lock.Resolutions).not.toContainEqual({ Name: 'git-dep', Version: '1.2.3' });
  });
});

describe('ReadMemberLockfile', () => {
  it('reads pnpm-lock.yaml when present, package-lock.json otherwise, null when neither', () => {
    parent = CreateFixtureParent({
      'with-pnpm': { RootPackageJson: { name: 'a' }, PnpmLock: PNPM_LOCK },
      'with-npm': { RootPackageJson: { name: 'b' }, NpmLock: NPM_LOCK },
      bare: { RootPackageJson: { name: 'c' } },
    });
    expect(ReadMemberLockfile(`${parent}/with-pnpm`)?.Kind).toBe('pnpm');
    expect(ReadMemberLockfile(`${parent}/with-npm`)?.Kind).toBe('npm');
    expect(ReadMemberLockfile(`${parent}/bare`)).toBeNull();
  });

  it('throws (never swallows) on an unparseable package-lock.json, naming the file', () => {
    parent = CreateFixtureParent({ broken: { RootPackageJson: { name: 'x' }, NpmLock: '{not json' } });
    expect(() => ReadMemberLockfile(`${parent}/broken`)).toThrow(/Unparseable package-lock\.json.*broken/);
  });
});

describe('CompareResolvedVersions / helpers', () => {
  it('orders by numeric triple, then release over prerelease, then prerelease tag', () => {
    expect(CompareResolvedVersions('4.19.2', '4.18.9')).toBeGreaterThan(0);
    expect(CompareResolvedVersions('2.0.0', '2.0.0-rc.3')).toBeGreaterThan(0);
    expect(CompareResolvedVersions('2.0.0-beta.3', '2.0.0-rc.3')).toBeLessThan(0);
    expect(CompareResolvedVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('throws on non-semver input rather than deciding on garbage', () => {
    expect(() => CompareResolvedVersions('workspace:*', '1.0.0')).toThrow(/concrete versions/);
    expect(() => MajorOf('link:../x')).toThrow(/concrete semver/);
    expect(IsResolvedVersion('2.0.0-beta.3')).toBe(true);
    expect(IsResolvedVersion('tar-fs@3.1.1')).toBe(false);
  });
});

/** Shorthand lockfile literal for derivation tests. */
function lock(
  direct: Array<[string, string]>,
  types: Array<[string, string]> = [],
  resolutions: Array<[string, string]> = []
): MemberLockfile {
  return {
    Kind: 'pnpm',
    Direct: direct.map(([Name, Version]) => ({ Name, Version })),
    Types: types.map(([Name, Version]) => ({ Name, Version })),
    Resolutions: resolutions.map(([Name, Version]) => ({ Name, Version })),
    Skipped: [],
  };
}

describe('DeriveLockfilePins', () => {
  // Review probe10: ^resolved let 6 of 7 field-measured breaks through — a caret
  // pin of ^7.29.7 does not stop the @babel 7.29.7 -> 7.29.8 PATCH bump that
  // broke type compat. Pins are EXACT.
  it('pins EXACT versions — plain key when a single committed major exists', () => {
    const { Pins } = DeriveLockfilePins(
      [{ Repo: 'MJ', Lockfile: lock([['@babel/core', '7.29.7'], ['type-graphql', '2.0.0-beta.3']]) }],
      new Set()
    );
    expect(Pins['@babel/core']).toBe('7.29.7');
    expect(Pins['type-graphql']).toBe('2.0.0-beta.3'); // prerelease stays exact too
  });

  // Round-3 authority rule: only DIRECT declarations vote. At-depth majors get no
  // selector (transitives float within their declared ranges, as the member's own
  // CI allows) — but their existence still forces the SELECTOR key shape, so the
  // direct pin can never drag a chalk@2 transitive consumer cross-major (probe4).
  it('pins only directly-declared majors, scoped when other majors exist at depth', () => {
    const { Pins } = DeriveLockfilePins(
      [
        {
          Repo: 'MJ',
          Lockfile: lock(
            [['chalk', '5.6.2']], // the only DIRECT declaration
            [],
            [['chalk', '5.6.2'], ['chalk', '4.1.2'], ['chalk', '2.4.2']] // transitive majors at depth
          ),
        },
      ],
      new Set()
    );
    expect(Pins['chalk@^5']).toBe('5.6.2'); // scoped, because majors 2/4 exist at depth
    expect(Pins['chalk@^4']).toBeUndefined(); // depth-only majors are NOT pinned
    expect(Pins['chalk@^2']).toBeUndefined();
    expect(Pins.chalk).toBeUndefined(); // a plain key would force the depth consumers cross-major
  });

  // The round-2 defect this rule fixes: a newer same-major version committed only
  // AT DEPTH in another member (a graph built against registry family copies —
  // impossible in the generated workspace) must not outvote a direct declaration.
  it('an at-depth resolution in another member is not authority against a direct declaration', () => {
    const { Pins, Conflicts } = DeriveLockfilePins(
      [
        { Repo: 'MJ', Lockfile: lock([['@cerebras/cerebras_cloud_sdk', '1.64.1']]) },
        { Repo: 'bizapps-accounting', Lockfile: lock([], [], [['@cerebras/cerebras_cloud_sdk', '1.91.0']]) },
      ],
      new Set()
    );
    // same major everywhere -> plain key; the direct declaration's version wins outright
    expect(Pins['@cerebras/cerebras_cloud_sdk']).toBe('1.64.1');
    expect(Conflicts).toEqual([]); // the at-depth 1.91.0 never voted, so there is nothing to report
  });

  it('excludes @types parented ONLY by family registry copies; keeps @types with any non-family dependent', () => {
    const family = new Set(['@memberjunction/server']);
    const { Pins } = DeriveLockfilePins(
      [
        { Repo: 'MJ', Lockfile: lock([], [['@types/express-serve-static-core', '4.19.8']]) },
        {
          Repo: 'bizapps-x',
          Lockfile: {
            Kind: 'pnpm',
            Direct: [],
            Types: [
              // exists ONLY beneath a registry copy of a family package — not authority
              { Name: '@types/express-serve-static-core', Version: '4.19.9', Dependents: ['@memberjunction/server'] },
              // has a non-family dependent — legitimate
              { Name: '@types/qs', Version: '6.9.15', Dependents: ['@memberjunction/server', 'express'] },
            ],
            Resolutions: [],
            Skipped: [],
          },
        },
      ],
      family
    );
    expect(Pins['@types/express-serve-static-core']).toBe('4.19.8'); // the shadow-copy 4.19.9 never voted
    expect(Pins['@types/qs']).toBe('6.9.15');
  });

  it('same-major disagreement: highest committed EXACT wins, conflict reported', () => {
    const { Pins, Conflicts } = DeriveLockfilePins(
      [
        { Repo: 'MJ', Lockfile: lock([['express', '4.19.2']]) },
        { Repo: 'bizapps-x', Lockfile: lock([['express', '4.18.9']]) },
      ],
      new Set()
    );
    expect(Pins.express).toBe('4.19.2');
    expect(Conflicts).toHaveLength(1);
    expect(Conflicts[0].Winner).toEqual({ Repo: 'MJ', Version: '4.19.2' });
    expect(Conflicts[0].Losers).toEqual([{ Repo: 'bizapps-x', Version: '4.18.9' }]);
  });

  // The old rule left cross-major names unpinned; per-major selectors make the
  // conflict representable — pin BOTH majors (the field's @types/express 4/5 case).
  it('cross-member cross-major: each major pinned via its own selector', () => {
    const { Pins, Conflicts } = DeriveLockfilePins(
      [
        { Repo: 'MJ', Lockfile: lock([], [['@types/express', '5.1.1']]) },
        { Repo: 'bizapps-x', Lockfile: lock([], [['@types/express', '4.17.25']]) },
      ],
      new Set()
    );
    expect(Pins['@types/express@^5']).toBe('5.1.1');
    expect(Pins['@types/express@^4']).toBe('4.17.25');
    expect(Pins['@types/express']).toBeUndefined();
    expect(Conflicts).toEqual([]); // different majors are not a conflict — both are pinned
  });

  it('excludes family (member-provided) names — workspace:* overrides cover those', () => {
    const { Pins, ExcludedFamilyNames } = DeriveLockfilePins(
      [{ Repo: 'bizapps-x', Lockfile: lock([['@memberjunction/core', '6.1.0'], ['axios', '1.13.6']]) }],
      new Set(['@memberjunction/core'])
    );
    expect(Pins['@memberjunction/core']).toBeUndefined();
    expect(Pins.axios).toBe('1.13.6');
    expect(ExcludedFamilyNames).toEqual(['@memberjunction/core']);
  });

  it('collapses a duplicate @types WITHIN one lockfile to the highest, reported (the @types/mssql disease)', () => {
    const { Pins, Conflicts } = DeriveLockfilePins(
      [{ Repo: 'BCSaaS', Lockfile: lock([], [['@types/mssql', '9.1.8'], ['@types/mssql', '9.1.11']]) }],
      new Set()
    );
    expect(Pins['@types/mssql']).toBe('9.1.11');
    expect(Conflicts).toHaveLength(1);
    expect(Conflicts[0].Losers).toEqual([{ Repo: 'BCSaaS', Version: '9.1.8' }]);
  });

  // Audit invariant: derived pins are ALWAYS exact concrete versions — any
  // caret/tilde in the final overrides must come from member-HOISTED values,
  // never from this derivation.
  it('every derived pin value is an exact concrete version — never a range', () => {
    const { Pins } = DeriveLockfilePins(
      [
        { Repo: 'MJ', Lockfile: lock([['a', '1.2.3'], ['b', '2.0.0-rc.1']], [['@types/c', '3.4.5']], [['a', '1.2.3'], ['a', '2.0.0']]) },
        { Repo: 'x', Lockfile: lock([['a', '2.0.0'], ['b', '2.0.0-rc.2']]) },
      ],
      new Set()
    );
    expect(Object.keys(Pins).length).toBeGreaterThan(0);
    for (const [key, value] of Object.entries(Pins)) {
      expect(IsResolvedVersion(value), `${key} -> ${value}`).toBe(true);
    }
  });
});
