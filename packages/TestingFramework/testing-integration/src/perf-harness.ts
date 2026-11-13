import fs from 'node:fs';
import path from 'node:path';
import { Assert } from './test-runner';

/**
 * A single measured performance sample to evaluate against a baseline profile.
 */
export interface PerfMetricSample {
    Name: string;
    Unit: string;
    Value: number;
    IsAggregate?: boolean;
    WarnMultiplier?: number;
    FailMultiplier?: number;
    BaselineValue?: number;
}

/**
 * A deterministic structural or invariant assertion evaluated alongside timing metrics.
 */
export interface PerfStructuralAssertion {
    Name: string;
    Passed: boolean;
    Message: string;
}

/**
 * Regression gate thresholds governing WARN and FAIL classification for timing metrics.
 */
export interface PerfGateThresholds {
    MaxTimingRegressionPercentWarn: number;
    MaxTimingRegressionMultiplierFail: number;
    MinAbsoluteTimingDeltaMsWarn: number;
    MinAbsoluteTimingDeltaMsFailLocal: number;
    MinAbsoluteTimingDeltaMsFailCI: number;
}

/**
 * A committed baseline profile (local or CI) storing reference metric values.
 */
export interface PerfBaselineProfile {
    Runner: string;
    Timestamp: string;
    Commit: string;
    Database?: string;
    AggregateValue?: number;
    Metrics: Record<string, number>;
}

/**
 * A historical snapshot archived before updating a baseline profile.
 */
export interface PerfHistoricalSnapshot {
    Commit: string;
    Timestamp: string;
    Metrics: Record<string, number>;
}

/**
 * Committed baseline document containing local/CI profiles, historical snapshots, and gate thresholds.
 */
export interface PerfBaselineDocument {
    Version: number;
    HistoricalSnapshots?: Record<string, PerfHistoricalSnapshot>;
    Baseline: PerfBaselineProfile;
    CIBaseline?: PerfBaselineProfile;
    Gates: PerfGateThresholds;
}

/**
 * Evaluation result for a single metric sample compared against its baseline.
 */
export interface PerfComparisonRow {
    Metric: string;
    Unit: string;
    Baseline: number;
    Current: number;
    DeltaPercent: number;
    Status: 'IMPROVED' | 'PASS' | 'WARN' | 'FAIL';
}

/**
 * Full evaluation summary produced by {@link PerfBenchmarkHarness.EvaluateMetrics}.
 */
export interface PerfSuiteEvaluation {
    ProfileName: 'local' | 'ci';
    Runner: string;
    Timestamp: string;
    AggregateBaseline: number;
    AggregateCurrent: number;
    AggregateSlownessFactor: number;
    Rows: PerfComparisonRow[];
    FailedRows: PerfComparisonRow[];
    WarnRows: PerfComparisonRow[];
    SummaryMarkdown: string;
}

/**
 * Options for updating a {@link PerfBaselineDocument} from a new set of metric samples.
 */
export interface UpdatePerfBaselineOptions {
    Target: 'local' | 'ci';
    Commit: string;
    RunnerLabel?: string;
    Database?: string;
    ArchivePreviousAs?: string;
}

/**
 * Options for {@link PerfBenchmarkHarness.EvaluateMetrics}.
 */
export interface EvaluatePerfMetricsOptions {
    Env?: NodeJS.ProcessEnv;
    StrictTiming?: boolean;
}

/**
 * Paths of the benchmark artifacts written by {@link PerfBenchmarkHarness.WriteArtifacts}.
 */
export interface PerfArtifactPaths {
    LatestJsonPath: string;
    LatestMarkdownPath: string;
    HistoryJsonlPath: string;
}

/**
 * Reusable performance benchmark evaluation, regression gating, artifact persistence,
 * and baseline management harness for MemberJunction applications and packages.
 */
export class PerfBenchmarkHarness {
    /**
     * Selects the active baseline profile (`ci` or `local`) based on environment variables
     * and whether `doc.CIBaseline` is populated.
     */
    public static SelectActiveProfile(
        doc: PerfBaselineDocument,
        env: NodeJS.ProcessEnv = process.env
    ): { Name: 'local' | 'ci'; Profile: PerfBaselineProfile } {
        const useCI =
            (env.GITHUB_ACTIONS === 'true' || env.MJ_PERF_PROFILE === 'ci') &&
            env.MJ_PERF_PROFILE !== 'local' &&
            Boolean(doc.CIBaseline);

        if (useCI && doc.CIBaseline) {
            return { Name: 'ci', Profile: doc.CIBaseline };
        }
        return { Name: 'local', Profile: doc.Baseline };
    }

