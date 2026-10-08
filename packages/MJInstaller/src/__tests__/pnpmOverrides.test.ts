import { describe, it, expect } from 'vitest';
import {
  ExplorerAngularPins,
  IsExactVersion,
  LockfilePackageVersions,
  MEMBERJUNCTION_PIN_VALUE,
  MemberJunctionPins,
  MergePnpmOverrides,
  UsableLockstepPackages,
  type PnpmOverridePin,
} from '../util/pnpmOverrides.js';

/** The shape of a distribution's pnpm-workspace.yaml before any pins are added. */
const WORKSPACE = [
  "packages:",
  "  - 'apps/*'",
  "  - 'packages/*'",
  '',
  'linkWorkspacePackages: true',
  '',
].join('\n');

const PINS: PnpmOverridePin[] = [
  { Name: '@angular/core', Version: '21.2.22' },
  { Name: 'rxjs', Version: '^7.8.2' },
];

/** How many top-level `overrides` keys the text has — more than one is a YAML duplicate-key error. */
function overridesKeyCount(yaml: string): number {
  return (yaml.match(/^(['"]?)overrides\1[ \t]*:/gm) ?? []).length;
}

describe('ExplorerAngularPins', () => {
  it('pins every @angular/* package plus rxjs and zone.js, each at its own declared version, sorted', () => {
    const pins = ExplorerAngularPins(
      {
        '@angular/core': '21.2.22',
        '@angular/cdk': '21.2.14',
        rxjs: '^7.8.2',
        'zone.js': '^0.16.0',
        '@memberjunction/ng-explorer-core': '6.2.0',
        '@azure/msal-angular': '^4.0.0',
      },
      { '@angular/cli': '21.2.23', '@angular-devkit/build-angular': '21.2.23', typescript: '5.9.3' }
    );

    expect(pins).toEqual([
      { Name: '@angular/cdk', Version: '21.2.14' },
      { Name: '@angular/cli', Version: '21.2.23' },
      { Name: '@angular/core', Version: '21.2.22' },
      { Name: 'rxjs', Version: '^7.8.2' },
      { Name: 'zone.js', Version: '^0.16.0' },
    ]);
  });

  it('lets devDependencies win when a package is declared in both sections', () => {
    const pins = ExplorerAngularPins({ '@angular/core': '21.2.20' }, { '@angular/core': '21.2.22' });
    expect(pins).toEqual([{ Name: '@angular/core', Version: '21.2.22' }]);
  });

  it('returns no pins when Explorer declares no Angular-family packages or no dependency sections', () => {
    expect(ExplorerAngularPins({ express: '^4.0.0' }, undefined)).toEqual([]);
    expect(ExplorerAngularPins(undefined, undefined)).toEqual([]);
  });

  it('skips a package declared with an empty version', () => {
    expect(ExplorerAngularPins({ '@angular/core': '', rxjs: '^7.8.2' })).toEqual([{ Name: 'rxjs', Version: '^7.8.2' }]);
  });
});

describe('MergePnpmOverrides', () => {
  it('leaves the file untouched when there is nothing to pin', () => {
    const result = MergePnpmOverrides(WORKSPACE, []);
    expect(result.Outcome).toBe('unchanged');
    expect(result.Yaml).toBe(WORKSPACE);
  });

  describe('when the file has no overrides key', () => {
    it('appends one top-level `overrides:` block with quoted entries and keeps the rest verbatim', () => {
      const result = MergePnpmOverrides(WORKSPACE, PINS);

      expect(result.Outcome).toBe('appended');
      expect(result.Yaml.startsWith(WORKSPACE)).toBe(true);
      expect(result.Yaml).toContain("overrides:\n  '@angular/core': '21.2.22'\n  'rxjs': '^7.8.2'\n");
      expect(overridesKeyCount(result.Yaml)).toBe(1);
      // A template script adds its own block only when `^overrides\s*:` is absent — the
      // key must be spelled literally so that check sees it.
      expect(/^overrides\s*:/m.test(result.Yaml)).toBe(true);
      expect(result.Yaml.endsWith('\n')).toBe(true);
    });

    it('separates the block from content that lacks a trailing newline', () => {
      const result = MergePnpmOverrides('linkWorkspacePackages: true', PINS);
      expect(result.Yaml.startsWith('linkWorkspacePackages: true\n\n#')).toBe(true);
    });

    it('writes only the block into an empty file', () => {
      const result = MergePnpmOverrides('', PINS);
      expect(result.Yaml.startsWith('#')).toBe(true);
      expect(overridesKeyCount(result.Yaml)).toBe(1);
    });

    it('preserves CRLF line endings', () => {
      const crlf = WORKSPACE.replace(/\n/g, '\r\n');
      const result = MergePnpmOverrides(crlf, PINS);
      expect(result.Yaml).toContain("overrides:\r\n  '@angular/core': '21.2.22'\r\n");
      expect(result.Yaml.replace(/\r\n/g, '')).not.toContain('\n');
    });

    it('escapes a single quote inside a version', () => {
      const result = MergePnpmOverrides(WORKSPACE, [{ Name: 'rxjs', Version: "it's" }]);
      expect(result.Yaml).toContain("'rxjs': 'it''s'");
    });
  });

  describe('when the file already has a block-style overrides key', () => {
    const existing = [
      ...WORKSPACE.split('\n').slice(0, -1),
      'overrides:',
      '  # pinned by hand',
      "  'some-lib': '1.0.0'",
      "  '@angular/core': '21.2.20'",
      '',
      '# pnpm 10 only runs build scripts that are allowlisted here.',
      'onlyBuiltDependencies:',
      '  - esbuild',
      '',
    ].join('\n');

    it('merges into it rather than adding a second key', () => {
      const result = MergePnpmOverrides(existing, PINS);
      expect(result.Outcome).toBe('merged');
      expect(overridesKeyCount(result.Yaml)).toBe(1);
    });

    it('keeps unrelated entries and comments, and appends missing pins after the last entry', () => {
      const lines = MergePnpmOverrides(existing, PINS).Yaml.split('\n');
      const header = lines.indexOf('overrides:');

      expect(lines.slice(header, header + 5)).toEqual([
        'overrides:',
        '  # pinned by hand',
        "  'some-lib': '1.0.0'",
        "  '@angular/core': '21.2.22'",
        "  'rxjs': '^7.8.2'",
      ]);
      // The next top-level key (and the comment above it) are untouched.
      expect(lines.slice(header + 5)).toEqual([
        '',
        '# pnpm 10 only runs build scripts that are allowlisted here.',
        'onlyBuiltDependencies:',
        '  - esbuild',
        '',
      ]);
    });

    it("replaces a stale version with Explorer's and reports the change", () => {
      const result = MergePnpmOverrides(existing, PINS);
      expect(result.Changed).toEqual([{ Name: '@angular/core', Previous: '21.2.20', Current: '21.2.22' }]);
      expect(result.Yaml).not.toContain('21.2.20');
    });

    it('is idempotent: a second merge changes nothing', () => {
      const once = MergePnpmOverrides(existing, PINS).Yaml;
      const twice = MergePnpmOverrides(once, PINS);
      expect(twice.Outcome).toBe('unchanged');
      expect(twice.Yaml).toBe(once);
    });

    it('recognises double-quoted and plain entries as the same keys', () => {
      const yaml = ['overrides:', '    "@angular/core": "21.2.22"', '    rxjs: ^7.8.2  # same pin, plain', ''].join('\n');
      const result = MergePnpmOverrides(yaml, PINS);
      expect(result.Outcome).toBe('unchanged');
      expect(result.Yaml).toBe(yaml);
    });

    it("uses the block's own indentation for new entries", () => {
      const yaml = ['overrides:', "    'some-lib': '1.0.0'", ''].join('\n');
      expect(MergePnpmOverrides(yaml, PINS).Yaml).toContain("    'some-lib': '1.0.0'\n    '@angular/core': '21.2.22'\n");
    });

    it('fills an empty block that is followed by another key', () => {
      const yaml = ['overrides:', 'linkWorkspacePackages: true', ''].join('\n');
      expect(MergePnpmOverrides(yaml, PINS).Yaml).toBe(
        ['overrides:', "  '@angular/core': '21.2.22'", "  'rxjs': '^7.8.2'", 'linkWorkspacePackages: true', ''].join('\n')
      );
    });

    it('treats a quoted `overrides` key as the same key', () => {
      const yaml = ["'overrides':", "  'some-lib': '1.0.0'", ''].join('\n');
      const result = MergePnpmOverrides(yaml, PINS);
      expect(result.Outcome).toBe('merged');
      expect(overridesKeyCount(result.Yaml)).toBe(1);
    });
  });

  it('reports a flow-style overrides key as unsupported and leaves the file untouched', () => {
    const yaml = `${WORKSPACE}overrides: {}\n`;
    const result = MergePnpmOverrides(yaml, PINS);
    expect(result.Outcome).toBe('unsupported');
    expect(result.Yaml).toBe(yaml);
  });

  it('ignores an indented `overrides:` that belongs to another key', () => {
    const yaml = ['peerDependencyRules:', '  overrides:', "    'x': '1'", ''].join('\n');
    const result = MergePnpmOverrides(yaml, PINS);
    expect(result.Outcome).toBe('appended');
    expect(overridesKeyCount(result.Yaml)).toBe(1);
  });
});

/**
 * A pnpm 10 (lockfile v9) lockfile in the shape a host has after an Open App built on MJ 6.1 was
 * installed into a 6.2.0-edge.3 distribution: `@memberjunction/core` and `global` at both versions,
 * an app-only package at 6.1.5, the separately versioned skyway engine, and a non-MJ package.
 * The `importers`, `overrides` and `snapshots` sections carry MJ names too, and must not count.
 */
const LOCKFILE_V9 = [
  "lockfileVersion: '9.0'",
  '',
  'settings:',
  '  autoInstallPeers: true',
  '',
  'overrides:',
  "  '@angular/core': 21.2.22",
  "  '@memberjunction/cli@9.9.9': 9.9.9",
  '',
  'importers:',
  '',
  '  apps/MJAPI:',
  '    dependencies:',
  "      '@memberjunction/core':",
  '        specifier: 6.2.0-edge.3',
  '        version: 6.2.0-edge.3',
  "      '@mj-biz-apps/orders-ng':",
  '        specifier: ^5.29.0',
  '        version: 5.29.0(8f4d5d6b7ab951bf64b45bb56b8c7a15)',
  '',
  'packages:',
  '',
  "  '@angular/core@21.2.22':",
  "    resolution: {integrity: sha512-a}",
  '',
  "  '@memberjunction/cli@6.2.0-edge.3':",
  "    resolution: {integrity: sha512-b}",
  '',
  "  '@memberjunction/core@6.1.5':",
  "    resolution: {integrity: sha512-c}",
  '',
  "  '@memberjunction/core@6.2.0-edge.3':",
  "    resolution: {integrity: sha512-d}",
  '',
  "  '@memberjunction/global@6.1.5':",
  "    resolution: {integrity: sha512-e}",
  '',
  "  '@memberjunction/global@6.2.0-edge.3':",
  "    resolution: {integrity: sha512-f}",
  '',
  "  '@memberjunction/ng-gantt@6.1.5':",
  "    resolution: {integrity: sha512-g}",
  '',
  "  '@memberjunction/skyway-core@0.6.2':",
  "    resolution: {integrity: sha512-h}",
  '',
  "  '@mj-biz-apps/orders-ng@5.29.0':",
  "    resolution: {integrity: sha512-i}",
  '',
  '  zod@3.25.76:',
  "    resolution: {integrity: sha512-j}",
  '',
  'snapshots:',
  '',
  "  '@memberjunction/ng-hierarchy-tree@6.1.0(ddf62253752cda2228ff32c508be04b3)':",
  '    dependencies:',
  "      '@memberjunction/core': 6.1.5",
  '',
].join('\n');

describe('IsExactVersion', () => {
  it('accepts release, prerelease and build-metadata versions', () => {
    for (const version of ['6.2.0', '6.2.0-edge.3', '6.1.0-edge.5', '1.0.0+build.7', ' 6.2.0 ']) {
      expect(IsExactVersion(version)).toBe(true);
    }
  });

  it('rejects ranges, dist-tags, protocols and a missing value', () => {
    for (const spec of ['^6.2.0', '~6.1.5', '>=6.1.2 <7.0.0', 'latest', 'workspace:*', 'file:../cli', '6.2', '', undefined]) {
      expect(IsExactVersion(spec)).toBe(false);
    }
  });
});

describe('LockfilePackageVersions', () => {
  it('reads every installed version from the packages section and nothing else', () => {
    const versions = LockfilePackageVersions(LOCKFILE_V9);

    expect([...(versions.get('@memberjunction/core') ?? [])].sort()).toEqual(['6.1.5', '6.2.0-edge.3']);
    expect([...(versions.get('@memberjunction/ng-gantt') ?? [])]).toEqual(['6.1.5']);
    expect([...(versions.get('zod') ?? [])]).toEqual(['3.25.76']);
    // Only in `snapshots:` (and as a dependency value): not an installed package key here.
    expect(versions.has('@memberjunction/ng-hierarchy-tree')).toBe(false);
    // The override selector `@memberjunction/cli@9.9.9` is config, not an install.
    expect([...(versions.get('@memberjunction/cli') ?? [])]).toEqual(['6.2.0-edge.3']);
  });

  it('reads lockfile v6 keys, which carry a leading slash and are unquoted', () => {
    const v6 = ['lockfileVersion: \'6.0\'', '', 'packages:', '', '  /@memberjunction/core@6.2.0:', '    resolution: {}', '', '  /zod@3.25.76:', '    resolution: {}', ''].join('\n');
    const versions = LockfilePackageVersions(v6);
    expect([...(versions.get('@memberjunction/core') ?? [])]).toEqual(['6.2.0']);
    expect([...(versions.get('zod') ?? [])]).toEqual(['3.25.76']);
  });

  it('handles CRLF line endings and an empty file', () => {
    expect(LockfilePackageVersions(LOCKFILE_V9.replace(/\n/g, '\r\n')).get('@memberjunction/core')?.size).toBe(2);
    expect(LockfilePackageVersions('').size).toBe(0);
  });
});

describe('MemberJunctionPins', () => {
  it('pins every @memberjunction package resolved at the host version to the root CLI, sorted', () => {
    expect(MemberJunctionPins(LOCKFILE_V9, '6.2.0-edge.3')).toEqual([
      { Name: '@memberjunction/cli', Version: '$@memberjunction/cli' },
      { Name: '@memberjunction/core', Version: '$@memberjunction/cli' },
      { Name: '@memberjunction/global', Version: '$@memberjunction/cli' },
    ]);
    expect(MEMBERJUNCTION_PIN_VALUE).toBe('$@memberjunction/cli');
  });

  it('leaves alone what was never resolved at the host version: app-only MJ packages, skyway, other scopes', () => {
    const names = MemberJunctionPins(LOCKFILE_V9, '6.2.0-edge.3').map((pin) => pin.Name);
    expect(names).not.toContain('@memberjunction/ng-gantt');
    expect(names).not.toContain('@memberjunction/skyway-core');
    expect(names.every((name) => name.startsWith('@memberjunction/'))).toBe(true);
  });

  it("adds the release's shipped package list, so packages only an Open App uses are pinned too", () => {
    const names = MemberJunctionPins(LOCKFILE_V9, '6.2.0-edge.3', [
      '@memberjunction/ng-gantt',
      '@memberjunction/ng-kanban',
      '@memberjunction/core', // also in the lockfile: one pin, not two
      'left-pad', // never outside the scope
    ]).map((pin) => pin.Name);

    expect(names).toEqual([
      '@memberjunction/cli',
      '@memberjunction/core',
      '@memberjunction/global',
      '@memberjunction/ng-gantt',
      '@memberjunction/ng-kanban',
    ]);
  });

  it('pins the shipped list even before anything is installed', () => {
    expect(MemberJunctionPins('', '6.2.0-edge.3', ['@memberjunction/ng-gantt'])).toEqual([
      { Name: '@memberjunction/ng-gantt', Version: '$@memberjunction/cli' },
    ]);
  });

  it('pins nothing without an exact host version', () => {
    expect(MemberJunctionPins(LOCKFILE_V9, 'latest', ['@memberjunction/ng-gantt'])).toEqual([]);
    expect(MemberJunctionPins(LOCKFILE_V9, 'latest')).toEqual([]);
    expect(MemberJunctionPins(LOCKFILE_V9, '^6.2.0')).toEqual([]);
    expect(MemberJunctionPins(LOCKFILE_V9, '9.9.9')).toEqual([]);
  });

  it('merges into the Angular block as one overrides key, and a second merge changes nothing', () => {
    const withAngular = MergePnpmOverrides(WORKSPACE, PINS).Yaml;
    const merged = MergePnpmOverrides(withAngular, MemberJunctionPins(LOCKFILE_V9, '6.2.0-edge.3'));

    expect(merged.Outcome).toBe('merged');
    expect(overridesKeyCount(merged.Yaml)).toBe(1);
    expect(merged.Yaml).toContain("  '@angular/core': '21.2.22'\n");
    expect(merged.Yaml).toContain("  '@memberjunction/core': '$@memberjunction/cli'\n");
    expect(MergePnpmOverrides(merged.Yaml, MemberJunctionPins(LOCKFILE_V9, '6.2.0-edge.3')).Outcome).toBe('unchanged');
  });

  it('replaces a literal MJ version someone pinned by hand with the CLI reference', () => {
    const yaml = `${WORKSPACE}overrides:\n  '@memberjunction/core': '6.1.5'\n`;
    const merged = MergePnpmOverrides(yaml, MemberJunctionPins(LOCKFILE_V9, '6.2.0-edge.3'));
    expect(merged.Changed).toEqual([{ Name: '@memberjunction/core', Previous: '6.1.5', Current: '$@memberjunction/cli' }]);
  });
});

describe('UsableLockstepPackages', () => {
  const LIST = { Version: '6.2.0-edge.3', Packages: ['@memberjunction/core', '@memberjunction/ng-gantt'] };

  it('uses the list for a host on the same major release, prerelease or not', () => {
    expect(UsableLockstepPackages(LIST, '6.2.0-edge.3')).toEqual(LIST.Packages);
    expect(UsableLockstepPackages(LIST, '6.1.5')).toEqual(LIST.Packages);
    expect(UsableLockstepPackages(LIST, '6.4.0')).toEqual(LIST.Packages);
  });

  it('ignores a list from another major release, which may name packages the host release lacks', () => {
    expect(UsableLockstepPackages(LIST, '5.51.0')).toEqual([]);
    expect(UsableLockstepPackages({ Version: '7.0.0', Packages: LIST.Packages }, '6.2.0')).toEqual([]);
  });

  it('ignores a missing or malformed list, and a host version that is not exact', () => {
    expect(UsableLockstepPackages(undefined, '6.2.0')).toEqual([]);
    expect(UsableLockstepPackages({ Version: 'latest', Packages: LIST.Packages }, '6.2.0')).toEqual([]);
    expect(UsableLockstepPackages({ Version: '6.2.0' } as unknown as typeof LIST, '6.2.0')).toEqual([]);
    expect(UsableLockstepPackages(LIST, '^6.2.0')).toEqual([]);
  });

  it('returns a copy, so callers cannot change the list', () => {
    const names = UsableLockstepPackages(LIST, '6.2.0');
    names.push('@memberjunction/extra');
    expect(LIST.Packages).toHaveLength(2);
  });
});
