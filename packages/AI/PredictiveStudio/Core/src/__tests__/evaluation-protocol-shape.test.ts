import { describe, it, expect } from 'vitest';
import { EvaluationProtocol, ALLOWED_OUTCOMES, type EvaluationProtocolColumns } from '../evaluation-protocol';

function protocolRow(overrides: Partial<EvaluationProtocolColumns> = {}): EvaluationProtocolColumns {
  return {
    ID: 'P1', LineageRootID: 'P1', Version: 1, Name: 'C1 renewal protocol',
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

describe('GetEvaluationProtocolShapeProblems', () => {
  it('accepts a well-formed binary protocol', () => {
    expect(EvaluationProtocol.GetEvaluationProtocolShapeProblems(protocolRow())).toEqual([]);
  });
  it('refuses allowed outcomes without no-signal, a negative margin, fewer than five rolling origins and an unknown guard-field setting', () => {
    const problems = EvaluationProtocol.GetEvaluationProtocolShapeProblems(protocolRow({
      AllowedOutcomes: JSON.stringify(['model', 'keep-simple-baseline']),
      Promotion: JSON.stringify({ comparators: [], incumbent: 'none', margin: -0.01, lowerBoundLevel: 0.95, pairedOn: 'same-holdout-rows', decisionTable: 'Q13+Q14+Q15' }),
      Holdout: JSON.stringify({ kind: 'rolling-origin', origins: 4, horizonPeriods: 12, gapPeriods: 0, minTrainPeriods: 96, window: 'expanding' }),
      GuardFieldsEditableBy: 'agents-only',
    }));
    expect(problems).toContain('GuardFieldsEditableBy must be non-agent or human-only');
    expect(EvaluationProtocol.GetEvaluationProtocolShapeProblems(protocolRow({ GuardFieldsEditableBy: 'human-only' }))).toEqual([]);
    expect(problems).toContain('AllowedOutcomes must be exactly ["model","keep-simple-baseline","no-signal"]');
    expect(problems).toContain('Promotion margin must be a finite number >= 0');
    expect(problems).toContain('Holdout rolling-origin needs at least 5 origins (4 given)');
  });
  it('refuses a primary score whose metric does not belong to its family', () => {
    const problems = EvaluationProtocol.GetEvaluationProtocolShapeProblems(protocolRow({ PrimaryScore: JSON.stringify({ family: 'count', metric: 'rmse' }) }));
    expect(problems).toContain('PrimaryScore metric "rmse" is not a proper score of family "count" (allowed: poisson-deviance)');
  });
});

describe('ToNonNegative', () => {
  it('throws below zero', () => {
    expect(() => EvaluationProtocol.ToNonNegative(-1)).toThrow(RangeError);
    expect(EvaluationProtocol.ToNonNegative(0)).toBe(0);
  });
});
