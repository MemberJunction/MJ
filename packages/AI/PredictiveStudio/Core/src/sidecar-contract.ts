/**
 * @module sidecar-contract
 *
 * Type contracts for the Predictive Studio **Python sidecar** — the CPU-bound ML
 * service that performs training and inference while TypeScript orchestrates
 * (see plan §3). MJ assembles the feature matrix and exchanges it with the
 * sidecar over HTTP/gRPC using the request/response shapes defined here.
 *
 * The sidecar **fits** preprocessing during `/train` and returns the fitted
 * parameters; `/predict` only **applies** them. This fit-once / apply-everywhere
 * split is the anti-skew payload (plan §6.2) — `FeatureSchema` alone is
 * insufficient because the fitted pipeline must travel with the model.
 */

/**
 * The kind of a single feature column in the matrix sent to / expected by the
 * sidecar. Embedding dimensions arrive as individual `numeric` columns; this
 * `Kind` describes the *origin* of the feature for schema/UI purposes.
 */
export type FeatureKind = 'numeric' | 'categorical' | 'embedding' | 'llm-derived' | 'presence';

/**
 * The supported supervised-learning problem shapes.
 *
 * `classification` (yes/no, multiclass) and `regression` (predict a number) both answer a
 * per-RECORD question: given this record's features, what is the answer for this record.
 * `sequence` answers a different one — given a record's history IN ORDER, which latent state is it
 * in now. Renewal risk that builds over four quarters of declining engagement is a different shape
 * of question from renewal risk read off one snapshot, and flattening it into per-row features
 * discards the ordering that carried the signal.
 *
 * A `sequence` model is trained by the `hmm` driver, which requires the sequence boundaries saying
 * which rows belong to which entity; see `estimators/hmm.py`.
 */
export type ProblemType = 'classification' | 'regression' | 'sequence';

/**
 * One entry in the ordered feature schema — the inference input contract. The
 * order of entries defines column order in the matrix; `Name` is the stable
 * feature identifier and `Kind` describes its origin.
 */
export interface FeatureSchemaEntry {
  /** Stable feature/column name (e.g. `tenure`, `city`, `emb_0`). */
  Name: string;
  /** Origin/type of the feature. */
  Kind: FeatureKind;
}

/**
 * A single preprocessing operation in the train-time preprocessing list. These
 * are *declarations* of what the sidecar should fit; the fitted parameters come
 * back in {@link TrainResponse.FittedPreprocessing}. Mirrors the sklearn
 * fit/transform split executed in the sidecar (plan §6.2).
 */
export interface PreprocessingOp {
  /**
   * The transform to apply. Examples from the plan: `impute`, `standardize`,
   * `onehot`. Left as an open string union member so new sidecar-supported ops
   * can be added without a breaking change to this contract.
   */
  op: 'impute' | 'standardize' | 'onehot' | 'bin' | 'present' | string;
  /** Single target column for column-scoped ops (e.g. `impute`, `onehot`). */
  col?: string;
  /** Multiple target columns for multi-column ops (e.g. `standardize`). */
  cols?: string[];
  /** Imputation strategy when `op` is `impute`. */
  strategy?: 'mean' | 'median' | 'mode' | 'constant';
  /** Fill value when `strategy` is `constant`. */
  fillValue?: string | number;
  /** Number of bins to fit when `op` is `bin`. The sidecar fits the edges; absent ⇒ sidecar default. */
  bins?: number;
  /**
   * `present` only — emit the `<col>__present` mask column (1 when the record had a value, 0 when
   * it did not). Default true; set false to use `present` purely for {@link preserveMissing}.
   */
  emitMask?: boolean;
  /**
   * `present` only — leave `col` **missing** in the matrix instead of coercing absence to 0.
   *
   * This is what makes a `MissingDataPolicy` of `Exclude` or `NeutralMidpoint` reachable. Without
   * it every absent value arrives at the estimator as a real 0, so a rubric cannot tell "scored
   * zero" from "no data" and its per-row renormalization never fires. Opt-in per column, because
   * most estimators (logistic regression, ridge, MLP) reject a missing value outright — only the
   * rubric and the gradient-boosting families handle one.
   *
   * Default false, so every pipeline that does not ask for it is unchanged.
   */
  preserveMissing?: boolean;
  /**
   * Direction of meaning for the normalization ops (`minmax`/`percentile`/`zscore`/`logistic`/
   * `banded`/`lookup`, ported from Sonar): when false the normalized fraction is inverted before
   * scaling, so "days since last activity" can mean engagement without a flipped sign convention.
   * Default true.
   */
  higherIsBetter?: boolean;
  /** Lower bound of the normalized output range (normalization ops). Default 0. */
  outputMin?: number;
  /** Upper bound of the normalized output range (normalization ops). Default 1. */
  outputMax?: number;
  /**
   * Stateless curve parameters for `logistic` ({midpoint, steepness}), `banded`
   * ({bands: [{min, max, value}], fallback}), and `lookup` ({table, fallback}) — the operator's
   * params ARE the transform; nothing is fit.
   */
  params?: Record<string, unknown>;
}

