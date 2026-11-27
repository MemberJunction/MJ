/**
 * A4 attack 10 (the client half): `MLSidecar.Profile` POSTs a `ProfileRequest` to `/profile` and returns the answer
 * only when it is a `ProfileResponse` (checked against the contract, never cast); a refusal (422) or a malformed 2xx
 * answer throws. The Python route's own test (`python/tests/test_profile_route.py`) checks what the route computes.
 *
 * Remote mode against a mocked `node:http` (no Python is spawned), as `ml-sidecar.test.ts` drives the other routes.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileRequest, ProfileResponse } from '@memberjunction/predictive-studio-core';

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
    request: (options: { method?: string; path?: string; timeout?: number }, cb: (res: EventEmitter & { statusCode: number }) => void) => new MockClientRequest(options, cb),
  },
}));

import { MLSidecar, ProfileResponseMalformedError, SidecarError } from '../ml-sidecar';

const URL_BASE = 'http://localhost:8000';

function queue(statusCode: number, body: unknown) {
  responseQueue.push({ statusCode, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

const REQUEST: ProfileRequest = {
  features: { leaky: [1, 0, 1, 0], noise: [3, 'a', null, 7] },
  labels: ['1', '0', '1', '0'],
  folds: 5,
  seed: 42,
};

const ANSWER: ProfileResponse = {
  fields: [
    { name: 'leaky', improvement: { metric: 'log-loss', value: 0.6, interval: { level: 0.95, lower: 0.55, upper: 0.65 }, n: 4 }, nearUnique: false },
    { name: 'noise', improvement: { metric: 'log-loss', value: -0.01, interval: { level: 0.95, lower: -0.04, upper: 0.02 }, n: 4 }, nearUnique: false },
  ],
  glmVsDummy: { metric: 'log-loss', value: 0.5, interval: { level: 0.95, lower: 0.4, upper: 0.6 }, n: 4 },
  computeSeconds: 0.25,
};

describe('MLSidecar.Profile (A4 attack 10)', () => {
  beforeEach(() => {
    responseQueue.length = 0;
    requestLog.length = 0;
    delete process.env.PREDICTIVE_STUDIO_SIDECAR_URL;
  });
  afterEach(() => vi.restoreAllMocks());

  it('POSTs the development arrays to /profile with camelCase wire names and returns the parsed answer', async () => {
    const s = new MLSidecar({ url: URL_BASE });
    queue(200, ANSWER);
    const answer = await s.Profile(REQUEST);
    expect(answer).toEqual(ANSWER);
    expect(requestLog).toHaveLength(1);
    expect(requestLog[0].method).toBe('POST');
    expect(requestLog[0].path).toBe('/profile');
    expect(JSON.parse(requestLog[0].body || '{}')).toEqual(REQUEST);
  });

  it('a 2xx answer that is not a ProfileResponse throws ProfileResponseMalformedError (never cast)', async () => {
    const s = new MLSidecar({ url: URL_BASE });
    queue(200, { fields: [{ name: 'x', improvement: { metric: 'log-loss', value: 'high' } }], computeSeconds: 1 });
    await expect(s.Profile(REQUEST)).rejects.toBeInstanceOf(ProfileResponseMalformedError);
  });

  it('a refusal (422: outside the contract) is a SidecarError with its status', async () => {
    const s = new MLSidecar({ url: URL_BASE });
    queue(422, { detail: 'labels and feature arrays differ in length' });
    const error = await s.Profile(REQUEST).catch((e: Error) => e);
    expect(error).toBeInstanceOf(SidecarError);
    expect(error instanceof SidecarError ? error.Status : null).toBe(422);
  });
});
