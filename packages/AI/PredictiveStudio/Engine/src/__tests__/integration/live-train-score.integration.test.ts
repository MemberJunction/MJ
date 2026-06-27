/**
 * @module __tests__/integration/live-train-score
 *
 * **Evergreen end-to-end integration test** for Predictive Studio.
 *
 * This proves the WHOLE stack works for real (nothing about the ML is mocked):
 *
 * ```
 *   synthetic dataset
 *     → REAL FeatureAssemblyExecutor (in-memory IFeatureDataAccess source)
 *     → REAL TrainingEngine
 *         → REAL MLSidecar (managed spawn of the bundled Python: xgboost / logistic / ridge)
 *     → in-memory ML Model artifact (persistence seams faked, training is REAL)
 *     → REAL MLModelInferenceProcessor → REAL MLSidecar /predict
 * ```
 *
 * The ONLY things faked are the persistence seams (entity factory, record loader,
 * artifact store/loader) so the test needs **no database**. The sidecar,
 * FeatureAssembly, TrainingEngine, and the inference processor are all the real
 * production code paths.
 *
 * ## Opt-in (CI-safe by default)
 * This suite is gated behind `PS_INTEGRATION=1` so the normal fast `npm run test`
 * (pure unit, no sidecar) never spins up Python. Run it explicitly with:
 *
 * ```bash
 *   cd packages/AI/PredictiveStudio/Sidecar && npm run setup:python   # once, to build the venv
 *   cd packages/AI/PredictiveStudio/Engine   && npm run test:integration
 * ```
 *
 * The venv lives at `packages/AI/PredictiveStudio/Sidecar/.venv`. If it (or
 * Python) is missing, the suite **skips gracefully** with a clear console note
 * rather than hard-failing — so an environment without Python is never broken by
 * this test.
 *
 * ## No secrets / DB-free
 * This test never touches the database, so no DB credentials are needed and none
 * are hardcoded. If a future DB-backed variant ever needs creds, read them from
 * the repo-root `.env` via `process.env` (e.g. dotenv) — **never** hardcode
 * secrets here.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BaseEntity, UserInfo, IMetadataProvider } from '@memberjunction/core';
import type { MJMLModelEntity, MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import type {
  PredictRequest,
  PredictResponse,
  ModelMetrics,
  SourceBinding,
  FeatureStepGraph,
  AsOfStrategy,
  LeakageGuard,
  ValidationStrategy,
  ProblemType,
} from '@memberjunction/predictive-studio-core';
import { MLSidecar } from '@memberjunction/predictive-studio-sidecar';

import {
  TrainingEngine,
  InMemoryArtifactStore,
  MJSidecarTrainer,
  type IEntityFactory,
  type IRecordLoader,
  type TrainingDeps,
  type TrainModelInput,
} from '../../training';
import { MLModelInferenceProcessor, InMemoryArtifactLoader, type IMLModelLoader, type ISidecarPredictor, type MLInferenceDeps } from '../../scoring';
import {
  FeatureAssemblyExecutor,
  type FeatureAssemblyParams,
  type FeatureAssemblyResult,
  type IFeatureDataAccess,
  type FetchRowsParams,
  type FetchRowsResult,
  type SourceRow,
} from '../../feature-assembly';
import type { RecordRef, RecordProcessorContext } from '@memberjunction/record-set-processor-base';

// region: opt-in + venv availability ----------------------------------------

const INTEGRATION_ENABLED = process.env.PS_INTEGRATION === '1';

/** Resolve the bundled Sidecar venv python; null when it doesn't exist. */
function resolveVenvPython(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // …/Engine/src/__tests__/integration → up to PredictiveStudio, then Sidecar/.venv
  const venv = path.resolve(here, '..', '..', '..', '..', 'Sidecar', '.venv', 'bin', 'python');
  return existsSync(venv) ? venv : null;
}

const VENV_PYTHON = resolveVenvPython();

// Decide whether to actually run. If opt-in is off, the whole describe is skipped
// quietly. If opt-in is ON but the venv is missing, we still skip (gracefully)
// after printing a clear note, so we never hard-fail an env without Python.
const SHOULD_RUN = INTEGRATION_ENABLED && VENV_PYTHON !== null;

