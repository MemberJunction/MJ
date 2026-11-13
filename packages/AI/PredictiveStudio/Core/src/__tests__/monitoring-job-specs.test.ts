/**
 * `MonitoringJobSpecs.FromProtocol` and `Validate` (D4-92): the job spec takes the protocol's scores, interval method,
 * promotion rule, retrain triggers and rollback trigger, and M3's documented defaults for the rest.
 */
import { describe, it, expect } from 'vitest';
import { ALLOWED_OUTCOMES, EvaluationProtocol, type EvaluationProtocolSpec } from '../evaluation-protocol';
import { MonitoringJobSpecs } from '../monitoring-job-specs';

const MODEL = { ModelID: 'c3d4e5f6-0718-4293-a4b5-c6d7e8f90a1b', PredictionUnitID: 'unit-v3', FeatureCount: 7 };

/** A parsed protocol row (version row `protocol-v4`) with a 0.01 margin and one outcome-degradation retrain trigger. */
function Protocol(): EvaluationProtocolSpec {
  const parsed = EvaluationProtocol.ParseEvaluationProtocolRow({
    ID: 'protocol-v4', LineageRootID: 'protocol-v1', Version: 4, Name: 'Renewal grading',
    Holdout: JSON.stringify({ kind: 'date-carved', dateColumn: 'OrderDate', cutoff: '2024-01-01', holdoutEnd: null, newEntityReport: null }),
    InnerValidation: JSON.stringify({ kind: 'repeated-stratified-kfold', folds: 5, repeats: 3 }),
    Seed: 0, HoldoutAccessBudget: 1,
    PrimaryScore: JSON.stringify({ family: 'binary', metric: 'log-loss' }),
    SecondaryMetrics: JSON.stringify(['auc']),
    Baselines: JSON.stringify([{ kind: 'dummy', name: 'base-rate' }, { kind: 'glm', family: 'logistic', penalty: 'l2' }]),
    Calibration: JSON.stringify({ kind: 'auto', thresholdRows: 1000, fitOn: 'disjoint-calibration-fold' }),
    Resampling: JSON.stringify({ kind: 'none' }),
    Intervals: JSON.stringify({ level: 0.95, method: 'bootstrap', resamples: 1000, pairedTest: 'paired-bootstrap' }),
    Promotion: JSON.stringify({ comparators: [], incumbent: 'current-published', margin: 0.01, lowerBoundLevel: 0.95, pairedOn: 'same-holdout-rows', decisionTable: 'Q13+Q14+Q15' }),
    AllowedOutcomes: JSON.stringify(ALLOWED_OUTCOMES),
    LeakageAudit: JSON.stringify({ singleFeatureHeldOutAucMax: 0.9, timeShiftedLabelTest: true, dropColumnTest: true, importanceAggregation: 'per-source-column', highCardinalityIdCheck: true }),
    Exclusions: JSON.stringify({ denyFields: [], denySources: [] }),
    Slices: JSON.stringify({ outOfTime: false, subgroups: [] }),
    PredictionIntervals: null, ResidualDiagnostics: null,
    RetrainTriggers: JSON.stringify([{ kind: 'outcome-degradation', margin: 0.01, consecutivePeriods: 2 }]),
    SearchStrategy: JSON.stringify({ kind: 'random', candidates: 3 }),
    Budgets: JSON.stringify({ maxComputeSeconds: 600, maxTokens: 0, maxCandidates: 3, hardStop: true }),
    MinMinorityClassRows: 20, GuardFieldsEditableBy: 'non-agent',
    AuthoredBy: JSON.stringify({ kind: 'human', userId: 'U1' }),
  });
  if (parsed.Ok === false) throw new Error(`the protocol row does not parse: ${parsed.Errors.join('; ')}`);
  return parsed.Value;
}

describe('MonitoringJobSpecs.FromProtocol', () => {
  it('copies the protocol scores, interval, rule, retrain triggers and rollback trigger', () => {
    const protocol = Protocol();
    const spec = MonitoringJobSpecs.FromProtocol(protocol, MODEL);
    expect(spec).toMatchObject({
      modelId: MODEL.ModelID, evaluationProtocolId: 'protocol-v4',
      outcomeJoin: { predictionUnitId: 'unit-v3', runWhen: 'label-window-closed', joinOn: 'entity-and-as-of-date', excludeInTrainingRows: true },
      performance: { primaryScore: protocol.primaryScore, interval: protocol.intervals, calibration: true },
      challenger: { comparison: 'same-row-ids', score: protocol.primaryScore, rule: protocol.promotion, onPass: 'publish-through-gate' },
      retrainTriggers: protocol.retrainTriggers,
      rollback: protocol.promotion.rollbackOn,
    });
  });
  it('fills the members the protocol does not hold with the documented defaults', () => {
    const spec = MonitoringJobSpecs.FromProtocol(Protocol(), MODEL);
    expect([spec.schedule, spec.performance.period, spec.parity]).toEqual([{ cronExpression: '0 3 1 * *', timezone: 'UTC' }, 'month', { sampleRows: 100, tolerance: 1e-9 }]);
    expect(spec.drift).toEqual({
      features: 'all-model-features', statistic: 'z-mean', fdr: { method: 'benjamini-hochberg', q: 0.0095 },
      nullCalibration: { kind: 'empirical-replay', looks: 12, inputs: 7, replays: 4_000_000, q: 0.0095 }, documentedFalseAlarmRate: 0.05, action: 'alert',
    });
  });
  it('keeps an explicit null rollback (automated rollback off for that protocol version)', () => {
    const protocol = Protocol();
    const off = { ...protocol, promotion: { ...protocol.promotion, rollbackOn: null } };
    expect(MonitoringJobSpecs.FromProtocol(off, MODEL).rollback).toBeNull();
    expect(Protocol().promotion.rollbackOn).toEqual({ kind: 'previous-beats-current', margin: 0.01, consecutivePeriods: 2 });
  });
});

describe('MonitoringJobSpecs.Validate', () => {
  it('accepts a spec FromProtocol built', () => {
    const spec = MonitoringJobSpecs.FromProtocol(Protocol(), MODEL);
    expect(MonitoringJobSpecs.Validate(spec)).toEqual({ Ok: true, Value: spec });
  });
  it('refuses a model ID that is not a UUID and a q outside (0, 1), naming each path', () => {
    const spec = MonitoringJobSpecs.FromProtocol(Protocol(), { ...MODEL, ModelID: 'not-a-uuid' });
    const bad = { ...spec, drift: { ...spec.drift, fdr: { method: 'benjamini-hochberg' as const, q: 1.5 } } };
    const r = MonitoringJobSpecs.Validate(bad);
    expect(r.Ok).toBe(false);
    expect(r.Ok === false && r.Errors.map((e) => e.split(':')[0])).toEqual(['modelId', 'drift.fdr.q']);
  });
});
