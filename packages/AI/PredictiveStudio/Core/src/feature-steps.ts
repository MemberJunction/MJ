/**
 * @module feature-steps
 *
 * The **FeatureStep DAG** — the visual-DAG step model behind a pipeline's
 * `FeatureSteps` (plan §4.2 / §5 / §6). A `FeatureStep` is a discriminated union
 * on `Kind`; steps reference upstream step ids via `Inputs`, forming a directed
 * acyclic graph rather than a flat list. The frozen graph is what the
 * FeatureAssembly executor replays identically across training and scoring
 * (plan §6.1) to avoid train/serve skew.
 */
import type { RowFilter } from './prediction-unit';
import type { ColumnEncodingKind, DatedSource, WindowedAggregateSource } from './assembly-contract';

/**
 * The set of step kinds supported by the FeatureAssembly executor. Each maps to
 * a concrete {@link FeatureStep} variant below.
 */
export type FeatureStepKind =
  | 'select'
  | 'impute'
  | 'standardize'
  | 'onehot'
  | 'bin'
  | 'embedding'
  | 'llm-derived'
  | 'flow-agent'
  | 'vision-llm'
  | 'windowed-aggregate'
  | 'series';

/**
 * Fields shared by every step in the DAG. `Inputs` lists the ids of upstream
 * steps whose output feeds this step — this is what makes the structure a DAG
 * rather than an ordered list.
 */
export interface FeatureStepBase {
  /** Stable id for this step, referenced by downstream steps' `Inputs`. */
  Id: string;
  /** Discriminator selecting the concrete step variant. */
  Kind: FeatureStepKind;
  /** Optional human-readable label for the visual DAG. */
  Label?: string;
  /** Ids of upstream steps that feed this step (DAG edges). */
  Inputs?: string[];
}

/**
 * `select` — pick a set of columns from upstream output into the feature set.
 */
export interface SelectFeatureStep extends FeatureStepBase {
  Kind: 'select';
  /** Columns to carry forward. */
  Columns: string[];
  /** Unit pipelines: the entity the columns are on (default: the unit's row entity). */
  Entity?: string;
  /** Unit pipelines: field on the unit row holding `Entity`'s primary key (default for the grain entity of a grain × periods unit: its foreign key). */
  KeyField?: string;
  /** Unit pipelines: declared encoding per column, overriding the one chosen from the field type. */
  Encodings?: Record<string, ColumnEncodingKind>;
  /** Forecast units: periods before the row's own period each column's value refers to; must be >= the horizon. */
  PeriodOffsets?: Record<string, number>;
}

/** `windowed-aggregate` — a summary of a dated child table as of the row's decision date (unit pipelines only). */
export interface WindowedAggregateFeatureStep extends FeatureStepBase {
  Kind: 'windowed-aggregate';
  /** Name of the single numeric feature column this step produces. */
  FeatureName: string;
  /** The dated child entity summarised. */
  ChildEntity: string;
  /** Field on the child holding the owning row's key. */
  ForeignKey: string;
  /** Field on the unit row whose value the child's `ForeignKey` matches (default: the row's entity key). */
  OwnerKeyField?: string;
  /** Child date field compared with the decision date. */
  DateField: string;
  /** For `active-at`: the child field ending the row's active span. */
  EndDateField?: string;
  /** Child date field from which the child row stops counting (e.g. a reversal date). */
  VoidedAtField?: string;
  /** The summary computed over the child rows in the window. */
  Aggregate: WindowedAggregateSource['aggregate'];
  /** Child field aggregated by `sum`, `mean` and `distinct`. */
  ValueField?: string;
  /** Window length in days ending at the decision date; absent = every child row on or before it. */
  WindowDays?: number;
  /** Child-row filters applied before aggregating. */
  Filter?: RowFilter[];
}

/** `series` — a lag or rolling window declared in the unit's Temporal Spec, by index (unit pipelines only). */
export interface SeriesFeatureStep extends FeatureStepBase {
  Kind: 'series';
  /** Name of the feature column this step produces. */
  FeatureName: string;
  /** Which Temporal Spec lag or rolling window, by its index in that list. */
  Feature: Extract<DatedSource, { kind: 'series' }>['feature'];
}

/**
 * `impute` — fill missing values for a column using the given strategy. Fitted
 * at train time (e.g. the mean/median learned from training data) and replayed
 * at scoring (plan §6.2).
 */
export interface ImputeFeatureStep extends FeatureStepBase {
  Kind: 'impute';
  /** Column to impute. */
  Column: string;
  /** Fill strategy. */
  Strategy: 'mean' | 'median' | 'mode' | 'constant';
  /** Fill value when `Strategy` is `constant`. */
  FillValue?: string | number;
}

/**
 * `standardize` — zero-mean/unit-variance scaling. Mean/std are fit on training
 * data and frozen onto the model.
 */
export interface StandardizeFeatureStep extends FeatureStepBase {
  Kind: 'standardize';
  /** Columns to standardize. */
  Columns: string[];
}

/**
 * `onehot` — expand a categorical column into indicator columns. The vocabulary
 * is fit at train time and frozen.
 */
export interface OneHotFeatureStep extends FeatureStepBase {
  Kind: 'onehot';
  /** Categorical column to one-hot encode. */
  Column: string;
}

/**
 * `bin` — discretize a numeric column into bins. Bin edges are fit at train time
 * and frozen.
 */
export interface BinFeatureStep extends FeatureStepBase {
  Kind: 'bin';
  /** Numeric column to bin. */
  Column: string;
  /** Number of bins to produce. */
  Bins: number;
}

/**
 * `embedding` — pull a persisted, version-pinned embedding for an entity and
 * expand it into one numeric feature per dimension (plan §5.2). The embedding is
 * never regenerated at scoring time.
 */
