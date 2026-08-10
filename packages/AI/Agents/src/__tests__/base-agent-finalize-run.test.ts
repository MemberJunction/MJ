/**
 * Tests for BaseAgent.finalizeRun / deriveRunOutcome — regression coverage for a memory/resource
 * leak (Memory Leak Audit Round 10, Critical): `HarnessAgentBase.EndHarnessSession()` tore down an
 * agent-run's sandbox (a live Docker container, or a temp directory) but had zero callers anywhere
 * in the codebase, so the sandbox was never finalized — every AI Agent Harness run leaked a running
 * container or an orphaned directory for the life of the host process.
 *
 * `Execute()`'s top-level `finally` block (which already released timeout/abort listeners and the
 * per-run data cache on every exit path — see `base-agent-release-per-run-cache.test.ts`) now also
 * calls `this.finalizeRun(this.deriveRunOutcome())`. `finalizeRun` is a no-op hook on `BaseAgent`
 * itself; `HarnessAgentBase` overrides it to call `EndHarnessSession` (covered in
 * `packages/AI/AgentHarness/src/__tests__/harness-agent-base-finalize-run.test.ts`).
 *
 * These tests exercise the REAL private/protected methods on a real `BaseAgent` instance — no
 * reimplementation — mirroring the pattern in `base-agent-release-per-run-cache.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { BaseAgent } from '../base-agent';

type RunOutcome = 'success' | 'failure' | 'cancelled';

function deriveOutcome(agent: BaseAgent): RunOutcome {
    return (agent as unknown as { deriveRunOutcome(): RunOutcome }).deriveRunOutcome();
}

function setAgentRunStatus(agent: BaseAgent, status: string | undefined): void {
    (agent as unknown as { _agentRun: { Status?: string } | null })._agentRun =
        status === undefined ? null : { Status: status };
}

function callFinalizeRun(agent: BaseAgent, outcome: RunOutcome): Promise<void> {
    return (agent as unknown as { finalizeRun(outcome: RunOutcome): Promise<void> }).finalizeRun(outcome);
}

describe('BaseAgent.deriveRunOutcome', () => {
    it('maps AgentRun.Status "Cancelled" to "cancelled"', () => {
        const agent = new BaseAgent();
        setAgentRunStatus(agent, 'Cancelled');
        expect(deriveOutcome(agent)).toBe('cancelled');
    });

    it('maps AgentRun.Status "Failed" to "failure"', () => {
        const agent = new BaseAgent();
        setAgentRunStatus(agent, 'Failed');
        expect(deriveOutcome(agent)).toBe('failure');
    });

    it('maps AgentRun.Status "Completed" to "success"', () => {
        const agent = new BaseAgent();
        setAgentRunStatus(agent, 'Completed');
        expect(deriveOutcome(agent)).toBe('success');
    });

    it('maps AgentRun.Status "AwaitingFeedback" to "success" — a settled end-of-turn, not an in-progress state', () => {
        // AwaitingFeedback is how a Chat-type final step ends a normal conversational turn
        // (see BaseAgent.settledRunStatuses); the Execute() call that produced it has genuinely
        // finished, so any per-run resource (e.g. a Harness sandbox) must be torn down exactly as
        // it would be for a Completed run — a NEW Execute() call provisions its own fresh sandbox
        // for the next turn regardless.
        const agent = new BaseAgent();
        setAgentRunStatus(agent, 'AwaitingFeedback');
        expect(deriveOutcome(agent)).toBe('success');
    });

    it('defaults to "success" when _agentRun was never created (e.g. Execute() failed before creating it)', () => {
        const agent = new BaseAgent();
        setAgentRunStatus(agent, undefined);
        expect(deriveOutcome(agent)).toBe('success');
    });
});

describe('BaseAgent.finalizeRun', () => {
    it('is a no-op on the base class for every outcome (subclasses opt in by overriding)', async () => {
        const agent = new BaseAgent();
        await expect(callFinalizeRun(agent, 'success')).resolves.toBeUndefined();
        await expect(callFinalizeRun(agent, 'failure')).resolves.toBeUndefined();
        await expect(callFinalizeRun(agent, 'cancelled')).resolves.toBeUndefined();
    });
});
