#!/usr/bin/env node
/**
 * check-turbo-root-inputs.mjs
 *
 * A package whose tests read repo-root data must declare that data as a turbo `test` input.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────────
 * Turbo's cache key for a package's `test` task covers that package's own files (root
 * turbo.json `tasks.test.inputs`). A guard test that reads `migrations/`, `metadata/` or
 * `metadata-optional/` from the repo root therefore keeps its cached pass when that data
 * changes: turbo replays the pass without running the test. The data such a test guards is
 * exactly the data whose edits it cannot see.
 *
 * The fix is a package-level turbo.json that extends the root task and adds the root data:
 *
 *   { "extends": ["//"],
 *     "tasks": { "test": { "inputs": ["$TURBO_EXTENDS$", "$TURBO_ROOT$/migrations/**"] } } }
 *
 * `$TURBO_EXTENDS$` keeps the root task's inputs; without it (or `$TURBO_DEFAULT$`) the package
 * list REPLACES them and the package's own source drops out of the cache key.
 *
 * ── WHAT IT DETECTS ─────────────────────────────────────────────────────────────
 * A static scan of every test file under packages/ for paths that climb to the repo root:
 *   - a literal like '../../../../metadata/x' or new URL('../../../../metadata/x', import.meta.url)
 *   - a run of '..' arguments, e.g. join(__dirname, '..', '..', '..', '..', 'migrations')
 *   - a variable bound to the repo root (const ROOT = resolve(__dirname, '../../../..')) and
 *     later joined with a literal: join(ROOT, 'metadata/agents')
 * A climb is measured from the test file's directory, or from the package directory when the
 * base is process.cwd() (vitest runs from the package). The first path segment below the root
 * must name a directory at the repo root other than packages/ (cross-package reads are covered
 * by turbo's dependency graph or are out of scope here).
 *
 * It is a lower bound, not a proof: a test that finds the root by walking up at runtime, or
 * reads root data through a helper in src/, is not detected. Declare those by hand.
 *
 * Usage:
 *   node .github/scripts/check-turbo-root-inputs.mjs          # this repository
 *   node .github/scripts/check-turbo-root-inputs.mjs <root>   # another checkout (tests use this)
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep } from 'node:path';

const RED = '\x1b[0;31m', GREEN = '\x1b[0;32m', NC = '\x1b[0m';
const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage']);
const NOT_ROOT_DATA = new Set(['packages', 'node_modules', '.git']);
const KEEP_ROOT_INPUTS = ['$TURBO_EXTENDS$', '$TURBO_DEFAULT$'];

/**
 * Split source into string literals and the code between them, dropping comments, so a path
 * in a comment is never read as a path in code.
 * @param {string} source
 * @returns {{ type: 'str' | 'tpl' | 'code', value: string }[]}
 */
export function tokenize(source) {
    const tokens = [];
    let code = '';
    let i = 0;
    const flush = () => {
        if (code) tokens.push({ type: 'code', value: code });
        code = '';
    };
    while (i < source.length) {
        const c = source[i];
        const next = source[i + 1];
        if (c === '/' && next === '/') {
            const end = source.indexOf('\n', i);
            i = end === -1 ? source.length : end;
        } else if (c === '/' && next === '*') {
            const end = source.indexOf('*/', i + 2);
            i = end === -1 ? source.length : end + 2;
            code += ' ';
        } else if (c === "'" || c === '"' || c === '`') {
            flush();
            let j = i + 1;
            let value = '';
            while (j < source.length && source[j] !== c) {
                if (source[j] === '\\') {
                    value += source[j + 1] ?? '';
                    j += 2;
                } else {
                    value += source[j];
                    j += 1;
                }
            }
            tokens.push({ type: c === '`' ? 'tpl' : 'str', value });
            i = j + 1;
        } else {
            code += c;
            i += 1;
        }
    }
    flush();
    return tokens;
}

