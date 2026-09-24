/**
 * Bare-`mj` resolution guard.
 *
 * A workspace package.json script may only invoke the MJ CLI in a way that actually
 * resolves. Two forms qualify:
 *
 *   1. `node <rel>/packages/MJCLI/bin/run.js ...` — the explicit workspace entry point.
 *   2. bare `mj ...`, but ONLY if that package declares @memberjunction/cli in its own
 *      dependencies/devDependencies, which is what creates its local node_modules/.bin/mj.
 *
 * Why this needs a gate. The repo used to carry three `workspace:*` devDependencies on the
 * ROOT manifest, and pnpm's resulting workspace-root node_modules/.bin/mj made bare `mj`
 * resolve from anywhere in the tree. Those devDeps were removed (they put 154/310 packages
 * into turbo's `hashOfInternalDependencies`, invalidating the entire repo on any edit — see
 * the root package.json and the `test` job comment). Removing them also removed that root
 * bin, so every bare `mj` that had been leaning on it silently stopped resolving.
 *
 * "Silently" is the whole problem. These call sites are prebuild/postbuild hooks ending in
 * `|| echo 'Warning: ...'`, so a lost CLI exits 0 and the build proceeds against a STALE
 * class-registration manifest. A newly added @RegisterClass class simply never reaches the
 * manifest, and tree-shaking then drops it from bundled apps at runtime. CI's manifest
 * freshness gate only runs on the FULL-suite backstop (`if: env.TURBO_FILTER == ''`), so a
 * PR-scoped run cannot see it either — the break surfaces later, on someone else's merge.
 *
 * Note the fix is NOT "add @memberjunction/cli everywhere". @memberjunction/cli itself
 * depends on @memberjunction/server-bootstrap-lite, so a devDep there would be a build-graph
 * CYCLE; and ng-explorer-core / ng-bootstrap are not leaves, so a devDep on them doubles
 * cli's invalidation blast radius (6 -> 12 packages) and gives back part of what removing the
 * root devDeps bought. Form 1 costs nothing in the graph and is the default.
 *
 * fs-only and dependency-free — it reads package.json manifests and nothing else — so it runs
 * in the `guards` job alongside the other build-free gates.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CLI_PACKAGE = '@memberjunction/cli';
const SKIP_DIRS = new Set(['node_modules', 'dist', '.angular', '.turbo']);
/** Hard cap on directories visited — the tree is ~3k dirs; hitting this means the walk escaped. */
const MAX_DIRS = 20000;

/**
 * A bare `mj <subcommand>` invocation: the token `mj` NOT preceded by a path separator,
 * word character, dot or dash — which is what excludes the legitimate
 * `node ../../packages/MJCLI/bin/run.js` form, plus npm-script names like `mj:manifest`.
 * Anchoring on the known subcommands keeps prose out (e.g. an `echo 'mj codegen'` warning
 * string is deliberately still matched — see `stripEchoStrings`).
 */
const MJ_SUBCOMMANDS = ['codegen', 'sync', 'migrate', 'test', 'standards', 'install', 'bundle', 'ai'];
const BARE_MJ = new RegExp(String.raw`(?<![\w./-])mj\s+(?:${MJ_SUBCOMMANDS.join('|')})\b`);

/** Collect every package.json under root, skipping build-output and dependency dirs. */
function findManifests(root) {
    const manifests = [];
    const queue = [root];
    let visited = 0;
    while (queue.length > 0) {
        visited += 1;
        if (visited > MAX_DIRS) {
            throw new Error(`Directory walk exceeded ${MAX_DIRS} dirs under ${root} — refusing to continue.`);
        }
        const dir = queue.shift();
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) queue.push(join(dir, entry.name));
            if (entry.isFile() && entry.name === 'package.json') manifests.push(join(dir, entry.name));
        }
    }
    return manifests;
}

/**
 * Drop single- and double-quoted string literals before scanning. Every real call site here
 * pairs the invocation with a `|| echo 'Warning: ... not available ...'` message that quotes
 * the command, and flagging that prose would make the guard unfixable without reflowing text.
 */
function stripEchoStrings(script) {
    return script.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
}

const root = process.argv[2];
if (!root) {
    console.error('Usage: node check-mj-cli-resolution.mjs <packages-dir>');
    process.exit(2);
}

const manifests = findManifests(root);
if (manifests.length === 0) {
    console.error(`No package.json files found under ${root} — wrong directory?`);
    process.exit(2);
}

// The ROOT manifest is the one that lost the bin, so it is exactly where a bare `mj` would be
// most misleading — and it sits outside <packages-dir>. Walking up from there instead of
// scanning the repo root avoids recursing into .claude/worktrees/, which holds full checkouts.
const rootManifest = join(root, '..', 'package.json');
try {
    readFileSync(rootManifest, 'utf8');
    manifests.push(rootManifest);
} catch {
    console.error(`Expected a root package.json at ${rootManifest} — wrong directory?`);
    process.exit(2);
}

const violations = [];
for (const manifestPath of manifests) {
    const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const declaresCli = Boolean(pkg.dependencies?.[CLI_PACKAGE] ?? pkg.devDependencies?.[CLI_PACKAGE]);
    if (declaresCli) continue;
    for (const [scriptName, body] of Object.entries(pkg.scripts ?? {})) {
        if (BARE_MJ.test(stripEchoStrings(body))) {
            violations.push({ manifestPath, scriptName, body });
        }
    }
}

if (violations.length > 0) {
    console.error(`❌ Unresolvable bare \`mj\` invocations found (${violations.length}):`);
    for (const v of violations) {
        console.error(`   ${v.manifestPath}  scripts.${v.scriptName}`);
        console.error(`      ${v.body}`);
    }
    console.error('');
    console.error('There is no workspace-root node_modules/.bin/mj — the root `workspace:*` devDeps');
    console.error('that created it were removed to keep turbo’s hashOfInternalDependencies empty.');
    console.error('A bare `mj` here resolves to nothing, and these hooks swallow the failure, so the');
    console.error('build silently proceeds against a STALE class-registration manifest.');
    console.error('');
    console.error('Fix (preferred): call the workspace entry point by path, e.g.');
    console.error('   node ../../packages/MJCLI/bin/run.js codegen manifest ...');
    console.error('adjusting `../..` to the package’s depth. This adds no build-graph edge.');
    console.error(`Only if the package genuinely needs its own bin should it declare ${CLI_PACKAGE}`);
    console.error('— and never in @memberjunction/cli’s own dependency closure (cycle), nor in a');
    console.error('package with dependents (it widens what a CLI edit invalidates).');
    process.exit(1);
}

console.log(`✅ ${manifests.length} manifests checked — every \`mj\` invocation resolves.`);
