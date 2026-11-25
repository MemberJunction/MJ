#!/usr/bin/env node
/**
 * Keeps Vitest worker_threads (`pool: 'threads'`) strictly opt-in, and only for packages that
 * have proven they are safe on it.
 *
 * Every package runs on Vitest's default `forks` pool today. `threads` is opt-in only, because
 * it has failed in ways a local run cannot predict:
 *  - On the Linux CI runners, worker_threads segfaulted (exit 139) pure-JS packages too:
 *    ai-agents, task-graph (mid-run, not at teardown) and codegen-lib. macOS never reproduced it.
 *  - Node ignores `process.env.TZ` writes (and `vi.stubEnv('TZ', …)`) inside a worker: the worker
 *    keeps the main thread's timezone, so timezone tests fail on UTC runners or silently pass
 *    without exercising the zone under test.
 *  - `process.chdir()` throws ERR_WORKER_UNSUPPORTED_OPERATION inside a worker.
 *  - `process.cpuUsage()` reports CPU for the whole PROCESS, which under threads includes every
 *    other worker running test files at the same time, so CPU-timing assertions see inflated,
 *    noisy numbers (generic-database-provider's linear-time test failed every time this way).
 *
 * So the guard enforces:
 *  1. `vitest.shared.ts` must not select `threads`. A shared opt-in would move ~300 packages at
 *     once; opt in one package at a time instead.
 *  2. A package that selects `threads` must be listed in `vitest-threads-allowlist.json` with the
 *     URL of a green full Linux CI run (`turbo run test --continue`) that ran it on threads.
 *     An allowlist entry for a package that no longer selects threads is stale and also fails.
 *  3. No package that runs on threads (explicitly, or inherited from `vitest.shared.ts`) may
 *     touch the APIs above in its tests, setup files or test helpers.
 *
 * Inheritance is conservative: a config that imports `vitest.shared` inherits its pool unless it
 * is a single-preset config with its own explicit pool. A dual-preset config (one `projects[]`
 * entry on `vitest.shared`, another on `vitest.dom.shared`) always counts as inheriting, because
 * an explicit pool in one project says nothing about the other.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '..', '..');
export const DEFAULT_ALLOWLIST_PATH = join(HERE, 'vitest-threads-allowlist.json');

const VITEST_CONFIG_RE = /^vitest\.config\.(ts|mts|js|mjs|cjs)$/;
const CODE_FILE_RE = /\.(ts|mts|cts|tsx|js|mjs|cjs)$/;
const TEST_FILE_RE = /\.(test|spec)\.(ts|mts|cts|tsx|js|mjs|cjs)$/;
/** Directories whose code only ever runs under the test runner. */
const TEST_DIR_NAMES = new Set(['__tests__', '__mocks__', '__fixtures__', 'test', 'tests', 'test-utils', 'testing']);
/** Setup and helper files that can live next to the source (e.g. `src/test-setup.ts`). */
const TEST_SUPPORT_NAME_RE = /(^|[.\-_])(setup|global-?setup|helpers?|test-?utils?|fixtures?)\.(ts|mts|cts|tsx|js|mjs|cjs)$/i;
/** Proof of a green Linux run: a GitHub Actions run URL in this repository. */
const PROOF_URL_RE = /^https:\/\/github\.com\/MemberJunction\/MJ\/actions\/runs\/\d+/;

/**
 * Strip single-line and block comments so prose never triggers a false positive. Block comments
 * keep their newlines, so line numbers reported against the stripped text match the source.
 */
export function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ''))
        .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
}

