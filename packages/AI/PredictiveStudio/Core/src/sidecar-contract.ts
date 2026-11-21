/**
 * @module sidecar-contract
 *
 * Type contracts for the Predictive Studio **Python sidecar** — the CPU-bound ML
 * service that performs training and inference while TypeScript orchestrates
 * (see plan §3). MJ assembles the feature matrix and exchanges it with the
 * sidecar over HTTP/gRPC using the request/response shapes defined here.
 *
 * Training runs through the trainer contract (`trainer-contract.ts`). `/predict` still **applies** the fitted
 * preprocessing a model trained before Prediction Units carries — it never re-fits — so models trained that way keep
 * scoring.
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
 * The declared task is `TaskType` on the Prediction Unit; this two-valued type stays for the `ProblemType` columns
 * and the scoring path of models trained before Prediction Units, which reads it.
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
 * are *declarations* of what was fitted; the fitted parameters travel with the
 * model as its fitted preprocessing. Mirrors the sklearn
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
  indicator?: boolean; // case-violation-ok-legacy-back-compat: sidecar wire name
}

/**
 * Deterministic, comparable model metrics returned by the sidecar. The concrete
 * keys depend on `ProblemType` (e.g. `auc`/`f1`/`accuracy` for classification,
 * `rmse`/`mae`/`r2` for regression), so this is a numeric map. These drive the
 * experiment leaderboard (plan §8).
 */
export type ModelMetrics = Record<string, number>;

/**
 * Feature importance as a name -> share map; `ImportanceKind` says which number it holds. The sidecar's held-out
 * permutation importance is keyed by source column (one-hot levels and missing indicators count toward their
 * source); older models hold |coefficient| or split/impurity values per encoded column. Used by the leakage guard's
 * single-feature-dominance check and surfaced in the experiment-results artifact.
 */
export type FeatureImportance = Record<string, number>;

/**
 * Every kind of number a `FeatureImportance` map can hold: |coefficient|, tree split/impurity counts, the held-out
 * permutation share per source column (the increase of the held-out loss when the column is permuted), or none. The
 * one TS list of the kinds: `ImportanceKind` is derived from it, and a Core test holds it to the kinds
 * `TrainerContract.ImportanceKindOf` writes.
 */
export const IMPORTANCE_KINDS = ['coefficient', 'split_or_impurity', 'held_out_permutation', 'none'] as const;

/** Which kind of number a `FeatureImportance` map holds; one of {@link IMPORTANCE_KINDS}. */
export type ImportanceKind = (typeof IMPORTANCE_KINDS)[number];

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
   * binary, P(predicted class) for multiclass).
   */
  probabilities: number[] | null;  // case-violation-ok-legacy-back-compat: sidecar wire name
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
   * regression, as the sidecar sends it.
   */
  classOrder: string[] | null;  // case-violation-ok-legacy-back-compat: sidecar wire name
}

/**
 * Serialized fitted-transform parameters (means/stds, one-hot vocabularies, bin
 * edges, imputation fill values) a model trained before Prediction Units carries,
 * replayed at `/predict`. The concrete shape is sidecar-defined and opaque to
 * the orchestrator — it is stored verbatim on the trained model
 * (`MLModel.FittedPreprocessing`, plan §4.3) and round-tripped unchanged.
 */
export type FittedPreprocessing = Record<string, unknown>;