/**
 * Validation configuration sent to the sidecar at train time (plan §3.2 / §8.2).
 * The default discipline is a single train/test split with overfitting
 * detection; k-fold and holdout are opt-in.
 */
export interface ValidationConfig {
  /** Validation strategy the sidecar should apply during `/train`. */
  strategy: 'train_test_split' | 'kfold' | 'holdout';
  /** Test fraction for `train_test_split` (e.g. `0.2`). */
  test_size?: number;
  /** Number of folds for `kfold`. */
  k?: number;
  /**
   * Locked-holdout fraction the **sidecar** should re-carve from the training
   * `data` and score exactly once (plan §8.2). This is the *fallback* path used
   * when the orchestrator does not forward an explicit {@link TrainRequest.holdout}
   * matrix — e.g. the sidecar's own pytest fixtures. The production
   * orchestrator carves the locked holdout in TypeScript and forwards the exact
   * rows via `TrainRequest.holdout` instead (which takes precedence), so the
   * holdout is auditable and the carve is deterministic. Omitted ⇒ no
   * sidecar-side re-carve.
   */
  holdout_size?: number;
  /** Random seed for the sidecar's holdout / train-test splits (default 42). */
  random_state?: number;
}

/**
 * Deterministic, comparable model metrics returned by the sidecar. The concrete
 * keys depend on `ProblemType` (e.g. `auc`/`f1`/`accuracy` for classification,
 * `rmse`/`mae`/`r2` for regression), so this is a numeric map. These drive the
 * experiment leaderboard (plan §8).
 */
export type ModelMetrics = Record<string, number>;

/**
 * Per-feature contribution map (importance/coefficient magnitude). Used by the
 * leakage guard's single-feature-dominance check (plan §6.4) and surfaced in the
 * experiment-results artifact.
 */
export type FeatureImportance = Record<string, number>;

/**
 * Inline data payload — the assembled feature matrix in columnar header +
 * row-array form. The sidecar contract also allows a shared-storage handle
 * (`data_ref`) for very large training sets; inline is implemented first
 * (plan §3.1).
 */
export interface MatrixData {
  /** Ordered column names (aligns with each row's value order). */
  columns: string[];
  /** Row-major data: each inner array is one record's values, column-aligned. */
  rows: Array<Array<string | number | boolean | null>>;
}

/**
 * `POST /train` request body. MJ assembles the matrix via the FeatureAssembly
 * executor (plan §6) and sends it here. Either {@link TrainRequest.data} (inline)
 * or {@link TrainRequest.data_ref} (shared-storage handle) is provided.
 */
