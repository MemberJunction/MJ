/**
 * The stop gate on `MJ: AI Agent Runs`: only the user who started a run, or the owner of its
 * conversation, may save it as Cancelled by user request. Drives `Save()` end to end against a
 * mocked base class and asserts on the refusal recorded in the result history, following
 * `MJConversationBranchEntityExtended.test.ts` in core-entities.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    superSave: vi.fn(),
    logError: vi.fn(),
    userOwnsConversation: vi.fn(),
}));
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});
vi.mock('@memberjunction/core', () => {
    class BaseEntityResult {
        Success = false;
        Type: 'create' | 'update' | 'delete' = 'create';
        Message = '';
        StartedAt = new Date();
        EndedAt = new Date();
    }
    return { BaseEntity: class {}, BaseEntityResult, LogError: mocks.logError, LogErrorEx: vi.fn(), CompositeKey: class {} };
});
vi.mock('@memberjunction/core-entities', () => ({
    MJAIAgentRunEntity: class {
        public ID = 'run-1';
        public Status: string = 'Cancelled';
        public CancellationReason: string | null = 'User Request';
        public UserID: string | null = 'starter';
        public ConversationID: string | null = 'conv-1';
        public IsSaved = true;
        public ContextCurrentUser: { ID: string } | null = { ID: 'starter' };
        public ProviderToUse: { ProviderType: string } = { ProviderType: 'Database' };
        public statusDirty = true;
        public history: Array<{ Success: boolean; Message: string; Type: string }> = [];
        GetFieldByName(name: string) {
            return name === 'Status' ? { Dirty: this.statusDirty } : null;
        }
        RegisterResultHistoryEntry(result: { Success: boolean; Message: string; Type: string }) {
            this.history.push(result);
        }
        async Save(options?: unknown) {
            return mocks.superSave(options);
        }
    },
    ConversationEngine: { LiveRowsFilter: () => '', BuildBranchPathFilter: () => '' },
    UserOwnsConversation: mocks.userOwnsConversation,
}));
vi.mock('../MJAIAgentRunStepEntityExtended', () => ({ MJAIAgentRunStepEntityExtended: class {} }));

import { MJAIAgentRunEntityExtended } from '../MJAIAgentRunEntityExtended';

type Run = MJAIAgentRunEntityExtended & {
    ContextCurrentUser: { ID: string } | null;
    ProviderToUse: { ProviderType: string };
    statusDirty: boolean;
    history: Array<{ Success: boolean; Message: string; Type: string }>;
    UserID: string | null;
    ConversationID: string | null;
    Status: string;
    CancellationReason: string | null;
    IsSaved: boolean;
};
const run = (fields: Partial<Run> = {}): Run => Object.assign(new MJAIAgentRunEntityExtended() as Run, fields);

describe('MJAIAgentRunEntityExtended stop gate', () => {
    beforeEach(() => {
        mocks.superSave.mockReset().mockResolvedValue(true);
        mocks.userOwnsConversation.mockReset().mockResolvedValue(false);
        mocks.logError.mockReset();
    });

    it('the starter stops their own run', async () => {
        const r = run();
        expect(await r.Save()).toBe(true);
        expect(mocks.superSave).toHaveBeenCalledTimes(1);
        expect(mocks.userOwnsConversation).not.toHaveBeenCalled();
    });

    it("another user's stop is refused, with the reason in the result history, and nothing is saved", async () => {
        const r = run({ ContextCurrentUser: { ID: 'someone-else' } });
        expect(await r.Save()).toBe(false);
        expect(mocks.superSave).not.toHaveBeenCalled();
        expect(r.history).toEqual([expect.objectContaining({ Success: false, Type: 'update', Message: MJAIAgentRunEntityExtended.StopRefusedMessage })]);
        expect(mocks.userOwnsConversation).toHaveBeenCalledWith(r.ProviderToUse, r.ContextCurrentUser, 'conv-1');
    });

    it("the conversation's owner stops anyone's run", async () => {
        mocks.userOwnsConversation.mockResolvedValue(true);
        const r = run({ ContextCurrentUser: { ID: 'owner' } });
        expect(await r.Save()).toBe(true);
        expect(mocks.superSave).toHaveBeenCalledTimes(1);
    });

    it('a run outside any conversation can be stopped only by its starter', async () => {
        const r = run({ ContextCurrentUser: { ID: 'someone-else' }, ConversationID: null });
        expect(await r.Save()).toBe(false);
        expect(mocks.userOwnsConversation).not.toHaveBeenCalled();
    });

    it('a run with no recorded starter has no one to defer to, so the stop goes through', async () => {
        const r = run({ ContextCurrentUser: { ID: 'someone-else' }, UserID: null });
        expect(await r.Save()).toBe(true);
    });

    it('is not a stop request: a new run, an unchanged status, an already-cancelled run, or the framework\'s own reasons', async () => {
        expect(run({ IsSaved: false }).IsStopRequest).toBe(false);
        expect(run({ statusDirty: false }).IsStopRequest).toBe(false);
        expect(run({ Status: 'Running' }).IsStopRequest).toBe(false);
        expect(run({ CancellationReason: 'Timeout' }).IsStopRequest).toBe(false);
        expect(run({ CancellationReason: 'System' }).IsStopRequest).toBe(false);
        expect(run().IsStopRequest).toBe(true);
        expect(run({ CancellationReason: null }).IsStopRequest).toBe(true);
        // None of those consult the rule: a stranger saving a timeout cancellation is the framework finalizing.
        const r = run({ ContextCurrentUser: { ID: 'someone-else' }, CancellationReason: 'Timeout' });
        expect(await r.Save()).toBe(true);
        expect(mocks.userOwnsConversation).not.toHaveBeenCalled();
    });

    it('leaves the check to the server on a client provider, and when there is no context user', async () => {
        expect(await run({ ContextCurrentUser: { ID: 'someone-else' }, ProviderToUse: { ProviderType: 'Network' } }).Save()).toBe(true);
        expect(await run({ ContextCurrentUser: null }).Save()).toBe(true);
        expect(mocks.userOwnsConversation).not.toHaveBeenCalled();
    });

    it('refuses and logs when the ownership check throws', async () => {
        mocks.userOwnsConversation.mockRejectedValue(new Error('db down'));
        const r = run({ ContextCurrentUser: { ID: 'someone-else' } });
        expect(await r.Save()).toBe(false);
        expect(r.history[0].Message).toBe(MJAIAgentRunEntityExtended.StopCheckFailedMessage);
        expect(mocks.logError).toHaveBeenCalledTimes(1);
    });

    it('StopPermitted is the rule the conversation UI shares', () => {
        expect(MJAIAgentRunEntityExtended.StopPermitted('me', 'me', false)).toBe(true);
        expect(MJAIAgentRunEntityExtended.StopPermitted('me', 'them', false)).toBe(false);
        expect(MJAIAgentRunEntityExtended.StopPermitted('me', 'them', true)).toBe(true);
        expect(MJAIAgentRunEntityExtended.StopPermitted('me', null, false)).toBe(true);
    });
});
