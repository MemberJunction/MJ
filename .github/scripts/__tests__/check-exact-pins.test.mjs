import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isExactVersion, findPinViolations } from '../check-exact-pins.mjs';
import { readWorkflow } from './lib/workflow.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, '..', 'check-exact-pins.mjs');
const REPO_ROOT = resolve(HERE, '..', '..', '..');

describe('check-exact-pins against this repo', () => {
    it('every @foblex/* dependency is an exact version that matches pnpm-lock.yaml', () => {
        const run = spawnSync(process.execPath, [SCRIPT, '--root', REPO_ROOT], { encoding: 'utf8' });
        expect(run.stdout + run.stderr).not.toMatch(/\^|~/);
        expect(run.status).toBe(0);
    });

    it('triggers test.yml on an edit to .github/scripts/check-exact-pins.mjs alone', () => {
        const pathsBlock = readWorkflow().match(/<<'PATHS'\n([\s\S]*?)\n\s*PATHS\n/);
        expect(pathsBlock, "test.yml's changes job must keep its <<'PATHS' list").not.toBeNull();
        expect(pathsBlock[1].split('\n').map((l) => l.trim())).toContain('.github/scripts/check-exact-pins.mjs');
    });
});

describe('isExactVersion', () => {
    it('accepts strict X.Y.Z versions and rejects ranges or tags', () => {
        expect(isExactVersion('18.0.0')).toBe(true);
        expect(isExactVersion('1.2.2')).toBe(true);
        expect(isExactVersion('^18.0.0')).toBe(false);
        expect(isExactVersion('~18.0.0')).toBe(false);
        expect(isExactVersion('>=18.0.0')).toBe(false);
        expect(isExactVersion('18.0.0-edge.1')).toBe(false);
        expect(isExactVersion('latest')).toBe(false);
        expect(isExactVersion('*')).toBe(false);
    });
});

