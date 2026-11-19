#!/usr/bin/env node
/**
 * Ratchet for an integration lane that is not green yet.
 *
 * The deterministic tier runs on SQL Server as a hard gate. Running it on PostgreSQL as well catches
 * the dialect gaps SQL Server cannot see, but PostgreSQL starts with a backlog of known failures.
 * Gating on "zero failures" would leave the lane red on every pull request until that backlog is
 * cleared; not gating at all would let new PostgreSQL breakage land unnoticed. This script sits
 * between the two:
 *
 * - a failing check that is NOT on the known-failures list fails the job (a regression);
 * - a check on the list that now PASSES also fails the job, so the list is shortened in the same
 *   pull request that fixed it and can only shrink;
 * - a listed check that did not run (skipped, or its bundle was filtered out) is reported, not
 *   failed: absence is not evidence either way;
 * - a check on the separate `Flaky` list (one whose outcome follows runner speed, such as a timing
 *   ratio or a bundle that runs near its time budget) is reported but never fails the job in either
 *   direction, so the ratchet stays stable without hiding it in the backlog.
 *
 * A skip the suite's own skip gate does not allow (`details.SkipAllowed === false`) counts as a
 * failure, as it does for that gate.
 *
 * Input: the JSON files `mj test suite --output` writes (one per shard), or `mj test run --output`. A failure is keyed by its
 * check ID (`bundle.CHECK`). A bundle that fails before any check runs reports one result whose ID
 * is not a check ID (`gate`, `setup`, ...); it is keyed as `<test name>#<id>` instead.
 *
 * Usage: node .github/scripts/check-integration-known-failures.mjs <known-failures.json> <shard.json>...
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CHECK_ID = /^[a-z0-9][a-z0-9-]*\.[A-Za-z0-9_-]+$/;

/** The key a result is tracked under: its check ID, or the test name for a bundle-level result. */
export function resultKey(testName, oracleType) {
    return CHECK_ID.test(oracleType) ? oracleType : `${testName}#${oracleType}`;
}

/**
 * Every check outcome in one result file, as `{ Key, Outcome, Message }`. Reads a suite run
 * (`mj test suite --output`, a `testResults` array) or a single test run (`mj test run --output`).
 */
export function collectOutcomes(resultFile) {
    const outcomes = [];
    const tests = resultFile.testResults ?? (resultFile.testName ? [resultFile] : []);
    for (const test of tests) {
        const oracles = test.oracleResults ?? [];
        if (oracles.length === 0 && test.status !== 'Passed' && test.status !== 'Skipped') {
            outcomes.push({ Key: `${test.testName}#bundle`, Outcome: 'failed', Message: String(test.errorMessage ?? test.status) });
            continue;
        }
        for (const oracle of oracles) {
            const skipped = oracle.details?.Skipped === true;
            // The suite's skip gate fails a run on a skip not on its allowlist (`SkipAllowed: false`),
            // so a skip-as-pass cannot hide a check. Counting it as a failure here keeps that guard.
            const unexpectedSkip = skipped && oracle.details?.SkipAllowed === false;
            const outcome = oracle.passed === false || unexpectedSkip ? 'failed' : skipped ? 'skipped' : 'passed';
            outcomes.push({ Key: resultKey(test.testName, oracle.oracleType), Outcome: outcome, Message: String(oracle.message ?? '') });
        }
    }
    return outcomes;
}

/**
 * Compares a run with the known-failures list. A key that fails in any shard counts as failed; one
 * that passes in some shard and fails in none counts as passed.
 */
export function compareWithKnownFailures(outcomes, knownFailures, flaky = {}) {
    const byKey = new Map();
    for (const o of outcomes) {
        const prev = byKey.get(o.Key);
        if (!prev || o.Outcome === 'failed' || (o.Outcome === 'passed' && prev.Outcome === 'skipped')) {
            byKey.set(o.Key, o);
        }
    }
    const known = new Set(Object.keys(knownFailures));
    const flakyKeys = new Set(Object.keys(flaky));
    const newFailures = [];
    const fixed = [];
    const notRun = [];
    const flakyFailed = [];
    for (const [key, o] of byKey) {
        if (flakyKeys.has(key)) {
            if (o.Outcome === 'failed') flakyFailed.push(key);
            continue;
        }
        if (o.Outcome === 'failed' && !known.has(key)) newFailures.push(o);
        if (o.Outcome === 'passed' && known.has(key)) fixed.push(key);
    }
    for (const key of known) {
        const o = byKey.get(key);
        if (!o || o.Outcome === 'skipped') notRun.push(key);
    }
    const stillFailing = [...known].filter((k) => byKey.get(k)?.Outcome === 'failed');
    return { NewFailures: newFailures, Fixed: fixed, NotRun: notRun, StillFailing: stillFailing, FlakyFailed: flakyFailed, Checked: byKey.size };
}

/** Human-readable report; returns the process exit code. */
export function report(result, log = console.log) {
    log(`Checked ${result.Checked} results: ${result.StillFailing.length} known failures still failing, ${result.NewFailures.length} new, ${result.Fixed.length} fixed.`);
    if ((result.FlakyFailed ?? []).length > 0) {
        log(`\n${result.FlakyFailed.length} check(s) on the flaky list failed this time (not gating):`);
        for (const key of result.FlakyFailed) log(`  ~ ${key}`);
    }
    if (result.NotRun.length > 0) {
        log(`\n${result.NotRun.length} known failure(s) did not run this time (skipped or not selected):`);
        for (const key of result.NotRun) log(`  - ${key}`);
    }
    if (result.Fixed.length > 0) {
        log(`\n${result.Fixed.length} check(s) on the known-failures list now pass. Remove them from the list in this pull request:`);
        for (const key of result.Fixed) log(`  ✓ ${key}`);
    }
    if (result.NewFailures.length > 0) {
        log(`\n${result.NewFailures.length} check(s) failed that are not on the known-failures list:`);
        for (const o of result.NewFailures) log(`  ✗ ${o.Key}: ${o.Message.slice(0, 300)}`);
    }
    return result.NewFailures.length > 0 || result.Fixed.length > 0 ? 1 : 0;
}

function main(argv) {
    const [listPath, ...shardPaths] = argv;
    if (!listPath || shardPaths.length === 0) {
        console.error('Usage: check-integration-known-failures.mjs <known-failures.json> <shard.json>...');
        return 2;
    }
    const list = JSON.parse(readFileSync(listPath, 'utf8'));
    const knownFailures = list.KnownFailures ?? {};
    const flaky = list.Flaky ?? {};
    const overlap = Object.keys(flaky).filter((k) => k in knownFailures);
    if (overlap.length > 0) {
        console.error(`These checks are on both the KnownFailures and Flaky lists; keep each on one: ${overlap.join(', ')}`);
        return 2;
    }
    const outcomes = [];
    for (const path of shardPaths) {
        if (!existsSync(path)) {
            console.error(`Shard result ${path} is missing: that shard did not finish, so this run cannot be judged.`);
            return 1;
        }
        outcomes.push(...collectOutcomes(JSON.parse(readFileSync(path, 'utf8'))));
    }
    return report(compareWithKnownFailures(outcomes, knownFailures, flaky));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exit(main(process.argv.slice(2)));
}
