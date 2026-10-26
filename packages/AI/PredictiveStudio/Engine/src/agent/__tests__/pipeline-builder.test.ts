import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJMLModelEntity, MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { InvalidMajorityBaselineRuleError, type ModelingPlanSpec, type TrustVerdict } from '@memberjunction/predictive-studio-core';
import { PredictiveStudioPipelineBuilder, TournamentRanking, type TrainedCandidate } from '../pipeline-builder';
import { AsOfSettingHasNoEffectError } from '../../training/as-of-refusal';
import { ReadCapExceededError } from '../../feature-assembly/read-cap-error';

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

    // Every tournament candidate fails on NonExistentEntity; the one error names the candidates' (distinct) failure.
    expect(res.success).toBe(false);
    expect(res.errorMessage).toMatch(/^All proposed experiment candidates failed to train: Target entity 'NonExistentEntity' was not found/);
    expect(res.warnings).toBeDefined();
    // Although 3 candidates each had JobTitleNorm and EmbeddingCol, they must be deduplicated
    expect(res.warnings).toHaveLength(2);
    expect(res.warnings?.map((w) => w.FeatureName)).toEqual(['JobTitleNorm', 'EmbeddingCol']);
  });
});

describe('PredictiveStudioPipelineBuilder — tournament failures keep their reason (I3)', () => {
  const dummyUser = { Email: 'test@example.com' } as unknown as UserInfo;
  const mockProvider = { EntityByName: () => undefined, Entities: [] } as unknown as IMetadataProvider;

  it('reports the shared refusal when every candidate is refused the same way', async () => {
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
  });

  it('rethrows the first refusal when all candidates share its refusal class', () => {
    const first = new AsOfSettingHasNoEffectError('modeling-plan', 'column', null);
    const second = new AsOfSettingHasNoEffectError('modeling-plan', 'offset', null);
    expect(TournamentRanking.AllCandidatesFailed([first, second])).toBe(first);
  });

  it('lists the distinct messages when the candidates failed in different ways', () => {
    const refusal = ReadCapExceededError.ForTraining('Members', 10, 10, 50);
    const plain = new Error('sidecar unavailable');
    const combined = TournamentRanking.AllCandidatesFailed([refusal, plain, new Error('sidecar unavailable'), new InvalidMajorityBaselineRuleError('off')]);
    expect(combined).not.toBe(refusal);
    expect(combined.message).toBe(
      `All proposed experiment candidates failed to train: ${refusal.message} | sidecar unavailable | ${new InvalidMajorityBaselineRuleError('off').message}`,
    );
  });
});

describe('TournamentRanking — measured scores only (C1)', () => {
  const verdict = (value: number | null): TrustVerdict => ({
    grade: value === null ? 'Poor' : 'Good', score01: value ?? 0, oneLiner: '', explanation: '', canAct: value !== null,
    gateReason: null, headlineMetric: value === null ? null : { key: 'AUC', value }, unknown: value === null, WithheldReason: null,
    MajorityBaseline: null,
  });
  const candidate = (id: string, value: number | null): TrainedCandidate => ({
    Pipeline: { ID: `p-${id}` } as MJMLTrainingPipelineEntity,
    Model: { ID: id } as MJMLModelEntity,
    Trust: verdict(value),
    LeakageFlagged: false,
    AlgorithmName: id,
    FeatureSetName: 'all',
  });

  it('ranks measured candidates by headline metric and unmeasured ones last', () => {
    const ranked = TournamentRanking.Rank([candidate('unmeasured', null), candidate('low', 0.7), candidate('high', 0.85)]);
    expect(ranked.map((c) => c.AlgorithmName)).toEqual(['high', 'low', 'unmeasured']);
    const rows = TournamentRanking.Leaderboard(ranked);
    expect(rows.map((r) => [r.score, r.metricName, r.isWinner])).toEqual([[0.85, 'AUC', true], [0.7, 'AUC', false], [null, null, false]]);
    expect(rows[2].Metric).toBeNull();
  });

  it('marks no winner when no candidate was measured', () => {
    const rows = TournamentRanking.Leaderboard(TournamentRanking.Rank([candidate('a', null), candidate('b', null)]));
    expect(rows.map((r) => r.algorithm)).toEqual(['a', 'b']);
    expect(rows.some((r) => r.isWinner)).toBe(false);
  });
});
