import { describe, it, expect } from 'vitest';
import type { ForkSummary } from '@memberjunction/core-entities';
import {
    BuildForkMarkerText,
    BuildForkChipMap,
    BuildForkComposerHint,
    BuildForkListRows,
    BuildForkViewLayout,
    CanForkFrom,
    FormatForkActivity,
    IsRowInOpenView,
    MAIN_OPEN_VIEW,
    ReadBranchIdOf,
    SameOpenView,
    SplitForkRows,
    ForkInitials,
    ForkKindIcon,
    ForkOriginText,
    ForkMessageLabel,
    type ConversationOpenView,
} from '../lib/utils/conversation-forks';

const T1: ConversationOpenView = { Kind: 'Fork', BranchID: 'T1' };

describe('open view helpers', () => {
    it('SameOpenView compares the kind and the fork id without case', () => {
        expect(SameOpenView(MAIN_OPEN_VIEW, { Kind: 'Main' })).toBe(true);
        expect(SameOpenView(T1, { Kind: 'Fork', BranchID: 't1' })).toBe(true);
        expect(SameOpenView(T1, { Kind: 'Fork', BranchID: 'T2' })).toBe(false);
        expect(SameOpenView(MAIN_OPEN_VIEW, T1)).toBe(false);
    });

    it('ReadBranchIdOf is null for Main and the fork id for a fork', () => {
        expect(ReadBranchIdOf(MAIN_OPEN_VIEW)).toBeNull();
        expect(ReadBranchIdOf(T1)).toBe('T1');
    });

    it('IsRowInOpenView keeps Main rows in Main and the fork rows in that fork', () => {
        expect(IsRowInOpenView(MAIN_OPEN_VIEW, { BranchID: null })).toBe(true);
        expect(IsRowInOpenView(MAIN_OPEN_VIEW, {})).toBe(true);
        expect(IsRowInOpenView(MAIN_OPEN_VIEW, { BranchID: 'T1' })).toBe(false);
        expect(IsRowInOpenView(T1, { BranchID: 't1' })).toBe(true);
        expect(IsRowInOpenView(T1, { BranchID: null })).toBe(false);
        expect(IsRowInOpenView(T1, { BranchID: 'T2' })).toBe(false);
    });
});

describe('fork chips', () => {
    const NOW = new Date(Date.UTC(2026, 9, 6, 15, 0));
    const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60000);

    function summary(id: string, placement: string | null, over: Partial<ForkSummary> = {}): ForkSummary {
        return {
            Branch: { ID: id, ConversationID: 'c1', ParentBranchID: null, ForkFromSequence: 2 },
            Kind: 'Fork', DisplayName: `name ${id}`, MessageCount: 2,
            Participants: [{ Kind: 'User', ID: 'u1', Name: 'Maya Chen' }, { Kind: 'Agent', ID: 'a1', Name: 'Sage' }],
            AuthorUserIDs: ['u1'], LastActivityAt: minutesAgo(12), LastMessagePreview: null, LastMessageAuthorName: null,
            PlacementDetailID: placement, AnchorDetailID: placement, AnchorAuthorName: null, AnchorAt: null,
            StartedByUserID: 'u1', StartedByName: 'Maya Chen', ParentBranchID: null,
            ...over,
        };
    }
    const avatar = (p: { Kind: 'User' | 'Agent'; ID: string; Name: string | null }) =>
        ({ Kind: p.Kind, ID: p.ID, Label: p.Name ?? '', Initials: ForkInitials(p.Name), ImageURL: null, IconClass: null });

    it('names the kind icon of each kind', () => {
        expect(ForkKindIcon('Fork')).toBe('fa-solid fa-code-branch');
        expect(ForkKindIcon('Edit')).toBe('fa-solid fa-pen');
        expect(ForkKindIcon('Regenerate')).toBe('fa-solid fa-rotate-left');
    });

    it('labels messages and initials', () => {
        expect(ForkMessageLabel(1)).toBe('1 message');
        expect(ForkMessageLabel(0)).toBe('0 messages');
        expect(ForkMessageLabel(4)).toBe('4 messages');
        expect(ForkInitials('Maya Chen')).toBe('MC');
        expect(ForkInitials('Sage')).toBe('S');
        expect(ForkInitials('  ')).toBe('?');
        expect(ForkInitials(null)).toBe('?');
    });

    it('formats the last activity relative to now', () => {
        expect(FormatForkActivity(minutesAgo(0), NOW)).toBe('just now');
        expect(FormatForkActivity(minutesAgo(12), NOW)).toBe('12 min ago');
        expect(FormatForkActivity(minutesAgo(180), NOW)).toBe('3 h ago');
        expect(FormatForkActivity(minutesAgo(26 * 60), NOW)).toBe('yesterday');
        expect(FormatForkActivity(minutesAgo(3 * 24 * 60), NOW)).toBe('3 days ago');
    });

    it('groups chips by placement message, keeps summary order and skips forks with no placement', () => {
        const map = BuildForkChipMap(
            [summary('T1', 'D-2'), summary('T2', null), summary('T3', 'd-2', { Kind: 'Fork', MessageCount: 1, DisplayName: 'Annual plans only' })],
            avatar,
            NOW
        );
        expect([...map.keys()]).toEqual(['d-2']);
        const chips = map.get('d-2')!;
        expect(chips.map(c => c.BranchID)).toEqual(['T1', 'T3']);
        expect(chips[1]).toEqual({
            BranchID: 'T3', Kind: 'Fork', DisplayName: 'Annual plans only', MessageLabel: '1 message', ActivityLabel: '12 min ago',
            Avatars: [
                { Kind: 'User', ID: 'u1', Label: 'Maya Chen', Initials: 'MC', ImageURL: null, IconClass: null },
                { Kind: 'Agent', ID: 'a1', Label: 'Sage', Initials: 'S', ImageURL: null, IconClass: null },
            ],
        });
    });
});

