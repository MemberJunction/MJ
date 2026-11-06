#!/usr/bin/env node
/**
 * Fails when the over-the-wire field-level security bundles skipped instead of running.
 *
 * IT92 (`fls-enforcement-client`) and IT134 (`fls-closeout-client`) are the only checks that prove
 * field-level security through MJAPI's GraphQL and REST endpoints. Each depends on a shared fixture
 * that refuses to run when its preconditions are missing: the seeded users, MJAPI, REST, or a
 * field-security flag that is off. The integration suite counts a skipped check as a skip, not a
 * failure, so the job stays green when every one of these checks skipped, and that looks the same
 * as a run where they passed.
 *
 * Reads the integration tier's log and requires, for each bundle, at least one check that ran
 * (the driver logs `✓ <bundle>.<check>` or `✗ <bundle>.<check>`) and no check that skipped (the
 * driver logs `− <bundle>.<check>: SKIPPED`; the checks themselves log `<bundle>.<check> SKIPPED`).
 *
 * Usage: node .github/scripts/check-fls-wire-bundles-ran.mjs <integration-log-file>
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The bundles this gate covers, with the integration test that runs each. */
export const WIRE_BUNDLES = [
    { Bundle: 'fls-enforcement-client', Test: 'IT92' },
    { Bundle: 'fls-closeout-client', Test: 'IT134' },
];

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The check IDs of `bundle` the log shows as executed and as skipped. */
export function bundleOutcomes(logText, bundle) {
    const name = escapeRegExp(bundle);
    const ran = new RegExp(`[✓✗]\\s+(${name}\\.[A-Za-z0-9_-]+)`);
    // Matches the driver's `− <id>: SKIPPED` and a check's own `<id> SKIPPED`.
    const skipped = new RegExp(`(?<![\\w.-])(${name}\\.[A-Za-z0-9_-]+):?\\s+SKIPPED`);
    const executedIds = new Set();
    const skippedIds = new Set();
    for (const line of logText.replace(ANSI_PATTERN, '').split(/\r?\n/)) {
        const skip = skipped.exec(line);
        if (skip) {
            skippedIds.add(skip[1]);
            continue;
        }
        const run = ran.exec(line);
        if (run) {
            executedIds.add(run[1]);
        }
    }
    return { Executed: [...executedIds].sort(), Skipped: [...skippedIds].sort() };
}

/** One problem per bundle that skipped a check or ran none; an empty list means the gate passes. */
export function evaluate(logText, bundles = WIRE_BUNDLES) {
    const problems = [];
    for (const { Bundle, Test } of bundles) {
        const outcome = bundleOutcomes(logText, Bundle);
        if (outcome.Skipped.length > 0) {
            problems.push(`${Test} (${Bundle}) skipped ${outcome.Skipped.length} check(s): ${outcome.Skipped.join(', ')}`);
        } else if (outcome.Executed.length === 0) {
            problems.push(`${Test} (${Bundle}) ran no checks`);
        }
    }
    return problems;
}

function main(logPath) {
    if (!logPath) {
        console.error('::error::Usage: check-fls-wire-bundles-ran.mjs <integration-log-file>');
        return 1;
    }
    let logText;
    try {
        logText = readFileSync(logPath, 'utf8');
    } catch (e) {
        console.error(`::error::Could not read the integration log at ${logPath}: ${e.message}`);
        return 1;
    }
    for (const { Bundle, Test } of WIRE_BUNDLES) {
        const outcome = bundleOutcomes(logText, Bundle);
        console.log(`${Test} (${Bundle}): ${outcome.Executed.length} ran, ${outcome.Skipped.length} skipped`);
    }
    const problems = evaluate(logText);
    for (const problem of problems) {
        console.error(`::error::${problem}. A skipped over-the-wire FLS check is not a passing one: see the check's SKIPPED line in the tier log for why.`);
    }
    return problems.length === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exit(main(process.argv[2]));
}
