import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  type TrainRequest,
  type TrainResponse,
  type PredictRequest,
  type PredictResponse,
  type TrainerFailed,
} from '@memberjunction/predictive-studio-core';
import { TrainerRequestFixture } from './fixtures/trainer-request.fixture';

/**
 * Unit tests for {@link MLSidecar}. `node:http` is mocked so no live sidecar (and
 * no child process) is required. We drive the client in **remote mode**
 * (constructed with a `url`) so `Start()`/HTTP exercise the same transport path
 * that managed mode uses, without spawning Python.
 */

// --- node:http mock -------------------------------------------------------
// A queue of canned responses; each httpGet/httpPost consumes the next one.
interface CannedResponse {
  statusCode: number;
  body: string;
}
const responseQueue: CannedResponse[] = [];
const requestLog: Array<{ method?: string; path?: string; body?: string; timeout?: number }> = [];

class MockClientRequest extends EventEmitter {
  private writtenBody = '';
  constructor(
    private readonly options: { method?: string; path?: string; timeout?: number },
    private readonly onResponse: (res: EventEmitter & { statusCode: number }) => void,
  ) {
    super();
  }
  write(data: string) {
    this.writtenBody += data;
  }
  end() {
    requestLog.push({ method: this.options.method, path: this.options.path, body: this.writtenBody, timeout: this.options.timeout });
    const canned = responseQueue.shift();
    // Defer to next tick so callers can attach 'error'/'timeout' handlers first.
    queueMicrotask(() => {
      if (!canned) {
        this.emit('error', new Error('no canned response queued'));
        return;
      }
      const res = Object.assign(new EventEmitter(), { statusCode: canned.statusCode });
      this.onResponse(res);
      res.emit('data', Buffer.from(canned.body));
      res.emit('end');
    });
  }
  destroy() {
    /* no-op */
  }
}

vi.mock('node:http', () => ({
  default: {
    request: (
      options: { method?: string; path?: string; timeout?: number },
      cb: (res: EventEmitter & { statusCode: number }) => void,
    ) => new MockClientRequest(options, cb),
  },
}));

// Import AFTER the mock is registered.
const { MLSidecar, SidecarError, TrainerResultMalformedError } = await import('../ml-sidecar.js');

const URL_BASE = 'http://localhost:8000';

