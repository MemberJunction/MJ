/**
 * The view model of a training run's protocol results (no Angular): the stored trainer result and gate record of a
 * `ps-run-results/v2` envelope, read into the rows the results widget shows, with the trust verdict's title and
 * headline rendered from the same stored decision.
 */
import type { MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import {
  HoldoutCarve, JsonParse, TrustVerdicts, TrainingRunResultsParser, TRAINING_RUN_RESULTS_SCHEMA,
  type BaselineSpec, type TrainingRefusal, type GateOutcome, type LeakageFlag, type MetricWithInterval, type OutcomeTitleText,
  type StoredGateIntervals, type StoredGateRecord, type StoredInterval, type StoredTrainerResult, type TrustInput, type UnitResolutionCounts,
} from '@memberjunction/predictive-studio-core';

/** A value with its 95% interval. */
export interface IntervalCell {
  readonly Value: number;
  readonly Lower: number;
  readonly Upper: number;
}

/** One reliability bin of the calibration table. */
export interface CalibrationBin {
  readonly Range: string;
  readonly Predicted: number;
  readonly Observed: number;
  readonly N: number;
}

/** Rows of one entity field the change history did not cover, excluded from the run. */
export interface UncoveredField {
  readonly Entity: string;
  readonly Field: string;
  readonly Rows: number;
}

/**
 * The run's Training Snapshot uncovered-history counts: counted (possibly none), the run has no snapshot, or the
 * snapshot's stored counts cannot be read.
 */
export type UncoveredRows =
  | { readonly Kind: 'counted'; readonly Fields: readonly UncoveredField[] }
  | { readonly Kind: 'no-snapshot' }
  | { readonly Kind: 'unreadable' };

/** What the run's read of the Prediction Unit kept and excluded, and the history rows the snapshot left uncovered. */
export interface EvaluationRows {
  readonly Read: number;
  readonly Resolved: number;
  readonly Censored: number;
  readonly LabelKnown: number;
  readonly EmptyLabel: number;
  readonly Duplicates: number;
  readonly DataCutoff: string;
  readonly Uncovered: UncoveredRows;
}

/** Everything the results widget shows for one run. */
export interface EvaluationView {
  readonly Outcome: GateOutcome;
  readonly OutcomeTitle: OutcomeTitleText;
  readonly Headline: string;
  readonly Reason: string;
  readonly Rows: EvaluationRows;
  readonly Holdout: { readonly Metric: string; readonly Cell: IntervalCell; readonly Rows: number };
  readonly Secondary: readonly { readonly Metric: string; readonly Cell: IntervalCell }[];
  readonly Baselines: readonly { readonly Name: string; readonly Role: string; readonly Cell: IntervalCell }[];
  readonly VersusFlatGuess: readonly { readonly Member: string; readonly Cell: IntervalCell }[];
  readonly InnerScores: readonly { readonly Candidate: string; readonly Cell: IntervalCell; readonly IsFinalist: boolean }[];
  readonly Calibration: { readonly Method: string; readonly Slope: number; readonly Intercept: number; readonly Bins: readonly CalibrationBin[] } | null;
  readonly LeakageFlags: readonly string[];
  readonly OperatingPoint: { readonly Capacity: number; readonly Precision: IntervalCell; readonly BaseRate: number } | null;
}

/** What the results widget is given for one run: its stored results, the model lineage and the run's status. */
export interface EvaluationRunInput extends TrustInput {
  /** The run's `Status`; null when there is no run. */
  readonly RunStatus: MJMLTrainingRunEntity['Status'] | null;
  /** The run's Training Snapshot `UncoveredHistoryRowsExcluded` JSON; null when the run has no snapshot. */
  readonly UncoveredHistoryRows: string | null;
}

/**
 * The state of one run's protocol results: evaluated (the view), never evaluated under a protocol (no run, or results
 * stored before protocol training), not finished, refused at a stage, or stored results that cannot be read.
 */
export type EvaluationRunState =
  | { readonly Kind: 'evaluated'; readonly View: EvaluationView }
  | { readonly Kind: 'not-evaluated' }
  | { readonly Kind: 'not-finished'; readonly RunStatus: MJMLTrainingRunEntity['Status'] }
  | { readonly Kind: 'refused'; readonly Stage: TrainingRefusal['stage']; readonly Detail: string }
  | { readonly Kind: 'unreadable'; readonly Detail: string };

/** Building the results view model from a run's stored results. */
export class EvaluationViews {
  /** `0.0177 [0.0098, 0.0254]`. */
  public static FormatInterval(c: IntervalCell): string {
    return `${c.Value.toFixed(4)} [${c.Lower.toFixed(4)}, ${c.Upper.toFixed(4)}]`;
  }

  /** The state of a run's protocol results, telling "no protocol results" apart from refused, unfinished and unreadable runs. */
  public static DescribeRun(input: EvaluationRunInput): EvaluationRunState {
    const text = input.ValidationResults;
    if (text === null || text.trim().length === 0) {
      return input.RunStatus === 'Pending' || input.RunStatus === 'Running' ? { Kind: 'not-finished', RunStatus: input.RunStatus } : { Kind: 'not-evaluated' };
    }
    if (!EvaluationViews.isRunResultsEnvelope(text)) return { Kind: 'not-evaluated' };
    const parsed = TrainingRunResultsParser.ParseTrainingRunResults(text);
    if (!parsed.Ok) return { Kind: 'unreadable', Detail: parsed.Errors.join('; ') };
    if (parsed.Value.status === 'refused') {
      return { Kind: 'refused', Stage: parsed.Value.refusal.stage, Detail: EvaluationViews.refusalDetail(parsed.Value.refusal) };
    }
    const view = EvaluationViews.BuildEvaluationView(input, input.UncoveredHistoryRows);
    return view === null ? { Kind: 'not-evaluated' } : { Kind: 'evaluated', View: view };
  }

  /**
   * The view of a run's `ValidationResults` with the model's `Lineage` (both as `TrustVerdicts.DeriveTrustVerdict`
   * reads them) and its Training Snapshot's `UncoveredHistoryRowsExcluded` (null when the run has no snapshot); null
   * unless the envelope is a completed run holding a trainer result and a gate record.
   */
  public static BuildEvaluationView(input: TrustInput, uncoveredHistoryRows: string | null): EvaluationView | null {
    const parsed = TrainingRunResultsParser.ParseTrainingRunResults(input.ValidationResults);
    if (!parsed.Ok || parsed.Value.status !== 'completed') return null;
    const { trainer, gate, unitResolution } = parsed.Value;
    if (trainer === null || gate === null) return null;
    return {
      ...EvaluationViews.verdictPart(input, gate),
      Rows: EvaluationViews.rows(unitResolution, uncoveredHistoryRows),
      ...EvaluationViews.trainerPart(trainer, gate.intervals),
    };
  }

  /** The unit read's counts as the envelope stores them, with the snapshot's uncovered-history counts. */
  private static rows(u: UnitResolutionCounts, uncoveredHistoryRows: string | null): EvaluationRows {
    return {
      Read: u.rowsRead,
      Resolved: u.resolvedRows,
      Censored: u.censoredRowsExcluded,
      LabelKnown: u.labelKnownRowsExcluded,
      EmptyLabel: u.emptyLabelRowsExcluded,
      Duplicates: u.duplicateRowsRemoved,
      DataCutoff: u.dataCutoff,
      Uncovered: EvaluationViews.uncovered(uncoveredHistoryRows),
    };
  }

  /** The snapshot's `[{ entity, field, rows }]` list; unreadable when the text or any entry does not have that shape. */
  private static uncovered(text: string | null): UncoveredRows {
    if (text === null) return { Kind: 'no-snapshot' };
    const json = JsonParse.ParseJsonText(text, 'UncoveredHistoryRowsExcluded');
    if (!json.Ok || !Array.isArray(json.Value)) return { Kind: 'unreadable' };
    const fields: UncoveredField[] = [];
    for (const entry of json.Value) {
      if (!JsonParse.IsJsonObject(entry)) return { Kind: 'unreadable' };
      const entity = JsonParse.JsonString(entry, 'entity');
      const field = JsonParse.JsonString(entry, 'field');
      const rows = JsonParse.JsonInteger(entry, 'rows');
      if (entity === null || field === null || rows === null) return { Kind: 'unreadable' };
      fields.push({ Entity: entity, Field: field, Rows: rows });
    }
    return { Kind: 'counted', Fields: fields };
  }

  /** The decision rows: outcome, its title and headline (the trust verdict's rendering) and the stored reason. */
  private static verdictPart(input: TrustInput, gate: StoredGateRecord): Pick<EvaluationView, 'Outcome' | 'OutcomeTitle' | 'Headline' | 'Reason'> {
    const trust = TrustVerdicts.DeriveTrustVerdict(input);
    return { Outcome: gate.decision.outcome, OutcomeTitle: TrustVerdicts.OutcomeTitle(trust), Headline: trust.Headline, Reason: gate.reason.text };
  }

  /** The measured rows: test-set scores, baselines, improvements, candidates, calibration, leakage, operating point. */
  private static trainerPart(e: StoredTrainerResult, iv: StoredGateIntervals): Omit<EvaluationView, 'Outcome' | 'OutcomeTitle' | 'Headline' | 'Reason' | 'Rows'> {
    return {
      Holdout: { Metric: e.holdout.primary.metric, Cell: EvaluationViews.cell(e.holdout.primary), Rows: e.holdout.primary.n },
      Secondary: e.holdout.secondary.map((m) => ({ Metric: m.metric, Cell: EvaluationViews.cell(m) })),
      Baselines: e.baselines.map((b) => ({ Name: EvaluationViews.baselineName(b.baseline), Role: b.role, Cell: EvaluationViews.cell(b.holdout) })),
      VersusFlatGuess: EvaluationViews.versusFlatGuess(iv),
      InnerScores: e.innerScores.map((s) => ({ Candidate: s.candidate, Cell: EvaluationViews.cell(s.inner), IsFinalist: s.candidate === e.finalist })),
      Calibration: EvaluationViews.calibration(e),
      LeakageFlags: e.leakageFlags.map((f) => EvaluationViews.flagText(f)),
      OperatingPoint: e.operatingPoint === null
        ? null
        : { Capacity: e.operatingPoint.capacityPerPeriod, Precision: EvaluationViews.cell(e.operatingPoint.precisionAtCapacity), BaseRate: e.operatingPoint.baseRate },
    };
  }

  /** The model's improvement over the flat guess, then every simple member's, members in name order. */
  private static versusFlatGuess(iv: StoredGateIntervals): EvaluationView['VersusFlatGuess'] {
    const members = Object.keys(iv.memberVsDummy).sort().flatMap((member) => {
      const m = iv.memberVsDummy[member];
      return m === undefined ? [] : [{ Member: member, Cell: EvaluationViews.storedCell(m) }];
    });
    return [{ Member: `model (${iv.modelName})`, Cell: EvaluationViews.storedCell(iv.modelVsDummy) }, ...members];
  }

  private static calibration(e: StoredTrainerResult): EvaluationView['Calibration'] {
    const c = e.calibration;
    if (c === null) return null;
    return {
      Method: c.method,
      Slope: c.slope,
      Intercept: c.intercept,
      Bins: c.reliability.map((b) => ({ Range: `${b.binLower.toFixed(1)}–${b.binUpper.toFixed(1)}`, Predicted: b.meanPredicted, Observed: b.observedRate, N: b.n })),
    };
  }

  /** True when the text is JSON tagged `ps-run-results/v2` (results stored before protocol training carry no such tag). */
  private static isRunResultsEnvelope(text: string): boolean {
    const json = JsonParse.ParseJsonText(text, 'ValidationResults');
    return json.Ok === true && JsonParse.IsJsonObject(json.Value) && JsonParse.JsonString(json.Value, 'schema') === TRAINING_RUN_RESULTS_SCHEMA;
  }

  /** The refusal in words: the carve's own sentence, a trainer failure's message, otherwise the refusal kind. */
  private static refusalDetail(r: TrainingRefusal): string {
    if (r.stage === 'carve') return HoldoutCarve.DescribeCarveRefusal(r.reason);
    if (r.stage === 'trainer' && r.reason.kind === 'trainer-failed') return `trainer-failed (${r.reason.stage}): ${r.reason.message}`;
    return r.reason.kind;
  }

  private static cell(m: MetricWithInterval): IntervalCell {
    return { Value: m.value, Lower: m.interval.lower, Upper: m.interval.upper };
  }

  private static storedCell(m: StoredInterval): IntervalCell {
    return { Value: m.value, Lower: m.lower, Upper: m.upper };
  }

  private static baselineName(b: BaselineSpec): string {
    switch (b.kind) {
      case 'dummy': return 'Flat guess (base rate / mean)';
      case 'one-feature': return 'Best single feature';
      case 'glm': return 'Simple model (GLM)';
      case 'naive': return 'Naive (last value)';
      case 'seasonal-naive': return 'Seasonal naive';
      case 'incumbent-heuristic': return `Existing rule "${b.name}"`;
    }
  }

  private static flagText(f: LeakageFlag): string {
    switch (f.kind) {
      case 'single-feature-auc': return `single-feature-auc: ${f.sourceColumn}`;
      case 'drop-column': return `drop-column: ${f.sourceColumn}`;
      case 'high-cardinality-id': return `high-cardinality-id: ${f.sourceColumn}`;
      case 'time-shifted-label': return 'time-shifted-label';
    }
  }
}
