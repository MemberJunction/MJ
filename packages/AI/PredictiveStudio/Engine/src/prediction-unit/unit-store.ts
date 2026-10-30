/**
 * @module prediction-unit/unit-store
 *
 * Loading unit versions for training, and writing a unit onto a pipeline (the legacy TargetEntityID/TargetVariable/
 * ProblemType columns are derived from the unit and checked by the pipeline's ValidateAsync).
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type { MJMLTrainingPipelineEntity, MJPredictionUnitEntity } from '@memberjunction/core-entities';
import { PredictionUnit, TaskTypeRules, type PredictionUnitSpec } from '@memberjunction/predictive-studio-core';
import type { IAssemblyMetadata } from '../feature-assembly/assembly-metadata';

/** Reads unit versions by ID and by lineage. */
export interface IPredictionUnitStore {
  Load(unitId: string): Promise<MJPredictionUnitEntity | null>;
  LatestVersion(lineageRootId: string): Promise<MJPredictionUnitEntity | null>;
}

/** Reads unit versions through the request's provider (never the global one, so each request reads its own connection). */
export class RunViewPredictionUnitStore implements IPredictionUnitStore {
  private readonly runView: RunView;
  constructor(provider: IMetadataProvider, private readonly contextUser?: UserInfo) {
    this.runView = RunView.FromMetadataProvider(provider);
  }

  /** The unit version with this ID, or null. */
  public async Load(unitId: string): Promise<MJPredictionUnitEntity | null> {
    const r = await this.runView.RunView<MJPredictionUnitEntity>({ EntityName: 'MJ: Prediction Units', ExtraFilter: `ID='${EscapeSQLString(unitId)}'`, ResultType: 'entity_object' }, this.contextUser);
    if (!r.Success) throw new Error(`Loading Prediction Unit ${unitId} failed: ${r.ErrorMessage}`);
    return r.Results[0] || null;
  }

  /** The highest Version of a lineage, or null. */
  public async LatestVersion(lineageRootId: string): Promise<MJPredictionUnitEntity | null> {
    const r = await this.runView.RunView<MJPredictionUnitEntity>({ EntityName: 'MJ: Prediction Units', ExtraFilter: `LineageRootID='${EscapeSQLString(lineageRootId)}'`, OrderBy: 'Version DESC', MaxRows: 1, ResultType: 'entity_object' }, this.contextUser);
    if (!r.Success) throw new Error(`Loading the latest version of ${lineageRootId} failed: ${r.ErrorMessage}`);
    return r.Results[0] || null;
  }

  /** Point a pipeline at a unit version and derive its legacy target columns. */
  public static ApplyUnitToPipeline(pipeline: MJMLTrainingPipelineEntity, unitId: string, spec: PredictionUnitSpec, metadata: IAssemblyMetadata): void {
    const rowEntity = metadata.Entity(PredictionUnit.UnitRowEntityName(spec.rows));
    if (!rowEntity) throw new Error(`Prediction Unit row entity "${PredictionUnit.UnitRowEntityName(spec.rows)}" is not registered`);
    pipeline.PredictionUnitID = unitId;
    pipeline.TargetEntityID = rowEntity.ID;
    pipeline.TargetVariable = PredictionUnit.DescribeLabelRule(spec);
    pipeline.ProblemType = TaskTypeRules.LegacyProblemTypeForTask(spec.label.outcome);
  }
}
