import { describe, it, expect } from 'vitest';
import { isDelegationOnly } from '../utils/AgentFlags';
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';

/**
 * Truth-table tests for the DelegationOnly flag reader.
 * The function backs the new `params.agent.DelegationOnly` knob in
 * `BaseAgent.executeChildSubAgentStep` / `executeRelatedSubAgentStep` —
 * any drift here changes whether parent agents short-circuit after their
 * sub-agents succeed, so the semantics need to be pinned.
 */
describe('isDelegationOnly', () => {
    it('returns false when agent is undefined', () => {
        expect(isDelegationOnly(undefined)).toBe(false);
    });

    it('returns false when agent is missing the DelegationOnly column entirely (legacy row)', () => {
        const legacyAgent = { Name: 'LegacyAgent', ID: 'agent-1' } as unknown as MJAIAgentEntityExtended;
        expect(isDelegationOnly(legacyAgent)).toBe(false);
    });

    it('returns false when DelegationOnly is explicitly false', () => {
        const agent = { Name: 'NormalAgent', DelegationOnly: false } as unknown as MJAIAgentEntityExtended;
        expect(isDelegationOnly(agent)).toBe(false);
    });

    it('returns true only when DelegationOnly is the literal boolean true', () => {
        const agent = { Name: 'RouterAgent', DelegationOnly: true } as unknown as MJAIAgentEntityExtended;
        expect(isDelegationOnly(agent)).toBe(true);
    });

    it('returns false for truthy non-boolean values (strict equality is intentional)', () => {
        const stringy = { DelegationOnly: 'true' } as unknown as MJAIAgentEntityExtended;
        const numeric = { DelegationOnly: 1 } as unknown as MJAIAgentEntityExtended;
        expect(isDelegationOnly(stringy)).toBe(false);
        expect(isDelegationOnly(numeric)).toBe(false);
    });

    it('returns false for null', () => {
        const nulled = { DelegationOnly: null } as unknown as MJAIAgentEntityExtended;
        expect(isDelegationOnly(nulled)).toBe(false);
    });
});
