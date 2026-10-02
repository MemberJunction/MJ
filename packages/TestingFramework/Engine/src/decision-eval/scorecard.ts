/**
 * @fileoverview Turns a Decision Eval suite's `MJ: Test Runs` into a scorecard: one set of metrics
 * per cell, as JSON and as Markdown. Pure: the scorecard rig queries the runs and writes the files.
 *
 * A run's cell is the bracketed part of its test's name (`<point id> [<cell label>]`), its label is
 * the test's expected outcome, and its probability, latency and model are the driver's
 * `ActualOutput` (the probability falls back to the `decision-label-match` oracle's details in
 * `ResultDetails`). The scorecard names cases by ID only, never by text.
 *
 * Two kinds of figure, kept apart:
 * - the accuracy-type metrics score the thread Likelihood alone, on each case's mean over its
 *   repeats: what calibration is fitted on, and an upper bound on what routing does;
 * - the routing summary scores production's own verdict per run, end to end: one call, the agent
 *   Choice and the thread Likelihood read together at the thresholds and calibration the driver
 *   recorded with the run.
 *
 * @module @memberjunction/testing-engine
 */

import {
    ComputeCellMetrics,
    DECISION_EVAL_BOOTSTRAP_RESAMPLES,
    DECISION_EVAL_CALIBRATION_FOLDS,
    DECISION_EVAL_SEED,
    type DecisionEvalCellMetrics,
    type DecisionEvalMetricOptions,
    type DecisionEvalObservation,
    type ProbabilityMetrics
} from './metrics';
import { z } from 'zod';
import {
    DecisionEvalActualOutputSchema,
    DecisionEvalExpectedSchema,
    DecisionLabelMatchDetailsSchema,
    type DecisionEvalActualOutput,
    type DecisionEvalExpected,
    type DecisionEvalRoutingPolicy
} from './types';

/** The oracle results in a run's `ResultDetails`, as far as the scorecard reads them. */
const OracleResultsSchema = z.array(z.object({ oracleType: z.string(), details: z.unknown().optional() }));

/** The continue prior the routing summary weights its two classes at: a chat's usual mix. */
export const DECISION_EVAL_ROUTING_CONTINUE_PRIOR = 0.9;

/** One `MJ: Test Runs` row, with its prompt run's cost, as the scorecard reads it. */
export interface DecisionEvalRunRow {
    /** The test's name: `<point id> [<cell label>]`. */
    TestName: string;
    /** The run's status. */
    Status: string;
    /** The run's `ExpectedOutputData` JSON. */
    ExpectedOutputData: string | null;
    /** The run's `ActualOutputData` JSON. */
    ActualOutputData: string | null;
    /** The run's `ResultDetails` JSON: its oracle results. */
    ResultDetails: string | null;
    /** The run's `CostUSD`. */
    CostUSD: number | null;
    /** The linked prompt run's cost (`TotalCost`, else `Cost`), when it has one. */
    PromptRunCost: number | null;
}

/** A run's recorded routing verdict, and the policy it was reached under. */
export interface DecisionEvalRoutingRun {
    Verdict: NonNullable<DecisionEvalActualOutput['RoutingVerdict']>;
    /** The policy, or null when the run recorded none: a verdict from before routing was calibrated. */
    Policy: DecisionEvalRoutingPolicy | null;
}

/** A run the scorecard could read, with its cell and what it tells the metrics. */
export interface DecisionEvalCellObservation {
    Cell: string;
    Observation: DecisionEvalObservation;
    /** Production's routing verdict for the run, or null when it recorded none (no answers). */
    Routing: DecisionEvalRoutingRun | null;
    /** The resolved model that answered, when recorded. */
    ResolvedModel: string | null;
    /** Whether the cell asked for a temperature or seed, and whether it reached the model. */
    SamplingRequested: boolean;
    SamplingApplied: boolean;
}

/** A run the scorecard could not read, and why. */
export interface DecisionEvalUnreadableRun {
    Unreadable: string;
}

/** How many of some runs had an outcome. */
export interface RoutingShare {
    Runs: number;
    Count: number;
    /** Count / Runs, or null with no runs. */
    Rate: number | null;
}

