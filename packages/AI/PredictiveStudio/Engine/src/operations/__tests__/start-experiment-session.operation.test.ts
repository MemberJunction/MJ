import { describe, it, expect } from 'vitest';
import type { PredictiveStudioStartExperimentSessionInput } from '@memberjunction/core-entities';
import { ExperimentSessions } from '@memberjunction/predictive-studio-core';

import { PredictiveStudioStartExperimentSessionServerOperation } from '../start-experiment-session.operation';
import { CapturingContext } from './helpers';

/** An approved, schema-valid plan: the operation must refuse it while sessions are switched off. */
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

  it('refuses with EXPERIMENT_SESSIONS_UNAVAILABLE before validating the plan, so an unapproved plan gets the same code', async () => {
    const result = await new PredictiveStudioStartExperimentSessionServerOperation().ExecuteServer(
      { planSpec: { ...approvedPlan(), Approved: false } },
      new CapturingContext(),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('EXPERIMENT_SESSIONS_UNAVAILABLE');
  });

  it('refuses a missing plan with EXPERIMENT_SESSIONS_UNAVAILABLE', async () => {
    const result = await new PredictiveStudioStartExperimentSessionServerOperation().ExecuteServer({ planSpec: undefined }, new CapturingContext());
    expect(result.ResultCode).toBe('EXPERIMENT_SESSIONS_UNAVAILABLE');
  });

  it('emits no progress before refusing', async () => {
    const ctx = new CapturingContext();
    await new PredictiveStudioStartExperimentSessionServerOperation().ExecuteServer({ planSpec: approvedPlan() }, ctx);
    expect(ctx.Progress).toHaveLength(0);
  });
});