if (INTEGRATION_ENABLED && VENV_PYTHON === null) {
  // eslint-disable-next-line no-console
  console.warn(
    '[PS integration] PS_INTEGRATION=1 but the sidecar venv was not found at ' +
      'packages/AI/PredictiveStudio/Sidecar/.venv. Run `npm run setup:python` in the Sidecar ' +
      'package first. Skipping the live train+score integration suite.',
  );
}

if (!INTEGRATION_ENABLED) {
  // eslint-disable-next-line no-console
  console.info('[PS integration] Skipping live train+score suite (set PS_INTEGRATION=1 to enable; ' + 'requires the Sidecar venv — `npm run setup:python`).');
}

// region: synthetic dataset --------------------------------------------------

/**
 * A single synthetic "member" row carrying a learnable renewal signal plus some
 * pure noise. The relationship is real but not trivially separable, so a holdout
 * AUC ≥ ~0.7 genuinely exercises the model.
 */
interface MemberRow extends SourceRow {
  ID: string;
  tenure_months: number;
  events_attended: number;
  logins_last_90d: number;
  noise: number;
  Renewed: number; // 1 = renewed, 0 = lapsed (the classification label)
  SatisfactionScore: number; // continuous regression label
}

/**
 * Deterministic PRNG (mulberry32) so the synthetic data — and therefore the
 * metrics — are reproducible across runs. Evergreen tests must not flake on a
 * lucky/unlucky random seed.
 */
function makePrng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller standard-normal noise from a uniform PRNG. */
function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Build a realistic-but-synthetic dataset with a genuinely learnable relationship:
 * longer tenure + more events + more recent logins → higher renewal odds (via a
 * logistic link with added noise), and a continuous satisfaction score driven by
 * the same engagement signal. ~`count` rows.
 */
