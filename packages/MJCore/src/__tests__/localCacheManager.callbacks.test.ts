/**
 * Tests for LocalCacheManager cross-server cache invalidation callbacks.
 *
 * Tests the RegisterChangeCallback, DispatchCacheChange, and related
 * functionality that enables cross-server cache invalidation via Redis pub/sub.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalCacheManager, CacheChangedEvent } from '../generic/localCacheManager';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { GetGlobalObjectStore } from '@memberjunction/global';

function resetLocalCacheManager() {
    const g = GetGlobalObjectStore();
    const key = '___SINGLETON__LocalCacheManager';
    delete g[key];
}

describe('LocalCacheManager Cache Change Callbacks', () => {
    let cacheManager: LocalCacheManager;

    beforeEach(() => {
        resetLocalCacheManager();
        cacheManager = LocalCacheManager.Instance;
        const mockStorage = new MockCacheStorageProvider();
        cacheManager.Initialize({ enabled: true }, mockStorage);
    });

    function createEvent(overrides?: Partial<CacheChangedEvent>): CacheChangedEvent {
        return {
            CacheKey: 'TestEntity|Active=1|||||',
            Category: 'RunViewCache',
            Action: 'set',
            Timestamp: Date.now(),
            SourceServerId: 'server-abc-123',
            Data: JSON.stringify({ results: [{ ID: '1', Name: 'Test' }], maxUpdatedAt: '2024-01-01' }),
            ...overrides,
        };
    }

    describe('RegisterChangeCallback', () => {
        it('should register a callback and return an unsubscribe function', () => {
            const callback = vi.fn();
            const unsubscribe = cacheManager.RegisterChangeCallback('fp1', callback);
            expect(typeof unsubscribe).toBe('function');
            expect(cacheManager.ChangeCallbackCount).toBe(1);
        });

        it('should allow multiple callbacks for the same fingerprint', () => {
            const cb1 = vi.fn();
            const cb2 = vi.fn();
            cacheManager.RegisterChangeCallback('fp1', cb1);
            cacheManager.RegisterChangeCallback('fp1', cb2);
            // Still only one fingerprint key
            expect(cacheManager.ChangeCallbackCount).toBe(1);
        });

        it('should allow callbacks for different fingerprints', () => {
            const cb1 = vi.fn();
            const cb2 = vi.fn();
            cacheManager.RegisterChangeCallback('fp1', cb1);
            cacheManager.RegisterChangeCallback('fp2', cb2);
            expect(cacheManager.ChangeCallbackCount).toBe(2);
        });
    });

    describe('Unsubscribe', () => {
        it('should remove a specific callback when unsubscribe is called', () => {
            const cb1 = vi.fn();
            const cb2 = vi.fn();
            const unsub1 = cacheManager.RegisterChangeCallback('fp1', cb1);
            cacheManager.RegisterChangeCallback('fp1', cb2);

            unsub1();

            const event = createEvent({ CacheKey: 'fp1' });
            cacheManager.DispatchCacheChange(event);

            expect(cb1).not.toHaveBeenCalled();
            expect(cb2).toHaveBeenCalledOnce();
        });

        it('should clean up the fingerprint entry when last callback is removed', () => {
            const cb = vi.fn();
            const unsub = cacheManager.RegisterChangeCallback('fp1', cb);
            expect(cacheManager.ChangeCallbackCount).toBe(1);

            unsub();
            expect(cacheManager.ChangeCallbackCount).toBe(0);
        });

        it('should be safe to call unsubscribe multiple times', () => {
            const cb = vi.fn();
            const unsub = cacheManager.RegisterChangeCallback('fp1', cb);
            unsub();
            unsub(); // Should not throw
            expect(cacheManager.ChangeCallbackCount).toBe(0);
        });
    });

    describe('DispatchCacheChange', () => {
        it('should invoke callback matching the event CacheKey', () => {
            const cb = vi.fn();
            cacheManager.RegisterChangeCallback('fp1', cb);

            const event = createEvent({ CacheKey: 'fp1' });
            cacheManager.DispatchCacheChange(event);

            expect(cb).toHaveBeenCalledOnce();
            expect(cb).toHaveBeenCalledWith(event);
        });

        it('should not invoke callbacks for non-matching fingerprints', () => {
            const cb = vi.fn();
            cacheManager.RegisterChangeCallback('fp1', cb);

            const event = createEvent({ CacheKey: 'fp2' });
            cacheManager.DispatchCacheChange(event);

            expect(cb).not.toHaveBeenCalled();
        });

        it('should invoke all callbacks for a matching fingerprint', () => {
            const cb1 = vi.fn();
            const cb2 = vi.fn();
            const cb3 = vi.fn();
            cacheManager.RegisterChangeCallback('fp1', cb1);
            cacheManager.RegisterChangeCallback('fp1', cb2);
            cacheManager.RegisterChangeCallback('fp1', cb3);

            const event = createEvent({ CacheKey: 'fp1' });
            cacheManager.DispatchCacheChange(event);

            expect(cb1).toHaveBeenCalledOnce();
            expect(cb2).toHaveBeenCalledOnce();
            expect(cb3).toHaveBeenCalledOnce();
        });

        it('should handle category_cleared by broadcasting to all callbacks', () => {
            const cb1 = vi.fn();
            const cb2 = vi.fn();
            cacheManager.RegisterChangeCallback('fp1', cb1);
            cacheManager.RegisterChangeCallback('fp2', cb2);

            const event = createEvent({
                CacheKey: 'RunViewCache',
                Category: 'RunViewCache',
                Action: 'category_cleared',
            });
            cacheManager.DispatchCacheChange(event);

            expect(cb1).toHaveBeenCalledOnce();
            expect(cb2).toHaveBeenCalledOnce();
        });

        it('should catch and log errors in individual callbacks without blocking others', () => {
            const errorCb = vi.fn().mockImplementation(() => {
                throw new Error('Callback exploded');
            });
            const goodCb = vi.fn();

            cacheManager.RegisterChangeCallback('fp1', errorCb);
            cacheManager.RegisterChangeCallback('fp1', goodCb);

            const event = createEvent({ CacheKey: 'fp1' });
            // Should not throw
            cacheManager.DispatchCacheChange(event);

            expect(errorCb).toHaveBeenCalledOnce();
            expect(goodCb).toHaveBeenCalledOnce();
        });

        it('should do nothing when no callbacks are registered', () => {
            const event = createEvent({ CacheKey: 'fp-unknown' });
            // Should not throw
            expect(() => cacheManager.DispatchCacheChange(event)).not.toThrow();
        });

        it('should pass the full event object to callbacks', () => {
            const cb = vi.fn();
            cacheManager.RegisterChangeCallback('fp1', cb);

            const event = createEvent({
                CacheKey: 'fp1',
                Action: 'removed',
                SourceServerId: 'server-xyz',
                Data: undefined,
            });
            cacheManager.DispatchCacheChange(event);

            const received = cb.mock.calls[0][0] as CacheChangedEvent;
            expect(received.CacheKey).toBe('fp1');
            expect(received.Action).toBe('removed');
            expect(received.SourceServerId).toBe('server-xyz');
            expect(received.Data).toBeUndefined();
        });
    });

    describe('ChangeCallbackCount', () => {
        it('should return 0 when no callbacks are registered', () => {
            expect(cacheManager.ChangeCallbackCount).toBe(0);
        });

        it('should reflect the number of unique fingerprints with callbacks', () => {
            cacheManager.RegisterChangeCallback('fp1', vi.fn());
            cacheManager.RegisterChangeCallback('fp1', vi.fn());
            cacheManager.RegisterChangeCallback('fp2', vi.fn());
            expect(cacheManager.ChangeCallbackCount).toBe(2);
        });
    });
});
