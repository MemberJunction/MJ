/**
 * Native-ESM import guard (issue #3142).
 *
 * For every `packages/**` package with `"type": "module"`, resolves the published
 * entry point and imports it in a fresh native-ESM Node process. `tsc` +
 * bundler-based builds tolerate extensionless relative specifiers in dist/, but
 * Node's native ESM resolver rejects them at load time (ERR_MODULE_NOT_FOUND) —
 * this guard fails CI only on that own-dist signature, so the bug class caught
 * one-package-at-a-time in #3137/#3138 can't recur silently.
 */

import { readFileSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';

/** Per-package import timeout — a hanging top-level await must not stall CI. */
const IMPORT_TIMEOUT_MS = 60000;

/** Marker prefix the child process uses to hand structured failure data to the parent. */
const FAILURE_MARKER = '__ESM_GUARD_FAILURE__';

/**
 * Resolve a package's published ESM entry point from its package.json.
 * Precedence: exports["."].import → exports["."].default → exports (string) → main.
 * Returns the relative path string, or null when the package publishes no entry.
 *
 * Nested conditions (e.g. `{ import: { types, default } }`) are unwrapped one
 * level so a built package using that valid shape isn't misclassified NOT_BUILT.
 *
 * Known limitation (zero packages in the current fleet hit it): a package with
 * neither `exports` nor `main` returns null and is skipped as NOT_BUILT rather
 * than trying Node's implicit `index.js` default.
 */
export function resolveEntryPoint(pkgJson) {
    const exp = pkgJson.exports;
    if (typeof exp === 'string') return exp;
    const root = exp?.['.'];
    if (typeof root === 'string') return root;
    return unwrapCondition(root) ?? pkgJson.main ?? null;
}

/** Export conditions that select an entry for a Node ESM import (require/browser/types are not ours). */
const ESM_CONDITIONS = new Set(['import', 'node', 'module', 'default']);

/**
 * Resolve an export condition to a path string. A condition is either the path
 * directly (string) or a nested condition object (`{ import, node, default, ... }`),
 * possibly nested several levels deep. Mirrors Node's algorithm: iterate keys in
 * their declared order and take the first ESM-active condition that resolves to a
 * string, recursing into nested condition objects. Returns null when none match.
 * Recursion is safe: package.json exports are finite, acyclic JSON.
 */
function unwrapCondition(condition) {
    if (typeof condition === 'string') return condition;
    if (typeof condition === 'object' && condition !== null) {
        for (const [key, value] of Object.entries(condition)) {
            if (!ESM_CONDITIONS.has(key)) continue;
            const found = unwrapCondition(value);
            if (found) return found;
        }
    }
    return null;
}

/**
 * Import one package's entry point in a fresh native-ESM Node process and
 * classify the outcome: OK | OWN_DIST_MISSING_EXT | DEP_FAIL | OTHER_ERR | NOT_BUILT.
 * Only OWN_DIST_MISSING_EXT is a CI failure — it is the #3137 bug signature
 * (Node's resolver rejecting an extensionless specifier in the package's own dist/).
 *
 * Pass `pkgJson` when the caller already parsed the manifest (the sweep does, to
 * avoid re-reading every package.json); it's read from disk only when omitted.
 */
export async function checkPackage(pkgDir, pkgJson = null) {
    pkgJson ??= JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
    const name = pkgJson.name ?? pkgDir;
    const entry = resolveEntryPoint(pkgJson);
    if (!entry) {
        return { name, pkgDir, status: 'NOT_BUILT', detail: 'no entry point in exports/main' };
    }
    const entryPath = resolve(pkgDir, entry);
    if (!existsSync(entryPath)) {
        return { name, pkgDir, status: 'NOT_BUILT', detail: `entry ${entry} does not exist (not built?)` };
    }

    const failure = await importInFreshProcess(entryPath);
    if (!failure) {
        return { name, pkgDir, status: 'OK', detail: '' };
    }
    return { name, pkgDir, ...classifyFailure(failure, pkgDir) };
}

/**
 * Run `import(<entry>)` in a fresh `node --input-type=module` child process.
 * pathToFileURL keeps the specifier Windows-safe (a raw C:\ path throws
 * ERR_UNSUPPORTED_ESM_URL_SCHEME). Resolves to null on success, or to a
 * structured { code, message } failure.
 */
function importInFreshProcess(entryPath) {
    const url = pathToFileURL(entryPath).href;
    const childScript = [
        `import(${JSON.stringify(url)}).then(`,
        '  () => process.exit(0),',
        `  (e) => { console.error(${JSON.stringify(FAILURE_MARKER)} + JSON.stringify({ code: e.code ?? null, message: String(e.message ?? e) })); process.exit(1); }`,
        ');',
    ].join('\n');

    return new Promise((resolveResult) => {
        execFile(
            process.execPath,
            ['--input-type=module', '-e', childScript],
            { timeout: IMPORT_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
            (error, _stdout, stderr) => {
                if (!error) {
                    resolveResult(null);
                    return;
                }
                const markerLine = stderr.split('\n').find((l) => l.startsWith(FAILURE_MARKER));
                if (markerLine) {
                    try {
                        resolveResult(JSON.parse(markerLine.slice(FAILURE_MARKER.length)));
                        return;
                    } catch {
                        // fall through to the generic failure below — context preserved via stderr
                    }
                }
                // No structured marker: crash before the handler ran (syntax error,
                // OOM, timeout kill). Preserve whatever the child said.
                resolveResult({ code: error.killed ? 'TIMEOUT' : null, message: stderr.trim() || String(error) });
            }
        );
    });
}

/**
 * Classify a structured import failure relative to the package that owns the entry.
 * The gating signature is narrow: an EXTENSIONLESS relative specifier whose target
 * file exists WITH a JS module extension (`<missing>.js|.mjs|.cjs`) — the #3137
 * tsc-alias bug, where the build dropped the extension the resolver requires.
 * ERR_UNSUPPORTED_DIR_IMPORT is the same class (an extensionless specifier that
 * resolves to a directory). Everything else is non-gating: a genuinely-absent file
 * (no JS sibling — an ungenerated build/codegen artifact) is not this bug, and a
 * path elsewhere — or in the package's own nested node_modules, a third-party dep's
 * problem — is a dependency failure. `fileExists` is injectable for tests.
 *
 * Detecting "extensionless" from the path's own extension (`extname`) is wrong: a
 * dotted basename like `content.types` is extensionless yet has a non-empty extname,
 * so a real bug importing `./content.types` would slip through. Probing for the JS
 * sibling is dot-in-name-proof and matches the true signature exactly.
 */
export function classifyFailure(failure, pkgDir, { fileExists = existsSync } = {}) {
    const { code, message } = failure;
    if (code === 'ERR_MODULE_NOT_FOUND' || code === 'ERR_UNSUPPORTED_DIR_IMPORT') {
        const missing = extractMissingPath(message);
        const isExtensionlessSignature =
            code === 'ERR_UNSUPPORTED_DIR_IMPORT' || (missing != null && hasModuleSibling(missing, fileExists));
        // Node reports realpath'd paths in resolver errors, so realpath pkgDir too —
        // otherwise a symlinked package dir fails the startsWith and a real own-dist
        // break gets missed (fail-open). A node_modules segment in the missing path
        // means a nested dependency, never the host package's own dist.
        if (
            missing &&
            isExtensionlessSignature &&
            !isUnderNodeModules(resolve(missing)) &&
            resolve(missing).startsWith(realpathOr(pkgDir) + sep)
        ) {
            return { status: 'OWN_DIST_MISSING_EXT', detail: firstLine(message) };
        }
        return { status: 'DEP_FAIL', detail: firstLine(message) };
    }
    return { status: 'OTHER_ERR', detail: `[${code}] ${firstLine(message)}` };
}

/** True when `<missing>.js|.mjs|.cjs` exists — the tsc-alias signature: target present, extension dropped. */
function hasModuleSibling(missing, fileExists) {
    return ['.js', '.mjs', '.cjs'].some((ext) => fileExists(missing + ext));
}

/** True when any path segment is `node_modules` — i.e. the path is inside a dependency tree. */
function isUnderNodeModules(absPath) {
    return absPath.split(sep).includes('node_modules');
}

/** realpathSync(p), falling back to a plain resolve when the path can't be resolved. */
function realpathOr(p) {
    try {
        return realpathSync(resolve(p));
    } catch {
        return resolve(p);
    }
}

/** Parallel child-process import checks — keeps a ~200-package sweep to a couple of minutes. */
const CONCURRENCY = 8;

/**
 * Check every `"type": "module"` package under rootDir (skipping node_modules and
 * dist trees). Returns all results plus the gating subset: `failures` holds the
 * OWN_DIST_MISSING_EXT results — the only bucket that should fail CI.
 */
export async function sweep(rootDir) {
    const pkgs = findModulePackageDirs(rootDir);
    const results = [];
    let next = 0;
    async function worker() {
        while (next < pkgs.length) {
            const { dir, pkgJson } = pkgs[next++];
            results.push(await checkPackage(dir, pkgJson));
        }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pkgs.length) }, worker));
    return { results, failures: results.filter((r) => r.status === 'OWN_DIST_MISSING_EXT') };
}

