import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LoadCheckModules } from '../utils/check-module-loader';

describe('LoadCheckModules', () => {
    it('loads a bare package specifier installed by the project at cwd (#3741)', async () => {
        const cwd = mkdtempSync(join(tmpdir(), 'mj-check-host-'));
        const pkgDir = join(cwd, 'node_modules', '@probe', 'mj-check-suite');
        mkdirSync(pkgDir, { recursive: true });
        writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: '@probe/mj-check-suite', type: 'module', main: 'index.js' }));
        writeFileSync(join(pkgDir, 'index.js'), 'globalThis.__mjCheckSuiteLoaded = true;\n');
        writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'host', private: true }));

        const summary = await LoadCheckModules(['@probe/mj-check-suite'], cwd);
        expect(summary.Failed).toEqual([]);
        expect(summary.Loaded).toEqual(['@probe/mj-check-suite']);
        expect((globalThis as { __mjCheckSuiteLoaded?: boolean }).__mjCheckSuiteLoaded).toBe(true);
    });

    it('reports a package nobody installed as a failure, without throwing', async () => {
        const cwd = mkdtempSync(join(tmpdir(), 'mj-check-empty-'));
        const summary = await LoadCheckModules(['@definitely/not-installed-xyz'], cwd);
        expect(summary.Loaded).toEqual([]);
        expect(summary.Failed.map(f => f.specifier)).toEqual(['@definitely/not-installed-xyz']);
    });
});
