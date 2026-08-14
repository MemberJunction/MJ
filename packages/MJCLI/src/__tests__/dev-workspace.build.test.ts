/**
 * Tests for the pure content builders behind `mj dev workspace`
 * (src/lib/dev-workspace/build.ts). Content rules reproduce the manual setup this
 * command replaces:
 * producer packages-only globs, the three .npmrc lines (and NO hoist block), the
 * devDependency union with highest-version-wins conflict logging, and the pnpm
 * packageManager pin.
 */
import { describe, expect, it } from 'vitest';
import {
  AssembleParentOverrides,
  BASELINE_DEV_DEPENDENCIES,
  BuildNpmrc,
  BuildRootPackageJson,
  BuildSentinel,
  BuildShellPeerGuidance,
  BuildWorkspaceYaml,
  CollectFamilyPackages,
  CompareVersionStrings,
  FALLBACK_PNPM_PIN,
  NPMRC_BASE_LINES,
  ONLY_BUILT_DEPENDENCIES,
  PickTurboJson,
  ResolveDevDependencyUnion,
  ResolveMemberPnpmBlocks,
  ResolvePnpmPin,
  SENTINEL_MARKER,
  SHELL_PROVIDED_PEERS,
} from '../lib/dev-workspace/build.js';
import type { CandidateRepo } from '../lib/dev-workspace/types.js';

/** Minimal CandidateRepo factory for pure-builder tests. */
function repo(name: string, overrides?: Partial<CandidateRepo>): CandidateRepo {
  return {
    Name: name,
    Path: `/fixture/${name}`,
    Reasons: ['mj-app-json'],
    RootPackageJson: {},
    Packages: [],
    UnsupportedGlobs: [],
    Lockfile: null,
    TurboJson: null,
    WorkspaceGlobs: ['packages/*'],
    WorkspaceGlobsSource: 'no-workspace-yaml',
    ...overrides,
  };
}

/** The glob lines of the generated yaml's `packages:` section. */
function packagesSectionGlobs(yaml: string): string[] {
  return yaml
    .slice(yaml.indexOf('packages:'))
    .split('\n')
    .filter((line) => line.startsWith('  - '));
}