/** Production's routing outcomes on one set of runs. */
export interface RoutingVerdictRates {
    /**
     * `switch` runs that left the thread, to another agent or to someone else. A move to the wrong
     * agent counts: the corpus labels continue or switch, not which agent.
     */
    SwitchLeft: RoutingShare;
    /** `continue` runs that kept the thread. */
    ContinueKept: RoutingShare;
    /** `ambiguous` runs that kept the thread. Reported apart, not scored. */
    AmbiguousKept: RoutingShare;
    /** The mean of the switch and continue rates, over those defined. */
    BalancedAccuracy: number | null;
    /**
     * Accuracy at a {@link DECISION_EVAL_ROUTING_CONTINUE_PRIOR} continue prior: prior × continue
     * kept + (1 − prior) × switch left. Always-continue scores the prior.
     */
    AccuracyAtContinuePrior: number | null;
}

/**
 * Production's routing verdict, end to end, per run: one call each, the agent Choice and the thread
 * Likelihood read together at the thresholds and calibration the driver recorded with the run.
 * Usable runs only (a failed-over run in a cell that forbade it is left out), and only verdicts
 * recorded with their policy: an older verdict used raw thresholds.
 */
export interface RoutingVerdictSummary {
    /** Usable runs whose verdict was recorded with its policy: the runs scored. */
    Runs: number;
    /** Usable runs whose verdict was recorded without a policy (before routing was calibrated): not scored. */
    UnscoredRuns: number;
    /** Each policy the scored verdicts were reached under, described, with its run count. */
    Policies: Record<string, number>;
    /** Scored runs whose in-process latency passed their policy's timeout. */
    OverTimeoutRuns: number;
    /** The verdicts as answered. */
    AsAnswered: RoutingVerdictRates;
    /**
     * The same, with a run over its timeout counted as kept, as production keeps it. The latency is
     * in-process, without the network, so this too is an upper bound on what the chat does.
     */
    WithinTimeout: RoutingVerdictRates;
}

/** One cell's scorecard entry. */
export interface DecisionEvalScorecardCell {
    Cell: string;
    Metrics: DecisionEvalCellMetrics;
    /** Production's routing verdict, end to end, per run. */
    Routing: RoutingVerdictSummary;
    /** How many runs each resolved model answered. */
    ResolvedModels: Record<string, number>;
    SamplingRequested: boolean;
    SamplingApplied: boolean;
}

/** The whole scorecard. */
export interface DecisionEvalScorecard {
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
    Cells: DecisionEvalScorecardCell[];
}

/** What the scorecard is built with. */
export interface DecisionEvalScorecardOptions extends DecisionEvalMetricOptions {
    Suite: string;
    Since?: string | null;
    Until?: string | null;
    /** Defaults to now. */
    GeneratedAt?: string;
}

/**
 * A test name's point ID and cell label, or null when it isn't `<point id> [<cell label>]`.
 *
 * @param name The test's name.
 */
export function SplitDecisionEvalTestName(name: string): { CaseId: string; Cell: string } | null {
    const match = /^(.*) \[([^[\]]*)\]$/.exec(name);
    return match ? { CaseId: match[1], Cell: match[2] } : null;
}

/**
 * Reads one run. A run still in progress, or one whose name or expected outcome can't be read, is
 * unreadable. A run with no readable `ActualOutput` is an observation with no probability.
 *
 * @param row The run.
 */
export function ReadDecisionEvalRun(row: DecisionEvalRunRow): DecisionEvalCellObservation | DecisionEvalUnreadableRun {
    if (row.Status === 'Running' || row.Status === 'Pending') {
        return { Unreadable: 'still running' };
    }
    const name = SplitDecisionEvalTestName(row.TestName);
    if (!name) {
        return { Unreadable: 'test name has no [cell]' };
    }
    const expected = parseJson(row.ExpectedOutputData, DecisionEvalExpectedSchema);
    if (!expected) {
        return { Unreadable: 'no readable expected outcome' };
    }
    return toObservation(name.CaseId, name.Cell, expected, parseJson(row.ActualOutputData, DecisionEvalActualOutputSchema), row);
}

/**
 * Builds the scorecard: reads every run, groups the readable ones by cell (sorted by label), and
 * computes each cell's metrics. The runs may come in any order: the same runs give the same
 * scorecard.
 *
 * @param rows The suite's runs.
 * @param options The suite's name, the window, and the metric options.
 */
export function BuildDecisionEvalScorecard(rows: readonly DecisionEvalRunRow[], options: DecisionEvalScorecardOptions): DecisionEvalScorecard {
    const byCell = new Map<string, DecisionEvalCellObservation[]>();
    const unreadable: Record<string, number> = {};
    for (const row of rows) {
        const read = ReadDecisionEvalRun(row);
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
        UnreadableReasons: sortedByKey(unreadable),
        Cells: [...byCell.keys()].sort().map(cell => scorecardCell(cell, byCell.get(cell) ?? [], options))
    };
}

