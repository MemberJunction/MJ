import { RunView, type BaseEntity, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDSet } from '@memberjunction/global';
import type { TruthHarness } from './types';

/**
 * The pipelines and models one harness created or observed, by ID: the pipelines it created, the models its trainings
 * produced, and the pipelines and models of the agent runs it read back. Cleanup deletes exactly these.
 */
export class RunRecords {
  public readonly PipelineIDs = new UUIDSet();
  public readonly ModelIDs = new UUIDSet();

  /** Record a pipeline the run created (or an agent run of it created). */
  public RecordPipeline(id: string): void {
    this.PipelineIDs.Add(id);
  }

  /** Record a model the run trained (or an agent run of it built). */
  public RecordModel(id: string): void {
    this.ModelIDs.Add(id);
  }

  /** `h` with every member that creates or reads back run pipelines/models recording their IDs here. */
  public Recording(h: TruthHarness): TruthHarness {
    return {
      ...h,
      CreatePipeline: async (spec) => {
        const p = await h.CreatePipeline(spec);
        this.RecordPipeline(p.ID);
        return p;
      },
      Train: async (pipeline, opts) => {
        const t = await h.Train(pipeline, opts);
        if (t.ModelID) this.RecordModel(t.ModelID);
        return t;
      },
      RunBuilderAgent: async (plan) => {
        const r = await h.RunBuilderAgent(plan);
        if (r.BuildModelID) this.RecordModel(r.BuildModelID);
        return r;
      },
      ModelsForPipelineNamePrefix: async (prefix) => {
        const models = await h.ModelsForPipelineNamePrefix(prefix);
        for (const m of models) {
          this.RecordModel(m.ModelID);
          this.RecordPipeline(m.PipelineID);
        }
        return models;
      },
    };
  }
}

/** A row cleanup deletes: its key, `Delete()`, and the result a failed delete leaves. */
export type CleanupRow = Pick<BaseEntity, 'Delete' | 'LatestResult'> & { readonly ID: string };

/** A model row: a cleanup row with the pipeline it belongs to. */
export type CleanupModelRow = CleanupRow & Pick<MJMLModelEntity, 'PipelineID'>;

/** Where cleanup reads the rows it deletes (the entity layer in a run; a fake in a unit test). */
export interface CleanupStore {
  Models(filter: string): Promise<CleanupModelRow[]>;
  Rows(entityName: string, filter: string): Promise<CleanupRow[]>;
}

/** Deletes the pipelines and models a run recorded, and everything hanging off them, through the entity layer. */
export class HarnessCleanup {
  /** The entity-layer store on `provider` as `user`. */
  public static EntityStore(provider: IMetadataProvider, user: UserInfo): CleanupStore {
    return {
      Models: (filter) => HarnessCleanup.load<MJMLModelEntity>(provider, user, 'MJ: ML Models', filter),
      Rows: (entityName, filter) => HarnessCleanup.load<BaseEntity & { ID: string }>(provider, user, entityName, filter),
    };
  }

  /**
   * Delete the recorded models (and every model trained from a recorded pipeline) and the recorded pipelines (and the
   * pipelines of recorded models), children first: scoring bindings and training runs, then models, then pipelines.
   * Every row is attempted; deleted IDs leave `records`. Returns one line per row whose `Delete()` failed.
   */
  public static async DeleteRecorded(store: CleanupStore, records: RunRecords): Promise<string[]> {
    const modelFilter = HarnessCleanup.anyIn([['ID', records.ModelIDs], ['PipelineID', records.PipelineIDs]]);
    const models = modelFilter ? await store.Models(modelFilter) : [];
    const modelIds = new UUIDSet(models.map((m) => m.ID));
    const pipelineIds = new UUIDSet([...records.PipelineIDs, ...models.map((m) => m.PipelineID)]);
    const bindingFilter = HarnessCleanup.anyIn([['MLModelID', modelIds]]);
    const runFilter = HarnessCleanup.anyIn([['PipelineID', pipelineIds], ['ResultingModelID', modelIds]]);
    const pipelineFilter = HarnessCleanup.anyIn([['ID', pipelineIds]]);
    const bindings = bindingFilter ? await store.Rows('MJ: ML Model Scoring Bindings', bindingFilter) : [];
    const runs = runFilter ? await store.Rows('MJ: ML Training Runs', runFilter) : [];
    const pipelines = pipelineFilter ? await store.Rows('MJ: ML Training Pipelines', pipelineFilter) : [];
    const failures = [
      ...(await HarnessCleanup.deleteAll('MJ: ML Model Scoring Bindings', bindings)),
      ...(await HarnessCleanup.deleteAll('MJ: ML Training Runs', runs)),
      ...(await HarnessCleanup.deleteAll('MJ: ML Models', models, (id) => records.ModelIDs.Delete(id))),
      ...(await HarnessCleanup.deleteAll('MJ: ML Training Pipelines', pipelines, (id) => records.PipelineIDs.Delete(id))),
    ];
    return failures;
  }

  /** `Col IN ('a','b') OR Other IN (…)` over the non-empty ID sets; null when every set is empty. */
  private static anyIn(clauses: Array<[string, UUIDSet]>): string | null {
    const parts = clauses
      .filter(([, ids]) => ids.Size > 0)
      .map(([column, ids]) => `${column} IN (${[...ids].map((id) => `'${EscapeSQLString(id)}'`).join(',')})`);
    return parts.length > 0 ? parts.join(' OR ') : null;
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
  private static async deleteAll(entityName: string, rows: CleanupRow[], onDeleted: (id: string) => void = () => undefined): Promise<string[]> {
    const failures = await Promise.all(rows.map(async (row) => {
      if (await row.Delete()) {
        onDeleted(row.ID);
        return null;
      }
      return `${entityName} ${row.ID}: ${row.LatestResult?.CompleteMessage || 'Delete() returned false'}`;
    }));
    return failures.filter((f): f is string => f !== null);
  }
}
