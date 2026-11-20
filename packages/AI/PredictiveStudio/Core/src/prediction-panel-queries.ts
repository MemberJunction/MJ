/**
 * @module prediction-panel-queries
 *
 * The record panel's batched reads (§5.8.5), built in one place so `ModelPredictionPanel` and gate G5.6 send the same
 * `RunViews` (review minor m7; the gate runs in Node, where the Angular package cannot load, so the builder lives
 * here). Each query is structurally a `RunViewParams`. Browser-safe (no node imports).
 */
import { EscapeSQLString } from '@memberjunction/global';

/**
 * The name of the seeded authorization a scoring binding's predictions are seen through when its creator names none
 * (§5.8.4): the binding editor's default, the engine's resolver default and the retention backfill's assignment.
 */
export const DEFAULT_VIEW_AUTHORIZATION_NAME = 'View Model Predictions';

/**
 * The {@link DEFAULT_VIEW_AUTHORIZATION_NAME} authorization among `authorizations` (a provider's `Authorizations`),
 * matched by name trimmed and case-insensitive: the one rule every caller uses. Undefined when it is not loaded.
 */
export function FindDefaultViewAuthorization<T extends { readonly Name: string }>(authorizations: readonly T[]): T | undefined {
  const wanted = DEFAULT_VIEW_AUTHORIZATION_NAME.toLowerCase();
  return authorizations.find((a) => a.Name.trim().toLowerCase() === wanted);
}

/** Rows the panel reads of a record's history. */
export const PREDICTION_PANEL_MAX_HISTORY_ROWS = 500;

/** Rows the panel reads of a record's pipeline values. */
export const PREDICTION_PANEL_MAX_DERIVED_ROWS = 500;

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

/** The `MJ: ML Model Scoring Bindings` fields the panel reads. */
const BINDING_FIELDS = ['ID', 'FeatureName', 'MLTrainingPipelineID', 'MLTrainingPipeline', 'TargetEntityID', 'ViewAuthorizationID', 'Status', 'LastScoredAt'];
/** The value fields read from `MJ: Latest Feature Values` and `MJ: Feature Values`. */
const VALUE_FIELDS = [
  'ID', 'EntityID', 'RecordID', 'FeatureName', 'Source', 'EffectiveAsOf', 'ComputedAt', 'MLModelScoringBindingID', 'MLModelID',
  'MLScoringRunID', 'InTraining', 'ValueText', 'ValueNumeric', 'ValueJSON', 'Confidence',
];
/** The pipeline value fields of the "Derived values" section. */
const DERIVED_FIELDS = [
  'ID', 'RecordProcessID', 'RecordProcess', 'FeatureName', 'ValueText', 'ValueNumeric', 'ValueBoolean', 'ValueDate', 'ValueJSON',
  'Source', 'Confidence', 'PipelineVersion', 'ComputedAt', 'Reasoning', 'ProcessRunID',
];

/** The record panel's batch. */
export class PredictionPanelQueries {
  /** The position of each read in {@link For}'s batch. */
  public static readonly Index = { Bindings: 0, Latest: 1, History: 2, Derived: 3 } as const;

  /**
   * The panel's batch for one record: the entity's `Active` bindings; the latest value of each bound feature from
   * `MJ: Latest Feature Values`; the `Champion` `Model` history from `MJ: Feature Values`, newest first; the record's
   * pipeline values. `featureNames` are the features of the bindings the user holds; empty, the value reads keep every
   * bound feature (the view gate still filters them). Pure.
   */
  public static For(entityId: string, recordId: string, featureNames: readonly string[]): PredictionPanelQuery[] {
    const record = `EntityID='${EscapeSQLString(entityId)}' AND RecordID='${EscapeSQLString(recordId)}'`;
    const features = featureNames.length > 0 ? ` AND FeatureName IN (${featureNames.map((f) => `'${EscapeSQLString(f)}'`).join(',')})` : '';
    return [
      {
        EntityName: 'MJ: ML Model Scoring Bindings', ExtraFilter: `TargetEntityID='${EscapeSQLString(entityId)}' AND Status='Active'`,
        Fields: [...BINDING_FIELDS], OrderBy: '__mj_CreatedAt ASC', ResultType: 'simple',
      },
      {
        EntityName: 'MJ: Latest Feature Values', ExtraFilter: `${record} AND MLModelScoringBindingID IS NOT NULL${features}`,
        Fields: [...VALUE_FIELDS], ResultType: 'simple', BypassCache: true,
      },
      {
        EntityName: 'MJ: Feature Values', ExtraFilter: `${record} AND MLModelScoringBindingID IS NOT NULL AND Source='Model' AND Role='Champion'${features}`,
        Fields: [...VALUE_FIELDS], OrderBy: 'EffectiveAsOf DESC, ComputedAt DESC', MaxRows: PREDICTION_PANEL_MAX_HISTORY_ROWS, ResultType: 'simple', BypassCache: true,
      },
      {
        EntityName: 'MJ: Feature Values', ExtraFilter: `${record} AND RecordProcessID IS NOT NULL AND Role='Champion'`,
        Fields: [...DERIVED_FIELDS], OrderBy: 'ComputedAt DESC', MaxRows: PREDICTION_PANEL_MAX_DERIVED_ROWS, ResultType: 'simple',
      },
    ];
  }
}
