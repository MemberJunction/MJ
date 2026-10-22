#!/usr/bin/env node
/**
 * check-exact-pins.mjs — Exact-version pin guard for build-baked external scopes.
 *
 * Why this exists:
 * `@memberjunction/ng-flow-editor` publishes full Angular Ivy output (`ɵɵdefineComponent`)
 * that bakes `@foblex/flow` directive and component class names (`FExternalItemDirective`,
 * `FSelectionAreaComponent`) into `dist/` at MJ build time. `@foblex/flow` renamed those
 * public classes in minor releases (`18.1.0` and `18.2.0`), so a caret range (`^18.0.0`)
 * promises compatibility with versions that the compiled `dist/` cannot run with — causing
 * downstream npm/yarn consumers without MJ's `pnpm-lock.yaml` to resolve `18.6.1` and crash
 * at runtime with `NG0919: Cannot read @Component metadata`.
 *
 * Every dependency under `PINNED_SCOPES` across `packages/**\/package.json` must declare an
 * exact `X.Y.Z` version that matches the version resolved in `pnpm-lock.yaml`.
 *
 * Usage:  node .github/scripts/check-exact-pins.mjs [--root <dir>]
 * Exit:   0 = all pins exact and in sync with pnpm-lock.yaml
 *         1 = one or more pin violations
 *         2 = bad usage or missing pnpm-lock.yaml / packages directory
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PINNED_SCOPES = ['@foblex/'];

const SKIP_DIRS = new Set(['node_modules', 'dist', '.angular', '.turbo']);
/** Hard cap on directories visited — hitting this means the directory walk escaped. */
const MAX_DIRS = 20000;
const EXACT_VERSION_RE = /^\d+\.\d+\.\d+$/;
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'];

/**
 * Return true iff `range` is a strict `X.Y.Z` version string.
 * @param {string} range
 * @returns {boolean}
 */
export function isExactVersion(range) {
    return typeof range === 'string' && EXACT_VERSION_RE.test(range);
}

