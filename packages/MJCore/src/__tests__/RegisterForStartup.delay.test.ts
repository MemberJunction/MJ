import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StartupManager, IStartupSink } from '../generic/RegisterForStartup';
import { IMetadataProvider } from '../generic/interfaces';
import { UserInfo } from '../generic/securityInfo';

// Mock storage provider needed by LocalCacheManager initialization
const mockStorageProvider = {
    GetItems: () => Promise.resolve([]),
    SetItems: () => Promise.resolve(),
    RemoveItems: () => Promise.resolve(),
} as any;

const mockMetadataProvider = {
    LocalStorageProvider: mockStorageProvider,
} as unknown as IMetadataProvider;

describe('StartupManager deferredDelay feature', () => {
    beforeEach(() => {
        StartupManager.Instance.Reset();
        vi.useFakeTimers();
    });

    it('should immediately fire a deferred startup sink if deferredDelay is not set', async () => {
        let called = false;
        const mockSink: IStartupSink = {
            HandleStartup: async () => {
                called = true;
            }
        };

        StartupManager.Instance.Register({
            constructor: class DummyClass implements IStartupSink {
                HandleStartup = mockSink.HandleStartup;
            },
            getInstance: () => mockSink,
            options: { deferred: true }
        });

        // Run startup
        await StartupManager.Instance.Startup(true, {} as UserInfo, mockMetadataProvider);

        // Immediate check should be true because there is no delay
        expect(called).toBe(true);
    });

    it('should delay the HandleStartup execution by deferredDelay milliseconds', async () => {
        let called = false;
        const mockSink: IStartupSink = {
            HandleStartup: async () => {
                called = true;
            }
        };

        StartupManager.Instance.Register({
            constructor: class DelayClass implements IStartupSink {
                HandleStartup = mockSink.HandleStartup;
            },
            getInstance: () => mockSink,
            options: { deferred: true, deferredDelay: 500 }
        });

        // Run startup
        await StartupManager.Instance.Startup(true, {} as UserInfo, mockMetadataProvider);

        // Should not have been called yet since delay is 500ms
        expect(called).toBe(false);

        // Advance timers by 200ms - still should not be called
        await vi.advanceTimersByTimeAsync(200);
        expect(called).toBe(false);

        // Advance timers by another 300ms (total 500ms) - should be called now
        await vi.advanceTimersByTimeAsync(300);
        expect(called).toBe(true);
    });
});
