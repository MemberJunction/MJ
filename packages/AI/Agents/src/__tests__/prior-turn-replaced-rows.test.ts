/**
 * A replaced answer (its conversation detail's ReplacedAt set by an in-place rerun of its turn) is
 * never sent to an agent: the prior-turn carry-forward neither reads the run of a replaced reply row
 * from the database nor serves it from PriorTurnToolResultCache.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseEntity, RunView } from '@memberjunction/core';
import { MJConversationDetailEntity } from '@memberjunction/core-entities';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import { BaseAgent } from '../base-agent';
import { PriorTurnToolResultCache } from '../prior-turn-tool-result-cache';
import type { CarryForwardStepRecord } from '../tool-result-format';

const CONV_ID = 'conv-1';
const AGENT_ID = 'agent-1';
const STATUSES = `'Completed', 'AwaitingFeedback'`;

/** A conversation detail as a save event carries it. */
function detail(id: string, replacedAt: Date | null): MJConversationDetailEntity {
    const row = Object.create(MJConversationDetailEntity.prototype) as MJConversationDetailEntity;
    Object.defineProperty(row, 'ID', { value: id });
    Object.defineProperty(row, 'ReplacedAt', { value: replacedAt });
    return row;
}

/** Raises the global event a BaseEntity raises after a save on this server. */
function raiseSave(row: MJConversationDetailEntity): void {
    MJGlobal.Instance.RaiseEvent({
        component: row,
        event: MJEventType.ComponentEvent,
        eventCode: BaseEntity.BaseEventCode,
        args: { type: 'save', saveSubType: 'update', baseEntity: row, payload: null },
    });
}

function internals(agent: BaseAgent) {
    return agent as unknown as {
        loadPriorTurnToolResultSteps(params: Record<string, unknown>): Promise<CarryForwardStepRecord[]>;
        cachePriorTurnToolResults(): void;
        _executeParams: Record<string, unknown> | undefined;
        _depth: number;
        _agentRun: Record<string, unknown> | undefined;
    };
}

describe('BaseAgent.BuildPriorTurnRunFilter — replaced rows', () => {
    it('reads only runs whose reply row is live', () => {
        expect(BaseAgent.BuildPriorTurnRunFilter(CONV_ID, AGENT_ID, null, [], STATUSES)).toBe(
            `ConversationID='conv-1' AND Status IN ('Completed', 'AwaitingFeedback') AND ParentRunID IS NULL AND AgentID='agent-1'` +
            ` AND ConversationDetailID IN (SELECT ID FROM [__mj].[vwConversationDetails] WHERE [ConversationID]='conv-1' AND [BranchID] IS NULL AND [ReplacedAt] IS NULL)`
        );
    });
});

describe('PriorTurnToolResultCache — replaced reply rows', () => {
    beforeEach(() => PriorTurnToolResultCache.Instance.Clear());
    afterEach(() => vi.restoreAllMocks());

    it("does not serve the entry of a run whose reply row was replaced, ids compared without case; other entries stay", () => {
        const cache = PriorTurnToolResultCache.Instance;
        cache.Set(CONV_ID, AGENT_ID, null, [{ OutputData: 'replaced' }], 'DETAIL-A2');
        cache.Set(CONV_ID, AGENT_ID, 'B', [{ OutputData: 'fork' }], 'DETAIL-B1');
        cache.Set(CONV_ID, 'agent-2', null, [{ OutputData: 'unknown reply row' }]);

        cache.MarkDetailReplaced('detail-a2');

        expect(cache.Get(CONV_ID, AGENT_ID, null)).toBeUndefined();
        expect(cache.Get(CONV_ID, AGENT_ID, 'B')).toEqual([{ OutputData: 'fork' }]);
        expect(cache.Get(CONV_ID, 'agent-2', null)).toEqual([{ OutputData: 'unknown reply row' }]);
    });

    it('does not serve an entry stored after its reply row was replaced', () => {
        const cache = PriorTurnToolResultCache.Instance;
        cache.MarkDetailReplaced('DETAIL-A2');
        cache.Set(CONV_ID, AGENT_ID, null, [{ OutputData: 'late' }], 'DETAIL-A2');
        expect(cache.Get(CONV_ID, AGENT_ID, null)).toBeUndefined();
    });

    it('learns of a replacement from a save on this server, and ignores a save that replaced nothing', () => {
        const cache = PriorTurnToolResultCache.Instance;
        cache.Set(CONV_ID, AGENT_ID, null, [{ OutputData: 'tool-1' }], 'DETAIL-A2');

        raiseSave(detail('DETAIL-A2', null));
        expect(cache.Get(CONV_ID, AGENT_ID, null)).toEqual([{ OutputData: 'tool-1' }]);

        raiseSave(detail('DETAIL-A2', new Date()));
        expect(cache.Get(CONV_ID, AGENT_ID, null)).toBeUndefined();
    });

    it("stores the run's reply row with the entry it publishes", () => {
        const agent = internals(new BaseAgent());
        agent._executeParams = { conversationId: CONV_ID };
        agent._depth = 0;
        agent._agentRun = {
            Status: 'Completed', AgentID: AGENT_ID, ConversationDetailID: 'DETAIL-A2',
            Steps: [{ StepType: 'Tool', Status: 'Completed', OutputData: 'tool-1' }],
        };
        agent.cachePriorTurnToolResults();
        expect(PriorTurnToolResultCache.Instance.Get(CONV_ID, AGENT_ID, null)).toEqual([{ OutputData: 'tool-1' }]);

        PriorTurnToolResultCache.Instance.MarkDetailReplaced('DETAIL-A2');
        expect(PriorTurnToolResultCache.Instance.Get(CONV_ID, AGENT_ID, null)).toBeUndefined();
    });

    it('reads the database, leaving out replaced rows, instead of a replaced run\'s entry', async () => {
        PriorTurnToolResultCache.Instance.Set(CONV_ID, AGENT_ID, null, [{ OutputData: 'replaced' }], 'DETAIL-A2');
        PriorTurnToolResultCache.Instance.MarkDetailReplaced('DETAIL-A2');
        const runViewFn = vi.fn()
            .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'run-turn-1' }] })
            .mockResolvedValueOnce({ Success: true, Results: [{ OutputData: 'turn-1-result' }] });
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runViewFn } as unknown as RunView);

        const loaded = await internals(new BaseAgent()).loadPriorTurnToolResultSteps({ conversationId: CONV_ID, contextUser: { ID: 'u1' }, agent: { ID: AGENT_ID } });

        expect(loaded).toEqual([{ OutputData: 'turn-1-result' }]);
        expect((runViewFn.mock.calls[0][0] as { ExtraFilter: string }).ExtraFilter).toContain('[ReplacedAt] IS NULL)');
    });
});