export interface TrainRequest {
  /** Sidecar algorithm driver key (e.g. `xgboost`, `lightgbm`, `logistic_regression`). */
  algorithm: string;
  /** Classification or regression. */
  problem_type: ProblemType;
  /** Algorithm-specific hyperparameters (validated against the catalog schema). */
  hyperparameters: Record<string, unknown>;
  /** How to validate during training. */
  validation: ValidationConfig;
  /** Ordered feature schema describing each input column. */
  feature_schema: FeatureSchemaEntry[];
  /** Ordered preprocessing ops to fit + apply at train time. */
  preprocessing: PreprocessingOp[];
  /** Target/label column name. */
  target: string;
  /** Inline matrix data (mutually exclusive with `data_ref`). */
  data?: MatrixData;
  /** Shared-storage handle to the matrix (Parquet/Arrow), used for very large sets. */
  data_ref?: string;
  /**
   * The **locked holdout** matrix (plan §8.2), carved off the assembled data by
   * the orchestrator *before* any train/test split and never present in
   * {@link TrainRequest.data}. Same columns as `data` (it includes the `target`
   * column). When supplied, the sidecar scores these rows **exactly once** using
   * the preprocessing fitted on the training `data` (frozen fitted transform,
   * **never re-fit** — the anti-skew guarantee, plan §6.2) and returns the result
   * as {@link TrainResponse.holdout_metrics}.
   *
   * This is the honest, deterministic holdout: the orchestrator carves the exact
   * rows in TypeScript (auditable) and forwards them here, rather than asking the
   * sidecar to re-derive a holdout via {@link ValidationConfig.holdout_size}.
   * When both `holdout` and `validation.holdout_size` are set, `holdout` wins.
   */
  holdout?: MatrixData;
  /**
   * A **composed** model to build instead of the single estimator `algorithm` names (additive).
   *
   * When present the sidecar builds an estimator tree — a Bagging Wrapper over a base model, a
   * Stacking Wrapper over several with a linear final estimator, and so on — from the component
   * graph the Architect proposed (`component-graph-spec.ts`). `algorithm` still identifies the ROOT
   * driver, so every existing read path (lineage, the registry, the leaderboard) keeps working
   * unchanged and a caller that ignores this field behaves exactly as before.
   */
  component_graph?: TrainComponentNode;
  /**
   * Base64 artifacts for graph nodes that REUSE an already-trained component, keyed by the node's
   * `reuse_instance_id`. The sidecar has no database, so a reused child's fitted state has to travel
   * with the request; a node naming a reuse id with no artifact here is an error rather than a
   * silent re-fit, because silently retraining a component the caller asked to reuse would produce a
   * different model than the one they described.
   */
  component_artifacts?: Record<string, string>;
  /**
   * Sequence boundaries, REQUIRED when `problem_type` is `'sequence'`.
   *
   * An HMM learns transitions within one entity's history. Without knowing where one entity's rows
   * end and the next begin it treats the whole matrix as a single sequence and learns transitions
   * between unrelated records — returning a fitted model with confident scores that nothing
   * downstream would question. The sidecar refuses rather than guessing.
   */
  sequence?: SequenceSpec;
}

/**
 * One node of a composed model, as the sidecar receives it. Deliberately snake_case and
 * driver-keyed (rather than the TypeScript-side `ComponentTypeRef` names), because the sidecar knows
 * nothing about the component tree — the caller resolves names to drivers before sending.
 */
/**
 * How to segment the training matrix into per-entity sequences.
 *
 * `group_field` names a column present in `data` but NOT in `feature_schema` — the same way
 * `target` rides along. Rows are expected already grouped and ordered; `order_field` records what
 * they were ordered by, so the model's lineage says it rather than leaving it implicit.
 */
export interface SequenceSpec {
  /** Column identifying which entity a row belongs to (the per-entity sequence key). */
  group_field: string;
  /** Column the rows were ordered by within each group. Recorded for lineage. */
  order_field?: string;
}

export interface TrainComponentNode {
  /**
   * What to build here. A structure key (`bagging`, `stacking`) composes its children; any other
   * key is looked up in the estimator registry exactly as `TrainRequest.algorithm` is.
   */
  driver: string;
  /** Constructor hyperparameters for this node. */
  hyperparameters?: Record<string, unknown>;
  /** The parent slot this node fills (`base_estimator`, `estimators`, `final_estimator`). */
  slot?: string;
  /** Children filling this node's slots. */
  children?: TrainComponentNode[];
  /**
   * Reuse an already-trained component here rather than fitting a fresh one. Its artifact must be
   * supplied in {@link TrainRequest.component_artifacts}, and it is loaded FROZEN — the enclosing
   * fit will not update it, which is the whole point of reusing it.
   */
  reuse_instance_id?: string;
}

/**
 * `POST /train` response. Carries the serialized model plus the **fitted**
 * preprocessing parameters (the anti-skew payload) and the deterministic metrics
 * used to grade and rank the run.
 */
