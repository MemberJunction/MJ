/**
 * Render $RUN_DIR/results.json into a human-readable markdown report at
 * $RUN_DIR/report.md. Also prints the report to stdout for CI logs.
 *
 * The report has three sections:
 *   1. Header — suite, status, duration, pass count, average score
 *   2. Summary table — one row per test (sequence, name, status, score, steps, duration, details)
 *   3. Failed/timed-out tests — one block each with full oracle results
 *   4. Passed test details — oracle breakdown (mostly for triaging slow regressions)
 */

const fs = require('fs');
const path = require('path');

const RUN_DIR = process.env.RUN_DIR;
if (!RUN_DIR) {
    console.error('  WARNING: RUN_DIR not set, skipping markdown report');
    process.exit(0);
}

// DR-G2: safe formatters + per-section guard so one malformed record can no
// longer erase the ENTIRE report (the old single try/catch wrote nothing when
// e.g. an oracle's score was null and `.toFixed` threw).
const pct = (n, dp = 0) => (typeof n === 'number' && isFinite(n) ? (n * 100).toFixed(dp) + '%' : '-');
const fixed = (n, dp = 2) => (typeof n === 'number' && isFinite(n) ? n.toFixed(dp) : '-');
const secs = (ms) => (typeof ms === 'number' && isFinite(ms) ? Math.round(ms / 1000) + 's' : '-');
const safeDate = (d) => { try { return new Date(d).toISOString().split('T')[0]; } catch { return '-'; } };
/** Run one report section; a throw is logged as a placeholder, never fatal. */
function section(lines, label, fn) {
    try { fn(); } catch (err) {
        lines.push(`> _[${label} omitted — ${err.message}]_`);
        console.error(`  WARNING: report section "${label}" failed: ${err.message}`);
    }
}

try {
    const r = JSON.parse(fs.readFileSync(path.join(RUN_DIR, 'results.json'), 'utf8'));
    const lines = [];
    const testResults = Array.isArray(r.testResults) ? r.testResults : [];

    // 1. Header
    section(lines, 'header', () => {
        const overallStatus = r.failedTests === 0 && r.passedTests === r.totalTests ? 'PASSED' : 'FAILED';
        lines.push('# MJ Explorer Regression Report');
        lines.push('');
        lines.push('| Field | Value |');
        lines.push('|-------|-------|');
        lines.push(`| **Suite** | ${r.suiteName ?? '-'} |`);
        lines.push(`| **Status** | ${overallStatus} |`);
        lines.push(`| **Date** | ${safeDate(r.startedAt)} |`);
        lines.push(`| **Duration** | ${secs(r.durationMs)} |`);
        lines.push(`| **Passed** | ${r.passedTests ?? '-'}/${r.totalTests ?? '-'} |`);
        if (r.flakyTests) {
            lines.push(`| **Flaky (passed on retry)** | ${r.flakyTests} |`);
        }
        lines.push(`| **Average Score** | ${pct(r.averageScore, 1)} |`);
        lines.push('');
    });

    // 2. Summary table — each row guarded so one bad record drops only its row.
    section(lines, 'summary-table', () => {
        lines.push('## Test Results');
        lines.push('');
        lines.push('| # | Test | Status | Score | Steps | Duration | Details |');
        lines.push('|---|------|--------|-------|-------|----------|---------|');

        testResults.forEach((t, i) => {
            try {
                let status = t.status === 'Passed' ? 'PASS' : t.status === 'Timeout' ? 'TIMEOUT' : (t.status ? String(t.status).toUpperCase() : 'FAIL');
                if (t.flaky) status = `FLAKY (passed on attempt ${t.attempts ?? '?'})`;
                const score = typeof t.score === 'number' && t.score > 0 ? pct(t.score) : '-';

                let steps = '-';
                const stepOracle = (t.oracleResults || []).find(o => o.oracleType === 'step-count');
                if (stepOracle && stepOracle.details) {
                    steps = `${stepOracle.details.totalSteps}/${stepOracle.details.maxSteps}`;
                }

                let details = '';
                if (t.errorMessage) {
                    details = t.errorMessage;
                } else {
                    const goalOracle = (t.oracleResults || []).find(o => o.oracleType === 'goal-completion');
                    const reason = goalOracle?.details?.reason;
                    if (reason) details = reason.length > 120 ? reason.substring(0, 120) + '...' : reason;
                }

                const seq = t.sequence || i + 1;
                lines.push(`| ${seq} | ${t.testName ?? '(unnamed)'} | ${status} | ${score} | ${steps} | ${secs(t.durationMs)} | ${details} |`);
            } catch (err) {
                lines.push(`| ${i + 1} | ${t.testName ?? '(unnamed)'} | ERR | - | - | - | _row failed: ${err.message}_ |`);
            }
        });
    });

    // 3. Failed / timed-out details
    section(lines, 'failures', () => {
        const failures = testResults.filter(t => t.status !== 'Passed');
        if (failures.length === 0) return;
        lines.push('');
        lines.push('## Failed / Timed Out Tests');
        lines.push('');
        for (const t of failures) {
            lines.push(`### ${t.testName ?? '(unnamed)'}`);
            lines.push('');
            lines.push(`- **Status**: ${t.status ?? '-'}`);
            lines.push(`- **Duration**: ${secs(t.durationMs)}`);
            if (t.errorMessage) lines.push(`- **Error**: ${t.errorMessage}`);
            if (t.oracleResults && t.oracleResults.length > 0) {
                lines.push('- **Oracle Results**:');
                for (const o of t.oracleResults) {
                    lines.push(`  - ${o.oracleType}: ${o.passed ? 'PASS' : 'FAIL'} (score: ${fixed(o.score)}) — ${(o.message || '').substring(0, 150)}`);
                }
            }
            lines.push('');
        }
    });

    // 4. Passed test details
    section(lines, 'passed-details', () => {
        const passed = testResults.filter(t => t.status === 'Passed');
        if (passed.length === 0) return;
        lines.push('## Passed Test Details');
        lines.push('');
        for (const t of passed) {
            lines.push(`### ${t.testName ?? '(unnamed)'} (score: ${pct(t.score)})`);
            lines.push('');
            if (t.oracleResults) {
                for (const o of t.oracleResults) {
                    lines.push(`- **${o.oracleType}**: ${o.passed ? 'PASS' : 'FAIL'} (score: ${fixed(o.score)})`);
                }
            }
            lines.push('');
        }
    });

    lines.push('---');
    lines.push('*Generated by MJ Regression Test Runner*');
    lines.push('');

    const report = lines.join('\n');
    fs.writeFileSync(path.join(RUN_DIR, 'report.md'), report);
    console.log(`  ✓ Report saved to ${path.join(RUN_DIR, 'report.md')}`);
    console.log('');
    console.log(report);
} catch (err) {
    console.error('  WARNING: Report generation failed:', err.message);
}