/** Leading '..' segments of a path literal, and what follows them. Null when it does not start with '..'. */
function splitUps(value) {
    const parts = value.split('/');
    let ups = 0;
    while (ups < parts.length && parts[ups] === '..') ups += 1;
    if (ups === 0) return null;
    return { ups, rest: parts.slice(ups).filter((p) => p !== '' && p !== '.') };
}

const isCommaOnly = (token) => token?.type === 'code' && /^\s*,\s*$/.test(token.value);

/**
 * Repo-root directories a test file's source reads.
 * @param {string} source the test file's text
 * @param {{ fileDepth: number, packageDepth: number, rootDirs: Set<string> }} ctx
 *   fileDepth / packageDepth: path segments from the repo root to the test file's directory /
 *   the package directory; rootDirs: directory names at the repo root that count as data.
 * @returns {Set<string>}
 */
export function findRootReads(source, { fileDepth, packageDepth, rootDirs }) {
    const tokens = tokenize(source);
    const found = new Set();
    const rootVars = new Set();
    const record = (segments) => {
        if (segments.length && rootDirs.has(segments[0])) found.add(segments[0]);
    };

    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type !== 'str') continue;
        const first = splitUps(tokens[i].value);
        if (!first) continue;
        // Extend across a comma-separated run: '..', '..', '../..', 'metadata'.
        let ups = first.ups;
        let rest = first.rest;
        let j = i;
        while (rest.length === 0 && isCommaOnly(tokens[j + 1]) && tokens[j + 2]?.type === 'str') {
            const more = splitUps(tokens[j + 2].value);
            j += 2;
            if (more) {
                ups += more.ups;
                rest = more.rest;
            } else {
                rest = tokens[j].value.split('/').filter((p) => p !== '' && p !== '.');
                break;
            }
        }
        const before = tokens[i - 1]?.type === 'code' ? tokens[i - 1].value : '';
        // The base of the climb is whatever the current statement passed before it.
        const statement = before.slice(Math.max(before.lastIndexOf(';'), before.lastIndexOf('{'), before.lastIndexOf('}')) + 1);
        const depth = /process\.cwd\(\)/.test(statement) ? packageDepth : fileDepth;
        if (ups === depth) {
            if (rest.length) {
                record(rest);
            } else {
                const binding = before.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=[^;=]*$/);
                if (binding) rootVars.add(binding[1]);
            }
        }
        i = j;
    }

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type === 'code' && tokens[i + 1]?.type === 'str') {
            const m = t.value.match(/([A-Za-z_$][\w$]*)\s*,\s*$/);
            if (m && rootVars.has(m[1])) record(tokens[i + 1].value.split('/').filter(Boolean));
        } else if (t.type === 'tpl') {
            for (const m of t.value.matchAll(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}\/([^/$]+)/g)) {
                if (rootVars.has(m[1])) record([m[2]]);
            }
        }
    }
    return found;
}

/**
 * The repo-root directories a package's turbo.json declares as `test` inputs, and whether it
 * keeps the root task's inputs. Null when the package has no turbo.json.
 * @returns {{ declared: Set<string>, keepsRootInputs: boolean, extendsRoot: boolean } | null}
 */
export function readPackageTurbo(packageDir) {
    const file = join(packageDir, 'turbo.json');
    if (!existsSync(file)) return null;
    const json = JSON.parse(readFileSync(file, 'utf8'));
    const inputs = json.tasks?.test?.inputs;
    const declared = new Set();
    for (const input of Array.isArray(inputs) ? inputs : []) {
        const m = typeof input === 'string' && input.match(/^\$TURBO_ROOT\$\/([^/]+)/);
        if (m) declared.add(m[1]);
    }
    return {
        declared,
        keepsRootInputs: !Array.isArray(inputs) || inputs.some((x) => KEEP_ROOT_INPUTS.includes(x)),
        extendsRoot: Array.isArray(json.extends) && json.extends.includes('//'),
    };
}

/** Every test file under `dir`, skipping build output and dependencies. */
function listTestFiles(dir, out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) listTestFiles(full, out);
        else if (TEST_FILE.test(entry.name)) out.push(full);
    }
    return out;
}

