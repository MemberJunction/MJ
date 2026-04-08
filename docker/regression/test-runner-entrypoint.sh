#!/bin/bash
# Test Runner Entrypoint
# 1. Forwards localhost:4200 → mjexplorer:4200 (secure context for Auth0)
# 2. Syncs test metadata to database
# 3. Verifies MJAPI and nginx proxy are working
# 4. Runs the regression test suite in parallel (N workers, shared browser contexts)
# 5. Extracts screenshots and generates markdown report
set -e

# Register ComputerUseTestDriver with ClassFactory before the CLI runs.
export NODE_OPTIONS="--import /app/bootstrap.mjs"

echo ""
echo "  MJ Regression Test Runner"
echo "  ─────────────────────────────────────────"
echo ""

# Forward localhost:4200 → mjexplorer:4200 so the browser accesses the app via localhost.
# This is required because auth0-spa-js only works on secure origins, and browsers
# treat localhost as a secure context (but not arbitrary hostnames like "mjexplorer").
echo "Starting localhost proxy (localhost:4200 → mjexplorer:4200)..."
socat TCP-LISTEN:4200,fork,reuseaddr TCP:mjexplorer:4200 &
SOCAT_PID=$!
sleep 1
curl -sf http://localhost:4200/ -o /dev/null && echo "  ✓ localhost:4200 is reachable" || echo "  ✗ localhost:4200 NOT reachable"
echo ""

# Sync test metadata (tests first, then suites that reference them)
echo "Syncing test metadata..."
npx mj sync push --dir=metadata --include="tests" 2>&1 || {
    echo "  WARNING: Test metadata sync failed"
}
echo ""
echo "Syncing test suites..."
npx mj sync push --dir=metadata --include="test-suites" 2>&1 || {
    echo "  WARNING: Suite metadata sync failed"
}
echo ""

# Verify MJAPI and nginx proxy are working
echo "Verifying MJAPI and nginx proxy..."
node -e "
(async () => {
  const gqlBody = JSON.stringify({ query: '{ __schema { queryType { name } } }' });

  // Healthcheck direct to mjapi
  try {
    const hc = await fetch('http://mjapi:4000/healthcheck');
    const hcBody = await hc.text();
    console.log('  [direct] Healthcheck: ' + hc.status + ' ' + hcBody);
  } catch (e) {
    console.log('  [direct] Healthcheck FAILED: ' + e.message);
  }

  // GraphQL POST through nginx proxy (same path the browser uses)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch('http://localhost:4200/api/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: gqlBody,
      signal: controller.signal
    });
    clearTimeout(timeout);
    const body = await resp.text();
    console.log('  [via nginx] GraphQL /api/: ' + resp.status + ' ' + body.substring(0, 200));
  } catch (e) {
    console.log('  [via nginx] GraphQL /api/ FAILED: ' + e.message);
  }
})();
" 2>&1
echo ""

# Run the regression suite (disable set -e so we can capture screenshots on failure)
# --parallel: N workers sharing browser contexts (1 login per worker, not per test)
WORKERS=${MAX_PARALLEL_WORKERS:-4}
echo "Running regression suite (${WORKERS} parallel workers)..."
set +e
npx mj test suite --name "MJ Explorer Regression Suite" --format json --output /app/test-results/results.json --parallel --max-parallel "$WORKERS"
EXIT_CODE=$?
set -e

# Extract screenshots from results JSON
echo ""
echo "Extracting screenshots..."
node -e "
const fs = require('fs');
const path = require('path');
const dir = '/app/test-results/screenshots';
fs.mkdirSync(dir, { recursive: true });

// Read the test run outputs from DB via a simple SQL query
const sql = require('mssql');
const config = {
  server: process.env.DB_HOST || 'sqlserver',
  port: parseInt(process.env.DB_PORT || '1433'),
  database: process.env.DB_DATABASE || 'MemberJunction_Test',
  user: process.env.DB_USERNAME || 'sa',
  password: process.env.DB_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true }
};

(async () => {
  try {
    const results = JSON.parse(fs.readFileSync('/app/test-results/results.json', 'utf8'));
    const pool = await sql.connect(config);

    for (const test of results.testResults || []) {
      const testDir = path.join(dir, test.testName.replace(/[^a-zA-Z0-9_-]/g, '_'));
      fs.mkdirSync(testDir, { recursive: true });

      const outputs = await pool.request()
        .input('testRunId', sql.UniqueIdentifier, test.testRunId)
        .query('SELECT Name, Sequence, InlineData, Description FROM __mj.vwTestRunOutputs WHERE TestRunID = @testRunId ORDER BY Sequence');

      let count = 0;
      for (const row of outputs.recordset) {
        if (row.InlineData) {
          const filename = 'step_' + String(row.Sequence).padStart(2, '0') + '.png';
          fs.writeFileSync(path.join(testDir, filename), Buffer.from(row.InlineData, 'base64'));
          count++;
        }
      }
      console.log('  ' + test.testName + ': ' + count + ' screenshots saved');
    }

    await pool.close();
  } catch (err) {
    console.error('  WARNING: Screenshot extraction failed:', err.message);
  }
})();
" 2>&1 || echo "  WARNING: Screenshot extraction failed"

