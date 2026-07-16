/**
 * @module composite-training-executor
 *
 * The **frozen cascade** — trains a composite model DAG without violating a single
 * MJ invariant (Doc 4 §1). Ports the proven cascade-spike mechanics to production:
 *
 *   - carve the locked holdout ONCE (the caller does this; we never re-carve)
 *   - topo-order the validated graph
 *   - per non-terminal node: /train on DEV → /predict SAME dev rows with the frozen
 *     child → adapt outputs to feature columns → append to the working dev matrix;
 *     separately /predict the holdout rows apply-frozen → append the same columns to
 *     the working holdout matrix. **No component ever fits on a holdout row.**
 *   - terminal node: /train on the augmented dev + forwarded augmented holdout →
 *     the holdout is scored EXACTLY ONCE, at the terminal.
 *
 * Lineage is N+1: each child is its own artifact; the parent is a CompositeManifest.
 * The graph MUST be pre-validated by `validateCompositeSpec` (the caller passes the
 * validated spec); this executor assumes legality and focuses on the cascade.
 */
import type {
  MatrixData,
  TrainRequest,
  TrainResponse,
  PredictRequest,
  PredictResponse,
  FeatureSchemaEntry,
  CompositeSpec,
  CompositeNode,
} from '@memberjunction/predictive-studio-core';

/** The train seam (mirrors ISidecarTrainer.train — holdout scored once). */
export type CompositeTrainFn = (req: TrainRequest, lockedHoldout?: MatrixData) => Promise<TrainResponse>;
/** The predict seam (mirrors ISidecarPredictor.predict — apply-frozen). */
export type CompositePredictFn = (req: PredictRequest) => Promise<PredictResponse>;

/** How a node's output maps into feature columns for downstream nodes. */
export interface NodeAdapter {
  /** The producing node id. */
  fromNode: string;
  /** Column name(s) the adapter appends (e.g. `cluster_0..k`, `nodeA_probability`). */
  toColumns: string[];
  /** Pull the per-row values for `toColumns` from a Prediction row. */
  extract: (p: PredictResponse['predictions'][number]) => number[];
}

export interface CompositeTrainParams {
  /** The pre-validated composite graph. */
  spec: CompositeSpec;
  /** Driver key per node id (the sidecar algorithm to train for that node). */
  nodeAlgorithm: Record<string, string>;
  /** problem_type per node id. */
  nodeProblemType: Record<string, 'classification' | 'regression'>;
  /** Hyperparameters per node id. */
  nodeHyperparameters?: Record<string, Record<string, unknown>>;
  /** Adapter per edge target — how each incoming node's output becomes columns. */
  adapters: NodeAdapter[];
  /** DEV matrix (training portion; holdout already carved out). Includes the target column. */
  devMatrix: MatrixData;
  /** Locked-holdout matrix (scored exactly once at the terminal). Includes the target column. */
  holdoutMatrix: MatrixData;
  /** Base feature columns (the assembled matrix columns, excluding the target). */
  baseFeatureColumns: string[];
  /** Target column name. */
  targetVariable: string;
  train: CompositeTrainFn;
  predict: CompositePredictFn;
}

/** One trained child in the cascade (its own immutable artifact). */
export interface CompositeChildResult {
  nodeId: string;
  component: string;
  algorithm: string;
  artifactB64: string;
  fittedPreprocessing: Record<string, unknown>;
  appendedColumns: string[];
}

/** The composite training result — N children + the terminal + the manifest. */
export interface CompositeTrainResult {
  children: CompositeChildResult[];
  terminal: {
    nodeId: string;
    artifactB64: string;
    fittedPreprocessing: Record<string, unknown>;
    holdoutMetrics?: Record<string, number>;
  };
  /** The queryable manifest (parent artifact): nodes, edges, topo order, exposed output. */
  manifest: CompositeManifest;
  /** Instrumentation: how many times the holdout was scored (MUST be 1). */
  holdoutScoringEvents: number;
}

