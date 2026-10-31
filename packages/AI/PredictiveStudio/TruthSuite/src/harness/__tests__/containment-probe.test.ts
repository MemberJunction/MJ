import { describe, it, expect } from 'vitest';
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { SafeJSONParse } from '@memberjunction/global';
import { EvaluationLineage, TRAINING_RUN_RESULTS_SCHEMA, TrustVerdicts, type GateDecision, type StoredGateRecord, type ValidationStrategy } from '@memberjunction/predictive-studio-core';
import { ContainmentProbe } from '../containment-probe';
import { HarnessModels } from '../promote';
import type { CandidateModel, ScoreAttempt, TrainAttempt } from '../types';

const train = (over: Partial<TrainAttempt>): TrainAttempt => ({
  Ok: false,
  ErrorMessage: 'x',
  RefusalCode: null,
  ModelID: null,
  TrainingRunID: null,
  HoldoutMetricsJSON: null,
  DurationMs: 1,
  ...over,
});
const score = (over: Partial<ScoreAttempt>): ScoreAttempt => ({
  Ok: false,
  ErrorMessage: 'x',
  RefusalCode: null,
  Scored: 0,
  Failed: 0,
  Skipped: 0,
  WroteBack: false,
  Predictions: [],
  DurationMs: 1,
  ...over,
});
const model = (over: Partial<CandidateModel>): CandidateModel => ({
  ModelID: 'm1',
  PipelineID: 'p1',
  Algorithm: 'logistic_regression',
  Status: 'Draft',
  TrainingRowCount: 10,
  HoldoutRowCount: 2,
  Metrics: {},
  HoldoutMetrics: {},
  Trust: TrustVerdicts.DeriveTrustVerdict({ ValidationResults: null }),
  TrainingRunStatus: 'Completed',
  TrainingRunNotes: null,
  LineageJSON: null,
  ValidationResultsJSON: null,
  ...over,
});

describe('refusals are decided by code', () => {
  it('a crash is not a refusal', () => {
    expect(ContainmentProbe.WasRefusedBeforeTraining(train({ RefusalCode: null }), 'AS_OF_NO_EFFECT')).toBe(false);
    expect(ContainmentProbe.WasScoringRefused(score({ RefusalCode: null }), 'MODEL_NOT_SCORABLE')).toBe(false);
  });
  it('the expected code is a refusal; a different code is not', () => {
    expect(ContainmentProbe.WasRefusedBeforeTraining(train({ RefusalCode: 'AS_OF_NO_EFFECT' }), 'AS_OF_NO_EFFECT')).toBe(true);
    expect(ContainmentProbe.WasRefusedBeforeTraining(train({ RefusalCode: 'READ_CAP_EXCEEDED' }), 'AS_OF_NO_EFFECT')).toBe(false);
    expect(ContainmentProbe.WasScoringRefused(score({ RefusalCode: 'MODEL_NOT_SCORABLE' }), 'MODEL_NOT_SCORABLE')).toBe(true);
    expect(ContainmentProbe.WasScoringRefused(score({ RefusalCode: 'READ_CAP_EXCEEDED' }), 'MODEL_NOT_SCORABLE')).toBe(false);
  });
  it('a refusal that still produced a model is not a refusal', () => {
    expect(ContainmentProbe.WasRefusedBeforeTraining(train({ RefusalCode: 'AS_OF_NO_EFFECT', ModelID: 'm1' }), 'AS_OF_NO_EFFECT')).toBe(false);
  });
  it('a scoring refusal that still scored rows is not a refusal', () => {
    expect(ContainmentProbe.WasScoringRefused(score({ RefusalCode: 'MODEL_NOT_SCORABLE', Scored: 5 }), 'MODEL_NOT_SCORABLE')).toBe(false);
  });
});

/** A run's stored results whose gate decision is `decision`. */
function storedRun(decision: GateDecision): string {
  const gate: StoredGateRecord = {
    evaluationProtocolId: 'EP-1', margin: 0, primaryMetric: 'log-loss', holdoutRows: 120,
    intervals: { modelName: 'xgb', modelVsDummy: { value: 0.02, lower: 0.01, upper: 0.03 }, modelVsBestSimple: null, memberVsDummy: {}, memberScores: {}, deliveredMember: null },
    guards: { taskKind: 'binary', holdoutClassCounts: { '0': 100, '1': 20 }, modelAucInterval: { level: 0.95, lower: 0.6, upper: 0.7 }, minMinorityClassRows: 20 },
    transcribed: decision, decision, guardRefusal: null,
    reason: { code: decision.outcome === 'no-signal' ? 'nothing-beats-dummy' : 'only-model-beats-dummy', text: 'stored reason' },
    incumbentDiff: null, sliceCoverage: { missingSubgroups: [], missingPeriods: [], slicesWithoutInterval: 0 },
  };
  return JSON.stringify({
    schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed',
    unitResolution: { rowsRead: 120, censoredRowsExcluded: 0, labelKnownRowsExcluded: 0, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 120, dataCutoff: '2026-07-30' },
    legacy: null, legacyRequest: null, trainer: null, trainerRequest: null, carve: null, gate,
  });
}
const SHIPPED: GateDecision = { outcome: 'model', branch: 'a:Q15-only-model-beats-dummy', shipped: 'xgb', shippedRole: 'model', note: null };
const NO_SIGNAL: GateDecision = { outcome: 'no-signal', branch: 'c:no-signal', shipped: null, shippedRole: null, note: null };

