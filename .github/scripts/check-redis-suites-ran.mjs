#!/usr/bin/env node
/**
 * Fails when the RedisProvider integration suites skipped instead of running.
 *
 * Those files are gated `describe.skipIf(!REDIS_URL)`. A gate like that turns a missing service
 * into a green run: vitest reports the file as passed with every test skipped, and the workflow
 * summary looks the same as a real pass. That is how the shared-cache behaviour they pin — pub/sub
 * delivery, TTL, the key lock, leases — went a release with no CI coverage, while the branch that
 * introduced them reported a full green suite from a developer machine where Redis happened to be
 * running.
 *
 * Run after the shard's tests. Re-runs the two files with a reporter we can read, and requires a
 * non-zero passed count and zero skipped.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join('packages', 'RedisProvider', 'src', '__tests__');

/**
 * The gated files, discovered rather than listed.
 *
 * A hardcoded list couples this gate to whichever branch happens to be merged: a file named here
 * but not yet in the tree makes `vitest run` fail for everyone, and a file added later is silently
 * not covered. Both failure modes point the wrong way for a gate whose whole job is to notice
 * missing coverage. The naming convention (`integration-*.test.ts`) is the contract instead.
 */
function gatedFiles() {
    const found = readdirSync(TEST_DIR)
        .filter(name => name.startsWith('integration-') && name.endsWith('.test.ts'))
        .sort();
    if (found.length === 0) {
        console.error(`::error::No integration-*.test.ts files found in ${TEST_DIR}. This gate exists to prove ` +
            'the Redis-gated suites ran; with nothing to run it is misconfigured, not satisfied.');
        process.exit(1);
    }
    return found.map(name => `src/__tests__/${name}`);
}

const FILES = gatedFiles();
console.log(`Redis-gated files discovered: ${FILES.join(', ')}`);

if (!process.env.REDIS_URL) {
    console.error('::error::REDIS_URL is not set for this job — the Redis-gated suites would skip. Add the redis service to this workflow.');
    process.exit(1);
}

/**
 * The JSON report embedded in vitest's output, or null when there is none to read.
 *
 * The report is not the whole of stdout: on a failure pnpm appends its own `ERR_PNPM_…` banner
 * after it, so slicing from the first `{` to the end does not parse and the failure list comes back
 * empty — which reads as "nothing failed" in exactly the situation where something did. Find the
 * object's own end by matching braces, ignoring any inside strings.
 */
function parseReport(output) {
    const start = output?.indexOf('{') ?? -1;
    if (start < 0) {
        return null;
    }
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < output.length; i++) {
        const ch = output[i];
        if (inString) {
            if (escaped) { escaped = false; } else if (ch === '\\') { escaped = true; } else if (ch === '"') { inString = false; }
            continue;
        }
        if (ch === '"') { inString = true; } else if (ch === '{') { depth++; } else if (ch === '}' && --depth === 0) {
            try {
                return JSON.parse(output.slice(start, i + 1));
            } catch {
                return null;
            }
        }
    }
    return null;
}

/**
 * Names the tests that failed, one per line.
 *
 * The raw JSON report is tens of thousands of characters of stack traces — printing it whole buries
 * the actual failure in a log nobody scrolls, which defeats the purpose of a gate that exists to
 * make a problem visible.
 */
function describeFailures(report) {
    const failures = (report?.testResults ?? []).flatMap(file =>
        (file.assertionResults ?? [])
            .filter(t => t.status === 'failed')
            .map(t => `  ${t.fullName}: ${(t.failureMessages?.[0] ?? '').split('\n')[0]}`));
    return failures.length > 0 ? failures.join('\n') : '  (no individual test failed — the run itself did not start)';
}

let raw;
try {
    raw = execFileSync('pnpm', [
        '--filter', '@memberjunction/redis-provider', 'exec',
        'vitest', 'run', ...FILES, '--reporter=json',
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
    const report = parseReport(e.stdout);
    console.error('::error::The Redis-gated suites failed to run. Is the redis service healthy and is REDIS_URL pointing at it?');
    console.error(describeFailures(report));
    process.exit(1);
}

const report = parseReport(raw);
if (!report) {
    console.error('::error::Could not read the vitest JSON report, so whether the Redis-gated suites ran is unknown. Treating that as a failure.');
    process.exit(1);
}
const passed = report.numPassedTests ?? 0;
const skipped = (report.numPendingTests ?? 0) + (report.numTodoTests ?? 0);

console.log(`Redis-gated suites: ${passed} passed, ${skipped} skipped`);
if (skipped > 0 || passed === 0) {
    console.error(`::error::Expected the Redis-gated suites to run (got ${passed} passed, ${skipped} skipped). ` +
        'A skipped suite is not a passing suite — check that the redis service is healthy and REDIS_URL points at it.');
    process.exit(1);
}
