#!/usr/bin/env node
/**
 * check-explorer-external-deps.mjs — MJExplorer externalized-dependency guard (Open App item B.2).
 *
 * Angular's dev server (Vite) excludes `@memberjunction/*` from prebundling (angular.json
 * `prebundle.exclude`), so bare imports INSIDE those packages resolve from the CONSUMING
 * APP's resolution context — not from the owning package's own node_modules. npm's hoisted
 * layout makes that distinction invisible; under any strict/isolated layout (pnpm, the
 * generated Open App parent workspace) every such dependency the app doesn't declare is a
 * phantom that fails to resolve at `ng serve` time. The 2026-07 hand-spike papered over it
 * with a generated 78-line `public-hoist-pattern` block; the durable fix is that MJExplorer
 * declares its full externalized closure explicitly (plans/openapp-pnpm-evidence-appendix.md §9).
 *
 * What it does: starting from the app's runtime `dependencies`, walks the workspace-internal
 * dependency closure (every workspace package reachable through `dependencies` +
 * `peerDependencies` edges) and collects each EXTERNAL runtime dependency those packages
 * declare. Optional peers (`peerDependenciesMeta[..].optional`) are informational only. The
 * app manifest must declare every collected name. The app's devDependencies are NOT walked —
 * build tools (e.g. @memberjunction/cli) run in their own resolution context, not the
 * dev server's.
 *
 * Range choice: taken from the owning package(s). When owners disagree, the concrete range
 * with the highest lower bound wins; owner ranges that don't intersect the pick are reported
 * as conflicts (fix belongs in the owning packages). `latest` is chosen only when no owner
 * declares a concrete range.
 *
 * Modes:
 *   (default)  verify the app package.json declares the closure — the CI-gate mode
 *   --list     print the computed closure with chosen ranges and owners
 *   --write    add/repair the declarations in the app package.json (the list is
 *              regenerated, never hand-maintained)
 *
 * Usage:  node .github/scripts/check-explorer-external-deps.mjs [--root <dir>] [--app <rel>] [--list|--write]
 * Exit:   0 = in sync, 1 = declarations missing/incompatible, 2 = misconfiguration.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Hard cap on directories visited while discovering workspace packages. */
const MAX_DIRS = 20000;

/** Directory names never descended during workspace discovery. */
const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__', 'fixtures']);

/** A parsed package.json manifest (only the fields this guard reads). */
/** @typedef {{ name?: string, dependencies?: Record<string,string>, devDependencies?: Record<string,string>, optionalDependencies?: Record<string,string>, peerDependencies?: Record<string,string>, peerDependenciesMeta?: Record<string,{optional?: boolean}> }} Manifest */

/** One "owner declares this external dep" edge found during the walk. */
/** @typedef {{ owner: string, field: 'dependencies'|'peerDependencies', range: string, optional: boolean }} ExternalEdge */

// ---------------------------------------------------------------------------
// Range parsing / intersection — only the forms this repo actually uses
// (exact, ^caret, ~tilde, latest/*). Anything else parses as 'unknown' and is
// treated as intersecting everything (fail-open, surfaced as a warning).
// ---------------------------------------------------------------------------

const EXACT_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * Parse a declared range into an interval: inclusive lower bound `lo`, upper
 * bound `hi` (exclusive unless `hiInclusive`), both `[major, minor, patch]`.
 * `hi: null` = unbounded. Kinds: exact | caret | tilde | any | unknown.
 */
export function parseRange(raw) {
    if (raw === 'latest' || raw === '*') {
        return { raw, kind: 'any', lo: [0, 0, 0], hi: null, hiInclusive: false };
    }
    const caret = raw.startsWith('^') ? raw.slice(1) : null;
    const tilde = raw.startsWith('~') ? raw.slice(1) : null;
    const match = EXACT_RE.exec(caret ?? tilde ?? raw);
    if (!match) {
        return { raw, kind: 'unknown', lo: null, hi: null, hiInclusive: false };
    }
    const lo = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (caret != null) {
        // ^x.y.z allows up to the next major (next minor for 0.y.z, next patch for 0.0.z).
        const hi = lo[0] > 0 ? [lo[0] + 1, 0, 0] : lo[1] > 0 ? [0, lo[1] + 1, 0] : [0, 0, lo[2] + 1];
        return { raw, kind: 'caret', lo, hi, hiInclusive: false };
    }
    if (tilde != null) {
        return { raw, kind: 'tilde', lo, hi: [lo[0], lo[1] + 1, 0], hiInclusive: false };
    }
    return { raw, kind: 'exact', lo, hi: lo, hiInclusive: true };
}

/** Lexicographic compare of two [major, minor, patch] tuples. */
function compareVersions(a, b) {
    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
}

