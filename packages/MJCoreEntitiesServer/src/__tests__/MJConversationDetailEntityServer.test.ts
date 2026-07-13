/**
 * Unit tests for MJConversationDetailEntityServer.ShouldFlagOriginalMessageChanged —
 * the edit-detection predicate behind the OriginalMessageChanged flag (the edit signal
 * for cross-turn conversation compaction, plans/agent-conversation-compaction.md §6).
 *
 * The predicate must fire ONLY for genuine message edits on existing records, and never
 * for the framework's own Message rewrites (new-row inserts, agent progress updates on
 * In-Progress rows, the finalization save that transitions Status alongside Message).
 */
import { describe, it, expect } from 'vitest';
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
