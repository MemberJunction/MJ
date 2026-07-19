#!/usr/bin/env node
/**
 * CI gate: the pre-built class manifests must be loadable in a plain Node process.
 *
 * WHAT THIS GUARDS
 * ----------------
 * `@memberjunction/ng-bootstrap` and `@memberjunction/ng-bootstrap-lite` ship a
 * generated manifest that named-imports every `@RegisterClass` class so bundlers
 * cannot tree-shake the ClassFactory registrations away. Because those are NAMED
 * imports, any registered class its owning package fails to export makes the
 * manifest unloadable outside a bundler:
 *
 *     SyntaxError: The requested module '@memberjunction/x'
 *                  does not provide an export named 'Y'
 *
 * A bundler resolves that at build time and hides it. Plain Node does not. This
 * gate is the durable proof that the manifests stay importable by a non-bundled
 * consumer — the companion runtime check to the static
 * check-registerclass-exports.mjs invariant.
 *
 * WHY `@angular/compiler` IS IMPORTED FIRST (do not delete it as "unused")
 * -----------------------------------------------------------------------
 * The manifests pull in Angular libraries built for JIT. Without `@angular/compiler`
 * loaded first, the very first Angular injectable aborts the import with:
 *
 *     The injectable 'PlatformLocation' needs to be compiled using the JIT
 *     compiler, but '@angular/compiler' is not available.
 *
 * That failure happens on both the ESM and CJS paths and has nothing to do with
 * exports — i.e. it would mask the exact bug class this gate exists to catch.
 * Importing the compiler first clears it so a real export error can surface.
 *
 * CURRENT STATUS — see PR discussion
 * ----------------------------------
 * On `next` this gate does NOT yet pass, for a reason unrelated to the export
 * invariant: 83 packages emit EXTENSIONLESS relative specifiers into their dist
 * (`export * from './lib/foo'` with no `.js`), which Node's native ESM resolver
 * rejects with ERR_MODULE_NOT_FOUND. This is the #3137/#3142 bug class that
 * check-esm-imports.mjs already gates for `"type": "module"` packages, and which
 * that guard explicitly documents as out of scope for ng-packagr Angular
 * libraries. Fixing it is a build-configuration change across those packages
 * (tsc-alias / NodeNext), deliberately NOT bundled into this PR.
 *
 * Until then this script is runnable on demand (`npm run check:manifests`) and
 * reports precisely which layer is failing, but is not wired as a blocking CI
 * gate — a gate that cannot go green is noise, not signal.
 *
 * Usage:
 *   node .github/scripts/check-manifest-loadability.mjs
 *   node .github/scripts/check-manifest-loadability.mjs --json
 */

import { execFile } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const MANIFEST_PACKAGES = ['@memberjunction/ng-bootstrap', '@memberjunction/ng-bootstrap-lite'];

/** Per-import timeout — a hanging top-level await must not stall CI. */
const IMPORT_TIMEOUT_MS = 120000;

const MARKER = '__MANIFEST_GATE__';

/**
 * Import one manifest package in a FRESH Node process and report the outcome.
 * A fresh process per package matters: module state (and the Angular JIT
 * registration) must not leak between the two, or the second import could pass
 * only because the first already warmed something up.
 *
 * The child is spawned with cwd = REPO_ROOT so bare specifiers resolve through
 * the workspace's node_modules.
 */
function importManifest(pkg) {
    const childScript = `
        // Load the JIT compiler first — see the header comment. Without it the
        // Angular libraries in the manifest abort before any export is evaluated.
        await import('@angular/compiler');
        const m = await import(${JSON.stringify(pkg)});
        const regs = m.CLASS_REGISTRATIONS;
        console.log(${JSON.stringify(MARKER)} + JSON.stringify({
            ok: true,
            count: Array.isArray(regs) ? regs.length : null,
            hasExport: regs !== undefined,
        }));
    `;

    return new Promise((resolveResult) => {
        execFile(
            process.execPath,
            ['--input-type=module', '-e', childScript],
            { cwd: REPO_ROOT, timeout: IMPORT_TIMEOUT_MS, killSignal: 'SIGKILL', maxBuffer: 10 * 1024 * 1024 },
            (error, stdout, stderr) => {
                const line = stdout.split('\n').find((l) => l.startsWith(MARKER));
                if (line && !error) {
                    try {
                        resolveResult({ pkg, ...JSON.parse(line.slice(MARKER.length)) });
                        return;
                    } catch {
                        /* fall through to failure reporting */
                    }
                }
                resolveResult({
                    pkg,
                    ok: false,
                    code: classifyError(stderr),
                    detail: firstMeaningfulLine(stderr) || String(error),
                });
            }
        );
    });
}

