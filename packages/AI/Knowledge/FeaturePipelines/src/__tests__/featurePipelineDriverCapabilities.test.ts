import { describe, it, expect } from 'vitest';
import { LLM_FEATURE_PIPELINE_CAPABILITIES } from '../spec/feature-pipeline-driver-capabilities.js';

describe('LLM_FEATURE_PIPELINE_CAPABILITIES', () => {
  it('names every constraint type', () => {
    expect([...LLM_FEATURE_PIPELINE_CAPABILITIES.ConstraintTypes].sort()).toEqual(
      ['boolean', 'date', 'enum', 'freetext', 'lookup', 'money', 'numeric']
    );
  });

  it('names every target mode', () => {
    expect([...LLM_FEATURE_PIPELINE_CAPABILITIES.TargetModes].sort()).toEqual(['child', 'field', 'tags']);
  });

  it('produces reasoning but not confidence, with no output limit', () => {
    expect(LLM_FEATURE_PIPELINE_CAPABILITIES.ProducesReasoning).toBe(true);
    expect(LLM_FEATURE_PIPELINE_CAPABILITIES.ProducesConfidence).toBe(false);
    expect(LLM_FEATURE_PIPELINE_CAPABILITIES.MaxOutputs).toBeUndefined();
  });

  it('is frozen, so no caller can change the shared constant', () => {
    expect(Object.isFrozen(LLM_FEATURE_PIPELINE_CAPABILITIES)).toBe(true);
    expect(Object.isFrozen(LLM_FEATURE_PIPELINE_CAPABILITIES.ConstraintTypes)).toBe(true);
    expect(Object.isFrozen(LLM_FEATURE_PIPELINE_CAPABILITIES.TargetModes)).toBe(true);
  });
});