/** Nearest ancestor of `fileDir` (inclusive) holding a package.json, stopping at `stop`. */
function owningPackage(fileDir, stop) {
    let dir = fileDir;
    while (dir.startsWith(stop) && dir !== stop) {
        if (existsSync(join(dir, 'package.json'))) return dir;
        dir = dirname(dir);
    }
    return null;
}

const depthOf = (repoRoot, dir) => relative(repoRoot, dir).split(sep).filter(Boolean).length;

/**
 * Scan a repository. Returns one entry per package whose tests read root data it does not
 * declare, or whose turbo.json drops the root task's inputs.
 * @param {string} repoRoot
 * @returns {{ packageDir: string, missing: { dir: string, files: string[] }[], dropsRootInputs: boolean }[]}
 */
export function checkRepo(repoRoot) {
    const rootDirs = new Set(
        readdirSync(repoRoot, { withFileTypes: true })
            .filter((e) => e.isDirectory() && !NOT_ROOT_DATA.has(e.name))
            .map((e) => e.name),
    );
    const packagesDir = join(repoRoot, 'packages');
    /** @type {Map<string, Map<string, string[]>>} package dir -> root dir -> test files */
    const reads = new Map();
    for (const file of listTestFiles(packagesDir)) {
        const pkg = owningPackage(dirname(file), packagesDir);
        if (!pkg) continue;
        const dirs = findRootReads(readFileSync(file, 'utf8'), {
            fileDepth: depthOf(repoRoot, dirname(file)),
            packageDepth: depthOf(repoRoot, pkg),
            rootDirs,
        });
        for (const d of dirs) {
            if (!reads.has(pkg)) reads.set(pkg, new Map());
            const byDir = reads.get(pkg);
            byDir.set(d, [...(byDir.get(d) ?? []), relative(repoRoot, file)]);
        }
    }

    const problems = [];
    for (const [pkg, byDir] of [...reads].sort(([a], [b]) => a.localeCompare(b))) {
        const turbo = readPackageTurbo(pkg);
        const declared = turbo && turbo.extendsRoot ? turbo.declared : new Set();
        const missing = [...byDir]
            .filter(([d]) => !declared.has(d))
            .map(([dir, files]) => ({ dir, files }))
            .sort((a, b) => a.dir.localeCompare(b.dir));
        const dropsRootInputs = turbo !== null && !turbo.keepsRootInputs;
        if (missing.length || dropsRootInputs) problems.push({ packageDir: relative(repoRoot, pkg), missing, dropsRootInputs });
    }
    return problems;
}

function main(argv) {
    const repoRoot = argv[0] ? resolve(argv[0]) : DEFAULT_ROOT;
    const problems = checkRepo(repoRoot);
    if (!problems.length) {
        console.log(`${GREEN}✓ every package whose tests read repo-root data declares it as a turbo test input${NC}`);
        return 0;
    }
    for (const p of problems) {
        console.log(`${RED}✗ ${p.packageDir}${NC}`);
        if (p.dropsRootInputs) {
            console.log(`    turbo.json sets test.inputs without "$TURBO_EXTENDS$" (or "$TURBO_DEFAULT$"), so the package's own source is not in the cache key`);
        }
        for (const m of p.missing) {
            console.log(`    reads ${m.dir}/ but test.inputs has no "$TURBO_ROOT$/${m.dir}/..." entry:`);
            for (const f of m.files) console.log(`      ${f}`);
        }
    }
    console.log(`
${RED}Repo-root data missing from turbo test inputs${NC}

Turbo caches a package's test result on the package's own files. A test reading repo-root
data keeps replaying its cached pass after that data changes. Add (or extend) the package's
turbo.json:

  {
    "$schema": "https://turborepo.com/schema.json",
    "extends": ["//"],
    "tasks": { "test": { "inputs": ["$TURBO_EXTENDS$", "$TURBO_ROOT$/<dir>/**"] } }
  }

A narrower glob under the same directory (e.g. "$TURBO_ROOT$/scripts/one-file.sql") also satisfies
this check.`);
    return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exit(main(process.argv.slice(2)));
}
