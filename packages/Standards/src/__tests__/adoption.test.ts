import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LoadConfig, SaveConfig, StandardsConfigError } from '../config.js';
import { Adopt } from '../scaffold.js';
import { RunStandards, ExitCodeFor } from '../runner.js';
import type { StandardsConfig } from '../types.js';

let repo: string;

beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'mj-standards-adopt-'));
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }, null, 2));
    mkdirSync(join(repo, 'packages'), { recursive: true });
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

describe('config validation', () => {
    it('refuses a config with no StandardsVersion, and says why it matters', () => {
        writeFileSync(join(repo, '.mj-standards.json'), JSON.stringify({ Checks: {} }));
        expect(() => LoadConfig(repo)).toThrow(StandardsConfigError);
        expect(() => LoadConfig(repo)).toThrow(/StandardsVersion/);
    });

    it('refuses an invalid severity rather than silently disabling the check', () => {
        writeFileSync(
            join(repo, '.mj-standards.json'),
            JSON.stringify({ StandardsVersion: '5.51.0', Checks: { 'ui-layers': { Severity: 'errr' } } }),
        );
        expect(() => LoadConfig(repo)).toThrow(/Severity/);
    });

    it('round-trips through save and load', () => {
        const config: StandardsConfig = { StandardsVersion: '5.51.0', Checks: { 'ui-layers': { Severity: 'warn' } } };
        SaveConfig(repo, config);
        expect(LoadConfig(repo).Checks['ui-layers'].Severity).toBe('warn');
    });
});

describe('Adopt', () => {
    it('creates a config and enables checks at or below the adopted version', () => {
        const result = Adopt({ RepoRoot: repo, Version: '5.51.0' });
        expect(result.Config.Checks['ui-layers']).toBeDefined();
        expect(existsSync(join(repo, '.mj-standards.json'))).toBe(true);
    });

    it('does NOT enable a check newer than the version being adopted', () => {
        const result = Adopt({ RepoRoot: repo, Version: '5.40.0' });
        expect(result.Config.Checks['ui-layers']).toBeUndefined();
    });

    it('never lowers a severity a repo has raised', () => {
        SaveConfig(repo, { StandardsVersion: '5.51.0', Checks: { 'ui-layers': { Severity: 'warn' } } });
        const result = Adopt({ RepoRoot: repo, Version: '5.51.0' });
        // `adopt` gets repos started; it does not reset them to the defaults.
        expect(result.Config.Checks['ui-layers'].Severity).toBe('warn');
    });

    it('leaves StandardsVersion alone without --upgrade', () => {
        SaveConfig(repo, { StandardsVersion: '5.40.0', Checks: {} });
        const result = Adopt({ RepoRoot: repo, Version: '5.51.0' });
        // THE core property: upgrading the package must not change what a repo enforces.
        expect(result.Config.StandardsVersion).toBe('5.40.0');
        expect(result.Config.Checks['ui-layers']).toBeUndefined();
    });

    it('bumps StandardsVersion and enables newer checks with --upgrade', () => {
        SaveConfig(repo, { StandardsVersion: '5.40.0', Checks: {} });
        const result = Adopt({ RepoRoot: repo, Version: '5.51.0', Upgrade: true });
        expect(result.Config.StandardsVersion).toBe('5.51.0');
        expect(result.Config.Checks['ui-layers']).toBeDefined();
    });

    it('writes nothing on a dry run', () => {
        Adopt({ RepoRoot: repo, Version: '5.51.0', DryRun: true, Ci: 'github', AddNpmScript: true });
        expect(existsSync(join(repo, '.mj-standards.json'))).toBe(false);
        expect(existsSync(join(repo, '.github/workflows/mj-standards.yml'))).toBe(false);
    });

    it('writes a CI workflow, and never overwrites an existing one', () => {
        Adopt({ RepoRoot: repo, Version: '5.51.0', Ci: 'github' });
        const path = join(repo, '.github/workflows/mj-standards.yml');
        writeFileSync(path, 'name: hand-edited\n');
        const second = Adopt({ RepoRoot: repo, Version: '5.51.0', Ci: 'github' });
        expect(readFileSync(path, 'utf8')).toBe('name: hand-edited\n');
        expect(second.Actions.some((a) => a.Kind === 'skipped' && a.What.includes('mj-standards.yml'))).toBe(true);
    });

    it('adds an npm script without clobbering an existing one', () => {
        writeFileSync(
            join(repo, 'package.json'),
            JSON.stringify({ name: 'demo', scripts: { 'mj:standards': 'custom' } }, null, 2),
        );
        Adopt({ RepoRoot: repo, Version: '5.51.0', AddNpmScript: true });
        const manifest = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
        expect(manifest.scripts['mj:standards']).toBe('custom');
    });
});

describe('RunStandards', () => {
    it('does not run a check the repo has not adopted', async () => {
        const summary = await RunStandards(repo, { StandardsVersion: '5.51.0', Checks: {} });
        expect(summary.Outcomes).toHaveLength(0);
        expect(summary.Available.map((a) => a.Check.Id)).toContain('ui-layers');
    });

    it('marks a check as postdating adoption when it is newer than the repo', async () => {
        const summary = await RunStandards(repo, { StandardsVersion: '5.40.0', Checks: {} });
        expect(summary.Available.find((a) => a.Check.Id === 'ui-layers')?.PostdatesAdoption).toBe(true);
    });

    it('does not run an `off` check, and does not list it as available either', async () => {
        // The repo has seen it and said no — nagging about it would train people to ignore output.
        const summary = await RunStandards(repo, {
            StandardsVersion: '5.51.0',
            Checks: { 'ui-layers': { Severity: 'off' } },
        });
        expect(summary.Outcomes).toHaveLength(0);
        expect(summary.Available.map((a) => a.Check.Id)).not.toContain('ui-layers');
    });

    it('reports a config key that matches no registered check', async () => {
        // The repo believes it is enforcing something it is not. Silence would be worse.
        const summary = await RunStandards(repo, {
            StandardsVersion: '5.51.0',
            Checks: { 'ui-layerz': { Severity: 'error' } },
        });
        expect(summary.UnknownCheckIds).toEqual(['ui-layerz']);
    });

    it('warnings do not fail the build; errors do', async () => {
        const pkg = join(repo, 'packages', 'w');
        mkdirSync(join(pkg, 'src'), { recursive: true });
        writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@demo/w', mjUILayer: 'widgets' }));
        writeFileSync(join(pkg, 'src', 'a.ts'), `import { Router } from '@angular/router';`);

        const warn = await RunStandards(repo, {
            StandardsVersion: '5.51.0',
            Roots: ['packages'],
            Checks: { 'ui-layers': { Severity: 'warn' } },
        });
        expect(warn.WarningCount).toBeGreaterThan(0);
        expect(ExitCodeFor(warn)).toBe(0);

        const error = await RunStandards(repo, {
            StandardsVersion: '5.51.0',
            Roots: ['packages'],
            Checks: { 'ui-layers': { Severity: 'error' } },
        });
        expect(error.ErrorCount).toBeGreaterThan(0);
        expect(ExitCodeFor(error)).toBe(1);
    });
});
