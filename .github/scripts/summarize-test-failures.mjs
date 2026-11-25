#!/usr/bin/env node
/**
 * Turn a failed shard's test output into a short digest for the job summary.
 *
 * WHY THIS EXISTS
 * A red `Unit tests (shard N/6)` gives you a job log tens of thousands of lines long, and the
 * lines that say what actually happened are not the ones you would grep for. Three real cases
 * from a single day of triage:
 *
 *   1. `@memberjunction/codegen-lib` exited 1 with **zero failing tests**: the suite printed
 *      `Tests 1995 passed | 66 skipped` and `Errors 1 error`, that error being
 *      `[vitest-worker]: Timeout calling "onTaskUpdate"`. Grepping for `✕`, `FAIL ` or
 *      `N failed` returns NOTHING for that shape, which reads like "no failure in the log".
 *   2. `MJCoreEntities` failed one test on `Test timed out in 5000ms` while 1248 passed, on a
 *      runner where `import` took 62s against 9.5s of actual test time.
 *   3. A `RealtimeRelay` assertion mismatch (`expected 1014 to be 1009`) — a genuine race in
 *      the test's own expectation, not load.
 *
 * Only (3) is a defect in the diff. Telling them apart is mechanical, so do it here rather than
 * by hand.
 *
 * DESIGN NOTE: this does NOT try to attribute output to packages. `turbo run test` streams the
 * child output unprefixed, so the vitest counters and the package name arrive in different
 * places. What the log *does* carry reliably is turbo's own `Failed:  <pkg>#test` line, so the
 * digest reports the counters it finds plus the packages turbo names, and leaves the pairing to
 * the reader. Guessing the pairing produced a confidently wrong package name in testing.
 *
 * Deliberately NOT a gate: it never changes the job's outcome, it only explains it.
 */
import { readFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) {
    console.error('usage: summarize-test-failures.mjs <log-file>');
    process.exit(2);
}

let raw;
try {
    raw = readFileSync(path, 'utf8');
} catch {
    // No log means the step died before the suite ran (install, build, shard planner). Say so,
    // rather than printing an empty digest that reads like "nothing went wrong".
    console.log(`No test log at \`${path}\` — the shard failed before the suites produced output.`);
    process.exit(0);
}

