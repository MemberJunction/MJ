/**
 * @fileoverview Turns an agent-discovery Decision Eval suite's `MJ: Test Runs` into a scorecard: one
 * set of metrics per cell, as JSON and as Markdown. Pure: the scorecard rig
 * (`decision-eval-scorecard.ts --decision agent-discovery`) queries the runs and writes the files.
 *
 * As with routing (`scorecard.ts`), a run's cell is the bracketed part of its test's name, its label
 * is the test's expected outcome, and everything else is the driver's `ActualOutput`. Cases are
 * named by ID only, never by text.
 *
 * @module @memberjunction/testing-engine
 */

import {
    DECISION_EVAL_BOOTSTRAP_RESAMPLES,
    DECISION_EVAL_CALIBRATION_FOLDS,
    DECISION_EVAL_SEED,
    type ReliabilityBin
} from './metrics';
import {
    ComputeDiscoveryCellMetrics,
    DISCOVERY_INJECTION_THRESHOLDS,
    type DiscoveryBaselineCellMetrics,
    type DiscoveryCalibrationSummary,
    type DiscoveryCellMetrics,
    type DiscoveryDecisionCellMetrics,
    type DiscoveryEvalObservation,
    type DiscoveryMetricOptions,
    type DiscoveryNoneKindSummary,
    type InjectionOperatingPoint
} from './discovery-metrics';
import {
    DISCOVERY_NONE_KINDS,
    DiscoveryEvalActualOutputSchema,
    DiscoveryEvalExpectedSchema,
    type DiscoveryEvalActualOutput,
    type DiscoveryEvalExpected
} from './discovery-types';
import type { DiscoveryCatalogDrift } from './discovery-suite';
import { SplitDecisionEvalTestName, type DecisionEvalRunRow, type DecisionEvalUnreadableRun } from './scorecard';

/** A discovery run the scorecard could read, with its cell. */
export interface DiscoveryEvalCellObservation {
    Cell: string;
    Observation: DiscoveryEvalObservation;
    /** The resolved model that answered, when recorded. */
    ResolvedModel: string | null;
    SamplingRequested: boolean;
    SamplingApplied: boolean;
}

/** One cell's scorecard entry. */
export interface DiscoveryEvalScorecardCell {
    Cell: string;
    Metrics: DiscoveryCellMetrics;
    /** How many runs each resolved model answered. */
    ResolvedModels: Record<string, number>;
    SamplingRequested: boolean;
    SamplingApplied: boolean;
}

/** The whole discovery scorecard. */
export interface DiscoveryEvalScorecard {
    Suite: string;
    Since: string | null;
    Until: string | null;
    GeneratedAt: string;
    Seed: number;
    BootstrapResamples: number;
    CalibrationFolds: number;
    Runs: number;
    UnreadableRuns: number;
    UnreadableReasons: Record<string, number>;
    /** How the catalog differs from the corpus's snapshot, when the rig was given one. */
    CatalogDrift: DiscoveryCatalogDrift | null;
    Cells: DiscoveryEvalScorecardCell[];
}

/** What the discovery scorecard is built with. */
export interface DiscoveryEvalScorecardOptions extends DiscoveryMetricOptions {
    Suite: string;
    Since?: string | null;
    Until?: string | null;
    /** Defaults to now. */
    GeneratedAt?: string;
    CatalogDrift?: DiscoveryCatalogDrift | null;
}

/**
 * Reads one discovery run. A run still in progress, or one whose name or expected outcome can't be
 * read, is unreadable. A run with no readable `ActualOutput` is an observation with no answer.
 *
 * @param row The run.
 */
export function ReadDiscoveryEvalRun(row: DecisionEvalRunRow): DiscoveryEvalCellObservation | DecisionEvalUnreadableRun {
    if (row.Status === 'Running' || row.Status === 'Pending') {
        return { Unreadable: 'still running' };
    }
    const name = SplitDecisionEvalTestName(row.TestName);
    if (!name) {
        return { Unreadable: 'test name has no [cell]' };
    }
    const expected = parseJson(row.ExpectedOutputData, DiscoveryEvalExpectedSchema);
    if (!expected) {
        return { Unreadable: 'no readable expected outcome' };
    }
    const actual = parseJson(row.ActualOutputData, DiscoveryEvalActualOutputSchema);
    return {
        Cell: name.Cell,
        Observation: ToDiscoveryObservation(name.CaseId, expected, actual, row.PromptRunCost ?? actual?.CostUSD ?? row.CostUSD),
        ResolvedModel: actual?.Model?.ResolvedModel ?? actual?.Model?.AnsweredModelName ?? null,
        SamplingRequested: actual ? actual.Sampling.RequestedTemperature !== null || actual.Sampling.RequestedSeed !== null : false,
        SamplingApplied: actual?.Sampling.Applied ?? false
    };
}

