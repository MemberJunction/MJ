import { describe, it, expect } from 'vitest';
import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';
import { PredictiveStudioEngineVersion, isModelingPlanApproved } from '../index';

/**
 * Starter test for the Predictive Studio engine scaffold. Proves the dependency
 * on `@memberjunction/predictive-studio-core` is wired and builds, and exercises
 * the placeholder export.
 */
describe('predictive-studio engine scaffold', () => {
  it('exposes the engine version', () => {
    expect(PredictiveStudioEngineVersion).toBe('5.43.0');
  });

  it('reads the approval gate from a core ModelingPlanSpec', () => {
    const base: ModelingPlanSpec = {
      Goal: 'Predict renewal',
      TargetDefinition: { EntityName: 'Members', TargetVariable: 'Renewed', ProblemType: 'classification', SuccessMetric: 'AUC' },
      CandidateSources: [],
      CandidateFeatures: [],
      LeakageNotes: [],
      ProposedExperiments: [],
      ValidationStrategy: { Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.1 },
      ProposedBudget: { MaxRuns: 10 },
    };

    expect(isModelingPlanApproved(base)).toBe(false);
    expect(isModelingPlanApproved({ ...base, Approved: true })).toBe(true);
  });
});
