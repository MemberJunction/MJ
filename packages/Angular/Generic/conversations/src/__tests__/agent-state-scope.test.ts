import '@angular/compiler'; // JIT support — the service module evaluates Angular decorators in vitest's node env
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView, type UserInfo } from '@memberjunction/core';
import { ConversationEngine, type ConversationBranchRow, type ConversationScope } from '@memberjunction/core-entities';
import { AgentStateService } from '../lib/services/agent-state.service';

/**
 * The poll for running and paused `MJ: AI Agent Runs` reads the runs whose detail is in the
 * conversation's scope (the given scope, or the trunk when only a conversation id is given), plus
 * the conversation's runs that have no detail, which every path shows.
 */

const USER = { ID: 'USER-1' } as UserInfo;
const B: ConversationBranchRow = { ID: 'BRANCH-B', ConversationID: 'CONV-1', ParentBranchID: null, ForkFromSequence: 2, Name: null };
const BRANCH_SCOPE: ConversationScope = { ConversationID: 'CONV-1', BranchID: 'BRANCH-B', Branches: [B] };
/** `ConversationID=` outside brackets: a filter on the run's own conversation column. */
const BARE_CONVERSATION_FILTER = /(^|[^[])ConversationID\s*=/;

/** The statuses the poll treats as live: Paused and AwaitingFeedback are parked on a human, not finished. */
const LIVE_STATUSES = `Status IN ('Running', 'Paused', 'AwaitingFeedback')`;

/** The poll filter for a conversation: runs in scope, or conversation runs with no detail. */
function conversationFilter(scope: ConversationScope, conversationId: string): string {
    return `${LIVE_STATUSES} AND (${ConversationEngine.ScopeSubquery(scope)} OR ([ConversationID]='${conversationId}' AND [ConversationDetailID] IS NULL))`;
}

describe('AgentStateService poll filter', () => {
    let runView: ReturnType<typeof vi.fn>;
    let service: AgentStateService;

    function lastFilter(): string {
        const params = runView.mock.calls[runView.mock.calls.length - 1][0] as { EntityName: string; ExtraFilter: string };
        expect(params.EntityName).toBe('MJ: AI Agent Runs');
        return params.ExtraFilter;
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

    it('reads the runs of details in the given scope, with no bare ConversationID filter', () => {
        service.StartPolling(USER, 'CONV-1', BRANCH_SCOPE);

        const filter = lastFilter();
        expect(filter).toBe(conversationFilter(BRANCH_SCOPE, 'CONV-1'));
        expect(filter).not.toMatch(BARE_CONVERSATION_FILTER);
    });

    it('also reads the conversation runs that have no detail, inside one parenthesised clause', () => {
        service.StartPolling(USER, 'CONV-1', BRANCH_SCOPE);

        const filter = lastFilter();
        const clause = filter.slice(`${LIVE_STATUSES} AND `.length);
        expect(filter.startsWith(`${LIVE_STATUSES} AND (`)).toBe(true);
        expect(clause.startsWith('(')).toBe(true);
        expect(clause.endsWith(')')).toBe(true);
        expect(clause).toContain(ConversationEngine.ScopeSubquery(BRANCH_SCOPE));
        expect(clause).toContain(`OR ([ConversationID]='CONV-1' AND [ConversationDetailID] IS NULL)`);
    });

    it('escapes the conversation id in the clause for runs with no detail', () => {
        service.StartPolling(USER, "CONV'1");

        expect(lastFilter()).toContain(`[ConversationID]='CONV''1' AND [ConversationDetailID] IS NULL`);
    });

    it('reads the trunk scope when only a conversation id is given', () => {
        service.StartPolling(USER, 'CONV-1');

        const filter = lastFilter();
        expect(filter).toBe(conversationFilter(ConversationEngine.TrunkScope('CONV-1'), 'CONV-1'));
        expect(filter).not.toMatch(BARE_CONVERSATION_FILTER);
    });

    it('adds no conversation filter when no conversation id is given', () => {
        service.StartPolling(USER);

        expect(lastFilter()).toBe(LIVE_STATUSES);
    });

    it('passes the scope through the deprecated startPolling', () => {
        service.startPolling(USER, 'CONV-1', BRANCH_SCOPE);

        expect(lastFilter()).toContain(ConversationEngine.ScopeSubquery(BRANCH_SCOPE));
    });

    it('uses the scope on a manual refresh', async () => {
        service.StartPolling(USER, 'CONV-1');
        service.StopPolling();

        await service.Refresh('CONV-1', BRANCH_SCOPE);

        expect(lastFilter()).toContain(ConversationEngine.ScopeSubquery(BRANCH_SCOPE));
    });

    it('keeps the scope on every poll cycle', async () => {
        vi.useFakeTimers();
        try {
            service.SetPollInterval(1000);
            service.StartPolling(USER, 'CONV-1', BRANCH_SCOPE);
            await vi.advanceTimersByTimeAsync(1000);

            expect(runView).toHaveBeenCalledTimes(2);
            expect(lastFilter()).toContain(ConversationEngine.ScopeSubquery(BRANCH_SCOPE));
        } finally {
            vi.useRealTimers();
        }
    });

    it('keeps the conversation and scope when the interval changes while polling', async () => {
        vi.useFakeTimers();
        try {
            service.StartPolling(USER, 'CONV-1', BRANCH_SCOPE);
            // A change while polling restarts the poll; it must restart on the same conversation and fork.
            service.SetPollInterval(1000);
            await vi.advanceTimersByTimeAsync(1000);

            expect(lastFilter()).toBe(conversationFilter(BRANCH_SCOPE, 'CONV-1'));
        } finally {
            vi.useRealTimers();
        }
    });
});
