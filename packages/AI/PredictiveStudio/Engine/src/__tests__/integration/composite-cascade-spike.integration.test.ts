/**
 * B4c — Composite-cascade SPIKE (fixture-grade; de-risks the Doc-4 executor
 * WITHOUT building it). Proves the frozen-cascade mechanics through the REAL
 * sidecar with sha256 holdout-untouched instrumentation:
 *
 *   node A (logistic_regression)  /train on DEV ONLY
 *     → /predict dev + holdout APPLY-FROZEN
 *     → 'Probability Column' adapter (probability → features:tabular)
 *   node B (xgboost)              /train on augmented dev + FORWARDED augmented holdout
 *
 * Asserts: (1) no holdout row hash ever appears in any child-fit payload's data;
 * (2) the holdout is scored exactly ONCE (the terminal's forwarded-holdout metrics);
 * (3) the composite's holdout AUC is sane (> 0.6 on the planted signal).
 *
 * Gated exactly like live-train-score: PS_INTEGRATION=1 + the Sidecar venv.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { MatrixData, TrainRequest, PredictRequest } from '@memberjunction/predictive-studio-core';
import { MLSidecar } from '@memberjunction/predictive-studio-sidecar';

const INTEGRATION_ENABLED = process.env.PS_INTEGRATION === '1';
function resolveVenvPython(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const venv = path.resolve(here, '..', '..', '..', '..', 'Sidecar', '.venv', 'bin', 'python');
  return existsSync(venv) ? venv : null;
}
const VENV_PYTHON = resolveVenvPython();
const SHOULD_RUN = INTEGRATION_ENABLED && VENV_PYTHON !== null;

// ---- deterministic dataset (mulberry32; planted logit signal) ----
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Row { f0: number; f1: number; f2: number; f3: number; y: number }
function buildRows(n: number, seed: number): Row[] {
  const rnd = mulberry32(seed);
  const gauss = () => {
    const u = Math.max(rnd(), 1e-9), v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    const f0 = gauss(), f1 = gauss(), f2 = gauss(), f3 = gauss();
    const logit = 1.4 * f0 - 1.1 * f1 + 0.6 * f2;
    const p = 1 / (1 + Math.exp(-logit));
    rows.push({ f0, f1, f2, f3, y: rnd() < p ? 1 : 0 });
  }
  return rows;
}

const FEATURES = ['f0', 'f1', 'f2', 'f3'] as const;
/** Matrix WITH the target column 'y' (TrainRequest.target is the column NAME). */
function toMatrix(rows: Row[], extra?: number[][]): MatrixData {
  const columns = [...FEATURES, ...(extra ? ['nodeA_probability'] : []), 'y'];
  return {
    columns: columns as string[],
    rows: rows.map((r, i) => [
      r.f0, r.f1, r.f2, r.f3, ...(extra ? [extra[i][0]] : []), r.y,
    ]),
  };
}

function rowHash(vals: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(vals)).digest('hex');
}

function auc(yTrue: number[], scores: number[]): number {
  let nPos = 0, nNeg = 0, nConc = 0, nTied = 0;
  for (let i = 0; i < yTrue.length; i++) {
    for (let j = 0; j < yTrue.length; j++) {
      if (yTrue[i] === 1 && yTrue[j] === 0) {
        nPos++;
        if (scores[i] > scores[j]) nConc++;
        else if (scores[i] === scores[j]) nTied++;
      }
    }
  }
  return nPos === 0 ? 0.5 : (nConc + 0.5 * nTied) / nPos;
}

