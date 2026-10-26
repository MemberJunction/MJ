import type { EntityInfo } from '@memberjunction/core';
import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';
import { HarnessPipelines } from './pipelines';
import type { AlgorithmKey } from './types';

export interface AgentPlanInput {
  Name: string;
  Entity: EntityInfo;
  Target: string;
  Features: string[];
  Algorithms: AlgorithmKey[];
  DenyFields: string[];
}

/** Pure plan builder for the Pipeline Builder agent leg. */
export class AgentPlans {
  /** Build an approved `ModelingPlanSpec` with one experiment per algorithm in the given order. */
  public static Build(input: AgentPlanInput): ModelingPlanSpec {
    return {
      Name: input.Name,
      Goal: `Predictive Studio truth suite (safe to delete) — predict ${input.Target} on ${input.Entity.Name}`,
      TargetDefinition: {
        EntityName: input.Entity.Name,
        TargetVariable: input.Target,
        ProblemType: 'classification',
        SuccessMetric: 'AUC',
        AsOfStrategy: { Mode: 'none' },
      },
      CandidateSources: [{ Kind: 'Entity', Ref: input.Entity.Name, Why: 'the rows being predicted' }],
      CandidateFeatures: input.Features.map((f) => ({
        Name: f,
        SourceRef: input.Entity.Name,
        Kind: HarnessPipelines.FeatureKind(input.Entity, f),
        Why: 'observable on the row',
      })),
      LeakageNotes: input.DenyFields.map((f) => ({
        Field: f,
        Risk: 'identifier / world bookkeeping',
        Action: 'exclude' as const,
      })),
      ProposedExperiments: input.Algorithms.map((alg, i) => ({
        Label: alg,
        AlgorithmName: alg,
        FeatureSet: input.Features,
        Rationale: 'truth harness',
        Priority: i + 1,
      })),
      ValidationStrategy: { Strategy: 'train_test_split', LockedHoldoutFraction: 0.2 },
      ProposedBudget: {},
      Approved: true,
    };
  }
}
