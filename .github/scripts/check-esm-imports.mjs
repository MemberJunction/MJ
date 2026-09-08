/**
 * Native-ESM import guard (issue #3142).
 *
 * For every `packages/**` package with `"type": "module"`, resolves the published
 * entry point and imports it in a fresh native-ESM Node process. `tsc` +
 * bundler-based builds tolerate extensionless relative specifiers in dist/, but
 * Node's native ESM resolver rejects them at load time (ERR_MODULE_NOT_FOUND) —
 * this guard fails CI only on that own-dist signature, so the bug class caught
 * one-package-at-a-time in #3137/#3138 can't recur silently.
 *
 * SCOPE (by design): only `"type": "module"` packages are swept. A break that lives
 * in a NON-type:module sibling (e.g. an Angular ng-packagr library) surfaces — through
 * a type:module consumer that imports it — as a non-gating DEP_FAIL, not a gating
 * failure, because the missing path is another package's dist, not the checked
 * package's own. Those libraries are consumed by bundlers (Angular/esbuild/webpack)
 * that tolerate extensionless specifiers and are never imported by native Node, so the
 * break is real for a native-ESM consumer but inert for their actual consumers. The
 * DEP_FAIL is printed so it stays visible; fixing it belongs in the owning package.
 *
 * USAGE
 *   node check-esm-imports.mjs [packagesDir] [--changed-since <gitRef>]
 *
 * `--changed-since` narrows the sweep to packages whose OWN source changed against the ref —
 * the PR mode. The full sweep spawns a fresh node process per package (~3s each, ~11 minutes
 * for the ~220 type:module packages in this repo) and re-imports on every PR the ~215 packages
 * that provably cannot have gained the break: the signature lives in a package's own emitted
 * dist/, and an untouched source recompiles identically even when a dependency change forces a
 * rebuild. The push/nightly backstop runs UNSCOPED and covers the residue (a build-tool or
 * tsconfig change that shifts emit repo-wide).
 *
 * If the diff cannot be computed — unknown ref, shallow clone, no git — the guard widens back
 * to the FULL sweep rather than narrowing to nothing. A guard that silently checks zero
 * packages and prints a pass is worse than one that costs eleven minutes.
 */

import { readFileSync, readdirSync, existsSync, realpathSync, statSync } from 'node:fs';
import { join, resolve, sep, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile, execFileSync } from 'node:child_process';

/** Per-package import timeout — a hanging top-level await must not stall CI. */
const IMPORT_TIMEOUT_MS = 60000;

/** Marker prefix the child process uses to hand structured failure data to the parent. */
const FAILURE_MARKER = '__ESM_GUARD_FAILURE__';

/**
 * Resolve a package's published ESM entry point from its package.json.
 * Precedence: the root `exports` condition set (subpath-map "." OR a bare
 * top-level condition object) resolved for a Node ESM import → `main`.
 * Returns the relative path string, or null when the package publishes no entry.
 *
 * Handles the shapes Node's resolver actually honors: string exports, a "."
 * subpath map, a BARE top-level condition set (no "."-prefixed key — Node applies
 * the whole object as the "." conditions; the standard dual CJS/ESM shape), nested
 * conditions to any depth, and fallback arrays.
 *
 * This resolves the ROOT ("." / bare-conditions / main) entry. Subpath exports are
 * checked separately by checkPackage via collectSubpathEntryPaths. A package with
 * neither `exports` nor `main` returns null and is skipped as NOT_BUILT rather than
 * trying Node's implicit `index.js` default.
 */
export function resolveEntryPoint(pkgJson) {
    const exp = pkgJson.exports;
    if (typeof exp === 'string') return exp;
    return unwrapCondition(selectRootExport(exp)) ?? pkgJson.main ?? null;
}

/**
 * Pick the root export node from the `exports` field. Node's rule: an object with
 * NO "."-prefixed key is itself the "." condition set; otherwise the root lives at
 * the "." key. A top-level array is a fallback list for the root.
 */
