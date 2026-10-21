import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import type { ForkSummary, MJConversationDetailEntity } from '@memberjunction/core-entities';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import { MAIN_OPEN_VIEW, type ConversationOpenView, type ForkChip, type MessageForkChip } from '../lib/utils/conversation-forks';

const SUMMARY = {
    Branch: { ID: 'T1', ConversationID: 'CONV-1', ParentBranchID: null, ForkFromSequence: 2 }, Kind: 'Fork', DisplayName: 'Pricing',
    MessageCount: 2, Participants: [{ Kind: 'User', ID: 'U1', Name: 'Maya Chen' }], LastActivityAt: new Date(), PlacementDetailID: 'D-2',
} as unknown as ForkSummary;

/** The chip as a fork chip; throws on an original chip. */
function asForkChip(chip: MessageForkChip | undefined): ForkChip {
    if (!chip || chip.Kind === 'Original') {
        throw new Error('expected a fork chip');
    }
    return chip;
}

function createChatArea(summaries: ForkSummary[]) {
    const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
    const open = component as unknown as Record<string, unknown>;
    open['ForkSummaries'] = summaries;
    open['UserAvatarMap'] = new Map([['U1', { imageUrl: 'https://img/u1.png', iconClass: null }]]);
    return { component, open };
}

describe('ConversationChatAreaComponent fork chips', () => {
    it('builds chips from the fork summaries, with the avatar images it knows', () => {
        const { component } = createChatArea([SUMMARY]);
        const chips = component.ForkChipMap.get('d-2')!;
        expect(chips[0]).toMatchObject({ BranchID: 'T1', DisplayName: 'Pricing', MessageLabel: '2 messages' });
        expect(asForkChip(chips[0]).Avatars[0]).toMatchObject({ Kind: 'User', ID: 'U1', Label: 'Maya Chen', Initials: 'MC', ImageURL: 'https://img/u1.png' });
    });

    it('returns the same map until the summaries change', () => {
        const { component, open } = createChatArea([SUMMARY]);
        const first = component.ForkChipMap;
        expect(component.ForkChipMap).toBe(first);
        open['ForkSummaries'] = [SUMMARY];
        expect(component.ForkChipMap).not.toBe(first);
    });

    it('builds a new map with the avatar images when a loaded window fills the avatar map', () => {
        const { component, open } = createChatArea([SUMMARY]);
        open['UserAvatarMap'] = new Map();
        const before = component.ForkChipMap;
        expect(asForkChip(before.get('d-2')![0]).Avatars[0].ImageURL).toBeNull();
        Object.assign(open, {
            windowStore: { GetSnapshot: () => ({ Details: [], UserAvatars: new Map([['U1', { ImageURL: 'https://img/u1.png', IconClass: null }]]) }) },
            updateAttachmentSupport: vi.fn(),
            cdr: { markForCheck: vi.fn(), detectChanges: vi.fn() },
        });

        (open['applyWindowSnapshot'] as () => void).call(component);

        const after = component.ForkChipMap;
        expect(after).not.toBe(before);
        expect(asForkChip(after.get('d-2')![0]).Avatars[0].ImageURL).toBe('https://img/u1.png');
    });

    it('builds a new map with the avatar image when the current user is added to the avatar map', async () => {
        const { component, open } = createChatArea([SUMMARY]);
        open['UserAvatarMap'] = new Map();
        const before = component.ForkChipMap;
        const user = { Load: vi.fn(async () => true), UserImageURL: 'https://img/u1.png', UserImageIconClass: null };
        Object.assign(open, { CurrentUser: { ID: 'U1' }, Provider: { GetEntityObject: vi.fn(async () => user) } });

        await (open['ensureCurrentUserInAvatarMap'] as () => Promise<void>).call(component);

        const after = component.ForkChipMap;
        expect(after).not.toBe(before);
        expect(asForkChip(after.get('d-2')![0]).Avatars[0].ImageURL).toBe('https://img/u1.png');
    });

    it("finds a participant's avatar whatever the case of the ids", () => {
        const { component, open } = createChatArea([SUMMARY]);
        open['UserAvatarMap'] = new Map([['u1', { imageUrl: 'https://img/u1.png', iconClass: null }]]);
        expect(asForkChip(component.ForkChipMap.get('d-2')![0]).Avatars[0].ImageURL).toBe('https://img/u1.png');
    });

    it('opens the fork of a clicked chip', () => {
        const { component, open } = createChatArea([]);
        const openFork = vi.fn(async () => true);
        open['OpenFork'] = openFork;
        component.OnForkOpenRequested({ BranchID: 'T1' });
        expect(openFork).toHaveBeenCalledWith('T1');
    });

    it('opens the view of an original chip at the replaced message, as a search hit does', () => {
        const { component, open } = createChatArea([]);
        const openMessage = vi.fn(async () => true);
        Object.assign(open, { _conversationId: 'CONV-1', OpenMessage: openMessage, OpenFork: vi.fn(), BackToMain: vi.fn() });

        component.OnForkOpenRequested({ BranchID: null, Sequence: 5 });
        component.OnForkOpenRequested({ BranchID: 'T1', Sequence: 7 });

        expect(openMessage.mock.calls).toEqual([['CONV-1', null, 5], ['CONV-1', 'T1', 7]]);
        expect(open['OpenFork']).not.toHaveBeenCalled();
    });

    it('opens Main for an original chip whose message position is not known', () => {
        const { component, open } = createChatArea([]);
        const backToMain = vi.fn(async () => true);
        Object.assign(open, { _conversationId: 'CONV-1', OpenMessage: vi.fn(), BackToMain: backToMain });
        component.OnForkOpenRequested({ BranchID: null, Sequence: null });
        expect(backToMain).toHaveBeenCalledOnce();
        expect(open['OpenMessage']).not.toHaveBeenCalled();
    });
});

