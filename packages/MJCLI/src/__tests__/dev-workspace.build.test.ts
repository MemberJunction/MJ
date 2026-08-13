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
  BASELINE_DEV_DEPENDENCIES,
  BuildNpmrc,
  BuildRootPackageJson,
  BuildSentinel,
  BuildShellPeerGuidance,
  BuildWorkspaceYaml,
  CompareVersionStrings,
  FALLBACK_PNPM_PIN,
  NPMRC_BASE_LINES,
  ONLY_BUILT_DEPENDENCIES,
  PickTurboJson,
  ResolveDevDependencyUnion,
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
    TurboJson: null,
    ...overrides,
  };
}

describe('BuildWorkspaceYaml', () => {
  it('throws on an empty member list', () => {
    expect(() => BuildWorkspaceYaml([])).toThrow(/at least one member/);
  });

  it('emits linkWorkspacePackages and the 16-name build-scripts allowlist', () => {
    const yaml = BuildWorkspaceYaml(['bizapps-common']);
    expect(yaml).toContain('linkWorkspacePackages: true');
    expect(ONLY_BUILT_DEPENDENCIES).toHaveLength(16);
    expect(yaml).toContain("  - '@apollo/protobufjs'"); // scoped names quoted
    expect(yaml).toContain('  - esbuild'); // bare names unquoted
    expect(yaml).toContain('  - tesseract.js');
  });

  it('emits exactly a repo-root glob and a packages glob per member, sorted', () => {
    const yaml = BuildWorkspaceYaml(['bizapps-tasks', 'bizapps-common']);
    const packagesSection = yaml.slice(yaml.indexOf('packages:'));
    const globs = packagesSection.split('\n').filter((l) => l.startsWith('  - '));
    expect(globs).toEqual([
      "  - 'bizapps-common'",
      "  - 'bizapps-common/packages/*'",
      "  - 'bizapps-tasks'",
      "  - 'bizapps-tasks/packages/*'",
    ]);
  });

  it('never emits an apps glob (app-shell names collide across repos)', () => {
    expect(BuildWorkspaceYaml(['bizapps-common', 'bizapps-accounting'])).not.toContain('/apps/');
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