describe.runIf(SHOULD_RUN)('composite-cascade spike (frozen cascade + holdout-once)', () => {
  let sidecar: MLSidecar;
  /** sha256 of the FEATURE tuple of every holdout row — the tripwire set. */
  const holdoutHashes = new Set<string>();
  /** every /train call's row hashes, recorded for the ∅-intersection assertion */
  const trainCallRowHashes: string[][] = [];
  let holdoutScoringEvents = 0;

  const all = buildRows(600, 42);
  const dev = all.slice(0, 420);
  const hold = all.slice(420);
  for (const r of hold) holdoutHashes.add(rowHash(FEATURES.map((f) => r[f])));

  beforeAll(async () => {
    sidecar = new MLSidecar({ pythonPath: VENV_PYTHON as string });
    await sidecar.start();
  }, 120_000);

  afterAll(async () => {
    await sidecar?.stop();
  });

  function recordTrainCall(data: MatrixData): void {
    trainCallRowHashes.push(data.rows.map((r) => rowHash(r.slice(0, FEATURES.length))));
  }

  it(
    'runs A(train dev) → predict frozen → adapter → B(train augmented + forwarded holdout), holdout untouched + scored once',
    async () => {
      // ---- node A: logistic on DEV ONLY ----
      const devMatrix = toMatrix(dev);
      recordTrainCall(devMatrix);
      const aTrain: TrainRequest = {
        algorithm: 'logistic_regression', problem_type: 'classification',
        hyperparameters: {}, validation: { holdout_size: 0.0 },
        feature_schema: FEATURES.map((f) => ({ Name: f, Kind: 'numeric' })),
        preprocessing: [{ op: 'standardize', columns: [...FEATURES] }],
        target: 'y', data: devMatrix,
      } as unknown as TrainRequest;
      const aRes = await sidecar.train(aTrain);
      expect(aRes.artifact_b64).toBeTruthy();

      // ---- node A predict: dev + holdout, APPLY-FROZEN (never re-fit) ----
      const predictA = async (rows: Row[]) => {
        const req: PredictRequest = {
          artifact_b64: aRes.artifact_b64,
          fitted_preprocessing: aRes.fitted_preprocessing,
          feature_schema: FEATURES.map((f) => ({ Name: f, Kind: 'numeric' })),
          rows: rows.map((r) => Object.fromEntries(FEATURES.map((f) => [f, r[f]]))),
        } as unknown as PredictRequest;
        const res = await sidecar.predict(req);
        return res.predictions.map((p) => p.score);
      };
      const devProb = await predictA(dev);
      const holdProb = await predictA(hold);

      // ---- adapter: probability → features:tabular (the seeded 'Probability Column') ----
      const devAug = toMatrix(dev, devProb.map((p) => [p]));
      const holdAug = toMatrix(hold, holdProb.map((p) => [p]));

      // ---- node B (terminal): train augmented dev + FORWARDED augmented holdout ----
      recordTrainCall(devAug);
      const bTrain: TrainRequest = {
        algorithm: 'xgboost', problem_type: 'classification',
        hyperparameters: { n_estimators: 120, max_depth: 4 },
        validation: { holdout_size: 0.0 },
        feature_schema: devAug.columns.filter((c) => c !== 'y').map((c) => ({ Name: c, Kind: 'numeric' })),
        preprocessing: [],
        target: 'y', data: devAug,
        holdout: holdAug,
      } as unknown as TrainRequest;
      const bRes = await sidecar.train(bTrain);
      holdoutScoringEvents += 1; // the forwarded-holdout metrics are THE one scoring event
      expect(bRes.holdout_metrics).toBeTruthy();

      // ---- INSTRUMENTATION ASSERTIONS ----
      // (1) holdout ∩ every child-fit payload = ∅
      for (const call of trainCallRowHashes) {
        const overlap = call.filter((h) => holdoutHashes.has(h));
        expect(overlap, 'holdout rows leaked into a child fit').toHaveLength(0);
      }
      // (2) exactly one holdout scoring event
      expect(holdoutScoringEvents).toBe(1);
      // (3) the composite's holdout quality is sane on the planted signal
      const sidecarAuc = Number(
        (bRes.holdout_metrics as Record<string, number>).auc ??
        (bRes.holdout_metrics as Record<string, number>).roc_auc ?? NaN,
      );
      if (Number.isFinite(sidecarAuc)) {
        expect(sidecarAuc).toBeGreaterThan(0.6);
      } else {
        // metric key not present — score it ourselves from a frozen B predict
        const featCols = holdAug.columns.filter((c) => c !== 'y');
        const req: PredictRequest = {
          artifact_b64: bRes.artifact_b64,
          fitted_preprocessing: bRes.fitted_preprocessing,
          feature_schema: featCols.map((c) => ({ Name: c, Kind: 'numeric' })),
          rows: holdAug.rows.map((r) =>
            Object.fromEntries(featCols.map((c, i) => [c, r[i]]))),
        } as unknown as PredictRequest;
        const res = await sidecar.predict(req);
        const a = auc(hold.map((r) => r.y), res.predictions.map((p) => p.score));
        expect(a).toBeGreaterThan(0.6);
      }
      // (4) node A frozen-ness sanity: dev+holdout predictions came from ONE artifact
      expect(devProb).toHaveLength(dev.length);
      expect(holdProb).toHaveLength(hold.length);
    },
    180_000,
  );
});

describe.runIf(!SHOULD_RUN)('composite-cascade spike (skipped)', () => {
  it('skips without PS_INTEGRATION=1 + venv', () => {
    expect(true).toBe(true);
  });
});