/**
 * Recursively collect `{ dir, pkgJson }` for every directory whose package.json has
 * `"type": "module"`. The parsed manifest is handed to checkPackage so each
 * package.json is read and parsed exactly once per sweep.
 */
function findModulePackageDirs(dir, out = []) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
        try {
            const pkgJson = JSON.parse(readFileSync(pkgPath, 'utf8'));
            if (pkgJson.type === 'module') out.push({ dir, pkgJson });
        } catch (e) {
            console.warn(`esm-guard: skipping unparseable ${pkgPath}: ${e.message}`);
        }
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
        findModulePackageDirs(join(dir, entry.name), out);
    }
    return out;
}

/** Pull the unresolvable path/specifier out of a Node ESM resolver error message. */
function extractMissingPath(message) {
    const match = String(message).match(/(?:Cannot find (?:module|package)|Directory import) '([^']+)'/);
    return match ? match[1] : null;
}

function firstLine(text) {
    return String(text).split('\n')[0];
}

async function main() {
    const rootDir = resolve(process.argv[2] ?? 'packages');
    if (!existsSync(rootDir)) {
        console.error(`esm-guard: root directory not found: ${rootDir}`);
        process.exit(2);
    }
    console.log(`esm-guard: native-ESM-importing every "type": "module" package under ${rootDir} ...`);
    const { results, failures } = await sweep(rootDir);

    const counts = {};
    for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;

    // Reporting OK when nothing was actually imported is false confidence. This
    // happens two ways: no "type": "module" packages found at all (wrong directory /
    // package-free path), or packages exist but every entry is NOT_BUILT (check:esm
    // run without a prior build). Fail loudly in both cases instead of green-lighting.
    const importedCount = results.length - (counts.NOT_BUILT ?? 0);
    if (importedCount === 0) {
        const reason =
            results.length === 0
                ? `no "type": "module" packages found under ${rootDir}`
                : `all ${results.length} "type": "module" package(s) under ${rootDir} are NOT_BUILT`;
        console.error(`esm-guard: ${reason} — nothing verified. Run "npm run build" first, or pass a valid packages path.`);
        process.exit(2);
    }

    console.log(
        `esm-guard: checked ${results.length} packages — ` +
            Object.entries(counts).map(([status, n]) => `${status}: ${n}`).join(', ')
    );
    for (const r of results.filter((x) => x.status === 'DEP_FAIL' || x.status === 'OTHER_ERR')) {
        console.log(`  (non-gating) ${r.status} ${r.name}: ${r.detail}`);
    }

    if (failures.length > 0) {
        console.error(`\nesm-guard: FAIL — ${failures.length} package(s) ship dist/ that Node's native ESM resolver rejects`);
        console.error('(extensionless relative specifier — see issue #3137/#3142; the standard fix is `tsc && tsc-alias -f` or a NodeNext tsconfig)');
        for (const f of failures) {
            console.error(`  ✖ ${f.name} (${f.pkgDir}): ${f.detail}`);
        }
        process.exit(1);
    }
    console.log('esm-guard: OK — no extensionless-specifier breaks found');
}

// Run the sweep only when invoked directly as a CLI (not when imported by tests).
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    await main();
}
