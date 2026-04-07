import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('@memberjunction/actions', () => ({
  BaseAction: class BaseAction {
    protected async InternalRunAction(): Promise<unknown> {
      return {};
    }
  },
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/core', () => ({
  UserInfo: class UserInfo {},
  Metadata: vi.fn(),
  RunView: vi.fn().mockImplementation(() => ({
    RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] }),
  })),
}));

vi.mock('@memberjunction/core-entities', () => ({
  MJCompanyIntegrationEntity: class MJCompanyIntegrationEntity {
    CompanyID: string = '';
    APIKey: string | null = null;
    AccessToken: string | null = null;
    ExternalSystemID: string | null = null;
    CustomAttribute1: string | null = null;
  },
}));

vi.mock('@memberjunction/actions-base', () => ({
  ActionParam: class ActionParam {
    Name: string = '';
    Value: unknown = null;
    Type: string = 'Input';
  },
}));

import { LearnWorldsBaseAction } from '../providers/learnworlds/learnworlds-base.action';

/**
 * Concrete subclass to expose protected/private methods for testing.
 */
class TestableLearnWorldsAction extends LearnWorldsBaseAction {
  protected async InternalRunAction(): Promise<{ Success: boolean; Message: string; ResultCode: string }> {
    return { Success: true, Message: '', ResultCode: 'SUCCESS' };
  }

  // Expose rate limiter reset for testing
  public static resetRateLimiter(): void {
    LearnWorldsBaseAction.ResetRateLimiter();
  }

  // Expose protected methods for testing
  public testCalculateRetryDelay(attempt: number, retryAfterHeader: string | null): number {
    return this['calculateRetryDelay'](attempt, retryAfterHeader);
  }

  public async testProcessInBatches<TItem, TResult>(
    items: TItem[],
    processFn: (item: TItem) => Promise<TResult>,
    batchSize?: number,
  ): Promise<TResult[]> {
    return this.processInBatches(items, processFn, batchSize);
  }

  public async testSendRequestWithRetry(url: string, init: RequestInit): Promise<Response> {
    return this['sendRequestWithRetry'](url, init);
  }

  public testWaitForRetryDelay(ms: number): Promise<void> {
    return this['waitForRetryDelay'](ms);
  }
}

