import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import {
    PerfBenchmarkHarness,
    type PerfBaselineDocument,
    type PerfMetricSample,
} from '../perf-harness';

function makeBaselineDoc(includeCI = true): PerfBaselineDocument {
    const doc: PerfBaselineDocument = {
        Version: 1,
        Baseline: {
            Runner: 'Local Reference (Apple Silicon)',
            Timestamp: '2026-11-01T00:00:00.000Z',
            Commit: 'abc1234',
            Database: 'MJ_Test',
            AggregateValue: 200,
            Metrics: {
                'Query Latency': 100,
                'Cache Lookup': 100,
            },
        },
        Gates: {
            MaxTimingRegressionPercentWarn: 25,
            MaxTimingRegressionMultiplierFail: 2.0,
            MinAbsoluteTimingDeltaMsWarn: 10,
            MinAbsoluteTimingDeltaMsFailLocal: 25,
            MinAbsoluteTimingDeltaMsFailCI: 50,
        },
    };
    if (includeCI) {
        doc.CIBaseline = {
            Runner: 'ubuntu-latest (GitHub Actions)',
            Timestamp: '2026-11-01T00:00:00.000Z',
            Commit: 'abc1234',
            Database: 'MJ_CI',
            AggregateValue: 300,
            Metrics: {
                'Query Latency': 150,
                'Cache Lookup': 150,
            },
        };
    }
    return doc;
}

