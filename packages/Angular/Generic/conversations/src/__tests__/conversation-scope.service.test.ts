import '@angular/compiler'; // JIT support — the service module evaluates Angular decorators in vitest's node env
import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationEngine, type ConversationBranchRow } from '@memberjunction/core-entities';
import { ConversationScopeService } from '../lib/services/conversation-scope.service';

/**
 * `ConversationScopeService` builds a conversation's scope from the branch rows the chat area
 * registered and the conversation's current branch.
 */

const B: ConversationBranchRow = { ID: 'BRANCH-B', ConversationID: 'CONV-1', ParentBranchID: null, ForkFromSequence: 2, Name: 'alt' };
const C: ConversationBranchRow = { ID: 'BRANCH-C', ConversationID: 'CONV-1', ParentBranchID: 'BRANCH-B', ForkFromSequence: 5, Name: null };
const D: ConversationBranchRow = { ID: 'BRANCH-D', ConversationID: 'CONV-2', ParentBranchID: null, ForkFromSequence: 1, Name: null };
/** The registering component; the service compares owners by identity. */
const OWNER = {};

describe('ConversationScopeService.ForConversation', () => {
    let service: ConversationScopeService;

    beforeEach(() => {
        service = new ConversationScopeService();
    });

    it('returns the trunk scope when no branches are registered and the current branch is null', () => {
        expect(service.ForConversation('CONV-1', null)).toEqual(ConversationEngine.TrunkScope('CONV-1'));
    });

    it('returns the trunk scope when the current branch is null and branches are registered', () => {
        service.SetBranches('CONV-1', [B, C], OWNER);

        expect(service.ForConversation('CONV-1', null)).toEqual(ConversationEngine.TrunkScope('CONV-1'));
    });

    it('treats an empty current branch id as the trunk', () => {
        expect(service.ForConversation('CONV-1', '')).toEqual(ConversationEngine.TrunkScope('CONV-1'));
    });

    it('returns the branch scope with the registered rows', () => {
        service.SetBranches('CONV-1', [B, C], OWNER);

        expect(service.ForConversation('CONV-1', 'BRANCH-C')).toEqual({ ConversationID: 'CONV-1', BranchID: 'BRANCH-C', Branches: [B, C] });
    });

    it('gives a branch scope whose filter is the branch path predicate', () => {
        service.SetBranches('CONV-1', [B, C], OWNER);

        const scope = service.ForConversation('CONV-1', 'BRANCH-C');

        expect(ConversationEngine.ScopeFilter(scope)).toBe(ConversationEngine.BuildBranchPathFilter('CONV-1', 'BRANCH-C', [B, C]));
    });

    it('matches conversation and branch ids without regard to case, and uses the row id', () => {
        service.SetBranches('conv-1', [B], OWNER);

        const scope = service.ForConversation('CONV-1', 'branch-b');

        expect(scope.ConversationID).toBe('CONV-1');
        expect(scope.BranchID).toBe('BRANCH-B');
        expect(scope.Branches).toEqual([B]);
    });

    it('throws when the current branch is not among the registered rows', () => {
        service.SetBranches('CONV-1', [B], OWNER);

        expect(() => service.ForConversation('CONV-1', 'BRANCH-X')).toThrow('Branch BRANCH-X is not registered for conversation CONV-1');
    });

    it('throws when a branch is current and no rows are registered for the conversation', () => {
        expect(() => service.ForConversation('CONV-1', 'BRANCH-B')).toThrow('Branch BRANCH-B is not registered for conversation CONV-1');
    });

    it('keeps the rows of each conversation apart', () => {
        service.SetBranches('CONV-1', [B], OWNER);
        service.SetBranches('CONV-2', [D], OWNER);

        expect(service.ForConversation('CONV-2', 'BRANCH-D').Branches).toEqual([D]);
        expect(() => service.ForConversation('CONV-2', 'BRANCH-B')).toThrow();
    });

    it('replaces the rows registered earlier for the same conversation', () => {
        service.SetBranches('CONV-1', [B, C], OWNER);
        service.SetBranches('CONV-1', [B], OWNER);

        expect(service.ForConversation('CONV-1', 'BRANCH-B').Branches).toEqual([B]);
        expect(() => service.ForConversation('CONV-1', 'BRANCH-C')).toThrow();
    });

    it('replaces the rows with an empty list when an empty list is registered', () => {
        service.SetBranches('CONV-1', [B], OWNER);
        service.SetBranches('CONV-1', [], OWNER);

        expect(() => service.ForConversation('CONV-1', 'BRANCH-B')).toThrow();
        expect(service.ForConversation('CONV-1', null)).toEqual(ConversationEngine.TrunkScope('CONV-1'));
    });

    it('keeps its own copy of the registered rows', () => {
        const rows = [B, C];
        service.SetBranches('CONV-1', rows, OWNER);
        rows.pop();

        expect(service.ForConversation('CONV-1', 'BRANCH-C').Branches).toEqual([B, C]);
    });
});