describe('containment probe — predicates', () => {
  it('counts Published, and only Published, as reaching publication', () => {
    expect(ContainmentProbe.ReachedPublishedUnattended(model({ Status: 'Published' }))).toBe(true);
    expect(ContainmentProbe.ReachedPublishedUnattended(model({ Status: 'Validated' }))).toBe(false);
  });
  it('flags a verdict cleared to act: only a stored decision that ships', () => {
    expect(ContainmentProbe.GradedAbovePoorOrActionable(model({}))).toBe(false); // no stored decision: not evaluated
    const shipped = TrustVerdicts.DeriveTrustVerdict({ ValidationResults: storedRun(SHIPPED) });
    expect(ContainmentProbe.GradedAbovePoorOrActionable(model({ Trust: shipped }))).toBe(true);
    const noSignal = TrustVerdicts.DeriveTrustVerdict({ ValidationResults: storedRun(NO_SIGNAL) });
    expect(ContainmentProbe.GradedAbovePoorOrActionable(model({ Trust: noSignal }))).toBe(false);
  });
});

describe('containment probe — majority-baseline finding from the stored model', () => {
  const metrics = (accuracy: number, baseline: number, extra: Record<string, number> = {}): Record<string, number> => ({ accuracy, baseline_accuracy: baseline, predicted_classes: 2, ...extra });
  it('finds a classifier at or below the majority rate, enforced under the lineage default rule', () => {
    expect(ContainmentProbe.ReadMajorityBaselineFinding(model({ HoldoutMetrics: metrics(0.9206, 0.9206, { auc: 0.61 }) }))).toEqual({
      Rule: 'enforce', Enforced: true, Accuracy: 0.9206, BaselineAccuracy: 0.9206, PredictedClasses: 2,
    });
  });
  it('under the stored warn rule, enforces only when accuracy is the only evidence (no AUC)', () => {
    const lineage = JSON.stringify({ evaluation: { ValidationOutOfSample: true, MajorityBaselineRule: 'warn' } });
    expect(ContainmentProbe.ReadMajorityBaselineFinding(model({ LineageJSON: lineage, HoldoutMetrics: metrics(0.9, 0.92, { auc: 0.6 }) }))?.Enforced).toBe(false);
    expect(ContainmentProbe.ReadMajorityBaselineFinding(model({ LineageJSON: lineage, HoldoutMetrics: metrics(0.9, 0.92) }))?.Enforced).toBe(true);
  });
  it('a classifier that predicts one class is at the majority rate whatever its accuracy', () => {
    expect(ContainmentProbe.ReadMajorityBaselineFinding(model({ HoldoutMetrics: { accuracy: 0.95, baseline_accuracy: 0.9, predicted_classes: 1 } }))?.Enforced).toBe(true);
  });
  it('finds nothing for a model above the majority rate or without the numbers', () => {
    expect(ContainmentProbe.ReadMajorityBaselineFinding(model({ HoldoutMetrics: metrics(0.95, 0.9) }))).toBeNull();
    expect(ContainmentProbe.ReadMajorityBaselineFinding(model({ HoldoutMetrics: { r2: 0.4 } }))).toBeNull();
  });
});

/** A T4-like regression model trained without a unit: its run stores no gate decision, as `ReadModel` reads it. */
function candidate(lineageJSON: string | null): CandidateModel {
  return model({
    Algorithm: 'lightgbm', HoldoutMetrics: { r2: 0.7775 }, LineageJSON: lineageJSON,
    Trust: TrustVerdicts.DeriveTrustVerdict({ ValidationResults: null }),
  });
}

describe('containment probe — stored verdict and time index', () => {
  it('reads the stored withheld verdict', () => {
    const lineage = JSON.stringify({ evaluation: { ValidationOutOfSample: true, TimeIndexColumn: 'MonthIndex', EvaluatedAsForecast: false, WithheldReason: EvaluationLineage.NotEvaluatedAsForecast } });
    expect(ContainmentProbe.ReadStoredWithheldVerdict(candidate(lineage))).toEqual({ CanAct: false, Grade: 'Not evaluated yet', Reason: EvaluationLineage.NotEvaluatedAsForecast });
  });

  it('returns null when nothing is withheld', () => {
    expect(ContainmentProbe.ReadStoredWithheldVerdict(candidate(JSON.stringify({ pipelineId: 'p1' })))).toBeNull();
  });

  it('declares the time index on the pipeline, keeping the rest of its validation strategy', () => {
    // ApplyTimeIndexDeclaration reads and writes only ValidationStrategy, so a plain object with that field is a full double.
    const pipeline: Pick<MJMLTrainingPipelineEntity, 'ValidationStrategy'> = { ValidationStrategy: JSON.stringify({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2 }) };
    ContainmentProbe.ApplyTimeIndexDeclaration(pipeline, 'MonthIndex');
    const saved = SafeJSONParse<ValidationStrategy>(pipeline.ValidationStrategy || '{}');
    expect(saved).toEqual({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2, TimeIndexColumn: 'MonthIndex' });
  });

  it('refuses to declare a time index on a pipeline with no validation strategy', () => {
    const pipeline: Pick<MJMLTrainingPipelineEntity, 'ValidationStrategy'> = { ValidationStrategy: null };
    expect(() => ContainmentProbe.ApplyTimeIndexDeclaration(pipeline, 'MonthIndex')).toThrow(/no ValidationStrategy/);
  });
});

describe('HarnessModels.EscapeLikePrefix (F7 / F-L)', () => {
  it('escapes single quotes and LIKE wildcards (%, _, [) with bracket classes and emits no backslashes', () => {
    const escaped = HarnessModels.EscapeLikePrefix("PSTruth_W1%['a']");
    expect(escaped).toBe("PSTruth[_]W1[%][[]''a'']");
    expect(escaped).not.toContain('\\');
  });
});
