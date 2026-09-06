import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Mocks — must be defined before importing the module under test
// ============================================================================

/**
 * The provider the mocked BaseEngine hands back from `ProviderToUse`. Tests set this to
 * `undefined` to reproduce the real-world case this suite exists for: a host (or a test
 * environment) where no metadata provider is configured, or one that has been torn down
 * while a debounced flush timer is still armed.
 */
let mockProvider: { CurrentUser?: { ID: string } } | undefined;

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
        MJGlobal: { Instance: { GetGlobalObjectStore: () => ({}) } },
    };
});

vi.mock('@memberjunction/core', () => {
    return {
        BaseEngine: class MockBaseEngine {
            static getInstance<T>(): T {
                const ctor = this as unknown as { _testInstance?: T; new (): T };
                if (!ctor._testInstance) {
                    ctor._testInstance = new ctor();
                }
                return ctor._testInstance;
            }
            async Load(): Promise<void> {
                // no-op in tests
            }
            get ProviderToUse() {
                return mockProvider;
            }
        },
        BaseEnginePropertyConfig: class {},
        IMetadataProvider: class {},
        Metadata: class MockMetadata {
            get CurrentUser() {
                return mockProvider?.CurrentUser;
            }
        },
        LogStatus: () => undefined,
        RunView: class {},
        ApplicationInfo: class {},
        RegisterForStartup: () => () => {},
        UserInfo: class {},
    };
});

vi.mock('../generated/entity_subclasses', () => ({
    MJUserNotificationEntity: class {},
    MJUserNotificationTypeEntity: class {},
    MJWorkspaceEntity: class {},
    MJUserApplicationEntity: class {},
    MJUserFavoriteEntity: class {},
    MJUserRecordLogEntity: class {},
    MJUserSettingEntity: class {},
    MJUserNotificationPreferenceEntity: class {},
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks
// ---------------------------------------------------------------------------

import { UserInfoEngine } from '../engines/UserInfoEngine';

/**
 * Collects `unhandledRejection` events raised while a test body runs.
 *
 * This is the whole point of the suite: the defect being guarded against never failed an
 * assertion. Every test in the affected package passed and the run still exited non-zero,
 * because a debounced flush rejected with nothing attached to catch it. Asserting on
 * return values alone would not have caught it.
 */
function captureUnhandledRejections(): { reasons: unknown[]; stop: () => void } {
    const reasons: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
        reasons.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    return {
        reasons,
        stop: () => process.off('unhandledRejection', onUnhandled),
    };
}

/** Lets any pending microtask-queue work settle so a rejection has a chance to surface. */
async function drainMicrotasks(): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
}

describe('UserInfoEngine — settings flush resilience', () => {
    let engine: UserInfoEngine;

    beforeEach(() => {
        engine = UserInfoEngine.Instance;
        mockProvider = { CurrentUser: { ID: 'U0000000-0000-0000-0000-000000000001' } };
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    describe('SetSetting with no configured provider', () => {
        it('returns false instead of throwing when ProviderToUse is undefined', async () => {
            mockProvider = undefined;

            // Before the guard, this threw `Cannot read properties of undefined (reading
            // 'CurrentUser')` because only `CurrentUser` was optional-chained, not the provider.
            await expect(engine.SetSetting('some-key', 'some-value')).resolves.toBe(false);
            expect(console.error).toHaveBeenCalledWith('UserInfoEngine.SetSetting: No user context available');
        });

    });

    describe('debounced flush timer', () => {
        it('does not raise an unhandled rejection when the flush rejects', async () => {
            vi.useFakeTimers();
            const captured = captureUnhandledRejections();

            try {
                // Force the flush to reject so the timer's error path is genuinely exercised —
                // the bare `setTimeout(() => this.FlushPendingSettings())` had nothing attached.
                vi.spyOn(engine, 'FlushPendingSettings').mockRejectedValue(new Error('flush blew up'));

                engine.SetSettingDebounced('some-key', 'some-value');
                await vi.runAllTimersAsync();

                vi.useRealTimers();
                await drainMicrotasks();

                expect(captured.reasons).toEqual([]);
                expect(console.error).toHaveBeenCalledWith(
                    'UserInfoEngine: debounced settings flush failed',
                    expect.any(Error)
                );
            } finally {
                captured.stop();
            }
        });

        it('does not raise an unhandled rejection when the timer outlives its provider', async () => {
            vi.useFakeTimers();
            const captured = captureUnhandledRejections();

            try {
                engine.SetSettingDebounced('some-key', 'some-value');

                // Simulate teardown between arming the timer and it firing — this is the exact
                // sequence that reddened unrelated CI runs.
                mockProvider = undefined;

                await vi.runAllTimersAsync();
                vi.useRealTimers();
                await drainMicrotasks();

                expect(captured.reasons).toEqual([]);
            } finally {
                captured.stop();
            }
        });
    });
});