describe('ConversationScopeService.ClearBranches', () => {
    let service: ConversationScopeService;
    const OTHER = {};

    beforeEach(() => {
        service = new ConversationScopeService();
    });

    it('removes the rows when the owner that registered them clears', () => {
        service.SetBranches('CONV-1', [B], OWNER);

        service.ClearBranches('conv-1', OWNER);

        expect(() => service.ForConversation('CONV-1', 'BRANCH-B')).toThrow();
    });

    it('keeps the rows when another owner clears', () => {
        service.SetBranches('CONV-1', [B], OWNER);

        service.ClearBranches('CONV-1', OTHER);

        expect(service.ForConversation('CONV-1', 'BRANCH-B').Branches).toEqual([B]);
    });

    it('keeps the rows of a later owner when the earlier owner clears', () => {
        service.SetBranches('CONV-1', [B, C], OWNER);
        service.SetBranches('CONV-1', [B], OTHER);

        service.ClearBranches('CONV-1', OWNER);

        expect(service.ForConversation('CONV-1', 'BRANCH-B').Branches).toEqual([B]);
    });

    it('compares owners by identity, not by value', () => {
        service.SetBranches('CONV-1', [B], { Name: 'chat' });

        service.ClearBranches('CONV-1', { Name: 'chat' });

        expect(service.ForConversation('CONV-1', 'BRANCH-B').Branches).toEqual([B]);
    });

    it('does nothing for a conversation with no rows', () => {
        service.SetBranches('CONV-2', [D], OWNER);

        service.ClearBranches('CONV-1', OWNER);

        expect(service.ForConversation('CONV-2', 'BRANCH-D').Branches).toEqual([D]);
    });
});

describe('ConversationScopeService.IsOnCurrentPath', () => {
    let service: ConversationScopeService;
    /** A sibling of B: forked from the trunk at the same point. */
    const E: ConversationBranchRow = { ID: 'BRANCH-E', ConversationID: 'CONV-1', ParentBranchID: null, ForkFromSequence: 2, Name: null };

    beforeEach(() => {
        service = new ConversationScopeService();
        service.SetBranches('CONV-1', [B, C, E], OWNER);
    });

    it('puts a trunk row up to the fork point on the branch path', () => {
        expect(service.IsOnCurrentPath('CONV-1', 'BRANCH-B', { BranchID: null, Sequence: 2 })).toBe(true);
    });

    it('puts an ancestor branch row up to the fork point on a nested branch path', () => {
        expect(service.IsOnCurrentPath('CONV-1', 'BRANCH-C', { BranchID: 'BRANCH-B', Sequence: 5 })).toBe(true);
        expect(service.IsOnCurrentPath('CONV-1', 'BRANCH-C', { BranchID: 'BRANCH-B', Sequence: 6 })).toBe(false);
    });

    it('keeps a trunk row after the fork point off the branch path', () => {
        expect(service.IsOnCurrentPath('CONV-1', 'BRANCH-B', { BranchID: null, Sequence: 3 })).toBe(false);
    });

    it('keeps a sibling branch row off the branch path', () => {
        expect(service.IsOnCurrentPath('CONV-1', 'BRANCH-B', { BranchID: 'BRANCH-E', Sequence: 3 })).toBe(false);
    });

    it('puts a row of the current branch on its path, comparing ids without case', () => {
        expect(service.IsOnCurrentPath('CONV-1', 'branch-b', { BranchID: 'BRANCH-B', Sequence: 9 })).toBe(true);
    });

    it('on the trunk, puts trunk rows on the path and branch rows off it', () => {
        expect(service.IsOnCurrentPath('CONV-1', null, { BranchID: null, Sequence: 40 })).toBe(true);
        expect(service.IsOnCurrentPath('CONV-1', null, { BranchID: 'BRANCH-B', Sequence: 3 })).toBe(false);
    });

    it('compares branch ids when the rows of the current branch are not registered', () => {
        const unregistered = new ConversationScopeService();

        expect(unregistered.IsOnCurrentPath('CONV-1', 'BRANCH-B', { BranchID: null, Sequence: 2 })).toBe(false);
        expect(unregistered.IsOnCurrentPath('CONV-1', 'BRANCH-B', { BranchID: 'branch-b', Sequence: 9 })).toBe(true);
    });

    it('compares branch ids when the registered chain of the current branch is broken', () => {
        // C is registered without its parent B, so the path cannot be built.
        const broken = new ConversationScopeService();
        broken.SetBranches('CONV-1', [C], OWNER);

        expect(broken.IsOnCurrentPath('CONV-1', 'BRANCH-C', { BranchID: 'branch-c', Sequence: 9 })).toBe(true);
        expect(broken.IsOnCurrentPath('CONV-1', 'BRANCH-C', { BranchID: 'BRANCH-B', Sequence: 5 })).toBe(false);
        expect(broken.IsOnCurrentPath('CONV-1', 'BRANCH-C', { BranchID: null, Sequence: 1 })).toBe(false);
    });
});
