/**
 * @module agent/pipeline-builder-agent
 *
 * The Predictive Studio Agent's **code sub-agent** — the framework wrapper around the deterministic
 * {@link PredictiveStudioPipelineBuilder}. It mirrors Database Designer's `DatabaseDesignerSchemaBuilder`
 * and Agent Manager's builder: a `BaseAgent` whose `executeAgentInternal` runs **once, in pure code
 * (no LLM)**, reads the approved {@link ModelingPlanSpec} off the agent payload, builds the pipeline +
 * trains (publishing gated on trust only when the run turns publishing on), and writes the outcome back to the payload. The conversational
 * sub-agents (Goal Analyst / Data Scout / Experiment Designer) accumulate the plan; THIS agent commits
 * it to metadata, so the structure created is type-safe and deterministic — never LLM-emitted.
 *
 * The experiment report ({@link ExperimentReports}) reads every number it prints from the build's stored rows — the
 * training run's `ValidationResults` and the model's `FeatureImportance` — and returns each one as a
 * {@link TracedNumber}, so a test or a gate can recompute it from the row.
 *
 * Registered by DriverClass `'PredictiveStudioPipelineBuilderAgent'` so the Model Development Agent's
 * metadata can route to it after the user approves.
 */

import { RegisterClass } from '@memberjunction/global';
import { EscapeSQLString } from '@memberjunction/global';
import { LogError, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJMLModelEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { BaseAgent } from '@memberjunction/ai-agents';
import type { ExecuteAgentParams, AgentConfiguration, BaseAgentNextStep, ArtifactDirective } from '@memberjunction/ai-core-plus';
import {
  BuildApprovals, ImportanceDisplay, EvaluationLineage, GateRules, InnerScoreSelection, JsonParse, TracedNumbers, TrainingRunResultsParser, TrustVerdicts,
  type Actor, type BuildApproval, type GateOutcome, type JsonValue, type MetricKey, type ModelingPlanSpec, type OutcomeTitleText, type FeatureStepWarning,
  type StoredGateRecord, type StoredTrainerResult, type TracedNumber, type TrainingRunResults, type TrustVerdict,
} from '@memberjunction/predictive-studio-core';

import { PredictiveStudioPipelineBuilder, type BuildPredictionResult, type MLLeaderboardEntryPayload, type ProtocolPromotionSetting } from './pipeline-builder';
import { BuildApprovalClaims } from './build-approval-claims';
import { AgentControlPath, type AgentBuildApprovalRefusal } from './control-path';
export type { MLLeaderboardEntryPayload };

/** The compact, payload-safe outcome the builder writes back so the agent can narrate the result. */
export interface PredictiveStudioBuildOutcome {
  success: boolean;  // case-violation-ok-legacy-back-compat: agent payload JSON key
  pipelineId?: string;  // case-violation-ok-legacy-back-compat: agent payload JSON key
  modelId?: string;  // case-violation-ok-legacy-back-compat: agent payload JSON key
  /** The trust verdict's title (`TrustVerdicts.OutcomeTitle`); absent when the build trained no model. */
  trustTitle?: OutcomeTitleText;  // case-violation-ok-legacy-back-compat: matches the existing interface member casing
  /** The trust verdict's headline ("Beats the flat guess by X [lo, hi] …"); absent when the build trained no model. */
  headline?: string;  // case-violation-ok-legacy-back-compat: matches the existing interface member casing
  published: boolean;  // case-violation-ok-legacy-back-compat: agent payload JSON key
  /**
   * True when the model is not published only because this build does not publish: the lifecycle gate evaluated it to
   * Validated or KeepBaseline, so the user may ask for it to be published (Promote ML Model: `publish`).
   */
  readyToPublish: boolean;  // case-violation-ok-legacy-back-compat: agent payload JSON key
  /**
   * When not published, the plain reason: "withheld: <the gate's recorded refusal>" for a build that publishes; for one
   * that does not, the evaluated status, the gate's refusal of the evaluation, or the run's stored reason; else null.
   */
  heldReason: string | null;  // case-violation-ok-legacy-back-compat: agent payload JSON key
  /** A clean error message when the build failed; else null. */
  errorMessage: string | null;  // case-violation-ok-legacy-back-compat: agent payload JSON key
  /** Structured warnings emitted during plan translation or training (e.g. dropped candidate features). */
  warnings?: FeatureStepWarning[];  // case-violation-ok-legacy-back-compat: agent payload JSON key
}


/** Feature importance entry matching MLExperimentResultsSpec. */
export interface MLFeatureImportancePayload {
  feature: string;  // case-violation-ok-legacy-back-compat: artifact JSON key
  importance: number;  // case-violation-ok-legacy-back-compat: artifact JSON key
}

/**
 * The agent payload = the modeling plan the conversation accumulated, plus the builder's outcome. `Leaderboard` is
 * the builder's own row shape, whose score may be null (an unmeasured candidate), so it replaces the plan's.
 */
export interface PredictiveStudioBuilderPayload extends Omit<ModelingPlanSpec, 'Leaderboard'> {
  /** Optional display name */
  Name?: string;
  BuildResult?: PredictiveStudioBuildOutcome;
  /** SHA-256 of the plan content the control path presented (`AgentControlPath.PlanHash`); written only by its code step. */
  PlanHash?: string;
  /** The presented plan's id; written only by the control path's present-plan step. */
  PlanId?: string;
  /** The approval claim the orchestrator took before dispatching this build (`BuildApprovalClaims.Claim`). */
  BuildClaimID?: string;
  /** The orchestrator's report text (one of the two slices its prompt may write, D5-25). */
  Report?: string;
  /** Plain-language summary of results for MLExperimentResultsSpec */
  Summary?: string;
  /** Full markdown results narrative for MLExperimentResultsSpec */
  Markdown?: string;
  /** Ranked leaderboard entries for MLExperimentResultsSpec */
  Leaderboard?: MLLeaderboardEntryPayload[];
  /** Feature importance entries for MLExperimentResultsSpec */
  FeatureImportance?: MLFeatureImportancePayload[];
  /** Best model pointer for MLExperimentResultsSpec */
  BestModel?: {
    ID?: string;
    Name?: string;
    Version?: string | number;
  };
  /** Convenience scalar best model pointer */
  BestModelID?: string;
  /** Target metric name */
  TargetMetric?: string;
  /**
   * The training run's stored gate outcome: `model` ships the trained finalist, `keep-simple-baseline` ships a simple
   * baseline, `no-signal` ships nothing. Absent when the run stores no gate record.
   */
  GateOutcome?: GateOutcome;
  /** The stored gate decision's reason, in words; absent with `GateOutcome`. */
  GateReason?: string;
}

/** Where a build's model stands in the catalog, as the report's Outcome line says it. */
export type CatalogStatus = 'published' | 'ready-to-publish' | 'held';

/** The report's words for a catalog status. */
const CATALOG_STATUS_TEXT: Readonly<Record<CatalogStatus, string>> = {
  'published': 'Published to Catalog',
  'ready-to-publish': 'Evaluated — ready to publish when you ask',
  'held': 'Held for Review',
};

/** The hidden-list note for a model whose stored weights are not of a kind shown as drivers but are not split/impurity counts. */
export const UNSHOWN_IMPORTANCE_KIND_NOTE = "This model's feature weights are not of a kind we show as drivers yet.";

/**
 * A training run's stored cost columns (§5.1.7, D5-A6-5): the compute seconds and USD it recorded and the tokens of the
 * prompt runs attributed to it. The report traces each number it shows of them to its column of this row.
 */
export type TrainingRunCost = Pick<MJMLTrainingRunEntity, 'ID' | 'ComputeSeconds' | 'ComputeCost' | 'TokensUsed'>;

/** What the experiment report is generated from: the build's words and its stored rows. */
export interface ExperimentReportInput {
  /** The report's title (the plan's name). */
  readonly Name: string;
  /** The plan's goal. */
  readonly Goal: string;
  /** The plan's target column. */
  readonly TargetVariable: string;
  /** The plan's metric label, used only when the run stores no comparison. */
  readonly TargetMetric: string;
  /** The build's one training run; null when no run stored results (then every measurement renders "not measured"). */
  readonly Run: { readonly ID: string; readonly ValidationResults: string | null } | null;
  /** The trained model; null when the build shipped none. */
  readonly Model: { readonly ID: string; readonly FeatureImportance: string | null; readonly Lineage: string | null } | null;
  /** The trust verdict rendered from the run (`TrustVerdicts.DeriveTrustVerdict`); null → 'No model shipped'. */
  readonly Trust: TrustVerdict | null;
  /** Where the build's model stands in the catalog. */
  readonly Status: CatalogStatus;
  /**
   * The training run's stored cost columns, shown beside the primary metric. Absent: the report has no cost line (an
   * input built before the run's cost was read); null: the line says the cost was not measured.
   */
  readonly Cost?: TrainingRunCost | null;
}

/**
 * The stored rows a build's report is regenerated from (a gate re-reads them): the plan's words, the build's training
 * run and its model with the model's catalog status.
 */
export interface ExperimentReportRows {
  /** The report's title (the plan's name). */
  readonly Name: string;
  /** The plan's goal. */
  readonly Goal: string;
  /** The plan's target column. */
  readonly TargetVariable: string;
  /** The plan's metric label. */
  readonly TargetMetric: string;
  /** The training run row; null when the build has none. */
  readonly Run: ExperimentReportInput['Run'];
  /** The model row and its status; null when the build shipped no model. */
  readonly Model: (NonNullable<ExperimentReportInput['Model']> & { readonly Status: MJMLModelEntity['Status'] }) | null;
  /** The training run's cost columns, as {@link ExperimentReportInput.Cost}. */
  readonly Cost?: TrainingRunCost | null;
}

/** The experiment report: its Markdown and every number it renders, each traced to the stored row it was read from. */
export interface ExperimentReport {
  /** The report body. */
  readonly Markdown: string;
  /** Every number `Markdown` renders (leaderboard ranks are positions, not numbers read from a row). */
  readonly Numbers: readonly TracedNumber[];
}

/** One feature-importance entry as stored on the model, with the JSON path of its weight when the weight is a stored number. */
interface StoredFeatureWeight {
  readonly Feature: string;
  readonly Importance: number;
  /** The path of the weight in `FeatureImportance`; null when the stored weight is not a number (a numeric string, a bare name). */
  readonly Path: string | null;
}

/** The completed results a run stores, with the row they were read from. */
interface StoredRun {
  readonly ID: string;
  readonly Json: string;
  readonly Results: Extract<TrainingRunResults, { status: 'completed' }>;
}

/** One leaderboard row of the report: a candidate's inner-fold mean and interval, traced to its stored inner score. */
interface ReportRow {
  readonly Rank: number;
  readonly Candidate: string;
  readonly Metric: MetricKey;
  readonly IsFinalist: boolean;
  readonly Mean: TracedNumber | null;
  readonly Lower: TracedNumber | null;
  readonly Upper: TracedNumber | null;
  /** The interval's level, as a percentage; null when it is not a stored number. */
  readonly Level: TracedNumber | null;
}

/**
 * The ML Experiment Results report. Every number it prints is read from the build's stored rows — the training run's
 * `ValidationResults` (`MJ: ML Training Runs`) and the model's `FeatureImportance` (`MJ: ML Models`) — and returned with
 * the path it was read at. A measurement the rows do not hold renders "not measured", never a stand-in number.
 */
export class ExperimentReports {
  /** The entity a feature weight is read from. */
  public static readonly ModelEntityName = 'MJ: ML Models';

  /** How many of the model's weights the report lists. */
  private static readonly maxFeatures = 8;

  /** The training-run columns the cost line traces its numbers to (each number's path is `$.<column>`). */
  public static readonly COST_COLUMNS: readonly (keyof Omit<TrainingRunCost, 'ID'>)[] = ['ComputeSeconds', 'ComputeCost', 'TokensUsed'];

  /** True when a traced number's path names a training-run cost column rather than a path in `ValidationResults`. */
  public static IsCostPath(path: string): boolean {
    return ExperimentReports.COST_COLUMNS.some((c) => path === `$.${c}`);
  }

  /** The cost columns of a training run as the JSON its cost numbers are traced in (a column with no value is null). */
  public static CostColumnsJson(cost: TrainingRunCost): string {
    return JSON.stringify({ ComputeSeconds: cost.ComputeSeconds, ComputeCost: cost.ComputeCost, TokensUsed: cost.TokensUsed });
  }

  /**
   * The report for a build: the executive summary (the verdict's words around its traced headline numbers), the
   * performance section (the primary metric, the outcome, the inner-fold leaderboard), the features the model weighted
   * most, and how the result was measured (the finalist's selection score and the leakage audit's result).
   */
  public static GenerateMarkdownReport(input: ExperimentReportInput): ExperimentReport {
    const numbers: TracedNumber[] = [];
    const run = ExperimentReports.readRun(input.Run);
    const gate = run === null ? null : run.Results.gate;
    const trainer = run === null ? null : run.Results.trainer;
    const rows = ExperimentReports.leaderboardRows(run);
    const summary = ExperimentReports.summary(input.Trust, run, numbers);
    const why = ExperimentReports.whyLine(gate, run, numbers);
    const primary = ExperimentReports.primaryMetricLine(input, run, numbers) + ExperimentReports.costLine(input.Cost, numbers);
    const leaderboard = ExperimentReports.leaderboardSection(rows, gate, numbers);
    const features = ExperimentReports.featureLines(input.Model, numbers);
    const measured = ExperimentReports.measurementLines(rows, trainer, gate, numbers);
    const title = input.Trust === null ? 'No model shipped' : TrustVerdicts.OutcomeTitle(input.Trust);
    const markdown = `# Model Development Results: ${input.Name}

## Executive Summary
${summary}

## ${ExperimentReports.performanceHeading(gate, rows)}
${why}- **Target Variable**: \`${input.TargetVariable}\`
${primary}
- **Outcome**: **${title}** (${CATALOG_STATUS_TEXT[input.Status]})
${leaderboard}
## Features the model weighted most (associations, not causes)
${features}

## How this was measured
${measured}
- Registered in the Predictive Studio Models catalog; the Outcome line above says whether it was published.
`;
    return { Markdown: markdown, Numbers: numbers };
  }

  /**
   * The report input of a build, from its stored rows, as {@link PredictiveStudioPipelineBuilderAgent.ReportPayload}
   * builds it: the trust verdict rendered from the run with the model's lineage (none without a model, as a build that
   * shipped no model has no verdict), and the catalog status read from the model's status ({@link CatalogStatusOfModel}).
   */
  public static InputFromRows(rows: ExperimentReportRows): ExperimentReportInput {
    const model = rows.Model;
    return {
      Name: rows.Name, Goal: rows.Goal, TargetVariable: rows.TargetVariable, TargetMetric: rows.TargetMetric, Run: rows.Run,
      Model: model === null ? null : { ID: model.ID, FeatureImportance: model.FeatureImportance, Lineage: model.Lineage },
      Trust: model === null ? null : TrustVerdicts.DeriveTrustVerdict({ ValidationResults: rows.Run === null ? null : rows.Run.ValidationResults, Lineage: model.Lineage }),
      Status: ExperimentReports.CatalogStatusOfModel(model === null ? null : model.Status),
      ...(rows.Cost === undefined ? {} : { Cost: rows.Cost }),
    };
  }

  /**
   * A model's catalog status from its stored status: `Published` is published; `Validated` and `KeepBaseline` (the
   * lifecycle gate evaluated it, and a person may publish it) are ready to publish; any other status, or no model, is
   * held (a Draft model is one the gate refused to evaluate).
   */
  public static CatalogStatusOfModel(status: MJMLModelEntity['Status'] | null): CatalogStatus {
    if (status === 'Published') return 'published';
    return status === 'Validated' || status === 'KeepBaseline' ? 'ready-to-publish' : 'held';
  }

  /**
   * The feature importance stored on a model, as the artifact lists it: a `{ feature: weight }` object, or an array of
   * `{ feature|name|Feature, importance|weight|value|Importance }` objects (a bare array item is a feature of weight 0).
   * A weight stored as a numeric string is read as that number; anything unreadable is 0. Empty for absent or
   * malformed JSON.
   */
  public static ParseFeatureImportance(json: string | null | undefined): MLFeatureImportancePayload[] {
    return ExperimentReports.storedFeatureWeights(json).map((w) => ({ feature: w.Feature, importance: w.Importance }));
  }

  /**
   * The note shown where a hidden feature-importance list would be, chosen from the model's stored importance kind:
   * split/impurity counts get the reason they are hidden; any other kind (unknown, `none`) gets a neutral note.
   */
  public static HiddenImportanceNote(lineageJSON: string | null | undefined): string {
    return EvaluationLineage.Read(lineageJSON || null)?.ImportanceKind === 'split_or_impurity'
      ? ImportanceDisplay.HiddenNote
      : UNSHOWN_IMPORTANCE_KIND_NOTE;
  }

  /** The completed envelope the run stores; null when there is no run, no results, or results that are not a completed envelope. */
  private static readRun(run: ExperimentReportInput['Run']): StoredRun | null {
    if (run === null || run.ValidationResults === null) return null;
    const parsed = TrainingRunResultsParser.ParseTrainingRunResults(run.ValidationResults);
    if (parsed.Ok === false || parsed.Value.status !== 'completed') return null;
    return { ID: run.ID, Json: run.ValidationResults, Results: parsed.Value };
  }

  /** A number of the run's stored results at `path`; null when the results do not hold a finite number there. */
  private static fromRun(run: StoredRun, path: string, format: (value: number) => string): TracedNumber | null {
    return TracedNumbers.FromStoredPath(TrustVerdicts.RunEntityName, run.ID, run.Json, path, format);
  }

  /** Record `n` as a rendered number and return its token. */
  private static cite(numbers: TracedNumber[], n: TracedNumber): string {
    if (!numbers.some((m) => m.Text === n.Text && m.Source.Path === n.Source.Path && m.Source.RecordID === n.Source.RecordID)) numbers.push(n);
    return n.Text;
  }

  /** A score with three decimals (the leaderboard's and the primary metric's precision). */
  private static threeDecimals(v: number): string {
    return v.toFixed(3);
  }

  /** A fraction as a percentage with one decimal (a feature's share of the weight). */
  private static percentOneDecimal(v: number): string {
    return `${(v * 100).toFixed(1)}%`;
  }

  /** An interval level as a percentage, without trailing zeros (`0.95` → `95%`). */
  private static levelPercent(v: number): string {
    return `${Number((v * 100).toFixed(2))}%`;
  }

  /**
   * The executive summary: the verdict's headline with its numbers traced to the stored comparison
   * ({@link TrustVerdicts.ComparisonNumbers}); the headline as is when it quotes no number; "No model shipped." without a
   * verdict, and the outcome title alone when the headline's numbers cannot be traced to a stored run.
   */
  private static summary(trust: TrustVerdict | null, run: StoredRun | null, numbers: TracedNumber[]): string {
    if (trust === null) return 'No model shipped.';
    const c = trust.Comparison;
    if (c === null) return trust.Headline;
    const quoted = GateRules.FormatInterval({ value: c.Value, lower: c.Lower, upper: c.Upper });
    const at = trust.Headline.indexOf(quoted);
    const traced = run === null ? [] : TrustVerdicts.ComparisonNumbers(trust, run.ID);
    if (at < 0 || traced.length !== 3) return `${TrustVerdicts.OutcomeTitle(trust)}.`;
    const [value, lower, upper] = traced.map((n) => ExperimentReports.cite(numbers, n));
    return `${trust.Headline.slice(0, at)}${value} [${lower}, ${upper}]${trust.Headline.slice(at + quoted.length)}`;
  }

  /** The stored reason of a gate that shipped no trained model, with the numbers it quotes traced; empty otherwise. */
  private static whyLine(gate: StoredGateRecord | null, run: StoredRun | null, numbers: TracedNumber[]): string {
    if (gate === null || run === null || gate.decision.outcome === 'model') return '';
    for (const n of TrustVerdicts.ReasonNumbers(gate, run.ID)) ExperimentReports.cite(numbers, n);
    return `- **Why**: ${gate.reason.text}\n`;
  }

  /**
   * The primary metric: the shipped comparison's gain over the flat guess, read from the stored interval the verdict
   * quotes; "not measured" under the plan's metric label when the run stores no comparison.
   */
  private static primaryMetricLine(input: ExperimentReportInput, run: StoredRun | null, numbers: TracedNumber[]): string {
    const trust = input.Trust;
    const c = trust === null ? null : trust.Comparison;
    const path = trust === null || run === null ? undefined : TrustVerdicts.ComparisonNumbers(trust, run.ID)[0]?.Source.Path;
    const n = run === null || path === undefined ? null : ExperimentReports.fromRun(run, path, ExperimentReports.threeDecimals);
    if (c === null || n === null) return `- **Primary Metric**: **${input.TargetMetric}** = **not measured**`;
    return `- **Primary Metric**: **${c.Metric} gain over the flat guess** = **${ExperimentReports.cite(numbers, n)}**`;
  }

  /**
   * The training cost beside the primary metric (§5.1.7, D5-A6-5): the run's compute seconds, the USD they were priced
   * at and the tokens attributed to it, each traced to its column of the training run. Empty when the input carries no
   * cost; "not measured" for a column the run left unset.
   */
  private static costLine(cost: TrainingRunCost | null | undefined, numbers: TracedNumber[]): string {
    if (cost === undefined) return '';
    if (cost === null) return '\n- **Training cost**: not measured';
    const json = ExperimentReports.CostColumnsJson(cost);
    const traced = (column: string, format: (v: number) => string): string => {
      const n = TracedNumbers.FromStoredPath(TrustVerdicts.RunEntityName, cost.ID, json, `$.${column}`, format);
      return n === null ? 'not measured' : ExperimentReports.cite(numbers, n);
    };
    const seconds = traced('ComputeSeconds', (v) => v.toFixed(3));
    const usd = cost.ComputeCost === null ? 'not priced' : `$${traced('ComputeCost', (v) => v.toFixed(6))}`;
    const tokens = traced('TokensUsed', (v) => v.toLocaleString('en-US', { maximumFractionDigits: 0 }));
    return `\n- **Training cost**: ${seconds} s of compute, ${usd}, ${tokens} LLM tokens`;
  }

  /** The search's leaderboard, best-first by inner-fold mean, each row traced to its stored inner score's index. */
  private static leaderboardRows(run: StoredRun | null): ReportRow[] {
    const trainer = run === null ? null : run.Results.trainer;
    if (run === null || trainer === null) return [];
    const ranked = InnerScoreSelection.RankByInnerScore(trainer.innerScores);
    return InnerScoreSelection.LeaderboardFromInnerScores(trainer.innerScores, trainer.finalist).map((row, i) => {
      const base = `$.trainer.innerScores[${trainer.innerScores.indexOf(ranked[i])}].inner`;
      return {
        Rank: row.Rank, Candidate: row.Candidate, Metric: row.Metric, IsFinalist: row.IsFinalist,
        Mean: ExperimentReports.fromRun(run, `${base}.value`, ExperimentReports.threeDecimals),
        Lower: ExperimentReports.fromRun(run, `${base}.interval.lower`, ExperimentReports.threeDecimals),
        Upper: ExperimentReports.fromRun(run, `${base}.interval.upper`, ExperimentReports.threeDecimals),
        Level: ExperimentReports.fromRun(run, `${base}.interval.level`, ExperimentReports.levelPercent),
      };
    });
  }

  /** The finalist row, when its mean is a stored number (a finalist without one is not called the winner). */
  private static measuredFinalist(rows: readonly ReportRow[]): ReportRow | null {
    return rows.find((r) => r.IsFinalist && r.Mean !== null) || null;
  }

  /**
   * Whether the marked finalist shipped: only when the stored gate outcome is `model`. A finalist the gate did not ship,
   * or one whose run stores no gate record (not evaluated), is never called the winner.
   */
  private static finalistShipped(gate: StoredGateRecord | null): boolean {
    return gate !== null && gate.decision.outcome === 'model';
  }

  /** The marked finalist's status cell: the winner only when it shipped; else whether the gate decided or never ran. */
  private static finalistStatus(gate: StoredGateRecord | null): string {
    if (ExperimentReports.finalistShipped(gate)) return '🏆 Winner (Selected)';
    return gate === null ? 'Finalist (not evaluated)' : 'Finalist (not shipped)';
  }

  /** The performance section's heading: the winning model's, or what the stored gate decided instead. */
  private static performanceHeading(gate: StoredGateRecord | null, rows: readonly ReportRow[]): string {
    if (gate !== null && gate.decision.outcome === 'no-signal') return 'No model shipped';
    if (gate !== null && gate.decision.outcome === 'keep-simple-baseline') return 'Kept a simple baseline';
    if (rows.length <= 1) return 'Model Performance';
    return ExperimentReports.measuredFinalist(rows) !== null && ExperimentReports.finalistShipped(gate) ? 'Winning Model Performance' : 'Selected Model Performance';
  }

  /**
   * The leaderboard table: each candidate's inner-fold mean with its interval under a header that says those scores
   * are optimistic (and the interval's stored level, when it is a stored number). An unmeasured row says so, and a
   * leaderboard of several rows with no measured finalist says it has no winner.
   */
  private static leaderboardSection(rows: readonly ReportRow[], gate: StoredGateRecord | null, numbers: TracedNumber[]): string {
    if (rows.length === 0) return '';
    const body = rows.map((r) => `| ${r.Rank} | ${r.Candidate} | ${ExperimentReports.scoreCell(r, numbers)} | ${ExperimentReports.statusCell(r, gate)} |`).join('\n');
    const noWinner = rows.length > 1 && ExperimentReports.measuredFinalist(rows) === null ? '\nNo candidate was measured, so no winner was picked.\n' : '';
    const level = rows[0].Level;
    const interval = level === null ? 'interval' : `${ExperimentReports.cite(numbers, level)} interval`;
    return `\n## Tournament Leaderboard\n| Rank | Algorithm | Inner-CV ${rows[0].Metric} [${interval}] (optimistic) | Status |\n|---|---|---|---|\n${body}\n${noWinner}`;
  }

  /** A row's score cell: `mean [lower, upper]` when the bounds are stored numbers, the mean and its metric otherwise. */
  private static scoreCell(r: ReportRow, numbers: TracedNumber[]): string {
    if (r.Mean === null) return 'not measured';
    const mean = ExperimentReports.cite(numbers, r.Mean);
    if (r.Lower === null || r.Upper === null) return `${mean} (${r.Metric})`;
    return `${mean} [${ExperimentReports.cite(numbers, r.Lower)}, ${ExperimentReports.cite(numbers, r.Upper)}]`;
  }

  /** A row's status cell. */
  private static statusCell(r: ReportRow, gate: StoredGateRecord | null): string {
    if (r.Mean === null) return 'Not measured';
    return r.IsFinalist ? ExperimentReports.finalistStatus(gate) : 'Evaluated';
  }

  /**
   * The features the model weighted most, each weight traced to the model's stored `FeatureImportance` (a weight not
   * stored as a number is named without one); the hidden-list note when the lineage keeps the list hidden.
   */
  private static featureLines(model: ExperimentReportInput['Model'], numbers: TracedNumber[]): string {
    const json = model === null ? null : model.FeatureImportance;
    const weights = ExperimentReports.storedFeatureWeights(json);
    if (model === null || json === null || weights.length === 0) return '- No feature importance weights were recorded for this model.';
    if (!ImportanceDisplay.GlobalDriversShowable(model.Lineage)) return `- ${ExperimentReports.HiddenImportanceNote(model.Lineage)}`;
    return [...weights].sort((a, b) => b.Importance - a.Importance).slice(0, ExperimentReports.maxFeatures).map((w) => {
      const n = w.Path === null ? null : TracedNumbers.FromStoredPath(ExperimentReports.ModelEntityName, model.ID, json, w.Path, ExperimentReports.percentOneDecimal);
      return n === null ? `- **${w.Feature}**: weight not recorded as a number` : `- **${w.Feature}**: ${ExperimentReports.cite(numbers, n)} of the model's weight`;
    }).join('\n');
  }

  /**
   * How the result was measured: how the finalist was picked (or that one candidate was scored on the held-back rows),
   * the finalist's selection score read from its stored inner score, and the leakage audit's result from the stored
   * flags. A run without a stored trainer result measured nothing and ran no audit.
   */
  private static measurementLines(rows: readonly ReportRow[], trainer: StoredTrainerResult | null, gate: StoredGateRecord | null, numbers: TracedNumber[]): string {
    return [
      `- ${ExperimentReports.measurementNote(rows, trainer, gate)}`,
      `- ${ExperimentReports.selectionScoreLine(rows, numbers)}`,
      `- ${ExperimentReports.leakageLine(trainer)}`,
    ].join('\n');
  }

  /**
   * A search picked its finalist on inner-fold scores over the training rows and read the held-back rows once, for the
   * finalist; a single candidate was scored on the held-back rows. A finalist the gate did not ship, or one without a
   * measured mean, is called the finalist, not the winner.
   */
  private static measurementNote(rows: readonly ReportRow[], trainer: StoredTrainerResult | null, gate: StoredGateRecord | null): string {
    if (trainer === null) return 'The run stores no trainer result, so nothing was measured.';
    if (rows.length <= 1) return 'The score comes from the rows held back from training.';
    const picked = ExperimentReports.finalistShipped(gate) && ExperimentReports.measuredFinalist(rows) !== null ? 'winner' : 'finalist';
    return `The ${picked} is the simplest candidate whose inner-fold score is within one standard error of the best; inner-fold scores are optimistic, and the held-back rows were read once, for the ${picked}.`;
  }

  /** The finalist's selection (inner-fold) score, traced to its stored inner score; "not measured" without one. */
  private static selectionScoreLine(rows: readonly ReportRow[], numbers: TracedNumber[]): string {
    const finalist = ExperimentReports.measuredFinalist(rows);
    if (finalist === null || finalist.Mean === null) return 'Selection score: not measured.';
    return `Selection score: the finalist **${finalist.Candidate}** scored ${ExperimentReports.cite(numbers, finalist.Mean)} (inner-fold ${finalist.Metric} mean, optimistic).`;
  }

  /** The leakage audit's result from the stored flags: their kinds, none raised, or not run (no stored trainer result). */
  private static leakageLine(trainer: StoredTrainerResult | null): string {
    if (trainer === null) return 'Leakage audit: not run.';
    const kinds = [...new Set(trainer.leakageFlags.map((f) => f.kind))];
    return kinds.length === 0 ? 'Leakage audit: no flags raised.' : `Leakage audit raised: ${kinds.join(', ')}.`;
  }

  /** The stored feature weights with the path of each weight that is a stored number; empty for absent or malformed JSON. */
  private static storedFeatureWeights(json: string | null | undefined): StoredFeatureWeight[] {
    if (json === null || json === undefined) return [];
    const parsed = JsonParse.ParseJsonText(json, 'FeatureImportance');
    if (parsed.Ok === false) return [];
    const value = parsed.Value;
    if (Array.isArray(value)) return value.map((item, i) => ExperimentReports.arrayWeight(item, i));
    if (!JsonParse.IsJsonObject(value)) return [];
    return Object.entries(value).map(([feature, weight]) => ({
      Feature: feature,
      Importance: ExperimentReports.weightOf(weight),
      Path: typeof weight === 'number' ? `$[${JSON.stringify(feature)}]` : null,
    }));
  }

  /** One array entry: an object naming its feature and weight, or a bare value naming a feature of weight 0. */
  private static arrayWeight(item: JsonValue, index: number): StoredFeatureWeight {
    if (!JsonParse.IsJsonObject(item)) return { Feature: String(item), Importance: 0, Path: null };
    const nameKey = ['feature', 'name', 'Feature'].find((k) => item[k] !== undefined && item[k] !== null);
    const weightKey = ['importance', 'weight', 'value', 'Importance'].find((k) => item[k] !== undefined && item[k] !== null);
    const weight = weightKey === undefined ? 0 : item[weightKey];
    return {
      Feature: nameKey === undefined ? 'Unknown' : String(item[nameKey]),
      Importance: ExperimentReports.weightOf(weight),
      Path: weightKey !== undefined && typeof weight === 'number' ? `$[${index}].${weightKey}` : null,
    };
  }

  /** A stored weight as a number: a number as is, a numeric string parsed, anything else (or NaN) 0. */
  private static weightOf(weight: JsonValue | undefined): number {
    const n = typeof weight === 'number' ? weight : typeof weight === 'string' ? parseFloat(weight) : Number.NaN;
    return Number.isNaN(n) ? 0 : n;
  }
}

@RegisterClass(BaseAgent, 'PredictiveStudioPipelineBuilderAgent')
export class PredictiveStudioPipelineBuilderAgent extends BaseAgent {
  /**
   * The approved plan a payload carries. The payload's `Leaderboard` is a previous build's results (its scores may be
   * null), not the plan's ranking, so it is left out; nothing in the build reads a plan leaderboard.
   */
  public static PlanOf(payload: PredictiveStudioBuilderPayload): ModelingPlanSpec {
    const { Leaderboard: previousResults, ...plan } = payload;
    void previousResults;
    return plan;
  }

  /** The run-data key that turns publishing on for a build: `true` publishes a model that clears the bar, as automation. */
  public static readonly AUTO_PUBLISH_DATA_KEY = 'PredictiveStudioAutoPublish';

  /**
   * The run-data key that supplies the promotion setting of the protocol the build creates (OF4-30):
   * `{ autoPublishKeepBaseline: true }` publishes a kept simple baseline automatically (D-031).
   */
  public static readonly PROTOCOL_PROMOTION_DATA_KEY = 'PredictiveStudioProtocolPromotion';

  /**
   * Whether this run may read the automated-publishing switches ({@link AUTO_PUBLISH_DATA_KEY},
   * {@link PROTOCOL_PROMOTION_DATA_KEY}) from its `data`. Both decide whether a model goes live unattended, so the run
   * must be:
   *  - **trusted** — its caller set `ExecuteAgentParams.TrustReservedRunData`, which MJServer's agent-run resolvers set
   *    only for the system user and an API key holding `agent:trusted` (the truth suite's gate runs); a browser, an
   *    action call or any other caller's `data` cannot switch publishing on;
   *  - **top-level** — no `parentRun`. A sub-agent's `data` includes the `templateParameters` its parent's model wrote,
   *    and a sub-agent inherits its root's trust, so a model could otherwise switch publishing on for a trusted root.
   *
   * The rule lives here, with the only reader of the keys, so the generic agent framework never has to know them.
   */
  public static ReadsPublishingSwitches(params: Pick<ExecuteAgentParams, 'TrustReservedRunData' | 'parentRun'>): boolean {
    return params.TrustReservedRunData === true && !params.parentRun;
  }

  /**
   * Whether this build publishes a model that clears the bar: only when the run reads the publishing switches
   * ({@link ReadsPublishingSwitches}) and its `data` holds `PredictiveStudioAutoPublish: true`. Otherwise — every
   * conversation's build — a model is evaluated and published only when the user asks. A published model goes through
   * the gate's automated publisher with the agent run as its initiator.
   */
  public static AutoPublishOf(params: Pick<ExecuteAgentParams, 'data' | 'TrustReservedRunData' | 'parentRun'>): boolean {
    if (!PredictiveStudioPipelineBuilderAgent.ReadsPublishingSwitches(params)) return false;
    return params.data?.[PredictiveStudioPipelineBuilderAgent.AUTO_PUBLISH_DATA_KEY] === true;
  }

  /**
   * The protocol promotion setting the run's `data` supplies: `{ autoPublishKeepBaseline: true }` when the run reads the
   * publishing switches ({@link ReadsPublishingSwitches}) and the key holds an object whose `autoPublishKeepBaseline` is
   * the boolean `true`; otherwise null, and the build's protocol is the default one.
   */
  public static ProtocolPromotionOf(params: Pick<ExecuteAgentParams, 'data' | 'TrustReservedRunData' | 'parentRun'>): ProtocolPromotionSetting | null {
    if (!PredictiveStudioPipelineBuilderAgent.ReadsPublishingSwitches(params)) return null;
    const value: unknown = params.data?.[PredictiveStudioPipelineBuilderAgent.PROTOCOL_PROMOTION_DATA_KEY];
    if (typeof value !== 'object' || value === null || !('autoPublishKeepBaseline' in value)) return null;
    return value.autoPublishKeepBaseline === true ? { autoPublishKeepBaseline: true } : null;
  }

  /**
   * Whether this run may build (D-089, D-090): PR 4's trusted top-level gate-harness run
   * ({@link ReadsPublishingSwitches}), or a run holding a {@link BuildApproval} — the claimed approval its parent
   * orchestrator dispatched it under ({@link ResolveHeldApproval}). Anything else (a sub-agent with no approval, a
   * GraphQL call naming this agent, a refusal) builds nothing.
   */
  public static BuildAllowed(params: Pick<ExecuteAgentParams, 'TrustReservedRunData' | 'parentRun'>, approval: BuildApproval | AgentBuildApprovalRefusal | null): boolean {
    return PredictiveStudioPipelineBuilderAgent.ReadsPublishingSwitches(params) || BuildApprovals.IsApproval(approval);
  }

  /** The refusal message of a run that may not build. */
  public static readonly NO_APPROVAL_MESSAGE =
    'I did not build: a build starts only from an approved plan (approve the plan I presented), so nothing was created.';

  /** The catalog status of a build's outcome. */
  public static CatalogStatusOf(o: Pick<PredictiveStudioBuildOutcome, 'published' | 'readyToPublish'>): CatalogStatus {
    if (o.published) return 'published';
    return o.readyToPublish ? 'ready-to-publish' : 'held';
  }

  /** Project the rich {@link BuildPredictionResult} into the compact, payload-safe outcome (pure → testable). */
  public static SummarizeBuildResult(result: BuildPredictionResult): PredictiveStudioBuildOutcome {
    return {
      success: result.success,
      pipelineId: result.pipelineId,
      modelId: result.modelId || undefined,
      trustTitle: result.trust === undefined ? undefined : TrustVerdicts.OutcomeTitle(result.trust),
      headline: result.trust?.Headline,
      published: result.published,
      readyToPublish: result.readyToPublish,
      heldReason: result.heldReason,
      errorMessage: result.errorMessage,
      warnings: result.warnings && result.warnings.length > 0 ? result.warnings : undefined,
    };
  }

  /** A plain, user-facing sentence describing what the build did (for the agent's reasoning/message). */
  public static BuildOutcomeMessage(o: PredictiveStudioBuildOutcome): string {
    const warningText = o.warnings && o.warnings.length > 0
      ? ` Note: ${o.warnings.length} candidate feature(s) could not be mapped to pipeline steps (${o.warnings.map(w => `${w.FeatureName}: ${w.Reason}`).join('; ')}).`
      : '';
    if (!o.success) return `I couldn't build the prediction: ${o.errorMessage || 'unknown error'}.${warningText}`;
    // a published build has a model, so it carries its verdict's title
    if (o.published) return `Done — I built and published your prediction (${o.trustTitle}). It's now in your Predictions.${warningText}`;
    if (o.readyToPublish) return `Done — I built and trained your prediction (${o.trustTitle}). It clears the bar to publish; it is published only when you ask.${warningText}`;
    const heldMessage = o.heldReason
      ? (o.heldReason.trim().endsWith('.') ? o.heldReason.trim() : `${o.heldReason.trim()}.`)
      : 'it needs review before it can be published.';
    return `I built and trained the prediction, but I'm holding it back: ${heldMessage}${warningText}`;
  }

  /**
   * Run the deterministic build once. Reads the approved plan off `params.payload`, builds the
   * pipeline + trains (+ publishes through the gate's automated publisher when {@link AutoPublishOf} is on), writes the outcome to the payload, and terminates
   * the sub-agent with Success (build ran — even when the model is held, that's a successful run with
   * a held outcome) or Failed (the build itself errored).
   */
  protected override async executeAgentInternal<P = PredictiveStudioBuilderPayload>(
    params: ExecuteAgentParams,
    _config: AgentConfiguration,
  ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }> {
    // `ExecuteAgentParams` carries the framework's untyped payload; this agent's payload is the builder payload.
    const payload: PredictiveStudioBuilderPayload = params.payload || {};
    const user = params.contextUser;
    if (!user) {
      return this.codeStep<P>('Failed', payload, 'No context user — cannot build the pipeline.');
    }
    const provider = this.ProviderToUse;
    if (!provider) {
      return this.codeStep<P>('Failed', payload, 'No metadata provider available — cannot build the pipeline.');
    }

    const approval = PredictiveStudioPipelineBuilderAgent.ReadsPublishingSwitches(params) ? null : await this.ResolveHeldApproval(params, payload);
    if (!PredictiveStudioPipelineBuilderAgent.BuildAllowed(params, approval)) {
      return this.codeStep<P>('Failed', payload, PredictiveStudioPipelineBuilderAgent.NO_APPROVAL_MESSAGE);
    }

    let result: BuildPredictionResult;
    try {
      const autoPublish = PredictiveStudioPipelineBuilderAgent.AutoPublishOf(params);
      const initiator: Actor = this.AgentRun ? { kind: 'agent', agentRunId: this.AgentRun.ID } : { kind: 'human', userId: user.ID };
      const protocolPromotion = PredictiveStudioPipelineBuilderAgent.ProtocolPromotionOf(params);
      result = await this.createBuilder().Build({ spec: PredictiveStudioPipelineBuilderAgent.PlanOf(payload), provider, user, autoPublish, initiator, protocolPromotion });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      LogError(`PredictiveStudioPipelineBuilderAgent: build threw: ${errorMessage}`);
      result = { success: false, published: false, readyToPublish: false, heldReason: null, errorMessage };
    }

    const outcome = PredictiveStudioPipelineBuilderAgent.SummarizeBuildResult(result);
    const newPayload: PredictiveStudioBuilderPayload = result.success
      ? PredictiveStudioPipelineBuilderAgent.ReportPayload(payload, result, outcome, await this.ReadRunCost(result, provider, user))
      : { ...payload, BuildResult: outcome };
    const directive: ArtifactDirective | undefined = result.success
      ? { behavior: 'create-new', name: `ML Experiment Results - ${newPayload.Name}`, description: `Experiment results and performance evaluation for ${newPayload.Name}` }
      : undefined;
    return this.codeStep<P>('Success', newPayload, PredictiveStudioPipelineBuilderAgent.BuildOutcomeMessage(outcome), directive);
  }

  /**
   * The build's training run's stored cost columns, read fresh (the run settled before the build returned), or null
   * when the build has no run or the row cannot be read (the report then says the cost was not measured; a failed read
   * is logged).
   */
  protected async ReadRunCost(result: BuildPredictionResult, provider: IMetadataProvider, user: UserInfo): Promise<TrainingRunCost | null> {
    if (!result.run) return null;
    const runId = result.run.ID;
    try {
      const rows = await RunView.FromMetadataProvider(provider).RunView<TrainingRunCost>({
        EntityName: TrustVerdicts.RunEntityName, ExtraFilter: `ID='${EscapeSQLString(runId)}'`, Fields: ['ID', ...ExperimentReports.COST_COLUMNS], ResultType: 'simple', BypassCache: true,
      }, user);
      if (!rows.Success) LogError(`PredictiveStudioPipelineBuilderAgent: reading the cost of training run ${runId} failed: ${rows.ErrorMessage || 'unknown error'}`);
      return rows.Success ? rows.Results[0] || null : null;
    } catch (e) {
      LogError(`PredictiveStudioPipelineBuilderAgent: reading the cost of training run ${runId} failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  /**
   * The payload of a build that ran: the outcome plus the experiment report (name, goal, target metric, leaderboard,
   * the feature importance the lineage lets us show, the best model when one shipped, the summary and its markdown).
   * The report is generated from the build's stored rows (its training run, its cost columns and its model); its traced
   * numbers are not put in the payload (G3.7 regenerates the report from the stored rows).
   *
   * @param cost the training run's stored cost columns ({@link ReadRunCost}); absent, the report has no cost line
   */
  public static ReportPayload(payload: PredictiveStudioBuilderPayload, result: BuildPredictionResult, outcome: PredictiveStudioBuildOutcome, cost?: TrainingRunCost | null): PredictiveStudioBuilderPayload {
    const targetVar = payload.TargetDefinition?.TargetVariable || 'Target';
    const name = payload.Name || `${targetVar} Prediction`;
    const goal = payload.Goal || `Predict ${targetVar}`;
    const isReg = payload.TargetDefinition?.ProblemType === 'regression';
    const targetMetric = payload.TargetDefinition?.SuccessMetric || (isReg ? 'R²' : 'AUC');
    const rawFeatures = ExperimentReports.ParseFeatureImportance(result.model?.FeatureImportance).sort((a, b) => b.importance - a.importance);
    const featureBars = ImportanceDisplay.GlobalDriversShowable(result.model?.Lineage) ? rawFeatures : [];
    const leaderboard: MLLeaderboardEntryPayload[] = result.leaderboard || [];
    const summaryText = result.trust?.Headline || PredictiveStudioPipelineBuilderAgent.BuildOutcomeMessage(outcome);
    const report = ExperimentReports.GenerateMarkdownReport({
      Name: name, Goal: goal, TargetVariable: targetVar, TargetMetric: targetMetric,
      Run: result.run || null,
      Model: result.model ? { ID: result.model.ID, FeatureImportance: result.model.FeatureImportance, Lineage: result.model.Lineage } : null,
      Trust: result.trust || null,
      Status: PredictiveStudioPipelineBuilderAgent.CatalogStatusOf(outcome),
      ...(cost === undefined ? {} : { Cost: cost }),
    });
    return {
      ...payload,
      BuildResult: outcome,
      Name: name,
      Goal: goal,
      TargetMetric: targetMetric,
      Leaderboard: leaderboard,
      FeatureImportance: featureBars,
      // A build whose training run shipped no model names no best model; the summary carries the stored reason.
      BestModel: result.model ? { ID: result.model.ID, Name: `${name} (v${result.model.Version})`, Version: result.model.Version } : undefined,
      BestModelID: result.model ? result.model.ID : undefined,
      Summary: summaryText,
      Markdown: report.Markdown,
      GateOutcome: result.Gate?.Outcome,
      GateReason: result.Gate?.Reason,
    };
  }

  /**
   * The approval this run holds: the claim its parent orchestrator took and named in the payload (`BuildClaimID`), for
   * this payload's plan, by that parent run. Null for a run with no parent, no claim, or a claim that does not match. A
   * payload cannot grant one: the claim row is written only by `BuildApprovalClaims.Claim` (its guard refuses any other
   * writer). Overridden in unit tests.
   */
  protected async ResolveHeldApproval(params: ExecuteAgentParams, payload: PredictiveStudioBuilderPayload): Promise<BuildApproval | AgentBuildApprovalRefusal | null> {
    const parentRunId = params.parentRun?.ID;
    const user = params.contextUser;
    const provider = this.ProviderToUse;
    if (!parentRunId || !payload.BuildClaimID || !user || !provider) return null;
    const planHash = AgentControlPath.PlanHash(PredictiveStudioPipelineBuilderAgent.PlanOf(payload));
    return BuildApprovalClaims.HeldApproval(payload.BuildClaimID, parentRunId, planHash, payload.PlanId || '', provider, user);
  }

  /** Builder seam — overridden in unit tests to inject a stub (no DB / sidecar). */
  protected createBuilder(): PredictiveStudioPipelineBuilder {
    return new PredictiveStudioPipelineBuilder();
  }

  /**
   * Shape a terminal code-agent step (no chat loop), mirroring the Database Designer base code agent. A failed step
   * carries the reasoning as its message and its error message.
   */
  private codeStep<P>(
    step: 'Success' | 'Failed',
    newPayload: PredictiveStudioBuilderPayload,
    reasoning: string,
    artifactDirective?: ArtifactDirective,
  ): { finalStep: BaseAgentNextStep<P>; stepCount: number } {
    const finalStep: BaseAgentNextStep<P> = {
      terminate: true,
      step,
      reasoning,
      // The base class's generic `P` is the caller's name for this agent's payload type, which is always the builder
      // payload; TypeScript cannot relate a type parameter to a concrete type without this one assertion.
      newPayload: newPayload as P,
      ...(artifactDirective ? { artifactDirective } : {}),
      ...(step === 'Failed' ? { message: reasoning, errorMessage: reasoning } : {}),
    };
    return { finalStep, stepCount: 1 };
  }
}
