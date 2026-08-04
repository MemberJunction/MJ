import { describe, it, expect, beforeEach } from 'vitest';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type {
  MJMLModelEntity,
  MJMLModelScoringBindingEntity,
} from '@memberjunction/core-entities';

import { MaintenanceEngine, runMaintenancePass } from '../maintenance-engine';
import { resolveComparisonMetric, readMetric } from '../metrics';
import { RowCountProxyDriftDetector } from '../seams';
import type {
  IMaintenanceLoader,
  IRowCounter,
  IRescoreRunner,
  IDriftDetector,
  IMaintenanceClock,
  MaintenanceDeps,
  RescoreRequest,
  RescoreResult,
  DriftContext,
  DriftResult,
  RetrainingPolicy,
  MaintenanceBindingMode,
} from '../types';
import { DEFAULT_RETRAINING_POLICY } from '../types';
import type { TrainingEngine } from '../../training';
import type { TrainModelInput, TrainModelResult, TrainingDeps } from '../../training';

/**
 * Unit tests for the MaintenanceEngine (plan §12 / SP10). NO live DB, NO live
 * sidecar — every seam is an in-memory fake. These prove:
 *  - staleness by cadence / by data-volume → flagged; fresh → not flagged
 *  - scheduled re-scoring updates LastScoredAt / LastRowCount (and skips non-scheduled)
 *  - retraining produces a new version, compares holdout, recommends promote when
 *    the challenger wins by margin / hold otherwise, and NEVER auto-promotes
 *  - the drift detector seam is honored (injected fake)
 *  - the full pass + free-function entry isolate per-binding failures
 */

// ---------------------------------------------------------------------------
// In-memory entity fakes. BaseEntity uses getter/setters and can't be
// constructed without a provider, so tests use plain field-bag fakes exposing
// exactly the typed members the engine touches, plus Save() / LatestResult.
// They are handed to the engine through the seam interfaces via a single,
// deliberate test-double cast at the boundary (the engine only ever calls the
// strongly-typed properties below — never .Get()/.Set()).
// ---------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-06-27T00:00:00.000Z');

class FakeBinding {
  public ID: string;
  public MLModelID: string;
  public RecordProcessID: string | null = 'rp-1';
  public TargetEntityID: string | null = null;
  public TargetColumn: string | null = null;
  public Mode: MaintenanceBindingMode = 'Scheduled';
  public LastScoredAt: Date | null = null;
  public LastRowCount: number | null = null;
  public LatestResult: { CompleteMessage: string } | null = null;
  public SaveCallCount = 0;
  private saveOk: boolean;

  constructor(id: string, modelId: string, saveOk = true) {
    this.ID = id;
    this.MLModelID = modelId;
    this.saveOk = saveOk;
  }

  public failSaveWith(message: string): void {
    this.saveOk = false;
    this.LatestResult = { CompleteMessage: message };
  }

  public async Save(): Promise<boolean> {
    this.SaveCallCount++;
    if (!this.saveOk) {
      return false;
    }
    this.LatestResult = { CompleteMessage: '' };
    return true;
  }
}

class FakeModel {
  public ID: string;
  public PipelineID = 'pipeline-1';
  public ProblemType: 'classification' | 'regression' = 'classification';
  public TrainedAt: Date | null = NOW;
  public TrainingRowCount: number | null = 1000;
  public HoldoutMetrics: string | null = JSON.stringify({ roc_auc: 0.8 });
  public Lineage: string | null = JSON.stringify({ targetEntityName: 'Members' });
  public Pipeline = 'Member Retention Pipeline';

  constructor(id: string) {
    this.ID = id;
  }
}

function asBinding(b: FakeBinding): MJMLModelScoringBindingEntity {
  return b as unknown as MJMLModelScoringBindingEntity;
}
function asModel(m: FakeModel): MJMLModelEntity {
  return m as unknown as MJMLModelEntity;
}

// ----- seam fakes ------------------------------------------------------------

class FakeLoader implements IMaintenanceLoader {
  public bindings = new Map<string, FakeBinding>();
  public models = new Map<string, FakeModel>();

