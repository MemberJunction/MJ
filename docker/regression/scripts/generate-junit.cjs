#!/usr/bin/env node
/**
 * DR-F6 (carve-out) — emit a JUnit XML report from a run's results.json so CI
 * systems (GitHub Actions, GitLab, Jenkins) render per-test pass/fail from a
 * regression run. A pure results.json → XML transform, RUN_DIR-driven like the
 * other generators. The full `mj test regression ci` one-shot command that would
 * expose `--junit <path>` is STATIC-ONLY (needs a live gate run to verify); this
 * emitter is the verifiable piece, wired into the standard report generation so
 * every run drops a `report.junit.xml` a CI job can consume.
 *
 * Usage:  RUN_DIR=<dir> node generate-junit.cjs   → writes <RUN_DIR>/report.junit.xml
 * `buildJUnitXml(results, opts)` is exported + pure for testing.
 */
const fs = require('fs');
const path = require('path');

function xmlEscape(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Map an MJ test status to a JUnit outcome. Failed → <failure>; the harness/infra
 * classes (Error/Timeout) → <error> (JUnit's "the test couldn't run" bucket, the
 * right signal for env problems vs assertion failures); Skipped → <skipped>;
 * Passed and anything unrecognized-but-not-failing → clean.
 */
function outcomeFor(status) {
    switch (String(status)) {
        case 'Passed': return 'passed';
        case 'Skipped': return 'skipped';
        case 'Error':
        case 'Timeout': return 'error';
        case 'Failed': return 'failure';
        default: return 'failure';
    }
}

/** Best-effort short failure message for a non-passing test. */
function failMessage(t) {
    return (t.actualOutput && (t.actualOutput.failureClass || t.actualOutput.reason))
        || (Array.isArray(t.oracleResults) && t.oracleResults[0] && t.oracleResults[0].reason)
        || t.status || 'failed';
}

/**
 * Build a JUnit XML string from a results.json-shaped object. Pure. Counts
 * failures/errors/skipped, sums per-test durations (ms → seconds), and
 * XML-escapes every interpolated value. Safe on an empty/missing testResults.
 */
function buildJUnitXml(results, opts = {}) {
    const tests = (results && Array.isArray(results.testResults)) ? results.testResults : [];
    const suiteName = opts.suiteName || (results && results.suiteName) || 'MJ Regression Suite';
    const classname = xmlEscape(opts.classname || suiteName);
    const counts = { failures: 0, errors: 0, skipped: 0 };
    let totalTime = 0;

    const cases = tests.map((t) => {
        const outcome = outcomeFor(t.status);
        const timeSec = (Number(t.durationMs) || 0) / 1000;
        totalTime += timeSec;
        const name = xmlEscape(t.testName || t.testId || '(unnamed)');
        let body = '';
        if (outcome === 'failure') {
            counts.failures++;
            body = `<failure message="${xmlEscape(failMessage(t))}"/>`;
        } else if (outcome === 'error') {
            counts.errors++;
            body = `<error message="${xmlEscape(t.status + ': ' + failMessage(t))}"/>`;
        } else if (outcome === 'skipped') {
            counts.skipped++;
            body = '<skipped/>';
        }
        return `    <testcase name="${name}" classname="${classname}" time="${timeSec.toFixed(3)}">${body}</testcase>`;
    });

    const attrs =
        `name="${xmlEscape(suiteName)}" tests="${tests.length}" ` +
        `failures="${counts.failures}" errors="${counts.errors}" ` +
        `skipped="${counts.skipped}" time="${totalTime.toFixed(3)}"`;

    return `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<testsuites ${attrs}>\n` +
        `  <testsuite ${attrs}>\n` +
        (cases.length ? cases.join('\n') + '\n' : '') +
        `  </testsuite>\n` +
        `</testsuites>\n`;
}

module.exports = { buildJUnitXml, xmlEscape, outcomeFor, failMessage };

if (require.main === module) {
    const runDir = process.env.RUN_DIR;
    if (!runDir) { console.error('generate-junit: RUN_DIR not set'); process.exit(1); }
    const resultsPath = path.join(runDir, 'results.json');
    if (!fs.existsSync(resultsPath)) { console.error(`generate-junit: no results.json in ${runDir}`); process.exit(1); }
    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    const out = path.join(runDir, 'report.junit.xml');
    fs.writeFileSync(out, buildJUnitXml(results), 'utf8');
    console.log(`✓ JUnit report → ${out} (${(results.testResults || []).length} tests)`);
}
