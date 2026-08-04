import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Regression coverage for a memory leak (Memory Leak Audit Round 5/6, Critical):
// `ExecuteCodeAction.InternalRunAction` used to call `new CodeExecutionService()`
// on every action run. `CodeExecutionService.execute()` auto-initializes its
// `WorkerPool` on first use, forking OS child processes that were never reaped
// because the action never called `shutdown()`. `ExecuteCodeServiceProvider` fixes
// this by holding one process-lifetime `CodeExecutionService` shared across calls.
// ---------------------------------------------------------------------------

const { constructedCount, shutdownMock, ServiceStub } = vi.hoisted(() => {
    const state = { constructedCount: 0 };
    const shutdownMock = vi.fn(async () => {});
    class ServiceStub {
        public readonly instanceId: number;
        constructor() {
            state.constructedCount++;
            this.instanceId = state.constructedCount;
        }
        async execute() {
            return { success: true, output: 'ok' };
        }
        async shutdown() {
            return shutdownMock();
        }
    }
    return { constructedCount: state, shutdownMock, ServiceStub };
});

vi.mock('@memberjunction/code-execution', () => ({
    CodeExecutionService: ServiceStub
}));

const { registerMock } = vi.hoisted(() => ({ registerMock: vi.fn() }));

vi.mock('@memberjunction/global', () => {
    // Minimal BaseSingleton — same pattern as RuntimeActionExecutor.test.ts.
    class BaseSingleton<T> {
        private static _cache = new Map<string, unknown>();
        protected constructor() {}
        protected static getInstance<U>(this: new () => U, className?: string): U {
            const key = className ?? (this as unknown as { name: string }).name;
            if (!BaseSingleton._cache.has(key)) {
                BaseSingleton._cache.set(key, new this());
            }
            return BaseSingleton._cache.get(key) as U;
        }
    }
    class ShutdownRegistry {
        static Instance = { Register: registerMock };
    }
    return { BaseSingleton, ShutdownRegistry };
});

import { ExecuteCodeServiceProvider } from '../custom/code-execution/execute-code-service-provider';

describe('ExecuteCodeServiceProvider', () => {
    beforeEach(() => {
        constructedCount.constructedCount = 0;
        shutdownMock.mockClear();
    });

    it('is a singleton that registers itself with ShutdownRegistry exactly once', () => {
        // The provider is a process-wide singleton (mirrors real BaseSingleton semantics),
        // so construction — and the Register(this) call in its constructor — happens at
        // most once, on whichever access to `.Instance` is first across the whole suite.
        // registerMock is intentionally NOT cleared per-test (unlike shutdownMock/
        // constructedCount above) so this assertion holds regardless of test order.
        const a = ExecuteCodeServiceProvider.Instance;
        const b = ExecuteCodeServiceProvider.Instance;
        expect(a).toBe(b);
        expect(registerMock).toHaveBeenCalledTimes(1);
    });

    it('GetService() lazily creates exactly one CodeExecutionService and reuses it', () => {
        const provider = ExecuteCodeServiceProvider.Instance;
        const before = constructedCount.constructedCount;

        const service1 = provider.GetService();
        const service2 = provider.GetService();
        const service3 = provider.GetService();

        expect(service1).toBe(service2);
        expect(service2).toBe(service3);
        // Exactly one new construction happened across all three calls (may be 0 if a
        // prior test already created it and Shutdown() wasn't called since — so just
        // assert it didn't grow past +1 for this block of calls).
        expect(constructedCount.constructedCount - before).toBeLessThanOrEqual(1);
    });

    it('Shutdown() calls the underlying service.shutdown() and releases the reference', async () => {
        const provider = ExecuteCodeServiceProvider.Instance;
        const service = provider.GetService(); // ensure a service exists
        void service;

        await provider.Shutdown();
        expect(shutdownMock).toHaveBeenCalledTimes(1);

        // After Shutdown(), the next GetService() call must construct a fresh instance —
        // proving the old (now-terminated) worker pool isn't handed out again.
        const before = constructedCount.constructedCount;
        const freshService = provider.GetService();
        expect(constructedCount.constructedCount).toBe(before + 1);
        expect(freshService).not.toBe(service);
    });

    it('Shutdown() is idempotent — a second call does not re-invoke the underlying shutdown', async () => {
        const provider = ExecuteCodeServiceProvider.Instance;
        provider.GetService();

        await provider.Shutdown();
        expect(shutdownMock).toHaveBeenCalledTimes(1);

        await provider.Shutdown();
        // No service was live to shut down the second time.
        expect(shutdownMock).toHaveBeenCalledTimes(1);
    });

    it('Shutdown() is a safe no-op when GetService() was never called', async () => {
        const provider = ExecuteCodeServiceProvider.Instance;
        await provider.Shutdown();
        await expect(provider.Shutdown()).resolves.toBeUndefined();
    });
});
