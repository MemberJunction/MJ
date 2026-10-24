import { describe, it, expect } from 'vitest';
import { InvalidMajorityBaselineRuleError } from '@memberjunction/predictive-studio-core';
import { PredictiveStudioRefusals } from '../refusals';
import { ReadCapExceededError } from '../../feature-assembly/read-cap-error';
import { AsOfSettingHasNoEffectError } from '../../training/as-of-refusal';
import { ModelNotScorableError, ModelNeedsTrainingError } from '../../scoring/model-readiness';
import { ExperimentSessionsUnavailableError } from '../../actions/run-experiment.deps';

describe('PredictiveStudioRefusals', () => {
  it('maps each refusal error to its code', () => {
    expect(PredictiveStudioRefusals.CodeOf(ReadCapExceededError.ForTraining('E', 10, 10, 20))).toBe('READ_CAP_EXCEEDED');
    expect(PredictiveStudioRefusals.CodeOf(new AsOfSettingHasNoEffectError('pipeline', 'column', 'p1'))).toBe('AS_OF_NO_EFFECT');
    expect(PredictiveStudioRefusals.CodeOf(new ModelNotScorableError('m1', 'Archived'))).toBe('MODEL_NOT_SCORABLE');
    expect(PredictiveStudioRefusals.CodeOf(new ModelNeedsTrainingError('needs training'))).toBe('MODEL_NEEDS_TRAINING');
    expect(PredictiveStudioRefusals.CodeOf(new ExperimentSessionsUnavailableError())).toBe('EXPERIMENT_SESSIONS_UNAVAILABLE');
    expect(PredictiveStudioRefusals.CodeOf(new InvalidMajorityBaselineRuleError('off'))).toBe('INVALID_EVALUATION_SETTING');
  });

  it('EXECUTION_ERROR is not a refusal: a plain error keeps the generic code', async () => {
    const r = await PredictiveStudioRefusals.ExecuteServer(async () => true, async () => { throw new Error('sidecar unreachable'); }, 'K');
    expect(r).toEqual({ Success: false, ResultCode: 'EXECUTION_ERROR', ErrorMessage: 'sidecar unreachable' });
  });

  it('a refusal returns its code and message', async () => {
    const r = await PredictiveStudioRefusals.ExecuteServer(async () => true, async () => { throw new AsOfSettingHasNoEffectError('train-input', 'column', 'p1'); }, 'K');
    expect(r.Success).toBe(false);
    expect(r.ResultCode).toBe('AS_OF_NO_EFFECT');
  });

  it('keeps the FORBIDDEN and SUCCESS outcomes of the base class', async () => {
    expect((await PredictiveStudioRefusals.ExecuteServer(async () => false, async () => 1, 'K')).ResultCode).toBe('FORBIDDEN');
    expect(await PredictiveStudioRefusals.ExecuteServer(async () => true, async () => 7, 'K')).toEqual({ Success: true, ResultCode: 'SUCCESS', Output: 7 });
  });
});