function selectRootExport(exp) {
    if (Array.isArray(exp)) return exp;
    if (typeof exp === 'object' && exp !== null) {
        return Object.keys(exp).some((k) => k.startsWith('.')) ? exp['.'] : exp;
    }
    return undefined;
}

/** Export conditions that select an entry for a Node ESM import (require/browser/types are not honored). */
const ESM_CONDITIONS = new Set(['import', 'node', 'default']);

/**
 * Resolve an export condition to a path string. A condition is a path (string), a
 * nested condition object (`{ import, node, default, ... }`) to any depth, or a
 * fallback array. Mirrors Node's algorithm: for objects, iterate keys in declared
 * order and take the first ESM-active condition that resolves; for arrays, take the
 * first element that resolves. Returns null when none match. Recursion is safe:
 * package.json exports are finite, acyclic JSON.
 */
function unwrapCondition(condition) {
    if (typeof condition === 'string') return condition;
    if (Array.isArray(condition)) {
        for (const element of condition) {
            const found = unwrapCondition(element);
            if (found) return found;
        }
        return null;
    }
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
 * `timeoutMs` bounds the child import (default IMPORT_TIMEOUT_MS); injectable for tests.
 */
export async function checkPackage(pkgDir, pkgJson = null, { timeoutMs = IMPORT_TIMEOUT_MS } = {}) {
    pkgJson ??= JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
    const name = pkgJson.name ?? pkgDir;

    // Build the set of concrete, existing entry points: the root entry (".", bare
    // conditions, or main) plus every concrete subpath export. Both are import-checked —
    // a #3137 break in a subpath dist file (exports["./sub"]) breaks consumers of that
    // subpath and would otherwise ship green. This union is computed BEFORE the NOT_BUILT
    // decision so a subpath-only package (no root) or a package with an unbuilt root but a
    // built subpath still has its real importable surface checked.
    const entry = resolveEntryPoint(pkgJson);
    const rootPath = entry ? resolve(pkgDir, entry) : null;
    const rootExists = rootPath != null && existsSync(rootPath);
    const subEntries = collectSubpathEntryPaths(pkgJson, pkgDir).filter((p) => p !== rootPath && existsSync(p));
    const entries = [...(rootExists ? [rootPath] : []), ...subEntries];

    if (entries.length === 0) {
        const detail = entry ? `entry ${entry} does not exist (not built?)` : 'no entry point in exports/main';
        return { name, pkgDir, status: 'NOT_BUILT', detail };
    }

    // A gating break in ANY entry gates the package; otherwise the first entry's status
    // stands (a side-effecting subpath's non-gating error doesn't muddy a clean root).
    const results = [];
    for (const p of entries) {
        const failure = await importInFreshProcess(p, timeoutMs);
        results.push(failure ? classifyFailure(failure, pkgDir) : { status: 'OK', detail: '' });
    }
    const gating = results.find((r) => r.status === 'OWN_DIST_MISSING_EXT');
    return { name, pkgDir, ...(gating ?? results[0]) };
}

/**
 * Resolve every concrete subpath export (`exports["./sub"]`) to an absolute path.
 * Skips the root "." and non-JS targets (e.g. "./package.json"). A single-star
 * pattern (`"./commands/*": "./dist/commands/*.js"` — e.g. oclif command files
 * loaded dynamically and never statically re-exported by the root) is expanded by
 * globbing the target directory, so those files are import-checked too.
 */
function collectSubpathEntryPaths(pkgJson, pkgDir) {
    const exp = pkgJson.exports;
    if (typeof exp !== 'object' || exp === null || Array.isArray(exp)) return [];
    const paths = [];
    for (const [key, value] of Object.entries(exp)) {
        if (!key.startsWith('./') || key === '.') continue; // subpaths only; "." handled above
        const target = unwrapCondition(value);
        if (typeof target !== 'string') continue;
        if (target.includes('*')) {
            paths.push(...expandStarTarget(target, pkgDir));
        } else if (MODULE_EXTS.some((ext) => target.endsWith(ext))) {
            paths.push(resolve(pkgDir, target));
        }
    }
    return paths;
}

/**
 * Expand a single-star export target (`./dist/commands/*.js`, `./dist/cmd-*.js`) to the
 * absolute paths of the JS module FILES it matches. Node's `*` spans path separators, so
 * this walks the scan directory recursively and matches on the target's literal prefix
 * AND suffix around the star — honoring `cmd-*` (not just `*`), skipping directories that
 * happen to match the pattern (a dir-import would false-positive gate), and including
 * nested files. Only a lone `*` is supported; `**`/multi-star targets are skipped as too broad.
 */
function expandStarTarget(target, pkgDir) {
    if ((target.match(/\*/g) ?? []).length !== 1) return [];
    const starIdx = target.indexOf('*');
    const rawPrefix = target.slice(0, starIdx); // e.g. "./dist/commands/" or "./dist/cmd-"
    const suffix = target.slice(starIdx + 1); // e.g. ".js"
    if (!MODULE_EXTS.some((ext) => suffix.endsWith(ext))) return []; // only import-checkable targets
    const absPrefix = resolve(pkgDir, rawPrefix);
    // The star boundary: a trailing "/" means any file under the dir; otherwise a literal
    // basename prefix (cmd-). scanRoot is the deepest real directory to walk from.
    const boundary = rawPrefix.endsWith('/') ? absPrefix + sep : absPrefix;
    const scanRoot = rawPrefix.endsWith('/') ? absPrefix : dirname(absPrefix);
    if (!existsSync(scanRoot)) return [];
    return walkFiles(scanRoot).filter((f) => f.startsWith(boundary) && f.endsWith(suffix));
}

/**
 * Recursively collect absolute paths of regular files under dir. Directories and
 * symlinked dirs are not descended (Dirent.isDirectory() is false for symlinks, so no
 * cycles). `node_modules` and dot-directories are skipped — an export target never maps
 * into a package's own node_modules, and walking it under a broad wildcard (`./*`) would
 * spawn a child import per dependency file. A non-directory dir (malformed export whose
 * scanRoot is a file) degrades to `[]` instead of throwing ENOTDIR and reddening CI.
 */
function walkFiles(dir, out = []) {
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return out; // ENOTDIR / EACCES on a malformed or unreadable scanRoot → skip, don't crash
    }
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
            walkFiles(join(dir, entry.name), out);
        } else if (entry.isFile()) {
            out.push(join(dir, entry.name));
        }
    }
    return out;
}