/**
 * Production's routing verdicts in a cell, per run: how often a switch left the thread and a
 * continuation kept it, as answered and within the timeout. See {@link RoutingVerdictSummary}.
 *
 * @param observations The cell's runs.
 */
export function SummarizeRoutingVerdicts(observations: readonly DecisionEvalCellObservation[]): RoutingVerdictSummary {
    const usable = observations.filter(o => o.Routing !== null && !(o.Observation.FailedOver && !o.Observation.FailoverAllowed));
    const scored = usable.flatMap(o => (o.Routing?.Policy ? [{
        Label: o.Observation.Label,
        Left: o.Routing.Verdict !== 'KeptContinuity',
        Policy: o.Routing.Policy,
        OverTimeout: o.Observation.LatencyMs !== null && o.Observation.LatencyMs > o.Routing.Policy.TimeoutMs
    }] : []));
    const policies: Record<string, number> = {};
    for (const run of scored) {
        const described = DescribeRoutingPolicy(run.Policy);
        policies[described] = (policies[described] ?? 0) + 1;
    }
    return {
        Runs: scored.length,
        UnscoredRuns: usable.length - scored.length,
        Policies: sortedByKey(policies),
        OverTimeoutRuns: scored.filter(run => run.OverTimeout).length,
        AsAnswered: routingRates(scored),
        WithinTimeout: routingRates(scored.map(run => ({ Label: run.Label, Left: run.Left && !run.OverTimeout })))
    };
}

/**
 * A routing policy in words: `confidence ≥ 0.7, timeout 350 ms, Likelihood calibrated (A 1.7757,
 * B -3.3506)`, or `…, no calibration for the answering model (keeps continuity)`.
 *
 * @param policy The policy.
 */
export function DescribeRoutingPolicy(policy: DecisionEvalRoutingPolicy): string {
    const calibration = policy.Calibration
        ? `Likelihood calibrated (A ${policy.Calibration.A}, B ${policy.Calibration.B})`
        : 'no calibration for the answering model (keeps continuity)';
    return `confidence ≥ ${policy.MinConfidence}, timeout ${policy.TimeoutMs} ms, ${calibration}`;
}

/**
 * The scorecard as Markdown: a summary table, the calibrated table, production's routing verdicts,
 * then each cell's reliability table, operating points and least repeatable cases (by ID).
 *
 * @param scorecard The scorecard.
 */
