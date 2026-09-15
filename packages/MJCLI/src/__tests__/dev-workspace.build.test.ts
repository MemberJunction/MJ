/**
 * Tests for the pure content builders behind `mj dev workspace`
 * (src/lib/dev-workspace/build.ts). Content rules reproduce the manual setup this
 * command replaces:
 * producer packages-only globs, the one .npmrc line (and NO hoist block), the pnpm
 * settings rendered into pnpm-workspace.yaml (pnpm 10 reads them only there), the
 * devDependency union with highest-version-wins conflict logging, and the pnpm
 * packageManager pin.
 */
import { describe, expect, it } from 'vitest';
import {
  AssembleParentOverrides,
  BASELINE_DEV_DEPENDENCIES,
  BuildNpmrc,
  BuildPnpmWorkspaceSettings,
  BuildRootPackageJson,
  BuildSentinel,
  BuildShellPeerGuidance,
  BuildWorkspaceYaml,
  CollectFamilyPackages,
  CollectOpenAppClientPackages,
  CollectWorkspaceShells,
  CompareVersionStrings,
  IndexWorkspacePackages,
  FALLBACK_PNPM_PIN,
  NPMRC_BASE_LINES,
  ONLY_BUILT_DEPENDENCIES,
  PEER_INSTALL_SETTINGS,
  PickTurboJson,
  ResolveDevDependencyUnion,
  ResolveDuplicateProviderLinks,
  ResolveMemberPnpmBlocks,
  ResolvePnpmPin,
  ResolveShellPeerGaps,
  SENTINEL_MARKER,
  SHELL_PROVIDED_PEERS,
  AssertAppPackageNamesUnique,
} from '../lib/dev-workspace/build.js';
import type { CandidateRepo, MemberPackageInfo, MemberPackageJson } from '../lib/dev-workspace/types.js';

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
    MjAppJson: null,
    MjAppJsonError: null,
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

  it('emits admitted app-shell globs (--apps) for that member only, after its packages globs', () => {
    const yaml = BuildWorkspaceYaml([repo('Skip-Brain', { AppGlobs: ['apps/API', 'apps/MJAPI'] }), repo('bizapps-common')]);
    expect(yaml).toContain("  - 'Skip-Brain/apps/API'");
    expect(yaml).toContain("  - 'Skip-Brain/apps/MJAPI'");
    expect(yaml.indexOf("'Skip-Brain/packages/*'")).toBeLessThan(yaml.indexOf("'Skip-Brain/apps/API'"));
    expect(yaml).not.toContain('bizapps-common/apps');
  });

  it('AssertAppPackageNamesUnique passes on unique names and throws naming both sides on a collision', () => {
    const pkg = (rel: string, name: string) => ({ RelPath: rel, PackageJson: { name } });
    const ok = [
      repo('Skip-Brain', { AppGlobs: ['apps/API'], Packages: [pkg('apps/API', 'skip_api_engine'), pkg('packages/core', '@skip-brain/core')] }),
      repo('MJ', { Packages: [pkg('packages/MJAPI', 'mjapi')] }),
    ];
    expect(AssertAppPackageNamesUnique(ok)).toEqual(['skip_api_engine']);
    const clash = [
      repo('MJ', { Packages: [pkg('packages/MJAPI', 'mjapi')] }),
      repo('Skip-Brain', { AppGlobs: ['apps/*'], Packages: [pkg('apps/MJAPI', 'mjapi')] }),
    ];
    expect(() => AssertAppPackageNamesUnique(clash)).toThrow(/'mjapi'.*MJ\/packages\/MJAPI.*Skip-Brain\/apps\/MJAPI/);
    // two ordinary (non-app) packages sharing a name is not this guard's business
    const plain = [repo('A', { Packages: [pkg('packages/x', 'dup')] }), repo('B', { Packages: [pkg('packages/y', 'dup')] })];
    expect(AssertAppPackageNamesUnique(plain)).toEqual([]);
  });

  // pnpm 10 honours overrides / patches / peer rules ONLY in pnpm-workspace.yaml — a
  // package.json#pnpm block at the root is ignored with a warning that drowns in the
  // install output (946 overrides were silently inert in the field).
  it('appends the pnpm settings as block YAML after the packages section', () => {
    const yaml = BuildWorkspaceYaml([repo('a')], {
      strictPeerDependencies: false,
      autoInstallPeers: true,
      peerDependencyRules: { allowedVersions: { 'nunjucks>chokidar': '5' }, ignoreMissing: ['axios'] },
      overrides: { '@memberjunction/core': 'workspace:*', 'type-graphql': '2.0.0-beta.3', "it's": '1.0.0' },
      patchedDependencies: { 'type-graphql@2.0.0-beta.3': 'MJ/patches/type-graphql@2.0.0-beta.3.patch' },
      allowUnusedPatches: true,
      packageExtensions: { 'express-rate-limit': { dependencies: { '@types/express': '^5.0.6' } } },
      emptyList: [],
      emptyMap: {},
    });
    const settingsSection = yaml.slice(yaml.indexOf('# pnpm settings'));
    expect(settingsSection.split('\n').slice(1).join('\n')).toBe(
      [
        'strictPeerDependencies: false',
        'autoInstallPeers: true',
        'peerDependencyRules:',
        '  allowedVersions:',
        "    'nunjucks>chokidar': '5'",
        '  ignoreMissing:',
        "    - 'axios'",
        'overrides:',
        "  '@memberjunction/core': 'workspace:*'",
        "  'type-graphql': '2.0.0-beta.3'",
        "  'it''s': '1.0.0'",
        'patchedDependencies:',
        "  'type-graphql@2.0.0-beta.3': 'MJ/patches/type-graphql@2.0.0-beta.3.patch'",
        'allowUnusedPatches: true',
        'packageExtensions:',
        "  'express-rate-limit':",
        '    dependencies:',
        "      '@types/express': '^5.0.6'",
        'emptyList: []',
        'emptyMap: {}',
        '',
      ].join('\n')
    );
    // the packages section is untouched by the settings
    expect(packagesSectionGlobs(yaml)).toEqual(["  - 'a'", "  - 'a/packages/*'"]);
  });

  it('emits no settings section at all when none are passed (byte-stable for pre-existing callers)', () => {
    expect(BuildWorkspaceYaml([repo('a')])).not.toContain('# pnpm settings');
    expect(BuildWorkspaceYaml([repo('a')], {})).toBe(BuildWorkspaceYaml([repo('a')]));
  });

  it('refuses a settings value it cannot render rather than mis-rendering it', () => {
    expect(() => BuildWorkspaceYaml([repo('a')], { bad: () => 1 })).toThrow(/pnpm settings may hold only/);
  });

  it('enforces the detection preconditions: globs present, POSITIVE globs packages-rooted', () => {
    expect(() => BuildWorkspaceYaml([repo('bare', { WorkspaceGlobs: [] })])).toThrow(/no workspace globs/);
    expect(() => BuildWorkspaceYaml([repo('shelly', { WorkspaceGlobs: ['apps/*'] })])).toThrow(/not rooted under packages\//);
  });
});

