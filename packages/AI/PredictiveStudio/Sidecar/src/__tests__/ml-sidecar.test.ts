import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  type MonitorCalibrateRequest,
  type MonitorCalibrateResponse,
  type MonitorDriftRequest,
  type MonitorDriftResponse,
  type PredictRequest,
  type PredictResponse,
  type TrainerFailed,
} from '@memberjunction/predictive-studio-core';
import { TrainerRequestFixture } from './fixtures/trainer-request.fixture';
// `vi.mock` below is hoisted above every import, so this module binds the mocked `node:http`.
import { MLSidecar, SidecarError, TrainerResultMalformedError } from '../ml-sidecar.js';

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
    private readonly options: { method?: string; path?: string; timeout?: number; signal?: AbortSignal },
    private readonly onResponse: (res: EventEmitter & { statusCode: number }) => void,
  ) {
    super();
    if (this.options.signal?.aborted) {
      queueMicrotask(() => this.emit('error', new Error('The operation was aborted')));
    } else {
      this.options.signal?.addEventListener('abort', () => {
        this.emit('error', new Error('The operation was aborted'));
      });
    }
  }
  write(data: string) {
    this.writtenBody += data;
  }
  end() {
    requestLog.push({ method: this.options.method, path: this.options.path, body: this.writtenBody, timeout: this.options.timeout });
    if (this.options.signal?.aborted) {
      return;
    }
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
      options: { method?: string; path?: string; timeout?: number; signal?: AbortSignal },
      cb: (res: EventEmitter & { statusCode: number }) => void,
    ) => new MockClientRequest(options, cb),
  },
}));


const URL_BASE = 'http://localhost:8000';

function queue(statusCode: number, body: unknown) {
  responseQueue.push({ statusCode, body: typeof body === 'string' ? body : JSON.stringify(body) });
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

  it('reads a remote url with trailing slashes, and a long run of slashes, in linear time', async () => {
    const started = Date.now();
    const slashes = new MLSidecar({ url: `${URL_BASE}${'/'.repeat(100_000)}a` });
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(slashes.IsRemote).toBe(true);
    queue(200, { status: 'ok' });
    await new MLSidecar({ url: `${URL_BASE}///` }).Start();
    expect(requestLog[0].path).toBe('/health');
  });

  it('Start() verifies /health in remote mode (no spawn)', async () => {
    queue(200, { status: 'ok' });
    const s = new MLSidecar({ url: URL_BASE });
    await s.Start();
    expect(requestLog[0].method).toBe('GET');
    expect(requestLog[0].path).toBe('/health');
  });

  it('Predict() POSTs the body to /predict and returns the parsed PredictResponse', async () => {
    const expected: PredictResponse = { predictions: [{ score: 0.8, class: 'yes', probabilities: [0.2, 0.8] }], classOrder: ['no', 'yes'] };
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
    await expect(s.Predict(buildPredictRequest())).rejects.toMatchObject({
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
    expect(JSON.parse(requestLog[0].body || '{}')).toEqual(req);
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

  it('forwards AbortSignal to http.request in predict and aborts request (S1)', async () => {
    const s = new MLSidecar({ url: URL_BASE });
    const controller = new AbortController();
    controller.abort();
    await expect(s.Predict(buildPredictRequest(), controller.signal)).rejects.toThrow(/aborted/);
  });
});

describe('MLSidecar monitor procedure M (M6.1)', () => {
  beforeEach(() => {
    responseQueue.length = 0;
    requestLog.length = 0;
  });

  function buildDriftRequest(): MonitorDriftRequest {
    return {
      inputs: [{ name: 'EngagementZ', kind: 'mean', reference: [0.1, -0.2, 0.3], current: [0.4, 0.5] }],
      look: 1,
      q: 0.0171,
      replays: 2000,
      seed: 7,
    };
  }

  it('MonitorDrift() POSTs the look to /monitor/drift and returns the per-input results and alarms', async () => {
    const flagged = { input: 'EngagementZ', kind: 'mean' as const, z: 5.2, p: 1 / 2001, pAdjusted: 1 / 2001, q: 0.0171, look: 1, flagged: true };
    const expected: MonitorDriftResponse = { look: 1, q: 0.0171, replays: 2000, results: [flagged], alarms: [flagged] };
    queue(200, expected);
    const req = buildDriftRequest();
    const result = await new MLSidecar({ url: URL_BASE }).MonitorDrift(req);

    expect(result).toEqual(expected);
    expect(requestLog[0]).toMatchObject({ method: 'POST', path: '/monitor/drift' });
    expect(JSON.parse(requestLog[0].body!)).toEqual(req);
  });

  it('MonitorCalibrate() POSTs the design to /monitor/calibrate and returns q(L)', async () => {
    const expected: MonitorCalibrateResponse = { q: 0.0095, looks: 12, replays: 2000, target: 0.05, anyAlarmRate: 0.05 };
    queue(200, expected);
    const req: MonitorCalibrateRequest = {
      inputs: [{ name: 'LagValue', kind: 'series', reference: [100, 101, 99.5, 100.2], lookSize: 1 }],
      looks: 12,
      replays: 2000,
      seed: 7,
      target: 0.05,
    };
    const result = await new MLSidecar({ url: URL_BASE }).MonitorCalibrate(req);

    expect(result).toEqual(expected);
    expect(requestLog[0]).toMatchObject({ method: 'POST', path: '/monitor/calibrate' });
    expect(JSON.parse(requestLog[0].body!)).toEqual(req);
  });

  it('surfaces a 422 refusal of a request outside the contract as SidecarError', async () => {
    queue(422, { detail: [{ msg: 'the reference window has no variation, so the z statistic is undefined' }] });
    await expect(new MLSidecar({ url: URL_BASE }).MonitorDrift(buildDriftRequest())).rejects.toMatchObject({ name: 'SidecarError', Status: 422 });
  });

  it('forwards an AbortSignal on MonitorDrift', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(new MLSidecar({ url: URL_BASE }).MonitorDrift(buildDriftRequest(), controller.signal)).rejects.toThrow(/aborted/);
  });
});