export function RenderDecisionEvalScorecard(scorecard: DecisionEvalScorecard): string {
    return [
        ...renderHeader(scorecard),
        ...renderSummary(scorecard.Cells),
        ...renderCalibratedSummary(scorecard.Cells),
        ...renderRoutingSummary(scorecard.Cells),
        ...scorecard.Cells.flatMap(renderCellDetail)
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

/** A readable run as an observation. */
function toObservation(
    caseId: string,
    cell: string,
    expected: DecisionEvalExpected,
    actual: DecisionEvalActualOutput | null,
    row: DecisionEvalRunRow
): DecisionEvalCellObservation {
    const sampling = actual?.Sampling;
    return {
        Cell: cell,
        Routing: actual?.RoutingVerdict ? { Verdict: actual.RoutingVerdict, Policy: actual.RoutingPolicy ?? null } : null,
        Observation: {
            CaseId: caseId,
            Label: expected.label,
            Probability: actual?.ContinuesProbability ?? oracleProbability(row.ResultDetails),
            LatencyMs: actual?.LatencyMs ?? null,
            CostUSD: row.PromptRunCost ?? actual?.CostUSD ?? row.CostUSD,
            FailedOver: actual?.Model.FailedOver ?? false,
            FailoverAllowed: actual?.Model.FailoverAllowed ?? true
        },
        ResolvedModel: actual?.Model.ResolvedModel ?? actual?.Model.AnsweredModelName ?? null,
        SamplingRequested: sampling ? sampling.RequestedTemperature !== null || sampling.RequestedSeed !== null : false,
        SamplingApplied: sampling?.Applied ?? false
    };
}

/** The `decision-label-match` oracle's probability from a run's `ResultDetails`, or null. */
function oracleProbability(resultDetails: string | null): number | null {
    const results = parseJson(resultDetails, OracleResultsSchema);
    const details = results?.find(r => r.oracleType === 'decision-label-match')?.details;
    const parsed = DecisionLabelMatchDetailsSchema.safeParse(details);
    return parsed.success ? parsed.data.probability : null;
}

/** One cell's entry. */
function scorecardCell(cell: string, observations: readonly DecisionEvalCellObservation[], options: DecisionEvalMetricOptions): DecisionEvalScorecardCell {
    const resolved: Record<string, number> = {};
    for (const o of observations) {
        if (o.ResolvedModel) {
            resolved[o.ResolvedModel] = (resolved[o.ResolvedModel] ?? 0) + 1;
        }
    }
    return {
        Cell: cell,
        Metrics: ComputeCellMetrics(observations.map(o => o.Observation), options),
        Routing: SummarizeRoutingVerdicts(observations),
        ResolvedModels: sortedByKey(resolved),
        SamplingRequested: observations.some(o => o.SamplingRequested),
        SamplingApplied: observations.some(o => o.SamplingApplied)
    };
}

/** One run's label, and whether production's verdict left the thread. */
interface RoutingOutcome {
    Label: DecisionEvalObservation['Label'];
    Left: boolean;
}

/** The routing rates of some runs. */
function routingRates(outcomes: readonly RoutingOutcome[]): RoutingVerdictRates {
    const switchLeft = share(outcomes.filter(o => o.Label === 'switch'), o => o.Left);
    const continueKept = share(outcomes.filter(o => o.Label === 'continue'), o => !o.Left);
    const rates = [switchLeft.Rate, continueKept.Rate].filter((r): r is number => r !== null);
    const prior = DECISION_EVAL_ROUTING_CONTINUE_PRIOR;
    return {
        SwitchLeft: switchLeft,
        ContinueKept: continueKept,
        AmbiguousKept: share(outcomes.filter(o => o.Label === 'ambiguous'), o => !o.Left),
        BalancedAccuracy: rates.length === 0 ? null : rates.reduce((sum, r) => sum + r, 0) / rates.length,
        AccuracyAtContinuePrior: switchLeft.Rate === null || continueKept.Rate === null
            ? null
            : prior * continueKept.Rate + (1 - prior) * switchLeft.Rate
    };
}

/** How many of the runs meet the test. */
function share(outcomes: readonly RoutingOutcome[], test: (o: RoutingOutcome) => boolean): RoutingShare {
    const count = outcomes.filter(test).length;
    return { Runs: outcomes.length, Count: count, Rate: outcomes.length === 0 ? null : count / outcomes.length };
}

/**
 * The same counts with their keys in ordinal order, so the JSON and the Markdown list them the
 * same way whatever order the runs were read in.
 */
function sortedByKey(counts: Readonly<Record<string, number>>): Record<string, number> {
    return Object.fromEntries(Object.entries(counts).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)));
}

/** A number to a fixed number of places, or an em dash. */
function num(value: number | null | undefined, places: number = 3): string {
    return value === null || value === undefined ? '—' : value.toFixed(places);
}

/** A value with its interval. */
function withInterval(value: number | null, interval: { Lower: number; Upper: number } | null): string {
    return interval ? `${num(value)} [${num(interval.Lower)}, ${num(interval.Upper)}]` : num(value);
}

/** A Markdown table row. */
function row(cells: readonly string[]): string {
    return `| ${cells.join(' | ')} |`;
}

/** A Markdown table header and its rule. */
function header(cells: readonly string[]): string[] {
    return [row(cells), row(cells.map(() => '---'))];
}

/** The title and the run-level facts. */
function renderHeader(scorecard: DecisionEvalScorecard): string[] {
    const window = [scorecard.Since ? `since ${scorecard.Since}` : null, scorecard.Until ? `until ${scorecard.Until}` : null]
        .filter((part): part is string => part !== null).join(', ') || 'all runs';
    const reasons = Object.entries(scorecard.UnreadableReasons).map(([reason, n]) => `${reason} ×${n}`).join(', ');
    return [
        `# Decision Eval scorecard: ${scorecard.Suite}`,
        '',
        `Generated ${scorecard.GeneratedAt}. Window: ${window}. ${scorecard.Runs} run(s); `
            + `${scorecard.UnreadableRuns} unreadable${reasons ? ` (${reasons})` : ''}.`,
        '',
        `Accuracy-type metrics use each case's mean probability over its usable repeats, on \`continue\`/\`switch\` labels. `
            + 'They score the thread Likelihood alone: an upper bound on what routing does, which the production-verdict table scores end to end. '
            + `95% intervals: percentile bootstrap, ${scorecard.BootstrapResamples} resamples, seed ${scorecard.Seed}. `
            + `Calibration: Platt scaling on logit(p), ${scorecard.CalibrationFolds}-fold out of fold. `
            + 'Signal value = accuracy × mean verdict agreement.',
        ''
    ];
}