/**
 * Bucket the failure so the operator knows WHICH problem they are looking at —
 * the export invariant this gate exists for, or one of the two unrelated
 * blockers that can mask it.
 */
function classifyError(stderr) {
    if (/does not provide an export named/.test(stderr)) return 'MISSING_EXPORT';
    if (/needs to be compiled using the JIT compiler/.test(stderr)) return 'ANGULAR_JIT';
    if (/ERR_MODULE_NOT_FOUND|Cannot find module/.test(stderr)) return 'EXTENSIONLESS_SPECIFIER';
    if (/is not defined/.test(stderr)) return 'DOM_GLOBAL';
    return 'OTHER';
}

const EXPLANATIONS = {
    MISSING_EXPORT:
        'A registered class is not exported by its package — THE bug this gate exists to catch.\n' +
        '      Run `npm run check:registerclass` to get the full list with prescribed fixes.',
    ANGULAR_JIT:
        '@angular/compiler was not loaded before the manifest. This script imports it first;\n' +
        '      if you see this, that import was removed or failed to resolve.',
    EXTENSIONLESS_SPECIFIER:
        "A package's own dist/ uses an extensionless relative specifier, which Node's native ESM\n" +
        '      resolver rejects (issue #3137/#3142). This is a BUILD-CONFIG problem (tsc-alias /\n' +
        '      NodeNext) in the named package, not an export problem. 83 packages currently do this.',
    DOM_GLOBAL:
        'A package touches a DOM global (document/window) at module scope, which does not exist in\n' +
        '      plain Node. Needs a decision: jsdom shim vs. documented exclusion.',
    OTHER: 'Unrecognized failure — read the detail line.',
};

/**
 * Pull the line that actually names the problem out of a Node stderr dump.
 * Node prints the offending internal frame FIRST (`node:internal/modules/...`),
 * so naively taking the first non-noise line reports a frame instead of the
 * error. Prefer a line matching a known error signature; fall back to the first
 * line that isn't a frame or a warning.
 */
const ERROR_SIGNATURES = [
    /does not provide an export named/,
    /Cannot find module/,
    /needs to be compiled using the JIT compiler/,
    /is not defined/,
    /^[A-Za-z]*Error:/,
];

function firstMeaningfulLine(stderr) {
    const lines = String(stderr)
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    for (const sig of ERROR_SIGNATURES) {
        const hit = lines.find((l) => sig.test(l));
        if (hit) return hit;
    }
    return (
        lines.find(
            (l) =>
                !l.startsWith('(node:') &&
                !l.startsWith('at ') &&
                !l.startsWith('node:internal') &&
                !l.startsWith('Warning:')
        ) ?? ''
    );
}

async function main() {
    const asJson = process.argv.includes('--json');
    const results = [];
    for (const pkg of MANIFEST_PACKAGES) results.push(await importManifest(pkg));

    if (asJson) {
        console.log(JSON.stringify({ results }, null, 2));
    } else {
        console.log('manifest-gate: importing pre-built class manifests in fresh Node processes ...\n');
        for (const r of results) {
            if (r.ok) {
                console.log(`  ✔ ${r.pkg}`);
                console.log(`      CLASS_REGISTRATIONS.length = ${r.count}`);
            } else {
                console.log(`  ✖ ${r.pkg}  [${r.code}]`);
                console.log(`      ${r.detail}`);
                console.log(`      → ${EXPLANATIONS[r.code] ?? EXPLANATIONS.OTHER}`);
            }
            console.log('');
        }
        const failed = results.filter((r) => !r.ok);
        console.log('─────────────────────────────────────────');
        console.log(`manifest loadability: ${results.length - failed.length}/${results.length} manifests import cleanly`);
        console.log('─────────────────────────────────────────');
    }

    process.exit(results.every((r) => r.ok) ? 0 : 1);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    await main();
}

export { importManifest, classifyError };
