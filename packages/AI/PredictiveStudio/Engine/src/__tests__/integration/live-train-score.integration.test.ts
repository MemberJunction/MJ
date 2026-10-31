/**
 * @module __tests__/integration/live-train-score
 *
 * **Evergreen end-to-end integration test** for Predictive Studio training: a Prediction Unit pipeline trained under
 * its Evaluation Protocol through the REAL Python sidecar's trainer (`/trainer`), nothing about the ML mocked.
 *
 * ```
 *   generated yearly membership rows (in-memory table data access)
 *     → REAL unit row reader + as-of assembly + Training Snapshot (in-memory file store)
 *     → REAL TrainingEngine → REAL MJSidecarTrainer → REAL MLSidecar (managed spawn of the bundled Python)
 *     → the gate decision decided in TypeScript, the shipped artifact stored, the model row created
 * ```
 *
 * Only the persistence seams are faked (entity factory, record loader, artifact and snapshot stores), so the test needs
 * **no database**.
 *
 * ## Opt-in (CI-safe by default)
 * Gated behind `PS_INTEGRATION=1`, so the normal `npm run test` never spins up Python. Run it with:
 *
 * ```bash
 *   cd packages/AI/PredictiveStudio/Sidecar && npm run setup:python   # once, to build the venv
 *   cd packages/AI/PredictiveStudio/Engine   && npm run test:integration
 * ```
 *
 * The venv lives at `packages/AI/PredictiveStudio/Sidecar/.venv`; when it (or `PREDICTIVE_STUDIO_PYTHON`) is missing the
 * suite skips with a note rather than failing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GateRecords } from '@memberjunction/predictive-studio-core';
import { MLSidecar } from '@memberjunction/predictive-studio-sidecar';
import { MJSidecarTrainer } from '../../training';
import type { SourceRow } from '../../feature-assembly';
import { TableDataAccess } from '../fakes/table-data-access';
import { TrainingHarness } from '../fakes/training-fakes';
import { UnitYearsWorld } from '../fakes/unit-years-world';

const INTEGRATION_ENABLED = process.env.PS_INTEGRATION === '1';

/** The sidecar interpreter: PREDICTIVE_STUDIO_PYTHON when set, else the bundled Sidecar venv; null when neither exists. */
function resolveVenvPython(): string | null {
  const fromEnv = process.env.PREDICTIVE_STUDIO_PYTHON?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return existsSync(fromEnv) ? fromEnv : null;
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const venv = path.resolve(here, '..', '..', '..', '..', 'Sidecar', '.venv', 'bin', 'python');
  return existsSync(venv) ? venv : null;
}

const VENV_PYTHON = resolveVenvPython();
const SHOULD_RUN = INTEGRATION_ENABLED && VENV_PYTHON !== null;

if (INTEGRATION_ENABLED && VENV_PYTHON === null) {
  // eslint-disable-next-line no-console
  console.warn('[PS integration] PS_INTEGRATION=1 but the sidecar venv was not found; run `npm run setup:python` in the Sidecar package. Skipping.');
}

/** A deterministic generator (mulberry32), so the generated rows and the carve are the same on every run. */
function makePrng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Yearly membership rows over the `UnitYearsWorld` schema for the 2024 and 2025 cycles (the protocol fixture carves the
 * 2025 cycle as the locked holdout), with the renewal driven by `EventsAttended`, so a model has signal to find.
 */
function generatedYears(perCycle: number): SourceRow[] {
  const rng = makePrng(42);
  const rows: SourceRow[] = [];
  for (const cycle of [2024, 2025]) {
    for (let i = 0; i < perCycle; i++) {
      const events = Math.floor(rng() * 12);
      const renewed = rng() < 0.15 + 0.06 * events;
      rows.push({ ID: `y${cycle}-${i}`, PersonID: `p${i % 4}`, StartDate: `${cycle}-01-01`, EventsAttended: events, Region: i % 2 === 0 ? 'EU' : 'US', Renewed: renewed });
    }
  }
  return rows;
}

describe.runIf(SHOULD_RUN)('Predictive Studio — live end-to-end training through the real sidecar trainer', () => {
  let sidecar: MLSidecar;

  beforeAll(async () => {
    sidecar = new MLSidecar({ pythonPath: VENV_PYTHON ?? undefined });
    await sidecar.Start();
  }, 60_000);

  afterAll(async () => {
    if (sidecar) await sidecar.Stop();
  });

  it('trains a unit pipeline under its protocol, stores the gate decision and creates the model row of what ships', async () => {
    const years = generatedYears(400);
    const harness = TrainingHarness.ForUnit(years, UnitYearsWorld.UnitColumns());
    harness.deps.dataAccess = new TableDataAccess(UnitYearsWorld.Tables(years));
    harness.deps.trainer = new MJSidecarTrainer(sidecar);
    const { model, run } = await harness.engine.trainModel({ pipelineId: harness.pipeline.ID }, harness.deps);
    const gate = GateRecords.ParseStoredGateRecord(run.ValidationResults);
    expect(run.Status).toBe('Completed');
    expect(gate).not.toBeNull();
    expect(gate?.holdoutRows).toBe(400);
    // A decision that ships an artifact creates the model row from it; no-signal ships nothing.
    if (gate?.decision.outcome === 'no-signal') expect(model).toBeNull();
    else expect(JSON.parse(model?.Lineage || '{}')).toMatchObject({ artifactFormat: 'ps-predictor/v2', trainingSnapshotId: run.TrainingSnapshotID });
  }, 300_000);
});