describe('PerfBenchmarkHarness', () => {
    const tempDirs: string[] = [];

    afterEach(() => {
        for (const dir of tempDirs.splice(0)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('selects local vs ci profile based on env and CIBaseline presence', () => {
        const docWithCI = makeBaselineDoc(true);
        const docWithoutCI = makeBaselineDoc(false);

        expect(PerfBenchmarkHarness.SelectActiveProfile(docWithCI, {}).Name).toBe('local');
        expect(PerfBenchmarkHarness.SelectActiveProfile(docWithCI, { GITHUB_ACTIONS: 'true' }).Name).toBe('ci');
        expect(PerfBenchmarkHarness.SelectActiveProfile(docWithCI, { MJ_PERF_PROFILE: 'ci' }).Name).toBe('ci');
        expect(
            PerfBenchmarkHarness.SelectActiveProfile(docWithCI, { GITHUB_ACTIONS: 'true', MJ_PERF_PROFILE: 'local' }).Name
        ).toBe('local');
        expect(PerfBenchmarkHarness.SelectActiveProfile(docWithoutCI, { GITHUB_ACTIONS: 'true' }).Name).toBe('local');
    });

    it('classifies IMPROVED, PASS, WARN, and FAIL metrics on local and CI profiles', () => {
        const doc = makeBaselineDoc(true);
        const samples: PerfMetricSample[] = [
            { Name: 'Query Latency', Unit: 'ms', Value: 80 }, // -20% => IMPROVED
            { Name: 'Cache Lookup', Unit: 'ms', Value: 135 }, // +35% (>25%) & +35ms (>10ms) => WARN
            { Name: 'Aggregate Total', Unit: 'ms', Value: 450, IsAggregate: true, BaselineValue: 200 }, // >2x & +250ms => FAIL
        ];

        const localEval = PerfBenchmarkHarness.EvaluateMetrics(samples, doc, { Env: {} });
        expect(localEval.ProfileName).toBe('local');
        expect(localEval.Rows.map((r) => r.Status)).toEqual(['IMPROVED', 'WARN', 'FAIL']);
        expect(localEval.WarnRows).toHaveLength(1);
        expect(localEval.FailedRows).toHaveLength(1);
        expect(localEval.AggregateBaseline).toBe(200);
        expect(localEval.AggregateCurrent).toBe(450);
        expect(localEval.AggregateSlownessFactor).toBe(2.25);
        expect(localEval.SummaryMarkdown).toContain('| **Aggregate Total** |');

        // Non-aggregate >failMultiplier on CI emits WARN unless StrictTiming is set
        const ciSamples: PerfMetricSample[] = [
            { Name: 'Query Latency', Unit: 'ms', Value: 400 }, // > 150*2 and +250 > 50 => WARN on CI
            { Name: 'Cache Lookup', Unit: 'ms', Value: 150 },
        ];
        const ciEval = PerfBenchmarkHarness.EvaluateMetrics(ciSamples, doc, { Env: { GITHUB_ACTIONS: 'true' } });
        expect(ciEval.ProfileName).toBe('ci');
        expect(ciEval.Rows[0].Status).toBe('WARN');
        expect(ciEval.FailedRows).toHaveLength(0);

        const ciStrictEval = PerfBenchmarkHarness.EvaluateMetrics(ciSamples, doc, {
            Env: { GITHUB_ACTIONS: 'true' },
            StrictTiming: true,
        });
        expect(ciStrictEval.Rows[0].Status).toBe('FAIL');
        expect(ciStrictEval.FailedRows).toHaveLength(1);
    });

    it('enforces structural assertions and failed rows in AssertEvaluationPassed', () => {
        const doc = makeBaselineDoc(false);
        const passingEval = PerfBenchmarkHarness.EvaluateMetrics(
            [{ Name: 'Query Latency', Unit: 'ms', Value: 100 }],
            doc,
            { Env: {} }
        );

        expect(() =>
            PerfBenchmarkHarness.AssertEvaluationPassed(passingEval, [
                { Name: 'Zero N+1', Passed: true, Message: 'ok' },
            ])
        ).not.toThrow();

        expect(() =>
            PerfBenchmarkHarness.AssertEvaluationPassed(passingEval, [
                { Name: 'Zero N+1', Passed: false, Message: 'executed 12 queries' },
            ])
        ).toThrow(/Zero N\+1: executed 12 queries/);

        const failingEval = PerfBenchmarkHarness.EvaluateMetrics(
            [{ Name: 'Query Latency', Unit: 'ms', Value: 300 }],
            doc,
            { Env: {} }
        );
        expect(() => PerfBenchmarkHarness.AssertEvaluationPassed(failingEval)).toThrow(
            /Performance regression gate failed on 1 metric/
        );
    });

    it('loads baseline JSON, writes artifacts, and updates baseline immutably with archival', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-perf-harness-'));
        tempDirs.push(tmpDir);

        const doc = makeBaselineDoc(true);
        const baselinePath = path.join(tmpDir, 'perf-baseline.json');
        fs.writeFileSync(baselinePath, JSON.stringify(doc, null, 2), 'utf8');

        const loaded = PerfBenchmarkHarness.LoadBaselineDocument(baselinePath);
        expect(loaded.Version).toBe(1);
        expect(loaded.Baseline.Commit).toBe('abc1234');

        expect(() => PerfBenchmarkHarness.LoadBaselineDocument(path.join(tmpDir, 'missing.json'))).toThrow(
            /Failed to read performance baseline file/
        );

        const samples: PerfMetricSample[] = [
            { Name: 'Query Latency', Unit: 'ms', Value: 90 },
            { Name: 'Cache Lookup', Unit: 'ms', Value: 95 },
        ];
        const evaluation = PerfBenchmarkHarness.EvaluateMetrics(samples, loaded, { Env: {} });
        const artifactDir = path.join(tmpDir, 'nested', 'artifacts');
        const paths = PerfBenchmarkHarness.WriteArtifacts(artifactDir, evaluation, { Suite: 'crm-perf' });

        expect(fs.readFileSync(paths.LatestMarkdownPath, 'utf8')).toContain('# Performance Benchmark Evaluation');
        const latestJson = JSON.parse(fs.readFileSync(paths.LatestJsonPath, 'utf8')) as {
            Metadata?: Record<string, string>;
        };
        expect(latestJson.Metadata?.Suite).toBe('crm-perf');
        expect(fs.readFileSync(paths.HistoryJsonlPath, 'utf8').trim().split('\n')).toHaveLength(1);

        const updated = PerfBenchmarkHarness.UpdateBaselineDocument(loaded, samples, {
            Target: 'local',
            Commit: 'def5678',
            RunnerLabel: 'M4 Max',
            Database: 'MJ_Updated',
            ArchivePreviousAs: 'Wave4',
        });

        expect(loaded.Baseline.Commit).toBe('abc1234'); // original not mutated
        expect(updated.Baseline.Commit).toBe('def5678');
        expect(updated.Baseline.Runner).toBe('M4 Max');
        expect(updated.Baseline.Database).toBe('MJ_Updated');
        expect(updated.Baseline.AggregateValue).toBe(185);
        expect(updated.HistoricalSnapshots?.Wave4.Commit).toBe('abc1234');
        expect(updated.HistoricalSnapshots?.Wave4.Metrics['Query Latency']).toBe(100);
    });
});