describe('BuildWorkspaceYaml', () => {
  it('throws on an empty member list', () => {
    expect(() => BuildWorkspaceYaml([])).toThrow(/at least one member/);
  });

  it('emits linkWorkspacePackages and the 16-name build-scripts allowlist', () => {
    const yaml = BuildWorkspaceYaml([repo('bizapps-common')]);
    expect(yaml).toContain('linkWorkspacePackages: true');
    expect(ONLY_BUILT_DEPENDENCIES).toHaveLength(16);
    expect(yaml).toContain("  - '@apollo/protobufjs'"); // scoped names quoted
    expect(yaml).toContain('  - esbuild'); // bare names unquoted
    expect(yaml).toContain('  - tesseract.js');
  });

  it('emits a repo-root glob and the default packages glob per plain member, sorted', () => {
    const yaml = BuildWorkspaceYaml([repo('bizapps-tasks'), repo('bizapps-common')]);
    expect(packagesSectionGlobs(yaml)).toEqual([
      "  - 'bizapps-common'",
      "  - 'bizapps-common/packages/*'",
      "  - 'bizapps-tasks'",
      "  - 'bizapps-tasks/packages/*'",
    ]);
  });

  // The #3795 regression: MJ declares 42 nested globs of its own; hardcoding
  // packages/* dropped 248 of its 307 packages from the workspace, silently.
  it('re-prefixes every glob a nested-layout member declares, in declaration order', () => {
    const yaml = BuildWorkspaceYaml([
      repo('MJ', { WorkspaceGlobs: ['packages/*', 'packages/AI/*', 'packages/Angular/Explorer/*', 'packages/AI/AICLI'] }),
      repo('bizapps-tasks'),
    ]);
    expect(packagesSectionGlobs(yaml)).toEqual([
      "  - 'MJ'",
      "  - 'MJ/packages/*'",
      "  - 'MJ/packages/AI/*'",
      "  - 'MJ/packages/Angular/Explorer/*'",
      "  - 'MJ/packages/AI/AICLI'",
      "  - 'bizapps-tasks'",
      "  - 'bizapps-tasks/packages/*'",
    ]);
  });

  it('emits a member whose own file declares packages/* exactly once — no doubled glob', () => {
    const yaml = BuildWorkspaceYaml([repo('bizapps-common', { WorkspaceGlobs: ['packages/*'] })]);
    const occurrences = packagesSectionGlobs(yaml).filter((line) => line === "  - 'bizapps-common/packages/*'");
    expect(occurrences).toHaveLength(1);
  });

  it('re-prefixes a packages-rooted negation with the ! outside the member name', () => {
    const yaml = BuildWorkspaceYaml([repo('MJ', { WorkspaceGlobs: ['packages/*', '!packages/Internal/*'] })]);
    expect(packagesSectionGlobs(yaml)).toContain("  - '!MJ/packages/Internal/*'");
  });

  // Review finding on #3795: dropping a non-packages-rooted negation INVERTS its
  // guard — mjcentral guards packages/** with !**/dist/**, and without the guard a
  // dist/ copy of a package.json joins the workspace as a duplicate member.
  it('keeps non-packages-rooted negations re-prefixed (mjcentral dist-guard shape)', () => {
    const yaml = BuildWorkspaceYaml([
      repo('mjcentral', { WorkspaceGlobs: ['packages/**', '!**/.next/**', '!**/dist/**'] }),
    ]);
    expect(packagesSectionGlobs(yaml)).toEqual([
      "  - 'mjcentral'",
      "  - 'mjcentral/packages/**'",
      "  - '!mjcentral/**/.next/**'",
      "  - '!mjcentral/**/dist/**'",
    ]);
  });

  it('never emits an apps glob (app-shell names collide across repos)', () => {
    expect(BuildWorkspaceYaml([repo('bizapps-common'), repo('bizapps-accounting')])).not.toContain('/apps/');
  });

  it('enforces the detection preconditions: globs present, POSITIVE globs packages-rooted', () => {
    expect(() => BuildWorkspaceYaml([repo('bare', { WorkspaceGlobs: [] })])).toThrow(/no workspace globs/);
    expect(() => BuildWorkspaceYaml([repo('shelly', { WorkspaceGlobs: ['apps/*'] })])).toThrow(/not rooted under packages\//);
  });
});

describe('BuildNpmrc', () => {
  it('emits exactly the three proven settings lines', () => {
    const lines = BuildNpmrc().trimEnd().split('\n');
    expect(lines[0].startsWith('#')).toBe(true);
    expect(lines.slice(1)).toEqual([...NPMRC_BASE_LINES]);
    expect(NPMRC_BASE_LINES).toEqual([
      'package-manager-strict=false',
      'strict-peer-dependencies=true',
      'auto-install-peers=true',
    ]);
  });

  // The 78-entry public-hoist-pattern block was deleted after an attribution audit
  // found every entry already declared by its importer. Hoisting must not come back
  // in any form — a wildcard least of all.
  it('never emits a hoist pattern of any kind', () => {
    const npmrc = BuildNpmrc();
    expect(npmrc).not.toContain('public-hoist-pattern');
    expect(npmrc).not.toContain('hoist-pattern');
    expect(npmrc).not.toContain('shamefully-hoist');
  });
});

describe('SHELL_PROVIDED_PEERS', () => {
  // The residue of the hoist audit: entries no declaration fix can retire, because
  // WHICH auth SDK a shell needs is the shell's choice. Everything else in the old
  // block was already declared by the MJ library that imports it.
  it('covers the five auth providers a shell picks between', () => {
    const authGroup = SHELL_PROVIDED_PEERS.find((g) => g.Library === '@memberjunction/ng-auth-services');
    expect(authGroup).toBeDefined();
    expect(authGroup?.Peers).toEqual([
      '@auth0/auth0-angular',
      '@azure/msal-angular',
      '@azure/msal-browser',
      '@azure/msal-common',
      '@okta/okta-auth-js',
      '@workos-inc/authkit-js',
      'aws-amplify',
    ]);
  });

  it('lists only packages an MJ library declares as a peer, never a bare dependency', () => {
    // date-fns / uuid / marked etc. are plain dependencies of their importers — a
    // shell never has to restate them, so they must not appear here.
    const all = SHELL_PROVIDED_PEERS.flatMap((g) => g.Peers);
    for (const declared of ['date-fns', 'uuid', 'marked', 'zod', 'react', 'rete', '@foblex/flow']) {
      expect(all).not.toContain(declared);
    }
  });
});

describe('BuildShellPeerGuidance', () => {
  it('names every shell-provided peer group so the advice cannot drift from the data', () => {
    const text = BuildShellPeerGuidance().join('\n');
    for (const group of SHELL_PROVIDED_PEERS) {
      expect(text).toContain(group.Library);
      for (const peer of group.Peers) {
        expect(text).toContain(peer);
      }
    }
  });

  it('frames the peers as a choice rather than a layout fix', () => {
    expect(BuildShellPeerGuidance().join('\n')).toMatch(/choices, not a layout fix/);
  });
});

describe('CompareVersionStrings', () => {
  it('compares by base numeric triple across range prefixes', () => {
    expect(CompareVersionStrings('2.5.4', '2.5.0')).toBeGreaterThan(0);
    expect(CompareVersionStrings('^1.8.16', '1.9.0')).toBeLessThan(0);
    expect(CompareVersionStrings('~3.0.0', '3.0.0')).toBe(0);
    expect(CompareVersionStrings('>=10.34.5', '^10.33.0')).toBeGreaterThan(0);
  });

  it('returns 0 (keep incumbent) when either side has no parseable triple', () => {
    expect(CompareVersionStrings('workspace:*', '1.0.0')).toBe(0);
    expect(CompareVersionStrings('1.0.0', 'latest')).toBe(0);
  });
});

describe('ResolveDevDependencyUnion', () => {
  it('unions devDependencies across members and sorts the keys', () => {
    const { DevDependencies } = ResolveDevDependencyUnion([
      repo('a', { RootPackageJson: { devDependencies: { zeta: '1.0.0', alpha: '2.0.0' } } }),
      repo('b', { RootPackageJson: { devDependencies: { mid: '3.0.0' } } }),
    ]);
    expect(DevDependencies.zeta).toBe('1.0.0');
    expect(DevDependencies.alpha).toBe('2.0.0');
    expect(DevDependencies.mid).toBe('3.0.0');
    expect(Object.keys(DevDependencies)).toEqual([...Object.keys(DevDependencies)].sort());
  });

  it('resolves conflicts highest-version-wins and records every one (never silent)', () => {
    const { DevDependencies, Conflicts } = ResolveDevDependencyUnion([
      repo('a', { RootPackageJson: { devDependencies: { turbo: '^2.5.0' } } }),
      repo('b', { RootPackageJson: { devDependencies: { turbo: '^2.5.4' } } }),
    ]);
    expect(DevDependencies.turbo).toBe('^2.5.4');
    expect(Conflicts).toHaveLength(1);
    expect(Conflicts[0].Package).toBe('turbo');
    expect(Conflicts[0].Winner).toEqual({ Repo: 'b', Version: '^2.5.4' });
    expect(Conflicts[0].Losers).toEqual([{ Repo: 'a', Version: '^2.5.0' }]);
  });

  it('does not report a conflict for identical version strings', () => {
    const { Conflicts } = ResolveDevDependencyUnion([
      repo('a', { RootPackageJson: { devDependencies: { turbo: '^2.5.0' } } }),
      repo('b', { RootPackageJson: { devDependencies: { turbo: '^2.5.0' } } }),
    ]);
    expect(Conflicts).toEqual([]);
  });

  it('fills the generator baseline (turbo, tsc-alias) only when no member declares them', () => {
    const { DevDependencies } = ResolveDevDependencyUnion([repo('a')]);
    expect(DevDependencies.turbo).toBe(BASELINE_DEV_DEPENDENCIES.turbo);
    expect(DevDependencies['tsc-alias']).toBe(BASELINE_DEV_DEPENDENCIES['tsc-alias']);

    const declared = ResolveDevDependencyUnion([
      repo('a', { RootPackageJson: { devDependencies: { turbo: '^2.9.9' } } }),
    ]);
    expect(declared.DevDependencies.turbo).toBe('^2.9.9');
    expect(declared.Conflicts).toEqual([]); // baseline fill is a default, not a conflict
  });

  // The field's @types/mssql 9.1.8+9.1.11: BCSaaS's exact devDep pin copied verbatim
  // by this union put two copies of one @types package in the store — a guaranteed
  // nominal-type break. @types never enter the union, and the skip is reported.
  it('skips @types/* entirely and reports every skipped name', () => {
    const { DevDependencies, SkippedTypes } = ResolveDevDependencyUnion([
      repo('BCSaaS', { RootPackageJson: { devDependencies: { '@types/mssql': '9.1.8', typescript: '5.4.5' } } }),
    ]);
    expect(DevDependencies['@types/mssql']).toBeUndefined();
    expect(DevDependencies.typescript).toBe('5.4.5');
    expect(SkippedTypes).toEqual(['@types/mssql']);
  });

  it('rewrites member-provided names to workspace:* — local source beats any registry pin', () => {
    const family = new Set(['@memberjunction/cli']);
    const { DevDependencies, Conflicts } = ResolveDevDependencyUnion(
      [
        repo('MJ', { RootPackageJson: { devDependencies: { '@memberjunction/cli': 'workspace:*' } } }),
        repo('bizapps-accounting', { RootPackageJson: { devDependencies: { '@memberjunction/cli': '6.1.0-edge.0' } } }),
      ],
      family
    );
    expect(DevDependencies['@memberjunction/cli']).toBe('workspace:*');
    expect(Conflicts).toEqual([]); // both rewrite to the same specifier — no noise
  });

  it('drops a workspace: specifier on a package NO member provides, reporting it', () => {
    const { DevDependencies, DroppedWorkspace } = ResolveDevDependencyUnion([
      repo('MJ', { RootPackageJson: { devDependencies: { '@memberjunction/integration-test-suite': 'workspace:*' } } }),
    ]);
    expect(DevDependencies['@memberjunction/integration-test-suite']).toBeUndefined();
    expect(DroppedWorkspace).toEqual([{ Package: '@memberjunction/integration-test-suite', Repo: 'MJ' }]);
  });
});

/** Member package shorthand for family/enumeration tests. */
function pkg(relPath: string, name: string): { RelPath: string; PackageJson: { name: string } } {
  return { RelPath: relPath, PackageJson: { name } };
}

describe('CollectFamilyPackages', () => {
  it('collects every member-provided package name, nested dirs included, sorted', () => {
    const { Names, Duplicates } = CollectFamilyPackages([
      repo('MJ', { Packages: [pkg('packages/MJCore', '@memberjunction/core'), pkg('packages/AI/Engine', '@memberjunction/aiengine')] }),
      repo('bizapps-tasks', { Packages: [pkg('packages/Entities', 'tasks-entities')] }),
    ]);
    expect(Names).toEqual(['@memberjunction/aiengine', '@memberjunction/core', 'tasks-entities']);
    expect(Duplicates).toEqual([]);
  });

  it('reports a name two members both provide — the link target is sort-order dependent', () => {
    const { Duplicates } = CollectFamilyPackages([
      repo('MJ', { Packages: [pkg('packages/MJCore', '@memberjunction/core')] }),
      repo('MJ-clone', { Packages: [pkg('packages/MJCore', '@memberjunction/core')] }),
    ]);
    expect(Duplicates).toEqual([{ Package: '@memberjunction/core', Repos: ['MJ', 'MJ-clone'] }]);
  });
});

describe('ResolveMemberPnpmBlocks', () => {
  it('hoists member overrides, re-roots patch paths, and carries packageExtensions + peer rules', () => {
    const result = ResolveMemberPnpmBlocks([
      repo('MJ', {
        RootPackageJson: {
          pnpm: {
            overrides: { jsdom: '26.1.0', fstream: 'npm:tar-fs@^3.0.4' },
            patchedDependencies: { 'type-graphql@2.0.0-beta.3': 'patches/type-graphql@2.0.0-beta.3.patch' },
            packageExtensions: { 'express-rate-limit': { dependencies: { '@types/express': '^5.0.6' } } },
            peerDependencyRules: { allowedVersions: { 'foo>bar': '2' }, ignoreMissing: ['graphql'] },
          },
        },
      }),
    ]);
    expect(result.Overrides).toEqual({ fstream: 'npm:tar-fs@^3.0.4', jsdom: '26.1.0' });
    expect(result.PatchedDependencies).toEqual({
      'type-graphql@2.0.0-beta.3': 'MJ/patches/type-graphql@2.0.0-beta.3.patch',
    });
    expect(result.PackageExtensions['express-rate-limit']).toEqual({ dependencies: { '@types/express': '^5.0.6' } });
    expect(result.PeerAllowedVersions).toEqual({ 'foo>bar': '2' });
    expect(result.PeerIgnoreMissing).toEqual(['graphql']);
    expect(result.Patches).toEqual([
      { Package: 'type-graphql@2.0.0-beta.3', Path: 'MJ/patches/type-graphql@2.0.0-beta.3.patch', Repo: 'MJ' },
    ]);
    expect(result.Conflicts).toEqual([]);
  });

  it('resolves override conflicts highest-comparable-wins and reports them', () => {
    const result = ResolveMemberPnpmBlocks([
      repo('a', { RootPackageJson: { pnpm: { overrides: { react: '19.1.0' } } } }),
      repo('b', { RootPackageJson: { pnpm: { overrides: { react: '19.2.0' } } } }),
    ]);
    expect(result.Overrides.react).toBe('19.2.0');
    expect(result.Conflicts).toHaveLength(1);
    expect(result.Conflicts[0].Winner).toEqual({ Repo: 'b', Version: '19.2.0' });
  });

  it('gives a same-package patch conflict to the first member (patches cannot merge) and reports it', () => {
    const result = ResolveMemberPnpmBlocks([
      repo('a', { RootPackageJson: { pnpm: { patchedDependencies: { 'x@1.0.0': 'patches/x.patch' } } } }),
      repo('b', { RootPackageJson: { pnpm: { patchedDependencies: { 'x@1.0.0': 'patches/other.patch' } } } }),
    ]);
    expect(result.PatchedDependencies['x@1.0.0']).toBe('a/patches/x.patch');
    expect(result.Conflicts).toHaveLength(1);
    expect(result.Conflicts[0].Package).toBe('x@1.0.0');
    expect(result.Conflicts[0].Losers).toEqual([{ Repo: 'b', Version: 'b/patches/other.patch' }]);
  });
});

describe('AssembleParentOverrides', () => {
  it('layers pins < member overrides < family workspace:*, reporting every displacement', () => {
    const { Overrides, SupersededPins } = AssembleParentOverrides(
      { axios: '1.13.6', jsdom: '25.0.1', '@memberjunction/core': '6.1.0' },
      { jsdom: '26.1.0' },
      ['@memberjunction/core']
    );
    expect(Overrides).toEqual({
      '@memberjunction/core': 'workspace:*',
      axios: '1.13.6',
      jsdom: '26.1.0',
    });
    expect(SupersededPins).toEqual(['@memberjunction/core', 'jsdom']);
  });

  it('a whole-name member override displaces EVERY per-major pin selector for that name', () => {
    const { Overrides, SupersededPins } = AssembleParentOverrides(
      { 'chalk@^5': '5.6.2', 'chalk@^4': '4.1.2', 'chalk@^2': '2.4.2', semver: '7.7.1' },
      { chalk: '5.9.9' },
      []
    );
    expect(Overrides).toEqual({ chalk: '5.9.9', semver: '7.7.1' });
    expect(SupersededPins).toEqual(['chalk@^2', 'chalk@^4', 'chalk@^5']);
  });

  it('a range-scoped member override displaces only its own selector', () => {
    const { Overrides, SupersededPins } = AssembleParentOverrides(
      { 'chalk@^5': '5.6.2', 'chalk@^4': '4.1.2' },
      { 'chalk@^5': '5.9.9' },
      []
    );
    expect(Overrides).toEqual({ 'chalk@^4': '4.1.2', 'chalk@^5': '5.9.9' });
    expect(SupersededPins).toEqual(['chalk@^5']);
  });
});

describe('ResolvePnpmPin', () => {
  it('uses the highest pnpm pin any member carries (matching the MJ repo pin when MJ is a member)', () => {
    const { Pin, Source } = ResolvePnpmPin([
      repo('MJ-repo', { RootPackageJson: { packageManager: 'pnpm@10.33.0' } }),
      repo('other', { RootPackageJson: { packageManager: 'pnpm@10.34.5' } }),
    ]);
    expect(Pin).toBe('pnpm@10.34.5');
    expect(Source).toBe('other');
  });

  it('ignores npm pins and falls back to the proven fallback pin', () => {
    const { Pin, Source } = ResolvePnpmPin([
      repo('bizapps-common', { RootPackageJson: { packageManager: 'npm@10.5.0' } }),
    ]);
    expect(Pin).toBe(FALLBACK_PNPM_PIN);
    expect(Source).toContain('fallback');
  });
});

describe('BuildRootPackageJson', () => {
  it('throws on an empty member list', () => {
    expect(() => BuildRootPackageJson('bluecypress', [])).toThrow(/at least one member/);
  });

  it('builds the private root manifest with pin, union, and the peer bridge block', () => {
    const result = BuildRootPackageJson('bluecypress', [
      repo('MJ-repo', { RootPackageJson: { packageManager: 'pnpm@10.33.0', devDependencies: { turbo: '^2.5.0' } } }),
    ]);
    const manifest = JSON.parse(result.Content) as {
      name: string;
      private: boolean;
      packageManager: string;
      devDependencies: Record<string, string>;
      pnpm: { peerDependencyRules: { allowedVersions: Record<string, string>; ignoreMissing: string[] } };
    };
    expect(manifest.name).toBe('bluecypress-dev-workspace');
    expect(manifest.private).toBe(true);
    expect(manifest.packageManager).toBe('pnpm@10.33.0');
    expect(result.PinSource).toBe('MJ-repo');
    expect(manifest.devDependencies.turbo).toBe('^2.5.0');
    expect(manifest.pnpm.peerDependencyRules.allowedVersions['nunjucks>chokidar']).toBe('5');
    expect(manifest.pnpm.peerDependencyRules.allowedVersions['@modelcontextprotocol/sdk>zod']).toBe('^3.24');
    expect(manifest.pnpm.peerDependencyRules.ignoreMissing).toEqual(['axios']);
    expect(result.Content.endsWith('\n')).toBe(true);
  });

  it('sanitizes the parent directory name into a valid npm name', () => {
    const result = BuildRootPackageJson('Blue Cypress Code!', [repo('a')]);
    const manifest = JSON.parse(result.Content) as { name: string };
    expect(manifest.name).toBe('blue-cypress-code-dev-workspace');
  });

  // End-to-end absorption: everything the 299/299 field recipe did by hand
  // (#3795 steps 3–5 + the workspace:* addendum) lands in one generated manifest.
  it('assembles the fully-absorbed pnpm block: pins, hoisted overrides + patch, extensions, family workspace:*', () => {
    const mj = repo('MJ', {
      RootPackageJson: {
        name: 'memberjunction-workspace',
        packageManager: 'pnpm@10.33.0',
        devDependencies: {
          turbo: '^2.5.0',
          '@types/node': '24.10.11',
          '@memberjunction/integration-test-suite': 'workspace:*', // the issue's guaranteed hard failure
        },
        pnpm: {
          overrides: { jsdom: '26.1.0' },
          patchedDependencies: { 'type-graphql@2.0.0-beta.3': 'patches/type-graphql@2.0.0-beta.3.patch' },
          packageExtensions: { 'express-rate-limit': { dependencies: { '@types/express': '^5.0.6' } } },
          peerDependencyRules: { allowedVersions: { 'foo>bar': '2' }, ignoreMissing: ['graphql'] },
        },
      },
      Packages: [
        pkg('packages/MJCore', '@memberjunction/core'),
        pkg('packages/TestingFramework/integration-test-suite', '@memberjunction/integration-test-suite'),
      ],
      Lockfile: {
        Kind: 'pnpm',
        Direct: [
          { Name: 'axios', Version: '1.13.6' },
          { Name: '@memberjunction/core', Version: '6.1.0' }, // family — excluded from pins
        ],
        Types: [{ Name: '@types/express', Version: '5.1.1' }],
        Resolutions: [{ Name: 'axios', Version: '1.13.6' }, { Name: '@types/express', Version: '5.1.1' }],
        Skipped: [{ Name: 'fstream', Version: 'tar-fs@3.1.1', Reason: 'non-semver resolution' }],
      },
    });
    const result = BuildRootPackageJson('bluecypress', [mj]);
    const manifest = JSON.parse(result.Content) as {
      devDependencies: Record<string, string>;
      pnpm: {
        overrides: Record<string, string>;
        patchedDependencies: Record<string, string>;
        packageExtensions: Record<string, { dependencies: Record<string, string> }>;
        peerDependencyRules: { allowedVersions: Record<string, string>; ignoreMissing: string[] };
      };
    };
    expect(manifest.pnpm.overrides).toEqual({
      '@memberjunction/core': 'workspace:*',
      '@memberjunction/integration-test-suite': 'workspace:*',
      '@types/express': '5.1.1', // EXACT — ^resolved passed 6 of 7 field breaks through
      axios: '1.13.6',
      jsdom: '26.1.0',
    });
    expect(manifest.pnpm.patchedDependencies).toEqual({
      'type-graphql@2.0.0-beta.3': 'MJ/patches/type-graphql@2.0.0-beta.3.patch',
    });
    // a member patch keyed to a version the parent graph never resolves must not
    // hard-fail the whole install (ERR_PNPM_UNUSED_PATCH) — found by the live smoke
    expect((JSON.parse(result.Content) as { pnpm: { allowUnusedPatches: boolean } }).pnpm.allowUnusedPatches).toBe(true);
    expect(manifest.pnpm.packageExtensions['express-rate-limit']).toEqual({ dependencies: { '@types/express': '^5.0.6' } });
    expect(manifest.pnpm.peerDependencyRules.allowedVersions['nunjucks>chokidar']).toBe('5'); // baseline kept
    expect(manifest.pnpm.peerDependencyRules.allowedVersions['foo>bar']).toBe('2'); // member unioned on top
    expect(manifest.pnpm.peerDependencyRules.ignoreMissing).toEqual(['axios', 'graphql']);
    // devDependencies: @types skipped; the family workspace:* devDep KEPT (the package IS a member now)
    expect(manifest.devDependencies['@types/node']).toBeUndefined();
    expect(manifest.devDependencies['@memberjunction/integration-test-suite']).toBe('workspace:*');
    expect(manifest.devDependencies.turbo).toBe('^2.5.0');
    // the report carries every decision
    expect(result.Report.LockfilePinCount).toBe(2);
    expect(result.Report.FamilyOverrideCount).toBe(2);
    expect(result.Report.Patches).toHaveLength(1);
    expect(result.Report.SkippedTypesDevDeps).toEqual(['@types/node']);
    expect(result.Report.LockfileSkips).toEqual([
      { Repo: 'MJ', Skip: { Name: 'fstream', Version: 'tar-fs@3.1.1', Reason: 'non-semver resolution' } },
    ]);
    expect(result.Report.DroppedWorkspaceDevDeps).toEqual([]); // provided by a member — kept, not dropped
  });
});

describe('BuildSentinel', () => {
  it('records the marker, the files written, and the members — sorted, no timestamp', () => {
    const content = BuildSentinel(
      ['pnpm-workspace.yaml', '.npmrc', '.mj-dev-workspace.json'],
      ['bizapps-tasks', 'MJ-repo']
    );
    const sentinel = JSON.parse(content) as { generatedBy: string; files: string[]; members: string[] };
    expect(sentinel.generatedBy).toBe(SENTINEL_MARKER);
    expect(SENTINEL_MARKER).toBe('mj dev workspace');
    expect(sentinel.files).toEqual(['.mj-dev-workspace.json', '.npmrc', 'pnpm-workspace.yaml']);
    expect(sentinel.members).toEqual(['MJ-repo', 'bizapps-tasks']);
    expect(Object.keys(sentinel)).toEqual(['generatedBy', 'files', 'members']);
    expect(content.endsWith('\n')).toBe(true);
  });

  it('is deterministic — identical input in any order produces identical bytes', () => {
    const a = BuildSentinel(['a.json', 'b.json'], ['repo-1', 'repo-2']);
    const b = BuildSentinel(['b.json', 'a.json'], ['repo-2', 'repo-1']);
    expect(a).toBe(b);
  });

  it('throws on an empty file list or an empty member list', () => {
    expect(() => BuildSentinel([], ['repo-1'])).toThrow(/at least one generated file/);
    expect(() => BuildSentinel(['a.json'], [])).toThrow(/at least one member/);
  });
});

describe('PickTurboJson', () => {
  it('copies the first member turbo.json (sorted by repo name) verbatim', () => {
    const content = '{\n  "tasks": { "build": {} }\n}\n';
    const result = PickTurboJson([
      repo('z-repo', { TurboJson: '{"other": true}' }),
      repo('a-repo', { TurboJson: content }),
    ]);
    expect(result.Content).toBe(content);
    expect(result.Source).toBe('a-repo');
  });

  it('falls back to a minimal dependency-ordered build config when no member carries one', () => {
    const result = PickTurboJson([repo('a'), repo('b')]);
    expect(result.Source).toBe('generator fallback');
    const parsed = JSON.parse(result.Content) as { tasks: { build: { dependsOn: string[]; outputs: string[] } } };
    expect(parsed.tasks.build.dependsOn).toEqual(['^build']);
    expect(parsed.tasks.build.outputs).toContain('dist/**');
  });
});
