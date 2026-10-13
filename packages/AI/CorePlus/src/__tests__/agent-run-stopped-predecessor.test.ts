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
        const filter = MJAIAgentRunEntityExtended.BuildStoppedPredecessorFilter('conv-1', 'agent-1', null, []);
        expect(filter).toContain("ConversationID='conv-1'");
        expect(filter).toContain('ParentRunID IS NULL');
        expect(filter).toContain("AgentID='agent-1'");
        for (const status of MJAIAgentRunEntityExtended.SettledStatuses) {
            expect(filter).toContain(`'${status}'`);
        }
        expect(filter).toContain("Status='Cancelled' AND CancellationReason='User Request'");
    });

    it('on the trunk, the run must have replied on a live trunk row', () => {
        const filter = MJAIAgentRunEntityExtended.BuildStoppedPredecessorFilter('conv-1', 'agent-1', null, []);
        expect(filter).toContain(
            `AND ConversationDetailID IN (SELECT ID FROM [__mj].[vwConversationDetails] WHERE [ConversationID]='conv-1' AND [BranchID] IS NULL AND [ReplacedAt] IS NULL)`
        );
    });

    it('on a branch, the run must have replied on that branch\'s path, so a sibling branch\'s stopped run is never resumed', () => {
        const branches = [{ ID: 'B', ConversationID: 'conv-1', ParentBranchID: null, ForkFromSequence: 2 }];
        const filter = MJAIAgentRunEntityExtended.BuildStoppedPredecessorFilter('conv-1', 'agent-1', 'B', branches);
        expect(filter).toContain(
            `WHERE [ConversationID]='conv-1' AND ([BranchID]='B' OR ([BranchID] IS NULL AND [Sequence] <= 2)) AND [ReplacedAt] IS NULL)`
        );
    });

    it('BuildReplyOnBranchPathFilter is the shared predicate the carry-forward and the resume both apply', () => {
        expect(MJAIAgentRunEntityExtended.BuildReplyOnBranchPathFilter('conv-1', null, [])).toBe(
            `ConversationDetailID IN (SELECT ID FROM [__mj].[vwConversationDetails] WHERE [ConversationID]='conv-1' AND [BranchID] IS NULL AND [ReplacedAt] IS NULL)`
        );
    });
});