/**
 * One run as the metrics read it. Without an `ActualOutput` the run has no arm and no answer.
 *
 * @param caseId The request's ID.
 * @param expected The run's label.
 * @param actual The run's actual output, or null.
 * @param costUSD The run's cost, when known.
 */
export function ToDiscoveryObservation(
    caseId: string,
    expected: DiscoveryEvalExpected,
    actual: DiscoveryEvalActualOutput | null,
    costUSD: number | null
): DiscoveryEvalObservation {
    return {
        CaseId: caseId,
        Label: expected.label,
        Kind: expected.label === 'none' ? expected.kind : null,
        ExpectedAgentId: expected.label === 'agent' ? expected.agentId : null,
        Arm: actual?.Arm ?? null,
        ChosenAgentId: actual?.ChosenAgentId ?? null,
        TopRankedAgentId: actual?.Baseline?.TopRanked?.AgentId ?? null,
        Confidence: actual?.Confidence ?? null,
        AnyApplies: actual?.AnyApplies ?? null,
        WouldInject: actual?.WouldInject ?? null,
        LabelledAgentOffered: actual?.LabelledAgentOffered ?? null,
        LatencyMs: actual?.LatencyMs ?? null,
        WithinProductionTimeout: actual?.WithinProductionTimeout ?? null,
        CostUSD: costUSD,
        FailedOver: actual?.Model?.FailedOver ?? false,
        FailoverAllowed: actual?.Model?.FailoverAllowed ?? true
    };
}

/**
 * Builds the scorecard: reads every run, groups the readable ones by cell (sorted by label), and
 * computes each cell's metrics.
 *
 * @param rows The suite's runs.
 * @param options The suite's name, the window, the catalog drift and the metric options.
 */
export function BuildDiscoveryEvalScorecard(rows: readonly DecisionEvalRunRow[], options: DiscoveryEvalScorecardOptions): DiscoveryEvalScorecard {
    const byCell = new Map<string, DiscoveryEvalCellObservation[]>();
    const unreadable: Record<string, number> = {};
    for (const row of rows) {
        const read = ReadDiscoveryEvalRun(row);
        if ('Unreadable' in read) {
            unreadable[read.Unreadable] = (unreadable[read.Unreadable] ?? 0) + 1;
            continue;
        }
        byCell.set(read.Cell, [...(byCell.get(read.Cell) ?? []), read]);
    }
    return {
        Suite: options.Suite,
        Since: options.Since ?? null,
        Until: options.Until ?? null,
        GeneratedAt: options.GeneratedAt ?? new Date().toISOString(),
        Seed: options.Seed ?? DECISION_EVAL_SEED,
        BootstrapResamples: options.BootstrapResamples ?? DECISION_EVAL_BOOTSTRAP_RESAMPLES,
        CalibrationFolds: options.CalibrationFolds ?? DECISION_EVAL_CALIBRATION_FOLDS,
        Runs: rows.length,
        UnreadableRuns: Object.values(unreadable).reduce((sum, n) => sum + n, 0),
        UnreadableReasons: unreadable,
        CatalogDrift: options.CatalogDrift ?? null,
        Cells: [...byCell.keys()].sort().map(cell => scorecardCell(cell, byCell.get(cell) ?? [], options))
    };
}

/**
 * The scorecard as Markdown: the decision cells' summary, the baselines' summary, then each cell's
 * detail (the injection table, the two reliability tables, `none` runs by kind, and the least
 * repeatable cases, by ID).
 *
 * @param scorecard The scorecard.
 */