// Strip colour. Real CI output carries actual ESC bytes; a log captured through `gh run view`
// carries the two-character `^[` form instead, so handle both.
const text = raw.replace(/\u001b\[[0-9;]*m/g, '').replace(/\^\[\[[0-9;]*m/g, '');

const all = (re) => [...text.matchAll(re)];
const uniq = (xs) => [...new Set(xs)];

// Pair each summary's counters by scanning FORWARD from its own "Test Files" line, not by
// index across separate whole-file scans. Vitest emits Test Files / Tests / Type Errors /
// Errors / Start at / Duration as one contiguous block, but a run can print several blocks and
// some omit `Errors` entirely — so index-pairing silently shows one suite's files against
// another's tests. (It did exactly that in testing: a 1-test block was reported with the
// counters of the 2061-test suite that actually failed.)
const lines = text.split('\n');
const summaries = [];
for (let i = 0; i < lines.length; i++) {
    const files = lines[i].match(/^ *Test Files {2,}(.*)$/);
    if (!files) continue;
    const block = { files: files[1].trim(), tests: '', errors: '', duration: '' };
    for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const t = lines[j].match(/^ *Tests {2,}(.*)$/);
        const e = lines[j].match(/^ *Errors {2,}(.*)$/);
        const d = lines[j].match(/^ *Duration {2,}(.*)$/);
        if (t && !block.tests) block.tests = t[1].trim();
        if (e && !block.errors) block.errors = e[1].trim();
        if (d && !block.duration) block.duration = d[1].trim();
        if (lines[j].match(/^ *Test Files {2,}/)) break;
    }
    summaries.push(block);
}
/**
 * `|` would break out of a markdown table cell, and vitest prints it inside the counter lines
 * ("125 passed | 6 skipped"). Substitute the HTML entity rather than backslash-escaping: the
 * input can contain backslashes (Windows paths, regexes in test names), and a `\`-escape that
 * does not ALSO escape backslashes is incomplete — `\|` would become `\\|`, which renders as a
 * literal backslash plus an unescaped pipe and breaks the cell anyway. CodeQL flagged exactly
 * that (`js/incomplete-sanitization`). An entity introduces no escape character, so there is
 * nothing to double-escape; it renders as `|`.
 */
const cell = (s) => (s ? s.replace(/\|/g, '&#124;') : '—');
const turboFailed = uniq(all(/^Failed: {2,}(.+)$/gm).map((m) => m[1].trim()));
const cmdErrors = uniq(all(/command finished with error: command \(([^)]+)\)/g).map((m) => m[1].trim()));
const timeouts = all(/Test timed out in (\d+)ms/g).map((m) => m[1]);
const hookTimeouts = all(/Hook timed out in (\d+)ms/g).map((m) => m[1]);
const workerErrors = uniq(all(/\[vitest-worker\]: *(.+)/g).map((m) => m[1].trim()));
const failLines = uniq(all(/^ ?FAIL {2,}(.+)$/gm).map((m) => m[1].trim()));

const failingSummaries = summaries.filter((s) => /\d+ failed/.test(s.tests) || /\d+ error/.test(s.errors));
const totalFailedTests = failingSummaries.reduce(
    (n, s) => n + Number(s.tests.match(/(\d+) failed/)?.[1] ?? 0),
    0
);
const totalErrors = failingSummaries.reduce(
    (n, s) => n + Number(s.errors.match(/(\d+) error/)?.[1] ?? 0),
    0
);

const out = ['## Test failure digest', ''];

if (turboFailed.length) out.push(`**turbo reports failed:** \`${turboFailed.join('`, `')}\``);
else if (cmdErrors.length) out.push(`**failed in:** \`${cmdErrors.join('`, `')}\``);
if (turboFailed.length || cmdErrors.length) out.push('');

if (!failingSummaries.length) {
    out.push(
        'No suite printed a failing vitest summary. Look earlier in the log for an install, ' +
            'build, or shard-planner error — the shard failed before or outside the test run.'
    );
} else {
    out.push('| Test Files | Tests | Errors |', '| --- | --- | --- |');
    for (const s of failingSummaries) {
        out.push(`| ${cell(s.files)} | ${cell(s.tests)} | ${cell(s.errors)} |`);
    }
    out.push('');

    if (totalFailedTests === 0 && totalErrors > 0) {
        out.push(
            '> ### No test failed',
            '>',
            '> The suite reported an unhandled error with a passing test count, so this is an ' +
                'infrastructure signal — a worker that lost its IPC heartbeat, or an unhandled ' +
                'rejection — not a defect in the diff. Re-running the failed jobs is usually the ' +
                'right response.',
            ''
        );
    }
}

if (workerErrors.length) {
    out.push(`- **worker error:** \`${workerErrors.join('`, `')}\``);
}
if (timeouts.length || hookTimeouts.length) {
    const parts = [];
    if (timeouts.length) parts.push(`${timeouts.length} test timeout(s) at ${uniq(timeouts).join('/')}ms`);
    if (hookTimeouts.length) parts.push(`${hookTimeouts.length} hook timeout(s) at ${uniq(hookTimeouts).join('/')}ms`);
    out.push(`- **${parts.join('; ')}.**`);
    out.push(
        '  A 5000ms budget is vitest\'s default — a package on it has not adopted ' +
            '`vitest.shared.ts` (30000ms). Check the `Duration` line: import/collect time far ' +
            'exceeding test time means the runner was starved, not that the code is slow.'
    );
}
const lastDuration = [...summaries].reverse().find((s) => s.duration)?.duration;
if (lastDuration) {
    out.push(`- **duration:** ${lastDuration}`);
}
if (failLines.length) {
    out.push('', '**Failing tests**', '');
    for (const name of failLines.slice(0, 25)) out.push(`- \`${name}\``);
    if (failLines.length > 25) out.push(`- …and ${failLines.length - 25} more`);
}

console.log(out.join('\n'));