describe('BuildNpmrc', () => {
  it('emits exactly the one settings line pnpm still needs there', () => {
    const lines = BuildNpmrc().trimEnd().split('\n');
    expect(lines[0].startsWith('#')).toBe(true);
    expect(lines.slice(1)).toEqual([...NPMRC_BASE_LINES]);
    expect(NPMRC_BASE_LINES).toEqual(['package-manager-strict=false']);
  });

  // The peer switches moved to pnpm-workspace.yaml with the rest of the pnpm
  // settings (pnpm 10 reads settings only there); .npmrc must not carry a second copy.
  it('carries no peer settings — those live in pnpm-workspace.yaml', () => {
    const npmrc = BuildNpmrc();
    expect(npmrc).not.toContain('strict-peer-dependencies');
    expect(npmrc).not.toContain('auto-install-peers');
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
function pkg(relPath: string, name: string, extra?: Partial<MemberPackageJson>): MemberPackageInfo {
  return { RelPath: relPath, PackageJson: { name, ...extra } };
}

/** A member whose mj-app.json declares one client bootstrap package, which it also provides. */
function openAppMember(repoName: string, packageName: string, extra?: Partial<MemberPackageJson>): CandidateRepo {
  return repo(repoName, {
    MjAppJson: { packages: { client: [{ name: packageName, role: 'bootstrap' }] } },
    Packages: [pkg('packages/Angular', packageName, extra)],
  });
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

// MJ and Skip-Brain both provide mj_generatedentities; the plain
// workspace:* override handed Skip-Brain's packages MJ's copy (sort order) and their build
// failed on missing Skip entities. pnpm's `parent>child` selector + root-relative `link:`
// scopes each provider's copy to its own consumers (verified live).
describe('ResolveDuplicateProviderLinks', () => {
  const depOn = (relPath: string, name: string, deps: Record<string, string>) => ({ RelPath: relPath, PackageJson: { name, dependencies: deps } });
  const mj = repo('MJ', {
    Packages: [
      pkg('packages/GeneratedEntities', 'mj_generatedentities'),
      depOn('packages/MJAPI', 'mj_api', { mj_generatedentities: '1.0.0' }),
      pkg('packages/MJCore', '@memberjunction/core'),
    ],
  });
  const skip = repo('Skip-Brain', {
    Packages: [
      pkg('packages/GeneratedEntities', 'mj_generatedentities'),
      depOn('packages/core', '@skip-brain/core', { mj_generatedentities: '0.0.0' }),
      { RelPath: 'apps/API', PackageJson: { name: 'skip_api_engine', devDependencies: { mj_generatedentities: '0.0.0' } } },
    ],
  });

  it('emits one consumer-scoped link per consumer inside each providing member, pointing at that member\'s copy', () => {
    const duplicates = CollectFamilyPackages([mj, skip]).Duplicates;
    const { Overrides, Links, Unlinked } = ResolveDuplicateProviderLinks([skip, mj], duplicates);
    expect(Overrides).toEqual({
      '@skip-brain/core>mj_generatedentities': 'link:Skip-Brain/packages/GeneratedEntities',
      'mj_api>mj_generatedentities': 'link:MJ/packages/GeneratedEntities',
      'skip_api_engine>mj_generatedentities': 'link:Skip-Brain/packages/GeneratedEntities',
    });
    // members by name, consumers by RelPath (apps/API sorts before packages/core) — deterministic, not alphabetical by name
    expect(Links.map((l) => `${l.Repo}: ${l.Consumer}`)).toEqual(['MJ: mj_api', 'Skip-Brain: skip_api_engine', 'Skip-Brain: @skip-brain/core']);
    expect(Unlinked).toEqual([]);
  });

  it('emits nothing when no name is duplicated', () => {
    expect(ResolveDuplicateProviderLinks([mj], [])).toEqual({ Overrides: {}, Links: [], Unlinked: [] });
  });

  it('reports (never guesses) a consumer whose own name is duplicated, and one whose member has no copy', () => {
    const mjWithActions = repo('MJ', {
      Packages: [pkg('packages/GeneratedEntities', 'mj_generatedentities'), depOn('packages/GeneratedActions', 'mj_generatedactions', { mj_generatedentities: '1.0.0' })],
    });
    const skipWithActions = repo('Skip-Brain', {
      Packages: [pkg('packages/GeneratedEntities', 'mj_generatedentities'), depOn('packages/GeneratedActions', 'mj_generatedactions', { mj_generatedentities: '0.0.0' })],
    });
    const outsider = repo('bizapps', { Packages: [depOn('packages/Tasks', 'tasks-server', { mj_generatedentities: '1.0.0' })] });
    const duplicates = CollectFamilyPackages([mjWithActions, skipWithActions, outsider]).Duplicates;
    const { Overrides, Unlinked } = ResolveDuplicateProviderLinks([mjWithActions, skipWithActions, outsider], duplicates);
    expect(Overrides).toEqual({}); // the only consumers are ambiguous or copy-less — nothing is emitted blind
    expect(Unlinked).toEqual([
      { Consumer: 'mj_generatedactions', Package: 'mj_generatedentities', Repo: 'MJ', Reason: 'ambiguous-consumer' },
      { Consumer: 'mj_generatedactions', Package: 'mj_generatedentities', Repo: 'Skip-Brain', Reason: 'ambiguous-consumer' },
      { Consumer: 'tasks-server', Package: 'mj_generatedentities', Repo: 'bizapps', Reason: 'no-own-copy' },
    ]);
  });

  it('lands in the assembled settings beside the plain workspace:* override and in the report', () => {
    const result = BuildRootPackageJson('bluecypress', [mj, skip]);
    const settings = result.PnpmSettings as { overrides: Record<string, string> };
    expect(settings.overrides.mj_generatedentities).toBe('workspace:*');
    expect(settings.overrides['@skip-brain/core>mj_generatedentities']).toBe('link:Skip-Brain/packages/GeneratedEntities');
    expect(settings.overrides['mj_api>mj_generatedentities']).toBe('link:MJ/packages/GeneratedEntities');
    expect(result.Report.DuplicateFamilyPackages).toEqual([{ Package: 'mj_generatedentities', Repos: ['MJ', 'Skip-Brain'] }]);
    expect(result.Report.DuplicateProviderLinks).toHaveLength(3);
    expect(result.Report.UnlinkedDuplicateConsumers).toEqual([]);
    expect(BuildWorkspaceYaml([mj, skip], result.PnpmSettings)).toContain("\n  '@skip-brain/core>mj_generatedentities': 'link:Skip-Brain/packages/GeneratedEntities'\n");
  });
});

describe('CollectOpenAppClientPackages', () => {
  const caliber = openAppMember('bizapps-caliber', '@mj-biz-apps/caliber-ng');

  it('collects a member-provided client bootstrap package', () => {
    expect(CollectOpenAppClientPackages([caliber], IndexWorkspacePackages([caliber])).Packages).toEqual([
      { Package: '@mj-biz-apps/caliber-ng', Repo: 'bizapps-caliber', Provided: true },
    ]);
  });

  it('marks a client package NO member provides as unprovided rather than dropping it', () => {
    const ghost = repo('bizapps-ghost', {
      MjAppJson: { packages: { client: [{ name: '@mj-biz-apps/ghost-ng', role: 'bootstrap' }] } },
    });
    expect(CollectOpenAppClientPackages([ghost], IndexWorkspacePackages([ghost])).Packages).toEqual([
      { Package: '@mj-biz-apps/ghost-ng', Repo: 'bizapps-ghost', Provided: false },
    ]);
  });

  // The set mirrors the HOST's own rule, which is the only thing that decides what the shell
  // imports: GetClientPackagesFromManifest (OpenApp/Engine config-manager.ts) builds the client
  // dynamic-package list as [...client, ...shared], filtered only by platform (#4428) — role
  // itself decides nothing beyond supplying 'actions' as that filter's Node-only default.
  // Anything narrower here is unlinked at the parent while the shell's generated manifest still
  // imports it (#4401 review, F6/F7). None of bootstrap/library/components trips the platform
  // default away from 'both', so all three still collect.
  it('collects every client entry regardless of role — the host applies no role-specific filter', () => {
    const mixed = repo('bizapps-mixed', {
      MjAppJson: {
        packages: {
          client: [
            { name: '@mj-biz-apps/mixed-ng', role: 'bootstrap' },
            { name: '@mj-biz-apps/mixed-lib', role: 'library' },
            { name: '@mj-biz-apps/mixed-cmp', role: 'components' },
          ],
        },
      },
      Packages: [
        pkg('packages/Angular', '@mj-biz-apps/mixed-ng'),
        pkg('packages/Lib', '@mj-biz-apps/mixed-lib'),
        pkg('packages/Cmp', '@mj-biz-apps/mixed-cmp'),
      ],
    });
    const names = CollectOpenAppClientPackages([mixed], IndexWorkspacePackages([mixed])).Packages.map((c) => c.Package);
    expect(names).toEqual(['@mj-biz-apps/mixed-cmp', '@mj-biz-apps/mixed-lib', '@mj-biz-apps/mixed-ng']);
  });

  it('collects shared entries too — the host merges them into the client list', () => {
    const shared = repo('bizapps-shared', {
      MjAppJson: {
        packages: {
          shared: [{ name: '@mj-biz-apps/shared-entities', role: 'library' }],
        },
      },
      Packages: [pkg('packages/Entities', '@mj-biz-apps/shared-entities')],
    });
    expect(CollectOpenAppClientPackages([shared], IndexWorkspacePackages([shared])).Packages).toEqual([
      { Package: '@mj-biz-apps/shared-entities', Repo: 'bizapps-shared', Provided: true },
    ]);
  });

  // Mirrors ResolvePackagePlatform in packages/OpenApp/Engine/src/manifest/package-platform.ts —
  // keep the two in lockstep. A Node-only actions package declared `shared` was imported into the
  // Angular bundle before this filter existed, and the host could not build (#4428).
  it('omits a node-only shared package from the shell import set (#4428)', () => {
    const mixed = repo('bizapps-common', {
      MjAppJson: {
        packages: {
          client: [{ name: '@mj-biz-apps/common-ng', role: 'bootstrap' }],
          shared: [
            { name: '@mj-biz-apps/common-entities', role: 'library' },
            { name: '@mj-biz-apps/common-actions', role: 'library', platform: 'node' },
          ],
        },
      },
      Packages: [
        pkg('packages/Angular', '@mj-biz-apps/common-ng'),
        pkg('packages/Entities', '@mj-biz-apps/common-entities'),
        pkg('packages/Actions', '@mj-biz-apps/common-actions'),
      ],
    });
    const names = CollectOpenAppClientPackages([mixed], IndexWorkspacePackages([mixed])).Packages.map((c) => c.Package);
    expect(names).toContain('@mj-biz-apps/common-ng');
    expect(names).toContain('@mj-biz-apps/common-entities');
    expect(names).not.toContain('@mj-biz-apps/common-actions');
  });

  it('omits a role:actions shared package with no explicit platform (#4428)', () => {
    const acme = repo('acme', {
      MjAppJson: { packages: { shared: [{ name: '@acme/acme-actions', role: 'actions' }] } },
      Packages: [pkg('packages/Actions', '@acme/acme-actions')],
    });
    const names = CollectOpenAppClientPackages([acme], IndexWorkspacePackages([acme])).Packages.map((c) => c.Package);
    expect(names).not.toContain('@acme/acme-actions');
  });

  it('still collects a shared library with no platform declared', () => {
    const acme = repo('acme', {
      MjAppJson: { packages: { shared: [{ name: '@acme/acme-entities', role: 'library' }] } },
      Packages: [pkg('packages/Entities', '@acme/acme-entities')],
    });
    const names = CollectOpenAppClientPackages([acme], IndexWorkspacePackages([acme])).Packages.map((c) => c.Package);
    expect(names).toContain('@acme/acme-entities');
  });

  // server[] goes to dynamicPackages.SERVER, a Node process that resolves importer-relative —
  // not the vite root. It is not part of the shell's resolution problem.
  it('never collects a server entry', () => {
    const server = repo('bizapps-srv', {
      MjAppJson: { packages: { server: [{ name: '@mj-biz-apps/srv', role: 'bootstrap' }] } },
      Packages: [pkg('packages/Server', '@mj-biz-apps/srv')],
    });
    expect(CollectOpenAppClientPackages([server], IndexWorkspacePackages([server])).Packages).toEqual([]);
  });

  it('de-duplicates a package named in both client and shared', () => {
    const both = repo('bizapps-both', {
      MjAppJson: {
        packages: {
          client: [{ name: '@mj-biz-apps/dup', role: 'components' }],
          shared: [{ name: '@mj-biz-apps/dup', role: 'library' }],
        },
      },
      Packages: [pkg('packages/Dup', '@mj-biz-apps/dup')],
    });
    expect(CollectOpenAppClientPackages([both], IndexWorkspacePackages([both])).Packages).toHaveLength(1);
  });

  it('validates shared entries with the same guard, naming packages.shared', () => {
    const broken = repo('bizapps-broken', {
      MjAppJson: JSON.parse('{"packages":{"shared":[{"role":"library"}]}}') as CandidateRepo['MjAppJson'],
    });
    expect(() => CollectOpenAppClientPackages([broken], IndexWorkspacePackages([broken]))).toThrow(
      /bizapps-broken[\s\S]*packages\.shared/
    );
  });

  // MjAppPackageEntry.platform is a closed three-literal union ('node' | 'browser' | 'both'), and
  // readDeclaredEntries' final `declared as MjAppPackageEntry[]` cast is only true if this guard
  // enforces it. An unvalidated typo like "Node" would satisfy the cast, then silently fail every
  // comparison in runsInBrowser and drop the package from the shell import set with no error
  // (#4428) — so an invalid platform must throw here, the same way an invalid/missing name does.
  it('rejects an invalid platform value, naming the offending value', () => {
    const broken = repo('bizapps-broken-platform', {
      MjAppJson: JSON.parse('{"packages":{"shared":[{"name":"@acme/x","role":"library","platform":"Node"}]}}') as CandidateRepo['MjAppJson'],
    });
    expect(() => CollectOpenAppClientPackages([broken], IndexWorkspacePackages([broken]))).toThrow(
      /bizapps-broken-platform[\s\S]*packages\.shared\[0\][\s\S]*"Node"/
    );
  });

  it('de-duplicates a package two members both declare, keeping the first by repo sort order', () => {
    const a = openAppMember('aaa-repo', '@mj-biz-apps/dup-ng');
    const b = openAppMember('zzz-repo', '@mj-biz-apps/dup-ng');
    const collected = CollectOpenAppClientPackages([b, a], IndexWorkspacePackages([b, a])).Packages;
    expect(collected).toHaveLength(1);
    expect(collected[0].Repo).toBe('aaa-repo');
  });

  // The sibling collector reports this ambiguity rather than resolving it silently —
  // CollectFamilyPackages returns Duplicates and the command warns "the link target is decided by
  // sort order; use --exclude to drop one". Same ambiguity here (rkihm-BC review, R3).
  it('reports a package two members both declare, naming every declaring repo', () => {
    const a = openAppMember('aaa-repo', '@mj-biz-apps/dup-ng');
    const b = openAppMember('zzz-repo', '@mj-biz-apps/dup-ng');
    expect(CollectOpenAppClientPackages([b, a], IndexWorkspacePackages([b, a])).Duplicates).toEqual([
      { Package: '@mj-biz-apps/dup-ng', Repos: ['aaa-repo', 'zzz-repo'] },
    ]);
  });

  it('reports no duplicates when each package is declared once', () => {
    const a = openAppMember('aaa-repo', '@mj-biz-apps/a-ng');
    const b = openAppMember('zzz-repo', '@mj-biz-apps/z-ng');
    expect(CollectOpenAppClientPackages([a, b], IndexWorkspacePackages([a, b])).Duplicates).toEqual([]);
  });

  it('does not call one repo declaring a package in both client and shared a duplicate', () => {
    const both = repo('bizapps-both', {
      MjAppJson: {
        packages: {
          client: [{ name: '@mj-biz-apps/dup', role: 'components' }],
          shared: [{ name: '@mj-biz-apps/dup', role: 'library' }],
        },
      },
      Packages: [pkg('packages/Dup', '@mj-biz-apps/dup')],
    });
    expect(CollectOpenAppClientPackages([both], IndexWorkspacePackages([both])).Duplicates).toEqual([]);
  });

  it('returns nothing for a member with no mj-app.json', () => {
    expect(CollectOpenAppClientPackages([repo('MJ')], IndexWorkspacePackages([repo('MJ')])).Packages).toEqual([]);
  });

  // mj-app.json is committed in a SIBLING repo and hand-editable, so the declared type is an
  // assertion about a file this repo does not own. These three shapes reached `entry.role` /
  // `entry.name.length` and aborted the whole command with a bare TypeError naming no file —
  // `readJsonFile` already sets the standard by naming the path on unparseable JSON.
  // Built with JSON.parse so the value arrives exactly as production receives it.
  const malformed = (json: string): CandidateRepo =>
    repo('bizapps-broken', { MjAppJson: JSON.parse(json) as CandidateRepo['MjAppJson'] });

  it('names the repo and the file when a client entry has no name', () => {
    const broken = malformed('{"packages":{"client":[{"role":"bootstrap"}]}}');
    expect(() => CollectOpenAppClientPackages([broken], IndexWorkspacePackages([broken]))).toThrow(
      /bizapps-broken[\s\S]*mj-app\.json/
    );
  });

  it('names the repo and the file when a client entry is null', () => {
    const broken = malformed('{"packages":{"client":[null]}}');
    expect(() => CollectOpenAppClientPackages([broken], IndexWorkspacePackages([broken]))).toThrow(
      /bizapps-broken[\s\S]*mj-app\.json/
    );
  });

  it('names the repo and the file when client is not an array', () => {
    const broken = malformed('{"packages":{"client":{"name":"@x/y","role":"bootstrap"}}}');
    expect(() => CollectOpenAppClientPackages([broken], IndexWorkspacePackages([broken]))).toThrow(
      /bizapps-broken[\s\S]*mj-app\.json/
    );
  });

  it('tolerates a null packages block, which is well-formed JSON saying nothing', () => {
    const empty = malformed('{"packages":null}');
    expect(CollectOpenAppClientPackages([empty], IndexWorkspacePackages([empty])).Packages).toEqual([]);
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

  // SaaS's committed type-graphql@2.0.0-rc.3 out-voted MJ's
  // patched 2.0.0-beta.3 in the lockfile pins, so MJ's patch never applied and every
  // consumer of @memberjunction/server type-checked against the wrong type-graphql.
  it('pins a patched package to the exact version its patch is keyed to, beating a lockfile pin', () => {
    const { Overrides, SupersededPins, PatchPins } = AssembleParentOverrides(
      { 'type-graphql': '2.0.0-rc.3', axios: '1.13.6' },
      {},
      [],
      ['type-graphql@2.0.0-beta.3']
    );
    expect(Overrides).toEqual({ axios: '1.13.6', 'type-graphql': '2.0.0-beta.3' });
    expect(SupersededPins).toEqual(['type-graphql']);
    expect(PatchPins).toEqual(['type-graphql']);
  });

  it('a patched-package pin beats an explicit member override too (an override that strands a patch is reported)', () => {
    const { Overrides, SupersededPins, PatchPins } = AssembleParentOverrides({}, { 'type-graphql': '2.0.0-rc.3' }, [], ['type-graphql@2.0.0-beta.3']);
    expect(Overrides).toEqual({ 'type-graphql': '2.0.0-beta.3' });
    expect(SupersededPins).toEqual(['type-graphql']);
    expect(PatchPins).toEqual(['type-graphql']);
  });

  it('a patched-package pin takes the per-major selector shape when other majors are pinned, never forcing them', () => {
    const { Overrides, SupersededPins, PatchPins } = AssembleParentOverrides(
      { 'chalk@^5': '5.6.2', 'chalk@^4': '4.1.2' },
      {},
      [],
      ['chalk@5.9.9']
    );
    expect(Overrides).toEqual({ 'chalk@^4': '4.1.2', 'chalk@^5': '5.9.9' });
    expect(SupersededPins).toEqual(['chalk@^5']);
    expect(PatchPins).toEqual(['chalk@^5']);
  });

  it('adds a patched-package pin the lockfiles never mentioned, and skips a patch key with no exact version', () => {
    const { Overrides, SupersededPins, PatchPins } = AssembleParentOverrides({}, {}, [], ['type-graphql@2.0.0-beta.3', 'lodash', 'chalk@^5']);
    expect(Overrides).toEqual({ 'type-graphql': '2.0.0-beta.3' });
    expect(SupersededPins).toEqual([]);
    expect(PatchPins).toEqual(['type-graphql']);
  });

  it('family workspace:* still beats a patched-package pin (local source always wins) and the pin is not reported', () => {
    const { Overrides, SupersededPins, PatchPins } = AssembleParentOverrides({}, {}, ['@memberjunction/core'], ['@memberjunction/core@6.1.0']);
    expect(Overrides).toEqual({ '@memberjunction/core': 'workspace:*' });
    expect(SupersededPins).toEqual(['@memberjunction/core']);
    expect(PatchPins).toEqual([]);
  });
});

describe('BuildPnpmWorkspaceSettings', () => {
  it('leads with the peer install switches, then the peer bridge, and omits empty sections', () => {
    const settings = BuildPnpmWorkspaceSettings(
      {},
      { Overrides: {}, PatchedDependencies: {}, PackageExtensions: {}, PeerAllowedVersions: {}, PeerIgnoreMissing: [], Conflicts: [], Patches: [] }
    );
    expect(Object.keys(settings)).toEqual(['strictPeerDependencies', 'autoInstallPeers', 'peerDependencyRules']);
    expect(settings.strictPeerDependencies).toBe(false);
    expect(settings.autoInstallPeers).toBe(true);
    expect(PEER_INSTALL_SETTINGS).toEqual({ strictPeerDependencies: false, autoInstallPeers: true });
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

  it('builds the private root manifest with pin and union, and returns the peer bridge as workspace-yaml settings', () => {
    const result = BuildRootPackageJson('bluecypress', [
      repo('MJ-repo', { RootPackageJson: { packageManager: 'pnpm@10.33.0', devDependencies: { turbo: '^2.5.0' } } }),
    ]);
    const manifest = JSON.parse(result.Content) as {
      name: string;
      private: boolean;
      packageManager: string;
      devDependencies: Record<string, string>;
      pnpm?: unknown;
    };
    expect(manifest.name).toBe('bluecypress-dev-workspace');
    expect(manifest.private).toBe(true);
    expect(manifest.packageManager).toBe('pnpm@10.33.0');
    expect(result.PinSource).toBe('MJ-repo');
    expect(manifest.devDependencies.turbo).toBe('^2.5.0');
    // pnpm 10 ignores a pnpm block at a workspace root — the settings go to pnpm-workspace.yaml instead
    expect(manifest.pnpm).toBeUndefined();
    const settings = result.PnpmSettings as {
      strictPeerDependencies: boolean;
      autoInstallPeers: boolean;
      peerDependencyRules: { allowedVersions: Record<string, string>; ignoreMissing: string[] };
    };
    expect(settings.strictPeerDependencies).toBe(false);
    expect(settings.autoInstallPeers).toBe(true);
    expect(settings.peerDependencyRules.allowedVersions['nunjucks>chokidar']).toBe('5');
    expect(settings.peerDependencyRules.allowedVersions['@modelcontextprotocol/sdk>zod']).toBe('^3.24');
    expect(settings.peerDependencyRules.ignoreMissing).toEqual(['axios']);
    expect(result.Content.endsWith('\n')).toBe(true);
  });

  it('sanitizes the parent directory name into a valid npm name', () => {
    const result = BuildRootPackageJson('Blue Cypress Code!', [repo('a')]);
    const manifest = JSON.parse(result.Content) as { name: string };
    expect(manifest.name).toBe('blue-cypress-code-dev-workspace');
  });

  // End-to-end absorption: everything the 299/299 field recipe did by hand
  // (#3795 steps 3–5 + the workspace:* addendum) lands in one settings block for pnpm-workspace.yaml.
  it('assembles the fully-absorbed pnpm settings: pins, hoisted overrides + patch (pinned), extensions, family workspace:*', () => {
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
    const manifest = JSON.parse(result.Content) as { devDependencies: Record<string, string>; pnpm?: unknown };
    expect(manifest.pnpm).toBeUndefined(); // pnpm 10 reads settings only from pnpm-workspace.yaml
    const settings = result.PnpmSettings as {
      strictPeerDependencies: boolean;
      autoInstallPeers: boolean;
      overrides: Record<string, string>;
      patchedDependencies: Record<string, string>;
      allowUnusedPatches: boolean;
      packageExtensions: Record<string, { dependencies: Record<string, string> }>;
      peerDependencyRules: { allowedVersions: Record<string, string>; ignoreMissing: string[] };
    };
    expect(settings.strictPeerDependencies).toBe(false);
    expect(settings.autoInstallPeers).toBe(true);
    expect(settings.overrides).toEqual({
      '@memberjunction/core': 'workspace:*',
      '@memberjunction/integration-test-suite': 'workspace:*',
      '@types/express': '5.1.1', // EXACT — ^resolved passed 6 of 7 field breaks through
      axios: '1.13.6',
      jsdom: '26.1.0',
      'type-graphql': '2.0.0-beta.3', // pinned from the patch key so the patch applies
    });
    expect(settings.patchedDependencies).toEqual({
      'type-graphql@2.0.0-beta.3': 'MJ/patches/type-graphql@2.0.0-beta.3.patch',
    });
    // a member patch keyed to a version the parent graph never resolves must not
    // hard-fail the whole install (ERR_PNPM_UNUSED_PATCH) — found by the live smoke
    expect(settings.allowUnusedPatches).toBe(true);
    expect(settings.packageExtensions['express-rate-limit']).toEqual({ dependencies: { '@types/express': '^5.0.6' } });
    expect(settings.peerDependencyRules.allowedVersions['nunjucks>chokidar']).toBe('5'); // baseline kept
    expect(settings.peerDependencyRules.allowedVersions['foo>bar']).toBe('2'); // member unioned on top
    expect(settings.peerDependencyRules.ignoreMissing).toEqual(['axios', 'graphql']);
    // the yaml builder renders exactly these settings
    expect(BuildWorkspaceYaml([mj], result.PnpmSettings)).toContain("\n  'type-graphql': '2.0.0-beta.3'\n");
    // devDependencies: @types skipped; the family workspace:* devDep KEPT (the package IS a member now)
    expect(manifest.devDependencies['@types/node']).toBeUndefined();
    expect(manifest.devDependencies['@memberjunction/integration-test-suite']).toBe('workspace:*');
    expect(manifest.devDependencies.turbo).toBe('^2.5.0');
    // the report carries every decision
    expect(result.Report.LockfilePinCount).toBe(2);
    expect(result.Report.FamilyOverrideCount).toBe(2);
    expect(result.Report.Patches).toHaveLength(1);
    expect(result.Report.PatchPins).toEqual(['type-graphql']);
    expect(result.Report.SkippedTypesDevDeps).toEqual(['@types/node']);
    expect(result.Report.LockfileSkips).toEqual([
      { Repo: 'MJ', Skip: { Name: 'fstream', Version: 'tar-fs@3.1.1', Reason: 'non-semver resolution' } },
    ]);
    expect(result.Report.DroppedWorkspaceDevDeps).toEqual([]); // provided by a member — kept, not dropped
  });
});

describe('BuildRootPackageJson dependencies', () => {
  const caliber = openAppMember('bizapps-caliber', '@mj-biz-apps/caliber-ng');

  it('registers a member-provided client bootstrap package at workspace:*', () => {
    const manifest = JSON.parse(BuildRootPackageJson('mj-dev', [caliber]).Content);
    expect(manifest.dependencies).toEqual({ '@mj-biz-apps/caliber-ng': 'workspace:*' });
  });

  it('omits the dependencies key entirely when no member declares a client package', () => {
    const manifest = JSON.parse(BuildRootPackageJson('mj-dev', [repo('MJ')]).Content);
    expect(manifest).not.toHaveProperty('dependencies');
  });

  // classifyDevDep maps any family-provided name to workspace:* and keeps it in the devDep union,
  // and a provided client package is by definition family-provided — so a member that devDepends on
  // its own client package put it in both blocks of a GENERATED file (rkihm-BC review, R2).
  it('emits a client package once, in dependencies, even when a member devDepends on it', () => {
    const selfDep = repo('bizapps-caliber', {
      RootPackageJson: { name: 'caliber', devDependencies: { '@mj-biz-apps/caliber-ng': 'workspace:*' } },
      MjAppJson: { packages: { client: [{ name: '@mj-biz-apps/caliber-ng', role: 'bootstrap' }] } },
      Packages: [pkg('packages/Angular', '@mj-biz-apps/caliber-ng')],
    });
    const manifest = JSON.parse(BuildRootPackageJson('mj-dev', [selfDep]).Content);
    expect(manifest.dependencies).toHaveProperty('@mj-biz-apps/caliber-ng', 'workspace:*');
    expect(manifest.devDependencies ?? {}).not.toHaveProperty('@mj-biz-apps/caliber-ng');
  });

  it('leaves an unrelated family devDependency in the devDependency union', () => {
    const other = repo('bizapps-caliber', {
      RootPackageJson: { name: 'caliber', devDependencies: { '@mj-biz-apps/caliber-lib': 'workspace:*' } },
      MjAppJson: { packages: { client: [{ name: '@mj-biz-apps/caliber-ng', role: 'bootstrap' }] } },
      Packages: [pkg('packages/Angular', '@mj-biz-apps/caliber-ng'), pkg('packages/Lib', '@mj-biz-apps/caliber-lib')],
    });
    const manifest = JSON.parse(BuildRootPackageJson('mj-dev', [other]).Content);
    expect(manifest.devDependencies).toHaveProperty('@mj-biz-apps/caliber-lib', 'workspace:*');
  });

  it('never registers a client package no member provides, and reports it', () => {
    const ghost = repo('bizapps-ghost', {
      MjAppJson: { packages: { client: [{ name: '@mj-biz-apps/ghost-ng', role: 'bootstrap' }] } },
    });
    const result = BuildRootPackageJson('mj-dev', [ghost]);
    expect(JSON.parse(result.Content)).not.toHaveProperty('dependencies');
    expect(result.Report.OpenAppClientPackages).toEqual([
      { Package: '@mj-biz-apps/ghost-ng', Repo: 'bizapps-ghost', Provided: false },
    ]);
  });
});

describe('shell peer gaps', () => {
  const SHELL_DEPS = { '@angular/core': '21.1.3', '@angular/common': '21.1.3', '@memberjunction/ng-shared': '6.1.0' };
  const SHELL_DEV = { '@angular/cli': '21.1.3' };
  const shell = (extraDeps?: Record<string, string>): CandidateRepo =>
    repo('MJ', {
      Packages: [
        pkg('packages/MJExplorer', 'mj_explorer', {
          dependencies: { ...SHELL_DEPS, ...extraDeps },
          devDependencies: SHELL_DEV,
        }),
      ],
    });
  const caliber = openAppMember('bizapps-caliber', '@mj-biz-apps/caliber-ng', {
    peerDependencies: { '@angular/core': '^21.1.3', '@angular/elements': '^21.1.3' },
  });

  it('detects an Angular app shell by its own dependencies, never a library', () => {
    const library = openAppMember('bizapps-lib', '@mj-biz-apps/lib-ng', {
      peerDependencies: { '@angular/core': '^21.1.3' }, // libraries take core as a PEER
    });
    expect(CollectWorkspaceShells([shell(), library]).map((s) => s.Name)).toEqual(['mj_explorer']);
  });

  // mj_angular_elements_demo is a real Angular app in the MJ monorepo that hosts no MJ Angular
  // surface. Without this condition it reported five peers of packages it will never load, on
  // every regenerate — noise that teaches people to stop reading the report.
  it('ignores an Angular app that declares no @memberjunction/ng-* package', () => {
    const standaloneDemo = repo('MJ-demo', {
      Packages: [
        pkg('packages/Demo', 'elements_demo', {
          dependencies: { '@angular/core': '21.1.3', '@memberjunction/core': '6.1.0' }, // no ng-* surface
          devDependencies: SHELL_DEV,
        }),
      ],
    });
    expect(CollectWorkspaceShells([shell(), standaloneDemo]).map((s) => s.Name)).toEqual(['mj_explorer']);
  });

  it('reports a peer the shell does not declare, with the pin the parent already derived', () => {
    const members = [shell(), caliber];
    const index = IndexWorkspacePackages(members);
    const gaps = ResolveShellPeerGaps(
      CollectOpenAppClientPackages(members, index).Packages,
      CollectWorkspaceShells(members),
      index,
      { '@angular/elements': '21.2.22' }
    );
    expect(gaps).toEqual([
      {
        Shell: 'mj_explorer',
        Package: '@mj-biz-apps/caliber-ng',
        Peer: '@angular/elements',
        Range: '^21.1.3',
        Pin: '21.2.22',
      },
    ]);
  });

  it('never reports a peer the shell declares, nor one a workspace member provides', () => {
    const members = [shell({ '@angular/elements': '21.2.22' }), caliber];
    const index = IndexWorkspacePackages(members);
    expect(
      ResolveShellPeerGaps(CollectOpenAppClientPackages(members, index).Packages, CollectWorkspaceShells(members), index, {})
    ).toEqual([]);
  });

  // DeriveLockfilePins emits a BARE override key only when a package resolves to one major
  // everywhere; otherwise it emits per-major selector keys (`chalk@^5` / `chalk@^4`). A bare-name
  // lookup misses those and then tells the developer "nothing in the parent pins it" — the exact
  // opposite of the truth, and the one actionable fact the warning exists to carry (#4401, F5).
  it('finds the pin when the parent keys it per-major', () => {
    const members = [shell(), caliber];
    const index = IndexWorkspacePackages(members);
    const gaps = ResolveShellPeerGaps(
      CollectOpenAppClientPackages(members, index).Packages,
      CollectWorkspaceShells(members),
      index,
      { '@angular/elements@^21': '21.2.22' }
    );
    expect(gaps[0].Pin).toBe('21.2.22');
  });

  it('picks the per-major pin whose major matches the peer range', () => {
    const members = [shell(), caliber]; // caliber asks for @angular/elements ^21.1.3
    const index = IndexWorkspacePackages(members);
    const gaps = ResolveShellPeerGaps(
      CollectOpenAppClientPackages(members, index).Packages,
      CollectWorkspaceShells(members),
      index,
      { '@angular/elements@^19': '19.1.0', '@angular/elements@^21': '21.2.22' }
    );
    expect(gaps[0].Pin).toBe('21.2.22');
  });

  it('reports Pin null when nothing in the parent pins the missing peer', () => {
    const members = [shell(), caliber];
    const index = IndexWorkspacePackages(members);
    const gaps = ResolveShellPeerGaps(
      CollectOpenAppClientPackages(members, index).Packages,
      CollectWorkspaceShells(members),
      index,
      {}
    );
    expect(gaps[0].Pin).toBeNull();
  });

  // The shell-agnostic form of this rule returned a FALSE NEGATIVE on the real workspace:
  // a demo app declaring @angular/elements hid MJExplorer's real gap (#4364).
  it('does not let one shell declaring a peer mask another shell that does not', () => {
    const demo = repo('MJ-demo', {
      Packages: [
        pkg('packages/Demo', 'elements_demo', {
          dependencies: { ...SHELL_DEPS, '@angular/elements': '21.2.22' },
          devDependencies: SHELL_DEV,
        }),
      ],
    });
    const members = [shell(), demo, caliber];
    const index = IndexWorkspacePackages(members);
    const gaps = ResolveShellPeerGaps(
      CollectOpenAppClientPackages(members, index).Packages,
      CollectWorkspaceShells(members),
      index,
      {}
    );
    expect(gaps.map((g) => g.Shell)).toEqual(['mj_explorer']);
  });

  it('flows the gaps into the manifest report', () => {
    const report = BuildRootPackageJson('mj-dev', [shell(), caliber]).Report;
    expect(report.ShellPeerGaps.map((g) => g.Peer)).toEqual(['@angular/elements']);
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