export interface TrainResponse {
  /** Base64-encoded serialized model artifact. */
  artifact_b64: string;
  /**
   * Fitted preprocessing parameters (means/stds, vocabularies, bin edges, fill
   * values) learned during `/train`. Travels with the model and is replayed at
   * inference — never re-fit (plan §6.2).
   */
  fitted_preprocessing: FittedPreprocessing;
  /** Train + validation metrics. */
  metrics: ModelMetrics;
  /** Per-feature importance/contribution. */
  feature_importance: FeatureImportance;
  /** Number of training rows the model was fit on. */
  training_row_count: number;
  /** Wall-clock training time in seconds. */
  duration_sec: number;
  /** Honest metrics on the locked holdout, scored exactly once (plan §8.2). */
  holdout_metrics?: ModelMetrics;
  /**
   * Per-node facts about a composed model, in the graph's depth-first order (additive; present only
   * when the request carried a `component_graph`).
   *
   * This is what lets the materializer write a real `MJ: ML Components` row per node instead of one
   * opaque root — so a composed model's parts stay individually inspectable, story-taggable and
   * reusable, which is the entire reason for composing in the typed model rather than in a script.
   */
  component_states?: TrainedComponentState[];
}

/** What the sidecar can say about one node of a composed model after fitting. */
export interface TrainedComponentState {
  /** The node's driver key, matching the request node. */
  driver: string;
  /** The slot it filled in its parent; absent on the root. */
  slot?: string;
  /** Whether this node was fitted here, or loaded frozen from a reused artifact. */
  fitted: boolean;
  /** The reused component instance id, when this node was frozen rather than fitted. */
  reuse_instance_id?: string;
  /** Per-feature contribution for this node alone, when its estimator exposes one. */
  feature_importance?: FeatureImportance;
}

/**
 * `POST /predict` request body. Supplies the model artifact (inline or by ref),
 * the frozen fitted preprocessing, the feature schema, and 1..N rows to score.
 * The sidecar **only applies** the frozen params — it never re-fits (plan §6.2).
 */
export interface PredictRequest {
  /** Base64-encoded serialized model artifact (mutually exclusive with `artifact_ref`). */
  artifact_b64?: string;
  /** Shared-storage handle to the model artifact. */
  artifact_ref?: string;
  /** Frozen fitted preprocessing parameters that travel with the model. */
  fitted_preprocessing: FittedPreprocessing;
  /** Ordered feature schema describing each input column. */
  feature_schema: FeatureSchemaEntry[];
  /** 1..N records to score, each a feature-name → value map. */
  rows: Array<Record<string, string | number | boolean | null>>;
}

/**
 * A single prediction for one input row. `score` is the model output
 * (probability for classification, predicted value for regression); `class` is
 * the predicted label for classification problems.
 */
export interface Prediction {
  /** Numeric model output: probability (classification) or value (regression). */
  score: number;
  /** Predicted class label, present for classification problems. */
  class?: string;
  /**
   * Per-record feature contributions for THIS row (P1-5) — the top signed drivers behind this specific
   * prediction, ranked by magnitude. Present only for models where an honest per-row attribution is cheap
   * and exact — linear models (`coef_ · transformed value`, i.e. the log-odds/value contribution). Absent
   * (undefined) for tree/ensemble models (which need SHAP) and multiclass; callers fall back to the model's
   * GLOBAL feature importance. Feature names are the post-preprocessing output columns (one-hot names like
   * `Col=Value`), so a UI should collapse/humanize them for display.
   */
  contributions?: PredictionContribution[];
  /**
   * Features this row had **no data** for — the `hadData` signal (Sonar donation item 7).
   *
   * Only ever populated for a model that asked for missing values to survive preprocessing (the
   * `present` op's `preserveMissing`); everywhere else absence is coerced to a real 0 long before
   * the estimator sees it, and there is nothing left to report. A missing feature is reported here
   * rather than among `contributions` because it has no magnitude to rank by — but "we had no data
   * for engagement" is often the most useful thing to say about a prediction.
   */
  missingFeatures?: string[];
}

/** One signed per-record feature contribution: `value > 0` pushes the score up, `< 0` down. */
export interface PredictionContribution {
  /** The (post-preprocessing) feature/output-column name. */
  feature: string;
  /** Signed contribution to the model output for this row (log-odds for classification, value for regression). */
  value: number;
  /**
   * Whether the record actually had a value for this feature. `false` means the contribution comes
   * from whatever stood in for the absence (an imputed value, a missing-data policy) — the number
   * is real, but it is not evidence about this record.
   *
   * Absent when the model cannot tell (the usual case: absence was coerced to 0 in preprocessing).
   */
  hadData?: boolean;
}

/**
 * `POST /predict` response — predictions aligned positionally with the request
 * `rows`.
 */
export interface PredictResponse {
  /** One prediction per input row, in request order. */
  predictions: Prediction[];
}

