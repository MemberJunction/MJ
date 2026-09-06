/**
 * In-process cancel fallback, complementing the durable `CancelSyncAsync` DB stamp.
 *
 * `CancelSyncAsync` writes `CancelRequestedAt` on the run row so a cancel issued from ANY
 * process reaches the owner at its next batch boundary / lease renewal — necessary because the
 * owner may be a different node entirely. But when the run is executing in THIS process, that
 * DB round trip is pure latency: the engine already holds a live `(cancelRequested flag,
 * AbortController)` pair for the run, wired through `onCancelRequested` exactly like the
 * boundary-check path. `RequestCancelInProcess` reaches that pair directly.
 *
 * It also covers a schema gap the durable path cannot: a deployment predating the ownership
 * columns has no `CancelRequestedAt` to stamp, so `CancelSyncAsync` truthfully (but uselessly)
 * reports nothing cancelled. `RequestCancelInProcess` needs no schema at all — it is a plain
 * in-memory registry — so it is the only working cancel path there.
 *
 * These tests exercise the registry in isolation via the same `IntegrationEngine as unknown as
 * {...}` pattern used elsewhere in this suite (see BatchedWriteMode.test.ts's `ContextHolder`)
 * rather than driving a full RunSync, since the registration/deregistration call sites
 * (`runWithOwnedContext`, `ResumeOneOrphanedRun`) are exercised by the worker-mode and
 * orphan-sweep test files already.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { IntegrationEngine } from '../IntegrationEngine.js';

/** Reaches the private live-run cancel registry. Named rather than cast to `any`. */
type LiveRunCancelRegistry = { liveRunCancels: Map<string, () => void> };
const registry = (): Map<string, () => void> =>
    (IntegrationEngine as unknown as LiveRunCancelRegistry).liveRunCancels;

describe('IntegrationEngine.RequestCancelInProcess', () => {
    beforeEach(() => {
        registry().clear();
    });

    it('returns false when no run is registered for this CompanyIntegration', () => {
        expect(IntegrationEngine.RequestCancelInProcess('ci-nothing-live')).toBe(false);
    });

    it('fires the registered hook exactly once and reports success', () => {
        let calls = 0;
        registry().set('ci-live', () => { calls++; });

        const result = IntegrationEngine.RequestCancelInProcess('ci-live');

        expect(result).toBe(true);
        expect(calls).toBe(1);
    });

    it('matches the CompanyIntegrationID case-insensitively, like activeSyncs', () => {
        let calls = 0;
        registry().set('ci-mixed-case', () => { calls++; });

        expect(IntegrationEngine.RequestCancelInProcess('CI-MIXED-CASE')).toBe(true);
        expect(calls).toBe(1);
    });

    it('returns false once the run has finished and its hook was deregistered', () => {
        let calls = 0;
        registry().set('ci-finished', () => { calls++; });
        registry().delete('ci-finished'); // what the run's `finally` does on completion

        expect(IntegrationEngine.RequestCancelInProcess('ci-finished')).toBe(false);
        expect(calls).toBe(0);
    });
});
