/**
 * @module prediction-panel-queries
 *
 * The record panel's batched reads (§5.8.5), built in one place so `ModelPredictionPanel` and gate G5.6 send the same
 * `RunViews` (review minor m7; the gate runs in Node, where the Angular package cannot load, so the builder lives
 * here). Each query is structurally a `RunViewParams`. Browser-safe (no node imports).
 */
import { EscapeSQLString } from '@memberjunction/global';

/**
 * The seeded authorization a scoring binding's predictions are seen through when its creator names none (§5.8.4): the
 * binding editor's default, the engine's resolver default and the retention backfill's assignment.
 */
export class PredictionViewAuthorization {
  /** The seeded authorization's name. */
  public static readonly DefaultName = 'View Model Predictions';

  /**
   * The {@link DefaultName} authorization among `authorizations` (a provider's `Authorizations`), matched by name
   * trimmed and case-insensitive: the one rule every caller uses. Undefined when it is not loaded.
   */
  public static FindDefault<T extends { readonly Name: string }>(authorizations: readonly T[]): T | undefined {
    const wanted = PredictionViewAuthorization.DefaultName.toLowerCase();
    return authorizations.find((a) => a.Name.trim().toLowerCase() === wanted);
  }
}

/** One read of the panel's batch: the `RunViewParams` fields it sets. */
export interface PredictionPanelQuery {
  /** The entity read. */
  readonly EntityName: string;
  /** The filter. */
  readonly ExtraFilter: string;
  /** The fields read. */
  readonly Fields: string[];
  /** The order, when the read has one. */
  readonly OrderBy?: string;
  /** The row cap, when the read has one. */
  readonly MaxRows?: number;
  /** Always `simple`. */
  readonly ResultType: 'simple';
  /** True for the value reads: a scoring run's rows are read live. */
  readonly BypassCache?: boolean;
}

/** The record panel's batch. */
export class PredictionPanelQueries {
  /** The position of each read in {@link For}'s batch. */
  public static readonly Index = { Bindings: 0, Latest: 1, History: 2, Derived: 3 } as const;

  /** Rows the panel reads of a record's history. */
  public static readonly MaxHistoryRows = 500;

  /** Rows the panel reads of a record's pipeline values. */
  public static readonly MaxDerivedRows = 500;

  /** The `MJ: ML Model Scoring Bindings` fields the panel reads. */
  public static readonly BindingFields = ['ID', 'FeatureName', 'MLTrainingPipelineID', 'MLTrainingPipeline', 'TargetEntityID', 'ViewAuthorizationID', 'Status', 'LastScoredAt'] as const;

  /** The value fields read from `MJ: Latest Feature Values` and `MJ: Feature Values`. */
  public static readonly ValueFields = [
    'ID', 'EntityID', 'RecordID', 'FeatureName', 'Source', 'EffectiveAsOf', 'ComputedAt', 'MLModelScoringBindingID', 'MLModelID',
    'MLScoringRunID', 'InTraining', 'ValueText', 'ValueNumeric', 'ValueJSON', 'Confidence',
  ] as const;

  /** The pipeline value fields of the "Derived values" section. */
  public static readonly DerivedFields = [
    'ID', 'RecordProcessID', 'RecordProcess', 'FeatureName', 'ValueText', 'ValueNumeric', 'ValueBoolean', 'ValueDate', 'ValueJSON',
    'Source', 'Confidence', 'PipelineVersion', 'ComputedAt', 'Reasoning', 'ProcessRunID',
  ] as const;

  /** The `MJ: ML Scoring Runs` fields the lineage reads. */
  public static readonly RunFields = ['ID', 'ModelID', 'ModelVersion', 'StartedAt'] as const;

  /** The `MJ: ML Output Bindings` fields the card reads (the scoring model's `record-panel` row). */
  public static readonly OutputBindingFields = ['ID', 'ModelID', 'Surface', 'SortsBy', 'DriverDirectionRelativeTo', 'Label'] as const;

  /**
   * The panel's batch for one record: the entity's `Active` bindings; the latest value of each bound feature from
   * `MJ: Latest Feature Values`; the `Champion` `Model` history from `MJ: Feature Values`, newest first; the record's
   * pipeline values. `featureNames` are the features of the bindings the user holds; empty, the value reads keep every
   * bound feature (the view gate still filters them). Pure.
   */
  public static For(entityId: string, recordId: string, featureNames: readonly string[]): PredictionPanelQuery[] {
    const record = `EntityID='${EscapeSQLString(entityId)}' AND RecordID='${EscapeSQLString(recordId)}'`;
    const features = featureNames.length > 0 ? ` AND FeatureName IN (${PredictionPanelQueries.inList(featureNames)})` : '';
    return [
      {
        EntityName: 'MJ: ML Model Scoring Bindings', ExtraFilter: `TargetEntityID='${EscapeSQLString(entityId)}' AND Status='Active'`,
        Fields: [...PredictionPanelQueries.BindingFields], OrderBy: '__mj_CreatedAt ASC', ResultType: 'simple',
      },
      {
        EntityName: 'MJ: Latest Feature Values', ExtraFilter: `${record} AND MLModelScoringBindingID IS NOT NULL${features}`,
        Fields: [...PredictionPanelQueries.ValueFields], ResultType: 'simple', BypassCache: true,
      },
      {
        EntityName: 'MJ: Feature Values', ExtraFilter: `${record} AND MLModelScoringBindingID IS NOT NULL AND Source='Model' AND Role='Champion'${features}`,
        Fields: [...PredictionPanelQueries.ValueFields], OrderBy: 'EffectiveAsOf DESC, ComputedAt DESC', MaxRows: PredictionPanelQueries.MaxHistoryRows, ResultType: 'simple', BypassCache: true,
      },
      {
        EntityName: 'MJ: Feature Values', ExtraFilter: `${record} AND RecordProcessID IS NOT NULL AND Role='Champion'`,
        Fields: [...PredictionPanelQueries.DerivedFields], OrderBy: 'ComputedAt DESC', MaxRows: PredictionPanelQueries.MaxDerivedRows, ResultType: 'simple',
      },
    ];
  }

  /** The position of each read in {@link Lineage}'s batch. */
  public static readonly LineageIndex = { OutputBindings: 0, Runs: 1 } as const;

  /**
   * The lineage batch of the values the panel shows: the scoring models' `record-panel` output bindings (read past the
   * server cache, as every surface reads its binding row) and the scoring runs, always in the {@link LineageIndex}
   * positions. A read whose ID list is empty matches nothing (`1=0`), so a result is always where its index says; the
   * caller skips the batch when both lists are empty. Pure.
   */
  public static Lineage(modelIds: readonly string[], runIds: readonly string[]): PredictionPanelQuery[] {
    const models = modelIds.length > 0 ? `ModelID IN (${PredictionPanelQueries.inList(modelIds)})` : '1=0';
    const runs = runIds.length > 0 ? `ID IN (${PredictionPanelQueries.inList(runIds)})` : '1=0';
    return [
      {
        EntityName: 'MJ: ML Output Bindings', ExtraFilter: `Surface='record-panel' AND ${models}`,
        Fields: [...PredictionPanelQueries.OutputBindingFields], ResultType: 'simple', BypassCache: true,
      },
      { EntityName: 'MJ: ML Scoring Runs', ExtraFilter: runs, Fields: [...PredictionPanelQueries.RunFields], ResultType: 'simple' },
    ];
  }

  /** A quoted, escaped SQL `IN` list. */
  private static inList(values: readonly string[]): string {
    return values.map((v) => `'${EscapeSQLString(v)}'`).join(',');
  }
}
