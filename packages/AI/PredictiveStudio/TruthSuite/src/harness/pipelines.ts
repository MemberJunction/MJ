import { EntityFieldTSType, RunView, type EntityInfo, type UserInfo } from '@memberjunction/core';
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { DOMINANCE_THRESHOLD_DEFAULT, type CandidateFeatureKind } from '@memberjunction/predictive-studio-core';
import { ContainmentProbe } from './containment-probe';
import type { PipelineSpec } from './types';

export interface AlgorithmRow {
  ID: string;
  Name: string;
  DriverClass: string;
}

/** The harness's pipeline members. */
export class HarnessPipelines {
  private static lastTimeIndexDeclared = false;

  /** Load all `MJ: ML Algorithms` rows from the provider. */
  public static async LoadAlgorithms(provider: GraphQLDataProvider, user: UserInfo): Promise<AlgorithmRow[]> {
    const res = await RunView.FromMetadataProvider(provider).RunView<AlgorithmRow>(
      { EntityName: 'MJ: ML Algorithms', Fields: ['ID', 'Name', 'DriverClass'], ResultType: 'simple' },
      user,
    );
    if (!res.Success) throw new Error(`load algorithms: ${res.ErrorMessage}`);
    return res.Results;
  }

  private static featureKind(entity: EntityInfo, name: string): CandidateFeatureKind {
    const f = entity.Fields.find((x) => x.Name.toLowerCase() === name.toLowerCase());
    if (!f) throw new Error(`feature '${name}' is not a field of '${entity.Name}'`);
    return f.TSType === EntityFieldTSType.String ? 'categorical' : 'numeric';
  }

  private static featureSteps(
    entity: EntityInfo,
    features: string[],
  ): { Steps: Array<{ Id: string; Kind: 'select'; Columns: string[] } | { Id: string; Kind: 'onehot'; Column: string }> } {
    const cats = features.filter((f) => HarnessPipelines.featureKind(entity, f) === 'categorical');
    return {
      Steps: [
        { Id: 'select-raw', Kind: 'select', Columns: features },
        ...cats.map((c) => ({ Id: `onehot-${c}`, Kind: 'onehot' as const, Column: c })),
      ],
    };
  }

  /** Creates and saves a truth-suite pipeline from a spec; throws with the save's message when it fails. */
  public static async CreatePipeline(
    provider: GraphQLDataProvider,
    user: UserInfo,
    algos: readonly AlgorithmRow[],
    spec: PipelineSpec,
  ): Promise<MJMLTrainingPipelineEntity> {
    const algo = algos.find((a) => a.DriverClass === spec.Algorithm);
    if (!algo) throw new Error(`algorithm '${spec.Algorithm}' is not in MJ: ML Algorithms`);
    const p = await provider.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', user);
    p.NewRecord();
    p.Name = spec.Name;
    p.Description = 'Predictive Studio truth suite (safe to delete)';
    p.Version = 1;
    p.Status = 'Draft';
    p.TargetEntityID = spec.Dataset.Entity.ID;
    p.TargetVariable = spec.Target;
    p.ProblemType = spec.ProblemType;
    p.AlgorithmID = algo.ID;
    p.SourceBindings = JSON.stringify([{ Kind: 'Entity', Ref: spec.Dataset.Entity.Name }]);
    p.FeatureSteps = JSON.stringify(HarnessPipelines.featureSteps(spec.Dataset.Entity, spec.Features));
    p.AsOfStrategy = JSON.stringify(spec.AsOf);
    p.LeakageGuard = JSON.stringify({
      DenyFields: spec.DenyFields,
      SingleFeatureDominanceThreshold: DOMINANCE_THRESHOLD_DEFAULT,
    });
    p.ValidationStrategy = JSON.stringify(spec.Validation);
    // The time-index declaration is applied before the single Save, so it is saved with the pipeline (G0.11).
    HarnessPipelines.lastTimeIndexDeclared =
      spec.TimeIndexColumn !== undefined && ContainmentProbe.ApplyTimeIndexDeclaration(p, spec.TimeIndexColumn);
    if (!(await p.Save())) throw new Error(`pipeline save failed: ${p.LatestResult?.CompleteMessage || 'no message'}`);
    return p;
  }

  /** What the time-index declaration answered for the last CreatePipeline (TruthHarness.LastTimeIndexDeclared). */
  public static LastTimeIndexDeclared(): boolean {
    return HarnessPipelines.lastTimeIndexDeclared;
  }
}
