/**
 * Regression test for the 2026-08-29 memory-leak audit (Round 12): `WebPageContentAction` had
 * two spots that discarded a `SafeFetch` response without ever reading or cancelling its body —
 * the top-level `!response.ok` early return, and `fetchWithRetry()`'s retry branch, which
 * reassigned `response` on every attempt without draining the one it was replacing. Under
 * Node's native `fetch` (undici), each unconsumed response body pins a connection out of the
 * keep-alive pool until GC finalizes it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

vi.mock('@memberjunction/actions-base', () => ({}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
}));

const safeFetchMock = vi.fn();
const drainResponseBodyMock = vi.fn();

vi.mock('@memberjunction/network-utils', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/network-utils');
    return {
        ...actual,
        SafeFetch: (...args: unknown[]) => safeFetchMock(...args),
        DrainResponseBody: (...args: unknown[]) => drainResponseBodyMock(...args),
    };
});

import { WebPageContentAction } from '../custom/web/web-page-content.action';

/** Exposes the protected entry point and the private retry helper without weakening their types. */
class TestableWebPageContentAction extends WebPageContentAction {
    public RunForTest(params: RunActionParams): Promise<ActionResultSimple> {
        return this.InternalRunAction(params);
    }
    public FetchWithRetryForTest(url: string, options: RequestInit, maxRetries?: number): Promise<Response> {
        return (this as unknown as { fetchWithRetry: (u: string, o: RequestInit, m?: number) => Promise<Response> }).fetchWithRetry(
            url,
            options,
            maxRetries
        );
    }
}

function paramsFor(inputs: Record<string, unknown>): RunActionParams {
    return {
        Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Type: 'Input', Value })),
    } as RunActionParams;
}

describe('WebPageContentAction — response body draining', () => {
    beforeEach(() => {
        safeFetchMock.mockReset();
        drainResponseBodyMock.mockReset();
    });

    it('drains the response body before returning FETCH_FAILED on a non-retryable non-ok status', async () => {
        safeFetchMock.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });
        const action = new TestableWebPageContentAction();

        const result = await action.RunForTest(paramsFor({ URL: 'https://example.com/missing' }));

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('FETCH_FAILED');
        // One drain: the top-level `!response.ok` branch. shouldRetry(404) is false, so
        // fetchWithRetry's own retry-branch drain never fires for this status.
        expect(drainResponseBodyMock).toHaveBeenCalledTimes(1);
    });

    describe('fetchWithRetry', () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        it('drains each discarded response before retrying a transient status', async () => {
            vi.useFakeTimers();
            safeFetchMock
                .mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests' })
                .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' });

            const action = new TestableWebPageContentAction();
            const promise = action.FetchWithRetryForTest('https://example.com/x', {});
            await vi.runAllTimersAsync();
            const response = await promise;

            expect(response.status).toBe(200);
            expect(safeFetchMock).toHaveBeenCalledTimes(2);
            // The discarded 429 is drained exactly once, before the retry's delay.
            expect(drainResponseBodyMock).toHaveBeenCalledTimes(1);
        });

        it('does not drain the final response returned to the caller', async () => {
            safeFetchMock.mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' });
            const action = new TestableWebPageContentAction();

            const response = await action.FetchWithRetryForTest('https://example.com/x', {});

            expect(response.status).toBe(200);
            expect(drainResponseBodyMock).not.toHaveBeenCalled();
        });
    });
});
