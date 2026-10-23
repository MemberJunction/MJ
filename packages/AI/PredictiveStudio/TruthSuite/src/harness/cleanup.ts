import { RunView, type BaseEntity, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type {
  MJMLModelEntity,
  MJMLModelScoringBindingEntity,
  MJMLTrainingPipelineEntity,
  MJMLTrainingRunEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { HarnessModels } from './promote';

/** Removes the `PSTruth: … <RunID>` pipelines one run created, and everything hanging off them, through the entity layer. */
export class HarnessCleanup {
  /**
   * Delete the run's pipelines with their scoring bindings, training runs and models, children first (the FK order:
   * binding → model, training run → pipeline, model → pipeline). Every row is attempted; returns one line per row whose
   * `Delete()` failed (empty when all were removed).
   */
  public static async DeleteRunRecords(provider: IMetadataProvider, user: UserInfo, runId: string): Promise<string[]> {
    const pipelines = await HarnessCleanup.load<MJMLTrainingPipelineEntity>(provider, user, 'MJ: ML Training Pipelines',
      `Name LIKE 'PSTruth:%' AND Name LIKE '%${HarnessModels.EscapeLikePrefix(runId)}%'`);
    if (pipelines.length === 0) return [];
    const pipelineIn = HarnessCleanup.inList(pipelines.map((p) => p.ID));
    const models = await HarnessCleanup.load<MJMLModelEntity>(provider, user, 'MJ: ML Models', `PipelineID IN (${pipelineIn})`);
    const bindings = models.length === 0 ? [] : await HarnessCleanup.load<MJMLModelScoringBindingEntity>(provider, user,
      'MJ: ML Model Scoring Bindings', `MLModelID IN (${HarnessCleanup.inList(models.map((m) => m.ID))})`);
    const runs = await HarnessCleanup.load<MJMLTrainingRunEntity>(provider, user, 'MJ: ML Training Runs', `PipelineID IN (${pipelineIn})`);
    return [
      ...(await HarnessCleanup.deleteAll(bindings)),
      ...(await HarnessCleanup.deleteAll(runs)),
      ...(await HarnessCleanup.deleteAll(models)),
      ...(await HarnessCleanup.deleteAll(pipelines)),
    ];
  }

  /** `'id1','id2'` for an `IN (…)` filter. */
  private static inList(ids: string[]): string {
    return ids.map((id) => `'${EscapeSQLString(id)}'`).join(',');
  }

  /** The rows of `entityName` matching `filter`, as entity objects (Delete needs a loaded entity). */
  private static async load<T extends BaseEntity>(provider: IMetadataProvider, user: UserInfo, entityName: string, filter: string): Promise<T[]> {
    const res = await RunView.FromMetadataProvider(provider).RunView<T>(
      { EntityName: entityName, ExtraFilter: filter, ResultType: 'entity_object', IgnoreMaxRows: true, BypassCache: true },
      user,
    );
    if (!res.Success) throw new Error(`cleanup: reading ${entityName}: ${res.ErrorMessage}`);
    return res.Results;
  }

  /** Delete each row (one stage of the FK order, so the rows are independent and run in parallel); the failures. */
  private static async deleteAll(rows: BaseEntity[]): Promise<string[]> {
    const failures = await Promise.all(rows.map(async (row) => {
      if (await row.Delete()) return null;
      return `${row.EntityInfo.Name} ${row.PrimaryKey.ToString()}: ${row.LatestResult?.CompleteMessage || 'Delete() returned false'}`;
    }));
    return failures.filter((f): f is string => f !== null);
  }
}