describe('draft fork view', () => {
    const DRAFT: ConversationOpenView = { Kind: 'DraftFork', ParentBranchID: 'T1', ForkFromSequence: 11, AnchorDetailID: 'D-11', SourceDetailID: 'D-12' };

    it('is the same draft only for the same replaced message', () => {
        expect(SameOpenView(DRAFT, { ...DRAFT, SourceDetailID: 'd-12' })).toBe(true);
        expect(SameOpenView(DRAFT, { ...DRAFT, SourceDetailID: 'D-14' })).toBe(false);
        expect(SameOpenView(DRAFT, { Kind: 'Fork', BranchID: 'T1' })).toBe(false);
    });

    it("reads its parent's path and shows no new row", () => {
        expect(ReadBranchIdOf(DRAFT)).toBe('T1');
        expect(IsRowInOpenView(DRAFT, { BranchID: 'T1' })).toBe(false);
        expect(IsRowInOpenView(DRAFT, { BranchID: null })).toBe(false);
    });
});

describe('fork view layout', () => {
    type R = { ID: string; BranchID: string | null; Sequence: number };
    const rows: R[] = [
        { ID: 'D1', BranchID: null, Sequence: 1 },
        { ID: 'D2', BranchID: null, Sequence: 2 },
        { ID: 'D3', BranchID: null, Sequence: 3 },
        { ID: 'A', BranchID: 'T1', Sequence: 10 },
        { ID: 'B', BranchID: 't1', Sequence: 11 },
    ];
    const FORK: ConversationOpenView = { Kind: 'Fork', BranchID: 'T1' };
    const DRAFT: ConversationOpenView = { Kind: 'DraftFork', ParentBranchID: null, ForkFromSequence: 2, AnchorDetailID: 'D2', SourceDetailID: 'D3' };
    const fmt = (d: Date) => `@${d.toISOString()}`;

    it('splits rows into inherited and own for a fork, a draft and Main', () => {
        expect(SplitForkRows(rows, FORK)).toEqual({ Inherited: rows.slice(0, 3), Own: rows.slice(3) });
        expect(SplitForkRows(rows, DRAFT)).toEqual({ Inherited: rows.slice(0, 2), Own: [] });
        expect(SplitForkRows(rows, MAIN_OPEN_VIEW)).toEqual({ Inherited: [], Own: rows });
    });

    it('inherits nothing in a draft that replaces the first message', () => {
        const first: ConversationOpenView = { Kind: 'DraftFork', ParentBranchID: null, ForkFromSequence: null, AnchorDetailID: null, SourceDetailID: 'D1' };
        expect(SplitForkRows(rows, first)).toEqual({ Inherited: [], Own: [] });
        expect(BuildForkViewLayout([], first, 'marker')).toEqual({ InheritedIDs: new Set(), MarkerDetailID: null, MarkerText: null });
    });

    it('marks the inherited rows on screen and puts the marker under the last of them', () => {
        const layout = BuildForkViewLayout(rows, FORK, 'marker');
        expect(layout).toEqual({ InheritedIDs: new Set(['d1', 'd2', 'd3']), MarkerDetailID: 'D3', MarkerText: 'marker' });
        expect(BuildForkViewLayout(rows, MAIN_OPEN_VIEW, 'marker')).toBeNull();
        expect(BuildForkViewLayout([rows[3]], FORK, 'marker')).toEqual({ InheritedIDs: new Set(), MarkerDetailID: null, MarkerText: null });
    });

    it('writes the fork marker', () => {
        const at = new Date(Date.UTC(2026, 9, 6, 14, 20));
        expect(BuildForkMarkerText({ IsDraft: false, StarterName: 'Jordan Ellis', AnchorAuthorName: 'Sage', StartedAt: at }, fmt))
            .toBe(`Jordan Ellis forked from Sage's message · @${at.toISOString()}`);
        expect(BuildForkMarkerText({ IsDraft: false, StarterName: null, AnchorAuthorName: null, StartedAt: null }, fmt)).toBe('Someone forked');
        expect(BuildForkMarkerText({ IsDraft: true, StarterName: null, AnchorAuthorName: 'Maya Chen', StartedAt: null }, fmt)).toBe("New fork from Maya Chen's message");
        expect(BuildForkMarkerText({ IsDraft: true, StarterName: null, AnchorAuthorName: null, StartedAt: null }, fmt)).toBe('New fork');
    });

    it('writes the composer hint', () => {
        const at = new Date(Date.UTC(2026, 9, 6, 14, 3));
        expect(BuildForkComposerHint(at, fmt)).toBe(`Agents see the conversation up to @${at.toISOString()}, plus this fork`);
        expect(BuildForkComposerHint(null, fmt)).toBe('Agents see only this fork');
    });
});

