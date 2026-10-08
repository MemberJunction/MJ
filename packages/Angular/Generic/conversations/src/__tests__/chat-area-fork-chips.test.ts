import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import type { ForkSummary } from '@memberjunction/core-entities';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';

const SUMMARY = {
    Branch: { ID: 'T1', ConversationID: 'CONV-1', ParentBranchID: null, ForkFromSequence: 2 }, Kind: 'Fork', DisplayName: 'Pricing',
    MessageCount: 2, Participants: [{ Kind: 'User', ID: 'U1', Name: 'Maya Chen' }], LastActivityAt: new Date(), PlacementDetailID: 'D-2',
} as unknown as ForkSummary;

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
        expect(chips[0].Avatars[0]).toMatchObject({ Kind: 'User', ID: 'U1', Label: 'Maya Chen', Initials: 'MC', ImageURL: 'https://img/u1.png' });
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
        expect(before.get('d-2')![0].Avatars[0].ImageURL).toBeNull();
        Object.assign(open, {
            windowStore: { GetSnapshot: () => ({ Details: [], UserAvatars: new Map([['U1', { ImageURL: 'https://img/u1.png', IconClass: null }]]) }) },
            updateAttachmentSupport: vi.fn(),
            cdr: { markForCheck: vi.fn(), detectChanges: vi.fn() },
        });

        (open['applyWindowSnapshot'] as () => void).call(component);

        const after = component.ForkChipMap;
        expect(after).not.toBe(before);
        expect(after.get('d-2')![0].Avatars[0].ImageURL).toBe('https://img/u1.png');
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
        expect(after.get('d-2')![0].Avatars[0].ImageURL).toBe('https://img/u1.png');
    });

    it("finds a participant's avatar whatever the case of the ids", () => {
        const { component, open } = createChatArea([SUMMARY]);
        open['UserAvatarMap'] = new Map([['u1', { imageUrl: 'https://img/u1.png', iconClass: null }]]);
        expect(component.ForkChipMap.get('d-2')![0].Avatars[0].ImageURL).toBe('https://img/u1.png');
    });

    it('opens the fork of a clicked chip', () => {
        const { component, open } = createChatArea([]);
        const openFork = vi.fn(async () => true);
        open['OpenFork'] = openFork;
        component.OnForkOpenRequested({ BranchID: 'T1' });
        expect(openFork).toHaveBeenCalledWith('T1');
    });
});
