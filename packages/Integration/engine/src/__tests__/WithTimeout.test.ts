import { describe, it, expect, vi } from 'vitest';
import { WithTimeout } from '../BaseIntegrationConnector.js';

describe('WithTimeout', () => {
    it('should return the result when promise resolves before timeout', async () => {
        const promise = Promise.resolve('fast result');
        const result = await WithTimeout(promise, 5000, 'TestOperation');
        expect(result).toBe('fast result');
    });

    it('should reject with timeout error when promise takes too long', async () => {
        // Use a real short timeout to avoid fake timer issues
        const neverResolves = new Promise<string>(() => {
            // intentionally never settles
        });

        await expect(
            WithTimeout(neverResolves, 50, 'SlowOperation')
        ).rejects.toThrow("Operation 'SlowOperation' timed out after 50ms");
    });

    it('should include the operation name in the timeout error message', async () => {
        const neverResolves = new Promise<string>(() => {});

        await expect(
            WithTimeout(neverResolves, 50, 'FetchChanges')
        ).rejects.toThrow("Operation 'FetchChanges' timed out after 50ms");
    });

    it('should include the timeout duration in the error message', async () => {
        const neverResolves = new Promise<string>(() => {});

        await expect(
            WithTimeout(neverResolves, 75, 'Discovery')
        ).rejects.toThrow('75ms');
    });

    it('should clear the timeout when the promise resolves before timeout', async () => {
        const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

        const promise = Promise.resolve('done');
        await WithTimeout(promise, 5000, 'QuickOp');

        expect(clearTimeoutSpy).toHaveBeenCalled();
        clearTimeoutSpy.mockRestore();
    });

    it('should clear the timeout when the promise rejects before timeout', async () => {
        const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

        const promise = Promise.reject(new Error('original error'));

        await expect(
            WithTimeout(promise, 5000, 'FailingOp')
        ).rejects.toThrow('original error');

        expect(clearTimeoutSpy).toHaveBeenCalled();
        clearTimeoutSpy.mockRestore();
    });

    it('should propagate the original error when promise rejects before timeout', async () => {
        const promise = Promise.reject(new Error('connection refused'));

        await expect(
            WithTimeout(promise, 5000, 'ConnectOp')
        ).rejects.toThrow('connection refused');
    });

    it('should work with different return types', async () => {
        // Number type
        expect(await WithTimeout(Promise.resolve(42), 5000, 'NumOp')).toBe(42);

        // Object type
        expect(await WithTimeout(Promise.resolve({ key: 'value' }), 5000, 'ObjOp'))
            .toEqual({ key: 'value' });

        // Array type
        expect(await WithTimeout(Promise.resolve([1, 2, 3]), 5000, 'ArrOp'))
            .toEqual([1, 2, 3]);
    });

    it('should handle zero timeout (immediate rejection for pending promise)', async () => {
        // A promise that resolves after a delay
        const delayedPromise = new Promise<string>(resolve => {
            setTimeout(() => resolve('delayed'), 1000);
        });

        await expect(
            WithTimeout(delayedPromise, 0, 'ZeroTimeoutOp')
        ).rejects.toThrow("Operation 'ZeroTimeoutOp' timed out after 0ms");
    });
});