  async loadBinding(id: string): Promise<MJMLModelScoringBindingEntity | null> {
    const b = this.bindings.get(id);
    return b ? asBinding(b) : null;
  }
  async loadBindings(mode?: MaintenanceBindingMode): Promise<MJMLModelScoringBindingEntity[]> {
    return [...this.bindings.values()].filter((b) => !mode || b.Mode === mode).map(asBinding);
  }
  async loadModel(id: string): Promise<MJMLModelEntity | null> {
    const m = this.models.get(id);
    return m ? asModel(m) : null;
  }
}

class FakeRowCounter implements IRowCounter {
  public count = 1000;
  public calls: string[] = [];
  async countRows(entityName: string): Promise<number> {
    this.calls.push(entityName);
    return this.count;
  }
}

class FakeRescoreRunner implements IRescoreRunner {
  public requests: RescoreRequest[] = [];
  public result: RescoreResult = { scoredCount: 1200, failedCount: 3 };
  async rescore(request: RescoreRequest): Promise<RescoreResult> {
    this.requests.push(request);
    return this.result;
  }
}

class NeverDriftDetector implements IDriftDetector {
  detectDrift(): DriftResult {
    return { drifted: false, detail: 'no drift (fake)' };
  }
}

class AlwaysDriftDetector implements IDriftDetector {
  public lastContext?: DriftContext;
  detectDrift(context: DriftContext): DriftResult {
    this.lastContext = context;
    return { drifted: true, score: 0.99, detail: 'fake drift fired' };
  }
}

const FixedClock: IMaintenanceClock = { now: () => NOW };

/**
 * Fake training engine — produces a challenger model with a configurable holdout
 * metric. Records the train input so tests assert the same pipeline is retrained.
 */
class FakeTrainingEngine {
  public trainCalls: TrainModelInput[] = [];
  public challengerAuc = 0.85;

  async trainModel(input: TrainModelInput, _deps: TrainingDeps): Promise<TrainModelResult> {
    this.trainCalls.push(input);
    const challenger = new FakeModel(`model-challenger-${this.trainCalls.length}`);
    challenger.PipelineID = input.pipelineId;
    challenger.HoldoutMetrics = JSON.stringify({ roc_auc: this.challengerAuc });
    return {
      model: asModel(challenger),
      run: {} as unknown as TrainModelResult['run'],
    };
  }
}

function buildDeps(overrides: Partial<MaintenanceDeps> = {}): {
  deps: MaintenanceDeps;
  loader: FakeLoader;
  rowCounter: FakeRowCounter;
  rescoreRunner: FakeRescoreRunner;
  trainingEngine: FakeTrainingEngine;
} {
  const loader = new FakeLoader();
  const rowCounter = new FakeRowCounter();
  const rescoreRunner = new FakeRescoreRunner();
  const trainingEngine = new FakeTrainingEngine();
  const deps: MaintenanceDeps = {
    loader,
    entityFactory: { async getEntityObject() { throw new Error('unused'); } },
    rowCounter,
    rescoreRunner,
    driftDetector: new NeverDriftDetector(),
    trainingEngine: trainingEngine as unknown as TrainingEngine,
    trainingDeps: {} as TrainingDeps,
    clock: FixedClock,
    ...overrides,
  };
  return { deps, loader, rowCounter, rescoreRunner, trainingEngine };
}

// ===========================================================================