export function RenderDiscoveryEvalScorecard(scorecard: DiscoveryEvalScorecard): string {
    const decisionCells = scorecard.Cells.filter((c): c is DiscoveryEvalScorecardCell & { Metrics: DiscoveryDecisionCellMetrics } => c.Metrics.Arm === 'decision');
    const baselineCells = scorecard.Cells.filter((c): c is DiscoveryEvalScorecardCell & { Metrics: DiscoveryBaselineCellMetrics } => c.Metrics.Arm !== 'decision');
    return [
        ...renderHeader(scorecard),
        ...renderDecisionSummary(decisionCells),
        ...renderBaselineSummary(baselineCells),
        ...decisionCells.flatMap(renderDecisionDetail),
        ...baselineCells.flatMap(renderBaselineDetail)
    ].join('\n');
}

/** Parses a JSON column against a schema, or null. */
function parseJson<T>(text: string | null, schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }): T | null {
    if (!text) {
        return null;
    }
    try {
        const result = schema.safeParse(JSON.parse(text));
        return result.success ? result.data : null;
    } catch {
        return null;
    }
}

/** One cell's entry. */
function scorecardCell(cell: string, observations: readonly DiscoveryEvalCellObservation[], options: DiscoveryMetricOptions): DiscoveryEvalScorecardCell {
    const resolved: Record<string, number> = {};
    for (const o of observations) {
        if (o.ResolvedModel) {
            resolved[o.ResolvedModel] = (resolved[o.ResolvedModel] ?? 0) + 1;
        }
    }
    return {
        Cell: cell,
        Metrics: ComputeDiscoveryCellMetrics(observations.map(o => o.Observation), options),
        ResolvedModels: resolved,
        SamplingRequested: observations.some(o => o.SamplingRequested),
        SamplingApplied: observations.some(o => o.SamplingApplied)
    };
}

/** A number to a fixed number of places, or an em dash. */
function num(value: number | null | undefined, places: number = 3): string {
    return value === null || value === undefined ? '—' : value.toFixed(places);
}

/** A value with its interval. */
function withInterval(value: number | null, interval: { Lower: number; Upper: number } | null): string {
    return interval ? `${num(value)} [${num(interval.Lower)}, ${num(interval.Upper)}]` : num(value);
}

/** A raw value and its calibrated one. */
function rawToCalibrated(raw: number | null, calibrated: number | null | undefined): string {
    return `${num(raw)} → ${num(calibrated)}`;
}

/** Platt parameters, or an em dash. */
function platt(summary: DiscoveryCalibrationSummary): string {
    return summary.Platt ? `${num(summary.Platt.A, 4)} / ${num(summary.Platt.B, 4)}` : '—';
}

/** A count and its rate. */
function countAndRate(summary: DiscoveryNoneKindSummary): string {
    return `${summary.Injected}/${summary.Runs} (${num(summary.Rate)})`;
}

/** A Markdown table row. */
function row(cells: readonly string[]): string {
    return `| ${cells.join(' | ')} |`;
}

/** A Markdown table header and its rule. */
function header(cells: readonly string[]): string[] {
    return [row(cells), row(cells.map(() => '---'))];
}

/** The title, the run-level facts, the definitions and any catalog drift. */
function renderHeader(scorecard: DiscoveryEvalScorecard): string[] {
    const window = [scorecard.Since ? `since ${scorecard.Since}` : null, scorecard.Until ? `until ${scorecard.Until}` : null]
        .filter((part): part is string => part !== null).join(', ') || 'all runs';
    const reasons = Object.entries(scorecard.UnreadableReasons).map(([reason, n]) => `${reason} ×${n}`).join(', ');
    const drift = scorecard.CatalogDrift;
    return [
        `# Decision Eval scorecard (agent discovery): ${scorecard.Suite}`,
        '',
        `Generated ${scorecard.GeneratedAt}. Window: ${window}. ${scorecard.Runs} run(s); `
            + `${scorecard.UnreadableRuns} unreadable${reasons ? ` (${reasons})` : ''}.`,
        '',
        'Metrics are over runs; 95% intervals are a percentile bootstrap over cases '
            + `(${scorecard.BootstrapResamples} resamples, seed ${scorecard.Seed}); calibration is Platt scaling on logit(p), `
            + `${scorecard.CalibrationFolds}-fold out of fold with folds dealt by case, and the Platt A/B shown are fitted on all the runs. `
            + 'Top-1 is on `agent` runs. Confidence calibration: the Choice confidence as P(chose the labelled agent), on `agent` runs. '
            + '`anyApplies` calibration: P(label is `agent`), on all runs. Injection at T: confidence ≥ T and anyApplies ≥ T.',
        '',
        ...(drift
            ? [`Catalog drift since the corpus snapshot: ${drift.Added.length} added, ${drift.Removed.length} removed, ${drift.Changed.length} changed.`, '']
            : [])
    ];
}

