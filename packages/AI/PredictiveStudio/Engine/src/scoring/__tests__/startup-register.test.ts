import { describe, it, expect, afterEach } from 'vitest';
import { RecordProcessorRegistry } from '@memberjunction/record-set-processor-base';

import { MLModelInferenceProcessor, ML_INFERENCE_WORK_TYPE } from '../ml-model-inference-processor';
import { ML_INFERENCE_WORK_TYPES } from '../register';
import { PredictiveStudioScoringStartup } from '../startup-register';

/**
 * Tests for the startup sink (PS2-1). After `HandleStartup()` runs at boot, a saved
 * `MJ: Record Processes` row with `WorkType='ML Model'` must route to the scorer —
 * i.e. the Record Set Processing {@link RecordProcessorRegistry} resolves an
 * {@link MLModelInferenceProcessor} for it. The sink wires the SAME production deps the
 * Score action / Remote Op use, so we exercise the public startup path (no DB / sidecar —
 * the factory only constructs the processor; it does not score here).
 */
describe('PredictiveStudioScoringStartup', () => {
  afterEach(() => {
    // Unregister so each test observes the registry's miss behavior on a clean slate.
    for (const wt of ML_INFERENCE_WORK_TYPES) {
      RecordProcessorRegistry.Instance.Unregister(wt);
    }
  });

  it('registers the ML Model work type into the registry on HandleStartup()', async () => {
    expect(RecordProcessorRegistry.Instance.Has(ML_INFERENCE_WORK_TYPE)).toBe(false);

    await PredictiveStudioScoringStartup.Instance.HandleStartup();

    expect(RecordProcessorRegistry.Instance.Has(ML_INFERENCE_WORK_TYPE)).toBe(true);
  });

  it('makes the registry resolve an MLModelInferenceProcessor for a Record Process with WorkType=ML Model', async () => {
    await PredictiveStudioScoringStartup.Instance.HandleStartup();

    const proc = RecordProcessorRegistry.Instance.Resolve({
      WorkType: ML_INFERENCE_WORK_TYPE,
      Configuration: JSON.stringify({ modelId: '11111111-1111-1111-1111-111111111111' }),
    });

    expect(proc).toBeInstanceOf(MLModelInferenceProcessor);
  });

  it('returns null for an unknown work type (the registry miss behavior)', async () => {
    await PredictiveStudioScoringStartup.Instance.HandleStartup();

    expect(RecordProcessorRegistry.Instance.Resolve({ WorkType: 'Totally Unknown Work Type' })).toBeNull();
  });

  it('is idempotent — calling HandleStartup() twice still resolves the processor (last-wins)', async () => {
    await PredictiveStudioScoringStartup.Instance.HandleStartup();
    await PredictiveStudioScoringStartup.Instance.HandleStartup();

    const proc = RecordProcessorRegistry.Instance.Resolve({
      WorkType: ML_INFERENCE_WORK_TYPE,
      Configuration: JSON.stringify({ modelId: '22222222-2222-2222-2222-222222222222' }),
    });

    expect(proc).toBeInstanceOf(MLModelInferenceProcessor);
  });
});
