import { describe, it, expect, afterEach } from 'vitest';
import { RecordProcessorRegistry } from '@memberjunction/record-set-processor-base';

import {
  MLModelInferenceProcessor,
  ML_INFERENCE_WORK_TYPE,
  ML_INFERENCE_WORK_TYPE_ALIAS,
} from '../ml-model-inference-processor';
import {
  resolveMLInferenceProcessor,
  isMLInferenceWorkType,
  registerMLScoringProcessor,
  ML_INFERENCE_WORK_TYPES,
} from '../register';
import { InMemoryArtifactLoader } from '../artifact-loader';
import type { MLInferenceDeps } from '../types';

/**
 * Tests for the work-type registration + dynamic resolution (plan §10.1). The
 * processor registers on the MJGlobal ClassFactory via @RegisterClass under both
 * the human-readable `'ML Model'` key and the `'MLModelInference'` alias, WITHOUT
 * modifying the record-set-processor substrate. `resolveMLInferenceProcessor`
 * pulls it back out by work-type key — the seam a RecordProcessExecutor extension
 * uses to delegate the ML work type.
 */

const deps: MLInferenceDeps = {
  modelLoader: { async loadModel() { return null; } },
  artifactLoader: new InMemoryArtifactLoader(),
  sidecar: { async predict() { return { predictions: [] }; } },
};

describe('isMLInferenceWorkType', () => {
  it('matches both the human-readable key and the alias', () => {
    expect(isMLInferenceWorkType(ML_INFERENCE_WORK_TYPE)).toBe(true);
    expect(isMLInferenceWorkType(ML_INFERENCE_WORK_TYPE_ALIAS)).toBe(true);
    expect(ML_INFERENCE_WORK_TYPES).toContain('ML Model');
    expect(ML_INFERENCE_WORK_TYPES).toContain('MLModelInference');
  });

  it('rejects other / empty work types', () => {
    expect(isMLInferenceWorkType('Action')).toBe(false);
    expect(isMLInferenceWorkType('Infer')).toBe(false);
    expect(isMLInferenceWorkType(null)).toBe(false);
    expect(isMLInferenceWorkType(undefined)).toBe(false);
  });
});

describe('resolveMLInferenceProcessor', () => {
  it('resolves a constructed MLModelInferenceProcessor for the ML work-type key', () => {
    const proc = resolveMLInferenceProcessor(ML_INFERENCE_WORK_TYPE, { modelId: 'model-1', deps });
    expect(proc).toBeInstanceOf(MLModelInferenceProcessor);
    // It satisfies the IRecordProcessor contract (has ProcessRecord).
    expect(typeof (proc as MLModelInferenceProcessor).ProcessRecord).toBe('function');
  });

  it('resolves via the alias key too', () => {
    const proc = resolveMLInferenceProcessor(ML_INFERENCE_WORK_TYPE_ALIAS, { modelId: 'model-1', deps });
    expect(proc).toBeInstanceOf(MLModelInferenceProcessor);
  });

  it('returns null for a non-ML work type (caller falls through to built-in processors)', () => {
    expect(resolveMLInferenceProcessor('Action', { modelId: 'model-1', deps })).toBeNull();
    expect(resolveMLInferenceProcessor(undefined, { modelId: 'model-1', deps })).toBeNull();
  });
});

describe('registerMLScoringProcessor', () => {
  afterEach(() => {
    for (const wt of ML_INFERENCE_WORK_TYPES) {
      RecordProcessorRegistry.Instance.Unregister(wt);
    }
  });

  it('registers the ML scorer into the Record Set Processing registry for both work-type keys', () => {
    registerMLScoringProcessor(deps);
    expect(RecordProcessorRegistry.Instance.Has(ML_INFERENCE_WORK_TYPE)).toBe(true);
    expect(RecordProcessorRegistry.Instance.Has(ML_INFERENCE_WORK_TYPE_ALIAS)).toBe(true);
  });

  it('makes the registry resolve an MLModelInferenceProcessor for the ML work type (modelId from Configuration)', () => {
    registerMLScoringProcessor(deps);
    const proc = RecordProcessorRegistry.Instance.Resolve({
      WorkType: ML_INFERENCE_WORK_TYPE,
      Configuration: JSON.stringify({ modelId: 'model-1' }),
    });
    expect(proc).toBeInstanceOf(MLModelInferenceProcessor);
  });

  it('resolves via the alias work-type key too', () => {
    registerMLScoringProcessor(deps);
    const proc = RecordProcessorRegistry.Instance.Resolve({
      WorkType: ML_INFERENCE_WORK_TYPE_ALIAS,
      Configuration: JSON.stringify({ modelId: 'model-1' }),
    });
    expect(proc).toBeInstanceOf(MLModelInferenceProcessor);
  });

  it('throws when the Configuration is missing a modelId', () => {
    registerMLScoringProcessor(deps);
    expect(() =>
      RecordProcessorRegistry.Instance.Resolve({ WorkType: ML_INFERENCE_WORK_TYPE, Configuration: '{}' }),
    ).toThrow(/modelId/);
  });
});
