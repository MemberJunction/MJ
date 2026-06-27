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
export type FeatureKind = 'numeric' | 'categorical' | 'embedding' | 'llm-derived';

/**
 * The two supported supervised-learning problem shapes. Predictive Studio is
 * deliberately opinionated (plan §1.2) — classification (yes/no, multiclass) and
 * regression (predict a number) cover the canonical use cases.
 */
export type ProblemType = 'classification' | 'regression';

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
  op: 'impute' | 'standardize' | 'onehot' | 'bin' | string;
  /** Single target column for column-scoped ops (e.g. `impute`, `onehot`). */
  col?: string;
  /** Multiple target columns for multi-column ops (e.g. `standardize`). */
  cols?: string[];
  /** Imputation strategy when `op` is `impute`. */
  strategy?: 'mean' | 'median' | 'mode' | 'constant';
  /** Fill value when `strategy` is `constant`. */
  fillValue?: string | number;
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
