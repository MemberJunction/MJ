import { describe, it, expect, beforeAll } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolveEntryPoint, checkPackage, sweep } from '../check-esm-imports.mjs';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

// A type:module package buried in a fixture's node_modules — the sweep must skip it.
// Created at test time because node_modules/ is gitignored and wouldn't survive a checkout.
beforeAll(() => {
    const sneakyDir = join(FIXTURES, 'ok-pkg', 'node_modules', 'sneaky');
    mkdirSync(sneakyDir, { recursive: true });
    writeFileSync(
        join(sneakyDir, 'package.json'),
        JSON.stringify({ name: 'fixture-sneaky-nested', private: true, type: 'module', main: 'index.js' }, null, 4)
    );
});

describe('resolveEntryPoint', () => {
    it('prefers exports["."].import over default and main', () => {
        const pkg = {
            main: 'dist/main.js',
            exports: { '.': { import: './dist/index.mjs', default: './dist/index.js' } },
        };
        expect(resolveEntryPoint(pkg)).toBe('./dist/index.mjs');
    });

    it('falls back to exports["."].default when import is absent', () => {
        const pkg = {
            main: 'dist/main.js',
            exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
        };
        expect(resolveEntryPoint(pkg)).toBe('./dist/index.js');
    });

    it('accepts a string-form exports["."]', () => {
        const pkg = { exports: { '.': './dist/index.js' } };
        expect(resolveEntryPoint(pkg)).toBe('./dist/index.js');
    });

    it('accepts a top-level string exports field', () => {
        const pkg = { exports: './dist/index.js' };
        expect(resolveEntryPoint(pkg)).toBe('./dist/index.js');
    });

    it('falls back to main when exports has no usable root entry', () => {
        const pkg = { main: 'dist/index.js', exports: { './sub': './dist/sub.js' } };
        expect(resolveEntryPoint(pkg)).toBe('dist/index.js');
    });

    it('returns null when neither exports nor main is present', () => {
        expect(resolveEntryPoint({})).toBeNull();
    });
});

describe('checkPackage', () => {
    it('classifies a built package with spec-compliant ESM as OK', async () => {
        const result = await checkPackage(join(FIXTURES, 'ok-pkg'));
        expect(result.status).toBe('OK');
        expect(result.name).toBe('fixture-ok-pkg');
    });

    it('classifies an extensionless specifier in own dist as OWN_DIST_MISSING_EXT', async () => {
        const result = await checkPackage(join(FIXTURES, 'missing-ext-pkg'));
        expect(result.status).toBe('OWN_DIST_MISSING_EXT');
        expect(result.detail).toContain('other');
    });

    it('classifies a missing external dependency as DEP_FAIL (non-gating)', async () => {
        const result = await checkPackage(join(FIXTURES, 'dep-fail-pkg'));
        expect(result.status).toBe('DEP_FAIL');
    });

    it('classifies a package whose entry file is absent as NOT_BUILT (skipped)', async () => {
        const result = await checkPackage(join(FIXTURES, 'not-built-pkg'));
        expect(result.status).toBe('NOT_BUILT');
    });
});

describe('sweep', () => {
    it('checks every type:module package under the root, skipping CJS packages and node_modules', async () => {
        const { results, failures } = await sweep(FIXTURES);
        const names = results.map((r) => r.name).sort();
        expect(names).toEqual([
            'fixture-dep-fail-pkg',
            'fixture-missing-ext-pkg',
            'fixture-not-built-pkg',
            'fixture-ok-pkg',
        ]);
        expect(failures.map((f) => f.name)).toEqual(['fixture-missing-ext-pkg']);
    });
});

describe('CLI', () => {
    const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'check-esm-imports.mjs');
    const run = promisify(execFile);

    it('exits 1 and names the offender when a package ships extensionless own-dist specifiers', async () => {
        const result = await run(process.execPath, [SCRIPT, join(FIXTURES)]).catch((e) => e);
        expect(result.code).toBe(1);
        expect(result.stdout + result.stderr).toContain('fixture-missing-ext-pkg');
    });

    it('exits 0 when every checked package imports cleanly', async () => {
        const result = await run(process.execPath, [SCRIPT, join(FIXTURES, 'ok-pkg')]).catch((e) => e);
        expect(result.code ?? 0).toBe(0);
    });
});
