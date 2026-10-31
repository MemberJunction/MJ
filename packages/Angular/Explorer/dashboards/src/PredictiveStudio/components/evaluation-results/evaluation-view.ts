/**
 * The view model of a training run's protocol results (no Angular): the stored trainer result and gate record of a
 * `ps-run-results/v2` envelope, read into the rows the results widget shows, with the trust verdict's title and
 * headline rendered from the same stored decision.
 */
import {
  TrustVerdicts, TrainingRunResultsParser,
  type BaselineSpec, type GateOutcome, type LeakageFlag, type MetricWithInterval, type OutcomeTitleText,
  type StoredGateIntervals, type StoredGateRecord, type StoredInterval, type StoredTrainerResult, type TrustInput,
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

/** Everything the results widget shows for one run. */
export interface EvaluationView {
  readonly Outcome: GateOutcome;
  readonly OutcomeTitle: OutcomeTitleText;
  readonly Headline: string;
  readonly Reason: string;
  readonly Holdout: { readonly Metric: string; readonly Cell: IntervalCell; readonly Rows: number };
  readonly Secondary: readonly { readonly Metric: string; readonly Cell: IntervalCell }[];
  readonly Baselines: readonly { readonly Name: string; readonly Role: string; readonly Cell: IntervalCell }[];
  readonly VersusFlatGuess: readonly { readonly Member: string; readonly Cell: IntervalCell }[];
  readonly InnerScores: readonly { readonly Candidate: string; readonly Cell: IntervalCell; readonly IsFinalist: boolean }[];
  readonly Calibration: { readonly Method: string; readonly Slope: number; readonly Intercept: number; readonly Bins: readonly CalibrationBin[] } | null;
  readonly LeakageFlags: readonly string[];
  readonly OperatingPoint: { readonly Capacity: number; readonly Precision: IntervalCell; readonly BaseRate: number } | null;
}

/** Building the results view model from a run's stored results. */
export class EvaluationViews {
  /** `0.0177 [0.0098, 0.0254]`. */
  public static FormatInterval(c: IntervalCell): string {
    return `${c.Value.toFixed(4)} [${c.Lower.toFixed(4)}, ${c.Upper.toFixed(4)}]`;
  }

  /**
   * The view of a run's `ValidationResults` with the model's `Lineage` (both as `TrustVerdicts.DeriveTrustVerdict`
   * reads them); null unless the envelope is a completed run holding a trainer result and a gate record.
   */
  public static BuildEvaluationView(input: TrustInput): EvaluationView | null {
    const parsed = TrainingRunResultsParser.ParseTrainingRunResults(input.ValidationResults);
    if (!parsed.Ok || parsed.Value.status !== 'completed') return null;
    const { trainer, gate } = parsed.Value;
    if (trainer === null || gate === null) return null;
    return { ...EvaluationViews.verdictPart(input, gate), ...EvaluationViews.trainerPart(trainer, gate.intervals) };
  }

  /** The decision rows: outcome, its title and headline (the trust verdict's rendering) and the stored reason. */
  private static verdictPart(input: TrustInput, gate: StoredGateRecord): Pick<EvaluationView, 'Outcome' | 'OutcomeTitle' | 'Headline' | 'Reason'> {
    const trust = TrustVerdicts.DeriveTrustVerdict(input);
    return { Outcome: gate.decision.outcome, OutcomeTitle: TrustVerdicts.OutcomeTitle(trust), Headline: trust.Headline, Reason: gate.reason.text };
  }

  /** The measured rows: test-set scores, baselines, improvements, candidates, calibration, leakage, operating point. */
  private static trainerPart(e: StoredTrainerResult, iv: StoredGateIntervals): Omit<EvaluationView, 'Outcome' | 'OutcomeTitle' | 'Headline' | 'Reason'> {
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
