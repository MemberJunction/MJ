import { describe, it, expect } from 'vitest';
import type { ConversationBranchRow } from '@memberjunction/core-entities';
import { BuildBranchSwitcherMap, FindPredecessorOnPath, IsForkPointOrEarlier } from '../lib/utils/conversation-branching';

const B: ConversationBranchRow = { ID: 'B', ConversationID: 'c', ParentBranchID: null, ForkFromSequence: 2, Name: 'alt' };
const C: ConversationBranchRow = { ID: 'C', ConversationID: 'c', ParentBranchID: 'B', ForkFromSequence: 8, Name: null };
const branches = [B, C];
const row = (seq: number, branch: string | null) => ({ ID: `d${seq}`, Sequence: seq, BranchID: branch });

describe('BuildBranchSwitcherMap', () => {
    it('marks the row after a fork point with its alternatives and the active index', () => {
        const rows = [row(1, null), row(2, null), row(7, 'B'), row(8, 'B'), row(11, 'C')];
        const map = BuildBranchSwitcherMap(rows, 'C', branches, false);
        expect(map.get('d7')).toEqual({ Alternatives: [{ BranchID: null, Name: null }, { BranchID: 'B', Name: 'alt' }], CurrentIndex: 1 });
        expect(map.get('d11')).toEqual({ Alternatives: [{ BranchID: 'B', Name: null }, { BranchID: 'C', Name: null }], CurrentIndex: 1 });
        expect(map.has('d2')).toBe(false);
    });
    it('on the trunk, the first alternative is active', () => {
        const rows = [row(1, null), row(2, null), row(3, null)];
        expect(BuildBranchSwitcherMap(rows, null, branches, false).get('d3')?.CurrentIndex).toBe(0);
    });
    it('skips the first loaded row when older rows exist, since its predecessor is unknown', () => {
        const R: ConversationBranchRow = { ID: 'R', ConversationID: 'c', ParentBranchID: null, ForkFromSequence: null, Name: null };
        const rows = [row(3, null), row(4, null)];
        expect(BuildBranchSwitcherMap(rows, null, [R], true).size).toBe(0);
        expect(BuildBranchSwitcherMap(rows, null, [R], false).has('d3')).toBe(true);
    });
    it('handles a fork before the first message', () => {
        const R: ConversationBranchRow = { ID: 'R', ConversationID: 'c', ParentBranchID: null, ForkFromSequence: null, Name: null };
        const map = BuildBranchSwitcherMap([row(1, null)], null, [R], false);
        expect(map.get('d1')).toEqual({ Alternatives: [{ BranchID: null, Name: null }, { BranchID: 'R', Name: null }], CurrentIndex: 0 });
    });
});

describe('FindPredecessorOnPath', () => {
    const rows = [row(1, null), row(2, null), row(7, 'B')];
    it('returns the previous row', () => {
        expect(FindPredecessorOnPath(rows, 'd7', false)).toEqual({ Sequence: 2, BranchID: null });
    });
    it('returns null for the first message and undefined when older rows are not loaded', () => {
        expect(FindPredecessorOnPath(rows, 'd1', false)).toBeNull();
        expect(FindPredecessorOnPath(rows, 'd1', true)).toBeUndefined();
    });
});

describe('IsForkPointOrEarlier', () => {
    it('is true for any row at or before a fork sequence', () => {
        expect(IsForkPointOrEarlier(2, branches)).toBe(true);
        expect(IsForkPointOrEarlier(1, branches)).toBe(true);
        expect(IsForkPointOrEarlier(9, branches)).toBe(false);
    });
    it('is false with no branches', () => {
        expect(IsForkPointOrEarlier(1, [])).toBe(false);
    });
});