/** The raw summary table. */
function renderSummary(cells: readonly DecisionEvalScorecardCell[]): string[] {
    return [
        '## Summary (raw probabilities)',
        '',
        ...header(['Cell', 'n', 'Accuracy [95% CI]', 'Balanced acc. [95% CI]', 'AUC', 'Brier', 'ECE', 'Switch recall',
            'Verdict agreement', 'Mean SD', 'Signal value', 'p50 ms', 'p95 ms', '$ / 1k', 'Failovers', 'Ambiguous kept']),
        ...cells.map(({ Cell, Metrics: m }) => row([
            Cell, String(m.Raw.N), withInterval(m.Raw.Accuracy, m.Raw.AccuracyCI),
            withInterval(m.Raw.BalancedAccuracy, m.Raw.BalancedAccuracyCI), num(m.Raw.RocAuc), num(m.Raw.Brier),
            num(m.Raw.Calibration.ECE), num(m.Raw.SwitchRecall), num(m.Repeatability.MeanVerdictAgreement),
            num(m.Repeatability.MeanStdDev), num(m.SignalValue), num(m.Latency.P50, 0), num(m.Latency.P95, 0),
            num(m.Cost.CostPer1kUSD, 4), `${m.Counts.FailoverRuns} (${m.Counts.ExcludedFailoverRuns} excluded)`,
            `${m.Ambiguous.KeptWithPreviousAgent}/${m.Ambiguous.Cases} (${num(m.Ambiguous.Rate)})`
        ])),
        ''
    ];
}

/** The calibrated summary table, with the Platt parameters fitted on all the data. */
function renderCalibratedSummary(cells: readonly DecisionEvalScorecardCell[]): string[] {
    const calibratedRow = (cell: string, c: ProbabilityMetrics | null, m: DecisionEvalCellMetrics): string => row([
        cell, withInterval(c?.Accuracy ?? null, c?.AccuracyCI ?? null), withInterval(c?.BalancedAccuracy ?? null, c?.BalancedAccuracyCI ?? null),
        num(c?.RocAuc), num(c?.Brier), num(c?.Calibration.ECE), num(c?.SwitchRecall), num(m.Platt?.A, 4), num(m.Platt?.B, 4)
    ]);
    return [
        '## Calibrated (out-of-fold Platt)',
        '',
        ...header(['Cell', 'Accuracy [95% CI]', 'Balanced acc. [95% CI]', 'AUC', 'Brier', 'ECE', 'Switch recall', 'Platt A (all data)', 'Platt B (all data)']),
        ...cells.map(({ Cell, Metrics }) => calibratedRow(Cell, Metrics.Calibrated, Metrics)),
        ''
    ];
}

/** A share as `0.750 (3/4)`, or an em dash with no runs. */
function shareText(value: RoutingShare): string {
    return value.Rate === null ? '—' : `${num(value.Rate)} (${value.Count}/${value.Runs})`;
}

/** Production's routing verdicts, per cell. */
function renderRoutingSummary(cells: readonly DecisionEvalScorecardCell[]): string[] {
    const prior = `${Math.round(DECISION_EVAL_ROUTING_CONTINUE_PRIOR * 100)}%`;
    return [
        '## Production routing verdict (end to end, per run)',
        '',
        'Each run is one call, read as production reads it: the agent Choice and the thread Likelihood together, at the '
            + 'confidence bar and calibration recorded with the run. A switch that left the thread counts whichever agent it went to: '
            + 'the corpus labels continue or switch, not which agent. "In time" also keeps continuity for a run whose in-process latency '
            + 'passed the routing timeout; that latency leaves out the network, so it is still an upper bound on the chat. '
            + `Accuracy at a ${prior} continue prior weights the classes as a chat sees them; always-continue scores ${prior}. `
            + 'Runs that recorded no policy predate calibration, and are not scored.',
        '',
        ...header(['Cell', 'Runs', 'Switch left', 'Continue kept', 'Ambiguous kept', 'Balanced', `Acc. at ${prior} continue`,
            'Over timeout', 'Switch left (in time)', 'Continue kept (in time)', `Acc. at ${prior} (in time)`, 'Not scored (no policy)']),
        ...cells.map(({ Cell, Routing: r }) => row([
            Cell, String(r.Runs), shareText(r.AsAnswered.SwitchLeft), shareText(r.AsAnswered.ContinueKept), shareText(r.AsAnswered.AmbiguousKept),
            num(r.AsAnswered.BalancedAccuracy), num(r.AsAnswered.AccuracyAtContinuePrior), String(r.OverTimeoutRuns),
            shareText(r.WithinTimeout.SwitchLeft), shareText(r.WithinTimeout.ContinueKept), num(r.WithinTimeout.AccuracyAtContinuePrior),
            String(r.UnscoredRuns)
        ])),
        ''
    ];
}

