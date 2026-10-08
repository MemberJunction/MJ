import { describe, it, expect } from 'vitest';
import type { ForkSummary } from '@memberjunction/core-entities';
import {
    BuildForkAlternativeChips,
    BuildForkMarkerText,
    BuildForkChipMap,
    BuildViewForkChipMap,
    FirstOwnRowID,
    ForkChipAriaLabel,
    ForkChipIcon,
    ForkChipOpenRequestOf,
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

describe('fork alternatives', () => {
    const NOW = new Date(Date.UTC(2026, 9, 6, 15, 0));

    /** A fork that replaced `source` (placed under it), started from the row before it on `parent`. */
    function fork(id: string, source: string | null, parent: string | null, over: Partial<ForkSummary> = {}): ForkSummary {
        return {
            Branch: { ID: id, ConversationID: 'c1', ParentBranchID: parent, ForkFromSequence: 4, SourceDetailID: source },
            Kind: 'Fork', DisplayName: `name ${id}`, MessageCount: 1, Participants: [], AuthorUserIDs: [],
            LastActivityAt: NOW, LastMessagePreview: null, LastMessageAuthorName: null,
            PlacementDetailID: source ?? 'd-4', PlacementPosition: { BranchID: parent, Sequence: source ? 5 : 4 },
            AnchorDetailID: 'd-4', AnchorAuthorName: null, AnchorAt: null,
            StartedByUserID: 'u1', StartedByName: 'Maya Chen', ParentBranchID: parent,
            ...over,
        };
    }
    const avatar = (p: { Kind: 'User' | 'Agent'; ID: string; Name: string | null }) =>
        ({ Kind: p.Kind, ID: p.ID, Label: p.Name ?? '', Initials: ForkInitials(p.Name), ImageURL: null, IconClass: null });
    const label = (id: string) => `label ${id}`;
    const THREE = [fork('F1', 'd-5', null), fork('F2', 'd-5', null), fork('F3', 'd-5', null)];

    it('gives a fork an original chip for Main and a chip for each other fork of the replaced message, not itself', () => {
        const chips = BuildForkAlternativeChips('f2', THREE, avatar, NOW, label);
        expect(chips[0]).toEqual({ Kind: 'Original', BranchID: null, Sequence: 5, DisplayName: 'Main' });
        expect(chips.slice(1).map(c => c.BranchID)).toEqual(['F1', 'F3']);
        expect(chips[1]).toMatchObject({ Kind: 'Fork', DisplayName: 'name F1', MessageLabel: '1 message' });
    });

    it('names the parent fork on the original chip of a nested fork', () => {
        const nested = [fork('N1', 't-7', 'T1', { PlacementPosition: { BranchID: 'T1', Sequence: 7 } }), fork('N2', 't-7', 'T1')];
        const chips = BuildForkAlternativeChips('N1', nested, avatar, NOW, label);
        expect(chips[0]).toEqual({ Kind: 'Original', BranchID: 'T1', Sequence: 7, DisplayName: 'label T1' });
        expect(chips.slice(1).map(c => c.BranchID)).toEqual(['N2']);
    });

    it('lists the other Regenerate forks of a replaced answer', () => {
        const answers = [fork('R1', 'd-6', null, { Kind: 'Regenerate' }), fork('R2', 'd-6', null, { Kind: 'Regenerate' }), fork('E1', 'd-5', null, { Kind: 'Edit' })];
        const chips = BuildForkAlternativeChips('R2', answers, avatar, NOW, label);
        expect(chips.map(c => [c.Kind, c.BranchID])).toEqual([['Original', null], ['Regenerate', 'R1']]);
    });

    it('leaves out forks of the same message with another parent branch', () => {
        const chips = BuildForkAlternativeChips('F1', [fork('F1', 'd-5', null), fork('G1', 'd-5', 'T9')], avatar, NOW, label);
        expect(chips.map(c => c.BranchID)).toEqual([null]);
    });

    it('opens the parent at its latest rows when the replaced message position is not known', () => {
        const [original] = BuildForkAlternativeChips('F1', [fork('F1', 'd-5', 'T1', { PlacementPosition: null })], avatar, NOW, label);
        expect(original).toEqual({ Kind: 'Original', BranchID: 'T1', Sequence: null, DisplayName: 'label T1' });
    });

    it('has no alternatives for a fork that replaced no message, or that is not in the summaries', () => {
        expect(BuildForkAlternativeChips('A1', [fork('A1', null, null), fork('F1', 'd-5', null)], avatar, NOW, label)).toEqual([]);
        expect(BuildForkAlternativeChips('Z9', THREE, avatar, NOW, label)).toEqual([]);
    });

    it('icons, labels and open requests of the chips', () => {
        const [main] = BuildForkAlternativeChips('F1', THREE, avatar, NOW, label);
        const [inFork] = BuildForkAlternativeChips('F1', [fork('F1', 'd-5', 'T1')], avatar, NOW, label);
        const [, sibling] = BuildForkAlternativeChips('F1', THREE, avatar, NOW, label);
        expect(ForkChipIcon(main)).toBe('fa-solid fa-house');
        expect(ForkChipIcon(inFork)).toBe('fa-solid fa-code-branch');
        expect(ForkChipIcon(sibling)).toBe('fa-solid fa-code-branch');
        expect(ForkChipAriaLabel(main)).toBe('Open the original in Main');
        expect(ForkChipAriaLabel(inFork)).toBe('Open the original in label T1');
        expect(ForkChipAriaLabel(sibling)).toBe('Open fork name F2, 1 message');
        expect(ForkChipOpenRequestOf(main)).toEqual({ BranchID: null, Sequence: 5 });
        expect(ForkChipOpenRequestOf(sibling)).toEqual({ BranchID: 'F2' });
    });

    it('puts the alternatives first on the first own message of a fork view, before the chips placed there', () => {
        const nestedOnFirst = fork('N1', 'f1-a', null, { PlacementDetailID: 'f1-a' });
        const map = BuildViewForkChipMap([...THREE, nestedOnFirst], { Kind: 'Fork', BranchID: 'F1' }, 'F1-A', avatar, NOW, label);
        expect(map.get('f1-a')!.map(c => [c.Kind, c.BranchID])).toEqual([['Original', null], ['Fork', 'F2'], ['Fork', 'F3'], ['Fork', 'N1']]);
        expect(map.get('d-5')!.map(c => c.BranchID)).toEqual(['F2', 'F3']);
    });

    it('shows no alternatives in Main, in a draft, or before the first own message is loaded', () => {
        const main = BuildViewForkChipMap(THREE, MAIN_OPEN_VIEW, 'x', avatar, NOW, label);
        expect([...main.keys()]).toEqual(['d-5']);
        expect(main.get('d-5')!.map(c => c.BranchID)).toEqual(['F1', 'F2', 'F3']);
        const draft = BuildViewForkChipMap(THREE, { Kind: 'DraftFork', ParentBranchID: null, ForkFromSequence: 4, AnchorDetailID: 'd-4', SourceDetailID: 'd-5' }, 'x', avatar, NOW, label);
        expect([...draft.keys()]).toEqual(['d-5']);
        const notLoaded = BuildViewForkChipMap(THREE, { Kind: 'Fork', BranchID: 'F1' }, null, avatar, NOW, label);
        expect([...notLoaded.keys()]).toEqual(['d-5']);
    });

    it('finds the first own row only when the loaded rows reach it', () => {
        const own = [{ ID: 'b', Sequence: 12 }, { ID: 'a', Sequence: 10 }];
        expect(FirstOwnRowID({ Inherited: [{ ID: 'i', Sequence: 4 }], Own: own }, true)).toBe('a');
        expect(FirstOwnRowID({ Inherited: [], Own: own }, false)).toBe('a');
        expect(FirstOwnRowID({ Inherited: [], Own: own }, true)).toBeNull();
        expect(FirstOwnRowID({ Inherited: [{ ID: 'i', Sequence: 4 }], Own: [] }, false)).toBeNull();
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
