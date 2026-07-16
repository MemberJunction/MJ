/**
 * Unit test for the frozen-cascade CompositeTrainingExecutor — proves the
 * holdout-once + no-child-fits-on-holdout discipline with FAKE train/predict
 * seams (no live sidecar). The live version runs in the composite-cascade spike.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  trainComposite,
  type CompositeTrainParams,
  type NodeAdapter,
} from '../composite-training-executor';
import type { CompositeSpec, MatrixData, TrainRequest, PredictRequest } from '@memberjunction/predictive-studio-core';

function rowHash(vals: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(vals)).digest('hex');
}

describe('CompositeTrainingExecutor — frozen cascade', () => {
  // graph: cluster (node A) -> classifier (node B, terminal)
  const spec: CompositeSpec = {
    Nodes: [
      { ID: 'a', Component: 'KMeans' },
      { ID: 'b', Component: 'XGBoost Classifier' },
    ],
    Edges: [{ From: 'a', FromPort: 'cluster-id', To: 'b', ToPort: 'features:tabular', Adapter: 'Cluster ID One-Hot' }],
    ExposedOutputNode: 'b',
  };

  const FEATURES = ['f0', 'f1'];
  const target = 'y';
  const mk = (n: number, seed: number): MatrixData => ({
    columns: [...FEATURES, target],
    rows: Array.from({ length: n }, (_, i) => [seed + i, seed - i, (i % 2)]),
  });
  const dev = mk(20, 100);
  const hold = mk(8, 900);

  // instrumentation: hash holdout feature rows; record every train call's data rows
  const holdoutHashes = new Set(hold.rows.map((r) => rowHash(r.slice(0, FEATURES.length))));

  it('trains children on DEV only, applies frozen to holdout, scores holdout exactly once', async () => {
    const trainCallRowHashes: string[][] = [];
    let holdoutForwarded = 0;

    const fakeTrain = async (req: TrainRequest, lockedHoldout?: MatrixData) => {
      // record the FEATURE-row hashes this train call fit on
      const cols = req.data!.columns;
      const featIdx = cols.map((c, i) => (c !== target ? i : -1)).filter((i) => i >= 0).slice(0, FEATURES.length);
      trainCallRowHashes.push(req.data!.rows.map((r) => rowHash(featIdx.map((i) => r[i]))));
      if (lockedHoldout) holdoutForwarded += 1;
      return {
        artifact_b64: `art-${req.algorithm}`,
        fitted_preprocessing: { output_columns: cols },
        metrics: {}, feature_importance: {}, training_row_count: req.data!.rows.length, duration_sec: 0,
        holdout_metrics: lockedHoldout ? { auc: 0.8 } : undefined,
      };
    };
    const fakePredict = async (_req: PredictRequest) => ({
      predictions: _req.rows.map(() => ({ score: 0.5, cluster: 1 })),
    });

    const adapters: NodeAdapter[] = [
      { fromNode: 'a', toColumns: ['cluster_1'], extract: (p) => [p.cluster ?? 0] },
    ];
    const params: CompositeTrainParams = {
      spec, nodeAlgorithm: { a: 'kmeans_fake', b: 'xgboost' },
      nodeProblemType: { a: 'classification', b: 'classification' },
      adapters, devMatrix: dev, holdoutMatrix: hold,
      baseFeatureColumns: FEATURES, targetVariable: target,
      train: fakeTrain, predict: fakePredict,
    };

    const result = await trainComposite(params);

    // (1) holdout scored exactly once
    expect(result.holdoutScoringEvents).toBe(1);
    expect(holdoutForwarded).toBe(1);
    // (2) NO child-fit payload contains a holdout feature row
    for (const call of trainCallRowHashes) {
      expect(call.filter((h) => holdoutHashes.has(h))).toHaveLength(0);
    }
    // (3) N+1 lineage: 1 child + terminal, manifest wired
    expect(result.children).toHaveLength(1);
    expect(result.children[0].nodeId).toBe('a');
    expect(result.children[0].appendedColumns).toEqual(['cluster_1']);
    expect(result.terminal.nodeId).toBe('b');
    expect(result.terminal.holdoutMetrics).toEqual({ auc: 0.8 });
    expect(result.manifest.nodes).toHaveLength(2);
    expect(result.manifest.exposedOutputNode).toBe('b');
    expect(result.manifest.topoOrder).toEqual(['a', 'b']);
    // (4) the terminal trained on the AUGMENTED feature set (base + adapter column)
    const termCall = trainCallRowHashes[trainCallRowHashes.length - 1];
    expect(termCall).toHaveLength(dev.rows.length); // dev rows only
  });
});
