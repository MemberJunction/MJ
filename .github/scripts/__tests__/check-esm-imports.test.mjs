import { describe, it, expect, beforeAll } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolveEntryPoint, checkPackage, classifyFailure, sweep } from '../check-esm-imports.mjs';

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

    it('unwraps a nested import condition object with no top-level main', () => {
        const pkg = { exports: { '.': { import: { types: './dist/index.d.ts', default: './dist/index.js' } } } };
        expect(resolveEntryPoint(pkg)).toBe('./dist/index.js');
    });

    it('unwraps a nested default condition, honoring Node key order (node wins over default)', () => {
        // Node iterates conditions in declared order; `node` is active for a Node ESM
        // import, so it is selected before the `default` fallback.
        const pkg = { exports: { '.': { default: { node: './dist/node.js', default: './dist/index.js' } } } };
        expect(resolveEntryPoint(pkg)).toBe('./dist/node.js');
    });

    it('unwraps arbitrarily deep nested conditions (import → node → default)', () => {
        const pkg = { exports: { '.': { import: { node: { default: './dist/index.js' } } } } };
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

    it('uses a pre-parsed pkgJson when provided instead of re-reading package.json', async () => {
        // ok-pkg on disk is valid; an override pointing at a nonexistent entry must win,
        // proving checkPackage honors the passed pkgJson (the sweep threads it in to
        // avoid re-parsing every package.json).
        const override = { name: 'overridden', type: 'module', main: 'does-not-exist.js' };
        const result = await checkPackage(join(FIXTURES, 'ok-pkg'), override);
        expect(result.status).toBe('NOT_BUILT');
        expect(result.name).toBe('overridden');
    });
});

describe('classifyFailure', () => {
    const pkgDir = '/repo/packages/Victim';
    // Inject the filesystem seam: the #3137 signature is a missing extensionless
    // specifier whose JS sibling (`<missing>.js/.mjs/.cjs`) exists on disk. Tests
    // declare which sibling paths "exist" so the check is deterministic.
    const siblingsExist = (...paths) => ({ fileExists: (p) => paths.includes(p) });

    it('classifies an extensionless specifier in the package own dist as OWN_DIST_MISSING_EXT', () => {
        const failure = {
            code: 'ERR_MODULE_NOT_FOUND',
            message: `Cannot find module '${pkgDir}/dist/helper' imported from ${pkgDir}/dist/index.js`,
        };
        expect(classifyFailure(failure, pkgDir, siblingsExist(`${pkgDir}/dist/helper.js`)).status).toBe('OWN_DIST_MISSING_EXT');
    });

    it('gates an extensionless specifier with a DOTTED basename (content.types) whose JS sibling exists', () => {
        // Regression guard: extname('content.types') === '.types' wrongly reads as "has an
        // extension". The true signature is that content.types.js exists on disk.
        const failure = {
            code: 'ERR_MODULE_NOT_FOUND',
            message: `Cannot find module '${pkgDir}/dist/content.types' imported from ${pkgDir}/dist/index.js`,
        };
        expect(classifyFailure(failure, pkgDir, siblingsExist(`${pkgDir}/dist/content.types.js`)).status).toBe('OWN_DIST_MISSING_EXT');
    });

    it('classifies a break inside the package own nested node_modules as DEP_FAIL, not own-dist', () => {
        // npm nests deps in a package's own node_modules on version conflicts; a third-party
        // dep's broken ESM must not be blamed on the host MJ package (gating false positive).
        const failure = {
            code: 'ERR_MODULE_NOT_FOUND',
            message: `Cannot find module '${pkgDir}/node_modules/brokendep/missing-thing' imported from ${pkgDir}/node_modules/brokendep/index.js`,
        };
        expect(classifyFailure(failure, pkgDir).status).toBe('DEP_FAIL');
    });

    it('classifies a missing own-dist file WITH a .js extension as DEP_FAIL, not the extensionless bug', () => {
        // A genuinely-absent generated/build file (e.g. an ungenerated manifest) is not the
        // #3137 tsc-alias signature (that is always extensionless), so it must not gate CI.
        const failure = {
            code: 'ERR_MODULE_NOT_FOUND',
            message: `Cannot find module '${pkgDir}/dist/generated/manifest.js' imported from ${pkgDir}/dist/index.js`,
        };
        expect(classifyFailure(failure, pkgDir).status).toBe('DEP_FAIL');
    });

    it('classifies a directory import in the package own dist as OWN_DIST_MISSING_EXT', () => {
        const failure = {
            code: 'ERR_UNSUPPORTED_DIR_IMPORT',
            message: `Directory import '${pkgDir}/dist/sub' is not supported resolving ES modules imported from ${pkgDir}/dist/index.js`,
        };
        expect(classifyFailure(failure, pkgDir).status).toBe('OWN_DIST_MISSING_EXT');
    });

    it('classifies a non-resolution error as OTHER_ERR', () => {
        const failure = { code: 'ERR_REQUIRE_ESM', message: 'boom' };
        expect(classifyFailure(failure, pkgDir).status).toBe('OTHER_ERR');
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

    it('exits non-zero when the target contains zero type:module packages (verified nothing)', async () => {
        // A run that finds no packages must not report OK — that is false confidence
        // (e.g. invoked from the wrong directory or against a package-free path).
        // execFile rejects with a numeric .code on non-zero exit; resolves (no code) on 0.
        const emptyDir = join(FIXTURES, 'cjs-pkg'); // real dir, but its only package is CJS → zero type:module
        const result = await run(process.execPath, [SCRIPT, emptyDir]).catch((e) => e);
        expect(typeof result.code === 'number' && result.code > 0).toBe(true);
    });

    it('exits non-zero when packages exist but every one is NOT_BUILT (nothing actually imported)', async () => {
        // Running check:esm without a prior build leaves every entry NOT_BUILT; reporting
        // OK there is the same "verified nothing" false confidence as the empty case.
        const allUnbuilt = join(FIXTURES, 'not-built-pkg');
        const result = await run(process.execPath, [SCRIPT, allUnbuilt]).catch((e) => e);
        expect(typeof result.code === 'number' && result.code > 0).toBe(true);
    });
});