    /**
     * Evaluates measured {@link PerfMetricSample} values against a {@link PerfBaselineDocument},
     * computing per-metric deltas, statuses (`IMPROVED` | `PASS` | `WARN` | `FAIL`), aggregate
     * slowness factor, and a formatted Markdown summary table.
     */
    public static EvaluateMetrics(
        samples: ReadonlyArray<PerfMetricSample>,
        doc: PerfBaselineDocument,
        options?: EvaluatePerfMetricsOptions
    ): PerfSuiteEvaluation {
        const env = options?.Env ?? process.env;
        const strictTiming = options?.StrictTiming ?? env.MJ_PERF_STRICT_TIMING === '1';
        const { Name: profileName, Profile: activeProfile } = PerfBenchmarkHarness.SelectActiveProfile(doc, env);
        const gates = doc.Gates;
        const minFailDeltaMs =
            profileName === 'ci' ? gates.MinAbsoluteTimingDeltaMsFailCI : gates.MinAbsoluteTimingDeltaMsFailLocal;

        const rows: PerfComparisonRow[] = samples.map((sample) => {
            const base = sample.BaselineValue ?? activeProfile.Metrics[sample.Name] ?? 0;
            const cur = sample.Value;
            const deltaPct = base > 0 ? Number((((cur - base) / base) * 100).toFixed(1)) : 0;
            const failMult = sample.FailMultiplier ?? gates.MaxTimingRegressionMultiplierFail;
            const warnPct =
                sample.WarnMultiplier !== undefined
                    ? Number(((sample.WarnMultiplier - 1) * 100).toFixed(1))
                    : gates.MaxTimingRegressionPercentWarn;

            let status: PerfComparisonRow['Status'] = 'PASS';
            if (deltaPct <= -10) {
                status = 'IMPROVED';
            } else if (cur > base * failMult && cur - base > minFailDeltaMs) {
                status = profileName === 'ci' && !sample.IsAggregate && !strictTiming ? 'WARN' : 'FAIL';
            } else if (deltaPct > warnPct && cur - base > gates.MinAbsoluteTimingDeltaMsWarn) {
                status = strictTiming ? 'FAIL' : 'WARN';
            }

            return {
                Metric: sample.Name,
                Unit: sample.Unit,
                Baseline: base,
                Current: cur,
                DeltaPercent: deltaPct,
                Status: status,
            };
        });

        const aggregateSamples = samples.filter((s) => s.IsAggregate === true);
        const aggSource = aggregateSamples.length > 0 ? aggregateSamples : samples;

        const aggregateCurrent = Number(aggSource.reduce((sum, s) => sum + s.Value, 0).toFixed(2));
        const computedAggBaseline = Number(
            aggSource
                .reduce((sum, s) => sum + (s.BaselineValue ?? activeProfile.Metrics[s.Name] ?? 0), 0)
                .toFixed(2)
        );
        const aggregateBaseline =
            aggregateSamples.length > 0 && computedAggBaseline > 0
                ? computedAggBaseline
                : (activeProfile.AggregateValue ?? computedAggBaseline);

        const aggregateSlownessFactor =
            aggregateBaseline > 0 ? Number((aggregateCurrent / aggregateBaseline).toFixed(2)) : 1;

        const failedRows = rows.filter((r) => r.Status === 'FAIL');
        const warnRows = rows.filter((r) => r.Status === 'WARN');
        const timestamp = new Date().toISOString();

        const summaryMarkdown = PerfBenchmarkHarness.formatMarkdown({
            ProfileName: profileName,
            Runner: activeProfile.Runner,
            Timestamp: timestamp,
            AggregateBaseline: aggregateBaseline,
            AggregateCurrent: aggregateCurrent,
            AggregateSlownessFactor: aggregateSlownessFactor,
            Rows: rows,
        });

        return {
            ProfileName: profileName,
            Runner: activeProfile.Runner,
            Timestamp: timestamp,
            AggregateBaseline: aggregateBaseline,
            AggregateCurrent: aggregateCurrent,
            AggregateSlownessFactor: aggregateSlownessFactor,
            Rows: rows,
            FailedRows: failedRows,
            WarnRows: warnRows,
            SummaryMarkdown: summaryMarkdown,
        };
    }

    /**
     * Asserts that all structural assertions passed and no metric rows were classified as `FAIL`.
     */
    public static AssertEvaluationPassed(
        evaluation: PerfSuiteEvaluation,
        structuralAssertions?: ReadonlyArray<PerfStructuralAssertion>
    ): void {
        if (structuralAssertions) {
            for (const assertion of structuralAssertions) {
                Assert(assertion.Passed, `${assertion.Name}: ${assertion.Message}`);
            }
        }

        Assert(
            evaluation.FailedRows.length === 0,
            `Performance regression gate failed on ${evaluation.FailedRows.length} metric(s): ${evaluation.FailedRows.map(
                (r) => `${r.Metric} (current=${r.Current}${r.Unit}, baseline=${r.Baseline}${r.Unit}, delta=${r.DeltaPercent}%)`
            ).join('; ')}`
        );
    }

    /**
     * Loads and parses a {@link PerfBaselineDocument} JSON file directly inside a `try/catch` block.
     */
    public static LoadBaselineDocument(filePath: string): PerfBaselineDocument {
        let raw: string;
        try {
            raw = fs.readFileSync(filePath, 'utf8');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`Failed to read performance baseline file at ${filePath}: ${msg}`);
        }

