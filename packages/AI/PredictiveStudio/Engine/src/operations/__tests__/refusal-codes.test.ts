import { describe, it, expect } from 'vitest';
import { InvalidMajorityBaselineRuleError } from '@memberjunction/predictive-studio-core';
import { PredictiveStudioRefusals } from '../refusals';
import { ReadCapExceededError } from '../../feature-assembly/read-cap-error';
import { TrainingRefusedError } from '../../training/training-refusal';
import { AsOfSettingHasNoEffectError } from '../../training/as-of-refusal';
import { ArtifactUnavailableError, ModelNotScorableError, ModelNeedsTrainingError, ModelNotServableError } from '../../scoring/model-readiness';
import { ExperimentSessionsUnavailableError } from '../../actions/run-experiment.deps';
import { ScoringRefusedError } from '../../scoring/scoring-refused-error';
import type { PredictiveStudioRefusalCode, ScoringRefusal } from '@memberjunction/predictive-studio-core';

describe('PredictiveStudioRefusals', () => {
  it('maps each refusal error to its code', () => {
    expect(PredictiveStudioRefusals.CodeOf(ReadCapExceededError.ForTraining('E', 10, 10, 20))).toBe('READ_CAP_EXCEEDED');
    expect(PredictiveStudioRefusals.CodeOf(new AsOfSettingHasNoEffectError('modeling-plan', 'column', null))).toBe('AS_OF_NO_EFFECT');
    expect(PredictiveStudioRefusals.CodeOf(new ModelNotScorableError('m1', 'Archived'))).toBe('MODEL_NOT_SCORABLE');
    expect(PredictiveStudioRefusals.CodeOf(new ModelNeedsTrainingError('needs training'))).toBe('MODEL_NEEDS_TRAINING');
    expect(PredictiveStudioRefusals.CodeOf(new ModelNotServableError('m1'))).toBe('MODEL_NOT_SERVABLE');
    expect(PredictiveStudioRefusals.CodeOf(new ExperimentSessionsUnavailableError())).toBe('EXPERIMENT_SESSIONS_UNAVAILABLE');
    expect(PredictiveStudioRefusals.CodeOf(new InvalidMajorityBaselineRuleError('off'))).toBe('INVALID_EVALUATION_SETTING');
  });

  it('maps each artifact refusal to its own code', () => {
    const refused = (refusal: ArtifactUnavailableError['Refusal']) => new ArtifactUnavailableError(refusal, 'MLModelInferenceProcessor', 'm1', 'f1');
    expect(PredictiveStudioRefusals.CodeOf(refused({ kind: 'artifact-missing', fileId: 'f1' }))).toBe('ARTIFACT_MISSING');
    expect(PredictiveStudioRefusals.CodeOf(refused({ kind: 'artifact-hash-mismatch', expected: 'a'.repeat(64), actual: 'b'.repeat(64) }))).toBe('ARTIFACT_HASH_MISMATCH');
    expect(PredictiveStudioRefusals.CodeOf(refused({ kind: 'artifact-unverified', modelId: 'm1' }))).toBe('ARTIFACT_UNVERIFIED');
  });

  it('maps each training refusal kind that has a code, and leaves every other kind to the generic code', () => {
    const codeOf = (r: ConstructorParameters<typeof TrainingRefusedError>[0]) => PredictiveStudioRefusals.CodeOf(new TrainingRefusedError(r));
    expect(codeOf({ stage: 'pipeline', reason: { kind: 'unit-required', pipelineId: 'p1', why: 'no unit' } })).toBe('UNIT_REQUIRED');
    expect(codeOf({ stage: 'pipeline', reason: { kind: 'input-not-accepted', input: 'asOf', why: 'no effect' } })).toBe('AS_OF_NO_EFFECT');
    expect(codeOf({ stage: 'assembly', reason: { kind: 'decision-date-before-change-history', entity: 'People', field: 'Status', historyStart: null, rowsAffected: 3 } })).toBe('AS_OF_SOURCE_UNDATED');
    expect(codeOf({ stage: 'assembly', reason: { kind: 'select-changes-after-decision-date', entity: 'People', field: 'Status', changesAfter: 2 } })).toBe('AS_OF_SOURCE_UNDATED');
    expect(codeOf({ stage: 'pipeline', reason: { kind: 'input-not-accepted', input: 'labelEventDates', why: 'no effect' } })).toBeNull();
    expect(codeOf({ stage: 'assembly', reason: { kind: 'non-numeric-in-numeric-column', column: 'Region', sampleValue: 'EU' } })).toBeNull();
    expect(codeOf({ stage: 'unit', reason: { kind: 'single-valued-target', value: '1', rows: 4 } })).toBeNull();
  });

  it('maps a pipeline without its Evaluation Protocol to PROTOCOL_REQUIRED', () => {
    expect(PredictiveStudioRefusals.CodeOf(new TrainingRefusedError({ stage: 'pipeline', reason: { kind: 'protocol-required', pipelineId: 'p1' } }))).toBe('PROTOCOL_REQUIRED');
  });

  it('maps a time-indexed pipeline under a holdout that does not respect time to TIME_HOLDOUT_REQUIRED', () => {
    const reason = { kind: 'time-index-needs-time-holdout', pipelineId: 'p1', protocolId: 'P1', timeIndexColumn: 'MonthIndex', holdout: 'seeded-random' } as const;
    expect(PredictiveStudioRefusals.CodeOf(new TrainingRefusedError({ stage: 'pipeline', reason }))).toBe('TIME_HOLDOUT_REQUIRED');
  });

  it('maps a trainer stopped by its budget to BUDGET_EXCEEDED and leaves every other trainer stage to the generic code', () => {
    const trainerFailed = (stage: 'budget-exceeded' | 'inner-cv') => new TrainingRefusedError({ stage: 'trainer', reason: { kind: 'trainer-failed', stage, message: 'stopped', computeSeconds: 600 } });
    expect(PredictiveStudioRefusals.CodeOf(trainerFailed('budget-exceeded'))).toBe('BUDGET_EXCEEDED');
    expect(PredictiveStudioRefusals.CodeOf(trainerFailed('inner-cv'))).toBeNull();
    expect(PredictiveStudioRefusals.CodeOf(new TrainingRefusedError({ stage: 'trainer', reason: { kind: 'lineage-incomplete', gaps: ['threads'] } }))).toBeNull();
  });

  it('EXECUTION_ERROR is not a refusal: a plain error keeps the generic code', async () => {
    const r = await PredictiveStudioRefusals.ExecuteServer(async () => true, async () => { throw new Error('sidecar unreachable'); }, 'K');
    expect(r).toEqual({ Success: false, ResultCode: 'EXECUTION_ERROR', ErrorMessage: 'sidecar unreachable' });
  });

  it('a refusal returns its code and message', async () => {
    const r = await PredictiveStudioRefusals.ExecuteServer(async () => true, async () => { throw new TrainingRefusedError({ stage: 'pipeline', reason: { kind: 'input-not-accepted', input: 'asOf', why: 'no effect' } }); }, 'K');
    expect(r.Success).toBe(false);
    expect(r.ResultCode).toBe('AS_OF_NO_EFFECT');
  });

  it('keeps the FORBIDDEN and SUCCESS outcomes of the base class', async () => {
    expect((await PredictiveStudioRefusals.ExecuteServer(async () => false, async () => 1, 'K')).ResultCode).toBe('FORBIDDEN');
    expect(await PredictiveStudioRefusals.ExecuteServer(async () => true, async () => 7, 'K')).toEqual({ Success: true, ResultCode: 'SUCCESS', Output: 7 });
  });

  describe('a refused or failed scoring run maps to its code', () => {
    const refused = (reason: ScoringRefusal) => new ScoringRefusedError({ Status: 'refused', ScoringRunID: 'run-1', ModelID: null, Reason: reason });
    const cases: ReadonlyArray<readonly [ScoringRefusal, PredictiveStudioRefusalCode]> = [
      [{ kind: 'model-not-published', status: 'Draft' }, 'MODEL_NOT_PUBLISHED'],
      [{ kind: 'model-flagged', flags: ['single-feature-auc'] }, 'MODEL_FLAGGED'],
      [{ kind: 'artifact-missing', fileId: 'f1' }, 'ARTIFACT_MISSING'],
      [{ kind: 'artifact-hash-mismatch', expected: 'a'.repeat(64), actual: 'b'.repeat(64) }, 'ARTIFACT_HASH_MISMATCH'],
      [{ kind: 'feature-schema-mismatch', expectedHash: 'e', actualHash: 'a', missingColumns: ['DistanceZ'], extraColumns: [], typeMismatches: [] }, 'FEATURE_SCHEMA_MISMATCH'],
      [{ kind: 'scope-entity-mismatch', modelEntity: 'Members', scopeEntity: 'Orders' }, 'SCOPE_ENTITY_MISMATCH'],
      [{ kind: 'assembly-refused', refusal: { kind: 'truncated-read', entity: 'Members', rowsExpected: 10, rowsRead: 5 } }, 'ASSEMBLY_REFUSED'],
      [{ kind: 'nan-or-empty-feature-column', columns: ['Tenure'] }, 'EMPTY_FEATURE_COLUMN'],
      [{ kind: 'no-published-model', pipelineId: 'p1' }, 'NO_PUBLISHED_MODEL'],
      [{ kind: 'binding-withdrawn', bindingId: 'b1' }, 'BINDING_WITHDRAWN'],
      [{ kind: 'binding-not-authorized', bindingId: 'b1' }, 'BINDING_NOT_AUTHORIZED'],
      [{ kind: 'as-of-unsupported', modelId: 'm1', asOf: '2026-01-01T00:00:00.000Z' }, 'AS_OF_UNSUPPORTED'],
      [{ kind: 'leakage-unknown', modelId: 'm1' }, 'LEAKAGE_UNKNOWN'],
      [{ kind: 'artifact-unverified', modelId: 'm1' }, 'ARTIFACT_UNVERIFIED'],
      [{ kind: 'feature-values-not-writable', userId: 'u1' }, 'FEATURE_VALUES_NOT_WRITABLE'],
    ];
    for (const [reason, code] of cases) {
      it(`${reason.kind} -> ${code}, and the message names the scoring run`, () => {
        const error = refused(reason);
        expect(PredictiveStudioRefusals.CodeOf(error)).toBe(code);
        expect(error.message).toContain('run-1');
        expect(error.Result.Status).toBe('refused');
      });
    }

    it('every refusal kind has a case above (15 kinds)', () => {
      expect(new Set(cases.map(([r]) => r.kind)).size).toBe(15);
    });

    it('a failed run -> SCORING_RUN_FAILED, its counts and first error in the message', () => {
      const error = new ScoringRefusedError({ Status: 'failed', ScoringRunID: 'run-2', ModelID: 'm1', ModelVersion: 3, Total: 9, Failed: 3, FirstErrors: [{ recordId: 'r4', message: 'sidecar: batch 2 failed' }] });
      expect(PredictiveStudioRefusals.CodeOf(error)).toBe('SCORING_RUN_FAILED');
      expect(error.message).toContain('run-2');
      expect(error.message).toContain('3 of 9');
      expect(error.message).toContain('sidecar: batch 2 failed');
    });

    it('the operation returns the refusal as Success = false with its code and no Output', async () => {
      const r = await PredictiveStudioRefusals.ExecuteServer(async () => true, async () => { throw refused({ kind: 'binding-withdrawn', bindingId: 'b1' }); }, 'K');
      expect(r).toMatchObject({ Success: false, ResultCode: 'BINDING_WITHDRAWN' });
      expect(r.Output).toBeUndefined();
      expect(r.ErrorMessage).toContain('run-1');
    });
  });
});
