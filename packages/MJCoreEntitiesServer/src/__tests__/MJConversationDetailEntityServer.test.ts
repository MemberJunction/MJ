/**
 * Unit tests for MJConversationDetailEntityServer.
 *
 * ShouldFlagOriginalMessageChanged is the edit-detection predicate behind the
 * OriginalMessageChanged flag (the edit signal for cross-turn conversation compaction,
 * plans/agent-conversation-compaction.md §6). It must fire ONLY for genuine message edits on
 * existing records, and never for the framework's own Message rewrites (new-row inserts, agent
 * progress updates on In-Progress rows, the finalization save that transitions Status alongside Message).
 *
 * CheckBranchOnCreate is the create-time check that a new row's non-null BranchID names a
 * fork of the same conversation; Save fails without writing when it does not.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const { logErrorMock } = vi.hoisted(() => ({ logErrorMock: vi.fn() }));

// Real core, with LogError captured so the fork-check failure path can be asserted without console noise.
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: (...args: unknown[]) => logErrorMock(...args) };
});

import { RunView } from '@memberjunction/core';
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

describe('MJConversationDetailEntityServer.CheckBranchOnCreate', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        logErrorMock.mockReset();
    });

    type Stub = { IsSaved: boolean; BranchID: string | null; ConversationID: string | null; ContextCurrentUser: { ID: string } | null; ProviderToUse: object };
    function stub(over: Partial<Stub> = {}): Stub {
        return { IsSaved: false, BranchID: 'B1', ConversationID: 'c1', ContextCurrentUser: { ID: 'u1' }, ProviderToUse: {}, ...over };
    }
    function check(s: Stub): Promise<string | null> {
        return MJConversationDetailEntityServer.prototype.CheckBranchOnCreate.call(s as unknown as MJConversationDetailEntityServer);
    }
    function mockForkRead(result: { Success: boolean; Results?: Array<{ ID: string; ConversationID: string }>; ErrorMessage?: string } | Error) {
        const runView = vi.fn(async () => {
            if (result instanceof Error) {
                throw result;
            }
            return result;
        });
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runView } as unknown as RunView);
        return runView;
    }

    it('passes a new row whose fork belongs to the same conversation', async () => {
        const runView = mockForkRead({ Success: true, Results: [{ ID: 'B1', ConversationID: 'C1' }] });
        await expect(check(stub({ ConversationID: 'c1' }))).resolves.toBeNull();
        expect(runView).toHaveBeenCalledWith(
            { EntityName: 'MJ: Conversation Branches', ExtraFilter: "ID='B1'", Fields: ['ID', 'ConversationID'], ResultType: 'simple' },
            { ID: 'u1' }
        );
    });

    it('fails a new row whose fork belongs to another conversation, or does not exist', async () => {
        mockForkRead({ Success: true, Results: [{ ID: 'B1', ConversationID: 'c2' }] });
        await expect(check(stub())).resolves.toBe('Fork B1 does not belong to conversation c1.');
        mockForkRead({ Success: true, Results: [] });
        await expect(check(stub())).resolves.toBe('Fork B1 does not belong to conversation c1.');
    });

    it('fails, and logs, when the fork cannot be read or the read throws', async () => {
        mockForkRead({ Success: false, ErrorMessage: 'denied' });
        await expect(check(stub())).resolves.toBe('Unable to check the fork of this message.');
        mockForkRead(new Error('db down'));
        await expect(check(stub())).resolves.toBe('Unable to check the fork of this message.');
        expect(logErrorMock).toHaveBeenCalledTimes(2);
    });

    it('does not check an existing row, a Main row, a row without a conversation, or a save without a user', async () => {
        const runView = mockForkRead({ Success: true, Results: [] });
        await expect(check(stub({ IsSaved: true }))).resolves.toBeNull();
        await expect(check(stub({ BranchID: null }))).resolves.toBeNull();
        await expect(check(stub({ ConversationID: null }))).resolves.toBeNull();
        await expect(check(stub({ ContextCurrentUser: null }))).resolves.toBeNull();
        expect(runView).not.toHaveBeenCalled();
    });

    it('escapes the fork id', async () => {
        const runView = mockForkRead({ Success: true, Results: [{ ID: "B'1", ConversationID: 'c1' }] });
        await check(stub({ BranchID: "B'1" }));
        expect(runView.mock.calls[0][0]).toMatchObject({ ExtraFilter: "ID='B''1'" });
    });
});

describe('MJConversationDetailEntityServer.Save', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    type SaveStub = {
        BranchID: string | null;
        ShouldFlagOriginalMessageChanged: () => boolean;
        CheckBranchOnCreate: () => Promise<string | null>;
        RegisterResultHistoryEntry: (r: { Success: boolean; Type: string; Message: string }) => void;
        recordCreateFailure: (message: string) => void;
    };
    function saveStub(problem: string | null, results: Array<{ Success: boolean; Type: string; Message: string }>): SaveStub {
        const proto = MJConversationDetailEntityServer.prototype as unknown as { recordCreateFailure: (message: string) => void };
        return {
            BranchID: null,
            ShouldFlagOriginalMessageChanged: () => false,
            CheckBranchOnCreate: async () => problem,
            RegisterResultHistoryEntry: r => { results.push(r); },
            recordCreateFailure: proto.recordCreateFailure,
        };
    }

    it('returns false, records why, and does not call the parent Save when the fork check fails', async () => {
        const parentPrototype = Object.getPrototypeOf(MJConversationDetailEntityServer.prototype) as MJConversationDetailEntityServer;
        const parentSave = vi.spyOn(parentPrototype, 'Save').mockResolvedValue(true);
        const results: Array<{ Success: boolean; Type: string; Message: string }> = [];
        const s = saveStub('Fork B1 does not belong to conversation c1.', results);

        await expect(MJConversationDetailEntityServer.prototype.Save.call(s as unknown as MJConversationDetailEntityServer)).resolves.toBe(false);

        expect(parentSave).not.toHaveBeenCalled();
        expect(results).toEqual([expect.objectContaining({ Success: false, Type: 'create', Message: 'Fork B1 does not belong to conversation c1.' })]);
    });

    it('calls the parent Save and leaves a Main row on Main when the check passes', async () => {
        const parentPrototype = Object.getPrototypeOf(MJConversationDetailEntityServer.prototype) as MJConversationDetailEntityServer;
        const parentSave = vi.spyOn(parentPrototype, 'Save').mockResolvedValue(true);
        const s = saveStub(null, []);

        await expect(MJConversationDetailEntityServer.prototype.Save.call(s as unknown as MJConversationDetailEntityServer)).resolves.toBe(true);

        expect(parentSave).toHaveBeenCalledOnce();
        expect(s.BranchID).toBeNull();
    });
});
