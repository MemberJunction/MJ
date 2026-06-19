#!/usr/bin/env node
/**
 * env-preflight.mjs — the v2 EnvPreflight (S0) as a DETERMINISTIC FINDER (ARCHITECTURE_REFACTOR.md
 * P7 + P9). Mechanical environment gates BEFORE any build stage burns tokens. Emits the exact
 * `envPreflight` shape floor-check's `env-preflight-missing` / `stale-nested-dist` rules consume.
 *
 * Checks (all scripted, no LLM judgment):
 *   1. STALE-NESTED-DIST SCAN (the GZ #31 silent-kill detector): every REAL-directory copy of
 *      @memberjunction/integration-* under any package's node_modules, dist hash-compared against
 *      the workspace package dist. A stale nested schema-builder silently disabled custom-column
 *      capture for EVERY connector — invisible to all other checks.
 *   2. GENERATED-TREE CLEAN: `git status --porcelain` over the generated dirs (churn killed MJAPI
 *      boots repeatedly — GZ #11/#19/#33).
 *   3. TURBO-DIST FRESHNESS: newest src mtime vs newest dist mtime per integration package
 *      (a stale cached dist masked the GZ pagination fix — #13).
 *   4. MJAPI PROBE (optional --gql-url): HTTP status (401/200 = up; 000 = down).
 *
 * Usage: node env-preflight.mjs [--repo <root>] [--gql-url <url>] [--out <dir>]
 * Exit: 0 always (the verdict is `ok` in the JSON); 2 setup error.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, lstatSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
}
const REPO = resolve(args.repo || '.');
const OUT = args.out || '.';

const notes = [];

// ── 1. stale-nested-dist scan (#31 detector) ─────────────────────────
function hashDir(dir) {
    const h = createHash('sha256');
    const walk = (d) => {
        let entries = [];
        try { entries = readdirSync(d).sort(); } catch { return; }
        for (const e of entries) {
            const p = join(d, e);
            let st; try { st = statSync(p); } catch { continue; }
            if (st.isDirectory()) walk(p);
            else if (e.endsWith('.js')) { h.update(e); h.update(readFileSync(p)); }
        }
    };
    walk(dir);
    return h.digest('hex');
}
const staleNestedDists = [];
const pkgsDir = join(REPO, 'packages');
const workspaceDistHash = new Map(); // pkgName -> hash
function workspaceHash(pkgName) {
    if (workspaceDistHash.has(pkgName)) return workspaceDistHash.get(pkgName);
    // integration-* workspace dirs live under packages/Integration/<short-name>
    const short = pkgName.replace(/^integration-/, '');
    const candidates = [join(pkgsDir, 'Integration', short, 'dist'), join(pkgsDir, 'Integration', pkgName, 'dist')];
    for (const c of candidates) {
        if (existsSync(c)) { const h = hashDir(c); workspaceDistHash.set(pkgName, h); return h; }
    }
    workspaceDistHash.set(pkgName, null);
    return null;
}
function scanNested(root, depth) {
    if (depth > 5) return;
    let entries = [];
    try { entries = readdirSync(root); } catch { return; }
    for (const e of entries) {
        const p = join(root, e);
        let st; try { st = lstatSync(p); } catch { continue; }
        if (!st.isDirectory() || st.isSymbolicLink()) continue;
        if (e === 'node_modules') {
            const mj = join(p, '@memberjunction');
            if (existsSync(mj)) {
                for (const pkg of readdirSync(mj)) {
                    if (!pkg.startsWith('integration-')) continue;
                    const nested = join(mj, pkg);
                    let nst; try { nst = lstatSync(nested); } catch { continue; }
                    if (nst.isSymbolicLink()) continue; // symlink to workspace = fine
                    const nestedDist = join(nested, 'dist');
                    if (!existsSync(nestedDist)) continue;
                    const wsHash = workspaceHash(pkg);
                    const nHash = hashDir(nestedDist);
                    if (wsHash && nHash !== wsHash) {
                        staleNestedDists.push({ package: `@memberjunction/${pkg}`, nestedPath: nested.replace(REPO + '/', ''), reason: 'dist hash differs from workspace dist (the GZ #31 class)' });
                    }
                }
            }
            continue; // don't recurse INTO node_modules beyond the @memberjunction check
        }
        if (e.startsWith('.') || e === 'dist') continue;
        scanNested(p, depth + 1);
    }
}
scanNested(pkgsDir, 0);

// ── 2. generated-tree clean ──────────────────────────────────────────
const GENERATED_DIRS = [
    'packages/MJAPI/src/generated',
    'packages/MJCoreEntities/src/generated',
    'packages/GeneratedEntities/src/generated',
    'packages/ServerBootstrap/src/generated',
];
let generatedTreeClean = true;
let generatedChurn = [];
try {
    const out = execSync(`git -C ${JSON.stringify(REPO)} status --porcelain -- ${GENERATED_DIRS.join(' ')}`, { encoding: 'utf-8' });
    generatedChurn = out.split('\n').filter(Boolean);
    generatedTreeClean = generatedChurn.length === 0;
    if (!generatedTreeClean) notes.push(`generated tree churned (${generatedChurn.length} file(s)) — restore or account before stages run (GZ #11/#19/#33)`);
} catch (e) {
    notes.push(`generated-tree check failed: ${String(e.message).slice(0, 120)}`);
    generatedTreeClean = false;
}

// ── 3. turbo-dist freshness ──────────────────────────────────────────
function newestMtime(dir, ext) {
    let newest = 0;
    const walk = (d) => {
        let entries = [];
        try { entries = readdirSync(d); } catch { return; }
        for (const e of entries) {
            const p = join(d, e);
            let st; try { st = statSync(p); } catch { continue; }
            if (st.isDirectory()) { if (e !== 'node_modules' && e !== '__tests__') walk(p); }
            else if (!ext || e.endsWith(ext)) newest = Math.max(newest, st.mtimeMs);
        }
    };
    walk(dir);
    return newest;
}
const FRESHNESS_PKGS = ['packages/Integration/engine', 'packages/Integration/engine-base', 'packages/Integration/schema-builder', 'packages/Integration/connectors'];
let turboDistFresh = true;
const staleDists = [];
for (const pkg of FRESHNESS_PKGS) {
    const src = join(REPO, pkg, 'src');
    const dist = join(REPO, pkg, 'dist');
    if (!existsSync(src) || !existsSync(dist)) continue;
    const srcM = newestMtime(src, '.ts');
    const distM = newestMtime(dist, '.js');
    if (srcM > distM) { turboDistFresh = false; staleDists.push(pkg); }
}
if (!turboDistFresh) notes.push(`stale dist (src newer than dist — GZ #13): ${staleDists.join(', ')} — rebuild before any test asserts behavior`);

// ── 4. MJAPI probe (optional) ────────────────────────────────────────
let mjapiBootable = null;
if (args['gql-url']) {
    try {
        const res = await fetch(args['gql-url'], { method: 'GET', signal: AbortSignal.timeout(8000) });
        mjapiBootable = [200, 401, 400].includes(res.status);
        notes.push(`MJAPI probe ${args['gql-url']} → HTTP ${res.status}`);
    } catch {
        mjapiBootable = false;
        notes.push(`MJAPI probe ${args['gql-url']} → unreachable`);
    }
}

const result = {
    ok: staleNestedDists.length === 0 && generatedTreeClean && turboDistFresh && mjapiBootable !== false,
    dbReachable: null,           // DB-level checks are env-specific; the harness runbook owns them
    migrationLevel: null,
    mjapiBootable,
    generatedTreeClean,
    generatedChurn: generatedChurn.slice(0, 20),
    staleNestedDists,
    turboDistFresh,
    staleDists,
    resolved: false,             // set true by the caller AFTER detected issues are fixed + re-run is clean
    notes,
};
mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, 'env-preflight.json'), JSON.stringify(result, null, 2) + '\n');
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
