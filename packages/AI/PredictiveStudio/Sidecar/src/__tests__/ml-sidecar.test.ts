import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type {
  TrainRequest,
  TrainResponse,
  PredictRequest,
  PredictResponse,
} from '@memberjunction/predictive-studio-core';

/**
 * Unit tests for {@link MLSidecar}. `node:http` is mocked so no live sidecar (and
 * no child process) is required. We drive the client in **remote mode**
 * (constructed with a `url`) so `start()`/HTTP exercise the same transport path
 * that managed mode uses, without spawning Python.
 */

// --- node:http mock -------------------------------------------------------
// A queue of canned responses; each httpGet/httpPost consumes the next one.
interface CannedResponse {
  statusCode: number;
  body: string;
}
const responseQueue: CannedResponse[] = [];
const requestLog: Array<{ method?: string; path?: string; body?: string }> = [];

class MockClientRequest extends EventEmitter {
  private writtenBody = '';
  constructor(
    private readonly options: { method?: string; path?: string },
    private readonly onResponse: (res: EventEmitter & { statusCode: number }) => void,
  ) {
    super();
  }
  write(data: string) {
    this.writtenBody += data;
  }
  end() {
    requestLog.push({ method: this.options.method, path: this.options.path, body: this.writtenBody });
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
      options: { method?: string; path?: string },
      cb: (res: EventEmitter & { statusCode: number }) => void,
    ) => new MockClientRequest(options, cb),
  },
}));

// Import AFTER the mock is registered.
const { MLSidecar, SidecarError } = await import('../ml-sidecar.js');

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

  it('start() verifies /health in remote mode (no spawn)', async () => {
    queue(200, { status: 'ok' });
    const s = new MLSidecar({ url: URL_BASE });
    await s.start();
    expect(requestLog[0].method).toBe('GET');
    expect(requestLog[0].path).toBe('/health');
  });

  it('train() POSTs the body to /train and returns the parsed TrainResponse', async () => {
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
    const result = await s.train(req);

    expect(result).toEqual(expected);
    expect(requestLog[0].method).toBe('POST');
    expect(requestLog[0].path).toBe('/train');
    expect(JSON.parse(requestLog[0].body!)).toEqual(req);
  });

  it('predict() POSTs the body to /predict and returns the parsed PredictResponse', async () => {
    const expected: PredictResponse = { predictions: [{ score: 0.8, class: 'yes' }] };
    queue(200, expected);
    const s = new MLSidecar({ url: URL_BASE });
    const req = buildPredictRequest();
    const result = await s.predict(req);

    expect(result).toEqual(expected);
    expect(requestLog[0].path).toBe('/predict');
    expect(JSON.parse(requestLog[0].body!)).toEqual(req);
  });

  it('health() GETs /health and returns the parsed status', async () => {
    queue(200, { status: 'ok', algorithms: ['xgboost'], cached_models: 0 });
    const s = new MLSidecar({ url: URL_BASE });
    const result = await s.health();
    expect(result.status).toBe('ok');
    expect(result.algorithms).toEqual(['xgboost']);
    expect(requestLog[0].method).toBe('GET');
    expect(requestLog[0].path).toBe('/health');
  });

  it('throws SidecarError carrying status and body on a non-2xx response', async () => {
    queue(422, '{"detail":"bad schema"}');
    const s = new MLSidecar({ url: URL_BASE });
    await expect(s.train(buildTrainRequest())).rejects.toMatchObject({
      name: 'SidecarError',
      Status: 422,
      Body: '{"detail":"bad schema"}',
    });
  });

  it('SidecarError is an instance of SidecarError', async () => {
    queue(500, 'boom');
    const s = new MLSidecar({ url: URL_BASE });
    await expect(s.predict(buildPredictRequest())).rejects.toBeInstanceOf(SidecarError);
  });

  it('strips a trailing slash from the remote URL', async () => {
    queue(200, { status: 'ok' });
    const s = new MLSidecar({ url: `${URL_BASE}/` });
    await s.health();
    expect(requestLog[0].path).toBe('/health'); // and no error from a doubled slash
  });

  it('stop() is a no-op in remote mode', async () => {
    const s = new MLSidecar({ url: URL_BASE });
    await expect(s.stop()).resolves.toBeUndefined();
  });
});
