import { describe, it, expect, beforeEach } from 'vitest';
import { BaseAgent } from '../base-agent';
import { PriorTurnToolResultCache } from '../prior-turn-tool-result-cache';

const branches = [{ ID: 'B', ConversationID: 'conv-1', ParentBranchID: null, ForkFromSequence: 2 }];
const STATUSES = `'Completed', 'AwaitingFeedback'`;

describe('BaseAgent.BuildPriorTurnRunFilter', () => {
    it('scopes the previous run to a reply row on the branch path', () => {
        expect(BaseAgent.BuildPriorTurnRunFilter('conv-1', 'agent-1', 'B', branches, STATUSES)).toBe(
            `ConversationID='conv-1' AND Status IN ('Completed', 'AwaitingFeedback') AND ParentRunID IS NULL AND AgentID='agent-1'` +
            ` AND ConversationDetailID IN (SELECT ID FROM [__mj].[vwConversationDetails] WHERE [ConversationID]='conv-1' AND ([BranchID]='B' OR ([BranchID] IS NULL AND [Sequence] <= 2)))`
        );
    });
    it('scopes the trunk to rows with no branch (control)', () => {
        expect(BaseAgent.BuildPriorTurnRunFilter('conv-1', 'agent-1', null, [], STATUSES)).toContain(
            `WHERE [ConversationID]='conv-1' AND [BranchID] IS NULL)`
        );
    });
});

describe('PriorTurnToolResultCache — branch in the key', () => {
    beforeEach(() => PriorTurnToolResultCache.Instance.Clear());
    it('keeps trunk and branch results apart', () => {
        PriorTurnToolResultCache.Instance.Set('conv-1', 'agent-1', null, [{ OutputData: 'trunk' }]);
        PriorTurnToolResultCache.Instance.Set('conv-1', 'agent-1', 'B', [{ OutputData: 'branch' }]);
        expect(PriorTurnToolResultCache.Instance.Get('conv-1', 'agent-1', null)).toEqual([{ OutputData: 'trunk' }]);
        expect(PriorTurnToolResultCache.Instance.Get('conv-1', 'agent-1', 'B')).toEqual([{ OutputData: 'branch' }]);
        expect(PriorTurnToolResultCache.Instance.Get('conv-1', 'agent-1', 'C')).toBeUndefined();
    });
});