describe('ConversationChatAreaComponent fork alternatives', () => {
    /** Three forks that replaced Main's message D-5 (started from D-4); F2 is open. */
    const fork = (id: string, kind = 'Fork') => ({
        Branch: { ID: id, ConversationID: 'CONV-1', ParentBranchID: null, ForkFromSequence: 4, SourceDetailID: 'D-5' }, Kind: kind,
        DisplayName: `name ${id}`, MessageCount: 1, Participants: [], LastActivityAt: new Date(), PlacementDetailID: 'D-5',
        PlacementPosition: { BranchID: null, Sequence: 5 }, ParentBranchID: null,
    }) as unknown as ForkSummary;
    const row = (id: string, branchId: string | null, sequence: number) =>
        ({ ID: id, BranchID: branchId, Sequence: sequence, ConversationID: 'CONV-1' }) as unknown as MJConversationDetailEntity;

    function createFork(view: ConversationOpenView, messages: MJConversationDetailEntity[], hasMoreAbove = false) {
        const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
        Object.assign(component as unknown as Record<string, unknown>, {
            ForkSummaries: [fork('F1'), fork('F2'), fork('F3')],
            UserAvatarMap: new Map(),
            openView: view,
            windowView: view,
            messages,
            branches: [],
            windowStore: { HasMoreAbove: hasMoreAbove },
        });
        return component;
    }
    const F2: ConversationOpenView = { Kind: 'Fork', BranchID: 'F2' };
    const ROWS = [row('D-3', null, 3), row('D-4', null, 4), row('F2-A', 'F2', 20), row('F2-B', 'F2', 21)];

    it("shows Main's original chip and the other forks on the open fork's first own message", () => {
        const map = createFork(F2, ROWS).ForkChipMap;
        expect(map.get('f2-a')!.map(c => [c.Kind, c.BranchID, c.DisplayName])).toEqual([
            ['Original', null, 'Main'], ['Fork', 'F1', 'name F1'], ['Fork', 'F3', 'name F3'],
        ]);
        expect(map.get('f2-b')).toBeUndefined();
    });

    it('shows the alternatives once the first own message is loaded', () => {
        const component = createFork(F2, [row('F2-B', 'F2', 21)], true);
        expect(component.ForkChipMap.get('f2-b')).toBeUndefined();
        (component as unknown as Record<string, unknown>)['messages'] = [row('D-4', null, 4), row('F2-A', 'F2', 20), row('F2-B', 'F2', 21)];
        expect(component.ForkChipMap.get('f2-a')!.map(c => c.BranchID)).toEqual([null, 'F1', 'F3']);
    });

    it('keeps the Main chips unchanged and shows no alternatives in a draft', () => {
        const main = createFork(MAIN_OPEN_VIEW, ROWS).ForkChipMap;
        expect([...main.keys()]).toEqual(['d-5']);
        expect(main.get('d-5')!.map(c => c.BranchID)).toEqual(['F1', 'F2', 'F3']);
        const draft = createFork({ Kind: 'DraftFork', ParentBranchID: null, ForkFromSequence: 4, AnchorDetailID: 'D-4', SourceDetailID: 'D-5' }, ROWS.slice(0, 2)).ForkChipMap;
        expect([...draft.keys()]).toEqual(['d-5']);
    });
});
