import { describe, it, expect } from 'vitest';
import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';
import { modelingPlanToPipelineConfig } from '../modeling-plan-to-pipeline';

/**
 * The mapper is the deterministic heart of the agent's builder — it turns the conversation-accumulated
 * plan into the exact pipeline metadata. These tests pin that translation so the structure committed to
 * the database is correct and never depends on the LLM.
 */
function baseSpec(overrides: Partial<ModelingPlanSpec> = {}): ModelingPlanSpec {
  return {
    Goal: 'Predict which members are likely to not renew this year',
    TargetDefinition: { EntityName: 'Memberships', TargetVariable: 'Status', ProblemType: 'classification', SuccessMetric: 'AUC' },
    CandidateSources: [{ Kind: 'Entity', Ref: 'Memberships', Why: 'the membership records' }],
    CandidateFeatures: [
      { Name: 'AutoRenew', SourceRef: 'Memberships', Kind: 'numeric', Why: 'renewal intent' },
      { Name: 'MembershipType', SourceRef: 'Memberships', Kind: 'categorical', Why: 'segment' },
      { Name: 'TenureDays', SourceRef: 'Memberships', Kind: 'numeric', Why: 'loyalty' },
    ],
    LeakageNotes: [
      { Field: 'CancellationDate', Risk: 'leaks the outcome', Action: 'exclude' },
      { Field: 'AutoRenew', Risk: 'fine', Action: 'allow' },
    ],
    ProposedExperiments: [
      { Label: 'RF', AlgorithmName: 'random_forest', FeatureSet: ['AutoRenew', 'MembershipType'], Rationale: 'baseline', Priority: 2 },
      { Label: 'LR', AlgorithmName: 'logistic_regression', FeatureSet: ['AutoRenew', 'MembershipType'], Rationale: 'interpretable', Priority: 1 },
    ],
    ValidationStrategy: { Strategy: 'holdout', LockedHoldoutFraction: 0.2 },
    ProposedBudget: {},
    ...overrides,
  };
}

describe('modelingPlanToPipelineConfig', () => {
  it('maps the plan into a concrete, trainable pipeline configuration', () => {
    const cfg = modelingPlanToPipelineConfig(baseSpec());
    expect(cfg.targetEntityName).toBe('Memberships');
    expect(cfg.targetVariable).toBe('Status');
    expect(cfg.problemType).toBe('classification');
    expect(cfg.sourceBindings).toEqual([{ Kind: 'Entity', Ref: 'Memberships' }]);
    expect(cfg.asOf).toEqual({ Mode: 'none' });
    expect(cfg.validation).toEqual({ Strategy: 'holdout', TestSize: undefined, K: undefined, LockedHoldoutFraction: 0.2 });
  });

  it('chooses the highest-priority (lowest Priority number) experiment for the algorithm', () => {
    expect(modelingPlanToPipelineConfig(baseSpec()).algorithmName).toBe('logistic_regression'); // Priority 1 beats 2
  });

  it('builds the FeatureStep DAG: select the chosen raw columns + one-hot the categoricals', () => {
    const cfg = modelingPlanToPipelineConfig(baseSpec());
    // FeatureSet limits to AutoRenew + MembershipType (TenureDays excluded — not in the chosen experiment's set)
    expect(cfg.featureSteps.Steps).toEqual([
      { Id: 'select-raw', Kind: 'select', Columns: ['AutoRenew', 'MembershipType'] },
      { Id: 'onehot-MembershipType', Kind: 'onehot', Column: 'MembershipType' },
    ]);
  });

  it('uses ALL candidate features when the chosen experiment has no FeatureSet', () => {
    const spec = baseSpec({
      ProposedExperiments: [{ Label: 'all', AlgorithmName: 'random_forest', FeatureSet: [], Rationale: 'x', Priority: 1 }],
    });
    const cols = modelingPlanToPipelineConfig(spec).featureSteps.Steps.find((s) => s.Kind === 'select');
    expect(cols).toEqual({ Id: 'select-raw', Kind: 'select', Columns: ['AutoRenew', 'MembershipType', 'TenureDays'] });
  });

  it('denies only the fields the plan marked exclude (leakage guard)', () => {
    expect(modelingPlanToPipelineConfig(baseSpec()).leakageGuard).toEqual({
      DenyFields: ['CancellationDate'],
      SingleFeatureDominanceThreshold: 0.85,
    });
  });

  it('throws on a plan that cannot yield a trainable pipeline', () => {
    expect(() => modelingPlanToPipelineConfig(baseSpec({ TargetDefinition: { EntityName: '', TargetVariable: 'Status', ProblemType: 'classification', SuccessMetric: 'AUC' } }))).toThrow(/EntityName/);
    expect(() => modelingPlanToPipelineConfig(baseSpec({ ProposedExperiments: [] }))).toThrow(/ProposedExperiment/);
  });
});
