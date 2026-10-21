import { EntityFieldTSType, type EntityInfo } from '@memberjunction/core';
import type { CandidateFeatureKind, ModelingPlanSpec } from '@memberjunction/predictive-studio-core';
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
  private static featureKind(entity: EntityInfo, name: string): CandidateFeatureKind {
    const f = entity.Fields.find((x) => x.Name.toLowerCase() === name.toLowerCase());
    if (!f) throw new Error(`feature '${name}' is not a field of '${entity.Name}'`);
    return f.TSType === EntityFieldTSType.String ? 'categorical' : 'numeric';
  }

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
        Kind: AgentPlans.featureKind(input.Entity, f),
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
