/**
 * Unit tests for MJConversationDetailEntityServer.ShouldFlagOriginalMessageChanged —
 * the edit-detection predicate behind the OriginalMessageChanged flag (the edit signal
 * for cross-turn conversation compaction, plans/agent-conversation-compaction.md §6).
 *
 * The predicate must fire ONLY for genuine message edits on existing records, and never
 * for the framework's own Message rewrites (new-row inserts, agent progress updates on
 * In-Progress rows, the finalization save that transitions Status alongside Message).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const { logErrorMock } = vi.hoisted(() => ({ logErrorMock: vi.fn() }));

// Real core, with LogError captured so the stamp-failure path can be asserted without console noise.
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: (...args: unknown[]) => logErrorMock(...args) };
});

import { MJConversationDetailEntityServer } from '../custom/MJConversationDetailEntityServer.server';

type FieldStub = { Dirty: boolean; OldValue?: unknown } | undefined;

/** Minimal structural stand-in for the BaseEntity surface the predicate reads. */
function invokePredicate(opts: {
    isSaved: boolean;
    message: FieldStub;
    status?: FieldStub;
    statusValue?: string;
}): boolean {
    const stub = {
        IsSaved: opts.isSaved,
        Status: opts.statusValue ?? 'Complete',
        GetFieldByName(name: string): FieldStub {
            if (name === 'Message') return opts.message;
            if (name === 'Status') return opts.status ?? { Dirty: false };
            return undefined;
        },
    };
    return MJConversationDetailEntityServer.prototype.ShouldFlagOriginalMessageChanged.call(
        stub as unknown as MJConversationDetailEntityServer
    );
}

describe('MJConversationDetailEntityServer.ShouldFlagOriginalMessageChanged', () => {
    it('flags a genuine message edit on an existing, completed record', () => {
        expect(invokePredicate({
            isSaved: true,
            message: { Dirty: true, OldValue: 'original text' },
        })).toBe(true);
    });

    it('never flags new records (covers the agent-response placeholder INSERT)', () => {
        expect(invokePredicate({
            isSaved: false,
            message: { Dirty: true, OldValue: undefined },
        })).toBe(false);
    });

    it('never flags when Message is clean or has no prior value', () => {
        expect(invokePredicate({ isSaved: true, message: { Dirty: false, OldValue: 'x' } })).toBe(false);
        expect(invokePredicate({ isSaved: true, message: { Dirty: true, OldValue: undefined } })).toBe(false);
        expect(invokePredicate({ isSaved: true, message: undefined })).toBe(false);
    });

    it('never flags agent progress updates (Message rewrites while In-Progress)', () => {
        expect(invokePredicate({
            isSaved: true,
            message: { Dirty: true, OldValue: '⏳ Starting...' },
            statusValue: 'In-Progress',
        })).toBe(false);
    });

    it('never flags the finalization save (Message + Status transition together)', () => {
        expect(invokePredicate({
            isSaved: true,
            message: { Dirty: true, OldValue: 'progress text' },
            status: { Dirty: true, OldValue: 'In-Progress' },
            statusValue: 'Complete',
        })).toBe(false);
    });

    it('flags an edit to an Error-status message (only In-Progress is lifecycle-exempt)', () => {
        expect(invokePredicate({
            isSaved: true,
            message: { Dirty: true, OldValue: 'failed text' },
            statusValue: 'Error',
        })).toBe(true);
    });
});

describe('MJConversationDetailEntityServer.StampBranchFromConversation', () => {
    function invokeStamp(opts: { isSaved: boolean; branchId: string | null; conversationId: string | null; user: unknown; currentBranchId: string | null; loadOk?: boolean }) {
        const stub = {
            IsSaved: opts.isSaved,
            BranchID: opts.branchId,
            ConversationID: opts.conversationId,
            ContextCurrentUser: opts.user,
            ProviderToUse: {
                GetEntityObject: async () => ({
                    CurrentBranchID: opts.currentBranchId,
                    Load: async () => opts.loadOk ?? true,
                }),
            },
        };
        return MJConversationDetailEntityServer.prototype.StampBranchFromConversation
            .call(stub as unknown as MJConversationDetailEntityServer)
            .then(() => stub.BranchID);
    }

    it('stamps a new row with the conversation\'s current branch', async () => {
        await expect(invokeStamp({ isSaved: false, branchId: null, conversationId: 'c1', user: { ID: 'u1' }, currentBranchId: 'B' })).resolves.toBe('B');
    });
    it('leaves an explicit branch alone', async () => {
        await expect(invokeStamp({ isSaved: false, branchId: 'X', conversationId: 'c1', user: { ID: 'u1' }, currentBranchId: 'B' })).resolves.toBe('X');
    });
    it('does nothing for an existing row, a trunk conversation, or a system save', async () => {
        await expect(invokeStamp({ isSaved: true, branchId: null, conversationId: 'c1', user: { ID: 'u1' }, currentBranchId: 'B' })).resolves.toBeNull();
        await expect(invokeStamp({ isSaved: false, branchId: null, conversationId: 'c1', user: { ID: 'u1' }, currentBranchId: null })).resolves.toBeNull();
        await expect(invokeStamp({ isSaved: false, branchId: null, conversationId: 'c1', user: null, currentBranchId: 'B' })).resolves.toBeNull();
    });
    it('does not stamp and does not throw when the conversation does not load', async () => {
        await expect(invokeStamp({ isSaved: false, branchId: null, conversationId: 'c1', user: { ID: 'u1' }, currentBranchId: 'B', loadOk: false })).resolves.toBeNull();
    });
});

describe('MJConversationDetailEntityServer.Save when the current branch cannot be read', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        logErrorMock.mockReset();
    });

    it('returns false, records why, and does not call the parent Save', async () => {
        const parentPrototype = Object.getPrototypeOf(MJConversationDetailEntityServer.prototype) as MJConversationDetailEntityServer;
        const parentSave = vi.spyOn(parentPrototype, 'Save').mockResolvedValue(true);
        const results: Array<{ Success: boolean; Type: string; Message: string }> = [];
        const stub = {
            IsSaved: false,
            BranchID: null as string | null,
            ConversationID: 'c1',
            ContextCurrentUser: { ID: 'u1' },
            ProviderToUse: {
                GetEntityObject: async () => ({
                    CurrentBranchID: 'B',
                    Load: async () => {
                        throw new Error('no read permission');
                    },
                }),
            },
            ShouldFlagOriginalMessageChanged: () => false,
            StampBranchFromConversation: MJConversationDetailEntityServer.prototype.StampBranchFromConversation,
            RegisterResultHistoryEntry: (r: { Success: boolean; Type: string; Message: string }) => {
                results.push(r);
            },
        };

        await expect(MJConversationDetailEntityServer.prototype.Save.call(stub as unknown as MJConversationDetailEntityServer)).resolves.toBe(false);

        expect(parentSave).not.toHaveBeenCalled();
        expect(stub.BranchID).toBeNull();
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({ Success: false, Type: 'create', Message: "Unable to determine the conversation's current branch." });
        expect(logErrorMock).toHaveBeenCalledTimes(1);
        expect(String(logErrorMock.mock.calls[0][0])).toMatch(/conversation c1: no read permission/);
    });
});
