import { describe, it, expect } from 'vitest';
import { isErrorMetric } from '../index';
import type {
  TrainRequest,
  PredictResponse,
  FeatureStep,
  FeatureStepGraph,
  ModelingPlanSpec,
  SourceBinding,
  ValidationStrategy,
} from '../index';

describe('isErrorMetric', () => {
  it('flags lower-is-better error metrics (case/whitespace-insensitive)', () => {
    for (const m of ['rmse', 'RMSE', ' mae ', 'mse', 'loss', 'logloss', 'log_loss']) {
      expect(isErrorMetric(m)).toBe(true);
    }
  });
  it('does NOT flag higher-is-better ranking metrics', () => {
    for (const m of ['roc_auc', 'auc', 'f1', 'accuracy', 'r2', 'explained_variance']) {
      expect(isErrorMetric(m)).toBe(false);
    }
  });
});

/**
 * Structural sanity tests for the Predictive Studio core contracts. These are
 * type-level checks materialized as runtime objects — if the exported shapes
 * drift in a breaking way, these literals stop compiling (the real guard) and
 * the assertions document the intended structure.
 */
describe('predictive-studio-core contracts', () => {
  it('TrainRequest accepts an inline-matrix training request', () => {
    const req: TrainRequest = {
      algorithm: 'xgboost',
      problem_type: 'classification',
      hyperparameters: { max_depth: 6 },
      validation: { strategy: 'train_test_split', test_size: 0.2 },
      feature_schema: [
        { Name: 'tenure', Kind: 'numeric' },
        { Name: 'city', Kind: 'categorical' },
        { Name: 'emb_0', Kind: 'embedding' },
      ],
      preprocessing: [
        { op: 'impute', col: 'tenure', strategy: 'mean' },
        { op: 'onehot', col: 'city' },
      ],
      target: 'renewed',
      data: { columns: ['tenure', 'city', 'emb_0', 'renewed'], rows: [[3, 'NYC', 0.12, 1]] },
    };

    expect(req.algorithm).toBe('xgboost');
    expect(req.feature_schema).toHaveLength(3);
    expect(req.data?.rows[0]).toHaveLength(4);
  });

  it('PredictResponse aligns predictions positionally', () => {
    const resp: PredictResponse = {
      predictions: [
        { score: 0.83, class: 'renew' },
        { score: 0.21, class: 'lapse' },
      ],
    };
    expect(resp.predictions[0].score).toBeGreaterThan(resp.predictions[1].score);
  });

  it('FeatureStepGraph is a DAG keyed by step Inputs', () => {
    const select: FeatureStep = { Id: 's1', Kind: 'select', Columns: ['tenure'] };
    const standardize: FeatureStep = { Id: 's2', Kind: 'standardize', Inputs: ['s1'], Columns: ['tenure'] };
    const flow: FeatureStep = {
      Id: 's3',
      Kind: 'flow-agent',
      Inputs: ['s1'],
      FlowAgentRef: 'Engagement Scorer',
      InputMapping: { memberId: 'ID' },
      OutputMapping: { engagement: 'result.score' },
    };
    const graph: FeatureStepGraph = { Steps: [select, standardize, flow] };

    expect(graph.Steps).toHaveLength(3);
    expect(graph.Steps[1].Inputs).toEqual(['s1']);
    // discriminated-union narrowing works on Kind
    const s = graph.Steps.find((x) => x.Kind === 'flow-agent');
    expect(s && s.Kind === 'flow-agent' && s.FlowAgentRef).toBe('Engagement Scorer');
  });

  it('SourceBinding + ValidationStrategy compose into a ModelingPlanSpec', () => {
    const source: SourceBinding = { Kind: 'Query', Ref: 'Active Members', Alias: 'm' };
    const validation: ValidationStrategy = { Strategy: 'kfold', K: 5, LockedHoldoutFraction: 0.1 };

    const plan: ModelingPlanSpec = {
      Goal: 'Predict member renewal',
      TargetDefinition: {
        EntityName: 'Members',
        TargetVariable: 'Renewed',
        ProblemType: 'classification',
        SuccessMetric: 'AUC',
        AsOfStrategy: { Mode: 'offset', OffsetDays: 90 },
      },
      CandidateSources: [{ Kind: source.Kind, Ref: source.Ref, Why: 'ground-truth membership facts' }],
      CandidateFeatures: [{ Name: 'tenure', SourceRef: source.Ref, Kind: 'numeric', Why: 'longer tenure renews more' }],
      LeakageNotes: [{ Field: 'RenewalDate', Risk: 'post-outcome', Action: 'exclude' }],
      ProposedExperiments: [
        { Label: 'XGB baseline', AlgorithmName: 'xgboost', FeatureSet: ['tenure'], Rationale: 'strong default', Priority: 1 },
      ],
      ValidationStrategy: { Strategy: validation.Strategy, K: validation.K, LockedHoldoutFraction: validation.LockedHoldoutFraction },
      ProposedBudget: { MaxRuns: 20, MaxWallclockMinutes: 30 },
      Approved: false,
    };

    expect(plan.TargetDefinition.AsOfStrategy?.Mode).toBe('offset');
    expect(plan.ValidationStrategy.K).toBe(5);
    expect(plan.ProposedExperiments[0].AlgorithmName).toBe('xgboost');
  });
});