/** One cell's detail: runs, models, reliability, operating points and least repeatable cases. */
function renderCellDetail(cell: DecisionEvalScorecardCell): string[] {
    const m = cell.Metrics;
    const models = Object.entries(cell.ResolvedModels).map(([model, n]) => `${model} ×${n}`).join(', ') || 'not recorded';
    const policies = Object.entries(cell.Routing.Policies).map(([policy, n]) => `${policy} ×${n}`).join('; ') || 'none recorded';
    return [
        `## ${cell.Cell}`,
        '',
        `Runs ${m.Counts.Runs}: ${m.Counts.UsableRuns} usable, ${m.Counts.NoProbabilityRuns} without a probability, `
            + `${m.Counts.FailoverRuns} answered by another model (${m.Counts.ExcludedFailoverRuns} excluded). `
            + `Scored cases ${m.Raw.N}; repeatability over ${m.Repeatability.Cases} case(s). Answered by: ${models}. `
            + `Sampling: ${cell.SamplingRequested ? (cell.SamplingApplied ? 'requested and applied' : 'requested, NOT applied') : 'not requested'}. `
            + `Routing policies: ${policies}.`,
        '',
        ...renderReliability(m),
        ...renderOperatingPoints(m),
        ...renderWorstCases(m)
    ];
}

/** The reliability table, raw beside calibrated. */
function renderReliability(m: DecisionEvalCellMetrics): string[] {
    return [
        '### Reliability (10 equal-width bins)',
        '',
        ...header(['Bin', 'Raw count', 'Raw mean predicted', 'Raw observed', 'Cal. count', 'Cal. mean predicted', 'Cal. observed']),
        ...m.Raw.Calibration.Bins.map((bin, i) => {
            const cal = m.Calibrated?.Calibration.Bins[i];
            return row([`${num(bin.Lower, 1)}–${num(bin.Upper, 1)}`, String(bin.Count), num(bin.MeanPredicted), num(bin.ObservedRate),
                cal ? String(cal.Count) : '—', num(cal?.MeanPredicted), num(cal?.ObservedRate)]);
        }),
        ''
    ];
}

/** The operating-point table, raw beside calibrated. */
function renderOperatingPoints(m: DecisionEvalCellMetrics): string[] {
    return [
        '### Operating points (continue at or above the threshold)',
        '',
        ...header(['Threshold', 'Raw continue P', 'Raw continue R', 'Raw switch P', 'Raw switch R',
            'Cal. continue P', 'Cal. continue R', 'Cal. switch P', 'Cal. switch R']),
        ...m.Raw.OperatingPoints.map((point, i) => {
            const cal = m.Calibrated?.OperatingPoints[i];
            return row([num(point.Threshold, 2), num(point.ContinuePrecision), num(point.ContinueRecall), num(point.SwitchPrecision),
                num(point.SwitchRecall), num(cal?.ContinuePrecision), num(cal?.ContinueRecall), num(cal?.SwitchPrecision), num(cal?.SwitchRecall)]);
        }),
        ''
    ];
}

/** The least repeatable cases, by ID. */
function renderWorstCases(m: DecisionEvalCellMetrics): string[] {
    if (m.Repeatability.Worst.length === 0) {
        return ['No case has two usable repeats.', ''];
    }
    return [
        '### Least repeatable cases (IDs only)',
        '',
        ...header(['Case ID', 'Repeats', 'Verdict agreement', 'SD']),
        ...m.Repeatability.Worst.map(c => row([c.CaseId, String(c.Repeats), num(c.VerdictAgreement), num(c.StdDev)])),
        ''
    ];
}