/** The decision cells' summary table. */
function renderDecisionSummary(cells: ReadonlyArray<DiscoveryEvalScorecardCell & { Metrics: DiscoveryDecisionCellMetrics }>): string[] {
    if (cells.length === 0) {
        return [];
    }
    return [
        '## Decision cells',
        '',
        ...header(['Cell', 'Agent runs', 'Top-1 [95% CI]', 'Conf. ECE raw → cal.', 'Conf. Platt A / B', 'anyApplies AUC',
            'anyApplies ECE raw → cal.', 'anyApplies Platt A / B', 'Prod. coverage', 'Prod. precision', 'Prod. false inj.',
            'Choice agreement', 'p50 ms', 'p95 ms', 'Within timeout', '$ / 1k', 'Failovers', 'Label not offered']),
        ...cells.map(({ Cell, Metrics: m }) => row([
            Cell, String(m.Top1.N), withInterval(m.Top1.Accuracy, m.Top1.AccuracyCI),
            rawToCalibrated(m.ConfidenceCalibration.Raw.ECE, m.ConfidenceCalibration.Calibrated?.ECE), platt(m.ConfidenceCalibration),
            num(m.AnyAppliesCalibration.Raw.RocAuc), rawToCalibrated(m.AnyAppliesCalibration.Raw.ECE, m.AnyAppliesCalibration.Calibrated?.ECE),
            platt(m.AnyAppliesCalibration), num(m.Production.Coverage), num(m.Production.Precision), num(m.Production.FalseInjectionRate),
            num(m.Repeatability.MeanChoiceAgreement), num(m.Latency.P50, 0), num(m.Latency.P95, 0), num(m.Latency.WithinProductionTimeoutRate),
            num(m.Cost.CostPer1kUSD, 4), `${m.Counts.FailoverRuns} (${m.Counts.ExcludedFailoverRuns} excluded)`, String(m.Counts.LabelledAgentNotOffered)
        ])),
        ''
    ];
}

/** The baseline cells' summary table. */
function renderBaselineSummary(cells: ReadonlyArray<DiscoveryEvalScorecardCell & { Metrics: DiscoveryBaselineCellMetrics }>): string[] {
    if (cells.length === 0) {
        return [];
    }
    return [
        '## Baseline cells (Find Candidate Agents\' semantic search)',
        '',
        ...header(['Cell', 'Agent runs', 'Top-1, first row [95% CI]', 'Top-1, best ranked', '`none` below the floor', 'p50 ms', 'p95 ms']),
        ...cells.map(({ Cell, Metrics: m }) => row([
            Cell, String(m.Top1.N), withInterval(m.Top1.Accuracy, m.Top1.AccuracyCI), num(m.TopRankedAccuracy),
            `${m.NoneBelowFloor.Injected}/${m.NoneBelowFloor.Runs} (${num(m.NoneBelowFloor.Rate)})`, num(m.Latency.P50, 0), num(m.Latency.P95, 0)
        ])),
        ''
    ];
}

/** One decision cell's detail. */
function renderDecisionDetail(cell: DiscoveryEvalScorecardCell & { Metrics: DiscoveryDecisionCellMetrics }): string[] {
    const m = cell.Metrics;
    const models = Object.entries(cell.ResolvedModels).map(([model, n]) => `${model} ×${n}`).join(', ') || 'not recorded';
    return [
        `## ${cell.Cell}`,
        '',
        `Runs ${m.Counts.Runs}: ${m.Counts.UsableRuns} usable, ${m.Counts.NoAnswerRuns} without a usable answer, `
            + `${m.Counts.FailoverRuns} answered by another model (${m.Counts.ExcludedFailoverRuns} excluded). `
            + `${m.Counts.LabelledAgentNotOffered} \`agent\` run(s) could not choose the labelled agent (not among the options). `
            + `Repeatability over ${m.Repeatability.Cases} case(s). Answered by: ${models}. `
            + `Sampling: ${cell.SamplingRequested ? (cell.SamplingApplied ? 'requested and applied' : 'requested, NOT applied') : 'not requested'}.`,
        '',
        ...renderInjection(m),
        ...renderReliability('Choice confidence as P(correct)', m.ConfidenceCalibration),
        ...renderReliability('anyApplies as P(label is agent)', m.AnyAppliesCalibration),
        ...renderNoneByKind(`\`none\` runs injected at production's threshold (${m.Production.MinConfidence})`, m.Production.NoneByKind),
        ...renderWorstCases(m)
    ];
}

