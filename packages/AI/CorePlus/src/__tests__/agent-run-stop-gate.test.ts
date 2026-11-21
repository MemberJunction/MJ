/**
 * The stop gate on `MJ: AI Agent Runs`: an unmarked save of an existing run with `Status = 'Cancelled'`
 * is allowed on the server only when the persisted DB row is already `Cancelled`, the context user
 * started the run, or the context user owns its conversation (walking `ParentRunID` for child
 * sub-agent runs). Trusted server cancellations call `MarkServerCancellation()`, which authorizes
 * a single `Save()` call and is cleared in `finally`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    superSave: vi.fn(),
    logError: vi.fn(),
    userOwnsConversation: vi.fn(),
    runView: vi.fn(),
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
    return {
        BaseEntity: class {},
        BaseEntityResult,
        LogError: mocks.logError,
        LogErrorEx: vi.fn(),
        CompositeKey: class {},
    };
});
vi.mock('@memberjunction/core-entities', () => ({
    MJAIAgentRunEntity: class {
        public ID = 'run-1';
        public Status: string = 'Cancelled';
        public CancellationReason: string | null = 'User Request';
        public UserID: string | null = 'starter';
        public ConversationID: string | null = 'conv-1';
        public ParentRunID: string | null = null;
        public BoundActionParams: string | null = null;
        public IsSaved = true;
        public ContextCurrentUser: { ID: string } | null = { ID: 'starter' };
        public ProviderToUse: { ProviderType: string } = { ProviderType: 'Database' };
        public RunViewProviderToUse: { RunView: typeof mocks.runView } = { RunView: mocks.runView };
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

interface PersistedRow {
    ID: string;
    Status: string;
    UserID: string | null;
    ConversationID: string | null;
    ParentRunID: string | null;
    BoundActionParams?: string | null;
}

type Run = MJAIAgentRunEntityExtended & {
    ContextCurrentUser: { ID: string } | null;
    ProviderToUse: { ProviderType: string };
    RunViewProviderToUse: { RunView: typeof mocks.runView };
    statusDirty: boolean;
    history: Array<{ Success: boolean; Message: string; Type: string }>;
    UserID: string | null;
    ConversationID: string | null;
    ParentRunID: string | null;
    BoundActionParams: string | null;
    Status: string;
    CancellationReason: string | null;
    IsSaved: boolean;
};

const run = (fields: Partial<Run> = {}): Run => Object.assign(new MJAIAgentRunEntityExtended() as Run, fields);

function stubPersistedRows(rowsById: Record<string, PersistedRow>): void {
    mocks.runView.mockImplementation(async (params: { ExtraFilter?: string; Fields?: string[] }) => {
        const match = /ID='([^']+)'/.exec(params.ExtraFilter ?? '');
        const id = match?.[1];
        const row = id ? rowsById[id] : undefined;
        if (!row) {
            return { Success: true, Results: [] };
        }
        return { Success: true, Results: [{ BoundActionParams: null, ...row }] };
    });
}

describe('MJAIAgentRunEntityExtended stop gate', () => {
    beforeEach(() => {
        mocks.superSave.mockReset().mockResolvedValue(true);
        mocks.userOwnsConversation.mockReset().mockResolvedValue(false);
        mocks.logError.mockReset();
        mocks.runView.mockReset();
        stubPersistedRows({
            'run-1': {
                ID: 'run-1',
                Status: 'Running',
                UserID: 'starter',
                ConversationID: 'conv-1',
                ParentRunID: null,
            },
        });
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

    it('rejects non-owner B cancelling A\'s Running run even when CancellationReason is spoofed to System or Timeout', async () => {
        for (const reason of ['System', 'Timeout', null] as const) {
            mocks.superSave.mockClear();
            const r = run({ ContextCurrentUser: { ID: 'someone-else' }, CancellationReason: reason });
            expect(r.IsStopRequest).toBe(true);
            expect(await r.Save()).toBe(false);
            expect(mocks.superSave).not.toHaveBeenCalled();
            expect(r.history).toEqual([
                expect.objectContaining({
                    Success: false,
                    Type: 'update',
                    Message: MJAIAgentRunEntityExtended.StopRefusedMessage,
                }),
            ]);
        }
    });

    it('allows server runtime cancellation via MarkServerCancellation() regardless of reason or attributed user, and clears the mark after one Save()', async () => {
        for (const reason of ['Timeout', 'System', 'User Request'] as const) {
            mocks.superSave.mockClear();
            mocks.userOwnsConversation.mockClear();
            const r = run({ ContextCurrentUser: { ID: 'service-account' }, CancellationReason: reason });
            expect(r.MarkServerCancellation()).toBe(r);
            expect(r.IsStopRequest).toBe(false);
            expect(await r.Save()).toBe(true);
            expect(mocks.superSave).toHaveBeenCalledTimes(1);
            expect(mocks.userOwnsConversation).not.toHaveBeenCalled();

            // The mark is single-use (cleared in finally): a subsequent unmarked Save() is gated again.
            expect(r.IsStopRequest).toBe(true);
            mocks.superSave.mockClear();
            expect(await r.Save()).toBe(false);
            expect(mocks.superSave).not.toHaveBeenCalled();
        }
    });

    it('rejects client-spoofed OldValues___ (Status not dirty in memory) when persisted DB row is still Running', async () => {
        const r = run({
            ContextCurrentUser: { ID: 'someone-else' },
            statusDirty: false,
        });
        expect(r.IsStopRequest).toBe(true);
        expect(await r.Save()).toBe(false);
        expect(mocks.superSave).not.toHaveBeenCalled();
        expect(r.history[0].Message).toBe(MJAIAgentRunEntityExtended.StopRefusedMessage);
    });

    it('rejects client-spoofed UserID or ConversationID on the payload by checking the persisted DB row', async () => {
        const r = run({
            ContextCurrentUser: { ID: 'attacker' },
            UserID: 'attacker',
            ConversationID: 'attacker-conv',
        });
        expect(await r.Save()).toBe(false);
        expect(mocks.superSave).not.toHaveBeenCalled();
        expect(mocks.userOwnsConversation).toHaveBeenCalledWith(r.ProviderToUse, r.ContextCurrentUser, 'conv-1');
    });

    it('allows finalizing updates when the persisted DB row is already Cancelled', async () => {
        stubPersistedRows({
            'run-1': {
                ID: 'run-1',
                Status: 'Cancelled',
                UserID: 'starter',
                ConversationID: 'conv-1',
                ParentRunID: null,
            },
        });
        const r = run({ ContextCurrentUser: { ID: 'someone-else' }, CancellationReason: 'User Request' });
        expect(await r.Save()).toBe(true);
        expect(mocks.superSave).toHaveBeenCalledTimes(1);
        expect(mocks.userOwnsConversation).not.toHaveBeenCalled();
    });

    it("the conversation's owner stops anyone's run", async () => {
        mocks.userOwnsConversation.mockResolvedValue(true);
        const r = run({ ContextCurrentUser: { ID: 'owner' } });
        expect(await r.Save()).toBe(true);
        expect(mocks.superSave).toHaveBeenCalledTimes(1);
    });

    it('conversation owner stops a child sub-agent run by walking ParentRunID to the ancestor ConversationID', async () => {
        stubPersistedRows({
            'child-run': {
                ID: 'child-run',
                Status: 'Running',
                UserID: 'starter',
                ConversationID: null,
                ParentRunID: 'mid-run',
            },
            'mid-run': {
                ID: 'mid-run',
                Status: 'Running',
                UserID: 'starter',
                ConversationID: null,
                ParentRunID: 'root-run',
            },
            'root-run': {
                ID: 'root-run',
                Status: 'Running',
                UserID: 'starter',
                ConversationID: 'conv-1',
                ParentRunID: null,
            },
        });
        mocks.userOwnsConversation.mockResolvedValue(true);
        const ownerRun = run({ ID: 'child-run', ContextCurrentUser: { ID: 'owner' }, ConversationID: null, ParentRunID: 'mid-run' });
        expect(await ownerRun.Save()).toBe(true);
        expect(mocks.userOwnsConversation).toHaveBeenCalledWith(ownerRun.ProviderToUse, ownerRun.ContextCurrentUser, 'conv-1');
        expect(mocks.superSave).toHaveBeenCalledTimes(1);

        // Non-owner is still refused
        mocks.superSave.mockClear();
        mocks.userOwnsConversation.mockResolvedValue(false);
        const strangerRun = run({ ID: 'child-run', ContextCurrentUser: { ID: 'someone-else' }, ConversationID: null, ParentRunID: 'mid-run' });
        expect(await strangerRun.Save()).toBe(false);
        expect(mocks.superSave).not.toHaveBeenCalled();
    });

    it('terminates safely on a ParentRunID cycle and refuses non-starter', async () => {
        stubPersistedRows({
            'cycle-a': { ID: 'cycle-a', Status: 'Running', UserID: 'starter', ConversationID: null, ParentRunID: 'cycle-b' },
            'cycle-b': { ID: 'cycle-b', Status: 'Running', UserID: 'starter', ConversationID: null, ParentRunID: 'cycle-a' },
        });
        const r = run({ ID: 'cycle-a', ContextCurrentUser: { ID: 'someone-else' }, ConversationID: null });
        expect(await r.Save()).toBe(false);
        expect(mocks.superSave).not.toHaveBeenCalled();
        expect(mocks.userOwnsConversation).not.toHaveBeenCalled();
        expect(r.history[0].Message).toBe(MJAIAgentRunEntityExtended.StopRefusedMessage);
    });

    it('a run outside any conversation can be stopped only by its starter', async () => {
        stubPersistedRows({
            'run-1': {
                ID: 'run-1',
                Status: 'Running',
                UserID: 'starter',
                ConversationID: null,
                ParentRunID: null,
            },
        });
        const r = run({ ContextCurrentUser: { ID: 'someone-else' }, ConversationID: null });
        expect(await r.Save()).toBe(false);
        expect(mocks.userOwnsConversation).not.toHaveBeenCalled();
    });

    it('a run with no recorded starter has no one to defer to, so the stop goes through', async () => {
        stubPersistedRows({
            'run-1': {
                ID: 'run-1',
                Status: 'Running',
                UserID: null,
                ConversationID: 'conv-1',
                ParentRunID: null,
            },
        });
        const r = run({ ContextCurrentUser: { ID: 'someone-else' }, UserID: null });
        expect(await r.Save()).toBe(true);
    });

    it('IsStopRequest is false only for unsaved runs, non-Cancelled status, or MarkServerCancellation()', () => {
        expect(run({ IsSaved: false }).IsStopRequest).toBe(false);
        expect(run({ Status: 'Running' }).IsStopRequest).toBe(false);
        expect(run().MarkServerCancellation().IsStopRequest).toBe(false);
        expect(run().IsStopRequest).toBe(true);
        expect(run({ CancellationReason: null }).IsStopRequest).toBe(true);
        expect(run({ CancellationReason: 'Timeout' }).IsStopRequest).toBe(true);
        expect(run({ CancellationReason: 'System' }).IsStopRequest).toBe(true);
        expect(run({ statusDirty: false }).IsStopRequest).toBe(true);
    });

    it('leaves the check to the server on a client provider, and when there is no context user', async () => {
        expect(await run({ ContextCurrentUser: { ID: 'someone-else' }, ProviderToUse: { ProviderType: 'Network' } }).Save()).toBe(true);
        expect(await run({ ContextCurrentUser: null }).Save()).toBe(true);
        expect(mocks.userOwnsConversation).not.toHaveBeenCalled();
    });

    it('refuses and logs when the ownership check throws or the DB lookup fails', async () => {
        mocks.userOwnsConversation.mockRejectedValue(new Error('db down'));
        const r1 = run({ ContextCurrentUser: { ID: 'someone-else' } });
        expect(await r1.Save()).toBe(false);
        expect(r1.history[0].Message).toBe(MJAIAgentRunEntityExtended.StopCheckFailedMessage);
        expect(mocks.logError).toHaveBeenCalledTimes(1);

        mocks.logError.mockClear();
        mocks.runView.mockResolvedValue({ Success: false, Results: [], ErrorMessage: 'timeout' });
        const r2 = run({ ContextCurrentUser: { ID: 'someone-else' } });
        expect(await r2.Save()).toBe(false);
        expect(r2.history[0].Message).toBe(MJAIAgentRunEntityExtended.StopCheckFailedMessage);
        expect(mocks.logError).toHaveBeenCalledTimes(1);
    });

    it('StopPermitted is the rule the conversation UI shares', () => {
        expect(MJAIAgentRunEntityExtended.StopPermitted('me', 'me', false)).toBe(true);
        expect(MJAIAgentRunEntityExtended.StopPermitted('me', 'them', false)).toBe(false);
        expect(MJAIAgentRunEntityExtended.StopPermitted('me', 'them', true)).toBe(true);
        expect(MJAIAgentRunEntityExtended.StopPermitted('me', null, false)).toBe(true);
    });
});
