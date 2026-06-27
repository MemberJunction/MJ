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
  | 'flow-agent';

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
  | FlowAgentFeatureStep;

/**
 * The whole feature-engineering DAG for a pipeline — the frozen spec the
 * FeatureAssembly executor replays identically across training and scoring.
 */
export interface FeatureStepGraph {
  /** All steps in the graph; edges are expressed via each step's `Inputs`. */
  Steps: FeatureStep[];
}