/**
 * Run `import(<entry>)` in a fresh `node --input-type=module` child process.
 * pathToFileURL keeps the specifier Windows-safe (a raw C:\ path throws
 * ERR_UNSUPPORTED_ESM_URL_SCHEME). Resolves to null on success, or to a
 * structured { code, message } failure.
 *
 * killSignal is SIGKILL (not the default SIGTERM): a scanned entry with a
 * graceful-shutdown SIGTERM trap plus a live handle could otherwise ignore the
 * timeout and hang CI to the job cap. SIGKILL is uncatchable, so the timeout can
 * always reclaim the child.
 */
function importInFreshProcess(entryPath, timeoutMs = IMPORT_TIMEOUT_MS) {
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
            { timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 10 * 1024 * 1024 },
            (error, _stdout, stderr) => {
                if (!error) {
                    resolveResult(null);
                    return;
                }
                const markerLine = stderr.split('\n').findLast((l) => l.startsWith(FAILURE_MARKER));
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

const MODULE_EXTS = ['.js', '.mjs', '.cjs'];

/**
 * True when `<missing>.js|.mjs|.cjs` exists — the tsc-alias signature: target present,
 * extension dropped. A specifier that ALREADY ends in a module extension can't be the
 * extensionless bug, so it never qualifies (guards against a stray `foo.js.js` sibling
 * misclassifying a genuinely-absent `./foo.js` as the signature).
 */
function hasModuleSibling(missing, fileExists) {
    if (MODULE_EXTS.some((ext) => missing.endsWith(ext))) return false;
    return MODULE_EXTS.some((ext) => fileExists(missing + ext));
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
 *
 * `onlyDirs`, when given, restricts the sweep to those package directories (see
 * changedPackageDirs). A null/absent set means the full sweep.
 */
export async function sweep(rootDir, { onlyDirs = null } = {}) {
    let pkgs = findModulePackageDirs(rootDir);
    if (onlyDirs) {
        const wanted = new Set([...onlyDirs].map((d) => resolve(d)));
        pkgs = pkgs.filter((p) => wanted.has(resolve(p.dir)));
    }
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
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return out; // unreadable dir (ENOTDIR/EACCES) → skip, don't crash the sweep (mirrors walkFiles)
    }
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
        findModulePackageDirs(join(dir, entry.name), out);
    }
    return out;
}

/**
 * Walk up from a repo-relative changed file to the directory of the package that owns it —
 * the nearest ancestor containing a package.json, bounded by rootDir. Returns null when the
 * file lives outside rootDir or under no package at all.
 *
 * `dirHasManifest` is injectable so the unit tests can describe a tree without touching disk.
 */
export function packageDirForFile(relPath, rootDir, { dirHasManifest = (d) => existsSync(join(d, 'package.json')) } = {}) {
    const root = resolve(rootDir);
    let dir = dirname(resolve(relPath));
    // Only files inside rootDir can belong to a swept package.
    if (dir !== root && !dir.startsWith(root + sep)) return null;
    while (dir === root || dir.startsWith(root + sep)) {
        if (dirHasManifest(dir)) return dir;
        const parent = dirname(dir);
        if (parent === dir) break; // filesystem root — stop
        dir = parent;
    }
    return null;
}

/**
 * Map the lines of a `git diff --name-only` output to the set of package directories that own
 * them. Pure: takes the diff text, so it is unit-testable without a git repo.
 */
export function changedPackageDirs(diffOutput, rootDir, opts = {}) {
    const dirs = new Set();
    for (const line of String(diffOutput).split('\n')) {
        const file = line.trim();
        if (!file) continue;
        const dir = packageDirForFile(file, rootDir, opts);
        if (dir) dirs.add(dir);
    }
    return dirs;
}

/**
 * Resolve the package directories touched since `baseRef`.
 *
 * Returns null — meaning "fall back to the FULL sweep" — when the diff cannot be computed
 * (unknown ref, shallow clone with no merge base, git absent). That direction is deliberate:
 * a guard that silently narrows its scope to nothing after a git error would report a
 * confident pass over code it never imported. Failing open costs minutes; failing closed
 * costs the guard's entire reason to exist.
 */
export function changedPackageDirsSince(baseRef, rootDir, { run = defaultGitDiff } = {}) {
    let out;
    try {
        out = run(baseRef);
    } catch (e) {
        console.warn(`esm-guard: cannot diff against '${baseRef}' (${firstLine(e.message ?? e)}) — falling back to the FULL sweep.`);
        return null;
    }
    return changedPackageDirs(out, rootDir);
}

/** `git diff --name-only <base>...HEAD`, renames off (name-only needs no blob contents). */
function defaultGitDiff(baseRef) {
    return execFileSync('git', ['diff', '--name-only', '--no-renames', `${baseRef}...HEAD`], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
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
    // `--changed-since <ref>` narrows the sweep to packages whose own source changed. Everything
    // else is positional, so pull the flag out before reading argv[2] as the root directory.
    const argv = process.argv.slice(2);
    const flagIdx = argv.findIndex((a) => a === '--changed-since' || a.startsWith('--changed-since='));
    let changedSince = null;
    if (flagIdx !== -1) {
        const raw = argv[flagIdx];
        changedSince = raw.includes('=') ? raw.slice(raw.indexOf('=') + 1) : argv[flagIdx + 1];
        argv.splice(flagIdx, raw.includes('=') ? 1 : 2);
        if (!changedSince) {
            console.error('esm-guard: --changed-since needs a git ref (e.g. --changed-since origin/next)');
            process.exit(2);
        }
    }

    const rootDir = resolve(argv[0] ?? 'packages');
    if (!existsSync(rootDir)) {
        console.error(`esm-guard: root directory not found: ${rootDir}`);
        process.exit(2);
    }
    // A file (or non-directory) arg would otherwise crash the sweep with an unhandled
    // ENOTDIR at exit 1 — the same exit code a real gating failure uses. Route operator
    // error to the clean exit-2 misconfiguration path instead.
    if (!statSync(rootDir).isDirectory()) {
        console.error(`esm-guard: ${rootDir} is not a directory — pass a directory to sweep (e.g. "packages").`);
        process.exit(2);
    }
    // Scoped mode (PR runs): only a package whose OWN source changed can newly ship the
    // extensionless-specifier signature this guard hunts — the break lives in a package's own
    // emitted dist/, and an untouched source recompiles to identical output even when a
    // dependency change forces it to rebuild. So the full ~220-package sweep on every PR
    // re-imports ~215 packages that provably cannot have changed. The push/nightly backstop
    // still sweeps everything, which is what covers the residue (a build-tool or tsconfig
    // change that alters emit repo-wide reaches the guard there, and root/global changes make
    // the workflow request a full sweep anyway).
    let onlyDirs = null;
    if (changedSince) {
        onlyDirs = changedPackageDirsSince(changedSince, rootDir);
        if (onlyDirs) {
            if (onlyDirs.size === 0) {
                console.log(`esm-guard: no package sources changed since ${changedSince} — nothing to check.`);
                return;
            }
            console.log(`esm-guard: scoped to ${onlyDirs.size} package(s) changed since ${changedSince}.`);
        }
    }

    console.log(
        onlyDirs
            ? `esm-guard: native-ESM-importing the changed "type": "module" packages under ${rootDir} ...`
            : `esm-guard: native-ESM-importing every "type": "module" package under ${rootDir} ...`
    );
    const { results, failures } = await sweep(rootDir, { onlyDirs });

    const counts = {};
    for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;

    // Zero results in SCOPED mode is benign — the changed packages simply aren't type:module
    // (a .scss-only or Angular-library change). Say so and pass; the hard error below is for
    // the unscoped sweep, where finding nothing means a wrong path / misconfiguration.
    if (results.length === 0 && onlyDirs) {
        console.log('esm-guard: none of the changed packages are "type": "module" — nothing to check.');
        return;
    }

    // Zero "type": "module" packages found at all means a wrong path / misconfiguration
    // (running from the wrong directory) — a genuine error, fail hard.
    if (results.length === 0) {
        console.error(`esm-guard: no "type": "module" packages found under ${rootDir} — nothing verified. Run from the repo root or pass a valid packages path.`);
        process.exit(2);
    }

    // Packages exist but every entry is NOT_BUILT: legitimate in a turbo affected-PR run
    // (only the changed subset is built, yet the sweep covers the whole tree) — must NOT
    // red an innocent PR. But don't print the misleading "OK — no breaks found" either;
    // warn that nothing was actually imported, then exit 0.
    const importedCount = results.length - (counts.NOT_BUILT ?? 0);
    if (importedCount === 0) {
        console.error(
            `esm-guard: all ${results.length} "type": "module" package(s) under ${rootDir} are NOT_BUILT — nothing imported, nothing verified. ` +
                `(Run "npm run build" first to check them.) Not failing: this is expected when an affected-PR build produced no built package.`
        );
        return;
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
