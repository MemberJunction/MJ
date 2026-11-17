import '@angular/compiler'; // JIT support — the service module evaluates Angular decorators in vitest's node env
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { RunView, type RunViewParams, type UserInfo } from '@memberjunction/core';
import { ConversationEngine, type ConversationBranchRow, type ConversationScope } from '@memberjunction/core-entities';
import { AgentStateService } from '../lib/services/agent-state.service';

/**
 * The poll for running and paused `MJ: AI Agent Runs` filters by `[ConversationID]='...'` (never
 * a `[__mj].[vwConversationDetails]` subquery rejected by `ClientClauseScreen`), then when active
 * runs carry a `ConversationDetailID`, resolves visible detail IDs via a first-class
 * `MJ: Conversation Details` RunView and drops runs from sibling branches.
 */

const USER = { ID: 'USER-1' } as UserInfo;
const B: ConversationBranchRow = { ID: 'BRANCH-B', ConversationID: 'CONV-1', ParentBranchID: null, ForkFromSequence: 2, Name: null };
const BRANCH_SCOPE: ConversationScope = { ConversationID: 'CONV-1', BranchID: 'BRANCH-B', Branches: [B] };

/**
 * The statuses the poll treats as live. AwaitingFeedback is not one: it is how a chat turn
 * normally ends, with CompletedAt stamped. A reply that resumes the run sets it back to Running.
 */
const LIVE_STATUSES = `Status IN ('Running', 'Paused')`;

function conversationFilter(conversationId: string): string {
    return `${LIVE_STATUSES} AND [ConversationID]='${conversationId}'`;
}

describe('AgentStateService poll filter', () => {
    let runView: ReturnType<typeof vi.fn>;
    let service: AgentStateService;

    function runViewCalls(): Array<Pick<RunViewParams, 'EntityName' | 'ExtraFilter'>> {
        return runView.mock.calls.map((c) => c[0] as Pick<RunViewParams, 'EntityName' | 'ExtraFilter'>);
    }

    function lastRunsFilter(): string {
        const calls = runViewCalls().filter((c) => c.EntityName === 'MJ: AI Agent Runs');
        expect(calls.length).toBeGreaterThan(0);
        const filter = calls[calls.length - 1].ExtraFilter;
        return typeof filter === 'string' ? filter : '';
    }

    beforeEach(() => {
        runView = vi.fn(async () => ({ Success: true, Results: [] }));
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runView } as unknown as RunView);
        service = new AgentStateService();
    });

    afterEach(() => {
        service.StopPolling();
        vi.restoreAllMocks();
    });

    it('queries MJ: AI Agent Runs with [ConversationID] and never emits a vwConversationDetails subquery', () => {
        service.StartPolling(USER, 'CONV-1', BRANCH_SCOPE);

        const filter = lastRunsFilter();
        expect(filter).toBe(conversationFilter('CONV-1'));
        expect(filter).not.toMatch(/vwConversationDetails/i);
    });

    it('escapes the conversation id in the poll filter', () => {
        service.StartPolling(USER, "CONV'1");

        expect(lastRunsFilter()).toBe(conversationFilter("CONV''1"));
    });

    it('adds no conversation filter when no conversation id is given', () => {
        service.StartPolling(USER);

        expect(lastRunsFilter()).toBe(LIVE_STATUSES);
    });

    it('filters active runs with ConversationDetailID against scoped MJ: Conversation Details via RunView', async () => {
        service.StartPolling(USER, 'CONV-1');
        service.StopPolling();
        runView.mockClear();

        runView.mockImplementation(async (params: RunViewParams) => {
            if (params.EntityName === 'MJ: AI Agent Runs') {
                return {
                    Success: true,
                    Results: [
                        { ID: 'run-on-branch', ConversationID: 'CONV-1', ConversationDetailID: 'detail-in-scope', Status: 'Running' },
                        { ID: 'run-off-branch', ConversationID: 'CONV-1', ConversationDetailID: 'detail-other', Status: 'Running' },
                        { ID: 'run-no-detail', ConversationID: 'CONV-1', ConversationDetailID: null, Status: 'Paused' },
                    ],
                };
            }
            if (params.EntityName === 'MJ: Conversation Details') {
                expect(params.ExtraFilter).toContain(ConversationEngine.ScopeFilter(BRANCH_SCOPE));
                expect(params.ExtraFilter).toContain(`'detail-in-scope'`);
                expect(params.ExtraFilter).toContain(`'detail-other'`);
                return { Success: true, Results: [{ ID: 'detail-in-scope' }] };
            }
            return { Success: true, Results: [] };
        });

        await service.Refresh('CONV-1', BRANCH_SCOPE);

        const active = (await firstValueFrom(service.ActiveAgents$)).map((a) => a.run.ID);
        expect(active).toEqual(['run-on-branch', 'run-no-detail']);
    });

    it('fails closed on detail-linked active runs when MJ: Conversation Details RunView fails', async () => {
        service.StartPolling(USER, 'CONV-1');
        service.StopPolling();
        runView.mockClear();

        runView.mockImplementation(async (params: RunViewParams) => {
            if (params.EntityName === 'MJ: AI Agent Runs') {
                return {
                    Success: true,
                    Results: [
                        { ID: 'run-with-detail', ConversationID: 'CONV-1', ConversationDetailID: 'detail-1', Status: 'Running' },
                        { ID: 'run-no-detail', ConversationID: 'CONV-1', ConversationDetailID: null, Status: 'Paused' },
                    ],
                };
            }
            return { Success: false, Results: [], ErrorMessage: 'denied' };
        });

        await service.Refresh('CONV-1', BRANCH_SCOPE);

        expect((await firstValueFrom(service.ActiveAgents$)).map((a) => a.run.ID)).toEqual(['run-no-detail']);
    });

    it('passes the conversation filter through the deprecated startPolling', () => {
        service.startPolling(USER, 'CONV-1', BRANCH_SCOPE);

        expect(lastRunsFilter()).toBe(conversationFilter('CONV-1'));
    });

    it('keeps polling without vwConversationDetails subqueries on every cycle and interval change', async () => {
        vi.useFakeTimers();
        try {
            service.SetPollInterval(1000);
            service.StartPolling(USER, 'CONV-1', BRANCH_SCOPE);
            await vi.advanceTimersByTimeAsync(1000);
            expect(runViewCalls().filter((c) => c.EntityName === 'MJ: AI Agent Runs')).toHaveLength(2);
            expect(lastRunsFilter()).toBe(conversationFilter('CONV-1'));

            service.SetPollInterval(2000);
            await vi.advanceTimersByTimeAsync(2000);
            expect(lastRunsFilter()).toBe(conversationFilter('CONV-1'));
        } finally {
            vi.useRealTimers();
        }
    });
});
