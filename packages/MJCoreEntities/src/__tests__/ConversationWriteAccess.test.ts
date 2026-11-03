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

import { UserMayWriteConversation } from '../custom/ConversationWriteAccess';

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

    it('enforces AllowRecordComments and CanUserComment on anchored record-comment threads', async () => {
        const disabledEntityProvider = {
            ProviderType: 'Database',
            Entities: [
                {
                    ID: 'e-locked',
                    Name: 'Locked Entity',
                    DisplayNameOrName: 'Locked Entity',
                    AllowRecordComments: false,
                    CanUserComment: () => false,
                },
            ],
            GetEntityObject: async () => ({
                UserID: 'other',
                AnchorType: 'Field',
                LinkedEntityID: 'e-locked',
                LinkedRecordID: 'r-1',
                Load: async () => true,
            }),
        } as never;

        const deniedDisabled = await UserMayWriteConversation(disabledEntityProvider, user, 'c-anchored-1');
        expect(deniedDisabled.Allowed).toBe(false);
        expect(deniedDisabled.Reason).toMatch(/disabled/i);

        const roleDeniedProvider = {
            ProviderType: 'Database',
            Entities: [
                {
                    ID: 'e-role-gated',
                    Name: 'Role Gated Entity',
                    DisplayNameOrName: 'Role Gated Entity',
                    AllowRecordComments: true,
                    CanUserComment: () => false,
                },
            ],
            GetEntityObject: async () => ({
                UserID: 'other',
                AnchorType: 'Field',
                LinkedEntityID: 'e-role-gated',
                LinkedRecordID: 'r-1',
                Load: async () => true,
            }),
        } as never;

        const deniedRole = await UserMayWriteConversation(roleDeniedProvider, user, 'c-anchored-2');
        expect(deniedRole.Allowed).toBe(false);
        expect(deniedRole.Reason).toMatch(/permission to post comments/i);
    });
});