/** True when `point` is below the range's upper bound. */
function upperAllows(range, point) {
    if (range.hi === null) return true;
    const cmp = compareVersions(point, range.hi);
    return range.hiInclusive ? cmp <= 0 : cmp < 0;
}

/**
 * True when two parsed ranges share at least one version. Lower bounds are
 * always inclusive, so intervals overlap iff each range's upper bound admits
 * the other's lower bound. Unknown ranges intersect everything (fail-open —
 * callers surface them as warnings instead of guessing).
 */
export function rangesIntersect(a, b) {
    if (a.kind === 'unknown' || b.kind === 'unknown') return true;
    if (a.kind === 'any' || b.kind === 'any') return true;
    return upperAllows(a, b.lo) && upperAllows(b, a.lo);
}

/**
 * Choose the range the app should declare for one external dependency, from
 * the ranges its owning packages declare. Concrete ranges beat `latest`; among
 * concrete ranges the highest lower bound wins (ties broken by raw string for
 * determinism); owner ranges disjoint from the pick are reported as conflicts.
 */
export function pickRange(edges) {
    const uniqueRaw = [...new Set(edges.map((e) => e.range))].sort();
    const parsed = uniqueRaw.map(parseRange);
    const concrete = parsed.filter((r) => r.kind !== 'any' && r.kind !== 'unknown');
    const unknowns = parsed.filter((r) => r.kind === 'unknown').map((r) => r.raw);
    if (concrete.length === 0) {
        // Every owner says `latest`/unparseable — nothing better to pin to.
        return { range: uniqueRaw[0], conflicts: [], latestOnly: true, unknowns };
    }
    let pick = concrete[0];
    for (const candidate of concrete.slice(1)) {
        if (compareVersions(candidate.lo, pick.lo) > 0) pick = candidate;
    }
    const conflicts = concrete.filter((r) => r !== pick && !rangesIntersect(pick, r)).map((r) => r.raw);
    return { range: pick.raw, conflicts, latestOnly: false, unknowns };
}

// ---------------------------------------------------------------------------
// Workspace discovery + closure walk
// ---------------------------------------------------------------------------

/**
 * Map every workspace package under `<root>/packages` by name. Skips
 * node_modules/dist/test-fixture/dot directories. Duplicate names are a hard
 * error — the closure walk would silently pick an arbitrary copy.
 */
export function collectWorkspacePackages(root) {
    const packagesDir = join(root, 'packages');
    const byName = new Map();
    const stack = [packagesDir];
    let visited = 0;
    while (stack.length > 0) {
        visited += 1;
        if (visited > MAX_DIRS) {
            throw new Error(`workspace discovery exceeded ${MAX_DIRS} directories under ${packagesDir}`);
        }
        const dir = stack.pop();
        const pkgPath = join(dir, 'package.json');
        if (existsSync(pkgPath)) {
            const manifest = JSON.parse(readFileSync(pkgPath, 'utf8'));
            if (typeof manifest.name === 'string' && manifest.name.length > 0) {
                const existing = byName.get(manifest.name);
                if (existing) {
                    throw new Error(`duplicate workspace package name ${manifest.name}: ${existing.dir} vs ${dir}`);
                }
                byName.set(manifest.name, { dir, manifest });
            }
        }
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
            stack.push(join(dir, entry.name));
        }
    }
    return byName;
}

/**
 * Walk the app's workspace-internal runtime closure and collect every external
 * dependency declared along the way. Returns the visited workspace package
 * names and a map of external name → {@link ExternalEdge}[].
 */
export function computeExternalClosure(workspace, appManifest) {
    const seeds = Object.keys(appManifest.dependencies ?? {}).filter((dep) => workspace.has(dep));
    const externals = new Map();
    const visited = new Set();
    const queue = [...seeds];
    let steps = 0;
    const maxSteps = workspace.size + seeds.length + 1;
    while (queue.length > 0) {
        steps += 1;
        if (steps > maxSteps) {
            throw new Error(`closure walk exceeded ${maxSteps} steps — dependency graph corrupt?`);
        }
        const name = queue.shift();
        if (visited.has(name)) continue;
        visited.add(name);
        const { manifest } = workspace.get(name);
        collectPackageEdges(name, manifest, workspace, externals, visited, queue);
    }
    return { walked: visited, externals };
}

/** Record one walked package's runtime edges: enqueue workspace deps, collect external ones. */
function collectPackageEdges(owner, manifest, workspace, externals, visited, queue) {
    const peerMeta = manifest.peerDependenciesMeta ?? {};
    for (const field of ['dependencies', 'peerDependencies']) {
        for (const [dep, range] of Object.entries(manifest[field] ?? {})) {
            if (workspace.has(dep)) {
                if (!visited.has(dep)) queue.push(dep);
                continue;
            }
            const optional = field === 'peerDependencies' && peerMeta[dep]?.optional === true;
            const edges = externals.get(dep) ?? [];
            edges.push({ owner, field, range, optional });
            externals.set(dep, edges);
        }
    }
}

