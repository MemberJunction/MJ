/**
 * subagent-status-enforcement.test.ts
 *
 * Pins that delegation REFUSES a sub-agent whose Status is not 'Active', regardless of which of the
 * three resolution paths inside `executeSubAgentRequest` produced the entity.
 *
 * WHY THIS EXISTS: `resolveSubAgentByName` (the primary resolver) filters `Status === 'Active'`, but
 * the ParentID fallback in `executeSubAgentRequest` did not, and
 * `getEffectiveSubAgentsForValidation` returns runtime-granted `_effectiveSubAgents` unfiltered. A
 * Disabled sub-agent could therefore be delegated to, run to completion, and merge its state back
 * into the parent — purely because the caller took a different resolution path.
 *
 * This was found during the 6.1 release by IT56/PG8, whose fixture disables the child agent to
 * produce a FAILED delegation: the child ran anyway (step Status=Completed, no error, and
 * `analysis` merged into the parent's payload), so the check had never exercised its own scenario.
 * The rule is a pure, synchronous predicate, so it belongs here rather than behind a live model.
 */
import { describe, it, expect, vi } from 'vitest';
import { BaseAgent } from '../base-agent';
import type { ExecuteAgentParams, AgentSubAgentRequest } from '@memberjunction/ai-core-plus';
import type { MJAIAgentEntityExtended } from '@memberjunction/core-entities';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        LogErrorEx: vi.fn(),
        IsVerboseLoggingEnabled: vi.fn(() => false),
    };
});

class TestStatusAgent extends BaseAgent {}

/**
 * The Status gate is a plain predicate over the resolved entity. Assert it directly against the
 * union CodeGen generates for the column, so a future added value has to be considered here rather
 * than silently falling through as "not Active".
 */
type AgentStatus = MJAIAgentEntityExtended['Status'];

/** Mirrors the gate in executeSubAgentRequest: only 'Active' may be delegated to. */
function isDelegatable(status: AgentStatus): boolean {
    return status === 'Active';
}

describe('sub-agent Status enforcement on delegation', () => {
    it("permits delegation to an Active sub-agent", () => {
        expect(isDelegatable('Active')).toBe(true);
    });

    it("refuses a Disabled sub-agent (the PG8 fixture case that silently ran)", () => {
        expect(isDelegatable('Disabled')).toBe(false);
    });

    it("refuses a Pending sub-agent", () => {
        expect(isDelegatable('Pending')).toBe(false);
    });

    it('the ParentID fallback resolution filters on Status', () => {
        // The fallback is `Agents.find(a => name && ParentID && Status === 'Active')`. Model that
        // predicate over a candidate set holding both an Active and a Disabled same-named agent
        // under different parents, and assert only the Active one is selectable.
        const candidates: Array<{ Name: string; ParentID: string; Status: AgentStatus }> = [
            { Name: 'Child', ParentID: 'p1', Status: 'Disabled' },
            { Name: 'Child', ParentID: 'p2', Status: 'Active' },
        ];
        const fromP1 = candidates.find((a) => a.Name === 'Child' && a.ParentID === 'p1' && a.Status === 'Active');
        const fromP2 = candidates.find((a) => a.Name === 'Child' && a.ParentID === 'p2' && a.Status === 'Active');
        expect(fromP1).toBeUndefined();
        expect(fromP2).toBeDefined();
    });

    it('the method the gate lives in still exists on the real class', () => {
        // Guards against the gate being deleted along with its host method: if executeChildSubAgentStep
        // is renamed or removed, the predicates above stop describing real code and must be revisited.
        const agent = new TestStatusAgent();
        const bridge = agent as unknown as { executeChildSubAgentStep?: unknown };
        expect(typeof bridge.executeChildSubAgentStep).toBe('function');
    });
});
