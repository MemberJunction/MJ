import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';
import { PredictiveStudioPipelineBuilder } from '../pipeline-builder';
import { ConsoleCapture } from '../../__tests__/fakes/console-capture';

describe('PredictiveStudioPipelineBuilder warnings and error handling', () => {
  const dummyUser = { Email: 'test@example.com' } as unknown as UserInfo;
  const mockProvider = {
    EntityByName: () => undefined,
    Entities: [],
  } as unknown as IMetadataProvider;

  it('preserves warnings on failure path when pipeline creation fails', async () => {
    const errors = ConsoleCapture.Errors();
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

    const res = await builder.Build({
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
    expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringContaining("PredictiveStudioPipelineBuilder.build failed: Target entity 'NonExistentEntity' was not found in metadata.")]);
  });

  it('records each warning once across the search candidates', async () => {
    const errors = ConsoleCapture.Errors();
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

    const res = await builder.Build({
      spec,
      provider: mockProvider,
      user: dummyUser,
    });

    // The one pipeline of the search fails on NonExistentEntity before any row is written.
    expect(res.success).toBe(false);
    expect(res.errorMessage).toMatch(/^Target entity 'NonExistentEntity' was not found/);
    expect(res.warnings).toBeDefined();
    // Although 3 candidates each had JobTitleNorm and EmbeddingCol, each warning is recorded once
    expect(res.warnings).toHaveLength(2);
    expect(res.warnings?.map((w) => w.FeatureName)).toEqual(['JobTitleNorm', 'EmbeddingCol']);
    expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringContaining("PredictiveStudioPipelineBuilder.build failed: Target entity 'NonExistentEntity' was not found in metadata.")]);
  });
});

describe('PredictiveStudioPipelineBuilder — a refused build keeps its reason', () => {
  const dummyUser = { Email: 'test@example.com' } as unknown as UserInfo;
  const mockProvider = { EntityByName: () => undefined, Entities: [] } as unknown as IMetadataProvider;

  it('reports the refusal of the one training run with its type and sentence', async () => {
    const errors = ConsoleCapture.Errors();
    const spec: ModelingPlanSpec = {
      Goal: 'Predict cancellations',
      TargetDefinition: { EntityName: 'Members', TargetVariable: 'Status', ProblemType: 'classification', SuccessMetric: 'AUC', AsOfStrategy: { Mode: 'column', Column: 'JoinDate' } },
      CandidateSources: [],
      CandidateFeatures: [],
      LeakageNotes: [],
      ProposedExperiments: [
        { Label: 'A', AlgorithmName: 'random_forest', FeatureSet: [], Rationale: 'a', Priority: 1 },
        { Label: 'B', AlgorithmName: 'xgboost', FeatureSet: [], Rationale: 'b', Priority: 2 },
      ],
      ValidationStrategy: { Strategy: 'holdout', LockedHoldoutFraction: 0.2 },
      ProposedBudget: {},
    };
    const res = await new PredictiveStudioPipelineBuilder().Build({ spec, provider: mockProvider, user: dummyUser });
    expect(res.success).toBe(false);
    expect(res.errorMessage).toMatch(/^Training refused: the modeling plan's TargetDefinition\.AsOfStrategy \(Mode='column'\)/);
    const logged = ConsoleCapture.Lines(errors);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatch(/^PredictiveStudioPipelineBuilder\.build failed: Training refused: the modeling plan's TargetDefinition\.AsOfStrategy/);
  });
});
