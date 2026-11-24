#!/usr/bin/env node
/**
 * Guards against running Vitest worker_threads (`pool: 'threads'`) on packages whose tests
 * mutate `process.env.TZ` or call `process.chdir()`.
 *
 * Why this matters:
 *  - Node ignores `process.env.TZ` assignments made inside a `worker_threads` worker; the worker
 *    keeps the main thread's timezone, so timezone tests either fail on UTC runners or (worse)
 *    silently pass on a matching timezone without exercising the timezone under test.
 *  - `process.chdir()` throws ERR_WORKER_UNSUPPORTED_OPERATION inside worker_threads.
 *
 * Scans `vitest.shared.ts` and every `packages/<...>/vitest.config.*`. Any package that runs
 * with `pool: 'threads'` (explicitly, or inherited from `vitest.shared.ts` without overriding to
 * `'forks'`) is checked across its test files for `process.env.TZ` writes and `process.chdir(`.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '..', '..');

const VITEST_CONFIG_RE = /^vitest\.config\.(ts|mts|js|mjs|cjs)$/;
const TEST_FILE_RE = /\.(test|spec)\.(ts|mts|tsx|js|mjs|cjs)$/;

/** Strip single-line and block comments so prose/comments never trigger false positives. */
function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
}

/** Detect explicit `pool: 'threads'` or `pool: 'forks'` in a vitest config file. */
export function detectPoolSetting(configText) {
    const cleaned = stripComments(configText);
    const matches = [...cleaned.matchAll(/\bpool\s*:\s*['"](threads|forks|vmThreads|vmForks)['"]/g)];
    if (matches.length === 0) return null;
    // Last occurrence wins when a config merges/overrides a pool setting.
    return matches[matches.length - 1][1];
}

/** Detect `process.env.TZ = ...`, `delete process.env.TZ`, or `process.chdir(...)` in source. */
export function findThreadUnsafeCalls(sourceText) {
    const cleaned = stripComments(sourceText);
    const findings = [];
    const lines = cleaned.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/\bprocess\.env(?:\.TZ|\[['"]TZ['"]\])\s*=[^=]/.test(line) || /\bdelete\s+process\.env(?:\.TZ|\[['"]TZ['"]\])/.test(line)) {
            findings.push({ line: i + 1, reason: 'mutates process.env.TZ (ignored inside worker_threads)' });
        }
        if (/\bprocess\.chdir\s*\(/.test(line)) {
            findings.push({ line: i + 1, reason: 'calls process.chdir() (unsupported inside worker_threads)' });
        }
    }
    return findings;
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

/**
 * Scan a repo root and return any violations `{ packageDir, configPath, filePath, line, reason }`.
 */
export function checkVitestThreadsSafety(repoRoot = DEFAULT_ROOT) {
    const sharedPath = join(repoRoot, 'vitest.shared.ts');
    const sharedPool = existsSync(sharedPath) ? detectPoolSetting(readFileSync(sharedPath, 'utf8')) : null;
    const sharedUsesThreads = sharedPool === 'threads';

    const packagesRoot = join(repoRoot, 'packages');
    const configFiles = walkFiles(packagesRoot, (name) => VITEST_CONFIG_RE.test(name));
    const violations = [];
    let threadsPackageCount = 0;

    for (const configPath of configFiles) {
        const configText = readFileSync(configPath, 'utf8');
        const explicitPool = detectPoolSetting(configText);
        const importsShared = /vitest\.shared/.test(configText);
        const importsDomShared = /vitest\.dom\.shared/.test(configText);

        // DOM preset always pins forks; a package uses threads if it explicitly declares
        // `pool: 'threads'` OR inherits it from `vitest.shared.ts` without overriding.
        const usesThreads =
            explicitPool === 'threads' ||
            (explicitPool === null && !importsDomShared && importsShared && sharedUsesThreads);

        if (!usesThreads) continue;
        threadsPackageCount++;

        const packageDir = dirname(configPath);
        const testFiles = walkFiles(packageDir, (name) => TEST_FILE_RE.test(name));
        for (const filePath of testFiles) {
            const findings = findThreadUnsafeCalls(readFileSync(filePath, 'utf8'));
            for (const f of findings) {
                violations.push({
                    packageDir: relative(repoRoot, packageDir),
                    configPath: relative(repoRoot, configPath),
                    filePath: relative(repoRoot, filePath),
                    line: f.line,
                    reason: f.reason,
                });
            }
        }
    }

    return { threadsPackageCount, totalConfigs: configFiles.length, violations };
}

function main() {
    const repoRoot = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_ROOT;
    const { threadsPackageCount, totalConfigs, violations } = checkVitestThreadsSafety(repoRoot);
    if (violations.length > 0) {
        console.error(
            `❌ Vitest threads safety violations (${violations.length}) across ${threadsPackageCount} threads-enabled package(s):`,
        );
        for (const v of violations) {
            console.error(`  ${v.filePath}:${v.line} — ${v.reason} (config: ${v.configPath})`);
        }
        console.error('\nFix: keep pool: "forks" for this package, or remove the worker_threads-unsafe call.');
        process.exit(1);
    }
    console.log(
        `✓ Vitest threads safety check passed (${threadsPackageCount}/${totalConfigs} packages use pool: 'threads', 0 violations).`,
    );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
    main();
}
