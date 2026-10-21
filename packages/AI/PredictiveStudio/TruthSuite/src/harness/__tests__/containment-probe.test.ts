import { describe, it, expect } from 'vitest';
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { EvaluationLineage, TrustVerdicts, type ValidationStrategy } from '@memberjunction/predictive-studio-core';
import { ContainmentProbe } from '../containment-probe';
import type { CandidateModel, ScoreAttempt, TrainAttempt } from '../types';

const train = (over: Partial<TrainAttempt>): TrainAttempt => ({
  Ok: false,
  ErrorMessage: 'refused',
  ModelID: null,
  TrainingRunID: null,
  HoldoutMetricsJSON: null,
  DurationMs: 1,
  ...over,
});
const score = (over: Partial<ScoreAttempt>): ScoreAttempt => ({
  Ok: false,
  ErrorMessage: 'refused',
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
  Trust: TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ auc: 0.5 }), ProblemType: 'classification' }),
  TrainingRunStatus: 'Completed',
  TrainingRunNotes: null,
  LineageJSON: null,
  ValidationResultsJSON: null,
  ...over,
});

describe('containment probe — predicates', () => {
  it('counts a training refusal only when the operation failed and produced no model', () => {
    expect(ContainmentProbe.WasRefusedBeforeTraining(train({}))).toBe(true);
    expect(ContainmentProbe.WasRefusedBeforeTraining(train({ Ok: true, ErrorMessage: null, ModelID: 'm1' }))).toBe(false);
    expect(ContainmentProbe.WasRefusedBeforeTraining(train({ ModelID: 'm1' }))).toBe(false); // failed after a model row existed
  });
  it('counts a scoring refusal only when it failed with a message and scored nothing', () => {
    expect(ContainmentProbe.WasScoringRefused(score({}))).toBe(true);
    expect(ContainmentProbe.WasScoringRefused(score({ ErrorMessage: null }))).toBe(false);
    expect(ContainmentProbe.WasScoringRefused(score({ Scored: 5 }))).toBe(false);
    expect(ContainmentProbe.WasScoringRefused(score({ Ok: true, ErrorMessage: null }))).toBe(false);
  });
  it('counts Published, and only Published, as reaching publication', () => {
    expect(ContainmentProbe.ReachedPublishedUnattended(model({ Status: 'Published' }))).toBe(true);
    expect(ContainmentProbe.ReachedPublishedUnattended(model({ Status: 'Validated' }))).toBe(false);
  });
  it('flags a verdict above Poor or one cleared to act', () => {
    expect(ContainmentProbe.GradedAbovePoorOrActionable(model({}))).toBe(false); // AUC 0.5 → Poor, not actionable
    const good = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ auc: 0.8 }), ProblemType: 'classification' });
    expect(ContainmentProbe.GradedAbovePoorOrActionable(model({ Trust: good }))).toBe(true);
    expect(ContainmentProbe.GradedAbovePoorOrActionable(model({ Trust: { ...model({}).Trust, canAct: true } }))).toBe(true);
  });
});

/** A T4-like regression model whose trust is derived from its own lineage, as `ReadModel` derives it. */
function candidate(lineageJSON: string | null): CandidateModel {
  const holdoutMetrics = { r2: 0.7775 };
  return model({
    Algorithm: 'lightgbm', HoldoutMetrics: holdoutMetrics, LineageJSON: lineageJSON,
    Trust: TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify(holdoutMetrics), ProblemType: 'regression', Lineage: lineageJSON }),
  });
}

describe('containment probe — stored verdict and time index', () => {
  it('reads the stored withheld verdict', () => {
    const lineage = JSON.stringify({ evaluation: { ValidationOutOfSample: true, TimeIndexColumn: 'MonthIndex', EvaluatedAsForecast: false, WithheldReason: EvaluationLineage.NotEvaluatedAsForecast } });
    expect(ContainmentProbe.ReadStoredWithheldVerdict(candidate(lineage))).toEqual({ CanAct: false, Grade: 'Poor', Reason: EvaluationLineage.NotEvaluatedAsForecast });
  });

  it('returns null when nothing is withheld', () => {
    expect(ContainmentProbe.ReadStoredWithheldVerdict(candidate(JSON.stringify({ pipelineId: 'p1' })))).toBeNull();
  });

  it('declares the time index on the pipeline, keeping the rest of its validation strategy', () => {
    // Test double: ContainmentProbe.ApplyTimeIndexDeclaration reads and writes only ValidationStrategy.
    const pipeline = { ValidationStrategy: JSON.stringify({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2 }) } as unknown as MJMLTrainingPipelineEntity;
    expect(ContainmentProbe.ApplyTimeIndexDeclaration(pipeline, 'MonthIndex')).toBe(true);
    const saved = JSON.parse(pipeline.ValidationStrategy || '{}') as ValidationStrategy;
    expect(saved).toEqual({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2, TimeIndexColumn: 'MonthIndex' });
  });
});