describe('MaintenanceEngine.detectStaleness', () => {
  let engine: MaintenanceEngine;
  beforeEach(() => {
    engine = new MaintenanceEngine();
  });

  it('flags stale by cadence when the model trained older than cadenceDays', async () => {
    const { deps } = buildDeps();
    const binding = new FakeBinding('b1', 'm1');
    const model = new FakeModel('m1');
    model.TrainedAt = new Date(NOW.getTime() - 40 * DAY); // 40 days old
    model.TrainingRowCount = 1000;
    deps.rowCounter && ((deps.rowCounter as FakeRowCounter).count = 1000); // no data-volume growth

    const result = await engine.detectStaleness(asBinding(binding), asModel(model), { cadenceDays: 30, dataVolumeGrowthThreshold: 0 }, deps);

    expect(result.stale).toBe(true);
    expect(result.reasons.map((r) => r.trigger)).toContain('cadence');
  });

  it('does NOT flag fresh model (recently trained, no growth, drift off)', async () => {
    const { deps } = buildDeps();
    const binding = new FakeBinding('b1', 'm1');
    const model = new FakeModel('m1');
    model.TrainedAt = new Date(NOW.getTime() - 5 * DAY); // 5 days old
    model.TrainingRowCount = 1000;
    (deps.rowCounter as FakeRowCounter).count = 1010; // 1% growth, under threshold

    const result = await engine.detectStaleness(asBinding(binding), asModel(model), DEFAULT_RETRAINING_POLICY, deps);

    expect(result.stale).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  it('flags stale by data-volume when row count grew past the threshold', async () => {
    const { deps } = buildDeps();
    const binding = new FakeBinding('b1', 'm1');
    const model = new FakeModel('m1');
    model.TrainedAt = new Date(NOW.getTime() - 5 * DAY); // fresh by cadence
    model.TrainingRowCount = 1000;
    (deps.rowCounter as FakeRowCounter).count = 1400; // 40% growth

    const result = await engine.detectStaleness(asBinding(binding), asModel(model), { cadenceDays: 30, dataVolumeGrowthThreshold: 0.25 }, deps);

    expect(result.stale).toBe(true);
    const dv = result.reasons.find((r) => r.trigger === 'data-volume');
    expect(dv).toBeDefined();
    expect(result.currentRowCount).toBe(1400);
    expect(result.trainedRowCount).toBe(1000);
  });

  it('treats a never-trained anchor as due (cadence) when no TrainedAt', async () => {
    const { deps } = buildDeps();
    const binding = new FakeBinding('b1', 'm1');
    const model = new FakeModel('m1');
    model.TrainedAt = null;

    const result = await engine.detectStaleness(asBinding(binding), asModel(model), { cadenceDays: 30, dataVolumeGrowthThreshold: 0 }, deps);

    expect(result.stale).toBe(true);
    expect(result.reasons[0].trigger).toBe('cadence');
  });

  it('uses lastScored anchor when policy.cadenceAnchor = lastScored', async () => {
    const { deps } = buildDeps();
    const binding = new FakeBinding('b1', 'm1');
    binding.LastScoredAt = new Date(NOW.getTime() - 50 * DAY);
    const model = new FakeModel('m1');
    model.TrainedAt = new Date(NOW.getTime() - 1 * DAY); // fresh by trained, but stale by scored

    const result = await engine.detectStaleness(
      asBinding(binding),
      asModel(model),
      { cadenceDays: 30, cadenceAnchor: 'lastScored', dataVolumeGrowthThreshold: 0 },
      deps,
    );

    expect(result.stale).toBe(true);
    expect(result.reasons[0].trigger).toBe('cadence');
  });

  it('honors the injected drift detector when driftEnabled', async () => {
    const drift = new AlwaysDriftDetector();
    const { deps } = buildDeps({ driftDetector: drift });
    const binding = new FakeBinding('b1', 'm1');
    binding.LastRowCount = 1234;
    const model = new FakeModel('m1');
    model.TrainedAt = new Date(NOW.getTime() - 1 * DAY); // fresh by cadence

    const result = await engine.detectStaleness(
      asBinding(binding),
      asModel(model),
      { cadenceDays: 30, dataVolumeGrowthThreshold: 0, driftEnabled: true },
      deps,
    );

    expect(result.stale).toBe(true);
    expect(result.reasons.some((r) => r.trigger === 'drift')).toBe(true);
    // The detector received the observed counts.
    expect(drift.lastContext?.lastScoredRowCount).toBe(1234);
    expect(drift.lastContext?.modelId).toBe('m1');
  });

  it('does NOT consult the drift detector when driftEnabled is false', async () => {
    const drift = new AlwaysDriftDetector();
    const { deps } = buildDeps({ driftDetector: drift });
    const binding = new FakeBinding('b1', 'm1');
    const model = new FakeModel('m1');
    model.TrainedAt = new Date(NOW.getTime() - 1 * DAY);

    const result = await engine.detectStaleness(
      asBinding(binding),
      asModel(model),
      { cadenceDays: 30, dataVolumeGrowthThreshold: 0, driftEnabled: false },
      deps,
    );

    expect(result.reasons.some((r) => r.trigger === 'drift')).toBe(false);
    expect(drift.lastContext).toBeUndefined();
  });
});

describe('MaintenanceEngine.rescoreScheduledBinding', () => {
  let engine: MaintenanceEngine;
  beforeEach(() => {
    engine = new MaintenanceEngine();
  });

  it('re-scores a Scheduled binding and stamps LastScoredAt / LastRowCount', async () => {
    const { deps, rescoreRunner } = buildDeps();
    const binding = new FakeBinding('b1', 'm1');
    binding.Mode = 'Scheduled';
    const model = new FakeModel('m1');

    const result = await engine.rescoreScheduledBinding(asBinding(binding), asModel(model), deps);

    expect(result).toEqual({ scoredCount: 1200, failedCount: 3 });
    expect(binding.LastRowCount).toBe(1200);
    expect(binding.LastScoredAt).toEqual(NOW);
    expect(binding.SaveCallCount).toBe(1);
    // The runner targeted the model's lineage entity.
    expect(rescoreRunner.requests[0].targetEntityName).toBe('Members');
    expect(rescoreRunner.requests[0].modelId).toBe('m1');
  });

  it('skips (returns null) for a non-Scheduled binding', async () => {
    const { deps, rescoreRunner } = buildDeps();
    const binding = new FakeBinding('b1', 'm1');
    binding.Mode = 'OnDemand';
    const model = new FakeModel('m1');

    const result = await engine.rescoreScheduledBinding(asBinding(binding), asModel(model), deps);

    expect(result).toBeNull();
    expect(rescoreRunner.requests).toHaveLength(0);
    expect(binding.SaveCallCount).toBe(0);
  });

  it('throws with the binding error message when the stamp Save fails', async () => {
    const { deps } = buildDeps();
    const binding = new FakeBinding('b1', 'm1');
    binding.Mode = 'Scheduled';
    binding.failSaveWith('permission denied');
    const model = new FakeModel('m1');

    await expect(engine.rescoreScheduledBinding(asBinding(binding), asModel(model), deps)).rejects.toThrow(/permission denied/);
  });
});

describe('MaintenanceEngine.triggerRetrainIfStale + compareChallenger', () => {
  let engine: MaintenanceEngine;
  beforeEach(() => {
    engine = new MaintenanceEngine();
  });

  it('does nothing when the model is not stale', async () => {
    const { deps, trainingEngine } = buildDeps();
    const binding = new FakeBinding('b1', 'm1');
    const model = new FakeModel('m1');
    const staleness = { bindingId: 'b1', modelId: 'm1', stale: false, reasons: [] };

    const outcome = await engine.triggerRetrainIfStale(asBinding(binding), asModel(model), staleness, {}, deps);

    expect(outcome.retrained).toBe(false);
    expect(outcome.challenger).toBeUndefined();
    expect(trainingEngine.trainCalls).toHaveLength(0);
  });

  it('retrains the SAME pipeline into a new version and recommends PROMOTE when the challenger wins by margin', async () => {
    const { deps, trainingEngine } = buildDeps();
    trainingEngine.challengerAuc = 0.85; // incumbent is 0.80 → delta 0.05 > 0.01 margin
    const binding = new FakeBinding('b1', 'm1');
    const incumbent = new FakeModel('m1');
    incumbent.PipelineID = 'pipeline-99';
    incumbent.HoldoutMetrics = JSON.stringify({ roc_auc: 0.8 });
    const staleness = { bindingId: 'b1', modelId: 'm1', stale: true, reasons: [{ trigger: 'cadence' as const, detail: 'old' }] };

    const outcome = await engine.triggerRetrainIfStale(asBinding(binding), asModel(incumbent), staleness, { promotionMargin: 0.01 }, deps);

    expect(outcome.retrained).toBe(true);
    expect(trainingEngine.trainCalls[0].pipelineId).toBe('pipeline-99'); // same pipeline
    expect(outcome.comparison?.metric).toBe('roc_auc');
    expect(outcome.comparison?.incumbentValue).toBe(0.8);
    expect(outcome.comparison?.challengerValue).toBe(0.85);
    expect(outcome.comparison?.delta).toBeCloseTo(0.05, 5);
    expect(outcome.comparison?.recommendation).toBe('promote');
    expect(outcome.challenger?.model.ID).toMatch(/challenger/);
  });

  it('recommends HOLD when the challenger does not beat the incumbent by margin', async () => {
    const { deps, trainingEngine } = buildDeps();
    trainingEngine.challengerAuc = 0.805; // delta 0.005 < 0.01 margin
    const binding = new FakeBinding('b1', 'm1');
    const incumbent = new FakeModel('m1');
    incumbent.HoldoutMetrics = JSON.stringify({ roc_auc: 0.8 });
    const staleness = { bindingId: 'b1', modelId: 'm1', stale: true, reasons: [{ trigger: 'cadence' as const, detail: 'old' }] };

    const outcome = await engine.triggerRetrainIfStale(asBinding(binding), asModel(incumbent), staleness, { promotionMargin: 0.01 }, deps);

    expect(outcome.retrained).toBe(true);
    expect(outcome.comparison?.recommendation).toBe('hold');
  });

  it('recommends HOLD when a holdout metric is missing on either model (never auto-promote on unknown)', async () => {
    const { deps, trainingEngine } = buildDeps();
    trainingEngine.challengerAuc = 0.99;
    const binding = new FakeBinding('b1', 'm1');
    const incumbent = new FakeModel('m1');
    incumbent.HoldoutMetrics = null; // no incumbent metric
    const staleness = { bindingId: 'b1', modelId: 'm1', stale: true, reasons: [{ trigger: 'cadence' as const, detail: 'old' }] };

    const outcome = await engine.triggerRetrainIfStale(asBinding(binding), asModel(incumbent), staleness, {}, deps);

    expect(outcome.comparison?.recommendation).toBe('hold');
    expect(outcome.comparison?.incumbentValue).toBeNull();
  });

  it('on an error metric (rmse), promotes only when the challenger is LOWER, not higher', () => {
    // rmse is lower-is-better. A naive higher-is-better comparison would promote
    // the WORSE (higher rmse) model — the sign bug this regression test guards.
    const policy: RetrainingPolicy = { ...DEFAULT_RETRAINING_POLICY, comparisonMetric: 'rmse', promotionMargin: 0.5 };

    // incumbent rmse 5.0 vs challenger 6.0 (worse) → HOLD
    const incWorseCh = new FakeModel('m1');
    incWorseCh.ProblemType = 'regression';
    incWorseCh.HoldoutMetrics = JSON.stringify({ rmse: 5.0 });
    const chWorse = new FakeModel('m2');
    chWorse.ProblemType = 'regression';
    chWorse.HoldoutMetrics = JSON.stringify({ rmse: 6.0 });
    const hold = engine.compareChallenger(asModel(incWorseCh), asModel(chWorse), policy);
    expect(hold.metric).toBe('rmse');
    expect(hold.recommendation).toBe('hold');

    // incumbent rmse 5.0 vs challenger 4.0 (better, by 1.0 ≥ 0.5 margin) → PROMOTE
    const incBetterCh = new FakeModel('m3');
    incBetterCh.ProblemType = 'regression';
    incBetterCh.HoldoutMetrics = JSON.stringify({ rmse: 5.0 });
    const chBetter = new FakeModel('m4');
    chBetter.ProblemType = 'regression';
    chBetter.HoldoutMetrics = JSON.stringify({ rmse: 4.0 });
    const promote = engine.compareChallenger(asModel(incBetterCh), asModel(chBetter), policy);
    expect(promote.recommendation).toBe('promote');
    // delta is still reported as challenger − incumbent (−1.0) for transparency.
    expect(promote.delta).toBeCloseTo(-1.0, 5);
  });

  it('compareChallenger never mutates the models / performs no promotion (pure recommendation)', () => {
    const incumbent = new FakeModel('m1');
    incumbent.HoldoutMetrics = JSON.stringify({ roc_auc: 0.7 });
    const challenger = new FakeModel('m2');
    challenger.HoldoutMetrics = JSON.stringify({ roc_auc: 0.9 });
    const policy: RetrainingPolicy = { ...DEFAULT_RETRAINING_POLICY, promotionMargin: 0.05 };

    const cmp = engine.compareChallenger(asModel(incumbent), asModel(challenger), policy);

    expect(cmp.recommendation).toBe('promote');
    // models untouched (no Status mutation here — promotion is a separate gate)
    expect('Status' in incumbent).toBe(false);
    expect('Status' in challenger).toBe(false);
  });
});

describe('MaintenanceEngine.runMaintenancePass (+ free-function entry)', () => {
  let engine: MaintenanceEngine;
  beforeEach(() => {
    engine = new MaintenanceEngine();
  });

  it('re-scores + retrains a stale scheduled binding in one pass and counts a promote recommendation', async () => {
    const { deps, loader, trainingEngine } = buildDeps();
    trainingEngine.challengerAuc = 0.95;
    (deps.rowCounter as FakeRowCounter).count = 2000; // 100% growth → stale

    const binding = new FakeBinding('b1', 'm1');
    binding.Mode = 'Scheduled';
    const model = new FakeModel('m1');
    model.TrainedAt = new Date(NOW.getTime() - 1 * DAY); // fresh by cadence; stale by volume
    model.HoldoutMetrics = JSON.stringify({ roc_auc: 0.8 });
    loader.bindings.set('b1', binding);
    loader.models.set('m1', model);

    const result = await engine.runMaintenancePass(
      [asBinding(binding)],
      { cadenceDays: 30, dataVolumeGrowthThreshold: 0.25, promotionMargin: 0.01 },
      deps,
    );

    expect(result.entries).toHaveLength(1);
    expect(result.rescoredCount).toBe(1);
    expect(result.staleCount).toBe(1);
    expect(result.retrainedCount).toBe(1);
    expect(result.promoteRecommendedCount).toBe(1);
    expect(result.entries[0].rescore?.scoredCount).toBe(1200);
    expect(result.entries[0].retrain?.comparison?.recommendation).toBe('promote');
  });

  it('honors the rescoreScheduled=false / retrainStale=false toggles', async () => {
    const { deps, loader, rescoreRunner, trainingEngine } = buildDeps();
    (deps.rowCounter as FakeRowCounter).count = 5000; // very stale

    const binding = new FakeBinding('b1', 'm1');
    binding.Mode = 'Scheduled';
    const model = new FakeModel('m1');
    loader.bindings.set('b1', binding);
    loader.models.set('m1', model);

    const result = await engine.runMaintenancePass(
      [asBinding(binding)],
      DEFAULT_RETRAINING_POLICY,
      deps,
      { rescoreScheduled: false, retrainStale: false },
    );

    expect(rescoreRunner.requests).toHaveLength(0);
    expect(trainingEngine.trainCalls).toHaveLength(0);
    expect(result.rescoredCount).toBe(0);
    expect(result.retrainedCount).toBe(0);
    // still detects staleness even with toggles off
    expect(result.entries[0].staleness.stale).toBe(true);
  });

  it('isolates a per-binding failure (missing model) without aborting the batch', async () => {
    const { deps, loader } = buildDeps();
    const good = new FakeBinding('b-good', 'm-good');
    good.Mode = 'OnDemand';
    const goodModel = new FakeModel('m-good');
    goodModel.TrainedAt = new Date(NOW.getTime() - 1 * DAY);
    loader.bindings.set('b-good', good);
    loader.models.set('m-good', goodModel);

    const orphan = new FakeBinding('b-orphan', 'm-missing'); // model not in loader

    const result = await engine.runMaintenancePass(
      [asBinding(orphan), asBinding(good)],
      DEFAULT_RETRAINING_POLICY,
      deps,
    );

    expect(result.entries).toHaveLength(2);
    const orphanEntry = result.entries.find((e) => e.bindingId === 'b-orphan');
    expect(orphanEntry?.error).toMatch(/not found/);
    const goodEntry = result.entries.find((e) => e.bindingId === 'b-good');
    expect(goodEntry?.error).toBeUndefined();
  });

  it('the runMaintenancePass free-function entry works without constructing the engine', async () => {
    const { deps, loader } = buildDeps();
    const binding = new FakeBinding('b1', 'm1');
    binding.Mode = 'OnDemand';
    const model = new FakeModel('m1');
    model.TrainedAt = new Date(NOW.getTime() - 1 * DAY);
    loader.bindings.set('b1', binding);
    loader.models.set('m1', model);

    const result = await runMaintenancePass([asBinding(binding)], DEFAULT_RETRAINING_POLICY, deps);

    expect(result.entries).toHaveLength(1);
  });
});

describe('maintenance metric helpers', () => {
  it('resolveComparisonMetric honors a pinned metric name', () => {
    const inc = new FakeModel('m1');
    const ch = new FakeModel('m2');
    expect(resolveComparisonMetric('accuracy', asModel(inc), asModel(ch))).toBe('accuracy');
  });

  it('resolveComparisonMetric auto-picks roc_auc for classification when present on both', () => {
    const inc = new FakeModel('m1');
    inc.HoldoutMetrics = JSON.stringify({ roc_auc: 0.8, accuracy: 0.7 });
    const ch = new FakeModel('m2');
    ch.HoldoutMetrics = JSON.stringify({ roc_auc: 0.85, accuracy: 0.72 });
    expect(resolveComparisonMetric('auto', asModel(inc), asModel(ch))).toBe('roc_auc');
  });

  it('resolveComparisonMetric auto-picks r2 for regression', () => {
    const inc = new FakeModel('m1');
    inc.ProblemType = 'regression';
    inc.HoldoutMetrics = JSON.stringify({ r2: 0.6, rmse: 5 });
    const ch = new FakeModel('m2');
    ch.HoldoutMetrics = JSON.stringify({ r2: 0.65, rmse: 4 });
    expect(resolveComparisonMetric('auto', asModel(inc), asModel(ch))).toBe('r2');
  });

  it('readMetric returns null for missing / unparseable metrics', () => {
    expect(readMetric(null, 'roc_auc')).toBeNull();
    expect(readMetric('{not json', 'roc_auc')).toBeNull();
    expect(readMetric(JSON.stringify({ accuracy: 0.7 }), 'roc_auc')).toBeNull();
    expect(readMetric(JSON.stringify({ roc_auc: 0.82 }), 'roc_auc')).toBe(0.82);
  });
});

describe('RowCountProxyDriftDetector (default honest detector)', () => {
  it('reports drift when scored population grows past the proxy threshold', () => {
    const d = new RowCountProxyDriftDetector(0.5);
    const result = d.detectDrift({ modelId: 'm1', trainedRowCount: 1000, currentRowCount: 1600 }); // 60% growth
    expect(result.drifted).toBe(true);
    expect(result.score).toBeCloseTo(0.6, 5);
  });

  it('reports no drift within the threshold', () => {
    const d = new RowCountProxyDriftDetector(0.5);
    const result = d.detectDrift({ modelId: 'm1', trainedRowCount: 1000, currentRowCount: 1200 }); // 20%
    expect(result.drifted).toBe(false);
  });

  it('falls back to lastScoredRowCount when currentRowCount is absent', () => {
    const d = new RowCountProxyDriftDetector(0.5);
    const result = d.detectDrift({ modelId: 'm1', trainedRowCount: 1000, lastScoredRowCount: 2000 });
    expect(result.drifted).toBe(true);
  });

  it('is honest about insufficient history (no drift, explained)', () => {
    const d = new RowCountProxyDriftDetector();
    const result = d.detectDrift({ modelId: 'm1' });
    expect(result.drifted).toBe(false);
    expect(result.detail).toMatch(/Not enough/i);
  });
});
