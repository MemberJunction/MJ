/**
 * A statement's timeout must stop the statement, not just stop waiting for it: a request still
 * running on the server holds its pool connection and keeps working for nobody.
 */
import { describe, it, expect, vi } from 'vitest';
import { QueryWithTimeout } from '../SQLServerDataProvider';

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

describe('QueryWithTimeout', () => {
    it('cancels the request when the timeout passes', async () => {
        const request = fakeRequest(null);
        await expect(QueryWithTimeout(request, 'SELECT 1', 20)).rejects.toThrow('Query timeout exceeded');
        expect(request.cancel).toHaveBeenCalledTimes(1);
    });

    it('returns the result and cancels nothing when the query finishes in time', async () => {
        const request = fakeRequest(5);
        await expect(QueryWithTimeout(request, 'SELECT 1', 1000)).resolves.toBe('rows');
        expect(request.cancel).not.toHaveBeenCalled();
    });
});