function buildDataset(count: number): MemberRow[] {
  const rng = makePrng(1234567);
  const rows: MemberRow[] = [];
  for (let i = 0; i < count; i++) {
    const tenure = Math.round(rng() * 60); // 0..60 months
    const events = Math.round(rng() * 20); // 0..20 events
    const logins = Math.round(rng() * 50); // 0..50 logins in last 90d
    const noise = gaussian(rng);

    // Engagement signal (standardized-ish) that drives BOTH labels.
    const signal = 0.05 * (tenure - 30) + 0.18 * (events - 10) + 0.06 * (logins - 25);

    // Classification label via a logistic link + label noise.
    const logit = signal + 0.6 * gaussian(rng);
    const p = 1 / (1 + Math.exp(-logit));
    const renewed = rng() < p ? 1 : 0;

    // Regression label: satisfaction (0..100) driven by the same signal + noise.
    const satisfaction = clamp(60 + 12 * signal + 6 * gaussian(rng), 0, 100);

    rows.push({
      ID: `m${i}`,
      tenure_months: tenure,
      events_attended: events,
      logins_last_90d: logins,
      noise,
      Renewed: renewed,
      SatisfactionScore: Math.round(satisfaction * 10) / 10,
    });
  }
  return rows;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// region: in-memory FeatureAssembly data source ------------------------------

/**
 * In-memory {@link IFeatureDataAccess} — feeds the REAL FeatureAssemblyExecutor
 * synthetic rows instead of a database/RunView. This is the legitimate seam the
 * executor exposes for exactly this purpose.
 */
class InMemoryDataAccess implements IFeatureDataAccess {
  constructor(private readonly rowsByEntity: Record<string, SourceRow[]>) {}

  async fetchRows(params: FetchRowsParams): Promise<FetchRowsResult> {
    const rows = this.rowsByEntity[params.EntityName];
    if (!rows) {
      return { Success: false, Rows: [], ErrorMessage: `No fixture for ${params.EntityName}` };
    }
    const capped = params.MaxRows && params.MaxRows > 0 ? rows.slice(0, params.MaxRows) : rows;
    return { Success: true, Rows: capped };
  }

  async fetchEmbedding(): Promise<number[] | null> {
    return null; // this dataset uses only scalar select features
  }
}

// region: in-memory persistence fakes (NO DB) --------------------------------

/**
 * A minimal recording stand-in for a BaseEntity. It stores every assigned field
 * in a backing map and exposes a stable `ID`, a `Save()` that always succeeds,
 * and a `LatestResult`. The TrainingEngine only assigns properties + calls
 * `Save()` / reads `ID` / `LatestResult`, so this faithfully captures the row
 * the engine would have persisted — without a database.
 *
 * The single cast to the entity type happens at the {@link FakeEntityFactory}
 * seam boundary (the engine is typed against the entity interface); this is the
 * documented place where a test fake substitutes for a real BaseEntity.
 */
class RecordingEntity {
  private static seq = 0;
  public ID: string;
  public readonly Fields: Record<string, unknown> = {};
  public readonly LatestResult = { Success: true, CompleteMessage: '' };

  constructor(public readonly EntityName: string) {
    this.ID = `${entityShortKey(EntityName)}-${++RecordingEntity.seq}`;
  }

  public async Save(): Promise<boolean> {
    return true;
  }

  public GetAll(): Record<string, unknown> {
    return { ID: this.ID, ...this.Fields };
  }
}

function entityShortKey(entityName: string): string {
  return (
    entityName
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase()
      .slice(0, 12) || 'ent'
  );
}

/**
 * A Proxy that forwards arbitrary property reads/writes onto a
 * {@link RecordingEntity}'s backing map (except the few real members: ID, Save,
 * LatestResult, GetAll, Fields, EntityName). This lets the strongly-typed engine
 * assign `model.FittedPreprocessing = …`, `run.Status = …`, etc. and have them
 * recorded, while `model.ID` returns the generated id.
 */
function makeEntityProxy(entity: RecordingEntity): RecordingEntity {
  const reserved = new Set(['ID', 'Save', 'LatestResult', 'GetAll', 'Fields', 'EntityName']);
  return new Proxy(entity, {
    get(target, prop: string | symbol) {
      if (typeof prop === 'string' && !reserved.has(prop)) {
        if (prop in target.Fields) {
          return target.Fields[prop];
        }
      }
      return Reflect.get(target, prop);
    },
    set(target, prop: string | symbol, value: unknown) {
      if (typeof prop === 'string' && !reserved.has(prop)) {
        target.Fields[prop] = value;
        return true;
      }
      return Reflect.set(target, prop, value);
    },
  });
}

/**
 * In-memory {@link IEntityFactory}. Produces recording proxies and keeps the last
 * model + run it created so the test can read them back. No database.
 */
class FakeEntityFactory implements IEntityFactory {
  public readonly Created: RecordingEntity[] = [];

  public async getEntityObject<T extends BaseEntity>(entityName: string): Promise<T> {
    const base = new RecordingEntity(entityName);
    const proxy = makeEntityProxy(base);
    this.Created.push(base);
    // Single, documented test-fake cast at the seam boundary: the engine is typed
    // against the entity interface; the proxy records every assignment.
    return proxy as unknown as T;
  }

  public lastOf(entityName: string): RecordingEntity | undefined {
    for (let i = this.Created.length - 1; i >= 0; i--) {
      if (this.Created[i].EntityName === entityName) {
        return this.Created[i];
      }
    }
    return undefined;
  }
}

/**
 * In-memory {@link IRecordLoader}. Returns the supplied pipeline definition and a
 * monotonic version counter — no database.
 */
class FakeRecordLoader implements IRecordLoader {
  private version = 0;
  constructor(private readonly pipeline: MJMLTrainingPipelineEntity) {}

  public async loadPipeline(): Promise<MJMLTrainingPipelineEntity | null> {
    return this.pipeline;
  }

  public async nextModelVersion(): Promise<number> {
    return ++this.version;
  }
}

/**
 * Build a fake `MJ: ML Training Pipelines` row. Only the JSON-config columns the
 * TrainingEngine reads are populated; it is typed as the entity via a single
 * documented test-fake cast. The engine parses these JSON columns into the
 * SourceBinding / FeatureStepGraph / AsOf / Leakage / Validation shapes.
 */
function buildPipeline(opts: {
  algorithm: string;
  problemType: ProblemType;
  targetVariable: string;
  hyperparameters: Record<string, unknown>;
}): MJMLTrainingPipelineEntity {
  const sourceBindings: SourceBinding[] = [{ Kind: 'Entity', Ref: 'Members' }];
  const featureSteps: FeatureStepGraph = {
    Steps: [
      {
        Id: 'select-1',
        Kind: 'select',
        Columns: ['tenure_months', 'events_attended', 'logins_last_90d', 'noise'],
      },
    ],
  };
  const asOf: AsOfStrategy = { Mode: 'none' };
  const leakageGuard: LeakageGuard = { DenyFields: [], SingleFeatureDominanceThreshold: 0.95 };
  const validation: ValidationStrategy = {
    Strategy: 'train_test_split',
    TestSize: 0.2,
    LockedHoldoutFraction: 0.2,
  };

  const row = {
    ID: 'pipeline-it-1',
    Version: 1,
    AlgorithmID: 'algo-it-1',
    Algorithm: opts.algorithm,
    TargetEntity: 'Members',
    TargetVariable: opts.targetVariable,
    ProblemType: opts.problemType,
    Hyperparameters: JSON.stringify(opts.hyperparameters),
    SourceBindings: JSON.stringify(sourceBindings),
    FeatureSteps: JSON.stringify(featureSteps),
    AsOfStrategy: JSON.stringify(asOf),
    LeakageGuard: JSON.stringify(leakageGuard),
    ValidationStrategy: JSON.stringify(validation),
  };
  // Single, documented test-fake cast at the seam boundary.
  return row as unknown as MJMLTrainingPipelineEntity;
}

// region: live-sidecar seam adapters (REAL training / REAL predict) ----------

/**
 * Build the **production** {@link MJSidecarTrainer} against the already-running
 * sidecar, so this test exercises the real production holdout path end-to-end.
 *
 * The production trainer forwards the orchestrator-carved **locked holdout** on
 * the shared `TrainRequest.holdout` contract field; the Python `/train` then
 * applies the FROZEN fitted preprocessing to those exact rows and scores them
 * once → genuine `holdout_metrics`. This is the same code that runs in
 * production — the test no longer needs a bespoke trainer that reaches around the
 * contract via `validation.holdout_size`.
 *
 * `MJSidecarTrainer.train` calls `sidecar.start()` lazily, which is a no-op when
 * the suite has already started the sidecar (lifecycle stays owned by the test).
 */
function makeProductionTrainer(sidecar: MLSidecar): MJSidecarTrainer {
  return new MJSidecarTrainer(sidecar);
}

/** Live {@link ISidecarPredictor} backed by the REAL {@link MLSidecar}. */
class LiveSidecarPredictor implements ISidecarPredictor {
  constructor(private readonly sidecar: MLSidecar) {}

  public async predict(req: PredictRequest): Promise<PredictResponse> {
    return this.sidecar.predict(req);
  }
}

/**
 * {@link IMLModelLoader} that returns an already-trained model entity from memory
 * (the one the TrainingEngine just produced) — no database.
 */
class InMemoryModelLoader implements IMLModelLoader {
  constructor(private readonly model: MJMLModelEntity) {}
  public async loadModel(): Promise<MJMLModelEntity | null> {
    return this.model;
  }
}

// region: test helpers -------------------------------------------------------

/** A RecordProcessorContext with no real provider (scoring uses inline rows, so none is needed). */
function fakeScoringContext(): RecordProcessorContext {
  return {
    contextUser: undefined as unknown as UserInfo,
    provider: undefined as unknown as IMetadataProvider,
  };
}

/** Wrap a plain synthetic row as a RecordRef carrying the already-loaded data. */
function toRecordRef(row: MemberRow): RecordRef {
  return { EntityID: 'Members', RecordID: row.ID, Record: row };
}

/** Read a numeric metric off the model's serialized JSON metrics column. */
function readMetric(model: RecordingEntity, field: 'Metrics' | 'HoldoutMetrics', key: string): number | undefined {
  const raw = model.Fields[field];
  if (typeof raw !== 'string') return undefined;
  try {
    const parsed = JSON.parse(raw) as ModelMetrics;
    return parsed[key];
  } catch {
    return undefined;
  }
}

// region: the suite ----------------------------------------------------------

describe.runIf(SHOULD_RUN)('Predictive Studio — live end-to-end train + score (real sidecar)', () => {
  const DATASET = buildDataset(420);
  // Hold back the last 20 rows as a "fresh" scoring set the model never trained on.
  const SCORING_HOLDOUT = DATASET.slice(-20);

  let sidecar: MLSidecar;

  beforeAll(async () => {
    sidecar = new MLSidecar({ pythonPath: VENV_PYTHON ?? undefined });
    await sidecar.start();
    const health = await sidecar.health();
    // eslint-disable-next-line no-console
    console.info(`[PS integration] sidecar up on port ${sidecar.Port}; algorithms: ${health.algorithms?.join(', ')}`);
  }, 60_000);

  afterAll(async () => {
    if (sidecar) {
      await sidecar.stop();
    }
  });

  it('trains an xgboost classifier through the REAL stack and scores held-out rows', async () => {
    const t0 = Date.now();
    const pipeline = buildPipeline({
      algorithm: 'xgboost',
      problemType: 'classification',
      targetVariable: 'Renewed',
      hyperparameters: { n_estimators: 120, max_depth: 4, learning_rate: 0.1 },
    });

    const factory = new FakeEntityFactory();
    const artifactStore = new InMemoryArtifactStore();
    const deps: TrainingDeps = {
      entityFactory: factory,
      recordLoader: new FakeRecordLoader(pipeline),
      sidecar: makeProductionTrainer(sidecar),
      artifactStore,
    };

    // REAL FeatureAssemblyExecutor reads the synthetic rows through the in-memory seam.
    const assembler = makeAssemblerForRows(DATASET);
    const engine = new TrainingEngine(assembler);

    const input: TrainModelInput = { pipelineId: pipeline.ID, sidecarVersion: 'it-1' };
    const { model, run } = await engine.trainModel(input, deps);

    const modelRec = factory.lastOf('MJ: ML Models')!;
    const runRec = factory.lastOf('MJ: ML Training Runs')!;
    expect(modelRec).toBeDefined();
    expect(runRec).toBeDefined();

    // --- Draft model with real persisted contract ---
    expect(modelRec.Fields.Status).toBe('Draft');
    expect(modelRec.Fields.ArtifactFileID).toBeTruthy();
    expect(artifactStore.Saved.size).toBe(1);

    // FittedPreprocessing + FeatureSchema + FeatureImportance populated for real.
    const fitted = JSON.parse(modelRec.Fields.FittedPreprocessing as string) as Record<string, unknown>;
    expect(fitted).toHaveProperty('output_columns');
    const schema = JSON.parse(modelRec.Fields.FeatureSchema as string) as Array<{ Name: string }>;
    expect(schema.map((s) => s.Name)).toEqual(['tenure_months', 'events_attended', 'logins_last_90d', 'noise']);
    const importance = JSON.parse(modelRec.Fields.FeatureImportance as string) as Record<string, number>;
    expect(Object.keys(importance).length).toBeGreaterThan(0);

    // --- Real metrics: holdout AUC ≥ ~0.7 (the relationship IS learnable) ---
    const valAuc = readMetric(modelRec, 'Metrics', 'auc');
    const holdoutAuc = readMetric(modelRec, 'HoldoutMetrics', 'auc');
    expect(valAuc).toBeDefined();
    expect(holdoutAuc).toBeDefined();
    expect(holdoutAuc!).toBeGreaterThanOrEqual(0.7);

    expect(runRec.Fields.Status).toBe('Completed');

    // --- Score clearly-positive and clearly-negative rows through the REAL processor ---
    const modelLoader = new InMemoryModelLoader(model);
    const artifactLoader = new InMemoryArtifactLoader(artifactStore.Saved);
    const scoreDeps: MLInferenceDeps = {
      modelLoader,
      artifactLoader,
      sidecar: new LiveSidecarPredictor(sidecar),
    };
    const processor = new MLModelInferenceProcessor({ modelId: model.ID, deps: scoreDeps }, makeAssemblerForRows(DATASET));

    // Clearly-positive (highly engaged) and clearly-negative (disengaged) probes.
    const strongPositive: MemberRow = {
      ID: 'probe-pos',
      tenure_months: 58,
      events_attended: 20,
      logins_last_90d: 49,
      noise: 0,
      Renewed: 1,
      SatisfactionScore: 95,
    };
    const strongNegative: MemberRow = {
      ID: 'probe-neg',
      tenure_months: 1,
      events_attended: 0,
      logins_last_90d: 1,
      noise: 0,
      Renewed: 0,
      SatisfactionScore: 10,
    };

    const probes = [strongPositive, strongNegative];
    const results = await processor.ProcessBatch(probes.map(toRecordRef), fakeScoringContext());
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.Status).toBe('Succeeded');
    }

    const posPayload = results[0].ResultPayload as { score: number; class?: string };
    const negPayload = results[1].ResultPayload as { score: number; class?: string };

    // Scores are valid probabilities and the strong-positive scores higher.
    expect(posPayload.score).toBeGreaterThanOrEqual(0);
    expect(posPayload.score).toBeLessThanOrEqual(1);
    expect(negPayload.score).toBeGreaterThanOrEqual(0);
    expect(negPayload.score).toBeLessThanOrEqual(1);
    expect(posPayload.score).toBeGreaterThan(negPayload.score);
    // The right class for each clearly-signalled row.
    expect(posPayload.class).toBe('1');
    expect(negPayload.class).toBe('0');

    // Batch-score the fresh held-out rows; assert sane probabilities + directional accuracy.
    const holdoutResults = await processor.ProcessBatch(SCORING_HOLDOUT.map(toRecordRef), fakeScoringContext());
    expect(holdoutResults.every((r) => r.Status === 'Succeeded')).toBe(true);
    const directional = SCORING_HOLDOUT.filter((row, i) => {
      const p = (holdoutResults[i].ResultPayload as { score: number }).score;
      return (p >= 0.5 ? 1 : 0) === row.Renewed;
    }).length;
    // The model should beat coin-flip on the held-out set.
    expect(directional / SCORING_HOLDOUT.length).toBeGreaterThan(0.6);

    // eslint-disable-next-line no-console
    console.info(
      `[PS integration] xgboost classifier — val AUC=${valAuc?.toFixed(3)}, holdout AUC=${holdoutAuc?.toFixed(3)}, ` +
        `held-out directional acc=${(directional / SCORING_HOLDOUT.length).toFixed(3)}, ` +
        `total=${Date.now() - t0}ms`,
    );

    // Touch `run` so the engine's returned handles are exercised too.
    expect(run.ID).toBeTruthy();
  }, 120_000);

  it('trains a logistic_regression classifier through the REAL stack (holdout AUC sane)', async () => {
    const pipeline = buildPipeline({
      algorithm: 'logistic_regression',
      problemType: 'classification',
      targetVariable: 'Renewed',
      hyperparameters: { C: 1.0 },
    });
    const factory = new FakeEntityFactory();
    const artifactStore = new InMemoryArtifactStore();
    const deps: TrainingDeps = {
      entityFactory: factory,
      recordLoader: new FakeRecordLoader(pipeline),
      sidecar: makeProductionTrainer(sidecar),
      artifactStore,
    };
    const engine = new TrainingEngine(makeAssemblerForRows(DATASET));
    const { model } = await engine.trainModel({ pipelineId: pipeline.ID }, deps);

    const modelRec = factory.lastOf('MJ: ML Models')!;
    const holdoutAuc = readMetric(modelRec, 'HoldoutMetrics', 'auc');
    expect(holdoutAuc).toBeDefined();
    expect(holdoutAuc!).toBeGreaterThanOrEqual(0.7);

    // Score the strong probes — logistic must also separate them.
    const scoreDeps: MLInferenceDeps = {
      modelLoader: new InMemoryModelLoader(model),
      artifactLoader: new InMemoryArtifactLoader(artifactStore.Saved),
      sidecar: new LiveSidecarPredictor(sidecar),
    };
    const processor = new MLModelInferenceProcessor({ modelId: model.ID, deps: scoreDeps }, makeAssemblerForRows(DATASET));
    const [pos, neg] = await processor.ProcessBatch(
      [
        toRecordRef({ ID: 'p', tenure_months: 58, events_attended: 20, logins_last_90d: 49, noise: 0, Renewed: 1, SatisfactionScore: 95 }),
        toRecordRef({ ID: 'n', tenure_months: 1, events_attended: 0, logins_last_90d: 1, noise: 0, Renewed: 0, SatisfactionScore: 10 }),
      ],
      fakeScoringContext(),
    );
    const posScore = (pos.ResultPayload as { score: number }).score;
    const negScore = (neg.ResultPayload as { score: number }).score;
    expect(posScore).toBeGreaterThan(negScore);

    // eslint-disable-next-line no-console
    console.info(`[PS integration] logistic_regression — holdout AUC=${holdoutAuc?.toFixed(3)}`);
  }, 120_000);

  it('trains a ridge regressor through the REAL stack (holdout R² sane) and scores values', async () => {
    const pipeline = buildPipeline({
      algorithm: 'ridge',
      problemType: 'regression',
      targetVariable: 'SatisfactionScore',
      hyperparameters: { alpha: 1.0 },
    });
    const factory = new FakeEntityFactory();
    const artifactStore = new InMemoryArtifactStore();
    const deps: TrainingDeps = {
      entityFactory: factory,
      recordLoader: new FakeRecordLoader(pipeline),
      sidecar: makeProductionTrainer(sidecar),
      artifactStore,
    };
    const engine = new TrainingEngine(makeAssemblerForRows(DATASET));
    const { model } = await engine.trainModel({ pipelineId: pipeline.ID }, deps);

    const modelRec = factory.lastOf('MJ: ML Models')!;
    expect(modelRec.Fields.ProblemType).toBe('regression');
    const holdoutR2 = readMetric(modelRec, 'HoldoutMetrics', 'r2');
    const valR2 = readMetric(modelRec, 'Metrics', 'r2');
    expect(valR2).toBeDefined();
    expect(holdoutR2).toBeDefined();
    // A genuinely-related continuous target → positive, non-trivial R².
    expect(holdoutR2!).toBeGreaterThanOrEqual(0.4);

    // Score a high-engagement vs low-engagement row → higher satisfaction for the former.
    const scoreDeps: MLInferenceDeps = {
      modelLoader: new InMemoryModelLoader(model),
      artifactLoader: new InMemoryArtifactLoader(artifactStore.Saved),
      sidecar: new LiveSidecarPredictor(sidecar),
    };
    const processor = new MLModelInferenceProcessor({ modelId: model.ID, deps: scoreDeps }, makeAssemblerForRows(DATASET));
    const [hi, lo] = await processor.ProcessBatch(
      [
        toRecordRef({ ID: 'hi', tenure_months: 58, events_attended: 20, logins_last_90d: 49, noise: 0, Renewed: 1, SatisfactionScore: 0 }),
        toRecordRef({ ID: 'lo', tenure_months: 1, events_attended: 0, logins_last_90d: 1, noise: 0, Renewed: 0, SatisfactionScore: 0 }),
      ],
      fakeScoringContext(),
    );
    const hiScore = (hi.ResultPayload as { score: number; class?: string | null }).score;
    const loScore = (lo.ResultPayload as { score: number; class?: string | null }).score;
    // Regression → no class (null/undefined); numeric value; higher engagement →
    // higher predicted satisfaction.
    expect((hi.ResultPayload as { class?: string | null }).class == null).toBe(true);
    expect(hiScore).toBeGreaterThan(loScore);

    // eslint-disable-next-line no-console
    console.info(`[PS integration] ridge regressor — val R²=${valR2?.toFixed(3)}, holdout R²=${holdoutR2?.toFixed(3)}`);
  }, 120_000);
});

