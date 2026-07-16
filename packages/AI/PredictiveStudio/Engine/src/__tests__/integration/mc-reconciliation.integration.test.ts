/**
 * THE INTEGRATION RECONCILIATION (PLAN.md A6.3/A6.7) — the single point where the
 * two pre-proven tracks meet.
 *
 * Track A (theory, standalone python) trained `gbt_core` on the ASOF_CORE feature
 * subset of More Cheese and audited holdout AUC = 0.737 (seed 201). This test
 * assembles the SAME features through the REAL infra — FeatureAssemblyExecutor
 * (DatedSourceSpec × 4 sources, as-of on StartDate, leakage deny-list) → the REAL
 * sidecar xgboost with the same hyperparameters and the EXACT same dev/holdout
 * split (indices exported from the Track-A run) — and reconciles:
 *
 *   (1) feature-matrix parity per numeric cell (boundary/semantic diffs REPORTED —
 *       the executor counts <= cutoff, Track A counted < cutoff; that difference
 *       is exactly what this reconciliation exists to surface), then
 *   (2) holdout AUC within |Δ| <= 0.02 of the standalone number.
 *
 * Both halves are pre-proven, so any failure here is an integration defect by
 * construction. Fixture: plans/predictive-studio-mcf/phase0/realdata/
 * mc_reconciliation_fixture.json (tables + split indices + reference).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { MatrixData, TrainRequest, PredictRequest, FeatureStepGraph, AsOfStrategy, LeakageGuard } from '@memberjunction/predictive-studio-core';
import { MLSidecar } from '@memberjunction/predictive-studio-sidecar';
import {
  FeatureAssemblyExecutor,
  type FeatureAssemblyParams,
  type IFeatureDataAccess,
  type FetchRowsParams,
  type FetchRowsResult,
  type SourceRow,
} from '../../feature-assembly';

const INTEGRATION_ENABLED = process.env.PS_INTEGRATION === '1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const VENV = path.resolve(HERE, '..', '..', '..', '..', 'Sidecar', '.venv', 'bin', 'python');
const FIXTURE = path.resolve(
  HERE, '..', '..', '..', '..', '..', '..', '..',
  'plans', 'predictive-studio-mcf', 'phase0', 'realdata', 'mc_reconciliation_fixture.json',
);
const SHOULD_RUN = INTEGRATION_ENABLED && existsSync(VENV) && existsSync(FIXTURE);

class InMemoryDataAccess implements IFeatureDataAccess {
  constructor(private readonly rowsByEntity: Record<string, SourceRow[]>) {}
  async fetchRows(params: FetchRowsParams): Promise<FetchRowsResult> {
    const rows = this.rowsByEntity[params.EntityName];
    return rows
      ? { Success: true, Rows: rows }
      : { Success: false, Rows: [], ErrorMessage: `No fixture for ${params.EntityName}` };
  }
  async fetchEmbedding(): Promise<number[] | null> { return null; }
}

function auc(yTrue: number[], scores: number[]): number {
  let nPos = 0, nConc = 0, nTied = 0;
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

describe.runIf(SHOULD_RUN)('More Cheese reconciliation — real infra vs Track-A standalone', () => {
  const fx = JSON.parse(readFileSync(FIXTURE, 'utf-8'));
  let sidecar: MLSidecar;

  beforeAll(async () => {
    sidecar = new MLSidecar({ pythonPath: VENV });
    await sidecar.start();
  }, 120_000);
  afterAll(async () => { await sidecar?.stop(); });

  it('assembles ASOF_CORE through the REAL executor, matrix-parity-checks, and reconciles holdout AUC', async () => {
    // ---- 1. REAL FeatureAssemblyExecutor over the fixture tables ----
    const steps: FeatureStepGraph = {
      Steps: [{ Id: 'select-1', Kind: 'select', Columns: ['dues_amount', 'auto_renew', 'tier', 'segment'] }],
    };
    // INTEGRATION FINDING (surfaced by this test's first run): the executor's
    // filterAsOf is INCLUSIVE (<= cutoff) while honest Track-A assembly counted
    // STRICTLY-before (<). On this schema dues orders/payments are written ON the
    // period start date — counting them is same-day leakage (the order at start may
    // BE the renewal). We express strict semantics through the inclusive primitive
    // by cutting at StartDate - 1 day (dates here are date-granular, so exact).
    // Framework follow-up recorded: DatedFeatureSpec needs an explicit boundary flag.
    const DAY = 86_400_000;
    const records = (fx.periods as SourceRow[]).map((p) => ({
      ...p,
      AsOfStrict: new Date(Date.parse(String(p.StartDate)) - DAY).toISOString(),
    }));
    const asOf: AsOfStrategy = { Mode: 'column', Column: 'AsOfStrict' };
    const leakageGuard: LeakageGuard = {
      DenyFields: ['Status', 'CancellationDate', 'CancellationReason', 'RenewalDate', 'EndDate', 'PeriodID'],
      SingleFeatureDominanceThreshold: 0.95,
    };
    const params: FeatureAssemblyParams = {
      targetEntityName: 'MembershipPeriod',
      records,
      sources: [{ Kind: 'Entity', Ref: 'MembershipPeriod' }],
      steps, asOf, leakageGuard,
      targetVariable: 'renewed',
      primaryKeyField: 'PersonID', // the dated-source join key (period → member history)
      datedSources: [
        { EntityName: 'EventRegistration', ForeignKeyField: 'PersonID', DateField: 'RegisteredOn',
          Features: [
            { OutputColumn: 'events_before', Aggregate: 'activity_count' },
            { OutputColumn: 'event_recency_days', Aggregate: 'days_since_last_activity' },
          ] },
        { EntityName: 'CourseEnrollment', ForeignKeyField: 'PersonID', DateField: 'EnrolledOn',
          Features: [{ OutputColumn: 'courses_before', Aggregate: 'activity_count' }] },
        { EntityName: 'Order', ForeignKeyField: 'PersonID', DateField: 'OrderDate',
          Features: [
            { OutputColumn: 'orders_before', Aggregate: 'activity_count' },
            { OutputColumn: 'order_recency_days', Aggregate: 'days_since_last_activity' },
          ] },
        { EntityName: 'Payment', ForeignKeyField: 'PersonID', DateField: 'PaymentDate',
          Features: [{ OutputColumn: 'payments_before', Aggregate: 'activity_count' }] },
      ],
      dataAccess: new InMemoryDataAccess(fx.tables),
    } as unknown as FeatureAssemblyParams;

    const executor = new FeatureAssemblyExecutor();
    const result = await executor.assemble(params);
    const cols = result.matrix.columns;
    expect(result.matrix.rows).toHaveLength(fx.periods.length);

    // ---- 2. matrix parity on the numeric as-of cells (diffs REPORTED, small allowed) ----
    const NUM = ['events_before', 'event_recency_days', 'courses_before',
                 'orders_before', 'order_recency_days', 'payments_before'];
    const colIdx = Object.fromEntries(cols.map((c, i) => [c, i]));
    let cells = 0, mismatches = 0;
    const exampleDiffs: string[] = [];
    for (let r = 0; r < fx.periods.length; r++) {
      for (const c of NUM) {
        const raw = result.matrix.rows[r][colIdx[c]];
        // integration-boundary mappings: executor emits null for "no prior activity"
        // (Track A: 9999 for recency, 0 for counts); and the strict-cutoff shift moves
        // the recency reference back one day, so days-since values sit exactly 1 below
        // Track A's — a constant shift, mapped here (+1), AUC-invariant in training
        const infra = raw == null
          ? (c.endsWith('_days') ? 9999 : 0)
          : Number(raw) + (c.endsWith('_days') ? 1 : 0);
        const ref = Number(fx.periods[r][c]);
        cells++;
        if (infra !== ref) {
          mismatches++;
          if (exampleDiffs.length < 5) exampleDiffs.push(`row ${r} ${c}: infra=${infra} trackA=${ref}`);
        }
      }
    }
    const parity = 1 - mismatches / cells;
    // eslint-disable-next-line no-console
    console.log(`[reconciliation] cell parity ${(parity * 100).toFixed(2)}% ` +
      `(${mismatches}/${cells} differ — expected source: <= vs < cutoff boundary). ` +
      `examples: ${exampleDiffs.join(' | ')}`);
    expect(parity).toBeGreaterThan(0.95);

    // ---- 3. same-split, same-hyperparameter train through the REAL sidecar ----
    const trainCols = [...NUM, 'dues_amount', 'auto_renew', 'tier', 'segment'];
    const toCell = (r: number, c: string) => {
      const raw = result.matrix.rows[r][colIdx[c]];
      if (raw == null) return c.endsWith('_days') ? 9999 : (c === 'tier' || c === 'segment' ? 'NA' : 0);
      return raw as number | string;
    };
    const buildMatrix = (idx: number[]): MatrixData => ({
      columns: [...trainCols, 'y'],
      rows: idx.map((r) => [...trainCols.map((c) => toCell(r, c)), fx.periods[r].renewed]),
    });
    const dev = buildMatrix(fx.dev_idx);
    const hold = buildMatrix(fx.hold_idx);

    const train: TrainRequest = {
      algorithm: 'xgboost', problem_type: 'classification',
      hyperparameters: { n_estimators: 250, max_depth: 4, learning_rate: 0.08, subsample: 0.9 },
      validation: { holdout_size: 0.0 },
      feature_schema: trainCols.map((c) => ({
        Name: c, Kind: c === 'tier' || c === 'segment' ? 'categorical' : 'numeric' })),
      preprocessing: [{ op: 'onehot', col: 'tier' }, { op: 'onehot', col: 'segment' }],
      target: 'y', data: dev, holdout: hold,
    } as unknown as TrainRequest;
    const res = await sidecar.train(train);

    let holdoutAuc = Number((res.holdout_metrics as Record<string, number> | undefined)?.auc ?? NaN);
    if (!Number.isFinite(holdoutAuc)) {
      const featOnly = hold.rows.map((r) => Object.fromEntries(trainCols.map((c, i) => [c, r[i]])));
      const pr: PredictRequest = {
        artifact_b64: res.artifact_b64, fitted_preprocessing: res.fitted_preprocessing,
        feature_schema: train.feature_schema, rows: featOnly,
      } as unknown as PredictRequest;
      const pres = await sidecar.predict(pr);
      holdoutAuc = auc(fx.hold_idx.map((r: number) => fx.periods[r].renewed), pres.predictions.map((p) => p.score));
    }
    const delta = holdoutAuc - fx.reference_auc_core_seed201;
    // eslint-disable-next-line no-console
    console.log(`[reconciliation] infra holdout AUC=${holdoutAuc.toFixed(3)} vs ` +
      `Track-A gbt_core=${fx.reference_auc_core_seed201} (Δ=${delta.toFixed(3)})`);
    expect(Math.abs(delta)).toBeLessThanOrEqual(0.02);
  }, 300_000);
});

describe.runIf(!SHOULD_RUN)('More Cheese reconciliation (skipped)', () => {
  it('needs PS_INTEGRATION=1 + sidecar venv + the exported fixture', () => {
    expect(true).toBe(true);
  });
});
