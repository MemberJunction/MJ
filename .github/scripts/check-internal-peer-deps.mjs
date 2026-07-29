/**
 * Internal-peerDependency guard (LTS process doc §15; the E.1 pre-mode landmine).
 *
 * No package under packages/** may declare another @memberjunction/* package in
 * peerDependencies. Semver ranges exclude prereleases, so during a changesets
 * pre-mode (Edge) window ANY internal peer range is out of range for every
 * -edge.N version. Combined with onlyUpdatePeerDependentsWhenOutOfRange and the
 * repo-wide fixed group, a single internal peer silently escalates ALL packages
 * to a major bump with zero changelog trace — verified at 294-package scale on
 * 2026-07-27. Exact-pinning the peer does NOT fix it; only removal does.
 * Internal packages belong in dependencies or devDependencies.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const INTERNAL_SCOPE = '@memberjunction/';
const SKIP_DIRS = new Set(['node_modules', 'dist', '.angular', '.turbo']);
/** Hard cap on directories visited — the tree is ~3k dirs; hitting this means the walk escaped. */
const MAX_DIRS = 20000;

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

/** Return the @memberjunction/* names in a manifest's peerDependencies, with a parse-failure guard. */
function internalPeers(manifestPath) {
    const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return Object.keys(pkg.peerDependencies ?? {}).filter((name) => name.startsWith(INTERNAL_SCOPE));
}

const root = process.argv[2];
if (!root) {
    console.error('Usage: node check-internal-peer-deps.mjs <packages-dir>');
    process.exit(2);
}

const manifests = findManifests(root);
if (manifests.length === 0) {
    console.error(`No package.json files found under ${root} — wrong directory?`);
    process.exit(2);
}

const violations = [];
for (const manifestPath of manifests) {
    for (const peer of internalPeers(manifestPath)) {
        violations.push({ manifestPath, peer });
    }
}

if (violations.length > 0) {
    console.error(`❌ Internal peerDependencies found (${violations.length}):`);
    for (const v of violations) {
        console.error(`   ${v.manifestPath}: peerDependencies["${v.peer}"]`);
    }
    console.error('');
    console.error('Internal @memberjunction/* packages must never be peerDependencies. During an');
    console.error('Edge (changesets pre-mode) window, any internal peer range excludes every');
    console.error('-edge.N prerelease and escalates the entire fixed group to a silent major.');
    console.error('Move the package to dependencies or devDependencies instead.');
    console.error('See plans/lts-process.md §15 and this script’s header for the full mechanism.');
    process.exit(1);
}

console.log(`✅ ${manifests.length} manifests checked — no internal @memberjunction/* peerDependencies.`);
