import '@angular/compiler'; // JIT support — the service module evaluates Angular decorators in vitest's node env
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView, type RunViewParams, type RunViewResult, type UserInfo } from '@memberjunction/core';
import { ConversationEngine, type ConversationBranchRow, type ConversationScope } from '@memberjunction/core-entities';
import { AgentStateService } from '../lib/services/agent-state.service';

/**
 * The poll for running and paused `MJ: AI Agent Runs` resolves in-scope `MJ: Conversation Details`
 * IDs first (using `ConversationEngine.ScopeFilter`) and then queries `MJ: AI Agent Runs` with a
 * scalar `[ConversationDetailID] IN (...)` predicate plus the conversation's detail-less runs —
 * never emitting a `vwConversationDetails` subquery in client `ExtraFilter`.
 */

const USER = { ID: 'USER-1' } as UserInfo;
const B: ConversationBranchRow = { ID: 'BRANCH-B', ConversationID: 'CONV-1', ParentBranchID: null, ForkFromSequence: 2, Name: null };
const BRANCH_SCOPE: ConversationScope = { ConversationID: 'CONV-1', BranchID: 'BRANCH-B', Branches: [B] };
/** `ConversationID=` outside brackets: a filter on the run's own conversation column. */
const BARE_CONVERSATION_FILTER = /(^|[^[])ConversationID\s*=/;

/**
 * The statuses the poll treats as live. AwaitingFeedback is not one: it is how a chat turn
 * normally ends, with CompletedAt stamped. A reply that resumes the run sets it back to Running.
 */
const LIVE_STATUSES = `Status IN ('Running', 'Paused')`;

async function flushMicrotasks(): Promise<void> {
    for (let i = 0; i < 8; i++) {
        await Promise.resolve();
    }
}

/** Expected RLS-safe poll filter for a conversation when `detailIds` are in scope. */
function expectedRunFilter(conversationId: string, detailIds: readonly string[]): string {
    const nullDetailClause = `([ConversationID]='${conversationId.replace(/'/g, "''")}' AND [ConversationDetailID] IS NULL)`;
    if (detailIds.length === 0) {
        return `${LIVE_STATUSES} AND ${nullDetailClause}`;
    }
    const inList = detailIds.map(id => `'${id}'`).join(',');
    return `${LIVE_STATUSES} AND ([ConversationDetailID] IN (${inList}) OR ${nullDetailClause})`;
}

describe('AgentStateService poll filter', () => {
    let runView: ReturnType<typeof vi.fn>;
    let service: AgentStateService;
    let inScopeDetails: Array<{ ID: string }>;
    let detailsResultSuccess: boolean;

    function runQueries(): RunViewParams[] {
        return runView.mock.calls.map(c => c[0] as RunViewParams).filter(p => p.EntityName === 'MJ: AI Agent Runs');
    }

    function detailQueries(): RunViewParams[] {
        return runView.mock.calls.map(c => c[0] as RunViewParams).filter(p => p.EntityName === 'MJ: Conversation Details');
    }

    function lastRunFilter(): string {
        const queries = runQueries();
        expect(queries.length).toBeGreaterThan(0);
        return String(queries[queries.length - 1].ExtraFilter ?? '');
    }

    function lastDetailQuery(): RunViewParams {
        const queries = detailQueries();
        expect(queries.length).toBeGreaterThan(0);
        return queries[queries.length - 1];
    }

    beforeEach(() => {
        inScopeDetails = [{ ID: 'DETAIL-1' }, { ID: 'DETAIL-2' }];
        detailsResultSuccess = true;
        runView = vi.fn(async (params: RunViewParams): Promise<RunViewResult> => {
            if (params.EntityName === 'MJ: Conversation Details') {
                return {
                    Success: detailsResultSuccess,
                    Results: detailsResultSuccess ? inScopeDetails : [],
                    RowCount: detailsResultSuccess ? inScopeDetails.length : 0,
                    TotalRowCount: detailsResultSuccess ? inScopeDetails.length : 0,
                    ExecutionTime: 1,
                    ErrorMessage: detailsResultSuccess ? '' : 'Simulated RLS detail read failure',
                    UserViewRunID: ''
                };
            }
            return {
                Success: true,
                Results: [],
                RowCount: 0,
                TotalRowCount: 0,
                ExecutionTime: 1,
                ErrorMessage: '',
                UserViewRunID: ''
            };
        });
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runView } as unknown as RunView);
        service = new AgentStateService();
    });

    afterEach(() => {
        service.StopPolling();
        vi.restoreAllMocks();
    });

    it('reads in-scope detail IDs first and queries runs with a scalar IN filter and zero vwConversationDetails subqueries', async () => {
        service.StartPolling(USER, 'CONV-1', BRANCH_SCOPE);
        await flushMicrotasks();

        const detailQ = lastDetailQuery();
        expect(detailQ.ExtraFilter).toBe(ConversationEngine.ScopeFilter(BRANCH_SCOPE));
        expect(detailQ.Fields).toEqual(['ID']);
        expect(detailQ.IgnoreMaxRows).toBe(true);
        expect(detailQ.ResultType).toBe('simple');

        const filter = lastRunFilter();
        expect(filter).toBe(expectedRunFilter('CONV-1', ['DETAIL-1', 'DETAIL-2']));
        expect(filter).not.toMatch(/\bSELECT\b|vwConversationDetails/i);
        expect(filter).not.toMatch(BARE_CONVERSATION_FILTER);
    });

    it('also includes the conversation runs that have no detail inside one parenthesised clause', async () => {
        service.StartPolling(USER, 'CONV-1', BRANCH_SCOPE);
        await flushMicrotasks();

        const filter = lastRunFilter();
        const clause = filter.slice(`${LIVE_STATUSES} AND `.length);
        expect(filter.startsWith(`${LIVE_STATUSES} AND (`)).toBe(true);
        expect(clause.startsWith('(')).toBe(true);
        expect(clause.endsWith(')')).toBe(true);
        expect(clause).toContain(`[ConversationDetailID] IN ('DETAIL-1','DETAIL-2')`);
        expect(clause).toContain(`OR ([ConversationID]='CONV-1' AND [ConversationDetailID] IS NULL)`);
    });

    it('escapes the conversation id in the clause for runs with no detail', async () => {
        service.StartPolling(USER, "CONV'1");
        await flushMicrotasks();

        expect(lastRunFilter()).toContain(`[ConversationID]='CONV''1' AND [ConversationDetailID] IS NULL`);
    });

    it('reads the trunk scope when only a conversation id is given', async () => {
        service.StartPolling(USER, 'CONV-1');
        await flushMicrotasks();

        expect(lastDetailQuery().ExtraFilter).toBe(ConversationEngine.ScopeFilter(ConversationEngine.TrunkScope('CONV-1')));
        const filter = lastRunFilter();
        expect(filter).toBe(expectedRunFilter('CONV-1', ['DETAIL-1', 'DETAIL-2']));
        expect(filter).not.toMatch(BARE_CONVERSATION_FILTER);
    });

    it('falls back to detail-less conversation runs without leaking other branches when a conversation has no details yet', async () => {
        inScopeDetails = [];
        service.StartPolling(USER, 'CONV-1', BRANCH_SCOPE);
        await flushMicrotasks();

        const filter = lastRunFilter();
        expect(filter).toBe(`${LIVE_STATUSES} AND ([ConversationID]='CONV-1' AND [ConversationDetailID] IS NULL)`);
        expect(filter).not.toMatch(/\bSELECT\b|vwConversationDetails/i);
        expect(filter).not.toMatch(BARE_CONVERSATION_FILTER);
    });

    it('falls back to detail-less conversation runs without throwing when loading detail IDs fails', async () => {
        detailsResultSuccess = false;
        service.StartPolling(USER, 'CONV-1', BRANCH_SCOPE);
        await flushMicrotasks();

        expect(lastRunFilter()).toBe(`${LIVE_STATUSES} AND ([ConversationID]='CONV-1' AND [ConversationDetailID] IS NULL)`);
    });

    it('adds no conversation filter when no conversation id is given', async () => {
        service.StartPolling(USER);
        await flushMicrotasks();

        expect(detailQueries()).toHaveLength(0);
        expect(lastRunFilter()).toBe(LIVE_STATUSES);
    });

    it('passes the scope through the deprecated startPolling', async () => {
        service.startPolling(USER, 'CONV-1', BRANCH_SCOPE);
        await flushMicrotasks();

        expect(lastDetailQuery().ExtraFilter).toBe(ConversationEngine.ScopeFilter(BRANCH_SCOPE));
        expect(lastRunFilter()).toBe(expectedRunFilter('CONV-1', ['DETAIL-1', 'DETAIL-2']));
    });

    it('uses the scope on a manual refresh', async () => {
        service.StartPolling(USER, 'CONV-1');
        await flushMicrotasks();
        service.StopPolling();

        await service.Refresh('CONV-1', BRANCH_SCOPE);

        expect(lastDetailQuery().ExtraFilter).toBe(ConversationEngine.ScopeFilter(BRANCH_SCOPE));
        expect(lastRunFilter()).toBe(expectedRunFilter('CONV-1', ['DETAIL-1', 'DETAIL-2']));
    });

    it('keeps the scope on every poll cycle', async () => {
        vi.useFakeTimers();
        try {
            service.SetPollInterval(1000);
            service.StartPolling(USER, 'CONV-1', BRANCH_SCOPE);
            await flushMicrotasks();
            await vi.advanceTimersByTimeAsync(1000);
            await flushMicrotasks();

            expect(runQueries()).toHaveLength(2);
            expect(lastDetailQuery().ExtraFilter).toBe(ConversationEngine.ScopeFilter(BRANCH_SCOPE));
            expect(lastRunFilter()).toBe(expectedRunFilter('CONV-1', ['DETAIL-1', 'DETAIL-2']));
        } finally {
            vi.useRealTimers();
        }
    });

    it('keeps the conversation and scope when the interval changes while polling', async () => {
        vi.useFakeTimers();
        try {
            service.StartPolling(USER, 'CONV-1', BRANCH_SCOPE);
            await flushMicrotasks();
            // A change while polling restarts the poll; it must restart on the same conversation and fork.
            service.SetPollInterval(1000);
            await vi.advanceTimersByTimeAsync(1000);
            await flushMicrotasks();

            expect(lastRunFilter()).toBe(expectedRunFilter('CONV-1', ['DETAIL-1', 'DETAIL-2']));
        } finally {
            vi.useRealTimers();
        }
    });

    it('escapes conversationDetailId in CancelAgentForDetail', async () => {
        await service.CancelAgentForDetail("detail'1");

        expect(lastRunFilter()).toBe("ConversationDetailID='detail''1' AND Status IN ('Running', 'Paused')");
    });
});
