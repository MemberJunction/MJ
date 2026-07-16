/**
 * @module composite-inference-executor
 *
 * The scoring mirror of the frozen cascade (Doc 4 §1). Given a trained composite's
 * {@link CompositeManifest} and a set of rows, it runs each node's `/predict` in
 * topological order, apply-frozen (never fitting), applies the same adapters the
 * training executor used to append node outputs as feature columns, and returns
 * the exposed terminal node's predictions.
 *
 * It is the train-time cascade with the fitting removed — the invariant that makes
 * composite scoring correct: identical node order, identical adapters, apply-frozen
 * throughout.
 */
import type { PredictRequest, PredictResponse } from '@memberjunction/predictive-studio-core';
import type { CompositeManifest } from '../training/composite-training-executor';
import type { NodeAdapter, CompositePredictFn } from '../training/composite-training-executor';

export interface CompositeInferParams {
  manifest: CompositeManifest;
  /** fitted_preprocessing per node id (from the trained children + terminal). */
  fittedByNode: Record<string, Record<string, unknown>>;
  /** adapters (same as training) keyed by producing node. */
  adapters: NodeAdapter[];
  /** base feature columns (the assembled matrix columns). */
  baseFeatureColumns: string[];
  /** rows to score (feature dicts keyed by base column). */
  rows: Array<Record<string, unknown>>;
  predict: CompositePredictFn;
}

/** Score rows through a trained composite, apply-frozen, in topo order. */
export async function inferComposite(params: CompositeInferParams): Promise<PredictResponse> {
  const { manifest, adapters, predict } = params;
  const adapterByNode = new Map(adapters.map((a) => [a.fromNode, a]));
  const artifactByNode = new Map(manifest.nodes.map((n) => [n.id, n.artifactB64]));

  // working rows grow as each frozen node appends its adapter columns
  let workingRows = params.rows.map((r) => ({ ...r }));
  let featCols = [...params.baseFeatureColumns];
  const terminalId = manifest.exposedOutputNode;

  for (const nodeId of manifest.topoOrder) {
    const req: PredictRequest = {
      artifact_b64: artifactByNode.get(nodeId),
      fitted_preprocessing: params.fittedByNode[nodeId] ?? {},
      feature_schema: featCols.map((c) => ({ Name: c, Kind: 'numeric' })),
      rows: workingRows.map((r) => Object.fromEntries(featCols.map((c) => [c, r[c]]))),
    } as unknown as PredictRequest;
    const res = await predict(req);

    if (nodeId === terminalId) {
      return res; // the exposed output — done
    }
    const adapter = adapterByNode.get(nodeId);
    if (!adapter) continue; // non-contributing intermediate node
    workingRows = workingRows.map((r, i) => {
      const vals = adapter.extract(res.predictions[i]);
      const add = Object.fromEntries(adapter.toColumns.map((c, j) => [c, vals[j]]));
      return { ...r, ...add };
    });
    featCols = [...featCols, ...adapter.toColumns];
  }
  // topoOrder should always end at the terminal; if not, the manifest is malformed
  throw new Error(`inferComposite: topo order did not reach the exposed output node '${terminalId}'`);
}