# Generate markdown report
echo ""
echo "Generating markdown report..."
node -e "
const fs = require('fs');

try {
  const r = JSON.parse(fs.readFileSync('/app/test-results/results.json', 'utf8'));
  const lines = [];

  // Header
  lines.push('# MJ Explorer Regression Report');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push('| **Suite** | ' + r.suiteName + ' |');
  lines.push('| **Status** | ' + (r.failedTests === 0 && r.passedTests === r.totalTests ? 'PASSED' : 'FAILED') + ' |');
  lines.push('| **Date** | ' + new Date(r.startedAt).toISOString().split('T')[0] + ' |');
  lines.push('| **Duration** | ' + Math.round(r.durationMs / 1000) + 's |');
  lines.push('| **Passed** | ' + r.passedTests + '/' + r.totalTests + ' |');
  lines.push('| **Average Score** | ' + (r.averageScore * 100).toFixed(1) + '% |');
  lines.push('');

  // Summary table
  lines.push('## Test Results');
  lines.push('');
  lines.push('| # | Test | Status | Score | Steps | Duration | Details |');
  lines.push('|---|------|--------|-------|-------|----------|---------|');

  for (const t of r.testResults) {
    const status = t.status === 'Passed' ? 'PASS' : t.status === 'Timeout' ? 'TIMEOUT' : 'FAIL';
    const score = t.score > 0 ? (t.score * 100).toFixed(0) + '%' : '-';
    const dur = Math.round(t.durationMs / 1000) + 's';

    // Extract step count from oracle results or error message
    let steps = '-';
    const stepOracle = (t.oracleResults || []).find(o => o.oracleType === 'step-count');
    if (stepOracle && stepOracle.details) {
      steps = stepOracle.details.totalSteps + '/' + stepOracle.details.maxSteps;
    }

    // Details: first oracle reason or error message
    let details = '';
    if (t.errorMessage) {
      details = t.errorMessage;
    } else {
      const goalOracle = (t.oracleResults || []).find(o => o.oracleType === 'goal-completion');
      if (goalOracle && goalOracle.details && goalOracle.details.reason) {
        details = goalOracle.details.reason.substring(0, 120);
        if (goalOracle.details.reason.length > 120) details += '...';
      }
    }

    const seq = t.sequence || r.testResults.indexOf(t) + 1;
    lines.push('| ' + seq + ' | ' + t.testName + ' | ' + status + ' | ' + score + ' | ' + steps + ' | ' + dur + ' | ' + details + ' |');
  }

  // Failed/timeout details
  const failures = r.testResults.filter(t => t.status !== 'Passed');
  if (failures.length > 0) {
    lines.push('');
    lines.push('## Failed / Timed Out Tests');
    lines.push('');
    for (const t of failures) {
      lines.push('### ' + t.testName);
      lines.push('');
      lines.push('- **Status**: ' + t.status);
      lines.push('- **Duration**: ' + Math.round(t.durationMs / 1000) + 's');
      if (t.errorMessage) {
        lines.push('- **Error**: ' + t.errorMessage);
      }
      if (t.oracleResults && t.oracleResults.length > 0) {
        lines.push('- **Oracle Results**:');
        for (const o of t.oracleResults) {
          lines.push('  - ' + o.oracleType + ': ' + (o.passed ? 'PASS' : 'FAIL') + ' (score: ' + o.score.toFixed(2) + ') — ' + (o.message || '').substring(0, 150));
        }
      }
      lines.push('');
    }
  }

  // Oracle breakdown for passed tests
  const passed = r.testResults.filter(t => t.status === 'Passed');
  if (passed.length > 0) {
    lines.push('## Passed Test Details');
    lines.push('');
    for (const t of passed) {
      lines.push('### ' + t.testName + ' (score: ' + (t.score * 100).toFixed(0) + '%)');
      lines.push('');
      if (t.oracleResults) {
        for (const o of t.oracleResults) {
          lines.push('- **' + o.oracleType + '**: ' + (o.passed ? 'PASS' : 'FAIL') + ' (score: ' + o.score.toFixed(2) + ')');
        }
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('*Generated by MJ Regression Test Runner*');
  lines.push('');

  const report = lines.join('\n');
  fs.writeFileSync('/app/test-results/report.md', report);
  console.log('  ✓ Report saved to /app/test-results/report.md');

  // Also print to console
  console.log('');
  console.log(report);
} catch (err) {
  console.error('  WARNING: Report generation failed:', err.message);
}
" 2>&1

echo ""
echo "Results: /app/test-results/results.json"
echo "Report:  /app/test-results/report.md"
echo "Screenshots: /app/test-results/screenshots/"
exit $EXIT_CODE
