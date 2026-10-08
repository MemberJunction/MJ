import { describe, it, expect } from 'vitest';
import type { ConversationBranchRow } from '@memberjunction/core-entities';
import { IsForkPointOrEarlier } from '../lib/utils/conversation-branching';

const B: ConversationBranchRow = { ID: 'B', ConversationID: 'c', ParentBranchID: null, ForkFromSequence: 2, Name: 'alt' };
const C: ConversationBranchRow = { ID: 'C', ConversationID: 'c', ParentBranchID: 'B', ForkFromSequence: 8, Name: null };
const branches = [B, C];

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