/** Every explicit `pool: '<name>'` in a vitest config, in source order. */
export function detectPoolSettings(configText) {
    const cleaned = stripComments(configText);
    return [...cleaned.matchAll(/\bpool\s*:\s*['"](threads|forks|vmThreads|vmForks)['"]/g)].map((m) => m[1]);
}

/** The effective explicit pool of a single-preset config (last one wins), or null. */
export function detectPoolSetting(configText) {
    const pools = detectPoolSettings(configText);
    return pools.length === 0 ? null : pools[pools.length - 1];
}

const UNSAFE_PATTERNS = [
    {
        re: /\bprocess\.env(?:\.TZ|\[\s*['"]TZ['"]\s*\])\s*=[^=]/,
        reason: 'mutates process.env.TZ (ignored inside worker_threads)',
    },
    {
        re: /\bdelete\s+process\.env(?:\.TZ|\[\s*['"]TZ['"]\s*\])/,
        reason: 'mutates process.env.TZ (ignored inside worker_threads)',
    },
    {
        re: /\bvi\.stubEnv\s*\(\s*['"`]TZ['"`]/,
        reason: "vi.stubEnv('TZ') (ignored inside worker_threads)",
    },
    {
        re: /\bprocess\.chdir\s*\(/,
        reason: 'calls process.chdir() (unsupported inside worker_threads)',
    },
    {
        re: /\bprocess\.cpuUsage\s*\(/,
        reason: 'calls process.cpuUsage() (process-wide: counts every concurrent worker thread)',
    },
];

/** Find worker_threads-unsafe calls in source. Returns `{ line, reason }` with 1-based lines. */
export function findThreadUnsafeCalls(sourceText) {
    const lines = stripComments(sourceText).split('\n');
    const findings = [];
    for (let i = 0; i < lines.length; i++) {
        for (const { re, reason } of UNSAFE_PATTERNS) {
            if (re.test(lines[i])) findings.push({ line: i + 1, reason });
        }
    }
    return findings;
}

/**
 * Decide whether a package config runs (some of) its tests on threads.
 * Returns `{ usesThreads, explicit }`; `explicit` is true when the config itself names `threads`.
 */
export function classifyConfig(configText, sharedUsesThreads) {
    const cleaned = stripComments(configText);
    const pools = detectPoolSettings(configText);
    if (pools.includes('threads')) return { usesThreads: true, explicit: true };

    const importsNodeShared = /vitest\.shared\b/.test(cleaned);
    if (!importsNodeShared || !sharedUsesThreads) return { usesThreads: false, explicit: false };

    const isDualPreset = /vitest\.dom\.shared\b/.test(cleaned);
    const overridesPool = pools.length > 0 && !isDualPreset;
    return { usesThreads: !overridesPool, explicit: false };
}

/** Recursively walk `dir`, skipping build output and dependencies. */
function walkFiles(dir, predicate, out = []) {
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git' || entry.name === 'generated') {
            continue;
        }
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walkFiles(full, predicate, out);
        else if (predicate(entry.name, full)) out.push(full);
    }
    return out;
}

/** True for test files, setup files and helpers — anything that executes inside a test worker. */
export function isTestSupportFile(fileName, relPath) {
    if (!CODE_FILE_RE.test(fileName)) return false;
    if (TEST_FILE_RE.test(fileName) || TEST_SUPPORT_NAME_RE.test(fileName)) return true;
    const segments = relPath.split(/[\\/]/).slice(0, -1);
    return segments.some((s) => TEST_DIR_NAMES.has(s));
}

/** String-literal `setupFiles` / `globalSetup` entries named in a config, resolved to absolute paths. */
function referencedSetupFiles(configText, packageDir) {
    const cleaned = stripComments(configText);
    const out = [];
    for (const block of cleaned.matchAll(/\b(?:setupFiles|globalSetup)\s*:\s*(\[[^\]]*\]|['"][^'"]+['"])/g)) {
        for (const lit of block[1].matchAll(/['"]([^'"]+)['"]/g)) {
            const abs = resolve(packageDir, lit[1]);
            if (existsSync(abs)) out.push(abs);
        }
    }
    return out;
}

/** Load the opt-in allowlist: `{ packages: { "<packageDir>": { linuxRun, ... } } }`. */
export function loadAllowlist(allowlistPath = DEFAULT_ALLOWLIST_PATH) {
    if (!existsSync(allowlistPath)) return {};
    const parsed = JSON.parse(readFileSync(allowlistPath, 'utf8'));
    return parsed?.packages ?? {};
}

/**
 * Scan a repo root. Returns `{ threadsPackageCount, totalConfigs, threadsPackages, violations }`;
 * each violation is `{ filePath, line, reason, configPath? }`.
 */
export function checkVitestThreadsSafety(repoRoot = DEFAULT_ROOT, { allowlistPath = DEFAULT_ALLOWLIST_PATH } = {}) {
    const violations = [];
    const sharedPath = join(repoRoot, 'vitest.shared.ts');
    const sharedText = existsSync(sharedPath) ? readFileSync(sharedPath, 'utf8') : '';
    const sharedUsesThreads = detectPoolSettings(sharedText).includes('threads');
    if (sharedUsesThreads) {
        const line = stripComments(sharedText).split('\n').findIndex((l) => /\bpool\s*:\s*['"]threads['"]/.test(l)) + 1;
        violations.push({
            filePath: 'vitest.shared.ts',
            line,
            reason: "the shared preset selects pool: 'threads' — keep it on forks and opt packages in one at a time",
        });
    }

    const allowlist = loadAllowlist(allowlistPath);
    const configFiles = walkFiles(join(repoRoot, 'packages'), (name) => VITEST_CONFIG_RE.test(name));
    const threadsPackages = [];

    for (const configPath of configFiles) {
        const configText = readFileSync(configPath, 'utf8');
        const { usesThreads, explicit } = classifyConfig(configText, sharedUsesThreads);
        if (!usesThreads) continue;

        const packageDir = dirname(configPath);
        const packageRel = relative(repoRoot, packageDir).split('\\').join('/');
        const configRel = relative(repoRoot, configPath).split('\\').join('/');
        threadsPackages.push(packageRel);

        if (explicit) {
            const proof = allowlist[packageRel]?.linuxRun;
            if (typeof proof !== 'string' || !PROOF_URL_RE.test(proof)) {
                violations.push({
                    filePath: configRel,
                    line: stripComments(configText).split('\n').findIndex((l) => /\bpool\s*:\s*['"]threads['"]/.test(l)) + 1,
                    reason:
                        "opts into pool: 'threads' without proof — add it to .github/scripts/vitest-threads-allowlist.json " +
                        'with the URL of a green full Linux CI run (turbo run test --continue) that ran it on threads',
                    configPath: configRel,
                });
            }
        }

        const files = new Set([
            ...walkFiles(packageDir, (name, full) => isTestSupportFile(name, relative(packageDir, full))),
            ...referencedSetupFiles(configText, packageDir),
        ]);
        for (const filePath of [...files].sort()) {
            for (const f of findThreadUnsafeCalls(readFileSync(filePath, 'utf8'))) {
                violations.push({
                    filePath: relative(repoRoot, filePath).split('\\').join('/'),
                    line: f.line,
                    reason: f.reason,
                    configPath: configRel,
                });
            }
        }
    }

    const threadsSet = new Set(threadsPackages);
    for (const listed of Object.keys(allowlist)) {
        if (!threadsSet.has(listed)) {
            violations.push({
                filePath: relative(repoRoot, allowlistPath).split('\\').join('/'),
                line: 0,
                reason: `stale allowlist entry "${listed}": that package does not select pool: 'threads' — remove the entry`,
            });
        }
    }

    return { threadsPackageCount: threadsPackages.length, totalConfigs: configFiles.length, threadsPackages, violations };
}

function main() {
    const repoRoot = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_ROOT;
    const { threadsPackageCount, totalConfigs, violations } = checkVitestThreadsSafety(repoRoot);
    if (violations.length > 0) {
        console.error(
            `❌ Vitest threads safety violations (${violations.length}) across ${threadsPackageCount} threads-enabled package(s):`,
        );
        for (const v of violations) {
            const where = v.configPath ? ` (config: ${v.configPath})` : '';
            console.error(`  ${v.filePath}:${v.line} — ${v.reason}${where}`);
        }
        console.error('\nFix: keep the package on the default forks pool, or remove the worker_threads-unsafe call.');
        process.exit(1);
    }
    console.log(
        `✓ Vitest threads safety check passed (${threadsPackageCount}/${totalConfigs} packages use pool: 'threads', 0 violations).`,
    );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
    main();
}
