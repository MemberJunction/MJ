/**
 * Conversation details left behind by a finished run must be closed (MJ #4222).
 *
 * `AgentRunner` closes the detail as the last step of a run, so a process that dies mid-run never
 * gets there. The agent-run watchdog repairs the RUN but nothing repaired the detail — and the
 * detail is the row the chat renders from. Observed directly: run B3E67FE3 force-failed by the
 * watchdog while its detail stayed `In-Progress`, spinning for anyone who opened it.
 *
 * The properties that keep this safe to run unattended are pinned here: it never closes a message
 * whose work is still going, and it never races the normal completion path.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunViewParams, UserInfo } from '@memberjunction/core';

const { mockRunView } = vi.hoisted(() => ({ mockRunView: vi.fn() }));

const { mockGetEntityObject, writableStore } = vi.hoisted(() => ({
    mockGetEntityObject: vi.fn(),
    writableStore: { last: null as Record<string, unknown> | null },
}));

vi.mock('@memberjunction/global', () => ({
    UUIDsEqual: (a: string, b: string) => String(a).toLowerCase() === String(b).toLowerCase(),
}));

vi.mock('@memberjunction/sqlserver-dataprovider', () => ({
    UserCache: { Instance: { Users: [{ ID: 'OWNER-1', Email: 'owner@example.com' }] } },
}));

vi.mock('@memberjunction/core', () => {
    class MockRunView {
        public static FromMetadataProvider(): MockRunView {
            return new MockRunView();
        }
        public async RunView(...args: unknown[]): Promise<unknown> {
            return mockRunView(...args);
        }
    }
    return { LogError: vi.fn(), LogStatus: vi.fn(), RunView: MockRunView };
});

import { ReconcileOrphanedConversationDetails, ORPHAN_DETAIL_GRACE_MS } from '../generic/OrphanedConversationDetailReconciler.js';

const USER = { ID: 'U1' } as unknown as UserInfo;
const CONVERSATION_ID = 'C1';

/** Provider stub: hands back the entity the reconciler actually writes through. */
const PROVIDER = { GetEntityObject: mockGetEntityObject } as never;
const DETAIL_ID = 'D1';

function detail(over: Record<string, unknown> = {}) {
    return { ID: DETAIL_ID, ConversationID: CONVERSATION_ID, Status: 'In-Progress', Message: '', ...over };
}

/**
 * The record the reconciler loads and saves. Separate from the RunView projection on purpose: the
 * reconciler deliberately does NOT write the entity RunView returned, because that one carries the
 * system user and the conversation-detail permission gate refuses a non-owner.
 */
function writable(saveResult = true) {
    const w = {
        ID: DETAIL_ID,
        Status: 'In-Progress',
        Message: '',
        Load: vi.fn(async () => true),
        Save: vi.fn(async () => saveResult),
        LatestResult: { CompleteMessage: 'denied' },
    };
    writableStore.last = w;
    return w;
}

function script(details: unknown[], runs: unknown[], ownerId: string | null = 'OWNER-1') {
    mockRunView.mockImplementation(async (...args: unknown[]) => {
        const params = args[0] as RunViewParams | undefined;
        if (!params) throw new Error('RunView called with no params');
        if (params.EntityName === 'MJ: Conversation Details') return { Success: true, Results: details };
        if (params.EntityName === 'MJ: AI Agent Runs') return { Success: true, Results: runs };
        if (params.EntityName === 'MJ: Conversations') {
            return { Success: true, Results: ownerId ? [{ ID: CONVERSATION_ID, UserID: ownerId }] : [] };
        }
        throw new Error(`unexpected entity ${params.EntityName}`);
    });
    mockGetEntityObject.mockImplementation(async () => writable());
}

const longAgo = () => new Date(Date.now() - ORPHAN_DETAIL_GRACE_MS - 60_000).toISOString();
const justNow = () => new Date().toISOString();