function queue(statusCode: number, body: unknown) {
  responseQueue.push({ statusCode, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

function buildTrainRequest(): TrainRequest {
  return {
    algorithm: 'xgboost',
    problem_type: 'classification',
    hyperparameters: { max_depth: 4 },
    validation: { strategy: 'train_test_split', test_size: 0.2 },
    feature_schema: [{ Name: 'tenure', Kind: 'numeric' }],
    preprocessing: [{ op: 'standardize', cols: ['tenure'] }],
    target: 'Renewed',
    data: { columns: ['tenure', 'Renewed'], rows: [[12, 1], [3, 0]] },
  };
}

function buildPredictRequest(): PredictRequest {
  return {
    artifact_b64: 'YWJj',
    fitted_preprocessing: { 'tenure.mean': 7.5 },
    feature_schema: [{ Name: 'tenure', Kind: 'numeric' }],
    rows: [{ tenure: 10 }],
  };
}

describe('MLSidecar (remote mode)', () => {
  beforeEach(() => {
    responseQueue.length = 0;
    requestLog.length = 0;
    delete process.env.PREDICTIVE_STUDIO_SIDECAR_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports remote mode and IsRunning when a url is given', () => {
    const s = new MLSidecar({ url: URL_BASE });
    expect(s.IsRemote).toBe(true);
    expect(s.IsRunning).toBe(true);
    expect(s.Port).toBeNull();
  });

  it('detects remote mode from PREDICTIVE_STUDIO_SIDECAR_URL', () => {
    process.env.PREDICTIVE_STUDIO_SIDECAR_URL = URL_BASE;
    const s = new MLSidecar();
    expect(s.IsRemote).toBe(true);
  });

  it('Start() verifies /health in remote mode (no spawn)', async () => {
    queue(200, { status: 'ok' });
    const s = new MLSidecar({ url: URL_BASE });
    await s.Start();
    expect(requestLog[0].method).toBe('GET');
    expect(requestLog[0].path).toBe('/health');
  });

  it('Train() POSTs the body to /train and returns the parsed TrainResponse', async () => {
    const expected: TrainResponse = {
      artifact_b64: 'bW9kZWw=',
      fitted_preprocessing: { 'tenure.mean': 7.5 },
      metrics: { auc: 0.91 },
      feature_importance: { tenure: 1 },
      training_row_count: 2,
      duration_sec: 0.42,
    };
    queue(200, expected);
    const s = new MLSidecar({ url: URL_BASE });
    const req = buildTrainRequest();
    const result = await s.Train(req);

    expect(result).toEqual(expected);
    expect(requestLog[0].method).toBe('POST');
    expect(requestLog[0].path).toBe('/train');
    expect(JSON.parse(requestLog[0].body!)).toEqual(req);
  });

  it('Predict() POSTs the body to /predict and returns the parsed PredictResponse', async () => {
    const expected: PredictResponse = { predictions: [{ score: 0.8, class: 'yes' }] };
    queue(200, expected);
    const s = new MLSidecar({ url: URL_BASE });
    const req = buildPredictRequest();
    const result = await s.Predict(req);

    expect(result).toEqual(expected);
    expect(requestLog[0].path).toBe('/predict');
    expect(JSON.parse(requestLog[0].body!)).toEqual(req);
  });

  it('Health() GETs /health and returns the parsed status', async () => {
    queue(200, { status: 'ok', algorithms: ['xgboost'], cached_models: 0 });
    const s = new MLSidecar({ url: URL_BASE });
    const result = await s.Health();
    expect(result.status).toBe('ok');
    expect(result.algorithms).toEqual(['xgboost']);
    expect(requestLog[0].method).toBe('GET');
    expect(requestLog[0].path).toBe('/health');
  });

  it('throws SidecarError carrying status and body on a non-2xx response', async () => {
    queue(422, '{"detail":"bad schema"}');
    const s = new MLSidecar({ url: URL_BASE });
    await expect(s.Train(buildTrainRequest())).rejects.toMatchObject({
      name: 'SidecarError',
      Status: 422,
      Body: '{"detail":"bad schema"}',
    });
  });

  it('SidecarError is an instance of SidecarError', async () => {
    queue(500, 'boom');
    const s = new MLSidecar({ url: URL_BASE });
    await expect(s.Predict(buildPredictRequest())).rejects.toBeInstanceOf(SidecarError);
  });

  it('strips a trailing slash from the remote URL', async () => {
    queue(200, { status: 'ok' });
    const s = new MLSidecar({ url: `${URL_BASE}/` });
    await s.Health();
    expect(requestLog[0].path).toBe('/health'); // and no error from a doubled slash
  });

  it('Stop() is a no-op in remote mode', async () => {
    const s = new MLSidecar({ url: URL_BASE });
    await expect(s.Stop()).resolves.toBeUndefined();
  });
});

describe('MLSidecar.RunTrainer', () => {
  beforeEach(() => {
    responseQueue.length = 0;
    requestLog.length = 0;
  });

  it('POSTs the TrainerRequest to /trainer and returns the parsed TrainerResult', async () => {
    const failed: TrainerFailed = {
      status: 'failed', trainingRunId: TrainerRequestFixture.RunID, stage: 'load-snapshot',
      message: 'pre-authorised URL for file 00000000-0000-0000-0000-000000000006 expired', computeSeconds: 0.01,
    };
    queue(200, failed);
    const s = new MLSidecar({ url: URL_BASE });
    const req = TrainerRequestFixture.Build(60, 0);
    const out = await s.RunTrainer(req);
    expect(requestLog[0].method).toBe('POST');
    expect(requestLog[0].path).toBe('/trainer');
    expect(JSON.parse(requestLog[0].body ?? '{}')).toEqual(req);
    expect(out).toEqual(failed);
  });

  it("times the transport out 60 s after the run's own timeout, not at the client default", async () => {
    queue(200, { status: 'failed', trainingRunId: TrainerRequestFixture.RunID, stage: 'timeout', message: 'x', computeSeconds: 60 });
    const s = new MLSidecar({ url: URL_BASE, requestTimeoutMs: 1000 });
    await s.RunTrainer(TrainerRequestFixture.Build(600, 0));
    expect(requestLog[0].timeout).toBe(660_000);
  });

  it('refuses a 200 answer that is not a TrainerResult with TrainerResultMalformedError naming the problem', async () => {
    queue(200, { status: 'completed', trainingRunId: TrainerRequestFixture.RunID, computeSeconds: 1 });
    const s = new MLSidecar({ url: URL_BASE });
    const err = await s.RunTrainer(TrainerRequestFixture.Build(60, 0)).catch((e: Error) => e);
    expect(err).toBeInstanceOf(TrainerResultMalformedError);
    if (err instanceof TrainerResultMalformedError) {
      expect(err.Problems.join('\n')).toContain('codeVersion');
      expect(err.message).toContain('codeVersion');
    }
  });

  it('refuses an answer carrying a key the contract does not have', async () => {
    queue(200, { status: 'failed', trainingRunId: TrainerRequestFixture.RunID, stage: 'timeout', message: 'x', computeSeconds: 60, retryable: true });
    const s = new MLSidecar({ url: URL_BASE });
    await expect(s.RunTrainer(TrainerRequestFixture.Build(60, 0))).rejects.toBeInstanceOf(TrainerResultMalformedError);
  });

  it('surfaces a 400 refusal as SidecarError', async () => {
    queue(400, { detail: 'ranking across families (e.g. Tweedie vs squared-error by RMSE) is refused' });
    const s = new MLSidecar({ url: URL_BASE });
    await expect(s.RunTrainer(TrainerRequestFixture.Build(60, 0))).rejects.toMatchObject({ name: 'SidecarError', Status: 400 });
  });
});
