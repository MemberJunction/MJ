/**
 * Shared steps of the "Scoring" bundles (G5.2–G5.5, G3.9): a dataset's raw feature rows read through the client
 * provider (the rows a gate sends straight to the sidecar, beside the product's own scoring), a test binding's feature
 * name, and the in-process scoring of G5.5 with one assembled feature column emptied before the checks run.
 */
import { RunView, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString, UUIDMap } from '@memberjunction/global';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import {
  ScoringRunRecorder,
  ScoringSeamDefaults,
  ScoringService,
  type IScoringModelRuntime,
  type IScoringPreparedModel,
  type ScoringAssembly,
  type ScoringContext,
  type ScoringPrediction,
} from '@memberjunction/predictive-studio';
import type { ScoringScope } from '@memberjunction/predictive-studio-core';
import type { LoadedDataset, TruthHarness } from '@memberjunction/predictive-studio-truth-suite';
import type { MJMLModelEntity } from '@memberjunction/core-entities';

/** One raw row cell as `/predict` takes it. */
export type FeatureCell = string | number | boolean | null;
/** One raw row of a dataset, by column. */
export type FeatureRow = Record<string, FeatureCell>;

/** An assembly with one column emptied: the outcome, and whether the column was found. */
interface EmptiedAssembly {
  readonly Assembly: ScoringAssembly;
  readonly Found: boolean;
}

/**
 * A model runtime that prepares models with `inner` and, on every assembly, sets one matrix column to null on every
 * row: an all-null feature column in the scoring input, with the stored data untouched (G5.5). `Emptied` records
 * whether an assembly carried the column.
 */
export class EmptyColumnRuntime implements IScoringModelRuntime {
  /** True once an assembly carried the column and it was emptied. */
  public Emptied = false;

  /** @param inner the production runtime @param column the assembled column to empty */
  constructor(private readonly inner: IScoringModelRuntime, private readonly column: string) {}

  /** @inheritdoc */
  public async Prepare(model: MJMLModelEntity, bytes: Uint8Array, ctx: ScoringContext): Promise<IScoringPreparedModel> {
    const prepared = await this.inner.Prepare(model, bytes, ctx);
    return {
      Loaded: prepared.Loaded,
      Assemble: async (recordIds, keyField, asOf, entityName, call) => {
        const emptied = EmptyColumnRuntime.Empty(await prepared.Assemble(recordIds, keyField, asOf, entityName, call), this.column);
        if (emptied.Found) this.Emptied = true;
        return emptied.Assembly;
      },
    };
  }

  /** The assembly with `column` null on every row (unchanged when it did not assemble or lacks the column). Pure. */
  public static Empty(assembly: ScoringAssembly, column: string): EmptiedAssembly {
    if (assembly.Status !== 'assembled') return { Assembly: assembly, Found: false };
    const index = assembly.Matrix.columns.indexOf(column);
    if (index < 0) return { Assembly: assembly, Found: false };
    const rows = assembly.Matrix.rows.map((row) => row.map((cell, i) => (i === index ? null : cell)));
    return { Assembly: { ...assembly, Matrix: { columns: [...assembly.Matrix.columns], rows } }, Found: true };
  }
}

/** The shared scoring-gate steps. */
export class ScoringGateSteps {
  /** A test binding's feature name, unique to the harness run (a feature name is unique per entity). */
  public static FeatureName(h: Pick<TruthHarness, 'RunID'>, tag: string): string {
    return `PSTruth ${tag} ${h.RunID}`;
  }

  /**
   * The raw rows `ids` of the dataset's entity with `columns`, by ID (a simple read through the client provider).
   *
   * @throws when the read fails or a row is missing
   */
  public static async FeatureRows(h: Pick<TruthHarness, 'Provider' | 'User'>, dataset: LoadedDataset, ids: readonly string[], columns: readonly string[]): Promise<UUIDMap<FeatureRow>> {
    const key = dataset.Entity.FirstPrimaryKey.Name; // first-pk-ok: the truth-suite row tables are keyed by one ID column
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<FeatureRow>({
      EntityName: dataset.Entity.Name, ExtraFilter: `${key} IN (${ids.map((id) => `'${EscapeSQLString(id)}'`).join(',')})`,
      Fields: [key, ...columns], ResultType: 'simple', IgnoreMaxRows: true, BypassCache: true,
    }, h.User);
    if (!r.Success) throw new Error(`reading ${dataset.Entity.Name} rows failed: ${r.ErrorMessage}`);
    const byId = new UUIDMap<FeatureRow>();
    for (const row of r.Results) {
      const id = row[key];
      if (typeof id === 'string') byId.Set(id, Object.fromEntries(columns.map((c) => [c, row[c] === undefined ? null : row[c]])));
    }
    const missing = ids.filter((id) => !byId.Has(id));
    if (missing.length > 0) throw new Error(`${missing.length} row(s) of ${dataset.Entity.Name} not found (first: ${missing[0]})`);
    return byId;
  }

  /**
   * Scores `scope` with `modelId` on the model path (`ScoringService.Predict`, what Score Record Set without a binding
   * calls), in this process on the gate's client provider, with `runtime` replacing the production model runtime and
   * every other seam the production default. Writes the run row; never a Feature Value.
   */
  public static async PredictInProcess(
    provider: GraphQLDataProvider, user: UserInfo, modelId: string, scope: ScoringScope, runtime: IScoringModelRuntime,
  ): Promise<ScoringPrediction> {
    const seams = { ...ScoringSeamDefaults.Resolve(undefined), Runtime: runtime };
    const ctx: ScoringContext = {
      ContextUser: user, Provider: provider, Path: 'score-record-set', OverwriteHumanValues: false, ProcessRunID: null, ScheduledJobRunID: null, Seams: seams,
    };
    return new ScoringService(ctx).Predict({
      ScoringRunID: '', ModelID: modelId, Scope: scope, EntityMapping: null, AsOfDate: new Date().toISOString(),
      Read: { mode: 'complete' }, DryRun: false, RequestedBy: ScoringRunRecorder.RequestedBy(ctx),
    });
  }

  /** The production model runtime (the default the scoring service resolves). */
  public static ProductionRuntime(): IScoringModelRuntime {
    return ScoringSeamDefaults.Resolve(undefined).Runtime;
  }
}
