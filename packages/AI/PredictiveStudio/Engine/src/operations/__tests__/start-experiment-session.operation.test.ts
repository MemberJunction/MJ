import { describe, it, expect } from 'vitest';
import type { PredictiveStudioStartExperimentSessionInput } from '@memberjunction/core-entities';
import { ExperimentSessions } from '@memberjunction/predictive-studio-core';

import { PredictiveStudioStartExperimentSessionServerOperation } from '../start-experiment-session.operation';
import { CapturingContext } from './helpers';

/** An approved, schema-valid plan, so the operation gets past plan validation to the switched-off delegate. */
function approvedPlan(): PredictiveStudioStartExperimentSessionInput['planSpec'] {
  return {
    Goal: 'Predict member churn',
    TargetDefinition: { EntityName: 'Members', TargetVariable: 'Churned', ProblemType: 'classification', SuccessMetric: 'AUC' },
    CandidateSources: [],
    CandidateFeatures: [],
    LeakageNotes: [],
    ProposedExperiments: [{ Label: 'xgb-baseline', AlgorithmName: 'xgboost', FeatureSet: ['tenure'], Rationale: 'baseline', Priority: 1 }],
    ValidationStrategy: { Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.1 },
    ProposedBudget: { MaxRuns: 5 },
    Approved: true,
  };
}

describe('PredictiveStudioStartExperimentSessionServerOperation — refusal codes', () => {
  it('returns EXPERIMENT_SESSIONS_UNAVAILABLE (the Run Experiment Session action\'s code) while sessions are switched off', async () => {
    const ctx = new CapturingContext();
    const result = await new PredictiveStudioStartExperimentSessionServerOperation().ExecuteServer({ planSpec: approvedPlan() }, ctx);
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('EXPERIMENT_SESSIONS_UNAVAILABLE');
    expect(result.ErrorMessage).toBe(ExperimentSessions.DisabledReason);
  });

  it('keeps EXECUTION_ERROR for a plain failure such as an unapproved plan', async () => {
    const result = await new PredictiveStudioStartExperimentSessionServerOperation().ExecuteServer(
      { planSpec: { ...approvedPlan(), Approved: false } },
      new CapturingContext(),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('EXECUTION_ERROR');
  });
});
