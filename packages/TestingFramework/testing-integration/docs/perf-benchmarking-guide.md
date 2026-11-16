# Reusable Performance Benchmarking Guide (`@memberjunction/testing-integration`)

This guide shows how any MemberJunction **OpenApp** or **BizApp** can wire `ProviderCallProfiler` and `PerfBenchmarkHarness` into its integration test suite to enforce SQL call budgets, detect timing regressions against local and CI baselines, and persist benchmark artifacts.

---

## 1. Profile SQL & Provider Call Budgets (`ProviderCallProfiler`)

Use `ProviderCallProfiler` to wrap a `DatabaseProviderBase` instance non-invasively during a benchmark or integration check and assert exact upper bounds on SQL statements, `SELECT COUNT(*)` queries, `RunView`/`RunViews`, `Save`, and `Delete` calls.

```typescript
import {
    ProviderCallProfiler,
    PerfBenchmarkHarness,
    type PerfMetricSample,
    type PerfStructuralAssertion,
} from '@memberjunction/testing-integration';
import type { DatabaseProviderBase } from '@memberjunction/core';

export async function runAppPerfCheck(provider: DatabaseProviderBase): Promise<void> {
    const profiler = new ProviderCallProfiler(provider);

    const { Metrics: dashboardMetrics } = await profiler.Profile(async () => {
        // Run your app's critical read path (e.g., loading a dashboard or workspace)
        return await loadWorkspaceSummary(provider);
    });

    // Enforce deterministic call budgets (catches N+1 queries and accidental Save/Delete calls)
    profiler.AssertBudget(
        dashboardMetrics,
        {
            MaxSqlExecutions: 3,
            MaxTotalSqlStatements: 6,
            MaxCountOnlyQueries: 1,
            MaxRunViewCalls: 2,
            MaxSaveCalls: 0,
            MaxDeleteCalls: 0,
        },
        'AppWorkspaceLoad'
    );

    // Feed timing + structural results into PerfBenchmarkHarness
    const samples: PerfMetricSample[] = [
        { Name: 'Workspace Load', Unit: 'ms', Value: dashboardMetrics.DurationMs, IsAggregate: true },
    ];
    const structuralAssertions: PerfStructuralAssertion[] = [
        {
            Name: 'Zero N+1 SQL Queries',
            Passed: dashboardMetrics.TotalSqlStatements <= 6,
            Message: `Executed ${dashboardMetrics.TotalSqlStatements} SQL statements`,
        },
    ];

    const baselineDoc = PerfBenchmarkHarness.LoadBaselineDocument('./benchmark-logs/perf-baseline.json');
    const evaluation = PerfBenchmarkHarness.EvaluateMetrics(samples, baselineDoc);

    PerfBenchmarkHarness.WriteArtifacts('./benchmark-logs', evaluation, {
        App: 'MyOpenApp',
        SqlStatements: dashboardMetrics.TotalSqlStatements,
    });

    PerfBenchmarkHarness.AssertEvaluationPassed(evaluation, structuralAssertions);
}
```

---

## 2. Commit a `perf-baseline.json` File

Commit `benchmark-logs/perf-baseline.json` in your app package with both `Baseline` (local reference) and optional `CIBaseline` (shared CI runner) profiles:

```json
{
  "Version": 1,
  "Baseline": {
    "Runner": "Local Reference (Apple Silicon)",
    "Timestamp": "2026-11-13T00:00:00.000Z",
    "Commit": "0000000000",
    "Database": "MJ_AppTest",
    "AggregateValue": 45.0,
    "Metrics": {
      "Workspace Load": 45.0
    }
  },
  "CIBaseline": {
    "Runner": "ubuntu-latest (GitHub Actions)",
    "Timestamp": "2026-11-13T00:00:00.000Z",
    "Commit": "0000000000",
    "Database": "MJ_CI",
    "AggregateValue": 90.0,
    "Metrics": {
      "Workspace Load": 90.0
    }
  },
  "Gates": {
    "MaxTimingRegressionPercentWarn": 25,
    "MaxTimingRegressionMultiplierFail": 2.0,
    "MinAbsoluteTimingDeltaMsWarn": 10,
    "MinAbsoluteTimingDeltaMsFailLocal": 25,
    "MinAbsoluteTimingDeltaMsFailCI": 50
  }
}
```

### Profile Selection & Environment Variables

- **`GITHUB_ACTIONS=true`** or **`MJ_PERF_PROFILE=ci`**: Selects `CIBaseline` (if present). Single-metric timing spikes on shared CI runners emit `WARN` unless `IsAggregate: true` or `MJ_PERF_STRICT_TIMING=1`.
- **`MJ_PERF_PROFILE=local`**: Forces `Baseline` even inside GitHub Actions.
- **`MJ_PERF_STRICT_TIMING=1`**: Promotes any `WARN` timing variance to `FAIL`.

---

## 3. Add a 15-Line `scripts/update-perf-baseline.mjs`

Use `PerfBenchmarkHarness.LoadBaselineDocument` and `PerfBenchmarkHarness.UpdateBaselineDocument` to refresh `perf-baseline.json` from `benchmark-logs/latest.json`:

```javascript
#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PerfBenchmarkHarness } from '@memberjunction/testing-integration';

const target = process.argv.includes('--ci') ? 'ci' : 'local';
const baselinePath = './benchmark-logs/perf-baseline.json';
const latest = JSON.parse(fs.readFileSync('./benchmark-logs/latest.json', 'utf8'));
const doc = PerfBenchmarkHarness.LoadBaselineDocument(baselinePath);
const samples = latest.Rows.map((r) => ({ Name: r.Metric, Unit: r.Unit, Value: r.Current }));
const commit = execFileSync('git', ['rev-parse', '--short=10', 'HEAD'], { encoding: 'utf8' }).trim();
const updated = PerfBenchmarkHarness.UpdateBaselineDocument(doc, samples, { Target: target, Commit: commit });
fs.writeFileSync(baselinePath, JSON.stringify(updated, null, 2) + '\n', 'utf8');
console.log(`Updated ${target} baseline at ${baselinePath} (${commit})`);
```
