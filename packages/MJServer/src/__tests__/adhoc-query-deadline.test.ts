/**
 * The ad-hoc query deadline must stop the statement, not just stop waiting for it: a request
 * still running on the server holds its pool connection and keeps working for nobody.
 */
import { describe, it, expect, vi } from 'vitest';
import { RunWithDeadline } from '../resolvers/adhoc-query-helpers';

function fakeRequest(resolveAfterMs: number | null) {
    let rejectRunning: ((e: Error) => void) | undefined;
    return {
        query: vi.fn(() => new Promise<string>((resolve, reject) => {
            rejectRunning = reject;
            if (resolveAfterMs !== null) setTimeout(() => resolve('rows'), resolveAfterMs);
        })),
        cancel: vi.fn(() => rejectRunning?.(new Error('Canceled.'))),
    };
}

describe('RunWithDeadline', () => {
    it('cancels the request when the deadline passes', async () => {
        const request = fakeRequest(null);
        await expect(RunWithDeadline(request, 'SELECT 1', Date.now() + 20)).rejects.toThrow('Query timeout exceeded');
        expect(request.cancel).toHaveBeenCalledTimes(1);
    });

    it('returns the result and cancels nothing when the query finishes in time', async () => {
        const request = fakeRequest(5);
        await expect(RunWithDeadline(request, 'SELECT 1', Date.now() + 1000)).resolves.toBe('rows');
        expect(request.cancel).not.toHaveBeenCalled();
    });

    it('does not start a query whose deadline has already passed', async () => {
        const request = fakeRequest(5);
        await expect(RunWithDeadline(request, 'SELECT 1', Date.now() - 1)).rejects.toThrow('Query timeout exceeded');
        expect(request.query).not.toHaveBeenCalled();
    });
});
