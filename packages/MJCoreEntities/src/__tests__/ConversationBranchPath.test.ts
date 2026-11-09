import { describe, it, expect, vi } from 'vitest';

// Only the core exports used while the engine module loads: ConversationEngine extends
// BaseEngine, and ResourcePermissionEngine applies @RegisterForStartup. @memberjunction/global
// stays real so the helpers use real UUID normalisation.
vi.mock('@memberjunction/core', () => ({
    BaseEngine: class {},
    RegisterForStartup: () => () => {},
}));

import { ConversationEngine, ConversationBranchRow, MAX_BRANCH_DEPTH } from '../engines/conversations';

const C = 'conv-1';
const B: ConversationBranchRow = { ID: 'B', ConversationID: C, ParentBranchID: null, ForkFromSequence: 2 };
const Cc: ConversationBranchRow = { ID: 'C', ConversationID: C, ParentBranchID: 'B', ForkFromSequence: 8 };
const ROOTLESS: ConversationBranchRow = { ID: 'R', ConversationID: C, ParentBranchID: null, ForkFromSequence: null };
const branches = [B, Cc, ROOTLESS];

const row = (sequence: number, branchId: string | null) => ({ ID: `d-${sequence}`, Sequence: sequence, BranchID: branchId });

describe('BuildBranchChain', () => {
    it('returns the branch and its ancestors, current first', () => {
        expect(ConversationEngine.BuildBranchChain(branches, 'C').map(b => b.ID)).toEqual(['C', 'B']);
    });
    it('returns [] for the trunk', () => {
        expect(ConversationEngine.BuildBranchChain(branches, null)).toEqual([]);
    });
    it('throws for an unknown branch', () => {
        expect(() => ConversationEngine.BuildBranchChain(branches, 'nope')).toThrow(/not found/);
    });
    it('throws on a cycle or a chain deeper than the limit', () => {
        const a: ConversationBranchRow = { ID: 'a', ConversationID: C, ParentBranchID: 'b', ForkFromSequence: 1 };
        const b: ConversationBranchRow = { ID: 'b', ConversationID: C, ParentBranchID: 'a', ForkFromSequence: 1 };
        expect(() => ConversationEngine.BuildBranchChain([a, b], 'a')).toThrow(new RegExp(`${MAX_BRANCH_DEPTH}`));
    });
});

describe('BuildBranchPathFilter', () => {
    it('is the trunk predicate for a null branch', () => {
        expect(ConversationEngine.BuildBranchPathFilter(C, null, branches)).toBe(`[ConversationID]='conv-1' AND [BranchID] IS NULL`);
    });
    it('is the trunk predicate when there are no branches at all', () => {
        expect(ConversationEngine.BuildBranchPathFilter(C, undefined, [])).toBe(`[ConversationID]='conv-1' AND [BranchID] IS NULL`);
    });
    it('unions the branch with each ancestor capped at its fork sequence', () => {
        expect(ConversationEngine.BuildBranchPathFilter(C, 'C', branches)).toBe(
            `[ConversationID]='conv-1' AND ([BranchID]='C' OR ([BranchID]='B' AND [Sequence] <= 8) OR ([BranchID] IS NULL AND [Sequence] <= 2))`
        );
    });
    it('includes no parent rows when the branch forks before the first message', () => {
        expect(ConversationEngine.BuildBranchPathFilter(C, 'R', branches)).toBe(`[ConversationID]='conv-1' AND ([BranchID]='R')`);
    });
});

describe('FilterRowsToBranchPath', () => {
    const rows = [row(1, null), row(2, null), row(3, null), row(7, 'B'), row(8, 'B'), row(9, 'B'), row(11, 'C'), row(20, 'R')];
    it('keeps only trunk rows for the trunk', () => {
        expect(ConversationEngine.FilterRowsToBranchPath(rows, null, branches).map(r => r.Sequence)).toEqual([1, 2, 3]);
    });
    it('keeps the path of a nested branch', () => {
        expect(ConversationEngine.FilterRowsToBranchPath(rows, 'C', branches).map(r => r.Sequence)).toEqual([1, 2, 7, 8, 11]);
    });
    it('compares ids case-insensitively', () => {
        expect(ConversationEngine.FilterRowsToBranchPath([row(7, 'b')], 'B', branches)).toHaveLength(1);
    });
});