        try {
            return JSON.parse(raw) as PerfBaselineDocument;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`Failed to parse performance baseline JSON at ${filePath}: ${msg}`);
        }
    }

    /**
     * Persists `latest.json`, `latest.md`, and appends a line to `history.jsonl` inside `outputDir`.
     */
    public static WriteArtifacts(
        outputDir: string,
        evaluation: PerfSuiteEvaluation,
        extraMetadata?: Record<string, string | number | boolean>
    ): PerfArtifactPaths {
        fs.mkdirSync(outputDir, { recursive: true });

        const latestJsonPath = path.join(outputDir, 'latest.json');
        const latestMarkdownPath = path.join(outputDir, 'latest.md');
        const historyJsonlPath = path.join(outputDir, 'history.jsonl');

        const jsonPayload = extraMetadata
            ? { ...evaluation, Metadata: extraMetadata }
            : evaluation;

        fs.writeFileSync(latestJsonPath, JSON.stringify(jsonPayload, null, 2) + '\n', 'utf8');
        fs.writeFileSync(latestMarkdownPath, evaluation.SummaryMarkdown, 'utf8');
        fs.appendFileSync(historyJsonlPath, JSON.stringify(jsonPayload) + '\n', 'utf8');

        return {
            LatestJsonPath: latestJsonPath,
            LatestMarkdownPath: latestMarkdownPath,
            HistoryJsonlPath: historyJsonlPath,
        };
    }

    /**
     * Returns a new {@link PerfBaselineDocument} with the target profile (`local` or `ci`) updated
     * from `samples`, optionally archiving the previous profile into `HistoricalSnapshots`.
     */
    public static UpdateBaselineDocument(
        doc: PerfBaselineDocument,
        samples: ReadonlyArray<PerfMetricSample>,
        options: UpdatePerfBaselineOptions
    ): PerfBaselineDocument {
        const metrics: Record<string, number> = {};
        for (const sample of samples) {
            metrics[sample.Name] = sample.Value;
        }

        const aggregateSamples = samples.filter((s) => s.IsAggregate === true);
        const aggSource = aggregateSamples.length > 0 ? aggregateSamples : samples;
        const aggregateValue = Number(aggSource.reduce((sum, s) => sum + s.Value, 0).toFixed(2));

        const newProfile: PerfBaselineProfile = {
            Runner: options.RunnerLabel ?? (options.Target === 'ci' ? 'ubuntu-latest (GitHub Actions)' : 'Local Reference'),
            Timestamp: new Date().toISOString(),
            Commit: options.Commit,
            ...(options.Database !== undefined ? { Database: options.Database } : {}),
            AggregateValue: aggregateValue,
            Metrics: metrics,
        };

        const historicalSnapshots: Record<string, PerfHistoricalSnapshot> = {
            ...(doc.HistoricalSnapshots ?? {}),
        };

        if (options.ArchivePreviousAs) {
            const previousProfile = options.Target === 'ci' ? doc.CIBaseline : doc.Baseline;
            if (previousProfile) {
                historicalSnapshots[options.ArchivePreviousAs] = {
                    Commit: previousProfile.Commit,
                    Timestamp: previousProfile.Timestamp,
                    Metrics: { ...previousProfile.Metrics },
                };
            }
        }

        const updatedDoc: PerfBaselineDocument = {
            Version: doc.Version,
            ...(Object.keys(historicalSnapshots).length > 0 ? { HistoricalSnapshots: historicalSnapshots } : {}),
            Baseline: options.Target === 'local' ? newProfile : { ...doc.Baseline, Metrics: { ...doc.Baseline.Metrics } },
            ...(options.Target === 'ci'
                ? { CIBaseline: newProfile }
                : doc.CIBaseline
                  ? { CIBaseline: { ...doc.CIBaseline, Metrics: { ...doc.CIBaseline.Metrics } } }
                  : {}),
            Gates: { ...doc.Gates },
        };

        return updatedDoc;
    }

    private static formatMarkdown(input: {
        ProfileName: 'local' | 'ci';
        Runner: string;
        Timestamp: string;
        AggregateBaseline: number;
        AggregateCurrent: number;
        AggregateSlownessFactor: number;
        Rows: ReadonlyArray<PerfComparisonRow>;
    }): string {
        const lines: string[] = [
            `# Performance Benchmark Evaluation`,
            ``,
            `- **Profile**: \`${input.ProfileName}\` (${input.Runner})`,
            `- **Timestamp**: \`${input.Timestamp}\``,
            `- **Aggregate**: **${input.AggregateCurrent}** vs baseline **${input.AggregateBaseline}** (**${input.AggregateSlownessFactor}x**)`,
            ``,
            `| Metric | Unit | Baseline | Current | Delta | Status |`,
            `|---|---|---:|---:|---:|---|`,
        ];

        for (const row of input.Rows) {
            const deltaCell = `${row.DeltaPercent > 0 ? '+' : ''}${row.DeltaPercent}%`;
            lines.push(
                `| **${row.Metric}** | \`${row.Unit}\` | ${row.Baseline} | **${row.Current}** | ${deltaCell} | **${row.Status}** |`
            );
        }

        lines.push('');
        return lines.join('\n');
    }
}
