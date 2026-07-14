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

import { readFileSync, readdirSync, existsSync } from 'node:fs';
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
 */
export function resolveEntryPoint(pkgJson) {
    const exp = pkgJson.exports;
    if (typeof exp === 'string') return exp;
    const root = exp?.['.'];
    if (typeof root === 'string') return root;
    if (typeof root === 'object' && root !== null) {
        if (typeof root.import === 'string') return root.import;
        if (typeof root.default === 'string') return root.default;
    }
    return pkgJson.main ?? null;
}

/**
 * Import one package's entry point in a fresh native-ESM Node process and
 * classify the outcome: OK | OWN_DIST_MISSING_EXT | DEP_FAIL | OTHER_ERR | NOT_BUILT.
 * Only OWN_DIST_MISSING_EXT is a CI failure — it is the #3137 bug signature
 * (Node's resolver rejecting an extensionless specifier in the package's own dist/).
 */
export async function checkPackage(pkgDir) {
    const pkgJson = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
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
 * A resolution failure whose missing path lies inside the package's own directory is
 * the extensionless-specifier signature (fails CI); one pointing elsewhere is a
 * dependency problem (reported, non-gating). ERR_UNSUPPORTED_DIR_IMPORT is the same
 * bug class — an extensionless specifier that happens to resolve to a directory.
 */
export function classifyFailure(failure, pkgDir) {
    const { code, message } = failure;
    if (code === 'ERR_MODULE_NOT_FOUND' || code === 'ERR_UNSUPPORTED_DIR_IMPORT') {
        const missing = extractMissingPath(message);
        if (missing && resolve(missing).startsWith(resolve(pkgDir) + sep)) {
            return { status: 'OWN_DIST_MISSING_EXT', detail: firstLine(message) };
        }
        return { status: 'DEP_FAIL', detail: firstLine(message) };
    }
    return { status: 'OTHER_ERR', detail: `[${code}] ${firstLine(message)}` };
}

/** Parallel child-process import checks — keeps a ~200-package sweep to a couple of minutes. */
const CONCURRENCY = 8;

/**
 * Check every `"type": "module"` package under rootDir (skipping node_modules and
 * dist trees). Returns all results plus the gating subset: `failures` holds the
 * OWN_DIST_MISSING_EXT results — the only bucket that should fail CI.
 */
export async function sweep(rootDir) {
    const pkgDirs = findModulePackageDirs(rootDir);
    const results = [];
    let next = 0;
    async function worker() {
        while (next < pkgDirs.length) {
            const dir = pkgDirs[next++];
            results.push(await checkPackage(dir));
        }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pkgDirs.length) }, worker));
    return { results, failures: results.filter((r) => r.status === 'OWN_DIST_MISSING_EXT') };
}

/** Recursively collect directories containing a package.json with `"type": "module"`. */
function findModulePackageDirs(dir, out = []) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
        try {
            if (JSON.parse(readFileSync(pkgPath, 'utf8')).type === 'module') out.push(dir);
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
