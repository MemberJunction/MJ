/**
 * Tests for BaseAgent.releasePerRunDataCache — regression coverage for a memory leak
 * (Memory Leak Audit Round 5/6, Critical): `AgentDataPreloader.clearRunCache(runId)`
 * existed and was documented "should be called when an agent run completes," but had
 * zero callers anywhere in the codebase — every `PerRun`-cache-policy data source
 * (`AgentDataPreloader._perRunCache`) leaked one Map entry per agent run for the life
 * of the process.
 *
 * `Execute()`'s top-level `finally` block (which already released timeout/abort
 * listeners on every exit path) now also calls this method. Exercises the REAL
 * private method on a real BaseAgent instance — no reimplementation — with
 * `AgentDataPreloader.Instance.clearRunCache` spied rather than mocked away, so the
 * real singleton + real Map delete semantics are what's under test.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseAgent } from '../base-agent';
import { AgentDataPreloader } from '../AgentDataPreloader';

function callRelease(agent: BaseAgent): void {
    (agent as unknown as { releasePerRunDataCache(): void }).releasePerRunDataCache();
}

describe('BaseAgent.releasePerRunDataCache', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('clears the per-run cache entry for the current run when _agentRun is set', () => {
        const clearRunCacheSpy = vi.spyOn(AgentDataPreloader.Instance, 'clearRunCache');
        const agent = new BaseAgent();
        (agent as unknown as { _agentRun: { ID: string } })._agentRun = { ID: 'run-123' };

        callRelease(agent);

        expect(clearRunCacheSpy).toHaveBeenCalledTimes(1);
        expect(clearRunCacheSpy).toHaveBeenCalledWith('run-123');
    });

    it('is a no-op when _agentRun was never set (e.g. Execute() failed before creating it)', () => {
        const clearRunCacheSpy = vi.spyOn(AgentDataPreloader.Instance, 'clearRunCache');
        const agent = new BaseAgent();

        callRelease(agent);

        expect(clearRunCacheSpy).not.toHaveBeenCalled();
    });

    it('is a no-op when _agentRun has no ID', () => {
        const clearRunCacheSpy = vi.spyOn(AgentDataPreloader.Instance, 'clearRunCache');
        const agent = new BaseAgent();
        (agent as unknown as { _agentRun: { ID: string | undefined } })._agentRun = { ID: undefined };

        callRelease(agent);

        expect(clearRunCacheSpy).not.toHaveBeenCalled();
    });

    it('actually removes the entry from the real per-run cache Map (end-to-end through the real singleton)', () => {
        const agent = new BaseAgent();
        const runId = `run-${Math.floor(Math.random() * 1e9)}`;
        (agent as unknown as { _agentRun: { ID: string } })._agentRun = { ID: runId };

        // Populate the real cache the way PreloadAgentData() would (PerRun policy path),
        // reaching into the private Map the same way AgentDataPreloader's own internals do.
        const preloader = AgentDataPreloader.Instance as unknown as {
            _perRunCache: Map<string, Map<string, unknown>>;
        };
        preloader._perRunCache.set(runId, new Map([['some-source', { data: 'x' }]]));
        expect(preloader._perRunCache.has(runId)).toBe(true);

        callRelease(agent);

        expect(preloader._perRunCache.has(runId)).toBe(false);
    });
});
