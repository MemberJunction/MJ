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
export type FeatureKind = 'numeric' | 'categorical' | 'embedding' | 'llm-derived' | 'decision-derived';

/**
 * The two supported supervised-learning problem shapes. Predictive Studio is
 * deliberately opinionated (plan §1.2) — classification (yes/no, multiclass) and
 * regression (predict a number) cover the canonical use cases.
 *
 * @deprecated The declared task is `TaskType` on the Prediction Unit; this two-valued type remains only for the
 * legacy `TrainRequest` and the `ProblemType` columns, and is removed together with `TrainRequest`.
 */
export type ProblemType = 'classification' | 'regression';

/** The one problem-type predicate every Core rule uses, so the trust verdict, outcome config and at-risk rules agree. */
export class ProblemTypes {
  /**
   * True when a stored problem type is regression. Trims and ignores case: the entity field is a lower-case literal union,
   * but the shared inputs are typed `string` (Core cannot import `MJMLModelEntity`) and hand-built rows vary.
   */
  public static IsRegression(problemType: string | null | undefined): boolean {
    return (problemType || '').trim().toLowerCase() === 'regression';
  }
}

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
  /** Number of bins to fit when `op` is `bin`. The sidecar fits the edges; absent ⇒ sidecar default. */
  bins?: number;
  /** When `op` is `impute`: also emit a `<col>__missing` column (1 where the value was missing) before filling, so a missing value stays distinct from a true zero. */
  indicator?: boolean; // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/**
 * Validation configuration sent to the sidecar at train time (plan §3.2 / §8.2).
 * The default is a single train/test split. `holdout` uses the same
 * out-of-sample split (it reads `test_size` too); `kfold` scores pooled
 * out-of-fold predictions. Every strategy reports out-of-sample `metrics`.
 */
export interface ValidationConfig {
  /** Validation strategy the sidecar should apply during `/train`. */
  strategy: 'train_test_split' | 'kfold' | 'holdout';
  /** Validation fraction for the split that `train_test_split` and `holdout` both use (e.g. `0.2`). */
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

/** Which kind of number a `FeatureImportance` map holds: |coefficient|, tree split/impurity counts, or none. */
export type ImportanceKind = 'coefficient' | 'split_or_impurity' | 'none';

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
  /** Which kind of number `feature_importance` holds. Absent on sidecars that predate it. */
  feature_importance_kind?: ImportanceKind;
  /** Number of training rows the model was fit on (excludes any locked holdout, forwarded or sidecar-carved). */
  training_row_count: number;
  /** Wall-clock training time in seconds. */
  duration_sec: number;
  /** Honest metrics on the locked holdout, scored exactly once (plan §8.2). */
  holdout_metrics?: ModelMetrics;
  /** True when the sidecar computed `metrics` strictly out-of-sample (fit on train fold/split only, scored on held-out fold/split); set per run from the validation path taken. Absent on pre-C5 sidecars. */
  validation_out_of_sample?: boolean;
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
   * The full class-probability vector, aligned with {@link PredictResponse.classOrder}. Present for classification and
   * null otherwise (the sidecar sends null rather than leaving the key out); `score` keeps its meaning (P(class 1) for
   * binary, P(predicted class) for multiclass). The sidecar always sends the key; it stays optional so the test
   * doubles of the predictor seam, which build responses by hand, need not state it.
   */
  probabilities?: number[] | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/** One signed per-record feature contribution: `value > 0` pushes the score up, `< 0` down. */
export interface PredictionContribution {
  /** The (post-preprocessing) feature/output-column name. */
  feature: string;
  /** Signed contribution to the model output for this row (log-odds for classification, value for regression). */
  value: number;
}

/**
 * `POST /predict` response — predictions aligned positionally with the request
 * `rows`.
 */
export interface PredictResponse {
  /** One prediction per input row, in request order. */
  predictions: Prediction[];
  /**
   * The class order every `probabilities` vector follows (the artifact's declared order for v2 predictors); null for
   * regression, as the sidecar sends it. Optional for the same reason as {@link Prediction.probabilities}.
   */
  classOrder?: string[] | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/**
 * Serialized fitted-transform parameters (means/stds, one-hot vocabularies, bin
 * edges, imputation fill values) produced by the sidecar at `/train` and
 * replayed at `/predict`. The concrete shape is sidecar-defined and opaque to
 * the orchestrator — it is stored verbatim on the trained model
 * (`MLModel.FittedPreprocessing`, plan §4.3) and round-tripped unchanged.
 */
export type FittedPreprocessing = Record<string, unknown>;