describe('ReconcileOrphanedConversationDetails', () => {
    // Block body, NOT a concise arrow: `mockReset()` returns the mock, which is callable, and
    // vitest treats a function returned from beforeEach as a teardown hook — so a concise arrow
    // hands vitest the mock itself to invoke with no arguments after every test.
    beforeEach(() => {
        mockRunView.mockReset();
        mockGetEntityObject.mockReset();
        writableStore.last = null;
    });

    it('closes a detail whose run failed long ago', async () => {
        const d = detail();
        script([d], [{ ConversationDetailID: DETAIL_ID, Status: 'Failed', CompletedAt: longAgo(), ErrorMessage: 'watchdog force-fail' }]);

        const closed = await ReconcileOrphanedConversationDetails(PROVIDER, USER);

        expect(closed).toBe(1);
        expect(writableStore.last?.Status).toBe('Error');
        expect(writableStore.last?.Message).toBe('watchdog force-fail');
    });

    it('falls back to a failure marker only when the failed run carries no error text', async () => {
        script([detail()], [{ ConversationDetailID: DETAIL_ID, Status: 'Failed', CompletedAt: longAgo() }]);

        await ReconcileOrphanedConversationDetails(PROVIDER, USER);

        expect(writableStore.last?.Status).toBe('Error');
        expect(writableStore.last?.Message).toBe('❌ Failed');
    });

    it('marks a completed run as Complete, not Error', async () => {
        const d = detail();
        script([d], [{ ConversationDetailID: DETAIL_ID, Status: 'Completed', CompletedAt: longAgo() }]);

        await ReconcileOrphanedConversationDetails(PROVIDER, USER);

        expect(writableStore.last?.Status).toBe('Complete');
        // A successful run has no error to report, so an empty message stays empty rather than
        // carrying a failure marker that contradicts the status beside it.
        expect(writableStore.last?.Message).toBe('');
    });

    it('leaves a message alone while its run is still executing', async () => {
        const d = detail();
        script([d], [{ ConversationDetailID: DETAIL_ID, Status: 'Running', CompletedAt: null }]);

        expect(await ReconcileOrphanedConversationDetails(PROVIDER, USER)).toBe(0);
        expect(mockGetEntityObject).not.toHaveBeenCalled();
    });

    it('does not race the normal completion path inside the grace window', async () => {
        const d = detail();
        script([d], [{ ConversationDetailID: DETAIL_ID, Status: 'Completed', CompletedAt: justNow() }]);

        expect(await ReconcileOrphanedConversationDetails(PROVIDER, USER)).toBe(0);
        expect(mockGetEntityObject).not.toHaveBeenCalled();
    });

    it('leaves a message alone when no run exists yet', async () => {
        const d = detail();
        script([d], []);

        expect(await ReconcileOrphanedConversationDetails(PROVIDER, USER)).toBe(0);
        expect(mockGetEntityObject).not.toHaveBeenCalled();
    });

    it('judges a retried message on its newest attempt, not an older finished one', async () => {
        const d = detail();
        // DESC order: newest first. The newest attempt is still running.
        script([d], [
            { ConversationDetailID: DETAIL_ID, Status: 'Running', CompletedAt: null },
            { ConversationDetailID: DETAIL_ID, Status: 'Failed', CompletedAt: longAgo() },
        ]);

        expect(await ReconcileOrphanedConversationDetails(PROVIDER, USER)).toBe(0);
    });

    it('preserves an existing message rather than overwriting the answer', async () => {
        script([detail()], [{ ConversationDetailID: DETAIL_ID, Status: 'Completed', CompletedAt: longAgo() }]);
        mockGetEntityObject.mockImplementation(async () => {
            const w = writable();
            w.Message = 'the real answer';
            return w;
        });

        await ReconcileOrphanedConversationDetails(PROVIDER, USER);

        // The loaded record already carries the answer; only the status should change.
        expect(writableStore.last?.Message).toBe('the real answer');
        expect(writableStore.last?.Status).toBe('Complete');
    });

    it('reports a refused save without throwing', async () => {
        script([detail()], [{ ConversationDetailID: DETAIL_ID, Status: 'Failed', CompletedAt: longAgo() }]);
        mockGetEntityObject.mockImplementation(async () => writable(false));

        expect(await ReconcileOrphanedConversationDetails(PROVIDER, USER)).toBe(0);
    });

    it('writes as the conversation OWNER, never as the calling system user', async () => {
        // REGRESSION, found only by running it against real data. The permission gate on
        // MJ: Conversation Details refuses a non-owner and returns false with NO LatestResult, so
        // every save was silently rejected while the reconciler reported success-shaped logs. The
        // system user this pass runs as owns nothing, which is exactly who that gate stops.
        script([detail()], [{ ConversationDetailID: DETAIL_ID, Status: 'Failed', CompletedAt: longAgo() }]);

        await ReconcileOrphanedConversationDetails(PROVIDER, USER);

        expect(mockGetEntityObject).toHaveBeenCalledWith(
            'MJ: Conversation Details',
            expect.objectContaining({ ID: 'OWNER-1' })
        );
    });

    it('leaves the detail alone when no owner can be resolved', async () => {
        script([detail()], [{ ConversationDetailID: DETAIL_ID, Status: 'Failed', CompletedAt: longAgo() }], null);

        expect(await ReconcileOrphanedConversationDetails(PROVIDER, USER)).toBe(0);
        expect(mockGetEntityObject).not.toHaveBeenCalled();
    });

    it('never throws out of a maintenance pass', async () => {
        mockRunView.mockImplementation(async () => { throw new Error('db down'); });

        await expect(ReconcileOrphanedConversationDetails(PROVIDER, USER)).resolves.toBe(0);
    });

    it('does nothing when no message is in progress', async () => {
        script([], []);
        expect(await ReconcileOrphanedConversationDetails(PROVIDER, USER)).toBe(0);
    });
});