/** The externals every edge of which is an optional peer are informational, not required. */
function partitionRequired(externals) {
    const required = new Map();
    const optionalOnly = new Map();
    for (const [dep, edges] of externals) {
        (edges.some((e) => !e.optional) ? required : optionalOnly).set(dep, edges);
    }
    return { required, optionalOnly };
}

// ---------------------------------------------------------------------------
// Evaluation against the app manifest
// ---------------------------------------------------------------------------

/**
 * Compare the required external closure against what the app declares.
 * `missing` = not declared anywhere; `incompatible` = declared with a range
 * that intersects NO owner range (definitely wrong — a range that satisfies
 * only some owners is a warning-level owner conflict, not a gate, because
 * disjoint owner ranges make satisfying all of them impossible).
 */
export function evaluateDeclarations(appManifest, required) {
    const declared = new Map();
    for (const field of ['optionalDependencies', 'devDependencies', 'dependencies']) {
        for (const [dep, range] of Object.entries(appManifest[field] ?? {})) {
            declared.set(dep, range); // later fields win: dependencies is authoritative
        }
    }
    const missing = [];
    const incompatible = [];
    for (const [dep, edges] of required) {
        const declaredRange = declared.get(dep);
        if (declaredRange === undefined) {
            missing.push(dep);
            continue;
        }
        const parsedDeclared = parseRange(declaredRange);
        const intersectsAny = edges.some((e) => rangesIntersect(parsedDeclared, parseRange(e.range)));
        if (!intersectsAny) {
            incompatible.push({ dep, declaredRange });
        }
    }
    return { missing: missing.sort(), incompatible };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
    const scriptDir = dirname(fileURLToPath(import.meta.url));
    const args = { root: resolve(scriptDir, '..', '..'), app: 'packages/MJExplorer', mode: 'check' };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--root' && argv[i + 1]) args.root = resolve(argv[++i]);
        else if (arg === '--app' && argv[i + 1]) args.app = argv[++i];
        else if (arg === '--list') args.mode = 'list';
        else if (arg === '--write') args.mode = 'write';
        else {
            console.error(`explorer-deps: unknown argument ${arg}`);
            process.exit(2);
        }
    }
    return args;
}

/**
 * Declarations in the app manifest that are themselves non-concrete (`latest`, `*`, or anything
 * `parseRange` cannot pin). These can never be caught by the incompatible check: `parseRange`
 * classifies them `any`, and `rangesIntersect` returns true unconditionally for `any` — so once
 * such a range lands in the manifest it intersects every owner forever and `--write` never
 * repairs it. That one-way ratchet is how `latest` specifiers for CodeMirror/Lezer persisted in
 * MJExplorer's manifest for months. Surfaced separately, and gated.
 */
export function findNonConcreteDeclarations(appManifest, required) {
    const declared = appManifest.dependencies ?? {};
    const found = [];
    for (const dep of [...required.keys()].sort()) {
        const raw = declared[dep];
        if (typeof raw !== 'string') continue;
        const kind = parseRange(raw).kind;
        if (kind === 'any' || kind === 'unknown') {
            found.push({ dep, declaredRange: raw });
        }
    }
    return found;
}

/** Non-gating diagnostics: owner range conflicts, latest-only pins, unparseable ranges. */
function printRangeWarnings(required) {
    for (const dep of [...required.keys()].sort()) {
        const edges = required.get(dep);
        const { range, conflicts, latestOnly, unknowns } = pickRange(edges);
        if (conflicts.length > 0) {
            const owners = edges.map((e) => `${e.owner}@${e.range}`).join(', ');
            console.log(`  (warn) ${dep}: owner ranges are disjoint — picked ${range} (owners: ${owners})`);
        }
        if (latestOnly) {
            console.log(`  (warn) ${dep}: every owner declares '${range}' — owners should pin a concrete range`);
        }
        for (const raw of unknowns) {
            console.log(`  (warn) ${dep}: unparseable range '${raw}' treated as intersecting everything`);
        }
    }
}

function printList(required, optionalOnly) {
    for (const dep of [...required.keys()].sort()) {
        const edges = required.get(dep);
        const { range } = pickRange(edges);
        const owners = [...new Set(edges.map((e) => e.owner))].sort();
        console.log(`${dep}\t${range}\t${owners.join(',')}`);
    }
    for (const dep of [...optionalOnly.keys()].sort()) {
        console.log(`${dep}\t(optional-peer only — not declared)`);
    }
}

