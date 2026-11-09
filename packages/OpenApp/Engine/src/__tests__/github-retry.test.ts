import { describe, it, expect, vi } from 'vitest';
import { IsTransientGitHubError, RequestWithRetry } from '../github/github-client';

/** An Octokit-style RequestError: a status, and for network failures a cause carrying the code. */
function requestError(status: number, message: string, causeCode?: string): Error & { status: number } {
    const error = new Error(message) as Error & { status: number; cause?: unknown };
    error.status = status;
    if (causeCode) error.cause = Object.assign(new Error(causeCode), { code: causeCode });
    return error;
}

const noSleep = vi.fn(async () => undefined);

describe('IsTransientGitHubError', () => {
    it('treats network resets and timeouts as transient', () => {
        expect(IsTransientGitHubError(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }))).toBe(true);
        expect(IsTransientGitHubError(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }))).toBe(true);
        expect(IsTransientGitHubError(new Error('socket hang up'))).toBe(true);
    });

    it('sees through Octokit wrapping a network error as status 500', () => {
        expect(IsTransientGitHubError(requestError(500, 'request failed', 'ECONNRESET'))).toBe(true);
        expect(IsTransientGitHubError(requestError(500, 'read ECONNRESET'))).toBe(true);
    });

    it('treats gateway statuses as transient', () => {
        for (const status of [502, 503, 504]) {
            expect(IsTransientGitHubError(requestError(status, 'gateway'))).toBe(true);
        }
    });

    it('never retries an answer: not found, forbidden, rate limited, or a plain server error', () => {
        for (const status of [400, 401, 403, 404, 422, 429]) {
            expect(IsTransientGitHubError(requestError(status, 'nope'))).toBe(false);
        }
        expect(IsTransientGitHubError(requestError(500, 'internal error'))).toBe(false);
        expect(IsTransientGitHubError(new Error('Expected a file at x, but got a dir'))).toBe(false);
        expect(IsTransientGitHubError(undefined)).toBe(false);
    });
});

describe('RequestWithRetry', () => {
    it('returns the first success without retrying', async () => {
        const attempt = vi.fn(async () => 'ok');
        await expect(RequestWithRetry(attempt, [1, 1], noSleep)).resolves.toBe('ok');
        expect(attempt).toHaveBeenCalledTimes(1);
    });

    it('retries a transient failure and returns the eventual success', async () => {
        const attempt = vi.fn()
            .mockRejectedValueOnce(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }))
            .mockRejectedValueOnce(requestError(503, 'unavailable'))
            .mockResolvedValueOnce('ok');
        const sleep = vi.fn(async () => undefined);
        await expect(RequestWithRetry(attempt, [10, 20, 30], sleep)).resolves.toBe('ok');
        expect(attempt).toHaveBeenCalledTimes(3);
        expect(sleep.mock.calls.map((c) => c[0])).toEqual([10, 20]);
    });

    it('gives up after the last delay and rethrows the final error', async () => {
        const reset = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
        const attempt = vi.fn(async () => { throw reset; });
        await expect(RequestWithRetry(attempt, [1, 1], noSleep)).rejects.toBe(reset);
        expect(attempt).toHaveBeenCalledTimes(3);
    });

    it('rethrows a non-transient error immediately', async () => {
        const notFound = requestError(404, 'Not Found');
        const attempt = vi.fn(async () => { throw notFound; });
        await expect(RequestWithRetry(attempt, [1, 1, 1], noSleep)).rejects.toBe(notFound);
        expect(attempt).toHaveBeenCalledTimes(1);
    });
});