export interface EmbeddingFeatureStep extends FeatureStepBase {
  Kind: 'embedding';
  /** Entity whose persisted embedding is used. */
  Entity: string;
  /** Reference to the embedding model (an `MJ: AI Models` id/name) — pinned into model Lineage. */
  EmbeddingModelRef: string;
  /** Number of embedding dimensions (= number of numeric features produced). */
  Dims: number;
}

/**
 * `llm-derived` — features produced by an upstream **Feature Pipeline** (plan
 * §5.3 / §5.4). LLM-synthesized features are persisted and version-pinned, not
 * recomputed inline, to preserve determinism and avoid train/serve skew (§6.5).
 */
export interface LLMDerivedFeatureStep extends FeatureStepBase {
  Kind: 'llm-derived';
  /** Reference to the upstream Feature Pipeline that persisted these features. */
  FeaturePipelineRef: string;
  /** Explicit persisted column names populated by this Feature Pipeline. */
  Columns: string[];
}

/**
 * `flow-agent` — invoke an MJ Flow Agent per record, mapping record fields into
 * the agent and the agent's output back into features (plan §5.4). Provides
 * richer per-record branching than a plain transform.
 */
export interface FlowAgentFeatureStep extends FeatureStepBase {
  Kind: 'flow-agent';
  /** Reference to the Flow Agent (an `MJ: AI Agents` id/name) to invoke per record. */
  FlowAgentRef: string;
  /** Map of agent-input name → source feature/column name. */
  InputMapping: Record<string, string>;
  /** Map of output feature name → agent-output path. */
  OutputMapping: Record<string, string>;
}

/**
 * The structured output kind a {@link VisionLLMFeatureStep} extracts — the model
 * emits exactly one named value of this shape per row, which becomes the feature
 * column's value:
 *
 * - `category` → a single categorical label (e.g. `condition='damaged'`); the
 *   produced column is a categorical raw value (typically one-hot encoded by a
 *   downstream preprocessing step).
 * - `scalar` → a single numeric value the model reads off the image (e.g. an
 *   estimated count); the produced column is numeric.
 */
export type VisionLLMOutputKind = 'category' | 'scalar';

/**
 * `vision-llm` — **multimodal vision-LLM-as-feature** (plan §11 / §5.6, PS-MM-1).
 * For each row, a vision prompt is run over the row's image (URL or binary ref)
 * and its single structured output (a named category or scalar) becomes the
 * feature column's value.
 *
 * Unlike preprocessing steps (`impute`/`standardize`/`onehot`/`bin`), this step
 * is a **per-row, stateless extraction**: there is no fitted state — the same
 * prompt is applied to each row independently — so it is exempt from the
 * fit-once/apply-everywhere split and produces a RAW column directly, exactly
 * like `select`/`embedding` (see the executor for the full reasoning).
 */
export interface VisionLLMFeatureStep extends FeatureStepBase {
  Kind: 'vision-llm';
  /**
   * The row field holding the image to analyze — either a fully-qualified image
   * URL or a binary/data reference (e.g. a `data:image/...;base64,...` data URL).
   * Resolved per-row at assembly time; rows with a null/missing value yield a
   * null feature (no prompt is run).
   */
  ImageColumn: string;
  /**
   * The vision prompt to run over the image. Either a reference to a stored
   * `MJ: AI Prompts` row (id or name) or an inline prompt body. Exactly one form
   * is used; when both are set the inline body takes precedence.
   */
  Prompt: VisionPromptRef;
  /**
   * The expected structured output the model emits — the named scalar/category
   * that becomes this step's feature column.
   */
  Output: VisionLLMOutput;
  /**
   * Optional model override (an `MJ: AI Models` id/name) forcing a specific
   * vision-capable model. When omitted, the prompt's own model selection applies.
   * Pinned into the model's Lineage so scoring uses the same vision model.
   */
  ModelRef?: string;
}

/**
 * Reference to the vision prompt a {@link VisionLLMFeatureStep} runs. Exactly one
 * of `PromptRef` / `InlinePrompt` is used (inline wins when both are present).
 */
export interface VisionPromptRef {
  /** Reference to a stored `MJ: AI Prompts` row (id or name). */
  PromptRef?: string;
  /** Inline vision prompt body (used when no stored prompt is referenced). */
  InlinePrompt?: string;
}

/**
 * The structured output contract for a {@link VisionLLMFeatureStep} — names the
 * single value the model emits and the shape it takes.
 */
export interface VisionLLMOutput {
  /**
   * The feature column name produced from the model's output (also the key the
   * model is asked to emit in its structured response).
   */
  FeatureName: string;
  /** Whether the emitted value is a categorical label or a numeric scalar. */
  Kind: VisionLLMOutputKind;
  /**
   * Optional closed set of allowed categories (only meaningful when
   * `Kind === 'category'`). When provided, an out-of-set model response is
   * coerced to null so an unexpected label never silently enters the matrix.
   */
  AllowedCategories?: string[];
}

/**
 * A single node in the FeatureStep DAG — a discriminated union over `Kind`.
 */
export type FeatureStep =
  | SelectFeatureStep
  | ImputeFeatureStep
  | StandardizeFeatureStep
  | OneHotFeatureStep
  | BinFeatureStep
  | EmbeddingFeatureStep
  | LLMDerivedFeatureStep
  | FlowAgentFeatureStep
  | VisionLLMFeatureStep
  | WindowedAggregateFeatureStep
  | SeriesFeatureStep;

/**
 * The whole feature-engineering DAG for a pipeline — the frozen spec the
 * FeatureAssembly executor replays identically across training and scoring.
 */
export interface FeatureStepGraph {
  /** All steps in the graph; edges are expressed via each step's `Inputs`. */
  Steps: FeatureStep[];
}
