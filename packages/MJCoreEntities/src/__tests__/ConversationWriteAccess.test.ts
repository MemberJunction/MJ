import { describe, it, expect, vi } from 'vitest';

vi.mock('../custom/ResourcePermissions/ResourcePermissionEngine', () => ({
    ResourcePermissionEngine: {
        GetProviderInstance: () => ({
            Config: vi.fn().mockResolvedValue(undefined),
            GetUserAvailableResources: () => grants,
        }),
    },
}));

let grants: Array<{ ResourceRecordID: string; PermissionLevel: string }> = [];

import { UserMayWriteConversation, UserOwnsConversation } from '../custom/ConversationWriteAccess';

function provider(ownerId: string | null, loadOk = true) {
    return {
        ProviderType: 'Database',
        GetEntityObject: async () => ({ UserID: ownerId, Load: async () => loadOk }),
    } as never;
}
const user = { ID: 'u1' } as never;

describe('UserMayWriteConversation', () => {
    it('allows the owner', async () => {
        expect((await UserMayWriteConversation(provider('u1'), user, 'c1')).Allowed).toBe(true);
    });
    it('allows an Edit grant and denies a View grant', async () => {
        grants = [{ ResourceRecordID: 'c1', PermissionLevel: 'Edit' }];
        expect((await UserMayWriteConversation(provider('other'), user, 'c1')).Allowed).toBe(true);
        grants = [{ ResourceRecordID: 'c1', PermissionLevel: 'View' }];
        const denied = await UserMayWriteConversation(provider('other'), user, 'c1');
        expect(denied.Allowed).toBe(false);
        expect(denied.Reason).toMatch(/view-only/);
    });
    it('denies with no grant', async () => {
        grants = [];
        expect((await UserMayWriteConversation(provider('other'), user, 'c1')).Allowed).toBe(false);
    });
    it('allows a non-database provider (client side) without a lookup', async () => {
        const client = { ProviderType: 'Network', GetEntityObject: vi.fn() } as never;
        expect((await UserMayWriteConversation(client, user, 'c1')).Allowed).toBe(true);
    });
    it('reports ownership separately from access, so an Edit grantee is allowed but not the owner', async () => {
        grants = [{ ResourceRecordID: 'c1', PermissionLevel: 'Edit' }];
        expect((await UserMayWriteConversation(provider('u1'), user, 'c1')).IsOwner).toBe(true);
        const grantee = await UserMayWriteConversation(provider('other'), user, 'c1');
        expect(grantee.Allowed).toBe(true);
        expect(grantee.IsOwner).toBe(false);
    });
    it('reports whether the conversation loaded, since one that did not (missing or hidden) is still allowed', async () => {
        grants = [{ ResourceRecordID: 'c1', PermissionLevel: 'Edit' }];
        expect((await UserMayWriteConversation(provider('other'), user, 'c1')).Loaded).toBe(true);
        expect(await UserMayWriteConversation(provider('other', false), user, 'c1')).toEqual({
            Allowed: true,
            Reason: null,
            IsOwner: false,
            Loaded: false,
        });
    });
});

describe('UserOwnsConversation', () => {
    it('is true for the owner and for an Owner-level grant, not for Edit or View', async () => {
        grants = [];
        expect(await UserOwnsConversation(provider('u1'), user, 'c1')).toBe(true);
        grants = [{ ResourceRecordID: 'c1', PermissionLevel: 'Owner' }];
        expect(await UserOwnsConversation(provider('other'), user, 'c1')).toBe(true);
        grants = [{ ResourceRecordID: 'c1', PermissionLevel: 'Edit' }];
        expect(await UserOwnsConversation(provider('other'), user, 'c1')).toBe(false);
        grants = [{ ResourceRecordID: 'c1', PermissionLevel: 'View' }];
        expect(await UserOwnsConversation(provider('other'), user, 'c1')).toBe(false);
    });
    it('is false when nothing can be verified: no user, a client provider, or a conversation that does not load', async () => {
        grants = [{ ResourceRecordID: 'c1', PermissionLevel: 'Owner' }];
        expect(await UserOwnsConversation(provider('u1'), null, 'c1')).toBe(false);
        expect(await UserOwnsConversation({ ProviderType: 'Network', GetEntityObject: vi.fn() } as never, user, 'c1')).toBe(false);
        expect(await UserOwnsConversation(provider('u1', false), user, 'c1')).toBe(false);
    });
});