/** The parent composite's serialized artifact — the wiring + child artifact refs. */
export interface CompositeManifest {
  nodes: Array<{ id: string; component: string; algorithm: string; artifactB64: string }>;
  edges: CompositeSpec['Edges'];
  topoOrder: string[];
  exposedOutputNode: string;
}

const MS = () => 0; // deterministic; no wall-clock in this module

/** Kahn topological order of the spec's nodes. */
function topoOrder(spec: CompositeSpec): string[] {
  const indeg = new Map<string, number>(spec.Nodes.map((n) => [n.ID, 0]));
  const adj = new Map<string, string[]>(spec.Nodes.map((n) => [n.ID, []]));
  for (const e of spec.Edges) {
    if (e.From !== e.To) {
      indeg.set(e.To, (indeg.get(e.To) ?? 0) + 1);
      adj.get(e.From)?.push(e.To);
    }
  }
  const q = [...indeg.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  const order: string[] = [];
  while (q.length) {
    const id = q.shift() as string;
    order.push(id);
    for (const nx of adj.get(id) ?? []) {
      const d = (indeg.get(nx) ?? 0) - 1;
      indeg.set(nx, d);
      if (d === 0) q.push(nx);
    }
  }
  return order;
}

/** Split a MatrixData into feature rows (dicts) excluding the target column. */
function featureRows(matrix: MatrixData, target: string): Array<Record<string, unknown>> {
  const cols = matrix.columns;
  const ti = cols.indexOf(target);
  return matrix.rows.map((r) =>
    Object.fromEntries(cols.map((c, i) => [c, r[i]]).filter(([c]) => c !== target)),
  );
}

/** Append adapter columns to a working matrix (immutably returns a new MatrixData). */
function appendColumns(
  matrix: MatrixData,
  newCols: string[],
  values: number[][],
): MatrixData {
  return {
    columns: [...matrix.columns, ...newCols],
    rows: matrix.rows.map((r, i) => [...r, ...values[i]]),
  };
}

/**
 * Train a composite DAG as a frozen cascade. Every non-terminal node fits on DEV
 * rows only and is applied frozen to the holdout; the terminal is trained on the
 * augmented dev with the augmented holdout forwarded for a single scoring.
 */
export async function trainComposite(params: CompositeTrainParams): Promise<CompositeTrainResult> {
  const { spec, adapters, targetVariable, train, predict } = params;
  const order = topoOrder(spec);
  const terminalId = spec.ExposedOutputNode;
  const nonTerminal = order.filter((id) => id !== terminalId);

  const nodeById = new Map<string, CompositeNode>(spec.Nodes.map((n) => [n.ID, n]));
  const adapterByNode = new Map<string, NodeAdapter>(adapters.map((a) => [a.fromNode, a]));

  // working matrices grow as each frozen child appends its adapter columns
  let workingDev = params.devMatrix;
  let workingHold = params.holdoutMatrix;
  let devFeatCols = [...params.baseFeatureColumns];

  const children: CompositeChildResult[] = [];
  let holdoutScoringEvents = 0;

  const schemaFor = (cols: string[]): FeatureSchemaEntry[] =>
    cols.map((c) => ({ Name: c, Kind: 'numeric' }));

  // ---- non-terminal nodes: train on DEV, apply frozen everywhere ----
  for (const nodeId of nonTerminal) {
    const node = nodeById.get(nodeId)!;
    const adapter = adapterByNode.get(nodeId);
    if (!adapter) continue; // a node with no downstream edge contributes nothing to the cascade

    const req: TrainRequest = {
      algorithm: params.nodeAlgorithm[nodeId],
      problem_type: params.nodeProblemType[nodeId],
      hyperparameters: params.nodeHyperparameters?.[nodeId] ?? {},
      validation: { strategy: 'train_test_split', holdout_size: 0 } as TrainRequest['validation'],
      feature_schema: schemaFor(devFeatCols),
      preprocessing: [],
      target: targetVariable,
      data: { columns: [...devFeatCols, targetVariable],
              rows: workingDev.rows.map((r) => selectCols(workingDev.columns, r, [...devFeatCols, targetVariable])) },
    } as unknown as TrainRequest;
    // NO holdout passed to a non-terminal child — it must never score the holdout
    const res = await train(req);

    // apply-frozen to DEV rows (to build the augmented dev matrix)
    const devPred = await predict(frozenPredict(res, devFeatCols, featureRowsOf(workingDev, devFeatCols)));
    // apply-frozen to HOLDOUT rows (never fit) — this is a predict, NOT a scoring event
    const holdPred = await predict(frozenPredict(res, devFeatCols, featureRowsOf(workingHold, devFeatCols)));

    const devVals = devPred.predictions.map((p) => adapter.extract(p));
    const holdVals = holdPred.predictions.map((p) => adapter.extract(p));
    workingDev = appendColumns(workingDev, adapter.toColumns, devVals);
    workingHold = appendColumns(workingHold, adapter.toColumns, holdVals);
    devFeatCols = [...devFeatCols, ...adapter.toColumns];

    children.push({
      nodeId, component: node.Component, algorithm: params.nodeAlgorithm[nodeId],
      artifactB64: res.artifact_b64, fittedPreprocessing: res.fitted_preprocessing,
      appendedColumns: adapter.toColumns,
    });
  }

  // ---- terminal: train on augmented DEV + forwarded augmented HOLDOUT (scored ONCE) ----
  const terminalNode = nodeById.get(terminalId)!;
  const devData: MatrixData = {
    columns: [...devFeatCols, targetVariable],
    rows: workingDev.rows.map((r) => selectCols(workingDev.columns, r, [...devFeatCols, targetVariable])),
  };
  const holdData: MatrixData = {
    columns: [...devFeatCols, targetVariable],
    rows: workingHold.rows.map((r) => selectCols(workingHold.columns, r, [...devFeatCols, targetVariable])),
  };
  const termReq: TrainRequest = {
    algorithm: params.nodeAlgorithm[terminalId],
    problem_type: params.nodeProblemType[terminalId],
    hyperparameters: params.nodeHyperparameters?.[terminalId] ?? {},
    validation: { strategy: 'train_test_split', holdout_size: 0 } as TrainRequest['validation'],
    feature_schema: schemaFor(devFeatCols),
    preprocessing: [],
    target: targetVariable,
    data: devData,
  } as unknown as TrainRequest;
  const termRes = await train(termReq, holdData);
  holdoutScoringEvents += 1; // the ONE holdout scoring event of the whole composite

  const manifest: CompositeManifest = {
    nodes: [...children.map((c) => ({ id: c.nodeId, component: c.component, algorithm: c.algorithm, artifactB64: c.artifactB64 })),
            { id: terminalId, component: terminalNode.Component, algorithm: params.nodeAlgorithm[terminalId], artifactB64: termRes.artifact_b64 }],
    edges: spec.Edges,
    topoOrder: order,
    exposedOutputNode: terminalId,
  };

  return {
    children,
    terminal: { nodeId: terminalId, artifactB64: termRes.artifact_b64,
                fittedPreprocessing: termRes.fitted_preprocessing, holdoutMetrics: termRes.holdout_metrics },
    manifest,
    holdoutScoringEvents,
  };
  void MS;
}

// ---- helpers ----
function selectCols(allCols: string[], row: MatrixData['rows'][number], want: string[]): MatrixData['rows'][number] {
  const idx = new Map(allCols.map((c, i) => [c, i]));
  return want.map((c) => row[idx.get(c) as number]);
}
function featureRowsOf(matrix: MatrixData, featCols: string[]): Array<Record<string, unknown>> {
  const idx = new Map(matrix.columns.map((c, i) => [c, i]));
  return matrix.rows.map((r) => Object.fromEntries(featCols.map((c) => [c, r[idx.get(c) as number]])));
}
function frozenPredict(res: TrainResponse, featCols: string[], rows: Array<Record<string, unknown>>): PredictRequest {
  return {
    artifact_b64: res.artifact_b64,
    fitted_preprocessing: res.fitted_preprocessing,
    feature_schema: featCols.map((c) => ({ Name: c, Kind: 'numeric' })),
    rows,
  } as unknown as PredictRequest;
}
