#!/usr/bin/env node
/**
 * Writes dist/memberjunction-packages.json: the name of every @memberjunction/* package this
 * repository publishes in its lockstep release (the changeset `fixed` group), at this installer's
 * own version.
 *
 * The installer pins each of these names to the host's MemberJunction version in a distribution's
 * pnpm overrides. Reading names from the install's lockfile alone misses packages only an Open App
 * uses (ng-gantt, ng-kanban, ...): they are not in the graph until the app is installed, so the app
 * brought them in at whatever version its own range allowed.
 *
 * Runs after `tsc` in this package's build, from the monorepo, so the list always matches the
 * release being published. Packages versioned separately (none live in this repository today) are
 * excluded by the version check.
 *
 * Usage: node scripts/write-lockstep-packages.mjs
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCOPE = '@memberjunction/';
const MAX_DEPTH = 6;
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'coverage']);

/** Every package.json under `dir`, skipping build output, node_modules and dot-directories. */
function findManifests(dir, depth = 0) {
  if (depth > MAX_DEPTH || !existsSync(dir)) {
    return [];
  }
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIPPED_DIRECTORIES.has(entry.name)) {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findManifests(path, depth + 1));
    } else if (entry.name === 'package.json') {
      found.push(path);
    }
  }
  return found;
}

/** Reads a manifest, or returns undefined for one that is not valid JSON (test fixtures, templates). */
function readManifest(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * The published @memberjunction/* packages under `packagesRoot` at exactly `version`, sorted.
 *
 * @param {string} packagesRoot - The monorepo's `packages/` directory.
 * @param {string} version - The lockstep release version (this installer's own version).
 * @returns {string[]}
 */
export function ListLockstepPackages(packagesRoot, version) {
  const names = new Set();
  for (const file of findManifests(packagesRoot)) {
    const manifest = readManifest(file);
    if (manifest && typeof manifest.name === 'string' && manifest.name.startsWith(SCOPE)
      && manifest.private !== true && manifest.version === version) {
      names.add(manifest.name);
    }
  }
  return [...names].sort();
}

function main() {
  const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  const own = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
  const packages = ListLockstepPackages(join(packageDir, '..'), own.version);
  if (!packages.includes(own.name)) {
    throw new Error(`write-lockstep-packages: ${own.name} is missing from its own list; is this running inside the MemberJunction repository?`);
  }
  const outDir = join(packageDir, 'dist');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'memberjunction-packages.json'), `${JSON.stringify({ Version: own.version, Packages: packages }, null, 2)}\n`);
  console.log(`write-lockstep-packages: ${packages.length} @memberjunction/* packages at ${own.version}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
