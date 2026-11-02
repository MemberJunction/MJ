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
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { GateRecords, type PreAuthDownload } from '@memberjunction/predictive-studio-core';
import { MLSidecar } from '@memberjunction/predictive-studio-sidecar';
import { MJSidecarTrainer } from '../../training';
import type { SourceRow } from '../../feature-assembly';
import { TableDataAccess } from '../fakes/table-data-access';
import { InMemorySnapshotFileStore, PreAuthDownloads } from '../../snapshot/snapshot-file-store';
import { FakeEvaluationProtocolStore, TrainingHarness } from '../fakes/training-fakes';
import { ProtocolRowFixture } from '../../training/__tests__/fixtures/protocol-row';
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

/** The protocol and algorithm IDs this test trains with: UUIDs, as the trainer's request schema requires. */
const LIVE_PROTOCOL_ID = '7e1a3c52-4b6d-4f80-9a21-5c3d8e9f0b14';
const LIVE_ALGORITHM_ID = 'c4b2e8d1-9f3a-4e57-b6c0-2a1d7f8e3b95';

/**
 * The in-memory snapshot store, with downloads the real trainer can open: each file is written to a temporary directory
 * and issued as a `file://` URL (the trainer opens http, https and file URLs, never `data:`).
 */
class FileUrlSnapshotFileStore extends InMemorySnapshotFileStore {
  constructor(private readonly dir: string) {
    super('provider-local');
  }

  public override async CreatePreAuthDownload(fileId: string, sha256: string, now?: Date): Promise<PreAuthDownload> {
    const file = path.join(this.dir, fileId);
    writeFileSync(file, await this.Get(fileId));
    return PreAuthDownloads.IssuedDownload(fileId, pathToFileURL(file).href, sha256, null, now);
  }
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
 * Yearly membership rows over the `UnitYearsWorld` schema for the 2024, 2025 and 2026 cycles (the protocol fixture carves the
 * 2025 cycle as the locked holdout), with the renewal driven by `EventsAttended`, so a model has signal to find.
 */
function generatedYears(perCycle: number): SourceRow[] {
  const rng = makePrng(42);
  const rows: SourceRow[] = [];
  for (const cycle of [2024, 2025, 2026]) {
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
  let snapshotDir: string;

  beforeAll(async () => {
    sidecar = new MLSidecar({ pythonPath: VENV_PYTHON ?? undefined });
    await sidecar.Start();
    snapshotDir = mkdtempSync(path.join(tmpdir(), 'ps-live-snapshots-'));
  }, 60_000);

  afterAll(async () => {
    if (sidecar) await sidecar.Stop();
    if (snapshotDir) rmSync(snapshotDir, { recursive: true, force: true });
  });

  it('trains a unit pipeline under its protocol, stores the gate decision and creates the model row of what ships', async () => {
    const years = generatedYears(400);
    const harness = TrainingHarness.ForUnit(years, UnitYearsWorld.UnitColumns());
    harness.deps.dataAccess = new TableDataAccess(UnitYearsWorld.Tables(years));
    harness.deps.trainer = new MJSidecarTrainer(sidecar);
    // The real trainer validates every ID in the request as a UUID, so the protocol and the algorithm get real ones.
    harness.pipeline.AlgorithmID = LIVE_ALGORITHM_ID;
    harness.pipeline.EvaluationProtocolID = LIVE_PROTOCOL_ID;
    harness.deps.snapshotFiles = new FileUrlSnapshotFileStore(snapshotDir);
    harness.deps.protocols = new FakeEvaluationProtocolStore([ProtocolRowFixture.Row({ MinMinorityClassRows: 1, ID: LIVE_PROTOCOL_ID, LineageRootID: LIVE_PROTOCOL_ID })]);
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