/** One baseline cell's detail. */
function renderBaselineDetail(cell: DiscoveryEvalScorecardCell & { Metrics: DiscoveryBaselineCellMetrics }): string[] {
    const m = cell.Metrics;
    return [
        `## ${cell.Cell}`,
        '',
        `Runs ${m.Counts.Runs}: ${m.Counts.UsableRuns} usable, ${m.Counts.NoAnswerRuns} without a search result. `
            + `${m.Counts.LabelledAgentNotOffered} \`agent\` run(s) whose labelled agent is not in the catalog.`,
        '',
        ...renderNoneByKind('`none` runs where some candidate passes the floor (the action lists it)', m.NoneByKind)
    ];
}

/** The injection operating table, raw beside calibrated. */
function renderInjection(m: DiscoveryDecisionCellMetrics): string[] {
    const cells = (p: InjectionOperatingPoint | undefined): string[] =>
        [p ? String(p.Injected) : '—', num(p?.Coverage), num(p?.Precision), num(p?.PrecisionAllInjections), num(p?.FalseInjectionRate)];
    return [
        '### Injection (confidence ≥ T and anyApplies ≥ T)',
        '',
        ...header(['T', 'Raw injected', 'Raw coverage', 'Raw precision', 'Raw precision (all)', 'Raw false inj.',
            'Cal. injected', 'Cal. coverage', 'Cal. precision', 'Cal. precision (all)', 'Cal. false inj.']),
        ...m.Injection.Raw.map((point, i) => row([num(point.Threshold, 2), ...cells(point), ...cells(m.Injection.Calibrated?.[i])])),
        '',
        `Thresholds: ${DISCOVERY_INJECTION_THRESHOLDS.map(t => t.toFixed(2)).join(', ')}. `
            + 'Coverage: injected `agent` runs / `agent` runs. Precision: of injected `agent` runs, those naming the labelled agent; '
            + '(all): of every injection, with `none` injections counted wrong. False inj.: injected `none` runs / `none` runs.',
        ''
    ];
}

/** One probability's reliability table, raw beside calibrated. */
function renderReliability(title: string, summary: DiscoveryCalibrationSummary): string[] {
    const binCells = (bin: ReliabilityBin | undefined): string[] => [bin ? String(bin.Count) : '—', num(bin?.MeanPredicted), num(bin?.ObservedRate)];
    return [
        `### Reliability: ${title} (n = ${summary.Raw.N}; AUC ${num(summary.Raw.RocAuc)}, Brier ${num(summary.Raw.Brier)} → ${num(summary.Calibrated?.Brier)})`,
        '',
        ...header(['Bin', 'Raw count', 'Raw mean predicted', 'Raw observed', 'Cal. count', 'Cal. mean predicted', 'Cal. observed']),
        ...summary.Raw.Bins.map((bin, i) => row([`${num(bin.Lower, 1)}–${num(bin.Upper, 1)}`, ...binCells(bin), ...binCells(summary.Calibrated?.Bins[i])])),
        ''
    ];
}

/** The `none` runs by kind. */
function renderNoneByKind(title: string, byKind: Record<string, DiscoveryNoneKindSummary>): string[] {
    return [
        `### ${title}`,
        '',
        ...header(['Kind', 'Injected / runs']),
        ...DISCOVERY_NONE_KINDS.map(kind => row([kind, byKind[kind] ? countAndRate(byKind[kind]) : '—'])),
        ''
    ];
}

/** The least repeatable cases, by ID. */
function renderWorstCases(m: DiscoveryDecisionCellMetrics): string[] {
    if (m.Repeatability.Worst.length === 0) {
        return ['No case has two usable repeats.', ''];
    }
    return [
        '### Least repeatable cases (IDs only)',
        '',
        ...header(['Case ID', 'Repeats', 'Choice agreement', 'Inject agreement', 'Confidence SD', 'anyApplies SD']),
        ...m.Repeatability.Worst.map(c => row([c.CaseId, String(c.Repeats), num(c.ChoiceAgreement), num(c.InjectAgreement),
            num(c.ConfidenceStdDev), num(c.AnyAppliesStdDev)])),
        ''
    ];
}
