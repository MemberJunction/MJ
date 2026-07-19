import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Regression coverage for a memory leak (Memory Leak Audit Round 7, Critical):
// `MJSidecarTrainer`/`MJSidecarPredictor` used to default to `new MLSidecar()`,
// and every production call site (`train-model.action.ts`, `run-experiment.deps.ts`,
// `score-record-set.runner.ts`, `operations/delegation.ts`) constructed a fresh
// trainer/predictor per run with no injected sidecar. `MLSidecar.start()` spawns a
// Python child process in managed mode, but nothing ever called `.stop()` on it —
// every "Train Model" / "Score Record Set" run leaked a live Python subprocess for
// the life of the host process. `MLSidecarProvider` fixes this by holding one
// process-lifetime `MLSidecar` shared across calls (mirrors
// `ExecuteCodeServiceProvider`, the same fix for the same bug shape in
// `packages/Actions/CoreActions`).
// ---------------------------------------------------------------------------

const { constructedCount, stopMock, MLSidecarStub } = vi.hoisted(() => {
    const state = { constructedCount: 0 };
    const stopMock = vi.fn(async () => {});
    class MLSidecarStub {
        public readonly instanceId: number;
        public readonly options: unknown;
        constructor(options?: unknown) {
            state.constructedCount++;
            this.instanceId = state.constructedCount;
            this.options = options;
        }
        async start() {
            /* no-op */
        }
        async stop() {
            return stopMock();
        }
    }
    return { constructedCount: state, stopMock, MLSidecarStub };
});

vi.mock('@memberjunction/predictive-studio-sidecar', () => ({
    MLSidecar: MLSidecarStub,
}));

const { registerMock } = vi.hoisted(() => ({ registerMock: vi.fn() }));

vi.mock('@memberjunction/global', () => {
    // Minimal BaseSingleton — same pattern as execute-code-service-provider.test.ts.
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

import { MLSidecarProvider } from '../sidecar-provider';

describe('MLSidecarProvider', () => {
    beforeEach(() => {
        constructedCount.constructedCount = 0;
        stopMock.mockClear();
    });

    it('is a singleton that registers itself with ShutdownRegistry exactly once', () => {
        // The provider is a process-wide singleton (mirrors real BaseSingleton semantics),
        // so construction — and the Register(this) call in its constructor — happens at
        // most once, on whichever access to `.Instance` is first across the whole suite.
        // registerMock is intentionally NOT cleared per-test so this assertion holds
        // regardless of test order.
        const a = MLSidecarProvider.Instance;
        const b = MLSidecarProvider.Instance;
        expect(a).toBe(b);
        expect(registerMock).toHaveBeenCalledTimes(1);
    });

    it('GetSidecar() lazily creates exactly one MLSidecar and reuses it', () => {
        const provider = MLSidecarProvider.Instance;
        const before = constructedCount.constructedCount;

        const sidecar1 = provider.GetSidecar();
        const sidecar2 = provider.GetSidecar();
        const sidecar3 = provider.GetSidecar();

        expect(sidecar1).toBe(sidecar2);
        expect(sidecar2).toBe(sidecar3);
        // Exactly one new construction happened across all three calls (may be 0 if a
        // prior test already created it and Shutdown() wasn't called since — so just
        // assert it didn't grow past +1 for this block of calls).
        expect(constructedCount.constructedCount - before).toBeLessThanOrEqual(1);
    });

    it('Shutdown() calls the underlying sidecar.stop() and releases the reference', async () => {
        const provider = MLSidecarProvider.Instance;
        const sidecar = provider.GetSidecar(); // ensure a sidecar exists
        void sidecar;

        await provider.Shutdown();
        expect(stopMock).toHaveBeenCalledTimes(1);

        // After Shutdown(), the next GetSidecar() call must construct a fresh instance —
        // proving the old (now-terminated) Python process isn't handed out again.
        const before = constructedCount.constructedCount;
        const freshSidecar = provider.GetSidecar();
        expect(constructedCount.constructedCount).toBe(before + 1);
        expect(freshSidecar).not.toBe(sidecar);
    });

    it('Shutdown() is idempotent — a second call does not re-invoke the underlying stop()', async () => {
        const provider = MLSidecarProvider.Instance;
        provider.GetSidecar();

        await provider.Shutdown();
        expect(stopMock).toHaveBeenCalledTimes(1);

        await provider.Shutdown();
        // No sidecar was live to stop the second time.
        expect(stopMock).toHaveBeenCalledTimes(1);
    });

    it('Shutdown() is a safe no-op when GetSidecar() was never called', async () => {
        const provider = MLSidecarProvider.Instance;
        await provider.Shutdown();
        await expect(provider.Shutdown()).resolves.toBeUndefined();
    });

    it('multiple trainer/predictor-style callers share the same underlying sidecar', () => {
        // Simulates train-model.action.ts / score-record-set.runner.ts / etc. each
        // resolving `MLSidecarProvider.Instance.GetSidecar()` independently per action
        // run — this is the exact call pattern that used to construct a fresh
        // `MLSidecar` (and leak a fresh Python process) on every single invocation.
        const before = constructedCount.constructedCount;
        const callSites = Array.from({ length: 5 }, () => MLSidecarProvider.Instance.GetSidecar());
        const distinctInstances = new Set(callSites);

        expect(distinctInstances.size).toBe(1);
        expect(constructedCount.constructedCount - before).toBeLessThanOrEqual(1);
    });
});
