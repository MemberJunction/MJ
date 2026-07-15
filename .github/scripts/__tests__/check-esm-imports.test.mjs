import { describe, it, expect, beforeAll } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
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

    it('resolves BARE top-level conditions (no "." key) to the ESM entry, not the CJS main', () => {
        // Node treats an exports object with no "."-prefixed key as the root condition set.
        // The dual-package shape @memberjunction/graphql-dataprovider ships: the guard must
        // check the .mjs consumers load, NOT the .cjs main (which can't exhibit the #3137 bug).
        const pkg = {
            main: './dist/index.cjs',
            exports: { require: { default: './dist/index.cjs' }, import: { default: './dist/index.mjs' } },
        };
        expect(resolveEntryPoint(pkg)).toBe('./dist/index.mjs');
    });

    it('resolves a fallback-array condition to its first usable string', () => {
        const pkg = { exports: { '.': { import: ['./dist/index.mjs', './dist/fallback.mjs'] } } };
        expect(resolveEntryPoint(pkg)).toBe('./dist/index.mjs');
    });

    it('ignores the bundler-only "module" condition Node does not honor', () => {
        // `module` is a webpack/tsup convention Node's ESM resolver ignores; selecting it
        // would check an entry Node never loads. import/default/main must win instead.
        expect(resolveEntryPoint({ exports: { '.': { module: './dist/module.js', import: './dist/index.js' } } })).toBe('./dist/index.js');
        expect(resolveEntryPoint({ main: './dist/main.js', exports: { '.': { module: './dist/module.js' } } })).toBe('./dist/main.js');
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

    it('gates a #3137 break in a SUBPATH export even when the root entry is clean', async () => {
        // Only checking the root barrel misses subpath dist files (exports["./sub"]) that
        // consumers import directly. A clean root must not mask a broken subpath.
        const dir = join(FIXTURES, 'subpath-pkg');
        let result;
        try {
            mkdirSync(join(dir, 'built'), { recursive: true });
            writeFileSync(
                join(dir, 'package.json'),
                JSON.stringify({
                    name: 'subpath-pkg',
                    type: 'module',
                    exports: { '.': './built/index.js', './sub': './built/sub.js' },
                })
            );
            writeFileSync(join(dir, 'built', 'index.js'), 'export const ok = 1;\n'); // clean root
            writeFileSync(join(dir, 'built', 'sub.js'), "export { deep } from './deep';\n"); // extensionless bug
            writeFileSync(join(dir, 'built', 'deep.js'), 'export const deep = 1;\n'); // sibling exists → #3137 signature
            result = await checkPackage(dir);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
        expect(result.status).toBe('OWN_DIST_MISSING_EXT');
    });

    it('gates a broken subpath even when the package has NO root entry (subpath-only exports)', async () => {
        // A subpath-only package (no "." key, no main) resolves to no root entry, but its
        // built subpath dist is real importable surface — a #3137 break there must still gate,
        // not silently classify NOT_BUILT.
        const dir = join(FIXTURES, 'subonly-pkg');
        let result;
        try {
            mkdirSync(join(dir, 'built'), { recursive: true });
            writeFileSync(
                join(dir, 'package.json'),
                JSON.stringify({ name: 'subonly-pkg', type: 'module', exports: { './plugin': './built/plugin.js' } })
            );
            writeFileSync(join(dir, 'built', 'plugin.js'), "export { helper } from './helper';\n"); // extensionless bug
            writeFileSync(join(dir, 'built', 'helper.js'), 'export const helper = 1;\n'); // sibling → #3137 signature
            result = await checkPackage(dir);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
        expect(result.status).toBe('OWN_DIST_MISSING_EXT');
    });

    it('gates a #3137 break in a WILDCARD subpath export (e.g. oclif ./commands/*)', async () => {
        // db-auto-doc exports "./dist/commands/*" for dynamically-loaded oclif command files
        // the root barrel never re-exports. A single-star pattern must expand and check each.
        const dir = join(FIXTURES, 'wildcard-pkg');
        let result;
        try {
            mkdirSync(join(dir, 'built', 'commands'), { recursive: true });
            writeFileSync(
                join(dir, 'package.json'),
                JSON.stringify({
                    name: 'wildcard-pkg',
                    type: 'module',
                    exports: { '.': './built/index.js', './commands/*': './built/commands/*.js' },
                })
            );
            writeFileSync(join(dir, 'built', 'index.js'), 'export const ok = 1;\n'); // clean root barrel
            writeFileSync(join(dir, 'built', 'commands', 'analyze.js'), "export { run } from './core';\n"); // extensionless bug
            writeFileSync(join(dir, 'built', 'commands', 'core.js'), 'export const run = 1;\n'); // sibling → #3137 signature
            result = await checkPackage(dir);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
        expect(result.status).toBe('OWN_DIST_MISSING_EXT');
    });

    it('classifies a module that throws at import as OTHER_ERR (non-gating), not a bug', async () => {
        const dir = join(FIXTURES, 'throw-pkg');
        let result;
        try {
            mkdirSync(join(dir, 'built'), { recursive: true });
            writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'throw-pkg', type: 'module', main: 'built/index.js' }));
            writeFileSync(join(dir, 'built', 'index.js'), 'throw new Error("boom at import");\n');
            result = await checkPackage(dir);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
        expect(result.status).toBe('OTHER_ERR');
    });

    it('bounds a hanging import via the timeout and classifies it OTHER_ERR (CI-hang protection)', async () => {
        // Entry keeps the event loop alive (setInterval) AND blocks import() forever, so
        // only the timeout can reclaim it. A bare `await new Promise(()=>{})` would exit
        // clean on Node 24 (no live handle) — the interval is what makes it truly hang.
        const dir = join(FIXTURES, 'hang-pkg');
        let result;
        try {
            mkdirSync(join(dir, 'built'), { recursive: true });
            writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'hang-pkg', type: 'module', main: 'built/index.js' }));
            writeFileSync(join(dir, 'built', 'index.js'), 'setInterval(() => {}, 100000);\nawait new Promise(() => {});\n');
            result = await checkPackage(dir, null, { timeoutMs: 500 });
        } finally {
            rmSync(dir, { recursive: true, force: true }); // never leak the hang fixture, even on assertion/timeout failure
        }
        expect(result.status).toBe('OTHER_ERR');
        expect(result.detail).toContain('TIMEOUT');
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
        // Inject an EXISTING JS sibling for the missing path so hasModuleSibling is true — this
        // forces the isUnderNodeModules exclusion to be the ONLY reason the result is DEP_FAIL
        // (otherwise the test passes vacuously because the sibling doesn't exist).
        const failure = {
            code: 'ERR_MODULE_NOT_FOUND',
            message: `Cannot find module '${pkgDir}/node_modules/brokendep/missing-thing' imported from ${pkgDir}/node_modules/brokendep/index.js`,
        };
        const sib = siblingsExist(`${pkgDir}/node_modules/brokendep/missing-thing.js`);
        expect(classifyFailure(failure, pkgDir, sib).status).toBe('DEP_FAIL');
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

    it('does not gate an already-extensioned missing import even if a doubled-extension sibling exists', () => {
        // ./foo.js genuinely absent is a DEP_FAIL; a stray foo.js.js must not be read as the
        // extensionless signature (the specifier already carries its extension).
        const failure = {
            code: 'ERR_MODULE_NOT_FOUND',
            message: `Cannot find module '${pkgDir}/dist/foo.js' imported from ${pkgDir}/dist/index.js`,
        };
        const siblingExists = { fileExists: (p) => p === `${pkgDir}/dist/foo.js.js` };
        expect(classifyFailure(failure, pkgDir, siblingExists).status).toBe('DEP_FAIL');
    });

    it('classifies a directory import in the package own dist as OWN_DIST_MISSING_EXT', () => {
        const failure = {
            code: 'ERR_UNSUPPORTED_DIR_IMPORT',
            message: `Directory import '${pkgDir}/dist/sub' is not supported resolving ES modules imported from ${pkgDir}/dist/index.js`,
        };
        expect(classifyFailure(failure, pkgDir).status).toBe('OWN_DIST_MISSING_EXT');
    });

    it('gates when the dropped-extension sibling is .mjs or .cjs (not only .js)', () => {
        for (const ext of ['.mjs', '.cjs']) {
            const failure = {
                code: 'ERR_MODULE_NOT_FOUND',
                message: `Cannot find module '${pkgDir}/dist/mod' imported from ${pkgDir}/dist/index.js`,
            };
            const sib = { fileExists: (p) => p === `${pkgDir}/dist/mod${ext}` };
            expect(classifyFailure(failure, pkgDir, sib).status).toBe('OWN_DIST_MISSING_EXT');
        }
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

    it('exits 2 when the target contains zero type:module packages (misconfiguration / wrong path)', async () => {
        // Finding zero packages means a genuinely wrong path or misconfiguration — fail hard.
        const emptyDir = join(FIXTURES, 'cjs-pkg'); // real dir, but its only package is CJS → zero type:module
        const result = await run(process.execPath, [SCRIPT, emptyDir]).catch((e) => e);
        expect(result.code).toBe(2);
        expect(result.stderr).toContain('no "type": "module" packages');
    });

    it('warns but exits 0 when packages exist yet every one is NOT_BUILT (legitimate in affected-PR CI)', async () => {
        // In a turbo affected-PR build only the changed subset is built, so a sweep of the
        // whole tree is legitimately all-NOT_BUILT — that must NOT red an innocent PR. But it
        // must warn (not print the misleading "OK — no breaks found"), so nothing is silently
        // reported as verified when it wasn't.
        const allUnbuilt = join(FIXTURES, 'not-built-pkg');
        const result = await run(process.execPath, [SCRIPT, allUnbuilt]).catch((e) => e);
        expect(result.code ?? 0).toBe(0);
        expect(result.stderr).toContain('NOT_BUILT');
        expect(result.stdout).not.toContain('OK — no extensionless-specifier breaks found');
    });
});