describe('check-exact-pins fixture suite', () => {
    let tempRoot;

    beforeEach(() => {
        tempRoot = mkdtempSync(join(tmpdir(), 'check-exact-pins-'));
    });

    afterEach(() => {
        rmSync(tempRoot, { recursive: true, force: true });
    });

    function writeManifest(relDir, pkgJson) {
        const fullDir = join(tempRoot, relDir);
        mkdirSync(fullDir, { recursive: true });
        writeFileSync(join(fullDir, 'package.json'), JSON.stringify(pkgJson, null, 2) + '\n', 'utf8');
    }

    function writeLockfile(importersYaml) {
        const content = `lockfileVersion: '9.0'\n\nimporters:\n${importersYaml}\npackages:\n  '@foblex/flow@18.0.0':\n    resolution: {integrity: sha512-xyz}\n`;
        writeFileSync(join(tempRoot, 'pnpm-lock.yaml'), content, 'utf8');
    }

    function runCli(args = ['--root', tempRoot]) {
        return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
    }

    it('fails when a manifest declares a caret range (^18.0.0)', () => {
        writeManifest('packages/flow-editor', {
            name: '@memberjunction/ng-flow-editor',
            dependencies: {
                '@foblex/flow': '^18.0.0',
            },
        });
        writeLockfile(
            `  packages/flow-editor:\n    dependencies:\n      '@foblex/flow':\n        specifier: ^18.0.0\n        version: 18.0.0(@angular/core@21.2.22)`
        );

        const violations = findPinViolations(tempRoot);
        expect(violations).toEqual([
            {
                manifestPath: 'packages/flow-editor/package.json',
                dep: '@foblex/flow',
                declaredRange: '^18.0.0',
                lockfileVersion: '18.0.0',
                lockfileSpecifier: '^18.0.0',
            },
        ]);

        const res = runCli();
        expect(res.status).toBe(1);
        expect(res.stderr.trim().split('\n')).toHaveLength(1);
        expect(res.stderr).toContain('packages/flow-editor/package.json');
        expect(res.stderr).toContain('@foblex/flow');
        expect(res.stderr).toContain('^18.0.0');
        expect(res.stderr).toContain('18.0.0');
    });

    it('fails when a manifest declares a tilde range (~18.0.0)', () => {
        writeManifest('packages/flow-editor', {
            name: '@memberjunction/ng-flow-editor',
            dependencies: {
                '@foblex/flow': '~18.0.0',
            },
        });
        writeLockfile(
            `  packages/flow-editor:\n    dependencies:\n      '@foblex/flow':\n        specifier: ~18.0.0\n        version: 18.0.0`
        );

        expect(findPinViolations(tempRoot)).toHaveLength(1);
        const res = runCli();
        expect(res.status).toBe(1);
        expect(res.stderr).toContain('~18.0.0');
    });

    it('fails when an exact range differs from the lockfile resolved version', () => {
        writeManifest('packages/flow-editor', {
            name: '@memberjunction/ng-flow-editor',
            dependencies: {
                '@foblex/flow': '18.0.0',
            },
        });
        writeLockfile(
            `  packages/flow-editor:\n    dependencies:\n      '@foblex/flow':\n        specifier: 18.0.0\n        version: 18.6.1(@angular/core@21.2.22)`
        );

        const violations = findPinViolations(tempRoot);
        expect(violations).toEqual([
            {
                manifestPath: 'packages/flow-editor/package.json',
                dep: '@foblex/flow',
                declaredRange: '18.0.0',
                lockfileVersion: '18.6.1',
                lockfileSpecifier: '18.0.0',
            },
        ]);

        const res = runCli();
        expect(res.status).toBe(1);
        expect(res.stderr).toContain('18.6.1');
    });

    it('fails when an exact range has a stale lockfile specifier', () => {
        writeManifest('packages/flow-editor', {
            name: '@memberjunction/ng-flow-editor',
            dependencies: {
                '@foblex/flow': '18.0.0',
            },
        });
        writeLockfile(
            `  packages/flow-editor:\n    dependencies:\n      '@foblex/flow':\n        specifier: ^18.0.0\n        version: 18.0.0(@angular/core@21.2.22)`
        );

        expect(findPinViolations(tempRoot)).toHaveLength(1);
        expect(runCli().status).toBe(1);
    });

    it('fails when a pinned-scope dependency in devDependencies or peerDependencies uses a range or is missing from lockfile', () => {
        writeManifest('packages/flow-editor', {
            name: '@memberjunction/ng-flow-editor',
            devDependencies: {
                '@foblex/2d': '^1.2.2',
            },
            peerDependencies: {
                '@foblex/utils': '1.1.1',
            },
        });
        writeLockfile(
            `  packages/flow-editor:\n    devDependencies:\n      '@foblex/2d':\n        specifier: ^1.2.2\n        version: 1.2.2`
        );

        const violations = findPinViolations(tempRoot);
        expect(violations).toHaveLength(2);
        expect(runCli().status).toBe(1);
    });

    it('fails when a pinned-scope dependency in optionalDependencies uses a range', () => {
        writeManifest('packages/flow-editor', {
            name: '@memberjunction/ng-flow-editor',
            optionalDependencies: {
                '@foblex/flow': '^18.0.0',
            },
        });
        writeLockfile(
            `  packages/flow-editor:\n    optionalDependencies:\n      '@foblex/flow':\n        specifier: ^18.0.0\n        version: 18.0.0(@angular/core@21.2.22)`
        );

        const violations = findPinViolations(tempRoot);
        expect(violations).toEqual([
            {
                manifestPath: 'packages/flow-editor/package.json',
                dep: '@foblex/flow',
                declaredRange: '^18.0.0',
                lockfileVersion: '18.0.0',
                lockfileSpecifier: '^18.0.0',
            },
        ]);
        expect(runCli().status).toBe(1);
    });

    it('passes when an exact range matches pnpm-lock.yaml and ignores caret ranges outside PINNED_SCOPES', () => {
        writeManifest('packages/flow-editor', {
            name: '@memberjunction/ng-flow-editor',
            dependencies: {
                '@foblex/2d': '1.2.2',
                '@foblex/flow': '18.0.0',
                rxjs: '^7.8.2',
            },
            devDependencies: {
                vitest: '~4.0.18',
            },
            peerDependencies: {
                '@angular/core': '^21.2.22',
            },
        });
        writeLockfile(
            `  packages/flow-editor:\n    dependencies:\n      '@foblex/2d':\n        specifier: 1.2.2\n        version: 1.2.2(@angular/core@21.2.22)\n      '@foblex/flow':\n        specifier: 18.0.0\n        version: 18.0.0(@angular/common@21.2.22)(@angular/core@21.2.22)\n      rxjs:\n        specifier: ^7.8.2\n        version: 7.8.2`
        );

        expect(findPinViolations(tempRoot)).toEqual([]);
        const res = runCli();
        expect(res.status).toBe(0);
        expect(res.stdout + res.stderr).not.toMatch(/\^|~/);
    });

    it('refuses a packages/ directory with no package.json instead of passing a walk that inspected nothing', () => {
        mkdirSync(join(tempRoot, 'packages', 'empty'), { recursive: true });
        writeLockfile('');

        expect(() => findPinViolations(tempRoot)).toThrow(/No package\.json files found/);
        const res = runCli();
        expect(res.status).toBe(2);
        expect(res.stderr).toContain('wrong directory?');
    });

    it('exits 2 on missing pnpm-lock.yaml or bad CLI arguments', () => {
        writeManifest('packages/flow-editor', { name: 'pkg' });
        expect(runCli(['--root', tempRoot]).status).toBe(2);
        expect(runCli(['--unknown-flag']).status).toBe(2);
    });
});