describe('forks list', () => {
    const NOW = new Date(Date.UTC(2026, 9, 6, 15, 0));
    const ago = (m: number) => new Date(NOW.getTime() - m * 60000);
    function s(id: string, over: Partial<ForkSummary>): ForkSummary {
        return {
            Branch: { ID: id, ConversationID: 'c1', ParentBranchID: over.ParentBranchID ?? null, ForkFromSequence: 2 },
            Kind: 'Fork', DisplayName: id, MessageCount: 1, Participants: [], AuthorUserIDs: [], LastActivityAt: ago(1),
            LastMessagePreview: null, LastMessageAuthorName: null, PlacementDetailID: 'd', AnchorDetailID: 'd', AnchorAuthorName: null,
            AnchorAt: null, StartedByUserID: 'u-other', StartedByName: 'Jordan', ParentBranchID: null,
            ...over,
        };
    }
    const T1 = s('T1', { AnchorAuthorName: 'Sage', MessageCount: 4, LastActivityAt: ago(6), LastMessagePreview: 'Here is a side-by-side comparison.', LastMessageAuthorName: 'Sage' });
    const F1 = s('F1', { Kind: 'Fork', ParentBranchID: 'T1', StartedByName: 'Priya', MessageCount: 2, LastActivityAt: ago(12) });
    const F2 = s('F2', { Kind: 'Fork', ParentBranchID: 'T1', StartedByName: 'Priya', LastActivityAt: ago(3) });
    const E1 = s('E1', { Kind: 'Edit', StartedByUserID: 'u-me', StartedByName: 'Maya', LastActivityAt: ago(20) });
    const R1 = s('R1', { Kind: 'Regenerate', AuthorUserIDs: ['u-me'], LastActivityAt: ago(18) });

    it('writes the origin of each kind', () => {
        expect(ForkOriginText(T1)).toBe('Forked by Jordan');
        expect(ForkOriginText(s('X', {}))).toBe('Forked by Jordan');
        expect(ForkOriginText(F1)).toBe('Forked by Priya');
        expect(ForkOriginText(E1)).toBe("Edit of Maya's message");
        expect(ForkOriginText(R1)).toBe('Regenerated by Jordan');
        expect(ForkOriginText(s('Y', { Kind: 'Fork', StartedByName: null }))).toBe('Forked by someone');
    });

    it('lists roots newest first, each followed by its nested forks, newest first', () => {
        const rows = BuildForkListRows([E1, F1, T1, R1, F2], 'All', 'u-me', NOW);
        expect(rows.map(r => [r.Summary.Branch.ID, r.Depth])).toEqual([['T1', 0], ['F2', 1], ['F1', 1], ['R1', 0], ['E1', 0]]);
        expect(rows[0]).toMatchObject({
            Icon: 'fa-solid fa-code-branch',
            PreviewText: 'Sage: Here is a side-by-side comparison.',
            MetaText: 'Forked by Jordan · 4 messages · 6 min ago',
        });
    });

    it("keeps the forks the person started or wrote in for Mine, lifting a child whose parent is left out", () => {
        const mine = BuildForkListRows([E1, F1, T1, R1], 'Mine', 'U-ME', NOW);
        expect(mine.map(r => r.Summary.Branch.ID)).toEqual(['R1', 'E1']);
        const withChild = BuildForkListRows([T1, s('F3', { Kind: 'Fork', ParentBranchID: 'T1', StartedByUserID: 'u-me' })], 'Mine', 'u-me', NOW);
        expect(withChild.map(r => [r.Summary.Branch.ID, r.Depth])).toEqual([['F3', 0]]);
    });
});

describe('CanForkFrom', () => {
    const allow = { HoldsAuthorization: true, SettingValue: undefined, MayWrite: true };

    it('allows forking only when the authorization, the setting and write access all allow it', () => {
        expect(CanForkFrom(allow)).toBe(true);
        expect(CanForkFrom({ ...allow, SettingValue: 'on' })).toBe(true);
        expect(CanForkFrom({ ...allow, HoldsAuthorization: false })).toBe(false);
        expect(CanForkFrom({ ...allow, SettingValue: 'off' })).toBe(false);
        expect(CanForkFrom({ ...allow, MayWrite: false })).toBe(false);
    });
});