/** Strip optional matching single or double quotes around a YAML scalar or key. */
function unquote(raw) {
    const trimmed = raw.trim();
    if (
        (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
        (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

/**
 * Collect every `package.json` under `<root>/packages`, skipping build output and dependency dirs.
 * @param {string} packagesRoot
 * @returns {string[]}
 */
function findManifests(packagesRoot) {
    const manifests = [];
    const queue = [packagesRoot];
    let visited = 0;
    while (queue.length > 0) {
        visited += 1;
        if (visited > MAX_DIRS) {
            throw new Error(`Directory walk exceeded ${MAX_DIRS} dirs under ${packagesRoot} — refusing to continue.`);
        }
        const dir = queue.shift();
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
                queue.push(join(dir, entry.name));
            } else if (entry.isFile() && entry.name === 'package.json') {
                manifests.push(join(dir, entry.name));
            }
        }
    }
    return manifests.sort();
}

/**
 * Parse the `importers:` section of `pnpm-lock.yaml` as text.
 * Returns a Map of importer relative path -> Map of dependency name -> `{ specifier, version }`.
 * @param {string} lockfileText
 * @returns {Map<string, Map<string, { specifier: string | null, version: string | null }>>}
 */
export function parseLockfileImporters(lockfileText) {
    const importers = new Map();
    const lines = lockfileText.split(/\r?\n/);
    let inImporters = false;
    let currentImporter = null;
    let currentDep = null;

    for (const line of lines) {
        if (!inImporters) {
            if (/^importers:\s*$/.test(line)) {
                inImporters = true;
            }
            continue;
        }

        // Ignore blank or comment lines inside importers:
        if (/^\s*(?:#.*)?$/.test(line)) {
            continue;
        }

        // Another top-level key at column 0 ends the importers: section
        if (/^\S/.test(line)) {
            break;
        }

        // 2-space indent: importer key (e.g. `  packages/Angular/Generic/flow-editor:`)
        const importerMatch = /^ {2}([^ ].*?):\s*$/.exec(line);
        if (importerMatch) {
            currentImporter = unquote(importerMatch[1]);
            if (!importers.has(currentImporter)) {
                importers.set(currentImporter, new Map());
            }
            currentDep = null;
            continue;
        }

        // 4-space indent: dependency group (`dependencies:`, `devDependencies:`, etc.)
        if (/^ {4}[^ ].*:\s*$/.test(line)) {
            currentDep = null;
            continue;
        }

        // 6-space indent: dependency name (e.g. `      '@foblex/flow':`)
        const depMatch = /^ {6}([^ ].*?):\s*$/.exec(line);
        if (depMatch && currentImporter !== null) {
            currentDep = unquote(depMatch[1]);
            const depMap = importers.get(currentImporter);
            if (!depMap.has(currentDep)) {
                depMap.set(currentDep, { specifier: null, version: null });
            }
            continue;
        }

        // 8-space indent: `specifier:` or `version:`
        const propMatch = /^ {8}(specifier|version):\s*(.+?)\s*$/.exec(line);
        if (propMatch && currentImporter !== null && currentDep !== null) {
            const [, key, rawVal] = propMatch;
            const val = unquote(rawVal);
            const entry = importers.get(currentImporter).get(currentDep);
            if (key === 'specifier') {
                entry.specifier = val;
            } else if (key === 'version') {
                entry.version = val.split('(')[0].trim();
            }
        }
    }

    return importers;
}

/**
 * Scan `<root>/packages/**\/package.json` and `<root>/pnpm-lock.yaml` for any dependency
 * in `pinnedScopes` whose declared range is not an exact version or does not match the lockfile.
 *
 * @param {string} root
 * @param {string[]} [pinnedScopes]
 * @returns {Array<{ manifestPath: string, dep: string, declaredRange: string, lockfileVersion: string | null, lockfileSpecifier: string | null }>}
 */
export function findPinViolations(root, pinnedScopes = PINNED_SCOPES) {
    const packagesDir = join(root, 'packages');
    const lockfilePath = join(root, 'pnpm-lock.yaml');
    const lockfileText = readFileSync(lockfileTextPathOrThrow(lockfilePath), 'utf8');
    const importers = parseLockfileImporters(lockfileText);
    const manifests = findManifests(packagesDir);

    const violations = [];
    for (const absManifestPath of manifests) {
        const relManifestPath = relative(root, absManifestPath).split('\\').join('/');
        const importerKey = dirname(relManifestPath).split('\\').join('/');
        const importerDeps = importers.get(importerKey);
        const pkg = JSON.parse(readFileSync(absManifestPath, 'utf8'));

        for (const field of DEP_FIELDS) {
            const deps = pkg[field];
            if (!deps || typeof deps !== 'object') continue;

            for (const [dep, declaredRange] of Object.entries(deps)) {
                if (!pinnedScopes.some((scope) => dep.startsWith(scope))) continue;

                const lockEntry = importerDeps?.get(dep) ?? null;
                const lockfileVersion = lockEntry?.version ?? null;
                const lockfileSpecifier = lockEntry?.specifier ?? null;

                const exact = isExactVersion(declaredRange);
                const matchesVersion = lockfileVersion === declaredRange;
                const matchesSpecifier = lockfileSpecifier === null || lockfileSpecifier === declaredRange;

                if (!exact || !matchesVersion || !matchesSpecifier) {
                    violations.push({
                        manifestPath: relManifestPath,
                        dep,
                        declaredRange,
                        lockfileVersion,
                        lockfileSpecifier,
                    });
                }
            }
        }
    }

    return violations;
}

function lockfileTextPathOrThrow(lockfilePath) {
    if (!existsSync(lockfilePath)) {
        throw new Error(`Lockfile not found at ${lockfilePath}`);
    }
    return lockfilePath;
}

function parseArgs(argv) {
    const scriptDir = dirname(fileURLToPath(import.meta.url));
    let root = resolve(scriptDir, '..', '..');

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--root') {
            const next = argv[++i];
            if (!next || next.startsWith('--')) {
                console.error('Usage: node .github/scripts/check-exact-pins.mjs [--root <dir>]');
                process.exit(2);
            }
            root = resolve(next);
        } else {
            console.error(`Unknown argument: ${arg}\nUsage: node .github/scripts/check-exact-pins.mjs [--root <dir>]`);
            process.exit(2);
        }
    }

    return { root };
}

function main() {
    const { root } = parseArgs(process.argv.slice(2));
    const packagesDir = join(root, 'packages');
    const lockfilePath = join(root, 'pnpm-lock.yaml');

    if (!existsSync(lockfilePath)) {
        console.error(`check-exact-pins: missing lockfile at ${lockfilePath}`);
        process.exit(2);
    }
    if (!existsSync(packagesDir)) {
        console.error(`check-exact-pins: missing packages directory at ${packagesDir}`);
        process.exit(2);
    }

    let violations;
    try {
        violations = findPinViolations(root);
    } catch (err) {
        console.error(`check-exact-pins: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(2);
    }

    if (violations.length > 0) {
        for (const v of violations) {
            console.error(
                `${v.manifestPath}: ${v.dep} declared "${v.declaredRange}" (lockfile version: "${v.lockfileVersion ?? 'missing'}", specifier: "${v.lockfileSpecifier ?? 'missing'}")`
            );
        }
        process.exit(1);
    }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    main();
}
