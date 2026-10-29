/**
 * The binary Evaluation Protocol row the Engine training tests bind a pipeline to: a log-loss protocol with the
 * dummy, one-feature and GLM baselines, a repeated stratified K-fold inner validation and a Region slice.
 */
import { ALLOWED_OUTCOMES, type EvaluationProtocolColumns } from '@memberjunction/predictive-studio-core';

/** A typed `MJ: Evaluation Protocols` row for tests (static members on one owner). */
export class ProtocolRowFixture {
  /** The protocol row's ID and lineage root. */
  public static readonly ID = 'P1';

  /** The row, with any column overridden. */
  public static Row(overrides: Partial<EvaluationProtocolColumns> = {}): EvaluationProtocolColumns {
    return {
      ID: ProtocolRowFixture.ID, LineageRootID: ProtocolRowFixture.ID, Version: 1, Name: 'Default binary protocol',
      Holdout: JSON.stringify({ kind: 'date-carved', dateColumn: 'OrderDate', cutoff: '2024-01-01', holdoutEnd: null, newEntityReport: null }),
      InnerValidation: JSON.stringify({ kind: 'repeated-stratified-kfold', folds: 5, repeats: 3 }),
      Seed: 0, HoldoutAccessBudget: 1,
      PrimaryScore: JSON.stringify({ family: 'binary', metric: 'log-loss' }),
      SecondaryMetrics: JSON.stringify(['auc', 'calibration-slope']),
      Baselines: JSON.stringify([{ kind: 'dummy', name: 'base-rate' }, { kind: 'one-feature', selection: 'best-single-feature-inner-cv' }, { kind: 'glm', family: 'logistic', penalty: 'l2' }]),
      Calibration: JSON.stringify({ kind: 'auto', thresholdRows: 1000, fitOn: 'disjoint-calibration-fold' }),
      Resampling: JSON.stringify({ kind: 'none' }),
      Intervals: JSON.stringify({ level: 0.95, method: 'bootstrap', resamples: 1000, pairedTest: 'paired-bootstrap' }),
      Promotion: JSON.stringify({ comparators: [], incumbent: 'current-published', margin: 0, lowerBoundLevel: 0.95, pairedOn: 'same-holdout-rows', decisionTable: 'Q13+Q14+Q15' }),
      AllowedOutcomes: JSON.stringify(ALLOWED_OUTCOMES),
      LeakageAudit: JSON.stringify({ singleFeatureHeldOutAucMax: 0.9, timeShiftedLabelTest: true, dropColumnTest: true, importanceAggregation: 'per-source-column', highCardinalityIdCheck: true }),
      Exclusions: JSON.stringify({ denyFields: [], denySources: [] }),
      Slices: JSON.stringify({ outOfTime: true, subgroups: ['Region'] }),
      PredictionIntervals: null, ResidualDiagnostics: null,
      RetrainTriggers: JSON.stringify([]),
      SearchStrategy: JSON.stringify({ kind: 'random', candidates: 3 }),
      Budgets: JSON.stringify({ maxComputeSeconds: 600, maxTokens: 0, maxCandidates: 3, hardStop: true }),
      MinMinorityClassRows: 20, GuardFieldsEditableBy: 'non-agent',
      AuthoredBy: JSON.stringify({ kind: 'human', userId: 'U1' }),
      ...overrides,
    };
  }
}