function createMockResponse(status: number, body: object, headers?: Record<string, string>): Response {
  const headerMap = new Headers(headers);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 429 ? 'Too Many Requests' : 'OK',
    headers: headerMap,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

describe('Rate Limit Retry Logic', () => {
  let action: TestableLearnWorldsAction;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    action = new TestableLearnWorldsAction();
    originalFetch = globalThis.fetch;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
    TestableLearnWorldsAction.resetRateLimiter();
  });

  describe('sendRequestWithRetry', () => {
    it('should return response on first success without retrying', async () => {
      const mockResponse = createMockResponse(200, { data: 'ok' });
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await action.testSendRequestWithRetry('https://api.test.com/v2/users', { method: 'GET' });

      expect(result.status).toBe(200);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on 429 and succeed on subsequent attempt', async () => {
      const rateLimitResponse = createMockResponse(429, { error: 'rate limited' });
      const successResponse = createMockResponse(200, { data: 'ok' });
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(rateLimitResponse)
        .mockResolvedValueOnce(successResponse);

      // Mock waitForRetryDelay to not actually wait
      vi.spyOn(action as unknown as { waitForRetryDelay: (ms: number) => Promise<void> }, 'waitForRetryDelay' as never)
        .mockResolvedValue(undefined as never);

      const result = await action.testSendRequestWithRetry('https://api.test.com/v2/users', { method: 'GET' });

      expect(result.status).toBe(200);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('should return 429 response after exhausting MAX_RETRIES', async () => {
      const rateLimitResponse = createMockResponse(429, { error: 'rate limited' });
      globalThis.fetch = vi.fn().mockResolvedValue(rateLimitResponse);

      vi.spyOn(action as unknown as { waitForRetryDelay: (ms: number) => Promise<void> }, 'waitForRetryDelay' as never)
        .mockResolvedValue(undefined as never);

      const result = await action.testSendRequestWithRetry('https://api.test.com/v2/users', { method: 'GET' });

      expect(result.status).toBe(429);
      // MAX_RETRIES = 5, so: 1 initial + 5 retries = 6 total fetch calls
      expect(globalThis.fetch).toHaveBeenCalledTimes(6);
    });

    it('should pass through non-429 error responses without retrying', async () => {
      const errorResponse = createMockResponse(500, { error: 'server error' });
      globalThis.fetch = vi.fn().mockResolvedValue(errorResponse);

      const result = await action.testSendRequestWithRetry('https://api.test.com/v2/users', { method: 'GET' });

      expect(result.status).toBe(500);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('should respect Retry-After header on 429 responses', async () => {
      const rateLimitResponse = createMockResponse(429, { error: 'rate limited' }, { 'Retry-After': '3' });
      const successResponse = createMockResponse(200, { data: 'ok' });
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(rateLimitResponse)
        .mockResolvedValueOnce(successResponse);

      const waitSpy = vi.spyOn(action as unknown as { waitForRetryDelay: (ms: number) => Promise<void> }, 'waitForRetryDelay' as never)
        .mockResolvedValue(undefined as never);

      await action.testSendRequestWithRetry('https://api.test.com/v2/users', { method: 'GET' });

      // Retry-After: 3 => 3000ms delay
      expect(waitSpy).toHaveBeenCalledWith(3000);
    });
  });

  describe('calculateRetryDelay', () => {
    it('should use Retry-After header value when present', () => {
      const delay = action.testCalculateRetryDelay(0, '5');

      expect(delay).toBe(5000);
    });

    it('should cap Retry-After at MAX_DELAY_MS', () => {
      const delay = action.testCalculateRetryDelay(0, '60');

      expect(delay).toBe(30_000);
    });

    it('should ignore invalid Retry-After values and use exponential backoff', () => {
      const delay = action.testCalculateRetryDelay(0, 'invalid');

      // Attempt 0: BASE_DELAY_MS * 2^0 + jitter = 1000 + [0..1000)
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThan(2000);
    });

    it('should use exponential backoff when no Retry-After header', () => {
      const delay0 = action.testCalculateRetryDelay(0, null);
      const delay2 = action.testCalculateRetryDelay(2, null);

      // Attempt 0: 1000 * 2^0 + jitter => [1000, 2000)
      expect(delay0).toBeGreaterThanOrEqual(1000);
      expect(delay0).toBeLessThan(2000);

      // Attempt 2: 1000 * 2^2 + jitter => [4000, 5000)
      expect(delay2).toBeGreaterThanOrEqual(4000);
      expect(delay2).toBeLessThan(5000);
    });

    it('should cap exponential backoff at MAX_DELAY_MS', () => {
      const delay = action.testCalculateRetryDelay(10, null);

      expect(delay).toBe(30_000);
    });

    it('should ignore zero or negative Retry-After values', () => {
      const delayZero = action.testCalculateRetryDelay(0, '0');
      const delayNeg = action.testCalculateRetryDelay(0, '-5');

      // Both should fall back to exponential backoff
      expect(delayZero).toBeGreaterThanOrEqual(1000);
      expect(delayNeg).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('processInBatches with inter-batch delay', () => {
    it('should add delay between batches but not before the first', async () => {
      const waitSpy = vi.spyOn(action as unknown as { waitForRetryDelay: (ms: number) => Promise<void> }, 'waitForRetryDelay' as never)
        .mockResolvedValue(undefined as never);

      const items = [1, 2, 3, 4, 5, 6];
      const processFn = vi.fn().mockImplementation((n: number) => Promise.resolve(n * 2));

      const results = await action.testProcessInBatches(items, processFn, 2);

      expect(results).toEqual([2, 4, 6, 8, 10, 12]);
      // 3 batches of 2: delay before batch 2 and batch 3 (not before batch 1)
      expect(waitSpy).toHaveBeenCalledTimes(2);
    });

    it('should not add delay when there is only one batch', async () => {
      const waitSpy = vi.spyOn(action as unknown as { waitForRetryDelay: (ms: number) => Promise<void> }, 'waitForRetryDelay' as never)
        .mockResolvedValue(undefined as never);

      const items = [1, 2];
      const processFn = vi.fn().mockImplementation((n: number) => Promise.resolve(n * 2));

      const results = await action.testProcessInBatches(items, processFn, 5);

      expect(results).toEqual([2, 4]);
      expect(waitSpy).not.toHaveBeenCalled();
    });
  });

  describe('proactive rate limiter', () => {
    it('should allow requests when under capacity', async () => {
      const mockResponse = createMockResponse(200, { data: 'ok' });
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      // Make a few requests — well under the 25/10s limit
      for (let i = 0; i < 3; i++) {
        await action.testSendRequestWithRetry('https://api.test.com/v2/users', { method: 'GET' });
      }

      // All should have gone through without delays
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it('should share rate limiter state across instances', async () => {
      const mockResponse = createMockResponse(200, { data: 'ok' });
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const action1 = new TestableLearnWorldsAction();
      const action2 = new TestableLearnWorldsAction();

      // Both instances share the same static rate limiter
      await action1.testSendRequestWithRetry('https://api.test.com/v2/users', { method: 'GET' });
      await action2.testSendRequestWithRetry('https://api.test.com/v2/courses', { method: 'GET' });

      // Both should succeed (2 requests, well under limit)
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('should reset cleanly between tests', async () => {
      const mockResponse = createMockResponse(200, { data: 'ok' });
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      // After resetRateLimiter() in afterEach, the window should be empty
      TestableLearnWorldsAction.resetRateLimiter();

      await action.testSendRequestWithRetry('https://api.test.com/v2/users', { method: 'GET' });
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
