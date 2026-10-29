import { describe, it, expect } from 'vitest';
import {
  EvaluationProtocol,
  type PreAuthDownload,
  type TrainerFailed,
  type TrainerRequest,
  type TrainerResult,
} from '@memberjunction/predictive-studio-core';
import { MLSidecar, SidecarError } from '@memberjunction/predictive-studio-sidecar';
import { MJSidecarTrainer } from '../seams';

/** An MLSidecar whose RunTrainer replays queued outcomes; Start only counts (no process, no HTTP). */
class StubSidecar extends MLSidecar {
  public Calls = 0;
  public Starts = 0;
  constructor(private readonly outcomes: ReadonlyArray<TrainerResult | Error>) {
    super({ url: 'http://127.0.0.1:9' });
  }
  public override async Start(): Promise<void> {
    this.Starts += 1;
  }
  public override async RunTrainer(_req: TrainerRequest): Promise<TrainerResult> {
    const next = this.outcomes[this.Calls];
    this.Calls += 1;
    if (next === undefined) throw new Error('no outcome queued');
    if (next instanceof Error) throw next;
    return next;
  }
}

const RUN_ID = '00000000-0000-0000-0000-000000000004';

const DOWNLOAD: PreAuthDownload = {
  fileId: '00000000-0000-0000-0000-000000000006', url: 'file:///tmp/matrix.jsonl', issuedAt: '2026-10-28T00:00:00.000Z',
  driverLifetimeSeconds: null, expiresAt: null, sha256: 'ab',
};

const REQ: TrainerRequest = {
  trainingRunId: RUN_ID,
  snapshot: { id: '00000000-0000-0000-0000-000000000005', contentHash: 'h', featureSchemaHash: 'f', matrix: DOWNLOAD, rowManifest: DOWNLOAD },
  incumbent: null,
  protocol: {
    id: 'P1', lineageRootId: 'P1', version: 1, name: 'Renewal grading',
    holdout: { kind: 'date-carved', dateColumn: 'OrderDate', cutoff: '2024-01-01', holdoutEnd: null, newEntityReport: null },
    innerValidation: { kind: 'repeated-stratified-kfold', folds: 5, repeats: 3 },
    seed: 0, holdoutAccessBudget: 1,
    primaryScore: { family: 'binary', metric: 'log-loss' },
    secondaryMetrics: ['auc'],
    baselines: [{ kind: 'dummy', name: 'base-rate' }],
    calibration: { kind: 'platt', fitOn: 'disjoint-calibration-fold' },
    resampling: { kind: 'none' },
    intervals: { level: 0.95, method: 'bootstrap', resamples: 1000, pairedTest: 'paired-bootstrap' },
    promotion: {
      comparators: [], incumbent: 'none', margin: EvaluationProtocol.ToNonNegative(0), lowerBoundLevel: 0.95,
      pairedOn: 'same-holdout-rows', decisionTable: 'Q13+Q14+Q15',
    },
    allowedOutcomes: ['model', 'keep-simple-baseline', 'no-signal'],
    leakageAudit: { singleFeatureHeldOutAucMax: 0.9, timeShiftedLabelTest: true, dropColumnTest: true, importanceAggregation: 'per-source-column', highCardinalityIdCheck: true },
    exclusions: { denyFields: [], denySources: [] },
    slices: { outOfTime: false, subgroups: [] },
    predictionIntervals: null, residualDiagnostics: null, retrainTriggers: [],
    search: { kind: 'random', candidates: 1 },
    budgets: { maxComputeSeconds: 60, maxTokens: 0, maxCandidates: 1, hardStop: true },
    minMinorityClassRows: 20, guardFieldsEditableBy: 'non-agent',
    authoredBy: { kind: 'human', userId: 'U1' },
  },
  task: { kind: 'binary', classOrder: ['false', 'true'], adverseIndex: 1 },
  candidates: [{ name: 'glm_candidate', algorithmId: 'A1', driverKey: 'logistic_regression', hyperparameters: {} }],
  seed: 0,
  threads: 1,
  timeoutSeconds: 60,
  maxRetries: 2,
};

const RESULT: TrainerFailed = {
  status: 'failed', trainingRunId: RUN_ID, stage: 'inner-cv', message: 'candidate x', computeSeconds: 1.5,
};

describe('MJSidecarTrainer.RunTrainer (bounded retries, then failed at stage timeout)', () => {
  it('retries a transport failure and returns the next answer', async () => {
    const s = new StubSidecar([new Error('socket hang up'), RESULT]);
    expect(await new MJSidecarTrainer(s).RunTrainer(REQ)).toEqual(RESULT);
    expect(s.Calls).toBe(2);
  });

  it('retries a 5xx answer from the sidecar', async () => {
    const s = new StubSidecar([new SidecarError(503, 'busy'), RESULT]);
    expect(await new MJSidecarTrainer(s).RunTrainer(REQ)).toEqual(RESULT);
    expect(s.Calls).toBe(2);
  });

  it('ends failed at stage timeout after maxRetries + 1 attempts, naming the last error', async () => {
    const s = new StubSidecar([new Error('timed out'), new SidecarError(500, 'boom'), new Error('timed out again')]);
    const r = await new MJSidecarTrainer(s).RunTrainer(REQ);
    expect(s.Calls).toBe(3);
    expect(r).toEqual({
      status: 'failed',
      trainingRunId: RUN_ID,
      stage: 'timeout',
      message: 'sidecar gave no result after 3 attempt(s): timed out again',
      computeSeconds: 0,
    });
  });

  it('makes exactly one attempt when maxRetries is 0', async () => {
    const s = new StubSidecar([new Error('socket hang up'), RESULT]);
    const r = await new MJSidecarTrainer(s).RunTrainer({ ...REQ, maxRetries: 0 });
    expect(s.Calls).toBe(1);
    expect(r.status).toBe('failed');
  });

  it('does not retry a refused request (4xx) and rethrows it', async () => {
    const s = new StubSidecar([new SidecarError(400, '{"detail":"ranking across families"}'), RESULT]);
    await expect(new MJSidecarTrainer(s).RunTrainer(REQ)).rejects.toMatchObject({ name: 'SidecarError', Status: 400 });
    expect(s.Calls).toBe(1);
  });

  it('starts the sidecar once across runs', async () => {
    const s = new StubSidecar([RESULT, RESULT]);
    const trainer = new MJSidecarTrainer(s);
    await trainer.RunTrainer(REQ);
    await trainer.RunTrainer(REQ);
    expect(s.Starts).toBe(1);
  });
});
