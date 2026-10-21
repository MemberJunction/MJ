import { describe, it, expect } from 'vitest';
import type { ConversationBranchRow } from '@memberjunction/core-entities';
import { FindLatestTurn, ForkDependsOnRows, MAIN_OPEN_VIEW, TurnRowsAfter, type TurnRow } from '../lib/utils/conversation-forks';

function r(id: string, sequence: number, role: 'User' | 'AI' | 'Error', branchId: string | null = null, extra: Partial<TurnRow> = {}): TurnRow {
    return { ID: id, Role: role, Sequence: sequence, BranchID: branchId, ...extra };
}

/** Main: u1 → a1, then u2 → a delegated status row s2 and the reply a2. */
const MAIN_ROWS: TurnRow[] = [r('a2', 5, 'AI'), r('u1', 1, 'User'), r('s2', 4, 'AI'), r('a1', 2, 'AI'), r('u2', 3, 'User')];
const FORK = { Kind: 'Fork' as const, BranchID: 'F1' };

function branch(over: Partial<ConversationBranchRow>): ConversationBranchRow {
    return { ID: 'B', ConversationID: 'C', ParentBranchID: null, ForkFromSequence: null, SourceDetailID: null, ...over };
}

describe('FindLatestTurn', () => {
    it('finds the last user message of Main and the row that ends its turn', () => {
        expect(FindLatestTurn(MAIN_ROWS, MAIN_OPEN_VIEW)).toEqual({ UserDetailID: 'u2', AnswerDetailID: 'a2' });
    });

    it('has no answer while the turn has none, or when it ended in an error', () => {
        expect(FindLatestTurn([r('u1', 1, 'User'), r('a1', 2, 'AI'), r('u2', 3, 'User')], MAIN_OPEN_VIEW)).toEqual({ UserDetailID: 'u2', AnswerDetailID: null });
        expect(FindLatestTurn([r('u1', 1, 'User'), r('e1', 2, 'Error')], MAIN_OPEN_VIEW)).toEqual({ UserDetailID: 'u1', AnswerDetailID: null });
    });

    it("uses only the fork's own rows in a fork view, without regard to id case", () => {
        const rows = [r('u1', 1, 'User'), r('a1', 2, 'AI'), r('f1', 10, 'User', 'f1'), r('f2', 11, 'AI', 'F1')];
        expect(FindLatestTurn(rows, FORK)).toEqual({ UserDetailID: 'f1', AnswerDetailID: 'f2' });
    });

    it('is null when the latest user message is inherited, in a draft, with no user message, or for a voice turn', () => {
        expect(FindLatestTurn([r('u1', 1, 'User'), r('a1', 2, 'AI')], FORK)).toBeNull();
        expect(FindLatestTurn(MAIN_ROWS, { Kind: 'DraftFork', ParentBranchID: null, ForkFromSequence: 2, AnchorDetailID: 'a1', SourceDetailID: 'u2' })).toBeNull();
        expect(FindLatestTurn([r('a1', 1, 'AI')], MAIN_OPEN_VIEW)).toBeNull();
        expect(FindLatestTurn([r('u1', 1, 'User', null, { AgentSessionID: 'S1' })], MAIN_OPEN_VIEW)).toBeNull();
    });

    it('skips replaced rows', () => {
        const rows = [r('u1', 1, 'User'), r('a1', 2, 'AI'), r('u2', 3, 'User'), r('old', 4, 'AI', null, { ReplacedAt: new Date() })];
        expect(FindLatestTurn(rows, MAIN_OPEN_VIEW)).toEqual({ UserDetailID: 'u2', AnswerDetailID: null });
    });
});

describe('TurnRowsAfter', () => {
    it('returns the rows after the user message on its branch, in order, without replaced rows', () => {
        const rows = [...MAIN_ROWS, r('other', 6, 'AI', 'F9'), r('gone', 7, 'AI', null, { ReplacedAt: '2026-10-07T10:00:00.000Z' })];
        expect(TurnRowsAfter(rows, { Sequence: 3, BranchID: null }).map(x => x.ID)).toEqual(['s2', 'a2']);
    });
});

describe('ForkDependsOnRows', () => {
    const answer = [r('s2', 4, 'AI'), r('a2', 5, 'AI')];

    it('is false for a fork from the user message itself, and for no rows', () => {
        expect(ForkDependsOnRows(null, answer, [branch({ ForkFromSequence: 3 })])).toBe(false);
        expect(ForkDependsOnRows(null, [], [branch({ ForkFromSequence: 5 })])).toBe(false);
    });

    it('is true for a fork of the same branch that starts at or after the first hidden row', () => {
        expect(ForkDependsOnRows(null, answer, [branch({ ForkFromSequence: 4 })])).toBe(true);
        expect(ForkDependsOnRows(null, answer, [branch({ ForkFromSequence: 5 })])).toBe(true);
        expect(ForkDependsOnRows('F1', answer, [branch({ ParentBranchID: 'f1', ForkFromSequence: 9 })])).toBe(true);
    });

    it('is true for a fork placed under one of the rows', () => {
        expect(ForkDependsOnRows(null, answer, [branch({ ForkFromSequence: 3, SourceDetailID: 'A2' })])).toBe(true);
    });

    it('is false for a fork of another branch', () => {
        expect(ForkDependsOnRows(null, answer, [branch({ ParentBranchID: 'F9', ForkFromSequence: 9 })])).toBe(false);
    });
});