/**
 * Serialized fitted-transform parameters (means/stds, one-hot vocabularies, bin
 * edges, imputation fill values) produced by the sidecar at `/train` and
 * replayed at `/predict`. The concrete shape is sidecar-defined and opaque to
 * the orchestrator — it is stored verbatim on the trained model
 * (`MLModel.FittedPreprocessing`, plan §4.3) and round-tripped unchanged.
 */
export type FittedPreprocessing = Record<string, unknown>;

/**
 * `POST /describe` request body — the **statistics pre-pass** (additive; the sidecar's third
 * endpoint alongside `/train` and `/predict`). MJ assembles the TRAINING partition through the same
 * `FeatureAssemblyExecutor` and the same locked-holdout carve it uses for training, then sends only
 * the training rows here. The locked holdout is never described: measuring it would leak into every
 * downstream decision and the "honest number" would stop being honest.
 *
 * The endpoint is read-only — it fits nothing, stores nothing, and returns no artifact.
 */
export interface DescribeRequest {
  /** Classification or regression — decides which association measure is computed. */
  problem_type: ProblemType;
  /** Ordered feature schema describing each column (same shape `/train` receives). */
  feature_schema: FeatureSchemaEntry[];
  /** Target/label column name; must be present in `data.columns`. */
  target: string;
  /** The TRAINING partition only. */
  data: MatrixData;
  /**
   * Cap on how many distinct values are enumerated per categorical column in `top_values`.
   * Omitted ⇒ sidecar default. Bounds the response for a high-cardinality column.
   */
  top_values_limit?: number;
  /**
   * Also return the pairwise |correlation| matrix over numeric features, which the collinearity
   * hints are derived from. Omitted/false ⇒ skipped (it is O(features²) and not always wanted).
   */
  include_correlations?: boolean;
}

/**
 * `POST /describe` response. Deliberately mirrors `DatasetStatistics` / `FeatureStatistics` in
 * `statistics-spec.ts` in snake_case, so the TypeScript side maps field-for-field with no
 * interpretation — the hints themselves are derived in TypeScript (`deriveFeatureHints`), from
 * these measurements, so the thresholds stay in one place and stay testable without Python.
 */
export interface DescribeResponse {
  /** Rows described (the training partition). */
  row_count: number;
  /** Columns described, excluding the target. */
  feature_count: number;
  /** Label distribution. */
  target: DescribeTarget;
  /** Per-feature measurements, in `feature_schema` order. */
  features: DescribeFeature[];
  /**
   * `{ "a|b": r }` for numeric feature pairs, present only when `include_correlations` was set.
   * The key joins the two column names with `|` in `feature_schema` order.
   */
  correlations?: Record<string, number>;
  /** Wall-clock time for the pass. */
  duration_sec: number;
  /** Columns that could not be described, and why — never silently dropped. */
  warnings: string[];
}

/** Label distribution as measured by `/describe`. Exactly one of `classes` / `numeric` is present. */
export interface DescribeTarget {
  name: string;
  /** Rows carrying a usable label. */
  labeled_row_count: number;
  /** Class counts, descending (classification). */
  classes?: Array<{ value: string; count: number }>;
  /** Label moments (regression). */
  numeric?: DescribeNumericSummary;
}

/** Numeric moments shared by the target and numeric features. */
export interface DescribeNumericSummary {
  mean: number;
  std: number;
  min: number;
  max: number;
  /** `[p25, p50, p75]`. */
  quartiles: [number, number, number];
  /** Fisher skewness; omitted when undefined (zero variance). */
  skewness?: number;
}

/** One feature's measurements from `/describe`. */
export interface DescribeFeature {
  name: string;
  kind: FeatureKind | string;
  /** Fraction of rows that are null/NaN. */
  missing_fraction: number;
  /** Distinct non-null values. */
  distinct_count: number;
  /** Numeric moments (numeric columns only). */
  numeric?: DescribeNumericSummary;
  /**
   * Association with the target, comparable across features:
   * classification → single-feature AUC in `[0.5, 1]`; regression → `|Pearson r|` in `[0, 1]`.
   * Omitted when it cannot be computed.
   */
  target_association?: number;
  /** Mutual information with the target, in nats. Omitted when it cannot be computed. */
  mutual_information?: number;
  /** Most frequent values (categorical columns only), descending by count. */
  top_values?: Array<{ value: string; count: number }>;
}
