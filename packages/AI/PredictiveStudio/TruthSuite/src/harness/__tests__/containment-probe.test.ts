import { describe, it, expect } from 'vitest';
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { SafeJSONParse } from '@memberjunction/global';
import { EvaluationLineage, TrustVerdicts, type ValidationStrategy } from '@memberjunction/predictive-studio-core';
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
  Trust: TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ auc: 0.5 }), ProblemType: 'classification' }),
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

describe('containment probe — predicates', () => {
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
