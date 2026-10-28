import { describe, it, expect } from 'vitest';
import { InvalidMajorityBaselineRuleError } from '@memberjunction/predictive-studio-core';
import { PredictiveStudioRefusals } from '../refusals';
import { ReadCapExceededError } from '../../feature-assembly/read-cap-error';
import { TrainingRefusedError } from '../../training/training-refusal';
import { AsOfSettingHasNoEffectError } from '../../training/as-of-refusal';
import { ModelNotScorableError, ModelNeedsTrainingError } from '../../scoring/model-readiness';
import { ExperimentSessionsUnavailableError } from '../../actions/run-experiment.deps';

describe('PredictiveStudioRefusals', () => {
  it('maps each refusal error to its code', () => {
    expect(PredictiveStudioRefusals.CodeOf(ReadCapExceededError.ForTraining('E', 10, 10, 20))).toBe('READ_CAP_EXCEEDED');
    expect(PredictiveStudioRefusals.CodeOf(new AsOfSettingHasNoEffectError('modeling-plan', 'column', null))).toBe('AS_OF_NO_EFFECT');
    expect(PredictiveStudioRefusals.CodeOf(new ModelNotScorableError('m1', 'Archived'))).toBe('MODEL_NOT_SCORABLE');
    expect(PredictiveStudioRefusals.CodeOf(new ModelNeedsTrainingError('needs training'))).toBe('MODEL_NEEDS_TRAINING');
    expect(PredictiveStudioRefusals.CodeOf(new ExperimentSessionsUnavailableError())).toBe('EXPERIMENT_SESSIONS_UNAVAILABLE');
    expect(PredictiveStudioRefusals.CodeOf(new InvalidMajorityBaselineRuleError('off'))).toBe('INVALID_EVALUATION_SETTING');
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
});
