import { describe, it, expect } from 'vitest';
import { ExplorerAngularPins, MergePnpmOverrides, type PnpmOverridePin } from '../util/pnpmOverrides.js';

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