// region: assembler factory --------------------------------------------------

/**
 * Build a FeatureAssemblyExecutor whose data-access reads the given synthetic
 * rows. Both the TrainingEngine and the inference processor call `assemble(...)`
 * internally without exposing the `dataAccess` seam at the call site, so we wrap
 * the executor in a subclass that injects our in-memory data access on every
 * `assemble` call. The REAL production `assemble` logic runs unchanged — only the
 * row source is in-memory (the executor's own documented test seam).
 */
function makeAssemblerForRows(rows: SourceRow[]): FeatureAssemblyExecutor {
  return new InMemoryAssemblyExecutor(new InMemoryDataAccess({ Members: rows }));
}

/**
 * A thin {@link FeatureAssemblyExecutor} subclass that injects an in-memory
 * {@link IFeatureDataAccess} into every `assemble` call (when the caller didn't
 * supply one). This keeps the REAL assembly logic intact while sourcing rows from
 * memory instead of RunView/the database.
 */
class InMemoryAssemblyExecutor extends FeatureAssemblyExecutor {
  constructor(private readonly dataAccess: IFeatureDataAccess) {
    super();
  }

  public override async assemble(params: FeatureAssemblyParams): Promise<FeatureAssemblyResult> {
    return super.assemble({ ...params, dataAccess: params.dataAccess ?? this.dataAccess });
  }
}
