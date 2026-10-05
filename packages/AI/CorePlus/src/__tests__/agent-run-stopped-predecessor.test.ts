/**
 * The run-state vocabulary on MJAIAgentRunEntityExtended: how a settled or user-stopped run is
 * recognized, and the predecessor filter the agent framework and the run resolver both use to
 * find "the run the user stopped". Pinned here so a change to the vocabulary is one change.
 */
import { describe, it, expect } from 'vitest';
import { MJAIAgentRunEntityExtended } from '../MJAIAgentRunEntityExtended';

describe('MJAIAgentRunEntityExtended.IsUserStopped', () => {
    it('is true only for Cancelled with a User Request reason', () => {
        expect(MJAIAgentRunEntityExtended.IsUserStopped('Cancelled', 'User Request')).toBe(true);
        expect(MJAIAgentRunEntityExtended.IsUserStopped('Cancelled', 'Timeout')).toBe(false);
        expect(MJAIAgentRunEntityExtended.IsUserStopped('Cancelled', null)).toBe(false);
        expect(MJAIAgentRunEntityExtended.IsUserStopped('AwaitingFeedback', 'User Request')).toBe(false);
        expect(MJAIAgentRunEntityExtended.IsUserStopped(undefined, undefined)).toBe(false);
    });

    it('WasStoppedByUser is the instance form over the run\'s own fields', () => {
        const run = Object.create(MJAIAgentRunEntityExtended.prototype) as MJAIAgentRunEntityExtended;
        Object.defineProperty(run, 'Status', { value: 'Cancelled', configurable: true });
        Object.defineProperty(run, 'CancellationReason', { value: 'User Request', configurable: true });
        expect(run.WasStoppedByUser).toBe(true);
        Object.defineProperty(run, 'CancellationReason', { value: 'System', configurable: true });
        expect(run.WasStoppedByUser).toBe(false);
    });
});

describe('MJAIAgentRunEntityExtended.BuildStoppedPredecessorFilter', () => {
    it('selects root runs of one agent in one conversation that settled or were stopped by the user', () => {
        const filter = MJAIAgentRunEntityExtended.BuildStoppedPredecessorFilter('conv-1', 'agent-1');
        expect(filter).toContain("ConversationID='conv-1'");
        expect(filter).toContain('ParentRunID IS NULL');
        expect(filter).toContain("AgentID='agent-1'");
        for (const status of MJAIAgentRunEntityExtended.SettledStatuses) {
            expect(filter).toContain(`'${status}'`);
        }
        expect(filter).toContain("Status='Cancelled' AND CancellationReason='User Request'");
    });
});
