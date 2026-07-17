#!/usr/bin/env node
/**
 * integration-golden-diff.mjs — proves the migrated integration checks are equivalent
 * to the originals.
 *
 * Both the standalone tsx scripts (via EmitOutcomes) and the IntegrationTestDriver (via
 * its EMIT_OUTCOMES sidecar) write a JSON array of {name, passed, durationMs, error?}.
 * This tool diffs two such files for ONE suite, keyed by the check's short id (S1/C3/Q7),
 * which it extracts from either naming form ("S1: ..." script name OR "server-cache.S1"
 * driver oracleType). A suite is "migrated" only when missing/extra/passMismatch are all
 * empty (D7 sign-off gate).
 *
 * USAGE:
 *   node scripts/integration-golden-diff.mjs <orig.json> <migrated.json> [suiteLabel]
 *
 * To produce the ORIGINAL baseline (pre-Phase-2 inline scripts) without losing your
 * working tree, run the committed scripts from a throwaway git worktree, e.g.:
 *   git worktree add /tmp/mj-baseline <commit-before-phase2>
 *   (cd /tmp/mj-baseline && RUN_MUTATION_TESTS=1 EMIT_OUTCOMES=/tmp/golden/server.orig.json \
 *      npx tsx packages/MJServer/integration-test-scripts/server-cache-tests.ts)
 * and the migrated path from this tree (tsx script or `mj test run` with EMIT_OUTCOMES set).
 *
 * Exit code: 0 = equivalent, 1 = mismatch (or bad usage).
 *
 * Timing is reported as a WARNING only — an in-process driver and a fresh script process
 * legitimately differ; timing flags a check that silently became a no-op or hung.
 */
import { readFile } from 'node:fs/promises';

const TIMING_ABS_MS = 2000;   // tolerate up to 2s absolute drift
const TIMING_FACTOR = 5;      // ...or 5x the original, whichever is larger

/** Extract the S#/C#/Q# short id from a script name ("S1: ...") or oracleType ("server-cache.S1"). */
function shortId(name) {
    const dotted = String(name).match(/\.([A-Za-z]+\d+)$/);
    if (dotted) return dotted[1];
    const lead = String(name).match(/^([A-Za-z]+\d+)\b/);
    if (lead) return lead[1];
    return String(name);
}

async function loadOutcomes(path) {
    let raw;
    try {
        raw = await readFile(path, 'utf8');
    } catch (e) {
        throw new Error(`cannot read ${path}: ${e.message}`);
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
        throw new Error(`${path} is not a JSON array of outcomes`);
    }
    return parsed.map(o => ({ key: shortId(o.name), name: o.name, passed: !!o.passed, durationMs: Number(o.durationMs ?? 0), error: o.error }));
}

function diffSuite(orig, migrated) {
    const oByKey = new Map(orig.map(o => [o.key, o]));
    const mByKey = new Map(migrated.map(m => [m.key, m]));
    const missing = orig.filter(o => !mByKey.has(o.key)).map(o => o.key);
    const extra = migrated.filter(m => !oByKey.has(m.key)).map(m => m.key);
    const passMismatch = orig
        .filter(o => mByKey.has(o.key) && mByKey.get(o.key).passed !== o.passed)
        .map(o => ({ key: o.key, orig: o.passed, migrated: mByKey.get(o.key).passed }));
    const timingWarn = orig
        .filter(o => mByKey.has(o.key))
        .map(o => ({ key: o.key, orig: o.durationMs, migrated: mByKey.get(o.key).durationMs }))
        .filter(t => t.migrated > Math.max(TIMING_ABS_MS, t.orig * TIMING_FACTOR));
    return { missing, extra, passMismatch, timingWarn };
}

async function main() {
    const [origPath, migratedPath, label = 'suite'] = process.argv.slice(2);
    if (!origPath || !migratedPath) {
        console.error('usage: node scripts/integration-golden-diff.mjs <orig.json> <migrated.json> [suiteLabel]');
        process.exit(1);
    }

    const [orig, migrated] = await Promise.all([loadOutcomes(origPath), loadOutcomes(migratedPath)]);
    const { missing, extra, passMismatch, timingWarn } = diffSuite(orig, migrated);

    console.log(`\n══════ golden diff [${label}] — orig ${orig.length} vs migrated ${migrated.length} ══════`);

    if (timingWarn.length > 0) {
        console.log(`\n⚠ timing warnings (advisory, not a failure):`);
        for (const t of timingWarn) {
            console.log(`    ${t.key}: orig ${t.orig}ms → migrated ${t.migrated}ms`);
        }
    }

    const failed = missing.length > 0 || extra.length > 0 || passMismatch.length > 0;
    if (!failed) {
        console.log(`\n✓ EQUIVALENT — identical check-id set and pass/fail for all ${orig.length} checks.\n`);
        process.exit(0);
    }

    console.log('\n✗ MISMATCH:');
    if (missing.length) console.log(`  missing in migrated (coverage lost!): ${missing.join(', ')}`);
    if (extra.length) console.log(`  extra in migrated (unexpected): ${extra.join(', ')}`);
    for (const p of passMismatch) {
        console.log(`  pass/fail differs ${p.key}: orig=${p.orig} migrated=${p.migrated}`);
    }
    console.log('');
    process.exit(1);
}

main().catch(err => {
    console.error(`golden-diff error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
});
