import { EntityFieldTSType, RunView, type EntityInfo, type UserInfo } from '@memberjunction/core';
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MetadataEntityFactory, PipelineMigration } from '@memberjunction/predictive-studio';
import {
  DOMINANCE_THRESHOLD_DEFAULT,
  TIME_INDEX_HOLD_REASON,
  UtcDay,
  type CandidateFeatureKind,
  type FeatureStepGraph,
  type OneHotFeatureStep,
  type SelectFeatureStep,
} from '@memberjunction/predictive-studio-core';
import { ContainmentProbe } from './containment-probe';
import type { PipelineSpec } from './types';

export interface AlgorithmRow {
  ID: string;
  Name: string;
  DriverClass: string;
}

/** The harness's pipeline members. */
export class HarnessPipelines {
  /** Load all `MJ: ML Algorithms` rows from the provider. */
  public static async LoadAlgorithms(provider: GraphQLDataProvider, user: UserInfo): Promise<AlgorithmRow[]> {
    const res = await RunView.FromMetadataProvider(provider).RunView<AlgorithmRow>(
      { EntityName: 'MJ: ML Algorithms', Fields: ['ID', 'Name', 'DriverClass'], ResultType: 'simple' },
      user,
    );
    if (!res.Success) throw new Error(`load algorithms: ${res.ErrorMessage}`);
    return res.Results;
  }

  /** A feature's kind from its entity field: string fields are categorical, every other type numeric. */
  public static FeatureKind(entity: EntityInfo, name: string): CandidateFeatureKind {
    const f = entity.Fields.find((x) => x.Name.toLowerCase() === name.toLowerCase());
    if (!f) throw new Error(`feature '${name}' is not a field of '${entity.Name}'`);
    return f.TSType === EntityFieldTSType.String ? 'categorical' : 'numeric';
  }

  /** The suite's feature graph: select the features, then one-hot encode each categorical one. */
  private static featureSteps(entity: EntityInfo, features: string[]): FeatureStepGraph {
    const select: SelectFeatureStep = { Id: 'select-raw', Kind: 'select', Columns: features };
    const onehots = features
      .filter((f) => HarnessPipelines.FeatureKind(entity, f) === 'categorical')
      .map((c): OneHotFeatureStep => ({ Id: `onehot-${c}`, Kind: 'onehot', Column: c }));
    return { Steps: [select, ...onehots] };
  }

  /**
   * Creates and saves a truth-suite pipeline from a spec; throws with the save's message when it fails. A pipeline
   * without an as-of (`AsOf.Mode === 'none'`) is then given version 1 of its Prediction Unit and Evaluation Protocol by
   * the pipeline migration, as every existing pipeline is, so it trains on the unit path. A pipeline that declares a time
   * index is held by the migration (no unit, the held line in its Description) and stays unbound: G0.11 measures that it
   * is refused. Any other outcome than `migrated` or that hold is a harness error, never a measured outcome. A pipeline
   * with an as-of stays unbound on purpose: G0.8 measures that it is refused (`UNIT_REQUIRED`).
   */
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
    if (spec.TimeIndexColumn !== undefined) {
      ContainmentProbe.ApplyTimeIndexDeclaration(p, spec.TimeIndexColumn);
    }
    if (!(await p.Save())) throw new Error(`pipeline save failed: ${p.LatestResult?.CompleteMessage || 'no message'}`);
    if (spec.AsOf.Mode === 'none') await HarnessPipelines.migrate(provider, user, p);
    return p;
  }

  /** Binds version 1 of the pipeline's unit and protocol through the pipeline migration; throws unless it migrated. */
  private static async migrate(provider: GraphQLDataProvider, user: UserInfo, p: MJMLTrainingPipelineEntity): Promise<void> {
    const deps = { Provider: provider, User: user, EntityFactory: new MetadataEntityFactory(provider), Today: UtcDay.UtcDayIso(new Date()) };
    const row = await PipelineMigration.EnsurePipelineUnitAndProtocol(p, deps, false);
    if (row.Action === 'held' && row.Reason === TIME_INDEX_HOLD_REASON) return;
    if (row.Action !== 'migrated') throw new Error(`pipeline ${p.Name}: the migration ${row.Action} it (${row.Reason || 'no reason'}), so it cannot train under a unit`);
  }
}
