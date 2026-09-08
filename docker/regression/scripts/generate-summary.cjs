/**
 * Emit $RUN_DIR/summary.json — a compact, machine-readable run summary for CI
 * gates and trend tracking (DR-G2). Distinct from report.md/report.html (human)
 * and results.json (full per-test detail): summary.json is the small stable
 * contract a pipeline reads to decide pass/fail and to chart reliability over
 * time.
 *
 * Sources (all best-effort — a missing/short input degrades a field, never the
 * file): results.json (or the DR-D5 results.partial.json when a run crashed
 * before finalizing) for counts/score, and diagnostics.ndjson (DR-G4) for
 * environment quality (what % of health probes were unhealthy during the run).
 *
 * Env: RUN_DIR (required).
 */

const fs = require('fs');
const path = require('path');
const { clusterFailures, enrichRoutesFromSteps } = require('./lib/cluster-failures.cjs');

/** Fold per-test rows into status/category/flaky tallies. */
function tallyTests(tests) {
    const totals = { total: 0, passed: 0, failed: 0, error: 0, timeout: 0, skipped: 0, flaky: 0 };
    const categories = {};
    let scoreSum = 0;
    let scoreN = 0;
    for (const t of tests || []) {
        totals.total++;
        const status = String(t.status || 'Unknown');
        if (status === 'Passed') totals.passed++;
        else if (status === 'Failed') totals.failed++;
        else if (status === 'Error') totals.error++;
        else if (status === 'Timeout') totals.timeout++;
        else if (status === 'Skipped') totals.skipped++;
        if (t.flaky) totals.flaky++;
        if (typeof t.score === 'number') { scoreSum += t.score; scoreN++; }
        // Prefer the driver's machine failureClass (CU-F5) when present; else group
        // non-passing tests by status. Passing tests aren't categorized.
        if (status !== 'Passed') {
            const cat = t.actualOutput?.failureClass || t.failureClass || status;
            categories[cat] = (categories[cat] || 0) + 1;
        }
    }
    return { totals, categories, averageScore: scoreN > 0 ? scoreSum / scoreN : 0 };
}

/** Environment quality from the DR-G4 supervisor's NDJSON (best-effort). */
function readEnvQuality(runDir) {
    const p = path.join(runDir, 'diagnostics.ndjson');
    if (!fs.existsSync(p)) return null;
    let totalProbes = 0;
    let unhealthy = 0;
    let worstState = 'green';
    const rank = { green: 0, degraded: 1, critical: 2 };
    try {
        for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
            if (!line.trim()) continue;
            let row;
            try { row = JSON.parse(line); } catch { continue; }
            totalProbes++;
            if (row.healthy === false) unhealthy++;
            if ((rank[row.state] ?? 0) > (rank[worstState] ?? 0)) worstState = row.state;
        }
    } catch {
        return null;
    }
    return {
        totalProbes,
        unhealthyProbes: unhealthy,
        unhealthyPct: totalProbes > 0 ? Math.round((unhealthy / totalProbes) * 100) : 0,
        worstState,
    };
}

/** Load the best available results view: final results.json, else the D5 partial. */
function loadResults(runDir) {
    const finalPath = path.join(runDir, 'results.json');
    if (fs.existsSync(finalPath)) {
        try {
            const r = JSON.parse(fs.readFileSync(finalPath, 'utf8'));
            return { source: 'final', suiteName: r.suiteName, status: r.status, durationMs: r.durationMs, tests: r.testResults || [] };
        } catch { /* fall through */ }
    }
    const partialPath = path.join(runDir, 'results.partial.json');
    if (fs.existsSync(partialPath)) {
        try {
            const p = JSON.parse(fs.readFileSync(partialPath, 'utf8'));
            return { source: 'partial', suiteName: p.suiteName, status: p.status, durationMs: undefined, tests: p.tests || [] };
        } catch { /* fall through */ }
    }
    return null;
}

/** Assemble the summary object (pure; exported for testing). */
function buildSummary(runDir, nowIso) {
    const loaded = loadResults(runDir);
    if (!loaded) return null;
    const { totals, categories, averageScore } = tallyTests(loaded.tests);
    // DR-G1: coarse failure-signature clusters. Compact per-cluster contract for
    // CI (signature/category/route/count/testIds/suspectedAppDefect); the richer
    // testNames stay in the md/html reports.
    const failureClusters = clusterFailures(enrichRoutesFromSteps(loaded.tests, runDir)).map((c) => ({
        signature: c.signature,
        category: c.category,
        route: c.route,
        count: c.count,
        testIds: c.testIds,
        suspectedAppDefect: c.suspectedAppDefect,
    }));
    return {
        runId: path.basename(runDir),
        suiteName: loaded.suiteName ?? null,
        status: loaded.status ?? 'Unknown',
        source: loaded.source,
        generatedAt: nowIso,
        totals,
        passRate: totals.total > 0 ? totals.passed / totals.total : 0,
        averageScore,
        durationMs: loaded.durationMs ?? null,
        categories,
        failureClusters,
        envQuality: readEnvQuality(runDir),
    };
}

module.exports = { tallyTests, readEnvQuality, buildSummary };

if (require.main === module) {
    const RUN_DIR = process.env.RUN_DIR;
    if (!RUN_DIR) {
        console.error('  WARNING: RUN_DIR not set, skipping summary.json');
        process.exit(0);
    }
    try {
        const summary = buildSummary(RUN_DIR, new Date().toISOString());
        if (!summary) {
            console.error('  WARNING: no results found — summary.json not written');
            process.exit(0);
        }
        fs.writeFileSync(path.join(RUN_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
        const c = summary.totals;
        const defects = summary.failureClusters.filter((fc) => fc.suspectedAppDefect).length;
        console.log(`  ✓ summary.json — ${c.passed}/${c.total} passed, ${c.failed} failed, ${c.flaky} flaky` +
            (summary.envQuality ? `, env ${summary.envQuality.unhealthyPct}% unhealthy` : '') +
            (summary.failureClusters.length ? `, ${summary.failureClusters.length} failure cluster(s)${defects ? ` (${defects} suspected app defect)` : ''}` : ''));
    } catch (err) {
        console.error('  WARNING: summary.json generation failed:', err.message);
    }
}
