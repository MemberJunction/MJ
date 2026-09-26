import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';
import { PredictiveStudioPipelineBuilder } from '../pipeline-builder';

describe('PredictiveStudioPipelineBuilder warnings and error handling', () => {
  const dummyUser = { Email: 'test@example.com' } as unknown as UserInfo;
  const mockProvider = {
    EntityByName: () => undefined,
    Entities: [],
  } as unknown as IMetadataProvider;

  it('preserves warnings on failure path when pipeline creation fails', async () => {
    const builder = new PredictiveStudioPipelineBuilder();
    const spec: ModelingPlanSpec = {
      Goal: 'Predict cancellations',
      TargetDefinition: {
        EntityName: 'NonExistentEntity',
        TargetVariable: 'Status',
        ProblemType: 'classification',
        SuccessMetric: 'AUC',
      },
      CandidateSources: [{ Kind: 'Entity', Ref: 'NonExistentEntity', Why: 'test' }],
      CandidateFeatures: [
        { Name: 'JobTitleNorm', SourceRef: 'NonExistentEntity', Kind: 'llm-derived', Why: 'unmapped' },
        { Name: 'Age', SourceRef: 'NonExistentEntity', Kind: 'numeric', Why: 'raw' },
      ],
      LeakageNotes: [],
      ProposedExperiments: [
        { Label: 'Exp1', AlgorithmName: 'random_forest', FeatureSet: [], Rationale: 'test', Priority: 1 },
      ],
      ValidationStrategy: { Strategy: 'holdout', LockedHoldoutFraction: 0.2 },
      ProposedBudget: {},
    };

    const res = await builder.build({
      spec,
      provider: mockProvider,
      user: dummyUser,
    });

    expect(res.success).toBe(false);
    expect(res.errorMessage).toContain('NonExistentEntity');
    expect(res.warnings).toBeDefined();
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings?.[0]).toEqual({
      FeatureName: 'JobTitleNorm',
      Kind: 'llm-derived',
      Reason: expect.stringMatching(/upstream Feature Pipeline/),
    });
  });

  it('deduplicates warnings across tournament candidate experiments', async () => {
    const builder = new PredictiveStudioPipelineBuilder();
    const spec: ModelingPlanSpec = {
      Goal: 'Predict cancellations',
      TargetDefinition: {
        EntityName: 'NonExistentEntity',
        TargetVariable: 'Status',
        ProblemType: 'classification',
        SuccessMetric: 'AUC',
      },
      CandidateSources: [{ Kind: 'Entity', Ref: 'NonExistentEntity', Why: 'test' }],
      CandidateFeatures: [
        { Name: 'JobTitleNorm', SourceRef: 'NonExistentEntity', Kind: 'llm-derived', Why: 'unmapped' },
        { Name: 'EmbeddingCol', SourceRef: 'NonExistentEntity', Kind: 'embedding', Why: 'unmapped' },
        { Name: 'Age', SourceRef: 'NonExistentEntity', Kind: 'numeric', Why: 'raw' },
      ],
      LeakageNotes: [],
      ProposedExperiments: [
        { Label: 'Exp1', AlgorithmName: 'random_forest', FeatureSet: ['JobTitleNorm', 'EmbeddingCol', 'Age'], Rationale: 'test1', Priority: 1 },
        { Label: 'Exp2', AlgorithmName: 'logistic_regression', FeatureSet: ['JobTitleNorm', 'EmbeddingCol', 'Age'], Rationale: 'test2', Priority: 2 },
        { Label: 'Exp3', AlgorithmName: 'xgboost', FeatureSet: ['JobTitleNorm', 'EmbeddingCol', 'Age'], Rationale: 'test3', Priority: 3 },
      ],
      ValidationStrategy: { Strategy: 'holdout', LockedHoldoutFraction: 0.2 },
      ProposedBudget: {},
    };

    const res = await builder.build({
      spec,
      provider: mockProvider,
      user: dummyUser,
    });

    // The tournament candidates fail on NonExistentEntity, then the method catches "All proposed experiment candidates failed to train."
    expect(res.success).toBe(false);
    expect(res.warnings).toBeDefined();
    // Although 3 candidates each had JobTitleNorm and EmbeddingCol, they must be deduplicated
    expect(res.warnings).toHaveLength(2);
    expect(res.warnings?.map((w) => w.FeatureName)).toEqual(['JobTitleNorm', 'EmbeddingCol']);
  });
});