/** Add missing declarations (and repair zero-intersection ones) in the app package.json. */
function writeDeclarations(appPkgPath, appManifest, required, missing, incompatible) {
    const deps = { ...(appManifest.dependencies ?? {}) };
    // Never WRITE a non-concrete range. When every owner says `latest`, pickRange has nothing
    // better to offer — but persisting it into the app manifest makes the build non-reproducible
    // AND creates a declaration this script can never repair (see findNonConcreteDeclarations).
    // Skipping leaves the dependency `missing`, which fails the gate loudly and points at the
    // owners, where the fix actually belongs.
    const skipped = [];
    const resolve = (dep) => {
        const { range, latestOnly } = pickRange(required.get(dep));
        if (latestOnly) {
            skipped.push({ dep, range });
            return null;
        }
        return range;
    };
    for (const dep of missing) {
        const range = resolve(dep);
        if (range === null) continue;
        deps[dep] = range;
        console.log(`  + ${dep}@${deps[dep]}`);
    }
    for (const { dep, declaredRange } of incompatible) {
        const range = resolve(dep);
        if (range === null) continue;
        deps[dep] = range;
        console.log(`  ~ ${dep}: ${declaredRange} -> ${deps[dep]}`);
    }
    for (const { dep, range } of skipped) {
        console.log(`  ! ${dep}: refusing to write non-concrete '${range}' — pin it on the owner package(s) instead`);
    }
    appManifest.dependencies = Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(appPkgPath, JSON.stringify(appManifest, null, 2) + '\n', 'utf8');
}

function main() {
    const { root, app, mode } = parseArgs(process.argv.slice(2));
    const appPkgPath = join(root, app, 'package.json');
    if (!existsSync(appPkgPath)) {
        console.error(`explorer-deps: app manifest not found: ${appPkgPath}`);
        process.exit(2);
    }
    const workspace = collectWorkspacePackages(root);
    const appManifest = JSON.parse(readFileSync(appPkgPath, 'utf8'));
    const { walked, externals } = computeExternalClosure(workspace, appManifest);

    // An @memberjunction external means a walked package references an MJ package
    // that is NOT in the workspace — the closure premise is broken; refuse to judge.
    const ghosts = [...externals.keys()].filter((dep) => dep.startsWith('@memberjunction/'));
    if (ghosts.length > 0) {
        console.error(`explorer-deps: workspace closure references non-workspace MJ package(s): ${ghosts.join(', ')}`);
        process.exit(2);
    }

    const { required, optionalOnly } = partitionRequired(externals);
    console.log(
        `explorer-deps: ${appManifest.name}: walked ${walked.size} workspace packages — ` +
            `${externals.size} external dependencies, ${required.size} required`
    );
    if (mode === 'list') {
        printList(required, optionalOnly);
        return;
    }
    printRangeWarnings(required);
    const { missing, incompatible } = evaluateDeclarations(appManifest, required);
    const nonConcrete = findNonConcreteDeclarations(appManifest, required);
    if (mode === 'write') {
        if (missing.length === 0 && incompatible.length === 0) {
            console.log('explorer-deps: nothing to write — declarations already in sync');
        } else {
            writeDeclarations(appPkgPath, appManifest, required, missing, incompatible);
            console.log(`explorer-deps: wrote declaration(s) to ${appPkgPath}`);
        }
        // --write cannot fix these: the fix belongs on the owner package, not here.
        for (const { dep, declaredRange } of nonConcrete) {
            console.log(`  ! ${dep}: declared '${declaredRange}' is non-concrete — pin it on the owner package(s)`);
        }
        return;
    }
    if (missing.length > 0 || incompatible.length > 0 || nonConcrete.length > 0) {
        console.error(`\nexplorer-deps: FAIL — ${appManifest.name}'s externalized closure is incomplete or not reproducibly pinned`);
        for (const dep of missing) {
            console.error(`  ✖ missing: ${dep} (owners: ${[...new Set(required.get(dep).map((e) => e.owner))].sort().join(', ')})`);
        }
        for (const { dep, declaredRange } of incompatible) {
            console.error(`  ✖ incompatible: ${dep}@${declaredRange} intersects no owner range`);
        }
        for (const { dep, declaredRange } of nonConcrete) {
            console.error(
                `  ✖ non-concrete: ${dep}@${declaredRange} — resolves differently on every install, ` +
                    `so the build is not reproducible. Pin a concrete range on the owner package(s), then re-run --write.`
            );
        }
        console.error('\n(regenerate with: node .github/scripts/check-explorer-external-deps.mjs --write)');
        process.exit(1);
    }
    console.log('explorer-deps: OK — externalized closure fully declared');
}

// Run only when invoked directly as a CLI (not when imported by tests).
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    main();
}
